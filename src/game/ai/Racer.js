import * as CANNON from 'cannon-es'

/** Lap/progress bookkeeping shared by the player, bots and remote cars. */
export class Racer {
  constructor({ id, name, kind, color, personality = null }) {
    this.id = id
    this.name = name
    this.kind = kind // 'local' | 'bot' | 'remote'
    this.color = color
    this.personality = personality
    this.car = null
    this.driver = null
    this.idx = 0
    this.progress = 0 // path samples travelled since the start line (can start negative)
    this.finished = false
    this.finishTime = null
    this.lapStart = 0
    this.lapTimes = []
    this.bestLap = null
    this.place = 1
  }

  initProgress(path) {
    this.idx = nearestIndex(path, this.car.getPosition())
    this.progress = this.idx > path.length / 2 ? this.idx - path.length : this.idx
  }

  get lap() {
    return this._N ? Math.floor(this.progress / this._N) + 1 : 1
  }

  /** Windowed nearest-sample tracking; returns true when a lap was completed. */
  track(path, raceTime, laps) {
    const N = path.length
    this._N = N
    const pos = this.car.getPosition()
    let bi = this.idx, bd = Infinity
    for (let k = -20; k <= 45; k++) {
      const j = (this.idx + k + N) % N
      const d = (path[j].x - pos.x) ** 2 + (path[j].z - pos.z) ** 2
      if (d < bd) { bd = d; bi = j }
    }
    // Lost (teleport / big jump): global search
    if (bd > 400) { bi = nearestIndex(path, pos) }
    let step = (bi - this.idx + N) % N
    if (step > N / 2) step -= N
    const before = Math.floor(this.progress / N)
    this.progress += step
    this.idx = bi
    this.lateral = Math.sqrt(bd)
    if (this.finished) return false
    const after = Math.floor(this.progress / N)
    if (after > before && after >= 1) {
      const lt = raceTime - this.lapStart
      this.lapTimes.push(lt)
      if (!this.bestLap || lt < this.bestLap) this.bestLap = lt
      this.lapStart = raceTime
      if (after >= laps) {
        this.finished = true
        this.finishTime = raceTime
      }
      return true
    }
    return false
  }
}

export function nearestIndex(path, pos) {
  let bi = 0, bd = Infinity
  for (let i = 0; i < path.length; i++) {
    const d = (path[i].x - pos.x) ** 2 + (path[i].z - pos.z) ** 2
    if (d < bd) { bd = d; bi = i }
  }
  return bi
}

/** Order: finished first by time, then by progress. */
export function standings(racers) {
  const s = [...racers].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime
    if (a.finished) return -1
    if (b.finished) return 1
    return b.progress - a.progress
  })
  s.forEach((r, i) => { r.place = i + 1 })
  return s
}

/** Physics safety net for code-driven cars (same rules as the player's _containCar). */
export function guardBot(racer, track, dt, reset) {
  const car = racer.car
  const body = car.chassisBody
  if (car.hasBadState()) { reset('bad'); return }
  if (car.isOverturned()) { reset('flip'); return }
  const path = track.path, N = path.length
  const half = (track.roadWidth || 12) / 2
  const px = body.position.x, pz = body.position.z
  let best = Infinity, cx = 0, cz = 0
  for (let k = -12; k <= 12; k++) {
    const j = (racer.idx + k + N) % N
    const p = path[j], q = path[(j + 1) % N]
    const ex = q.x - p.x, ez = q.z - p.z, L = ex * ex + ez * ez || 1
    const u = Math.max(0, Math.min(1, ((px - p.x) * ex + (pz - p.z) * ez) / L))
    const x = p.x + ex * u, z = p.z + ez * u
    const d = (px - x) ** 2 + (pz - z) ** 2
    if (d < best) { best = d; cx = x; cz = z }
  }
  const d = Math.sqrt(best)
  const limit = half + 1.4
  if (d > limit) {
    const nx = (px - cx) / (d || 1), nz = (pz - cz) / (d || 1)
    body.position.x = cx + nx * (half + 0.4)
    body.position.z = cz + nz * (half + 0.4)
    const vOut = body.velocity.x * nx + body.velocity.z * nz
    if (vOut > 0) { body.velocity.x -= nx * vOut; body.velocity.z -= nz * vOut }
  }
  if (body.position.y > 1.2) {
    body.position.y = 1.2
    if (body.velocity.y > 0) body.velocity.y = 0
  }
  const wheels = car.wheelsOnGround()
  if (wheels === 0 && body.position.y < 0.45) {
    body.position.y = 0.75
    if (body.velocity.y < 0) body.velocity.y = 0
  }
  racer._air = wheels === 0 ? (racer._air || 0) + dt : 0
  if (wheels === 0 && body.position.y > 0.55) body.applyForce(new CANNON.Vec3(0, -7000, 0), body.position)
  if (racer._air > 2.2) reset('air')
}
