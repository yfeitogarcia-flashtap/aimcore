/**
 * **El Worker: el portero** (vuelta 47).
 *
 * Dos cosas y ninguna más:
 *
 * 1. `/sala/<código>` con cabecera de WebSocket → el Durable Object de ese
 *    código. `idFromName(código)` es determinista, así que dos personas que
 *    teclean el mismo código llegan al mismo objeto **sin que nadie lleve una
 *    lista de partidas**. No hay base de datos, no hay registro de salas y no
 *    hay nada que limpiar cuando una partida acaba: la sala existe mientras
 *    haya alguien dentro y desaparece sola.
 * 2. Todo lo demás → los ficheros del juego (`dist/`), que Cloudflare sirve
 *    directamente desde el binding de assets.
 *
 * **Un solo origen para el juego y para la partida**, y eso no es comodidad: el
 * cliente saca la dirección del WebSocket de la página en la que está
 * (`wss://<el mismo host>/sala/<código>`), así que no hay una URL de servidor
 * que configurar, ni que recordar, ni que cambiar el día que el despliegue se
 * mueva. La página y el mundo viajan juntos o no viajan.
 */
import { normalizarCodigo } from '../net/codigo.js'

export { Sala } from './sala.js'

export default {
  async fetch(peticion, env) {
    const url = new URL(peticion.url)
    const enSala = url.pathname.match(/^\/sala\/([^/]+)\/?$/)

    if (enSala) {
      const codigo = normalizarCodigo(enSala[1])
      if (!codigo) return new Response('Ese código de partida no existe.', { status: 400 })
      if (peticion.headers.get('Upgrade') !== 'websocket') {
        return new Response('Esto es una sala de Vektor: se entra por WebSocket.', { status: 426 })
      }
      const sala = env.SALAS.get(env.SALAS.idFromName(codigo))
      return sala.fetch(peticion)
    }

    // **El enlace que se le manda a un amigo** (`/duelo/<código>`) es una ruta
    // que no existe como fichero: se sirve la página del duelo y el código lo
    // lee el cliente de la propia dirección. Así el enlace se puede dictar y no
    // lleva ni interrogante ni almohadilla.
    //
    // Se pide **sin `.html`** porque ésa es la dirección canónica del servidor
    // de assets de Cloudflare: pedir `/net/prueba.html` devuelve un 307 a
    // `/net/prueba`, y un redirección aquí dentro se convierte en una página en
    // blanco —un `fetch` interno no sigue el 307, devuelve el 307—.
    if (url.pathname.startsWith('/duelo')) {
      return env.ASSETS.fetch(new URL('/net/prueba', url))
    }

    return env.ASSETS.fetch(peticion)
  },
}
