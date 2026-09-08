/**
 * Disponibilidad de un empleado en un mes concreto (Evaluación automática de
 * desempeño — ver ARQUITECTURA.md §2.7). Puro: no toca Supabase ni el DOM.
 *
 * Se usa para dos cosas complementarias en `employeeScore.js`:
 *  1. Filtro fino — los ítems (tareas, CNP…) cuyo `due_date` cae en un rango
 *     excluido (vacaciones confirmadas, o antes de `hire_date`) salen del universo
 *     de los indicadores de entregas/puntualidad/arrastre. Más justo que prorratear
 *     un denominador global.
 *  2. Marca de mes parcial — si el empleado estuvo disponible menos de la mitad del
 *     mes, el score se calcula igual pero no compite en el ranking.
 *
 * Solo `vacations.status = 'confirmed'` descuenta disponibilidad — 'tentative' es una
 * fecha probable sin cerrar, no se sabe aún si se tomará (ver TENTATIVE_STATUSES en
 * employeeCalendar.js). 'rejected' no debería llegar aquí (se filtra antes de traer los
 * datos, igual que fetchVacationsInRange), pero por si acaso también se ignora.
 */

/** Nº de días del mes (year, month 1-indexado). */
function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

/** Días hábiles (lun-vie) del mes. */
export function businessDays(year, month) {
  let count = 0
  const last = lastDayOfMonth(year, month)
  for (let day = 1; day <= last; day++) {
    const dow = new Date(year, month - 1, day).getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

/** Parsea 'YYYY-MM-DD' a Date local (sin desfase UTC). */
function parseKey(value) {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** true si `dateKey` ('YYYY-MM-DD') cae dentro de [startKey, endKey] inclusive. */
function inRange(dateKey, startKey, endKey) {
  if (!dateKey) return false
  return dateKey >= startKey && dateKey <= endKey
}

/**
 * @param {string} dateKey  'YYYY-MM-DD' a evaluar (p. ej. el due_date de una tarea)
 * @param {Array<[string,string]>} rangosExcluidos  pares ['YYYY-MM-DD','YYYY-MM-DD']
 * @returns {boolean} true si la fecha cae dentro de algún rango excluido
 */
export function isInExcludedRange(dateKey, rangosExcluidos) {
  if (!dateKey || !rangosExcluidos?.length) return false
  return rangosExcluidos.some(([start, end]) => inRange(dateKey, start, end))
}

const pad = (n) => String(n).padStart(2, '0')
function monthBounds(year, month) {
  const last = lastDayOfMonth(year, month)
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(last)}` }
}

/**
 * Días hábiles perdidos por una vacación confirmada dentro del mes [year, month].
 * Recorta el rango de la vacación a los límites del mes antes de contar.
 */
function businessDaysLost(startKey, endKey, year, month) {
  const { start: monthStart, end: monthEnd } = monthBounds(year, month)
  const clampedStart = startKey < monthStart ? monthStart : startKey
  const clampedEnd = endKey > monthEnd ? monthEnd : endKey
  if (clampedStart > clampedEnd) return 0
  const start = parseKey(clampedStart)
  const end = parseKey(clampedEnd)
  let count = 0
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

/**
 * Calcula la disponibilidad de un empleado en un mes.
 *
 * @param {{hire_date?: string|null}} user
 * @param {Array<{start_date:string, end_date:string, status:string}>} vacations
 *   ya filtradas a ese empleado (cualquier rango que toque el mes, no solo las que
 *   empiezan en él)
 * @param {number} year
 * @param {number} month  1-indexado
 * @returns {{
 *   habilesMes: number, habilesDisponibles: number, factor: number,
 *   motivo: 'vacaciones'|'ingreso'|null, rangosExcluidos: Array<[string,string]>
 * }}
 */
export function computeAvailability(user, vacations, year, month) {
  const habilesMes = businessDays(year, month)
  const { start: monthStart, end: monthEnd } = monthBounds(year, month)

  const rangosExcluidos = []
  let habilesPerdidos = 0
  let motivo = null

  // Ingreso a mitad de mes: excluye [inicio de mes, día anterior al ingreso].
  const hireKey = user?.hire_date ?? null
  if (hireKey && inRange(hireKey, monthStart, monthEnd) && hireKey > monthStart) {
    const dayBefore = parseKey(hireKey)
    dayBefore.setDate(dayBefore.getDate() - 1)
    const dayBeforeKey = `${dayBefore.getFullYear()}-${pad(dayBefore.getMonth() + 1)}-${pad(dayBefore.getDate())}`
    rangosExcluidos.push([monthStart, dayBeforeKey])
    habilesPerdidos += businessDaysLost(monthStart, dayBeforeKey, year, month)
    motivo = 'ingreso'
  }

  // Vacaciones confirmadas que tocan el mes.
  for (const vac of vacations ?? []) {
    if (vac?.status !== 'confirmed') continue
    if (!vac.start_date || !vac.end_date) continue
    if (vac.end_date < monthStart || vac.start_date > monthEnd) continue
    rangosExcluidos.push([vac.start_date, vac.end_date])
    habilesPerdidos += businessDaysLost(vac.start_date, vac.end_date, year, month)
    motivo = motivo ?? 'vacaciones'
  }

  const habilesDisponibles = Math.max(0, habilesMes - habilesPerdidos)
  const factor = habilesMes > 0 ? habilesDisponibles / habilesMes : 1

  return { habilesMes, habilesDisponibles, factor, motivo, rangosExcluidos }
}
