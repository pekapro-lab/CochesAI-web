import * as THREE from 'three'
import { MODELS, MODEL_BY_ID, FINISHES, RIMS, SPOILERS, VINYLS, STICKERS, PAINTS, buildCarMesh, buildWheel, loadGarage, saveGarage, defaultConfig } from './CarModels.js'

/** Garage / tuning shop: 3D turntable + options; config saved in localStorage. */
export class Garage {
  constructor(game) {
    this.game = game
    this.cfg = loadGarage()
    this.open = false
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0b0e16)
    this.scene.fog = new THREE.Fog(0x0b0e16, 14, 30)
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    this._yaw = 0.8
    this._autoSpin = true
    const s = this.scene
    s.add(new THREE.HemisphereLight(0xbfd4ff, 0x20180f, 0.6))
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 7, 5); key.castShadow = true
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -4; key.shadow.camera.right = key.shadow.camera.top = 4
    s.add(key)
    const rim = new THREE.DirectionalLight(0x66aaff, 1.2); rim.position.set(-5, 3, -4); s.add(rim)
    const warm = new THREE.PointLight(0xff7a3a, 8, 12, 2); warm.position.set(3, 1.2, -3); s.add(warm)
    // turntable floor + neon ring
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: 0x1a1d26, metalness: 0.6, roughness: 0.35 }))
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.04, 8, 96), new THREE.MeshBasicMaterial({ color: 0xff2b4a }))
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; s.add(ring)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x0d0f15, roughness: 0.9 }))
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; s.add(ground)
    this.turntable = new THREE.Group(); s.add(this.turntable)
    this._buildDom()
  }

  _rebuildCar() {
    const tt = this.turntable
    while (tt.children.length) tt.remove(tt.children[0])
    const built = buildCarMesh(this.cfg, { seed: 0 })
    built.root.traverse((o) => { if (o.isMesh) o.castShadow = true })
    for (const l of [built.headLightL, built.headLightR]) l.intensity = 6
    for (let i = 0; i < built.scannerLeds.length; i++) built.scannerLeds[i].material.emissiveIntensity = Math.max(0.05, 2 - Math.abs(i - 5) * 0.5)
    built.root.position.y = 0.66
    tt.add(built.root)
    for (const [x, z] of [[0.82, 1.35], [-0.82, 1.35], [0.82, -1.35], [-0.82, -1.35]]) {
      const w = buildWheel(this.cfg); w.position.set(x, 0.38, z); tt.add(w)
    }
    const m = MODEL_BY_ID[this.cfg.model]
    this.el.querySelector('#gar-desc').textContent = m.desc
    this.el.querySelector('#gar-stats').innerHTML = [['Aceleración', m.stats.accel / 1.2], ['Agarre', m.stats.grip / 1.15], ['Derrape', m.stats.drift / 1.3], ['Peso', m.stats.mass / 1150]]
      .map(([k, v]) => `<div class="gstat"><span>${k}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`).join('')
  }

  _buildDom() {
    const el = document.createElement('div')
    el.className = 'garage hidden'
    const opt = (list, key) => list.map((o) => `<button type="button" class="chip" data-k="${key}" data-v="${o.id}">${o.name}</button>`).join('')
    el.innerHTML = `
      <div class="garage-top"><div class="logo small">GARAJE<span>AI</span></div>
        <button class="btn" id="gar-rev" type="button">🔊 Acelerar</button>
        <button class="btn primary" id="gar-close" type="button">Guardar y salir</button></div>
      <div class="garage-panel panel interactive">
        <div class="gsec">Modelo</div><div class="chips" id="gar-models">${MODELS.map((m) => `<button type="button" class="chip model" data-k="model" data-v="${m.id}">${m.name}</button>`).join('')}</div>
        <div class="gdesc" id="gar-desc"></div><div id="gar-stats"></div>
        <div class="gsec">Pintura</div>
        <div class="swatches">${PAINTS.map((c) => `<button type="button" class="sw" data-k="paint" data-v="${c}" style="background:${c}"></button>`).join('')}<input type="color" id="gar-paint" title="Color libre"/></div>
        <div class="chips">${opt(FINISHES, 'finish')}</div>
        <div class="gsec">Vinilo</div><div class="chips">${opt(VINYLS, 'vinyl')}</div>
        <div class="swatches">${PAINTS.map((c) => `<button type="button" class="sw" data-k="vinylColor" data-v="${c}" style="background:${c}"></button>`).join('')}</div>
        <div class="gsec">Llantas</div><div class="chips">${opt(RIMS, 'rims')}</div>
        <div class="swatches">${['#c8ccd4', '#2a2a2e', '#ffd21a', '#e8c45a', '#e8231e', '#2f7bff', '#ffffff', '#21e6a8'].map((c) => `<button type="button" class="sw" data-k="rimColor" data-v="${c}" style="background:${c}"></button>`).join('')}</div>
        <div class="gsec">Alerón</div><div class="chips">${opt(SPOILERS, 'spoiler')}</div>
        <div class="gsec">Pegatina</div><div class="chips">${opt(STICKERS, 'sticker')}</div>
        <div class="gsec">Dorsal</div><div class="cfg-row"><input id="gar-num" type="number" min="0" max="999"/>
          <label class="gassist"><input id="gar-assist" type="checkbox"/> Ayuda de dirección</label></div>
        <button class="btn" id="gar-reset" type="button">Restablecer modelo</button>
      </div>`
    this.game.root.appendChild(el)
    this.el = el
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]')
      if (!b) return
      const k = b.dataset.k, v = b.dataset.v
      if (k === 'model') {
        const keep = this.cfg.model === v ? this.cfg : (this._perModel?.[v] || defaultConfig(v))
        this._perModel = { ...(this._perModel || {}), [this.cfg.model]: this.cfg }
        this.cfg = { ...keep, model: v }
        this.game.audio.setProfile(MODEL_BY_ID[v].sound)
      } else this.cfg = { ...this.cfg, [k]: v }
      this._sync()
    })
    el.querySelector('#gar-paint').addEventListener('input', (e) => { this.cfg = { ...this.cfg, paint: e.target.value }; this._sync() })
    el.querySelector('#gar-num').addEventListener('change', (e) => { this.cfg = { ...this.cfg, number: Math.max(0, Math.min(999, parseInt(e.target.value, 10) || 0)) }; this._sync() })
    el.querySelector('#gar-assist').addEventListener('change', (e) => { this.cfg = { ...this.cfg, assist: e.target.checked }; saveGarage(this.cfg) })
    el.querySelector('#gar-reset').addEventListener('click', () => { this.cfg = defaultConfig(this.cfg.model); this._sync() })
    el.querySelector('#gar-close').addEventListener('click', () => this.hide())
    el.querySelector('#gar-rev').addEventListener('click', () => { this.game.audio.setProfile(MODEL_BY_ID[this.cfg.model].sound); this.game.audio.revPreview() })
    // drag to rotate
    let px = null
    const cv = () => this.game.renderer.domElement
    window.addEventListener('pointerdown', (e) => { if (this.open && e.target === cv()) { px = e.clientX; this._autoSpin = false } })
    window.addEventListener('pointermove', (e) => { if (px != null) { this._yaw += (e.clientX - px) * 0.01; px = e.clientX } })
    window.addEventListener('pointerup', () => { px = null })
  }

  _sync() {
    saveGarage(this.cfg)
    for (const b of this.el.querySelectorAll('[data-k]')) b.classList.toggle('active', String(this.cfg[b.dataset.k]) === b.dataset.v)
    this.el.querySelector('#gar-paint').value = this.cfg.paint
    this.el.querySelector('#gar-num').value = this.cfg.number
    this.el.querySelector('#gar-assist').checked = this.cfg.assist !== false
    this._rebuildCar()
  }

  show() {
    if (this.game.state !== 'menu') return
    this.open = true
    this.game.ui.showMenu(false)
    this.el.classList.remove('hidden')
    this._sync()
    this.game.audio.setProfile(MODEL_BY_ID[this.cfg.model].sound)
    this._env = this.scene.environment = this.game.envMap
    this.scene.environmentIntensity = 0.8
    const loop = () => { if (!this.open) return; this._raf = requestAnimationFrame(loop); this.render() }
    loop()
  }

  render() {
    const r = this.game.renderer
    const w = window.innerWidth, h = window.innerHeight
    if (this._autoSpin) this._yaw += 0.004
    this.turntable.rotation.y = this._yaw
    const portrait = h > w
    this.camera.aspect = w / h
    this.camera.fov = portrait ? 60 : 38
    // keep the car in the free part of the screen (panel takes the right side)
    this.camera.setViewOffset(w, h, portrait ? 0 : w * 0.2, portrait ? h * 0.18 : 0, w, h)
    this.camera.position.set(0, 2.2, portrait ? 11 : 8.4)
    this.camera.lookAt(0, 0.6, 0)
    this.camera.updateProjectionMatrix()
    const exp = r.toneMappingExposure
    r.toneMappingExposure = 1.1
    r.render(this.scene, this.camera)
    r.toneMappingExposure = exp
  }

  hide() {
    this.open = false
    cancelAnimationFrame(this._raf)
    this.game.audio.silence(true)
    saveGarage(this.cfg)
    this.el.classList.add('hidden')
    this.game.ui.showMenu(true)
    this.game.renderer.render(this.game.scene, this.game.camera)
  }
}
