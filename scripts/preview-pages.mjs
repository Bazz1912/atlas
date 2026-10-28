// Strict static preview: no Vite SPA fallback, like a repository Pages directory.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
const baseArg = process.argv.find((a) => a.startsWith('--base='))?.slice(7) || '/atlas/'
const base = baseArg === '/' ? '/' : baseArg.replace(/\/$/, '') + '/'
if (!/^\/(?:[A-Za-z0-9_.-]+\/)?$/.test(base)) throw new Error('Base path non valido')
const port = Number(process.argv.find((a) => a.startsWith('--port='))?.slice(7) || 4173),
  root = resolve('dist')
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (base !== '/' && url.pathname === base.slice(0, -1)) {
      res.writeHead(301, { Location: base + url.search })
      res.end()
      return
    }
    if (!url.pathname.startsWith(base)) throw new Error()
    const relative = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html'
    const path = resolve(root, relative)
    if (!path.startsWith(root + '/') || !(await stat(path)).isFile()) throw new Error()
    res.writeHead(200, {
      'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    res.end(await readFile(path))
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}).listen(port, '127.0.0.1', () =>
  console.log(`Anteprima statica Pages: http://127.0.0.1:${port}${base}`),
)
