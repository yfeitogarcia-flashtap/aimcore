/**
 * perfora95 — la auditoría de equilibrio de la propuesta 09, antes de construir
 * nada. No afirma: mide, como `x8.mjs`.
 *
 * La medida que decide: para una víctima **de verdad tapada** —sin línea de
 * visión a la cabeza, al pecho ni a las rodillas— cuánto material hay entre el
 * ojo del tirador y su pecho. Eso es lo que un umbral de perforación dejaría
 * pasar, y con ella se contesta «cómo afecta al equilibrio de los mapas de hoy».
 */
import * as THREE from 'three'
import { SCENARIOS } from '../src/config.js'
import { Scenario } from '../src/game/scenario.js'
import { hasLineOfSight } from '../src/game/sight.js'

const A = new THREE.Vector3(), B = new THREE.Vector3()
/** Material total cruzado, sumado sobre todas las piezas (una celosía de piezas finas no es transparente). */
const material = (esc, x0, y0, z0, x1, y1, z1) => {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0
  const largo = Math.hypot(dx, dy, dz)
  let total = 0
  for (const c of esc.boxes) {
    let entra = 0, sale = 1
    let vale = true
    for (const [d, o, min, max] of [[dx, x0, c.minX, c.maxX], [dy, y0, c.bottom, c.top], [dz, z0, c.minZ, c.maxZ]]) {
      if (d === 0) { if (o < min || o > max) { vale = false; break } continue }
      let t0 = (min - o) / d, t1 = (max - o) / d
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t }
      if (t0 > entra) entra = t0
      if (t1 < sale) sale = t1
      if (entra > sale) { vale = false; break }
    }
    if (vale && sale > entra) total += (sale - entra) * largo
  }
  return total
}

for (const clave of ['largoYPuerta', 'elEspejo']) {
  const esc = new Scenario({ add() {}, remove() {} }, SCENARIOS[clave])
  const sala = esc.room
  const paso = 2
  const puestos = []
  for (let x = -sala.width / 2 + 2; x <= sala.width / 2 - 2; x += paso) {
    for (let z = -sala.depth / 2 + 2; z <= sala.depth / 2 - 2; z += paso) {
      const suelo = esc.groundHeightAt(x, z, 0)
      if (suelo > 0.25) continue // sólo puestos a nivel de suelo, como el barrido de rutas
      puestos.push({ x, z })
    }
  }
  const tapados = []
  for (let i = 0; i < puestos.length; i++) {
    for (let j = 0; j < puestos.length; j++) {
      if (i === j) continue
      const p = puestos[i], q = puestos[j]
      if (Math.hypot(p.x - q.x, p.z - q.z) > 20) continue
      // Tapada de verdad: ni cabeza, ni pecho, ni rodillas.
      let ve = false
      for (const alto of [1.7, 1.2, 0.4]) {
        A.set(p.x, 1.7, p.z); B.set(q.x, alto, q.z)
        if (hasLineOfSight(A, B, esc.occluders)) { ve = true; break }
      }
      if (ve) continue
      tapados.push(material(esc, p.x, 1.7, p.z, q.x, 1.2, q.z))
    }
  }
  tapados.sort((a, b) => a - b)
  const pct = (u) => ((tapados.filter((m) => m > 0 && m <= u).length / tapados.length) * 100).toFixed(1)
  const q = (f) => tapados[Math.floor(tapados.length * f)]?.toFixed(2) ?? '—'
  console.log(`\n${clave}: ${puestos.length} puestos a nivel, ${tapados.length} parejas TAPADAS a ≤20 u`)
  console.log(`  material entre ojo y pecho — mín ${tapados[0]?.toFixed(3)}, p5 ${q(0.05)}, mediana ${q(0.5)}, p95 ${q(0.95)}`)
  console.log(`  parejas que un umbral dejaría pasar:  ≤0.5 u ${pct(0.5)}%   ≤1.0 u ${pct(1.0)}%   ≤1.5 u ${pct(1.5)}%   ≤2.0 u ${pct(2.0)}%`)
}

console.log('\nLa premisa de esta auditoría, que es lo que la hace legible: las parejas')
console.log('contadas son las que HOY no se ven de ninguna de las tres alturas, así que')
console.log('el porcentaje es «cuántos escondites dejan de esconder», no «cuántos tiros')
console.log('entran» (vuelta 46: una proporción necesita su denominador).')
