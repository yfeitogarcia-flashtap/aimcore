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
 * Lo de «en local es distinto» se decide por el protocolo de la página, no por
 * el nombre del host: lo que de verdad cambia es que en `http://` no se puede
 * abrir un `wss://`, y que un despliegue siempre es `https://`. Y así
 * `wrangler dev`, que sirve el Worker de verdad en `http://localhost:8787`,
 * entra por el camino de Cloudflare sin ningún caso especial —hay que hacerlo
 * a mano con `?worker=1`, que es lo que usa el banco—.
 */
import { NET } from '../src/config.js'
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
export function urlDeSala(codigo, ubicacion = window.location, pase = null) {
  // **El pase de reconexión viaja en la dirección** (vuelta 62), no en un
  // mensaje: el servidor tiene que decidir si esto es una butaca nueva o una que
  // ya estaba **antes** de que llegue ningún mensaje, que es cuando reparte
  // ranura y manda la bienvenida.
  const cola = pase ? `?pase=${encodeURIComponent(pase)}` : ''
  const enWorker = ubicacion.protocol === 'https:' || new URLSearchParams(ubicacion.search).has('worker')
  if (enWorker) {
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

/** El enlace que se le manda al otro. Limpio: sólo la sala. */
export function enlaceDeSala(codigo, ubicacion = window.location) {
  if (ubicacion.protocol === 'https:') return `${ubicacion.origin}/duelo/${codigo}`
  return `${ubicacion.origin}${ubicacion.pathname}#${codigo}`
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
