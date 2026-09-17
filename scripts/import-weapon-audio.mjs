/**
 * Lleva las muestras de audio de `Reference/Audio/` a `public/` y genera
 * `src/audio/weaponSamples.js`, el manifiesto que el juego lee.
 *
 * Script puntual: **NO forma parte del build**. Se ejecuta a mano con
 * `npm run audio:weapons` cuando se añaden o cambian ficheros, igual que los
 * tres de trazado. Y por el mismo motivo: `Reference/` es material de origen y
 * no se sirve nunca; lo que se versiona es la salida.
 *
 * **Aquí se rompe, a propósito, la regla de «cero assets».** Un disparo de
 * verdad no se puede vectorizar ni sintetizar a partir de nada: o hay un
 * fichero, o hay síntesis. Lo que se conserva de la regla es que **la síntesis
 * no desaparece**: lo que no tenga muestra sigue sonando exactamente como hasta
 * ahora, y el juego arranca y se juega entero sin un solo fichero de audio.
 *
 * **La convención, y es toda la convención:**
 *
 *   Reference/Audio/weapons/<arma>.<ext>             disparo
 *   Reference/Audio/weapons/<arma>-suppressed.<ext>  disparo con supresor
 *   Reference/Audio/weapons/<arma>-reload.<ext>      recarga
 *   Reference/Audio/comunes/gatillo-seco.<ext>       clic del cargador vacío
 *
 * `<arma>` es la clave de `WEAPONS` en `src/config.js` —`pulse`, `rift`,
 * `volt`—, no su etiqueta. Un fichero cuya clave no esté en `WEAPONS` es un
 * aviso y no entra: casi siempre es un nombre mal escrito, y colarlo dejaría
 * una muestra que no suena nunca.
 *
 * **Lo de `comunes/` no es de ningún arma**, y por eso no está en `weapons/`:
 * el cargador vacío suena igual lleves lo que lleves. Si algún día hay uno por
 * arma, su sitio es `weapons/<arma>-seco.<ext>` y este carril se queda como
 * respaldo.
 *
 * **Tres formatos, con preferencia.** `.mp3`, `.ogg` y `.wav`, en ese orden: el
 * WAV vale —el navegador lo decodifica igual— pero pesa del orden de diez veces
 * más, y lo que se sirve va en el build. Si un mismo sonido está en dos
 * formatos gana el comprimido y se avisa, para que nadie acabe sirviendo el
 * pesado sin enterarse.
 */

import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUDIO, WEAPONS } from '../src/config.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = resolve(ROOT, 'src/audio/weaponSamples.js')
/** Por orden de preferencia: lo comprimido primero. */
const EXTENSIONES = ['.mp3', '.ogg', '.wav']
/** Sufijo -> variante. El orden importa: `-suppressed` antes que nada. */
const VARIANTES = [
  ['-suppressed', 'suppressed'],
  ['-reload', 'reload'],
]
/** Lo que se admite en `comunes/`, y cómo se llama en el manifiesto. */
const COMUNES = { 'gatillo-seco': 'dry' }

const CARPETAS = [
  { origen: 'Reference/Audio/weapons', destino: 'public/audio/weapons', url: '/audio/weapons' },
  { origen: 'Reference/Audio/comunes', destino: 'public/audio/comunes', url: '/audio/comunes' },
]

const avisos = []

/**
 * **Con las muestras apagadas, esto no copia nada** (vuelta 63). `samples.js` no
 * pide un solo fichero mientras `AUDIO.samplesEnabled` sea `false`, así que
 * copiarlos a `public/` metería megas en el build que nadie va a oír — y en
 * silencio, que es lo peor de todo: el objetivo del juego es que no haya nada
 * que descargar ni decodificar. El manifiesto sale vacío, como si la carpeta lo
 * estuviera, y aquí se dice cómo volver a encenderlas.
 */
const APAGADAS = AUDIO.samplesEnabled === false

/** Los ficheros de audio de una carpeta, agrupados por nombre sin extensión. */
function porNombre(dir) {
  mkdirSync(dir, { recursive: true })
  const porClave = new Map()
  for (const file of readdirSync(dir).sort()) {
    const ext = extname(file).toLowerCase()
    if (!EXTENSIONES.includes(ext)) continue
    const stem = file.slice(0, -ext.length)
    const previo = porClave.get(stem)
    if (!previo) {
      porClave.set(stem, file)
      continue
    }
    // **Dos formatos del mismo sonido**: gana el de más arriba en la lista.
    const gana = EXTENSIONES.indexOf(ext) < EXTENSIONES.indexOf(extname(previo).toLowerCase())
    avisos.push(`${stem}: hay ${previo} y ${file}; se sirve ${gana ? file : previo}`)
    if (gana) porClave.set(stem, file)
  }
  return porClave
}

/** clave de arma -> { normal?, suppressed?, reload? } */
const armas = {}
/** nombre común -> { url, bytes } */
const comunes = {}
let bytes = 0

const anotar = (destino, carpeta, file) => {
  const size = statSync(resolve(ROOT, carpeta.origen, file)).size
  bytes += size
  destino.url = `${carpeta.url}/${file}`
  destino.bytes = size
}

// ---- armas
const carpetaArmas = CARPETAS[0]
if (!APAGADAS)
for (const [stem, file] of porNombre(resolve(ROOT, carpetaArmas.origen))) {
  let clave = stem
  let variante = 'normal'
  for (const [sufijo, nombre] of VARIANTES) {
    if (stem.endsWith(sufijo)) {
      clave = stem.slice(0, -sufijo.length)
      variante = nombre
      break
    }
  }
  if (!WEAPONS[clave]) {
    avisos.push(`${file}: "${clave}" no es un arma de WEAPONS — se ignora`)
    continue
  }
  armas[clave] ??= {}
  armas[clave][variante] = {}
  anotar(armas[clave][variante], carpetaArmas, file)
}

// ---- comunes
const carpetaComunes = CARPETAS[1]
if (!APAGADAS)
for (const [stem, file] of porNombre(resolve(ROOT, carpetaComunes.origen))) {
  const nombre = COMUNES[stem]
  if (!nombre) {
    avisos.push(`${file}: "${stem}" no es un sonido común conocido (${Object.keys(COMUNES).join(', ')}) — se ignora`)
    continue
  }
  comunes[nombre] = {}
  anotar(comunes[nombre], carpetaComunes, file)
}

// El destino se rehace entero: un fichero que se quita de `Reference/` tiene que
// desaparecer también de `public/`, o se quedaría servido y sin manifiesto.
const servidos = []
for (const carpeta of CARPETAS) rmSync(resolve(ROOT, carpeta.destino), { recursive: true, force: true })
for (const variantes of Object.values(armas)) for (const v of Object.values(variantes)) servidos.push(v.url)
for (const v of Object.values(comunes)) servidos.push(v.url)
for (const url of servidos) {
  const carpeta = CARPETAS.find((c) => url.startsWith(`${c.url}/`))
  const name = url.slice(carpeta.url.length + 1)
  mkdirSync(resolve(ROOT, carpeta.destino), { recursive: true })
  copyFileSync(resolve(ROOT, carpeta.origen, name), resolve(ROOT, carpeta.destino, name))
}

const bloque = (entradas, sangria) =>
  Object.entries(entradas)
    .map(([k, { url, bytes: size }]) => `${sangria}${k}: { url: '${url}', bytes: ${size} },`)
    .join('\n')

const cuerpoArmas = Object.entries(armas)
  .map(([clave, variantes]) => `  '${clave}': {\n${bloque(variantes, '    ')}\n  },`)
  .join('\n')
const cuerpoComunes = bloque(comunes, '  ')

writeFileSync(
  OUTPUT,
  `/**
 * GENERADO por scripts/import-weapon-audio.mjs — no editar a mano.
 *
 * Qué muestras hay servidas. Lo que no esté aquí suena como siempre: el
 * respaldo **no es un caso de error**, es el estado normal de este fichero
 * mientras esté vacío. Para las armas, la síntesis; para la recarga, que hoy no
 * tiene síntesis, silencio — como hasta ahora.
 *
 * \`bytes\` es informativo —lo que ocupa cada muestra en el build— y no lo usa el
 * juego: está para poder decir el coste sin ir a mirar la carpeta.
 */

export const WEAPON_SAMPLES = {${cuerpoArmas ? `\n${cuerpoArmas}\n` : ''}}

/** Sonidos que no son de un arma en concreto. Hoy: \`dry\`, el cargador vacío. */
export const COMMON_SAMPLES = {${cuerpoComunes ? `\n${cuerpoComunes}\n` : ''}}
`,
)

for (const aviso of avisos) console.warn(`  · ${aviso}`)
const nArmas = Object.keys(armas).length
const nComunes = Object.keys(comunes).length
const kb = bytes / 1024
console.log(
  APAGADAS
    ? 'AUDIO.samplesEnabled está a false: no se copia nada y todo suena sintetizado.\n' +
      '  Los ficheros de Reference/Audio se quedan donde están. Para volver a probarlos,\n' +
      '  pon samplesEnabled a true en src/config.js y vuelve a pasar este script.'
    : servidos.length === 0
      ? 'Sin muestras en Reference/Audio: todo suena sintetizado.'
      : `${servidos.length} fichero(s) · ${nArmas} arma(s) y ${nComunes} sonido(s) común(es) · ${kb.toFixed(1)} KB copiados a public/audio.`,
)
// El WAV se admite, pero lo que se sirve va en el build y se descarga entero al
// primer gesto del jugador. A partir de aquí conviene comprimir.
if (kb > 1536) {
  console.warn(
    `  · ${(kb / 1024).toFixed(1)} MB de audio servido. Con .mp3 u .ogg —los mismos nombres, otra extensión— esto baja a la décima parte.`,
  )
}
