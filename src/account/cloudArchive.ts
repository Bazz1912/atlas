import type { CategoryRecord, Experience, Review, ReviewDraft, Trip, Visit } from '../domain'
import { validateExperience } from '../domain'
import { backend, rpc } from './client'
import { assertScope, requireScope } from './scope'
export async function cloudRows<T>(table: string): Promise<T[]> {
  const scope = requireScope()
  const { data, error } = await backend()
    .from(`atlas_${table}`)
    .select('*')
    .eq('map_id', scope.mapId)
  if (error) throw new Error(error.message)
  assertScope(scope)
  return data as T[]
}
export async function cloudCategories(): Promise<CategoryRecord[]> {
  return (
    await cloudRows<{ id: string; name: string; icon: string; color: string; is_default: boolean }>(
      'categories',
    )
  ).map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    isDefault: r.is_default,
    slug: r.id,
  }))
}
export async function cloudExperiences(): Promise<Experience[]> {
  const scope = requireScope()
  const rows = await cloudRows<{
    id: string
    data: Experience
    image_path: string | null
    deleted_at: string | null
    created_at: string
    updated_at: string
  }>('experiences')
  const items = await Promise.all(
    rows
      .filter((r) => !r.deleted_at)
      .map(async (r) => {
        let imageUrl = null
        if (r.image_path) {
          const { data, error } = await backend()
            .storage.from('atlas-images')
            .createSignedUrl(r.image_path, 900)
          if (error) throw new Error('Foto non disponibile: ' + error.message)
          imageUrl = data.signedUrl
        }
        return {
          ...r.data,
          id: r.id,
          imagePath: r.image_path,
          imageUrl,
          deletedAt: r.deleted_at,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }
      }),
  )
  assertScope(scope)
  return items
}
export async function cloudSaveExperience(
  item: Experience,
  photo: Blob | null,
  review?: ReviewDraft,
) {
  const scope = requireScope()
  const invalid = validateExperience(item)
  if (invalid) throw new Error(invalid)
  let path = item.imagePath
  if (photo) {
    path = `${scope.mapId}/${scope.userId}/${crypto.randomUUID()}.jpg`
    const { error } = await backend()
      .storage.from('atlas-images')
      .upload(path, photo, { contentType: photo.type || 'image/jpeg', cacheControl: '0' })
    if (error) throw new Error(error.message)
  }
  assertScope(scope)
  await rpc('atlas_save_experience', {
    target: scope.mapId,
    item: { ...item, imageUrl: null, imagePath: path },
    review: review || null,
  })
  assertScope(scope)
  return {
    ...item,
    imagePath: path,
    imageUrl: photo ? URL.createObjectURL(photo) : item.imageUrl,
    updatedAt: new Date().toISOString(),
  }
}
export async function cloudCategorySave(c: CategoryRecord) {
  const s = requireScope()
  const { error } = await backend().from('atlas_categories').upsert({
    map_id: s.mapId,
    id: c.id,
    name: c.name.trim(),
    icon: c.icon,
    color: c.color,
    is_default: c.isDefault,
  })
  if (error) throw new Error(error.message)
  assertScope(s)
}
export async function cloudDeleteExperience(id: string) {
  const s = requireScope()
  const { error } = await backend()
    .from('atlas_experiences')
    .update({ deleted_at: new Date().toISOString() })
    .eq('map_id', s.mapId)
    .eq('id', id)
  if (error) throw new Error(error.message)
  assertScope(s)
}
export async function cloudReviews(): Promise<Review[]> {
  return (
    await cloudRows<{
      id: string
      experience_id: string
      author_id: string
      visit_id: string
      rating: number | null
      notes: string
      created_at: string
      updated_at: string
    }>('reviews')
  ).map((r) => ({
    id: r.id,
    experienceId: r.experience_id,
    authorId: r.author_id,
    visitId: r.visit_id,
    rating: r.rating,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}
export async function cloudVisits(): Promise<Visit[]> {
  return (
    await cloudRows<{
      id: string
      experience_id: string
      user_id: string
      visited_at: string | null
      created_at: string
    }>('visits')
  ).map((r) => ({
    id: r.id,
    experienceId: r.experience_id,
    createdBy: r.user_id,
    visitedAt: r.visited_at,
    createdAt: r.created_at,
  }))
}
export async function cloudTrips(): Promise<Trip[]> {
  return (await cloudRows<{ id: string; data: Trip }>('trips')).map((r) => ({
    ...r.data,
    id: r.id,
  }))
}
export async function cloudTripSave(t: Trip) {
  await rpc('atlas_save_trip', { target: requireScope().mapId, item: t })
}
export async function cloudTripRemove(id: string) {
  const s = requireScope()
  const { error } = await backend().from('atlas_trips').delete().eq('map_id', s.mapId).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function cloudReviewRemove(id: string) {
  const s = requireScope()
  const { error } = await backend()
    .from('atlas_reviews')
    .delete()
    .eq('map_id', s.mapId)
    .eq('author_id', s.userId)
    .eq('id', id)
  if (error) throw new Error(error.message)
}
