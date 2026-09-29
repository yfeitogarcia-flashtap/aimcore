// Banco: el desvío del duelo tiene que ser el mismo cono que el del
// entrenamiento, y a los dos les tiene que pasar algo en el aire.
import * as THREE from 'three'
import { ACCURACY } from '../src/config.js'
import { direccionDeMira } from '../net/disparo.js'

const DEG = Math.PI / 180
const _u = new THREE.Vector3(), _v = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0), _fb = new THREE.Vector3(1, 0, 0)
function applySpread(direction, spreadDeg) {
  const theta = Math.random() * spreadDeg * DEG
  if (theta <= 0) return
  const phi = Math.random() * Math.PI * 2
  const reference = Math.abs(direction.y) > 0.99 ? _fb : _up
  _u.crossVectors(reference, direction).normalize()
  _v.crossVectors(direction, _u).normalize()
  const sin = Math.sin(theta)
  direction.multiplyScalar(Math.cos(theta))
    .addScaledVector(_u, sin * Math.cos(phi))
    .addScaledVector(_v, sin * Math.sin(phi)).normalize()
}

// Lo que hace `_miraConDesvio`: vector, desvío, y vuelta a ángulos.
const d = new THREE.Vector3()
function miraConDesvio(yaw, pitch, spread) {
  direccionDeMira(yaw, pitch, d)
  applySpread(d, spread)
  return { pitch: Math.asin(Math.max(-1, Math.min(1, d.y))), yaw: Math.atan2(-d.x, -d.z) }
}

const N = 200000
const base = new THREE.Vector3()
function tanda(yaw, pitch, spread, ida) {
  let suma = 0, max = 0
  direccionDeMira(yaw, pitch, base)
  const b = base.clone()
  for (let i = 0; i < N; i++) {
    let dir
    if (ida) { dir = b.clone(); applySpread(dir, spread) }
    else { const m = miraConDesvio(yaw, pitch, spread); dir = direccionDeMira(m.yaw, m.pitch, new THREE.Vector3()) }
    const ang = Math.acos(Math.max(-1, Math.min(1, dir.dot(b)))) / DEG
    suma += ang; if (ang > max) max = ang
  }
  return { medio: suma / N, max }
}

console.log('movementSpreadDeg', ACCURACY.movementSpreadDeg, '| airSpreadDeg', ACCURACY.airSpreadDeg)
console.log('cabeceo'.padEnd(9), 'entrenamiento (vector)'.padEnd(26), 'duelo (ángulos)')
for (const gr of [0, -20, -45, -70]) {
  const p = gr * DEG
  const a = tanda(0.7, p, ACCURACY.airSpreadDeg, true)
  const b = tanda(0.7, p, ACCURACY.airSpreadDeg, false)
  console.log(
    `${gr}°`.padEnd(9),
    `medio ${a.medio.toFixed(4)}  max ${a.max.toFixed(4)}`.padEnd(26),
    `medio ${b.medio.toFixed(4)}  max ${b.max.toFixed(4)}`,
  )
}
console.log('')
console.log('a 15 u, radio del cono:',
  (15 * Math.tan(ACCURACY.airSpreadDeg * DEG)).toFixed(3), 'u en el aire contra',
  (15 * Math.tan(ACCURACY.movementSpreadDeg * DEG)).toFixed(3), 'corriendo.',
  'El cuerpo del rival mide 0.586 u de ancho en la cintura.')
