/**
 * CochesAI music (Peka Música tracks) via WebAudio on the engine's AudioContext.
 * Gapless loops with explicit loopStart/loopEnd (MP3 encoder delay handled), OGG where
 * decodable, MP3 fallback (iOS Safari). Own gain below the engine; separate on/off
 * (localStorage 'cochesai-music') independent of the global mute.
 */
// Versión Suno (Peka Música). Sintetizada en music/sintetizada/ (71.1111/120/130.9091/125.2174/115.2)
const LOOPS = { menu_garaje: 70.9994, carrera_norte: 146.9083, carrera_costa: 143.3653, carrera_bosque: 149.8376, carrera_sierra: 153.6061 }
const SHORT = ['cuenta_atras', 'ultima_vuelta', 'victoria', 'fin_carrera', 'ui_click', 'ui_confirmar']
const MUSIC_VOL = 0.42 // loops at -17 LUFS sit ~6 dB under the engine already
const MP3_DELAY = 1105 / 44100

function preferOgg() {
  const ua = navigator.userAgent || ''
  const apple = /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Android|CriOS|FxiOS|Edg/.test(ua)) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (apple) return false
  try { return !!document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"') } catch { return false }
}

export class Music {
  constructor(audio) {
    this.audio = audio
    this.enabled = localStorage.getItem('cochesai-music') !== '0'
    this.base = (import.meta.env.BASE_URL || '/') + 'music/'
    this.ext = preferOgg() ? 'ogg' : 'mp3'
    this.buffers = {}
    this._loading = {}
    this.current = null // { name, src, g }
    this.ready = false
    this.duck = 1
  }

  /** Called once the AudioContext exists (after a user gesture). */
  init() {
    const ctx = this.audio.ctx
    if (!ctx || this.out) return
    this.out = ctx.createGain(); this.out.gain.value = this._target()
    this.out.connect(ctx.destination)
    this.ready = true
    for (const n of SHORT) this.load(n).catch(() => {})
    this.load('menu_garaje').catch(() => {})
  }

  /** iOS: a silent buffer started inside the gesture unlocks output. */
  unlock() {
    const ctx = this.audio.ctx
    if (!ctx || this._unlocked) return
    try { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0) } catch {}
    if (ctx.state === 'running') this._unlocked = true
  }

  _target() { return this.enabled && !this.audio.muted ? MUSIC_VOL * this.duck : 0 }
  apply() { if (this.out) this.out.gain.setTargetAtTime(this._target(), this.audio.ctx.currentTime, 0.08) }

  load(name) {
    if (this.buffers[name]) return Promise.resolve(this.buffers[name])
    if (this._loading[name]) return this._loading[name]
    const ctx = this.audio.ctx
    const get = (ext) => fetch(this.base + name + '.' + ext).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer() })
      .then((ab) => new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej) }))
      .then((buf) => ({ buf, ext }))
    const p = get(this.ext).catch((e) => { if (this.ext === 'mp3') throw e; return get('mp3') })
      .then((r) => { this.buffers[name] = r; return r })
    this._loading[name] = p
    p.catch(() => { delete this._loading[name] })
    return p
  }

  setEnabled(on) {
    this.enabled = !!on
    localStorage.setItem('cochesai-music', on ? '1' : '0')
    this.apply()
    return this.enabled
  }
  toggle() { return this.setEnabled(!this.enabled) }

  setDuck(v) { this.duck = v; this.apply() }

  /** Crossfade to a loop by name. */
  async playLoop(name, fade = 1.2) {
    if (!this.ready) return
    this._want = name
    if (this.current?.name === name) return
    let r
    try { r = await this.load(name) } catch { return }
    if (this._want !== name || this.current?.name === name) return
    const ctx = this.audio.ctx, t = ctx.currentTime
    const len = LOOPS[name]
    const off = r.ext === 'mp3' && r.buf.duration - len > 0.02 ? MP3_DELAY : 0
    const src = ctx.createBufferSource(); src.buffer = r.buf; src.loop = true
    src.loopStart = off; src.loopEnd = Math.min(r.buf.duration, off + len)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + fade)
    src.connect(g); g.connect(this.out); src.start(t, off)
    this.stopLoop(fade)
    this.current = { name, src, g }
  }

  stopLoop(fade = 0.6) {
    this._wantClear = true
    const c = this.current
    this.current = null
    if (!c) return
    const t = this.audio.ctx.currentTime
    c.g.gain.cancelScheduledValues(t); c.g.gain.setValueAtTime(Math.max(c.g.gain.value, 0.0001), t)
    c.g.gain.exponentialRampToValueAtTime(0.0001, t + fade)
    try { c.src.stop(t + fade + 0.05) } catch {}
  }

  /** One-shot at ctx time `when` (default now), skipping `offset` seconds. */
  play(name, { when = 0, offset = 0, gain = 1 } = {}) {
    if (!this.ready) return null
    const r = this.buffers[name]
    if (!r) { this.load(name).catch(() => {}); return null }
    const ctx = this.audio.ctx
    const src = ctx.createBufferSource(); src.buffer = r.buf
    const g = ctx.createGain(); g.gain.value = gain
    src.connect(g); g.connect(this.out)
    src.start(Math.max(ctx.currentTime, when), Math.max(0, offset))
    ;(this._shots ||= new Set()).add(src); src.onended = () => this._shots.delete(src)
    return src
  }

  stopShots() { for (const s of this._shots || []) { try { s.stop() } catch {} } this._shots?.clear() }

  /** Schedules the countdown so its "¡YA!" (2.4 s into the file) lands at performance-time `goAt`. */
  countdown(goAt) {
    if (!this.ready) return false
    const ctx = this.audio.ctx
    const startIn = (goAt - performance.now()) / 1000 - 2.4
    if (startIn < -2.4) return false
    this.play('cuenta_atras', { when: ctx.currentTime + Math.max(0, startIn), offset: Math.max(0, -startIn) })
    return !!this.buffers.cuenta_atras && this.enabled && !this.audio.muted
  }

  ui(name) { if (this.enabled) this.play(name, { gain: 0.8 }) }
}
