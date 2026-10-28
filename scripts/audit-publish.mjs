import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).split('\0').filter(Boolean)
const tracked = git('ls-files', '-z'),
  candidates = [
    ...new Set([...tracked, ...git('ls-files', '--others', '--exclude-standard', '-z')]),
  ]
const privatePath = (p) =>
  (/(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.yarnrc\.yml|\.tools|\.npm-cache|\.supabase|\.aws|\.ssh|\.codex|node_modules|dist)(?:\/|$)/.test(
    p,
  ) &&
    p !== '.env.example') ||
  /\.(?:pem|key|p12|pfx|keystore)$/.test(p)
const patterns = [
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/,
  /\bsb_secret_[A-Za-z0-9_-]{16,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:OPENAI_API_KEY|HERE_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9._-]{16,})/,
  /postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/,
]
// Also detect the actual local key values if accidentally pasted into a candidate file.
// Do not print names/values; public browser keys belong in Actions settings, not source.
let localCredentials = []
try {
  localCredentials = readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!match || !/(?:KEY|TOKEN|SECRET|PASSWORD)$/.test(match[1])) return []
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2')
      return value.length >= 12 ? [value] : []
    })
} catch {
  /* CI has no .env.local; signature checks still run. */
}
let failed = false
for (const path of candidates) {
  if (privatePath(path) || /^docs\/.*\.(?:png|jpg|jpeg|webp)$/.test(path)) {
    console.error(`File privato tra i candidati Git: ${path}`)
    failed = true
    continue
  }
  let text
  try {
    if (statSync(path).size > 3000000) continue
    text = readFileSync(path, 'utf8')
  } catch {
    continue
  }
  const jwt = [...text.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)]
  const serverJwt = jwt.some((m) => {
    try {
      return JSON.parse(Buffer.from(m[1], 'base64url').toString()).role === 'service_role'
    } catch {
      return false
    }
  })
  if (
    patterns.some((p) => p.test(text)) ||
    serverJwt ||
    localCredentials.some((value) => text.includes(value))
  ) {
    console.error(`Possibile segreto nel file: ${path} (valore omesso)`)
    failed = true
  }
}
// Ignore rules must also cover absent local files, before a future git add.
for (const path of [
  '.env.local',
  'supabase/functions/.env.local',
  '.tools/supabase-home/access-token',
  '.aws/credentials',
  'atlas-backup.json',
  'docs/private-qa.png',
]) {
  try {
    execFileSync('git', ['check-ignore', '--no-index', '-q', path])
  } catch {
    console.error(`Manca una regola ignore per: ${path}`)
    failed = true
  }
}
console.log(
  `Audit Git: ${tracked.length} file tracciati, ${candidates.length} candidati controllati; nessun valore riservato stampato.`,
)
if (!tracked.length)
  console.log(
    'Il repository locale non ha ancora file tracciati: controllati anche tutti i candidati non ignorati.',
  )
if (failed) process.exitCode = 1
else
  console.log(
    'Controlli automatici sui file pubblicabili superati. Ricontrollare sempre lo staging prima del primo commit.',
  )
