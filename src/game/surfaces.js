import * as THREE from 'three'
import { gravelTexture } from './Scenery.js'

/**
 * Superficies de CochesAI.
 * El coche no sabe de "lluvia": solo multiplica el frictionSlip de cada rueda.
 *
 * Para añadir nieve o barro:
 *   1. Nuevo preset en SURFACE_PRESETS (grip, drag, digIn, understeer).
 *   2. Un caso en classifySurface().
 *   3. Si quieres verlo, un ribbon en addSurfaceDecals().
 *
 * grip 1 = el agarre de siempre. Más bajo = se va antes.
 * drag = fuerza que frena (la grava se clava). digIn recorta el motor atrás.
 * understeer recorta el volante al frenar (el mojado se va de morro).
 * handbrakeRearScale 1 deja el freno de mano como estaba; bájalo para soltar más el culo.
 */
export const SURFACE_SYSTEM = {
  enabled: true,
  handbrakeRearScale: 1,
}

export const SURFACE_PRESETS = {
  dry: { id: 'dry', name: 'Asfalto seco', mu: 0.94, grip: 1, drag: 0, digIn: 0, understeer: 0 },
  wet: { id: 'wet', name: 'Asfalto mojado', mu: 0.58, grip: 0.6, drag: 0, digIn: 0.04, understeer: 0.5 },
  gravel: { id: 'gravel', name: 'Grava', mu: 0.46, grip: 0.5, drag: 980, digIn: 0.4, understeer: 0.14 },
}

const WET_S = [0.62, 0.78]
const GRAVEL_S = [0.4, 0.55]

export function classifySurface(s, lateral, half) {
  if (!SURFACE_SYSTEM.enabled) {
    return { ...SURFACE_PRESETS.dry, name: 'Seco · uniforme' }
  }
  const a = Math.abs(lateral)
  if (a > half + 0.15) return SURFACE_PRESETS.gravel
  if (s >= WET_S[0] && s < WET_S[1] && a < half * 0.98) return SURFACE_PRESETS.wet
  if (s >= GRAVEL_S[0] && s < GRAVEL_S[1] && lateral > half * 0.28 && lateral < half) return SURFACE_PRESETS.gravel
  return SURFACE_PRESETS.dry
}

function buildSegments(path) {
  const n = path.length
  const seg = []
  let total = 0
  for (let i = 0; i < n; i++) {
    const a = path[i]
    const b = path[(i + 1) % n]
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 0.001
    seg.push({ len, s0: total })
    total += len
  }
  return { seg, total, n }
}

/** Consulta por rueda. +lateral es el lado derecho de la marcha (el mismo del ribbon de grava). */
export function attachSurfaceQuery(world, path, roadWidth) {
  const half = (roadWidth || 12) / 2
  const { seg, total, n } = buildSegments(path)
  world.surfaceAt = (x, z) => {
    let best = Infinity
    let s = 0
    let lateral = 0
    for (let k = 0; k < n; k++) {
      const a = path[k]
      const b = path[(k + 1) % n]
      const abx = b.x - a.x
      const abz = b.z - a.z
      const ab2 = abx * abx + abz * abz || 1
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / ab2))
      const cx = a.x + abx * t
      const cz = a.z + abz * t
      const dx = x - cx
      const dz = z - cz
      const d2 = dx * dx + dz * dz
      if (d2 < best) {
        best = d2
        const inv = 1 / Math.sqrt(ab2)
        const fx = abx * inv
        const fz = abz * inv
        lateral = dx * -fz + dz * fx
        s = seg[k].s0 / total + (seg[k].len / total) * t
        if (s >= 1) s -= 1
      }
    }
    return { ...classifySurface(s, lateral, half), s, lateral }
  }
  world.surfaceMeta = { half, wet: WET_S, gravel: GRAVEL_S }
}

function pushQuad(dst, a, b, c, d, yA, yB) {
  const ya = yA + 0.07
  const yb = yB + 0.07
  dst.push(a.x, ya, a.z, b.x, ya, b.z, c.x, yb, c.z)
  dst.push(a.x, ya, a.z, c.x, yb, c.z, d.x, yb, d.z)
}

function ribbonMesh(positions, material) {
  if (positions.length < 9) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material)
  mesh.receiveShadow = true
  mesh.userData.road = true
  return mesh
}

/** Manchas visibles: lluvia a lo ancho, grava en el interior de un tramo, arcén ya existente. */
export function addSurfaceDecals(group, path, roadWidth, isDay) {
  const half = (roadWidth || 12) / 2
  const { seg, total, n } = buildSegments(path)
  const wet = []
  const gravel = []
  for (let i = 0; i < n; i++) {
    const a = path[i]
    const b = path[(i + 1) % n]
    const abx = b.x - a.x
    const abz = b.z - a.z
    const len = Math.hypot(abx, abz) || 1
    const fx = abx / len
    const fz = abz / len
    const rx = -fz
    const rz = fx
    const s = seg[i].s0 / total
    const at = (p, lat) => ({ x: p.x + rx * lat, z: p.z + rz * lat })
    if (s >= WET_S[0] && s < WET_S[1]) {
      pushQuad(wet, at(a, -half * 0.96), at(a, half * 0.96), at(b, half * 0.96), at(b, -half * 0.96), a.y || 0, b.y || 0)
    }
    if (s >= GRAVEL_S[0] && s < GRAVEL_S[1]) {
      const inner = half * 0.28
      const outer = half * 0.96
      pushQuad(gravel, at(a, inner), at(a, outer), at(b, outer), at(b, inner), a.y || 0, b.y || 0)
    }
  }
  const wetMat = new THREE.MeshStandardMaterial({
    color: isDay ? 0x6a7c8c : 0x142433,
    roughness: 0.16,
    metalness: 0.55,
    transparent: true,
    opacity: isDay ? 0.28 : 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const gravMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: gravelTexture(isDay),
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const wetMesh = ribbonMesh(wet, wetMat)
  const gravMesh = ribbonMesh(gravel, gravMat)
  if (wetMesh) group.add(wetMesh)
  if (gravMesh) group.add(gravMesh)
}
