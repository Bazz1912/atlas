import type { Experience, Place, RouteSummary, Trip } from './domain.ts'
import type { RoutingService } from './contracts.ts'
import { config } from './config.ts'
import { geoapifyRequest, validCoordinates } from './geoapify.ts'
export function routePoints(trip: Trip, items: Experience[]): Place[] {
  const places = trip.waypoints.map((w) => {
    const item = items.find((i) => i.id === w.experienceId && !i.deletedAt)
    if (!item) throw new Error('Una tappa non è più disponibile nella mappa attiva.')
    return item
  })
  const points = trip.origin ? [trip.origin, ...places] : [...places]
  if (trip.budget?.roundTrip && points.length) points.push(points[0]!)
  if (points.some((p) => !validCoordinates(p.latitude, p.longitude)))
    throw new Error('Una posizione non ha coordinate valide. Correggi il pin sulla mappa.')
  return points
}
export function routeFingerprint(trip: Trip, items: Experience[]): string {
  return JSON.stringify(routePoints(trip, items).map((p) => [p.latitude, p.longitude]))
}
export function currentRoute(trip: Trip, items: Experience[]): RouteSummary | null {
  try {
    const r = trip.routeSummary
    return r?.provider === 'geoapify' &&
      r.mode === 'drive' &&
      Array.isArray(r.legs) &&
      Number.isFinite(Date.parse(r.calculatedAt)) &&
      r.fingerprint === routeFingerprint(trip, items) &&
      validRouteGeometry(r.geometry) &&
      Number.isFinite(r.distanceMeters) &&
      r.distanceMeters >= 0 &&
      Number.isFinite(r.durationSeconds) &&
      r.durationSeconds >= 0
      ? r
      : null
  } catch {
    return null
  }
}
export function stopSeconds(trip: Trip) {
  return trip.waypoints.reduce((sum, w) => {
    if (!Number.isFinite(w.stopMinutes) || w.stopMinutes < 0 || w.stopMinutes > 1440)
      throw new Error('Le soste devono essere comprese tra 0 e 1440 minuti.')
    return sum + w.stopMinutes * 60
  }, 0)
}
export function validRouteGeometry(geometry: unknown): geometry is RouteSummary['geometry'] {
  const g = geometry as { type?: string; coordinates?: unknown }
  if (!g || !Array.isArray(g.coordinates)) return false
  const lines =
    g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
  return (
    lines.length > 0 &&
    lines.every(
      (line) =>
        Array.isArray(line) &&
        line.length >= 2 &&
        line.every((p) => Array.isArray(p) && p.length >= 2 && validCoordinates(p[1], p[0])),
    )
  )
}
export function parseRoute(
  payload: unknown,
  fingerprint: string,
  expectedLegs: number,
): RouteSummary {
  const data = payload as {
    features?: {
      geometry: unknown
      properties?: {
        distance?: unknown
        time?: unknown
        legs?: { distance?: unknown; time?: unknown }[]
      }
    }[]
  }
  const feature = data?.features?.[0],
    p = feature?.properties
  if (!feature || !p)
    throw new Error(
      'Nessun percorso stradale disponibile tra questi punti. Verifica l’accessibilità in auto.',
    )
  if (
    !validRouteGeometry(feature.geometry) ||
    typeof p.distance !== 'number' ||
    !Number.isFinite(p.distance) ||
    p.distance < 0 ||
    typeof p.time !== 'number' ||
    !Number.isFinite(p.time) ||
    p.time < 0
  )
    throw new Error('Il percorso Geoapify non contiene geometria, tempi o distanze validi.')
  const legs =
    Array.isArray(p.legs) && p.legs.length === expectedLegs
      ? p.legs.map((l) => ({ distanceMeters: l.distance, durationSeconds: l.time }))
      : []
  const validLegs = legs.every(
    (l) =>
      typeof l.distanceMeters === 'number' &&
      Number.isFinite(l.distanceMeters) &&
      l.distanceMeters >= 0 &&
      typeof l.durationSeconds === 'number' &&
      Number.isFinite(l.durationSeconds) &&
      l.durationSeconds >= 0,
  )
  return {
    provider: 'geoapify',
    mode: 'drive',
    distanceMeters: p.distance,
    durationSeconds: p.time,
    geometry: feature.geometry,
    legs: validLegs ? (legs as RouteSummary['legs']) : [],
    fingerprint,
    calculatedAt: new Date().toISOString(),
  }
}
export const routingService: RoutingService = {
  get configured() {
    return !!config.geoapifyKey
  },
  async calculate(trip, items, signal) {
    const points = routePoints(trip, items)
    stopSeconds(trip)
    if (points.length < 2 || points.length > 50)
      throw new Error(
        'Scegli da 2 a 50 punti, includendo l’eventuale partenza. Servono almeno due luoghi per il percorso.',
      )
    if (
      points.every(
        (p) => p.latitude === points[0]!.latitude && p.longitude === points[0]!.longitude,
      )
    )
      throw new Error('Scegli almeno due posizioni diverse.')
    return parseRoute(
      await geoapifyRequest(
        'routing',
        {
          waypoints: points.map((p) => `${p.latitude},${p.longitude}`).join('|'),
          mode: 'drive',
          format: 'geojson',
          units: 'metric',
          lang: 'it',
          traffic: 'free_flow',
          intermediate_waypoint_mode: 'stopover',
          optimize_stops: 'false',
        },
        signal,
      ),
      routeFingerprint(trip, items),
      points.length - 1,
    )
  },
}
export function formatDistance(meters: number) {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toLocaleString('it', { maximumFractionDigits: 1 })} km`
}
export function formatDuration(seconds: number) {
  const mins = Math.ceil(seconds / 60)
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`
}
