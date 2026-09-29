/**
 * estampado93 — el primer asset externo del proyecto, con sus límites puestos.
 *
 *  [1] La ruta va acotada: un mapa no puede hacer que el juego pida lo que sea.
 *  [2] Los dos topes se aplican **y se dicen**: dos imágenes y cuatro colocados.
 *  [3] No es geometría: fuera de `occluders`, sin colisión, sin recibir rayos y
 *      **un mapa igual sin sus estampados** — que es lo que garantiza que un
 *      logo no pueda parar una bala ni tapar una aparición.
 *  [4] Y el editor y el motor encaran la misma cara. Dos tablas de rotaciones es
 *      un logo colocado en una pared y dibujado en otra.
 */
import { ESTAMPADOS, SCENARIOS, esImagenDeEstampado } from '../src/config.js'
import { Scenario } from '../src/game/scenario.js'
import { sanearMapa } from '../src/maps/formato.js'
import { readFileSync } from 'node:fs'

let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}
const escenaFalsa = () => ({ add() {}, remove() {} })
const montar = (definicion) => new Scenario(escenaFalsa(), definicion)
const base = { clave: 'x93', label: 'x93', room: { width: 40, depth: 40, height: 10 }, spawn: { x: 0, z: 17 } }

// ---------------------------------------------------------------- [1] la ruta
console.log('\n[1] La ruta va acotada a su carpeta')
const RUTAS = [
  ['/estampados/nike.webp', true],
  ['/estampados/logo.png', true],
  ['/estampados/sub/logo.webp', true],
  ['/fondos/ciudad.jpg', false],
  ['https://otro.sitio/logo.png', false],
  ['/estampados/../../etc/passwd', false],
  ['/estampados/script.js', false],
  ['/estampados/logo', false],
  [42, false],
  [null, false],
]
for (const [ruta, vale] of RUTAS) {
  afirmar(esImagenDeEstampado(ruta) === vale,
    `${JSON.stringify(ruta)} → ${esImagenDeEstampado(ruta) ? 'admitida' : 'rechazada'}`)
}

// ---------------------------------------------------------------- [2] topes
console.log('\n[2] Los dos topes se aplican y se dicen')
const muchos = sanearMapa({
  ...base,
  estampados: [
    { imagen: '/estampados/a.webp', cara: 'norte', x: 0, y: 2, z: -19, ancho: 8, alto: 3 },
    { imagen: '/estampados/b.webp', cara: 'suelo', x: 0, y: 0.02, z: 0, ancho: 4, alto: 4 },
    { imagen: '/estampados/a.webp', cara: 'este', x: -19, y: 2, z: 0, ancho: 4, alto: 2 },
    { imagen: '/estampados/c.webp', cara: 'sur', x: 0, y: 2, z: 19, ancho: 4, alto: 2 },
    { imagen: '/estampados/a.webp', cara: 'techo', x: 0, y: 9, z: 0, ancho: 4, alto: 2 },
    { imagen: 'http://mal/x.png', cara: 'norte', x: 0, y: 2, z: 0 },
  ],
})
console.log(`    problemas:\n      ${muchos.problemas.join('\n      ')}`)
afirmar(muchos.mapa.estampados.length <= ESTAMPADOS.colocadosMax,
  `no pasan de ${ESTAMPADOS.colocadosMax} colocados: quedan ${muchos.mapa.estampados.length}`)
const imagenes = [...new Set(muchos.mapa.estampados.map((e) => e.imagen))]
afirmar(imagenes.length <= ESTAMPADOS.imagenesMax,
  `ni de ${ESTAMPADOS.imagenesMax} imágenes distintas: ${imagenes.length} (${imagenes.join(', ')})`)
afirmar(muchos.problemas.some((p) => /sólo caben \d+ colocados/.test(p)), 'y el tope de colocados se dice')
afirmar(muchos.problemas.some((p) => /sólo caben \d+ imágenes/.test(p)), 'y el de imágenes también')
afirmar(muchos.problemas.some((p) => /tiene que estar en/.test(p)), 'y la ruta rechazada, con su motivo')
afirmar(muchos.mapa.estampados.every((e) => esImagenDeEstampado(e.imagen)),
  'y ninguna de las que quedan tiene una ruta inventada')

// Cara desconocida: no tira el estampado, cae a la de fábrica y se dice.
const caraMala = sanearMapa({
  ...base,
  estampados: [{ imagen: '/estampados/a.webp', cara: 'diagonal', x: 0, y: 2, z: 0 }],
})
afirmar(caraMala.mapa.estampados.length === 1, 'una cara desconocida no tira el estampado')
afirmar(caraMala.mapa.estampados[0].cara === ESTAMPADOS.porDefecto.cara,
  `cae a la de fábrica: «${caraMala.mapa.estampados[0].cara}»`)
afirmar(caraMala.problemas.some((p) => /cara desconocida/.test(p)), 'y se dice')

// Punto fijo, que es de lo que cuelga deshacer/rehacer (vuelta 83).
const unaVez = sanearMapa(muchos.mapa).mapa
afirmar(JSON.stringify(unaVez) === JSON.stringify(sanearMapa(unaVez).mapa),
  'y sanear dos veces da lo mismo byte a byte')

// --------------------------------------------------------- [3] no es geometría
console.log('\n[3] No es geometría, y el mapa es el mismo sin ellos')
const conLogos = sanearMapa({
  ...SCENARIOS.largoYPuerta,
  estampados: [{ imagen: '/estampados/a.webp', cara: 'norte', x: 0, y: 2, z: -19, ancho: 8, alto: 3 }],
}).mapa
const sinLogos = sanearMapa(SCENARIOS.largoYPuerta).mapa
const a = montar(conLogos)
const b = montar(sinLogos)
afirmar(a.occluders.length === b.occluders.length,
  `los oclusores no cambian: ${a.occluders.length} y ${b.occluders.length}`)
afirmar(a.boxes.length === b.boxes.length && a.ramps.length === b.ramps.length
  && a.prismas.length === b.prismas.length,
  `ni la colisión: ${a.boxes.length} cajas, ${a.ramps.length} rampas, ${a.prismas.length} prismas`)
// El suelo, punto por punto: la prueba de que un logo no es un sitio donde pisar.
let discrepancias = 0
for (let x = -19; x <= 19; x += 1.3) {
  for (let z = -19; z <= 19; z += 1.3) {
    if (a.groundHeightAt(x, z, 4) !== b.groundHeightAt(x, z, 4)) discrepancias++
  }
}
afirmar(discrepancias === 0, `y el suelo da lo mismo en los ${30 * 30} puntos barridos (${discrepancias} discrepancias)`)
afirmar(Boolean(a.estampados), 'el escenario monta su grupo de estampados, aparte de la geometría')
/**
 * **Y en Node no monta ninguno**, que es lo que este brazo vino a encontrar:
 * `Scenario` lo monta también el servidor (`net/partida.js`) y `TextureLoader`
 * pide un `document` para crear su `<img>`, así que un mapa con un logo **tiraba
 * el huésped al montarse**. Un estampado es dibujo, y el servidor no dibuja —
 * la misma decisión que la Blind (vuelta 87).
 */
afirmar(a.estampados.grupo.children.length === 0,
  `sin pantalla no monta nada: ${a.estampados.grupo.children.length} mallas en Node`)
a.dispose(); b.dispose()

// -------------------------------------------------------- [4] las dos tablas
console.log('\n[4] El editor y el motor encaran la misma cara')
const delMotor = readFileSync('src/game/estampados.js', 'utf8')
const delEditor = readFileSync('editor/editor.js', 'utf8')
const rotacionesDe = (texto, nombre) => {
  const bloque = texto.slice(texto.indexOf(nombre))
  const out = {}
  for (const cara of ESTAMPADOS.caras) {
    const m = new RegExp(`${cara}:[^\\n]*rotacion:\\s*\\[([^\\]]+)\\]`).exec(bloque)
    if (m) out[cara] = m[1].replace(/\s+/g, '')
  }
  return out
}
const motor = rotacionesDe(delMotor, 'const CARAS = {')
const editor = rotacionesDe(delEditor, 'const CARAS_DE_ESTAMPADO = {')
afirmar(Object.keys(motor).length === ESTAMPADOS.caras.length,
  `el motor declara las ${ESTAMPADOS.caras.length} caras: ${Object.keys(motor).join(', ')}`)
afirmar(JSON.stringify(motor) === JSON.stringify(editor),
  `y el editor las mismas rotaciones: ${JSON.stringify(motor) === JSON.stringify(editor) ? 'idénticas' : JSON.stringify({ motor, editor })}`)

console.log(`\n${fallos === 0 ? 'TODO VERDE' : `${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
