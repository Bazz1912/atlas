import { limitedHereRoute } from '../_shared/hereAccess.ts'
import { makeTollQuote, routeReference } from '../_shared/atlas/tollComparison.ts'
import { createClient } from '@supabase/supabase-js'
import type { Experience, CategoryRecord } from '../_shared/atlas/domain.ts'
import { config } from '../_shared/atlas/config.ts'
import { createExplorerHandler, type Actor, type GateResult } from './handler.ts'
import type { EngineInput, Snapshot } from './engine.ts'
import { ExplorerError } from '../_shared/explorer-domain.ts'
import { structuredResponse } from '../_shared/openai.ts'

const env = (name: string) => Deno.env.get(name) || ''
function namedKey(name: string, fallback: string) {
  try {
    const keys = JSON.parse(env(name) || '{}')
    return keys.default || Object.values(keys)[0] || env(fallback)
  } catch {
    return env(fallback)
  }
}
const url = env('SUPABASE_URL'),
  publishable =
    env('SUPABASE_ANON_KEY') || namedKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_PUBLISHABLE_KEY')
const adminKey =
  env('SUPABASE_SERVICE_ROLE_KEY') || namedKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SECRET_KEY')
const admin = () =>
  createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } })
const userClient = (actor: Actor) =>
  createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${actor.token}` } },
  })
config.geoapifyKey = env('GEOAPIFY_API_KEY') // Server-only runtime; never read or write browser env files.
const handler = createExplorerHandler({
  allowedOrigins: (env('ATLAS_ALLOWED_ORIGINS') || 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  async authenticate(token) {
    if (!url || !publishable)
      throw new ExplorerError(
        'BACKEND_NOT_CONFIGURED',
        'Configurazione Supabase della funzione incompleta.',
        503,
      )
    const client = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await client.auth.getUser(token)
    return !error && data.user && !data.user.is_anonymous ? { id: data.user.id, token } : null
  },
  hereTolls: env('HERE_API_KEY')
    ? async (snapshot, trip, items, route, signal) =>
        makeTollQuote(
          routeReference(route),
          await limitedHereRoute(
            admin(),
            snapshot.actorId!,
            snapshot.map.id,
            trip,
            items,
            env('HERE_API_KEY'),
            signal,
          ),
        )
    : undefined,
  async snapshot(actor: Actor, mapId: string, input: EngineInput): Promise<Snapshot | null> {
    const client = userClient(actor)
    const [{ data: map, error: mapError }, { data: member, error: memberError }] =
      await Promise.all([
        client.from('atlas_maps').select('id,type,created_by').eq('id', mapId).maybeSingle(),
        client
          .from('atlas_map_members')
          .select('user_id')
          .eq('map_id', mapId)
          .eq('user_id', actor.id)
          .maybeSingle(),
      ])
    if (mapError || memberError)
      throw new ExplorerError(
        'MAP_LOOKUP_FAILED',
        'Impossibile verificare i permessi sulla mappa.',
        503,
      )
    if (!map || !member || (map.type === 'personal' && map.created_by !== actor.id)) return null
    const { data: categories, error: categoryError } = await client
      .from('atlas_categories')
      .select('id,name,icon,color,is_default')
      .eq('map_id', mapId)
      .limit(101)
    if (categoryError)
      throw new ExplorerError('MAP_LOOKUP_FAILED', 'Categorie non disponibili.', 503)
    if ((categories?.length || 0) > 100)
      throw new ExplorerError(
        'TOO_MANY_CATEGORIES',
        'La ricerca AI supporta fino a 100 categorie per mappa.',
        422,
      )
    const result: Snapshot = {
      map,
      member: true,
      categories: (categories || []).map((c) => ({
        ...c,
        slug: c.id,
        isDefault: c.is_default,
      })) as CategoryRecord[],
      items: [],
      ratings: {},
      actorId: actor.id,
    }
    if (input.mode === 'interpret') return result
    const c = input.criteria
    let query = client
      .from('atlas_experiences')
      .select('id,data,category_id,deleted_at,updated_at,created_at')
      .eq('map_id', mapId)
      .is('deleted_at', null)
    if (c.status !== 'ALL') query = query.eq('data->>status', c.status)
    if (c.categoryIds.length) query = query.in('category_id', c.categoryIds)
    if (c.environment) query = query.eq('data->>environment', c.environment)
    if (c.priority) query = query.eq('data->>priority', c.priority)
    const { data: rows, error } = await query.limit(301)
    if (error) throw new ExplorerError('MAP_LOOKUP_FAILED', 'Esperienze non disponibili.', 503)
    if ((rows?.length || 0) > 300)
      throw new ExplorerError(
        'TOO_MANY_CANDIDATES',
        'Restringi i filtri: oltre 300 esperienze da verificare.',
        422,
      )
    const allRows = [...(rows || [])]
    if (input.prefix.length) {
      const { data: prefix, error: prefixError } = await client
        .from('atlas_experiences')
        .select('id,data,category_id,deleted_at,updated_at,created_at')
        .eq('map_id', mapId)
        .is('deleted_at', null)
        .in(
          'id',
          input.prefix.map((w) => w.experienceId),
        )
      if (prefixError)
        throw new ExplorerError('MAP_LOOKUP_FAILED', 'Tappe del viaggio non disponibili.', 503)
      for (const row of prefix || []) if (!allRows.some((r) => r.id === row.id)) allRows.push(row)
    }
    result.items = allRows.map(
      (r) =>
        ({
          ...r.data,
          id: r.id,
          category: r.category_id,
          deletedAt: r.deleted_at,
          updatedAt: r.updated_at,
          createdAt: r.created_at,
          imagePath: null,
          imageUrl: null,
        }) as Experience,
    )
    if (allRows.length) {
      const { data: reviews, error: reviewError } = await client
        .from('atlas_reviews')
        .select('experience_id,rating,updated_at')
        .eq('map_id', mapId)
        .eq('author_id', actor.id)
        .not('rating', 'is', null)
        .in(
          'experience_id',
          allRows.map((r) => r.id),
        )
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1001)
      if (reviewError)
        throw new ExplorerError('MAP_LOOKUP_FAILED', 'Recensioni personali non disponibili.', 503)
      if ((reviews?.length || 0) > 1000)
        throw new ExplorerError(
          'TOO_MANY_REVIEWS',
          'Restringi i filtri per verificare le recensioni personali.',
          422,
        )
      for (const r of reviews || [])
        if (!(r.experience_id in result.ratings)) result.ratings[r.experience_id] = r.rating
    }
    return result
  },
  async begin(actor, mapId, requestId, fingerprint) {
    if (!adminKey)
      throw new ExplorerError(
        'LIMITER_NOT_CONFIGURED',
        'Configurazione server per i limiti AI mancante.',
        503,
      )
    const { data, error } = await admin().rpc('atlas_ai_begin', {
      actor: actor.id,
      target: mapId,
      request_id: requestId,
      fingerprint,
    })
    if (error)
      throw new ExplorerError(
        'AI_MIGRATION_REQUIRED',
        'Applica la migrazione 202610260002_ai_explorer.sql prima di usare OpenAI. Nessuna chiamata AI eseguita.',
        503,
      )
    return data as GateResult
  },
  async finish(actor, requestId, response) {
    const { error } = await admin().rpc('atlas_ai_finish', {
      actor: actor.id,
      request_id: requestId,
      result: response,
    })
    if (error)
      throw new ExplorerError(
        'AI_CACHE_UNAVAILABLE',
        'Impossibile completare la richiesta AI in sicurezza. Riprova più tardi.',
        503,
      )
  },
  model: (options) =>
    structuredResponse({ ...options, key: env('OPENAI_API_KEY'), model: env('OPENAI_MODEL') }),
})
Deno.serve(handler)
