import { describe, it, expect } from 'vitest'
import {
  aggregateUsageMonitor,
  computeLineStatus,
  moduleVerdict,
  USAGE_MODULES,
  BASELINE_MIN,
} from '../utils/aggregateUsageMonitor'

// Septiembre 2026 es el mes visible; jun/jul/ago son los 3 meses base.
const YEAR = 2026
const MONTH = 9

function line(overrides = {}) {
  return {
    id: 'l1',
    name: 'Team Bianca',
    color: '#EC4899',
    lead_user_id: 'jefa-1',
    member_user_ids: ['jefa-1', 'miembro-1'],
    ...overrides,
  }
}

function users() {
  return [
    { user_id: 'jefa-1', first_name: 'Bianca', last_name: 'R.' },
    { user_id: 'miembro-1', first_name: 'María', last_name: 'Vanessa' },
    { user_id: 'externo-1', first_name: 'Paola', last_name: 'G.' },
  ]
}

function emptyRaw(overrides = {}) {
  return { meetings: [], tasks: [], fixedMarks: [], cnp: [], pautas: [], ...overrides }
}

describe('aggregateUsageMonitor', () => {
  it('cuenta reuniones creadas por line_id/created_by en el mes correcto', () => {
    const raw = emptyRaw({
      meetings: [
        {
          line_id: 'l1',
          created_by: 'jefa-1',
          created_at: '2026-09-05T10:00:00Z',
          starts_at: '2026-09-10T10:00:00Z',
          status: 'programada',
        },
      ],
    })
    const { byLine } = aggregateUsageMonitor({
      lines: [line()],
      users: users(),
      raw,
      year: YEAR,
      month: MONTH,
    })
    expect(byLine[0].counts.reuniones).toBe(1)
  })

  it('cuenta reunión creada Y marcada realizada como dos acciones si ambas caen en el mes', () => {
    const raw = emptyRaw({
      meetings: [
        {
          line_id: 'l1',
          created_by: 'jefa-1',
          created_at: '2026-09-01T10:00:00Z',
          starts_at: '2026-09-02T10:00:00Z',
          status: 'realizada',
        },
      ],
    })
    const { byLine } = aggregateUsageMonitor({
      lines: [line()],
      users: users(),
      raw,
      year: YEAR,
      month: MONTH,
    })
    expect(byLine[0].counts.reuniones).toBe(2)
  })

  it('normaliza ids uuid/text (marked_by en fixed_task_marks es uuid) al agrupar', () => {
    const raw = emptyRaw({
      fixedMarks: [
        {
          line_id: 'l1',
          marked_by: 'jefa-1',
          marked_at: '2026-09-02T10:00:00Z',
          period_year: 2026,
          period_month: 9,
          period_week: 1,
          task_key: 'grilla',
          status: 'si',
        },
      ],
    })
    const { byLine } = aggregateUsageMonitor({
      lines: [line()],
      users: users(),
      raw,
      year: YEAR,
      month: MONTH,
    })
    expect(byLine[0].counts.tareasFijas).toBe(1)
  })

  it('excluye marcas "na" del conteo de Tareas Fijas', () => {
    const raw = emptyRaw({
      fixedMarks: [
        {
          line_id: 'l1',
          marked_by: 'jefa-1',
          marked_at: '2026-09-02T10:00:00Z',
          period_year: 2026,
          period_month: 9,
          period_week: 1,
          task_key: 'grilla',
          status: 'na',
        },
      ],
    })
    const { byLine } = aggregateUsageMonitor({
      lines: [line()],
      users: users(),
      raw,
      year: YEAR,
      month: MONTH,
    })
    expect(byLine[0].counts.tareasFijas).toBe(0)
  })

  it('atribuye tareas por team_id (line_id) y cnp/pautas por line_id', () => {
    const raw = emptyRaw({
      tasks: [
        { team_id: 'l1', created_by: 'jefa-1', created_at: '2026-09-03', due_date: '2026-09-10' },
      ],
      cnp: [{ line_id: 'l1', created_by: 'jefa-1', created_at: '2026-09-03T00:00:00Z' }],
      pautas: [{ line_id: 'l1', created_by: 'jefa-1', created_at: '2026-09-03T00:00:00Z' }],
    })
    const { byLine } = aggregateUsageMonitor({
      lines: [line()],
      users: users(),
      raw,
      year: YEAR,
      month: MONTH,
    })
    expect(byLine[0].counts.tareas).toBe(1)
    expect(byLine[0].counts.cnp).toBe(1)
    expect(byLine[0].counts.pautasAv).toBe(1)
  })

  it('Tareas: solo cuenta a quien CREÓ la tarea — a quién se la asignen no suma', () => {
    const raw = emptyRaw({
      tasks: [
        {
          team_id: 'l1',
          created_by: 'jefa-1',
          assignee_ids: ['miembro-1'],
          created_at: '2026-09-03',
          due_date: null,
        },
      ],
    })
    const { byLine } = aggregateUsageMonitor({
      lines: [line()],
      users: users(),
      raw,
      year: YEAR,
      month: MONTH,
    })
    expect(byLine[0].counts.tareas).toBe(1) // la jefa creó 1
    expect(byLine[0].members.find((m) => m.userId === 'miembro-1').counts.tareas).toBe(0) // asignada, no cuenta
  })

  it('puntualidad de Tareas: crear y completar el mismo día del vencimiento cuenta como a tiempo', () => {
    const raw = emptyRaw({
      tasks: [
        { team_id: 'l1', created_by: 'jefa-1', created_at: '2026-09-10', due_date: '2026-09-10' },
      ],
    })
    const { byLine } = aggregateUsageMonitor({
      lines: [line()],
      users: users(),
      raw,
      year: YEAR,
      month: MONTH,
    })
    expect(byLine[0].punctuality).toBe('al_dia')
  })

  it('puntualidad de Tareas: crear un día DESPUÉS del vencimiento cuenta como tardía', () => {
    const raw = emptyRaw({
      tasks: [
        { team_id: 'l1', created_by: 'jefa-1', created_at: '2026-09-11', due_date: '2026-09-10' },
      ],
    })
    const { byLine } = aggregateUsageMonitor({
      lines: [line()],
      users: users(),
      raw,
      year: YEAR,
      month: MONTH,
    })
    expect(byLine[0].punctuality).toBe('con_atraso')
  })

  it('punctualityBreakdown desglosa late/total por módulo (reuniones, tareas, tareas fijas)', () => {
    const raw = emptyRaw({
      tasks: [
        { team_id: 'l1', created_by: 'jefa-1', created_at: '2026-09-11', due_date: '2026-09-10' },
      ],
      meetings: [
        {
          line_id: 'l1',
          created_by: 'jefa-1',
          created_at: '2026-09-14T10:00:00Z',
          starts_at: '2026-09-10T10:00:00Z',
          status: 'programada',
        },
        {
          line_id: 'l1',
          created_by: 'jefa-1',
          created_at: '2026-09-05T10:00:00Z',
          starts_at: '2026-09-10T10:00:00Z',
          status: 'programada',
        },
      ],
      fixedMarks: [
        {
          line_id: 'l1',
          marked_by: 'jefa-1',
          marked_at: '2026-09-10T10:00:00Z',
          period_year: 2026,
          period_month: 9,
          period_week: 1,
          task_key: 'grilla',
          status: 'si',
        },
      ],
    })
    const { byLine } = aggregateUsageMonitor({
      lines: [line()],
      users: users(),
      raw,
      year: YEAR,
      month: MONTH,
    })
    expect(byLine[0].punctualityBreakdown.tareas).toEqual({ late: 1, total: 1 })
    expect(byLine[0].punctualityBreakdown.reuniones).toEqual({ late: 1, total: 2 })
    expect(byLine[0].punctualityBreakdown.tareasFijas).toEqual({ late: 1, total: 1 }) // grilla vence el miércoles (2 sep); marcada el 10
  })

  it('punctualityBreakdown en cero cuando todo está a tiempo', () => {
    const raw = emptyRaw({
      tasks: [
        { team_id: 'l1', created_by: 'jefa-1', created_at: '2026-09-10', due_date: '2026-09-10' },
      ],
    })
    const { byLine } = aggregateUsageMonitor({
      lines: [line()],
      users: users(),
      raw,
      year: YEAR,
      month: MONTH,
    })
    expect(byLine[0].punctualityBreakdown.tareas).toEqual({ late: 0, total: 1 })
    expect(byLine[0].punctualityBreakdown.reuniones).toEqual({ late: 0, total: 0 })
    expect(byLine[0].punctualityBreakdown.tareasFijas).toEqual({ late: 0, total: 0 })
  })

  it('mes sin datos da ceros en todos los módulos, sin crashear', () => {
    const { byLine } = aggregateUsageMonitor({
      lines: [line()],
      users: users(),
      raw: emptyRaw(),
      year: YEAR,
      month: MONTH,
    })
    USAGE_MODULES.forEach((m) => expect(byLine[0].counts[m.key]).toBe(0))
    expect(byLine[0].total).toBe(0)
  })

  it('el apoyo externo (actor con line_id de la línea pero sin ser miembro) suma al total del equipo', () => {
    const raw = emptyRaw({
      tasks: [
        { team_id: 'l1', created_by: 'jefa-1', created_at: '2026-09-03', due_date: null },
        { team_id: 'l1', created_by: 'miembro-1', created_at: '2026-09-03', due_date: null },
        { team_id: 'l1', created_by: 'externo-1', created_at: '2026-09-03', due_date: null },
      ],
    })
    const { byLine } = aggregateUsageMonitor({
      lines: [line()],
      users: users(),
      raw,
      year: YEAR,
      month: MONTH,
    })
    const [l1] = byLine
    // jefa + miembro-1 + externo-1: todo lo cargado con el line_id de esta línea cuenta,
    // sea o no quien lo cargó parte del roster formal.
    expect(l1.counts.tareas).toBe(3)
    expect(l1.members.find((m) => m.userId === 'miembro-1').total).toBe(1)
    // El apoyo externo se sigue listando aparte, para saber QUIÉN aportó desde afuera
    // del roster — pero ya no se excluye del total de la línea.
    expect(l1.external.map((e) => e.name)).toContain('Paola G.')
  })

  it('counts del equipo suma jefa + miembros, no solo lo que crea la jefa', () => {
    const raw = emptyRaw({
      tasks: [
        { team_id: 'l1', created_by: 'jefa-1', created_at: '2026-09-03', due_date: null },
        { team_id: 'l1', created_by: 'miembro-1', created_at: '2026-09-04', due_date: null },
        { team_id: 'l1', created_by: 'miembro-1', created_at: '2026-09-05', due_date: null },
      ],
    })
    const { byLine } = aggregateUsageMonitor({
      lines: [line()],
      users: users(),
      raw,
      year: YEAR,
      month: MONTH,
    })
    expect(byLine[0].counts.tareas).toBe(3) // 1 de la jefa + 2 del miembro
    expect(byLine[0].total).toBe(3)
    // El desglose propio de la jefa (para la fila "Jefa" del detalle) sigue
    // mostrando solo lo que ELLA creó, separado del total de equipo.
    expect(byLine[0].lead.counts.tareas).toBe(1)
    expect(byLine[0].lead.total).toBe(1)
  })

  it('la baseline es el promedio literal de los 3 meses previos, incluyendo meses en 0', () => {
    const raw = emptyRaw({
      tasks: [
        { team_id: 'l1', created_by: 'jefa-1', created_at: '2026-06-01', due_date: null }, // junio: 1
        // julio: 0
        { team_id: 'l1', created_by: 'jefa-1', created_at: '2026-08-01', due_date: null }, // agosto: 1
        { team_id: 'l1', created_by: 'jefa-1', created_at: '2026-08-02', due_date: null }, // agosto: 2 total
      ],
    })
    const { byLine } = aggregateUsageMonitor({
      lines: [line()],
      users: users(),
      raw,
      year: YEAR,
      month: MONTH,
    })
    // (1 + 0 + 2) / 3 = 1
    expect(byLine[0].baseline.tareas).toBe(1)
  })

  it('peerAvg promedia las OTRAS jefas, no la propia', () => {
    const l1 = line({ id: 'l1', lead_user_id: 'jefa-1', member_user_ids: ['jefa-1'] })
    const l2 = line({
      id: 'l2',
      name: 'Team Sabrina',
      lead_user_id: 'jefa-2',
      member_user_ids: ['jefa-2'],
    })
    const raw = emptyRaw({
      tasks: [
        { team_id: 'l1', created_by: 'jefa-1', created_at: '2026-09-01', due_date: null },
        { team_id: 'l2', created_by: 'jefa-2', created_at: '2026-09-01', due_date: null },
        { team_id: 'l2', created_by: 'jefa-2', created_at: '2026-09-02', due_date: null },
      ],
    })
    const withUsers = [...users(), { user_id: 'jefa-2', first_name: 'Sabrina', last_name: 'B.' }]
    const { byLine } = aggregateUsageMonitor({
      lines: [l1, l2],
      users: withUsers,
      raw,
      year: YEAR,
      month: MONTH,
    })
    const line1 = byLine.find((l) => l.lineId === 'l1')
    expect(line1.peerAvg.tareas).toBe(2) // solo jefa-2, que tiene 2
  })
})

describe('moduleVerdict', () => {
  it('activo cuando actual está por encima del 60% de la baseline', () => {
    expect(moduleVerdict(6, 10, 0)).toBe('activo')
  })

  it('caida solo si la baseline es fiable (>= BASELINE_MIN) y actual cae por debajo del 60%', () => {
    expect(moduleVerdict(1, 10, 0)).toBe('caida')
    expect(moduleVerdict(0.5, 1, 0)).not.toBe('caida') // baseline < BASELINE_MIN, no penaliza como caída
  })

  it('cero_propio cuando actual=0 y antes lo usaba (baseline >= 1)', () => {
    expect(moduleVerdict(0, 2, 0)).toBe('cero_propio')
  })

  it('cero_vs_pares cuando actual=0, la jefa nunca lo usó, pero sus pares sí', () => {
    expect(moduleVerdict(0, 0, 2)).toBe('cero_vs_pares')
  })

  it('na cuando nadie usa el módulo (ni ella ni sus pares) — no penaliza', () => {
    expect(moduleVerdict(0, 0, 0)).toBe('na')
  })

  it('BASELINE_MIN es 3 (constante con nombre, no mágica)', () => {
    expect(BASELINE_MIN).toBe(3)
  })
})

describe('computeLineStatus (semáforo)', () => {
  function counts(vals) {
    const c = {}
    USAGE_MODULES.forEach((m, i) => {
      c[m.key] = vals[i] ?? 0
    })
    return c
  }

  it('verde cuando todos los módulos están activos y sin caídas', () => {
    const c = counts([10, 10, 10, 10, 10])
    const { status } = computeLineStatus({
      counts: c,
      baseline: c,
      peerAvg: c,
      total: 50,
      baselineTotal: 50,
    })
    expect(status).toBe('verde')
  })

  it('amarillo cuando hay una caída puntual pero no generalizada', () => {
    const baseline = counts([10, 10, 10, 10, 10])
    const actual = counts([2, 10, 10, 10, 10]) // reuniones cae fuerte
    const { status } = computeLineStatus({
      counts: actual,
      baseline,
      peerAvg: baseline,
      total: 42,
      baselineTotal: 50,
    })
    expect(status).toBe('amarillo')
  })

  it('rojo cuando la mayoría de los módulos aplicables están en cero', () => {
    const baseline = counts([5, 5, 5, 5, 5])
    const actual = counts([0, 0, 0, 10, 10])
    const { status } = computeLineStatus({
      counts: actual,
      baseline,
      peerAvg: baseline,
      total: 20,
      baselineTotal: 25,
    })
    expect(status).toBe('rojo')
  })

  it('rojo cuando el total del mes cae por debajo del 40% del promedio de 3 meses, aunque no todo esté en cero', () => {
    const baseline = counts([10, 10, 10, 10, 10]) // baselineTotal = 50
    const actual = counts([2, 2, 2, 2, 2]) // total = 10 < 50*0.4=20
    const { status } = computeLineStatus({
      counts: actual,
      baseline,
      peerAvg: baseline,
      total: 10,
      baselineTotal: 50,
    })
    expect(status).toBe('rojo')
  })

  it('un módulo que nadie usa (na en todos lados) no arrastra a rojo por sí solo', () => {
    const baseline = counts([10, 10, 10, 10, 0])
    const actual = counts([10, 10, 10, 10, 0]) // pautas av en 0 para todos: 'na'
    const { status } = computeLineStatus({
      counts: actual,
      baseline,
      peerAvg: baseline,
      total: 40,
      baselineTotal: 40,
    })
    expect(status).toBe('verde')
  })
})
