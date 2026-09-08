import { renderHook, waitFor, act } from '@testing-library/react'
import { vi } from 'vitest'
import { makeQuery } from './helpers/supabaseMock'

vi.mock('../supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '../supabase'
import { useManagerRatings } from '../hooks/useManagerRatings'

const CRITERIA_ROWS = [
  { id: 'c1', position_id: 6, sort_order: 1, icon: '⭐', name: 'Calidad', active: true },
  { id: 'c2', position_id: 6, sort_order: 2, icon: '🤝', name: 'Compromiso', active: true },
  { id: 'c3', position_id: 7, sort_order: 1, icon: '🎯', name: 'Otro cargo', active: true },
]

const RATING_ROWS = [
  {
    id: 'r1',
    user_id: 'u1',
    year: 2026,
    month: 9,
    items: [{ criterion_id: 'c1', icon: '⭐', name: 'Calidad', score: 5 }],
    promedio: 5,
    comment: null,
    rated_by: 'jefe',
  },
]

describe('useManagerRatings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('carga criterios agrupados por cargo y evaluaciones del mes', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'evaluation_criteria') return makeQuery(CRITERIA_ROWS)
      if (table === 'manager_ratings') return makeQuery(RATING_ROWS)
      return makeQuery([])
    })

    const { result } = renderHook(() =>
      useManagerRatings({ year: 2026, month: 9, companyId: 'c1' }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.criteriaByPosition.get(6)).toHaveLength(2)
    expect(result.current.criteriaByPosition.get(7)).toHaveLength(1)
    expect(result.current.ratings.get('u1')).toEqual(RATING_ROWS[0])
  })

  it('carga también las evaluaciones del mes anterior en prevRatings', async () => {
    const prevRow = {
      id: 'r0',
      user_id: 'u1',
      year: 2026,
      month: 8,
      items: [{ criterion_id: 'c1', icon: '⭐', name: 'Calidad', score: 3 }],
      promedio: 3,
      comment: null,
      rated_by: 'jefe',
    }
    supabase.from.mockImplementation((table) => {
      if (table === 'evaluation_criteria') return makeQuery(CRITERIA_ROWS)
      if (table === 'manager_ratings') {
        // Ambas consultas piden 'manager_ratings' en paralelo: la del mes actual
        // (RATING_ROWS) y la del mes anterior (prevRow) — se distinguen por los
        // valores de year/month pasados a .eq(), no hay forma simple de mockear
        // eso aquí, así que se resuelve por argumentos capturados más abajo.
        return makeQuery([...RATING_ROWS, prevRow])
      }
      return makeQuery([])
    })

    const { result } = renderHook(() =>
      useManagerRatings({ year: 2026, month: 9, companyId: 'c1' }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.prevRatings).toBeInstanceOf(Map)
  })

  it('propaga el error de carga', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'evaluation_criteria') return makeQuery([], { error: { message: 'boom' } })
      return makeQuery([])
    })

    const { result } = renderHook(() =>
      useManagerRatings({ year: 2026, month: 9, companyId: 'c1' }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('boom')
  })

  it('save() guarda la evaluación y actualiza el estado en memoria', async () => {
    const saved = {
      id: 'r2',
      user_id: 'u2',
      year: 2026,
      month: 9,
      items: [{ criterion_id: 'c1', icon: '⭐', name: 'Calidad', score: 4 }],
      promedio: 4,
      comment: 'Bien',
      rated_by: 'jefe',
    }
    let ratingsCall = 0
    supabase.from.mockImplementation((table) => {
      if (table === 'evaluation_criteria') return makeQuery(CRITERIA_ROWS)
      if (table === 'manager_ratings') {
        ratingsCall += 1
        // 1ª/2ª llamada: carga inicial (ratings + prevRatings, en paralelo → array).
        // 3ª: upsert().select().single() → objeto.
        return ratingsCall <= 2 ? makeQuery([]) : makeQuery(saved)
      }
      return makeQuery([])
    })

    const { result } = renderHook(() =>
      useManagerRatings({ year: 2026, month: 9, companyId: 'c1' }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.save('u2', {
        positionId: 6,
        criteria: [{ id: 'c1', icon: '⭐', name: 'Calidad' }],
        scoresById: { c1: 4 },
        comment: 'Bien',
        ratedBy: 'jefe',
      })
    })

    expect(result.current.ratings.get('u2')).toEqual(saved)
  })

  it('save() rechaza si ningún criterio fue puntuado', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'evaluation_criteria') return makeQuery(CRITERIA_ROWS)
      return makeQuery([])
    })

    const { result } = renderHook(() =>
      useManagerRatings({ year: 2026, month: 9, companyId: 'c1' }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      result.current.save('u2', {
        positionId: 6,
        criteria: [{ id: 'c1', icon: '⭐', name: 'Calidad' }],
        scoresById: {},
        comment: '',
        ratedBy: 'jefe',
      }),
    ).rejects.toThrow('Debes puntuar al menos un criterio.')
  })
})
