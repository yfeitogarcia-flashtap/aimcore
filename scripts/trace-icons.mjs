/**
 * Vectoriza las referencias de iconos con potrace y genera src/ui/iconPaths.js.
 *
 * Script puntual: NO forma parte del build. Se ejecuta a mano con
 * `npm run trace:icons` cuando cambian las imágenes de `Reference/Icons/`, y lo
 * que se versiona es su salida, de modo que ni potrace ni las imágenes llegan al
 * navegador. Misma máscara, mismas opciones y mismas utilidades que las armas y
 * el logotipo: `scripts/lib/trace.mjs`.
 *
 * **Dos tintas en el casco, y no es decoración.** La silueta exterior de un
 * casco es un pentágono redondeado que no se lee como casco: lo que lo delata es
 * la visera. El alfa da el contorno y un segundo trazado filtrando por
 * luminosidad da la visera y las rejillas —las referencias son bimodales, 25.013
 * píxeles por debajo de 32 y 53.000 por encima de 160, así que el umbral no es
 * una interpretación—. Los dos van al mismo trazado y se pintan con
 * **`fill-rule: evenodd`**, que es lo que convierte el segundo en un hueco. Con
 * `nonzero` el casco sale macizo, igual que el logotipo salía como un disco.
 *
 * El escudo y la cruz no lo necesitan: en sus referencias el contorno claro es
 * transparente, así que el alfa ya da la silueta que se busca.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boundsOf, buildMask, traceToPath } from './lib/trace.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = resolve(ROOT, 'Reference/Icons')
const OUTPUT = resolve(ROOT, 'src/ui/iconPaths.js')

/** Por debajo de esta luminosidad, un píxel opaco del casco es visera. */
const DARK = 96
const luminance = (r, g, b) => r * 0.299 + g * 0.587 + b * 0.114

/**
 * Las referencias son de ~500 px. A tamaño completo potrace persigue el
 * antialias del borde; reducir primero suaviza y recorta nodos, y a 14 px de HUD
 * no se distingue. Es la misma razón que en el logotipo.
 */
const TRACE_SIZE = 260

const ICONS = [
  { key: 'helmet', file: 'helm.png', hole: (r, g, b) => luminance(r, g, b) < DARK },
  { key: 'shield', file: 'shield.png' },
  { key: 'health', file: 'health.png' },
]

const traced = {}
for (const { key, file, hole } of ICONS) {
  const source = resolve(SOURCE_DIR, file)
  let d = await traceToPath(await buildMask(source, null, TRACE_SIZE))
  const bounds = boundsOf(d)
  let holeLength = 0

  if (hole) {
    // Mismo fichero y misma reducción: los dos trazados comparten coordenadas y
    // se superponen solos, sin escalar ni centrar nada.
    const cut = await traceToPath(await buildMask(source, hole, TRACE_SIZE))
    holeLength = cut.length
    d = `${d} ${cut}`
  }

  traced[key] = { d, bounds }
  console.log(
    `${key.padEnd(8)} ${d.length} caracteres${holeLength ? ` (${holeLength} de hueco)` : ''}` +
      ` | caja ${Math.round(bounds.width)}x${Math.round(bounds.height)} px`,
  )
}

// Cada icono va en su propio encuadre ajustado: a diferencia de las armas, aquí
// el tamaño relativo no significa nada —un casco no es «más pequeño» que un
// escudo— y lo que importa es que los tres llenen su hueco del HUD por igual.
const PADDING = 1.04
const entries = Object.entries(traced).map(([key, { d, bounds }]) => {
  const width = bounds.width * PADDING
  const height = bounds.height * PADDING
  const viewBox = [
    +(bounds.minX - (width - bounds.width) / 2).toFixed(2),
    +(bounds.minY - (height - bounds.height) / 2).toFixed(2),
    +width.toFixed(2),
    +height.toFixed(2),
  ].join(' ')
  return `  ${key}: {\n    viewBox: '${viewBox}',\n    d: '${d}',\n  },`
})

const file = `/**
 * GENERADO por scripts/trace-icons.mjs — no editar a mano.
 *
 * Contornos vectorizados con potrace a partir de \`Reference/Icons/\`. La máscara
 * sale del canal alfa, así que el trazado es el del recorte y no una lectura mía
 * de la forma.
 *
 * **El casco lleva dos contornos en el mismo trazado** —la silueta y la visera—
 * y hay que pintarlo con \`fill-rule="evenodd"\`, que es lo que convierte el
 * segundo en un hueco. Sin eso sale un pentágono macizo que no se lee como
 * casco, que era justo el problema del icono anterior.
 *
 * Cada icono trae su propio \`viewBox\` ajustado a su caja: los tres tienen que
 * llenar su hueco del HUD por igual, y su tamaño relativo no significa nada.
 */
export const ICON_PATHS = {
${entries.join('\n')}
}
`

mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, file)
console.log(`\nescrito ${OUTPUT} (${(file.length / 1024).toFixed(1)} KB)`)
