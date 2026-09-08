/**
 * Evaluación subjetiva mensual del jefe (tabla `manager_ratings`) — ver ARQUITECTURA.md
 * §2.7. Puro: no toca Supabase. Cada cargo tiene sus propios criterios (`evaluation_criteria`);
 * este módulo solo calcula el promedio y arma la copia congelada que se guarda en `items`.
 */

/**
 * Promedio 1-5 de los items puntuados (ignora los que no tienen `score` aún).
 * @param {Array<{score: number|null}>} items
 * @returns {number|null} null si ningún item tiene score
 */
export function ratingAverage(items) {
  const puntuados = (items ?? []).filter((i) => i?.score != null)
  if (!puntuados.length) return null
  const suma = puntuados.reduce((sum, i) => sum + Number(i.score), 0)
  return Math.round((suma / puntuados.length) * 100) / 100
}

/**
 * Arma los `items` que se guardan en `manager_ratings.items`, congelando el ícono y el
 * nombre del criterio tal como estaban al momento de evaluar (si el criterio se
 * renombra o desactiva después, las evaluaciones pasadas no cambian).
 *
 * @param {Array<{id, icon, name}>} criteria      criterios activos del cargo, en orden
 * @param {Record<string, number>} scoresById     {criterion_id: score 1-5}
 * @returns {Array<{criterion_id, icon, name, score}>}
 */
export function buildRatingItems(criteria, scoresById) {
  return (criteria ?? []).map((c) => ({
    criterion_id: c.id,
    icon: c.icon ?? null,
    name: c.name,
    score: scoresById?.[c.id] ?? null,
  }))
}
