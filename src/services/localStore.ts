import { defaultCategories, type Experience } from '../domain'
let pending: Promise<IDBDatabase> | undefined
export function database() {
  return (pending ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('atlas-v2', 2)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of ['experiences', 'categories', 'reviews', 'visits', 'trips', 'meta'])
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      const tx = request.transaction!
      for (const category of defaultCategories) tx.objectStore('categories').put(category)
      const cursor = tx.objectStore('experiences').openCursor()
      cursor.onsuccess = () => {
        const c = cursor.result
        if (c) {
          const item = c.value as Experience
          c.update({
            ...item,
            categoryId: item.categoryId || item.category,
            environment: item.environment,
            deletedAt: item.deletedAt || null,
          })
          c.continue()
        }
      }
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close()
        pending = undefined
      }
      resolve(request.result)
    }
    request.onerror = () => {
      pending = undefined
      reject(new Error('Impossibile aprire l’archivio locale.'))
    }
    request.onblocked = () => {
      pending = undefined
      reject(
        new Error(
          'Chiudi le altre schede ATLAS e ricarica per aggiornare l’archivio senza perdere dati.',
        ),
      )
    }
  }))
}
export async function readAll<T>(store: string): Promise<T[]> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
export async function write(stores: string[], callback: (tx: IDBTransaction) => void) {
  const db = await database()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Salvataggio non riuscito.'))
    tx.onabort = () => reject(tx.error || new Error('Operazione annullata.'))
    try {
      callback(tx)
    } catch (error) {
      tx.abort()
      reject(error)
    }
  })
}
