/**
 * **Todo lo que Alchemist le pide a git, en un solo sitio** (vuelta 99).
 *
 * Lo llaman tres puertas: `Alchemist.bat`, `Alchemist.command` y el botón
 * «Subir al juego» del editor (por `vite.config.js`). Hasta la 98 cada lanzador
 * llevaba su copia en su idioma de shell, y las dos copias tenían los mismos
 * tres fallos, que salieron juntos en el PC de Yago:
 *
 * 1. **`git pull --rebase --autostash` no se deshace solo cuando choca al
 *    final.** Si el choque es al devolver lo apartado —el caso normal: tú
 *    tocaste un mapa y nosotros también—, git **termina con éxito**, deja las
 *    marcas `<<<<<<<` dentro del fichero y guarda tu copia en `git stash` «por
 *    si acaso». El lanzador leía ese éxito y abría el editor contra un mapa
 *    roto (`Unexpected token '<<'`).
 * 2. **El camino de fallo hacía `git stash pop` a ciegas.** No sacaba *lo que
 *    acababa de apartar*: sacaba **lo último que hubiera en la pila**, y en la
 *    pila se habían quedado las copias viejas de cada choque anterior. Así es
 *    como `spawnZone` volvía a `z:16, d:4` sin que nadie abriese el mapa: una
 *    ventana que fallaba por cualquier cosa —otra ventana a la vez, la red—
 *    desenterraba la copia de hace una semana y la ponía en el disco.
 * 3. **La subida no miraba si había conflicto.** Ofrecía un fichero en estado
 *    `UU` con las marcas dentro, y pulsar S lo habría publicado.
 *
 * Tres reglas que se quedan:
 *
 * - **Traer lo nuevo nunca mezcla.** Sólo avanza (`merge --ff-only`) y sólo si
 *   ningún fichero que tengas cambiado es uno que ha cambiado fuera: git no
 *   empieza nada que pueda dejar a medias. Si chocan, se dice cuáles y **no se
 *   toca nada**; quedarse con la del juego es una pregunta, y tu copia se
 *   guarda antes en `alchemist-rescate/`, a la vista y no en una pila.
 * - **Nada de `git stash`.** Ni aquí ni en ningún lanzador. Lo que no se
 *   aparta no se puede desenterrar.
 * - **Un conflicto no sube, y no se ofrece.** Se busca de dos formas —lo que
 *   git marca sin resolver y las marcas escritas en los ficheros de mapa—,
 *   porque una resolución a medias puede dejar marcas en un fichero que git ya
 *   da por resuelto.
 *
 * `git` se llama con `execFileSync` y argumentos sueltos, nunca con una cadena
 * de shell: los nombres de fichero salen del disco.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const git = (donde, ...argumentos) =>
  execFileSync('git', argumentos, { cwd: donde, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })

/** Como `git`, pero contesta sí o no en vez de lanzar. */
const gitSale = (donde, ...argumentos) => {
  try { git(donde, ...argumentos); return true } catch { return false }
}

/**
 * **Lo que Alchemist escribe son dos carpetas, no una** (vuelta 94): los mapas
 * y las imágenes de estampado, que son media pieza de un mapa que las use. Y
 * sigue siendo **sólo lo que Alchemist escribe** (vuelta 91): cualquier otra
 * cosa a medias se queda donde está.
 *
 * Se exporta porque **el banco tiene que probar este camino, no declarar el
 * suyo**: una segunda lista en la prueba mediría la lista de la prueba.
 */
export const CARPETAS_QUE_SUBEN = ['src/maps', 'public/estampados']
export const NO_SON_MAPAS = new Set(['index.js', 'formato.js'])
export const EXTENSIONES_ESTAMPADO = ['.webp', '.png', '.jpg', '.jpeg', '.avif']

/** Donde se guardan las copias que se apartan para quedarse con la del juego. */
export const CARPETA_RESCATE = 'alchemist-rescate'

/**
 * Una carpeta que no está **no se le pasa a git**: `git status -- <ruta>` con un
 * camino que no existe es un error fatal.
 */
const carpetasQueSuben = (donde) =>
  CARPETAS_QUE_SUBEN.filter((carpeta) => existsSync(resolve(donde, carpeta)))

/**
 * **`git status` no se recorta entero.** La primera línea de `--porcelain`
 * empieza por un espacio cuando el cambio no está anotado, y un `.trim()` de
 * toda la salida se come la primera letra del nombre. Se recorta **cada línea
 * por el final**.
 */
function lineasDeEstado(donde, ...argumentos) {
  return git(donde, 'status', '--porcelain', ...argumentos).split('\n')
    .filter((l) => l.length > 3)
    .map((l) => ({ xy: l.slice(0, 2), ruta: l.slice(3).trimEnd().replace(/^"|"$/g, '').split(' -> ').pop() }))
}

// ------------------------------------------------------------ conflictos

/**
 * Las marcas que deja un choque, **las tres y en orden**. Buscar sólo
 * `<<<<<<<` daría por roto un mapa cuyo nombre contuviera eso; las tres
 * seguidas, a principio de línea, sólo las escribe git.
 */
const MARCAS = /^<{7}(?: .*)?\r?\n[\s\S]*?^={7}\r?\n[\s\S]*?^>{7}(?: .*)?$/m

/** Los ficheros de texto de las carpetas de Alchemist, recursivo. */
function ficherosDeTexto(donde) {
  const fuera = []
  const recorrer = (carpeta) => {
    let nombres = []
    try { nombres = readdirSync(resolve(donde, carpeta)) } catch { return }
    for (const nombre of nombres) {
      const ruta = `${carpeta}/${nombre}`
      let info
      try { info = statSync(resolve(donde, ruta)) } catch { continue }
      if (info.isDirectory()) recorrer(ruta)
      else if (/\.(js|mjs|json|txt)$/i.test(nombre)) fuera.push(ruta)
    }
  }
  for (const carpeta of CARPETAS_QUE_SUBEN) recorrer(carpeta)
  return fuera
}

/**
 * **¿Hay algo a medias de un choque?** Tres preguntas distintas y las tres
 * paran:
 *
 * - `sinResolver`: lo que git marca como no resuelto (`UU`, `AA`, `DU`…), en
 *   todo el árbol — un `UU` fuera de los mapas también rompe el juego.
 * - `conMarcas`: ficheros de mapa con las marcas escritas dentro, aunque git
 *   ya no los tenga por conflicto.
 * - `enCurso`: un rebase o una mezcla que se quedó sin terminar.
 */
export function conflictosEn(donde) {
  const sinResolver = git(donde, 'diff', '--name-only', '--diff-filter=U')
    .split('\n').map((l) => l.trim()).filter(Boolean)
  const conMarcas = ficherosDeTexto(donde).filter((ruta) => {
    try { return MARCAS.test(readFileSync(resolve(donde, ruta), 'utf8')) } catch { return false }
  })
  const dirGit = resolve(donde, git(donde, 'rev-parse', '--git-dir').trim())
  let enCurso = null
  if (existsSync(resolve(dirGit, 'rebase-merge')) || existsSync(resolve(dirGit, 'rebase-apply'))) enCurso = 'rebase'
  else if (existsSync(resolve(dirGit, 'MERGE_HEAD'))) enCurso = 'mezcla'
  else if (existsSync(resolve(dirGit, 'CHERRY_PICK_HEAD'))) enCurso = 'cherry-pick'
  const todos = [...new Set([...sinResolver, ...conMarcas])]
  return { sinResolver, conMarcas, enCurso, todos, hay: todos.length > 0 || enCurso !== null }
}

/** El conflicto dicho en castellano, para las tres puertas. */
export function textoDeConflicto(c) {
  const lineas = []
  if (c.enCurso) lineas.push(`Hay un ${c.enCurso} de git a medias en esta copia.`)
  if (c.todos.length) {
    lineas.push('Estos ficheros tienen un conflicto sin resolver (marcas <<<<<<< dentro):')
    for (const ruta of c.todos) lineas.push(`   ${ruta}`)
  }
  return lineas.join('\n')
}

// ------------------------------------------------------------ rescate

/**
 * **Tu copia se aparta a la vista, no a una pila.** Antes de dejar un fichero
 * como está en el juego, la versión de este PC se copia a
 * `alchemist-rescate/<fecha>/<ruta>`. Es una carpeta que se abre con el
 * explorador, que git no sube (`.gitignore`) y que nadie saca sola: lo
 * contrario de `git stash`.
 */
export function rescatarEn(donde, rutas, cuando = new Date()) {
  const sello = cuando.toISOString().replace(/[:T]/g, '-').slice(0, 19)
  const carpeta = `${CARPETA_RESCATE}/${sello}`
  const copiados = []
  for (const ruta of rutas) {
    const origen = resolve(donde, ruta)
    if (!existsSync(origen)) continue
    const destino = resolve(donde, carpeta, ruta)
    mkdirSync(dirname(destino), { recursive: true })
    copyFileSync(origen, destino)
    copiados.push(ruta)
  }
  return { carpeta, copiados }
}

/**
 * Deja `rutas` como están en `hacia` (el juego, o sea `HEAD`), después de
 * rescatarlas. Vale también para un `UU`: `checkout <commit> -- <ruta>` lo da
 * por resuelto con esa versión. Un fichero que en `hacia` no existe —un mapa
 * nuevo que nació con las marcas dentro— se quita, que es lo que «como está en
 * el juego» significa para algo que en el juego no está; su copia ya está a
 * salvo en el rescate.
 */
export function quedarseConLaDelJuegoEn(donde, rutas, hacia = 'HEAD') {
  const rescate = rescatarEn(donde, rutas)
  for (const ruta of rutas) {
    if (gitSale(donde, 'cat-file', '-e', `${hacia}:${ruta}`)) git(donde, 'checkout', hacia, '--', ruta)
    else {
      gitSale(donde, 'rm', '-q', '--cached', '--ignore-unmatch', '--', ruta)
      rmSync(resolve(donde, ruta), { force: true })
    }
  }
  return rescate
}

// ------------------------------------------------------------ traer

/**
 * **Traer lo último sin mezclar nunca** (vuelta 99).
 *
 * Devuelve qué ha pasado y no pregunta nada: preguntar es de quien llama. Los
 * estados:
 *
 * - `al-dia` / `actualizado` / `por-delante`: se puede abrir el editor.
 * - `sin-red`: no se ha podido preguntar; no se ha tocado nada y se puede
 *   editar con lo que hay.
 * - `conflicto`: ya había un choque a medias **antes** de empezar. Para.
 * - `choque`: ficheros que has cambiado aquí y también han cambiado fuera. No
 *   se ha tocado nada. Para, o `quedarseConLaDelJuegoEn` y volver a llamar.
 * - `divergido`: hay commits tuyos sin subir **y** cambios sin anotar, o un
 *   rebase que no entra limpio. No se ha tocado nada. Para.
 */
export function actualizarEn(donde, rama = null) {
  const c = conflictosEn(donde)
  if (c.hay) return { estado: 'conflicto', conflicto: c }
  rama ??= git(donde, 'rev-parse', '--abbrev-ref', 'HEAD').trim()
  try {
    git(donde, 'fetch', '--quiet', 'origin', rama)
  } catch (error) {
    return { estado: 'sin-red', rama, error: (error.stderr || error.message).toString().trim() }
  }
  const remoto = `origin/${rama}`
  const local = git(donde, 'rev-parse', 'HEAD').trim()
  const fuera = git(donde, 'rev-parse', remoto).trim()
  if (local === fuera) return { estado: 'al-dia', rama }

  const cambiadosAqui = new Set(lineasDeEstado(donde).map((l) => l.ruta))

  // Sólo avanzar: no hay nada tuyo anotado que no esté fuera.
  if (gitSale(donde, 'merge-base', '--is-ancestor', 'HEAD', remoto)) {
    const cambiadosFuera = git(donde, 'diff', '--name-only', 'HEAD', remoto).split('\n').filter(Boolean)
    const choque = cambiadosFuera.filter((ruta) => cambiadosAqui.has(ruta))
    if (choque.length) return { estado: 'choque', rama, choque }
    try {
      git(donde, 'merge', '--ff-only', '--quiet', remoto)
    } catch (error) {
      // `--ff-only` o avanza entero o no empieza: si falla, no ha tocado nada.
      return { estado: 'divergido', rama, error: (error.stderr || error.message).toString().trim() }
    }
    return { estado: 'actualizado', rama, traidos: cambiadosFuera.length }
  }

  // Lo tuyo va por delante y fuera no hay nada nuevo: ya lo subirá «Subir».
  if (gitSale(donde, 'merge-base', '--is-ancestor', remoto, 'HEAD')) return { estado: 'por-delante', rama }

  // Divergido: commits tuyos sin subir y commits nuevos fuera.
  return rebasarLimpioEn(donde, rama, remoto)
}

/**
 * Poner tus commits encima de los de fuera, **sólo con el árbol limpio**, y si
 * choca, `rebase --abort` —que sí lo deja todo como estaba— y parar. Con cambios
 * sin anotar no se intenta: eso pediría apartarlos, que es lo que no se hace.
 */
function rebasarLimpioEn(donde, rama, remoto) {
  const sinAnotar = lineasDeEstado(donde, '--untracked-files=no')
  if (sinAnotar.length) return { estado: 'divergido', rama, sinAnotar: sinAnotar.map((l) => l.ruta) }
  try {
    git(donde, 'rebase', '--quiet', remoto)
    return { estado: 'actualizado', rama }
  } catch (error) {
    gitSale(donde, 'rebase', '--abort')
    return { estado: 'divergido', rama, error: (error.stderr || error.message).toString().trim() }
  }
}

// ------------------------------------------------------------ subir

/**
 * **Los mapas que hay en este PC y no en el juego** (vuelta 93), con los
 * conflictos al lado desde la 99: la barra de Alchemist y los lanzadores los
 * enseñan antes que la lista, y con uno delante no se ofrece subir.
 */
export function estadoDeMapasEn(donde) {
  try {
    const carpetas = carpetasQueSuben(donde)
    if (!carpetas.length) throw new Error('no hay nada que Alchemist escriba en este árbol')
    const rutas = lineasDeEstado(donde, '--', ...carpetas).map((l) => l.ruta)

    /**
     * **Un mapa y el registro no son la misma cosa en pantalla.** Añadir un
     * mapa cambia también `src/maps/index.js` y su historial, y contarlas como
     * mapas anunciaría «3 mapas sin subir» por uno. Qué es un mapa lo dice **el
     * mismo dato que el registro**: un `.js` de la carpeta que declara su
     * `clave`. Borrado no se puede leer, y entonces lo era.
     */
    const esMapa = (ruta) => {
      if (!ruta.startsWith('src/maps/')) return false
      const nombre = ruta.slice('src/maps/'.length)
      if (nombre.includes('/') || !nombre.endsWith('.js')) return false
      if (NO_SON_MAPAS.has(nombre)) return false
      try {
        return /clave:\s*"/.test(readFileSync(resolve(donde, ruta), 'utf8'))
      } catch { return true }
    }
    const esImagen = (ruta) => {
      if (!ruta.startsWith('public/estampados/')) return false
      const nombre = ruta.slice('public/estampados/'.length)
      if (nombre.includes('/')) return false
      return EXTENSIONES_ESTAMPADO.some((ext) => nombre.toLowerCase().endsWith(ext))
    }
    const conflicto = conflictosEn(donde)
    return {
      mapas: rutas.filter(esMapa).map((r) => r.slice('src/maps/'.length)),
      imagenes: rutas.filter(esImagen).map((r) => r.slice('public/estampados/'.length)),
      otros: rutas.filter((r) => !esMapa(r) && !esImagen(r)).length,
      rama: git(donde, 'rev-parse', '--abbrev-ref', 'HEAD').trim(),
      conflictos: conflicto.todos,
      enCurso: conflicto.enCurso,
    }
  } catch (error) {
    return { mapas: [], imagenes: [], otros: 0, rama: null, conflictos: [], enCurso: null, error: error.message }
  }
}

/**
 * **El mensaje dice qué llevaba, porque la historia está curada** (vuelta 75).
 */
function mensajeDeSubida(mapas, imagenes) {
  if (mapas.length && imagenes.length) return 'mapas y estampados: cambios desde Alchemist'
  if (imagenes.length) return 'estampados: imágenes desde Alchemist'
  return 'mapas: cambios desde Alchemist'
}

/**
 * **Un commit por subida, no por guardado**, y **nunca con un conflicto
 * dentro**: lo primero que hace es mirar, y si hay uno lanza con el texto que
 * lo dice. El error no es un fallo del botón, es el botón haciendo su trabajo.
 *
 * Y para empujar trae lo de fuera **sin apartar nada**: si fuera no hay nada
 * nuevo, empuja; si lo hay, pone la subida encima con el árbol limpio y, si no
 * entra, lo deshace y lo dice. Lo que ya se anotó se queda anotado en este PC.
 */
export function subirMapasEn(donde) {
  const conflicto = conflictosEn(donde)
  if (conflicto.hay) {
    const error = new Error(`No se sube nada: ${textoDeConflicto(conflicto)}`)
    error.conflicto = conflicto
    throw error
  }
  const { mapas, imagenes, otros, rama } = estadoDeMapasEn(donde)
  if (!rama) throw new Error('aquí no hay un repositorio de git')
  if (mapas.length || imagenes.length || otros) {
    git(donde, 'add', '--', ...carpetasQueSuben(donde))
    git(donde, '-c', 'core.editor=true', 'commit', '-q', '-m', mensajeDeSubida(mapas, imagenes))
  }
  const remoto = `origin/${rama}`
  gitSale(donde, 'fetch', '--quiet', 'origin', rama)
  const haySubidaPendiente = !gitSale(donde, 'merge-base', '--is-ancestor', 'HEAD', remoto)
  if (!mapas.length && !imagenes.length && !otros && !haySubidaPendiente) {
    return { subidos: [], imagenes: [], nota: 'no había nada que subir' }
  }
  if (!gitSale(donde, 'merge-base', '--is-ancestor', remoto, 'HEAD')) {
    const rebase = rebasarLimpioEn(donde, rama, remoto)
    if (rebase.estado !== 'actualizado') {
      throw new Error('Tus cambios están anotados en este PC, pero no he podido ponerlos encima de lo '
        + 'último del juego sin mezclar. No se ha subido nada ni se ha perdido nada: pásaselo a Code.')
    }
  }
  git(donde, 'push', '--quiet', 'origin', rama)
  return { subidos: mapas, imagenes, otros, rama }
}
