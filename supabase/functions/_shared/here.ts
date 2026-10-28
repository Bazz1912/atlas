// Server only. HERE Routing v8 schema 8.165.0 checked against /v8/openapi.
import type { Experience, RouteSummary, TollFare, TollGroup, Trip } from './atlas/domain.ts'
import { routeFingerprint, routePoints, stopSeconds, validRouteGeometry } from './atlas/routing.ts'
export class HereError extends Error {}
export interface HereSpan {
  offset?: number
  length?: number
  streetAttributes?: string[]
  carAttributes?: string[]
  functionalClass?: number
  maxSpeed?: number | string
}
// HERE Flexible Polyline format v1: signed delta coordinates, precision from header.
export function decodePolyline(encoded: string): number[][] {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let index = 0
  const read = () => {
    let value = 0,
      shift = 0,
      byte = 0
    do {
      if (index >= encoded.length || shift > 50) throw new HereError('Geometria HERE non valida.')
      byte = alphabet.indexOf(encoded[index++]!)
      if (byte < 0) throw new HereError('Geometria HERE non valida.')
      value += (byte & 31) * 2 ** shift
      shift += 5
    } while (byte & 32)
    return value
  }
  const signed = () => {
    const v = read()
    return v % 2 ? -(Math.floor(v / 2) + 1) : v / 2
  }
  if (read() !== 1) throw new HereError('Versione geometria HERE non supportata.')
  const header = read(),
    precision = header & 15,
    third = (header >> 4) & 7,
    scale = 10 ** precision
  let lat = 0,
    lon = 0
  const coords: number[][] = []
  while (index < encoded.length) {
    lat += signed()
    lon += signed()
    if (third) signed()
    coords.push([lon / scale, lat / scale])
    if (coords.length > 150000) throw new HereError('Percorso troppo esteso.')
  }
  return coords
}
interface Price {
  type?: string
  currency?: string
  value?: number
}
interface RawFare {
  id?: string
  name?: string
  price?: Price
  convertedPrice?: Price
  paymentMethods?: string[]
  pass?: unknown
  transponders?: unknown[]
  applicableTimes?: string
}
interface Section {
  id?: string
  type?: string
  summary?: { length?: number; duration?: number }
  polyline?: string
  spans?: HereSpan[]
  tolls?: { tollSystem?: string; tollSystems?: number[]; fares?: RawFare[] }[]
  tollSystems?: { name?: string }[]
  notices?: unknown[]
}
export function parseHere(
  payload: unknown,
  fingerprint: string,
  expectedLegs: number,
): RouteSummary {
  const data = payload as { routes?: { id?: string; sections?: Section[] }[]; notices?: unknown[] }
  const route = data?.routes?.[0],
    sections = route?.sections
  if (
    !sections?.length ||
    sections.length !== expectedLegs ||
    sections.some((s) => s.type !== 'vehicle')
  )
    throw new HereError(
      'HERE non ha restituito tutti i tratti automobilistici. Percorsi con traghetti o sezioni speciali non preventivabili.',
    )
  const lines: number[][][] = [],
    groups: TollGroup[] = []
  let distanceMeters = 0,
    durationSeconds = 0,
    complete = !data.notices?.length
  let noTolls = true
  const legs: RouteSummary['legs'] = [],
    fareValues = new Map<string, string>()
  for (const section of sections) {
    if (
      [...(data.notices || []), ...(section.notices || [])].some(
        (n) =>
          !!n &&
          typeof n === 'object' &&
          ((n as { severity?: string }).severity === 'critical' ||
            (n as { code?: string }).code === 'simplePolyline'),
      )
    )
      throw new HereError(
        'HERE segnala restrizioni o geometria approssimativa: percorso non utilizzabile per il preventivo.',
      )
    const length = section.summary?.length,
      duration = section.summary?.duration
    if (
      typeof length !== 'number' ||
      !Number.isFinite(length) ||
      length < 0 ||
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration < 0 ||
      !section.polyline
    )
      throw new HereError('Distanze, tempi o geometria HERE mancanti.')
    const line = decodePolyline(section.polyline)
    lines.push(line)
    distanceMeters += length
    durationSeconds += duration
    legs.push({ distanceMeters: length, durationSeconds: duration })
    // Missing tolls never means free. Explicit empty list plus complete car-attribute coverage only.
    const coverage =
      section.spans?.length &&
      section.spans.every((s) => Array.isArray(s.carAttributes) && Number.isFinite(s.length)) &&
      Math.abs(section.spans.reduce((n, s) => n + s.length!, 0) - length) <= 1
    const roadHasToll = section.spans?.some((s) => s.carAttributes?.includes('tollRoad'))
    if (!Array.isArray(section.tolls) || section.notices?.length) complete = false
    if (!section.tolls?.length && (!coverage || roadHasToll)) complete = false
    for (const toll of section.tolls || []) {
      noTolls = false
      const fares: TollFare[] = (toll.fares || []).map((f) => {
        const price = f.convertedPrice?.currency === 'EUR' ? f.convertedPrice : f.price
        const euros =
          price?.currency === 'EUR' &&
          price.type === 'value' &&
          typeof price.value === 'number' &&
          Number.isFinite(price.value) &&
          price.value >= 0
            ? price.value
            : null
        if (!f.id || (fareValues.has(f.id) && fareValues.get(f.id) !== JSON.stringify(price)))
          complete = false
        if (f.id) fareValues.set(f.id, JSON.stringify(price))
        return {
          id: f.id || '',
          name: (f.name || toll.tollSystem || 'Pedaggio').slice(0, 150),
          euros,
          paymentMethods: f.paymentMethods || [],
          conditional:
            !!f.pass ||
            !!f.applicableTimes ||
            !!f.transponders?.length ||
            !!f.paymentMethods?.includes('transponder'),
          details: [
            f.pass ? 'Abbonamento/pass richiesto' : '',
            f.applicableTimes ? 'Tariffa soggetta a fascia oraria' : '',
            f.transponders?.length ? 'Transponder richiesto' : '',
          ]
            .filter(Boolean)
            .join(' · '),
        }
      })
      const ids = fares
        .map((f) => f.id)
        .filter(Boolean)
        .sort()
      if (!fares.length || ids.length !== fares.length) complete = false
      // Same alternatives on several sections represent one payment; never dedupe on system name.
      const id = ids.join('|') || `unknown-${groups.length}`
      const overlaps = groups.filter((g) => g.fares.some((f) => ids.includes(f.id)))
      if (overlaps.length) {
        const merged = new Map(
          overlaps
            .flatMap((g) => g.fares)
            .concat(fares)
            .map((f) => [f.id, f]),
        )
        overlaps[0]!.fares = [...merged.values()]
        overlaps[0]!.id = [...merged.keys()].sort().join('|')
        for (const extra of overlaps.slice(1)) groups.splice(groups.indexOf(extra), 1)
      } else
        groups.push({
          id,
          name:
            toll.tollSystems
              ?.map((i) => section.tollSystems?.[i]?.name)
              .filter(Boolean)
              .join(' / ') ||
            toll.tollSystem ||
            'Pedaggio',
          fares,
        })
    }
  }
  const geometry: RouteSummary['geometry'] = { type: 'MultiLineString', coordinates: lines }
  if (!validRouteGeometry(geometry)) throw new HereError('Geometria HERE non valida.')
  return {
    provider: 'here',
    mode: 'drive',
    hereRouteId: route?.id,
    distanceMeters,
    durationSeconds,
    geometry,
    legs,
    tolls: {
      groups,
      complete,
      noTolls: complete && noTolls,
      notes: [
        'Costi HERE best-effort per automobile privata standard. Le tariffe possono cambiare; verifica pass e metodo di pagamento.',
      ],
    },
    fingerprint,
    calculatedAt: new Date().toISOString(),
  }
}
export async function fetchHere(
  trip: Trip,
  items: Experience[],
  key: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  if (!key)
    throw new HereError(
      'HERE non configurato: aggiungi HERE_API_KEY nei Supabase Secrets e distribuisci atlas-here-route.',
    )
  const points = routePoints(trip, items)
  stopSeconds(trip)
  if (
    points.every((p) => p.latitude === points[0]?.latitude && p.longitude === points[0]?.longitude)
  )
    throw new HereError('Scegli almeno due posizioni diverse per il percorso HERE.')
  if (points.length < 2 || points.length > 26)
    throw new HereError('HERE supporta qui da 2 a 26 punti, incluso il ritorno.')
  const url = new URL('https://router.hereapi.com/v8/routes')
  const params = {
    transportMode: 'car',
    routingMode: 'fast',
    origin: `${points[0]!.latitude},${points[0]!.longitude}`,
    destination: `${points.at(-1)!.latitude},${points.at(-1)!.longitude}`,
    return: 'polyline,summary,tolls',
    spans: 'length,carAttributes',
    currency: 'EUR',
    departureTime: 'any',
    apiKey: key,
  }
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  points.slice(1, -1).forEach((p) => url.searchParams.append('via', `${p.latitude},${p.longitude}`))
  // Static time-independent estimate. No misleading future toll/traffic precision; user-visible caveat.
  let response: Response
  try {
    response = await fetcher(url, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
        : AbortSignal.timeout(25000),
    })
  } catch {
    throw new HereError('HERE non raggiungibile o richiesta scaduta. Riprova più tardi.')
  }
  if (!response.ok)
    throw new HereError(
      response.status === 429
        ? 'Quota HERE raggiunta. Riprova più tardi.'
        : 'HERE non disponibile. Verifica secret, piano Routing e copertura del percorso.',
    )
  return parseHere(await response.json(), routeFingerprint(trip, items), points.length - 1)
}
