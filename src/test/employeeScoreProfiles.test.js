import { describe, it, expect } from 'vitest'
import { resolveProfile, effectiveWeights, INDICATOR_KEYS } from '../utils/employeeScoreProfiles'

function profile(overrides = {}) {
  return {
    id: 'p1',
    name: 'Default',
    priority: 0,
    match: {},
    weights: {
      entregas: 25,
      puntualidad: 20,
      arrastre: 10,
      tareas_fijas: 15,
      piezas_av: 10,
      reuniones: 5,
      campanas: 5,
      chequeo: 5,
      tickets: 0,
    },
    is_default: true,
    ...overrides,
  }
}

describe('resolveProfile', () => {
  const profiles = [
    profile({ id: 'default', is_default: true, match: {} }),
    profile({
      id: 'it',
      is_default: false,
      match: { department_ids: [0] },
      weights: { tickets: 40 },
    }),
    profile({
      id: 'diseno',
      is_default: false,
      match: { position_ids: ['pos-diseno'] },
      weights: { entregas: 30 },
    }),
    profile({
      id: 'direccion',
      is_default: false,
      match: { min_level: 4 },
      weights: { entregas: 35 },
    }),
  ]

  it('devuelve el default cuando el empleado no matchea ningún perfil específico', () => {
    const user = { user_id: 'u1', position_id: 'pos-x', department_id: 5, access_level: 1 }
    expect(resolveProfile(user, profiles).id).toBe('default')
  })

  it('matchea por cargo (position_ids) con la mayor especificidad', () => {
    const user = { user_id: 'u2', position_id: 'pos-diseno', department_id: 5, access_level: 1 }
    expect(resolveProfile(user, profiles).id).toBe('diseno')
  })

  it('matchea por departamento cuando no hay match de cargo', () => {
    // "it" matchea por department_id en `match.department_ids`, no `department_id` — ver fixture
    const itProfiles = [
      profile({ id: 'default', is_default: true }),
      profile({
        id: 'it',
        is_default: false,
        match: { department_ids: [0] },
        weights: { tickets: 40 },
      }),
    ]
    const user = { user_id: 'u3', position_id: 'pos-x', department_id: 0, access_level: 1 }
    expect(resolveProfile(user, itProfiles).id).toBe('it')
  })

  it('cargo (position_ids) gana sobre nivel (min_level) aunque ambos matcheen', () => {
    const user = { user_id: 'u4', position_id: 'pos-diseno', department_id: 5, access_level: 4 }
    expect(resolveProfile(user, profiles).id).toBe('diseno')
  })

  it('nivel (min_level) matchea cuando el access_level del usuario lo supera', () => {
    const user = { user_id: 'u5', position_id: 'pos-x', department_id: 5, access_level: 4 }
    expect(resolveProfile(user, profiles).id).toBe('direccion')
  })

  it('sin perfiles devuelve null', () => {
    expect(resolveProfile({ user_id: 'u1' }, [])).toBeNull()
  })
})

describe('effectiveWeights — redistribución', () => {
  it('sin indicadores aplicables devuelve objeto vacío', () => {
    const weights = { entregas: 25, puntualidad: 20 }
    const results = [
      { key: 'entregas', aplica: false },
      { key: 'puntualidad', aplica: false },
    ]
    expect(effectiveWeights(weights, results)).toEqual({})
  })

  it('con todos aplicables, los pesos efectivos igualan a los base', () => {
    const weights = { entregas: 25, puntualidad: 20, arrastre: 10 }
    const results = [
      { key: 'entregas', aplica: true },
      { key: 'puntualidad', aplica: true },
      { key: 'arrastre', aplica: true },
    ]
    const eff = effectiveWeights(weights, results)
    expect(eff.entregas).toBeCloseTo(25 * (100 / 55))
    const sum = Object.values(eff).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(100)
  })

  it('redistribuye proporcionalmente el peso de los no aplicables entre los aplicables', () => {
    const weights = { entregas: 25, puntualidad: 20, arrastre: 10 }
    const results = [
      { key: 'entregas', aplica: true },
      { key: 'puntualidad', aplica: false }, // este peso se redistribuye
      { key: 'arrastre', aplica: true },
    ]
    const eff = effectiveWeights(weights, results)
    expect(eff.puntualidad).toBeUndefined()
    const sum = eff.entregas + eff.arrastre
    expect(sum).toBeCloseTo(100)
    // proporción entre entregas y arrastre se mantiene (25:10)
    expect(eff.entregas / eff.arrastre).toBeCloseTo(25 / 10)
  })

  it('un peso 0 en el perfil nunca aplica ni recibe redistribución', () => {
    const weights = { entregas: 25, tickets: 0 }
    const results = [
      { key: 'entregas', aplica: true },
      { key: 'tickets', aplica: true }, // aplica=true pero peso 0 → no participa
    ]
    const eff = effectiveWeights(weights, results)
    expect(eff.tickets).toBeUndefined()
    expect(eff.entregas).toBeCloseTo(100)
  })

  it('los 9 indicadores conocidos están en INDICATOR_KEYS', () => {
    expect(INDICATOR_KEYS).toHaveLength(9)
    expect(INDICATOR_KEYS).toContain('entregas')
    expect(INDICATOR_KEYS).toContain('tickets')
  })
})
