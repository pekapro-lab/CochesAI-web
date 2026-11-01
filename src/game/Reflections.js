import * as THREE from 'three'

/**
 * Outdoor reflection environments (generated once per time of day / quality, then cached).
 * A tiny scene — gradient sky, HDR sun (day) or moon + warm lamp glows (night), and a ground
 * disc — is pre-filtered with PMREM so car paint, glass and asphalt reflect the real sky.
 */
function gradTex(stops) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256
  const g = c.getContext('2d'), lg = g.createLinearGradient(0, 0, 0, 256)
  for (const [o, col] of stops) lg.addColorStop(o, col)
  g.fillStyle = lg; g.fillRect(0, 0, 4, 256)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

const cache = new Map()

export function skyEnvironment(renderer, mode, size = 256) {
  const key = mode + size
  if (cache.has(key)) return cache.get(key)
  const day = mode === 'day'
  const scene = new THREE.Scene()
  const tex = day
    ? gradTex([[0, '#3d8fe0'], [0.42, '#9ccaf2'], [0.5, '#eef5fc'], [0.53, '#9a948a'], [1, '#55524c']])
    : gradTex([[0, '#03060f'], [0.45, '#0c1426'], [0.5, '#2a2030'], [0.53, '#121318'], [1, '#08090c']])
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }))
  scene.add(sky)
  const blob = (color, scale, r, x, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(scale), fog: false }))
    m.position.set(x, y, z); scene.add(m); return m
  }
  if (day) {
    // matches the sun direction used by the DirectionalLight (+x, high, +z)
    blob(0xfff3d6, 40, 2.4, 26, 32, 16)
    blob(0xffffff, 1.6, 9, -30, 6, -25) // soft bright cloud bank for a broad highlight
  } else {
    blob(0xdde6ff, 6, 1.6, -30, 30, -15) // moon
    for (let i = 0; i < 14; i++) { // distant warm street lamps along the horizon
      const a = (i / 14) * Math.PI * 2
      blob(0xffc985, 18, 0.55, Math.cos(a) * 40, 4 + (i % 3), Math.sin(a) * 40)
    }
  }
  const pmrem = new THREE.PMREMGenerator(renderer)
  const rt = pmrem.fromScene(scene, 0.02, 0.1, 200, { size })
  pmrem.dispose()
  scene.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose() })
  cache.set(key, rt.texture)
  return rt.texture
}

let _wet = null
/** Roughness map for asphalt: mostly satin, with darker (smoother) damp patches and streaks. */
export function asphaltRoughness() {
  if (_wet) return _wet
  const c = document.createElement('canvas'); c.width = 128; c.height = 512
  const g = c.getContext('2d')
  g.fillStyle = 'rgb(165,165,165)'; g.fillRect(0, 0, 128, 512)
  let s = 7
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 128, y = rnd() * 512, r = 10 + rnd() * 34
    const rg = g.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, 'rgba(70,70,70,0.85)'); rg.addColorStop(1, 'rgba(70,70,70,0)')
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // racing line polish (two tyre tracks)
  g.fillStyle = 'rgba(110,110,110,0.5)'
  g.fillRect(34, 0, 14, 512); g.fillRect(80, 0, 14, 512)
  _wet = new THREE.CanvasTexture(c)
  _wet.wrapS = _wet.wrapT = THREE.RepeatWrapping
  return _wet
}

let _streak = null
/** Vertical light streak (lamp reflection on asphalt), additive. */
export function streakTexture() {
  if (_streak) return _streak
  const c = document.createElement('canvas'); c.width = 32; c.height = 256
  const g = c.getContext('2d')
  const h = g.createLinearGradient(0, 0, 32, 0)
  h.addColorStop(0, 'rgba(255,200,130,0)'); h.addColorStop(0.5, 'rgba(255,215,160,1)'); h.addColorStop(1, 'rgba(255,200,130,0)')
  g.fillStyle = h; g.fillRect(0, 0, 32, 256)
  g.globalCompositeOperation = 'destination-in'
  const v = g.createLinearGradient(0, 0, 0, 256)
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.35, 'rgba(0,0,0,0.9)'); v.addColorStop(0.5, 'rgba(0,0,0,1)'); v.addColorStop(0.65, 'rgba(0,0,0,0.9)'); v.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = v; g.fillRect(0, 0, 32, 256)
  _streak = new THREE.CanvasTexture(c); _streak.colorSpace = THREE.SRGBColorSpace
  return _streak
}

let _glow = null
export function glowTexture() {
  if (_glow) return _glow
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64)
  _glow = new THREE.CanvasTexture(c); _glow.colorSpace = THREE.SRGBColorSpace
  return _glow
}
