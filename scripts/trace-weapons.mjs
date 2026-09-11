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

const WEAPONS = ['axis-7', 'vertex-9', 'scalar-2']

/**
 * Fracción del ancho del arma que ocupa el silenciador de la Scalar-2, medida
 * sobre la referencia. La variante sin silenciador comprime esa zona.
 */
const SCALAR_BARREL_SPLIT = 0.57
/** Cuánto queda de esa zona al acortar el cañón. */
const SCALAR_BARREL_SHRINK = 0.13

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

/**
 * Acorta el cañón comprimiendo todo lo que quede por delante del corte. Es una
 * deformación del trazado real, no un dibujo nuevo: el cuerpo del arma queda
 * intacto y sólo se encoge la zona del silenciador.
 */
function shortenBarrel(d, bounds) {
  const split = bounds.minX + bounds.width * SCALAR_BARREL_SPLIT
  return mapPath(d, (x, y) => [
    x < split ? split - (split - x) * SCALAR_BARREL_SHRINK : x,
    y,
  ])
}

const traced = {}
for (const key of WEAPONS) {
  const mask = await buildMask(resolve(SOURCE_DIR, `${key}.png`))
  const d = await traceToPath(mask)
  traced[key] = { d, bounds: boundsOf(d) }
  const { width, height } = traced[key].bounds
  console.log(`${key.padEnd(10)} ${d.length} caracteres | caja ${Math.round(width)}x${Math.round(height)} px`)
}

// La Scalar-2 sin silenciador sale del trazado real, no de un dibujo aparte.
const plain = shortenBarrel(traced['scalar-2'].d, traced['scalar-2'].bounds)
traced['scalar-2-plain'] = { d: plain, bounds: boundsOf(plain) }
console.log(`${'scalar-2-plain'.padEnd(10)} derivada: caja ${Math.round(traced['scalar-2-plain'].bounds.width)}x${Math.round(traced['scalar-2-plain'].bounds.height)} px`)

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
 * \`scalar-2-plain\` se deriva del trazado con silenciador comprimiendo la zona
 * del cañón.
 */
export const WEAPON_PATHS = {
${entries.join('\n')}
}
`

mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, file)
console.log(`\nescrito ${OUTPUT} (${(file.length / 1024).toFixed(1)} KB), encuadre ${Math.round(frameWidth)}x${Math.round(frameHeight)}`)
