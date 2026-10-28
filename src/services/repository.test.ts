import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { loadExperiences, saveExperience } from './repository'
import type { Experience } from '../domain'

describe('Archivio locale IndexedDB (database isolato di test)', () => {
  const experience: Experience = {
    id: crypto.randomUUID(),
    title: 'Fixture di test',
    description: 'Non appare nell’app',
    category: 'Nature',
    status: 'TO_DO',
    priority: 'LOW',
    address: 'Punto test',
    latitude: 45,
    longitude: 9,
    imagePath: null,
    imageUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  it('crea e rilegge un’esperienza persistita', async () => {
    await saveExperience(experience, null, 'local')
    const loaded = await loadExperiences('local')
    expect(loaded.find((item) => item.id === experience.id)?.title).toBe(experience.title)
  })
  it('aggiorna lo stesso ID senza duplicarlo né perderlo passando a DONE', async () => {
    await saveExperience({ ...experience, status: 'DONE', priority: null }, null, 'local')
    const loaded = await loadExperiences('local')
    expect(loaded.filter((item) => item.id === experience.id)).toHaveLength(1)
    expect(loaded.find((item) => item.id === experience.id)?.status).toBe('DONE')
    await saveExperience({ ...experience, status: 'TO_DO', priority: 'HIGH' }, null, 'local')
    expect(
      (await loadExperiences('local')).find((item) => item.id === experience.id)?.priority,
    ).toBe('HIGH')
  })
  it('crea direttamente DONE e conserva una foto locale già serializzata', async () => {
    const direct = {
      ...experience,
      id: crypto.randomUUID(),
      status: 'DONE' as const,
      priority: null,
      imageUrl: 'data:image/jpeg;base64,TEST_FIXTURE',
    }
    await saveExperience(direct, null, 'local')
    expect((await loadExperiences('local')).find((item) => item.id === direct.id)).toMatchObject({
      status: 'DONE',
      imageUrl: direct.imageUrl,
    })
  })
  it('rifiuta dati invalidi prima di scrivere', async () => {
    const invalid = { ...experience, id: crypto.randomUUID(), longitude: 200 }
    await expect(saveExperience(invalid, null, 'local')).rejects.toThrow('Coordinate')
    expect((await loadExperiences('local')).find((item) => item.id === invalid.id)).toBeUndefined()
  })
})
