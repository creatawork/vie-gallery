/**
 * 生产形态复现静态服务器：
 * /app/ -> gallery-admin/dist（SPA 回退 index.html）
 * /g/   -> gallery-viewer/dist（SPA 回退 index.html）
 * 与生产 nginx（nginx-prod-ssl.conf）的同域布局一致。
 * 用法：node e2e/prod-shape-static-server.mjs [port]
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.argv[2] || 8099)
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

const APPS = [
  { prefix: '/app/', dist: join(ROOT, '..', 'gallery-admin', 'dist') },
  { prefix: '/g/', dist: join(ROOT, '..', 'gallery-viewer', 'dist') }
]

function serveFrom(dist, pathname) {
  const rel = pathname.replace(/^\/(app|g)\//, '')
  const target = normalize(join(dist, rel || 'index.html'))
  return readFile(target).then(buf => ({ buf, path: target }))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname === '/' || url.pathname === '/app') {
    res.writeHead(302, { Location: '/app/' }).end()
    return
  }
  const app = APPS.find(a => url.pathname.startsWith(a.prefix))
  if (!app) {
    res.writeHead(404).end('not found')
    return
  }
  try {
    const hit = await serveFrom(app.dist, url.pathname).catch(() =>
      serveFrom(app.dist, app.prefix)
    )
    res.writeHead(200, { 'Content-Type': MIME[extname(hit.path)] || 'application/octet-stream' })
    res.end(hit.buf)
  } catch {
    res.writeHead(500).end('serve error')
  }
})

server.listen(PORT, () => console.log(`prod-shape static server on :${PORT}`))
