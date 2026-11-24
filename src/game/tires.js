import * as CANNON from 'cannon-es'

/**
 * Neumático de CochesAI.
 * Cannon ya hace el círculo de fricción (frenar y girar se quitan agarre).
 * Lo que no hace es la curva del neumático: hasta un ángulo de deriva el agarre
 * aguanta, y más allá cae. Cada rueda tiene el suyo (el delantero va girado).
 *
 * peakSlipDeg: donde el neumático rinde el máximo. Por encima, pierde.
 * falloff: cuánto agarre se va en un derrape fuerte (0.3 = se queda en el 70 %).
 * Pon enabled en false para volver al frictionSlip plano de antes.
 */
export const TIRE_SYSTEM = {
  enabled: true,
  peakSlipDeg: 8,
  falloff: 0.3,
}

const _fwd = new CANNON.Vec3()
const _right = new CANNON.Vec3()
const _vel = new CANNON.Vec3()
const _localF = new CANNON.Vec3(0, 0, 1)
const _localR = new CANNON.Vec3(1, 0, 0)

/** 1 en recta. Baja solo cuando esa rueda va de lado, pasada la cima. */
export function tireGrip(slipRad) {
  if (!TIRE_SYSTEM.enabled) return 1
  const peak = TIRE_SYSTEM.peakSlipDeg * Math.PI / 180
  const a = Math.abs(slipRad)
  if (a <= peak) return 1
  const t = Math.min(1, (a - peak) / 0.42)
  return Math.max(0.62, 1 - t * TIRE_SYSTEM.falloff)
}

/** Ángulo de deriva de una rueda, en radianes. Positivo = se va hacia su derecha. */
export function wheelSlipRad(chassis, vehicle, i) {
  vehicle.updateWheelTransform(i)
  const tr = vehicle.wheelInfos[i].worldTransform
  tr.vectorToWorldFrame(_localF, _fwd)
  tr.vectorToWorldFrame(_localR, _right)
  chassis.getVelocityAtWorldPoint(tr.position, _vel)
  const vLong = _vel.dot(_fwd)
  const vLat = _vel.dot(_right)
  return Math.atan2(vLat, Math.max(3, Math.abs(vLong)))
}
