/**
 * **Lo que hacen los lanzadores de Alchemist con git, en castellano** (vuelta 99).
 *
 * `Alchemist.bat` y `Alchemist.command` llaman aquí y nada más: la lógica está
 * en `scripts/lib/alchemist-git.mjs`, que es también lo que usa el botón «Subir
 * al juego». Esto sólo habla con la persona y pregunta.
 *
 *   node scripts/alchemist.mjs actualizar   → 0 abre el editor, 1 para
 *   node scripts/alchemist.mjs avisar       → lo que hay sin subir, al abrir
 *   node scripts/alchemist.mjs subir        → lo mismo que el botón, con pregunta
 *
 * Sólo usa lo que trae Node: se ejecuta **antes** de `npm install`.
 */
import { createInterface } from 'node:readline/promises'
import { resolve, sep } from 'node:path'
import { existsSync } from 'node:fs'
import {
  CARPETAS_QUE_SUBEN, CARPETA_RESCATE, actualizarEn, conflictosEn, estadoDeMapasEn, git,
  quedarseConLaDelJuegoEn, subirMapasEn, textoDeConflicto,
} from './lib/alchemist-git.mjs'

const REPO = resolve(import.meta.dirname, '..')
const decir = (texto = '') => console.log(texto)
const sangrar = (texto) => texto.split('\n').map((l) => `  ${l}`).join('\n')

async function preguntar(texto) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try { return (await rl.question(texto)).trim().toLowerCase() } finally { rl.close() }
}

/**
 * **Las copias viejas de `git stash` se dicen, no se tocan.** Son lo que los
 * lanzadores de antes de la 99 desenterraban a ciegas; ahora ninguno las saca,
 * así que ya no pueden volver al disco. Borrarlas sería borrar trabajo de
 * alguien, así que sólo se cuentan.
 */
function contarApartados() {
  let lista = ''
  try { lista = git(REPO, 'stash', 'list') } catch { return }
  const cuantos = lista.split('\n').filter(Boolean).length
  if (!cuantos) return
  decir(`      (git guarda ${cuantos} copia(s) apartada(s) de otras veces. Ya no se sacan solas;`)
  decir('       si quieres recuperar algo de ahí, pásaselo a Code.)')
}

async function actualizar() {
  decir('[1/3] Trayendo la última versión...')
  for (let intento = 0; intento < 3; intento++) {
    const r = actualizarEn(REPO)
    if (r.rama) decir(`      rama: ${r.rama}`)

    switch (r.estado) {
      case 'al-dia':
        decir('      ya tenías la última.')
        contarApartados()
        return 0
      case 'actualizado':
        decir(`      al día${r.traidos ? ` (${r.traidos} fichero(s) nuevos)` : ''}.`)
        contarApartados()
        return 0
      case 'por-delante':
        decir('      tienes cambios anotados sin subir; «Subir al juego» los sube.')
        return 0
      case 'sin-red':
        decir('      no he podido preguntar por la última versión; se abre con la que hay.')
        decir(`      (${r.error.split('\n')[0]})`)
        return 0

      case 'conflicto': {
        decir()
        decir(sangrar(textoDeConflicto(r.conflicto)))
        decir()
        if (r.conflicto.enCurso) {
          decir('  Así no se puede abrir el editor ni subir nada, y esto no lo arreglo solo.')
          decir('  No he tocado nada. Pásaselo a Code tal cual.')
          return 1
        }
        decir('  Con eso dentro el editor no arranca y el juego se rompería si se subiera.')
        decir(`  Puedo dejarlos como están en el juego. Tu copia se guarda antes en`)
        decir(`  la carpeta ${CARPETA_RESCATE}${sep} de Vektor, para que no se pierda nada.`)
        const si = await preguntar('  ¿Los dejo como en el juego? [s/N] ')
        if (si !== 's') {
          decir('  Vale, no toco nada. Pásaselo a Code tal cual y lo resolvemos.')
          return 1
        }
        const { carpeta, copiados } = quedarseConLaDelJuegoEn(REPO, r.conflicto.todos)
        decir(`  Hecho. Tus copias están en ${carpeta} (${copiados.length}).`)
        continue
      }

      case 'choque': {
        decir()
        decir('  Estos ficheros los has cambiado en este PC y el juego también los ha cambiado:')
        for (const ruta of r.choque) decir(`     ${ruta}`)
        decir()
        decir('  No he traído nada ni he tocado nada: tu copia sigue como estaba.')
        decir('  [J] quedarme con la del juego (tu copia se guarda en ' + CARPETA_RESCATE + ')')
        decir('  [A] abrir Alchemist con lo que hay, sin traer lo nuevo')
        decir('  [N] parar aquí y pasárselo a Code')
        const eleccion = await preguntar('  ¿Qué hago? [j/a/N] ')
        if (eleccion === 'a') {
          decir('  Se abre con lo que hay. Lo nuevo del juego no está en este editor.')
          return 0
        }
        if (eleccion !== 'j') {
          decir('  Vale, no toco nada. Pásaselo a Code tal cual.')
          return 1
        }
        const { carpeta, copiados } = quedarseConLaDelJuegoEn(REPO, r.choque)
        decir(`  Hecho. Tus copias están en ${carpeta} (${copiados.length}).`)
        continue
      }

      case 'divergido':
      default:
        decir()
        decir('  Tienes cambios anotados en este PC que no están en el juego, y el juego tiene')
        decir('  cambios que no están aquí. Juntarlos a ciegas podría pisar algo tuyo.')
        if (r.sinAnotar?.length) decir(`  Además hay cambios sin anotar: ${r.sinAnotar.join(', ')}`)
        if (r.error) decir(`  (${r.error.split('\n')[0]})`)
        decir('  No he tocado nada. Pásaselo a Code tal cual.')
        return 1
    }
  }
  decir('  No he conseguido dejarlo al día. No he tocado nada más: pásaselo a Code.')
  return 1
}

function listar(estado) {
  for (const m of estado.mapas) decir(`     ${m}`)
  for (const i of estado.imagenes) decir(`     ${i}   (imagen de estampado)`)
  if (estado.otros) decir(`     y ${estado.otros} fichero(s) del registro y el historial`)
}

/**
 * **Lo pendiente se puede descartar al abrir** (vuelta 99). Es lo que le hacía
 * falta a Yago con el `z:16` que ya tenía en el disco: un cambio que no ha
 * hecho él —lo desenterró el lanzador viejo— y que no quiere subir. Descartar
 * es quedarse con la del juego, con la copia apartada antes en el rescate; y
 * por defecto (Intro) no se toca nada.
 */
async function avisar() {
  const estado = estadoDeMapasEn(REPO)
  if (estado.conflictos.length || estado.enCurso) {
    decir()
    decir(sangrar(textoDeConflicto(conflictosEn(REPO))))
    decir('  Eso NO se sube. Pásaselo a Code.')
    return 0
  }
  if (!estado.mapas.length && !estado.imagenes.length && !estado.otros) return 0
  decir()
  decir('  OJO: tienes cosas cambiadas en este PC y NO en el juego:')
  listar(estado)
  decir('  Súbelas desde Alchemist: Archivo > Subir al juego.')
  decir()
  decir('  Si no son tuyas o no las quieres, puedo dejarlas como en el juego')
  decir(`  (tu copia se guarda antes en ${CARPETA_RESCATE}${sep}).`)
  const respuesta = await preguntar('  [Intro] seguir con ellas · [D] descartarlas: ')
  if (respuesta !== 'd') return 0
  const rutas = git(REPO, 'status', '--porcelain', '--', ...CARPETAS_QUE_SUBEN.filter((c) => existsSync(resolve(REPO, c))))
    .split('\n').filter((l) => l.length > 3).map((l) => l.slice(3).trimEnd().replace(/^"|"$/g, '').split(' -> ').pop())
  const { carpeta, copiados } = quedarseConLaDelJuegoEn(REPO, rutas)
  decir(`  Hecho: como en el juego. Tus copias están en ${carpeta} (${copiados.length}).`)
  return 0
}

async function subir() {
  decir()
  decir('================================================')
  decir('  Mapas e imágenes sin subir')
  decir('================================================')
  const conflicto = conflictosEn(REPO)
  if (conflicto.hay) {
    decir(sangrar(textoDeConflicto(conflicto)))
    decir()
    decir('  Con un conflicto dentro NO se sube nada: rompería el juego publicado.')
    decir('  La próxima vez que abras Alchemist te ofrezco arreglarlo. O pásaselo a Code.')
    return 1
  }
  const estado = estadoDeMapasEn(REPO)
  if (!estado.mapas.length && !estado.imagenes.length && !estado.otros) {
    decir('  Nada que subir: lo que hay aquí es lo que hay en el juego.')
    return 0
  }
  decir('  Esto está cambiado en este PC y NO en el juego:')
  listar(estado)
  decir()
  const respuesta = await preguntar('  ¿Subirlo ahora? [S/n] ')
  if (respuesta === 'n') {
    decir('  Vale, se queda aquí. La próxima vez te lo vuelvo a preguntar.')
    return 0
  }
  try {
    subirMapasEn(REPO)
    decir('  Subido. En unos minutos está en el juego.')
    return 0
  } catch (error) {
    decir(sangrar(error.message))
    return 1
  }
}

const orden = process.argv[2]
const acciones = { actualizar, avisar, subir }
if (!acciones[orden]) {
  decir('uso: node scripts/alchemist.mjs actualizar | avisar | subir')
  process.exit(2)
}
try {
  process.exit(await acciones[orden]())
} catch (error) {
  decir()
  decir(`  Algo ha fallado: ${error.message.split('\n')[0]}`)
  decir('  No he tocado nada más. Pásaselo a Code tal cual.')
  process.exit(1)
}
