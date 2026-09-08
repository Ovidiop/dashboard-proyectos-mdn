import { describe, it, expect } from 'vitest'
import { buildSnapshotRows, previousMonthCaracas } from '../utils/employeeScoreSnapshot'

const YEAR = 2026
const MONTH = 8
const MONTH_IDX = YEAR * 12 + (MONTH - 1)
const COMPANY_ID = 'company-1'

const DEFAULT_PROFILE = {
  id: 'p1',
  is_default: true,
  match: {},
  // Al menos 2 indicadores con peso > 0: con solo 1, nAplicables nunca llega al mínimo
  // de la guarda (MIN_APLICABLES=2 en employeeScore.js) y el score sería siempre
  // 'sin_datos' sin importar el volumen — ningún perfil sembrado real tiene esta forma.
  weights: {
    entregas: 60,
    puntualidad: 40,
    arrastre: 0,
    tareas_fijas: 0,
    piezas_av: 0,
    reuniones: 0,
    campanas: 0,
    chequeo: 0,
    tickets: 0,
  },
}

function task(overrides = {}) {
  return {
    assignee_ids: ['u1'],
    created_by: 'jefe',
    request_date: `${YEAR}-08-01`,
    due_date: `${YEAR}-08-10`,
    closed_date: `${YEAR}-08-09`,
    status: 'Terminado',
    ...overrides,
  }
}

const baseInputs = {
  clients: [],
  cnp: [],
  marks: [],
  piezas: [],
  meetings: [],
  campaigns: [],
  paidCampaigns: [],
  checks: [],
  tickets: [],
}

describe('buildSnapshotRows', () => {
  it('excluye empleados con deleted_at', () => {
    const users = [
      { user_id: 'u1', deleted_at: null, access_level: 1, hire_date: null, on_probation: false },
      {
        user_id: 'u2',
        deleted_at: '2026-01-01T00:00:00Z',
        access_level: 1,
        hire_date: null,
        on_probation: false,
      },
    ]
    const rows = buildSnapshotRows(
      users,
      {
        ...baseInputs,
        tasks: [
          task({ assignee_ids: ['u1'] }),
          task({ assignee_ids: ['u1'] }),
          task({ assignee_ids: ['u1'] }),
        ],
      },
      [DEFAULT_PROFILE],
      { year: YEAR, month: MONTH, monthIdx: MONTH_IDX },
      { companyId: COMPANY_ID },
    )
    expect(rows.map((r) => r.user_id)).toEqual(['u1'])
  })

  it('produce estado sin_datos y score null cuando no hay volumen suficiente', () => {
    const users = [
      { user_id: 'u1', deleted_at: null, access_level: 1, hire_date: null, on_probation: false },
    ]
    const rows = buildSnapshotRows(
      users,
      baseInputs,
      [DEFAULT_PROFILE],
      { year: YEAR, month: MONTH, monthIdx: MONTH_IDX },
      {
        companyId: COMPANY_ID,
      },
    )
    expect(rows[0].score).toBeNull()
    expect(rows[0].estado).toBe('sin_datos')
  })

  it('produce un score ok con suficiente volumen y estampa company_id/frozen', () => {
    const users = [
      { user_id: 'u1', deleted_at: null, access_level: 1, hire_date: null, on_probation: false },
    ]
    const tasks = Array.from({ length: 8 }, () => task())
    const rows = buildSnapshotRows(
      users,
      { ...baseInputs, tasks },
      [DEFAULT_PROFILE],
      { year: YEAR, month: MONTH, monthIdx: MONTH_IDX },
      {
        companyId: COMPANY_ID,
        computedBy: 'cron',
      },
    )
    expect(rows[0].estado).toBe('ok')
    expect(rows[0].score).toBeGreaterThan(0)
    expect(rows[0].company_id).toBe(COMPANY_ID)
    expect(rows[0].computed_by).toBe('cron')
    expect(rows[0].frozen).toBe(true)
    expect(rows[0].year).toBe(YEAR)
    expect(rows[0].month).toBe(MONTH)
  })

  it('es idempotente: misma entrada produce las mismas filas', () => {
    const users = [
      { user_id: 'u1', deleted_at: null, access_level: 1, hire_date: null, on_probation: false },
    ]
    const tasks = [task(), task(), task(), task()]
    const inputs = { ...baseInputs, tasks }
    const period = { year: YEAR, month: MONTH, monthIdx: MONTH_IDX }
    const rows1 = buildSnapshotRows(users, inputs, [DEFAULT_PROFILE], period, {
      companyId: COMPANY_ID,
    })
    const rows2 = buildSnapshotRows(users, inputs, [DEFAULT_PROFILE], period, {
      companyId: COMPANY_ID,
    })
    expect(rows1).toEqual(rows2)
  })

  it('resuelve el perfil de cargo de cada empleado y lo estampa en la fila', () => {
    const itProfile = {
      id: 'p2',
      name: 'IT',
      is_default: false,
      match: { department_ids: [0] },
      weights: { ...DEFAULT_PROFILE.weights, tickets: 100, entregas: 0 },
    }
    const users = [
      {
        user_id: 'u1',
        deleted_at: null,
        department_id: 0,
        access_level: 1,
        hire_date: null,
        on_probation: false,
      },
    ]
    const rows = buildSnapshotRows(
      users,
      baseInputs,
      [DEFAULT_PROFILE, itProfile],
      { year: YEAR, month: MONTH, monthIdx: MONTH_IDX },
      {
        companyId: COMPANY_ID,
      },
    )
    expect(rows[0].profile_id).toBe(itProfile.id)
    expect(rows[0].profile_name).toBe('IT')
  })
})

describe('previousMonthCaracas', () => {
  it('devuelve el mes anterior en un día normal del mes', () => {
    // 2026-09-05 07:00 Caracas = 2026-09-05T11:00:00Z
    expect(previousMonthCaracas(new Date('2026-09-05T11:00:00Z'))).toEqual({ year: 2026, month: 8 })
  })

  it('rueda el año al cruzar de enero a diciembre', () => {
    // 2026-01-02 22:00 Caracas = 2026-01-03T02:00:00Z
    expect(previousMonthCaracas(new Date('2026-01-03T02:00:00Z'))).toEqual({
      year: 2025,
      month: 12,
    })
  })

  it('usa la fecha de Caracas, no la de UTC, cerca de medianoche', () => {
    // 23:59 del 31/ago en Caracas ya es 1/sep en UTC — el mes anterior debe seguir
    // siendo julio (mes anterior a agosto), no agosto (mes anterior a septiembre).
    expect(previousMonthCaracas(new Date('2026-09-01T03:59:00Z'))).toEqual({ year: 2026, month: 7 })
    // Un minuto después ya es 00:01 del 1/sep en Caracas → el mes anterior es agosto.
    expect(previousMonthCaracas(new Date('2026-09-01T04:01:00Z'))).toEqual({ year: 2026, month: 8 })
  })
})
