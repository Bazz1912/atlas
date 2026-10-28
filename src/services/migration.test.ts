import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
it('aggiorna IndexedDB v1 senza perdere il luogo o la fotografia preesistenti', async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('atlas-v2', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('experiences', { keyPath: 'id' })
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('experiences', 'readwrite')
      tx.objectStore('experiences').put({
        id: 'legacy',
        category: 'Food',
        title: 'Luogo esistente',
        imageUrl: 'data:image/jpeg;base64,LEGACY',
      })
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
    }
  })
  const { readAll } = await import('./localStore')
  const items = await readAll<{
    id: string
    categoryId: string
    imageUrl: string
    environment?: string
  }>('experiences')
  expect(items[0]).toMatchObject({
    id: 'legacy',
    categoryId: 'Food',
    imageUrl: 'data:image/jpeg;base64,LEGACY',
    environment: undefined,
  })
  expect(await readAll('categories')).toHaveLength(9)
})
