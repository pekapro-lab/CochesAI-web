import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }
export async function serve(port) {
  const server = createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0])
    if (url.startsWith('/CochesAI-web')) url = url.slice(13) || '/'
    let f = join(ROOT, url === '/' ? 'index.html' : url)
    if (!existsSync(f) || statSync(f).isDirectory()) f = join(ROOT, 'index.html')
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' })
    res.end(readFileSync(f))
  })
  await new Promise((r) => server.listen(port, r))
  return server
}
