/**
 * **corte85 — que la aritmética diga lo mismo que el rayo.**
 *
 * `cortarSegmento` (vuelta 85) contesta la misma pregunta que
 * `_superficieBajoElRayo` (vuelta 64) y por otro camino, así que lo único que
 * la hace segura es medirla contra él. Se barre un abanico de direcciones
 * desde varios puntos del Plano A y se compara **dónde acaba** cada rayo.
 */
import * as THREE from 'three'
import { Scenario } from '../src/game/scenario.js'
import { SCENARIOS } from '../src/config.js'

const escena = new THREE.Scene()
const esc = new Scenario(escena, SCENARIOS.largoYPuerta ? 'largoYPuerta' : Object.keys(SCENARIOS)[0])
const rayo = new THREE.Raycaster()
const _n = new THREE.Matrix3()

/** Lo que hace el motor: mallas primero, sala después. */
function porRayo(o, d) {
  rayo.set(o, d)
  rayo.near = 0
  rayo.far = Infinity
  let mejor = Infinity
  const golpes = rayo.intersectObjects(esc.occluders, false)
  if (golpes.length > 0) mejor = golpes[0].distance
  const room = esc.room
  const mirar = (dv, ov, min, max) => {
    if (dv === 0) return
    const t = (dv > 0 ? max - ov : min - ov) / dv
    if (t >= 0 && t < mejor) mejor = t
  }
  mirar(d.x, o.x, -room.width / 2, room.width / 2)
  mirar(d.y, o.y, 0, room.height)
  mirar(d.z, o.z, -room.depth / 2, room.depth / 2)
  return mejor
}

/**
 * Puestos de verdad: un punto **dentro** de una pieza no es un caso a medir
 * —el jugador nunca está ahí— y ahí las dos funciones contestan cosas
 * distintas a propósito. Se comprueba antes de medir, que es la premisa
 * (vuelta 46).
 */
const candidatos = [
  [0, 1.7, 17], [0, 1.7, 0], [-12, 1.7, -8], [10, 1.7, 6], [0, 4.5, -10], [5, 0.9, 12],
  [-16, 1.7, 2], [14, 1.7, -14], [-4, 3.5, -16],
]
const origenes = candidatos.filter(([x, y, z]) =>
  !esc.boxes.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && y >= b.bottom && y <= b.top))
console.log(`   (${origenes.length} de ${candidatos.length} puestos libres de geometría)`)
let n = 0
let peor = 0
let peorCaso = null
const fallos = []

for (const [ox, oy, oz] of origenes) {
  const o = new THREE.Vector3(ox, oy, oz)
  for (let a = 0; a < 72; a++) {
    for (let p = -5; p <= 5; p++) {
      const yaw = (a * 5 * Math.PI) / 180
      const pitch = (p * 8 * Math.PI) / 180
      const cp = Math.cos(pitch)
      const d = new THREE.Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp)
      const esperado = porRayo(o, d)
      if (!Number.isFinite(esperado)) continue
      // El segmento se hace **más largo** que el corte del rayo, para que el
      // corte tenga que caer dentro y no en el extremo.
      const L = esperado + 5
      const c = esc.cortarSegmento(ox, oy, oz, ox + d.x * L, oy + d.y * L, oz + d.z * L)
      n += 1
      if (!c) { fallos.push(`sin corte en ${yaw.toFixed(2)}/${pitch.toFixed(2)} desde ${ox},${oy},${oz}`); continue }
      const dado = c.t * L
      const err = Math.abs(dado - esperado)
      if (err > peor) { peor = err; peorCaso = { ox, oy, oz, yaw, pitch, esperado, dado } }
    }
  }
}

console.log('== corte85: aritmética contra rayo ==\n')
console.log(`[1] ${n} segmentos barridos por el Plano A`)
console.log(`    mayor discrepancia: ${peor.toFixed(6)} u`)
if (peorCaso) {
  console.log(`    (rayo ${peorCaso.esperado.toFixed(4)} contra aritmética ${peorCaso.dado.toFixed(4)}` +
    ` desde ${peorCaso.ox},${peorCaso.oy},${peorCaso.oz})`)
}
console.log(`[2] segmentos sin corte: ${fallos.length}`)
if (fallos.length) console.log('    ' + fallos.slice(0, 5).join('\n    '))

/**
 * **[3] Y con prismas**, que son la mitad que `resolveAxis` estrenó en la 83 y
 * la que el Plano A no tiene. Un pilar de doce caras y un muro girado 45°.
 */
{
  const mapa = {
    clave: 'c85', nombre: 'C', sala: { lado: 40, alto: 12 }, spawnZone: [],
    boxes: [],
    prismas: [
      { x: 0, z: -6, w: 3, d: 3, kind: 'alta', lados: 12, giro: 0 },
      { x: 6, z: 4, w: 12, d: 1.5, kind: 'media', lados: 4, giro: Math.PI / 4 },
    ],
  }
  const e2 = new Scenario(new THREE.Scene(), mapa)
  const r2 = new THREE.Raycaster()
  const porRayo2 = (o, d) => {
    r2.set(o, d); r2.near = 0; r2.far = Infinity
    let mejor = Infinity
    const g = r2.intersectObjects(e2.occluders, false)
    if (g.length > 0) mejor = g[0].distance
    const room = e2.room
    const mirar = (dv, ov, min, max) => {
      if (dv === 0) return
      const t = (dv > 0 ? max - ov : min - ov) / dv
      if (t >= 0 && t < mejor) mejor = t
    }
    mirar(d.x, o.x, -room.width / 2, room.width / 2)
    mirar(d.y, o.y, 0, room.height)
    mirar(d.z, o.z, -room.depth / 2, room.depth / 2)
    return mejor
  }
  let n2 = 0, peor2 = 0
  const o = new THREE.Vector3(0, 1.7, 14)
  for (let a = 0; a < 180; a++) {
    for (let p = -4; p <= 4; p++) {
      const yaw = (a * 2 * Math.PI) / 180
      const pitch = (p * 6 * Math.PI) / 180
      const cp = Math.cos(pitch)
      const d = new THREE.Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp)
      const esperado = porRayo2(o, d)
      if (!Number.isFinite(esperado)) continue
      const L = esperado + 5
      const c = e2.cortarSegmento(o.x, o.y, o.z, o.x + d.x * L, o.y + d.y * L, o.z + d.z * L)
      n2 += 1
      if (!c) { peor2 = Infinity; continue }
      peor2 = Math.max(peor2, Math.abs(c.t * L - esperado))
    }
  }
  console.log(`\n[3] con un pilar de 12 caras y un muro a 45°: ${n2} segmentos, ` +
    `mayor discrepancia ${peor2.toFixed(6)} u`)
}

/** **[4] Lo que cuesta**, que es la razón de que esto no sea un raycast. */
{
  const o = origenes[0]
  const N = 200000
  const dirs = []
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2
    dirs.push([Math.cos(a) * 0.3, -0.05, Math.sin(a) * 0.3])
  }
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < N; i++) {
    const d = dirs[i & 63]
    esc.cortarSegmento(o[0], o[1], o[2], o[0] + d[0], o[1] + d[1], o[2] + d[2])
  }
  const us = Number(process.hrtime.bigint() - t0) / 1000 / N
  console.log(`[4] un paso de un proyectil en el Plano A (${esc.boxes.length} piezas): ` +
    `${us.toFixed(3)} µs`)
  const rayoV = new THREE.Vector3(0.3, -0.05, 0)
  const oV = new THREE.Vector3(o[0], o[1], o[2])
  const M = 20000
  const t1 = process.hrtime.bigint()
  for (let i = 0; i < M; i++) porRayo(oV, rayoV.clone().normalize())
  const us2 = Number(process.hrtime.bigint() - t1) / 1000 / M
  console.log(`    el mismo trozo por raycast contra las mallas: ${us2.toFixed(3)} µs`)
}
