/**
 * Vectorización con potrace: lo que comparten los dos scripts de trazado
 * (`trace-weapons.mjs` y `trace-logo.mjs`).
 *
 * Ninguno de los dos forma parte del build. Se ejecutan a mano cuando cambian
 * las referencias de `Reference/`, y lo que se versiona es su salida, de modo
 * que ni potrace ni las imágenes llegan al navegador.
 *
 * La máscara que recibe potrace sale del **canal alfa**: opaco es dibujo,
 * transparente es fondo. Es un umbral exacto y no una interpretación del color,
 * y por eso el contorno resultante es el del recorte. Cuando una referencia
 * lleva **dos tintas** —la marca blanca y «VEKTOR» en naranja— el alfa no basta
 * para separarlas, y ahí `select` filtra además por saturación: es el único
 * sitio donde el color entra en la decisión, y entra para partir una imagen en
 * dos trazados, no para inventar una forma.
 */

import Jimp from 'jimp'
import potrace from 'potrace'

/** Píxeles con alfa por debajo de esto cuentan como fondo. */
export const ALPHA_THRESHOLD = 128

export const POTRACE_OPTIONS = {
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
 * Máscara en blanco y negro a partir del alfa del recorte.
 *
 * @param {string} file ruta de la referencia
 * @param {(r:number,g:number,b:number)=>boolean} [select] filtro extra sobre
 *   los píxeles ya opacos, para separar tintas dentro de una misma imagen.
 * @param {number} [resizeTo] lado máximo al que reducir antes de trazar. Con
 *   referencias de 2000 px y dibujo de línea, potrace se pone a seguir el
 *   temblor del trazo original y devuelve decenas de miles de caracteres de
 *   curvas que nadie ve a 18 px. Reducir primero suaviza y recorta nodos; el
 *   trazado sale en las coordenadas ya reducidas, así que dos tintas de la
 *   misma imagen hay que reducirlas igual para que sigan cuadrando.
 */
export async function buildMask(file, select = null, resizeTo = 0) {
  const image = await Jimp.read(file)
  if (resizeTo > 0 && Math.max(image.bitmap.width, image.bitmap.height) > resizeTo) {
    image.scaleToFit(resizeTo, resizeTo)
  }
  const { data } = image.bitmap
  for (let i = 0; i < data.length; i += 4) {
    const opaque =
      data[i + 3] >= ALPHA_THRESHOLD &&
      (!select || select(data[i], data[i + 1], data[i + 2]))
    const value = opaque ? 0 : 255
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }
  return image.getBufferAsync(Jimp.MIME_PNG)
}

export function traceToPath(buffer) {
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
export function mapPath(d, visit) {
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

export function boundsOf(d) {
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
export function scalePath(d, bounds, factor) {
  const centerX = bounds.minX + bounds.width / 2
  const centerY = bounds.minY + bounds.height / 2
  return mapPath(d, (x, y) => [
    centerX + (x - centerX) * factor,
    centerY + (y - centerY) * factor,
  ])
}
