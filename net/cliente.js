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
import { NET, PAUSE, SIM_STEP_MS } from '../src/config.js'
import { resolverDisparo } from './disparo.js'
import { cuerpoDeJugador } from './pose.js'
import { MSG, desempaquetarTeclas, empaquetarTeclas, instanteDePaso, instanteEnPaso } from './protocolo.js'

export class ClienteRed {
  /**
   * @param {object} opciones
   * @param {object} opciones.camara la cámara de verdad: es donde el movimiento
   *   guarda la posición, así que predecir es moverla.
   * @param {import('../src/game/movement.js').MovementController} opciones.movimiento
   */
  constructor({ camara, movimiento, transporte, oclusores = [] }) {
    this.camara = camara
    this.movimiento = movimiento
    /** El cable, detrás de `send` / `onMessage` / `close` y nada más. */
    this.transporte = transporte
    /**
     * La geometría del escenario. El veredicto propio comprueba la cobertura
     * igual que el del servidor: si no, «disparé a través de la Espina» contaría
     * como desacuerdo de la red y sería del banco de pruebas.
     */
    this.oclusores = oclusores

    this.id = null
    this.conectado = false
    /** Cuándo llegó la última foto. Null mientras no haya llegado ninguna. */
    this._ultimaFotoEn = null
    /**
     * **Avisos hacia fuera.** `onBienvenida` cuando el servidor te da sitio y
     * `onVeredicto` cada vez que dice qué pasó con uno de tus disparos. Son
     * pulsaciones, no valores por frame, así que quien las escuche puede pintar
     * sin saltarse la regla de no repintar por frame.
     */
    this.onBienvenida = null
    this.onVeredicto = null
    /**
     * **Y por qué se ha acabado la partida para ti** (vuelta 51). Llega con un
     * motivo legible y con `deFuera` puesto si lo dijo el servidor (`ADIOS`) o
     * quitado si sólo se cortó el cable. Hasta la 51 no existía, y el resultado
     * era que una partida llena o un socket caído se veían **exactamente igual
     * que un juego colgado**: nada en pantalla y nada en la consola.
     */
    this.onDesconectado = null
    /**
     * Cambios en la pausa: `{ pausada, por, mia, pide, pideMia, libres,
     * rivalLibres, denegada }`. **No se avisa de la cuenta atrás**, que cambia
     * sesenta veces por segundo: quien la pinte la lee con `restaPausaMs()` en
     * su bucle, que es lo que ya hace para todo lo demás que va por frame.
     */
    this.onPausa = null
    /** El último motivo, para quien lo quiera pintar sin esperar al aviso. */
    this.desconexion = null
    /** Paso propio. Va por delante del servidor lo que tarde el viaje. */
    this.paso = 0
    /** Entradas mandadas y todavía sin confirmar, en orden. */
    this.pendientes = []
    /** Teclas de este frame, que las escribe quien lea el teclado. */
    this.teclas = { forward: false, back: false, left: false, right: false, jump: false, crouch: false, walk: false }
    /** Instante real de la última pulsación de saltar sin repartir, o null. */
    this._saltoTs = null
    /** El clic de disparo pendiente de repartir: instante real y adónde apuntaba. */
    this._disparo = null
    /** Disparos mandados y todavía sin veredicto del servidor, por número. */
    this.disparosEnVuelo = new Map()
    this._seqDisparo = 0
    /** Vida que dice el servidor. Con cero, abatido. */
    this.vida = 100
    /** El paso de entrada en que se vuelve a estar vivo, o 0. Lo dice el servidor. */
    this.vivoEn = 0
    /** El sitio de salida de tu ranura, para poder predecir la reaparición. */
    this.salida = null
    /**
     * **La pausa, tal como la cuenta el servidor.** Aquí no se decide nada: el
     * cliente pide y obedece. Tener un «estoy en pausa» local que no viniera de
     * la foto sería exactamente el fallo que esta vuelta arregla — un menú
     * abierto con el mundo corriendo por detrás.
     */
    this.pausa = { pausada: false, por: null, mia: false, pide: null, pideMia: false,
                   libres: PAUSE.free, rivalLibres: PAUSE.free,
                   /** `'no'` o `'silencio'` mientras haya una negativa sin leer. */
                   denegada: null }
    /** Negativas ya contadas, para no repetir el aviso en cada foto. */
    this._negadas = null
    /** Instante local en que caducará la pausa, o null. Ver `restaPausaMs`. */
    this._pausaHasta = null

    /** Fotos del rival, para dibujarlo en el pasado. */
    this.rival = { id: null, buffer: [], pose: null }
    /** La última pose autoritativa del jugador local, para el fantasma. */
    this.autoritativo = null

    /** Lo que se mide. */
    this.medidas = {
      rtt: 0,
      /** Veces que se ha re-anclado el reloj por volver de un parón largo. */
      reanclajes: 0,
      /** Cuánto lleva sin llegar una foto. Cero mientras la partida va. */
      sinFotosMs: 0,
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
      /** Disparos, y cuántas veces el servidor vio lo mismo que tú. */
      disparos: 0,
      acuerdos: 0,
      /** Impactos que **tú** viste y el servidor no, y al revés. */
      fantasmas: 0,
      sorpresas: 0,
      /** Y lo mismo resuelto sin rebobinar, que es el control. */
      acuerdosSinRebobinar: 0,
      /** Cuánto se había movido el rival desde el instante rebobinado. */
      retrocesoMax: 0,
      rebobinadoMs: 0,
      /** Daño que el servidor te ha dado por bueno, sumado. */
      danoTotal: 0,
      /**
       * **Un renglón por disparo**, para poder condicionar las medias. El
       * agregado solo engaña: si el blanco está casi parado cuando le disparas,
       * rebobinar o no da igual y el control sale plano sin que eso diga nada.
       * Acotado, que esto vive en el bucle.
       */
      detalle: [],
    }
    this._historialEnvio = new Map()
  }

  conectar() {
    this.transporte.onMessage((datos) => {
      this.medidas.bytesEntrada += datos.length
      this.medidas.totalEntrada += datos.length
      this._recibir(JSON.parse(datos))
    })
    // El cable cortado no manda ningún mensaje: es lo único que hay que
    // escuchar aparte del protocolo (ver `net/transporte.js`).
    this.transporte.onClose?.((motivo) => {
      this._desconectar(motivo || 'se ha cortado la conexión con el servidor', false)
    })
  }

  /**
   * **Se acabó, y se dice por qué.** Un solo camino para las dos formas de
   * quedarse fuera —el servidor te echa, o el cable se corta—, porque para el
   * jugador son la misma cosa: la partida ya no está ahí.
   */
  _desconectar(motivo, deFuera) {
    if (this.desconexion) return
    this.conectado = false
    this.desconexion = { motivo, deFuera }
    this.onDesconectado?.(this.desconexion)
  }

  /**
   * **¿Hace cuánto que no llega una foto?** El servidor manda una por paso, así
   * que en una partida sana esto no pasa de unos milisegundos. Es lo único que
   * distingue «no me llega nada» de «estoy colgado», y hasta la vuelta 51 no
   * había forma de saberlo ni desde dentro ni desde fuera.
   */
  silencioMs(ahora = performance.now()) {
    if (this._ultimaFotoEn === null) return 0
    return ahora - this._ultimaFotoEn
  }

  /** ¿Se puede uno fiar del reloj del servidor ahora mismo? */
  relojFresco(ahora = performance.now()) {
    return this._ultimaFotoEn !== null && ahora - this._ultimaFotoEn <= NET.clockStaleMs
  }

  /**
   * **Pedir pausa, levantarla o contestar al rival.** Tres verbos y ninguna
   * decisión: quién puede hacer qué lo dice el servidor, que es el único que
   * puede parar el mundo de los dos.
   */
  pedirPausa() { this._decir('pedir') }
  reanudar() { this._decir('reanudar') }
  responder(acepta) { this._decir(acepta ? 'si' : 'no') }

  /**
   * **Lo que le queda a la pausa**, en milisegundos, o null si no hay ninguna.
   *
   * El número lo manda el servidor en cada foto y aquí se **ancla al reloj
   * local**: entre foto y foto la cuenta sigue bajando sola, así que un cartel
   * que se lea por frame no da saltos ni depende de cada cuántos pasos llega la
   * siguiente. Los dos relojes no tienen por qué coincidir —nunca lo hacen— y
   * por eso lo que viaja es cuánto queda y no hasta cuándo.
   */
  restaPausaMs(ahora = performance.now()) {
    if (this._pausaHasta === null) return null
    return Math.max(0, this._pausaHasta - ahora)
  }

  /** El aviso de negativa ya se ha visto: se apaga. */
  olvidarDenegada() {
    if (this.pausa.denegada === null) return
    this.pausa.denegada = null
    this.onPausa?.(this.pausa)
  }

  _decir(q) {
    if (!this.conectado) return
    this.transporte.send(JSON.stringify({ t: MSG.PAUSA, q }))
  }

  cerrar() {
    this.transporte.close()
    this.conectado = false
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
    // puede poner. Lo mismo vale para el clic de disparo, justo debajo.
    const fraccion = (ts) => Math.min(0.999, Math.max(0, (ts - inicioDePasoMs) / SIM_STEP_MS))

    let jt = -1
    if (this._saltoTs !== null) {
      jt = fraccion(this._saltoTs)
      this._saltoTs = null
    }

    let d = null
    if (this._disparo !== null) {
      d = {
        f: fraccion(this._disparo.ts),
        yaw: this._disparo.yaw,
        pitch: this._disparo.pitch,
        seq: ++this._seqDisparo,
      }
      this._disparo = null
    }

    const entrada = {
      t: MSG.ENTRADA,
      n: paso,
      k: empaquetarTeclas(this.teclas),
      yaw: this.camara.rotation.y,
      jt,
    }
    if (d) entrada.d = d

    this._aplicar(entrada)

    // **El veredicto propio**, contra el rival tal como lo estabas viendo. Es la
    // mitad que hace medible la compensación: sin él sólo se sabría lo que
    // decidió el servidor, no si coincide con lo que viste.
    //
    // Va **después** de aplicar la entrada, que es donde lo hace el servidor
    // (`ejecutar` mueve y luego resuelve). Sacarlo antes dejaba al tirador un
    // paso por detrás de donde el servidor lo pone —16.7 ms, hasta 0.11 u— y
    // eso son desacuerdos que no serían de la red sino de resolver en sitios
    // distintos del paso.
    if (d) {
      const local = this._resolverLocal(d)
      // **El instante que estabas viendo, en pasos del servidor.** Viaja con el
      // disparo, así que el servidor rebobina **al sitio exacto** en vez de
      // estimarlo desde el ping. Es el mismo número con el que se ha resuelto
      // el veredicto de aquí, así que los dos extremos miran al mismo sitio.
      d.tv = local.enPaso
      this.disparosEnVuelo.set(d.seq, { mio: local.veredicto, en: performance.now() })
      // Un disparo cuyo veredicto no llegó nunca —se perdieron las ocho fotos
      // que lo repetían— se suelta en vez de quedarse ocupando sitio.
      if (this.disparosEnVuelo.size > 32) {
        const viejo = performance.now() - 3000
        for (const [seq, v] of this.disparosEnVuelo) if (v.en < viejo) this.disparosEnVuelo.delete(seq)
      }
    }

    this.pendientes.push(entrada)
    if (this.pendientes.length > NET.maxPendingInputs) this.pendientes.shift()
    this.medidas.pendientes = this.pendientes.length

    if (!this.conectado) return
    const texto = JSON.stringify(entrada)
    this.medidas.enviados += 1
    this._historialEnvio.set(paso, performance.now())
    this.medidas.bytesSalida += texto.length
    this.medidas.totalSalida += texto.length
    // La pérdida y el retardo son del enlace, no de aquí: los pone el
    // transporte (`conRedSimulada`). Este método no sabe que existen.
    this.transporte.send(texto)
  }

  /**
   * **Anota un disparo**, con el instante real del clic y adónde apuntaba la
   * mira en ese instante. El rumbo va aparte del de la entrada a propósito: el
   * de la entrada se muestrea al empezar el paso y el ratón se mueve entre
   * medias.
   */
  disparar(ahoraMs, yaw, pitch) {
    // **En pausa no se anota nada.** Como el disparo se consume en el paso
    // siguiente y en pausa no hay pasos, uno anotado ahora saldría al reanudar:
    // una bala guardada durante la pausa, apuntada a donde el rival estaba
    // parado. Es justo lo que la pausa no puede permitir.
    if (this.pausa.pausada) return
    this._disparo = { ts: ahoraMs, yaw, pitch }
  }

  /**
   * **Lo que el tirador veía.** Resuelve el disparo contra la pose con la que
   * el rival está dibujado ahora mismo —en el pasado, interpolado—, que es
   * literalmente lo que hay en pantalla. El servidor hará lo mismo rebobinando;
   * comparar los dos veredictos es la medida de si la compensación funciona.
   */
  _resolverLocal(d) {
    const pose = this.poseDelRival()
    if (!pose) return { veredicto: { impacto: false, zona: null, distancia: 0, dano: 0, tapado: false }, enPaso: null }
    const cuerpo = cuerpoDeJugador(pose.x, pose.z, pose.feetY, pose.eyeHeight)
    return {
      veredicto: resolverDisparo(this.camara.position, d.yaw, d.pitch, cuerpo, this.oclusores),
      enPaso: pose.enPaso,
    }
  }

  /** Apunta el veredicto del servidor contra el que se había sacado aquí. */
  _compararDisparo(resultado) {
    const mio = this.disparosEnVuelo.get(resultado.seq)
    if (!mio) return
    this.disparosEnVuelo.delete(resultado.seq)
    const m = this.medidas
    m.disparos += 1
    if (mio.mio.impacto === resultado.impacto) m.acuerdos += 1
    // **Fantasma**: viste el impacto y el servidor no. **Sorpresa**: al revés.
    else if (mio.mio.impacto) m.fantasmas += 1
    else m.sorpresas += 1
    if (mio.mio.impacto === resultado.sinRebobinar) m.acuerdosSinRebobinar += 1
    m.danoTotal += resultado.dano
    if (resultado.retroceso > m.retrocesoMax) m.retrocesoMax = resultado.retroceso
    m.rebobinadoMs = resultado.rebobinadoMs
    m.detalle.push({
      yo: mio.mio.impacto,
      con: resultado.impacto,
      sin: resultado.sinRebobinar,
      retroceso: resultado.retroceso,
      lateral: resultado.lateral ?? 0,
      dano: resultado.dano,
      pedidoMs: resultado.pedidoMs ?? 0,
      topado: !!resultado.topado,
      rebobinadoMs: resultado.rebobinadoMs,
    })
    if (m.detalle.length > 400) m.detalle.shift()
    m.ultimoDisparo = {
      yo: mio.mio.impacto ? mio.mio.zona : (mio.mio.tapado ? 'tapado' : 'fallo'),
      servidor: resultado.impacto ? resultado.zona : (resultado.tapado ? 'tapado' : 'fallo'),
      dano: resultado.dano,
    }
    // El veredicto que se avisa es **el del servidor**, no el tuyo: la marca de
    // impacto tiene que decir que le has dado de verdad, no que a ti te lo
    // pareció. Es la misma razón por la que se miden los dos por separado.
    this.onVeredicto?.(resultado)
  }

  /**
   * La misma llamada que hace el servidor, con la misma entrada — y desde la
   * vuelta 52, **con la misma regla de abatido**.
   *
   * `vivoEn` viene del servidor y va en el reloj de las entradas, así que aquí
   * se puede aplicar palabra por palabra lo que allí se aplica: por debajo de
   * ese número no se mueve nada, y la primera entrada que lo alcanza reaparece.
   * Ésa es toda la razón de que la muerte viaje en ese reloj y no en el del
   * servidor: si no, «estoy muerto» daría distinto a cada lado y cada foto
   * traería una corrección.
   */
  _aplicar(entrada) {
    const m = this.movimiento
    if (this.vivoEn > 0) {
      if (entrada.n < this.vivoEn) return
      this._reaparecerAqui()
    }
    desempaquetarTeclas(entrada.k, m.keys)
    this.camara.rotation.y = entrada.yaw
    if (entrada.jt >= 0) m.pressJump(instanteEnPaso(entrada.n, entrada.jt))
    m.update(SIM_STEP_MS / 1000, instanteDePaso(entrada.n))
  }

  /**
   * **La reaparición, predicha.** Es exactamente lo que hace el servidor: volver
   * al sitio de salida que se dio en la bienvenida —el de la ranura, que no
   * cambia— y marcar el teletransporte. Se puede predecir porque no tiene nada
   * de aleatorio, y predecirla evita una corrección del tamaño del mapa en cada
   * muerte.
   */
  _reaparecerAqui() {
    this.vivoEn = 0
    this.movimiento.reset()
    if (this.salida) {
      this.camara.position.x = this.salida.x
      this.camara.position.z = this.salida.z
    }
  }

  _recibir(mensaje) {
    if (mensaje.t === MSG.ADIOS) {
      this._desconectar(mensaje.razon || 'el servidor ha cerrado la partida', true)
      return
    }
    if (mensaje.t === MSG.BIENVENIDA) {
      this.conectado = true
      this.id = mensaje.id
      this.paso = mensaje.n + NET.leadTicks
      // El sitio de salida de su ranura. Se guarda porque la reaparición vuelve
      // aquí, y predecirla necesita saberlo.
      this.salida = { x: mensaje.salida.x, z: mensaje.salida.z }
      this.camara.position.x = mensaje.salida.x
      this.camara.position.z = mensaje.salida.z
      this.onBienvenida?.(mensaje)
      return
    }
    if (mensaje.t === MSG.FOTO) this._reconciliar(mensaje)
  }

  /**
   * El estado de la pausa sale **entero** de la foto, y se avisa sólo cuando
   * cambia algo: quien lo pinta no tiene por qué comparar sesenta veces por
   * segundo. Aquí no se decide nada — el cliente pide y obedece.
   */
  _leerPausa(foto) {
    const p = this.pausa
    const antes = `${p.pausada}${p.por}${p.pide}${p.libres}${p.rivalLibres}${p.denegada}`
    const estaba = p.pausada
    p.pausada = !!foto.pa
    p.por = foto.pa?.por ?? null
    p.mia = p.por !== null && p.por === this.id
    /**
     * **Una votación pendiente es una pausa a la que le falta el permiso**
     * (vuelta 54), así que llega dentro de `pa` y no en un campo aparte: el
     * mundo ya está parado mientras se contesta. `pide` se conserva porque es lo
     * que mira quien pinta el cartel de «¿aceptas?».
     */
    p.pide = foto.pa?.pend ? p.por : null
    p.pideMia = p.pide !== null && p.pide === this.id
    this._pausaHasta = foto.pa ? performance.now() + foto.pa.resta : null
    for (const id of Object.keys(foto.p)) {
      const mio = foto.p[id]
      if (mio.libres !== undefined) {
        if (id === this.id) p.libres = mio.libres
        else p.rivalLibres = mio.libres
      }
      if (id !== this.id) continue
      /**
       * **Y si tu votación se quedó en nada, enterarte.** Viaja como contador y
       * no como aviso de una foto porque un aviso se pierde con su foto; aquí
       * basta con haber visto **alguna** posterior. La primera lectura sólo
       * toma nota: un cliente que entra a media partida no tiene una negativa
       * que enseñar, tiene un marcador con el que comparar.
       */
      const negadas = mio.neg ?? 0
      if (this._negadas !== null && negadas > this._negadas) p.denegada = mio.negm ?? 'no'
      this._negadas = negadas
    }
    if (p.pausada && !estaba) {
      // Una pausa nueva borra el aviso de la anterior: lo que enseña el cartel
      // es lo que está pasando ahora, no lo que pasó la vez pasada.
      p.denegada = null
      /**
       * **Al entrar en pausa se olvida qué se mandó y cuándo.** El RTT sale de
       * restar, al llegar la confirmación de una entrada, el instante en que se
       * mandó; y una entrada mandada antes de la pausa se confirma después, así
       * que el viaje mediría **la pausa entera**. Medido: tras una pausa de
       * segundo y medio, el RTT saltaba de 29 ms a 1.500, `pasoObjetivo` se iba
       * noventa pasos por delante y el cliente se pasaba el resto de la partida
       * recuperando a un tercio de velocidad. Sin historial no hay resta que
       * hacer: el RTT se queda con el último bueno hasta que haya un viaje de
       * verdad que medir.
       */
      this._historialEnvio.clear()
    }
    if (`${p.pausada}${p.por}${p.pide}${p.libres}${p.rivalLibres}${p.denegada}` !== antes) this.onPausa?.(p)
  }

  _reconciliar(foto) {
    this.medidas.fotos += 1
    this._ultimaFotoEn = performance.now()
    this.medidas.sinFotosMs = 0
    this.medidas.pasoServidor = foto.n
    this._leerPausa(foto)

    // El rival, a su cola de interpolación.
    for (const id of Object.keys(foto.p)) {
      if (id === this.id) continue
      this.rival.id = id
      // `vivo` viaja con la foto porque **un cadáver no se dibuja**: hasta la
      // vuelta 52 el cuerpo del rival se quedaba en pie donde cayó.
      this.rival.buffer.push({
        n: foto.n, recibidoEn: performance.now(),
        yaw: foto.p[id].yaw, s: foto.p[id].s, vivo: foto.p[id].vida > 0,
      })
      while (this.rival.buffer.length > 30) this.rival.buffer.shift()
    }

    const mio = foto.p[this.id]
    if (!mio) return
    this.medidas.ack = mio.ack
    this.vida = mio.vida
    this.vivoEn = mio.vivoEn ?? 0
    this.bajas = mio.bajas
    this.muertes = mio.muertes
    // Los veredictos de los disparos que estaban en vuelo.
    if (mio.disparos) for (const resultado of mio.disparos) this._compararDisparo(resultado)
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
  /**
   * **Volver de un parón sin recuperar el tiempo perdido** (vuelta 49).
   *
   * Cuando el navegador para el `requestAnimationFrame` —una pestaña en segundo
   * plano, la máquina dormida— el contador de pasos se queda donde estaba y el
   * enganche al reloj del servidor intenta recuperarlo corriendo, a
   * `maxCatchUpTicks` pasos de más por frame. Medido con la pestaña parada de
   * verdad: 320-360 pasos/s, cinco o seis veces el tiempo real, y el rival
   * viéndole desplazarse a 25 u/s contra los 6.5 de carrera.
   *
   * Recuperar no tiene sentido, y no es una concesión: **no hay nada que
   * recuperar.** Sin bucle no se produjo ni una entrada, y el servidor, que no
   * adivina, dejó a ese jugador parado donde estaba. Correr ahora sería ejecutar
   * de golpe unas entradas que nadie dio, con las teclas de **ahora**.
   *
   * Así que el reloj se re-ancla al del servidor y ya está. Es lo mismo que hace
   * el motor cuando un frame se pasa de `SIM.maxFrameDeltaMs` y lo que hace el
   * Durable Object al volver de un parón: el cliente era el único de los tres
   * relojes que no lo tenía.
   *
   * Las entradas sin confirmar se tiran **porque ya no son reejecutables**: van
   * selladas con pasos que quedaron atrás y el servidor nunca las va a ejecutar
   * con esos números. Guardarlas sólo serviría para reconciliar contra un pasado
   * que no ocurrió.
   */
  reanclar(paso) {
    this.paso = paso
    this.pendientes.length = 0
    this.medidas.pendientes = 0
    this.medidas.reanclajes += 1
  }

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
    /**
     * **Entre dos estados con épocas distintas no se interpola** (vuelta 50).
     * `poseEpoch` sube en cada `reset()` del movimiento, que es el único sitio
     * donde la posición salta sin recorrer el camino — hoy, la reaparición.
     * Mezclar por encima de un salto dibuja al rival **pasando por sitios en los
     * que nunca estuvo**: medido, el cuerpo recorría los 14.4 u que hay del
     * punto de muerte al spawn en dos frames, a 400 u/s, contra los 6.5 de
     * carrera.
     *
     * Se queda en `a` —el lado viejo— en vez de saltar ya a `b`, y eso es lo que
     * pone el teletransporte **en su instante exacto**: el cuerpo se queda donde
     * murió hasta que el reloj de las fotos cruza a `b.n`, y ahí la pareja pasa a
     * ser la siguiente y aparece en el spawn. Un frame, ni antes ni después.
     *
     * La marca viaja en la foto porque **el que dibuja no puede deducirla**: una
     * comprobación de distancia aquí confundiría un teletransporte con un
     * jugador rápido, y es la misma razón por la que `poseEpoch` existe en vez de
     * mirar cuánto se ha movido la cámara (ver `docs/decisions.md` §44 y §50).
     */
    const teletransporte = a.s.poseEpoch !== b.s.poseEpoch
    const alfa = teletransporte || tramo <= 0
      ? 0
      : Math.min(1, Math.max(0, (objetivo - a.n) / tramo))
    const mezcla = (u, v) => u + (v - u) * alfa
    return {
      x: mezcla(a.s.x, b.s.x),
      z: mezcla(a.s.z, b.s.z),
      feetY: mezcla(a.s.feetY, b.s.feetY),
      eyeHeight: mezcla(a.s.eyeHeight, b.s.eyeHeight),
      // El rumbo se mezcla por el camino corto, o cruzar ±π daría una vuelta
      // entera de peonza.
      yaw: a.yaw + normalizar(b.yaw - a.yaw) * alfa,
      /** ¿Está vivo? Del lado viejo, como todo lo demás cuando hay salto. */
      vivo: a.vivo !== false,
      /** Cuánto pasado se está viendo, contra el paso que el servidor va por. */
      retraso: this.medidas.pasoServidor - objetivo,
      /**
       * **En qué paso del servidor está dibujado.** Es fraccionario y es el
       * dato que viaja con un disparo: le ahorra al servidor tener que
       * estimar el rebobinado a partir del ping, que es donde se colaba el
       * doble conteo (ver `docs/decisions.md` §46).
       */
      enPaso: objetivo,
    }
  }
}

function normalizar(radianes) {
  let d = radianes
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
