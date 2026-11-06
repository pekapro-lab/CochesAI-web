import * as THREE from 'three'
import { skyEnvironment } from './Reflections.js'
import * as CANNON from 'cannon-es'
import { Car } from './Car.js'
import { buildTrack } from './TrackBuilder.js'
import { getTrack } from './tracks/index.js'
import { Input } from './Input.js'
import { AudioEngine } from './AudioEngine.js'
import { Environment } from './Environment.js'
import { formatTime } from './format.js'
import { RaceMixin } from './RaceMixin.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Garage } from './Garage.js'
import { Effects } from './Effects.js'
import { loadCarHdri, setRealCarEnv } from './RealCar.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'


function bestKey(trackId) {
  return `cochesai-best-${trackId}`
}

export class Game {
  constructor(root, ui) {
    this.root = root
    this.ui = ui
    this.input = new Input()
    this.audio = new AudioEngine()
    this.timeOfDay = localStorage.getItem('cochesai-tod') === 'day' ? 'day' : 'night'
    this.state = 'menu' // menu | countdown | racing | paused | finished
    this.cameraMode = 'hood' // hood | chase
    this.track = null
    this.car = null
    this.world = null
    this.clock = new THREE.Clock(false)
    this.lap = 1
    this.totalLaps = 3
    this.lapStart = 0
    this.bestLap = null
    this.currentLapTime = 0
    this._progress = 0
    this._lastProgress = 0
    this._crossed = false
    this._raf = 0
    this._countdown = 3
    this._countAcc = 0

    this._setupRenderer()
    this._setupSceneBasics()
    this._bindUI()
  }

  _setupRenderer() {
    // iOS/iPadOS (all browsers there are WebKit): smaller pixel ratio + cheaper shadows.
    const ua = navigator.userAgent || ''
    this.isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    this._prMax = Math.min(window.devicePixelRatio || 1, 1.5)
    this._pr = this._prMax
    this._perf = { t: 0, frames: 0 }
    // Reflection quality: 'high' (256 env + clearcoat) or 'low' (64 env, no clearcoat).
    // Starts high everywhere; drops automatically if frames stay slow at the lowest resolution.
    this.quality = localStorage.getItem('cochesai-quality') === 'low' ? 'low' : 'high'
    this._slowWindows = 0
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.setPixelRatio(this._pr)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = this.isIOS ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
    this.renderer.domElement.className = 'game-canvas'
    this.root.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 600)
    window.addEventListener('resize', this._onResize)
  }

  _setupSceneBasics() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x05070c)
    this.scene.fog = new THREE.FogExp2(0x05070c, 0.012)

    this.hemi = new THREE.HemisphereLight(0x6a7aaa, 0x0a0c10, 0.45)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(0xffc8a0, 0.55)
    this.sun.position.set(-40, 60, 20)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 200
    this.sun.shadow.camera.left = -60
    this.sun.shadow.camera.right = 60
    this.sun.shadow.camera.top = 60
    this.sun.shadow.camera.bottom = -60
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    this.ambient = new THREE.AmbientLight(0x203040, 0.35)
    this.scene.add(this.ambient)

    this.env = new Environment(this.scene)
    // v2: environment reflections for metallic paint / clearcoat (PMREM of a procedural room)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.scene.environment = this.envMap
    this.scene.environmentIntensity = 0.4
    this.garage = new Garage(this)
    loadCarHdri(this.renderer).then(() => setRealCarEnv(this.timeOfDay !== 'day')).catch((e) => console.warn('[realista] HDRI', e?.message || e))
    // Wider shadow camera so day shadows look good on track
    const sm = this.isIOS ? 1024 : 2048
    this.sun.shadow.mapSize.set(sm, sm)
    this.sun.shadow.camera.left = -90
    this.sun.shadow.camera.right = 90
    this.sun.shadow.camera.top = 90
    this.sun.shadow.camera.bottom = -90
    this.sun.shadow.bias = -0.0002
  }

  _bindUI() {
    this.input.onToggleCamera = () => {
      this.cameraMode = this.cameraMode === 'hood' ? 'chase' : 'hood'
      this.ui.setCameraLabel(this.cameraMode)
    }
    this.input.onPause = () => {
      if (this.state === 'racing') this.pause()
      else if (this.state === 'paused') this.resume()
    }
    this.input.onMute = () => {
      const muted = this.audio.toggleMute()
      this.ui.setMute(muted)
    }
    this.ui.onToggleMusic = async () => {
      await this.audio.ensure()
      const on = this.audio.music.toggle()
      this.ui.setMusic(on)
      if (on && this.state === 'menu') this.audio.music.playLoop('menu_garaje', 0.6)
    }
    // iOS/Chrome autoplay: create the AudioContext and start the menu loop on the first gesture
    const GESTURES = ['pointerdown', 'touchend', 'click', 'keydown']
    const firstGesture = () => {
      this.audio.ensure().then(() => {
        const ctx = this.audio.ctx
        if (!ctx) return
        if (ctx.state !== 'running') ctx.resume?.().catch(() => {})
        this.audio.music.unlock()
        if (this.state === 'menu') this.audio.music.playLoop('menu_garaje', 1.5)
        if (ctx.state === 'running') for (const ev of GESTURES) document.removeEventListener(ev, firstGesture, true)
      }).catch(() => {})
    }
    for (const ev of GESTURES) document.addEventListener(ev, firstGesture, true)
    // UI sounds: menu clicks + garage confirm
    this.ui.el.addEventListener('click', (e) => {
      const b = e.target.closest?.('button')
      if (!b || !this.audio.music.ready) return
      if (b.id === 'gar-close') this.audio.music.ui('ui_confirmar')
      else if (b.id !== 'gar-rev') this.audio.music.ui('ui_click')
    }, true)

    this.ui.onStartTrack = async (trackId, opts) => {
      await this.audio.ensure()
      this.startTrack(trackId, opts)
    }
    this.ui.onGarage = () => this.garage.show()
    this.ui.onResume = () => this.resume()
    this.ui.onExitToMenu = () => this.exitToMenu()
    this.ui.onToggleCamera = () => this.input.onToggleCamera()
    this.ui.onToggleMute = () => this.input.onMute()
    this.ui.onPause = () => this.input.onPause()
    this.ui.onRecover = () => this.recoverCar()
    this.ui.onRestartRace = () => this.restartRace()
    this.input.onRecover = () => this.recoverCar()
    this.ui.onTimeOfDay = (mode) => {
      this.timeOfDay = mode === 'day' ? 'day' : 'night'
      localStorage.setItem('cochesai-tod', this.timeOfDay)
      this.ui.setTimeOfDay(this.timeOfDay)
    }
    this.ui.bindTouch(this.input)
    // Background/lock screen: never leave the engine droning
    document.addEventListener('visibilitychange', () => {
      this.audio.setHidden(document.hidden)
      if (document.hidden && this.state === 'racing' && !this.net) this.pause?.()
    })
    this.ui.setTimeOfDay(this.timeOfDay)
  }

  startTrack(trackId, opts = {}) {
    this.cleanupRace()
    this._lastOpts = opts
    const def = getTrack(trackId)
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    })
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.allowSleep = false
    this.world.defaultContactMaterial.friction = 0.05
    this.world.defaultContactMaterial.restitution = 0.02
    this.world.defaultContactMaterial.contactEquationStiffness = 1e7
    this.world.defaultContactMaterial.contactEquationRelaxation = 3
    this.world.solver.iterations = 12

    const groundMaterial = new CANNON.Material('pekar-ground')
    const barrierMaterial = new CANNON.Material('pekar-barrier')
    const chassisMaterial = new CANNON.Material('pekar-chassis')
    this.world._pekarGroundMat = groundMaterial
    this.world._pekarBarrierMat = barrierMaterial
    // Barriers: almost no friction so the car slides off instead of wedging
    this.world.addContactMaterial(new CANNON.ContactMaterial(chassisMaterial, barrierMaterial, {
      friction: 0.0,
      restitution: 0.0,
      contactEquationStiffness: 5e6,
      contactEquationRelaxation: 4,
    }))
    this.world.addContactMaterial(new CANNON.ContactMaterial(chassisMaterial, groundMaterial, {
      friction: 0.02,
      restitution: 0,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
    }))
    this._trackId = trackId
    this._stuckTime = 0
    this._airTime = 0
    this._lastMovePos = null
    this._checkpointIndex = 0

    const trackDef = { ...def, timeOfDay: this.timeOfDay }
    this._applyLighting(this.timeOfDay)
    this.track = buildTrack(this.world, this.scene, trackDef)
    this._chassisMat = chassisMaterial
    this.world.addContactMaterial(new CANNON.ContactMaterial(chassisMaterial, chassisMaterial, { friction: 0.05, restitution: 0.15 }))
    this._setupRacers(opts)
    try { this.fx?.dispose(); this.fx = new Effects(this) } catch (e) { console.warn('[realista] efectos', e); this.fx = null }
    this.totalLaps = opts.laps || this.track.laps
    this.lap = 1
    this.bestLap = Number(localStorage.getItem(bestKey(def.id))) || null
    this.currentLapTime = 0
    this._progress = 0
    this._lastProgress = 0
    this._crossed = false

    this.ui.showHud(true)
    this.ui.showMenu(false)
    this.ui.updateHud({
      lap: this.lap,
      totalLaps: this.totalLaps,
      current: 0,
      best: this.bestLap,
      speed: 0,
    })
    this.ui.drawMinimap(this.track.path, null)

    if (this.quality === 'low') this._applyQualityToCars()
    this.input.bind()
    this.state = 'countdown'
    this._countdown = 3
    // Net races: everyone's countdown ends at the host's startAt (elapsed 3.8 s = green)
    this._countStartedAt = opts.startAt != null && this.net ? opts.startAt - (this.net.isHost ? 0 : this.net.clockOffset) - 3800 : performance.now()
    this._raceT0 = opts.startAt != null ? opts.startAt : null
    this._countShown = 3
    this.ui.showCountdown('3')
    // Music: fade the menu loop, preload this track's race loop, and schedule the countdown
    // jingle so its "¡YA!" hit (2.4 s into the file) lands with the on-screen "¡YA!" (elapsed 3.0 s);
    // the physical start stays at 3.8 s
    const mu = this.audio.music
    mu.stopShots(); mu.setDuck(1); mu.stopLoop(1.0)
    mu.load('carrera_' + trackId).catch(() => {})
    this._musicCountdown = mu.countdown(this._countStartedAt + 3000)
    if (!this._musicCountdown) this.audio.beep(520, 0.1)
    this.clock.start()
    if (!this._raf) this._loop()
  }

  /** Adaptive resolution: drop the pixel ratio when frames are slow, restore it when fast. */
  _adaptResolution(rawDt) {
    if (this.state !== 'racing' || !(rawDt > 0) || rawDt > 0.5) return
    const p = this._perf
    p.t += rawDt; p.frames++
    if (p.t < 1.5) return
    const avg = p.t / p.frames
    p.t = 0; p.frames = 0
    let pr = this._pr
    if (avg > 1 / 40 && pr <= 0.75 && this.quality === 'high') { if (++this._slowWindows >= 3) this._setQuality('low') } else this._slowWindows = 0
    if (avg > 1 / 40 && pr > 0.75) pr = Math.max(0.75, pr - 0.15)
    else if (avg < 1 / 55 && pr < this._prMax) pr = Math.min(this._prMax, pr + 0.1)
    if (pr !== this._pr) {
      this._pr = pr
      this.renderer.setPixelRatio(pr)
      this.renderer.setSize(window.innerWidth, window.innerHeight)
    }
  }

  _bloomWanted() {
    const q = localStorage.getItem('cochesai-bloom')
    if (q === 'no') return false
    if (q === 'si') return true
    return !this.isIOS && this.quality !== 'low'
  }

  _render() {
    if (!this._bloomWanted()) { this.renderer.render(this.scene, this.camera); return }
    if (!this.composer) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2())
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType })
      this.composer = new EffectComposer(this.renderer, rt)
      this.composer.addPass(new RenderPass(this.scene, this.camera))
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.4, 0.9)
      this.composer.addPass(this.bloomPass)
      this.composer.addPass(new OutputPass())
      this._composerSize = ''
    }
    const w = window.innerWidth, h = window.innerHeight, key = w + 'x' + h + '@' + this.renderer.getPixelRatio()
    if (key !== this._composerSize) { this._composerSize = key; this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h) }
    const night = this.timeOfDay !== 'day'
    this.bloomPass.strength = night ? (this.cameraMode === 'hood' ? 0.3 : 0.55) : 0.22
    this.bloomPass.threshold = night ? 0.75 : 0.92
    this.composer.render()
  }

  _applyLighting(mode) {
    setRealCarEnv(mode !== 'day')
    this.env?.apply(mode)
    if (mode === 'day') {
      this.scene.background = new THREE.Color(0x9ec8f0)
      this.scene.fog = new THREE.Fog(0xc8e0f5, 120, 420)
      this.hemi.color.set(0xf0f7ff)
      this.hemi.groundColor.set(0xc2a882)
      this.hemi.intensity = 0.95
      this.sun.intensity = 2.0
      this.sun.color.set(0xfff3d6)
      this.sun.position.set(70, 110, 45)
      this.sun.castShadow = true
      this.ambient.intensity = 0.55
      this.ambient.color.set(0xffffff)
      this.renderer.toneMappingExposure = 1.15
      this.scene.environment = this._skyEnv('day')
      this.scene.environmentIntensity = 1.0
    } else {
      this.scene.background = new THREE.Color(0x03050a)
      this.scene.fog = new THREE.FogExp2(0x070a16, 0.008)
      this.hemi.color.set(0x4a5a88)
      this.hemi.groundColor.set(0x080a10)
      this.hemi.intensity = 0.75
      this.sun.intensity = 0.55
      this.sun.color.set(0x6688cc)
      this.sun.position.set(-40, 60, 20)
      this.sun.castShadow = false
      this.ambient.intensity = 0.6
      this.ambient.color.set(0x24304e)
      this.renderer.toneMappingExposure = 1.25
      this.scene.environment = this._skyEnv('night')
      this.scene.environmentIntensity = 0.9
    }
  }

  _skyEnv(mode) {
    try { return skyEnvironment(this.renderer, mode, this.quality === 'low' ? 64 : 256) } catch { return this.envMap }
  }

  /** Lower/raise reflection cost at runtime (visual only). */
  _setQuality(q) {
    if (q === this.quality) return
    this.quality = q
    this.scene.environment = this._skyEnv(this.timeOfDay)
    this._applyQualityToCars()
  }

  _applyQualityToCars() {
    const low = this.quality === 'low'
    for (const r of this.racers || []) r.car?.mesh?.traverse?.((o) => {
      const m = o.material
      if (!m || !m.isMeshPhysicalMaterial) return
      if (m.userData.cc == null) m.userData.cc = m.clearcoat
      const want = low ? 0 : m.userData.cc
      if (m.clearcoat !== want) { m.clearcoat = want; m.needsUpdate = true }
    })
  }

  pause() {
    if (this.state !== 'racing') return
    this.state = 'paused'
    this.audio.silence()
    this.audio.music.setDuck(0.3)
    this.ui.showPause(true)
  }

  resume() {
    if (this.state !== 'paused') return
    this.state = 'racing'
    this.ui.showPause(false)
    this.audio.music.setDuck(1)
    this.clock.start()
  }

  exitToMenu() {
    this.cleanupRace()
    this.state = 'menu'
    this.audio.music.stopShots()
    this.audio.music.setDuck(1)
    this.audio.music.playLoop('menu_garaje', 1.0)
    this.ui.showPause(false)
    this.ui.showCountdown('')
    this.ui.hideCountdown()
    this.ui.showHud(false)
    this.ui.showMenu(true)
    this.ui.refreshBestTimes()
    cancelAnimationFrame(this._raf)
    this._raf = 0
    // keep rendering empty-ish sky? just clear once
    this._render()
  }

  cleanupRace() {
    this.fx?.dispose(); this.fx = null
    this.audio.silence(true)
    this.input.unbind()
    if (this.racers) for (const r of this.racers) if (r !== this.me) r.car.dispose()
    this.racers = null
    this.me = null
    if (this.car) {
      this.car.dispose()
      this.car = null
    }
    if (this.track) {
      this.track.dispose()
      this.track = null
    }
    this.world = null
  }

  _loop = () => {
    this._raf = requestAnimationFrame(this._loop)
    const rawDt = this.clock.getDelta()
    const dt = Math.min(rawDt, 0.05)
    this._adaptResolution(rawDt)

    if (this.state === 'countdown') {
      // keep car still; still step tiny physics for stability
      this._raceTick(dt, true)
      if (this.world) this.world.step(1 / 90, dt, 6)
      this.car?.update(dt, { throttle: 0, brake: 0, steer: 0, handbrake: true })
      this._raceAfterStep(dt)
      this._updateCamera()
      const elapsed = (performance.now() - this._countStartedAt) / 1000
      // 0-1:3, 1-2:2, 2-3:1, 3-3.8:YA, then race
      let show
      if (elapsed < 1) show = 3
      else if (elapsed < 2) show = 2
      else if (elapsed < 3) show = 1
      else if (elapsed < 3.8) show = 0
      else show = -1
      if (show !== this._countShown) {
        this._countShown = show
        if (show > 0) {
          this.ui.showCountdown(String(show))
          if (!this._musicCountdown) this.audio.beep(520, 0.1)
        } else if (show === 0) {
          this.ui.showCountdown('¡YA!')
          if (!this._musicCountdown) this.audio.beep(880, 0.18)
        } else {
          this.ui.hideCountdown()
          this.state = 'racing'
          this.lapStart = performance.now()
          if (this._raceT0 == null) this._raceT0 = this.net ? this.net.hostNow() : performance.now()
          this.raceStartedHost = this.net ? this.net.hostNow() : performance.now()
          for (const r of this.racers || []) r.lapStart = this._raceTime()
          this.audio.music.playLoop('carrera_' + this._trackId, 0.8)
        }
      }
      this._render()
      return
    }

    // Net races never pause the simulation (others keep racing)
    if (this.state === 'paused' && this.net && this.world) {
      this._raceTick(dt, false)
      this.world.step(1 / 90, dt, 6)
      this.car.update(dt, { throttle: 0, brake: 0, steer: 0, handbrake: true })
      this._raceAfterStep(dt)
    }
    if (this.state !== 'racing' && this.audio.engineLevel() > 0.001 && !this._silenced) {
      this.audio.silence()
      this._silenced = true
    }
    if (this.state === 'racing') this._silenced = false
    if (this.state === 'paused' || this.state === 'menu') {
      this._render()
      return
    }

    if (this.state === 'racing' || this.state === 'finished') {
      if (this.state === 'finished' && this.world) {
        this._raceTick(dt, false)
        this.world.step(1 / 90, dt, 6)
        this._guardPhysics(dt, { throttle: 1, brake: 0, steer: 0 })
        this._raceAfterStep(dt)
        this.ui.drawMinimap(this.track.path, this.car.getPosition(), this.racers)
      }
      if (this.state === 'racing') {
        const controls = this.input.getControls()
        this._raceTick(dt, false)
        if (this.world) this.world.step(1 / 90, dt, 6)
        this.car.update(dt, controls)
        this._updateCheckpoint()
        this._guardPhysics(dt, controls)
        this.audio.setDriving({
          speedKmh: this.car.speedKmh,
          throttle: controls.throttle,
          brake: controls.brake,
          slip: this.car.slip || 0,
        })
        this._raceAfterStep(dt)
        this.lap = Math.max(1, Math.min(this.totalLaps, this.me.lap))
        this.currentLapTime = (performance.now() - this.lapStart) / 1000
        this.ui.updateHud({
          lap: this.lap,
          totalLaps: this.totalLaps,
          current: this.currentLapTime,
          best: this.bestLap,
          speed: this.car.speedKmh,
          gear: this.car.gear,
        })
        this.ui.drawMinimap(this.track.path, this.car.getPosition(), this.racers)
      }
      this.fx?.update(dt)
      this._updateCamera()
      this._render()
    }
  }


  _nearestPathIndex(pos) {
    const path = this.track.path
    let bestI = 0
    let bestD = Infinity
    for (let i = 0; i < path.length; i++) {
      const dx = path[i].x - pos.x
      const dz = path[i].z - pos.z
      const d = dx * dx + dz * dz
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    }
    return bestI
  }

  _pathYaw(index) {
    const path = this.track.path
    const a = path[index]
    const b = path[(index + 1) % path.length]
    return Math.atan2(b.x - a.x, b.z - a.z)
  }

  _updateCheckpoint() {
    if (!this.car || !this.track) return
    const pos = this.car.getPosition()
    const idx = this._nearestPathIndex(pos)
    // Only advance checkpoint when roughly on-track and upright
    const p = this.track.path[idx]
    const dx = pos.x - p.x
    const dz = pos.z - p.z
    const dist = Math.hypot(dx, dz)
    if (dist < (this.track.roadWidth || 12) * 0.7 && !this.car.isOverturned() && this.car.speedKmh > 5) {
      this._checkpointIndex = idx
    }
  }

  _placeOnPath(index, y = 0.72) {
    const path = this.track.path
    const i = ((index % path.length) + path.length) % path.length
    const p = path[i]
    const yaw = this._pathYaw(i)
    // Nudge slightly toward the inside of the path so we never respawn intersecting a barrier
    const j = (i + 1) % path.length
    const fx = path[j].x - p.x
    const fz = path[j].z - p.z
    const fl = Math.hypot(fx, fz) || 1
    // side = left of forward; keep on centerline (no side offset)
    this.car.teleport(p.x - (fx / fl) * 0.5, y, p.z - (fz / fl) * 0.5, yaw)
  }

  recoverCar() {
    if (!this.car || !this.track) return
    if (this.state !== 'racing' && this.state !== 'paused' && this.state !== 'countdown') return
    const idx = Number.isFinite(this._checkpointIndex)
      ? this._checkpointIndex
      : this._nearestPathIndex(this.car.getPosition())
    this._placeOnPath(idx, 0.72)
    this._stuckTime = 0
    this._airTime = 0
    this._lastMovePos = null
    this._recoverGrace = 1.0
    const body = this.car.chassisBody
    body.wakeUp()
    const fwd = new CANNON.Vec3()
    body.vectorToWorldFrame(new CANNON.Vec3(0, 0, 1), fwd)
    body.velocity.x = fwd.x * 2
    body.velocity.y = -1.5
    body.velocity.z = fwd.z * 2
  }

  restartRace() {
    if (!this._trackId) return
    if (this.net) return // net races restart from the lobby
    this.ui.showPause(false)
    this.ui.setPauseTitle('Pausa')
    this.ui.hideCountdown()
    this.startTrack(this._trackId)
  }

  _guardPhysics(dt, controls) {
    if (!this.car) return
    // Containment first, even for a flipped car (a high-speed wall hit can flip it outside)
    if (!this.car.hasBadState()) this._containCar(this.car.chassisBody)
    if (this.car.hasBadState() || this.car.isOverturned()) {
      this.recoverCar()
      return
    }
    const pos = this.car.getPosition()
    const body = this.car.chassisBody
    this._containCar(body)
    const wheels = this.car.wheelsOnGround()

    // Soft catch: lift onto the plane WITHOUT wiping yaw or forward speed.
    // Snapping quaternion here used to kill momentum at the first curve.
    if (wheels === 0 && pos.y < 0.45) {
      body.position.y = 0.75
      if (body.velocity.y < 0) body.velocity.y = 0
      body.angularVelocity.x *= 0.5
      body.angularVelocity.z *= 0.5
    }

    const moved = this._lastMovePos
      ? Math.hypot(pos.x - this._lastMovePos.x, pos.z - this._lastMovePos.z)
      : 1
    if (!this._lastMovePos) this._lastMovePos = { x: pos.x, z: pos.z }
    else {
      this._lastMovePos.x = pos.x
      this._lastMovePos.z = pos.z
    }

    if (this._recoverGrace > 0) {
      this._recoverGrace = Math.max(0, this._recoverGrace - dt)
      // During grace, gently push the car onto its wheels
      if (wheels === 0) {
        body.applyForce(new CANNON.Vec3(0, -9000, 0))
      }
      this._stuckTime = 0
      this._airTime = 0
      return
    }

    const reversing = this.car.gear === 'R'
    const tryingDrive = controls.throttle > 0 || Math.abs(controls.steer) > 0.2
    const tryingReverse = controls.brake > 0 && reversing
    const nearlyStill = this.car.speedKmh < 3 && moved < 0.35
    // Death state: throttle held but no wheel contact (not reverse)
    const noTraction = wheels === 0 && controls.throttle > 0 && !reversing

    if (wheels === 0) this._airTime = (this._airTime || 0) + dt
    else this._airTime = 0

    // Mild downforce while airborne so rays reconnect
    if (wheels === 0 && pos.y > 0.55 && body.velocity.y > -2) {
      body.applyForce(new CANNON.Vec3(0, -7000, 0))
    }

    // Stuck while trying to move (forward OR reverse) — auto Recolocar for both
    const stuckTrying = (tryingDrive || tryingReverse) && nearlyStill
    if (stuckTrying || (noTraction && this.car.speedKmh < 8)) {
      this._stuckTime += dt
      if (this._stuckTime > 0.55) {
        const idx = this._nearestPathIndex(pos)
        const center = this.track.path[idx]
        const dx = center.x - pos.x
        const dz = center.z - pos.z
        const len = Math.hypot(dx, dz) || 1
        if (pos.y < 0.55) body.position.y = 0.75
        // Pull toward centerline; don't fight forward/reverse engine force with huge Y pops
        body.applyForce(
          new CANNON.Vec3((dx / len) * 3500 * dt, 2500 * dt, (dz / len) * 3500 * dt),
        )
        body.angularVelocity.x *= 0.7
        body.angularVelocity.z *= 0.7
      }
    } else {
      this._stuckTime = Math.max(0, this._stuckTime - dt * 0.8)
    }

    // Auto-recover for permanent zero (also covers reverse stuck against a wall)
    const limit = noTraction ? 1.4 : 2.8
    if (this._stuckTime >= limit || (this._airTime || 0) > 2.2) {
      this.recoverCar()
    }
  }

  /**
   * Hard safety net for the walled corridor. The walls' inner face sits at half + 1.05 m and
   * the corridor is fully enclosed, so the chassis centre can never legitimately be further
   * than that from the centreline. If a violent hit (low FPS, wall-corner launch) ever pushes
   * it past half + 1.4 m, put it back just inside and drop the outward/upward velocity.
   * Does not touch engine force, top speed or audio.
   */
  _containCar(body) {
    const path = this.track?.path
    if (!path || !Number.isFinite(body.position.x)) return
    const N = path.length
    const half = (this.track.roadWidth || 12) / 2
    const px = body.position.x, pz = body.position.z
    let best = Infinity, cx = 0, cz = 0, cy = 0
    for (let j = 0; j < N; j++) {
      const p = path[j], q = path[(j + 1) % N]
      const ex = q.x - p.x, ez = q.z - p.z, L = ex * ex + ez * ez || 1
      const u = Math.max(0, Math.min(1, ((px - p.x) * ex + (pz - p.z) * ez) / L))
      const x = p.x + ex * u, z = p.z + ez * u
      const d = (px - x) ** 2 + (pz - z) ** 2
      if (d < best) { best = d; cx = x; cz = z; cy = (p.y || 0) + ((q.y || 0) - (p.y || 0)) * u }
    }
    const d = Math.sqrt(best)
    const limit = half + 1.4
    if (d <= limit && body.position.y < cy + 2.6) return
    const nx = (px - cx) / (d || 1), nz = (pz - cz) / (d || 1)
    if (d > limit) {
      const back = half + 0.4
      body.position.x = cx + nx * back
      body.position.z = cz + nz * back
      const vOut = body.velocity.x * nx + body.velocity.z * nz
      if (vOut > 0) { body.velocity.x -= nx * vOut; body.velocity.z -= nz * vOut }
    }
    if (body.position.y > cy + 1.8) {
      // Launched off a wall corner: bring it back down onto the road, not onto y=0
      body.position.y = cy + 1.15
      if (body.velocity.y > 0) body.velocity.y = 0
    }
  }

  _updateLaps() {
    const path = this.track.path
    const pos = this.car.getPosition()
    let bestI = 0
    let bestD = Infinity
    for (let i = 0; i < path.length; i++) {
      const dx = path[i].x - pos.x
      const dz = path[i].z - pos.z
      const d = dx * dx + dz * dz
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    }
    this._progress = bestI / path.length
    // Detect crossing start: wrap from high progress to low while moving forward
    if (this._lastProgress > 0.82 && this._progress < 0.18) {
      const lapTime = (performance.now() - this.lapStart) / 1000
      if (lapTime > 8) {
        // ignore tiny accidental wraps
        if (!this.bestLap || lapTime < this.bestLap) {
          this.bestLap = lapTime
          localStorage.setItem(bestKey(this.track.id), String(lapTime))
        }
        if (this.lap >= this.totalLaps) {
          this.state = 'finished'
          this.audio.silence()
          this.ui.showCountdown('META')
          this.audio.beep(990, 0.25)
          this.audio.music.stopLoop(0.4); this.audio.music.play('victoria')
          setTimeout(() => {
            this.ui.hideCountdown()
            this.pause()
            this.ui.setPauseTitle('Carrera terminada')
          }, 1400)
        } else {
          this.lap += 1
          this.audio.beep(720, 0.12)
          if (this.lap === this.totalLaps) this.audio.music.play('ultima_vuelta')
        }
        this.lapStart = performance.now()
      }
    }
    this._lastProgress = this._progress
  }

  _updateCamera() {
    if (!this.car) return
    const pos = this.car.mesh.position // pose interpolada (ver Car.update)
    const q = this.car.mesh.quaternion
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)

    if (this.cameraMode === 'hood') {
      // capo: cámara sobre el capó del modelo realista (fuera del parabrisas), pose interpolada y
      // cabeceo/balanceo/rebote suavizados con muelles críticamente amortiguados; el giro (yaw) va directo.
      const real = !!this.car.realModel
      const b = this.car.chassisBody, ip = b.interpolatedPosition, iq = b.interpolatedQuaternion
      const cq = new THREE.Quaternion(iq.x, iq.y, iq.z, iq.w)
      const e = new THREE.Euler().setFromQuaternion(cq, 'YXZ')
      const h = this._hood || (this._hood = { pitch: e.x, roll: e.z, y: ip.y, vp: 0, vr: 0, vy: 0, t: performance.now() })
      const now = performance.now(), dt = Math.min(0.05, Math.max(0.001, (now - h.t) / 1000)); h.t = now
      const spring = (x, v, target, w) => { const a = w * w * (target - x) - 2 * w * v; v += a * dt; return [x + v * dt, v] }
      ;[h.pitch, h.vp] = spring(h.pitch, h.vp, e.x * 0.6, 9)
      ;[h.roll, h.vr] = spring(h.roll, h.vr, e.z * 0.4, 9)
      ;[h.y, h.vy] = spring(h.y, h.vy, ip.y, 14)
      if (Math.abs(h.y - ip.y) > 1.5) { h.y = ip.y; h.vy = 0 } // recolocado / teletransporte
      const sq = new THREE.Quaternion().setFromEuler(new THREE.Euler(h.pitch, e.y, h.roll, 'YXZ'))
      const off = real ? new THREE.Vector3(0, 0.44, 1.2) : new THREE.Vector3(0, 0.55, 0.85)
      const hoodPos = off.applyQuaternion(sq).add(new THREE.Vector3(ip.x, h.y, ip.z))
      this._hideWindshield(true)
      this.camera.position.copy(hoodPos)
      this.camera.quaternion.copy(sq)
      this.camera.rotateX(0.06) // mirar un poco hacia abajo para ver la carretera y el capó
      this.camera.rotateY(Math.PI) // la cámara mira por -Z; el coche avanza por +Z
      this.camera.fov = 70
      this.camera.near = 0.05
    } else {
      this._hood = null
      this.camera.near = 0.1
      const back = forward.clone().multiplyScalar(-8).add(up.clone().multiplyScalar(3.2))
      const chasePos = new THREE.Vector3(pos.x, pos.y, pos.z).add(back)
      const look = new THREE.Vector3(pos.x, pos.y + 0.8, pos.z).add(forward.clone().multiplyScalar(6))
      this._hideWindshield(false)
      this.camera.position.lerp(chasePos, 0.12)
      this.camera.up.set(0, 1, 0)
      this.camera.lookAt(look)
      this.camera.fov = 60
    }
    this.camera.updateProjectionMatrix()

    // Keep daylight shadows centered on the car
    if (this.timeOfDay === 'day' && this.car) {
      const p = this.car.getPosition()
      this.sun.target.position.set(p.x, 0, p.z)
      this.sun.position.set(p.x + 70, 110, p.z + 45)
      this.sun.target.updateMatrixWorld()
    }
  }

  /** Hood cam: the camera sits inside the cabin, so hide our own windscreen (no tinted overlay). */
  _hideWindshield(hide) {
    if (!this.car || this._wsHidden === hide && this._wsCar === this.car) return
    this._wsHidden = hide; this._wsCar = this.car
    this.car.mesh.traverse((o) => { if (o.userData.windshield) o.visible = !hide })
  }

  _onResize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this._prMax = Math.min(window.devicePixelRatio || 1, 1.5)
    this._pr = Math.min(this._pr, this._prMax)
    this.renderer.setPixelRatio(this._pr)
    this.renderer.setSize(w, h)
  }
}


Object.assign(Game.prototype, RaceMixin)
