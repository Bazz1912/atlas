import type { Experience, ReviewDraft } from '../domain'
import { validateExperience } from '../domain'
import { currentScope } from '../account/scope'
import { cloudExperiences, cloudSaveExperience } from '../account/cloudArchive'
import { blobToDataURL } from './photos'
import { readAll } from './localStore'
import { saveLocalBundle, deleteLocalExperience } from './archive'
import type { ExperienceRepository } from './contracts'
export type StorageMode = 'local' | 'cloud'
export async function loadExperiences(_mode: StorageMode): Promise<Experience[]> {
  if (currentScope()) return cloudExperiences()
  if (_mode === 'cloud') throw new Error('Accedi e seleziona una mappa.')
  return (await readAll<Experience>('experiences')).filter((x) => !x.deletedAt)
}
export async function saveExperience(
  item: Experience,
  photo: Blob | null,
  mode: StorageMode,
  review?: ReviewDraft,
): Promise<Experience> {
  const invalid = validateExperience(item)
  if (invalid) throw new Error(invalid)
  if (currentScope()) return cloudSaveExperience(item, photo, review)
  if (mode === 'cloud') throw new Error('Accedi e seleziona una mappa.')
  const updated = { ...item, updatedAt: new Date().toISOString() }
  if (photo) updated.imageUrl = await blobToDataURL(photo)
  await saveLocalBundle(updated, review)
  return updated
}
export const experienceRepository: ExperienceRepository = {
  list: () => loadExperiences('local'),
  save: (i, p, r) => saveExperience(i, p, 'local', r),
  remove: deleteLocalExperience,
}
