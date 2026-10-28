import { backend } from '../account/client'
import { requireScope, assertScope } from '../account/scope'
import type { Experience, RouteSummary, TollQuote, Trip } from '../domain'
import { createTollRequestPool } from './tollRequests'
import { currentRoute } from './routing'
import {
  routeReference,
  routeReferenceKey,
} from '../../supabase/functions/_shared/atlas/tollComparison'
const pooledRequest = createTollRequestPool()

export function validTollQuote(data: unknown, reference: string): data is TollQuote {
  const q = data as TollQuote | null
  return (
    !!q &&
    q.reference === reference &&
    ['matched', 'alternative'].includes(q.comparison) &&
    Number.isFinite(Date.parse(q.calculatedAt)) &&
    Number.isFinite(q.hereDistanceMeters) &&
    q.hereDistanceMeters >= 0 &&
    !!q.tolls &&
    typeof q.tolls.complete === 'boolean' &&
    typeof q.tolls.noTolls === 'boolean' &&
    Array.isArray(q.tolls.groups) &&
    q.tolls.groups.every(
      (g) =>
        !!g &&
        typeof g.id === 'string' &&
        typeof g.name === 'string' &&
        Array.isArray(g.fares) &&
        g.fares.every(
          (f) =>
            !!f &&
            typeof f.id === 'string' &&
            typeof f.name === 'string' &&
            (f.euros === null ||
              (typeof f.euros === 'number' && Number.isFinite(f.euros) && f.euros >= 0)) &&
            typeof f.conditional === 'boolean' &&
            Array.isArray(f.paymentMethods) &&
            f.paymentMethods.every((m) => typeof m === 'string'),
        ),
    )
  )
}

// Explicit toll lookup only; never replaces the Geoapify route/geometry or triggers on map interactions.
export async function requestHereTolls(
  trip: Trip,
  items: Experience[],
  route: RouteSummary,
  signal?: AbortSignal,
): Promise<TollQuote> {
  if (route.provider !== 'geoapify' || !currentRoute({ ...trip, routeSummary: route }, items))
    throw new Error('Calcola prima il percorso Geoapify.')
  const scope = requireScope()
  const reference = routeReferenceKey(route)
  const result = await pooledRequest(
    `${scope.userId}:${scope.mapId}:${reference}`,
    async (requestSignal) => {
      const { data, error } = await backend().functions.invoke('atlas-here-route', {
        body: {
          mapId: scope.mapId,
          ids: trip.waypoints.map((w) => w.experienceId),
          origin: trip.origin
            ? { latitude: trip.origin.latitude, longitude: trip.origin.longitude }
            : null,
          roundTrip: !!trip.budget?.roundTrip,
          geoRoute: routeReference(route),
        },
        signal: requestSignal,
      })
      if (requestSignal.aborted) throw new DOMException('Richiesta annullata', 'AbortError')
      if (error) {
        let message =
          'Impossibile raggiungere la stima pedaggi. Controlla la connessione e riprova; se persiste, verifica le origini autorizzate della funzione.'
        if (error.context instanceof Response) {
          const status = error.context.status
          message =
            status === 401
              ? 'Sessione scaduta o non valida. Accedi di nuovo e riprova.'
              : status === 403
                ? 'Stima pedaggi non autorizzata per questa mappa o origine.'
                : status === 404
                  ? 'La funzione dei pedaggi non è disponibile sul server.'
                  : status === 429
                    ? 'Limite delle richieste pedaggi raggiunto. Attendi prima di riprovare.'
                    : 'Il servizio pedaggi non è disponibile. Riprova tra poco.'
          try {
            const body = await error.context.json()
            if (typeof body.error === 'string') message = body.error
          } catch {
            /* safe fallback */
          }
        }
        throw new Error(message)
      }
      if (!validTollQuote(data, reference))
        throw new Error(
          'La risposta dei pedaggi è incompleta o non corrisponde al percorso attuale. Riprova.',
        )
      return data
    },
    signal,
  )
  assertScope(scope)
  return result
}
