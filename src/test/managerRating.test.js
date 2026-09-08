import { describe, it, expect } from 'vitest'
import { ratingAverage, buildRatingItems } from '../utils/managerRating'

describe('ratingAverage', () => {
  it('promedia solo los items con score', () => {
    expect(ratingAverage([{ score: 4 }, { score: 5 }, { score: 3 }])).toBe(4)
  })

  it('ignora items sin puntuar', () => {
    expect(ratingAverage([{ score: 4 }, { score: null }])).toBe(4)
  })

  it('devuelve null si ningún item está puntuado', () => {
    expect(ratingAverage([{ score: null }, { score: undefined }])).toBeNull()
  })

  it('devuelve null con lista vacía o ausente', () => {
    expect(ratingAverage([])).toBeNull()
    expect(ratingAverage(undefined)).toBeNull()
  })

  it('redondea a 2 decimales', () => {
    expect(ratingAverage([{ score: 5 }, { score: 4 }, { score: 4 }])).toBe(4.33)
  })
})

describe('buildRatingItems', () => {
  const criteria = [
    { id: 'c1', icon: '⭐', name: 'Calidad' },
    { id: 'c2', icon: '🤝', name: 'Compromiso' },
  ]

  it('congela icon y name de cada criterio con su score', () => {
    const items = buildRatingItems(criteria, { c1: 5, c2: 3 })
    expect(items).toEqual([
      { criterion_id: 'c1', icon: '⭐', name: 'Calidad', score: 5 },
      { criterion_id: 'c2', icon: '🤝', name: 'Compromiso', score: 3 },
    ])
  })

  it('deja score null si el criterio no fue puntuado', () => {
    const items = buildRatingItems(criteria, { c1: 5 })
    expect(items[1].score).toBeNull()
  })

  it('devuelve lista vacía sin criterios', () => {
    expect(buildRatingItems([], {})).toEqual([])
    expect(buildRatingItems(undefined, {})).toEqual([])
  })
})
