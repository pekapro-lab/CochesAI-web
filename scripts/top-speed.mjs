/**
 * Top-speed check: on each track the player car is driven flat-out for 40 s with a naive centreline
 * follower (never brakes). It must reach ≥185 km/h somewhere (cap 195), never exceed ~197, and stay
 * inside the wall corridor (|lateral| < roadWidth/2 + 2, on the ground). A rival-config car is capped at 185 (beta.3: gap 10 km/h).
 */
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const PORT = 5195
const server = createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0])
  if (url.startsWith('/CochesAI-web')) url = url.slice(13) || '/'
  let f = join(ROOT, url === '/' ? 'index.html' : url)
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(ROOT, 'index.html')
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise((r) => server.listen(PORT, r))
const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] })
const page = await browser.newPage()
await page.goto(`http://127.0.0.1:${PORT}/CochesAI-web/`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__PEKA_R__)
let fail = false
const results = []
for (const id of (process.env.TRACKS || 'norte,bosque,costa,sierra').split(',')) {
  const r = await page.evaluate((id) => {
    const g = window.__PEKA_R__
    g.startTrack(id)
    cancelAnimationFrame(g._raf)
    g.state = 'racing'
    const P = g.track.path, N = P.length, W = g.track.roadWidth || 12
    const head = (k) => { const a = P[k % N], c = P[(k + 1) % N]; return Math.atan2(c.x - a.x, c.z - a.z) }
    // longest run of path where heading changes < 0.5 rad from its start
    let best = 0, bestLen = 0
    for (let s = 0; s < N; s += 2) {
      let len = 0, k = s
      const h0 = head(s)
      while (len < 2000) { let d = head(k) - h0; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) > 0.12) break; const a = P[k % N], c = P[(k + 1) % N]; len += Math.hypot(c.x - a.x, c.z - a.z); k++ }
      if (len > bestLen) { bestLen = len; best = s }
    }
    const car = g.car, b = car.chassisBody
    const others = g.racers.filter((x) => x.car !== car).map((x) => x.car.topSpeedKmh)
    const C = car.constructor, probe = new C(g.world, g.scene, { x: 0, y: -50, z: 0, yaw: 0 }, { lite: true, collideCars: false }); others.push(probe.topSpeedKmh, probe.highSpeedBoost + 185)
    car.teleport(P[best].x, (P[best].y || 0) + 0.8, P[best].z, head(best))
    let maxKmh = 0, maxLat = 0, idx = best
    for (let i = 0; i < 60 * 40; i++) {
      const p = b.position
      // nearest path index ahead
      for (let t = 0; t < 8; t++) { const a = P[idx % N], c = P[(idx + 1) % N]; if ((c.x - a.x) * (p.x - c.x) + (c.z - a.z) * (p.z - c.z) > 0) idx++; else break }
      const a = P[idx % N], h = head(idx)
      const lat = (p.x - a.x) * Math.cos(h) - (p.z - a.z) * Math.sin(h)
      maxLat = Math.max(maxLat, Math.abs(lat))
      const q = b.quaternion, yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x))
      const la = P[(idx + Math.max(6, Math.round(car.speedKmh / 12))) % N]
      let want = Math.atan2(la.x - p.x, la.z - p.z) - yaw; want = Math.atan2(Math.sin(want), Math.cos(want))
      const steer = Math.max(-1, Math.min(1, want * 3))
      g.world.step(1 / 90, 1 / 60, 6)
      car.update(1 / 60, { throttle: 1, brake: 0, steer, handbrake: false })
      maxKmh = Math.max(maxKmh, car.speedKmh)
    }
    const y = +b.position.y.toFixed(2)
    return { id, y, straightM: Math.round(bestLen), maxKmh: Math.round(maxKmh), maxLat: +maxLat.toFixed(2), halfRoad: W / 2, rivalCaps: [...new Set(others)] }
  }, id)
  const ok = r.maxLat < r.halfRoad + 2 && r.y > -2 && r.y < 6 && r.maxKmh <= 197 && r.rivalCaps.every((c) => c === 185)
  results.push(r)
  console.log(ok ? 'OK  ' : 'FAIL', JSON.stringify(r))
  if (!ok) fail = true
}
const top = Math.max(...results.map((r) => r.maxKmh))
console.log(top >= 185 ? 'OK  ' : 'FAIL', `best top speed ${top} km/h (needs ≥185 flat-out on track)`)
if (top < 185) fail = true
await browser.close(); server.close()
process.exit(fail ? 1 : 0)
