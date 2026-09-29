/**
 * La Pump medida donde se decide: el patrón contra la distancia, lo que mata y
 * lo que no, y que los dos extremos derivan **el mismo** perdigonazo.
 */
import { MOVEMENT, WEAPONS } from '../src/config.js'
import { resolverEscopeta, perdigonDeSemilla } from '../net/disparo.js'
import { cuerpoDeJugador } from '../net/pose.js'
import { encajarImpacto, zoneDamage } from '../src/game/player.js'

let fallos = 0
const afirmar = (n, c, d = '') => {
  console.log((c ? '  ok  ' : '  FALLO ') + n + (d ? ` — ${d}` : ''))
  if (!c) fallos += 1
}

const arma = 'pump'
const p = WEAPONS.pump
const ojos = { x: 0, y: MOVEMENT.standHeight, z: 0 }
/** El rival, de pie mirando al tirador y con los ojos a la misma altura. */
const cuerpoA = (d) => cuerpoDeJugador(0, -d, 0, MOVEMENT.standHeight)

// --- 1. Cuántos perdigones entran según la distancia ---
console.log('\n  patrón contra la distancia (apuntando al pecho, 400 semillas)')
const alturaPecho = MOVEMENT.standHeight - 0.55
const pitchAlPecho = (d) => Math.atan2(alturaPecho - ojos.y, d) * -1 * 0 + Math.asin((alturaPecho - ojos.y) / Math.hypot(d, alturaPecho - ojos.y))
const medir = (d) => {
  let suma = 0
  let dano = 0
  const cuerpo = cuerpoA(d)
  for (let s = 1; s <= 400; s++) {
    const v = resolverEscopeta(ojos, 0, pitchAlPecho(d), s, cuerpo, [], arma)
    suma += v.tocados
    dano += v.dano
  }
  return { perdigones: suma / 400, dano: dano / 400 }
}
const filas = []
for (const d of [2, 3, 5, 8, 12, 15, 20, 30]) {
  const m = medir(d)
  filas.push({ d, ...m })
  console.log(`  ${String(d).padStart(2)} u → ${m.perdigones.toFixed(2)} de 8 perdigones · ${m.dano.toFixed(1)} de daño`)
}

// --- 2. Lo que mata y lo que no, a bocajarro ---
console.log('\n  a 2 u, por zona y por armadura')
const golpes = (zona, chaleco, casco = false) => {
  const estado = { health: 100, shield: chaleco ? 50 : 0, helmet: casco }
  // Un perdigonazo entero en esa zona: ocho perdigones por su valor de zona.
  let n = 0
  while (estado.health > 0 && n < 12) {
    n += 1
    const r = encajarImpacto(estado, { zone: zona, damage: zoneDamage(zona, arma) * p.perdigones.n, weaponKey: arma })
    estado.health = r.health
    estado.shield = r.shield
    estado.helmet = r.helmet
  }
  return n
}
for (const [zona, etiqueta] of [['torso', 'cuerpo'], ['head', 'cabeza'], ['legs', 'piernas']]) {
  const sin = golpes(zona, false)
  const con = golpes(zona, true, zona === 'head')
  console.log(`  ${etiqueta.padEnd(8)} ${zoneDamage(zona, arma) * 8} de daño · ${sin} disparo(s) sin armadura · ${con} con ella`)
}
afirmar('a bocajarro el cuerpo cae de un disparo', golpes('torso', false) === 1)
afirmar('y también a través de un chaleco', golpes('torso', true) === 1)
afirmar('las piernas NO matan de un disparo', golpes('legs', false) === 2, `${golpes('legs', false)}`)

// --- 3. El umbral de corta distancia, medido y no elegido ---
const cerca = filas.filter((f) => f.dano >= 100).map((f) => f.d)
console.log(`\n  el disparo mata de una hasta ${Math.max(...cerca)} u (media sobre 400 semillas)`)
afirmar('mata de una a 2 y 3 u', cerca.includes(2) && cerca.includes(3))
afirmar('y deja de matar de una pasadas 8 u', !cerca.includes(12) && !cerca.includes(15))
// A 20 u lo que entra son dos perdigones mal contados, o sea 27 de daño: cuatro
// disparos para matar. Es el suelo del arma, y es lo que la deja fuera de la
// pelea a media distancia sin necesitar una curva de daño por metros.
afirmar('a 20 u entran menos de dos perdigones y medio',
  filas.find((f) => f.d === 20).perdigones < 2.5, filas.find((f) => f.d === 20).perdigones.toFixed(2))

// --- 4. La misma semilla da el mismo patrón, que es lo que la hace segura en red ---
let iguales = 0
for (let s = 1; s <= 200; s++) {
  const a = []
  const b = []
  for (let i = 0; i < p.perdigones.n; i++) {
    const d1 = perdigonDeSemilla(s, i, p.perdigones.conoGrados, 0.3, -0.1)
    a.push(`${d1.x.toFixed(12)},${d1.y.toFixed(12)},${d1.z.toFixed(12)}`)
  }
  for (let i = 0; i < p.perdigones.n; i++) {
    const d2 = perdigonDeSemilla(s, i, p.perdigones.conoGrados, 0.3, -0.1)
    b.push(`${d2.x.toFixed(12)},${d2.y.toFixed(12)},${d2.z.toFixed(12)}`)
  }
  if (a.join('|') === b.join('|')) iguales += 1
}
afirmar('la misma semilla da el mismo patrón, hasta el doceavo decimal', iguales === 200, `${iguales}/200`)

// Y dos semillas distintas no.
const q = (s) => perdigonDeSemilla(s, 0, p.perdigones.conoGrados, 0, 0).x
afirmar('y dos semillas distintas dan patrones distintos', q(1) !== q(2) && q(2) !== q(3))

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
