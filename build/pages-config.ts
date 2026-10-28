export const browserEnvKeys = [
  'VITE_BASE_PATH',
  'VITE_MAP_STYLE_URL',
  'VITE_GEOAPIFY_API_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
]
export function normalizeBasePath(value = '/') {
  const base = value.trim()
  if (!base || base === '/') return '/'
  if (!/^\/[A-Za-z0-9_.-]+\/?$/.test(base) || ['.', '..'].includes(base.replaceAll('/', '')))
    throw new Error('VITE_BASE_PATH deve essere / oppure /nome-repository/.')
  return base.endsWith('/') ? base : base + '/'
}
export function validateBrowserEnv(env: Record<string, string>, required = false) {
  if (Object.keys(env).some((k) => k.startsWith('VITE_') && !browserEnvKeys.includes(k) && env[k]))
    throw new Error(
      'Variabile VITE_* non prevista: usa soltanto le variabili pubbliche documentate. I secret server non appartengono alla build frontend.',
    )
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
  if (key.startsWith('sb_secret_') || key.startsWith('sk-'))
    throw new Error('La chiave frontend Supabase non è pubblicabile.')
  if (key && !key.startsWith('sb_publishable_') && key.split('.').length !== 3)
    throw new Error(
      'Formato chiave Supabase frontend non riconosciuto: usa publishable oppure anon.',
    )
  // Legacy JWT keys are allowed only when their embedded role is anon.
  if (key.split('.').length === 3) {
    try {
      const role = JSON.parse(atob(key.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).role
      if (role !== 'anon') throw new Error()
    } catch {
      throw new Error(
        'La chiave Supabase frontend deve essere publishable oppure anon, mai service_role.',
      )
    }
  }
  if (required) {
    if (!env.VITE_SUPABASE_URL || !key || !env.VITE_GEOAPIFY_API_KEY)
      throw new Error(
        'Build Pages: configura URL Supabase, publishable key e chiave pubblica Geoapify nelle impostazioni Actions.',
      )
    const url = new URL(env.VITE_SUPABASE_URL)
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error(
        'La build Pages richiede un Project URL Supabase HTTPS senza credenziali incorporate.',
      )
  }
}
