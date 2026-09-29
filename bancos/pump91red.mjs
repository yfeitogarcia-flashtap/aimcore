/**
 * La Pump en el servidor: que la semilla llegue, que el perdigonazo se
 * resuelva como patrón y que el daño sea el mismo que calcula el cliente.
 */
import { NET, WEAPON_ORDER } from '../src/config.js'
import { MSG, empaquetarTeclas } from '../net/protocolo.js'
import { Partida } from '../net/partida.js'
import { resolverEscopeta } from '../net/disparo.js'
import { cuerpoDeJugador } from '../net/pose.js'
import * as THREE from 'three'
import { Scenario } from '../src/game/scenario.js'

let fallos = 0
const afirmar = (n, c, d = '') => {
  console.log((c ? '  ok  ' : '  FALLO ') + n + (d ? ` — ${d}` : ''))
  if (!c) fallos += 1
}

const escenario = new Scenario(new THREE.Scene(), NET.escenario)
const partida = new Partida({ escenario, rondas: false, depurar: true })
const buzon = { p1: [], p2: [] }
const ids = []
for (const quien of ['p1', 'p2']) ids.push(partida.entra((t) => buzon[quien].push(JSON.parse(t))))
const [A, B] = ids

let paso = 1
const entrada = (id, extra = {}) => partida.recibe(id, JSON.stringify({
  t: MSG.ENTRADA, n: paso, k: empaquetarTeclas({}), yaw: 0, jt: -1,
  w: WEAPON_ORDER.indexOf('pump'), ...extra,
}))
const avanzar = (n = 1) => {
  for (let i = 0; i < n; i++) { for (const id of ids) entrada(id); partida.tick(); paso += 1 }
}
avanzar(5)

/**
 * **Cara a cara a cuatro unidades, y el sitio se busca en vez de suponerse**
 * (la lección de `laser87` y de la vuelta 90): el centro de El Espejo es una
 * pieza de cobertura de 3.6, así que plantar a los dos en (0,0) y (0,−4) es
 * ponerles un muro en medio — y el síntoma es «cero perdigones», que se lee
 * como que la escopeta no funciona.
 */
import { hasLineOfSight } from '../src/game/sight.js'
const v3 = (x, y, z) => new THREE.Vector3(x, y, z)
let sitio = null
for (let x = -16; x <= 16 && !sitio; x += 2) {
  for (let z = -16; z <= 16 && !sitio; z += 2) {
    if (hasLineOfSight(v3(x, 1.7, z), v3(x, 1.7, z - 4), escenario.occluders)) sitio = { x, z }
  }
}
if (!sitio) { console.log('  FALLO — no hay ningún par con línea de visión'); process.exit(1) }
console.log(`  sitio con línea de visión: (${sitio.x}, ${sitio.z}) y (${sitio.x}, ${sitio.z - 4})`)
partida.recibe(A, JSON.stringify({ t: MSG.COLOCAR, x: sitio.x, y: 1.7, z: sitio.z }))
partida.recibe(B, JSON.stringify({ t: MSG.COLOCAR, x: sitio.x, y: 1.7, z: sitio.z - 4 }))
avanzar(3)

const jugadorA = partida.jugadores.get(A)
const jugadorB = partida.jugadores.get(B)
jugadorA.arma = 'pump'
console.log(`  A en (${jugadorA.pose.position.x}, ${jugadorA.pose.position.z}) · B en (${jugadorB.pose.position.x}, ${jugadorB.pose.position.z}) · vida de B ${jugadorB.vida}`)

// Apuntar al pecho de B y disparar con una semilla conocida.
const dz = jugadorB.pose.position.z - jugadorA.pose.position.z
const dy = (jugadorB.pose.position.y - 0.55) - jugadorA.pose.position.y
const pitch = Math.atan2(dy, Math.abs(dz))
const semilla = 424242

// Lo que el cliente calcularía con esa misma semilla.
const cuerpo = cuerpoDeJugador(jugadorB.pose.position.x, jugadorB.pose.position.z, jugadorB.pose.position.y - 1.7, 1.7)
const local = resolverEscopeta(jugadorA.pose.position, 0, pitch, semilla, cuerpo, escenario.occluders, 'pump')
console.log(`  el cliente calcula: ${local.tocados} perdigones · ${local.dano.toFixed(1)} de daño · zona ${local.zona}`)

const vidaAntes = jugadorB.vida
entrada(A, { d: { seq: 1, yaw: 0, pitch, tf: 0, p: semilla } })
entrada(B)
partida.tick(); paso += 1
// **El servidor no ejecuta una entrada en el tick en que llega**: la mete en
// la cola con su colchón. Sin dejar pasar unos pasos, el banco lee un mundo en
// el que el disparo todavía no ha ocurrido y concluye que no ocurre.
avanzar(8)

// El veredicto viaja dentro de la foto (`jugador.disparos`), no como mensaje
// suelto: se lee de la última foto que le ha llegado al tirador.
const disparosDe = (caja) => [...caja]
  .reverse()
  .flatMap((m) => Object.values(m.p ?? {}).flatMap((j) => j.disparos ?? []))
const veredicto = disparosDe(buzon.p1).find((v) => v.seq === 1) ?? jugadorA.disparos.map((d) => d.dato).find((v) => v.seq === 1)
console.log(`  el servidor dice: impacto ${veredicto?.impacto} · ${veredicto?.dano?.toFixed?.(1)} de daño · zona ${veredicto?.zona} · baja ${veredicto?.baja}`)
console.log(`  vida de B: ${vidaAntes} → ${jugadorB.vida}`)

afirmar('el servidor resuelve el perdigonazo', veredicto?.impacto === true)
afirmar('y con el mismo daño que el cliente',
  Math.abs((veredicto?.dano ?? 0) - local.dano) < 0.01, `${veredicto?.dano} vs ${local.dano.toFixed(1)}`)
afirmar('a cuatro unidades y al pecho, mata de un disparo', veredicto?.baja === true)

// Y sin semilla —un cliente viejo o uno que miente por omisión— el disparo se
// resuelve igual, con el patrón de la semilla 0: lo que no puede pasar es que
// se caiga o que cuele un rayo entero. (B ya está muerto, así que lo que se
// comprueba aquí es que el veredicto llega y no que falle.)
entrada(A, { d: { seq: 2, yaw: 0, pitch, tf: 0 } })
entrada(B)
partida.tick(); paso += 1
avanzar(8)
const sinSemilla = disparosDe(buzon.p1).find((v) => v.seq === 2)
console.log(`  sin semilla: veredicto ${sinSemilla ? 'sí' : 'no'} · impacto ${sinSemilla?.impacto}`)
afirmar('una entrada sin semilla recibe veredicto igual', Boolean(sinSemilla))

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
