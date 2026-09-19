/**
 * **De dónde sale la partida en la que entras** (vuelta 47).
 *
 * Tres preguntas, y ninguna la tiene que responder el jugador escribiendo una
 * dirección:
 *
 * 1. **Qué código.** El de la dirección si lo trae (`/duelo/ABC123`, o
 *    `#ABC123` de una dirección pegada a mano); si no, uno nuevo. Quien abre la
 *    página sin código **crea** la partida sin darse cuenta de que la ha creado,
 *    que es como tiene que ser: el paso «crear partida» no añade nada, sólo un
 *    botón más entre el jugador y jugar.
 * 2. **Qué servidor.** El de la propia página. En el despliegue —Fly desde la
 *    vuelta 58, Cloudflare antes— el juego y las salas los sirve el mismo
 *    huésped, así que `wss://<este host>/sala/<código>` y no hay nada que
 *    configurar. En local, con `vite` sirviendo la página, el huésped es un
 *    proceso aparte en `NET.port` y a ése se va por `ws://`.
 * 3. **Qué enlace se manda.** El de esta misma página con el código puesto,
 *    tal cual, para copiar y pegar.
 *
 * **Y lo de «en local es distinto» se decide por quién sirve la página, no por
 * su protocolo** (vuelta 66). Hasta aquí la pregunta era «¿es `https:`?», y eso
 * es cierto del despliegue y falso de la misma aplicación servida por el huésped
 * de Node en `http://` — que es exactamente lo que hace `npm run host`, y lo que
 * pasa cuando alguien abre el juego desde otro PC de su casa por la IP de red.
 * Ahí la página se iba a buscar el socket al 5199, donde no hay nadie, y se
 * quedaba conectando para siempre sin un solo error.
 *
 * La pregunta buena la contesta el propio empaquetado: `import.meta.env.DEV` es
 * cierto **sólo mientras sirve Vite**, y Vite es el único caso en que la página
 * y las salas viven en procesos distintos. Se resuelve al construir, así que no
 * hay nada que adivinar en tiempo de ejecución. `?worker=1` se queda como
 * palanca manual para hablar con el huésped desde la página de desarrollo, que
 * es lo que usan los bancos.
 */
import { NET, escenarioDeDuelo } from '../src/config.js'
import { generarCodigo, normalizarCodigo, rutaDeSala } from './codigo.js'

/** El código que pide la dirección, o uno nuevo. */
export function codigoDeLaDireccion(ubicacion = window.location) {
  const deRuta = ubicacion.pathname.match(/\/duelo\/([^/]+)/)
  const candidatos = [deRuta?.[1], ubicacion.hash.slice(1), new URLSearchParams(ubicacion.search).get('sala')]
  for (const bruto of candidatos) {
    const codigo = normalizarCodigo(bruto ?? '')
    if (codigo) return codigo
  }
  return generarCodigo()
}

/**
 * La dirección del WebSocket de esa sala.
 *
 * @param {string} codigo
 * @param {Location} [ubicacion]
 */
export function urlDeSala(codigo, ubicacion = window.location, pase = null, compra = null, mapa = null) {
  // **El pase de reconexión viaja en la dirección** (vuelta 62), no en un
  // mensaje: el servidor tiene que decidir si esto es una butaca nueva o una que
  // ya estaba **antes** de que llegue ningún mensaje, que es cuando reparte
  // ranura y manda la bienvenida.
  /**
   * Y con él, **cuánto dura la fase de compra** (vuelta 64), por el mismo
   * motivo y por el mismo camino: la sala se configura al crearse, antes de que
   * llegue ningún mensaje, y sólo cuenta lo que diga quien la crea.
   */
  const partes = []
  if (pase) partes.push(`pase=${encodeURIComponent(pase)}`)
  if (compra !== null && Number.isFinite(compra)) partes.push(`compra=${compra}`)
  /**
   * **Y en qué mapa se juega** (vuelta 72), por el mismo camino y por el mismo
   * motivo: desde que hay dos mapas de duelo, cuál es se decide **al crear la
   * sala** —antes de que llegue ningún mensaje— y sólo cuenta lo que diga quien
   * la creó.
   */
  if (mapa) partes.push(`mapa=${encodeURIComponent(mapa)}`)
  const cola = partes.length ? `?${partes.join('&')}` : ''
  if (sirveElHuesped(ubicacion)) {
    const esquema = ubicacion.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${esquema}//${ubicacion.host}${rutaDeSala(codigo)}${cola}`
  }
  // **Ojo desde la vuelta 58: el huésped de Node ya encamina por código**, igual
  // que el Durable Object. Hasta la 57 era una sola partida y el código se
  // ignoraba, así que dos pestañas abiertas sin código en la dirección —cada una
  // con el suyo, recién generado— acababan juntas de todos modos. Ahora no: cada
  // una entra en su sala y no se ven. Si abres dos a mano, pásales el código
  // (`...#MQXTUV`) o entra por `/duelo/<código>`.
  return `ws://${ubicacion.hostname}:${NET.port}${rutaDeSala(codigo)}${cola}`
}

/**
 * **¿La página la sirve el huésped —y por tanto las salas están en su mismo
 * origen— o la sirve Vite?** Es la única pregunta que separa los dos montajes,
 * y la contesta el empaquetado: `import.meta.env.DEV` sólo es cierto con Vite
 * delante. Se lee con cuidado porque este módulo también se importa desde Node
 * en algún banco, donde `import.meta.env` no existe.
 */
export function sirveElHuesped(ubicacion = window.location) {
  const enVite = Boolean(import.meta.env && import.meta.env.DEV)
  return !enVite || new URLSearchParams(ubicacion.search).has('worker')
}

/**
 * El enlace que se le manda al otro. Limpio: sólo la sala.
 *
 * Con el huésped delante existe `/duelo/<código>`, que es el que se puede
 * dictar; con Vite esa ruta la inventa su servidor de desarrollo pero el enlace
 * sigue saliendo con almohadilla, que es lo que valía hasta ahora.
 */
export function enlaceDeSala(codigo, ubicacion = window.location, mapa = null) {
  /**
   * **Y el mapa va en el enlace** (vuelta 72). Podría no ir —el servidor dice
   * en la bienvenida en qué mapa se juega de verdad, y la página se corrige—,
   * pero corregirse es **recargar**: quien abre el enlace de una partida en Los
   * Pilares vería El Espejo un instante y luego un recargado. Con el mapa
   * puesto, monta el bueno a la primera. Sigue siendo el servidor quien manda:
   * esto sólo ahorra el rebote.
   */
  const cola = mapa ? `?mapa=${encodeURIComponent(mapa)}` : ''
  if (sirveElHuesped(ubicacion)) return `${ubicacion.origin}/duelo/${codigo}${cola}`
  return `${ubicacion.origin}${ubicacion.pathname}${cola}#${codigo}`
}

/** El mapa que pide la dirección, saneado contra el catálogo de duelo. */
export function mapaDeLaDireccion(ubicacion = window.location) {
  return escenarioDeDuelo(new URLSearchParams(ubicacion.search).get('mapa') ?? '')
}

/**
 * **La dirección que se deja en la barra no es el enlace que se manda**, y
 * confundirlas costó un rato: la barra se reescribe con `replaceState` para que
 * copiarla valga, y escribir ahí el enlace limpio **se lleva por delante lo que
 * la página traía en la consulta**. En el banco eso era `?worker=1`, o sea la
 * diferencia entre hablar con el Worker y hablar con el servidor de sobremesa —y
 * como los dos existen y los dos contestan, la página se conectaba a la partida
 * equivocada **sin un solo error**: dos pestañas con el mismo código, cada una
 * en un servidor distinto, y ninguna veía a la otra.
 *
 * Lo cazó `sala47.mjs` por el número de jugador: uno entraba como `p3` y el otro
 * como `p6`, que es un contador que en esa sala no podía ir por ahí.
 */
export function direccionDeLaBarra(codigo, ubicacion = window.location) {
  const enlace = new URL(enlaceDeSala(codigo, ubicacion))
  enlace.search = ubicacion.search
  return enlace.toString()
}
