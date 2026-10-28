const env = (import.meta as { env?: Record<string, string> }).env ?? {}
export const config = {
  mapStyle: env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty',
  geoapifyKey: env.VITE_GEOAPIFY_API_KEY || '',
  supabaseUrl: env.VITE_SUPABASE_URL || '',
  supabaseKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
}
