#!/usr/bin/env node
/**
 * Prueba de humo del sonido: arranca el motor de audio de verdad, con un
 * AudioContext simulado, y le pide que suene en todas las situaciones.
 *
 * Por qué existe: al portar la v2.6 se perdió un `const t = this.ctx.currentTime`
 * dentro de setDriving y el resto de la función seguía usando `t`. Eso es un
 * ReferenceError que revienta en cuanto arranca el motor: sin sonido y, según
 * dónde salte, cortando el bucle de la partida. `node --check` no lo ve, porque
 * el código es sintácticamente correcto. Este script lo ve.
 *
 * No necesita navegador ni three: AudioEngine solo importa Music.
 *
 * Uso: node scripts/smoke-audio.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

/* ---------- AudioContext simulado ---------- */

class Param {
  constructor() { this.value = 0 }
  setTargetAtTime() {}
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
  cancelScheduledValues() {}
  cancelAndHoldAtTime() {}
}

const chainable = () => ({
  connect() {}, disconnect() {},
  gain: new Param(), frequency: new Param(), detune: new Param(), Q: new Param(),
  type: '', buffer: null, loop: false, value: 0,
  start() {}, stop() {},
  o: { frequency: new Param(), detune: new Param(), connect() {}, disconnect() {}, start() {}, stop() {} },
  g: { gain: new Param(), connect() {}, disconnect() {} },
})

class FakeCtx {
  constructor() {
    this.currentTime = 0
    this.sampleRate = 44100
    this.destination = chainable()
    this.state = 'running'
  }
  createGain() { return chainable() }
  createOscillator() {
    return {
      frequency: new Param(), detune: new Param(), type: '',
      connect() {}, disconnect() {}, start() {}, stop() {},
    }
  }
  createBiquadFilter() { return chainable() }
  createBufferSource() { return chainable() }
  createWaveShaper() { return chainable() }
  createConvolver() { return chainable() }
  createDelay() { return chainable() }
  createDynamicsCompressor() {
    const n = chainable()
    n.threshold = new Param(); n.knee = new Param(); n.ratio = new Param()
    n.attack = new Param(); n.release = new Param()
    return n
  }
  createBuffer(ch, len) {
    return { getChannelData: () => new Float32Array(len) }
  }
  resume() { return Promise.resolve() }
  suspend() { return Promise.resolve() }
}

globalThis.AudioContext = FakeCtx
globalThis.window = { AudioContext: FakeCtx }
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalThis.__META_ENV__ = { BASE_URL: '/', DEV: false }

/* ---------- carga de AudioEngine ---------- */

// Music.js usa import.meta.env.BASE_URL, que no existe fuera de Vite. Se lee el
// fichero y se cambia por un global para poder importarlo desde Node.
const srcPath = join(ROOT, 'src/game/AudioEngine.js')
const musicPath = join(ROOT, 'src/game/Music.js')
const musicSrc = readFileSync(musicPath, 'utf8').replace(/import\.meta\.env/g, 'globalThis.__META_ENV__')
const tmpMusic = join(ROOT, 'src/game/.Music.smoke.mjs')
const { writeFileSync, unlinkSync } = await import('fs')
writeFileSync(tmpMusic, musicSrc)

const audioSrc = readFileSync(srcPath, 'utf8').replace("from './Music.js'", "from './.Music.smoke.mjs'")
const tmpAudio = join(ROOT, 'src/game/.AudioEngine.smoke.mjs')
writeFileSync(tmpAudio, audioSrc)

let failed = 0
const ok = (msg) => console.log(`  ok  ${msg}`)
const bad = (msg, e) => { failed++; console.log(`  FALLA  ${msg}${e ? ' — ' + e.message : ''}`) }

try {
  const { AudioEngine } = await import(tmpAudio)
  const a = new AudioEngine()

  // 1. Arrancar el motor: aquí es donde reventaba el ReferenceError.
  await a.ensure()
  if (a._engine) ok('el motor de audio arranca')
  else bad('el motor de audio no arranca (sin _engine)')

  // 2. Conducir en todas las marchas, con y sin turbo.
  try {
    for (let g = 0; g < 6; g++) {
      for (let i = 0; i < 30; i++) {
        a.setDriving({ speedKmh: g * 30 + i, throttle: i % 3 ? 1 : 0, brake: 0, slip: 0.1, gear: g, boost: i / 30 })
      }
    }
    ok('setDriving aguanta 180 frames en las seis marchas')
  } catch (e) { bad('setDriving lanza una excepción', e) }

  // 3. Marcha atrás.
  try {
    a.setDriving({ speedKmh: 10, throttle: 0, brake: 1, gear: -1, boost: 0 })
    ok('setDriving aguanta marcha atrás')
  } catch (e) { bad('setDriving falla en marcha atrás', e) }

  // 4. Sin datos del coche (garaje): debe usar su propia estimación.
  try {
    for (let i = 0; i < 40; i++) a.setDriving({ speedKmh: i * 3, throttle: i % 2, brake: 0 })
    ok('setDriving aguanta el garaje (sin marcha ni turbo)')
  } catch (e) { bad('setDriving falla en el garaje', e) }

  // 5. Silenciar y volver a arrancar.
  try {
    a.silence()
    a.silence(true)
    a.setDriving({ speedKmh: 80, throttle: 1, brake: 0, gear: 2, boost: 0.5 })
    ok('silence() y volver a conducir')
  } catch (e) { bad('silence() falla', e) }

  // 6. Los perfiles de cada coche.
  try {
    for (const p of [{ turbo: 0 }, { turbo: 0.35 }, { turbo: 0.8 }]) {
      a.setProfile({ ...a.profile, ...p })
      a.setDriving({ speedKmh: 100, throttle: 1, brake: 0, gear: 3, boost: 1 })
    }
    ok('los perfiles sin turbo, con turbo y con turbo grande')
  } catch (e) { bad('setProfile o setDriving falla por perfil', e) }

  // 7. Mudo.
  try {
    a.muted = true
    a.setDriving({ speedKmh: 50, throttle: 1, brake: 0, gear: 1, boost: 0.4 })
    a.muted = false
    ok('el modo mudo no revienta')
  } catch (e) { bad('el modo mudo falla', e) }

} finally {
  for (const f of [tmpAudio, tmpMusic]) {
    try { unlinkSync(f) } catch {}
  }
}

if (failed) {
  console.log(`\n${failed} fallo(s) en el sonido.`)
  process.exit(1)
}
console.log('\nSonido OK.')
