/**
 * Vectoriza las referencias de armas con potrace y genera src/ui/weaponPaths.js.
 *
 * Script puntual: NO forma parte del build. Se ejecuta a mano con
 * `npm run trace:weapons` cuando cambian las imágenes de `Reference/Weapons/`,
 * y lo que se versiona es su salida, de modo que ni potrace ni las imágenes
 * llegan al navegador.
 *
 * Las referencias vienen con el arma recortada sobre fondo transparente, así
 * que la máscara que se le da a potrace sale del canal alfa: opaco es arma,
 * transparente es fondo. Es un umbral exacto, no una interpretación del color,
 * y por eso el contorno resultante es el del recorte y no una lectura mía de
 * la silueta.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Jimp from 'jimp'
import potrace from 'potrace'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = resolve(ROOT, 'Reference/Weapons')
const OUTPUT = resolve(ROOT, 'src/ui/weaponPaths.js')

/** Píxeles con alfa por debajo de esto cuentan como fondo. */
const ALPHA_THRESHOLD = 128

const POTRACE_OPTIONS = {
  threshold: 128,
  blackOnWhite: true,
  // Descarta motas sueltas del recorte sin comerse detalles reales.
  turdSize: 24,
  // Menos nodos, curvas más limpias: a tamaño de HUD el detalle fino sobra.
  alphaMax: 1,
  optCurve: true,
  optTolerance: 0.4,
  turnPolicy: potrace.Potrace.TURNPOLICY_MINORITY,
}

/**
 * Cada entrada es una silueta a vectorizar. `matchHeightOf` escala el trazado
 * para que su altura coincida con la de otra: las dos variantes de Scalar-2
 * son la misma pistola fotografiada aparte, así que sin esto el interruptor
 * del silenciador la cambiaría de tamaño.
 */
const WEAPONS = [
  { key: 'axis-7', file: 'axis-7.png' },
  { key: 'vertex-9', file: 'vertex-9.png' },
  { key: 'scalar-2', file: 'scalar-2.png' },
  { key: 'scalar-2-plain', file: 'scalar-2-nonsilenced.png', matchHeightOf: 'scalar-2' },
]

/** Máscara en blanco y negro a partir del alfa del recorte. */
async function buildMask(file) {
  const image = await Jimp.read(file)
  const { data } = image.bitmap
  for (let i = 0; i < data.length; i += 4) {
    const opaque = data[i + 3] >= ALPHA_THRESHOLD
    const value = opaque ? 0 : 255
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }
  return image.getBufferAsync(Jimp.MIME_PNG)
}

function traceToPath(buffer) {
  return new Promise((resolvePath, reject) => {
    const tracer = new potrace.Potrace(POTRACE_OPTIONS)
    tracer.loadImage(buffer, (error) => {
      if (error) return reject(error)
      // `getPathTag` devuelve sólo el trazado, sin el <svg> que lo envuelve.
      const tag = tracer.getPathTag()
      const match = /\sd="([^"]+)"/.exec(tag)
      if (!match) return reject(new Error('potrace no devolvió datos de trazado'))
      resolvePath(match[1])
    })
  })
}

/**
 * Recorre las coordenadas de un trazado absoluto (M/L/C/Z, que es lo que
 * emite potrace) y llama a `visit(x, y)` con cada par. Si `visit` devuelve un
 * par nuevo, se escribe en su sitio.
 */
function mapPath(d, visit) {
  const tokens = d.match(/[MLCZmlczHhVv]|-?[\d.]+(?:e-?\d+)?/g) ?? []
  const output = []
  let command = null
  let pending = []

  const flushPair = () => {
    const [x, y] = pending
    const replaced = visit(x, y)
    output.push(replaced ? replaced[0] : x, replaced ? replaced[1] : y)
    pending = []
  }

  for (const token of tokens) {
    if (/[A-Za-z]/.test(token)) {
      if (/[hvHV]/.test(token)) throw new Error(`Comando no soportado: ${token}`)
      if (/[mlcz]/.test(token)) throw new Error(`Trazado relativo no soportado: ${token}`)
      command = token
      output.push(token)
      continue
    }
    if (command === 'Z') throw new Error('Coordenadas tras Z')
    pending.push(Number(token))
    if (pending.length === 2) flushPair()
  }
  if (pending.length) throw new Error('Coordenadas sueltas al final del trazado')

  // Reconstruye con los comandos en su sitio.
  return output
    .map((item) => (typeof item === 'number' ? +item.toFixed(2) : item))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function boundsOf(d) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  mapPath(d, (x, y) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  })
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/** Escala un trazado alrededor del centro de su caja. */
function scalePath(d, bounds, factor) {
  const centerX = bounds.minX + bounds.width / 2
  const centerY = bounds.minY + bounds.height / 2
  return mapPath(d, (x, y) => [
    centerX + (x - centerX) * factor,
    centerY + (y - centerY) * factor,
  ])
}

const traced = {}
for (const { key, file, matchHeightOf } of WEAPONS) {
  const mask = await buildMask(resolve(SOURCE_DIR, file))
  let d = await traceToPath(mask)
  let bounds = boundsOf(d)

  if (matchHeightOf) {
    // Las fotos están encuadradas de forma distinta, así que el tamaño en
    // píxeles no dice nada del tamaño real. Igualar la altura con la otra
    // variante es lo que mantiene la misma arma del mismo tamaño.
    const factor = traced[matchHeightOf].bounds.height / bounds.height
    d = scalePath(d, bounds, factor)
    bounds = boundsOf(d)
    console.log(`${key.padEnd(14)} escalada x${factor.toFixed(3)} para igualar a ${matchHeightOf}`)
  }

  traced[key] = { d, bounds }
  console.log(`${key.padEnd(14)} ${d.length} caracteres | caja ${Math.round(bounds.width)}x${Math.round(bounds.height)} px`)
}

// Un único encuadre para las cuatro, con margen: así conservan su tamaño
// relativo —una pistola no se ve tan larga como un fusil— y se centran solas.
const PADDING = 1.06
const frameWidth = Math.max(...Object.values(traced).map((t) => t.bounds.width)) * PADDING
const frameHeight = Math.max(...Object.values(traced).map((t) => t.bounds.height)) * PADDING

const entries = Object.entries(traced).map(([key, { d, bounds }]) => {
  const centerX = bounds.minX + bounds.width / 2
  const centerY = bounds.minY + bounds.height / 2
  const viewBox = [
    +(centerX - frameWidth / 2).toFixed(2),
    +(centerY - frameHeight / 2).toFixed(2),
    +frameWidth.toFixed(2),
    +frameHeight.toFixed(2),
  ].join(' ')
  return `  '${key}': {\n    viewBox: '${viewBox}',\n    d: '${d}',\n  },`
})

const file = `/**
 * GENERADO por scripts/trace-weapons.mjs — no editar a mano.
 *
 * Contornos vectorizados con potrace a partir de las referencias recortadas de
 * \`Reference/Weapons/\`. La máscara sale del canal alfa, así que el trazado es
 * el del recorte y no una interpretación de la forma.
 *
 * Las cuatro entradas comparten el tamaño de \`viewBox\` y sólo cambian de
 * origen, de modo que se dibujan a la misma escala y cada una queda centrada.
 * Las dos variantes de Scalar-2 salen de fotos distintas de la misma pistola,
 * así que la versión sin silenciador se escala para que su altura coincida con
 * la silenciada y el interruptor no la cambie de tamaño.
 */
export const WEAPON_PATHS = {
${entries.join('\n')}
}
`

mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, file)
console.log(`\nescrito ${OUTPUT} (${(file.length / 1024).toFixed(1)} KB), encuadre ${Math.round(frameWidth)}x${Math.round(frameHeight)}`)
