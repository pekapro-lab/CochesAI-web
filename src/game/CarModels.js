import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * CochesAI v2 — car models, liveries, rims, spoilers and decals. Everything is made by code
 * (geometry + canvas textures). No real brands: all names/logos are invented.
 */

export const MODELS = [
  {
    id: 'rayo', name: 'Rayo GT', desc: 'Coupé GT equilibrado · V6 biturbo',
    dims: { w: 2.05, l: 4.55, h: 0.5, cabW: 1.72, cabH: 0.56, cabL: 1.9, cabZ: -0.25, wedge: 0.08, taper: 0.82, hoodH: 0.16 },
    stats: { accel: 1.0, grip: 1.0, mass: 980, susp: 42, drift: 1.0 },
    sound: { cyl: 6, idle: 900, redline: 7600, tone: 1.0, sub: 0.35, rough: 0.25, noise: 0.15, turbo: 0.35, pops: 0.3, bright: 1.0 },
    defaults: { paint: '#e8231e', finish: 'metal', rims: 'radios', rimColor: '#c8ccd4', spoiler: 'gt', vinyl: 'rayas', vinylColor: '#ffffff', sticker: 'rayo', number: 7 },
  },
  {
    id: 'toro', name: 'Toro V8', desc: 'Muscle car · V8 de 6,2 L, empuje bestial',
    dims: { w: 2.1, l: 4.7, h: 0.58, cabW: 1.6, cabH: 0.5, cabL: 1.6, cabZ: -0.55, wedge: 0.02, taper: 0.9, hoodH: 0.2, muscle: true, rearTyre: 1.4 },
    stats: { accel: 1.18, grip: 0.92, mass: 1120, susp: 38, drift: 1.25 },
    sound: { cyl: 8, idle: 750, redline: 6400, tone: 0.8, sub: 0.6, rough: 0.55, noise: 0.22, turbo: 0, pops: 0.6, bright: 0.7, lope: 0.35 },
    defaults: { paint: '#a3121b', finish: 'metal', rims: 'estrella', rimColor: '#c8ccd4', spoiler: 'labio', vinyl: 'ninguno', vinylColor: '#ffffff', sticker: 'estrella', number: 69 },
  },
  {
    id: 'neon', name: 'Neón X', desc: 'Hiperdeportivo · V12 atmosférico agudo',
    dims: { w: 2.1, l: 4.6, h: 0.42, cabW: 1.5, cabH: 0.44, cabL: 1.7, cabZ: 0.05, wedge: 0.16, taper: 0.72, hoodH: 0.08, fins: true, intakes: true },
    stats: { accel: 1.1, grip: 1.12, mass: 940, susp: 50, drift: 0.85 },
    sound: { cyl: 12, idle: 1100, redline: 9200, tone: 1.4, sub: 0.18, rough: 0.12, noise: 0.1, turbo: 0, pops: 0.15, bright: 1.6 },
    defaults: { paint: '#21e6a8', finish: 'perla', rims: 'malla', rimColor: '#111114', spoiler: 'ala', vinyl: 'llamas', vinylColor: '#ff2bd6', sticker: 'ai', number: 12 },
  },
  {
    id: 'brinco', name: 'Brinco R', desc: 'Compacto de rally · 4 cilindros turbo con petardeo',
    dims: { w: 1.98, l: 4.2, h: 0.56, cabW: 1.76, cabH: 0.66, cabL: 2.2, cabZ: -0.45, wedge: 0.05, taper: 0.88, hoodH: 0.12, hatch: true, roofScoop: true },
    stats: { accel: 0.95, grip: 1.08, mass: 900, susp: 34, drift: 1.15 },
    sound: { cyl: 4, idle: 950, redline: 7800, tone: 1.15, sub: 0.25, rough: 0.35, noise: 0.25, turbo: 0.8, pops: 1.0, bright: 1.2 },
    defaults: { paint: '#f4f4f0', finish: 'brillo', rims: 'disco', rimColor: '#ffd21a', spoiler: 'ala', vinyl: 'cuadros', vinylColor: '#e8231e', sticker: 'calavera', number: 33 },
  },
  {
    id: 'roca', name: 'Roca Bóxer', desc: 'Clásico ancho · bóxer de 6, sonido ronco',
    dims: { w: 2.1, l: 4.45, h: 0.54, cabW: 1.6, cabH: 0.6, cabL: 1.75, cabZ: -0.3, wedge: 0.1, taper: 0.7, hoodH: 0.1, round: true, ducktail: true },
    stats: { accel: 1.02, grip: 1.04, mass: 1000, susp: 44, drift: 1.05 },
    sound: { cyl: 6, idle: 850, redline: 8400, tone: 0.95, sub: 0.4, rough: 0.45, noise: 0.18, turbo: 0.15, pops: 0.45, bright: 1.1, lope: 0.15 },
    defaults: { paint: '#ff8a1a', finish: 'brillo', rims: 'radios', rimColor: '#dfe3ea', spoiler: 'ninguno', vinyl: 'franja', vinylColor: '#151515', sticker: 'corona', number: 911 % 100 },
  },
]
export const MODEL_BY_ID = Object.fromEntries(MODELS.map((m) => [m.id, m]))

export const FINISHES = [
  { id: 'metal', name: 'Metalizado', metalness: 0.75, roughness: 0.32, clearcoat: 1, ccr: 0.06, flake: true },
  { id: 'perla', name: 'Perlado', metalness: 0.45, roughness: 0.25, clearcoat: 1, ccr: 0.04, flake: true, sheen: true },
  { id: 'brillo', name: 'Brillo', metalness: 0.05, roughness: 0.38, clearcoat: 1, ccr: 0.03 },
  { id: 'mate', name: 'Mate', metalness: 0.1, roughness: 0.78, clearcoat: 0, ccr: 0.6 },
  { id: 'cromo', name: 'Espejo', metalness: 1, roughness: 0.08, clearcoat: 1, ccr: 0.02 },
]
export const RIMS = [
  { id: 'radios', name: '5 radios' }, { id: 'malla', name: 'Malla' }, { id: 'disco', name: 'Disco' }, { id: 'estrella', name: 'Estrella' }, { id: 'turbina', name: 'Turbina' },
]
export const SPOILERS = [
  { id: 'ninguno', name: 'Sin alerón', down: 0 }, { id: 'labio', name: 'Labio', down: 0.4 }, { id: 'gt', name: 'GT', down: 0.8 }, { id: 'ala', name: 'Ala alta', down: 1.0 },
]
export const VINYLS = [
  { id: 'ninguno', name: 'Liso' }, { id: 'rayas', name: 'Rayas racing' }, { id: 'doble', name: 'Doble franja' }, { id: 'franja', name: 'Franja lateral' },
  { id: 'llamas', name: 'Llamas' }, { id: 'cuadros', name: 'Cuadros' }, { id: 'ondas', name: 'Ondas' }, { id: 'camo', name: 'Camuflaje' },
]
export const STICKERS = [
  { id: 'ninguno', name: 'Ninguna' }, { id: 'rayo', name: 'Rayo' }, { id: 'estrella', name: 'Estrella' }, { id: 'calavera', name: 'Calavera' },
  { id: 'ai', name: 'AI' }, { id: 'corona', name: 'Corona' }, { id: 'peka', name: 'Peka' },
]
export const PAINTS = ['#e8231e', '#ff8a1a', '#ffd21a', '#33c46a', '#21e6a8', '#2f7bff', '#1c3fae', '#b06cff', '#ff2bd6', '#f4f4f0', '#8a8f98', '#151515']
// Invented sponsors (no real trademarks)
const SPONSORS = ['PEKAPRO', 'TURBOFRITO', 'CHISPA OIL', 'NEUMÁTICOS PK', 'AI MOTOR', 'VOLTA', 'BRINCO TV']

export function defaultConfig(modelId = 'rayo') {
  const m = MODEL_BY_ID[modelId] || MODELS[0]
  return { model: m.id, ...m.defaults }
}

const LS_KEY = 'cochesai-garaje-v2'
export function loadGarage() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (raw && MODEL_BY_ID[raw.model]) return { ...defaultConfig(raw.model), ...raw }
  } catch { /* ignore */ }
  return defaultConfig('rayo')
}
export function saveGarage(cfg) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
}

/** Livery for rivals: model by slot, their colour, a random vinyl/number. */
export function botConfig(k, color) {
  const m = MODELS[(k + 1) % MODELS.length]
  const hex = '#' + (color ?? 0xffffff).toString(16).padStart(6, '0')
  const v = VINYLS[1 + (k * 3) % (VINYLS.length - 1)].id
  const s = STICKERS[1 + (k * 2) % (STICKERS.length - 1)].id
  return { ...defaultConfig(m.id), paint: hex, vinyl: v, vinylColor: k % 2 ? '#ffffff' : '#111111', sticker: s, number: 10 + k * 7 }
}

// ---------- canvas helpers ----------
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
function rng(seed) { let s = seed || 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }
function shade(hex, k) {
  const c = new THREE.Color(hex)
  if (k > 0) c.lerp(new THREE.Color(1, 1, 1), k); else c.multiplyScalar(1 + k)
  return '#' + c.getHexString()
}

const _cache = new Map()
function cached(key, fn) { if (!_cache.has(key)) _cache.set(key, fn()); return _cache.get(key) }

/** Body paint + vinyl texture. RoundedBox UVs map each face 0..1, so the pattern reads on every panel. */
export function liveryTexture(cfg) {
  const key = `liv|${cfg.paint}|${cfg.vinyl}|${cfg.vinylColor}|${cfg.finish}`
  return cached(key, () => {
    const W = 512, H = 256
    const c = makeCanvas(W, H), g = c.getContext('2d')
    const r = rng(11)
    // base with a soft vertical gradient (reads as curvature)
    const grd = g.createLinearGradient(0, 0, 0, H)
    grd.addColorStop(0, shade(cfg.paint, 0.18)); grd.addColorStop(0.5, cfg.paint); grd.addColorStop(1, shade(cfg.paint, -0.35))
    g.fillStyle = grd; g.fillRect(0, 0, W, H)
    const finish = FINISHES.find((f) => f.id === cfg.finish) || FINISHES[0]
    if (finish.flake) {
      for (let i = 0; i < 5000; i++) {
        const a = r() * 0.35
        g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 0.6})`
        g.fillRect(r() * W, r() * H, 1, 1)
      }
    }
    const vc = cfg.vinylColor || '#ffffff'
    g.fillStyle = vc; g.strokeStyle = vc
    switch (cfg.vinyl) {
      case 'rayas':
        g.fillRect(W * 0.38, 0, W * 0.09, H); g.fillRect(W * 0.53, 0, W * 0.09, H); break
      case 'doble':
        g.fillRect(0, H * 0.3, W, H * 0.1); g.fillRect(0, H * 0.48, W, H * 0.1); g.fillRect(W * 0.4, 0, W * 0.2, H); break
      case 'franja': {
        g.beginPath(); g.moveTo(0, H * 0.55); g.lineTo(W, H * 0.35); g.lineTo(W, H * 0.47); g.lineTo(0, H * 0.67); g.fill(); break
      }
      case 'llamas': {
        for (let k = 0; k < 9; k++) {
          const y = H * 0.25 + k * H * 0.06
          g.beginPath(); g.moveTo(0, y)
          const len = W * (0.45 + r() * 0.45)
          g.bezierCurveTo(len * 0.4, y - 30, len * 0.7, y + 25, len, y - 8)
          g.bezierCurveTo(len * 0.7, y + 18, len * 0.35, y + 30, 0, y + 22)
          g.fill()
        }
        g.fillStyle = shade(vc, 0.5)
        for (let k = 0; k < 6; k++) { const y = H * 0.35 + k * H * 0.06; g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(W * 0.25, y - 10, W * (0.3 + r() * 0.2), y + 2); g.quadraticCurveTo(W * 0.2, y + 10, 0, y + 9); g.fill() }
        break
      }
      case 'cuadros': {
        const s = 32
        for (let y = 0; y < H; y += s) for (let x = W * 0.55; x < W; x += s) if (((x / s) + (y / s)) % 2 < 1) g.fillRect(x, y, s, s)
        break
      }
      case 'ondas':
        g.lineWidth = 14
        for (let k = 0; k < 3; k++) { g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, H * (0.3 + k * 0.18) + Math.sin(x / 40 + k) * 16); g.stroke() }
        break
      case 'camo': {
        const cols = [vc, shade(cfg.paint, -0.45), shade(vc, -0.4)]
        for (let i = 0; i < 70; i++) {
          g.fillStyle = cols[i % 3]; g.beginPath()
          const x = r() * W, y = r() * H, rad = 12 + r() * 30
          for (let a = 0; a < 6.28; a += 0.8) g.lineTo(x + Math.cos(a) * rad * (0.6 + r() * 0.6), y + Math.sin(a) * rad * (0.6 + r() * 0.6))
          g.fill()
        }
        break
      }
      default: break
    }
    return tex(c)
  })
}

function drawSticker(g, id, cx, cy, s, col) {
  g.save(); g.translate(cx, cy); g.fillStyle = col; g.strokeStyle = '#111'; g.lineWidth = s * 0.06
  switch (id) {
    case 'rayo':
      g.beginPath(); g.moveTo(s * 0.1, -s * 0.5); g.lineTo(-s * 0.3, s * 0.08); g.lineTo(-s * 0.02, s * 0.08); g.lineTo(-s * 0.15, s * 0.5); g.lineTo(s * 0.32, -s * 0.12); g.lineTo(s * 0.04, -s * 0.12); g.closePath(); g.fill(); g.stroke(); break
    case 'estrella':
      g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * 0.2 : s * 0.48; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) } g.closePath(); g.fill(); g.stroke(); break
    case 'calavera':
      g.beginPath(); g.arc(0, -s * 0.08, s * 0.34, 0, Math.PI * 2); g.fill(); g.fillRect(-s * 0.18, s * 0.15, s * 0.36, s * 0.2)
      g.fillStyle = '#111'; g.beginPath(); g.arc(-s * 0.13, -s * 0.1, s * 0.09, 0, 7); g.arc(s * 0.13, -s * 0.1, s * 0.09, 0, 7); g.fill()
      for (let i = -1; i <= 1; i++) g.fillRect(i * s * 0.1 - s * 0.02, s * 0.18, s * 0.04, s * 0.15); break
    case 'ai':
      g.font = `900 ${s * 0.6}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = s * 0.08; g.strokeText('AI', 0, 0); g.fillText('AI', 0, 0); break
    case 'corona':
      g.beginPath(); g.moveTo(-s * 0.4, s * 0.25); g.lineTo(-s * 0.4, -s * 0.25); g.lineTo(-s * 0.2, 0); g.lineTo(0, -s * 0.35); g.lineTo(s * 0.2, 0); g.lineTo(s * 0.4, -s * 0.25); g.lineTo(s * 0.4, s * 0.25); g.closePath(); g.fill(); g.stroke(); break
    case 'peka':
      g.beginPath(); g.arc(0, 0, s * 0.45, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#111'; g.font = `900 ${s * 0.5}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', 0, s * 0.03); break
    default: break
  }
  g.restore()
}

/** Door panel: race number roundel + invented sponsor + sticker. */
function doorTexture(cfg, seed) {
  const key = `door|${cfg.number}|${cfg.sticker}|${cfg.vinylColor}|${seed}`
  return cached(key, () => {
    const W = 512, H = 192, c = makeCanvas(W, H), g = c.getContext('2d')
    g.clearRect(0, 0, W, H)
    // number roundel
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(120, 96, 80, 78, 0, 0, 7); g.fill()
    g.lineWidth = 8; g.strokeStyle = '#111'; g.stroke()
    g.fillStyle = '#111'; g.font = '900 96px system-ui, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(String(cfg.number ?? 7).slice(0, 3), 120, 100)
    // sponsor
    const sp = SPONSORS[seed % SPONSORS.length]
    g.font = 'italic 900 40px system-ui, sans-serif'; g.textAlign = 'left'
    g.lineWidth = 7; g.strokeStyle = '#111'; g.strokeText(sp, 220, 70)
    g.fillStyle = '#ffe14a'; g.fillText(sp, 220, 70)
    g.font = '700 22px system-ui, sans-serif'; g.fillStyle = '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 4
    g.strokeText('COCHES·AI RACING', 222, 112); g.fillText('COCHES·AI RACING', 222, 112)
    if (cfg.sticker && cfg.sticker !== 'ninguno') drawSticker(g, cfg.sticker, 440, 150, 70, cfg.vinylColor || '#ffd21a')
    return tex(c)
  })
}
function hoodTexture(cfg, seed) {
  const key = `hood|${cfg.sticker}|${cfg.number}|${seed}`
  return cached(key, () => {
    const W = 256, H = 256, c = makeCanvas(W, H), g = c.getContext('2d')
    g.clearRect(0, 0, W, H)
    // emblem: invented shield logo
    g.fillStyle = '#111'; g.beginPath(); g.moveTo(128, 30); g.lineTo(200, 60); g.lineTo(188, 150); g.lineTo(128, 200); g.lineTo(68, 150); g.lineTo(56, 60); g.closePath(); g.fill()
    g.fillStyle = '#e8c45a'; g.beginPath(); g.moveTo(128, 44); g.lineTo(186, 68); g.lineTo(176, 145); g.lineTo(128, 186); g.lineTo(80, 145); g.lineTo(70, 68); g.closePath(); g.fill()
    g.fillStyle = '#111'; g.font = '900 74px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('C', 128, 112)
    g.font = '800 26px system-ui, sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 5
    const sp = SPONSORS[(seed + 2) % SPONSORS.length]
    g.strokeText(sp, 128, 232); g.fillText(sp, 128, 232)
    return tex(c)
  })
}
function plateTexture(text) {
  return cached('plate|' + text, () => {
    const c = makeCanvas(256, 64), g = c.getContext('2d')
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, 256, 64)
    g.fillStyle = '#1f47c8'; g.fillRect(0, 0, 34, 64)
    g.fillStyle = '#ffd21a'; g.font = '700 14px sans-serif'; g.textAlign = 'center'; g.fillText('PK', 17, 52)
    g.fillStyle = '#111'; g.font = '800 40px monospace'; g.fillText(text, 145, 46)
    g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 253, 61)
    return tex(c)
  })
}

export function rimTexture(style, color) {
  return cached(`rim|${style}|${color}`, () => {
    const c = makeCanvas(128, 128), g = c.getContext('2d')
    g.fillStyle = '#0d0d0f'; g.fillRect(0, 0, 128, 128)
    g.translate(64, 64)
    const dark = '#141518'
    g.fillStyle = color; g.beginPath(); g.arc(0, 0, 52, 0, 7); g.fill()
    if (style === 'radios' || style === 'estrella') {
      const n = style === 'radios' ? 5 : 6
      g.fillStyle = dark
      for (let k = 0; k < n; k++) {
        g.rotate((Math.PI * 2) / n); g.beginPath()
        if (style === 'radios') { g.moveTo(12, -7); g.lineTo(47, -17); g.lineTo(47, 17); g.lineTo(12, 7) } else { g.moveTo(10, -3); g.lineTo(48, -14); g.lineTo(48, 0); g.lineTo(10, 3) }
        g.fill()
      }
    } else if (style === 'malla') {
      g.strokeStyle = dark; g.lineWidth = 3
      for (let k = 0; k < 12; k++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(10, 0); g.quadraticCurveTo(30, 18, 50, 0); g.stroke(); g.beginPath(); g.moveTo(10, 0); g.quadraticCurveTo(30, -18, 50, 0); g.stroke() }
    } else if (style === 'disco') {
      const gr = g.createRadialGradient(-12, -12, 4, 0, 0, 52); gr.addColorStop(0, shade(color, 0.5)); gr.addColorStop(1, shade(color, -0.3))
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 50, 0, 7); g.fill()
      g.fillStyle = dark; for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.arc(30, 0, 6, 0, 7); g.fill() }
    } else if (style === 'turbina') {
      g.fillStyle = dark
      for (let k = 0; k < 14; k++) { g.rotate((Math.PI * 2) / 14); g.beginPath(); g.moveTo(14, 0); g.quadraticCurveTo(34, 10, 48, 2); g.lineTo(48, 8); g.quadraticCurveTo(32, 16, 14, 4); g.fill() }
    }
    g.fillStyle = shade(color, 0.3); g.beginPath(); g.arc(0, 0, 10, 0, 7); g.fill()
    g.fillStyle = '#e8231e'; g.font = '900 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('C', 0, 0)
    g.strokeStyle = shade(color, 0.4); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 51, 0, 7); g.stroke()
    return tex(c)
  })
}
const treadTex = () => cached('tread', () => {
  const c = makeCanvas(64, 256), g = c.getContext('2d')
  g.fillStyle = '#141414'; g.fillRect(0, 0, 64, 256)
  g.strokeStyle = '#050505'; g.lineWidth = 5
  for (let y = 0; y < 256; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(32, y + 8); g.lineTo(64, y); g.stroke() }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t
})
const carbonTex = () => cached('carbon', () => {
  const c = makeCanvas(64, 64), g = c.getContext('2d')
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) {
    const odd = ((x + y) / 8) % 2
    const grd = odd ? g.createLinearGradient(x, y, x + 8, y) : g.createLinearGradient(x, y, x, y + 8)
    grd.addColorStop(0, '#1c1c20'); grd.addColorStop(0.5, '#34343a'); grd.addColorStop(1, '#16161a')
    g.fillStyle = grd; g.fillRect(x, y, 8, 8)
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); return t
})

// ---------- geometry helpers ----------
function wedge(geo, len, drop) {
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); if (y > 0) p.setY(i, y - Math.max(0, z / (len / 2)) * drop) }
  geo.computeVertexNormals()
}
function taperTop(geo, k) {
  const p = geo.attributes.position
  geo.computeBoundingBox()
  const { min, max } = geo.boundingBox
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - min.y) / (max.y - min.y), s = 1 - (1 - k) * t
    p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * (1 - (1 - k) * 0.6 * t))
  }
  geo.computeVertexNormals()
}

/** Tyre + rim group (visual only). */
export function buildWheel(cfg) {
  const g = new THREE.Group()
  const tyreGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 24, 1, true); tyreGeo.rotateZ(Math.PI / 2)
  const tyre = new THREE.Mesh(tyreGeo, new THREE.MeshStandardMaterial({ map: treadTex(), roughness: 0.9, metalness: 0, side: THREE.DoubleSide }))
  tyre.castShadow = true
  g.add(tyre)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 })
  const sideGeo = new THREE.TorusGeometry(0.3, 0.08, 8, 24)
  for (const sx of [-0.12, 0.12]) { const w = new THREE.Mesh(sideGeo, wallMat); w.rotation.y = Math.PI / 2; w.position.x = sx; g.add(w) }
  const rimMat = new THREE.MeshStandardMaterial({ map: rimTexture(cfg.rims || 'radios', cfg.rimColor || '#c8ccd4'), metalness: 0.9, roughness: 0.22 })
  for (const sx of [-0.141, 0.141]) {
    const rim = new THREE.Mesh(new THREE.CircleGeometry(0.29, 24), rimMat)
    rim.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2; rim.position.x = sx; g.add(rim)
  }
  // brake caliper (doesn't rotate visually with the wheel, but adds colour)
  return g
}

function decalMat(map) {
  return new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false })
}

/**
 * Builds the visual car. Returns handles Car.js uses (bodyMat, headlights, scanner…).
 * Physics are independent — the mesh stays within the ~2.1 × 4.6 m envelope.
 */
export function buildCarMesh(cfg, { seed = 0 } = {}) {
  const m = MODEL_BY_ID[cfg.model] || MODELS[0]
  const d = m.dims
  const root = new THREE.Group()
  const finish = FINISHES.find((f) => f.id === cfg.finish) || FINISHES[0]
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: liveryTexture(cfg), metalness: finish.metalness, roughness: finish.roughness,
    clearcoat: finish.clearcoat, clearcoatRoughness: finish.ccr, envMapIntensity: 1.2,
  })
  if (finish.sheen) { bodyMat.sheen = 1; bodyMat.sheenColor = new THREE.Color(cfg.vinylColor || '#ffffff'); bodyMat.sheenRoughness = 0.35 }
  const plainMat = new THREE.MeshPhysicalMaterial({ color: cfg.paint, metalness: finish.metalness, roughness: finish.roughness, clearcoat: finish.clearcoat, clearcoatRoughness: finish.ccr })
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.4, map: carbonTex() })
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0d1622, metalness: 0.2, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.82, envMapIntensity: 1.6 })
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 1, roughness: 0.12 })
  const add = (mesh, shadow = true) => { mesh.castShadow = shadow; root.add(mesh); return mesh }

  let top, hood
  if (d.muscle) ({ top, hood } = buildMuscle(d, { bodyMat, trimMat, glassMat, chromeMat, add }))
  else {
  // lower body
  const lowerGeo = new RoundedBoxGeometry(d.w, d.h, d.l, 4, d.boxy ? 0.12 : d.round ? 0.24 : 0.2)
  wedge(lowerGeo, d.l, d.wedge)
  const body = add(new THREE.Mesh(lowerGeo, bodyMat)); body.position.y = 0.05 + (d.h - 0.5) / 2

  top = 0.05 + d.h - 0.25 // y of the body's top surface (approx.)
  // hood
  const hoodL = d.hatch ? 1.2 : d.boxy ? 1.9 : 1.6
  hood = add(new THREE.Mesh(new RoundedBoxGeometry(d.w * 0.86, d.hoodH, hoodL, 3, Math.min(0.07, d.hoodH / 2 - 0.01)), bodyMat))
  hood.position.set(0, top + d.hoodH / 2 - 0.04, d.l / 2 - hoodL / 2 - 0.35)
  hood.rotation.x = 0.04 + d.wedge * 0.3
  if (d.scoop) {
    const sc = add(new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.16, 0.8, 2, 0.05), trimMat)); sc.position.set(0, top + d.hoodH + 0.02, 1.15)
  }
  // arches
  for (const x of [-1, 1]) for (const z of [1.38, -1.38]) {
    const fl = add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), plainMat))
    fl.scale.set(d.round ? 0.34 : 0.26, d.boxy ? 0.36 : 0.46, 0.98)
    fl.position.set(x * (d.w / 2 - 0.1), 0.14 + (d.h - 0.5) * 0.6, z)
  }
  // cabin
  const cabGeo = new RoundedBoxGeometry(d.cabW, d.cabH, d.cabL, 4, d.boxy ? 0.14 : 0.24)
  taperTop(cabGeo, d.taper)
  const cabin = add(new THREE.Mesh(cabGeo, plainMat)); cabin.position.set(0, top + d.cabH / 2 - 0.02, d.cabZ)
  const cy = top + d.cabH * 0.55
  const ws = add(new THREE.Mesh(new RoundedBoxGeometry(d.cabW * 0.88, d.cabH * 0.9, 0.06, 2, 0.03), glassMat), false)
  ws.position.set(0, cy, d.cabZ + d.cabL / 2 + 0.02); ws.rotation.x = d.boxy ? -0.45 : -0.65
  const rg = add(new THREE.Mesh(new RoundedBoxGeometry(d.cabW * 0.8, d.cabH * 0.75, 0.06, 2, 0.03), glassMat), false)
  rg.position.set(0, cy, d.cabZ - d.cabL / 2 - 0.02); rg.rotation.x = d.hatch ? 0.25 : 0.6
  for (const x of [-1, 1]) {
    const sg = add(new THREE.Mesh(new RoundedBoxGeometry(0.05, d.cabH * 0.6, d.cabL * 0.7, 2, 0.02), glassMat), false)
    sg.position.set(x * (d.cabW / 2) * (1 - (1 - d.taper) * 0.5), cy, d.cabZ)
    const mir = add(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.12, 0.26, 2, 0.05), bodyMat))
    mir.position.set(x * (d.w / 2 + 0.02), top + 0.12, d.cabZ + d.cabL / 2 - 0.1)
  }
  if (d.roofScoop) { const rs = add(new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.1, 0.5, 2, 0.04), trimMat)); rs.position.set(0, top + d.cabH + 0.02, d.cabZ + 0.4) }
  if (d.fins) for (const x of [-0.45, 0.45]) { const f = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 1.2), plainMat)); f.position.set(x, top + 0.12, d.cabZ - d.cabL / 2 - 0.5) }
  if (d.intakes) for (const x of [-1, 1]) { const it = add(new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.24, 0.8, 2, 0.02), trimMat)); it.position.set(x * (d.w / 2 + 0.005), 0.12, -0.75) }
  if (d.ducktail) { const dt = add(new THREE.Mesh(new RoundedBoxGeometry(d.w * 0.8, 0.08, 0.4, 2, 0.03), plainMat)); dt.position.set(0, top + 0.04, -d.l / 2 + 0.25); dt.rotation.x = -0.25 }

  }
  // bumpers, skirts, splitter, diffuser
  if (!d.muscle) {
  const fb = add(new THREE.Mesh(new RoundedBoxGeometry(d.w * 0.98, 0.22, 0.32, 3, 0.1), trimMat)); fb.position.set(0, -0.06, d.l / 2 - 0.1)
  const rb = add(new THREE.Mesh(new RoundedBoxGeometry(d.w * 0.98, 0.24, 0.3, 3, 0.1), trimMat)); rb.position.set(0, -0.04, -d.l / 2 + 0.08)
  }
  for (const x of [-1, 1]) { const sk = add(new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.12, 2.0, 2, 0.04), trimMat)); sk.position.set(x * (d.w / 2 + 0.01), -0.17, 0) }
  // exhaust tips
  const exN = m.sound.cyl >= 8 ? 2 : 1
  for (let i = 0; i < exN * 2; i++) {
    const side = i < exN ? -1 : 1
    const ex = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.2, 12, 1, true), chromeMat), false)
    ex.rotation.x = Math.PI / 2; ex.position.set(side * (0.5 + (i % exN) * 0.16), -0.12, -d.l / 2 - 0.02)
  }

  // spoiler
  const sp = cfg.spoiler || 'ninguno'
  const rearTop = top + (d.hatch ? d.cabH - 0.05 : 0.02)
  if (sp === 'labio') {
    const lip = add(new THREE.Mesh(new RoundedBoxGeometry(d.w * 0.86, 0.06, 0.22, 2, 0.02), trimMat)); lip.position.set(0, rearTop + 0.04, -d.l / 2 + 0.2); lip.rotation.x = -0.3
  } else if (sp === 'gt' || sp === 'ala') {
    const hi = sp === 'ala' ? 0.5 : 0.3
    const zz = d.hatch ? d.cabZ - d.cabL / 2 + 0.05 : -d.l / 2 + 0.35
    const wing = add(new THREE.Mesh(new RoundedBoxGeometry(sp === 'ala' ? 1.95 : 1.8, 0.06, sp === 'ala' ? 0.46 : 0.38, 2, 0.03), trimMat))
    wing.position.set(0, rearTop + hi, zz); wing.rotation.x = -0.08
    for (const x of [-0.7, 0.7]) { const st = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, hi, 0.14), trimMat)); st.position.set(x, rearTop + hi / 2, zz) }
    if (sp === 'ala') for (const x of [-0.98, 0.98]) { const ep = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.5), plainMat)); ep.position.set(x, rearTop + hi, zz) }
  }

  // decals: doors, hood emblem, plates
  const door = decalMat(doorTexture(cfg, seed))
  for (const x of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.62), door)
    p.position.set(x * (d.w / 2 + (d.muscle ? 0.072 : 0.012)), d.muscle ? 0.1 : 0.08 + (d.h - 0.5) * 0.5, d.muscle ? 0.1 : -0.15)
    if (d.muscle) p.scale.set(0.85, 0.85, 1)
    p.rotation.y = x * Math.PI / 2
    root.add(p)
  }
  const hm = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), decalMat(hoodTexture(cfg, seed)))
  hm.rotation.x = -Math.PI / 2 + hood.rotation.x; hm.position.set(0, hood.position.y + d.hoodH / 2 + 0.012, hood.position.z + 0.1)
  root.add(hm)
  const pm = new THREE.MeshStandardMaterial({ map: plateTexture(`${String(cfg.number ?? 7).padStart(2, '0')}-${m.id.slice(0, 3).toUpperCase()}`), roughness: 0.5 })
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.13), pm); pf.position.set(0, -0.02, d.l / 2 + 0.065); root.add(pf)
  const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.13), pm); pr.position.set(0, 0.12, -d.l / 2 - 0.08); pr.rotation.y = Math.PI; root.add(pr)

  // lights
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffe9a8, emissiveIntensity: 1.4 })
  const headLightMeshes = []
  if (d.muscle) {
    for (const x of [-0.82, -0.56, 0.56, 0.82]) {
      const hl = new THREE.Mesh(new THREE.CircleGeometry(0.1, 18), lightMat.clone())
      hl.position.set(x, 0.2, d.l / 2 + 0.012); root.add(hl); headLightMeshes.push(hl)
      const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 18), chromeMat); bezel.position.copy(hl.position); root.add(bezel)
    }
  } else for (const x of [-0.68, 0.68]) {
    const hl = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 10), lightMat.clone())
    hl.rotation.z = Math.PI / 2; hl.position.set(x, 0.14, d.l / 2 - 0.02); root.add(hl); headLightMeshes.push(hl)
  }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xaa0000, emissive: 0xff0000, emissiveIntensity: 0.7 })
  for (const x of d.muscle ? [-0.6, -0.2, 0.2, 0.6] : [-0.72, 0.72]) {
    const tl = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, d.muscle ? 0.26 : 0.36, 4, 10), tailMat)
    tl.rotation.z = Math.PI / 2; tl.position.set(x, 0.22, -d.l / 2 - 0.03); root.add(tl)
  }
  // LED scanner bar (CochesAI signature)
  const scannerGroup = new THREE.Group(); scannerGroup.position.set(0, d.muscle ? -0.05 : 0.28, d.l / 2 + (d.muscle ? 0.08 : -0.1))
  if (d.muscle) scannerGroup.scale.set(0.7, 0.6, 1)
  const barGeo = new THREE.BoxGeometry(0.14, 0.06, 0.06)
  const scannerLeds = []
  for (let i = 0; i < 11; i++) {
    const led = new THREE.Mesh(barGeo, new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff0000, emissiveIntensity: 0.05 }))
    led.position.x = (i - 5) * 0.16; scannerGroup.add(led); scannerLeds.push(led)
  }
  root.add(scannerGroup)

  const headLightL = new THREE.SpotLight(0xfff0d0, 2.2, 55, Math.PI / 4.5, 0.5, 1)
  const headLightR = new THREE.SpotLight(0xfff0d0, 2.2, 55, Math.PI / 4.5, 0.5, 1)
  headLightL.position.set(-0.7, 0.2, d.l / 2 + 0.1); headLightR.position.set(0.7, 0.2, d.l / 2 + 0.1)
  headLightL.target.position.set(-0.9, 0, 16); headLightR.target.position.set(0.9, 0, 16)
  root.add(headLightL, headLightL.target, headLightR, headLightR.target)
  const scannerLight = new THREE.PointLight(0xff1a1a, 1.8, 8, 2); scannerLight.position.set(0, 0.35, d.l / 2); root.add(scannerLight)

  return { root, bodyMat, hood, headLightMeshes, scannerLeds, scannerGroup, headLightL, headLightR, scannerLight, model: m }
}

/**
 * Classic muscle-car body: extruded side profile (long flat hood, short rear deck, fastback roof),
 * coke-bottle waist with rear haunches, squared nose with grille, chrome bumpers, hood scoop.
 */
function buildMuscle(d, { bodyMat, trimMat, glassMat, chromeMat, add }) {
  const L = d.l, W = d.w, hl = L / 2
  // side profile in (z, y): front at +hl
  const sh = new THREE.Shape()
  const pts = [
    [hl, -0.2], [hl, 0.32], [hl - 0.06, 0.4], // squared nose
    [0.75, 0.45], // long flat hood to the cowl
    [0.6, 0.47], [0.05, 0.96], // windscreen
    [-0.55, 0.98], // roof
    [-1.75, 0.55], // fastback slope
    [-hl + 0.12, 0.52], [-hl, 0.46], // short rear deck + ducktail
    [-hl, -0.2],
  ]
  sh.moveTo(pts[0][0], pts[0][1]); for (const [z, y] of pts.slice(1)) sh.lineTo(z, y)
  // wheel arches cut-outs are faked by black arch rings; keep the slab solid for robustness
  const geo = new THREE.ExtrudeGeometry(sh, { depth: W, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 4, steps: 6 })
  geo.translate(0, 0, -W / 2)
  geo.rotateY(-Math.PI / 2)
  // coke bottle + tumblehome
  const p = geo.attributes.position, uv = geo.attributes.uv
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const haunch = Math.exp(-Math.pow((z + 1.3) / 0.55, 2)) * 0.07
    const waist = -Math.exp(-Math.pow((z - 0.1) / 0.5, 2)) * 0.035
    const front = Math.exp(-Math.pow((z - 1.4) / 0.4, 2)) * 0.02
    let k = 1 + haunch + waist + front
    if (y > 0.5) k *= 1 - Math.min(1, (y - 0.5) / 0.48) * 0.24 // greenhouse narrower than body
    else if (y > 0.25) k *= 1 - (y - 0.25) * 0.08
    x *= k
    p.setX(i, x)
    uv.setXY(i, (z + hl) / L, (y + 0.3) / 1.4)
  }
  geo.computeVertexNormals()
  const body = add(new THREE.Mesh(geo, bodyMat)); body.position.y = 0.02
  // glass: windscreen, rear fastback glass, side windows
  const ws = add(new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.62), glassMat), false)
  ws.position.set(0, 0.74 + 0.05 * Math.cos(0.73), 0.36 + 0.05 * Math.sin(0.73))
  ws.lookAt(ws.position.x, ws.position.y + Math.cos(0.73), ws.position.z + Math.sin(0.73)); ws.scale.set(0.85, 1, 1)
  const rg = add(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.92), glassMat), false)
  rg.position.set(0, 0.8 + 0.06 * Math.cos(0.34), -1.15 - 0.06 * Math.sin(0.34))
  rg.lookAt(rg.position.x, rg.position.y + Math.cos(0.34), rg.position.z - Math.sin(0.34)); rg.scale.set(0.8, 1, 1)
  for (const x of [-1, 1]) {
    const sg = new THREE.Shape(); sg.moveTo(0.52, 0); sg.lineTo(0.08, 0.38); sg.lineTo(-0.55, 0.39); sg.lineTo(-1.25, 0.05); sg.lineTo(0.52, 0)
    const sgm = add(new THREE.Mesh(new THREE.ShapeGeometry(sg), glassMat), false)
    sgm.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2
    sgm.position.set(x * 0.99, 0.57, 0); sgm.rotateX(-0.42)
    if (x < 0) sgm.scale.x = -1
    // chrome window trim
    const tr = add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1.8), chromeMat), false); tr.position.set(x * 1.03, 0.56, -0.35)
    const mir = add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), chromeMat)); mir.scale.set(1.2, 0.8, 1); mir.position.set(x * (W / 2 + 0.02), 0.6, 0.45)
    // arch lips (black rings) front + bigger rear
    for (const [z, r] of [[1.35, 0.47], [-1.35, 0.53]]) {
      const arch = add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 6, 20, Math.PI), trimMat), false)
      arch.rotation.y = Math.PI / 2; arch.position.set(x * (W / 2 + (z < 0 ? 0.08 : 0.03)), -0.28, z)
    }
    // side scallop / rocker chrome
    const rk = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 1.6), chromeMat), false); rk.position.set(x * (W / 2 + 0.02), -0.12, 0)
  }
  // grille: black recessed panel + chrome frame + horizontal bars
  const grille = add(new THREE.Mesh(new THREE.PlaneGeometry(W * 0.88, 0.34), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6 })), false)
  grille.position.set(0, 0.2, hl + 0.005)
  for (let k = 0; k < 4; k++) { const bar = add(new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, 0.015, 0.02), chromeMat), false); bar.position.set(0, 0.08 + k * 0.08, hl + 0.015) }
  const gf = add(new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.03, 0.04), chromeMat), false); gf.position.set(0, 0.38, hl + 0.01)
  // chrome bumpers (full width, slightly wrapped)
  for (const [z, y] of [[hl + 0.08, -0.08], [-hl - 0.08, -0.04]]) {
    const bp = add(new THREE.Mesh(new RoundedBoxGeometry(W * 1.0, 0.14, 0.14, 3, 0.06), chromeMat)); bp.position.set(0, y, z)
    for (const x of [-1, 1]) { const wrap = add(new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.14, 0.4, 2, 0.05), chromeMat)); wrap.position.set(x * (W / 2 - 0.02), y, z - Math.sign(z) * 0.18) }
  }
  // hood scoop + bulge
  const bulge = add(new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.07, 1.4, 2, 0.03), bodyMat)); bulge.position.set(0, 0.5, 1.45)
  const scoop = add(new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.14, 0.45, 2, 0.04), trimMat)); scoop.position.set(0, 0.57, 1.3)
  const mouth = add(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.08), new THREE.MeshBasicMaterial({ color: 0x000000 })), false); mouth.position.set(0, 0.58, 1.53)
  // gas cap + rear panel chrome strip
  const strip = add(new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.03, 0.02), chromeMat), false); strip.position.set(0, 0.32, -hl - 0.01)
  const hood = bulge
  hood.rotation.x = 0
  return { top: 0.47, hood }
}
