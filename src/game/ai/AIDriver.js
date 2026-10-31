import { speedProfile } from './RacingLine.js'

export const DIFFICULTY = {
  facil: { label: 'Fácil', skill: 0.78 },
  normal: { label: 'Normal', skill: 0.9 },
  dificil: { label: 'Difícil', skill: 1.0 },
}

/** Rival personalities: each tweaks grip use, braking point, line and overtaking. */
export const PERSONALITIES = [
  { name: 'Rayo', color: 0x2f7bff, desc: 'agresivo', pace: 1.03, brakeLate: 1.12, aggression: 0.95, lineBias: 0, wander: 0.15 },
  { name: 'Tortuga Zen', color: 0x33c46a, desc: 'constante', pace: 0.97, brakeLate: 0.9, aggression: 0.2, lineBias: 0, wander: 0.05 },
  { name: 'Chispa', color: 0xffc21a, desc: 'frena tarde', pace: 1.0, brakeLate: 1.25, aggression: 0.7, lineBias: 0.4, wander: 0.35 },
  { name: 'Bruma', color: 0xb06cff, desc: 'por fuera', pace: 1.0, brakeLate: 1.0, aggression: 0.5, lineBias: -0.9, wander: 0.2 },
  { name: 'Toro', color: 0xff7a1a, desc: 'empuja', pace: 1.01, brakeLate: 1.05, aggression: 1.0, lineBias: 0.6, wander: 0.25 },
  { name: 'Lince', color: 0x19d3d3, desc: 'preciso', pace: 1.02, brakeLate: 1.0, aggression: 0.6, lineBias: 0, wander: 0.05 },
  { name: 'Nube', color: 0xf0f0f0, desc: 'tranquila', pace: 0.95, brakeLate: 0.9, aggression: 0.3, lineBias: -0.3, wander: 0.3 },
]

/**
 * Code-driven rival. Pure pursuit on the racing line with speed-dependent look-ahead,
 * speed profile braking, traffic avoidance / overtaking, soft rubber band and
 * a reverse-out routine when stuck. Produces the same controls object as the player.
 */
export class AIDriver {
  constructor(racer, rl, { difficulty = 'normal', personality = PERSONALITIES[0], seed = 1 } = {}) {
    this.racer = racer
    this.rl = rl
    this.p = personality
    this.skill = (DIFFICULTY[difficulty] || DIFFICULTY.normal).skill
    const grip = this.skill * personality.pace
    this.vProf = speedProfile(rl, { aLat: AIDriver.A_LAT * grip, aBrake: AIDriver.A_BRAKE * personality.brakeLate * this.skill, vTop: 51 * grip })
    this.ctl = { throttle: 0, brake: 0, steer: 0, handbrake: false }
    this.phase = seed * 1.7
    this.sideOff = 0 // current avoidance offset (m)
    this.rubber = 1
    this.stuck = 0
    this.backOut = 0
    this.noProgress = 0
    this.lastProgress = 0
  }

  /** others: array of racers (with .car); leaderGap: metres to the human reference (+ = bot is behind). */
  update(dt, others, refProgressGap = 0) {
    const { line, nx, nz, N, ds, maxOff } = this.rl
    const car = this.racer.car
    const pos = car.getPosition()
    const f = car.getForward()
    const v = car.speedKmh / 3.6
    const i = this.racer.idx
    const avgDs = ds[i] || 1
    this.phase += dt

    // Soft rubber band: up to +7% when far behind, -6% when far ahead of the human(s)
    const gapM = refProgressGap * avgDs
    const target = 1 + Math.max(-0.06, Math.min(0.07, gapM / 900))
    this.rubber += (target - this.rubber) * Math.min(1, dt * 0.5)

    // --- traffic: pick an avoidance offset ---
    let wantSide = this.p.lineBias * 0.6 + Math.sin(this.phase * 0.37) * this.p.wander
    let follow = Infinity
    for (const o of others) {
      if (o === this.racer || !o.car) continue
      const op = o.car.getPosition()
      const dx = op.x - pos.x, dz = op.z - pos.z
      const ahead = dx * f.x + dz * f.z
      if (ahead < -2 || ahead > 16) continue
      const lat = dx * f.z - dz * f.x // >0: other is to our right? (left-handed check below)
      if (Math.abs(lat) > 3.2) continue
      // Pass on the side with more room relative to our own line offset
      const myOff = line[i].off + this.sideOff
      const goLeft = lat < 0 ? false : true
      let side = goLeft ? 1 : -1
      if (Math.abs(myOff + side * 2.6) > maxOff) side = -side
      const urgency = 1 - Math.max(0, ahead) / 16
      wantSide = side * (1.8 + 1.0 * urgency)
      const oSpeed = (o.car.speedKmh || 0) / 3.6
      // Cautious drivers lift when boxed in; aggressive ones keep their foot down
      if (ahead > 0 && ahead < 7 && Math.abs(lat) < 2.2) follow = Math.min(follow, Math.max(5, oSpeed + this.p.aggression * 4 - 1))
    }
    this.sideOff += (wantSide - this.sideOff) * Math.min(1, dt * 1.6)

    // --- steering: pure pursuit ---
    const la = Math.max(2, Math.round((7 + v * 0.4) / avgDs))
    const j = (i + la) % N
    let o = line[j].off + this.sideOff
    o = Math.max(-maxOff, Math.min(maxOff, o))
    const cx = this.rl.line[j].x - nx[j] * line[j].off, cz = line[j].z - nz[j] * line[j].off
    const tx = cx + nx[j] * o, tz = cz + nz[j] * o
    const cross = f.x * (tz - pos.z) - f.z * (tx - pos.x)
    const dot = f.x * (tx - pos.x) + f.z * (tz - pos.z)
    const ang = Math.atan2(cross, dot)
    let steer = Math.max(-1, Math.min(1, -ang * 2.4))

    // --- speed: profile a bit ahead (reaction), personality, rubber band, traffic ---
    let vt = Infinity
    const lb = Math.max(2, Math.round(v * 0.25 / avgDs))
    for (let k = 0; k <= lb; k++) vt = Math.min(vt, this.vProf[(i + k) % N])
    vt *= this.rubber
    if (Math.abs(this.sideOff) > 1.5) vt *= 0.97
    vt = Math.min(vt, follow)
    // Far off the line (after a hit): slow down to rejoin
    if (this.racer.lateral > this.rl.half - 0.5) vt = Math.min(vt, 12)

    const ctl = this.ctl
    ctl.handbrake = false
    if (v < vt - 0.5) { ctl.throttle = 1; ctl.brake = 0 }
    else if (v > vt + 1.5) { ctl.throttle = 0; ctl.brake = 1 }
    else { ctl.throttle = v < vt ? 1 : 0; ctl.brake = 0 }
    ctl.steer = steer

    // --- stuck handling ---
    // 1) Facing the wrong way (spin): full-lock turn toward the target; back out only if blocked.
    if (Math.abs(ang) > 1.6 && this.backOut <= 0) {
      this.turning = (this.turning || 0) + dt
      ctl.throttle = 1; ctl.brake = 0; ctl.steer = ang > 0 ? -1 : 1
    } else if (this.backOut <= 0) this.turning = 0
    // 2) Nose against a wall / car: reverse with opposite lock, then drive on.
    if (this.backOut > 0) {
      this.backOut -= dt
      ctl.throttle = 0; ctl.brake = 1; ctl.steer = -(this._backSteer || steer)
    } else if (v < 0.8 && ctl.throttle) {
      this.stuck += dt
      if (this.stuck > 0.7) { this.backOut = 0.9; this._backSteer = ctl.steer; this.stuck = 0 }
    } else this.stuck = Math.max(0, this.stuck - dt)
    this.debugAng = ang
    return ctl
  }

  /** True when the bot has made no forward progress for a long time (caller resets it). */
  checkStall(dt) {
    // Sliding window: progress gained over the last ~6 s must be > 3 samples
    this.noProgress += dt
    this._hist ||= []
    if (this.noProgress >= 1) {
      this.noProgress = 0
      this._hist.push(this.racer.progress)
      if (this._hist.length > 7) this._hist.shift()
      if (this._hist.length === 7 && this._hist[6] - this._hist[0] < 3) { this._hist = []; return true }
    }
    return false
  }
}
AIDriver.A_LAT = 9.2
AIDriver.A_BRAKE = 7.2
