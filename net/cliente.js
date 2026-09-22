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
import { NET, PAUSE, ROUNDS, SIM_STEP_MS, WEAPONS, WEAPON_ORDER } from '../src/config.js'
import { resolverCuchillada, resolverDisparo, resolverEscopeta } from './disparo.js'
import { cuerpoDeJugador } from './pose.js'
import { MSG, desempaquetarTeclas, empaquetarTeclas, instanteDePaso, instanteEnPaso } from './protocolo.js'

export class ClienteRed {
  /**
   * @param {object} opciones
   * @param {object} opciones.camara la cámara de verdad: es donde el movimiento
   *   guarda la posición, así que predecir es moverla.
   * @param {import('../src/game/movement.js').MovementController} opciones.movimiento
   */
  constructor({ camara, movimiento, transporte, oclusores = [], controles = null }) {
    this.camara = camara
    this.movimiento = movimiento
    /**
     * **Quien manda sobre el rumbo de la cámara** (vuelta 66). Se recibe como se
     * recibe la cámara —la página lo ensambla con las piezas del motor— porque
     * aparecer mirando a un sitio concreto es escribir el rumbo, y el rumbo
     * tiene dueño: escribir `camara.rotation.y` a mano se lo lleva por delante
     * el siguiente movimiento de ratón.
     */
    this.controles = controles
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
    /** Tu ranura (0 o 1). La da la bienvenida. */
    this.equipo = 0
    /** ¿Creaste tú esta partida? Lo dice la bienvenida (vuelta 67). */
    this.anfitrion = false
    /** Cuándo llegó la última foto. Null mientras no haya llegado ninguna. */
    this._ultimaFotoEn = null
    /**
     * **Cuántas butacas hay ocupadas**, según el servidor (vuelta 67). No se
     * deduce de que haya pose del rival: durante la fase de compra la foto sale
     * por destinatario y no la lleva, así que ahí «hay rival» y «veo al rival»
     * son dos preguntas distintas.
     */
    this.ocupadas = 0
    /**
     * **Avisos hacia fuera.** `onBienvenida` cuando el servidor te da sitio y
     * `onVeredicto` cada vez que dice qué pasó con uno de tus disparos. Son
     * pulsaciones, no valores por frame, así que quien las escuche puede pintar
     * sin saltarse la regla de no repintar por frame.
     */
    this.onBienvenida = null
    this.onVeredicto = null
    /** Aviso del veredicto **local** de cada disparo: lo usa la marca de bala. */
    this.onTiroLocal = null
    /**
     * **Y por qué se ha acabado la partida para ti** (vuelta 51). Llega con un
     * motivo legible y con `deFuera` puesto si lo dijo el servidor (`ADIOS`) o
     * quitado si sólo se cortó el cable. Hasta la 51 no existía, y el resultado
     * era que una partida llena o un socket caído se veían **exactamente igual
     * que un juego colgado**: nada en pantalla y nada en la consola.
     */
    this.onDesconectado = null
    /**
     * Cambios en la pausa o en la votación: `{ pausa, votacion }`, los dos
     * objetos de abajo. **No se avisa de las cuentas atrás**, que cambian
     * sesenta veces por segundo: quien las pinte las lee con `restaPausaMs()` y
     * `restaVotacionMs()` en su bucle, que es lo que ya hace para todo lo demás
     * que va por frame.
     */
    this.onPausa = null
    /** El último motivo, para quien lo quiera pintar sin esperar al aviso. */
    this.desconexion = null
    /** Paso propio. Va por delante del servidor lo que tarde el viaje. */
    this.paso = 0
    /** Entradas mandadas y todavía sin confirmar, en orden. */
    this.pendientes = []
    /**
     * **El arma que se empuña.** La escribe quien la lleve —el motor, al
     * equiparla— y viaja en cada entrada: de ella salen el peso que frena y la
     * cadencia que el servidor valida. Por defecto, la de la ranura secundaria,
     * que es la que se lleva siempre.
     */
    this.arma = WEAPON_ORDER[0]
    /** Teclas de este frame, que las escribe quien lea el teclado. */
    this.teclas = { forward: false, back: false, left: false, right: false, jump: false, crouch: false, walk: false, use: false }
    /** Instante real de la última pulsación de saltar sin repartir, o null. */
    this._saltoTs = null
    /** El clic de disparo pendiente de repartir: instante real y adónde apuntaba. */
    this._disparo = null
    /**
     * **Un proyectil que ha lanzado el rival.** Como `onTiroLocal` y
     * `onBienvenida`, es un aviso y no un estado: el netcode no sabe dibujar.
     * @type {null|((mensaje: object, adelantoS: number) => void)}
     */
    this.onProyectil = null
    /** Disparos mandados y todavía sin veredicto del servidor, por número. */
    this.disparosEnVuelo = new Map()
    this._seqDisparo = 0
    /** Vida que dice el servidor. Con cero, abatido. */
    this.vida = 100
    /** Lo que queda de gracia al empezar la ronda, en ms. 0 = ninguna. */
    this.invulnerableMs = 0
    /** Escudo y casco, que desde la vuelta 64 también existen en red. */
    this.escudo = 0
    this.casco = false
    /**
     * **Lo que tienes y lo que puedes comprar**, tal como lo dice el servidor
     * (vuelta 64). Aquí no se decide nada: el panel dibuja esto y manda
     * `MSG.COMPRAR`; lo que cuesta y si cabe lo decide el otro extremo, igual
     * que la cadencia del arma. `techo` es la lista de tipos comprables en la
     * ronda 1, o `null` si no hay techo.
     */
    this.economia = { dinero: 0, inv: { primaria: null, secundaria: null, granadas: [], supresor: {}, escudo: 0, casco: false }, techo: null, compra: 0 }
    /** ¿La partida tiene economía? Lo dice la bienvenida. */
    this.conEconomia = false
    /** Aviso de que la economía ha cambiado: lo escuchan el panel y el motor. */
    this.onEconomia = null
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
    this.pausa = { pausada: false, por: null, mia: false,
                   libres: PAUSE.free, rivalLibres: PAUSE.free,
                   /** `'caida'` cuando la puso el servidor porque alguien se fue. */
                   motivo: null }
    /**
     * **Las rondas, tal como las cuenta el servidor** (vuelta 62). Aquí no se
     * decide nada —ni cuándo empieza una fase, ni quién gana—: se lee de la foto
     * y se dibuja. La misma regla que la pausa, y por el mismo motivo.
     */
    this.rondas = { n: 0, fase: 'espera', resta: 0, marcador: [0, 0], ganador: null,
                    motivo: null, ultima: null, prorroga: false }
    /** El pase de reconexión, que da la bienvenida. Lo guarda la página. */
    this.pase = null
    /**
     * **La votación, que no para el mundo** (vuelta 55). `mia` es la de uno
     * mismo —a quien la pide no se le pregunta nada— y `votado` dice si ya se
     * contestó, que es lo que retira el cartel.
     */
    this.votacion = { activa: false, por: null, mia: false, votado: false }
    /** Instante local en que caducan. Ver `restaPausaMs` / `restaVotacionMs`. */
    this._pausaHasta = null
    this._votacionHasta = null
    /** El ritmo del bucle: sobrante del frame y frames seguidos frenados. */
    this._acumulador = 0
    this._frenados = 0

    /** Fotos del rival, para dibujarlo en el pasado. */
    this.rival = { id: null, buffer: [], pose: null, arma: null, vida: 100, mirilla: false }
    /**
     * **Si estoy mirando por un visor de los que brillan** (vuelta 90). Lo
     * escribe el motor al poner y quitar la mirilla, y viaja en cada entrada
     * como el arma: es lo único del protocolo que cuenta lo que este jugador
     * está **haciendo** y no dónde está.
     *
     * Y va como **flanco declarado y no deducido**: el servidor no tiene forma
     * de saber que alguien ha apretado el botón derecho, igual que no sabe que
     * está tensando un arco (vuelta 87). Lo que sí hace es no creerse un
     * destello de un arma que no lo lleva, que es lo que impide pintarle uno
     * falso al rival; **ocultarlo** sí es posible desde un cliente modificado,
     * y ése es el precio conocido de que la mirilla sea del cliente desde la
     * vuelta 70.
     */
    this.mirilla = false
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
      /** Disparos que el servidor ha tirado por cadencia (vuelta 56). */
      rechazados: 0,
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

  /** La ranura del rival: en un 1v1 es la otra. */
  get equipoRival() {
    return this.equipo === 0 ? 1 : 0
  }

  /** Su nick provisional, de su ranura. Placeholder hasta que haya cuentas. */
  get nickRival() {
    return `VK-0${this.equipoRival + 1}`
  }

  /**
   * **Cuánto falta para reaparecer**, o 0 si se está vivo. Sale del reloj de
   * las entradas —`vivoEn` menos el paso propio— y no de un cronómetro local:
   * es el mismo número con el que el servidor lo decide, así que la cuenta de
   * la pantalla y la reaparición caen en el mismo instante (vuelta 52).
   */
  restaReaparicionMs() {
    if (this.vivoEn <= 0) return 0
    return Math.max(0, (this.vivoEn - this.paso) * SIM_STEP_MS)
  }

  /**
   * **Deja al jugador en su sitio de salida.** Lo usa el motor al empezar una
   * sesión de red: `movement.reset()` por su cuenta lo llevaría al spawn del
   * escenario, que es uno solo, y el servidor le ha dado **su ranura** —dos
   * sitios separados, para no aparecer uno dentro del otro—. Medido sin esto:
   * 2.5 u de error y una corrección en el primer paso de cada partida.
   */
  colocarEnSalida() {
    this._reaparecerAqui()
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
  pedirVotacion() { this._decir('votar') }
  reanudar() { this._decir('reanudar') }
  votar(acepta) { this._decir(acepta ? 'si' : 'no') }

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

  /** Lo mismo para la ventana de la votación. */
  restaVotacionMs(ahora = performance.now()) {
    if (this._votacionHasta === null) return null
    return Math.max(0, this._votacionHasta - ahora)
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
      // 1 flojo, 2 fuerte; sin cuchillo no viaja. Un campo que no está es un
      // campo que no ocupa sesenta veces por segundo.
      if (this._disparo.golpe) d.m = this._disparo.golpe
      /**
       * **Y con cuánta carga, si es un arma de tiro curvo** (vuelta 85). Es lo
       * único de la parábola que viaja: de dónde y hacia dónde ya van ahí
       * arriba, y de los tres el servidor deriva la misma trayectoria porque da
       * los mismos pasos contra el mismo mapa.
       *
       * Viaja **acotado en el servidor**, como el paso a rebobinar de la vuelta
       * 46: un cliente puede mentir y lo que consigue es lo mismo que pedir un
       * rebobinado de un minuto — que se le acote a lo que el arma da.
       */
      if (this._disparo.carga) d.c = +this._disparo.carga.toFixed(3)
      /**
       * **Y lo de una granada: cuánto se ha sostenido y si va corta** (vuelta
       * 87). Lo que **no** viaja es la mecha ya calculada, que es justo lo que
       * un cliente podría mentir para que reventase antes en la cara del otro:
       * los dos extremos la derivan con `mechaDeGranada`, que lleva el suelo de
       * un segundo dentro. Es el mismo reparto que `lanzamientoDeArma` con la
       * parábola — viaja el gesto, no su resultado.
       */
      if (this._disparo.sostenidoS) d.h = +this._disparo.sostenidoS.toFixed(3)
      if (this._disparo.corto) d.j = 1
      /**
       * **Y con una escopeta, la semilla del patrón** (vuelta 91). Es el único
       * campo del protocolo que no describe un gesto sino **un sorteo**, y va
       * así por lo mismo que la física de la vuelta 72 no viaja: los ocho
       * perdigones se **derivan** de este número en los dos extremos con
       * `perdigonDeSemilla`, así que lo que viaja es uno y no dieciséis
       * ángulos.
       *
       * No regala nada nuevo: el desvío de una bala lo sortea el cliente desde
       * la vuelta 88, así que quién decide dónde va el plomo no cambia — lo
       * que cambia es que ahora el servidor puede reproducirlo exactamente.
       */
      if (this._disparo.semilla) d.p = this._disparo.semilla >>> 0
      this._disparo = null
    }

    const entrada = {
      t: MSG.ENTRADA,
      n: paso,
      k: empaquetarTeclas(this.teclas),
      yaw: this.camara.rotation.y,
      jt,
      /**
       * **El arma que se empuña, en cada entrada** (vuelta 56). No es un dato
       * del disparo: es del **movimiento**, porque el peso frena, y por eso
       * tiene que viajar con cada paso y no sólo cuando se aprieta el gatillo.
       * Medido con la Rift en la mano y sin mandarla: el cliente predecía a
       * 5.88 u/s y el servidor simulaba a 6.50, o sea 75 correcciones en 286
       * fotos y 2.5 u de error — la reconciliación entera abierta por un
       * número que no viajaba. De paso es de donde salen la cadencia que el
       * servidor valida y el arma que el rival ve en la ficha flotante.
       */
      w: WEAPON_ORDER.indexOf(this.arma),
    }
    // **Y sólo cuando la hay**: lo que vale su valor de fábrica no viaja
    // (vuelta 83), así que una entrada normal pesa exactamente lo que pesaba.
    if (this.mirilla) entrada.z = 1
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
      /**
       * **Lo que el tirador vio, para quien lo dibuje** (vuelta 64). El motor
       * pone aquí la marca de bala en la pared: es el único punto en el que se
       * sabe a la vez el rayo que salió y si acabó en el rival, y las dos cosas
       * hacen falta —a un rival alcanzado no se le dibuja nada detrás—. El
       * veredicto del servidor no sirve para esto: llega un viaje después y
       * dice si le diste, no por dónde pasó la bala.
       */
      this.onTiroLocal?.(local.veredicto, d)
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
  disparar(ahoraMs, yaw, pitch, golpe = 0, carga = 0, granada = null, semilla = 0) {
    // **En pausa no se anota nada.** Como el disparo se consume en el paso
    // siguiente y en pausa no hay pasos, uno anotado ahora saldría al reanudar:
    // una bala guardada durante la pausa, apuntada a donde el rival estaba
    // parado. Es justo lo que la pausa no puede permitir.
    if (this.pausa.pausada) return
    // **Y en la fase de compra tampoco** (vuelta 62). El servidor lo rechaza de
    // todos modos, pero anotarlo aquí haría que el cliente predijera un impacto
    // —con su sonido y su marca en la mira— contra un rival del que ni siquiera
    // le están mandando la posición. Un disparo que sólo existe en una pantalla
    // es peor que un disparo que no sale.
    if (this.rondas.fase === 'compra' || this.rondas.fase === 'fin') return
    // **Y qué golpe es, si lo que se empuña es un cuchillo** (vuelta 71). Va
    // dentro del disparo y no en un mensaje aparte porque es exactamente lo
    // mismo desde el punto de vista del protocolo: sellado en la entrada de su
    // paso, con su `seq` y con su veredicto. Lo único que cambia es cómo se
    // resuelve en el otro extremo.
    this._disparo = {
      ts: ahoraMs, yaw, pitch, golpe, carga, semilla,
      sostenidoS: granada?.sostenidoS ?? 0,
      corto: Boolean(granada?.corto),
    }
  }

  /**
   * **Lo que el tirador veía.** Resuelve el disparo contra la pose con la que
   * el rival está dibujado ahora mismo —en el pasado, interpolado—, que es
   * literalmente lo que hay en pantalla. El servidor hará lo mismo rebobinando;
   * comparar los dos veredictos es la medida de si la compensación funciona.
   */
  _resolverLocal(d) {
    /**
     * **Un arma de proyectil no se resuelve aquí, igual que no se resuelve en
     * el servidor** (vuelta 91). `partida.js` desvía a `_lanzarProyectil`
     * antes de rebobinar nada (vuelta 85) y este lado no lo hacía: seguía
     * sacando el veredicto de **un rayo instantáneo** para un disparo que lo
     * que ha hecho es soltar una flecha. Dos cosas salían de ahí, y ninguna
     * daba un error:
     *
     * - **Dos marcas de bala por flecha.** `onTiroLocal` pinta la marca de la
     *   vuelta 64 donde acaba el rayo, así que en la pared aparecía una al
     *   instante —a la distancia de un hitscan— y otra medio segundo después,
     *   donde la flecha cae de verdad. Se veía como que el arco disparaba dos
     *   veces.
     * - **Y fantasmas en los números de F3.** Apuntando de frente, el rayo
     *   entra en el cuerpo del rival y el veredicto local decía «impacto»
     *   contra un servidor que dice que no, porque la flecha todavía va por el
     *   aire. O sea que la medida de la compensación de retraso contaba como
     *   desacuerdo de red algo que es del mundo.
     *
     * Se marca `proyectil` en vez de no devolver nada porque el cliente espera
     * **un veredicto por `seq`**, y quien lo lee tiene que poder saber que ahí
     * no hubo rayo sin preguntarle al catálogo por su cuenta.
     */
    if (WEAPONS[this.arma]?.tiro) {
      return {
        veredicto: { impacto: false, zona: null, distancia: 0, dano: 0, tapado: false, proyectil: true },
        enPaso: null,
      }
    }
    const pose = this.poseDelRival()
    if (!pose) return { veredicto: { impacto: false, zona: null, distancia: 0, dano: 0, tapado: false }, enPaso: null }
    const cuerpo = cuerpoDeJugador(pose.x, pose.z, pose.feetY, pose.eyeHeight)
    // **Y hacia dónde mira**, que es lo que decide si el cuchillo entra por la
    // espalda. Viene en la foto desde la vuelta 60 —de ahí sale la brújula del
    // rival— así que no hace falta mandar nada nuevo.
    cuerpo.yaw = pose.yaw ?? 0
    if (d.m) {
      return {
        veredicto: resolverCuchillada(
          this.camara.position, d.yaw, d.pitch, cuerpo, this.oclusores, this.arma,
          d.m === 2 ? 'fuerte' : 'luz',
        ),
        enPaso: pose.enPaso,
      }
    }
    // **Y una escopeta resuelve su patrón, no un rayo** (vuelta 91), con la
    // misma función que corre el servidor: dos copias de la fórmula serían
    // ocho perdigones que el tirador ve dar y el servidor ve fallar.
    if (WEAPONS[this.arma]?.perdigones) {
      return {
        veredicto: resolverEscopeta(
          this.camara.position, d.yaw, d.pitch, d.p >>> 0, cuerpo, this.oclusores, this.arma,
        ),
        enPaso: pose.enPaso,
      }
    }
    return {
      veredicto: resolverDisparo(this.camara.position, d.yaw, d.pitch, cuerpo, this.oclusores, this.arma),
      enPaso: pose.enPaso,
    }
  }

  /** Apunta el veredicto del servidor contra el que se había sacado aquí. */
  _compararDisparo(resultado) {
    const mio = this.disparosEnVuelo.get(resultado.seq)
    if (!mio) return
    this.disparosEnVuelo.delete(resultado.seq)
    // **Un lanzamiento no entra en la tabla de acuerdo** (vuelta 91). Lo que
    // esa tabla mide es si el rebobinado pone al rival donde el tirador lo
    // veía, y una flecha no se rebobina a propósito (vuelta 85): los dos
    // extremos dirían «sin impacto» siempre y el porcentaje subiría por
    // disparos que no prueban nada. El veredicto se avisa igual.
    if (mio.mio.proyectil) {
      this.onVeredicto?.(resultado)
      return
    }
    const m = this.medidas
    m.disparos += 1
    // **Un disparo rechazado por cadencia no es un desacuerdo de la red**: el
    // servidor no lo ha resuelto, lo ha tirado. Se cuenta aparte, o el
    // porcentaje de acuerdo diría que la compensación falla cuando lo que pasa
    // es que alguien está pidiendo más disparos de los que su arma da.
    if (resultado.rechazado) {
      m.rechazados += 1
      m.detalle.push({ rechazado: true })
      if (m.detalle.length > 400) m.detalle.shift()
      return
    }
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
    // **El peso del arma entra en la simulación, no al lado.** Se aplica aquí,
    // en el mismo sitio en que lo aplica el servidor, para que reejecutar una
    // entrada vieja la vuelva a dar con el arma que se llevaba entonces.
    const arma = WEAPONS[WEAPON_ORDER[entrada.w]]
    if (arma) m.setWeaponWeight(arma.weight)
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
      // **Y mirando hacia el mapa** (vuelta 66). Con las dos salidas en extremos
      // opuestos, el rumbo deja de ser un detalle: sin esto el que aparece en el
      // extremo sur lo hace mirando a la pared del fondo. Es lo mismo que hace
      // el servidor, así que no hay nada que corregir después.
      this.controles?.lookAt(this.salida.yaw)
    }
  }

  _recibir(mensaje) {
    /**
     * **Ha salido un proyectil del rival** (vuelta 85). Lo que llega es el
     * lanzamiento, no la posición, así que aquí no se corrige nada: se **avisa**
     * y quien dibuja lo pone a volar con la misma parábola.
     *
     * Y va con su **número de paso**, que es lo que permite adelantarlo: el
     * mensaje ha tardado un viaje en llegar, así que arrancar el vuelo desde
     * cero pintaría un cohete saliendo de donde el rival estaba hace 25 ms y
     * moviéndose por detrás de la realidad el resto del trayecto.
     */
    if (mensaje.t === MSG.PROYECTIL) {
      this.onProyectil?.(mensaje, Math.max(0, (this.paso - mensaje.n) * SIM_STEP_MS / 1000))
      return
    }
    /**
     * **Un cuchillo del mundo** (vuelta 90). No se adelanta como un proyectil:
     * lo que llega ya está quieto, así que el viaje no le ha hecho nada. Se
     * pasa tal cual a quien dibuja el mundo, que es el motor.
     */
    if (mensaje.t === MSG.CLAVADA) {
      this.onClavada?.(mensaje)
      return
    }
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
      this.salida = { x: mensaje.salida.x, z: mensaje.salida.z, yaw: mensaje.salida.yaw ?? 0 }
      /**
       * **Tu ranura**, que es tu sitio de salida y tu color (vuelta 49). En un
       * 1v1 la del rival es la otra, y de ahí sale también su nick provisional:
       * no hay cuentas, así que el nombre es la ranura, como el `VK-01` del
       * pool de dianas. El día que haya identidades, esto es lo que cambia.
       */
      this.equipo = mensaje.equipo
      /**
       * **¿Es esta pantalla la que creó la partida?** (vuelta 67). Lo dice la
       * bienvenida; aquí sólo se guarda. De ello depende que el panel enseñe
       * las opciones de la partida como editables o como lo que son para el que
       * se une: información.
       */
      this.anfitrion = !!mensaje.anfitrion
      /**
       * **¿Hay economía en esta partida?** (vuelta 64). Lo dice el servidor en
       * la bienvenida y de ahí sale de dónde viene el arma principal: comprada,
       * o del ajuste del jugador (ver `engine.usarRed`).
       */
      this.conEconomia = !!mensaje.eco
      // **El pase es de la butaca, no de la conexión** (vuelta 62): quien vuelve
      // lo enseña y se sienta donde estaba. La página lo guarda; aquí sólo se
      // recoge, porque dónde se guarda una cosa entre visitas no es del netcode.
      this.pase = mensaje.pase ?? this.pase
      this.camara.position.x = mensaje.salida.x
      this.camara.position.z = mensaje.salida.z
      this.controles?.lookAt(this.salida.yaw)
      this.onBienvenida?.(mensaje)
      return
    }
    if (mensaje.t === MSG.ECONOMIA) {
      this.economia = {
        dinero: mensaje.dinero,
        inv: mensaje.inv,
        techo: mensaje.techo ?? null,
        compra: mensaje.compra ?? this.economia.compra,
      }
      this.onEconomia?.(this.economia)
      return
    }
    if (mensaje.t === MSG.FOTO) this._reconciliar(mensaje)
  }

  /**
   * **Pedir una compra.** Se manda y ya: el veredicto llega como `MSG.ECONOMIA`,
   * con el saldo y el inventario de después. No se predice nada en local —a
   * diferencia del movimiento y del disparo— porque comprar no tiene que sentirse
   * instantáneo y un carrito predicho que el servidor rechace es peor que medio
   * segundo de espera.
   */
  comprar(clave, arma = null) {
    if (!this.conectado) return
    this.transporte.send(JSON.stringify({ t: MSG.COMPRAR, q: clave, ...(arma ? { a: arma } : null) }))
  }

  /**
   * **Las rondas salen enteras de la foto**, como la pausa. Lo único que hace
   * el cliente con ellas es obedecer:
   *
   * - **Al cambiar de fase se tira la cola sin confirmar.** Un reinicio de ronda
   *   es un teletransporte que decide el servidor, y las entradas que viajaban
   *   son de un mundo que ya no existe.
   * - **El corralito se pone y se quita aquí**, con la misma caja que calcula el
   *   servidor: el cliente predice su propio movimiento, así que un límite que
   *   sólo conociera un lado sería una corrección por paso contra una pared que
   *   sólo existe en un sitio.
   * - **Y en la compra no hay rival que dibujar.** No es que no se dibuje: es
   *   que el servidor no manda su posición. Se vacía el buffer para que al
   *   empezar la ronda no se interpole desde donde estaba hace quince segundos.
   */
  _leerRondas(foto) {
    const r = foto.rd
    if (!r) return
    const antes = this.rondas.fase
    const cambia = antes !== r.f || this.rondas.n !== r.n
    this.rondas = {
      n: r.n,
      fase: r.f,
      resta: r.resta ?? 0,
      marcador: r.m ?? [0, 0],
      ganador: r.g ?? null,
      motivo: r.mot ?? null,
      ultima: r.u ?? null,
      prorroga: !!r.pr,
    }
    if (!cambia) return
    this.pendientes.length = 0
    this.rival.buffer.length = 0
    this.movimiento.setCorralito(r.f === 'compra' ? this._cajaDeCompra() : null)
    this.onRonda?.(this.rondas)
  }

  /** La caja de la compra, centrada en la salida de esta ranura. */
  _cajaDeCompra() {
    if (!this.salida) return null
    const mx = ROUNDS.cajaCompra.ancho / 2
    const mz = ROUNDS.cajaCompra.fondo / 2
    return {
      minX: this.salida.x - mx, maxX: this.salida.x + mx,
      minZ: this.salida.z - mz, maxZ: this.salida.z + mz,
    }
  }

  /**
   * **Irse se dice** (vuelta 62). Es la única forma de que el servidor
   * distinguga un abandono de una caída, porque un cable que se corta no manda
   * ningún mensaje. Se manda y se cierra: el `close` que llega detrás ya no
   * cuenta como caída porque el servidor lo ha marcado al oír esto.
   */
  abandonar() {
    try {
      this.transporte.send(JSON.stringify({ t: MSG.ADIOS, razon: 'el jugador se ha ido' }))
    } catch {
      /* si el cable ya no está, el servidor lo verá como caída; es lo correcto */
    }
    this.cerrar()
  }

  /** «El otro no vuelve»: cierra la ventana de reconexión antes de tiempo. */
  reclamar() {
    this.transporte.send(JSON.stringify({ t: MSG.RECLAMAR }))
  }

  /**
   * El estado de la pausa sale **entero** de la foto, y se avisa sólo cuando
   * cambia algo: quien lo pinta no tiene por qué comparar sesenta veces por
   * segundo. Aquí no se decide nada — el cliente pide y obedece.
   */
  _leerPausa(foto) {
    const p = this.pausa
    const v = this.votacion
    const antes = `${p.pausada}${p.por}${p.motivo}${p.libres}${p.rivalLibres}${v.activa}${v.por}${v.votado}`
    const estaba = p.pausada
    p.pausada = !!foto.pa
    p.por = foto.pa?.por ?? null
    // **Por qué está parado el mundo**, que no es lo mismo que quién lo paró: una
    // pausa por caída no la puso nadie, así que no hay a quién devolverle el
    // botón de reanudar (vuelta 62).
    p.motivo = foto.pa?.motivo ?? null
    p.mia = p.por !== null && p.por === this.id
    this._pausaHasta = foto.pa ? performance.now() + foto.pa.resta : null

    v.activa = !!foto.vo
    v.por = foto.vo?.por ?? null
    v.mia = v.por !== null && v.por === this.id
    this._votacionHasta = foto.vo ? performance.now() + foto.vo.resta : null

    for (const id of Object.keys(foto.p)) {
      const suyo = foto.p[id]
      if (suyo.libres === undefined) continue
      if (id === this.id) {
        p.libres = suyo.libres
        // **Si ya has votado, el cartel se retira**, y lo dice el servidor. Un
        // «ya he pulsado» local se quedaría puesto contra una votación que el
        // servidor no llegó a registrar —el mensaje puede perderse—, que es la
        // misma clase de mentira que un «estoy en pausa» local.
        v.votado = v.activa && !!suyo.vv
      } else {
        p.rivalLibres = suyo.libres
      }
    }

    if (p.pausada && !estaba) {
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
       *
       * **Una votación no necesita esto** (vuelta 55): el mundo no se para, así
       * que no hay entrada que se quede en el aire midiendo nada.
       */
      this._historialEnvio.clear()
    }
    if (`${p.pausada}${p.por}${p.libres}${p.rivalLibres}${v.activa}${v.por}${v.votado}` !== antes) {
      this.onPausa?.(p)
    }
  }

  _reconciliar(foto) {
    this.medidas.fotos += 1
    this._ultimaFotoEn = performance.now()
    this.medidas.sinFotosMs = 0
    this.medidas.pasoServidor = foto.n
    this.ocupadas = foto.ocupadas ?? this.ocupadas
    this._leerPausa(foto)
    // **Antes de reejecutar nada**: si ha cambiado de fase, las entradas que
    // están sin confirmar son de antes del reinicio de ronda, y reejecutarlas
    // encima del sitio de salida sacaría al jugador andando de su propia caja.
    this._leerRondas(foto)

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
      // Fuera del buffer: no se interpola ni se dibuja en el pasado, es una
      // etiqueta. La ficha flotante la lee y el HUD no la mira.
      this.rival.vida = foto.p[id].vida
      this.rival.arma = foto.p[id].arma ?? this.rival.arma
      // El destello es una etiqueta, como el arma: no se interpola, se lee de
      // la última foto. Su retraso es el del resto de lo que se sabe del rival.
      this.rival.mirilla = foto.p[id].mir === 1
    }

    const mio = foto.p[this.id]
    if (!mio) return
    this.medidas.ack = mio.ack
    this.vida = mio.vida
    this.escudo = mio.esc ?? 0
    this.casco = !!mio.cas
    // **La gracia de salida la calcula el servidor** (vuelta 78) y llega ya en
    // ms, como el reloj de la ronda: no hay un cronómetro local que se pueda
    // desfasar, y en pausa no baja porque en pausa no hay fotos nuevas.
    this.invulnerableMs = mio.inv ?? 0
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
    /**
     * **Y un teletransporte reejecutado no vuelve a girar la cámara**
     * (vuelta 80). Reejecutar pasa por el mismo `movement.update`, así que un
     * área de teletransporte que quede dentro de la cola sin confirmar vuelve
     * a pedir su rumbo en cada reconciliación — o sea varias veces por
     * segundo, arrancándole la mira al jugador. El rumbo es un recado de un
     * paso **vivo**; una repetición del pasado no lo es. La posición y la
     * época sí se reejecutan, que es lo que tiene que pasar.
     */
    this.movimiento.rumboPedido = null
    // Y por lo mismo, el destello y el sonido de un dispositivo: un uso
    // reejecutado sonaría varias veces por segundo mientras la plataforma
    // siguiera dentro de la cola sin confirmar.
    this.movimiento.usoDeDispositivo = null

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

  /**
   * **Cuántos pasos de mundo toca dar en este frame** (vuelta 56).
   *
   * Es el bucle de la página del duelo, movido aquí tal cual al conectarse el
   * motor completo: acumulador con arrastre del resto y enganche al reloj del
   * servidor. Vive en el cliente porque es **del netcode**, no del dibujado —el
   * acumulador solo bastaría para un juego local, y lo que lo distingue es el
   * enganche—, y porque tenerlo en la página significaba que el motor habría
   * tenido que llevar una segunda copia.
   *
   * Tres reglas, y las tres están medidas en vueltas anteriores:
   *
   * - **El acumulador guarda el sobrante y lleva tolerancia**, como el del
   *   motor y por la misma razón: un monitor a 60 Hz entrega frames de 16.666
   *   ms contra un paso de 16.667.
   * - **Por encima de `NET.resyncTicks` de atraso no se recupera corriendo: se
   *   re-ancla** (vuelta 49). Sin bucle no se produjo ni una entrada, así que
   *   no hay nada que recuperar.
   * - **Y sólo se le hace caso a un reloj fresco** (vuelta 51). Contra un reloj
   *   parado el freno es una trampa sin fondo: 60 → 3 → 0 pasos por segundo.
   *   El freno tiene suelo, y se mide en **frames seguidos frenados**.
   *
   * Devuelve los pasos a dar y si ha re-anclado — quien dibuje necesita saberlo
   * para no interpolar a través del salto.
   */
  pasosDeFrame(ahora, delta) {
    const tolerancia = Math.min(1, SIM_STEP_MS * 0.1)
    this._acumulador += delta
    let pasos = 0
    while (this._acumulador >= SIM_STEP_MS - tolerancia) {
      this._acumulador -= SIM_STEP_MS
      pasos += 1
    }
    let reanclado = false
    const objetivo = this.relojFresco(ahora) ? this.pasoObjetivo() : 0
    if (objetivo > 0) {
      const desfase = objetivo - (this.paso + pasos)
      if (desfase > NET.resyncTicks) {
        this.reanclar(objetivo)
        pasos = 0
        this._acumulador = 0
        reanclado = true
      } else if (desfase > NET.clockDeadbandTicks) {
        pasos += Math.min(NET.maxCatchUpTicks, desfase)
        this._frenados = 0
      } else if (desfase < -NET.clockDeadbandTicks && pasos > 0 && this._frenados < NET.clockDeadbandTicks) {
        pasos -= 1
        this._frenados += 1
      } else {
        this._frenados = 0
      }
    }
    return { pasos, reanclado }
  }

  /** Lo que le sobra al último paso, para el alfa del dibujado interpolado. */
  get acumulador() {
    return this._acumulador
  }

  /** En pausa el mundo no avanza y **el acumulador no guarda el rato parado**. */
  soltarAcumulador() {
    this._acumulador = 0
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
      /**
       * **La época de pose del lado que se está dibujando** (vuelta 82). Ya se
       * usaba aquí dentro para no interpolar por encima de un salto; publicarla
       * es lo que deja al motor enterarse de que el rival **ha saltado sin
       * recorrer el camino**, que es la definición de teletransporte y no una
       * medida de velocidad. Antes se deducía de que fuese rápido —«más del
       * doble del techo del aire»— y eso dejó de valer en cuanto una plataforma
       * de velocidad pudo lanzar a 60 u/s: un lanzamiento se leía como un
       * teletransporte.
       */
      epoca: a.s.poseEpoch,
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
