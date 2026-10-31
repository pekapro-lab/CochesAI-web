// v2 screenshots: menu, garage (every model + custom tune), race grid and racing.
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync, mkdirSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const OUT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'shots-v2')
mkdirSync(OUT, { recursive: true })
const BASE = process.env.BASE_PATH || '/CochesAI-web'
const server = createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0])
  if (url.startsWith(BASE)) url = url.slice(BASE.length) || '/'
  let f = join(ROOT, url === '/' ? 'index.html' : url)
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(ROOT, 'index.html')
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise((r) => server.listen(5197, r))
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 600 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(`http://127.0.0.1:5197${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__COCHES__)
await page.waitForTimeout(800)
await page.screenshot({ path: join(OUT, '01-menu.png') })
await page.click('#btn-garage')
await page.waitForTimeout(600)
for (const id of ['rayo', 'toro', 'neon', 'brinco', 'roca']) {
  await page.click(`[data-k="model"][data-v="${id}"]`)
  await page.evaluate(() => { const g = window.__COCHES__.garage; g._autoSpin = false; g._yaw = 0.75 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, `02-garaje-${id}.png`) })
}
// custom tune on the muscle car
await page.click('[data-k="model"][data-v="toro"]')
for (const sel of ['[data-k="paint"][data-v="#ffd21a"]', '[data-k="finish"][data-v="perla"]', '[data-k="vinyl"][data-v="llamas"]', '[data-k="vinylColor"][data-v="#e8231e"]', '[data-k="rims"][data-v="turbina"]', '[data-k="rimColor"][data-v="#2a2a2e"]', '[data-k="spoiler"][data-v="ala"]', '[data-k="sticker"][data-v="calavera"]']) await page.click(sel)
await page.fill('#gar-num', '88'); await page.dispatchEvent('#gar-num', 'change')
await page.evaluate(() => { const g = window.__COCHES__.garage; g._yaw = -0.9 })
await page.waitForTimeout(500)
await page.screenshot({ path: join(OUT, '03-garaje-tuneado.png') })
const saved = await page.evaluate(() => localStorage.getItem('cochesai-garaje-v2'))
await page.click('#gar-close')
await page.waitForTimeout(300)
// race: day, 5 rivals, chase camera
await page.evaluate(() => { const g = window.__COCHES__; g.timeOfDay = 'day' })
await page.click('.track-btn')
await page.waitForTimeout(1200)
await page.evaluate(() => { const g = window.__COCHES__; g.cameraMode = 'chase' })
await page.waitForTimeout(600)
await page.screenshot({ path: join(OUT, '04-parrilla.png') })
// grid overview: camera beside the grid
await page.evaluate(() => {
  const g = window.__COCHES__; cancelAnimationFrame(g._raf); g._raf = 0
  const p = g.car.getPosition(), f = g.car.getForward()
  g.camera.position.set(p.x + f.z * 7 - f.x * 4, p.y + 3.2, p.z - f.x * 7 - f.z * 4)
  g.camera.lookAt(p.x - f.x * 6, p.y, p.z - f.z * 6)
  g.renderer.render(g.scene, g.camera)
})
await page.screenshot({ path: join(OUT, '05-parrilla-lateral.png') })
await page.evaluate(() => { const g = window.__COCHES__; g._loop() })
await page.waitForFunction(() => window.__COCHES__.state === 'racing', null, { timeout: 15000 })
await page.keyboard.down('ArrowUp')
await page.waitForTimeout(5000)
await page.screenshot({ path: join(OUT, '06-carrera.png') })
const info = await page.evaluate(() => { const g = window.__COCHES__; return { kmh: Math.round(g.car.speedKmh), model: g.car.model.id, rivals: g.racers.map((r) => r.car.model.id), env: !!g.scene.environment } })
await page.keyboard.up('ArrowUp')
// night race
await page.evaluate(() => { const g = window.__COCHES__; g.exitToMenu(); g.timeOfDay = 'night' })
await page.click('.track-btn:nth-child(3)')
await page.waitForFunction(() => window.__COCHES__.state === 'racing', null, { timeout: 15000 })
await page.evaluate(() => { window.__COCHES__.cameraMode = 'chase' })
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(3500); await page.keyboard.up('ArrowUp')
await page.screenshot({ path: join(OUT, '07-carrera-noche.png') })
console.log(JSON.stringify({ saved: JSON.parse(saved), info, errors }, null, 1))
await browser.close(); server.close()
