export class Input {
  constructor() {
    this.keys = Object.create(null)
    this.touch = { throttle: 0, brake: 0, steer: 0, handbrake: false }
    this._steerLeft = false
    this._steerRight = false
    this.onToggleCamera = null
    this.onPause = null
    this.onMute = null
    this.onRecover = null
    this._bound = false
  }

  bind() {
    if (this._bound) return
    this._bound = true
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
  }

  unbind() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    this._bound = false
    this.keys = Object.create(null)
  }

  _onKeyDown = (e) => {
    if (e.repeat) {
      this.keys[e.code] = true
      return
    }
    this.keys[e.code] = true
    if (e.code === 'KeyC') this.onToggleCamera?.()
    if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.()
    if (e.code === 'KeyM') this.onMute?.()
    if (e.code === 'KeyR') this.onRecover?.()
  }

  _onKeyUp = (e) => {
    this.keys[e.code] = false
  }

  setTouchSteer(left, right) {
    this._steerLeft = left
    this._steerRight = right
  }

  /** Analog steer from the virtual stick, -1..1 (+1 = left). */
  setTouchSteerAnalog(v) {
    this.touch.steer = Math.max(-1, Math.min(1, v || 0))
  }

  /** Keyboard + touch + gamepad, with smoothed keyboard steering (no more 0→100 % jerks). */
  getControls() {
    const k = this.keys
    const now = performance.now()
    const dt = Math.min(0.1, Math.max(0, (now - (this._lastT || now)) / 1000))
    this._lastT = now
    let throttle = 0, brake = 0, handbrake = false
    let kbSteer = 0
    if (k.KeyW || k.ArrowUp) throttle = 1
    if (k.KeyS || k.ArrowDown) brake = 1
    if (k.KeyA || k.ArrowLeft) kbSteer += 1
    if (k.KeyD || k.ArrowRight) kbSteer -= 1
    if (k.Space) handbrake = true
    // keyboard steer ramp: build up in ~0.22 s, return to centre faster
    this._kb = this._kb || 0
    const rate = kbSteer === 0 || Math.sign(kbSteer) !== Math.sign(this._kb) ? 9 : 4.5
    this._kb += Math.max(-rate * dt, Math.min(rate * dt, kbSteer - this._kb))
    if (Math.abs(this._kb) < 0.01 && kbSteer === 0) this._kb = 0
    let steer = this._kb

    throttle = Math.max(throttle, this.touch.throttle)
    brake = Math.max(brake, this.touch.brake)
    if (this._steerLeft) steer += 1
    if (this._steerRight) steer -= 1
    // touch stick: response curve (fine control near centre)
    const ts = this.touch.steer || 0
    steer += Math.sign(ts) * Math.pow(Math.abs(ts), this.touchCurve || 1.35)
    if (this.touch.handbrake) handbrake = true

    // gamepad (standard mapping): left stick, RT/LT, A or B = handbrake
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    for (const gp of pads || []) {
      if (!gp || !gp.connected) continue
      this.gamepadName = gp.id
      const ax = gp.axes[0] || 0
      const dz = 0.12
      const a = Math.abs(ax) < dz ? 0 : (Math.abs(ax) - dz) / (1 - dz) * Math.sign(ax)
      steer += -Math.sign(a) * Math.pow(Math.abs(a), 1.5)
      const b = (i) => gp.buttons[i] ? (gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0)) : 0
      throttle = Math.max(throttle, b(7), b(0) > 0.5 && !b(6) ? 0 : 0)
      brake = Math.max(brake, b(6))
      if (b(1) > 0.5 || b(2) > 0.5) handbrake = true
      if ((gp.axes[1] || 0) < -0.6) throttle = Math.max(throttle, 1)
      const st = b(9) > 0.5
      if (st && !this._padStart) this.onPause?.()
      this._padStart = st
      const y = b(3) > 0.5
      if (y && !this._padY) this.onToggleCamera?.()
      this._padY = y
      const rb = b(5) > 0.5
      if (rb && !this._padRB) this.onRecover?.()
      this._padRB = rb
    }

    steer = Math.max(-1, Math.min(1, steer))
    return { throttle: Math.min(1, throttle), brake: Math.min(1, brake), steer, handbrake }
  }
}
