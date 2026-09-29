/**
 * rampa93 — las dos formas de subir un nivel, sin navegador.
 *
 *  [0] **La premisa, antes de nada**: los mapas de hoy se montan **idénticos**.
 *      Una rampa que subía en Z tiene que seguir subiendo exactamente igual, o
 *      todo lo demás de esta vuelta mide un juego distinto.
 *  [1] Una rampa sube en los cuatro rumbos, y su superficie es la misma recta.
 *  [2] La escalera se despliega en cajas, y **ninguna pasa de `stepHeight`** —
 *      que es lo que significa «se sube andando», y sale por construcción.
 *  [3] Y se sube de verdad: se camina por la rampa y por la escalera contra el
 *      `groundHeightAt` del motor, que es el que decide el suelo.
 */
import { COVER, SCENARIOS, coverHeight } from '../src/config.js'
import { Scenario } from '../src/game/scenario.js'
import { cajasDeEscalera, escalonesMinimos, medidasDeEscalera } from '../src/maps/escalera.js'
import { sanearMapa } from '../src/maps/formato.js'

let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}

// `Scenario` necesita una escena de three; con un grupo de pega basta, porque
// lo que se mide es la colisión y ésa no dibuja nada.
const escenaFalsa = () => ({ add() {}, remove() {} })
const montar = (definicion) => new Scenario(escenaFalsa(), definicion)

// ------------------------------------------------------------ [0] la premisa
console.log('\n[0] Los mapas de hoy se montan idénticos')
const plano = montar(SCENARIOS.largoYPuerta)
const rampasDePlano = plano.ramps.map((r) => ({ ...r }))
afirmar(rampasDePlano.length === 2, `el Plano A trae sus dos rampas: ${rampasDePlano.length}`)
afirmar(rampasDePlano.every((r) => r.eje === 'z'),
  `y las dos suben en Z, que es lo que declaran: ${rampasDePlano.map((r) => r.eje).join(', ')}`)
/**
 * **Se sube andando, así que se mide andando.** `groundHeightAt` acota lo que
 * admite a `feetY + COVER.stepHeight` —lo que se sube sin saltar—, así que
 * preguntarle la altura de media rampa con los pies en el suelo devuelve 0 y con
 * razón: desde ahí no se llega. La primera versión de este banco lo preguntaba
 * así y salió en rojo **también con el Plano A de siempre delante**, que es
 * justo la señal de la §4 de `CLAUDE.md`: rojo con el viejo y con el nuevo es
 * otra cosa, y esa otra cosa era el banco.
 *
 * Lo que se hace es caminar: cada muestra se pregunta con los pies donde los
 * dejó la anterior, que es lo que hace el movimiento de verdad.
 */
const caminar = (esc, puntos) => {
  const alturas = []
  let pies = 0
  for (const [x, z] of puntos) {
    pies = Math.max(esc.groundHeightAt(x, z, pies), 0)
    alturas.push(pies)
  }
  return alturas
}
const recta = (x0, z0, x1, z1, n) => Array.from({ length: n }, (_, i) => {
  const t = i / (n - 1)
  return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]
})
const perfil = (esc, x, z0, z1, n = 61) =>
  caminar(esc, recta(x, z0, x, z1, n)).map((v) => v.toFixed(4))
const perfilDePlano = perfil(plano, 17.5, -6, -12)
console.log(`    perfil de la rampa este: ${perfilDePlano.filter((_, i) => i % 12 === 0).join(' ')}`)
afirmar(perfilDePlano[0] === '0.0000' && perfilDePlano.at(-1) === coverHeight('plataforma').toFixed(4),
  'sube de 0 a la plataforma, como siempre')
afirmar(perfilDePlano.every((v, i) => i === 0 || Number(v) >= Number(perfilDePlano[i - 1])),
  'y no baja en ningún punto')

// ---------------------------------------------------------- [1] los cuatro
console.log('\n[1] Una rampa sube en los cuatro rumbos')
const sala = { width: 40, depth: 40, height: 10 }
const conRampa = (rampa) => montar(sanearMapa({
  clave: 'r93', label: 'r93', room: sala, spawn: { x: 0, z: 17 }, ramps: [rampa],
}).mapa)

const CUATRO = [
  ['+Z', { x: -1.5, z: 0, w: 3, d: 6, fromZ: 0, toZ: 6, top: 'plataforma' }, [0, 0, 0, 6]],
  ['-Z', { x: -1.5, z: 0, w: 3, d: 6, fromZ: 6, toZ: 0, top: 'plataforma' }, [0, 6, 0, 0]],
  ['+X', { x: 0, z: -1.5, w: 6, d: 3, fromX: 0, toX: 6, top: 'plataforma' }, [0, 0, 6, 0]],
  ['-X', { x: 0, z: -1.5, w: 6, d: 3, fromX: 6, toX: 0, top: 'plataforma' }, [6, 0, 0, 0]],
]
const perfiles = []
for (const [nombre, rampa, camino] of CUATRO) {
  const esc = conRampa(rampa)
  const p = caminar(esc, recta(...camino, 61)).map((v) => v.toFixed(4))
  perfiles.push(p)
  console.log(`    ${nombre}: ${p.filter((_, i) => i % 12 === 0).join(' ')}`)
  afirmar(p[0] === '0.0000' && p.at(-1) === coverHeight('plataforma').toFixed(4),
    `${nombre} sube de 0 a ${coverHeight('plataforma')}`)
}
afirmar(perfiles.every((p) => JSON.stringify(p) === JSON.stringify(perfiles[0])),
  'y los cuatro perfiles son el mismo dígito a dígito: girar una rampa no la cambia')

// Sólida sólo por arriba: por debajo de su superficie no se pasa.
const esc = conRampa(CUATRO[0][1])
const subiendo = caminar(esc, recta(0, 0, 0, 3, 31))
const aMitad = subiendo.at(-1)
afirmar(aMitad > 0.5 && aMitad < coverHeight('plataforma'),
  `a mitad de la cuña los pies están a ${aMitad.toFixed(3)} u, o sea que es una cuña y no un escalón`)
afirmar(subiendo.every((v, i) => i === 0 || v >= subiendo[i - 1]),
  'y la subida es monótona: ningún paso baja')
/**
 * **Y desde el suelo no se llega a media cuña**, que es lo correcto y es la
 * premisa del párrafo de arriba: `groundHeightAt` acota a un escalón, así que
 * una rampa se sube recorriéndola y no teletransportándose a su mitad.
 */
afirmar(esc.groundHeightAt(0, 3, 0) === 0,
  'con los pies en el suelo, media rampa no es alcanzable: la acota el escalón')

// ------------------------------------------------------- [2] los escalones
console.log('\n[2] Una escalera no puede tener un escalón que no se suba andando')
const tope = COVER.stepHeight
const casos = [
  { alto: 2.6, escalones: 4, huella: 0.6 },
  { alto: 2.6, escalones: 40, huella: 0.4 },
  { alto: 0.6, escalones: 1, huella: 0.8 },
  { alto: 10, escalones: 5, huella: 0.5 },
]
for (const c of casos) {
  const e = { x: 0, z: 0, ancho: 3, rumbo: 0, base: 0, ...c }
  const m = medidasDeEscalera(e, tope)
  const cajas = cajasDeEscalera(e, tope)
  const subidas = cajas.map((caja, i) => caja.kind - (i === 0 ? e.base : cajas[i - 1].kind))
  const mayor = Math.max(...subidas)
  console.log(`    pedidos ${String(c.escalones).padStart(2)} para ${c.alto} u → ${m.escalones} escalones de ${m.subida.toFixed(3)} (mayor salto ${mayor.toFixed(3)})`)
  afirmar(mayor <= tope + 1e-9,
    `ningún escalón pasa de ${tope}: el mayor mide ${mayor.toFixed(4)}`)
  afirmar(cajas.length === m.escalones,
    `y la ficha dice los mismos que se montan: ${m.escalones} y ${cajas.length}`)
}
afirmar(escalonesMinimos(2.6, tope) === 11, `2.6 u pide 11 escalones: ${escalonesMinimos(2.6, tope)}`)
afirmar(medidasDeEscalera({ alto: 2.6, escalones: 4, huella: 0.6 }, tope).subidos,
  'y cuando se suben, se marca para que la ficha lo diga')
afirmar(!medidasDeEscalera({ alto: 2.6, escalones: 20, huella: 0.6 }, tope).subidos,
  'y cuando no, no')

// Cada escalón va del suelo a su altura: uno flotando dejaría pasar un disparo.
const cajas = cajasDeEscalera({ x: 0, z: 0, ancho: 3, alto: 2.6, escalones: 4, huella: 0.6, rumbo: 0, base: 0 }, tope)
afirmar(cajas.every((c) => c.base === 0), 'los escalones arrancan del suelo, no flotan')
afirmar(cajas.every((c, i) => i === 0 || c.kind > cajas[i - 1].kind), 'y cada uno es más alto que el anterior')

// ------------------------------------------------------------ [3] se sube
console.log('\n[3] Se sube: el suelo del motor lo dice')
const conEscalera = montar(sanearMapa({
  clave: 'e93', label: 'e93', room: sala, spawn: { x: 0, z: 17 },
  escaleras: [{ x: -1.5, z: 0, ancho: 3, alto: 2.6, escalones: 4, huella: 0.6, rumbo: 0 }],
}).mapa)
const m = medidasDeEscalera({ alto: 2.6, escalones: 4, huella: 0.6 }, tope)
// Hasta el último escalón, no un paso más allá: pasado el final se vuelve al
// suelo, y medir ahí diría «no sube» con la escalera subida entera detrás.
const alturas = caminar(conEscalera, recta(0, 0.001, 0, m.largo - 0.05, 67))
let mayorSalto = 0
for (const [i, y] of alturas.entries()) mayorSalto = Math.max(mayorSalto, y - (i ? alturas[i - 1] : 0))
afirmar(alturas.at(-1) > 2.5,
  `andando por la escalera se llega a ${alturas.at(-1).toFixed(3)} u de los 2.6`)
afirmar(mayorSalto <= tope + 1e-6,
  `y el mayor salto de un paso es ${mayorSalto.toFixed(4)}, por debajo de ${tope}`)
afirmar(conEscalera.hasGeometry, 'un mapa de sólo escalera tiene geometría (no monta con scenario nulo)')
afirmar(conEscalera.boxes.length === m.escalones,
  `y el motor la ve como ${conEscalera.boxes.length} caja(s), que son sus escalones`)

// Y la vuelta: un mapa con escaleras y sin nada más no se monta como la sala vacía.
const sinNada = montar(sanearMapa({ clave: 'v93', label: 'v93', room: sala, spawn: { x: 0, z: 17 } }).mapa)
afirmar(!sinNada.hasGeometry, 'y un mapa vacío sigue sin tener geometría')

console.log(`\n${fallos === 0 ? 'TODO VERDE' : `${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
