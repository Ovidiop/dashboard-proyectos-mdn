import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireUserMock = vi.fn()
const fromMock = vi.fn()
const generateContentMock = vi.fn()
const loadCompanyInputsMock = vi.fn()
const loadHistoryByUserMock = vi.fn()

vi.mock('./requireUser.js', () => ({ requireUser: requireUserMock }))
vi.mock('./supabase.js', () => ({ supabase: { from: (...args) => fromMock(...args) } }))
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    this.models = { generateContent: generateContentMock }
  }),
}))
vi.mock('../employee-scores-snapshot.js', () => ({
  loadCompanyInputs: loadCompanyInputsMock,
  loadHistoryByUser: loadHistoryByUserMock,
}))

const { handler } = await import('../evaluation-analysis.js')

function makeEvent(body) {
  return { httpMethod: 'POST', body: JSON.stringify(body), headers: { authorization: 'Bearer t' } }
}

// users.select().eq().single() (lookup del empleado objetivo o del fullCaller)
function singleChain(result) {
  const builder = { select: () => builder, eq: () => builder, single: async () => result }
  return builder
}

// module_permissions.select().eq().eq().maybeSingle()
function permRowChain(result) {
  const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => result }
  return builder
}

const EMPLOYEE_ROW = {
  user_id: 'emp-1',
  company_id: 'c1',
  first_name: 'Ana',
  last_name: 'Pérez',
  position: { position_name: 'Diseñadora' },
}

const DEFAULT_PROFILE = {
  id: 'p1',
  is_default: true,
  match: {},
  weights: {
    entregas: 25,
    puntualidad: 20,
    arrastre: 10,
    tareas_fijas: 15,
    piezas_av: 10,
    reuniones: 5,
    campanas: 5,
    chequeo: 5,
    tickets: 0,
  },
}

function baseInputs(overrides = {}) {
  return {
    users: [
      {
        user_id: 'emp-1',
        department_id: 1,
        position_id: 1,
        access_level: 1,
        hire_date: null,
        on_probation: false,
      },
    ],
    clients: [],
    tasks: [],
    cnp: [],
    marks: [],
    piezas: [],
    meetings: [],
    campaigns: [],
    paidCampaigns: [],
    checks: [],
    tickets: [],
    vacations: [],
    profiles: [DEFAULT_PROFILE],
    ...overrides,
  }
}

function tasksForScore() {
  const rows = []
  for (let i = 0; i < 10; i++) {
    rows.push({
      assignee_ids: ['emp-1'],
      created_by: 'jefe',
      request_date: '2026-09-01',
      due_date: `2026-09-${10 + i}`,
      closed_date: `2026-09-${9 + i}`,
      status: 'Terminado',
    })
  }
  // Abiertas, no bloqueadas ni vencidas — para que 'arrastre' también aplique
  // (peso base combinado >= 50, mínimo del orquestador).
  for (let i = 0; i < 3; i++) {
    rows.push({
      assignee_ids: ['emp-1'],
      created_by: 'jefe',
      request_date: '2026-09-01',
      due_date: '2026-09-30',
      closed_date: null,
      status: 'En proceso',
    })
  }
  return rows
}

describe('evaluation-analysis.js handler — score automático (F5)', () => {
  beforeEach(() => {
    fromMock.mockReset()
    requireUserMock.mockReset()
    generateContentMock.mockReset()
    loadCompanyInputsMock.mockReset()
    loadHistoryByUserMock.mockReset()
    process.env.GEMINI_API_KEY = 'test-key'
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ summary: 'ok', strengths: [], weaknesses: [], recommendations: [] }),
    })
    loadHistoryByUserMock.mockResolvedValue(new Map())
  })

  it('permite al propio empleado pedir su análisis sin más chequeos', async () => {
    requireUserMock.mockResolvedValue({ caller: { user_id: 'emp-1', company_id: 'c1' } })
    fromMock.mockReturnValueOnce(singleChain({ data: EMPLOYEE_ROW, error: null }))
    loadCompanyInputsMock.mockResolvedValue(baseInputs({ tasks: tasksForScore() }))

    const res = await handler(makeEvent({ employeeId: 'emp-1' }))
    expect(res.statusCode).toBe(200)
    const parsed = JSON.parse(generateContentMock.mock.calls[0][0].contents.replace(/^[^{]*/, ''))
    expect(parsed.empleado).toBe('Ana Pérez')
    expect(parsed.score).not.toBeNull()
  })

  it('deniega (403) a un tercero cuando evaluaciones.ver_todo está restringida a nivel 4', async () => {
    requireUserMock.mockResolvedValue({ caller: { user_id: 'compañero-1', company_id: 'c1' } })
    fromMock
      .mockReturnValueOnce(singleChain({ data: EMPLOYEE_ROW, error: null }))
      .mockReturnValueOnce(
        singleChain({
          data: { user_id: 'compañero-1', admin: false, access_level: 1, company_id: 'c1' },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        permRowChain({
          data: {
            rules: { deny: [], rules: [{ all: [{ type: 'min_level', value: 4, ids: [] }] }] },
          },
          error: null,
        }),
      )

    const res = await handler(makeEvent({ employeeId: 'emp-1' }))
    expect(res.statusCode).toBe(403)
  })

  it('permite a admin=true sin necesitar la fila de capability', async () => {
    requireUserMock.mockResolvedValue({ caller: { user_id: 'admin-1', company_id: 'c1' } })
    fromMock
      .mockReturnValueOnce(singleChain({ data: EMPLOYEE_ROW, error: null }))
      .mockReturnValueOnce(
        singleChain({
          data: { user_id: 'admin-1', admin: true, access_level: 4, company_id: 'c1' },
          error: null,
        }),
      )
    loadCompanyInputsMock.mockResolvedValue(baseInputs({ tasks: tasksForScore() }))

    const res = await handler(makeEvent({ employeeId: 'emp-1' }))
    expect(res.statusCode).toBe(200)
  })

  it('403 si el empleado pertenece a otra empresa (tenant check)', async () => {
    requireUserMock.mockResolvedValue({ caller: { user_id: 'emp-1', company_id: 'c2' } })
    fromMock.mockReturnValueOnce(singleChain({ data: EMPLOYEE_ROW, error: null }))

    const res = await handler(makeEvent({ employeeId: 'emp-1' }))
    expect(res.statusCode).toBe(403)
  })

  it('400 cuando el empleado no tiene datos suficientes este mes (score null)', async () => {
    requireUserMock.mockResolvedValue({ caller: { user_id: 'emp-1', company_id: 'c1' } })
    fromMock.mockReturnValueOnce(singleChain({ data: EMPLOYEE_ROW, error: null }))
    loadCompanyInputsMock.mockResolvedValue(baseInputs()) // sin tareas → sin_datos

    const res = await handler(makeEvent({ employeeId: 'emp-1' }))
    expect(res.statusCode).toBe(400)
  })
})
