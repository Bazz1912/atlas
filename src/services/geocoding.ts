import type { Place } from '../domain'
import { geoapifyRequest, validCoordinates } from './geoapify'
export function parsePlaces(payload: unknown): Place[] {
  const data = payload as { results?: { formatted?: unknown; lat?: unknown; lon?: unknown }[] }
  if (!data || !Array.isArray(data.results))
    throw new Error('Risposta indirizzi Geoapify non valida.')
  return data.results
    .filter(
      (p) =>
        typeof p.formatted === 'string' && p.formatted.trim() && validCoordinates(p.lat, p.lon),
    )
    .map((p) => ({
      address: p.formatted as string,
      latitude: p.lat as number,
      longitude: p.lon as number,
      source: 'search',
    }))
}
export async function searchPlaces(query: string, signal: AbortSignal): Promise<Place[]> {
  if (query.trim().length < 3) return []
  return parsePlaces(
    await geoapifyRequest(
      'geocode/autocomplete',
      { text: query.trim(), lang: 'it', limit: '5', format: 'json' },
      signal,
    ),
  )
}
