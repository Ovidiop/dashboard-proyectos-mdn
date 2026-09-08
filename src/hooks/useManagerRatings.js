import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { ratingAverage, buildRatingItems } from '../utils/managerRating'
import { priorPeriods } from '../utils/employeeScoreSnapshot'

/**
 * Evaluación subjetiva mensual del jefe (tabla `manager_ratings`) — ver ARQUITECTURA.md
 * §2.7. Separado de `useEmployeeScores` a propósito: ese hook dispara la RPC pesada
 * `employee_score_inputs` (tareas/CNP/piezas/campañas del mes completo); guardar una
 * evaluación no debe costar esa recarga.
 *
 * `prevRatings` trae las evaluaciones del mes inmediatamente anterior — para la
 * flecha de variación mes contra mes en la tabla de Desempeño (ver useEmployeeScores).
 *
 * @param {{year:number, month:number, companyId:string}} params  month 1-indexado
 */
export function useManagerRatings({ year, month, companyId }) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    criteriaByPosition: new Map(),
    ratings: new Map(),
    prevRatings: new Map(),
  })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    const [prevPeriod] = priorPeriods(year, month, 1)
    const [criteriaRes, ratingsRes, prevRatingsRes] = await Promise.all([
      supabase
        .from('evaluation_criteria')
        .select('*')
        .eq('active', true)
        .order('position_id')
        .order('sort_order'),
      supabase.from('manager_ratings').select('*').eq('year', year).eq('month', month),
      supabase
        .from('manager_ratings')
        .select('*')
        .eq('year', prevPeriod.year)
        .eq('month', prevPeriod.month),
    ])
    if (criteriaRes.error) {
      setState((s) => ({ ...s, loading: false, error: criteriaRes.error.message }))
      return
    }
    if (ratingsRes.error) {
      setState((s) => ({ ...s, loading: false, error: ratingsRes.error.message }))
      return
    }
    const criteriaByPosition = new Map()
    for (const c of criteriaRes.data ?? []) {
      const list = criteriaByPosition.get(c.position_id) ?? []
      list.push(c)
      criteriaByPosition.set(c.position_id, list)
    }
    const ratings = new Map((ratingsRes.data ?? []).map((r) => [r.user_id, r]))
    const prevRatings = new Map((prevRatingsRes.data ?? []).map((r) => [r.user_id, r]))
    setState({ loading: false, error: null, criteriaByPosition, ratings, prevRatings })
  }, [year, month])

  useEffect(() => {
    load()
  }, [load])

  /**
   * Guarda (crea o actualiza) la evaluación de un empleado en el mes actual.
   *
   * @param {string} userId
   * @param {object} params
   * @param {number|null} params.positionId
   * @param {Array<{id, icon, name}>} params.criteria    criterios del cargo, en orden
   * @param {Record<string, number>} params.scoresById   {criterion_id: score 1-5}
   * @param {string} params.comment
   * @param {string} params.ratedBy
   */
  const save = useCallback(
    async (userId, { positionId, criteria, scoresById, comment, ratedBy }) => {
      const items = buildRatingItems(criteria, scoresById)
      const promedio = ratingAverage(items)
      if (promedio == null) {
        throw new Error('Debes puntuar al menos un criterio.')
      }
      const row = {
        company_id: companyId,
        user_id: userId,
        year,
        month,
        position_id: positionId ?? null,
        items,
        promedio,
        comment: comment?.trim() || null,
        rated_by: ratedBy,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from('manager_ratings')
        .upsert(row, { onConflict: 'user_id,year,month' })
        .select()
        .single()
      if (error) throw error
      setState((s) => {
        const ratings = new Map(s.ratings)
        ratings.set(userId, data)
        return { ...s, ratings }
      })
      return data
    },
    [companyId, year, month],
  )

  return { ...state, save, reload: load }
}
