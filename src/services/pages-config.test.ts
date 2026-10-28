import { expect, it } from 'vitest'
import { normalizeBasePath, validateBrowserEnv } from '../../build/pages-config'
it('supports root and repository paths without depending on the account name', () => {
  expect(normalizeBasePath()).toBe('/')
  expect(normalizeBasePath('/atlas')).toBe('/atlas/')
  expect(normalizeBasePath('/atlas/')).toBe('/atlas/')
  expect(normalizeBasePath('/Future-Repo_2')).toBe('/Future-Repo_2/')
  for (const bad of ['atlas', 'https://host/atlas', '/../', '/a/b/', '/atlas/?token=x'])
    expect(() => normalizeBasePath(bad)).toThrow()
})
it('rejects private/unknown browser variables and non-public Supabase keys', () => {
  expect(() => validateBrowserEnv({ VITE_OPENAI_API_KEY: 'private-fixture' })).toThrow()
  expect(() => validateBrowserEnv({ VITE_HERE_API_KEY: 'private-fixture' })).toThrow()
  expect(() => validateBrowserEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_fixture' })).toThrow()
  expect(() =>
    validateBrowserEnv({
      VITE_SUPABASE_PUBLISHABLE_KEY:
        'fixture.' + btoa(JSON.stringify({ role: 'service_role' })) + '.fixture',
    }),
  ).toThrow()
  expect(() =>
    validateBrowserEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: 'unknown-private-fixture' }),
  ).toThrow()
  expect(() => validateBrowserEnv({}, true)).toThrow()
  expect(() =>
    validateBrowserEnv(
      {
        VITE_SUPABASE_URL: 'https://project.invalid',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
        VITE_GEOAPIFY_API_KEY: 'public-fixture',
      },
      true,
    ),
  ).not.toThrow()
})
