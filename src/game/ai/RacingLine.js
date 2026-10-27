/**
 * Racing line + speed profile computed once per track from the centreline.
 * Line: elastic-band smoothing of the centreline, clamped inside the walled corridor
 * (min-curvature-ish: cuts apexes, uses the outside on entry/exit).
 * Speed: v = sqrt(aLat / curvature), then a backward pass so the car brakes in time.
 */
export function buildRacingLine(path, roadWidth, { margin = 2.1, iters = 260 } = {}) {
  const N = path.length
  const half = roadWidth / 2
  const maxOff = Math.max(0.5, half - margin)
  // Centreline normals (left of travel direction)
  const nx = new Float64Array(N), nz = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const a = path[(i - 1 + N) % N], b = path[(i + 1) % N]
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
    nx[i] = -dz / l; nz[i] = dx / l
  }
  let off = new Float64Array(N)
  const px = (i) => path[i].x + nx[i] * off[i]
  const pz = (i) => path[i].z + nz[i] * off[i]
  for (let it = 0; it < iters; it++) {
    const next = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N
      const mx = (px(a) + px(b)) / 2, mz = (pz(a) + pz(b)) / 2
      // project the midpoint onto this sample's normal
      let o = (mx - path[i].x) * nx[i] + (mz - path[i].z) * nz[i]
      o = off[i] + (o - off[i]) * 0.6
      next[i] = Math.max(-maxOff, Math.min(maxOff, o))
    }
    off = next
  }
  const line = []
  for (let i = 0; i < N; i++) line.push({ x: px(i), z: pz(i), off: off[i] })
  // Arc length + curvature
  const ds = new Float64Array(N), curv = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const b = line[(i + 1) % N]
    ds[i] = Math.hypot(b.x - line[i].x, b.z - line[i].z) || 0.01
  }
  const K = 3
  for (let i = 0; i < N; i++) {
    const a = line[(i - K + N) % N], c = line[i], b = line[(i + K) % N]
    const h1 = Math.atan2(c.x - a.x, c.z - a.z), h2 = Math.atan2(b.x - c.x, b.z - c.z)
    let d = h2 - h1
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    let len = 0
    for (let k = -K; k < K; k++) len += ds[(i + k + N) % N]
    curv[i] = Math.abs(d) / (len || 1)
  }
  return { line, nx, nz, ds, curv, N, half, maxOff }
}

/** Speed profile in m/s for a given grip (lateral accel) and braking decel. */
export function speedProfile(rl, { aLat = 9, aBrake = 7.5, vTop = 39 } = {}) {
  const { N, curv, ds } = rl
  const v = new Float64Array(N)
  for (let i = 0; i < N; i++) v[i] = Math.min(vTop, Math.sqrt(aLat / Math.max(curv[i], 1e-4)))
  // Backward pass twice to wrap around the loop
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 2 * N - 1; k >= 0; k--) {
      const i = k % N, j = (i + 1) % N
      v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * aBrake * ds[i]))
    }
  }
  return v
}
