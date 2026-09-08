import { describe, it, expect } from 'vitest'
import { businessDays, isInExcludedRange, computeAvailability } from '../utils/employeeAvailability'

describe('businessDays', () => {
  it('cuenta solo lunes a viernes', () => {
    // Septiembre 2026: 30 días, empieza martes 1 → 22 hábiles.
    expect(businessDays(2026, 9)).toBe(22)
  })
})

describe('isInExcludedRange', () => {
  it('true si la fecha cae dentro de un rango', () => {
    expect(isInExcludedRange('2026-09-10', [['2026-09-05', '2026-09-15']])).toBe(true)
  })

  it('false si la fecha cae fuera de todos los rangos', () => {
    expect(isInExcludedRange('2026-09-20', [['2026-09-05', '2026-09-15']])).toBe(false)
  })

  it('false sin fecha o sin rangos', () => {
    expect(isInExcludedRange(null, [['2026-09-05', '2026-09-15']])).toBe(false)
    expect(isInExcludedRange('2026-09-10', [])).toBe(false)
  })
})

describe('computeAvailability', () => {
  it('factor 1 y sin rangos excluidos cuando no hay vacaciones ni ingreso reciente', () => {
    const res = computeAvailability({ hire_date: '2020-01-01' }, [], 2026, 9)
    expect(res.factor).toBe(1)
    expect(res.motivo).toBeNull()
    expect(res.rangosExcluidos).toEqual([])
  })

  it('descuenta días hábiles de una vacación confirmada dentro del mes', () => {
    const vacations = [{ start_date: '2026-09-08', end_date: '2026-09-12', status: 'confirmed' }]
    // 8,9,10,11,12 sep 2026 = mar-sáb → 4 días hábiles perdidos (mar-vie), el sábado no cuenta.
    const res = computeAvailability({}, vacations, 2026, 9)
    expect(res.habilesMes).toBe(22)
    expect(res.habilesDisponibles).toBe(18) // 22 - 4 hábiles (mar,mié,jue,vie)
    expect(res.motivo).toBe('vacaciones')
    expect(res.rangosExcluidos).toEqual([['2026-09-08', '2026-09-12']])
  })

  it('ignora vacaciones tentative (fecha probable, no descuenta)', () => {
    const vacations = [{ start_date: '2026-09-08', end_date: '2026-09-12', status: 'tentative' }]
    const res = computeAvailability({}, vacations, 2026, 9)
    expect(res.factor).toBe(1)
    expect(res.rangosExcluidos).toEqual([])
  })

  it('ignora vacaciones rejected', () => {
    const vacations = [{ start_date: '2026-09-08', end_date: '2026-09-12', status: 'rejected' }]
    const res = computeAvailability({}, vacations, 2026, 9)
    expect(res.factor).toBe(1)
  })

  it('recorta una vacación que empieza antes del mes y termina dentro', () => {
    const vacations = [{ start_date: '2026-08-28', end_date: '2026-09-03', status: 'confirmed' }]
    // Solo cuenta 2026-09-01 (mar) y 2026-09-02 (mié) y 2026-09-03 (jue) dentro del mes.
    const res = computeAvailability({}, vacations, 2026, 9)
    expect(res.habilesDisponibles).toBe(19) // 22 - 3
    expect(res.rangosExcluidos).toEqual([['2026-08-28', '2026-09-03']])
  })

  it('excluye los días previos al ingreso cuando hire_date cae a mitad de mes', () => {
    // hire_date 2026-09-10 → excluye 1-9 sep (días hábiles: 1,2,3,4,7,8,9 = 7 días).
    const res = computeAvailability({ hire_date: '2026-09-10' }, [], 2026, 9)
    expect(res.motivo).toBe('ingreso')
    expect(res.habilesDisponibles).toBe(15) // 22 - 7
    expect(res.rangosExcluidos).toEqual([['2026-09-01', '2026-09-09']])
  })

  it('ignora hire_date de meses anteriores (empleado ya establecido)', () => {
    const res = computeAvailability({ hire_date: '2026-01-15' }, [], 2026, 9)
    expect(res.motivo).toBeNull()
    expect(res.factor).toBe(1)
  })

  it('combina vacaciones e ingreso en el mismo mes sin factor negativo', () => {
    const vacations = [{ start_date: '2026-09-20', end_date: '2026-09-30', status: 'confirmed' }]
    const res = computeAvailability({ hire_date: '2026-09-10' }, vacations, 2026, 9)
    expect(res.habilesDisponibles).toBeGreaterThanOrEqual(0)
    expect(res.factor).toBeGreaterThanOrEqual(0)
    expect(res.rangosExcluidos.length).toBe(2)
  })
})
