import { describe, expect, it } from 'vitest'
import {
  filterExperiences,
  sortExperiences,
  validateExperience,
  validRating,
  type Experience,
  type Filters,
} from './domain'

// Fixture esclusivamente per test unitari: mai importate nell’applicazione.
const todo: Experience = {
  id: 'test-todo',
  title: 'Test cultura',
  description: '',
  category: 'Culture',
  status: 'TO_DO',
  priority: 'HIGH',
  address: 'Punto test A',
  latitude: 41.9,
  longitude: 12.5,
  imagePath: null,
  imageUrl: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}
const done: Experience = {
  ...todo,
  id: 'test-done',
  title: 'Test natura',
  category: 'Nature',
  status: 'DONE',
  priority: null,
  updatedAt: '2026-02-01',
}
const base: Filters = { status: 'ALL', category: '', priority: '', query: '' }
describe('Filtri reali sulle esperienze', () => {
  it('conserva TO_DO e DONE in Tutto', () =>
    expect(filterExperiences([todo, done], base)).toHaveLength(2))
  it('separa gli stati senza rimuovere dati dall’archivio', () => {
    expect(filterExperiences([todo, done], { ...base, status: 'DONE' })).toEqual([done])
    expect(filterExperiences([todo, done], { ...base, status: 'TO_DO' })).toEqual([todo])
  })
  it('combina categoria, stato, ricerca e priorità', () => {
    expect(
      filterExperiences([todo, done], {
        ...base,
        category: 'Culture',
        priority: 'HIGH',
        query: 'CULTURA',
      }),
    ).toEqual([todo])
    expect(filterExperiences([todo, done], { ...base, status: 'DONE', priority: 'HIGH' })).toEqual(
      [],
    )
    expect(filterExperiences([todo, done], { ...base, query: 'punto test' })).toHaveLength(2)
  })
  it('ordina senza mutare la lista originale', () => {
    const input = [todo, done]
    expect(sortExperiences(input, 'recent')[0]).toBe(done)
    expect(sortExperiences(input, 'priority')[0]).toBe(todo)
    expect(input).toEqual([todo, done])
  })
})
describe('Validazione prima della persistenza', () => {
  it('accetta creazione diretta di entrambi gli stati', () => {
    expect(validateExperience(todo)).toBeNull()
    expect(validateExperience(done)).toBeNull()
  })
  it('richiede priorità per TO_DO e la rimuove per DONE', () => {
    expect(validateExperience({ ...todo, priority: null })).not.toBeNull()
    expect(validateExperience({ ...done, priority: 'HIGH' })).not.toBeNull()
  })
  it('rifiuta titolo vuoto, coordinate non finite o fuori dal mondo', () => {
    expect(validateExperience({ ...todo, title: ' ' })).not.toBeNull()
    for (const longitude of [NaN, Infinity, 181, -181])
      expect(validateExperience({ ...todo, longitude })).not.toBeNull()
    expect(validateExperience({ ...todo, latitude: 90 })).not.toBeNull()
  })
  it('non trasforma un DONE quando si modificano le note', () =>
    expect(validateExperience({ ...done, description: 'Nuove note' })).toBeNull())
})
describe('Contratto valutazioni per il futuro Journal', () => {
  it('distingue voto zero, null e mezze stelle valide', () => {
    for (const value of [null, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5])
      expect(validRating(value)).toBe(true)
    for (const value of [-0.5, 5.5, 4.25, NaN, Infinity]) expect(validRating(value)).toBe(false)
  })
})
