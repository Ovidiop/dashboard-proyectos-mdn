import { describe, it, expect } from 'vitest'
import {
  buildFixedWeeks,
  aggregateEmployeeFixedTasksByRole,
  FIXED_TASK_ROLE,
} from '../utils/fixedTasks'

const YEAR = 2026
const MONTH = 9 // septiembre 2026: 4 miércoles (2, 9, 16, 23, 30) → 5 semanas

function client(overrides = {}) {
  return { id: 'c1', social_manager_id: null, designer_id: null, fixed_tasks: null, ...overrides }
}

function mark(overrides = {}) {
  return {
    client_id: 'c1',
    task_key: 'grilla',
    period_week: 1,
    status: 'si',
    marked_at: null,
    ...overrides,
  }
}

describe('FIXED_TASK_ROLE', () => {
  it('artes es de diseño, el resto es de redes', () => {
    expect(FIXED_TASK_ROLE.artes).toBe('designer')
    expect(FIXED_TASK_ROLE.grilla).toBe('social')
    expect(FIXED_TASK_ROLE.metricas).toBe('social')
    expect(FIXED_TASK_ROLE.calendario).toBe('social')
  })
})

describe('aggregateEmployeeFixedTasksByRole — atribución por rol', () => {
  const weeks = buildFixedWeeks(YEAR, MONTH)

  it('no acredita "artes" al social manager ni "grilla" al diseñador del mismo cliente', () => {
    const clients = [client({ social_manager_id: 'social-1', designer_id: 'designer-1' })]
    const marks = [
      mark({ task_key: 'grilla', period_week: 1, status: 'si' }),
      mark({ task_key: 'artes', period_week: 1, status: 'si' }),
    ]

    const social = aggregateEmployeeFixedTasksByRole(marks, clients, weeks, 'social-1', {
      year: YEAR,
      month: MONTH,
    })
    const designer = aggregateEmployeeFixedTasksByRole(marks, clients, weeks, 'designer-1', {
      year: YEAR,
      month: MONTH,
    })

    // El social manager solo ve grilla/metricas/calendario, nunca artes.
    expect(social.byTaskKey.artes.meta).toBe(0)
    expect(social.byTaskKey.grilla.meta).toBeGreaterThan(0)
    // El diseñador solo ve artes, nunca grilla/metricas/calendario.
    expect(designer.byTaskKey.grilla.meta).toBe(0)
    expect(designer.byTaskKey.artes.meta).toBeGreaterThan(0)
  })

  it('una celda sin marca cuenta como NO cumplida (meta derivada del calendario)', () => {
    const clients = [client({ social_manager_id: 'social-1' })]
    // Sin ninguna marca: la meta debe seguir contando las celdas esperadas del mes.
    const agg = aggregateEmployeeFixedTasksByRole([], clients, weeks, 'social-1', {
      year: YEAR,
      month: MONTH,
    })
    expect(agg.meta).toBeGreaterThan(0)
    expect(agg.si).toBe(0)
    expect(agg.cumplimientoPct).toBe(0)
  })

  it('celdas "na" no cuentan ni en meta ni en cumplido', () => {
    const clients = [client({ social_manager_id: 'social-1' })]
    const marks = [mark({ task_key: 'grilla', period_week: 1, status: 'na' })]
    const agg = aggregateEmployeeFixedTasksByRole(marks, clients, weeks, 'social-1', {
      year: YEAR,
      month: MONTH,
    })
    // La celda semana1/grilla no debe sumar a la meta por estar en 'na'.
    const metaSinEsaCelda = aggregateEmployeeFixedTasksByRole([], clients, weeks, 'social-1', {
      year: YEAR,
      month: MONTH,
    }).meta
    expect(agg.meta).toBe(metaSinEsaCelda - 1)
  })

  it('respeta taskAppliesToClient (opt-out por cliente)', () => {
    const clients = [client({ social_manager_id: 'social-1', fixed_tasks: { grilla: false } })]
    const agg = aggregateEmployeeFixedTasksByRole([], clients, weeks, 'social-1', {
      year: YEAR,
      month: MONTH,
    })
    expect(agg.byTaskKey.grilla.meta).toBe(0)
  })

  it('sin ninguna cuenta asignada, meta es 0', () => {
    const clients = [client({ social_manager_id: 'otro' })]
    const agg = aggregateEmployeeFixedTasksByRole([], clients, weeks, 'social-1', {
      year: YEAR,
      month: MONTH,
    })
    expect(agg.meta).toBe(0)
  })

  it('puntualidad: una marca hecha después del deadline no cuenta como puntual', () => {
    const clients = [client({ social_manager_id: 'social-1' })]
    // "grilla" vence el miércoles de la semana; marcar el viernes es tarde.
    const week1 = weeks[0]
    const lateDate = new Date(week1.wed)
    lateDate.setDate(lateDate.getDate() + 3) // sábado, después del miércoles
    const marks = [
      mark({ task_key: 'grilla', period_week: 1, status: 'si', marked_at: lateDate.toISOString() }),
    ]
    const agg = aggregateEmployeeFixedTasksByRole(marks, clients, weeks, 'social-1', {
      year: YEAR,
      month: MONTH,
    })
    expect(agg.si).toBeGreaterThan(0)
    expect(agg.puntualPct).toBe(0)
  })

  it('puntualidad: una marca hecha antes del deadline cuenta como puntual', () => {
    const clients = [client({ social_manager_id: 'social-1' })]
    const week1 = weeks[0]
    const onTimeDate = new Date(week1.wed)
    onTimeDate.setHours(10, 0, 0, 0) // mismo día del deadline, antes de las 5pm
    const marks = [
      mark({
        task_key: 'grilla',
        period_week: 1,
        status: 'si',
        marked_at: onTimeDate.toISOString(),
      }),
    ]
    const agg = aggregateEmployeeFixedTasksByRole(marks, clients, weeks, 'social-1', {
      year: YEAR,
      month: MONTH,
    })
    expect(agg.puntualPct).toBe(1)
  })
})
