/**
 * Start-line check: with throttle only (steer 0) the player car must leave the grid straight —
 * heading stays aligned with the track and no lateral drift in the first seconds.
 * Also checks engine audio gain drops to ~0 after finishing and on exit to menu.
 */
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const PORT = 5199
const server = createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0])
  if (url.startsWith('/CochesAI-web')) url = url.slice(13) || '/'
  let f = join(ROOT, url === '/' ? 'index.html' : url)
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(ROOT, 'index.html')
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise((r) => server.listen(PORT, r))
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage()
await page.goto(`http://127.0.0.1:${PORT}/CochesAI-web/`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__PEKA_R__)
let fail = false
for (const id of (process.env.TRACKS || 'norte,bosque,costa,sierra').split(',')) {
  const r = await page.evaluate((id) => {
    const g = window.__PEKA_R__
    g.startTrack(id)
    cancelAnimationFrame(g._raf)
    const b = g.car.chassisBody
    const yaw = () => { const q = b.quaternion; return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)) }
    // countdown (3.8 s) with the real loop body
    const step = (dt, controls) => { g._raceTick(dt, false); g.world.step(1 / 90, dt, 6); g.car.update(dt, controls); g._raceAfterStep(dt) }
    for (let i = 0; i < 228; i++) { g._raceTick(1 / 60, true); g.world.step(1 / 90, 1 / 60, 6); g.car.update(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: true }); g._raceAfterStep(1 / 60) }
    const y0 = yaw(), p0 = { x: b.position.x, z: b.position.z }
    const fx = Math.sin(y0), fz = Math.cos(y0)
    g.state = 'racing'
    let maxYaw = 0, maxLat = 0
    for (let i = 0; i < 120; i++) { // 2 s throttle only
      step(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: false })
      let d = yaw() - y0; d = Math.atan2(Math.sin(d), Math.cos(d))
      maxYaw = Math.max(maxYaw, Math.abs(d))
      const lat = (b.position.x - p0.x) * fz - (b.position.z - p0.z) * fx
      maxLat = Math.max(maxLat, Math.abs(lat))
    }
    // Track heading at the grid: direction of the centreline ~12 m ahead of the spawn point
    const P = g.track.path, N = P.length
    let i0 = 0, bd = Infinity
    P.forEach((p, k) => { const d = (p.x - p0.x) ** 2 + (p.z - p0.z) ** 2; if (d < bd) { bd = d; i0 = k } })
    let j = i0, acc = 0
    while (acc < 12) { const a = P[j], c = P[(j + 1) % N]; acc += Math.hypot(c.x - a.x, c.z - a.z); j = (j + 1) % N }
    const tx = P[j].x - P[i0].x, tz = P[j].z - P[i0].z
    const ty = Math.atan2(tx, tz)
    const spawnYawErr = Math.atan2(Math.sin(y0 - ty), Math.cos(y0 - ty))
    const fwd = (b.position.x - p0.x) * fx + (b.position.z - p0.z) * fz
    return { id, spawnYawErrDeg: +(spawnYawErr * 57.3).toFixed(2), maxYawDeg: +(maxYaw * 57.3).toFixed(2), maxLat: +maxLat.toFixed(2), fwd: +fwd.toFixed(1) }
  }, id)
  const ok = Math.abs(r.spawnYawErrDeg) < 8 && r.maxYawDeg < 4 && r.maxLat < 0.8 && r.fwd > 5
  if (!ok) fail = true
  console.log(ok ? 'OK  ' : 'FAIL', JSON.stringify(r))
}
// --- Engine audio must go silent after the finish and in the menu ---
const audio = await page.evaluate(async () => {
  const g = window.__PEKA_R__
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await g.audio.ensure()
  if (g.audio.muted) g.audio.toggleMute()
  const drive = async () => {
    cancelAnimationFrame(g._raf); g._raf = 0 // the heading checks above stopped the loop
    g.startTrack('norte')
    g._countStartedAt -= 3800 // skip countdown
    g.input.getControls = () => ({ throttle: 1, brake: 0, steer: 0, handbrake: false })
    await wait(1500)
    return g.audio.engineLevel()
  }
  const racing1 = await drive()
  g.state = 'finished' // what the finish line does
  await wait(1500)
  const afterFinish = g.audio.engineLevel()
  g.exitToMenu()
  await wait(800)
  const inMenu = g.audio.engineLevel()
  const racing2 = await drive()
  g.exitToMenu()
  await wait(1000)
  const menuDirect = g.audio.engineLevel()
  return { ctx: g.audio.ctx?.state, racing1, afterFinish, inMenu, racing2, menuDirect }
})
const aok = audio.racing1 > 0.03 && audio.racing2 > 0.03 && audio.afterFinish < 0.005 && audio.inMenu < 0.005 && audio.menuDirect < 0.005
if (!aok) fail = true
console.log(aok ? 'OK  ' : 'FAIL', 'audio', JSON.stringify(audio))
await browser.close(); server.close()
process.exit(fail ? 1 : 0)
