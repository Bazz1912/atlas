import { HereError } from '../_shared/here.ts'
import type {
  Experience,
  Place,
  Trip,
  RouteReference,
  RouteSummary,
} from '../_shared/atlas/domain.ts'
import { isRecord, uuid } from '../_shared/explorer-domain.ts'
import { makeTollQuote, metersBetween } from '../_shared/atlas/tollComparison.ts'
import { routeFingerprint, routePoints } from '../_shared/atlas/routing.ts'
import { validCoordinates } from '../_shared/atlas/geoapify.ts'
export interface HereInput {
  mapId: string
  ids: string[]
  origin: Place | null
  roundTrip: boolean
  geoRoute: RouteReference
}
export function parseHereInput(body: unknown): HereInput {
  if (
    !isRecord(body) ||
    !uuid(body.mapId) ||
    !Array.isArray(body.ids) ||
    body.ids.length < 1 ||
    body.ids.length > 24 ||
    body.ids.some((id) => !uuid(id)) ||
    new Set(body.ids).size !== body.ids.length ||
    typeof body.roundTrip !== 'boolean'
  )
    throw new Error('Tappe o mappa non valide (massimo 24 esperienze).')
  let origin: Place | null = null
  if (body.origin != null) {
    const o = body.origin
    if (!isRecord(o) || !validCoordinates(o.latitude, o.longitude))
      throw new Error('Partenza non valida.')
    origin = {
      latitude: o.latitude as number,
      longitude: o.longitude as number,
      address: 'Partenza',
    }
  }
  const r = body.geoRoute
  if (
    !isRecord(r) ||
    typeof r.fingerprint !== 'string' ||
    r.fingerprint.length > 4000 ||
    typeof r.distanceMeters !== 'number' ||
    !Number.isFinite(r.distanceMeters) ||
    r.distanceMeters <= 0 ||
    r.distanceMeters > 50000000 ||
    !Array.isArray(r.points) ||
    r.points.length !== 128 ||
    r.points.some((p) => !Array.isArray(p) || p.length !== 2 || !validCoordinates(p[1], p[0])) ||
    !Array.isArray(r.legMeters) ||
    r.legMeters.length > 25 ||
    !r.legMeters.length ||
    r.legMeters.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0)
  )
    throw new Error('Percorso Geoapify non valido.')
  return {
    mapId: body.mapId,
    ids: body.ids as string[],
    origin,
    roundTrip: body.roundTrip,
    geoRoute: r as unknown as RouteReference,
  }
}
export function hereTrip(input: HereInput): Trip {
  return {
    id: 'here-quote',
    name: 'Preventivo',
    origin: input.origin,
    date: '',
    waypoints: input.ids.map((experienceId) => ({ experienceId, stopMinutes: 0 })),
    routeSummary: null,
    budget: { participants: 2, max: null, roundTrip: input.roundTrip },
    createdAt: '',
    updatedAt: '',
  }
}
export function createHereHandler(deps: {
  origins: string[]
  authenticate(token: string): Promise<string | null>
  items(token: string, actor: string, input: HereInput): Promise<Experience[] | null>
  route(
    actor: string,
    input: HereInput,
    trip: Trip,
    items: Experience[],
    signal: AbortSignal,
  ): Promise<RouteSummary>
}) {
  return async (request: Request) => {
    const origin = request.headers.get('origin'),
      headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Vary: 'Origin',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'authorization,apikey,content-type,x-client-info,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version',
      }
    if (origin && deps.origins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers })
    if (origin && !deps.origins.includes(origin))
      return json({ error: 'Origine non autorizzata.' }, 403)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return json({ error: 'Metodo non consentito.' }, 405)
    try {
      const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1]
      const actor = token ? await deps.authenticate(token) : null
      if (!actor || !token) return json({ error: 'Accedi per richiedere un preventivo HERE.' }, 401)
      if (!request.headers.get('content-type')?.includes('application/json'))
        return json({ error: 'Richiesta JSON necessaria.' }, 415)
      const reader = request.body?.getReader()
      if (!reader) return json({ error: 'Richiesta vuota.' }, 400)
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.length
        if (size > 32768) {
          await reader.cancel()
          return json({ error: 'Richiesta troppo grande.' }, 413)
        }
        chunks.push(part.value)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      let input: HereInput
      try {
        input = parseHereInput(JSON.parse(new TextDecoder().decode(bytes)))
      } catch {
        return json({ error: 'Tappe, coordinate o richiesta non valide.' }, 400)
      }
      const items = await deps.items(token, actor, input)
      if (!items) return json({ error: 'Non hai accesso alla mappa o alle tappe richieste.' }, 403)
      const trip = hereTrip(input),
        points = routePoints(trip, items)
      if (
        input.geoRoute.fingerprint !== routeFingerprint(trip, items) ||
        input.geoRoute.legMeters.length !== points.length - 1 ||
        metersBetween(input.geoRoute.points[0]!, [points[0]!.longitude, points[0]!.latitude]) >
          1500 ||
        metersBetween(input.geoRoute.points.at(-1)!, [
          points.at(-1)!.longitude,
          points.at(-1)!.latitude,
        ]) > 1500
      )
        return json({ error: 'Il percorso Geoapify non corrisponde alle tappe attuali.' }, 409)
      const result = await deps.route(
        actor,
        input,
        trip,
        items,
        AbortSignal.any([request.signal, AbortSignal.timeout(35000)]),
      )
      if (!(await deps.items(token, actor, input)))
        return json({ error: 'Accesso alla mappa revocato.' }, 403)
      return json(makeTollQuote(input.geoRoute, result))
    } catch (error) {
      // All thrown provider messages are sanitized in the server adapter. Never log URLs/keys.
      return json(
        {
          error:
            error instanceof HereError
              ? error.message
              : 'Preventivo HERE temporaneamente non disponibile.',
        },
        503,
      )
    }
  }
}
