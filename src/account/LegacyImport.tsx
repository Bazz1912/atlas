import { useEffect, useState } from 'react'
import type { CategoryRecord, Experience, Review, Trip, Visit } from '../domain'
import { readAll } from '../services/localStore'
import { backend, rpc } from './client'
import { assertScope, requireScope } from './scope'
async function mappedId(namespace: string, id: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(namespace + ':' + id)),
  )
  bytes[6] = (bytes[6]! & 15) | 80
  bytes[8] = (bytes[8]! & 63) | 128
  const hex = Array.from(bytes.slice(0, 16), (n) => n.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export function LegacyImport({ onImported }: { onImported: () => Promise<void> }) {
  const [count, setCount] = useState(0),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('')
  useEffect(() => {
    void readAll<Experience>('experiences')
      .then((rows) => setCount(rows.filter((x) => !x.deletedAt).length))
      .catch(() => setError('Archivio precedente non leggibile. Non è stato modificato.'))
  }, [])
  if (!count && !error) return null
  const run = async () => {
    setBusy(true)
    setError('')
    try {
      const scope = requireScope()
      const [experiences, categories, reviews, visits, trips, meta] = await Promise.all([
        readAll<Experience>('experiences'),
        readAll<CategoryRecord>('categories'),
        readAll<Review>('reviews'),
        readAll<Visit>('visits'),
        readAll<Trip>('trips'),
        readAll<{ id: string; value: unknown }>('meta'),
      ])
      const author = meta.find((x) => x.id === 'author')?.value
      if (typeof author !== 'string')
        throw new Error('Identità locale mancante. Esporta il backup prima di procedere.')
      const source = author
      const { data: old, error } = await backend()
        .from('atlas_imports')
        .select('source_id')
        .eq('user_id', scope.userId)
        .eq('source_id', source)
      if (error) throw error
      if (old?.length)
        throw new Error(
          'Questo archivio è già stato importato nel tuo account. Nessun duplicato creato.',
        )
      const ns = scope.userId + ':' + scope.mapId + ':' + source
      const id = (v: string) => mappedId(ns, v)
      const cats = await Promise.all(
        categories.map(async (c) => ({
          ...c,
          id: await id('category:' + c.id),
          name: c.name.slice(0, 40) + ' · locale',
        })),
      )
      const active = experiences.filter((e) => !e.deletedAt)
      const imported = await Promise.all(
        active.map(async (e) => {
          let imagePath: string | null = null
          if (e.imageUrl?.startsWith('data:image/')) {
            const blob = await (await fetch(e.imageUrl)).blob()
            if (blob.size > 8 * 1024 * 1024) throw new Error('Una foto supera 8 MB.')
            imagePath = `${scope.mapId}/${scope.userId}/import-${await id(e.id)}.jpg`
            const { error } = await backend()
              .storage.from('atlas-images')
              .upload(imagePath, blob, { contentType: blob.type, cacheControl: '0', upsert: false })
            if (
              error &&
              error.message !== 'The resource already exists' &&
              (error as { statusCode?: string }).statusCode !== '409'
            )
              throw error
          } else if (e.imagePath || e.imageUrl)
            throw new Error('Una fotografia non è locale. Esportala prima di importare.')
          return {
            ...e,
            id: await id(e.id),
            category: await id('category:' + e.category),
            categoryId: await id('category:' + e.category),
            imagePath,
            imageUrl: null,
          }
        }),
      )
      const own = reviews.filter(
        (r) => r.authorId === author && active.some((e) => e.id === r.experienceId),
      )
      const rs = await Promise.all(
        own.map(async (r) => ({
          id: await id(r.id),
          experienceId: await id(r.experienceId),
          visitId: await id(r.visitId),
          rating: r.rating,
          notes: r.notes,
          visitedAt: visits.find((v) => v.id === r.visitId)?.visitedAt || null,
        })),
      )
      const ts = await Promise.all(
        trips
          .filter((t) => t.waypoints.every((w) => active.some((e) => e.id === w.experienceId)))
          .map(async (t) => ({
            ...t,
            id: await id(t.id),
            waypoints: await Promise.all(
              t.waypoints.map(async (w) => ({ ...w, experienceId: await id(w.experienceId) })),
            ),
          })),
      )
      assertScope(scope)
      await rpc('atlas_import_legacy', {
        target: scope.mapId,
        source_id: source,
        bundle: { categories: cats, experiences: imported, reviews: rs, trips: ts },
      })
      let verifiedCount = 0
      for (let offset = 0; offset < imported.length; offset += 50) {
        const { data: verified, error: ve } = await backend()
          .from('atlas_experiences')
          .select('id')
          .eq('map_id', scope.mapId)
          .in(
            'id',
            imported.slice(offset, offset + 50).map((e) => e.id),
          )
        if (ve) throw ve
        verifiedCount += verified.length
      }
      if (verifiedCount !== imported.length)
        throw new Error('Import salvato: verifica incompleta. Gli originali sono conservati.')
      setMessage(
        `${imported.length} luoghi importati e verificati. Originali conservati. Le recensioni sono attribuite al tuo account; le tappe eliminate non vengono importate.`,
      )
      await onImported()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import non riuscito. Originali conservati.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="account-card">
      <h3>Importa i tuoi luoghi</h3>
      <p>
        Questo browser contiene {count} luoghi dell’archivio precedente. Verranno copiati nella
        mappa attualmente selezionata. In una mappa condivisa saranno visibili ai membri.
      </p>
      <label className="consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        Confermo che questi dati e le recensioni locali sono miei e autorizzo l’importazione nella
        mappa selezionata.
      </label>
      <button className="secondary-button" disabled={!consent || busy} onClick={() => void run()}>
        {busy ? 'Importazione foto e luoghi…' : 'Importa nella mappa attiva'}
      </button>
      <p className="field-help">
        Una sola importazione per account e archivio. Non elimina gli originali; errori e retry non
        duplicano i dati. Le foto caricate prima di un errore restano private.
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
