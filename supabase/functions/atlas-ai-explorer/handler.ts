import {
  aiLimits,
  ExplorerError,
  isRecord,
  parseCriteria,
  text,
  uuid,
} from '../_shared/explorer-domain.ts'
import {
  blankResponse,
  runExplorer,
  type EngineDependencies,
  type EngineInput,
  type Snapshot,
} from './engine.ts'
import type { ExplorerAiResponse } from '../_shared/atlas/contracts.ts'
export interface Actor {
  id: string
  token: string
}
export interface GateResult {
  status: string
  response?: ExplorerAiResponse
  retryAfter?: number
}
export interface HandlerDependencies extends EngineDependencies {
  allowedOrigins: string[]
  authenticate(token: string): Promise<Actor | null>
  snapshot(actor: Actor, mapId: string, input: EngineInput): Promise<Snapshot | null>
  begin(actor: Actor, mapId: string, requestId: string, fingerprint: string): Promise<GateResult>
  finish(actor: Actor, requestId: string, response: ExplorerAiResponse | null): Promise<void>
}
export async function sha256(value: unknown) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  )
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('')
}
export function createExplorerHandler(deps: HandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      'Access-Control-Allow-Headers':
        'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '600',
    }
    if (origin && deps.allowedOrigins.includes(origin))
      headers['Access-Control-Allow-Origin'] = origin
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers })
    if (origin && !deps.allowedOrigins.includes(origin))
      return json({ error: 'Origine non autorizzata.', code: 'ORIGIN_DENIED' }, 403)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST')
      return json({ error: 'Metodo non consentito.', code: 'METHOD_NOT_ALLOWED' }, 405)
    let actor: Actor | null = null,
      requestId = '',
      claimed = false
    try {
      const authorization = request.headers.get('authorization') || ''
      if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))
        throw new ExplorerError('UNAUTHENTICATED', 'Accedi per usare AI Explorer.', 401)
      actor = await deps.authenticate(authorization.slice(7))
      if (!actor)
        throw new ExplorerError(
          'UNAUTHENTICATED',
          'Sessione non valida o scaduta. Accedi di nuovo.',
          401,
        )
      if (!request.headers.get('content-type')?.includes('application/json'))
        throw new ExplorerError('INVALID_INPUT', 'Invia una richiesta JSON.', 415)
      // Bounded streaming body: don't allocate an unbounded request before validation.
      const reader = request.body?.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      if (!reader) throw new ExplorerError('INVALID_INPUT', 'Richiesta vuota.')
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 16384) {
          await reader.cancel()
          throw new ExplorerError('INPUT_TOO_LONG', 'Richiesta troppo lunga.', 413)
        }
        chunks.push(part.value)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      let body: unknown
      try {
        body = JSON.parse(new TextDecoder().decode(bytes))
      } catch {
        throw new ExplorerError('INVALID_INPUT', 'JSON non valido.')
      }
      if (
        !isRecord(body) ||
        !uuid(body.mapId) ||
        !uuid(body.requestId) ||
        !['interpret', 'plan'].includes(String(body.mode))
      )
        throw new ExplorerError(
          'INVALID_INPUT',
          'Mappa, modalità o identificativo richiesta non validi.',
        )
      requestId = body.requestId
      const criteria = parseCriteria(body.criteria)
      const message = text(body.message ?? '', aiLimits.message, 'Richiesta')
      if (body.mode === 'interpret' && !message)
        throw new ExplorerError('INVALID_INPUT', 'Scrivi cosa vorresti fare.')
      const timezone = text(body.timezone, 100, 'Fuso orario')
      try {
        new Intl.DateTimeFormat('it', { timeZone: timezone }).format()
      } catch {
        throw new ExplorerError('INVALID_INPUT', 'Fuso orario non valido.')
      }
      const excludedIds = body.excludedIds ?? [],
        prefix = body.prefix ?? []
      if (
        !Array.isArray(excludedIds) ||
        excludedIds.length > 50 ||
        excludedIds.some((id) => !uuid(id))
      )
        throw new ExplorerError('INVALID_INPUT', 'Esclusioni non valide.')
      if (
        !Array.isArray(prefix) ||
        prefix.length > 20 ||
        prefix.some(
          (w) =>
            !isRecord(w) ||
            !uuid(w.experienceId) ||
            typeof w.stopMinutes !== 'number' ||
            !Number.isFinite(w.stopMinutes) ||
            w.stopMinutes < 0 ||
            w.stopMinutes > 1440,
        )
      )
        throw new ExplorerError('INVALID_INPUT', 'Tappe precedenti non valide.')
      if (new Set(prefix.map((w) => w.experienceId)).size !== prefix.length)
        throw new ExplorerError('INVALID_INPUT', 'Il viaggio contiene tappe duplicate.')
      const input: EngineInput = {
        mode: body.mode as EngineInput['mode'],
        criteria,
        message,
        timezone,
        excludedIds,
        prefix,
      }
      const snapshot = await deps.snapshot(actor, body.mapId, input)
      if (
        !snapshot?.member ||
        snapshot.map.id !== body.mapId ||
        (snapshot.map.type === 'personal' && snapshot.map.created_by !== actor.id)
      )
        throw new ExplorerError('MAP_FORBIDDEN', 'Non hai accesso alla mappa richiesta.', 403)
      const revision = (s: Snapshot) => [
        [...s.categories].sort((a, b) => a.id.localeCompare(b.id)),
        s.items
          .map((i) => [
            i.id,
            i.updatedAt,
            i.title,
            i.latitude,
            i.longitude,
            i.status,
            i.priority,
            i.category,
            i.environment,
            i.cost,
          ])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        Object.entries(s.ratings).sort(([a], [b]) => a.localeCompare(b)),
      ]
      const fingerprint = await sha256([body.mapId, input, revision(snapshot)])
      const gate = await deps.begin(actor, body.mapId, requestId, fingerprint)
      if (gate.status === 'cached' && gate.response) return json(gate.response)
      if (gate.status === 'limited') {
        headers['Retry-After'] = String(gate.retryAfter || 60)
        throw new ExplorerError(
          'AI_RATE_LIMIT',
          'Limite AI raggiunto: massimo 2 richieste al minuto e 20 al giorno per utente; è previsto anche un budget globale.',
          429,
        )
      }
      if (gate.status === 'forbidden')
        throw new ExplorerError('MAP_FORBIDDEN', 'Accesso alla mappa revocato.', 403)
      if (gate.status !== 'claimed')
        throw new ExplorerError(
          'AI_DUPLICATE',
          'Richiesta già in corso o scaduta. Attendi oppure avvia una nuova ricerca.',
          409,
        )
      claimed = true
      let result: ExplorerAiResponse
      try {
        result = await runExplorer(
          input,
          snapshot,
          deps,
          AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
        )
      } catch (error) {
        if (error instanceof ExplorerError && error.code === 'CONFLICTING_FILTERS') {
          result = blankResponse(criteria, deps.now?.() ?? Date.now(), 'clarification')
          result.clarifications = [error.message]
        } else throw error
      }
      // Recheck RLS membership immediately before exposing a cached/expensive result.
      const stillAuthorized = await deps.snapshot(actor, body.mapId, input)
      if (!stillAuthorized?.member)
        throw new ExplorerError(
          'MAP_FORBIDDEN',
          'Accesso alla mappa revocato durante la ricerca.',
          403,
        )
      if ((await sha256(revision(stillAuthorized))) !== (await sha256(revision(snapshot))))
        throw new ExplorerError(
          'STALE_DATA',
          'I luoghi o le recensioni sono cambiati durante la ricerca. Riprova.',
          409,
        )
      const completedAt = deps.now?.() ?? Date.now()
      result.generatedAt = new Date(completedAt).toISOString()
      result.expiresAt = new Date(completedAt + 120_000).toISOString()
      await deps.finish(actor, requestId, result)
      claimed = false
      return json(result)
    } catch (error) {
      if (claimed && actor)
        try {
          await deps.finish(actor, requestId, null)
        } catch {
          /* No personal input, keys or raw provider errors logged. */
        }
      const safe =
        error instanceof ExplorerError
          ? error
          : new ExplorerError(
              'AI_UNAVAILABLE',
              'AI Explorer temporaneamente non disponibile. Controlla deployment, secret e migrazione anti-abuso.',
              503,
            )
      return json({ code: safe.code, error: safe.message }, safe.status)
    }
  }
}
