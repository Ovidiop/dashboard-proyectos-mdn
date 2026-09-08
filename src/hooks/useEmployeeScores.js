import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { computeAllEmployeeScores } from '../utils/employeeScore'
import { buildScoreNarrative } from '../utils/employeeScoreNarrative'
import { priorPeriods } from '../utils/employeeScoreSnapshot'
import { currentMonthIndex, monthIndex } from '../components/tareas/constants'

/**
 * Datos de la Evaluación automática de desempeño para un mes dado (ver
 * ARQUITECTURA.md §2.7). Dos modos, misma fórmula (src/utils/employeeScore.js):
 *
 *  - Mes en curso: llama la RPC `employee_score_inputs` (un roundtrip, ya acotada
 *    a los empleados visibles por RLS) y calcula en vivo en el cliente.
 *  - Mes anterior: lee `employee_score_snapshots` (congelado por el cron mensual —
 *    ver F3). Si aún no hay snapshot para ese mes (backfill pendiente), cae de
 *    vuelta al cálculo en vivo con la misma RPC.
 *
 * `users` siempre viene de la tabla `users` (lectura abierta a autenticados, igual
 * que el resto del sistema) para no depender de qué modo trajo el score — así los
 * componentes no tienen que distinguir la forma de los datos según el mes.
 *
 * @param {{year:number, month:number}} period  month 1-indexado
 */
export function useEmployeeScores({ year, month }) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    scores: new Map(),
    users: [],
    isSnapshot: false,
  })

  const monthIdx = useMemo(() => monthIndex(new Date(year, month - 1, 1)), [year, month])
  const isCurrentMonth = monthIdx >= currentMonthIndex()

  useEffect(() => {
    let cancelled = false

    async function loadUsers() {
      const { data, error } = await supabase
        .from('users')
        .select(
          'user_id, first_name, last_name, avatar_url, access_level, department_id, position_id, deleted_at',
        )
        .is('deleted_at', null)
      if (error) throw error
      return data ?? []
    }

    async function loadSnapshotScores() {
      const { data, error } = await supabase
        .from('employee_score_snapshots')
        .select('*')
        .eq('year', year)
        .eq('month', month)
      if (error) throw error
      if (!data?.length) return null
      return new Map(
        data.map((r) => [
          r.user_id,
          {
            score: r.score == null ? null : Number(r.score),
            estado: r.estado,
            breakdown: r.breakdown,
            disponibilidad: Number(r.disponibilidad),
            autoCirculoPct: r.auto_circulo_pct == null ? null : Number(r.auto_circulo_pct),
            enRanking: r.en_ranking,
            narrativa: r.narrativa,
          },
        ]),
      )
    }

    /** Historial de hasta 3 meses cerrados anteriores, para la narrativa comparativa
     * del cálculo en vivo (los meses cerrados ya traen su narrativa persistida). La
     * RLS de `employee_score_snapshots` acota esto igual que el resto de la vista. */
    async function loadHistoryByUser() {
      const periods = priorPeriods(year, month, 3)
      const or = periods.map((p) => `and(year.eq.${p.year},month.eq.${p.month})`).join(',')
      const { data, error } = await supabase
        .from('employee_score_snapshots')
        .select('user_id, year, month, score, estado, breakdown')
        .or(or)
      if (error) throw error
      const byUser = new Map()
      for (const row of data ?? []) {
        const list = byUser.get(row.user_id) ?? []
        list.push({
          year: row.year,
          month: row.month,
          score: row.score == null ? null : Number(row.score),
          estado: row.estado,
          breakdown: row.breakdown,
        })
        byUser.set(row.user_id, list)
      }
      for (const list of byUser.values()) {
        list.sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))
      }
      return byUser
    }

    async function loadLiveScores() {
      const [rpcRes, historyByUser] = await Promise.all([
        supabase.rpc('employee_score_inputs', { p_year: year, p_month: month }),
        loadHistoryByUser(),
      ])
      if (rpcRes.error) throw rpcRes.error
      const data = rpcRes.data
      const rpcUsers = data.users ?? []
      const scores = computeAllEmployeeScores(rpcUsers, data, data.profiles ?? [], {
        year,
        month,
        monthIdx,
      })
      for (const [userId, result] of scores) {
        result.narrativa = buildScoreNarrative(result, historyByUser.get(userId) ?? [])
      }
      return scores
    }

    async function run() {
      setState((s) => ({ ...s, loading: true, error: null }))
      try {
        const users = await loadUsers()
        let scores = null
        let isSnapshot = false
        if (!isCurrentMonth) {
          scores = await loadSnapshotScores()
          isSnapshot = scores != null
        }
        if (!scores) {
          scores = await loadLiveScores()
        }
        if (!cancelled) {
          setState({ loading: false, error: null, scores, users, isSnapshot })
        }
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({ ...s, loading: false, error: err.message }))
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [year, month, monthIdx, isCurrentMonth])

  const ranking = useMemo(() => {
    return Array.from(state.scores.entries())
      .filter(([, r]) => r.enRanking && r.score != null)
      .sort((a, b) => b[1].score - a[1].score)
      .map(([userId, result]) => ({ userId, ...result }))
  }, [state.scores])

  return { ...state, ranking, isCurrentMonth }
}
