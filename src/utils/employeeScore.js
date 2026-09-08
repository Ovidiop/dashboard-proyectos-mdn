/**
 * Evaluación automática de desempeño por empleado (ver ARQUITECTURA.md §2.7).
 * Núcleo de scoring: 9 indicadores puros + orquestador. Ningún indicador conoce su
 * peso — devuelve qué tan bien lo hizo el empleado (`pct`, 0–1) y si tuvo volumen
 * suficiente para significar algo (`aplica`). El peso lo decide el perfil de cargo
 * (ver `employeeScoreProfiles.js`), que también redistribuye el peso de los
 * indicadores que no aplicaron — mismo mecanismo que `calcSolicitudes` en
 * `metricsScore.js`, generalizado a 9 fuentes.
 *
 * Puro: no toca Supabase ni el DOM. `ctx` trae todos los datos ya cargados por el
 * caller (ver `useEmployeeScores.js` / la RPC `employee_score_inputs`).
 */
import {
  isClosed,
  isLate,
  isDragged,
  isBlocked,
  parseD,
  daysBetween,
  taskInMonth,
} from '../components/tareas/constants'
import { cnpInMonth, cnpPieceCount, cnpPiecesDelivered } from '../components/cnp/constants'
import { buildFixedWeeks, aggregateEmployeeFixedTasksByRole } from './fixedTasks'
import { computeAvailability, isInExcludedRange } from './employeeAvailability'
import { INDICATOR_KEYS, resolveProfile, effectiveWeights } from './employeeScoreProfiles'
import { getSlaThresholdHours } from '../components/tickets/slaUtils'

export { INDICATOR_KEYS }

/** Unidades mínimas de datos, por debajo de las cuales un score no es confiable. */
const MIN_UNITS_GLOBAL = 8
const MIN_APLICABLES = 2
const MIN_WEIGHT_BASE = 50

// ─── Helpers compartidos ────────────────────────────────────────────────────

function dueKey(dateStr) {
  return dateStr ?? null
}

/** true si el ítem debe excluirse del universo (su fecha de referencia cae en un
 * rango de indisponibilidad del empleado — vacaciones confirmadas o pre-ingreso). */
function isExcluded(dateStr, rangosExcluidos) {
  return isInExcludedRange(dueKey(dateStr), rangosExcluidos)
}

function result(key, { aplica, pct, unidades, detalle }) {
  return { key, aplica, pct: aplica ? pct : null, unidades, detalle }
}

// ─── 1. Entregas (tareas + CNP) ─────────────────────────────────────────────

/**
 * Cumplimiento de entregas, 50/50 entre tareas y CNP, con redistribución al 100%
 * si una de las dos fuentes no tuvo volumen ese mes (patrón `calcSolicitudes`).
 */
export function calcEntregas(ctx) {
  const { userId, monthIdx, tasks, cnp, disponibilidad } = ctx
  const rangos = disponibilidad?.rangosExcluidos ?? []

  const misTareas = (tasks ?? []).filter(
    (t) =>
      (t.assignee_ids ?? []).includes(userId) &&
      taskInMonth(t, monthIdx) &&
      !isExcluded(t.due_date, rangos),
  )
  const misCnp = (cnp ?? []).filter(
    (c) =>
      c.assignee_id === userId &&
      !c.deleted_at &&
      cnpInMonth(c, monthIdx) &&
      !isExcluded(c.due_date, rangos),
  )

  const tUniverso = misTareas.length
  const tCerradas = misTareas.filter(isClosed).length
  const cSolicitadas = misCnp.reduce((sum, c) => sum + cnpPieceCount(c), 0)
  const cEntregadas = misCnp.reduce((sum, c) => sum + cnpPiecesDelivered(c), 0)

  const tHas = tUniverso > 0
  const cHas = cSolicitadas > 0
  const unidades = tUniverso + cSolicitadas

  if (!tHas && !cHas) return result('entregas', { aplica: false, pct: null, unidades, detalle: {} })

  const tWeight = tHas ? 0.5 : 0
  const cWeight = cHas ? 0.5 : 0
  const extra = (tHas ? 0 : 0.5) + (cHas ? 0 : 0.5)
  const tFinal = tHas && !cHas ? tWeight + extra : tWeight
  const cFinal = cHas && !tHas ? cWeight + extra : cWeight

  const tScore = tHas ? (tCerradas / tUniverso) * tFinal : 0
  const cScore = cHas ? (cEntregadas / cSolicitadas) * cFinal : 0

  return result('entregas', {
    aplica: unidades >= 3,
    pct: tScore + cScore,
    unidades,
    detalle: { tUniverso, tCerradas, cSolicitadas, cEntregadas },
  })
}

// ─── 2. Puntualidad ──────────────────────────────────────────────────────────

/** Entrega a tiempo: due_date vs closed_date, tareas y CNP (si tiene closed_date). */
export function calcPuntualidad(ctx) {
  const { userId, monthIdx, tasks, cnp, disponibilidad } = ctx
  const rangos = disponibilidad?.rangosExcluidos ?? []

  const cerradasConFechas = []
  ;(tasks ?? [])
    .filter((t) => (t.assignee_ids ?? []).includes(userId) && taskInMonth(t, monthIdx))
    .forEach((t) => {
      if (isClosed(t) && t.due_date && t.closed_date && !isExcluded(t.due_date, rangos)) {
        cerradasConFechas.push({ due: t.due_date, closed: t.closed_date })
      }
    })
  ;(cnp ?? [])
    .filter((c) => c.assignee_id === userId && !c.deleted_at && cnpInMonth(c, monthIdx))
    .forEach((c) => {
      if (isClosed(c) && c.due_date && c.closed_date && !isExcluded(c.due_date, rangos)) {
        cerradasConFechas.push({ due: c.due_date, closed: c.closed_date })
      }
    })

  const total = cerradasConFechas.length
  if (total === 0)
    return result('puntualidad', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const aTiempo = cerradasConFechas.filter(
    ({ due, closed }) => daysBetween(parseD(due), parseD(closed)) <= 0,
  ).length

  return result('puntualidad', {
    aplica: total >= 3,
    pct: aTiempo / total,
    unidades: total,
    detalle: { total, aTiempo },
  })
}

// ─── 3. Arrastre / bloqueo ───────────────────────────────────────────────────

/** Penaliza tareas arrastradas de meses anteriores o paralizadas. 0% → 1.0, ≥50% → 0. */
export function calcArrastre(ctx) {
  const { userId, tasks } = ctx
  const abiertas = (tasks ?? []).filter(
    (t) => (t.assignee_ids ?? []).includes(userId) && !isClosed(t),
  )
  const unidades = abiertas.length
  if (unidades === 0)
    return result('arrastre', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const problematicas = abiertas.filter((t) => isDragged(t) || isBlocked(t) || isLate(t)).length
  const ratio = problematicas / unidades
  const pct = Math.max(0, 1 - ratio / 0.5)

  return result('arrastre', {
    aplica: unidades >= 3,
    pct,
    unidades,
    detalle: { unidades, problematicas },
  })
}

// ─── 4. Tareas fijas (por rol) ───────────────────────────────────────────────

export function calcTareasFijas(ctx) {
  const { userId, year, month, marks, clients } = ctx
  const weeks = buildFixedWeeks(year, month)
  // Filtrado defensivo por período: aggregateEmployeeFixedTasksByRole busca marcas por
  // (client_id, task_key, period_week) sin año/mes — si el caller pasara marcas de otro
  // mes, una semana 1 de agosto podría emparejarse con la semana 1 de septiembre por
  // coincidencia de period_week. La RPC ya filtra por período, pero no hay que confiar
  // en que todo caller lo haga.
  const periodMarks = (marks ?? []).filter(
    (m) => m.period_year === year && m.period_month === month,
  )
  const agg = aggregateEmployeeFixedTasksByRole(periodMarks, clients ?? [], weeks, userId, {
    year,
    month,
  })

  if (agg.meta === 0)
    return result('tareas_fijas', { aplica: false, pct: null, unidades: 0, detalle: agg })

  const cumplimiento = agg.cumplimientoPct ?? 0
  const puntual = agg.puntualPct ?? 0
  const pct = 0.6 * cumplimiento + 0.4 * puntual

  return result('tareas_fijas', { aplica: agg.meta >= 4, pct, unidades: agg.meta, detalle: agg })
}

// ─── 5. Piezas audiovisuales ─────────────────────────────────────────────────

/** Piezas asignadas (editor_user_id) vs entregadas ('listo'), del mes. */
export function calcPiezasAv(ctx) {
  const { userId, monthIdx, piezas } = ctx
  const misPiezas = (piezas ?? []).filter((p) => {
    if (p.editor_user_id !== userId) return false
    const d = parseD((p.created_at ?? '').slice(0, 10))
    return d ? d.getFullYear() * 12 + d.getMonth() === monthIdx : false
  })
  const unidades = misPiezas.length
  if (unidades === 0)
    return result('piezas_av', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const listas = misPiezas.filter((p) => p.status === 'listo').length
  return result('piezas_av', {
    aplica: unidades >= 3,
    pct: listas / unidades,
    unidades,
    detalle: { unidades, listas },
  })
}

// ─── 6. Reuniones ────────────────────────────────────────────────────────────

/** Asistencia a reuniones convocadas por terceros (anti auto-círculo). */
export function calcReuniones(ctx) {
  const { userId, monthIdx, meetings } = ctx
  const convocadas = (meetings ?? []).filter((m) => {
    if (!(m.attendee_ids ?? []).includes(userId)) return false
    if (m.created_by === userId) return false
    if (m.status === 'cancelada') return false
    const d = parseD((m.starts_at ?? '').slice(0, 10))
    return d ? d.getFullYear() * 12 + d.getMonth() === monthIdx : false
  })
  const unidades = convocadas.length
  if (unidades === 0)
    return result('reuniones', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const realizadas = convocadas.filter((m) => m.status === 'realizada').length
  return result('reuniones', {
    aplica: unidades >= 2,
    pct: realizadas / unidades,
    unidades,
    detalle: { unidades, realizadas },
  })
}

// ─── 7. Campañas ─────────────────────────────────────────────────────────────

/** Campañas pagadas con resultados cargados + campañas orgánicas por checklist. */
export function calcCampanas(ctx) {
  const { userId, monthIdx, paidCampaigns, campaigns } = ctx

  const misPagadas = (paidCampaigns ?? []).filter((c) => {
    if (c.responsable_id !== userId || c.status !== 'Finalizado') return false
    const d = parseD((c.updated_at ?? c.created_at ?? '').slice(0, 10))
    return d ? d.getFullYear() * 12 + d.getMonth() === monthIdx : false
  })
  const misOrganicas = (campaigns ?? []).filter((c) => {
    if (c.assignee !== userId) return false
    const d = parseD((c.created_at ?? '').slice(0, 10))
    return d ? d.getFullYear() * 12 + d.getMonth() === monthIdx : false
  })

  const pHas = misPagadas.length > 0
  const oHas = misOrganicas.length > 0
  const unidades = misPagadas.length + misOrganicas.length
  if (!pHas && !oHas)
    return result('campanas', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const pWeight = pHas ? 0.5 : 0
  const oWeight = oHas ? 0.5 : 0
  const extra = (pHas ? 0 : 0.5) + (oHas ? 0 : 0.5)
  const pFinal = pHas && !oHas ? pWeight + extra : pWeight
  const oFinal = oHas && !pHas ? oWeight + extra : oWeight

  const pPct = pHas ? misPagadas.filter((c) => !c.results_pending).length / misPagadas.length : 0
  const oPct = oHas
    ? misOrganicas.reduce((sum, c) => {
        const items = Array.isArray(c.checklist) ? c.checklist : []
        if (!items.length) return sum
        return sum + items.filter((i) => i.done).length / items.length
      }, 0) / misOrganicas.length
    : 0

  return result('campanas', {
    aplica: unidades >= 1,
    pct: pPct * pFinal + oPct * oFinal,
    unidades,
    detalle: { misPagadas: misPagadas.length, misOrganicas: misOrganicas.length },
  })
}

// ─── 8. Chequeo de plataformas ───────────────────────────────────────────────

/** Celdas de chequeo (cuenta × red × tipo) publicadas por el empleado, del mes. */
export function calcChequeo(ctx) {
  const { userId, monthIdx, checks, clients } = ctx
  const misClientes = (clients ?? []).filter((c) => c.social_manager_id === userId)
  if (misClientes.length === 0)
    return result('chequeo', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const clientIds = new Set(misClientes.map((c) => c.id))
  const misChecks = (checks ?? []).filter((ch) => {
    if (!clientIds.has(ch.client_id)) return false
    if (ch.updated_by !== userId) return false
    const d = parseD((ch.updated_at ?? '').slice(0, 10))
    return d ? d.getFullYear() * 12 + d.getMonth() === monthIdx : false
  })

  const unidades = misChecks.length
  if (unidades === 0)
    return result('chequeo', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const conFecha = misChecks.filter((ch) => ch.last_published_at).length
  return result('chequeo', {
    aplica: unidades >= 2,
    pct: conFecha / unidades,
    unidades,
    detalle: { unidades, conFecha },
  })
}

// ─── 9. Tickets (solo IT) ────────────────────────────────────────────────────

/** Tickets resueltos dentro de SLA. Solo aplica a `department_id = 0` (IT). */
export function calcTickets(ctx) {
  const { userId, monthIdx, tickets, department_id } = ctx
  if (String(department_id) !== '0') {
    return result('tickets', { aplica: false, pct: null, unidades: 0, detalle: {} })
  }

  const misTickets = (tickets ?? []).filter((t) => {
    if (t.assigned_to !== userId) return false
    const d = parseD((t.created_at ?? '').slice(0, 10))
    return d ? d.getFullYear() * 12 + d.getMonth() === monthIdx : false
  })
  const unidades = misTickets.length
  if (unidades === 0)
    return result('tickets', { aplica: false, pct: null, unidades: 0, detalle: {} })

  const enSla = misTickets.filter((t) => {
    if (!t.resolved_at) return false
    const ageHours = (new Date(t.resolved_at) - new Date(t.created_at)) / (1000 * 60 * 60)
    return ageHours <= getSlaThresholdHours(t.priority)
  }).length

  return result('tickets', {
    aplica: unidades >= 3,
    pct: enSla / unidades,
    unidades,
    detalle: { unidades, enSla },
  })
}

// ─── Orquestador ─────────────────────────────────────────────────────────────

export const INDICATORS = [
  { key: 'entregas', label: 'Cumplimiento de entregas', calc: calcEntregas },
  { key: 'puntualidad', label: 'Entrega a tiempo', calc: calcPuntualidad },
  { key: 'arrastre', label: 'No arrastre / no bloqueo', calc: calcArrastre },
  { key: 'tareas_fijas', label: 'Tareas fijas', calc: calcTareasFijas },
  { key: 'piezas_av', label: 'Piezas audiovisuales', calc: calcPiezasAv },
  { key: 'reuniones', label: 'Asistencia a reuniones', calc: calcReuniones },
  { key: 'campanas', label: 'Campañas con resultados', calc: calcCampanas },
  { key: 'chequeo', label: 'Chequeo de plataformas', calc: calcChequeo },
  { key: 'tickets', label: 'Tickets IT en SLA', calc: calcTickets },
]

/**
 * % de tareas/CNP del empleado que él mismo creó (posible auto-círculo: asignarse
 * trabajo a sí mismo para inflar el indicador de entregas).
 */
function computeAutoCirculoPct(ctx) {
  const { userId, monthIdx, tasks, cnp } = ctx
  const misTareas = (tasks ?? []).filter(
    (t) => (t.assignee_ids ?? []).includes(userId) && taskInMonth(t, monthIdx),
  )
  const misCnp = (cnp ?? []).filter(
    (c) => c.assignee_id === userId && !c.deleted_at && cnpInMonth(c, monthIdx),
  )
  const total = misTareas.length + misCnp.length
  if (total === 0) return null
  const propias =
    misTareas.filter((t) => t.created_by === userId).length +
    misCnp.filter((c) => c.created_by === userId).length
  return propias / total
}

/**
 * Calcula el score 0-100 de un empleado en un mes, dado el contexto de datos y los
 * pesos de su perfil de cargo.
 *
 * @param {object} ctx      ver los calcX de arriba para las claves esperadas, más
 *                          {userId, year, month, monthIdx, department_id, disponibilidad}
 * @param {Record<string,number>} weights  pesos base del perfil (`employee_score_profiles.weights`)
 * @returns {{
 *   score: number|null, estado: 'ok'|'parcial'|'sin_datos',
 *   breakdown: Array<{key,label,aplica,pct,pesoBase,pesoEfectivo,puntos,unidades,detalle}>,
 *   disponibilidad: number, cobertura: number, enRanking: boolean, autoCirculoPct: number|null,
 * }}
 */
export function computeEmployeeScore(ctx, weights) {
  const results = INDICATORS.map(({ key, calc }) => calc(ctx))
  const effective = effectiveWeights(weights, results)

  const pesoBaseAplicables = results
    .filter((r) => r.aplica && Number(weights?.[r.key] ?? 0) > 0)
    .reduce((sum, r) => sum + Number(weights[r.key]), 0)
  const nAplicables = results.filter((r) => r.aplica && Number(weights?.[r.key] ?? 0) > 0).length

  const breakdown = INDICATORS.map(({ key, label }, i) => {
    const r = results[i]
    const pesoBase = Number(weights?.[key] ?? 0)
    const pesoEfectivo = effective[key] ?? 0
    const puntos = r.aplica ? (r.pct ?? 0) * pesoEfectivo : 0
    return {
      key,
      label,
      aplica: r.aplica,
      pct: r.pct,
      pesoBase,
      pesoEfectivo,
      puntos,
      unidades: r.unidades,
      detalle: r.detalle,
    }
  })

  const unidadesTotales = results.reduce((sum, r) => sum + (r.unidades ?? 0), 0)
  const sinDatos =
    pesoBaseAplicables < MIN_WEIGHT_BASE ||
    unidadesTotales < MIN_UNITS_GLOBAL ||
    nAplicables < MIN_APLICABLES

  const disponibilidad = ctx.disponibilidad?.factor ?? 1
  const autoCirculoPct = computeAutoCirculoPct(ctx)

  let estado = 'ok'
  if (sinDatos) estado = 'sin_datos'
  else if (disponibilidad < 0.5 || ctx.onProbation) estado = 'parcial'

  const score = sinDatos
    ? null
    : Math.min(100, Math.round(breakdown.reduce((sum, b) => sum + b.puntos, 0) * 10) / 10)

  const enRanking =
    !sinDatos && estado !== 'parcial' && !(autoCirculoPct != null && autoCirculoPct > 0.6)

  return {
    score,
    estado,
    breakdown,
    disponibilidad,
    cobertura: pesoBaseAplicables,
    enRanking,
    autoCirculoPct,
  }
}

/**
 * Calcula el score de todos los empleados dados, indexando cada colección de datos
 * por userId una sola vez (O(N+M), sin N+1 por empleado).
 *
 * @param {Array} users   empleados activos a evaluar, con {user_id, position_id,
 *                        department_id, access_level, hire_date, on_probation}
 * @param {object} inputs colecciones crudas: {tasks, cnp, marks, clients, piezas,
 *                        meetings, campaigns, paidCampaigns, checks, tickets, vacations}
 * @param {Array} profiles  employee_score_profiles de la empresa
 * @param {{year:number, month:number, monthIdx:number}} period
 * @returns {Map<string, ReturnType<typeof computeEmployeeScore>>}
 */
export function computeAllEmployeeScores(users, inputs, profiles, period) {
  const vacationsByUser = new Map()
  ;(inputs.vacations ?? []).forEach((v) => {
    const list = vacationsByUser.get(v.user_id) ?? []
    list.push(v)
    vacationsByUser.set(v.user_id, list)
  })

  const scores = new Map()
  for (const user of users) {
    const disponibilidad = computeAvailability(
      user,
      vacationsByUser.get(user.user_id) ?? [],
      period.year,
      period.month,
    )
    const profile = resolveProfile(user, profiles)
    const ctx = {
      ...inputs,
      userId: user.user_id,
      year: period.year,
      month: period.month,
      monthIdx: period.monthIdx,
      department_id: user.department_id,
      disponibilidad,
      onProbation: !!user.on_probation,
    }
    scores.set(user.user_id, computeEmployeeScore(ctx, profile?.weights ?? {}))
  }
  return scores
}
