/**
 * Degradación del compuesto. Cada rueda lleva temperatura y desgaste.
 *
 * En recta limpia la temperatura se queda en la ventana (~86°) y el agarre
 * no cambia. Derrapar, frenar fuerte o ir por grava la sube; el mojado la enfría.
 * El desgaste no vuelve: el eje trasero se come más goma (tracción atrás).
 * Una goma gastada agarra menos y suelta antes, porque la cima de la curva baja.
 *
 * enabled: false deja las cuatro ruedas nuevas todo el rato.
 * lifeSeconds: a ~160 km/h, cuánto tarda el eje delantero en llegar a ~1 de desgaste.
 */
export const COMPOUND = {
  enabled: true,
  lifeSeconds: 210,
  rearWear: 1.4,
}

const OPT = 86

export function freshCompound() {
  return [0, 1, 2, 3].map(() => ({ temp: OPT, wear: 0 }))
}

export function stepCompound(wheel, dt, { slipRad, speed, surfaceId, braking, handbrake, rear }) {
  if (!COMPOUND.enabled) {
    wheel.temp = OPT
    wheel.wear = 0
    return
  }
  const slip = Math.abs(slipRad) || 0
  const abuse = Math.max(0, slip - 0.09)
  let target = OPT + Math.min(52, abuse * 150)
  if (braking) target += 7
  if (handbrake && rear) target += 16
  if (surfaceId === 'gravel') target += 12 + abuse * 30
  if (surfaceId === 'wet') target = OPT + (target - OPT) * 0.4
  const k = 1 - Math.exp(-Math.max(0, dt) * 0.9)
  wheel.temp += (target - wheel.temp) * k
  if (wheel.temp < 16) wheel.temp = 16
  if (wheel.temp > 165) wheel.temp = 165

  const v = Math.max(0, speed)
  // A 45 m/s durante lifeSeconds el delantero llega a desgaste 1.
  const base = (v * Math.max(0, dt)) / (45 * COMPOUND.lifeSeconds)
  let mult = rear ? COMPOUND.rearWear : 1
  if (surfaceId === 'gravel') mult *= 1.8
  else if (surfaceId === 'wet') mult *= 0.6
  let add = base * mult
  add += abuse * dt * 0.012 * mult
  if (wheel.temp > 114) add += (wheel.temp - 114) * dt * 0.00035
  wheel.wear = Math.min(1, wheel.wear + add)
}

/** grip plano, cima más baja y caída más fuerte según cómo esté la goma. */
export function compoundMods(wheel) {
  if (!COMPOUND.enabled) return { grip: 1, peakScale: 1, falloffAdd: 0, id: 'ok' }
  let g = 1
  if (wheel.temp < 66) g *= 0.88 + 0.12 * (wheel.temp / 66)
  else if (wheel.temp > 110) g *= Math.max(0.76, 1 - (wheel.temp - 110) / 190)
  g *= 1 - wheel.wear * 0.34
  return {
    grip: Math.max(0.58, g),
    peakScale: Math.max(0.6, 1 - wheel.wear * 0.38),
    falloffAdd: wheel.wear * 0.3,
    id: compoundId(wheel),
  }
}

export function compoundId(wheel) {
  if (wheel.wear >= 0.75) return 'dead'
  if (wheel.wear >= 0.4) return 'worn'
  if (wheel.temp < 66) return 'cold'
  if (wheel.temp > 118) return 'cooked'
  if (wheel.temp > 110) return 'hot'
  if (wheel.wear >= 0.15) return 'worked'
  return 'ok'
}

const NAMES = {
  ok: 'óptima',
  cold: 'fría',
  hot: 'caliente',
  cooked: 'cocida',
  worked: 'trabajada',
  worn: 'gastada',
  dead: 'acabada',
}

/** La que manda es la trasera más gastada: es la que suelta el culo. */
export function compoundReadout(wheels) {
  const a = wheels[2]
  const b = wheels[3]
  const rear = a.wear >= b.wear ? a : b
  const id = compoundId(rear)
  const pct = Math.round(rear.wear * 100)
  const temp = Math.round(rear.temp)
  return { id, text: `Goma ${NAMES[id]} · ${temp}° · ${pct}%` }
}
