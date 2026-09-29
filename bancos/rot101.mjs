import * as THREE from 'three'
import { Scenario } from '../src/game/scenario.js'
import { giro90, salidasGiro90, definicionDeTodos } from '../src/config.js'
const base = definicionDeTodos('rotonda')
const extra = JSON.parse(process.argv[2] || '[]')
const punto = JSON.parse(process.argv[3] || 'null')
const cuarto = [
  { x: -5.5, z: 25.5, w: 1, d: 6.5, kind: 'alta' },
  { x: 4.5, z: 25.5, w: 1, d: 6.5, kind: 'alta' },
  { x: -3, z: 22.5, w: 6, d: 1, kind: 'media' },
  { x: 20, z: 19.5, w: 6, d: 1, kind: 'alta' },
  { x: 19.5, z: 20.5, w: 1, d: 6, kind: 'alta' },
  { x: -1.5, z: 13, w: 3, d: 3, kind: 'media' },
  { x: 13, z: 13, w: 2.5, d: 2.5, kind: 'alta' },
  { x: 8, z: 17, w: 5, d: 1.2, kind: 'bordillo' },
  { x: 13, z: 4, w: 3, d: 1.5, kind: 'baja' },
  ...extra,
]
const puntos = [{ x: 0, z: 28.5 }, { x: 24, z: 24 }, ...(punto ? [punto] : [])]
const def = { ...base, todos: { salidas: salidasGiro90(puntos) }, boxes: [...giro90(cuarto), { x: -3, z: -3, w: 6, d: 6, kind: 'alta' }] }
const s = new Scenario(new THREE.Scene(), def)
const sal = s.salidasDeTodos
let pares = 0, ven = []
const ojos = 1.7
for (let i = 0; i < sal.length; i++) for (let j = i + 1; j < sal.length; j++) {
  pares++
  const a = sal[i], b = sal[j]
  // cuatro rayos: ojo-ojo y con márgenes de 0.5 a los lados de b
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), px = -dz / L, pz = dx / L
  let visto = false
  for (const m of [0, 0.6, -0.6]) for (const n of [0, 0.6, -0.6]) {
    if (!s.cortarSegmento(a.x + px * n, ojos, a.z + pz * n, b.x + px * m, ojos, b.z + pz * m)) visto = true
  }
  if (visto) ven.push(`${i}(${a.x},${a.z})-${j}(${b.x},${b.z})`)
}
// ¿las salidas están en suelo libre?
const libres = sal.map((p) => s.groundHeightAt(p.x, p.z))
console.log(`salidas ${sal.length} · pares ${pares} · se ven ${ven.length}`, ven.slice(0, 12).join(' '), '· suelos', libres.join(','))
