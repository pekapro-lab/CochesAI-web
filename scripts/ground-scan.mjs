/** Scan all tracks: road must be smooth ground with no non-ground colliders inside it. */
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const PORT = 5193
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0])
  if (url.startsWith('/CochesAI-web')) url = url.slice('/CochesAI-web'.length) || '/'
  let file = join(ROOT, url === '/' ? 'index.html' : url)
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, 'index.html')
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(PORT, r))
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader'] })
const page = await browser.newPage()
await page.goto(`http://127.0.0.1:${PORT}/CochesAI-web/`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__PEKA_R__)
let fail = false
for (const id of ['norte', 'bosque', 'costa', 'sierra']) {
  const r = await page.evaluate((id) => {
    const g = window.__PEKA_R__
    g.startTrack(id)
    const world = g.world, path = g.track.path, half = (g.track.roadWidth || 12) / 2
    const W = world.bodies[0].constructor // CANNON.Body
    const Vec3 = world.gravity.constructor
    const RR = g.car.vehicle.wheelInfos[0].raycastResult.constructor
    const chassis = g.car.chassisBody
    let maxStep = 0, worst = null, intrusions = [], misses = 0, samples = 0
    for (let i = 0; i < path.length; i++) {
      const a = path[i], b = path[(i + 1) % path.length]
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
      const sx = -dz / l, sz = dx / l
      for (let s = 0; s < 3; s++) {
        const t = s / 3
        const cx = a.x + dx * t, cz = a.z + dz * t
        let prev = null
        for (let k = -10; k <= 10; k++) {
          const o = (k / 10) * (half - 0.3)
          const x = cx + sx * o, z = cz + sz * o
          samples++
          // ground ray
          const res = new RR()
          world.raycastClosest(new Vec3(x, 20, z), new Vec3(x, -5, z), { collisionFilterGroup: 4, collisionFilterMask: 1, skipBackfaces: false }, res)
          if (!res.hasHit) { misses++; prev = null; continue }
          const y = res.hitPointWorld.y
          if (prev !== null && Math.abs(y - prev) > maxStep) {
            maxStep = Math.abs(y - prev)
            if (maxStep > 0.05) {
              const a = path[i], b = path[(i + 1) % path.length]
              worst = { i, s, k, y: +y.toFixed(2), prev: +prev.toFixed(2), dy: +((b.y || 0) - (a.y || 0)).toFixed(2), seg: +Math.hypot(b.x - a.x, b.z - a.z).toFixed(1) }
            }
          }
          prev = y
          // anything non-ground at car height inside the road?
          const res2 = new RR()
          world.raycastClosest(new Vec3(x, y + 1.5, z), new Vec3(x, y + 0.02, z), { collisionFilterGroup: 4, collisionFilterMask: 2, skipBackfaces: false }, res2)
          if (res2.hasHit && res2.body !== chassis && intrusions.length < 8)
            intrusions.push({ i, o: +o.toFixed(1), x: +x.toFixed(1), z: +z.toFixed(1) })
          else if (res2.hasHit) intrusions.length < 8 || intrusions.push(null)
        }
      }
    }
    // Geometric: no barrier box corner/edge may sit within the road (+0.4 m margin)
    const distToPath = (x, z) => {
      let best = Infinity
      for (let j = 0; j < path.length; j++) {
        const p = path[j], q = path[(j + 1) % path.length]
        const ex = q.x - p.x, ez = q.z - p.z, L = ex * ex + ez * ez || 1
        let u = ((x - p.x) * ex + (z - p.z) * ez) / L; u = Math.max(0, Math.min(1, u))
        best = Math.min(best, Math.hypot(x - p.x - ex * u, z - p.z - ez * u))
      }
      return best
    }
    let boxHits = []
    for (const body of world.bodies) {
      if (body.collisionFilterGroup !== 2) continue
      const h = body.shapes[0].halfExtents
      for (const [lx, lz] of [[-1,-1],[1,-1],[-1,1],[1,1],[-1,0],[1,0],[-1,-0.5],[1,0.5],[-1,0.5],[1,-0.5]]) {
        const w = body.pointToWorldFrame(new Vec3(lx * h.x, 0, lz * h.z))
        const d = distToPath(w.x, w.z)
        if (d < half + 0.4) { boxHits.push({ x: +w.x.toFixed(1), z: +w.z.toFixed(1), d: +d.toFixed(2) }); break }
      }
    }
    intrusions.push(...boxHits.slice(0, 6)); const boxCount = boxHits.length
    // Scenery meshes above road level inside the corridor
    const scenery = g.track.sceneryCheck().length
    // Barrier continuity: every point on each wall line must be covered by a wall box,
    // except where the wall line itself would be inside the road (hairpin inner side).
    const walls = world.bodies.filter((b) => b.collisionFilterGroup === 2)
    let gaps = 0, gapSample = []
    for (let i = 0; i < path.length; i++) for (let s = 0; s < 2; s++) {
      const a = path[i], b = path[(i + 1) % path.length]
      const t = s / 2, dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
      for (const sg of [1, -1]) {
        const x = a.x + dx * t + (-dz / l) * sg * (half + 1.3), z = a.z + dz * t + (dx / l) * sg * (half + 1.3)
        if (distToPath(x, z) < half + 1.0) continue
        const covered = walls.some((w) => {
          const loc = w.pointToLocalFrame(new Vec3(x, w.position.y, z)), h = w.shapes[0].halfExtents
          return Math.abs(loc.x) <= h.x + 0.6 && Math.abs(loc.z) <= h.z + 0.05
        })
        if (!covered) { gaps++; if (gapSample.length < 4) gapSample.push({ i, sg, x: +x.toFixed(1), z: +z.toFixed(1) }) }
      }
    }
    // Wall height: every barrier collider must reach the ground and stand >= 2 m tall, or the
    // chassis (bottom ~0.66 m) rides up and over it (v1.0.3 escape: rail was 0.275..0.825 m).
    let lowWalls = 0
    const roadYAt = (x, z) => {
      let best = Infinity, y = 0
      for (let j = 0; j < path.length; j++) {
        const p = path[j], q = path[(j + 1) % path.length]
        const ex = q.x - p.x, ez = q.z - p.z, L2 = ex * ex + ez * ez || 1
        const u = Math.max(0, Math.min(1, ((x - p.x) * ex + (z - p.z) * ez) / L2))
        const d = (x - (p.x + ex * u)) ** 2 + (z - (p.z + ez * u)) ** 2
        if (d < best) { best = d; y = (p.y || 0) + ((q.y || 0) - (p.y || 0)) * u }
      }
      return y
    }
    for (const w of walls) {
      const hy = w.shapes[0].halfExtents.y
      const ry = roadYAt(w.position.x, w.position.z)
      if (w.position.y - hy > ry + 0.25 || w.position.y + hy < ry + 1.85) lowWalls++
    }
    // Enclosure: flood-fill the plane (0.1 m grid) from the start line; walls block. Nothing
    // reachable may be further than the walls' inner face (half + 1.05 m) + 0.1 m, inner or outer side.
    const res = 0.1
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9
    for (const p of path) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z) }
    minx -= 12; minz -= 12; maxx += 12; maxz += 12
    const GW = Math.ceil((maxx - minx) / res), GH = Math.ceil((maxz - minz) / res)
    const dist = new Float32Array(GW * GH).fill(99), block = new Uint8Array(GW * GH)
    for (let j = 0; j < path.length; j++) {
      const p = path[j], q = path[(j + 1) % path.length], ex = q.x - p.x, ez = q.z - p.z, L = ex * ex + ez * ez || 1, R = half + 6
      const x0 = Math.max(0, Math.floor((Math.min(p.x, q.x) - R - minx) / res)), x1 = Math.min(GW - 1, Math.ceil((Math.max(p.x, q.x) + R - minx) / res))
      const z0 = Math.max(0, Math.floor((Math.min(p.z, q.z) - R - minz) / res)), z1 = Math.min(GH - 1, Math.ceil((Math.max(p.z, q.z) + R - minz) / res))
      for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
        const x = minx + gx * res, z = minz + gz * res, u = Math.max(0, Math.min(1, ((x - p.x) * ex + (z - p.z) * ez) / L))
        const d = Math.hypot(x - p.x - ex * u, z - p.z - ez * u), k = gz * GW + gx; if (d < dist[k]) dist[k] = d
      }
    }
    for (const w of walls) {
      const h = w.shapes[0].halfExtents, R = Math.hypot(h.x, h.z)
      const x0 = Math.max(0, Math.floor((w.position.x - R - minx) / res)), x1 = Math.min(GW - 1, Math.ceil((w.position.x + R - minx) / res))
      const z0 = Math.max(0, Math.floor((w.position.z - R - minz) / res)), z1 = Math.min(GH - 1, Math.ceil((w.position.z + R - minz) / res))
      for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
        const loc = w.pointToLocalFrame(new Vec3(minx + gx * res, w.position.y, minz + gz * res))
        if (Math.abs(loc.x) <= h.x && Math.abs(loc.z) <= h.z) block[gz * GW + gx] = 1
      }
    }
    const seen = new Uint8Array(GW * GH), stack = [Math.round((path[0].x - minx) / res) + Math.round((path[0].z - minz) / res) * GW]
    seen[stack[0]] = 1
    let maxReach = 0, leak = null
    while (stack.length) {
      const k = stack.pop()
      if (dist[k] > maxReach) maxReach = dist[k]
      if (dist[k] > half + 3) { leak = leak || { x: +(minx + (k % GW) * res).toFixed(1), z: +(minz + Math.floor(k / GW) * res).toFixed(1) }; continue }
      for (const n of [k + 1, k - 1, k + GW, k - GW]) if (n >= 0 && n < GW * GH && !seen[n] && !block[n]) { seen[n] = 1; stack.push(n) }
    }
    const reach = +(maxReach - half).toFixed(2)
    let crest = path[0]
    for (const p of path) if ((p.y || 0) > (crest.y || 0)) crest = p
    const cres = new RR()
    world.raycastClosest(new Vec3(crest.x, (crest.y || 0) + 12, crest.z), new Vec3(crest.x, (crest.y || 0) - 6, crest.z), { collisionFilterGroup: 4, collisionFilterMask: 1, skipBackfaces: false }, cres)
    const cross = []
    {
      let ci = 0
      for (let i = 0; i < path.length; i++) if ((path[i].y || 0) > (path[ci].y || 0)) ci = i
      const a = path[ci], b = path[(ci + 1) % path.length]
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
      const sx = -dz / l, sz = dx / l
      for (const k of [-10, -5, 0, 5, 10]) {
        const o = (k / 10) * (half - 0.3)
        const x = a.x + sx * o, z = a.z + sz * o
        const res = new RR()
        world.raycastClosest(new Vec3(x, (a.y || 0) + 12, z), new Vec3(x, (a.y || 0) - 6, z), { collisionFilterGroup: 4, collisionFilterMask: 1, skipBackfaces: false }, res)
        cross.push(res.hasHit ? +res.hitPointWorld.y.toFixed(2) : null)
      }
    }
    const crestHit = cres.hasHit ? +cres.hitPointWorld.y.toFixed(2) : null
    const crestRoad = +((crest.y || 0) + 0.04).toFixed(2)
    return { id, lowWalls, reach, leak, fixed: g.track.sceneryFixed, scenery, gaps, gapSample, boxCount, samples, misses, maxStep: +maxStep.toFixed(3), worst, intrusions: intrusions.filter(Boolean), crestRoad, crestHit, cross }
  }, id)
  console.log(JSON.stringify(r))
  const crestOk = r.crestRoad > 2 && r.crestHit != null && Math.abs(r.crestHit - r.crestRoad) < 0.45
  if (r.lowWalls || r.leak || r.reach > 1.15 || r.misses || r.maxStep > 0.03 || r.intrusions.length || r.scenery || r.gaps || !crestOk) fail = true
}
await browser.close(); server.close()
console.log(fail ? 'GROUND SCAN FAILED' : 'GROUND SCAN PASSED'); if (fail) process.exitCode = 1
