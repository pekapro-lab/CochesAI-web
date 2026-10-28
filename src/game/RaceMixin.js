import * as THREE from 'three'
import { Car } from './Car.js'
import { Racer, standings, guardBot, nearestIndex } from './ai/Racer.js'
import { AIDriver, PERSONALITIES } from './ai/AIDriver.js'
import { buildRacingLine } from './ai/RacingLine.js'

// Player top speed (HUD km/h). Rivals keep Car's default 145 km/h and no boost.
export const PLAYER_TOP_SPEED_KMH = 195
export const PLAYER_HIGH_SPEED_BOOST = 0.6

const PLAYER_COLORS = [0xe8231e, 0x2f7bff, 0x33c46a, 0xffc21a, 0xb06cff, 0xff7a1a]
const INTERP_DELAY = 120 // ms

/** Default solo grid: the player plus `bots` rivals. */
export function soloGrid(name, bots, difficulty) {
  const grid = [{ id: 'me', name: name || 'Tú', kind: 'local', color: PLAYER_COLORS[0] }]
  for (let i = 0; i < bots; i++) {
    const p = PERSONALITIES[i % PERSONALITIES.length]
    grid.push({ id: 'bot' + i, name: p.name, kind: 'bot', color: p.color, personality: i % PERSONALITIES.length, difficulty })
  }
  return grid
}

/** Multiplayer grid built by the host: humans first, bots fill the empty seats up to `seats`. */
export function netGrid(players, seats, difficulty) {
  const grid = players.map((p, i) => ({ id: p.id, name: p.name, kind: 'human', color: PLAYER_COLORS[i % PLAYER_COLORS.length] }))
  const used = new Set()
  for (let i = 0; grid.length < seats; i++) {
    let k = i % PERSONALITIES.length
    const pers = PERSONALITIES[k]
    if (used.has(k)) continue
    used.add(k)
    grid.push({ id: 'bot' + i, name: pers.name, kind: 'bot', color: pers.color, personality: k, difficulty })
  }
  return grid
}

export const RaceMixin = {
  /** Grid slot k: walks back along the centreline (the start area may curve), alternating sides. */
  _slotSpawn(k) {
    const s = this.track.spawn, P = this.track.path, N = P.length
    const i0 = nearestIndex(P, s)
    let dist = k * 5.5, i = i0, x = s.x, z = s.z
    while (dist > 0) {
      const q = P[(i - 1 + N) % N]
      const seg = Math.hypot(q.x - x, q.z - z)
      if (seg >= dist) { const u = dist / seg; x += (q.x - x) * u; z += (q.z - z) * u; break }
      dist -= seg; x = q.x; z = q.z; i = (i - 1 + N) % N
    }
    // Heading: aim at the centreline ~12 m ahead (a 2-point tangent can be 20° off where the
    // start area curves, which pointed the car at the wall and looked like it veered at launch).
    let j = i, ahead = 12, ax = x, az = z
    while (ahead > 0) {
      const q = P[(j + 1) % N]
      const seg = Math.hypot(q.x - ax, q.z - az)
      if (seg >= ahead) { const u = ahead / seg; ax += (q.x - ax) * u; az += (q.z - az) * u; break }
      ahead -= seg; ax = q.x; az = q.z; j = (j + 1) % N
    }
    const tl = Math.hypot(ax - x, az - z) || 1
    const fx = (ax - x) / tl, fz = (az - z) / tl
    const side = (k % 2 === 0 ? 1 : -1) * Math.min(2.4, this.track.roadWidth / 2 - 2.4)
    return { x: x - fz * side, y: s.y, z: z + fx * side, yaw: Math.atan2(fx, fz) }
  },

  /** Creates every car for the grid; `this.car` stays the local player's car. */
  _setupRacers(opts) {
    const grid = opts.grid || [{ id: 'me', name: 'Tú', kind: 'local', color: PLAYER_COLORS[0] }]
    const myId = opts.myId || 'me'
    this.net = opts.net || null
    this.isHost = !this.net || this.net.isHost
    this.rl = buildRacingLine(this.track.path, this.track.roadWidth)
    this.racers = []
    this._botCars = []
    const multi = grid.length > 1
    grid.forEach((g, k) => {
      const mine = g.id === myId
      const kind = mine ? 'local' : g.kind === 'bot' ? (this.isHost ? 'bot' : 'remote') : 'remote'
      const r = new Racer({ id: g.id, name: g.name, kind, color: g.color, personality: g.personality })
      const car = new Car(this.world, this.scene, this._slotSpawn(k), { color: g.color, lite: !mine, collideCars: false, ...(mine ? { topSpeedKmh: PLAYER_TOP_SPEED_KMH, highSpeedBoost: PLAYER_HIGH_SPEED_BOOST } : {}) })
      car.setTimeOfDay(this.timeOfDay)
      if (mine) { car.chassisBody.material = this._chassisMat; this.car = car; this.me = r } else car.chassisBody.material = this._chassisMat
      if (kind === 'remote') car.makeRemote()
      r.car = car
      r.buf = []
      if (kind === 'bot') {
        r.driver = new AIDriver(r, this.rl, { difficulty: g.difficulty || opts.difficulty || 'normal', personality: PERSONALITIES[g.personality || 0], seed: k + 1 })
      }
      r.initProgress(this.track.path)
      this.racers.push(r)
    })
    if (!this.car) throw new Error('grid without local player')
    this._raceT0 = null
    this._raceDone = false
    this.raceStartedHost = null
    this.lastResults = null
    this._snapAcc = 0
    this._firstFinish = null
  },

  _raceTime() {
    if (this._raceT0 == null) return 0
    const now = this.net ? this.net.hostNow() : performance.now()
    return (now - this._raceT0) / 1000
  },

  /**
   * Soft car-to-car contact: each car is 3 circles along its axis. Overlaps push the cars
   * apart (position + relative velocity) like a cushioned bump, so nobody wedges or flips.
   */
  _softCollisions() {
    const rs = this.racers
    const R = 1.0, OFF = [-1.45, 0, 1.45]
    const t = this._raceTime()
    // Ghost start: no car-to-car contact for the first seconds (and right after a reset)
    if (this.state === 'countdown' || t < 7) return
    for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) {
      if ((rs[a].ghostUntil || 0) > t || (rs[b].ghostUntil || 0) > t) continue
      const A = rs[a].car.chassisBody, B = rs[b].car.chassisBody
      const dx0 = B.position.x - A.position.x, dz0 = B.position.z - A.position.z
      if (dx0 * dx0 + dz0 * dz0 > 36) continue
      const fa = rs[a].car.getForward(), fb = rs[b].car.getForward()
      let best = null
      for (const oa of OFF) for (const ob of OFF) {
        const ax = A.position.x + fa.x * oa, az = A.position.z + fa.z * oa
        const bx = B.position.x + fb.x * ob, bz = B.position.z + fb.z * ob
        const d = Math.hypot(bx - ax, bz - az)
        const pen = 2 * R - d
        if (pen > 0 && (!best || pen > best.pen)) best = { pen, nx: (bx - ax) / (d || 1), nz: (bz - az) / (d || 1) }
      }
      if (!best) continue
      const { pen, nx, nz } = best
      const dynA = A.type === 1, dynB = B.type === 1 // 1 = DYNAMIC
      const wa = dynA && dynB ? 0.5 : dynA ? 1 : 0, wb = dynA && dynB ? 0.5 : dynB ? 1 : 0
      const corr = Math.min(pen, 0.6) * 0.8
      A.position.x -= nx * corr * wa; A.position.z -= nz * corr * wa
      B.position.x += nx * corr * wb; B.position.z += nz * corr * wb
      const vrel = (B.velocity.x - A.velocity.x) * nx + (B.velocity.z - A.velocity.z) * nz
      if (vrel < 0) {
        const j = -vrel * 0.6 // mostly inelastic, a little bounce
        A.velocity.x -= nx * j * wa; A.velocity.z -= nz * j * wa
        B.velocity.x += nx * j * wb; B.velocity.z += nz * j * wb
      }
    }
  },

  /** Drives bots and remote cars. Call once per frame, before world.step. */
  _raceTick(dt, holding) {
    if (!this.racers) return
    const humanRef = this.racers.filter((r) => r.kind !== 'bot')
    const refProg = humanRef.length ? Math.max(...humanRef.map((r) => r.progress)) : 0
    const now = this.net ? this.net.hostNow() : performance.now()
    if (this.racers.length > 1) this._softCollisions()
    for (const r of this.racers) {
      if (r.kind === 'bot') {
        const c = holding ? { throttle: 0, brake: 0, steer: 0, handbrake: true } : r.driver.update(dt, this.racers, refProg - r.progress)
        r.car.update(dt, c)
      } else if (r.kind === 'remote') {
        this._interpRemote(r, now)
      }
    }
    // Local player after finishing: autopilot so the car keeps rolling like the others
    if (this.state === 'finished' && this.me && !holding) {
      if (!this.me.driver) this.me.driver = new AIDriver(this.me, this.rl, { difficulty: 'facil', personality: PERSONALITIES[1] })
      this.car.update(dt, this.me.driver.update(dt, this.racers, 0))
    }
  },

  /** Post-step: guards, lap tracking, standings, network. */
  _raceAfterStep(dt) {
    if (!this.racers) return
    const path = this.track.path, laps = this.totalLaps
    const t = this._raceTime()
    for (const r of this.racers) {
      if (r.kind === 'bot') {
        guardBot(r, this.track, dt, (why) => this._resetBot(r, why))
        if (this.state !== 'countdown' && r.driver.checkStall(dt)) {
          // First try to un-jam without teleporting: ghost through traffic for 3 s
          const tNow = this._raceTime()
          if (!r._unjamAt || tNow - r._unjamAt > 15) { r._unjamAt = tNow; r.ghostUntil = tNow + 3; r.unjams = (r.unjams || 0) + 1 }
          else this._resetBot(r, 'stall')
        }
      }
      if (this.state === 'countdown') continue
      // Clients don't decide laps of others: host snapshots carry progress
      if (this.isHost || r.kind === 'local') {
        const lapDone = r.track(path, t, laps)
        if (lapDone && r === this.me) this._onMyLap()
      } else r.track(path, t, 1e9) // keep idx fresh for avoidance only
    }
    if (this.state !== 'countdown') this._updateStandings()
    if (this.net) this._netTick(dt)
  },

  _resetBot(r, why = '?') {
    ;(r.resetWhy ||= {})[why] = (r.resetWhy[why] || 0) + 1
    if (window.__COCHES_DEBUG__) { const p = r.car.getPosition(); let nd = 99; for (const o of this.racers) if (o !== r) nd = Math.min(nd, Math.hypot(o.car.getPosition().x - p.x, o.car.getPosition().z - p.z)); window.__COCHES_DEBUG__.push({ n: r.name, why, idx: r.idx, lat: +(r.lateral || 0).toFixed(1), kmh: Math.round(r.car.speedKmh), near: +nd.toFixed(1), back: r.driver && +r.driver.backOut.toFixed(1) }) }
    const path = this.track.path, N = path.length
    const i = (r.idx + N) % N
    const p = this.rl.line[i], q = this.rl.line[(i + 2) % N]
    r.car.teleport(p.x, 0.72, p.z, Math.atan2(q.x - p.x, q.z - p.z))
    r.driver && (r.driver.backOut = 0, r.driver.stuck = 0, r.driver._hist = [])
    r.resets = (r.resets || 0) + 1
    r.ghostUntil = this._raceTime() + 3
  },

  _onMyLap() {
    const r = this.me
    const lt = r.lapTimes[r.lapTimes.length - 1]
    if (lt && (!this.bestLap || lt < this.bestLap)) {
      this.bestLap = lt
      localStorage.setItem(`cochesai-best-${this.track.id}`, String(lt))
    }
    this.lapStart = performance.now()
    if (r.finished) {
      this.state = 'finished'
      this.audio.silence()
      this.ui.showCountdown(`META · ${r.place}º`)
      this.audio.beep(990, 0.25)
      setTimeout(() => this.ui.hideCountdown(), 1600)
    } else this.audio.beep(720, 0.12)
    this.lap = Math.min(this.totalLaps, r.lap)
  },

  _updateStandings() {
    const st = standings(this.racers)
    this._standings = st
    const finishedHumans = this.racers.filter((r) => r.kind !== 'bot')
    if (!this._firstFinish && st.some((r) => r.finished)) this._firstFinish = this._raceTime()
    if (this.isHost && !this._raceDone) {
      const humansDone = finishedHumans.every((r) => r.finished)
      const allDone = this.racers.every((r) => r.finished)
      const timeout = this._firstFinish != null && this._raceTime() - this._firstFinish > 45
      if (allDone || (humansDone && this._raceTime() - this._firstFinish > 12) || timeout) this._endRace()
    }
    this.ui.updateStandings?.(st, this.me)
  },

  _results() {
    return (this._standings || standings(this.racers)).map((r) => ({
      id: r.id, name: r.name, place: r.place, time: r.finishTime, best: r.bestLap, bot: r.kind === 'bot' || (r.kind === 'remote' && r.id.startsWith('bot')), lap: Math.min(r.lap, this.totalLaps), color: r.color,
    }))
  },

  _endRace(results) {
    if (this._raceDone) return
    this._raceDone = true
    const res = results || this._results()
    this.lastResults = res
    if (this.net && this.isHost) this.net.broadcast({ t: 'end', results: res })
    this.ui.showResults?.(res, this.me?.id, { isNet: !!this.net, isHost: this.isHost })
  },

  // ---------- network ----------
  _netTick(dt) {
    this._snapAcc += dt
    if (this._snapAcc < 0.05) return
    this._snapAcc = 0
    const pose = (r) => {
      const b = r.car.chassisBody
      return [r.id, +b.position.x.toFixed(2), +b.position.y.toFixed(2), +b.position.z.toFixed(2), +b.quaternion.x.toFixed(4), +b.quaternion.y.toFixed(4), +b.quaternion.z.toFixed(4), +b.quaternion.w.toFixed(4), Math.round(r.car.speedKmh), +(r.car._steerCurrent || 0).toFixed(2), r.progress, r.finishTime]
    }
    if (this.isHost) {
      this.net.broadcast({ t: 'snap', h: performance.now(), c: this.racers.map(pose) })
    } else {
      this.net.send({ t: 'st', c: pose(this.me) })
    }
  },

  _netMessage(m, from) {
    if (!this.racers) return
    if (m.t === 'st' && this.isHost) {
      const r = this.racers.find((x) => x.id === from)
      if (r) this._pushPose(r, performance.now(), m.c)
    } else if (m.t === 'snap' && !this.isHost) {
      for (const c of m.c) {
        const r = this.racers.find((x) => x.id === c[0])
        if (!r) continue
        if (r !== this.me) { this._pushPose(r, m.h, c); r.progress = c[10]; r.finishTime = c[11]; r.finished = c[11] != null }
      }
    } else if (m.t === 'end' && !this.isHost) {
      this._endRace(m.results)
    }
  },

  _pushPose(r, t, c) {
    r.buf.push({ t, p: [c[1], c[2], c[3]], q: [c[4], c[5], c[6], c[7]], k: c[8], s: c[9] })
    if (r.buf.length > 30) r.buf.shift()
    r.lastSeen = performance.now()
  },

  _interpRemote(r, now) {
    const buf = r.buf
    if (!buf.length) return
    const rt = now - INTERP_DELAY
    let a = buf[0], b = buf[buf.length - 1]
    for (let i = 0; i < buf.length - 1; i++) if (buf[i].t <= rt && buf[i + 1].t >= rt) { a = buf[i]; b = buf[i + 1]; break }
    let u = b.t === a.t ? 1 : (rt - a.t) / (b.t - a.t)
    u = Math.max(0, Math.min(1.5, u)) // small extrapolation if packets are late
    const p = a.p.map((v, i) => v + (b.p[i] - v) * u)
    const qa = new THREE.Quaternion(...a.q), qb = new THREE.Quaternion(...b.q)
    qa.slerp(qb, Math.min(1, u))
    r.car.setPose(p[0], p[1], p[2], qa.x, qa.y, qa.z, qa.w, b.k, b.s)
  },
}
