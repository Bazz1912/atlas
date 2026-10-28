import type { SupabaseClient } from '@supabase/supabase-js'
import type { Experience, Trip, RouteSummary } from './atlas/domain.ts'
import { fetchHere, HereError } from './here.ts'
import { routeFingerprint } from './atlas/routing.ts'
async function sha256(value: unknown) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  )
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('')
}
export async function limitedHereRoute(
  admin: SupabaseClient,
  actor: string,
  mapId: string,
  trip: Trip,
  items: Experience[],
  key: string,
  signal?: AbortSignal,
): Promise<RouteSummary> {
  if (!key)
    throw new HereError(
      'HERE non configurato: aggiungi HERE_API_KEY nei Supabase Secrets e distribuisci atlas-here-route.',
    )
  const requestId = crypto.randomUUID(),
    fingerprint = await sha256(['here-tolls-v2', routeFingerprint(trip, items)])
  const { data, error } = await admin.rpc('atlas_here_begin', {
    actor,
    target: mapId,
    request_id: requestId,
    fingerprint,
  })
  if (error)
    throw new HereError(
      'Preventivi HERE non configurati: applica la migrazione 202610260003_trip_costs.sql. Nessuna chiamata HERE eseguita.',
    )
  if (data?.status === 'cached') return data.response as RouteSummary
  if (data?.status === 'forbidden') throw new HereError('Non hai accesso alla mappa richiesta.')
  if (data?.status === 'limited')
    throw new HereError(
      'Limite HERE raggiunto: 6 richieste/minuto, 60/giorno per utente; 30/minuto e 300/giorno globali.',
    )
  if (data?.status !== 'claimed')
    throw new HereError('Un preventivo identico è già in calcolo. Attendi e riprova.')
  try {
    const route = await fetchHere(trip, items, key, signal)
    const { error: saveError } = await admin.rpc('atlas_here_finish', {
      actor,
      request_id: requestId,
      result: route,
    })
    if (saveError) throw new HereError('Impossibile completare il preventivo HERE in sicurezza.')
    return route
  } catch (error) {
    await admin.rpc('atlas_here_finish', { actor, request_id: requestId, result: null })
    throw error
  }
}
