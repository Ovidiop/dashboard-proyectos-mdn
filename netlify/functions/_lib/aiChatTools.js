// Herramientas (function calling de Gemini) del chat IA para el CEO. Todas puras: operan
// en memoria sobre un `dataset` ya cargado por ai-chat.js (una sola carga por request, ver
// aiChatData.js). Reutilizan las mismas funciones de src/utils/ que usa el módulo Métricas,
// para que las cifras del chat sean idénticas a las que ve el CEO en /reportes.
import { calcTotal, sumScore } from '../../../src/utils/metricsScore.js'
import { calcFinanzas } from '../../../src/utils/metricsFinance.js'
import { aggregateMetricsDashboard } from '../../../src/utils/aggregateMetricsDashboard.js'
import {
  isClosed,
  isLate,
  isBlocked,
  isDragged,
  parseD,
  daysBetween,
  today,
} from '../../../src/components/tareas/constants.js'

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function round(n, decimals = 1) {
  if (n == null || Number.isNaN(n)) return null
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

/** "YYYY-MM-DD" en hora local, evitando el corrimiento de día de toISOString() (UTC). */
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "HH:MM" en hora local. */
function timeKey(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function normalize(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * Referencia por defecto: el último mes CERRADO (mes actual - 1, cae a diciembre del año
 * anterior en enero). Mismo criterio que netlify/functions/ceo-analysis.js — los meses en
 * curso pueden tener indicadores derivados (productividad, piezas, reuniones) desactualizados
 * porque solo se recalculan cuando alguien abre Operaciones.
 */
export function defaultPeriod(today = new Date()) {
  const currentMonth = today.getMonth() + 1
  const month = currentMonth === 1 ? 12 : currentMonth - 1
  const year = currentMonth === 1 ? today.getFullYear() - 1 : today.getFullYear()
  return { year, month }
}

/**
 * Resuelve un nombre de línea escrito en lenguaje natural contra el catálogo de líneas.
 * Estrategia: match exacto → prefijo → substring. Ambiguo o inexistente devuelve error
 * legible con el catálogo, para que el modelo repregunte en vez de alucinar un id.
 */
export function resolveLine(nombre, lines) {
  const q = normalize(nombre)
  if (!q) {
    return {
      error: `Falta indicar la línea. Líneas disponibles: ${lines.map((l) => l.name).join(', ')}.`,
    }
  }
  const exact = lines.filter((l) => normalize(l.name) === q)
  if (exact.length === 1) return { line: exact[0] }

  const prefix = lines.filter((l) => normalize(l.name).startsWith(q))
  if (prefix.length === 1) return { line: prefix[0] }

  const substr = lines.filter((l) => normalize(l.name).includes(q))
  if (substr.length === 1) return { line: substr[0] }

  const candidates = prefix.length > 1 ? prefix : substr.length > 1 ? substr : []
  if (candidates.length > 1) {
    return {
      error: `"${nombre}" es ambiguo, coincide con: ${candidates.map((l) => l.name).join(', ')}. Especifica cuál.`,
    }
  }
  return {
    error: `No se encontró la línea "${nombre}". Líneas disponibles: ${lines.map((l) => l.name).join(', ')}. Si "${nombre}" es un cliente y no una línea, usa ficha_cliente.`,
  }
}

/**
 * Resuelve un nombre de cliente/marca escrito en lenguaje natural contra la cartera de
 * la empresa. Mismo patrón exacto→prefijo→substring que resolveLine, pero primero busca
 * entre clientes activos y solo cae a los archivados si no hay match entre los activos
 * (una marca dada de baja puede seguir teniendo historial que consultar).
 */
export function resolveClient(nombre, clients) {
  const q = normalize(nombre)
  if (!q) return { error: 'Falta indicar el nombre del cliente.' }

  function matchIn(pool) {
    const exact = pool.filter((c) => normalize(c.name) === q)
    if (exact.length === 1) return { client: exact[0] }
    const prefix = pool.filter((c) => normalize(c.name).startsWith(q))
    if (prefix.length === 1) return { client: prefix[0] }
    const substr = pool.filter((c) => normalize(c.name).includes(q))
    if (substr.length === 1) return { client: substr[0] }
    const candidates = prefix.length > 1 ? prefix : substr.length > 1 ? substr : []
    if (candidates.length > 1) {
      return {
        ambiguous: `"${nombre}" es ambiguo, coincide con: ${candidates.map((c) => c.name).join(', ')}. Especifica cuál.`,
      }
    }
    return null
  }

  const active = clients.filter((c) => !c.deleted_at)
  const archived = clients.filter((c) => c.deleted_at)

  const activeMatch = matchIn(active)
  if (activeMatch?.ambiguous) return { error: activeMatch.ambiguous }
  if (activeMatch) return activeMatch

  const archivedMatch = matchIn(archived)
  if (archivedMatch?.ambiguous) return { error: archivedMatch.ambiguous }
  if (archivedMatch) return archivedMatch

  return { error: `No se encontró el cliente "${nombre}".` }
}

/**
 * Valida `year` contra el rango de años que aiChatData.js realmente cargó (ver
 * `dataset.availableYears`). Sin esto, un año fuera de rango se ve idéntico a un año sin
 * actividad ("no hay reporte") y el modelo lo reporta como dato real.
 */
function yearRangeError(year, dataset) {
  const range = dataset.availableYears
  if (!range) return null
  if (year < range.min || year > range.max) {
    return `Solo tengo datos cargados de ${range.min} y ${range.max}. No tengo información de ${year}.`
  }
  return null
}

function reportsForLine(dataset, lineId) {
  return dataset.reports.filter((r) => r.line_id === lineId)
}

function reportOf(dataset, lineId, year, month) {
  return (
    dataset.reports.find((r) => r.line_id === lineId && r.year === year && r.month === month) ??
    null
  )
}

function prevReportOf(dataset, lineId, year, month) {
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  return reportOf(dataset, lineId, prevYear, prevMonth)
}

/** Desglose de los 6 indicadores ponderados (peso 20/20/20/10/20/10) de un mes de una línea. */
export function scoreDeLinea(args, dataset) {
  const { line, error } = resolveLine(args.linea, dataset.lines)
  if (error) return { error }

  const { year, month } =
    args.mes && args.anio ? { year: args.anio, month: args.mes } : defaultPeriod()

  const rangeError = yearRangeError(year, dataset)
  if (rangeError) return { error: rangeError }

  const report = reportOf(dataset, line.id, year, month)
  if (!report || report.data?.incompleto) {
    return {
      linea: line.name,
      periodo: `${MONTH_NAMES[month - 1]} ${year}`,
      error: 'No hay reporte cerrado para ese mes.',
    }
  }
  const prev = prevReportOf(dataset, line.id, year, month)
  const parciales = calcTotal(report.data, prev?.data ?? null)
  const pesos = {
    reuniones: 20,
    productividad: 20,
    crecimiento: 20,
    solicitudes: 10,
    pautas: 20,
    piezas: 10,
  }

  return {
    linea: line.name,
    periodo: `${MONTH_NAMES[month - 1]} ${year}`,
    score_total: round(sumScore(parciales), 1),
    desglose_indicadores: Object.entries(parciales).map(([indicador, obtenido]) => ({
      indicador,
      obtenido: round(obtenido, 1),
      maximo: pesos[indicador],
    })),
    es_mes_en_curso: month === new Date().getMonth() + 1 && year === new Date().getFullYear(),
  }
}

/** Ranking de líneas de un mes (por defecto el último cerrado), con promedios y cobertura. */
export function rankingLineas(args, dataset) {
  const { year, month } =
    args.mes && args.anio ? { year: args.anio, month: args.mes } : defaultPeriod()

  const rangeError = yearRangeError(year, dataset)
  if (rangeError) return { error: rangeError }

  const yearReports = dataset.reports.filter((r) => r.year === year)
  const agg = aggregateMetricsDashboard(
    dataset.lines,
    yearReports,
    year,
    calcTotal,
    sumScore,
    calcFinanzas,
    month,
  )

  return {
    periodo: `${MONTH_NAMES[month - 1]} ${year}`,
    ranking: agg.ranking.map((r) => ({ linea: r.line.name, score: round(r.score, 1) })),
    promedio_mes: agg.promMesActual != null ? round(agg.promMesActual, 1) : null,
    promedio_anual: round(agg.promAnual, 1),
    lider: agg.lider ? agg.lider.line.name : null,
    cobertura_reportes_pct: round(agg.cobertura),
  }
}

/** Evolución del score de una línea a lo largo de un año (mes o null si no hay reporte). */
export function evolucionLinea(args, dataset) {
  const { line, error } = resolveLine(args.linea, dataset.lines)
  if (error) return { error }

  const year = args.anio ?? new Date().getFullYear()
  const rangeError = yearRangeError(year, dataset)
  if (rangeError) return { error: rangeError }

  const yearReports = dataset.reports.filter((r) => r.year === year)
  const agg = aggregateMetricsDashboard(
    dataset.lines,
    yearReports,
    year,
    calcTotal,
    sumScore,
    calcFinanzas,
  )

  return {
    linea: line.name,
    anio: year,
    meses: (agg.matrix[line.id] ?? Array(12).fill(null)).map((score, i) => ({
      mes: MONTH_NAMES[i],
      score: score != null ? round(score, 1) : null,
    })),
  }
}

/** Finanzas (ingresos/egresos/diferencia) de un mes, por línea o de toda la empresa. */
export function finanzas(args, dataset) {
  const { year, month } =
    args.mes && args.anio ? { year: args.anio, month: args.mes } : defaultPeriod()

  const rangeError = yearRangeError(year, dataset)
  if (rangeError) return { error: rangeError }

  if (args.linea) {
    const { line, error } = resolveLine(args.linea, dataset.lines)
    if (error) return { error }
    const report = reportOf(dataset, line.id, year, month)
    if (!report) {
      return {
        periodo: `${MONTH_NAMES[month - 1]} ${year}`,
        linea: line.name,
        error: 'No hay reporte cargado para ese mes.',
      }
    }
    const f = calcFinanzas(report.data)
    return {
      periodo: `${MONTH_NAMES[month - 1]} ${year}`,
      linea: line.name,
      ingresos: round(f.totIngresos, 2),
      egresos: round(f.totEgresos, 2),
      diferencia: round(f.diferencia, 2),
    }
  }

  // Líneas sin reporte para el mes van con `sin_reporte: true` (en vez de ceros) para que
  // el modelo no las confunda con facturación real de $0, y quedan fuera de total_empresa.
  const porLinea = dataset.lines.map((line) => {
    const report = reportOf(dataset, line.id, year, month)
    if (!report) return { linea: line.name, sin_reporte: true }
    const f = calcFinanzas(report.data)
    return {
      linea: line.name,
      ingresos: round(f.totIngresos, 2),
      egresos: round(f.totEgresos, 2),
      diferencia: round(f.diferencia, 2),
    }
  })
  const conReporte = porLinea.filter((l) => !l.sin_reporte)
  const totales = conReporte.reduce(
    (acc, l) => ({
      ingresos: acc.ingresos + l.ingresos,
      egresos: acc.egresos + l.egresos,
      diferencia: acc.diferencia + l.diferencia,
    }),
    { ingresos: 0, egresos: 0, diferencia: 0 },
  )

  return {
    periodo: `${MONTH_NAMES[month - 1]} ${year}`,
    por_linea: porLinea,
    total_empresa: {
      ingresos: round(totales.ingresos, 2),
      egresos: round(totales.egresos, 2),
      diferencia: round(totales.diferencia, 2),
    },
    ...(conReporte.length < porLinea.length
      ? {
          nota: 'total_empresa no incluye las líneas marcadas sin_reporte (no tienen reporte cargado para este mes).',
        }
      : {}),
  }
}

/**
 * Compara el score entre dos meses (misma línea, o toda la empresa si no se indica).
 * No incluye cifras financieras — ver nota "finanzas deshabilitada" junto a TOOL_DECLARATIONS.
 */
export function compararMeses(args, dataset) {
  const year = args.anio ?? new Date().getFullYear()
  const rangeError = yearRangeError(year, dataset)
  if (rangeError) return { error: rangeError }

  let line = null
  if (args.linea) {
    const resolved = resolveLine(args.linea, dataset.lines)
    if (resolved.error) return { error: resolved.error }
    line = resolved.line
  }

  function snapshot(month) {
    if (line) {
      const report = reportOf(dataset, line.id, year, month)
      if (!report || report.data?.incompleto) return { score: null }
      const prev = prevReportOf(dataset, line.id, year, month)
      const score = sumScore(calcTotal(report.data, prev?.data ?? null))
      return { score: round(score, 1) }
    }
    const yearReports = dataset.reports.filter((r) => r.year === year)
    const agg = aggregateMetricsDashboard(
      dataset.lines,
      yearReports,
      year,
      calcTotal,
      sumScore,
      calcFinanzas,
      month,
    )
    return { score: agg.promMesActual != null ? round(agg.promMesActual, 1) : null }
  }

  const a = snapshot(args.mes_a)
  const b = snapshot(args.mes_b)

  return {
    linea: line ? line.name : 'Toda la empresa',
    [MONTH_NAMES[args.mes_a - 1]]: a,
    [MONTH_NAMES[args.mes_b - 1]]: b,
    delta_score: a.score != null && b.score != null ? round(b.score - a.score, 1) : null,
  }
}

export function listarLineas(_args, dataset) {
  return { lineas: dataset.lines.map((l) => l.name) }
}

function userName(userId, dataset) {
  const u = (dataset.users ?? []).find((x) => x.user_id === userId)
  return u ? `${u.first_name} ${u.last_name}`.trim() : null
}

function lineName(lineId, dataset) {
  return dataset.lines.find((l) => l.id === lineId)?.name ?? null
}

/** Panorama operativo de tareas: activas, atrasadas, bloqueadas, arrastradas, por estado. */
export function resumenTareas(args, dataset) {
  const tasks = dataset.tasks ?? []
  let scoped = tasks
  let linea = null
  if (args.linea) {
    const resolved = resolveLine(args.linea, dataset.lines)
    if (resolved.error) return { error: resolved.error }
    linea = resolved.line
    scoped = tasks.filter((t) => t.team_id === linea.id)
  }

  const active = scoped.filter((t) => !isClosed(t))
  const late = active.filter(isLate)
  const blocked = active.filter(isBlocked)
  const dragged = active.filter(isDragged)

  const byStatus = {}
  for (const t of active) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1

  const closedWithDates = scoped.filter((t) => isClosed(t) && t.due_date && t.closed_date)
  const onTime = closedWithDates.filter(
    (t) => daysBetween(parseD(t.due_date), parseD(t.closed_date)) <= 0,
  )
  const porcentajeATiempo = closedWithDates.length
    ? round((onTime.length / closedWithDates.length) * 100, 0)
    : null

  return {
    linea: linea ? linea.name : 'Toda la empresa',
    tareas_activas: active.length,
    atrasadas: late.length,
    bloqueadas: blocked.length,
    arrastradas_de_meses_anteriores: dragged.length,
    por_estado: byStatus,
    porcentaje_entregado_a_tiempo: porcentajeATiempo,
  }
}

/** Lista de tareas críticas (bloqueadas o atrasadas) con su motivo/atraso, línea y responsables. */
export function tareasCriticas(args, dataset) {
  const tipo = args.tipo === 'atrasadas' ? 'atrasadas' : 'bloqueadas'
  const tasks = (dataset.tasks ?? []).filter((t) => !isClosed(t))
  const filtered = tipo === 'bloqueadas' ? tasks.filter(isBlocked) : tasks.filter(isLate)

  const items = filtered.slice(0, 30).map((t) => ({
    tarea: t.description ?? '(sin descripción)',
    linea: lineName(t.team_id, dataset),
    responsables: (t.assignee_ids ?? []).map((id) => userName(id, dataset)).filter(Boolean),
    ...(tipo === 'bloqueadas'
      ? { motivo: t.blocked_reason ?? 'Sin motivo registrado' }
      : { dias_de_atraso: t.due_date ? daysBetween(parseD(t.due_date), today()) : null }),
  }))

  return {
    tipo,
    total: filtered.length,
    mostrando: items.length,
    tareas: items,
  }
}

function currentPeriod() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

function monthYearOfDate(d) {
  if (!d || Number.isNaN(d.getTime())) return null
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/** Reuniones (agendadas/realizadas/canceladas) de un mes, de toda la empresa o de una línea. */
export function resumenReuniones(args, dataset) {
  const meetings = dataset.meetings ?? []
  let scoped = meetings
  let linea = null
  if (args.linea) {
    const resolved = resolveLine(args.linea, dataset.lines)
    if (resolved.error) return { error: resolved.error }
    linea = resolved.line
    scoped = scoped.filter((m) => m.line_id === linea.id)
  }

  const { year, month } =
    args.mes && args.anio ? { year: args.anio, month: args.mes } : currentPeriod()
  const inPeriod = scoped.filter((m) => {
    const my = monthYearOfDate(new Date(m.starts_at))
    return my && my.year === year && my.month === month
  })

  const programadas = inPeriod.filter((m) => m.status === 'programada')
  const realizadas = inPeriod.filter((m) => m.status === 'realizada')
  const canceladas = inPeriod.filter((m) => m.status === 'cancelada')
  const now = new Date()
  const vencidasSinMarcar = programadas.filter((m) => new Date(m.starts_at) < now)

  return {
    linea: linea ? linea.name : 'Toda la empresa',
    periodo: `${MONTH_NAMES[month - 1]} ${year}`,
    total: inPeriod.length,
    programadas: programadas.length,
    realizadas: realizadas.length,
    canceladas: canceladas.length,
    vencidas_sin_marcar: vencidasSinMarcar.length,
  }
}

/**
 * Próximas reuniones programadas donde el usuario que pregunta es participante
 * (attendee_ids incluye dataset.callerUserId, seteado por ai-chat.js con el caller del JWT).
 */
export function misReuniones(args, dataset) {
  const callerId = dataset.callerUserId
  if (!callerId) return { error: 'No se pudo identificar tu usuario para buscar tus reuniones.' }

  const meetings = dataset.meetings ?? []
  const now = new Date()
  const limite = Math.min(Math.max(Number(args.limite) || 10, 1), 30)

  const proximas = meetings
    .filter((m) => (m.attendee_ids ?? []).includes(callerId))
    .filter((m) => m.status === 'programada' && new Date(m.starts_at) >= now)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    .slice(0, limite)

  return {
    total: proximas.length,
    reuniones: proximas.map((m) => {
      const d = new Date(m.starts_at)
      return {
        titulo: m.title ?? '(sin título)',
        cliente: (m.client_names ?? []).filter(Boolean).join(', ') || m.client_name || null,
        linea: lineName(m.line_id, dataset),
        fecha: dateKey(d),
        hora: timeKey(d),
        modalidad: m.modality ?? null,
        ubicacion: m.modality === 'videollamada' ? (m.meeting_url ?? null) : (m.location ?? null),
      }
    }),
  }
}

/** Pautas audiovisuales de un mes (por estado), piezas grabadas/editadas, de toda la empresa o de una línea. */
export function resumenPautas(args, dataset) {
  const pautas = dataset.pautas ?? []
  let scoped = pautas
  let linea = null
  if (args.linea) {
    const resolved = resolveLine(args.linea, dataset.lines)
    if (resolved.error) return { error: resolved.error }
    linea = resolved.line
    scoped = scoped.filter((p) => p.line_id === linea.id)
  }

  const { year, month } =
    args.mes && args.anio ? { year: args.anio, month: args.mes } : currentPeriod()
  const sinFecha = scoped.filter((p) => !p.pauta_date)
  const inPeriod = scoped.filter((p) => {
    const my = monthYearOfDate(parseD(p.pauta_date))
    return my && my.year === year && my.month === month
  })

  const byStatus = {}
  for (const p of inPeriod) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1

  const realizadas = inPeriod.filter((p) => p.status === 'realizada')
  const piezasTotales = realizadas.reduce((a, p) => a + (Number(p.piezas_totales) || 0), 0)
  const piezasEditadas = realizadas.reduce((a, p) => a + (Number(p.piezas_editadas) || 0), 0)

  return {
    linea: linea ? linea.name : 'Toda la empresa',
    periodo: `${MONTH_NAMES[month - 1]} ${year}`,
    por_estado: byStatus,
    solicitudes_sin_agendar: sinFecha.filter((p) => p.status === 'solicitada').length,
    piezas_totales: piezasTotales,
    piezas_editadas: piezasEditadas,
  }
}

/**
 * Agenda de pautas audiovisuales de un día concreto (por defecto hoy), con hora, cliente
 * y estado — para preguntas operativas del día ("¿cuántas pautas hay hoy?", "¿qué hay
 * agendado mañana?"). Solo 'programada'/'realizada' con fecha aparecen en el calendario
 * (mismo criterio que AvCalendar.jsx/DayPautasModal.jsx en el frontend).
 */
export function pautasDelDia(args, dataset) {
  const pautas = dataset.pautas ?? []
  let scoped = pautas
  let linea = null
  if (args.linea) {
    const resolved = resolveLine(args.linea, dataset.lines)
    if (resolved.error) return { error: resolved.error }
    linea = resolved.line
    scoped = scoped.filter((p) => p.line_id === linea.id)
  }

  const fecha = args.fecha || dateKey(today())
  const delDia = scoped
    .filter(
      (p) => p.pauta_date === fecha && (p.status === 'programada' || p.status === 'realizada'),
    )
    .sort((a, b) => (a.salida ?? '').localeCompare(b.salida ?? ''))

  return {
    linea: linea ? linea.name : 'Toda la empresa',
    fecha,
    total: delDia.length,
    pautas: delDia.map((p) => ({
      cliente: p.client_name ?? '(sin cliente)',
      linea: lineName(p.line_id, dataset),
      hora: p.salida ? `${p.salida}${p.llegada ? ` - ${p.llegada}` : ''}` : null,
      estado: p.status,
    })),
  }
}

const AV_DEPARTMENT_ID = 2

function fullNameOf(u) {
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
}

/**
 * Resuelve un nombre de persona escrito en lenguaje natural contra los empleados de
 * Audiovisual (department_id === 2, activos) — quienes pueden aparecer en
 * av_pautas.recurso_ids. Mismo patrón exacto→prefijo→substring que resolveLine.
 */
export function resolveAudiovisualEmployee(nombre, users) {
  const candidates = (users ?? []).filter(
    (u) => u.department_id === AV_DEPARTMENT_ID && !u.deleted_at,
  )
  const catalogo = candidates.map(fullNameOf).join(', ') || '(ninguno)'
  const q = normalize(nombre)
  if (!q) {
    return {
      error: `Falta indicar el nombre de la persona. Empleados de Audiovisual: ${catalogo}.`,
    }
  }

  const exact = candidates.filter((u) => normalize(fullNameOf(u)) === q)
  if (exact.length === 1) return { user: exact[0] }

  const prefix = candidates.filter((u) => normalize(fullNameOf(u)).startsWith(q))
  if (prefix.length === 1) return { user: prefix[0] }

  const substr = candidates.filter((u) => normalize(fullNameOf(u)).includes(q))
  if (substr.length === 1) return { user: substr[0] }

  const ambiguous = prefix.length > 1 ? prefix : substr.length > 1 ? substr : []
  if (ambiguous.length > 1) {
    return {
      error: `"${nombre}" es ambiguo, coincide con: ${ambiguous.map(fullNameOf).join(', ')}. Especifica cuál.`,
    }
  }
  return {
    error: `No se encontró a "${nombre}" en Audiovisual. Empleados de Audiovisual: ${catalogo}.`,
  }
}

/**
 * Días de un mes en que un recurso de Audiovisual (quien sale a grabar, av_pautas.recurso_ids)
 * tuvo "minimo" o más pautas en un mismo día — para "¿cuántos días tuvo Fulana más de N pautas
 * en tal mes?" o "¿cuándo estuvo más cargada?". Mismo criterio que el recuadro
 * "Recomendaciones" del Home (avWorkloadSnapshot.js): 'realizada' para días ya pasados,
 * 'realizada'/'programada' para hoy y días futuros — así una pauta agendada para más tarde
 * hoy o para la semana que viene no se cuenta como si ya hubiera ocurrido.
 */
export function diasCargaAlta(args, dataset) {
  const resolved = resolveAudiovisualEmployee(args.persona, dataset.users)
  if (resolved.error) return { error: resolved.error }
  const persona = resolved.user

  // A diferencia de las tools de métricas, av_pautas no está acotada a availableYears (ver
  // aiChatData.js): se carga completa, así que no hay rango de años que validar acá.
  const { year, month } =
    args.mes && args.anio ? { year: args.anio, month: args.mes } : defaultPeriod()
  const minimo = Number.isInteger(args.minimo) && args.minimo > 0 ? args.minimo : 3
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
  const hoyKey = dateKey(today())

  const inMonth = (dataset.pautas ?? []).filter((p) => {
    if (!p.pauta_date || !p.pauta_date.startsWith(`${monthPrefix}-`)) return false
    if (!(p.recurso_ids ?? []).includes(persona.user_id)) return false
    const isPast = p.pauta_date < hoyKey
    return isPast ? p.status === 'realizada' : p.status === 'realizada' || p.status === 'programada'
  })

  const byDate = new Map()
  for (const p of inMonth) {
    if (!byDate.has(p.pauta_date)) byDate.set(p.pauta_date, [])
    byDate.get(p.pauta_date).push({
      cliente: p.client_name ?? '(sin cliente)',
      tema: p.tema ?? null,
      estado: p.status,
    })
  }

  const dias = [...byDate.entries()]
    .filter(([, items]) => items.length >= minimo)
    .map(([fecha, items]) => ({ fecha, cantidad: items.length, pautas: items }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  return {
    persona: fullNameOf(persona) || persona.user_id,
    periodo: `${MONTH_NAMES[month - 1]} ${year}`,
    minimo,
    total_dias: dias.length,
    dias,
  }
}

function positionNameOf(user, dataset) {
  return dataset.positions.find((p) => p.position_id === user.position_id)?.position_name ?? null
}

function departmentNameOf(user, dataset) {
  return (
    dataset.departments.find((d) => d.department_id === user.department_id)?.department_name ?? null
  )
}

/**
 * Líneas a las que pertenece un empleado, con "(jefa)" si es la líder de esa línea. Si no
 * tiene fila en metric_line_members en ninguna línea real (is_general/is_management
 * excluidas: esas dos no tienen filas, su membresía es implícita), es del pool
 * "Independiente" — o "Alta Gerencia" si su access_level es 4+ — mismo criterio que
 * crossLineUserIds en src/utils/lineFilters.js.
 */
function linesOfUser(userId, dataset) {
  const realLines = dataset.linesAll.filter((l) => !l.is_general && !l.is_management)
  const memberLines = realLines.filter((l) => (l.member_user_ids ?? []).includes(userId))
  if (memberLines.length) {
    return memberLines.map((l) => {
      const isLead = dataset.lineMembers.some(
        (m) => m.line_id === l.id && m.user_id === userId && m.is_lead,
      )
      return isLead ? `${l.name} (jefa)` : l.name
    })
  }
  const user = dataset.users.find((u) => u.user_id === userId)
  return (user?.access_level ?? 0) >= 4 ? ['Alta Gerencia'] : ['Independiente']
}

function employeeCard(user, dataset) {
  return {
    nombre: fullNameOf(user),
    cargo: positionNameOf(user, dataset),
    departamento: departmentNameOf(user, dataset),
    lineas: linesOfUser(user.user_id, dataset),
  }
}

/** Catálogo de cargos con su departamento y cuántos empleados activos tiene cada uno. */
export function listarCargos(_args, dataset) {
  const counts = new Map()
  for (const u of dataset.users) counts.set(u.position_id, (counts.get(u.position_id) ?? 0) + 1)
  const cargos = dataset.positions
    .map((p) => ({
      cargo: p.position_name,
      departamento:
        dataset.departments.find((d) => d.department_id === p.department_id)?.department_name ??
        null,
      empleados: counts.get(p.position_id) ?? 0,
    }))
    .sort((a, b) => b.empleados - a.empleados || a.cargo.localeCompare(b.cargo))
  return { cargos }
}

/** Directorio de empleados activos, filtrable por cargo (substring), departamento y línea. */
export function buscarEmpleados(args, dataset) {
  let scoped = dataset.users

  if (args.linea) {
    const { line, error } = resolveLine(args.linea, dataset.lines)
    if (error) return { error }
    const ids = new Set(line.member_user_ids ?? [])
    scoped = scoped.filter((u) => ids.has(u.user_id))
  }

  if (args.departamento) {
    const q = normalize(args.departamento)
    const deptIds = new Set(
      dataset.departments
        .filter((d) => normalize(d.department_name).includes(q))
        .map((d) => d.department_id),
    )
    if (!deptIds.size) {
      return {
        error: `No se encontró el departamento "${args.departamento}". Departamentos: ${dataset.departments.map((d) => d.department_name).join(', ')}.`,
      }
    }
    scoped = scoped.filter((u) => deptIds.has(u.department_id))
  }

  if (args.cargo) {
    const q = normalize(args.cargo)
    const posIds = new Set(
      dataset.positions
        .filter((p) => normalize(p.position_name).includes(q))
        .map((p) => p.position_id),
    )
    if (!posIds.size) {
      return {
        error: `No se encontró el cargo "${args.cargo}". Cargos existentes: ${dataset.positions.map((p) => p.position_name).join(', ')}.`,
      }
    }
    scoped = scoped.filter((u) => posIds.has(u.position_id))
  }

  if (!scoped.length) {
    return { error: 'No se encontraron empleados con esos filtros.' }
  }

  const items = scoped.slice(0, 60).map((u) => employeeCard(u, dataset))
  return { total: scoped.length, mostrando: items.length, empleados: items }
}

function clientTeamMember(userId, dataset) {
  if (!userId) return null
  const user = dataset.users.find((u) => u.user_id === userId)
  if (!user) return null
  return { nombre: fullNameOf(user), cargo: positionNameOf(user, dataset) }
}

/**
 * Ficha de un cliente/marca: línea que lo lleva (y su jefa), equipo asignado (social
 * media, diseñador, audiovisual, apoyo), datos comerciales y estado del contrato.
 */
export function fichaCliente(args, dataset) {
  const { client, error } = resolveClient(args.cliente, dataset.clients)
  if (error) return { error }

  const line = client.line_id ? dataset.linesAll.find((l) => l.id === client.line_id) : null
  const jefaMember = line
    ? dataset.lineMembers.find((m) => m.line_id === line.id && m.is_lead)
    : null
  const jefaUser = jefaMember ? dataset.users.find((u) => u.user_id === jefaMember.user_id) : null

  const pendingLine = client.pending_line_id
    ? dataset.linesAll.find((l) => l.id === client.pending_line_id)
    : null

  return {
    cliente: client.name,
    linea: line ? line.name : null,
    jefa_de_linea: jefaUser ? fullNameOf(jefaUser) : null,
    equipo: {
      social_media: clientTeamMember(client.social_manager_id, dataset),
      disenador: clientTeamMember(client.designer_id, dataset),
      audiovisual: (client.audiovisual_ids ?? [])
        .map((id) => clientTeamMember(id, dataset))
        .filter(Boolean),
      apoyo: (client.apoyo_ids ?? []).map((id) => clientTeamMember(id, dataset)).filter(Boolean),
    },
    cliente_desde: client.mdn_since ?? null,
    aniversario: client.anniversary_date ?? null,
    dia_de_pago: client.payment_day ?? null,
    fee_mensual: client.monthly_fee != null ? round(Number(client.monthly_fee), 2) : null,
    presupuesto_pauta_mensual:
      client.campaign_budget != null ? round(Number(client.campaign_budget), 2) : null,
    rif: client.rif ?? null,
    website: client.website ?? null,
    redes: client.social_links ?? [],
    activo: !client.deleted_at,
    contrato_hasta: client.contract_end ?? null,
    motivo_fin_contrato: client.contract_end_reason ?? null,
    cambio_de_linea_pendiente: pendingLine
      ? { linea_nueva: pendingLine.name, desde: client.line_change_at ?? null }
      : null,
  }
}

/** Cartera de clientes de una línea: cuántos y cuáles, con su estado. */
export function clientesDeLinea(args, dataset) {
  const { line, error } = resolveLine(args.linea, dataset.lines)
  if (error) return { error }

  let clients = dataset.clients.filter((c) => c.line_id === line.id)
  if (!args.incluir_archivados) clients = clients.filter((c) => !c.deleted_at)

  return {
    linea: line.name,
    total: clients.length,
    clientes: clients.map((c) => ({
      nombre: c.name,
      estado: c.deleted_at ? 'archivado' : 'activo',
    })),
  }
}

/**
 * Suma de montos de pauta pagada (paid_campaigns) de un cliente cuyo start_date cae en el
 * mes dado. Reimplementación mínima de spentByClientInPeriod
 * (src/components/ads/campaignSpendApi.js, fuente de verdad) — no se importa ese módulo
 * porque arrastra src/supabase.js (import.meta.env) al runtime de Netlify.
 */
function spentInPeriod(campaigns, clientId, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return campaigns
    .filter((a) => a.client_id === clientId && a.start_date?.startsWith(prefix))
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
}

/** Inversión en pauta pagada de un mes: de un cliente concreto, o ranking de toda la cartera. */
export function inversionAds(args, dataset) {
  const { year, month } =
    args.mes && args.anio ? { year: args.anio, month: args.mes } : currentPeriod()
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  if (args.cliente) {
    const { client, error } = resolveClient(args.cliente, dataset.clients)
    if (error) return { error }
    const campaigns = dataset.campaigns.filter(
      (a) => a.client_id === client.id && a.start_date?.startsWith(prefix),
    )
    return {
      cliente: client.name,
      periodo: `${MONTH_NAMES[month - 1]} ${year}`,
      total_invertido: round(spentInPeriod(dataset.campaigns, client.id, year, month), 2),
      presupuesto_mensual:
        client.campaign_budget != null ? round(Number(client.campaign_budget), 2) : null,
      campanas: campaigns.map((a) => ({
        nombre: a.name,
        monto: round(Number(a.amount) || 0, 2),
        inicio: a.start_date,
        fin: a.end_date,
        estado: a.status,
        responsable: userName(a.responsable_id, dataset),
      })),
    }
  }

  const byClient = new Map()
  for (const a of dataset.campaigns) {
    if (!a.start_date?.startsWith(prefix)) continue
    byClient.set(a.client_id, (byClient.get(a.client_id) ?? 0) + (Number(a.amount) || 0))
  }
  const ranking = [...byClient.entries()]
    .map(([clientId, monto]) => ({
      cliente: dataset.clients.find((c) => c.id === clientId)?.name ?? '(cliente eliminado)',
      monto: round(monto, 2),
    }))
    .sort((a, b) => b.monto - a.monto)

  return {
    periodo: `${MONTH_NAMES[month - 1]} ${year}`,
    ranking,
    total_empresa: round(
      ranking.reduce((sum, r) => sum + r.monto, 0),
      2,
    ),
  }
}

const monthProp = {
  type: 'integer',
  description: 'Mes 1-12. Si se omite junto con anio, se usa el último mes cerrado.',
}
const yearProp = {
  type: 'integer',
  description: 'Año (ej. 2026). Si se omite junto con mes, se usa el último mes cerrado.',
}
const lineaProp = {
  type: 'string',
  description: 'Nombre de la línea operativa tal como lo diría el usuario.',
}
const personaProp = {
  type: 'string',
  description:
    'Nombre del empleado de Audiovisual (quien graba/sale a la pauta), tal como lo diría el usuario.',
}
const minimoProp = {
  type: 'integer',
  description:
    'Cantidad mínima de pautas en un mismo día para contar ese día (ej. "más de 2" → minimo: 3, "3 o más" → minimo: 3). Por defecto 3.',
}
const cargoProp = {
  type: 'string',
  description:
    'Cargo/puesto tal como lo diría el usuario (ej. "social", "community", "diseñador"). Hace match parcial contra el catálogo real de cargos.',
}
const departamentoProp = {
  type: 'string',
  description: 'Departamento tal como lo diría el usuario (ej. "Redes", "Diseño", "Audiovisual").',
}
const clienteProp = {
  type: 'string',
  description: 'Nombre del cliente/marca tal como lo diría el usuario.',
}

export const TOOL_DECLARATIONS = [
  {
    name: 'listar_lineas',
    description:
      'Lista las líneas operativas de la empresa. Útil para saber qué nombres existen antes de preguntar por una en concreto.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'score_de_linea',
    description:
      'Score 0-100 de una línea operativa en un mes, con el desglose de los 6 indicadores que lo componen (reuniones, productividad, crecimiento, solicitudes, pautas, piezas). Usar para explicar por qué subió o bajó un score.',
    parameters: {
      type: 'object',
      properties: { linea: lineaProp, mes: monthProp, anio: yearProp },
      required: ['linea'],
      additionalProperties: false,
    },
  },
  {
    name: 'ranking_lineas',
    description:
      'Ranking de todas las líneas operativas en un mes, con el promedio de la empresa, la línea líder y la cobertura de reportes cargados.',
    parameters: {
      type: 'object',
      properties: { mes: monthProp, anio: yearProp },
      additionalProperties: false,
    },
  },
  {
    name: 'evolucion_linea',
    description: 'Evolución mes a mes del score de una línea a lo largo de un año.',
    parameters: {
      type: 'object',
      properties: { linea: lineaProp, anio: yearProp },
      required: ['linea'],
      additionalProperties: false,
    },
  },
  {
    name: 'finanzas',
    description:
      'Ingresos, egresos y diferencia (ganancia o pérdida) de una línea en un mes, tal como están cargados en su reporte mensual. Es la ÚNICA fuente de finanzas permitida: no extrapoles, proyectes ni opines sobre rentabilidad más allá de estos 3 números por línea/mes.',
    parameters: {
      type: 'object',
      properties: {
        mes: monthProp,
        anio: yearProp,
        linea: {
          ...lineaProp,
          description: 'Opcional: si se omite, devuelve el total de la empresa por línea.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'resumen_tareas',
    description:
      'Panorama operativo de tareas: cuántas activas, atrasadas, bloqueadas y arrastradas de meses anteriores, desglose por estado, y el % de tareas entregadas a tiempo. De toda la empresa o de una línea si se especifica.',
    parameters: {
      type: 'object',
      properties: {
        linea: { ...lineaProp, description: 'Opcional: limita el resumen a una línea.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'tareas_criticas',
    description:
      'Lista de tareas activas bloqueadas (con su motivo) o atrasadas (con los días de atraso), con la línea y los responsables de cada una. Úsala para dar detalle después de resumen_tareas, o cuando pregunten qué está trabado.',
    parameters: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: ['bloqueadas', 'atrasadas'],
          description: 'Qué tipo de tareas críticas listar.',
        },
      },
      required: ['tipo'],
      additionalProperties: false,
    },
  },
  {
    name: 'comparar_meses',
    description:
      'Compara el score entre dos meses del mismo año, para una línea o para toda la empresa.',
    parameters: {
      type: 'object',
      properties: {
        mes_a: { ...monthProp, description: 'Mes 1-12 a comparar (el más antiguo).' },
        mes_b: { ...monthProp, description: 'Mes 1-12 a comparar (el más reciente).' },
        anio: yearProp,
        linea: lineaProp,
      },
      required: ['mes_a', 'mes_b'],
      additionalProperties: false,
    },
  },
  {
    name: 'resumen_reuniones',
    description:
      'Reuniones de un mes: cuántas programadas, realizadas, canceladas y cuántas ya vencieron sin marcarse. De toda la empresa o de una línea si se especifica. Sin mes/año, usa el mes actual (no el último cerrado).',
    parameters: {
      type: 'object',
      properties: {
        linea: { ...lineaProp, description: 'Opcional: limita a una línea.' },
        mes: monthProp,
        anio: yearProp,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'mis_reuniones',
    description:
      'Próximas reuniones programadas donde el usuario que está usando el chat (no otro empleado) es participante, ordenadas por fecha más próxima primero. Úsala para "mis reuniones", "qué reuniones tengo yo/tengo esta semana" — no resumen_reuniones, que agrega por línea/empresa sin identificar personas.',
    parameters: {
      type: 'object',
      properties: {
        limite: {
          type: 'integer',
          description: 'Máximo de reuniones a devolver. Por defecto 10.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'resumen_pautas',
    description:
      'Pautas audiovisuales (grabaciones) de un mes: cuántas solicitadas, agendadas, realizadas o declinadas, solicitudes pendientes de agendar, y piezas grabadas/editadas. De toda la empresa o de una línea si se especifica. Sin mes/año, usa el mes actual.',
    parameters: {
      type: 'object',
      properties: {
        linea: { ...lineaProp, description: 'Opcional: limita a una línea.' },
        mes: monthProp,
        anio: yearProp,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pautas_del_dia',
    description:
      'Agenda de pautas audiovisuales agendadas o realizadas de un día concreto, con hora, cliente y estado. Úsala cuando pregunten "cuántas pautas hay hoy/mañana/tal fecha" en vez de resumen_pautas, que solo agrega por mes. Sin fecha, usa el día de hoy.',
    parameters: {
      type: 'object',
      properties: {
        linea: { ...lineaProp, description: 'Opcional: limita a una línea.' },
        fecha: {
          type: 'string',
          description: 'Fecha en formato YYYY-MM-DD. Si se omite, se usa el día de hoy.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'dias_carga_alta',
    description:
      'Días de un mes en que un recurso de Audiovisual (quien sale a grabar) tuvo X o más pautas en un mismo día. Úsala para preguntas como "¿cuántos días tuvo Fulana más de 2 pautas en agosto?" o "¿cuándo estuvo más cargada tal persona?" — nunca cuentes esto a mano ni digas que no puedes calcularlo. Sin mes/año, usa el último mes cerrado.',
    parameters: {
      type: 'object',
      properties: { persona: personaProp, mes: monthProp, anio: yearProp, minimo: minimoProp },
      required: ['persona'],
      additionalProperties: false,
    },
  },
  {
    name: 'listar_cargos',
    description:
      'Catálogo de cargos/puestos de la empresa, con su departamento y cuántos empleados activos tiene cada uno. Úsala si buscar_empleados no encuentra un cargo, para ver cómo se llama realmente.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'buscar_empleados',
    description:
      'Directorio de personal: busca empleados activos por cargo, departamento y/o línea, cada uno con su nombre, cargo, departamento y línea(s). Úsala para "quién es el/la [cargo]", "lista de gente de [departamento/línea]" — nunca digas que no tienes acceso a un directorio de empleados. Sin filtros, devuelve toda la plantilla.',
    parameters: {
      type: 'object',
      properties: { cargo: cargoProp, departamento: departamentoProp, linea: lineaProp },
      additionalProperties: false,
    },
  },
  {
    name: 'ficha_cliente',
    description:
      'Ficha de un cliente/marca: qué línea lo lleva y quién es la jefa, el equipo asignado (social media, diseñador, audiovisual, apoyo), desde cuándo es cliente, día de pago, fee mensual, presupuesto de pauta, RIF, redes y estado del contrato. Úsala siempre que pregunten "quién maneja/lleva la cuenta de X" — si "X" no es una línea conocida, es casi seguro un cliente: usa esta tool antes de decir que no existe.',
    parameters: {
      type: 'object',
      properties: { cliente: clienteProp },
      required: ['cliente'],
      additionalProperties: false,
    },
  },
  {
    name: 'clientes_de_linea',
    description:
      'Cartera de clientes/marcas de una línea operativa: cuántos y cuáles, con su estado (activo/archivado).',
    parameters: {
      type: 'object',
      properties: {
        linea: lineaProp,
        incluir_archivados: {
          type: 'boolean',
          description: 'Si se debe incluir clientes archivados. Por defecto false (solo activos).',
        },
      },
      required: ['linea'],
      additionalProperties: false,
    },
  },
  {
    name: 'inversion_ads',
    description:
      'Inversión en pauta pagada (ads) de un mes: con "cliente", el detalle de sus campañas, el total invertido y su presupuesto mensual; sin "cliente", el ranking de todos los clientes por inversión del mes y el total de la empresa. Sin mes/año, usa el mes actual. Es la ÚNICA fuente de inversión en ads: no proyectes ni extrapoles más allá de estos montos.',
    parameters: {
      type: 'object',
      properties: {
        cliente: {
          ...clienteProp,
          description: 'Opcional: si se omite, devuelve el ranking de todos los clientes.',
        },
        mes: monthProp,
        anio: yearProp,
      },
      additionalProperties: false,
    },
  },
]

const EXECUTORS = {
  listar_lineas: listarLineas,
  score_de_linea: scoreDeLinea,
  ranking_lineas: rankingLineas,
  evolucion_linea: evolucionLinea,
  finanzas,
  comparar_meses: compararMeses,
  resumen_tareas: resumenTareas,
  tareas_criticas: tareasCriticas,
  resumen_reuniones: resumenReuniones,
  mis_reuniones: misReuniones,
  resumen_pautas: resumenPautas,
  pautas_del_dia: pautasDelDia,
  dias_carga_alta: diasCargaAlta,
  listar_cargos: listarCargos,
  buscar_empleados: buscarEmpleados,
  ficha_cliente: fichaCliente,
  clientes_de_linea: clientesDeLinea,
  inversion_ads: inversionAds,
}

/** Ejecuta una tool por nombre sobre el dataset cargado. Nunca lanza: errores van en `{error}`. */
export function executeTool(name, args, dataset) {
  const fn = EXECUTORS[name]
  if (!fn) return { error: `Herramienta desconocida: ${name}` }
  try {
    return fn(args ?? {}, dataset)
  } catch (err) {
    return { error: `Error ejecutando ${name}: ${err.message}` }
  }
}
