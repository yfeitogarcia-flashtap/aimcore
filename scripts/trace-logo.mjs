/**
 * Vectoriza el logotipo de Vektor con potrace y genera `src/ui/logoPaths.js` y
 * `public/favicon.svg`.
 *
 * Script puntual, como el de las armas: NO forma parte del build. Se ejecuta a
 * mano con `npm run trace:logo` cuando cambien las referencias de
 * `Reference/Logo/`, y lo que se versiona es su salida — ni potrace ni las PNG
 * llegan al navegador.
 *
 * **Dos tintas, dos trazados.** La marca es blanca y «VEKTOR» va en naranja, y
 * el canal alfa no distingue una de otra: las dos son píxeles opacos. Así que
 * el logo completo se traza **dos veces** sobre la misma imagen, filtrando por
 * saturación —el blanco no tiene, el naranja sí—, y los dos trazados salen en
 * las mismas coordenadas de origen, que es lo que los deja alineados sin
 * cuadrarlos a mano. Medido sobre la referencia: 0.00% de píxeles a medio
 * camino entre los dos colores, porque las letras flotan dentro del triángulo
 * sin tocar sus líneas.
 *
 * La marca suelta del HUD y del favicon salen de sus propios ficheros —blanco y
 * naranja— y no de recolorear uno: son las referencias que hay, y así el
 * favicon es exactamente el PNG naranja vectorizado.
 *
 * Ojo con `fill-rule`: potrace devuelve los huecos dentro del mismo trazado y
 * cuenta con **evenodd**. Con la regla por defecto, la marca —que son dos
 * circunferencias y un triángulo— se rellena entera y sale un disco. Por eso va
 * escrito en el SVG que se genera aquí y en el componente de React.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boundsOf, buildMask, traceToPath } from './lib/trace.mjs'
import { COLORS } from '../src/config.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = resolve(ROOT, 'Reference/Logo')
const OUTPUT = resolve(ROOT, 'src/ui/logoPaths.js')
const FAVICON = resolve(ROOT, 'public/favicon.svg')

/**
 * Aire alrededor del trazado, en tanto por uno de su caja. Lo justo para que
 * ninguna curva quede pegada al borde del `viewBox` al redondear: el tamaño y
 * la separación de verdad los pone quien lo coloca.
 */
const PADDING = 1.03

/**
 * Reparto por tinta. El blanco de la marca es acromático y el naranja de marca
 * está saturadísimo (#E4462B → 185 de diferencia entre el canal más alto y el
 * más bajo), así que un corte por la mitad no puede equivocarse de lado.
 */
const SATURATION_SPLIT = 90
const saturation = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b)
const isWhite = (r, g, b) => saturation(r, g, b) < SATURATION_SPLIT
const isOrange = (r, g, b) => saturation(r, g, b) >= SATURATION_SPLIT

/**
 * Lado al que se reduce la referencia antes de trazar. Las PNG son de 2000 px
 * y el dibujo es de línea a mano alzada: a tamaño completo potrace persigue el
 * temblor del rotulador y devuelve un trazado de 18 KB que a 18 px del HUD no
 * se distingue de uno de 3. Ver el log del script para el recorte real.
 */
const TRACE_SIZE = 600

/** Traza un fichero (opcionalmente sólo una de sus tintas) y mide su caja. */
async function trace(file, select = null) {
  const mask = await buildMask(resolve(SOURCE_DIR, file), select, TRACE_SIZE)
  const d = await traceToPath(mask)
  return { d, bounds: boundsOf(d) }
}

/** `viewBox` con margen alrededor de una caja. `square` la iguala a su lado mayor. */
function viewBoxOf(bounds, square = false) {
  const width = (square ? Math.max(bounds.width, bounds.height) : bounds.width) * PADDING
  const height = (square ? Math.max(bounds.width, bounds.height) : bounds.height) * PADDING
  const centerX = bounds.minX + bounds.width / 2
  const centerY = bounds.minY + bounds.height / 2
  return [
    +(centerX - width / 2).toFixed(2),
    +(centerY - height / 2).toFixed(2),
    +width.toFixed(2),
    +height.toFixed(2),
  ].join(' ')
}

/** Caja que envuelve a varias. */
function unionBounds(list) {
  const minX = Math.min(...list.map((b) => b.minX))
  const minY = Math.min(...list.map((b) => b.minY))
  const maxX = Math.max(...list.map((b) => b.maxX))
  const maxY = Math.max(...list.map((b) => b.maxY))
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/**
 * **La marca de Alchemist es opcional** (vuelta 78).
 *
 * Es el personaje del editor, sin texto, para la marca de agua de su esquina, y
 * **puede no estar**: el editor se abre igual y la esquina se queda vacía. Un
 * script que falle porque falta una firma sería un repositorio que no se puede
 * clonar hasta que alguien dibuje algo. Dónde va y qué tiene que cumplir, en
 * `Reference/Logo/LEEME.md`.
 */
const ALCHEMIST = 'alchemist.png'
const hayAlchemist = existsSync(resolve(SOURCE_DIR, ALCHEMIST))
const alchemist = hayAlchemist ? await trace(ALCHEMIST) : null
if (!hayAlchemist) {
  console.log(`(sin ${ALCHEMIST}: la marca de agua del editor se queda vacía)`)
}

const mark = await trace('vektor-mark-white.png')
const faviconMark = await trace('vektor-mark-orange.png')
const logoMark = await trace('vektor-logo-white-orange.png', isWhite)
const logoWord = await trace('vektor-logo-white-orange.png', isOrange)

for (const [name, t] of [
  ['marca (blanca)', mark],
  ['marca (naranja)', faviconMark],
  ['logo · marca', logoMark],
  ['logo · VEKTOR', logoWord],
]) {
  console.log(
    `${name.padEnd(16)} ${String(t.d.length).padStart(6)} caracteres | caja ` +
      `${Math.round(t.bounds.width)}x${Math.round(t.bounds.height)} px`,
  )
}

// Las dos tintas del logo comparten `viewBox` —el que las envuelve a las dos—,
// que es lo que las mantiene superpuestas exactamente como en la referencia.
const logoViewBox = viewBoxOf(unionBounds([logoMark.bounds, logoWord.bounds]))

const file = `/**
 * GENERADO por scripts/trace-logo.mjs — no editar a mano.
 *
 * Contornos vectorizados con potrace a partir de las referencias de
 * \`Reference/Logo/\`. La máscara sale del canal alfa; en el logo completo, que
 * lleva dos tintas, se traza una vez por tinta separándolas por saturación.
 *
 * \`mark\` es la marca sola (HUD). \`logo\` es el logotipo completo: \`markPath\` en
 * blanco y \`wordPath\` en naranja, los dos en el **mismo** \`viewBox\`, así que se
 * dibujan uno encima del otro sin cuadrar nada.
 *
 * Son trazados de un dibujo **de línea**: el contorno que devuelve potrace
 * rodea cada línea por sus dos lados, de modo que se pintan **rellenos**. Pasarles
 * un \`stroke\` los convertiría en dos filos por línea, que a tamaño de HUD es un
 * borrón.
 */
export const LOGO = {
  mark: {
    viewBox: '${viewBoxOf(mark.bounds)}',
    d: '${mark.d}',
  },
  logo: {
    viewBox: '${logoViewBox}',
    markPath: '${logoMark.d}',
    wordPath: '${logoWord.d}',
  },
  /**
   * La marca de Vektor Alchemist, el editor. **\`null\` si no hay referencia**:
   * la marca de agua es una firma, y una firma que no existe no se dibuja.
   */
  alchemist: ${alchemist ? `{
    viewBox: '${viewBoxOf(alchemist.bounds)}',
    d: '${alchemist.d}',
  }` : 'null'},
}
`

mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, file)
console.log(`\nescrito ${OUTPUT} (${(file.length / 1024).toFixed(1)} KB)`)

// El favicon es un fichero suelto: no pasa por React ni por la hoja de estilos,
// así que el naranja va escrito dentro. Sale de COLORS.target para que no haya
// un segundo sitio donde vive el color de marca.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxOf(faviconMark.bounds, true)}">
  <!-- GENERADO por scripts/trace-logo.mjs desde Reference/Logo/vektor-mark-orange.png -->
  <path fill="${COLORS.target}" fill-rule="evenodd" d="${faviconMark.d}"/>
</svg>
`
writeFileSync(FAVICON, favicon)
console.log(`escrito ${FAVICON} (${(favicon.length / 1024).toFixed(1)} KB), ${COLORS.target} sobre fondo transparente`)
