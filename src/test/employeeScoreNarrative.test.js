import { describe, it, expect } from 'vitest'
import { buildScoreNarrative } from '../utils/employeeScoreNarrative'

function breakdown(overrides = {}) {
  const base = {
    entregas: { key: 'entregas', label: 'Cumplimiento de entregas', aplica: true, pct: 0.9 },
    puntualidad: { key: 'puntualidad', label: 'Entrega a tiempo', aplica: true, pct: 0.85 },
    arrastre: { key: 'arrastre', label: 'No arrastre / no bloqueo', aplica: true, pct: 0.7 },
    tareas_fijas: { key: 'tareas_fijas', label: 'Tareas fijas', aplica: false, pct: null },
    piezas_av: { key: 'piezas_av', label: 'Piezas audiovisuales', aplica: false, pct: null },
    reuniones: { key: 'reuniones', label: 'Asistencia a reuniones', aplica: true, pct: 0.75 },
    campanas: { key: 'campanas', label: 'Campañas con resultados', aplica: false, pct: null },
    chequeo: { key: 'chequeo', label: 'Chequeo de plataformas', aplica: false, pct: null },
    tickets: { key: 'tickets', label: 'Tickets IT en SLA', aplica: false, pct: null },
  }
  const merged = { ...base, ...overrides }
  return Object.values(merged)
}

describe('buildScoreNarrative', () => {
  it('es determinística: mismo input produce el mismo texto', () => {
    const result = { estado: 'ok', breakdown: breakdown() }
    const a = buildScoreNarrative(result, [])
    const b = buildScoreNarrative(result, [])
    expect(a).toBe(b)
  })

  it('devuelve el mensaje fijo cuando estado es sin_datos', () => {
    const result = { estado: 'sin_datos', breakdown: breakdown() }
    expect(buildScoreNarrative(result)).toMatch(/no hay datos suficientes/i)
  })

  it('nunca menciona un indicador que no aplica', () => {
    const result = {
      estado: 'ok',
      breakdown: breakdown({
        // el más débil de los aplicables es 'arrastre' (0.7); 'tickets' no aplica y
        // tiene un pct nulo — no debe poder colarse como "punto a mejorar".
        tickets: { key: 'tickets', label: 'Tickets IT en SLA', aplica: false, pct: null },
      }),
    }
    const text = buildScoreNarrative(result, [])
    expect(text.toLowerCase()).not.toContain('tickets')
    expect(text.toLowerCase()).not.toContain('tareas fijas')
    expect(text.toLowerCase()).not.toContain('piezas audiovisuales')
    expect(text.toLowerCase()).not.toContain('campañas')
    expect(text.toLowerCase()).not.toContain('chequeo')
  })

  it('destaca el punto más fuerte cuando algún indicador aplicable tiene pct >= 0.8', () => {
    const result = { estado: 'ok', breakdown: breakdown() }
    const text = buildScoreNarrative(result, [])
    expect(text).toMatch(/punto más fuerte.*cumplimiento de entregas/i)
  })

  it('señala el punto a mejorar cuando el más débil aplicable tiene pct < 0.6', () => {
    const result = {
      estado: 'ok',
      breakdown: breakdown({
        arrastre: { key: 'arrastre', label: 'No arrastre / no bloqueo', aplica: true, pct: 0.4 },
      }),
    }
    const text = buildScoreNarrative(result, [])
    expect(text).toMatch(/punto a mejorar.*no arrastre/i)
  })

  it('compara contra el promedio histórico solo para indicadores aplicables en ambos', () => {
    const result = {
      estado: 'ok',
      breakdown: breakdown({
        puntualidad: { key: 'puntualidad', label: 'Entrega a tiempo', aplica: true, pct: 0.5 },
      }),
    }
    const history = [
      {
        breakdown: breakdown({
          puntualidad: { key: 'puntualidad', label: 'Entrega a tiempo', aplica: true, pct: 0.9 },
        }),
      },
      {
        breakdown: breakdown({
          puntualidad: { key: 'puntualidad', label: 'Entrega a tiempo', aplica: true, pct: 0.85 },
        }),
      },
    ]
    const text = buildScoreNarrative(result, history)
    expect(text).toMatch(/bajaste en entrega a tiempo/i)
  })

  it('no compara un indicador que no aplicó en ningún mes histórico', () => {
    const result = { estado: 'ok', breakdown: breakdown() }
    const history = [
      {
        breakdown: breakdown({
          tickets: { key: 'tickets', label: 'Tickets IT en SLA', aplica: false, pct: null },
        }),
      },
    ]
    // no debe reventar ni mencionar tickets aunque el historial también lo tenga en null
    const text = buildScoreNarrative(result, history)
    expect(text.toLowerCase()).not.toContain('tickets')
  })

  it('cae al mensaje de estabilidad cuando no hay nada destacable', () => {
    const result = {
      estado: 'ok',
      breakdown: breakdown({
        entregas: { key: 'entregas', label: 'Cumplimiento de entregas', aplica: true, pct: 0.65 },
        puntualidad: { key: 'puntualidad', label: 'Entrega a tiempo', aplica: true, pct: 0.65 },
        arrastre: { key: 'arrastre', label: 'No arrastre / no bloqueo', aplica: true, pct: 0.65 },
        reuniones: { key: 'reuniones', label: 'Asistencia a reuniones', aplica: true, pct: 0.65 },
      }),
    }
    expect(buildScoreNarrative(result, [])).toMatch(/se mantiene estable/i)
  })

  it('nunca destaca "reuniones" como punto más fuerte aunque tenga el pct más alto', () => {
    const result = {
      estado: 'ok',
      breakdown: breakdown({
        reuniones: { key: 'reuniones', label: 'Asistencia a reuniones', aplica: true, pct: 1 },
      }),
    }
    const text = buildScoreNarrative(result, [])
    expect(text).toMatch(/punto más fuerte.*cumplimiento de entregas/i)
    expect(text.toLowerCase()).not.toContain('reuniones')
  })

  it('nunca señala "reuniones" como punto a mejorar aunque tenga el pct más bajo', () => {
    const result = {
      estado: 'ok',
      breakdown: breakdown({
        reuniones: { key: 'reuniones', label: 'Asistencia a reuniones', aplica: true, pct: 0 },
      }),
    }
    const text = buildScoreNarrative(result, [])
    expect(text.toLowerCase()).not.toContain('reuniones')
    // sigue destacando el punto más fuerte real (entregas) sin verse afectado
    expect(text).toMatch(/punto más fuerte.*cumplimiento de entregas/i)
  })

  it('no compara la tendencia de "reuniones" aunque haya caído respecto al historial', () => {
    const result = {
      estado: 'ok',
      breakdown: breakdown({
        reuniones: { key: 'reuniones', label: 'Asistencia a reuniones', aplica: true, pct: 0 },
      }),
    }
    const history = [
      {
        breakdown: breakdown({
          reuniones: { key: 'reuniones', label: 'Asistencia a reuniones', aplica: true, pct: 1 },
        }),
      },
    ]
    const text = buildScoreNarrative(result, history)
    expect(text.toLowerCase()).not.toContain('reuniones')
  })

  it('destaca una subida cuando no hay ninguna caída', () => {
    const result = {
      estado: 'ok',
      breakdown: breakdown({
        puntualidad: { key: 'puntualidad', label: 'Entrega a tiempo', aplica: true, pct: 0.9 },
      }),
    }
    const history = [
      {
        breakdown: breakdown({
          puntualidad: { key: 'puntualidad', label: 'Entrega a tiempo', aplica: true, pct: 0.5 },
        }),
      },
    ]
    const text = buildScoreNarrative(result, history)
    expect(text).toMatch(/subiste en entrega a tiempo/i)
  })

  it('prioriza la caída sobre la subida cuando ambas ocurren', () => {
    const result = {
      estado: 'ok',
      breakdown: breakdown({
        puntualidad: { key: 'puntualidad', label: 'Entrega a tiempo', aplica: true, pct: 0.9 },
        arrastre: { key: 'arrastre', label: 'No arrastre / no bloqueo', aplica: true, pct: 0.3 },
      }),
    }
    const history = [
      {
        breakdown: breakdown({
          puntualidad: { key: 'puntualidad', label: 'Entrega a tiempo', aplica: true, pct: 0.5 },
          arrastre: { key: 'arrastre', label: 'No arrastre / no bloqueo', aplica: true, pct: 0.7 },
        }),
      },
    ]
    const text = buildScoreNarrative(result, history)
    expect(text).toMatch(/bajaste en no arrastre/i)
    expect(text.toLowerCase()).not.toContain('subiste')
  })

  it('agrega cifras concretas del detalle para el punto más fuerte', () => {
    const result = {
      estado: 'ok',
      breakdown: breakdown({
        entregas: {
          key: 'entregas',
          label: 'Cumplimiento de entregas',
          aplica: true,
          pct: 0.9,
          detalle: { tUniverso: 50, tCerradas: 42, cSolicitadas: 0, cEntregadas: 0 },
        },
      }),
    }
    const text = buildScoreNarrative(result, [])
    expect(text).toContain('42 de 50 tareas')
    expect(text.toLowerCase()).not.toContain('cnp')
  })

  it('menciona la tendencia del puntaje global respecto al mes anterior medido', () => {
    const result = { estado: 'ok', breakdown: breakdown(), score: 69.4 }
    const history = [{ breakdown: breakdown(), score: 62 }]
    const text = buildScoreNarrative(result, history)
    expect(text).toMatch(/tu puntaje pasó de 62 a 69,4/i)
  })
})
