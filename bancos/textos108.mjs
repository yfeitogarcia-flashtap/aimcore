// textos108 — el catálogo de textos (vuelta 108, propuesta 18), sin navegador.
//  [1] Ningún idioma tiene claves que no estén en la fuente (es), y cada clave
//      lleva en cada idioma los mismos huecos que en la fuente.
//  [2] La fuente está en español neutro: ni un «coger» ni un «vosotros».
//  [3] `t` rellena huecos, cae a la fuente lo que falta, y deja a la vista el
//      hueco sin valor y la clave inexistente, contándolas.
//  [4] Los plurales salen de Intl.PluralRules, en cada idioma.
//  [5] `partes` devuelve trozos con los valores tal cual (para un <kbd>).
//  [6] El idioma del navegador se elige bien, y uno que no hay cae a la fuente.
//  [7] Todavía no lo usa ninguna pantalla: la experiencia no cambia esta vuelta.
//  Y lo que le falta a cada idioma, contado (informe, no afirma).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  IDIOMAS, IDIOMA_FUENTE, clavesDe, faltas, huecosDe, idiomaDelNavegador, partes, ponerIdioma, t, valorEn,
} from '../src/textos/index.js'

let fallos = 0
const ok = (c, txt, d = '') => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${txt}${d ? ` — ${d}` : ''}`); if (!c) fallos += 1 }

const fuente = IDIOMAS.find((i) => i.clave === IDIOMA_FUENTE)
const clavesFuente = clavesDe(fuente.catalogo)

console.log('\n[1] Las mismas claves y los mismos huecos que la fuente')
ok(clavesFuente.length > 0, `la fuente tiene claves (${clavesFuente.length})`)
for (const { clave, catalogo } of IDIOMAS) {
  if (clave === IDIOMA_FUENTE) continue
  const claves = clavesDe(catalogo)
  const huerfanas = claves.filter((k) => valorEn(IDIOMA_FUENTE, k) === undefined)
  ok(huerfanas.length === 0, `${clave}: ninguna clave que no esté en la fuente`, huerfanas.join(', '))
  const distintas = claves.filter((k) => valorEn(IDIOMA_FUENTE, k) !== undefined
    && huecosDe(valorEn(clave, k)).join() !== huecosDe(valorEn(IDIOMA_FUENTE, k)).join())
  ok(distintas.length === 0, `${clave}: los mismos huecos en las ${claves.length} claves`, distintas.join(', '))
  const formas = claves.filter((k) => {
    const v = valorEn(clave, k); const f = valorEn(IDIOMA_FUENTE, k)
    return (typeof v === 'string') !== (typeof f === 'string')
  })
  ok(formas.length === 0, `${clave}: un plural es plural en los dos idiomas`, formas.join(', '))
}

console.log('\n[2] La fuente, en español neutro')
{
  const textos = clavesFuente.flatMap((k) => {
    const v = valorEn(IDIOMA_FUENTE, k)
    return typeof v === 'string' ? [[k, v]] : Object.values(v).map((x) => [k, x])
  })
  // Con límites de palabra Unicode: `\b` no entiende de tildes y dejaba pasar «cogió».
  const coger = /(?<!\p{L})c[oó]g(e|er|es|en|ido|ida|idos|idas|iendo|í|ió|emos|éis|ela|elo|elas|elos|erlo|erla)(?!\p{L})/iu
  const malas = textos.filter(([, v]) => coger.test(v)).map(([k]) => k)
  ok(malas.length === 0, 'ni un «coger» ni sus formas', malas.join(', '))
  const vosotros = /\b(vosotros|vosotras|os\b|pulsad|mirad|marcad|tenéis|podéis|habéis|sois|estáis|vuestr[oa]s?)\b/i
  const vos = textos.filter(([, v]) => vosotros.test(v)).map(([k]) => k)
  ok(vos.length === 0, 'ni un «vosotros» ni sus formas', vos.join(', '))
  const espana = /\b(ordenador|fichero|pinch[ae]|ratón|vale\b|móvil)/i
  const esp = textos.filter(([, v]) => espana.test(v)).map(([k]) => k)
  ok(esp.length === 0, 'ni ordenador, fichero, pinchar, ratón, vale ni móvil', esp.join(', '))
}

console.log('\n[3] t: huecos, caída a la fuente y lo que falta, a la vista')
{
  faltas.clear()
  ponerIdioma('es')
  ok(t('peana.recoger', { tecla: 'E', arma: 'Reaper' }) === 'E · Recoger Reaper', 'rellena los huecos', t('peana.recoger', { tecla: 'E', arma: 'Reaper' }))
  ok(t('peana.recoger', { tecla: 'E' }) === 'E · Recoger {arma}', 'un hueco sin valor se queda escrito')
  ok(t('no.existe') === 'no.existe' && faltas.has('es:no.existe'), 'una clave que no existe sale tal cual y se cuenta')
  ponerIdioma('en')
  ok(t('peana.recoger', { tecla: 'E', arma: 'Reaper' }) === 'E · Pick up Reaper', 'en inglés, en inglés')
  ponerIdioma('pt-BR')
  ok(t('comun.volver') === 'Volver' && faltas.has('pt-BR:comun.volver'), 'lo que le falta al portugués sale de la fuente, y se cuenta')
  ok(ponerIdioma('klingon') === 'es', 'un idioma que no hay cae a la fuente')
  ok(t('comun.volver', {}, 'en') === 'Back', 'y se puede pedir un idioma sin cambiar el puesto')
}

console.log('\n[4] Plurales')
{
  ok(t('sala.faltan', { n: 1 }, 'es') === 'Falta 1 jugador', 'es · uno', t('sala.faltan', { n: 1 }, 'es'))
  ok(t('sala.faltan', { n: 3 }, 'es') === 'Faltan 3 jugadores', 'es · varios')
  ok(t('sala.faltan', { n: 0 }, 'es') === 'Faltan 0 jugadores', 'es · cero es plural')
  ok(t('sala.faltan', { n: 1 }, 'en') === '1 more player needed' && t('sala.faltan', { n: 2 }, 'en') === '2 more players needed', 'en · uno y varios')
}

console.log('\n[5] partes: trozos y valores tal cual')
{
  const kbd = { tipo: 'kbd', tecla: 'E' }
  const p = partes('peana.recoger', { tecla: kbd, arma: 'Reaper' }, 'es')
  ok(p[0] === kbd && p.slice(1).join('') === ' · Recoger Reaper', 'el valor entra sin convertirse en texto', JSON.stringify(p))
  const q = partes('comun.volver', {}, 'es')
  ok(q.length === 1 && q[0] === 'Volver', 'sin huecos, un solo trozo')
}

console.log('\n[6] El idioma del navegador')
ok(idiomaDelNavegador(['es-MX', 'en']) === 'es', 'es-MX → es')
ok(idiomaDelNavegador(['pt-PT']) === 'pt-BR' && idiomaDelNavegador(['pt-BR']) === 'pt-BR', 'cualquier portugués → pt-BR')
ok(idiomaDelNavegador(['en-US']) === 'en', 'en-US → en')
ok(idiomaDelNavegador(['fr-FR', 'de']) === 'es' && idiomaDelNavegador([]) === 'es', 'lo demás, la fuente')

console.log('\n[7] Esta vuelta no cambia la experiencia')
{
  const usos = []
  const recorrer = (dir) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre)
      if (statSync(ruta).isDirectory()) { if (nombre !== 'textos' && nombre !== 'node_modules') recorrer(ruta); continue }
      if (!/\.(jsx?|mjs|html)$/.test(nombre)) continue
      if (/from ['"][./]*textos(\/index\.js)?['"]|src\/textos\//.test(readFileSync(ruta, 'utf8'))) usos.push(ruta)
    }
  }
  for (const d of ['src', 'net', 'editor']) recorrer(d)
  ok(usos.length === 0, 'ninguna pantalla importa el catálogo todavía', usos.join(', '))
}

console.log('\nCobertura (informe)')
for (const { clave, catalogo } of IDIOMAS) {
  const n = clavesDe(catalogo).length
  console.log(`  ${clave.padEnd(6)} ${String(n).padStart(3)} de ${clavesFuente.length} claves${clave === IDIOMA_FUENTE ? ' (fuente)' : ''}`)
}

console.log(`\n${fallos ? `${fallos} FALLO(S)` : 'todo verde'}`)
process.exit(fallos ? 1 : 0)
