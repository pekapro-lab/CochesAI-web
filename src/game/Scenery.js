import * as THREE from 'three'

/** v2 track dressing: procedural tiled textures, instanced trees, PEKA billboards. All ≤1024 px. */
const cache = new Map()
function canvasTex(key, w, h, draw, rep = [1, 1]) {
  if (cache.has(key)) return cache.get(key)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rep[0], rep[1])
  t.anisotropy = 8
  cache.set(key, t)
  return t
}
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }
function speckle(g, w, h, n, cols, size, r) {
  for (let i = 0; i < n; i++) { g.fillStyle = cols[(r() * cols.length) | 0]; const s = size * (0.5 + r()); g.fillRect(r() * w, r() * h, s, s) }
}

/** Road: u = across (0..1 = full width), v = along (1 tile = 8 m). Edge lines + centre dash baked in. */
export function asphaltTexture(day) {
  return canvasTex('asph' + day, 512, 512, (g, w, h) => {
    const r = rng(3)
    const base = day ? [92, 94, 100] : [44, 46, 54]
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, w, h)
    const cols = [-22, -12, 12, 22].map((d) => `rgb(${base.map((b) => b + d)})`)
    speckle(g, w, h, 22000, cols, 1.6, r)
    // darker racing line / tyre wear
    const gr = g.createLinearGradient(0, 0, w, 0)
    gr.addColorStop(0.2, 'rgba(0,0,0,0)'); gr.addColorStop(0.35, 'rgba(0,0,0,.18)'); gr.addColorStop(0.5, 'rgba(0,0,0,.05)'); gr.addColorStop(0.65, 'rgba(0,0,0,.18)'); gr.addColorStop(0.8, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
    // cracks / patches
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1
    for (let k = 0; k < 6; k++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let s = 0; s < 8; s++) { x += (r() - 0.5) * 30; y += r() * 18; g.lineTo(x, y) } g.stroke() }
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(w * 0.6, h * 0.1, 60, 90)
    // edge lines + centre dash
    g.fillStyle = day ? '#f2f2ec' : '#d8dce8'
    g.fillRect(w * 0.025, 0, w * 0.018, h); g.fillRect(w * 0.957, 0, w * 0.018, h)
    g.fillRect(w * 0.494, 0, w * 0.012, h * 0.45)
  })
}
export function grassTexture(day) {
  return canvasTex('grass' + day, 512, 512, (g, w, h) => {
    const r = rng(9)
    g.fillStyle = day ? '#4f8a35' : '#17301c'; g.fillRect(0, 0, w, h)
    const cols = day ? ['#5d9a3c', '#447a2c', '#6aa846', '#3c6d27', '#7a8a3a'] : ['#1d3a22', '#122616', '#244428']
    for (let i = 0; i < 26000; i++) { g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(r() * w, r() * h, 1, 2 + r() * 3) }
    // mowing stripes
    g.fillStyle = 'rgba(255,255,255,.04)'; for (let x = 0; x < w; x += 128) g.fillRect(x, 0, 64, h)
  }, [70, 70])
}
export function gravelTexture(day) {
  return canvasTex('grav' + day, 256, 256, (g, w, h) => {
    const r = rng(21)
    g.fillStyle = day ? '#b8a68a' : '#4a4338'; g.fillRect(0, 0, w, h)
    speckle(g, w, h, 9000, day ? ['#9c8a70', '#d2c2a6', '#8a7a62', '#e0d4bc'] : ['#3c362c', '#5a5244', '#2e2a22'], 2.4, r)
  }, [1, 4])
}
export function kerbTexture() {
  return canvasTex('kerb', 64, 256, (g, w, h) => {
    for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#f2f2f2' : '#d0161c'; g.fillRect(0, (k * h) / 4, w, h / 4) }
    g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, 0, 6, h)
  })
}

// ---------- trees (InstancedMesh, 3 species) ----------
export function addForest(group, path, half, distToPath, { day = true, density = 1, palette } = {}) {
  const r = rng(77)
  const spots = []
  for (let i = 0; i < path.length; i += Math.max(2, Math.round(4 / density))) {
    const a = path[i], b = path[(i + 1) % path.length]
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1
    for (const sign of [1, -1]) {
      for (let row = 0; row < 2; row++) {
        if (r() < 0.35) continue
        const dist = half + 6 + row * 7 + r() * 6
        const x = a.x + (-dz / L) * sign * dist + (r() - 0.5) * 3, z = a.z + (dx / L) * sign * dist + (r() - 0.5) * 3
        if (distToPath(x, z) < half + 5) continue
        spots.push({ x, z, s: 0.75 + r() * 0.6, rot: r() * 6.28, kind: r() })
      }
    }
  }
  const leafCols = palette || (day ? [0x2f7a3a, 0x3f8d34, 0x26642e, 0x5a8f2a] : [0x183a22, 0x1d4426, 0x14301c])
  const barkTex = canvasTex('bark', 64, 128, (g, w, h) => {
    const rr = rng(5); g.fillStyle = '#4a3220'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 40; i++) { g.fillStyle = rr() > 0.5 ? '#2e1e12' : '#5e4430'; g.fillRect(rr() * w, 0, 1 + rr() * 3, h) }
  })
  const trunkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 })
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true })
  const pines = spots.filter((s) => s.kind < 0.45), round = spots.filter((s) => s.kind >= 0.45 && s.kind < 0.8), poplar = spots.filter((s) => s.kind >= 0.8)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color()
  const inst = (geo, mat, list, place, shadow) => {
    if (!list.length) return
    const im = new THREE.InstancedMesh(geo, mat, list.length)
    list.forEach((s, i) => { place(s); im.setMatrixAt(i, m4); if (mat === leafMat) im.setColorAt(i, col.setHex(leafCols[(s.rot * 10 | 0) % leafCols.length]).offsetHSL(0, 0, (s.s - 1) * 0.08)) })
    im.castShadow = shadow; im.receiveShadow = false; im.userData.noMerge = true; im.userData.scenery = true
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.computeBoundingSphere()
    group.add(im)
  }
  const at = (s, y, sx, sy) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot); m4.compose(new THREE.Vector3(s.x, y * s.s, s.z), q, new THREE.Vector3(sx * s.s, sy * s.s, sx * s.s)) }
  const trunk = new THREE.CylinderGeometry(0.16, 0.3, 1, 6); trunk.translate(0, 0.5, 0)
  // pines: 3 stacked cones (layered foliage)
  inst(trunk, trunkMat, pines, (s) => at(s, 0, 1, 2.6), false)
  for (const [y, rad, hh] of [[2.0, 1.8, 2.4], [3.3, 1.4, 2.1], [4.5, 0.95, 1.8]]) {
    const cone = new THREE.ConeGeometry(rad, hh, 8); cone.translate(0, hh / 2, 0)
    inst(cone, leafMat, pines, (s) => at(s, y, 1, 1), true)
  }
  // broadleaf: trunk + 3 lumpy blobs
  inst(trunk, trunkMat, round, (s) => at(s, 0, 1.2, 2.4), false)
  const blob = new THREE.IcosahedronGeometry(1.5, 1)
  { const p = blob.attributes.position, rr = rng(13); for (let i = 0; i < p.count; i++) { const k = 0.85 + rr() * 0.3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k) } blob.computeVertexNormals() }
  for (const [ox, y, oz, sc] of [[0, 3.4, 0, 1.2], [0.9, 2.8, 0.4, 0.8], [-0.7, 3.0, -0.6, 0.85]]) {
    inst(blob, leafMat, round, (s) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot); const off = new THREE.Vector3(ox, 0, oz).applyQuaternion(q).multiplyScalar(s.s); m4.compose(new THREE.Vector3(s.x + off.x, y * s.s, s.z + off.z), q, new THREE.Vector3(sc * s.s, sc * s.s, sc * s.s)) }, true)
  }
  // poplar: tall slim ellipsoid
  inst(trunk, trunkMat, poplar, (s) => at(s, 0, 0.8, 1.6), false)
  const pop = new THREE.IcosahedronGeometry(1, 1); pop.scale(0.9, 3.2, 0.9); pop.translate(0, 3.6, 0)
  inst(pop, leafMat, poplar, (s) => at(s, 0, 1, 1), true)
  return spots.length
}

// ---------- billboards ----------
function textBoard(text, sub, bg, fg) {
  return canvasTex('tb|' + text + sub + bg, 512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, bg); gr.addColorStop(1, '#0b0d14')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
    g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(10, 10, w - 20, h - 20)
    g.font = 'italic 900 120px system-ui, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.lineWidth = 12; g.strokeStyle = '#000'; g.strokeText(text, w / 2, h * 0.44); g.fillStyle = fg; g.fillText(text, w / 2, h * 0.44)
    g.font = '800 30px system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText(sub, w / 2, h * 0.8)
  })
}
const loader = new THREE.TextureLoader()
function imageBoard(name) {
  const key = 'imgtex|' + name
  if (cache.has(key)) return cache.get(key)
  const tex = loader.load((import.meta.env.BASE_URL || './') + 'carteles/' + name + '.webp')
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  cache.set(key, tex)
  return tex
}
const BOARDS = [
  { text: 'PEKA', sub: 'JUEGOS HECHOS POR CÓDIGO', bg: '#e8231e', fg: '#ffd21a' },
  { img: 'pekacubos-portada', title: 'PEKACUBOS' },
  { text: 'PEKAPRO', sub: 'pekapro-studio.grok.me', bg: '#1c3fae', fg: '#ffffff' },
  { img: 'cochesai-garaje', title: 'COCHESAI' },
  { img: 'pekacubos-dia', title: 'PEKACUBOS' },
  { text: 'PEKA', sub: '¡A TOPE!', bg: '#ff8a1a', fg: '#111111' },
  { img: 'billar', title: 'PEKA BILLAR 3D' },
  { img: 'tenis', title: 'PEKATENIS 3D' },
  { text: 'PEKAPRO', sub: 'STUDIO · CUBOS · BILLAR · TENIS', bg: '#7a1cae', fg: '#21e6a8' },
  { img: 'cochesai-carrera', title: 'COCHESAI' },
  { img: 'pekacubos-noche', title: 'PEKACUBOS' },
]
function titleStrip(title) {
  return canvasTex('ts|' + title, 512, 64, (g, w, h) => {
    g.fillStyle = '#e8231e'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'italic 900 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(title + '  ·  PEKAPRO', w / 2, h / 2 + 2)
  })
}

export function addBillboards(group, path, half, distToPath, { night = false, count = 10 } = {}) {
  const N = path.length
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2d34, metalness: 0.7, roughness: 0.4 })
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.5, roughness: 0.5 })
  let placed = 0
  for (let k = 0; k < count; k++) {
    const i = Math.floor(((k + 0.37) / count) * N)
    const a = path[i], b = path[(i + 2) % N]
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1
    let ok = null
    for (const sign of k % 2 ? [1, -1] : [-1, 1]) {
      for (const dist of [half + 9, half + 13, half + 18]) {
        const x = a.x + (-dz / L) * sign * dist, z = a.z + (dx / L) * sign * dist
        // whole 9 m board must stay clear of the road
        const ex = (dx / L) * 4.5, ez = (dz / L) * 4.5
        if (Math.min(distToPath(x, z), distToPath(x + ex, z + ez), distToPath(x - ex, z - ez)) > half + 6) { ok = { x, z, sign }; break }
      }
      if (ok) break
    }
    if (!ok) continue
    const def = BOARDS[k % BOARDS.length]
    const board = new THREE.Group()
    const W = 8, H = 4, Y = 3.2
    const map = def.img ? imageBoard(def.img) : textBoard(def.text, def.sub, def.bg, def.fg)
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map, roughness: 0.6, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: night ? 0.75 : 0.12 }))
    face.position.set(0, Y + H / 2, 0.16)
    board.add(face)
    const back = face.clone(); back.position.z = -0.16; back.rotation.y = Math.PI; board.add(back)
    if (def.img) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.9), new THREE.MeshStandardMaterial({ map: titleStrip(def.title), emissive: 0xffffff, emissiveMap: titleStrip(def.title), emissiveIntensity: night ? 0.7 : 0.1 }))
      strip.position.set(0, Y - 0.25, 0.16); board.add(strip)
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, H + 1.6, 0.25), frameMat); frame.position.set(0, Y + H / 2 - 0.4, 0); frame.castShadow = true; board.add(frame)
    for (const px of [-W / 3, W / 3]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, Y, 8), postMat); p.position.set(px, Y / 2 - 1.2 + 1.2, -0.1); p.castShadow = true; board.add(p) }
    if (night) {
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2cc })
      for (const px of [-W / 3, 0, W / 3]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), lampMat); l.position.set(px, Y + H + 0.5, 0.5); board.add(l) }
    }
    board.position.set(ok.x, 0, ok.z)
    // face the track (towards the path point)
    board.rotation.y = Math.atan2(a.x - ok.x, a.z - ok.z)
    board.traverse((o) => { o.userData.noMerge = true; o.userData.scenery = true })
    board.userData.noMerge = true
    group.add(board)
    placed++
  }
  return placed
}
