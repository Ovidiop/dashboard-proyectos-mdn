import { describe, it, expect } from 'vitest'
import { combineScores, resolveEmployeeNota, notaColor } from '../utils/employeeCombinedScore'

describe('combineScores', () => {
  it('combina 70/30 cuando hay score automático y evaluación del jefe', () => {
    // auto 87/100 → 4.35/5; jefe 4.6/5 → 0.7*4.35 + 0.3*4.6 = 4.425 (4.42 por
    // redondeo binario de punto flotante, no 4.43)
    const result = combineScores({ score: 87, managerAvg: 4.6 })
    expect(result.fuente).toBe('ambos')
    expect(result.autoSobre5).toBe(4.35)
    expect(result.nota).toBe(4.42)
  })

  it('usa solo el score automático si el jefe no evaluó', () => {
    const result = combineScores({ score: 80, managerAvg: null })
    expect(result.fuente).toBe('solo_auto')
    expect(result.nota).toBe(4)
    expect(result.aporteJefe).toBe(0)
  })

  it('usa solo la evaluación del jefe cuando no hay score automático (cargo sin indicadores)', () => {
    const result = combineScores({ score: null, managerAvg: 4.5 })
    expect(result.fuente).toBe('solo_jefe')
    expect(result.nota).toBe(4.5)
    expect(result.autoSobre5).toBeNull()
    expect(result.aporteAuto).toBe(0)
  })

  it('devuelve sin_datos si no hay ninguno de los dos', () => {
    const result = combineScores({ score: null, managerAvg: null })
    expect(result.fuente).toBe('sin_datos')
    expect(result.nota).toBeNull()
  })

  it('maneja score = 0 como dato válido, no como ausente', () => {
    const result = combineScores({ score: 0, managerAvg: 3 })
    expect(result.fuente).toBe('ambos')
    expect(result.autoSobre5).toBe(0)
    expect(result.nota).toBe(0.9)
  })
})

describe('resolveEmployeeNota', () => {
  const rating = (score) => ({ items: [{ criterion_id: 'c1', score }] })
  const criteria = [{ id: 'c1', icon: '⭐', name: 'Calidad' }]

  it('combina automático + jefe cuando el cargo tiene criterios y ambos existen', () => {
    const nota = resolveEmployeeNota({
      result: { score: 87 },
      managerRating: rating(4.6),
      criteria,
    })
    expect(nota.hasCriteria).toBe(true)
    expect(nota.fuente).toBe('ambos')
    expect(nota.nota).toBe(4.42)
  })

  it('usa solo el automático cuando el cargo no tiene criterios, aunque exista un rating viejo', () => {
    const nota = resolveEmployeeNota({
      result: { score: 80 },
      managerRating: rating(4.6),
      criteria: [],
    })
    expect(nota.hasCriteria).toBe(false)
    expect(nota.nota).toBe(4)
  })

  it('sin score ni jefe devuelve nota null', () => {
    const nota = resolveEmployeeNota({ result: { score: null }, managerRating: null, criteria })
    expect(nota.nota).toBeNull()
    expect(nota.fuente).toBe('sin_datos')
  })

  it('sin result (undefined) no rompe, trata el score como ausente', () => {
    const nota = resolveEmployeeNota({ result: null, managerRating: rating(4), criteria })
    expect(nota.fuente).toBe('solo_jefe')
    expect(nota.nota).toBe(4)
  })
})

describe('notaColor', () => {
  it('null → gris', () => {
    expect(notaColor(null)).toBe('#bbb')
  })

  it('nota alta (>=4) → verde', () => {
    expect(notaColor(4.5)).toBe('#10B981')
  })

  it('nota baja (<3) → rojo', () => {
    expect(notaColor(2)).toBe('#EF4444')
  })
})
