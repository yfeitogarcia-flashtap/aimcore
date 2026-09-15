/**
 * **El transporte, detrás de cuatro funciones** (vuelta 46; la cuarta, en la 51).
 *
 * `send`, `onMessage`, `close`, `onClose`. El netcode —predicción,
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
 * **Por qué hay una cuarta y no sigue habiendo tres** (vuelta 51). La regla de
 * la 46 sigue en pie en lo que decía: **no se expone si está abierto**. Eso es
 * preguntar por un estado, y quien necesite saber que hay partida lo sabe por el
 * primer mensaje que llega, que es la bienvenida — información del protocolo, no
 * del cable.
 *
 * Colgarse es otra cosa. **Un cable que se corta no manda ningún mensaje**, así
 * que no hay forma de enterarse por el protocolo: el `ADIOS` cubre «el servidor
 * me ha echado», pero una conexión que se cae no dice nada de nada. Hasta la 51
 * el cliente no escuchaba `close` ni `error`, y el resultado era que cualquier
 * caída se veía como el juego quedándose quieto sin explicación. `onClose` es un
 * **aviso**, no un estado, y es lo único que el cable sabe y el protocolo no.
 *
 * La alternativa era inventarse un mensaje dentro de `onMessage` para fingir que
 * el corte venía por el protocolo. Eso es peor: pone al transporte a redactar
 * mensajes de un protocolo que no es suyo.
 */

/**
 * WebSocket del navegador.
 *
 * Lo que se manda antes de la apertura se tira, y no pasa nada — el cliente
 * manda una entrada por paso, así que la siguiente llega 16 ms después.
 */
export function transporteWebSocket(url) {
  const socket = new WebSocket(url)
  let escucha = null
  let adios = null
  let avisado = false
  // `close` y `error` pueden llegar los dos por la misma caída; el aviso se da
  // una sola vez. `error` no dice qué ha pasado —el navegador no lo cuenta, por
  // seguridad— así que lo único honrado es decir que se ha cortado.
  const caida = (motivo) => {
    if (avisado) return
    avisado = true
    adios?.(motivo)
  }
  socket.addEventListener('message', (evento) => escucha?.(evento.data))
  socket.addEventListener('close', (evento) => caida(evento.reason || null))
  socket.addEventListener('error', () => caida(null))
  return {
    send(texto) {
      if (socket.readyState === 1) socket.send(texto)
    },
    onMessage(fn) {
      escucha = fn
    },
    onClose(fn) {
      adios = fn
    },
    close() {
      escucha = null
      // Cerrar a propósito no es caerse: se calla el aviso antes de cerrar.
      avisado = true
      adios = null
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
    /**
     * El aviso de caída **no se retrasa ni se pierde** con la red simulada:
     * retrasar la noticia de que el cable está cortado es justo lo contrario de
     * lo que se quiere probar, y tirarla dejaría el banco sin la señal.
     */
    onClose(fn) {
      base.onClose(fn)
    },
    close() {
      base.close()
    },
  }
}
