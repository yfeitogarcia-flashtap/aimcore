/**
 * **Los textos del juego, por idioma** (vuelta 108, propuesta 18).
 *
 * Hoy los textos que ve el jugador están escritos a mano en el JSX, en el HTML
 * de la página del multijugador, en `config.js` y en Alchemist, y en español de
 * España. Esto es el sitio al que se van a mudar: **un catálogo por idioma** y
 * una función que los busca. En esta vuelta **no lo usa ninguna pantalla**, a
 * propósito: se construye el catálogo sin cambiar la experiencia, y la mudanza
 * va por zonas en las vueltas siguientes (el plan, en la propuesta 18).
 *
 * Cuatro reglas que son el diseño:
 *
 * - **El español neutro es la fuente** (`es.js`) y es a donde cae cualquier otro
 *   idioma que no tenga una clave. Un texto que falta en inglés sale en español,
 *   no como una clave rara en pantalla, y se anota para poder contarlo.
 * - **Una clave dice qué es, no qué pone**: `peana.recoger`, no `e_recoger`. Así
 *   cambiar la frase no obliga a cambiar la clave en el código.
 * - **Sin dependencias, ni `three`, ni React, ni DOM**: lo importan la página, el
 *   huésped de Node (los motivos de `ADIOS`, que hoy viajan redactados) y
 *   Alchemist. Es la disciplina de `proyectiles.js` y `arsenal.js`.
 * - **Nada se construye pegando trozos de frase**: una frase con huecos es una
 *   clave con `{nombre}` dentro, porque el orden de las palabras cambia de un
 *   idioma a otro. Y un plural es un objeto `{ one, other }` que resuelve
 *   `Intl.PluralRules`, no un `n === 1 ? … : …` escrito a mano.
 */
import es from './es.js'
import en from './en.js'
import ptBR from './pt-BR.js'

/** Los idiomas que hay, en el orden en que se ofrecerían. `es` es la fuente. */
export const IDIOMAS = [
  { clave: 'es', nombre: 'Español', catalogo: es },
  { clave: 'en', nombre: 'English', catalogo: en },
  { clave: 'pt-BR', nombre: 'Português (Brasil)', catalogo: ptBR },
]
export const IDIOMA_FUENTE = 'es'

const POR_CLAVE = Object.fromEntries(IDIOMAS.map((i) => [i.clave, i]))
let actual = IDIOMA_FUENTE
const plurales = new Map()
/** Las claves que se pidieron y no estaban en el idioma puesto: para contarlas, no para pintarlas. */
export const faltas = new Set()

/** El idioma en el que se está hablando. */
export function idiomaActual() {
  return actual
}

/** Pone un idioma. Uno que no existe cae a la fuente, y lo dice devolviendo cuál quedó. */
export function ponerIdioma(clave) {
  actual = POR_CLAVE[clave] ? clave : IDIOMA_FUENTE
  return actual
}

/**
 * **Qué idioma pide el navegador**, entre los que hay. Recibe la lista de
 * `navigator.languages` (o nada, en Node) para no leer el DOM aquí. Cualquier
 * español es `es`, cualquier portugués `pt-BR` (el de Portugal cae ahí antes
 * que a español), cualquier inglés `en`, y lo demás, la fuente.
 */
export function idiomaDelNavegador(lista = []) {
  for (const etiqueta of lista) {
    const base = String(etiqueta).toLowerCase().split('-')[0]
    if (base === 'es') return 'es'
    if (base === 'pt') return 'pt-BR'
    if (base === 'en') return 'en'
  }
  return IDIOMA_FUENTE
}

/** El valor crudo de una clave en un idioma, o `undefined`. Admite claves con puntos anidadas o planas. */
function crudo(catalogo, clave) {
  if (Object.prototype.hasOwnProperty.call(catalogo, clave)) return catalogo[clave]
  let nodo = catalogo
  for (const trozo of clave.split('.')) {
    if (nodo == null || typeof nodo !== 'object' || !Object.prototype.hasOwnProperty.call(nodo, trozo)) return undefined
    nodo = nodo[trozo]
  }
  return nodo
}

/** Busca en el idioma puesto y, si no está, en la fuente. */
function buscar(clave, idioma) {
  const propio = crudo(POR_CLAVE[idioma].catalogo, clave)
  if (propio !== undefined) return propio
  if (idioma !== IDIOMA_FUENTE) faltas.add(`${idioma}:${clave}`)
  const fuente = crudo(es, clave)
  if (fuente === undefined) faltas.add(`${IDIOMA_FUENTE}:${clave}`)
  return fuente
}

/** `{ one, other }` → la forma que toca para `n` en ese idioma. */
function elegirPlural(valor, n, idioma) {
  let reglas = plurales.get(idioma)
  if (!reglas) {
    reglas = new Intl.PluralRules(idioma)
    plurales.set(idioma, reglas)
  }
  const forma = reglas.select(n)
  return valor[forma] ?? valor.other
}

/** Resuelve la clave a una cadena con huecos, o a la propia clave si no existe en ninguna parte. */
function plantilla(clave, vars, idioma) {
  const valor = buscar(clave, idioma)
  if (valor === undefined) return clave
  if (valor && typeof valor === 'object') {
    if (typeof vars?.n !== 'number') return valor.other ?? clave
    return elegirPlural(valor, vars.n, idioma)
  }
  return valor
}

const HUECO = /\{(\w+)\}/g

/**
 * **El texto de una clave**, con sus huecos rellenos: `t('peana.recoger', {
 * tecla: 'E', arma: 'Reaper' })`. Un hueco sin valor se deja escrito (`{arma}`),
 * que se ve en pantalla y se caza mirando, en vez de salir vacío.
 */
export function t(clave, vars = {}, idioma = actual) {
  return plantilla(clave, vars, idioma).replace(HUECO, (entero, nombre) =>
    vars[nombre] === undefined || vars[nombre] === null ? entero : String(vars[nombre]))
}

/**
 * **El texto en trozos**, para quien necesita meter algo que no es texto en un
 * hueco —un `<kbd>` con la tecla, un enlace, un número en negrita—. Devuelve una
 * lista de cadenas y de los valores tal cual: React la pinta sin más
 * (`<p>{partes('como.apunta', { disparar: <kbd>…</kbd> })}</p>`), y no hay que
 * cortar una frase en tres claves ni meter marcado en el catálogo.
 */
export function partes(clave, vars = {}, idioma = actual) {
  const texto = plantilla(clave, vars, idioma)
  const salida = []
  let desde = 0
  for (const m of texto.matchAll(HUECO)) {
    if (m.index > desde) salida.push(texto.slice(desde, m.index))
    const valor = vars[m[1]]
    salida.push(valor === undefined || valor === null ? m[0] : valor)
    desde = m.index + m[0].length
  }
  if (desde < texto.length) salida.push(texto.slice(desde))
  return salida
}

/** Todas las claves de un catálogo, planas (`a.b.c`), sin bajar dentro de un plural. */
export function clavesDe(catalogo, prefijo = '') {
  const salida = []
  for (const [k, v] of Object.entries(catalogo)) {
    const clave = prefijo ? `${prefijo}.${k}` : k
    const esPlural = v && typeof v === 'object' && typeof v.other === 'string'
    if (v && typeof v === 'object' && !esPlural) salida.push(...clavesDe(v, clave))
    else salida.push(clave)
  }
  return salida
}

/** Los huecos que usa un valor (cadena o plural), ordenados: para comparar idiomas. */
export function huecosDe(valor) {
  const textos = typeof valor === 'string' ? [valor] : Object.values(valor ?? {})
  const nombres = new Set()
  for (const texto of textos) for (const m of String(texto).matchAll(HUECO)) nombres.add(m[1])
  return [...nombres].sort()
}

/** El valor crudo de una clave en un idioma concreto (para bancos y herramientas). */
export function valorEn(idioma, clave) {
  return crudo(POR_CLAVE[idioma]?.catalogo ?? {}, clave)
}
