import { createClient } from '@supabase/supabase-js'
import type { Experience } from '../_shared/atlas/domain.ts'
import { limitedHereRoute } from '../_shared/hereAccess.ts'
import { createHereHandler } from './handler.ts'
const env = (name: string) => Deno.env.get(name) || ''
const named = (name: string) => {
  try {
    return String(Object.values(JSON.parse(env(name) || '{}'))[0] || '')
  } catch {
    return ''
  }
}
const url = env('SUPABASE_URL'),
  pub = env('SUPABASE_ANON_KEY') || named('SUPABASE_PUBLISHABLE_KEYS'),
  secret = env('SUPABASE_SERVICE_ROLE_KEY') || named('SUPABASE_SECRET_KEYS')
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const handler = createHereHandler({
  origins: (env('ATLAS_ALLOWED_ORIGINS') || 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',')
    .map((s) => s.trim()),
  async authenticate(token) {
    const { data, error } = await createClient(url, pub, options).auth.getUser(token)
    return !error && data.user && !data.user.is_anonymous ? data.user.id : null
  },
  async items(token, actor, input) {
    const client = createClient(url, pub, {
      ...options,
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const [{ data: map, error: me }, { data: member, error: re }] = await Promise.all([
      client.from('atlas_maps').select('type,created_by').eq('id', input.mapId).maybeSingle(),
      client
        .from('atlas_map_members')
        .select('user_id')
        .eq('map_id', input.mapId)
        .eq('user_id', actor)
        .maybeSingle(),
    ])
    if (me || re || !map || !member || (map.type === 'personal' && map.created_by !== actor))
      return null
    const { data, error } = await client
      .from('atlas_experiences')
      .select('id,data')
      .eq('map_id', input.mapId)
      .is('deleted_at', null)
      .in('id', input.ids)
      .limit(24)
    if (error || data?.length !== input.ids.length) return null
    return input.ids.map((id) => {
      const row = data.find((r) => r.id === id)!
      return { ...row.data, id: row.id } as Experience
    })
  },
  route: (actor, input, trip, items, signal) =>
    limitedHereRoute(
      createClient(url, secret, options),
      actor,
      input.mapId,
      trip,
      items,
      env('HERE_API_KEY'),
      signal,
    ),
})
Deno.serve(handler)
