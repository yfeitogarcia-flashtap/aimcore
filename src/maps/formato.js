/**
 * **El formato de un mapa, y es uno solo** (vuelta 74).
 *
 * Lo miran los dos extremos del editor —quien dibuja y quien carga— por la
 * razón de siempre: dos ideas de qué campos tiene un mapa es un mapa que se
 * guarda con su física y se abre sin ella, y el síntoma no sería un error sino
 * un jugador que salta distinto.
 *
 * Lo que hay aquí es el vocabulario (`CAMPOS`), el saneado y el serializador.
 * Nada de geometría: eso es de `scenario.js`, que monta **estos mismos datos**.
 */

import { COVER, ROOM, coverHeight } from '../config.js'

/**
 * **Todos los campos que puede tener un mapa, en el orden en que se escriben.**
 *
 * La lista es exhaustiva a propósito y el saneado **se queja de lo que no esté
 * en ella** en vez de tirarlo: un campo que desaparece en silencio al guardar
 * es cómo un mapa pierde su `fisica` sin que nadie se entere. Si añades un
 * campo a un escenario, va aquí y en `sanearMapa`.
 */
export const CAMPOS = [
  'clave', 'label', 'card', 'soloDuelo', 'room', 'spawn', 'fisica', 'duelo',
  'boxes', 'ramps', 'spawnZone', 'objectiveSites', 'pickups', 'routes', 'anchors',
]

/** Lo que puede ser la altura de una pieza: una clave del vocabulario o un número. */
export const ALTURAS = Object.keys(COVER.heights)

/** Límites de una sala. No son de gusto: por debajo no cabe el cuerpo, por encima la grilla se vuelve ruido. */
export const SALA = { min: 10, max: 200, alto: { min: 4, max: 60 } }

/** Lo mínimo que mide una pieza: por debajo del radio del cuerpo no es cobertura, es un poste invisible. */
export const PIEZA_MINIMA = 0.1

const finito = (v) => typeof v === 'number' && Number.isFinite(v)
const acotar = (v, min, max) => (v < min ? min : v > max ? max : v)

/** Un mapa en blanco: la sala del Plano A, una salida y nada más. */
export function mapaNuevo(clave = 'mapa-nuevo') {
  return {
    clave,
    label: 'Mapa nuevo',
    room: { width: 40, depth: 40, height: 10 },
    spawn: { x: 0, z: 16 },
    boxes: [],
    ramps: [],
    spawnZone: [],
    objectiveSites: [],
    pickups: [],
    routes: [],
  }
}

/**
 * **Una pieza es una caja en planta**, la misma convención que `SCENARIOS`:
 * `x`/`z` son la esquina mínima y `w`/`d` el tamaño. `base` la levanta.
 */
export function sanearPieza(bruta, problemas = [], donde = 'pieza') {
  const p = {}
  for (const eje of ['x', 'z', 'w', 'd']) {
    if (!finito(bruta?.[eje])) { problemas.push(`${donde}: ${eje} no es un número`); return null }
    p[eje] = bruta[eje]
  }
  if (p.w < PIEZA_MINIMA || p.d < PIEZA_MINIMA) {
    problemas.push(`${donde}: mide menos de ${PIEZA_MINIMA} u`)
    return null
  }
  const kind = bruta.kind
  if (!finito(kind) && !COVER.heights[kind]) {
    problemas.push(`${donde}: altura desconocida (${JSON.stringify(kind)})`)
    return null
  }
  p.kind = kind
  if (bruta.base !== undefined) {
    if (!finito(bruta.base) && !COVER.heights[bruta.base]) {
      problemas.push(`${donde}: base desconocida (${JSON.stringify(bruta.base)})`)
      return null
    }
    // Una base por encima del techo deja una pieza de grosor cero, que
    // `scenario.js` descarta al montar: mejor decirlo aquí que verla faltar.
    if (coverHeight(bruta.base) >= coverHeight(kind)) {
      problemas.push(`${donde}: la base (${bruta.base}) no está por debajo del techo (${kind})`)
      return null
    }
    p.base = bruta.base
  }
  return p
}

/** Un área en planta: `spawnZone` y las cajas de compra usan esta misma forma. */
function sanearArea(bruta, problemas, donde) {
  const a = {}
  for (const eje of ['x', 'z', 'w', 'd']) {
    if (!finito(bruta?.[eje])) { problemas.push(`${donde}: ${eje} no es un número`); return null }
    a[eje] = bruta[eje]
  }
  return a
}

function sanearRampa(bruta, problemas, donde) {
  const r = sanearPieza({ ...bruta, kind: bruta?.top }, problemas, donde)
  if (!r) return null
  const out = { x: r.x, z: r.z, w: r.w, d: r.d }
  for (const eje of ['fromZ', 'toZ']) {
    if (!finito(bruta[eje])) { problemas.push(`${donde}: ${eje} no es un número`); return null }
    out[eje] = bruta[eje]
  }
  out.top = bruta.top
  return out
}

/**
 * **Sanea un mapa y dice qué ha tenido que tirar.**
 *
 * Devuelve `{ mapa, problemas }` y nunca lanza: el editor tiene que poder
 * enseñar un mapa a medias con la lista de lo que le pasa, que es más útil que
 * una pantalla en blanco. Lo que no se puede sanear **se cuenta**, no se calla
 * — es la regla del `try/catch` de `localStorage` (vuelta 60) en otro sitio.
 */
export function sanearMapa(bruto) {
  const problemas = []
  if (!bruto || typeof bruto !== 'object') {
    return { mapa: mapaNuevo(), problemas: ['no es un objeto'] }
  }

  for (const campo of Object.keys(bruto)) {
    if (!CAMPOS.includes(campo)) problemas.push(`campo desconocido: ${campo}`)
  }

  const mapa = {}
  if (typeof bruto.clave === 'string' && bruto.clave) mapa.clave = bruto.clave
  mapa.label = typeof bruto.label === 'string' && bruto.label ? bruto.label : 'Sin nombre'
  if (bruto.card) mapa.card = bruto.card
  if (bruto.soloDuelo) mapa.soloDuelo = true

  if (bruto.room) {
    const r = bruto.room
    mapa.room = {
      width: acotar(finito(r.width) ? r.width : ROOM.width, SALA.min, SALA.max),
      depth: acotar(finito(r.depth) ? r.depth : ROOM.depth, SALA.min, SALA.max),
      height: acotar(finito(r.height) ? r.height : ROOM.height, SALA.alto.min, SALA.alto.max),
    }
    if (mapa.room.width !== r.width || mapa.room.depth !== r.depth || mapa.room.height !== r.height) {
      problemas.push('la sala se ha acotado a los límites del editor')
    }
  }

  mapa.spawn = finito(bruto.spawn?.x) && finito(bruto.spawn?.z)
    ? { x: bruto.spawn.x, z: bruto.spawn.z }
    : { x: 0, z: 0 }
  if (!finito(bruto.spawn?.x)) problemas.push('sin punto de aparición: se pone en el origen')

  // La física del mapa (vuelta 72): sólo tres números, y sólo si los declara.
  if (bruto.fisica) {
    mapa.fisica = {}
    for (const clave of ['gravity', 'jumpSpeed', 'airStrafeMaxSpeed']) {
      if (bruto.fisica[clave] === undefined) continue
      if (!finito(bruto.fisica[clave]) || bruto.fisica[clave] <= 0) {
        problemas.push(`física: ${clave} no es un número positivo`)
        continue
      }
      mapa.fisica[clave] = bruto.fisica[clave]
    }
  }

  // El bloque de duelo se conserva entero: salidas, dotación y «sin economía»
  // son de la fase 3 y hasta entonces se guardan tal cual en vez de perderse.
  if (bruto.duelo) mapa.duelo = bruto.duelo

  const listas = {
    boxes: (b, i) => sanearPieza(b, problemas, `pieza ${i}`),
    ramps: (b, i) => sanearRampa(b, problemas, `rampa ${i}`),
    spawnZone: (b, i) => sanearArea(b, problemas, `zona ${i}`),
  }
  for (const [campo, sanea] of Object.entries(listas)) {
    const bruta = Array.isArray(bruto[campo]) ? bruto[campo] : []
    mapa[campo] = bruta.map(sanea).filter(Boolean)
  }

  // Sitios del explosivo, recogibles y rutas no se editan todavía (salen de un
  // barrido medido, no de ponerlos a ojo), así que se conservan tal cual.
  for (const campo of ['objectiveSites', 'pickups', 'routes', 'anchors']) {
    if (Array.isArray(bruto[campo])) mapa[campo] = bruto[campo]
  }

  return { mapa, problemas }
}

/**
 * **El mapa como módulo**, que es como se guarda.
 *
 * Un `.js` con `export default` y no un `.json` por una razón que no es de
 * gusto: el huésped de Node importa `src/config.js` directamente (vuelta 72),
 * así que un mapa lo tienen que poder leer **Vite y Node sin ponerse de
 * acuerdo**, y un módulo con datos dentro lo lee cualquiera de los dos sin
 * atributos de importación ni banderas.
 */
export function mapaComoModulo(mapa) {
  const orden = CAMPOS.filter((campo) => mapa[campo] !== undefined)
  const cuerpo = orden.map((campo) => `  ${campo}: ${valor(mapa[campo], 1)},`).join('\n')
  return `/** Mapa de Vektor. Lo escribe el editor (/editor/); el formato, en src/maps/formato.js. */\nexport default {\n${cuerpo}\n}\n`
}

/**
 * Una caja por línea y lo demás compacto: el fichero se lee en una revisión de
 * código, y veinte piezas en una sola línea no se leen.
 */
function valor(v, nivel) {
  const sangria = '  '.repeat(nivel + 1)
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    return `[\n${v.map((item) => `${sangria}${JSON.stringify(item)},`).join('\n')}\n${'  '.repeat(nivel)}]`
  }
  return JSON.stringify(v)
}
