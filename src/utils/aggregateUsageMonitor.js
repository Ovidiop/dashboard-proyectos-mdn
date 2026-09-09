/**
 * Lógica pura del Monitor de Uso por Línea Operativa (Reportes → tab «Monitor de uso»).
 * No toca Supabase ni el DOM — recibe filas ya cargadas y arma todo lo que la vista
 * necesita: conteos por jefa/equipo/apoyo externo, semáforo relativo, puntualidad y
 * tendencia. Ver /Users/macbook/.claude/plans/vamos-a-trabajar-en-bubbly-raccoon.md.
 *
 * Principio del documento fuente: comparación relativa, nunca mínimos absolutos.
 * El semáforo compara cada módulo contra el propio promedio de 3 meses de la jefa y
 * contra el promedio de las otras jefas — nunca contra un número fijo.
 */
import { buildFixedWeeks, taskDeadline } from './fixedTasks'

// ─── Módulos medidos (única fuente — tabla, semáforo y narrativa iteran esto) ──
// Evaluaciones se excluyó a propósito: hoy no se está usando ese módulo, así que
// incluirlo solo generaría ceros y ruido en el semáforo/narrativa. Si más adelante se
// retoma, basta con agregarlo de nuevo aquí (ver git history de este archivo para el
// procesamiento de `evaluation_sessions` que se quitó junto con esta entrada).
export const USAGE_MODULES = [
  { key: 'reuniones', label: 'Reuniones' },
  { key: 'tareas', label: 'Tareas' },
  { key: 'tareasFijas', label: 'Tareas Fijas' },
  { key: 'cnp', label: 'CNP' },
  { key: 'pautasAv', label: 'Pautas AV' },
]

// ─── Umbrales del semáforo (constantes con nombre, no mágicos) ────────────────
// Todos se aplican a COCIENTES (actual/baseline, actual vs peerAvg), nunca a un
// conteo crudo — así el sistema señala cambios sin dictaminar un mínimo absoluto.
export const BASELINE_MIN = 3 // por debajo de esto, un promedio no es base fiable para "caída"
export const ACTIVE_RATIO = 0.6 // actual < baseline * ACTIVE_RATIO ⇒ caída
export const RED_TOTAL_RATIO = 0.4 // total < promedio3m * RED_TOTAL_RATIO ⇒ rojo
export const RED_ZERO_SHARE = 0.5 // % de módulos aplicables en cero ⇒ rojo
export const LATE_RATIO_THRESHOLD = 0.3 // % de registros tardíos ⇒ "Registra con atraso"

function zeroCounts() {
  const c = {}
  USAGE_MODULES.forEach((m) => {
    c[m.key] = 0
  })
  return c
}

function normId(id) {
  return id == null ? null : String(id)
}

function ymKey(year, month) {
  return `${year}-${month}`
}

/** Últimos n meses terminando en (year, month), el más reciente al final. */
function lastNMonths(year, month, n) {
  const out = []
  let y = year,
    m = month
  for (let i = 0; i < n; i++) {
    out.unshift({ year: y, month: m })
    m--
    if (m < 1) {
      m = 12
      y--
    }
  }
  return out
}

/** Año/mes (1-indexado) de una fecha, sin desfase de timezone para fechas "YYYY-MM-DD". */
function ymOf(dateStr) {
  if (!dateStr) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (m) return { year: Number(m[1]), month: Number(m[2]) }
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/** Parte "YYYY-MM-DD" de una fecha (date-only o timestamptz), para comparar por día. */
function dateOnly(dateLike) {
  if (!dateLike) return null
  if (typeof dateLike === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) return dateLike
  const d = new Date(dateLike)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function userName(users, id) {
  const u = (users ?? []).find((u) => normId(u.user_id) === id)
  if (!u) return 'Desconocido'
  return [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'Desconocido'
}

// ─── Construcción de la estructura línea → miembros ────────────────────────────

function normalizeLines(lines) {
  return (lines ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
    leadId: normId(l.lead_user_id),
    memberIds: new Set((l.member_user_ids ?? []).map(normId)),
  }))
}

// ─── Registro de una acción: línea → actor → mes → módulo (+1) ────────────────

function makeBucket() {
  // lineId -> actorId -> ymKey -> counts
  return new Map()
}

function bump(bucket, lineId, actorId, ym, moduleKey) {
  if (!lineId || !actorId) return
  if (!bucket.has(lineId)) bucket.set(lineId, new Map())
  const byActor = bucket.get(lineId)
  if (!byActor.has(actorId)) byActor.set(actorId, new Map())
  const byMonth = byActor.get(actorId)
  const key = ym
  if (!byMonth.has(key)) byMonth.set(key, zeroCounts())
  byMonth.get(key)[moduleKey] += 1
}

function getCounts(bucket, lineId, actorId, ym) {
  return bucket.get(lineId)?.get(actorId)?.get(ym) ?? zeroCounts()
}

/** Roster de una línea: jefa + miembros, sin duplicar. */
function rosterOf(line) {
  const ids = new Set(line.memberIds)
  if (line.leadId) ids.add(line.leadId)
  return ids
}

/**
 * Todos los actores con actividad registrada bajo el line_id de una línea, sea o no
 * miembro formal del roster. El total de la línea mide lo que se le puso a ESE
 * line_id, no solo lo que hizo su roster — si alguien ajeno (dirección, apoyo de
 * otra línea) crea contenido con ese line_id, cuenta para esa línea igual.
 */
function actorsOfLine(bucket, lineId, roster) {
  const ids = new Set(roster)
  ;(bucket.get(lineId) ?? new Map()).forEach((_, actorId) => ids.add(actorId))
  return ids
}

function sumCounts(countsList) {
  const out = zeroCounts()
  countsList.forEach((c) => {
    USAGE_MODULES.forEach((m) => {
      out[m.key] += c[m.key]
    })
  })
  return out
}

/** Conteo del EQUIPO completo (jefa + miembros) para una línea/mes — no solo la jefa. */
function getTeamCounts(bucket, lineId, actorIds, ym) {
  return sumCounts([...actorIds].map((id) => getCounts(bucket, lineId, id, ym)))
}

// ─── Puntualidad: línea → actor → mes → { late, total, byModule } ─────────────
// `byModule` desglosa late/total por cada uno de los 3 módulos evaluables (Reuniones,
// Tareas, Tareas Fijas — CNP y Pautas AV no tienen fecha de referencia). Es lo que
// responde "¿cuánto de lo tardío fue en qué módulo?" sin listar cada registro
// individual — un resumen agregado ("de 13 tareas, 5 fueron tardías"), no un listado.
export const PUNCTUALITY_MODULES = ['reuniones', 'tareas', 'tareasFijas']

function emptyPunctuality() {
  const byModule = {}
  PUNCTUALITY_MODULES.forEach((k) => {
    byModule[k] = { late: 0, total: 0 }
  })
  return { late: 0, total: 0, byModule }
}

function makePunctuality() {
  return new Map()
}

function bumpPunctuality(map, lineId, actorId, ym, moduleKey, late) {
  if (!lineId || !actorId) return
  const key = `${lineId}__${actorId}__${ym}`
  if (!map.has(key)) map.set(key, emptyPunctuality())
  const entry = map.get(key)
  entry.total += 1
  entry.byModule[moduleKey].total += 1
  if (late) {
    entry.late += 1
    entry.byModule[moduleKey].late += 1
  }
}

function getPunctuality(map, lineId, actorId, ym) {
  return map.get(`${lineId}__${actorId}__${ym}`) ?? emptyPunctuality()
}

/** Puntualidad del EQUIPO completo (jefa + miembros) para una línea/mes. */
function getTeamPunctuality(map, lineId, actorIds, ym) {
  const out = emptyPunctuality()
  actorIds.forEach((id) => {
    const p = getPunctuality(map, lineId, id, ym)
    out.late += p.late
    out.total += p.total
    PUNCTUALITY_MODULES.forEach((k) => {
      out.byModule[k].late += p.byModule[k].late
      out.byModule[k].total += p.byModule[k].total
    })
  })
  return out
}

// ─── Agregador principal ────────────────────────────────────────────────────

/**
 * @param {object} params
 * @param {Array} params.lines  - líneas visibles (loadLines(), sin is_general)
 * @param {Array} params.users  - usuarios de la empresa { user_id, first_name, last_name }
 * @param {object} params.raw   - filas crudas: { meetings, tasks, fixedMarks, cnp, pautas }
 * @param {number} params.year
 * @param {number} params.month - 1-indexado, mes visible
 * @returns {{ months: Array<{year:number, month:number}>, byLine: Array }}
 */
export function aggregateUsageMonitor({ lines, users, raw, year, month }) {
  const months = lastNMonths(year, month, 4) // [prev3, prev2, prev1, actual]
  const targetYm = ymKey(year, month)
  const normLines = normalizeLines(lines)
  const lineById = new Map(normLines.map((l) => [l.id, l]))

  const bucket = makeBucket()
  const punctuality = makePunctuality()

  const { meetings = [], tasks = [], fixedMarks = [], cnp = [], pautas = [] } = raw ?? {}

  // Reuniones: dos acciones distintas del mismo módulo — creada y marcada realizada.
  meetings.forEach((row) => {
    if (!lineById.has(row.line_id)) return
    const actor = normId(row.created_by)
    const createdYm = ymOf(row.created_at)
    if (createdYm) {
      bump(bucket, row.line_id, actor, ymKey(createdYm.year, createdYm.month), 'reuniones')
      if (row.starts_at) {
        const late = new Date(row.created_at) > new Date(row.starts_at)
        bumpPunctuality(
          punctuality,
          row.line_id,
          actor,
          ymKey(createdYm.year, createdYm.month),
          'reuniones',
          late,
        )
      }
    }
    if (row.status === 'realizada' && row.starts_at) {
      const realYm = ymOf(row.starts_at)
      if (realYm) bump(bucket, row.line_id, actor, ymKey(realYm.year, realYm.month), 'reuniones')
    }
  })

  // Tareas: team_id hace de line_id.
  tasks.forEach((row) => {
    const lineId = row.team_id
    if (!lineById.has(lineId)) return
    const actor = normId(row.created_by)
    const createdYm = ymOf(row.created_at)
    if (!createdYm) return
    const ym = ymKey(createdYm.year, createdYm.month)
    bump(bucket, lineId, actor, ym, 'tareas')
    if (row.due_date) {
      // Crear y completar el mismo día no es tardío — solo cuenta si se crea DESPUÉS
      // del vencimiento, cuando ya no hay margen real para trabajarla.
      const late = dateOnly(row.created_at) > row.due_date
      bumpPunctuality(punctuality, lineId, actor, ym, 'tareas', late)
    }
  })

  // Tareas Fijas: marked_by es uuid (el resto de "who" son text) — normId lo iguala.
  const weeksCache = new Map()
  fixedMarks.forEach((row) => {
    if (!lineById.has(row.line_id)) return
    if (row.status === 'na') return
    const actor = normId(row.marked_by)
    const ym = ymKey(row.period_year, row.period_month)
    bump(bucket, row.line_id, actor, ym, 'tareasFijas')

    const weeksKey = `${row.period_year}-${row.period_month}`
    if (!weeksCache.has(weeksKey))
      weeksCache.set(weeksKey, buildFixedWeeks(row.period_year, row.period_month))
    const weeks = weeksCache.get(weeksKey)
    const week = weeks.find((w) => w.n === row.period_week)
    if (week) {
      const deadline = taskDeadline(row.task_key, week, row.period_year, row.period_month)
      if (deadline.date) {
        const late = dateOnly(row.marked_at) > dateOnly(deadline.date)
        bumpPunctuality(punctuality, row.line_id, actor, ym, 'tareasFijas', late)
      }
    }
  })

  // CNP.
  cnp.forEach((row) => {
    if (!lineById.has(row.line_id)) return
    const actor = normId(row.created_by)
    const createdYm = ymOf(row.created_at)
    if (!createdYm) return
    bump(bucket, row.line_id, actor, ymKey(createdYm.year, createdYm.month), 'cnp')
  })

  // Pautas AV.
  pautas.forEach((row) => {
    if (!lineById.has(row.line_id)) return
    const actor = normId(row.created_by)
    const createdYm = ymOf(row.created_at)
    if (!createdYm) return
    bump(bucket, row.line_id, actor, ymKey(createdYm.year, createdYm.month), 'pautasAv')
  })

  // ── Ensamblar resultado por línea ─────────────────────────────────────────
  // `counts`/`total`/`baseline`/`peerAvg`/`trend`/`punctuality` miden TODO lo que se
  // cargó con el line_id de esta línea, sea quien sea que lo creó — no solo su
  // roster formal. Si dirección u otra persona ajena a la línea le pone contenido a
  // ese equipo, debe reflejarse en su uso igual que si lo hubiera cargado la jefa.
  const byLine = normLines.map((line) => {
    const lead = line.leadId ? { userId: line.leadId, name: userName(users, line.leadId) } : null
    const roster = rosterOf(line)
    const lineActors = actorsOfLine(bucket, line.id, roster)

    const counts = getTeamCounts(bucket, line.id, lineActors, targetYm)
    const total = Object.values(counts).reduce((a, b) => a + b, 0)

    const prevMonth = getTeamCounts(
      bucket,
      line.id,
      lineActors,
      ymKey(months[2].year, months[2].month),
    )

    // Baseline = promedio literal de los 3 meses previos (meses sin dato cuentan como 0).
    const baseline = zeroCounts()
    months.slice(0, 3).forEach(({ year: y, month: m }) => {
      const c = getTeamCounts(bucket, line.id, lineActors, ymKey(y, m))
      USAGE_MODULES.forEach((mod) => {
        baseline[mod.key] += c[mod.key] / 3
      })
    })
    const baselineTotal = Object.values(baseline).reduce((a, b) => a + b, 0)

    // Peer average = promedio de los OTROS equipos, este mes.
    const peers = normLines.filter((l) => l.id !== line.id && (l.leadId || l.memberIds.size > 0))
    const peerAvg = zeroCounts()
    if (peers.length > 0) {
      peers.forEach((peer) => {
        const peerActors = actorsOfLine(bucket, peer.id, rosterOf(peer))
        const c = getTeamCounts(bucket, peer.id, peerActors, targetYm)
        USAGE_MODULES.forEach((mod) => {
          peerAvg[mod.key] += c[mod.key] / peers.length
        })
      })
    }

    const { status, verdicts, reasons } = computeLineStatus({
      counts,
      baseline,
      peerAvg,
      total,
      baselineTotal,
    })

    const punct = getTeamPunctuality(punctuality, line.id, lineActors, targetYm)
    const punctuality_ =
      punct.total === 0
        ? 'sin_datos'
        : punct.late / punct.total > LATE_RATIO_THRESHOLD
          ? 'con_atraso'
          : 'al_dia'

    // Desglose propio de la jefa (solo lo que ELLA creó/marcó) — para la fila "Jefa"
    // del detalle, separado del total de equipo que ahora vive en `counts`/`total`.
    const leadCounts = lead ? getCounts(bucket, line.id, line.leadId, targetYm) : zeroCounts()
    const leadWithCounts = lead
      ? {
          ...lead,
          counts: leadCounts,
          total: Object.values(leadCounts).reduce((a, b) => a + b, 0),
        }
      : null

    // Miembros del equipo (todos los de la línea menos la jefa).
    const members = [...line.memberIds]
      .filter((id) => id !== line.leadId)
      .map((id) => {
        const c = getCounts(bucket, line.id, id, targetYm)
        return {
          userId: id,
          name: userName(users, id),
          isLead: false,
          counts: c,
          total: Object.values(c).reduce((a, b) => a + b, 0),
        }
      })
      .filter((m) => m.total > 0 || true) // se listan todos, no solo con actividad (para ver quién NO aporta)

    // Apoyo externo: actores con filas en esta línea que no son parte del roster.
    // Ya están incluidos en `counts`/`total` de arriba (vía lineActors) — este listado
    // es solo para mostrar QUIÉN de afuera aportó, no para excluirlos del conteo.
    const actorIdsInLine = [...(bucket.get(line.id)?.keys() ?? [])]
    const external = actorIdsInLine
      .filter((id) => !roster.has(id))
      .map((id) => {
        const c = getCounts(bucket, line.id, id, targetYm)
        return {
          userId: id,
          name: userName(users, id),
          counts: c,
          total: Object.values(c).reduce((a, b) => a + b, 0),
        }
      })
      .filter((e) => e.total > 0)

    // Tendencia: total de la línea por mes (roster + apoyo externo), ventana de 4 meses.
    const trend = months.map(({ year: y, month: m }) => {
      const c = getTeamCounts(bucket, line.id, lineActors, ymKey(y, m))
      return { year: y, month: m, total: Object.values(c).reduce((a, b) => a + b, 0) }
    })

    return {
      lineId: line.id,
      lineName: line.name,
      lineColor: line.color,
      lead: leadWithCounts,
      counts,
      total,
      baseline,
      peerAvg,
      prevMonth,
      status,
      reasons,
      verdicts,
      punctuality: punctuality_,
      punctualityBreakdown: punct.byModule,
      members,
      external,
      trend,
    }
  })

  return { months, byLine }
}

// ─── Semáforo ────────────────────────────────────────────────────────────────

/**
 * Veredicto de un módulo para una jefa: 'activo' | 'caida' | 'cero_propio' |
 * 'cero_vs_pares' | 'na'. Siempre compara cocientes, nunca un conteo crudo.
 */
export function moduleVerdict(actual, baseline, peerAvg) {
  if (actual === 0) {
    if (baseline >= 1) return 'cero_propio'
    if (peerAvg >= 1) return 'cero_vs_pares'
    return 'na'
  }
  if (baseline >= BASELINE_MIN && actual < baseline * ACTIVE_RATIO) return 'caida'
  return 'activo'
}

/**
 * Semáforo de una línea a partir de sus conteos, baseline (promedio 3m) y peerAvg.
 * @returns {{status: 'verde'|'amarillo'|'rojo', verdicts: object, reasons: string[]}}
 */
export function computeLineStatus({ counts, baseline, peerAvg, total, baselineTotal }) {
  const verdicts = {}
  const reasons = []
  USAGE_MODULES.forEach((mod) => {
    const v = moduleVerdict(counts[mod.key], baseline[mod.key], peerAvg[mod.key])
    verdicts[mod.key] = v
    if (v === 'caida') reasons.push(`${mod.label}: caída frente a su promedio`)
    if (v === 'cero_propio') reasons.push(`${mod.label}: en cero (antes lo usaba)`)
    if (v === 'cero_vs_pares') reasons.push(`${mod.label}: en cero (las otras líneas sí lo usan)`)
  })

  const applicable = Object.values(verdicts).filter((v) => v !== 'na')
  const zeroCount = Object.values(verdicts).filter(
    (v) => v === 'cero_propio' || v === 'cero_vs_pares',
  ).length
  const totalDropped = baselineTotal >= BASELINE_MIN && total < baselineTotal * RED_TOTAL_RATIO

  let status = 'verde'
  if ((applicable.length > 0 && zeroCount / applicable.length >= RED_ZERO_SHARE) || totalDropped) {
    status = 'rojo'
  } else if (
    Object.values(verdicts).some(
      (v) => v === 'caida' || v === 'cero_propio' || v === 'cero_vs_pares',
    )
  ) {
    status = 'amarillo'
  }

  return { status, verdicts, reasons }
}
