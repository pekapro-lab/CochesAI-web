/**
 * Multiplayer: two independent browser contexts connect through PeerJS (public cloud server
 * 0.peerjs.com by default, or PEER_HOST=host:port for a local peerjs-server), race 1 lap with
 * 2 bots filling seats, and must: see each other's car, start in sync, agree on the standings
 * and receive the same final results.
 */
import { chromium } from 'playwright'
import { serve } from './serve.mjs'
const PORT = 5201
const server = await serve(PORT)
const q = process.env.PEER_HOST ? `?peerHost=${process.env.PEER_HOST}` : ''
const url = `http://127.0.0.1:${PORT}/CochesAI-web/${q}`
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const open = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(name, 'pageerror', e.message))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__COCHES_APP__)
  await page.fill('#in-name', name)
  await page.dispatchEvent('#in-name', 'change')
  await page.selectOption('#sel-bots', '2')
  // The test "player" drives with the same AI as the bots
  await page.evaluate(() => {
    const g = window.__COCHES__, T = window.__COCHES_TEST__
    g.input.getControls = () => {
      if (!g.me) return { throttle: 0, brake: 0, steer: 0, handbrake: false }
      if (!g.me.driver) g.me.driver = new T.AIDriver(g.me, g.rl, { difficulty: 'normal', personality: T.PERSONALITIES[5] })
      return g.me.driver.update(1 / 60, g.racers, 0)
    }
  })
  return page
}
const fail = (m) => { console.log('FALLO:', m); process.exitCode = 1 }
const A = await open('Ana')
const B = await open('Beto')
await A.click('#btn-host')
await A.waitForFunction(() => /^[A-Z0-9]{5}$/.test(document.querySelector('#room-code').textContent), null, { timeout: 30000 })
const code = await A.textContent('#room-code')
console.log('sala', code, 'servidor', process.env.PEER_HOST || '0.peerjs.com (público)')
await B.fill('#in-code', code)
await B.click('#btn-join')
await A.waitForFunction(() => document.querySelectorAll('#lobby-players li').length === 2, null, { timeout: 30000 })
await B.waitForFunction(() => document.querySelectorAll('#lobby-players li').length === 2, null, { timeout: 30000 })
console.log('sala A:', await A.textContent('#lobby-players'), '| sala B:', await B.textContent('#lobby-players'))
await B.waitForTimeout(1800) // a few clock-sync pings
await A.evaluate(() => window.__COCHES_APP__.ui.onStartNet('norte', { laps: 1 }))
await Promise.all([A, B].map((p) => p.waitForFunction(() => window.__COCHES__.raceStartedHost != null, null, { timeout: 30000 })))
const sA = await A.evaluate(() => window.__COCHES__.raceStartedHost)
const sB = await B.evaluate(() => window.__COCHES__.raceStartedHost)
const off = await B.evaluate(() => ({ off: window.__COCHES_APP__.net.clockOffset, rtt: window.__COCHES_APP__.net.rtt }))
console.log(`salida: diferencia ${Math.abs(sA - sB).toFixed(0)} ms (rtt ${off.rtt?.toFixed(1)} ms)`)
if (Math.abs(sA - sB) > 200) fail('salida no sincronizada')
const grid = await A.evaluate(() => window.__COCHES__.racers.map((r) => `${r.name}:${r.kind}`))
const gridB = await B.evaluate(() => window.__COCHES__.racers.map((r) => `${r.name}:${r.kind}`))
console.log('parrilla A', grid.join(', '), '| B', gridB.join(', '))
if (grid.length !== 4 || gridB.length !== 4) fail('parrilla debe tener 2 humanos + 2 bots')
await A.waitForTimeout(8000)
// Each side sees the other's car where the other really is (≤ ~latency·speed + interpolation)
const pose = (p, who) => p.evaluate((who) => { const g = window.__COCHES__; const r = g.racers.find((x) => x.name === who); const b = r.car.chassisBody.position; return { x: b.x, z: b.z, kind: r.kind, buf: r.buf.length, kmh: r.car.speedKmh, prog: r.progress } }, who)
const [aSelf, bSeesA, bSelf, aSeesB] = await Promise.all([pose(A, 'Ana'), pose(B, 'Ana'), pose(B, 'Beto'), pose(A, 'Beto')])
const dA = Math.hypot(aSelf.x - bSeesA.x, aSelf.z - bSeesA.z), dB = Math.hypot(bSelf.x - aSeesB.x, bSelf.z - aSeesB.z)
console.log(`B ve a Ana a ${dA.toFixed(1)} m de su posición real (${Math.round(aSelf.kmh)} km/h); A ve a Beto a ${dB.toFixed(1)} m (${Math.round(bSelf.kmh)} km/h)`)
if (bSeesA.kind !== 'remote' || aSeesB.kind !== 'remote' || !bSeesA.buf || !aSeesB.buf) fail('no llegan snapshots del otro coche')
if (aSelf.prog < 5 || bSelf.prog < 5) fail('los coches no avanzan')
if (dA > 12 || dB > 12) fail('el coche remoto está demasiado lejos de su posición real')
const order = (p) => p.evaluate(() => (window.__COCHES__._standings || []).map((r) => r.name))
const [oA, oB] = await Promise.all([order(A), order(B)])
console.log('clasificación A:', oA.join(' > '), '| B:', oB.join(' > '))
const human = (o) => o.filter((n) => n === 'Ana' || n === 'Beto').join('>')
if (human(oA) !== human(oB)) console.log('  (aviso: orden de humanos distinto en este instante, se comprueba al final)')
await Promise.all([A, B].map((p) => p.waitForFunction(() => window.__COCHES__.lastResults, null, { timeout: 150000 })))
const rA = await A.evaluate(() => window.__COCHES__.lastResults.map((r) => `${r.place}.${r.name}`).join(' '))
const rB = await B.evaluate(() => window.__COCHES__.lastResults.map((r) => `${r.place}.${r.name}`).join(' '))
console.log('resultados A:', rA, '| B:', rB)
if (rA !== rB) fail('resultados distintos')
await A.screenshot({ path: '/workspace/cochesai-mp-anfitrion.png' })
await B.screenshot({ path: '/workspace/cochesai-mp-invitado.png' })
await browser.close(); server.close()
console.log(process.exitCode ? 'MULTIPLAYER FAILED' : 'MULTIPLAYER PASSED')
