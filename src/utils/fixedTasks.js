/**
 * Lógica pura del módulo «Tareas Fijas» (Gestión de Tareas → Tareas Fijas,
 * sub-sección Redes-Diseño). Todas las funciones son puras y testeables:
 * no tocan Supabase ni el DOM.
 *
 * Semanas del mes = ancladas al miércoles (mockup tareas-fijas-mockup.html).
 * Cada semana define hasta 5 tareas recurrentes (`TASK_KEYS`), con fecha tope propia.
 */

/**
 * Las 4 tareas fijas recurrentes, en el orden en que aparecen en la grilla y el reporte.
 * "Actualización de Plataformas" (antes la 5.ª tarea) se mudó al módulo Chequeo — ver
 * src/utils/chequeo.js → computePlataformasProductividad.
 */
export const TASK_KEYS = ['metricas', 'grilla', 'artes', 'calendario']

export const TASK_LABELS = {
  metricas: 'Métricas',
  grilla: 'Grillas Redes → Diseño',
  artes: 'Grillas Diseño → Redes',
  calendario: 'Calendario',
}

/**
 * A qué rol de `metric_clients` (social_manager_id | designer_id) le corresponde entregar
 * cada tarea fija — usado por el indicador `tareas_fijas` de la Evaluación automática de
 * desempeño (ver ARQUITECTURA.md §2.7) para no acreditar la misma celda a ambos roles del
 * cliente. 'artes' es la única que produce Diseño (Redes → Diseño le pide grillas, Diseño
 * responde con artes); las otras 3 las produce Redes.
 */
export const FIXED_TASK_ROLE = {
  metricas: 'social',
  grilla: 'social',
  artes: 'designer',
  calendario: 'social',
}

// ─── Semanas del mes ────────────────────────────────────────────────────────

/** Nº de días del mes (year, month 1-indexed). */
function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

/**
 * Construye las semanas del mes ancladas al miércoles. Cada semana trae sus
 * fechas de referencia (miércoles, viernes, lunes siguiente, rango lun-dom) y
 * un flag isFirst/isLast para saber qué tareas extra aplican (ver `tasksForWeek`).
 * @param {number} year
 * @param {number} month  1-indexado (enero = 1)
 * @returns {Array<{n:number, wed:Date, fri:Date, mon:Date, monIni:Date, dom:Date, isFirst:boolean, isLast:boolean}>}
 */
export function buildFixedWeeks(year, month) {
  const last = lastDayOfMonth(year, month)
  const weds = []
  for (let day = 1; day <= last; day++) {
    const dt = new Date(year, month - 1, day)
    if (dt.getDay() === 3) weds.push(dt)
  }
  return weds.map((wed, i) => {
    const fri = new Date(wed)
    fri.setDate(wed.getDate() + 2) // viernes de la semana
    const mon = new Date(wed)
    mon.setDate(wed.getDate() + 5) // lunes siguiente → artes
    const monIni = new Date(wed)
    monIni.setDate(wed.getDate() - 2) // lunes de la semana (para el rango)
    const dom = new Date(wed)
    dom.setDate(wed.getDate() + 4) // domingo de la semana
    return { n: i + 1, wed, fri, mon, monIni, dom, isFirst: i === 0, isLast: i === weds.length - 1 }
  })
}

/**
 * Qué tareas (`task_key`) aplican en una semana dada.
 * Base todas las semanas: grilla, artes.
 * Semana 1: + métricas. Última semana del mes: + calendario.
 * @param {number} weekN
 * @param {Array} weeks  resultado de buildFixedWeeks
 */
export function tasksForWeek(weekN, weeks) {
  const base = ['grilla', 'artes']
  if (weekN === 1) return ['metricas', ...base]
  const week = weeks.find((w) => w.n === weekN)
  if (week?.isLast) return [...base, 'calendario']
  return base
}

/** N-ésimo día hábil (lun-vie) del mes. */
function nthBusinessDay(year, month, n) {
  let count = 0
  const last = lastDayOfMonth(year, month)
  for (let day = 1; day <= last; day++) {
    const dow = new Date(year, month - 1, day).getDay()
    if (dow !== 0 && dow !== 6) {
      count++
      if (count === n) return new Date(year, month - 1, day)
    }
  }
  return new Date(year, month - 1, last)
}

/** Último día hábil (lun-vie) del mes. */
function lastBusinessDay(year, month) {
  const last = lastDayOfMonth(year, month)
  for (let day = last; day >= 1; day--) {
    const dow = new Date(year, month - 1, day).getDay()
    if (dow !== 0 && dow !== 6) return new Date(year, month - 1, day)
  }
  return new Date(year, month - 1, last)
}

/**
 * Fecha tope (hasta las 5pm) de una tarea en una semana concreta.
 * @param {string} taskKey
 * @param {object} week   una entrada de buildFixedWeeks
 * @param {number} year
 * @param {number} month  1-indexado
 * @returns {{date: Date, rule: string}}
 */
export function taskDeadline(taskKey, week, year, month) {
  if (taskKey === 'metricas')
    return { date: nthBusinessDay(year, month, 5), rule: '5.º día hábil del mes' }
  if (taskKey === 'grilla') return { date: week.wed, rule: 'cada miércoles' }
  if (taskKey === 'artes') return { date: week.mon, rule: 'cada lunes' }
  if (taskKey === 'calendario')
    return { date: lastBusinessDay(year, month), rule: 'último día hábil del mes' }
  return { date: null, rule: '' }
}

// ─── Agregación → indicador «2. Productividad» del reporte ────────────────────

/**
 * Determina si una tarea aplica a una cuenta según su configuración
 * (`metric_clients.fixed_tasks`). Sin configuración (null/undefined) → todas aplican.
 * @param {object|null} fixedTasksConfig  client.fixed_tasks
 * @param {string} taskKey
 */
export function taskAppliesToClient(fixedTasksConfig, taskKey) {
  if (fixedTasksConfig == null) return true
  return fixedTasksConfig[taskKey] !== false
}

/**
 * Calcula las filas del indicador «2. Productividad – Tareas Fijas» del reporte
 * mensual de la línea, a partir de las marcas tildadas en la grilla.
 *
 * Meta de cada tarea = nº de celdas aplicables en el mes (excluye 'na' y cuentas
 * donde la tarea no aplica). Real = nº de celdas marcadas 'si'. Devuelve el shape
 * EXACTO de `report.productividad.tareas`, para que `calcProductividad`
 * (metricsScore.js) siga funcionando sin cambios.
 *
 * Nota: no incluye "Actualización de Plataformas" — esa fila se deriva aparte, de los
 * eventos del módulo Chequeo (ver utils/chequeo.js → computePlataformasProductividad),
 * y se concatena al resultado de esta función en el caller (OperacionesView,
 * FixedTasksReportPreview).
 *
 * @param {Array} marks     filas de fixed_task_marks del mes (line_id ya filtrado)
 * @param {Array} clients   cuentas de la línea (con fixed_tasks)
 * @param {Array} weeks     buildFixedWeeks(year, month)
 * @returns {Array<{nombre:string, realizado:number, meta:number}>}
 */
export function computeProductividad(marks, clients, weeks) {
  return TASK_KEYS.map((taskKey) => {
    let meta = 0
    let realizado = 0
    clients.forEach((client) => {
      if (!taskAppliesToClient(client.fixed_tasks, taskKey)) return
      weeks.forEach((week) => {
        if (!tasksForWeek(week.n, weeks).includes(taskKey)) return

        const mark = marks.find(
          (m) => m.client_id === client.id && m.task_key === taskKey && m.period_week === week.n,
        )
        if (mark?.status === 'na') return
        meta++
        if (mark?.status === 'si') realizado++
      })
    })
    return { nombre: TASK_LABELS[taskKey], realizado, meta }
  })
}

// ─── Agregación → sección «Tareas Fijas» del perfil del empleado ──────────────

/**
 * Cumplimiento de tareas fijas de un empleado, según las cuentas donde es
 * social/diseñador (clientIds ya resuelto por el caller). 'na' se excluye del
 * cálculo (no cuenta como incumplimiento).
 * @param {Array} marks      fixed_task_marks del período, ya acotadas a clientIds
 * @param {Array<string>} clientIds  cuentas donde el empleado participa
 * @returns {{total:number, entregadas:number, cumplimientoPct:number|null, byTaskKey: Record<string,{total:number, entregadas:number}>}}
 */
export function aggregateEmployeeFixedTasks(marks, clientIds) {
  const idSet = new Set(clientIds)
  const relevant = marks.filter((m) => idSet.has(m.client_id) && m.status !== 'na')

  const byTaskKey = {}
  TASK_KEYS.forEach((k) => {
    byTaskKey[k] = { total: 0, entregadas: 0 }
  })

  relevant.forEach((m) => {
    if (!byTaskKey[m.task_key]) byTaskKey[m.task_key] = { total: 0, entregadas: 0 }
    byTaskKey[m.task_key].total++
    if (m.status === 'si') byTaskKey[m.task_key].entregadas++
  })

  const total = relevant.length
  const entregadas = relevant.filter((m) => m.status === 'si').length
  const cumplimientoPct = total > 0 ? Math.round((entregadas / total) * 100) : null

  return { total, entregadas, cumplimientoPct, byTaskKey }
}

// ─── Agregación → indicador `tareas_fijas` de la Evaluación automática ─────────

/**
 * Cumplimiento y puntualidad de tareas fijas de un empleado, atribuidas por ROL
 * (`FIXED_TASK_ROLE`) en vez de acreditar las 4 tareas completas a cualquiera que
 * participe en el cliente. Corrige dos problemas de `aggregateEmployeeFixedTasks`:
 *
 * 1. Doble conteo: un cliente con social manager y diseñador distintos ya no le suma
 *    'artes' al social manager ni 'grilla'/'metricas'/'calendario' al diseñador.
 * 2. Meta derivada del calendario, no de las marcas existentes: una celda que nadie
 *    marcó cuenta como NO cumplida (antes se ignoraba silenciosamente, sobrevalorando
 *    a quien no usa el sistema). Reusa el mismo recorrido que `computeProductividad`.
 *
 * @param {Array} marks    fixed_task_marks del período (ya acotadas a company/mes)
 * @param {Array} clients  metric_clients no borrados de la empresa (con fixed_tasks,
 *                         social_manager_id, designer_id)
 * @param {Array} weeks    buildFixedWeeks(year, month)
 * @param {string} userId
 * @returns {{
 *   meta:number, si:number, cumplimientoPct:number|null, puntualPct:number|null,
 *   byTaskKey: Record<string,{meta:number, si:number}>,
 *   byRole: { social:{meta:number,si:number}, designer:{meta:number,si:number} },
 * }}
 */
export function aggregateEmployeeFixedTasksByRole(
  marks,
  clients,
  weeks,
  userId,
  { year, month } = {},
) {
  const byTaskKey = {}
  const byRole = { social: { meta: 0, si: 0 }, designer: { meta: 0, si: 0 } }
  let meta = 0
  let si = 0
  let siPuntuales = 0

  TASK_KEYS.forEach((k) => {
    byTaskKey[k] = { meta: 0, si: 0 }
  })

  clients.forEach((client) => {
    const roles = []
    if (client.social_manager_id === userId) roles.push('social')
    if (client.designer_id === userId) roles.push('designer')
    if (roles.length === 0) return

    TASK_KEYS.forEach((taskKey) => {
      const role = FIXED_TASK_ROLE[taskKey]
      if (!roles.includes(role)) return
      if (!taskAppliesToClient(client.fixed_tasks, taskKey)) return

      weeks.forEach((week) => {
        if (!tasksForWeek(week.n, weeks).includes(taskKey)) return
        const mark = marks.find(
          (m) => m.client_id === client.id && m.task_key === taskKey && m.period_week === week.n,
        )
        if (mark?.status === 'na') return

        meta++
        byTaskKey[taskKey].meta++
        byRole[role].meta++

        if (mark?.status === 'si') {
          si++
          byTaskKey[taskKey].si++
          byRole[role].si++
          if (mark.marked_at && year != null && month != null) {
            const { date: deadline } = taskDeadline(taskKey, week, year, month)
            // La fecha tope es "hasta las 5pm" (ver taskDeadline) — comparar contra
            // medianoche penalizaría injustamente una marca hecha esa misma tarde.
            const cutoff = deadline ? new Date(deadline) : null
            if (cutoff) cutoff.setHours(17, 0, 0, 0)
            if (cutoff && new Date(mark.marked_at) <= cutoff) siPuntuales++
          }
        }
      })
    })
  })

  const cumplimientoPct = meta > 0 ? si / meta : null
  const puntualPct = si > 0 ? siPuntuales / si : null

  return { meta, si, cumplimientoPct, puntualPct, byTaskKey, byRole }
}
