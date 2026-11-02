import * as THREE from 'three'

// realista · Fase 3: humo de ruedas, marcas de frenada, chispas, luces de freno/faros, sensación de velocidad.
// Todo con pools fijos (sin crear objetos por frame).

const VS = `attribute float aAlpha; attribute float aSize; varying float vA;
void main(){ vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*(300.0/-mv.z); gl_Position=projectionMatrix*mv; }`
const FS = `uniform vec3 uColor; varying float vA;
void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard; float a=vA*smoothstep(0.5,0.0,d); gl_FragColor=vec4(uColor,a); }`

class Particles {
  constructor(scene, max, color, additive) {
    this.max = max; this.n = 0; this.i = 0
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3)
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max).fill(1)
    this.alpha = new Float32Array(max); this.size = new Float32Array(max); this.grow = new Float32Array(max); this.a0 = new Float32Array(max)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { uColor: { value: new THREE.Color(color) } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending })
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5
    scene.add(this.points); this.g = g; this.gravity = additive ? -9.8 : 0.6; this.drag = additive ? 0.6 : 2.2
  }
  emit(x, y, z, vx, vy, vz, life, size, grow, a0) {
    const i = this.i; this.i = (this.i + 1) % this.max
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3)
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grow[i] = grow; this.a0[i] = a0
  }
  update(dt) {
    const k = Math.max(0, 1 - this.drag * dt)
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue }
      this.life[i] -= dt
      const j = i * 3
      this.vel[j] *= k; this.vel[j + 2] *= k; this.vel[j + 1] = this.vel[j + 1] * k + this.gravity * dt
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt
      if (this.gravity < 0 && this.pos[j + 1] < 0.02) { this.pos[j + 1] = 0.02; this.vel[j + 1] *= -0.35 }
      this.size[i] += this.grow[i] * dt
      const t = this.life[i] / this.maxLife[i]
      this.alpha[i] = Math.max(0, this.a0[i] * t)
    }
    this.g.attributes.position.needsUpdate = true; this.g.attributes.aAlpha.needsUpdate = true; this.g.attributes.aSize.needsUpdate = true
  }
  dispose() { this.points.removeFromParent(); this.g.dispose(); this.mat.dispose() }
}

class Skids {
  constructor(scene, max) {
    this.max = max; this.i = 0
    const geo = new THREE.PlaneGeometry(0.24, 1); geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.frustumCulled = false
    const zero = new THREE.Matrix4().makeScale(0, 0, 0)
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, zero)
    this.mesh.renderOrder = 1; scene.add(this.mesh)
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0)
  }
  add(a, b, n) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz)
    if (len < 0.05 || len > 3) return
    this._p.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.03, (a.z + b.z) / 2)
    this._q.setFromAxisAngle(this._up, Math.atan2(dx, dz))
    if (n) { const qn = new THREE.Quaternion().setFromUnitVectors(this._up, n); this._q.premultiply(qn) }
    this._s.set(1, 1, len + 0.04)
    this._m.compose(this._p, this._q, this._s)
    this.mesh.setMatrixAt(this.i, this._m); this.i = (this.i + 1) % this.max
    this.mesh.instanceMatrix.needsUpdate = true
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose() }
}

export class Effects {
  constructor(game) {
    this.game = game
    const low = game.isIOS || game.quality === 'low'
    this.low = low
    this.smoke = new Particles(game.scene, low ? 140 : 360, 0xd8d8d8, false)
    this.sparks = new Particles(game.scene, low ? 90 : 220, 0xffa63a, true)
    this.skids = new Skids(game.scene, low ? 500 : 1200)
    this._last = new Map() // car -> [Vector3|null x4]
    this._hooked = new WeakSet()
    this._v = new THREE.Vector3()
    this.lines = document.querySelector('.speedlines') || Object.assign(document.createElement('div'), { className: 'speedlines' })
    if (!this.lines.parentNode) document.body.appendChild(this.lines)
  }

  _hook(car) {
    if (this._hooked.has(car)) return
    this._hooked.add(car)
    car.chassisBody.addEventListener('collide', (e) => {
      const c = e.contact; if (!c) return
      const iv = Math.abs(c.getImpactVelocityAlongNormal())
      if (iv < 2.5) return
      const bi = c.bi, ri = c.ri
      const x = bi.position.x + ri.x, y = Math.max(0.3, bi.position.y + ri.y), z = bi.position.z + ri.z
      const n = Math.min(this.low ? 10 : 24, Math.round(iv * (this.low ? 2 : 4)))
      for (let k = 0; k < n; k++) {
        const s = 2 + Math.random() * iv * 0.8
        this.sparks.emit(x, y, z, (Math.random() - 0.5) * s, Math.random() * s * 0.7 + 1, (Math.random() - 0.5) * s, 0.35 + Math.random() * 0.4, 0.09 + Math.random() * 0.06, -0.08, 1)
      }
      if (car === this.game.car) this.game.audio?.bump?.(iv)
    })
  }

  _lights(car, night) {
    if (!car.realModel) return
    if (!car._fxMats) {
      car._fxMats = { brake: [], head: [] }
      car.realModel.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (/brakelight/i.test(m.name)) car._fxMats.brake.push(m); else if (/headlight/i.test(m.name)) car._fxMats.head.push(m) } })
      for (const m of car._fxMats.brake) m.userData.e0 = m.emissive.clone()
    }
    const f = car.fx || {}
    for (const m of car._fxMats.brake) {
      if (f.reverse) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 3 } else { m.emissive.copy(m.userData.e0); m.emissiveIntensity = f.brake || f.hb ? 9 : night ? 2.2 : 0.7 }
    }
    for (const m of car._fxMats.head) m.emissiveIntensity = night ? 6 : 1.2
  }

  update(dt) {
    const g = this.game, night = g.timeOfDay !== 'day'
    const cars = (g.racers || []).map((r) => r.car).filter(Boolean)
    for (const car of cars) {
      this._hook(car); this._lights(car, night)
      const v = car.vehicle, kmh = Math.abs(car.speedKmh || 0), f = car.fx || {}
      const sliding = (car.slip || 0) > 0.32 || (f.hb && kmh > 15) || (f.brake && kmh > 45)
      let last = this._last.get(car); if (!last) { last = [null, null, null, null]; this._last.set(car, last) }
      const near = car === g.car || car.mesh.position.distanceToSquared(g.camera.position) < 900
      for (let i = 0; i < 4; i++) {
        const w = v.wheelInfos[i]
        const rear = i >= 2
        if (!sliding || !w.isInContact || kmh < 8 || (!rear && !(f.brake && kmh > 45))) { last[i] = null; continue }
        const hp = w.raycastResult.hitPointWorld
        const p = new THREE.Vector3(hp.x, hp.y, hp.z)
        if (last[i]) this.skids.add(last[i], p, null)
        last[i] = p
        if (rear && near && Math.random() < (this.low ? 0.35 : 0.8)) {
          const vel = car.chassisBody.velocity
          this.smoke.emit(p.x, p.y + 0.25, p.z, vel.x * 0.15 + (Math.random() - 0.5), 0.6 + Math.random() * 0.6, vel.z * 0.15 + (Math.random() - 0.5), 1.2 + Math.random() * 0.8, 1.0, 3.2, 0.55)
        }
      }
    }
    this.smoke.update(dt); this.sparks.update(dt)
    // sensación de velocidad (overlay CSS barato)
    const me = g.car, kmh = Math.abs(me?.speedKmh || 0)
    const on = g.state === 'racing' && g.quality !== 'low' && localStorage.getItem('cochesai-speedlines') !== 'no'
    const a = on ? Math.max(0, Math.min(1, (kmh - 150) / 90)) * (this.low ? 0.28 : 0.45) : 0
    this.lines.style.opacity = a.toFixed(3)
  }

  dispose() { this.smoke.dispose(); this.sparks.dispose(); this.skids.dispose(); this.lines.style.opacity = '0'; this._last.clear() }
}
