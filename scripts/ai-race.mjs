/**
 * Bot race: 6 code-driven cars (the player's car is driven by the same AI) race 3 laps on every
 * track and every difficulty. Fails if any car does not finish in a reasonable time, leaves the
 * walled corridor, needs too many resets, or stalls. Deterministic 60 Hz stepping of the real game.
 */
import { chromium } from 'playwright'
import { serve } from './serve.mjs'
const PORT = 5199
const server = await serve(PORT)
const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] })
const page = await browser.newPage()
await page.goto(`http://127.0.0.1:${PORT}/CochesAI-web/`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__COCHES__ && window.__COCHES_APP__)
if (process.env.ALAT) await page.evaluate(([a, b]) => { window.__ALAT__ = a; window.__ABRK__ = b }, [+process.env.ALAT, +(process.env.ABRK || 0)])
const tracks = (process.env.TRACKS || 'norte,bosque,costa,sierra').split(',')
const diffs = (process.env.DIFFS || 'facil,normal,dificil').split(',')
let fail = false
for (const id of tracks) for (const diff of diffs) {
  const r = await page.evaluate(async ([id, diff, BOTS]) => {
    const { soloGrid } = window.__COCHES_TEST__
    const g = window.__COCHES__
    window.__COCHES_DEBUG__ = []
    if (window.__ALAT__) window.__COCHES_TEST__.AIDriver.A_LAT = window.__ALAT__; if (window.__ABRK__) window.__COCHES_TEST__.AIDriver.A_BRAKE = window.__ABRK__
    g.startTrack(id, { grid: soloGrid('Prueba', BOTS, diff), difficulty: diff })
    cancelAnimationFrame(g._raf); g._raf = 1
    g.ui.hideCountdown(); g.state = 'racing'
    let simT = 0
    g._raceTime = () => simT
    for (const x of g.racers) x.lapStart = 0
    const me = g.me
    me.driver = new window.__COCHES_TEST__.AIDriver(me, g.rl, { difficulty: diff, personality: window.__COCHES_TEST__.PERSONALITIES[5] })
    const half = g.track.roadWidth / 2
    const dt = 1 / 60
    const maxLat = {}
    let myRecovers = 0
    const origRec = g.recoverCar.bind(g); g.recoverCar = () => { myRecovers++; origRec() }
    const LIMIT = 330
    while (simT < LIMIT && !g.racers.every((x) => x.finished)) {
      simT += dt
      g._raceTick(dt, false)
      const c = g.state === 'racing' ? me.driver.update(dt, g.racers, 0) : null
      g.world.step(1 / 90, dt, 6)
      if (c) { g.car.update(dt, c); g._updateCheckpoint(); g._guardPhysics(dt, c) }
      g._raceAfterStep(dt)
      for (const x of g.racers) maxLat[x.name] = Math.max(maxLat[x.name] || 0, x.lateral || 0)
    }
    const out = g.racers.map((x) => ({ n: x.name, fin: x.finished, t: x.finishTime && +x.finishTime.toFixed(1), best: x.bestLap && +x.bestLap.toFixed(1), lat: +maxLat[x.name].toFixed(2), resets: (x.resets || 0) + (x === me ? myRecovers : 0), why: x.resetWhy, unjams: x.unjams || 0, place: x.place }))
    g._raf = 0
    return { dbg: window.__COCHES_DEBUG__.slice(0, 12), id, diff, half, simT: Math.round(simT), cars: out }
  }, [id, diff, +(process.env.BOTS || 5)])
  const bad = r.cars.filter((c) => !c.fin || c.lat > r.half + 1.5 || c.resets > 2)
  const order = r.cars.slice().sort((a, b) => a.place - b.place).map((c) => `${c.place}.${c.n} ${c.t ?? 'DNF'}s (mejor ${c.best}s, lat ${c.lat}, resets ${c.resets}, desatascos ${c.unjams}${c.why ? ' ' + JSON.stringify(c.why) : ''})`).join(' | ')
  console.log(`${id}/${diff}: ${order}`)
  if (bad.length) { fail = true; console.log('  dbg', JSON.stringify(r.dbg)); console.log('  FALLO:', JSON.stringify(bad)) }
}
await browser.close(); server.close()
console.log(fail ? 'AI RACE FAILED' : 'AI RACE PASSED'); if (fail) process.exitCode = 1
