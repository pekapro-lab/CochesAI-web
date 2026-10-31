/**
 * CochesAI v2 engine sound — 100 % WebAudio synthesis, no samples.
 * Each car model has a profile (cylinders, idle/redline, roughness, sub, turbo, pops…),
 * so a V8 burbles, a V12 shrieks and the turbo 4-cylinder whistles and pops.
 */
const DEFAULT_PROFILE = { cyl: 6, idle: 900, redline: 7600, tone: 1, sub: 0.35, rough: 0.25, noise: 0.15, turbo: 0.35, pops: 0.3, bright: 1, lope: 0 }

export class AudioEngine {
  constructor() {
    this.ctx = null
    this.muted = localStorage.getItem('peka-r-muted') === '1'
    this._started = false
    this._engine = null
    this.profile = { ...DEFAULT_PROFILE }
    this._gearIdx = 0
    this._lastThrottle = 0
    this._popCooldown = 0
  }

  async ensure() {
    if (this._started) return
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {})
    this._buildEngine()
    this._started = true
    this._applyMute()
  }

  setProfile(p) {
    this.profile = { ...DEFAULT_PROFILE, ...(p || {}) }
    if (!this._engine) return
    const e = this._engine, t = this.ctx.currentTime
    e.sub.g.gain.setTargetAtTime(this.profile.sub, t, 0.05)
    e.third.g.gain.setTargetAtTime(0.1 * this.profile.bright, t, 0.05)
    e.high.g.gain.setTargetAtTime(0.05 * Math.max(0, this.profile.bright - 0.8), t, 0.05)
    this._rpm = this.profile.idle
  }

  _noiseBuffer(sec, color = 0.86) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) { last = last * color + (Math.random() * 2 - 1) * (1 - color); d[i] = last * (1 / (1 - color)) * 0.5 }
    return buf
  }

  _buildEngine() {
    const ctx = this.ctx
    const mk = (type, f, g) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f
      const gn = ctx.createGain(); gn.gain.value = g
      o.connect(gn); o.start()
      return { o, g: gn }
    }
    const mix = ctx.createGain()
    const fund = mk('sawtooth', 40, 0.5)
    const sub = mk('square', 20, this.profile.sub)
    const harm = mk('sawtooth', 80, 0.2); harm.o.detune.value = 9
    const third = mk('triangle', 120, 0.1)
    const high = mk('sawtooth', 240, 0.02); high.o.detune.value = -7
    for (const v of [fund, sub, harm, third, high]) v.g.connect(mix)

    // exhaust/intake noise
    this._noise = this._noiseBuffer(2, 0.86)
    const noise = ctx.createBufferSource(); noise.buffer = this._noise; noise.loop = true
    const nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.frequency.value = 160; nbp.Q.value = 0.9
    const ngain = ctx.createGain(); ngain.gain.value = 0.15
    noise.connect(nbp); nbp.connect(ngain); ngain.connect(mix); noise.start()

    // firing pulses (roughness) + crank-order lope (V8 burble)
    const pulse = ctx.createGain(); pulse.gain.value = 0.7
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 20
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.28
    lfo.connect(lfoDepth); lfoDepth.connect(pulse.gain); lfo.start()
    const lope = ctx.createOscillator(); lope.type = 'sine'; lope.frequency.value = 7
    const lopeDepth = ctx.createGain(); lopeDepth.gain.value = 0
    lope.connect(lopeDepth); lopeDepth.connect(pulse.gain); lope.start()
    mix.connect(pulse)

    const shaper = ctx.createWaveShaper()
    const curve = new Float32Array(1024)
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.6) }
    shaper.curve = curve; shaper.oversample = '2x'

    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 380; filter.Q.value = 1.6
    const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 110; body.Q.value = 1.1; body.gain.value = 6
    const gain = ctx.createGain(); gain.gain.value = 0.0001
    const master = ctx.createGain(); master.gain.value = 0.2
    // limiter so phone speakers never clip
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 8; comp.attack.value = 0.004; comp.release.value = 0.2
    pulse.connect(shaper); shaper.connect(filter); filter.connect(body); body.connect(gain)
    gain.connect(master); master.connect(comp); comp.connect(ctx.destination)

    // turbo whistle
    const turbo = mk('sine', 2600, 0)
    const tbp = ctx.createBiquadFilter(); tbp.type = 'bandpass'; tbp.frequency.value = 3000; tbp.Q.value = 6
    turbo.g.disconnect(); turbo.o.disconnect(); turbo.o.connect(tbp); tbp.connect(turbo.g); turbo.g.connect(master)

    // tyre squeal (sliding)
    const sq = ctx.createBufferSource(); sq.buffer = this._noiseBuffer(1.5, 0.3); sq.loop = true
    const sqbp = ctx.createBiquadFilter(); sqbp.type = 'bandpass'; sqbp.frequency.value = 1100; sqbp.Q.value = 9
    const sqg = ctx.createGain(); sqg.gain.value = 0
    sq.connect(sqbp); sqbp.connect(sqg); sqg.connect(master); sq.start()

    this._engine = { fund, sub, harm, third, high, nbp, ngain, lfo, lfoDepth, lope, lopeDepth, filter, gain, master, turbo, sqg, sqbp, body }
    this._rpm = this.profile.idle
    this.setProfile(this.profile)
  }

  /** Simulated rpm with a 6-speed gearbox scaled to each engine's idle/redline (sound only). */
  _rpmFor(speedKmh, throttle) {
    const p = this.profile
    const gears = [0, 34, 64, 98, 134, 170, 999]
    let g = 0
    while (g < gears.length - 2 && speedKmh > gears[g + 1]) g++
    this._gearChanged = g > this._gearIdx
    this._gearIdx = g
    const lo = gears[g], hi = Math.min(gears[g + 1], 215)
    const t = Math.max(0, Math.min(1, (speedKmh - lo) / (hi - lo)))
    const span = p.redline - p.idle
    const base = g === 0 ? p.idle + t * span * 0.85 : p.idle + span * (0.5 + t * 0.45)
    return Math.max(p.idle * 0.95, base + throttle * span * 0.06 * (speedKmh < 5 ? 4 : 1))
  }

  _pop(t) {
    // exhaust crackle: short low-passed noise burst
    const ctx = this.ctx, e = this._engine
    const src = ctx.createBufferSource(); src.buffer = this._noise
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700 + Math.random() * 900
    const g = ctx.createGain(); g.gain.value = 0
    src.connect(lp); lp.connect(g); g.connect(e.master)
    const a = 0.25 + Math.random() * 0.35
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05 + Math.random() * 0.05)
    src.start(t, Math.random() * 1.5); src.stop(t + 0.14)
  }

  setDriving({ speedKmh, throttle, brake, slip = 0 }) {
    if (!this._engine || this.muted) return
    const e = this._engine, p = this.profile
    const t = this.ctx.currentTime
    const target = this._rpmFor(speedKmh, throttle)
    this._rpm += (target - this._rpm) * (this._gearChanged ? 0.6 : 0.22)
    const rn = Math.max(0, Math.min(1, (this._rpm - p.idle) / (p.redline - p.idle)))
    const f = (this._rpm / 60) * (p.cyl / 2) * 0.5 * p.tone // firing order, voiced an octave down for body
    e.fund.o.frequency.setTargetAtTime(f, t, 0.035)
    e.sub.o.frequency.setTargetAtTime(f / 2, t, 0.035)
    e.harm.o.frequency.setTargetAtTime(f * 2, t, 0.035)
    e.third.o.frequency.setTargetAtTime(f * 3, t, 0.035)
    e.high.o.frequency.setTargetAtTime(f * 4, t, 0.035)
    e.lfo.frequency.setTargetAtTime(f / 2, t, 0.035)
    e.lfoDepth.gain.setTargetAtTime(p.rough * (0.6 + throttle * 0.6), t, 0.08)
    e.lope.frequency.setTargetAtTime(this._rpm / 120, t, 0.05)
    e.lopeDepth.gain.setTargetAtTime(p.lope * (1 - rn * 0.7), t, 0.08)
    e.nbp.frequency.setTargetAtTime(f * 3.5, t, 0.08)
    e.ngain.gain.setTargetAtTime(p.noise * (0.4 + throttle * 1.1), t, 0.08)
    e.filter.frequency.setTargetAtTime((220 + f * 3.2 + throttle * 650) * p.bright, t, 0.08)
    e.body.frequency.setTargetAtTime(90 + p.cyl * 6, t, 0.2)
    let vol = 0.05 + Math.min(speedKmh / 200, 1) * 0.09 + throttle * 0.08 + brake * 0.01
    if (this._gearChanged) { e.gain.gain.cancelScheduledValues(t); e.gain.gain.setValueAtTime(vol * 0.35, t); vol *= 1 }
    e.gain.gain.setTargetAtTime(vol, t, this._gearChanged ? 0.09 : 0.06)
    // turbo
    const boost = p.turbo * throttle * rn
    e.turbo.o.frequency.setTargetAtTime(1800 + rn * 3800, t, 0.15)
    e.turbo.g.gain.setTargetAtTime(boost * 0.05, t, 0.2)
    // lift-off: crackles + blow-off
    this._popCooldown -= 1
    if (this._lastThrottle > 0.5 && throttle < 0.2 && rn > 0.35 && p.pops > 0) {
      const n = Math.round(2 + p.pops * 5)
      for (let i = 0; i < n; i++) if (Math.random() < p.pops + 0.2) this._pop(t + 0.03 + i * (0.04 + Math.random() * 0.06))
    }
    this._lastThrottle = throttle
    // tyre squeal
    const sq = Math.max(0, slip - 0.2) * Math.min(1, speedKmh / 40)
    e.sqg.gain.setTargetAtTime(sq * 0.12, t, 0.06)
    e.sqbp.frequency.setTargetAtTime(900 + sq * 500, t, 0.1)
  }

  /** Garage preview: blip the throttle of the current profile. */
  async revPreview() {
    await this.ensure()
    if (!this._engine || this.muted) return
    const steps = [0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]
    let i = 0, sp = 0
    clearInterval(this._revTimer)
    this._revTimer = setInterval(() => {
      const th = steps[i] ?? 0
      sp = th ? Math.min(30, sp + 6) : Math.max(0, sp - 5)
      this._gearIdx = 0
      this.setDriving({ speedKmh: sp, throttle: th, brake: 0 })
      if (++i > steps.length + 4) { clearInterval(this._revTimer); this.silence() }
    }, 90)
  }

  silence(fast = false) {
    if (!this._engine) return
    const t = this.ctx.currentTime, e = this._engine
    for (const g of [e.gain.gain, e.turbo.g.gain, e.sqg.gain]) {
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(0.0001, t, fast ? 0.02 : 0.12)
    }
    this._rpm = this.profile.idle
    this._lastThrottle = 0
  }

  engineLevel() { return this._engine ? this._engine.gain.gain.value : 0 }

  setHidden(hidden) {
    if (!this.ctx) return
    if (hidden) { this.silence(true); this.ctx.suspend?.().catch(() => {}) } else this.ctx.resume?.().catch(() => {})
  }

  beep(freq = 660, dur = 0.12) {
    if (!this.ctx || this.muted) return
    const o = this.ctx.createOscillator(), g = this.ctx.createGain()
    o.type = 'triangle'; o.frequency.value = freq
    o.connect(g); g.connect(this.ctx.destination)
    const t = this.ctx.currentTime
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.start(t); o.stop(t + dur + 0.02)
  }

  toggleMute() {
    this.muted = !this.muted
    localStorage.setItem('peka-r-muted', this.muted ? '1' : '0')
    this._applyMute()
    return this.muted
  }

  _applyMute() {
    if (!this._engine) return
    this._engine.master.gain.setTargetAtTime(this.muted ? 0 : 0.2, this.ctx.currentTime, 0.05)
  }
}
