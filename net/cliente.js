/**
 * **El cliente de red: predicción local y reconciliación** (vuelta 45).
 *
 * El bucle es el de siempre —paso fijo de 60 Hz, `docs/decisions.md` §44— y
 * encima lleva tres cosas:
 *
 * 1. **Predicción.** Cada paso se muestrea la entrada, se numera y se aplica
 *    **ya**, sin esperar al servidor. Nada de lo que hace el jugador con su
 *    propio cuerpo espera a un viaje de ida y vuelta.
 * 2. **Reconciliación.** Cuando llega la foto del servidor, se coloca el estado
 *    autoritativo y se **reejecutan** las entradas que el servidor todavía no
 *    había visto, por el mismo `movement.update`. Como es literalmente el mismo
 *    módulo con las mismas entradas, sin pérdida de paquetes el resultado es el
 *    mismo hasta el último bit y la corrección no se ve.
 * 3. **Interpolación del rival.** Al otro se le dibuja **en el pasado**, entre
 *    dos fotos ya recibidas. Extrapolar al futuro es inventarse dónde está.
 *
 * El reloj de la simulación es **el número de paso**, no el de nadie: ver
 * `protocolo.js`.
 */
import { NET, SIM_STEP_MS } from '../src/config.js'
import { MSG, desempaquetarTeclas, empaquetarTeclas, instanteDePaso, instanteDeSalto } from './protocolo.js'

export class ClienteRed {
  /**
   * @param {object} opciones
   * @param {object} opciones.camara la cámara de verdad: es donde el movimiento
   *   guarda la posición, así que predecir es moverla.
   * @param {import('../src/game/movement.js').MovementController} opciones.movimiento
   */
  constructor({ camara, movimiento, url }) {
    this.camara = camara
    this.movimiento = movimiento
    this.url = url

    this.id = null
    this.conectado = false
    /** Paso propio. Va por delante del servidor lo que tarde el viaje. */
    this.paso = 0
    /** Entradas mandadas y todavía sin confirmar, en orden. */
    this.pendientes = []
    /** Teclas de este frame, que las escribe quien lea el teclado. */
    this.teclas = { forward: false, back: false, left: false, right: false, jump: false, crouch: false, walk: false }
    /** Instante real de la última pulsación de saltar sin repartir, o null. */
    this._saltoTs = null

    /** Fotos del rival, para dibujarlo en el pasado. */
    this.rival = { id: null, buffer: [], pose: null }
    /** La última pose autoritativa del jugador local, para el fantasma. */
    this.autoritativo = null

    /** **Red simulada.** Retardo de ida en ms, jitter y pérdida, por pestaña. */
    this.latenciaMs = 0
    this.jitterMs = 0
    this.perdida = 0

    /** Lo que se mide. */
    this.medidas = {
      rtt: 0,
      pendientes: 0,
      errorUltimo: 0,
      errorMax: 0,
      correcciones: 0,
      fotos: 0,
      bytesEntrada: 0,
      bytesSalida: 0,
      /** Totales que nadie reinicia, para medir sobre ventanas largas. */
      totalEntrada: 0,
      totalSalida: 0,
      /** Pasos en los que el servidor se quedó sin entrada tuya. */
      hambre: 0,
      enviados: 0,
      perdidos: 0,
      ack: -1,
      pasoServidor: 0,
    }
    this._historialEnvio = new Map()
  }

  conectar() {
    this.socket = new WebSocket(this.url)
    this.socket.addEventListener('open', () => {
      this.conectado = true
    })
    this.socket.addEventListener('message', (evento) => {
      this.medidas.bytesEntrada += evento.data.length
      this.medidas.totalEntrada += evento.data.length
      // La bajada también se retrasa: si sólo se retrasara la subida, la mitad
      // del viaje sería gratis y el RTT medido no significaría nada.
      this._tras(() => this._recibir(JSON.parse(evento.data)))
    })
    this.socket.addEventListener('close', () => {
      this.conectado = false
    })
  }

  /** Retardo de un sentido, con jitter. */
  _tras(fn) {
    const espera = this.latenciaMs + (this.jitterMs > 0 ? (Math.random() - 0.5) * 2 * this.jitterMs : 0)
    if (espera <= 0) fn()
    else setTimeout(fn, Math.max(0, espera))
  }

  /**
   * **Anota cuándo se ha pulsado saltar**, con el instante real del evento. La
   * fracción de paso se calcula en `dar()`, que es donde se sabe en qué paso
   * cae: aquí todavía no, porque el evento llega entre pasos.
   */
  pulsarSalto(ahoraMs) {
    this._saltoTs = ahoraMs
  }

  /**
   * **Un paso del mundo en el cliente.** Muestrea, predice y manda: en ese
   * orden, y las tres cosas con la misma entrada.
   */
  dar(paso, inicioDePasoMs) {
    this.paso = paso
    // La pulsación viaja con **su fracción de paso** (0..1). Redondearla al paso
    // costaría 16.7 ms de precisión en la ventana de encadenado, que mide 130.
    // Si la pulsación cayó antes de que empezara este paso —el evento llegó
    // mientras corría el anterior— se acota a 0, que es lo más cerca que se
    // puede poner.
    let jt = -1
    if (this._saltoTs !== null) {
      const fraccion = (this._saltoTs - inicioDePasoMs) / SIM_STEP_MS
      jt = Math.min(0.999, Math.max(0, fraccion))
      this._saltoTs = null
    }
    const entrada = {
      t: MSG.ENTRADA,
      n: paso,
      k: empaquetarTeclas(this.teclas),
      yaw: this.camara.rotation.y,
      jt,
    }

    this._aplicar(entrada)

    this.pendientes.push(entrada)
    if (this.pendientes.length > NET.maxPendingInputs) this.pendientes.shift()
    this.medidas.pendientes = this.pendientes.length

    if (!this.conectado) return
    const texto = JSON.stringify(entrada)
    this.medidas.enviados += 1
    // La pérdida se simula **al enviar**: el paquete no llega, el servidor
    // ejecuta el paso siguiente sin él y ahí aparece la corrección de verdad.
    if (this.perdida > 0 && Math.random() < this.perdida) {
      this.medidas.perdidos += 1
      return
    }
    this._historialEnvio.set(paso, performance.now())
    this.medidas.bytesSalida += texto.length
    this.medidas.totalSalida += texto.length
    this._tras(() => {
      if (this.socket.readyState === 1) this.socket.send(texto)
    })
  }

  /** La misma llamada que hace el servidor, con la misma entrada. */
  _aplicar(entrada) {
    const m = this.movimiento
    desempaquetarTeclas(entrada.k, m.keys)
    this.camara.rotation.y = entrada.yaw
    if (entrada.jt >= 0) m.pressJump(instanteDeSalto(entrada.n, entrada.jt))
    m.update(SIM_STEP_MS / 1000, instanteDePaso(entrada.n))
  }

  _recibir(mensaje) {
    if (mensaje.t === MSG.BIENVENIDA) {
      this.id = mensaje.id
      this.paso = mensaje.n + NET.leadTicks
      this.camara.position.x = mensaje.salida.x
      this.camara.position.z = mensaje.salida.z
      this.onBienvenida?.(mensaje)
      return
    }
    if (mensaje.t === MSG.FOTO) this._reconciliar(mensaje)
  }

  _reconciliar(foto) {
    this.medidas.fotos += 1
    this.medidas.pasoServidor = foto.n

    // El rival, a su cola de interpolación.
    for (const id of Object.keys(foto.p)) {
      if (id === this.id) continue
      this.rival.id = id
      this.rival.buffer.push({ n: foto.n, recibidoEn: performance.now(), yaw: foto.p[id].yaw, s: foto.p[id].s })
      while (this.rival.buffer.length > 30) this.rival.buffer.shift()
    }

    const mio = foto.p[this.id]
    if (!mio) return
    this.medidas.ack = mio.ack
    this.medidas.hambre = mio.hambre
    // Dónde dice el servidor que estás **antes** de reejecutar nada: es lo que
    // dibuja el fantasma, y por tanto lo que hace visible la reconciliación.
    this.autoritativo = { x: mio.s.x, z: mio.s.z, feetY: mio.s.feetY, eyeHeight: mio.s.eyeHeight }

    // RTT: el tiempo que ha tardado en volver confirmada la entrada `ack`.
    const salida = this._historialEnvio.get(mio.ack)
    if (salida !== undefined) {
      this.medidas.rtt = performance.now() - salida
      for (const n of this._historialEnvio.keys()) if (n <= mio.ack) this._historialEnvio.delete(n)
    }

    // Dónde creía el cliente que estaba, para poder medir la corrección.
    const predichoX = this.camara.position.x
    const predichoY = this.camara.position.y
    const predichoZ = this.camara.position.z
    const yawActual = this.camara.rotation.y

    this.movimiento.restore(mio.s)
    while (this.pendientes.length > 0 && this.pendientes[0].n <= mio.ack) this.pendientes.shift()
    // Reejecutar lo que el servidor todavía no ha visto. Cada entrada se vuelve
    // a aplicar con **su** yaw y **su** paso, no con los de ahora.
    for (const entrada of this.pendientes) this._aplicar(entrada)
    this.camara.rotation.y = yawActual

    const error = Math.hypot(
      this.camara.position.x - predichoX,
      this.camara.position.y - predichoY,
      this.camara.position.z - predichoZ,
    )
    this.medidas.errorUltimo = error
    if (error > this.medidas.errorMax) this.medidas.errorMax = error
    if (error > NET.visibleCorrection) this.medidas.correcciones += 1
    this.medidas.pendientes = this.pendientes.length
  }

  /**
   * **A qué paso debería ir el cliente.** Por delante del servidor lo que tarde
   * el viaje de ida más el colchón, porque una entrada que llega después de su
   * paso ya no sirve.
   *
   * Hace falta porque el contador del cliente **no puede ir libre**: si el
   * navegador pierde un frame largo, el acumulador acota el delta y ese paso no
   * se recupera nunca. A partir de ahí el jugador manda entradas selladas con un
   * paso cada vez más viejo, que es latencia añadida y gratuita. Devuelve 0
   * mientras no haya llegado ninguna foto.
   */
  pasoObjetivo() {
    if (this.medidas.pasoServidor === 0) return 0
    // **El RTT entero, no la mitad.** Se cuenta dos veces a propósito: la foto
    // que trae `pasoServidor` ya salió hace un viaje de ida, así que el servidor
    // está en realidad medio RTT más allá; y la entrada que se mande ahora
    // tardará otro medio en llegar. Con la mitad —que fue la primera versión— el
    // servidor se quedaba sin entrada en un tercio de los pasos y el retraso
    // efectivo salía en 1.5 veces el RTT inyectado.
    const viaje = Math.ceil(this.medidas.rtt / SIM_STEP_MS)
    return this.medidas.pasoServidor + NET.leadTicks + viaje
  }

  /**
   * **Dónde se dibuja al rival ahora mismo.** En el pasado, entre las dos fotos
   * que rodean el instante objetivo.
   *
   * El objetivo **no** se mide con el paso propio, y ésa fue la primera versión
   * y estaba mal: el cliente corre por delante del servidor lo que tarda el
   * viaje, así que `paso − retraso` caía por delante de la última foto recibida,
   * no había pareja que lo rodease y se acababa dibujando la foto más vieja del
   * buffer — medio segundo de retraso en vez de tres pasos. El reloj del rival
   * es **el de las fotos**: se sitúa `interpDelayTicks` por detrás de la última
   * que llegó y avanza en tiempo real desde que llegó.
   *
   * Devuelve null hasta que hay dos fotos.
   */
  poseDelRival() {
    const buffer = this.rival.buffer
    if (buffer.length < 2) return null
    const ultima = buffer[buffer.length - 1]
    const desde = (performance.now() - ultima.recibidoEn) / SIM_STEP_MS
    // Nunca por delante de lo que se ha recibido: extrapolar es inventar.
    const objetivo = Math.min(ultima.n, ultima.n - NET.interpDelayTicks + desde)

    let a = buffer[0]
    let b = buffer[1]
    for (let i = buffer.length - 2; i >= 0; i--) {
      if (buffer[i].n <= objetivo) {
        a = buffer[i]
        b = buffer[i + 1]
        break
      }
    }
    const tramo = b.n - a.n
    const alfa = tramo > 0 ? Math.min(1, Math.max(0, (objetivo - a.n) / tramo)) : 0
    const mezcla = (u, v) => u + (v - u) * alfa
    return {
      x: mezcla(a.s.x, b.s.x),
      z: mezcla(a.s.z, b.s.z),
      feetY: mezcla(a.s.feetY, b.s.feetY),
      eyeHeight: mezcla(a.s.eyeHeight, b.s.eyeHeight),
      // El rumbo se mezcla por el camino corto, o cruzar ±π daría una vuelta
      // entera de peonza.
      yaw: a.yaw + normalizar(b.yaw - a.yaw) * alfa,
      /** Cuánto pasado se está viendo, contra el paso que el servidor va por. */
      retraso: this.medidas.pasoServidor - objetivo,
    }
  }
}

function normalizar(radianes) {
  let d = radianes
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
