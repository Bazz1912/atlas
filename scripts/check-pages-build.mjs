import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const raw = (process.env.VITE_BASE_PATH || '/').trim(),
  base = raw === '/' ? '/' : raw.replace(/\/$/, '') + '/'
const html = readFileSync('dist/index.html', 'utf8'),
  manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'))
for (const key of ['id', 'scope', 'start_url']) assert.equal(manifest[key], base, `Manifest ${key}`)
assert.equal(manifest.display, 'standalone')
const origin = 'https://pages-check.invalid'
const checkLocal = (url) => {
  const parsed = new URL(url, origin + base)
  if (parsed.origin !== origin) return
  assert.ok(parsed.pathname.startsWith(base), 'Risorsa fuori dal base path')
  const file = resolve('dist', decodeURIComponent(parsed.pathname.slice(base.length)))
  assert.ok(file.startsWith(resolve('dist') + '/') && existsSync(file), 'Risorsa locale mancante')
}
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) checkLocal(match[1])
for (const icon of manifest.icons) {
  checkLocal(icon.src)
  if (icon.src.endsWith('.png')) {
    const png = readFileSync(
      resolve('dist', new URL(icon.src, origin + base).pathname.slice(base.length)),
    )
    assert.equal(
      `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`,
      icon.sizes,
      'Dimensioni icona manifest',
    )
  }
}
const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = dir + '/' + name
    if (statSync(path).isDirectory()) walk(path)
    else files.push(path)
  }
}
walk('dist')
assert.ok(files.includes('dist/sw.js'), 'Service worker assente')
const sw = readFileSync('dist/sw.js', 'utf8')
assert.ok(sw.includes(`${base}index.html`), 'Fallback service worker fuori base path')
const js = files
  .filter((p) => p.endsWith('.js'))
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n')
assert.ok(js.includes(`${base}sw.js`), 'Registrazione SW fuori base path')
assert.ok(
  !files.some((p) => /\.env|\.pem$|\.key$|\.sql$|\.map$|\/supabase\//.test(p)),
  'File privato/server nel dist',
)
assert.ok(
  !/\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,})/.test(
    js,
  ),
  'Secret server nel bundle (valore omesso)',
)
assert.ok(
  !js.includes('router.hereapi.com') && !js.includes('api.openai.com/v1/responses'),
  'Endpoint privato provider nel frontend',
)
console.log(
  `Build Pages verificata: base ${base}, manifest, icone, risorse HTML, service worker e artifact pubblico.`,
)
