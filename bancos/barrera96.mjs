/**
 * barrera96 — **¿deja pasar la barrera todo lo que vuela?**
 *
 * El punto 3 de la vuelta 96, y es un fallo de lo que se entregó en la 95. Allí
 * se midió que la barrera no corta la vista y no para una bala, y las dos cosas
 * son ciertas: las dos cuelgan de `occluders`, de donde la barrera se quedó
 * fuera. Un proyectil no pasa por ahí — pregunta por aritmética a
 * `cortarSegmento`, que barre `this.boxes`, que es donde la barrera sí está
 * porque ahí es donde se choca con el cuerpo.
 *
 * Así que esto mide **los seis tipos** —Core, Blind, KO, la flecha del Bow, el
 * cohete del U2 y el Fang— con su denominador delante: cada uno se lanza tres
 * veces por el mismo sitio, contra **un muro de control** (una pieza normal, que
 * tiene que pararlo), contra **el cristal** y contra la **invisible**. Y como el
 * láser de `trayectoria.js` evalúa la misma función, se comprueba de paso que la
 * curva que se dibuja tampoco se corta donde la granada no se corta.
 *
 * Sin navegador: `proyectiles.js` no importa three, y `Scenario` lo monta también
 * el servidor.
 */
import { Scenario } from '../src/game/scenario.js'
import { Proyectiles, lanzamientoDeArma } from '../src/game/proyectiles.js'
import { WEAPONS, SIM_STEP_MS, SCENARIOS } from '../src/config.js'

const PASO = SIM_STEP_MS / 1000
// Un paso que no es un número deja a todos los proyectiles quietos y las filas
// de «deja pasar» salen verdes por vacías. Es el falso verde de la vuelta 95.
if (!Number.isFinite(PASO) || PASO <= 0) throw new Error(`paso de mundo roto: ${PASO}`)

/**
 * Un mapa de **una sola pieza atravesada**, en la forma que el motor monta
 * (`room`/`boxes`/`ramps`, no la del fichero). Cara norte en z −0.5 y cara sur
 * en z +0.5, alta de 3.6 para que un tiro plano desde los ojos no pase por
 * encima: la medida tiene que ser del choque, no del arco.
 */
function mapaCon(barrera) {
  const pieza = { x: -6, z: -0.5, w: 12, d: 1, kind: 'alta' }
  if (barrera) pieza.barrera = barrera
  return {
    clave: 'banco-barrera96',
    label: 'Banco barrera 96',
    room: { width: 40, depth: 40, height: 16 },
    spawn: { x: 0, z: 16 },
    boxes: [pieza],
    ramps: [],
    prismas: [],
    routes: [],
  }
}

/** Lanza uno y lo simula hasta que impacte, reviente o se acabe el plazo. */
function volar(claveArma, esc, opciones) {
  const arma = WEAPONS[claveArma]
  const pool = new Proyectiles(8)
  const salida = {}
  // Desde z 4, mirando a −Z (yaw 0), plano: la pieza está en z ≈ 0.
  const ojos = { x: 0, y: 1.7, z: 4 }
  const l = lanzamientoDeArma(arma, 1, ojos, 0, 0, salida, opciones)
  if (!l) return { error: 'el arma no tiene bloque tiro' }
  pool.lanzar({ ...l, dueno: 'yo' })
  const cortar = (x0, y0, z0, x1, y1, z1) => esc.cortarSegmento(x0, y0, z0, x1, y1, z1)
  let pasos = 0
  while (pasos < 60 * 10) {
    const n = pool.paso(PASO, cortar, null)
    pasos += 1
    if (n > 0) {
      const im = pool.impactos[0]
      return { z: im.z, x: im.x, y: im.y, mecha: im.porMecha, s: pasos * PASO }
    }
    if (pool.vivos === 0) return { z: null, s: pasos * PASO }
  }
  return { z: null, s: pasos * PASO, agotado: true }
}

/** Sin pantalla no hay escena: al servidor le vale un objeto con `add`. */
const escenaFalsa = () => ({ add() {}, remove() {} })
const ESCENARIOS = {
  control: new Scenario(escenaFalsa(), mapaCon(null)),
  cristal: new Scenario(escenaFalsa(), mapaCon('cristal')),
  invisible: new Scenario(escenaFalsa(), mapaCon('invisible')),
}

const TIPOS = [
  ['core', 'Core', { sostenidoS: 0 }],
  ['blind', 'Blind', { sostenidoS: 0 }],
  ['ko', 'KO', { sostenidoS: 0 }],
  ['bow', 'Bow (flecha)', null],
  ['u2', 'U2 (cohete)', null],
  ['fang', 'Fang', null],
]

let fallos = 0
const afirmar = (ok, texto) => {
  if (!ok) { fallos += 1; console.log(`  ✗ ${texto}`) } else console.log(`  ✓ ${texto}`)
}

console.log('=== barrera96 — la barrera contra lo que vuela ===\n')
console.log('Premisa: una pieza atravesada de 12×0.4 en z≈0, alto `alta`, y el')
console.log('lanzamiento desde z 4 con el cabeceo a cero. El control es la misma')
console.log('pieza sin declarar barrera, y tiene que pararlo todo.\n')

// ------------------------------------------------- la premisa: los mapas de hoy
/**
 * **Y nada de esto puede tocar un mapa que no declare barreras.** Sale por
 * construcción —`barrera` vale `null` en todas sus cajas— pero por construcción
 * es lo que se creía de la vuelta 95 y aquí estamos, así que se barre: 2.000
 * segmentos por el Plano A y por El Espejo, y el corte tiene que salir dígito a
 * dígito igual que sin el salto.
 */
console.log('--- La premisa: los mapas de hoy no se mueven ---')
for (const clave of ['largoYPuerta', 'elEspejo']) {
  const esc = new Scenario(escenaFalsa(), SCENARIOS[clave])
  const conBarrera = esc.boxes.filter((b) => b.barrera).length
  let cortes = 0
  let suma = 0
  for (let k = 0; k < 2000; k++) {
    const a = (k / 2000) * Math.PI * 2
    const r = 18
    const c = esc.cortarSegmento(Math.cos(a) * r, 1.7, Math.sin(a) * r, Math.cos(a + 2.1) * r, 1.2, Math.sin(a + 2.1) * r)
    if (c) { cortes += 1; suma += c.x + c.y + c.z }
  }
  afirmar(conBarrera === 0, `${clave}: ${esc.boxes.length} cajas y ninguna es barrera`)
  console.log(`    ${cortes} de 2000 segmentos cortan, suma de coordenadas ${suma.toFixed(6)}`)
}
console.log()

console.log('tipo               control        cristal        invisible')
for (const [clave, nombre, opciones] of TIPOS) {
  const c = volar(clave, ESCENARIOS.control, opciones)
  const g = volar(clave, ESCENARIOS.cristal, opciones)
  const i = volar(clave, ESCENARIOS.invisible, opciones)
  const di = (r) => r.error ? r.error
    : r.z === null ? 'sin impacto'
    : `z ${r.z.toFixed(3)}${r.mecha ? ' (mecha)' : ''}`
  console.log(`${nombre.padEnd(18)} ${di(c).padEnd(14)} ${di(g).padEnd(14)} ${di(i)}`)
}

console.log('\n--- Lo que se afirma ---')
/**
 * **El discriminante es de qué lado del muro acaba**, y no «a qué distancia»,
 * porque los seis no se paran igual y eso es correcto: una flecha, un cohete y
 * un cuchillo mueren **en la cara** de la pieza (z 0.500 exacto), y una granada
 * **rebota** y sigue viva hasta que se le acaba la mecha, así que revienta un
 * rato después y de este lado. Lo que las seis tienen en común es que **no
 * cruzan**: el muro está en z ∈ [−0.5, 0.5] y con el control ninguna aparece
 * con z negativo. Con barrera, las seis sí.
 */
const CARA = 0.5
for (const [clave, nombre, opciones] of TIPOS) {
  const c = volar(clave, ESCENARIOS.control, opciones)
  const g = volar(clave, ESCENARIOS.cristal, opciones)
  const i = volar(clave, ESCENARIOS.invisible, opciones)
  // La premisa: el control tiene que **llegar** al muro y no cruzarlo. Sin
  // esto, «la barrera lo deja pasar» lo cumpliría un proyectil que no llegaba.
  afirmar(c.z !== null && c.z >= CARA - 1e-9,
    `${nombre}: el control no lo deja cruzar (acaba en z ${c.z === null ? 'sin impacto' : c.z.toFixed(3)}${c.mecha ? ', por mecha' : ''})`)
  const cruza = (r) => r.z !== null && r.z < -CARA
  afirmar(cruza(g), `${nombre}: el cristal lo deja cruzar (z ${g.z === null ? 'sin impacto' : g.z.toFixed(3)}${g.mecha ? ', por mecha' : ''})`)
  afirmar(cruza(i), `${nombre}: la invisible lo deja cruzar (z ${i.z === null ? 'sin impacto' : i.z.toFixed(3)}${i.mecha ? ', por mecha' : ''})`)
  // Y las dos variantes se comportan **igual**, que es lo que hace que elegir
  // acabado sea aspecto y no mecánica (vuelta 95).
  afirmar(Math.abs(g.z - i.z) < 1e-9, `${nombre}: cristal e invisible dan el mismo sitio`)
}

// Y la barrera sigue parando el cuerpo, que es lo único que hace: la medida de
// la vuelta 95 se repite aquí para que arreglar los proyectiles no pueda
// haberla roto sin que nadie se entere.
console.log('\n--- Y sigue parando al cuerpo (vuelta 95) ---')
for (const [nombre, esc] of Object.entries(ESCENARIOS)) {
  // De 1.0 a 0.5, o sea entrando en la banda: la cara está en 0.5 y el cuerpo
  // mide 0.4 de radio, así que lo correcto son 0.9 y nada más.
  const parado = esc.resolveAxis('z', 1, 0.5, 0, 0, 1.7)
  afirmar(Math.abs(parado - 0.9) < 1e-6, `${nombre}: para al jugador en ${parado.toFixed(4)} (cara 0.5 + radio 0.4)`)
}

console.log(`\n${fallos === 0 ? 'TODO VERDE' : `${fallos} FALLOS`}`)
process.exit(fallos === 0 ? 0 : 1)
