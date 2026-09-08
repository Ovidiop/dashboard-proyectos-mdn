/**
 * Narrativa automática determinística del score de desempeño (ver ARQUITECTURA.md
 * §2.7, fase F5). Puro, estilo `usageNarrative.js`: mismo input siempre produce el
 * mismo texto, sin IA y sin costo — se persiste en el snapshot mensual y también se
 * muestra en el cálculo en vivo del mes en curso.
 *
 * Nunca menciona un indicador que no `aplica` ese mes: no hay dato que respalde una
 * frase sobre un indicador que no tuvo volumen suficiente.
 */

/** Caída/subida mínima (en puntos de pct, 0-1) respecto al promedio histórico para mencionarla. */
const TREND_THRESHOLD = 0.15

/** Diferencia mínima de puntaje global (0-100) respecto al mes anterior medido para mencionarla. */
const SCORE_TREND_THRESHOLD = 2

/**
 * Indicadores que cuentan para el score pero nunca se narran como fortaleza, mejora
 * ni tendencia. `reuniones`: `meetings.status` es un estado compartido de la reunión
 * que marca quien la convoca, no una conducta de la persona evaluada, y no todos los
 * cargos van a reuniones (peso 5 en casi todos los perfiles). Sigue visible con su
 * porcentaje en el desglose — solo se excluye del texto.
 */
const NARRATIVE_EXCLUDED_KEYS = new Set(['reuniones'])

/** Formateadores de cifras concretas por indicador, a partir del `detalle` que cada
 * calcX de `employeeScore.js` ya devuelve — evita re-derivar datos crudos (tasks,
 * cnp, etc.) y así una narrativa de un mes cerrado se puede reconstruir idéntica
 * solo con lo que ya viaja en el snapshot. Si el detalle no calza, no hay cifra. */
const DETAIL_FORMATTERS = {
  entregas: (d) => {
    if (!d) return null
    const partes = []
    if (d.tUniverso > 0) partes.push(`cerraste ${d.tCerradas} de ${d.tUniverso} tareas`)
    if (d.cSolicitadas > 0)
      partes.push(`entregaste ${d.cEntregadas} de ${d.cSolicitadas} piezas CNP`)
    return partes.length ? partes.join(' y ') : null
  },
  puntualidad: (d) =>
    d?.total > 0 ? `${d.aTiempo} de ${d.total} entregas salieron a tiempo` : null,
  arrastre: (d) =>
    d?.unidades > 0
      ? `${d.problematicas} de ${d.unidades} tareas abiertas arrastradas o bloqueadas`
      : null,
  tareas_fijas: (d) => (d?.meta > 0 ? `cumpliste ${d.si} de ${d.meta} tareas fijas` : null),
  piezas_av: (d) => (d?.unidades > 0 ? `${d.listas} de ${d.unidades} piezas listas` : null),
  campanas: (d) => {
    if (!d) return null
    const total = (d.misPagadas ?? 0) + (d.misOrganicas ?? 0)
    return total > 0 ? `${total} campaña${total === 1 ? '' : 's'} del mes` : null
  },
  chequeo: (d) =>
    d?.unidades > 0 ? `${d.conFecha} de ${d.unidades} chequeos con publicación registrada` : null,
  tickets: (d) => (d?.unidades > 0 ? `${d.enSla} de ${d.unidades} tickets dentro del SLA` : null),
}

function formatScore(score) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1).replace('.', ',')
}

/**
 * @param {ReturnType<typeof import('./employeeScore').computeEmployeeScore>} result
 * @param {Array<{score?: number|null, breakdown: Array}>} history  hasta 3 meses
 *   anteriores, más reciente primero (mismo shape que `result.breakdown`, más
 *   `score`; típicamente filas de `employee_score_snapshots`)
 * @returns {string}
 */
export function buildScoreNarrative(result, history = []) {
  const { estado, breakdown, score } = result ?? {}

  if (!breakdown || estado === 'sin_datos') {
    return 'Este mes no hay datos suficientes para calcular un puntaje confiable — se necesita más volumen de tareas, CNP o tareas fijas.'
  }

  const aplicables = breakdown.filter((b) => b.aplica && b.pct != null)
  if (aplicables.length === 0) {
    return 'No hay indicadores aplicables este mes.'
  }

  const narrables = aplicables.filter((b) => !NARRATIVE_EXCLUDED_KEYS.has(b.key))

  const sentences = []

  if (narrables.length > 0) {
    const strongest = [...narrables].sort((a, b) => b.pct - a.pct)[0]
    const weakest = [...narrables].sort((a, b) => a.pct - b.pct)[0]

    if (strongest.pct >= 0.8) {
      const cifra = DETAIL_FORMATTERS[strongest.key]?.(strongest.detalle)
      sentences.push(
        `Tu punto más fuerte este mes es ${strongest.label.toLowerCase()} (${Math.round(strongest.pct * 100)}%)${cifra ? ` — ${cifra}` : ''}.`,
      )
    }

    if (weakest.key !== strongest.key && weakest.pct < 0.6) {
      const cifra = DETAIL_FORMATTERS[weakest.key]?.(weakest.detalle)
      sentences.push(
        `Tu punto a mejorar es ${weakest.label.toLowerCase()} (${Math.round(weakest.pct * 100)}%)${cifra ? ` — ${cifra}` : ''}.`,
      )
    }

    // Comparación contra el promedio de los meses anteriores disponibles, solo para
    // indicadores que aplicaron tanto este mes como en algún mes anterior. Se narra
    // como mucho una tendencia (la mayor caída si existe; si no, la mayor subida).
    if (history.length > 0) {
      let biggestDrop = null
      let biggestRise = null
      for (const b of narrables) {
        const priorPcts = history
          .map((h) => h.breakdown?.find((x) => x.key === b.key))
          .filter((x) => x && x.aplica && x.pct != null)
          .map((x) => x.pct)
        if (priorPcts.length === 0) continue

        const avg = priorPcts.reduce((sum, v) => sum + v, 0) / priorPcts.length
        const drop = avg - b.pct
        const rise = b.pct - avg
        if (drop >= TREND_THRESHOLD && (biggestDrop == null || drop > biggestDrop.drop)) {
          biggestDrop = { key: b.key, label: b.label, drop }
        }
        if (rise >= TREND_THRESHOLD && (biggestRise == null || rise > biggestRise.rise)) {
          biggestRise = { key: b.key, label: b.label, rise }
        }
      }
      const meses = `${history.length} mes${history.length > 1 ? 'es' : ''}`
      if (biggestDrop) {
        sentences.push(
          `Bajaste en ${biggestDrop.label.toLowerCase()} respecto a tu promedio de los últimos ${meses}.`,
        )
      } else if (biggestRise) {
        sentences.push(
          `Subiste en ${biggestRise.label.toLowerCase()} respecto a tu promedio de los últimos ${meses}.`,
        )
      }
    }
  }

  // Tendencia del puntaje global, contra el snapshot medido más reciente disponible
  // (puede no ser el mes calendario inmediatamente anterior si hubo un hueco).
  const prevScore = history.find((h) => h.score != null)?.score
  if (score != null && prevScore != null && Math.abs(score - prevScore) >= SCORE_TREND_THRESHOLD) {
    const verbo = score > prevScore ? 'pasó' : 'bajó'
    sentences.push(
      `Tu puntaje ${verbo} de ${formatScore(prevScore)} a ${formatScore(score)} respecto a tu mes anterior medido.`,
    )
  }

  if (sentences.length === 0) {
    sentences.push('Tu desempeño este mes se mantiene estable en todos los indicadores aplicables.')
  }

  return sentences.join(' ')
}
