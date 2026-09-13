/**
 * Lleva las muestras de disparo de `Reference/Audio/weapons/` a `public/` y
 * genera `src/audio/weaponSamples.js`, el manifiesto que el juego lee.
 *
 * Script puntual: **NO forma parte del build**. Se ejecuta a mano con
 * `npm run audio:weapons` cuando se añaden o cambian ficheros, igual que los
 * tres de trazado. Y por el mismo motivo: `Reference/` es material de origen y
 * no se sirve nunca; lo que se versiona es la salida.
 *
 * **Aquí se rompe, a propósito, la regla de «cero assets».** Un disparo de
 * verdad no se puede vectorizar ni sintetizar a partir de nada: o hay un
 * fichero, o hay síntesis. Lo que se conserva de la regla es que el respaldo
 * sintetizado **no desaparece**: cada arma que no tenga muestra sigue sonando
 * como hasta ahora, y el juego arranca y se juega entero sin un solo fichero de
 * audio en el repositorio.
 *
 * **La convención, y es toda la convención:**
 *
 *   Reference/Audio/weapons/<clave-del-arma>.mp3             disparo normal
 *   Reference/Audio/weapons/<clave-del-arma>-suppressed.mp3  con silenciador
 *
 * `<clave-del-arma>` es la clave de `WEAPONS` en `src/config.js` —`axis-7`,
 * `scalar-2`, `vertex-9`—, no su etiqueta. La silenciada es **opcional**: sin
 * ella, disparar con supresor cae al perfil silenciado sintetizado, que es lo
 * correcto — soltar el disparo normal grabado diría que no llevas supresor.
 *
 * Un fichero cuya clave no esté en `WEAPONS` es un aviso y no entra: casi
 * siempre es un nombre mal escrito, y colarlo dejaría una muestra que nunca
 * suena.
 */

import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WEAPONS } from '../src/config.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = resolve(ROOT, 'Reference/Audio/weapons')
const PUBLIC_DIR = resolve(ROOT, 'public/audio/weapons')
const OUTPUT = resolve(ROOT, 'src/audio/weaponSamples.js')
/** Lo que el navegador pide. `public/` se sirve desde la raíz. */
const BASE_URL = '/audio/weapons'
const SUFFIX = '-suppressed'

mkdirSync(SOURCE_DIR, { recursive: true })
const files = readdirSync(SOURCE_DIR).filter((name) => extname(name).toLowerCase() === '.mp3')

/** clave de arma -> { normal?, suppressed? } con su url y su tamaño. */
const manifest = {}
let bytes = 0
for (const file of files.sort()) {
  const stem = file.slice(0, -extname(file).length)
  const suppressed = stem.endsWith(SUFFIX)
  const key = suppressed ? stem.slice(0, -SUFFIX.length) : stem
  if (!WEAPONS[key]) {
    console.warn(`  · ${file}: "${key}" no es un arma de WEAPONS — se ignora`)
    continue
  }
  const size = statSync(resolve(SOURCE_DIR, file)).size
  bytes += size
  manifest[key] ??= {}
  manifest[key][suppressed ? 'suppressed' : 'normal'] = { url: `${BASE_URL}/${file}`, bytes: size }
}

// El destino se rehace entero: un fichero que se quita de `Reference/` tiene que
// desaparecer también de `public/`, o se quedaría servido y sin manifiesto.
rmSync(PUBLIC_DIR, { recursive: true, force: true })
if (Object.keys(manifest).length > 0) {
  mkdirSync(PUBLIC_DIR, { recursive: true })
  for (const variants of Object.values(manifest)) {
    for (const { url } of Object.values(variants)) {
      const name = url.slice(BASE_URL.length + 1)
      copyFileSync(resolve(SOURCE_DIR, name), resolve(PUBLIC_DIR, name))
    }
  }
}

const body = Object.entries(manifest)
  .map(([key, variants]) => {
    const lines = Object.entries(variants)
      .map(([variant, { url, bytes: size }]) => `    ${variant}: { url: '${url}', bytes: ${size} },`)
      .join('\n')
    return `  '${key}': {\n${lines}\n  },`
  })
  .join('\n')

writeFileSync(
  OUTPUT,
  `/**
 * GENERADO por scripts/import-weapon-audio.mjs — no editar a mano.
 *
 * Qué muestras de disparo hay servidas, por arma. Un arma que no esté aquí, o
 * una variante que falte, suena con la síntesis de siempre: el respaldo no es un
 * caso de error, es el estado normal de este fichero mientras esté vacío.
 *
 * \`bytes\` es informativo —lo que ocupa cada muestra en el build— y no lo usa el
 * juego: está para poder decir el coste sin ir a mirar la carpeta.
 */

export const WEAPON_SAMPLES = {${body ? `\n${body}\n` : ''}}
`,
)

const total = Object.keys(manifest).length
console.log(
  total === 0
    ? 'Sin muestras en Reference/Audio/weapons: todas las armas suenan sintetizadas.'
    : `${total} arma(s) con muestra, ${files.length} fichero(s), ${(bytes / 1024).toFixed(1)} KB copiados a public/audio/weapons.`,
)
