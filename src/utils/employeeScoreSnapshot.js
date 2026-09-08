/**
 * Lógica pura del snapshot mensual de la Evaluación automática de desempeño (ver
 * ARQUITECTURA.md §2.7 y netlify/functions/employee-scores-snapshot.js). Separada de
 * la Netlify Function para poder testearla con vitest sin tocar Supabase ni el
 * runtime de Netlify — misma fórmula que el cálculo en vivo del cliente
 * (src/utils/employeeScore.js), nada duplicado.
 */
import { computeAllEmployeeScores } from './employeeScore'
import { resolveProfile } from './employeeScoreProfiles'
import { buildScoreNarrative } from './employeeScoreNarrative'

/**
 * Mes anterior al actual, en hora de Caracas (UTC-4) — mismo criterio que el cierre
 * de metric_reports (ver `src/utils/reportClosure.js`). Usado por el modo programado
 * de `netlify/functions/employee-scores-snapshot.js`: el día 5 congela el mes que
 * acaba de cerrar, no el mes en curso.
 * @param {Date} [now] inyectable para tests; por defecto la hora real.
 */
export function previousMonthCaracas(now = new Date()) {
  const caracas = new Date(now.getTime() - 4 * 60 * 60 * 1000)
  const year = caracas.getUTCFullYear()
  const month = caracas.getUTCMonth() + 1 // 1-indexado, mes ACTUAL en Caracas
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  return { year: prevYear, month: prevMonth }
}

/**
 * Los N meses inmediatamente anteriores a `{year, month}`, más reciente primero.
 * Usado para traer el historial que alimenta `buildScoreNarrative` — tanto en el
 * snapshot mensual como en el cálculo en vivo (ver `useEmployeeScores.js`).
 * @returns {Array<{year:number, month:number}>}
 */
export function priorPeriods(year, month, n) {
  const periods = []
  let y = year
  let m = month
  for (let i = 0; i < n; i++) {
    m -= 1
    if (m < 1) {
      m = 12
      y -= 1
    }
    periods.push({ year: y, month: m })
  }
  return periods
}

/**
 * Construye las filas listas para upsert en `employee_score_snapshots` para todos los
 * empleados activos de una empresa en un mes. Excluye empleados con `deleted_at` — no
 * tiene sentido congelar el score de alguien que ya no está.
 *
 * Idempotente: mismo `users`/`inputs`/`profiles`/`period` siempre produce las mismas
 * filas (salvo `computed_at`, que pone el caller al hacer el upsert) — se puede volver
 * a ejecutar sin resultados distintos, necesario para el backfill y para recomputar
 * tras un fix de fórmula.
 *
 * @param {Array} users     filas de `users` de la empresa (incluye archivados)
 * @param {object} inputs   colecciones crudas: {clients, tasks, cnp, marks, piezas,
 *                          meetings, campaigns, paidCampaigns, checks, tickets, vacations}
 * @param {Array} profiles  employee_score_profiles de la empresa
 * @param {{year:number, month:number, monthIdx:number}} period
 * @param {{companyId:string, computedBy?:string|null, historyByUser?:Map<string,Array>}} opts
 *   `historyByUser` — hasta 3 snapshots anteriores por empleado (más reciente primero),
 *   para la narrativa comparativa (ver `buildScoreNarrative`). Opcional: sin historial
 *   disponible (p.ej. los primeros 3 meses tras el lanzamiento) la narrativa simplemente
 *   no compara contra meses previos.
 * @returns {Array<object>} filas para `employee_score_snapshots` (sin `id`/`computed_at`)
 */
export function buildSnapshotRows(
  users,
  inputs,
  profiles,
  period,
  { companyId, computedBy = null, historyByUser = new Map() },
) {
  const activeUsers = (users ?? []).filter((u) => !u.deleted_at)
  const scores = computeAllEmployeeScores(activeUsers, inputs, profiles, period)

  return activeUsers.map((u) => {
    const result = scores.get(u.user_id)
    const profile = resolveProfile(u, profiles)
    return {
      company_id: companyId,
      user_id: u.user_id,
      year: period.year,
      month: period.month,
      score: result.score,
      estado: result.estado,
      breakdown: result.breakdown,
      disponibilidad: result.disponibilidad,
      auto_circulo_pct: result.autoCirculoPct,
      en_ranking: result.enRanking,
      profile_id: profile?.id ?? null,
      profile_name: profile?.name ?? null,
      narrativa: buildScoreNarrative(result, historyByUser.get(u.user_id) ?? []),
      computed_by: computedBy,
      frozen: true,
    }
  })
}
