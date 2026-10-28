import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { Experience, Review } from '../domain'
import {
  addToTrip,
  categoryRepository,
  deleteLocalExperience,
  localAuthor,
  newTrip,
  reviewRepository,
  tripRepository,
  validateReview,
} from './archive'
import { loadExperiences, saveExperience } from './repository'
import { readAll } from './localStore'
import { emptyCriteria, matchExperiences, weatherDecision, weatherService } from './explorer'
const fixture = (patch: Partial<Experience> = {}): Experience => ({
  id: crypto.randomUUID(),
  title: 'TEST isolato',
  category: 'Nature',
  description: '',
  status: 'TO_DO',
  priority: 'LOW',
  address: 'Punto di test',
  latitude: 42,
  longitude: 12,
  environment: 'OUTDOOR',
  imageUrl: null,
  imagePath: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...patch,
})
describe('Categorie e integrità locale', () => {
  it('traduce le etichette senza cambiare gli ID storici', async () => {
    const cats = await categoryRepository.list()
    expect(cats.find((c) => c.id === 'Food')?.name).toBe('Cibo')
    expect(cats.find((c) => c.id === 'Nature')?.name).toBe('Natura')
  })
  it('crea, rinomina, cambia colore e riassegna prima di eliminare', async () => {
    const id = crypto.randomUUID()
    const cat = {
      id,
      slug: id,
      name: 'Test personalizzata',
      icon: 'coffee',
      color: '#88b7ff',
      isDefault: false,
    }
    await categoryRepository.save(cat)
    const item = fixture({ category: id })
    await saveExperience(item, null, 'local')
    await categoryRepository.save({ ...cat, name: 'Nome aggiornato', color: '#ff9c7d' })
    expect((await loadExperiences('local')).find((e) => e.id === item.id)?.category).toBe(id)
    await expect(categoryRepository.remove(id)).rejects.toThrow('riassegnare')
    await categoryRepository.remove(id, 'Other')
    expect((await loadExperiences('local')).find((e) => e.id === item.id)?.category).toBe('Other')
    expect((await categoryRepository.list()).some((c) => c.id === id)).toBe(false)
  })
})
describe('Visite e recensioni per autore', () => {
  it('salva DONE, data, note e voto 0 senza convertirlo in null', async () => {
    const item = fixture({ status: 'DONE', priority: null })
    await saveExperience(item, null, 'local', {
      rating: 0,
      notes: 'Il mio voto zero',
      visitedAt: '2026-10-22',
    })
    const review = (await reviewRepository.list(item.id))[0]!
    expect(review.rating).toBe(0)
    expect(review.authorId).toBe(await localAuthor())
    expect((await reviewRepository.visits()).find((v) => v.id === review.visitId)?.visitedAt).toBe(
      '2026-10-22',
    )
  })
  it('mantiene visite precedenti e mezze stelle senza un campo globale', async () => {
    const item = fixture({ status: 'DONE', priority: null })
    await saveExperience(item, null, 'local', {
      rating: 4.5,
      notes: 'Prima visita',
      visitedAt: null,
    })
    await saveExperience(item, null, 'local', {
      rating: null,
      notes: 'Nuova visita',
      visitedAt: null,
    })
    const list = await reviewRepository.list(item.id)
    expect(list).toHaveLength(2)
    expect(list.map((r) => r.rating)).toContain(null)
    expect(list.map((r) => r.rating)).toContain(4.5)
    await saveExperience({ ...item, status: 'TO_DO', priority: 'MEDIUM' }, null, 'local')
    expect(await reviewRepository.list(item.id)).toHaveLength(2)
  })
  it('rifiuta voti illegali, date impossibili e recensioni che non appartengono al luogo', async () => {
    expect(() => validateReview({ rating: 4.25, notes: '', visitedAt: null })).toThrow()
    expect(() => validateReview({ rating: 3, notes: '', visitedAt: '2026-02-31' })).toThrow()
    const item = fixture({ status: 'DONE', priority: null })
    await expect(
      saveExperience(item, null, 'local', {
        id: 'recensione-altrui',
        rating: 5,
        notes: '',
        visitedAt: null,
      }),
    ).rejects.toThrow('tue recensioni')
    expect((await loadExperiences('local')).some((e) => e.id === item.id)).toBe(false)
  })
})
describe('Viaggi e cancellazione logica', () => {
  it('condivide tappe e ordine tra i flussi senza duplicarle', async () => {
    const a = fixture(),
      b = fixture()
    await saveExperience(a, null, 'local')
    await saveExperience(b, null, 'local')
    const trip = addToTrip(newTrip(), [a.id, b.id, a.id])
    expect(trip.waypoints.map((w) => w.experienceId)).toEqual([a.id, b.id])
    trip.waypoints.reverse()
    await tripRepository.save(trip)
    const loaded = (await tripRepository.list()).find((t) => t.id === trip.id)!
    expect(loaded.waypoints[0]?.experienceId).toBe(b.id)
    const extended = addToTrip(loaded, [a.id])
    expect(extended.waypoints).toHaveLength(2)
  })
  it('nasconde il luogo eliminato ma preserva foto e referenze del viaggio', async () => {
    const item = fixture({ imageUrl: 'data:image/jpeg;base64,FIXTURE' })
    await saveExperience(item, null, 'local')
    const trip = addToTrip(newTrip(), [item.id])
    await tripRepository.save(trip)
    await deleteLocalExperience(item.id)
    expect((await loadExperiences('local')).find((e) => e.id === item.id)).toBeUndefined()
    expect((await readAll<Experience>('experiences')).find((e) => e.id === item.id)?.imageUrl).toBe(
      item.imageUrl,
    )
    expect(
      (await tripRepository.list()).find((t) => t.id === trip.id)?.waypoints[0]?.experienceId,
    ).toBe(item.id)
    await expect(tripRepository.save(trip)).rejects.toThrow('non è più disponibile')
  })
})
describe('Ricerca deterministica e limiti esterni', () => {
  it('usa solo il voto dell’autore corretto e distingue voto zero da assente', () => {
    const item = fixture({ status: 'DONE', priority: null })
    const review: Review = {
      id: 'r1',
      experienceId: item.id,
      visitId: 'v1',
      authorId: 'altra-persona',
      rating: 5,
      notes: '',
      createdAt: '2026',
      updatedAt: '2026',
    }
    expect(
      matchExperiences({ ...emptyCriteria, minRating: 4.5 }, [item], [review], 'io').experiences,
    ).toHaveLength(0)
    expect(
      matchExperiences(
        { ...emptyCriteria, minRating: 0 },
        [item],
        [{ ...review, authorId: 'io', rating: 0 }],
        'io',
      ).experiences,
    ).toHaveLength(1)
  })
  it('filtra ambiente e categoria senza fingere di verificare minuti o meteo', () => {
    const item = fixture()
    const result = matchExperiences(
      { ...emptyCriteria, categoryIds: ['Nature'], environment: 'OUTDOOR', maxDriveMinutes: 30 },
      [item],
      [],
      'io',
    )
    expect(result.experiences).toEqual([item])
    expect(result.warnings.join(' ')).toContain('non verificato')
    expect(
      matchExperiences({ ...emptyCriteria, environment: 'INDOOR' }, [item], [], 'io').experiences,
    ).toHaveLength(0)
    expect(matchExperiences(emptyCriteria, [item], [], 'io', [item.id]).experiences).toHaveLength(0)
  })
  it('non inventa previsioni per date lontane', async () => {
    expect(
      (await weatherService.forecast({ latitude: 42, longitude: 12, date: '2099-10-25' }))
        .available,
    ).toBe(false)
    expect(
      weatherDecision('INDOOR', { available: false, reason: 'Previsioni non ancora disponibili' })
        .requiresConsent,
    ).toBe(false)
  })
})
