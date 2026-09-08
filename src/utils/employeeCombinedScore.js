/**
 * Nota general (sobre 5) que combina el score automático de desempeño con la
 * evaluación subjetiva del jefe — ver ARQUITECTURA.md §2.7. Puro: no toca Supabase.
 *
 * Se calcula al leer, no se persiste: el score automático se congela el día 5
 * (`employee_score_snapshots`, inmutable), pero el jefe puede evaluar después o
 * corregir su evaluación. Combinar en lectura evita recomputar/reabrir snapshots ya
 * comunicados cada vez que alguien puntúa.
 */

import { ratingAverage } from './managerRating'
import { scoreDialColor } from '../components/metricas/ScoreDial'

export const PESO_AUTO = 0.7
export const PESO_JEFE = 0.3

/**
 * @param {object} params
 * @param {number|null} params.score       score automático 0-100 (o null si `sin_datos`)
 * @param {number|null} params.managerAvg  promedio 1-5 de la evaluación del jefe (o null)
 * @returns {{
 *   nota: number|null,
 *   fuente: 'ambos'|'solo_auto'|'solo_jefe'|'sin_datos',
 *   autoSobre5: number|null,
 *   aporteAuto: number,
 *   aporteJefe: number,
 * }}
 */
export function combineScores({ score, managerAvg }) {
  const autoSobre5 = score != null ? Math.round((score / 20) * 100) / 100 : null

  if (autoSobre5 != null && managerAvg != null) {
    const nota = Math.round((PESO_AUTO * autoSobre5 + PESO_JEFE * managerAvg) * 100) / 100
    return {
      nota,
      fuente: 'ambos',
      autoSobre5,
      aporteAuto: Math.round(PESO_AUTO * autoSobre5 * 100) / 100,
      aporteJefe: Math.round(PESO_JEFE * managerAvg * 100) / 100,
    }
  }

  if (autoSobre5 != null) {
    return {
      nota: autoSobre5,
      fuente: 'solo_auto',
      autoSobre5,
      aporteAuto: autoSobre5,
      aporteJefe: 0,
    }
  }

  if (managerAvg != null) {
    return {
      nota: managerAvg,
      fuente: 'solo_jefe',
      autoSobre5: null,
      aporteAuto: 0,
      aporteJefe: managerAvg,
    }
  }

  return { nota: null, fuente: 'sin_datos', autoSobre5: null, aporteAuto: 0, aporteJefe: 0 }
}

/**
 * Nota /5 que se muestra al usuario para un empleado en un mes, y sus dos insumos.
 * Única fuente de verdad: la usan por igual la tabla de Desempeño, el modal de
 * detalle (ScoreBreakdownCard) y Mi Desempeño — antes cada vista recalculaba la
 * nota por su cuenta y terminaban divergiendo de escala (0-100 vs sobre 5).
 *
 * @param {object} params
 * @param {object|null} params.result          fila de useEmployeeScores (con `.score` 0-100)
 * @param {object|null} params.managerRating   fila de manager_ratings del mes, si existe
 * @param {Array} [params.criteria]             criterios activos del cargo del empleado
 * @returns {{nota:number|null, autoSobre5:number|null, managerAvg:number|null, fuente:string, hasCriteria:boolean}}
 */
export function resolveEmployeeNota({ result, managerRating, criteria }) {
  const score = result?.score ?? null
  const managerAvg = managerRating ? ratingAverage(managerRating.items) : null
  const hasCriteria = criteria?.length > 0
  const combined = combineScores({ score, managerAvg })
  // Sin criterios definidos para el cargo no hay evaluación del jefe posible: se usa
  // solo el automático aunque exista una fila vieja en manager_ratings.
  const nota = hasCriteria ? combined.nota : combined.autoSobre5
  return {
    nota,
    autoSobre5: combined.autoSobre5,
    managerAvg,
    fuente: combined.fuente,
    hasCriteria,
  }
}

/** Color único de la nota /5, mismos umbrales que scoreDialColor (0-100). */
export function notaColor(nota) {
  return nota == null ? '#bbb' : scoreDialColor(nota * 20)
}
