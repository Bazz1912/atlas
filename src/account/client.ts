import { createClient } from '@supabase/supabase-js'
import { config } from '../services/config'
export const authConfigured = !!(config.supabaseUrl && config.supabaseKey)
export const supabase = authConfigured
  ? createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
export function backend() {
  if (!supabase)
    throw new Error('Supabase non configurato. Completa la configurazione descritta nel README.')
  return supabase
}
export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await backend().rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}
export const redirectUrl = () => new URL(import.meta.env.BASE_URL, location.origin).href
