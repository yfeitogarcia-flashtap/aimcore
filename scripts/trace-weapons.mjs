/**
 * Vectoriza las referencias de armas con potrace y genera src/ui/weaponPaths.js.
 *
 * Script puntual: NO forma parte del build. Se ejecuta a mano con
 * `npm run trace:weapons` cuando cambian las imágenes de `Reference/Weapons/`,
 * y lo que se versiona es su salida, de modo que ni potrace ni las imágenes
 * llegan al navegador.
 *
 * La máscara, las opciones de potrace y las utilidades de trazado viven en
 * `scripts/lib/trace.mjs`, compartidas con `trace-logo.mjs`: dos pipelines de
 * vectorización con dos juegos de constantes es como acaban saliendo contornos
 * con distinto nivel de detalle según de qué carpeta vengan.
 *
 * Las referencias vienen con el arma recortada sobre fondo transparente, así
 * que la máscara sale del canal alfa: opaco es arma, transparente es fondo. Es
 * un umbral exacto, no una interpretación del color, y por eso el contorno
 * resultante es el del recorte y no una lectura mía de la silueta.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boundsOf, buildMask, scalePath, traceToPath } from './lib/trace.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = resolve(ROOT, 'Reference/Weapons')
const OUTPUT = resolve(ROOT, 'src/ui/weaponPaths.js')

/**
 * Cada entrada es una silueta a vectorizar.
 *
 * **La convención es `<arma>.png` y `ghost-<arma>.png`**: la segunda es la misma
 * arma con silenciador. Las tres la tienen desde la vuelta 41, y por eso las
 * seis entradas salen de un bucle en vez de escribirse a mano: añadir un arma
 * es añadir su clave a `ARSENAL`, no cuatro líneas aquí.
 *
 * `matchHeightOf` escala el trazado para que su altura coincida con la de otra:
 * las dos variantes de un arma son la misma arma fotografiada aparte, así que
 * sin esto el interruptor del silenciador la cambiaría de tamaño. El silenciador
 * **alarga** el arma, no la engorda, y lo que tiene que cuadrar entre las dos
 * fotos es la altura.
 */
const ARSENAL = ['pulse', 'rift', 'volt']
const WEAPONS = ARSENAL.flatMap((key) => [
  { key, file: `${key}.png` },
  { key: `ghost-${key}`, file: `ghost-${key}.png`, matchHeightOf: key },
])

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

// Un único encuadre para todas, con margen: así conservan su tamaño
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
 * Todas las entradas comparten el tamaño de \`viewBox\` y sólo cambian de
 * origen, de modo que se dibujan a la misma escala y cada una queda centrada.
 * Cada arma tiene dos: \`<arma>\` y \`ghost-<arma>\`, la misma arma con
 * silenciador. Salen de fotos distintas, así que la silenciada se escala para
 * que su altura coincida con la normal y el interruptor no cambie de tamaño el
 * arma — lo que tiene que crecer es el cañón, no el arma entera.
 */
export const WEAPON_PATHS = {
${entries.join('\n')}
}
`

mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, file)
console.log(`\nescrito ${OUTPUT} (${(file.length / 1024).toFixed(1)} KB), encuadre ${Math.round(frameWidth)}x${Math.round(frameHeight)}`)
