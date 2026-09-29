// peanas105 — cuánto costaría buscar la peana apuntada con muchas peanas en el
// mapa: el sondeo por paso (distancia al cuadrado + ángulo) y un corte de
// segmento para la candidata. Informe, sin veredictos: es para la propuesta 08.
import * as THREE from 'three'
import { Scenario } from '../src/game/scenario.js'
const esc = new Scenario(new THREE.Scene(), 'largoYPuerta')
const N = 160
const px = new Float64Array(N); const pz = new Float64Array(N); const py = new Float64Array(N)
for (let i = 0; i < N; i++) { px[i] = Math.random() * 36 - 18; pz[i] = Math.random() * 36 - 18; py[i] = 0.9 }
const ALC = 2.5
const ojo = { x: 0, y: 1.7, z: 0 }
let hallada = 0
const buscar = (dx, dz) => {
  let mejor = -1; let mejorCos = Math.cos(0.12)
  for (let i = 0; i < N; i++) {
    const vx = px[i] - ojo.x; const vy = py[i] - ojo.y; const vz = pz[i] - ojo.z
    const d2 = vx * vx + vy * vy + vz * vz
    if (d2 > ALC * ALC) continue
    const c = (vx * dx + vz * dz) / Math.sqrt(d2)
    if (c > mejorCos) { mejorCos = c; mejor = i }
  }
  return mejor
}
const PASOS = 200000
let t0 = performance.now()
for (let k = 0; k < PASOS; k++) {
  ojo.x = (k % 360) / 10 - 18; ojo.z = ((k * 7) % 360) / 10 - 18
  const a = k * 0.01
  if (buscar(Math.sin(a), Math.cos(a)) >= 0) hallada++
}
const sondeo = (performance.now() - t0) / PASOS
t0 = performance.now()
const R = 20000
let cortes = 0
for (let k = 0; k < R; k++) {
  const i = k % N
  if (esc.cortarSegmento(ojo.x, 1.7, ojo.z, px[i], py[i], pz[i]) !== null) cortes++
}
const corte = (performance.now() - t0) / R
console.log(`${N} peanas: sondeo por paso ${(sondeo * 1000).toFixed(2)} µs · un corte de segmento ${(corte * 1000).toFixed(2)} µs · (${hallada} pasos con candidata de ${PASOS}, ${cortes} cortes tapados de ${R})`)
console.log(`presupuesto de un paso: 200 µs → sondeo + corte = ${((sondeo + corte) * 1000).toFixed(2)} µs (${(((sondeo + corte) * 1000) / 200 * 100).toFixed(2)} %)`)
