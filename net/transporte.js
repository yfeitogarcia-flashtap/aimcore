/**
 * **El transporte, detrás de tres funciones** (vuelta 46).
 *
 * `send`, `onMessage`, `close`. Nada más. El netcode —predicción,
 * reconciliación, compensación de retraso— no sabe si debajo hay un WebSocket,
 * un canal de datos de WebRTC o un Durable Object: sólo que puede mandar una
 * cadena, enterarse de las que llegan y colgar.
 *
 * Se aísla **ahora** y no cuando haga falta porque el día que haga falta será
 * el día del cambio de transporte, y entonces ya no se sabe qué parte del
 * netcode se apoyaba en un detalle del socket. Hoy el cambio es de un fichero;
 * dentro de tres vueltas habría sido de cinco.
 *
 * Y el aislamiento se paga solo: **la red simulada vive aquí**, envolviendo un
 * transporte con otro. Latencia, jitter y pérdida son propiedades del enlace,
 * no del juego, y hasta la vuelta 45 estaban metidas en el cliente a base de
 * `setTimeout`. Ahora el cliente no sabe que existen.
 */

/**
 * WebSocket del navegador.
 *
 * No expone si está abierto a propósito: son **tres** funciones. Lo que se
 * manda antes de la apertura se tira, y no pasa nada — el cliente manda una
 * entrada por paso, así que la siguiente llega 16 ms después. Quien necesite
 * saber que hay partida lo sabe por el primer mensaje que llega, que es la
 * bienvenida, y eso es información del protocolo y no del cable.
 */
export function transporteWebSocket(url) {
  const socket = new WebSocket(url)
  let escucha = null
  socket.addEventListener('message', (evento) => escucha?.(evento.data))
  return {
    send(texto) {
      if (socket.readyState === 1) socket.send(texto)
    },
    onMessage(fn) {
      escucha = fn
    },
    close() {
      escucha = null
      socket.close()
    },
  }
}

/**
 * **Un enlace malo, a mano.** Envuelve otro transporte y le añade retardo,
 * jitter y pérdida **en los dos sentidos**: si sólo se retrasara la subida, la
 * mitad del viaje sería gratis y el RTT medido no significaría nada.
 *
 * La pérdida también va en los dos sentidos, que es lo que hace un enlace de
 * verdad. Tirar una entrada deja al servidor sin ese paso —ahí es donde aparece
 * la corrección—; tirar una foto sólo retrasa la corrección siguiente, porque
 * una foto es estado absoluto y no un incremento.
 *
 * @param {object} base el transporte de verdad
 * @param {{latenciaMs:number, jitterMs:number, perdida:number}} enlace mutable:
 *   quien mueva el mando escribe aquí y el cambio entra en el paquete siguiente
 */
export function conRedSimulada(base, enlace) {
  const tras = (fn) => {
    const espera = enlace.latenciaMs + (enlace.jitterMs > 0 ? (Math.random() - 0.5) * 2 * enlace.jitterMs : 0)
    if (espera <= 0) fn()
    else setTimeout(fn, Math.max(0, espera))
  }
  const seCae = () => enlace.perdida > 0 && Math.random() < enlace.perdida

  return {
    send(texto) {
      if (seCae()) {
        enlace.tirados = (enlace.tirados ?? 0) + 1
        return
      }
      tras(() => base.send(texto))
    },
    onMessage(fn) {
      base.onMessage((datos) => {
        if (seCae()) {
          enlace.tiradosEntrada = (enlace.tiradosEntrada ?? 0) + 1
          return
        }
        tras(() => fn(datos))
      })
    },
    close() {
      base.close()
    },
  }
}
