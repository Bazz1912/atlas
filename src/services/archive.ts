import { validBudget } from '../../supabase/functions/_shared/atlas/costs'
import { currentScope } from '../account/scope'
import { rpc } from '../account/client'
import {
  cloudCategories,
  cloudCategorySave,
  cloudReviews,
  cloudVisits,
  cloudTrips,
  cloudTripSave,
  cloudTripRemove,
  cloudDeleteExperience,
  cloudSaveExperience,
} from '../account/cloudArchive'
import { database, readAll, write } from './localStore'
import {
  defaultCategories,
  validRating,
  type CategoryRecord,
  type Experience,
  type Review,
  type ReviewDraft,
  type Trip,
  type Visit,
} from '../domain'
import type { CategoryRepository, ReviewRepository, TripRepository } from './contracts'

let authorPromise: Promise<string> | undefined
export function localAuthor() {
  if (currentScope()) return Promise.resolve(currentScope()!.userId)
  return (authorPromise ||= (async () => {
    const db = await database()
    return new Promise<string>((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite')
      let value = ''
      const store = tx.objectStore('meta')
      const req = store.get('author')
      req.onsuccess = () => {
        value = req.result?.value || crypto.randomUUID()
        if (!req.result) store.put({ id: 'author', value })
      }
      tx.oncomplete = () => resolve(value)
      tx.onerror = () => reject(new Error('Identità locale non disponibile.'))
    })
  })())
}

export function validateReview(draft: ReviewDraft) {
  if (!validRating(draft.rating)) throw new Error('Scegli un voto da 0 a 5, con incrementi di 0,5.')
  if (draft.notes.length > 5000)
    throw new Error('Le note della visita possono contenere al massimo 5000 caratteri.')
  if (
    draft.visitedAt &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(draft.visitedAt) ||
      Number.isNaN(Date.parse(draft.visitedAt)) ||
      new Date(draft.visitedAt).toISOString().slice(0, 10) !== draft.visitedAt)
  )
    throw new Error('Data della visita non valida.')
}
export async function saveLocalBundle(item: Experience, draft?: ReviewDraft) {
  if (currentScope()) {
    await cloudSaveExperience(item, null, draft)
    return
  }
  const author = await localAuthor()
  const cats = await readAll<CategoryRecord>('categories')
  if (!cats.some((c) => c.id === item.category))
    throw new Error('La categoria non esiste più. Scegline un’altra.')
  if (draft) validateReview(draft)
  const oldReviews = draft?.id ? await readAll<Review>('reviews') : []
  const old = draft?.id ? oldReviews.find((r) => r.id === draft.id) : undefined
  if (draft?.id && (!old || old.authorId !== author || old.experienceId !== item.id))
    throw new Error('Puoi modificare soltanto le tue recensioni.')
  const now = new Date().toISOString()
  await write(['categories', 'experiences', 'reviews', 'visits'], (tx) => {
    const categoryRequest = tx.objectStore('categories').get(item.category)
    categoryRequest.onsuccess = () => {
      if (!categoryRequest.result) tx.abort()
    }
    tx.objectStore('experiences').put({
      ...item,
      categoryId: item.category,
      environment: item.environment,
      deletedAt: null,
    })
    if (draft && item.status === 'DONE') {
      const visitId = old?.visitId || crypto.randomUUID()
      tx.objectStore('visits').put({
        id: visitId,
        experienceId: item.id,
        visitedAt: draft.visitedAt,
        createdBy: author,
        createdAt: old?.createdAt || now,
      } satisfies Visit)
      tx.objectStore('reviews').put({
        id: old?.id || crypto.randomUUID(),
        experienceId: item.id,
        visitId,
        authorId: author,
        rating: draft.rating,
        notes: draft.notes.trim(),
        createdAt: old?.createdAt || now,
        updatedAt: now,
      } satisfies Review)
    }
  })
}
export const categoryRepository: CategoryRepository = {
  list: async () => {
    if (currentScope()) return cloudCategories()
    const list = await readAll<CategoryRecord>('categories')
    const order = defaultCategories.map((c) => c.id)
    return list.sort((a, b) => {
      const ai = order.indexOf(a.id),
        bi = order.indexOf(b.id)
      return ai >= 0 && bi >= 0
        ? ai - bi
        : ai >= 0
          ? -1
          : bi >= 0
            ? 1
            : a.name.localeCompare(b.name, 'it')
    })
  },
  async save(category) {
    if (currentScope()) return cloudCategorySave(category)
    if (
      !category.name.trim() ||
      category.name.trim().length > 60 ||
      !/^#[0-9a-f]{6}$/i.test(category.color)
    )
      throw new Error('Nome o colore della categoria non valido.')
    const list = await readAll<CategoryRecord>('categories')
    if (
      list.some(
        (c) =>
          c.id !== category.id &&
          c.name.toLocaleLowerCase('it') === category.name.trim().toLocaleLowerCase('it'),
      )
    )
      throw new Error('Esiste già una categoria con questo nome.')
    const old = list.find((c) => c.id === category.id)
    await write(['categories'], (tx) =>
      tx
        .objectStore('categories')
        .put({ ...category, name: category.name.trim(), isDefault: old?.isDefault || false }),
    )
  },
  async remove(id, replacementId) {
    if (currentScope()) {
      await rpc('atlas_remove_category', {
        target: currentScope()!.mapId,
        category: id,
        replacement: replacementId || null,
      })
      return
    }
    const [items, cats] = await Promise.all([
      readAll<Experience>('experiences'),
      readAll<CategoryRecord>('categories'),
    ])
    if (cats.length <= 1) throw new Error('Mantieni almeno una categoria.')
    const used = items.filter((e) => e.category === id)
    if (
      used.length &&
      (!replacementId || replacementId === id || !cats.some((c) => c.id === replacementId))
    )
      throw new Error('Scegli una categoria a cui riassegnare i luoghi.')
    await write(['categories', 'experiences'], (tx) => {
      if (replacementId) {
        const replacement = tx.objectStore('categories').get(replacementId)
        replacement.onsuccess = () => {
          if (!replacement.result) tx.abort()
        }
      }
      const cursor = tx.objectStore('experiences').openCursor()
      cursor.onsuccess = () => {
        const current = cursor.result
        if (current) {
          const item = current.value as Experience
          if (item.category === id) {
            if (!replacementId) {
              tx.abort()
              return
            }
            current.update({
              ...item,
              category: replacementId,
              categoryId: replacementId,
              updatedAt: new Date().toISOString(),
            })
          }
          current.continue()
        }
      }
      tx.objectStore('categories').delete(id)
    })
  },
}
export const reviewRepository: ReviewRepository = {
  async list(experienceId) {
    if (currentScope()) {
      const all = await cloudReviews()
      return experienceId ? all.filter((r) => r.experienceId === experienceId) : all
    }
    const all = await readAll<Review>('reviews')
    return experienceId ? all.filter((r) => r.experienceId === experienceId) : all
  },
  visits: () => (currentScope() ? cloudVisits() : readAll('visits')),
  async save(experienceId, draft) {
    if (currentScope()) {
      await rpc('atlas_save_review', {
        target: currentScope()!.mapId,
        experience: experienceId,
        draft,
      })
      return
    }
    const item = (await readAll<Experience>('experiences')).find(
      (e) => e.id === experienceId && !e.deletedAt,
    )
    if (!item || item.status !== 'DONE')
      throw new Error('La recensione richiede un’esperienza già fatta.')
    await saveLocalBundle(item, draft)
  },
}
export const tripRepository: TripRepository = {
  list: () => (currentScope() ? cloudTrips() : readAll('trips')),
  async save(trip) {
    if (trip.budget && !validBudget(trip.budget))
      throw new Error('Partecipanti o spese del preventivo non validi.')
    if (currentScope()) return cloudTripSave(trip)
    if (!trip.name.trim() || trip.name.length > 120)
      throw new Error('Dai un nome al viaggio (massimo 120 caratteri).')
    if (
      trip.waypoints.some(
        (w) => !Number.isFinite(w.stopMinutes) || w.stopMinutes < 0 || w.stopMinutes > 1440,
      )
    )
      throw new Error('Durata sosta non valida.')
    const items = await readAll<Experience>('experiences')
    if (trip.waypoints.some((w) => !items.some((i) => i.id === w.experienceId && !i.deletedAt)))
      throw new Error('Una tappa non è più disponibile.')
    await write(['trips'], (tx) =>
      tx.objectStore('trips').put({ ...trip, updatedAt: new Date().toISOString() }),
    )
  },
  async remove(id) {
    if (currentScope()) return cloudTripRemove(id)
    await write(['trips'], (tx) => tx.objectStore('trips').delete(id))
  },
}
export async function deleteLocalExperience(id: string) {
  if (currentScope()) return cloudDeleteExperience(id)
  const items = await readAll<Experience>('experiences')
  const item = items.find((e) => e.id === id)
  if (!item) throw new Error('Esperienza non trovata.')
  // Eliminazione logica: conserva integrità di recensioni e tappe. La foto resta nel cestino, esclusa dalle viste attive.
  await write(['experiences'], (tx) =>
    tx.objectStore('experiences').put({ ...item, deletedAt: new Date().toISOString() }),
  )
}
export function newTrip(): Trip {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: 'Nuovo viaggio',
    origin: null,
    date: '',
    waypoints: [],
    routeSummary: null,
    createdAt: now,
    updatedAt: now,
  }
}
export function addToTrip(trip: Trip, ids: string[]): Trip {
  return {
    ...trip,
    routeSummary: null,
    waypoints: [
      ...trip.waypoints,
      ...[...new Set(ids)]
        .filter((id) => !trip.waypoints.some((w) => w.experienceId === id))
        .map((experienceId) => ({ experienceId, stopMinutes: 60 })),
    ],
    updatedAt: new Date().toISOString(),
  }
}
export async function exportArchive() {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    experiences: await readAll('experiences'),
    categories: await categoryRepository.list(),
    reviews: await reviewRepository.list(),
    visits: await reviewRepository.visits(),
    trips: await tripRepository.list(),
    identity: await readAll('meta'),
  }
}
