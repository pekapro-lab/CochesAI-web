import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

// "Car Concept" — Khronos glTF Sample Assets, CC-BY 4.0 (ver CREDITS.md)
const BASE = import.meta.env.BASE_URL || '/'
const _gltfP = {}
const _matCache = new Map() // rivals: one material set per colour
let _hdrTex = null
const _models = new Set()

export const realCarsEnabled = () => localStorage.getItem('cochesai-realista') !== 'no'

function loadGltf(lod) {
  const k = lod ? 'lod' : 'full'
  if (!_gltfP[k]) {
    const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder)
    _gltfP[k] = l.loadAsync(BASE + (lod ? 'models/car-concept-lod.glb' : 'models/car-concept.glb')).then((g) => {
      if (lod) { // LOD: sin interior ni limpiaparabrisas (no se ven desde fuera)
        const drop = []; g.scene.traverse((o) => { if (/^Interior|Wiper/.test(o.name) && !/SteeringCylinder/.test(o.name)) drop.push(o) })
        for (const o of drop) o.removeFromParent()
      }
      return g
    })
  }
  return _gltfP[k]
}
function fixMat(m0, paint, meshName, shared) {
  const key = m0.uuid + '|' + (paint || '')
  if (shared && _matCache.has(key)) return _matCache.get(key)
  const m = m0.clone()
  if (m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = 0.45; m.roughness = 0.05 }
  if (paint && /color1|paint/i.test(m.name) && !/interior|seat/i.test(meshName)) m.color.set(paint)
  if (shared) _matCache.set(key, m)
  return m
}

/** CC0 Poly Haven HDRI → PMREM, used only for the realistic car's reflections (day). */
export async function loadCarHdri(renderer) {
  if (_hdrTex) return _hdrTex
  const hdr = await new HDRLoader().loadAsync(BASE + 'hdri/kloppenheim_06_puresky_1k.hdr')
  hdr.mapping = THREE.EquirectangularReflectionMapping
  const pm = new THREE.PMREMGenerator(renderer)
  _hdrTex = pm.fromEquirectangular(hdr).texture
  pm.dispose(); hdr.dispose()
  return _hdrTex
}

/** day: HDRI reflections; night: fall back to scene.environment (sky). */
export function setRealCarEnv(night) {
  for (const m of _models) m.traverse((o) => {
    if (!o.isMesh) return
    for (const mat of [].concat(o.material)) { mat.envMap = night ? null : _hdrTex; mat.needsUpdate = true }
  })
}

/**
 * Replace the procedural body + wheels of a Car with the GLB model.
 * Physics untouched. Resolves false (and leaves the old car) on any error.
 */
export async function applyRealCar(car, { paint, night, lod = false } = {}) {
  try {
    const gltf = await loadGltf(lod)
    if (car._disposed || !car.mesh?.parent) return false
    const src = gltf.scene.clone(true)
    src.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true; o.receiveShadow = false
      o.material = [].concat(o.material).map((m) => fixMat(m, paint, o.name, lod))
      if (o.material.length === 1) o.material = o.material[0]
    })
    const wheelNames = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR']
    const wheels = wheelNames.map((n) => src.getObjectByName(n))
    if (wheels.some((w) => !w)) throw new Error('wheel nodes missing')
    for (const w of wheels) w.quaternion.identity() // drop baked spin/steer pose
    const holder = new THREE.Group() // car frame
    const orient = new THREE.Group(); holder.add(orient); orient.add(src)
    holder.updateMatrixWorld(true)
    const c = wheels.map((w) => new THREE.Vector3().setFromMatrixPosition(w.matrixWorld))
    const front = c[0].clone().add(c[1]).multiplyScalar(0.5), rear = c[2].clone().add(c[3]).multiplyScalar(0.5)
    const dir = front.clone().sub(rear); dir.y = 0
    const wb = dir.length()
    // physics: wheels at z=±1.35 (front +z), radius 0.38
    const yaw = Math.atan2(dir.x, dir.z)
    const s = 2.7 / wb
    orient.rotation.y = -yaw
    orient.scale.setScalar(s)
    holder.updateMatrixWorld(true)
    const mid = new THREE.Vector3(); for (const w of wheels) mid.add(new THREE.Vector3().setFromMatrixPosition(w.matrixWorld)); mid.multiplyScalar(0.25)
    const wi = car.vehicle.wheelInfos[0]
    const axleY = (wi.chassisConnectionPointLocal.y - wi.suspensionRestLength)
    orient.position.set(-mid.x, axleY - mid.y, -mid.z)
    holder.updateMatrixWorld(true)

    // detach wheels → physics wheel groups (they spin + steer from cannon transforms)
    const inv = new THREE.Matrix4().copy(holder.matrixWorld).invert()
    const physPos = [0, 1, 2, 3].map((i) => car.vehicle.wheelInfos[i].chassisConnectionPointLocal)
    for (const w of wheels) {
      const m = new THREE.Matrix4().multiplyMatrices(inv, w.matrixWorld)
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); m.decompose(p, q, sc)
      // pick the physics wheel with same side/end
      let best = 0, bd = 1e9
      physPos.forEach((pp, i) => { const d = Math.sign(pp.x) !== Math.sign(p.x) || Math.sign(pp.z) !== Math.sign(p.z) ? 1e6 : 0; if (d < bd) { bd = d; best = i } })
      const g = car.wheelMeshes[best]
      for (const ch of g.children) ch.visible = false
      w.removeFromParent(); w.position.set(0, 0, 0); w.quaternion.copy(q); w.scale.copy(sc)
      g.add(w)
    }
    for (const o of car.mesh.children) if (o.isMesh || o.isGroup) o.visible = false
    car.mesh.add(holder)
    car.realModel = holder
    _models.add(holder)
    if (_hdrTex) setRealCarEnv(!!night)
    return true
  } catch (e) {
    console.warn('[realista] modelo GLB no disponible, uso el coche clásico:', e?.message || e)
    return false
  }
}

export function forgetRealCar(car) { if (car.realModel) _models.delete(car.realModel) }

/** Garaje: modelo realista completo (con ruedas) apoyado en y=0, batalla 2,7 m, frente hacia +Z. */
export async function buildRealPreview(paint) {
  const gltf = await loadGltf(false)
  const src = gltf.scene.clone(true)
  src.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = [].concat(o.material).map((m) => fixMat(m, paint, o.name, false)); if (o.material.length === 1) o.material = o.material[0] } })
  const wheels = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'].map((n) => src.getObjectByName(n))
  const holder = new THREE.Group(), orient = new THREE.Group(); holder.add(orient); orient.add(src)
  holder.updateMatrixWorld(true)
  const c = wheels.map((w) => new THREE.Vector3().setFromMatrixPosition(w.matrixWorld))
  const dir = c[0].clone().add(c[1]).sub(c[2]).sub(c[3]).multiplyScalar(0.5); dir.y = 0
  orient.rotation.y = -Math.atan2(dir.x, dir.z); orient.scale.setScalar(2.7 / dir.length())
  holder.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(src), ctr = box.getCenter(new THREE.Vector3())
  orient.position.set(-ctr.x, -box.min.y, -ctr.z)
  if (_hdrTex) holder.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) m.envMap = _hdrTex })
  return holder
}
