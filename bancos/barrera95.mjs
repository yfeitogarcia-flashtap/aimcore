/**
 * barrera95 — un límite que para el cuerpo y nada más, sin navegador.
 *
 *  [0] **La premisa, antes de nada**: los mapas de hoy se montan **idénticos**,
 *      y el control del [2] tapa de verdad. Sin ese denominador, «la barrera no
 *      tapa» lo cumpliría igual de bien un rayo que no llega (vuelta 46).
 *  [1] El formato: el acabado sobrevive, uno desconocido se dice y se tira, una
 *      barrera **pierde tinte y dispositivo** diciéndolo, y el saneado sigue
 *      siendo un punto fijo byte a byte (vuelta 83).
 *  [2] El motor: una barrera **no entra en `occluders`** ni de cristal ni
 *      invisible, así que no corta la vista ni el rayo de un disparo — y las dos
 *      variantes se comportan **igual**, que es lo que hace que elegir acabado
 *      sea aspecto y no mecánica.
 *  [3] Y sí para el cuerpo: se choca con ella y se pisa por arriba, medido con
 *      el `groundHeightAt` del motor y con el mismo barrido horizontal que usa
 *      el movimiento.
 */
import * as THREE from 'three'
import { COVER, SCENARIOS, coverHeight } from '../src/config.js'
import { Scenario } from '../src/game/scenario.js'
import { hasLineOfSight } from '../src/game/sight.js'
import { sanearMapa, sanearPieza } from '../src/maps/formato.js'

let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}

const escenaFalsa = () => ({ add() {}, remove() {} })
const montar = (definicion) => new Scenario(escenaFalsa(), definicion)

/** Una sala con un muro atravesado entre A (z +8) y B (z −8). */
const conElMuro = (extra) => ({
  clave: 'banco-barrera',
  label: 'Banco',
  room: { width: 40, depth: 40, height: 10 },
  spawn: { x: 0, z: 16 },
  boxes: [{ x: -6, z: -0.5, w: 12, d: 1, kind: 'media', ...extra }],
  ramps: [],
  prismas: [],
  routes: [],
})

const A = new THREE.Vector3(0, 1.7, 8)
const B = new THREE.Vector3(0, 1.7, -8)

// ------------------------------------------------------------ [0] la premisa
console.log('\n[0] La premisa: los mapas de hoy no se mueven, y el control tapa')
const plano = montar(SCENARIOS.largoYPuerta)
afirmar(plano.boxes.length === 20, `el Plano A monta sus 20 piezas: ${plano.boxes.length}`)
afirmar(plano.occluders.length > 0 && plano.boxes.every((b) => !b.barrera),
  `y ninguna es barrera, con ${plano.occluders.length} montones de dibujo`)

const control = montar(conElMuro({}))
afirmar(control.occluders.length === 1, `el control dibuja su muro: ${control.occluders.length} montón`)
afirmar(!hasLineOfSight(A, B, control.occluders),
  'y **corta la vista** entre A y B — sin esto el resto del banco no mide nada')

// -------------------------------------------------------------- [1] formato
console.log('\n[1] El formato')
for (const acabado of COVER.barrera.acabados) {
  const problemas = []
  const p = sanearPieza({ x: 0, z: 0, w: 4, d: 0.4, kind: 4, barrera: acabado }, problemas)
  afirmar(p?.barrera === acabado && problemas.length === 0,
    `«${acabado}» sobrevive al saneado sin un problema`)
}
{
  const problemas = []
  const p = sanearPieza({ x: 0, z: 0, w: 4, d: 0.4, kind: 4, barrera: 'humo' }, problemas)
  afirmar(p !== null && p.barrera === undefined && problemas.some((t) => t.includes('barrera desconocida')),
    `un acabado desconocido no tira la pieza y se dice: «${problemas[0] ?? '—'}»`)
}
{
  const problemas = []
  const p = sanearPieza(
    { x: 0, z: 0, w: 4, d: 0.4, kind: 4, barrera: 'cristal', tinte: 'musgo', superficie: { tipo: 'rebote', fuerza: 14 } },
    problemas,
  )
  afirmar(p.tinte === undefined && p.superficie === undefined,
    'una barrera pierde el tinte y el dispositivo')
  afirmar(problemas.filter((t) => t.includes('barrera no lleva')).length === 2,
    `y los dos se dicen: ${problemas.filter((t) => t.includes('barrera no lleva')).length} problemas`)
}
{
  // El punto fijo, **también en el orden de las claves** (vuelta 83): de eso
  // cuelga que deshacer/rehacer pueda comparar dos mapas con un `stringify`.
  const una = sanearMapa(conElMuro({ barrera: 'cristal' })).mapa
  const dos = sanearMapa(una).mapa
  afirmar(JSON.stringify(una) === JSON.stringify(dos), 'sanear dos veces da lo mismo byte a byte')
  afirmar(JSON.stringify(una.boxes[0]).indexOf('"barrera"') > JSON.stringify(una.boxes[0]).indexOf('"kind"'),
    `y la clave se emite tras «kind»: ${JSON.stringify(una.boxes[0])}`)
}

// ---------------------------------------------------------------- [2] motor
console.log('\n[2] El motor: fuera de `occluders`, las dos igual')
const rayo = new THREE.Raycaster()
const veDeVerdad = (esc) => {
  rayo.set(A, new THREE.Vector3(0, 0, -1))
  rayo.far = 16
  const golpes = rayo.intersectObjects(esc.occluders, false)
  rayo.far = Infinity
  return golpes.length
}
afirmar(veDeVerdad(control) === 1, `el rayo del control choca con el muro: ${veDeVerdad(control)} impacto(s)`)

for (const acabado of COVER.barrera.acabados) {
  const esc = montar(conElMuro({ barrera: acabado }))
  afirmar(esc.occluders.length === 0,
    `«${acabado}»: 0 montones en occluders (control ${control.occluders.length})`)
  afirmar(hasLineOfSight(A, B, esc.occluders), `«${acabado}»: no corta la vista`)
  afirmar(veDeVerdad(esc) === 0, `«${acabado}»: no para el rayo de un disparo`)
}
{
  // Y lo que las separa es **sólo** que una se dibuja: mismo mundo, misma
  // colisión. Si algún día una de las dos entrara en occluders, esta fila se cae.
  //
  // Desde la vuelta 96 la caja **nombra su acabado** (`barrera`), que es lo que
  // deja que `cortarSegmento` la salte, así que comparar el JSON entero ya no
  // compara la colisión: compara también la etiqueta. Se compara sin ella, y se
  // afirma aparte que las dos la llevan — que es la mitad que de verdad importa.
  const cristal = montar(conElMuro({ barrera: 'cristal' }))
  const invisible = montar(conElMuro({ barrera: 'invisible' }))
  const sinEtiqueta = (esc) => JSON.stringify(esc.boxes.map(({ barrera, ...resto }) => resto))
  afirmar(sinEtiqueta(cristal) === sinEtiqueta(invisible),
    'cristal e invisible montan exactamente la misma colisión')
  afirmar(cristal.boxes.every((b) => b.barrera) && invisible.boxes.every((b) => b.barrera),
    'y las dos cajas se declaran barrera, que es lo que las deja pasar a lo que vuela')
}

// -------------------------------------------------- [3] y sí para el cuerpo
console.log('\n[3] Y sí para el cuerpo')
const cristal = montar(conElMuro({ barrera: 'cristal' }))
const invisible = montar(conElMuro({ barrera: 'invisible' }))
/**
 * El mismo barrido por eje que hace el movimiento, con **su** firma
 * —`(eje, de, a, otroEje, pies, cabeza)`— y no la que uno se imagina: la primera
 * versión de este banco pasaba siete argumentos con el radio al final, así que
 * `from` valía 0 y el jugador «andaba» desde dentro del muro hacia fuera. Salía
 * 8.0000 contra 8.0000 y **en verde**, que es el 100% sin denominador de la
 * vuelta 46: dos números iguales y los dos equivocados.
 */
const andarHastaElMuro = (esc) => {
  let z = 8
  for (let i = 0; i < 400; i++) {
    const siguiente = esc.resolveAxis('z', z, z - 0.05, 0, 0, 1.7)
    if (Math.abs(siguiente - (z - 0.05)) > 1e-9) return siguiente
    z = siguiente
  }
  return z
}
const paradaControl = andarHastaElMuro(control)
const cara = 0.5 + COVER.playerRadius
afirmar(Math.abs(paradaControl - cara) < 1e-9,
  `la premisa: contra una pieza normal se para en ${paradaControl.toFixed(4)} (cara + radio = ${cara})`)
for (const [nombre, esc] of [['cristal', cristal], ['invisible', invisible]]) {
  const parada = andarHastaElMuro(esc)
  afirmar(Math.abs(parada - paradaControl) < 1e-9,
    `«${nombre}»: se para en el mismo sitio, ${parada.toFixed(4)}`)
}
{
  // Por arriba se pisa, como cualquier pieza: es una pared, y una pared tiene
  // techo. De ahí que el editor avise si mide menos que un salto.
  const alto = cristal.groundHeightAt(0, 0, 2.0)
  afirmar(Math.abs(alto - coverHeight('media')) < 1e-9,
    `y por arriba es suelo: groundHeightAt da ${alto.toFixed(4)} (media = ${coverHeight('media')})`)
}

console.log(`\n${fallos === 0 ? 'VERDE' : `ROJO — ${fallos} fallo(s)`}`)
process.exit(fallos === 0 ? 0 : 1)
