import { renderHook, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { makeQuery } from './helpers/supabaseMock'

vi.mock('../supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

import { supabase } from '../supabase'
import { useEmployeeScores } from '../hooks/useEmployeeScores'

const USERS_TABLE = [
  {
    user_id: 'u1',
    first_name: 'Ana',
    last_name: 'Pérez',
    access_level: 1,
    department_id: 1,
    deleted_at: null,
  },
  {
    user_id: 'u2',
    first_name: 'Luis',
    last_name: 'Gómez',
    access_level: 1,
    department_id: 1,
    deleted_at: null,
  },
]

function rpcPayload(overrides = {}) {
  return {
    users: [
      {
        user_id: 'u1',
        first_name: 'Ana',
        department_id: 1,
        access_level: 1,
        hire_date: null,
        on_probation: false,
      },
    ],
    clients: [],
    tasks: [
      {
        assignee_ids: ['u1'],
        created_by: 'jefe',
        request_date: '2026-09-01',
        due_date: '2026-09-10',
        closed_date: '2026-09-09',
        status: 'Terminado',
      },
      {
        assignee_ids: ['u1'],
        created_by: 'jefe',
        request_date: '2026-09-01',
        due_date: '2026-09-11',
        closed_date: '2026-09-10',
        status: 'Terminado',
      },
      {
        assignee_ids: ['u1'],
        created_by: 'jefe',
        request_date: '2026-09-01',
        due_date: '2026-09-12',
        closed_date: '2026-09-11',
        status: 'Terminado',
      },
    ],
    cnp: [],
    marks: [],
    piezas: [],
    meetings: [],
    campaigns: [],
    paidCampaigns: [],
    checks: [],
    tickets: [],
    vacations: [],
    profiles: [
      {
        id: 'p1',
        is_default: true,
        match: {},
        weights: {
          entregas: 100,
          puntualidad: 0,
          arrastre: 0,
          tareas_fijas: 0,
          piezas_av: 0,
          reuniones: 0,
          campanas: 0,
          chequeo: 0,
          tickets: 0,
        },
      },
    ],
    ...overrides,
  }
}

describe('useEmployeeScores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mes en curso: calcula en vivo vía RPC y no consulta employee_score_snapshots', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'users') return makeQuery(USERS_TABLE)
      if (table === 'employee_score_snapshots') return makeQuery([])
      return makeQuery([])
    })
    supabase.rpc.mockResolvedValue({ data: rpcPayload(), error: null })

    const { result } = renderHook(() => useEmployeeScores({ year: 2026, month: 9 }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isSnapshot).toBe(false)
    expect(result.current.scores.get('u1')).toBeTruthy()
    expect(supabase.rpc).toHaveBeenCalledWith('employee_score_inputs', { p_year: 2026, p_month: 9 })
  })

  it('mes cerrado con snapshot: lee employee_score_snapshots y no llama la RPC', async () => {
    const snapshotRows = [
      {
        user_id: 'u1',
        score: '82.30',
        estado: 'ok',
        breakdown: [
          {
            key: 'entregas',
            label: 'Entregas',
            aplica: true,
            pct: 0.8,
            pesoBase: 100,
            pesoEfectivo: 100,
            unidades: 5,
          },
        ],
        disponibilidad: '1.000',
        auto_circulo_pct: null,
        en_ranking: true,
      },
    ]
    supabase.from.mockImplementation((table) => {
      if (table === 'users') return makeQuery(USERS_TABLE)
      if (table === 'employee_score_snapshots') return makeQuery(snapshotRows)
      return makeQuery([])
    })
    supabase.rpc.mockResolvedValue({ data: rpcPayload(), error: null })

    const { result } = renderHook(() => useEmployeeScores({ year: 2026, month: 7 }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isSnapshot).toBe(true)
    expect(result.current.scores.get('u1').score).toBeCloseTo(82.3)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('mes cerrado sin snapshot todavía: cae de vuelta al cálculo en vivo', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'users') return makeQuery(USERS_TABLE)
      if (table === 'employee_score_snapshots') return makeQuery([])
      return makeQuery([])
    })
    supabase.rpc.mockResolvedValue({ data: rpcPayload(), error: null })

    const { result } = renderHook(() => useEmployeeScores({ year: 2026, month: 7 }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isSnapshot).toBe(false)
    expect(supabase.rpc).toHaveBeenCalled()
  })

  it('ranking excluye a quienes no están en enRanking o no tienen score', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'users') return makeQuery(USERS_TABLE)
      if (table === 'employee_score_snapshots') return makeQuery([])
      return makeQuery([])
    })
    supabase.rpc.mockResolvedValue({
      data: rpcPayload({
        users: [
          {
            user_id: 'u1',
            department_id: 1,
            access_level: 1,
            hire_date: null,
            on_probation: false,
          },
          {
            user_id: 'u2',
            department_id: 1,
            access_level: 1,
            hire_date: null,
            on_probation: false,
          },
        ],
      }),
      error: null,
    })

    const { result } = renderHook(() => useEmployeeScores({ year: 2026, month: 9 }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // u2 no tiene ninguna tarea/dato → sin_datos, score null → nunca aparece en ranking.
    expect(result.current.ranking.some((r) => r.userId === 'u2')).toBe(false)
  })
})
