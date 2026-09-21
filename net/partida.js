/**
 * **La partida: todo lo que decide el servidor, sin saber por dónde viaja**
 * (vuelta 47).
 *
 * Hasta la 46 esto vivía dentro de `net/servidor.mjs`, mezclado con `ws`. Al
 * llegar Cloudflare hacían falta **dos** huéspedes —Node en local y un Durable
 * Object en la nube— y copiar la lógica en los dos habría sido la primera vez
 * en este repositorio que una regla del juego vive en dos sitios. Así que la
 * partida se quedó aquí y los dos huéspedes se reparten sólo lo suyo: aceptar
 * conexiones, llevar el reloj y mover bytes.
 *
 * **No hay nada de red en este fichero.** Cada jugador entra con una función
 * `enviar(texto)` y ya está: quién la implementa —un `WebSocket` de `ws`, uno de
 * Cloudflare— no se sabe desde aquí. Es la misma idea que el transporte del
 * cliente (`net/transporte.js`), aplicada al otro extremo.
 *
 * Y sigue sin tener código de juego: importa `movement.js`, `scenario.js`,
 * `hitPlayer` y `hasLineOfSight` tal cual.
 */
import { ECONOMY, NET, PAUSE, PROJECTILES, ROUNDS, SIM, SIM_STEP_MS, WEAPONS, WEAPON_ORDER, catalogoDeTienda } from '../src/config.js'
import { MovementController } from '../src/game/movement.js'
import { encajarImpacto, hitPlayer, zoneDamage } from '../src/game/player.js'
import { Proyectiles, caidaDeArea, lanzamientoDeArma } from '../src/game/proyectiles.js'

/**
 * **De qué arma es una clase de proyectil, y con qué explota.** Salen del
 * catálogo y no de una segunda tabla: el día que dos armas lancen lo mismo,
 * las dos revientan igual. Se resuelven una vez al cargar el módulo porque el
 * catálogo no cambia en caliente.
 */
const ARMA_DE_PROYECTIL = new Map()
for (const [clave, arma] of Object.entries(WEAPONS)) {
  if (arma.tiro?.proyectil) ARMA_DE_PROYECTIL.set(arma.tiro.proyectil, clave)
}
const claveDeProyectil = (tipo) => ARMA_DE_PROYECTIL.get(tipo) ?? null
const explosionDeProyectil = (tipo) => WEAPONS[claveDeProyectil(tipo)]?.tiro?.explosion ?? null
import { crearPose, cuerpoDeJugador } from './pose.js'
import { direccionDeMira, resolverCuchillada, resolverDisparo } from './disparo.js'
import { MSG, compraAbierta, desempaquetarTeclas, instanteDePaso, instanteEnPaso } from './protocolo.js'

/** Temporales del vuelo de un proyectil: el bucle del servidor no asigna. */
const _ojos = { x: 0, y: 0, z: 0 }
const _origen = { x: 0, y: 0, z: 0 }
const _dirP = { x: 0, y: 0, z: 0 }
const _golpeP = { t: 0, victima: null, zona: null }
const _lanzamiento = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, tipo: null, fuerza: 0, intensidad: 0 }

/**
 * **Interpolación de rumbos, por el camino corto.** Entre 179° y −179° hay dos
 * grados, no trescientos cincuenta y ocho, y la media recta de esos dos números
 * da 0 — o sea mirando justo al revés de donde se miraba. Lo usa el rebobinado
 * para saber hacia dónde miraba la víctima cuando le clavaron el cuchillo.
 */
/**
 * **Qué golpe es**, del campo `m` que viaja dentro del disparo: 2 es fuerte y
 * cualquier otra cosa es flojo. Un campo y no dos mensajes, porque un golpe de
 * cuchillo es exactamente lo mismo que un disparo desde el punto de vista del
 * protocolo —va sellado en la entrada de su paso, con su `seq` y su veredicto—
 * y lo único que cambia es cómo se resuelve.
 */
function tipoDeGolpe(d) {
  return d && d.m === 2 ? 'fuerte' : 'luz'
}

function mezclaDeRumbo(a, b, alfa) {
  if (!Number.isFinite(a)) return b
  if (!Number.isFinite(b)) return a
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * alfa
}

export class Partida {
  /**
   * @param {object} opciones
   * @param {import('../src/game/scenario.js').Scenario} opciones.escenario
   * @param {number} [opciones.colchon] pasos de amortiguador contra el jitter
   * @param {boolean} [opciones.depurar] atiende `MSG.COLOCAR` (bancos de prueba)
   */
  /**
   * @param {boolean} [opciones.rondas] juega a rondas (vuelta 62). Apagado, el
   *   duelo es lo que era hasta la 61: un mundo que no se reinicia, con la
   *   reaparición por reloj de la vuelta 52. **Es lo que usan los bancos de
   *   netcode**, que miden reconciliación y compensación de retraso a base de
   *   matar al mismo blanco veinte veces seguidas: con rondas, cada muerte abre
   *   quince segundos de compra y la tabla no mide nada. Misma idea que
   *   `depurar`: un interruptor para poder medir, no un modo de juego.
   */
  /**
   * @param {number} [opciones.compraSegundos] lo que dura la fase de compra en
   *   **esta** sala (vuelta 64). Lo elige quien crea la partida y viaja en la
   *   dirección del socket; a **cero no hay fase de compra** y las rondas se
   *   encadenan. Es de la sala y no de `config.js` porque dos amigos que quedan
   *   para diez minutos no juegan lo mismo que dos que van en serio.
   */
  constructor({
    escenario,
    colchon = NET.jitterBufferTicks,
    depurar = false,
    rondas = true,
    compraSegundos = ROUNDS.compraSegundos,
  }) {
    this.escenario = escenario
    /**
     * **Lo que hay volando, y es del mundo y no de nadie** (vuelta 85). Un
     * cohete sobrevive a quien lo lanzó —que es la mitad de lo que lo hace
     * interesante— así que su dueño es la partida, no el jugador: una baja no
     * lo apaga y abandonar tampoco.
     */
    this.proyectiles = new Proyectiles(PROJECTILES.pool * 2)
    /**
     * **La dotación del mapa, si no se compra en él** (vuelta 72). `null` es el
     * camino de siempre: hay economía y cada uno lleva lo que ha pagado. Con
     * dotación no hay tienda ni dinero, y cada ronda —y cada reaparición, que
     * con rondas es lo mismo— reparte esto y nada más.
     *
     * Se lee **antes** que la fase de compra, porque es lo que la decide: un
     * mapa que reparte no tiene fase, y eso no puede depender del orden en que
     * el constructor lea sus campos.
     */
    this.dotacion = escenario.dotacionDeDuelo
    this.compraSegundos = ROUNDS.compraSegundos
    this.configurarCompra(compraSegundos)
    this.colchon = colchon
    this.depurar = depurar
    this.conRondas = rondas
    this.paso = 0
    /**
     * **La pausa, que es del mundo y no de quien la pide** (vuelta 53). Null, o
     * `{ por, expiraEn }`. Mientras está puesta, `tick` no avanza el
     * mundo: es la misma regla del motor —«pausar es dejar de sumarle al reloj
     * del mundo»— aplicada al servidor, y por eso el número de paso tampoco
     * corre. El huésped se re-ancla, que el reloj de pared sí sigue.
     *
     * `expiraEn` es reloj de **pared** (`Date.now`), no del mundo: el reloj del
     * mundo está parado justo mientras esta cuenta tiene que correr.
     */
    this.pausa = null
    /**
     * **La votación, que no es una pausa y por eso no para nada** (vuelta 55).
     * Null, o `{ por, expiraEn, votos: Map<id, boolean> }`.
     *
     * La 54 la metió dentro de la pausa para cerrar el agujero de la 53 —quien
     * la pedía se quedaba con el ratón suelto mientras el rival seguía jugando—
     * y el arreglo funcionó, pero el precio era el mundo parado de los dos
     * mientras alguien se decidía. La 55 ataca el agujero por el otro lado:
     * **no hay nadie esperando**. Quien la pide vuelve a jugar en el acto y el
     * rival contesta jugando, así que no hay nada que congelar y la votación
     * vuelve a ser un objeto aparte — esta vez sin mentirle a nadie, porque ya
     * no se parece a una pausa.
     *
     * `votos` guarda quién ha contestado ya y qué: una Map y no dos contadores,
     * porque hay que saber **cuántos faltan** y eso es la lista, no la suma.
     */
    this.votacion = null
    this.jugadores = new Map()
    this._siguienteId = 0
    /**
     * **Cuántas butacas están sin cable.** Es un contador y no un recuento sobre
     * el mapa porque esto se mira **en cada paso**: `conectados` construye un
     * array, y el bucle caliente del servidor no asigna memoria, igual que el del
     * motor.
     */
    this._caidos = 0
    /**
     * **Las rondas** (vuelta 62). Dos condiciones de victoria, no una: `marcador`
     * cuenta rondas ganadas **por ranura** —no por id, que cambia y no es la
     * silla— y `ganador` es de la partida entera.
     *
     * `hastaPaso` es el final de la fase en **número de paso**, que es el reloj
     * del mundo: en pausa no corre, igual que no corre nada. Lo que viaja en la
     * foto es *cuánto queda*, calculado aquí, por la misma razón que la cuenta
     * de la pausa (vuelta 54): los relojes de las dos pantallas no coinciden.
     */
    this.rondas = {
      n: 0,
      fase: 'espera',
      hastaPaso: 0,
      marcador: [0, 0],
      ganador: null,
      motivo: null,
      /** Cómo acabó la última ronda, para el cartel de la fase de compra. */
      ultima: null,
      prorroga: false,
      /** Rondas jugadas al entrar en prórroga, para contar las tandas. */
      prorrogaDesde: 0,
    }
    /**
     * **Las salidas las declara el mapa** (vuelta 66). En el de duelo están en
     * extremos opuestos —32 u y el centro tapado por medio—; en cualquier otro,
     * `salidasDeDuelo` cae al reparto de antes, que era el spawn del escenario
     * con 2.5 u a cada lado. Eso nunca fue un reparto de sitios: era la forma de
     * que dos jugadores no aparecieran uno dentro del otro, y puesto a servir de
     * 1v1 empezaba la ronda con los dos a cinco unidades.
     */
    this.salidas = escenario.salidasDeDuelo
  }

  /**
   * **Una butaca reservada sigue ocupada** (vuelta 62). Quien se cae sigue en el
   * mapa con su vida, sus rondas y su ranura hasta que vuelva o se le dé por
   * abandonado; si aquí no contase, un tercero con el código se sentaría en su
   * silla mientras él recarga la página.
   */
  /**
   * **Cuánto dura la fase de compra en esta sala** (vuelta 64). Lo acota aquí y
   * no en cada huésped: son dos —Node y el Durable Object— y un acotado copiado
   * es un acotado que se despega. A cero, no hay fase.
   */
  configurarCompra(segundos) {
    // **Un mapa que reparte no tiene fase de compra, y no es elegible**
    // (vuelta 72). Quince segundos encerrado en una caja con una tienda que no
    // vende nada son quince segundos de nada; y dejarlo al selector sería un
    // control que promete algo que el servidor no va a hacer.
    if (this.dotacion) { this.compraSegundos = 0; return }
    if (!Number.isFinite(segundos)) return
    this.compraSegundos = Math.max(0, Math.min(60, Math.round(segundos)))
  }

  get llena() {
    return this.jugadores.size >= 2
  }

  /**
   * **Vacía es «no hay nadie conectado»**, y es lo que mira el huésped para
   * parar el reloj. Una sala con dos butacas reservadas y nadie dentro no puede
   * gastar sesenta pasos por segundo esperando.
   */
  get vacia() {
    return this.conectados.length === 0
  }

  /** Los que tienen cable. Los desconectados siguen en `jugadores`. */
  get conectados() {
    return [...this.jugadores.values()].filter((j) => !j.desconectado)
  }

  /**
   * ¿Está el mundo parado? Lo pregunta el huésped para no gastar pasos. Una
   * votación en curso **no** lo para (vuelta 55): mientras se decide se juega.
   */
  get pausada() {
    return this.pausa !== null
  }

  /**
   * **Una butaca no se reserva para siempre** (vuelta 62). La pausa por caída ya
   * caduca sola, pero sólo corre mientras hay un paso que la mire: si se van los
   * **dos**, el huésped para el reloj y las dos butacas se quedan congeladas
   * hasta que la sala se olvide —diez minutos— con la partida diciendo que está
   * llena. Pasó nada más construirlo, y el síntoma es de los que no dan error:
   * la página carga, el código coincide y el servidor contesta «la partida está
   * llena (1v1)» a los dos.
   *
   * Por eso se mira además **al entrar**, que es el momento en que a alguien le
   * importa, y con el reloj de pared: es el mismo reloj de la ventana de
   * reconexión, y por la misma razón —tiene que correr con el mundo parado—.
   */
  _caducarButacas() {
    if (this._caidos === 0) return
    const tope = ROUNDS.reconexionSegundos * 1000
    const ahora = Date.now()
    for (const jugador of [...this.jugadores.values()]) {
      if (jugador.desconectado && ahora - jugador.desconectado.desde >= tope) {
        this.abandona(jugador.id)
      }
    }
  }

  /**
   * **Un jugador entra, o vuelve.** Devuelve su id, o null si no hay sitio.
   *
   * El `pase` es lo que distingue volver de llegar: es un secreto que se dio en
   * la bienvenida y que sólo tiene quien ya estaba sentado ahí. Sin él, la
   * butaca de quien se ha caído —con su vida, sus rondas y su ranura— se la
   * quedaría cualquiera que tenga el enlace, **empezando por su rival**.
   *
   * @param {(texto: string) => void} enviar
   * @param {string|null} [pase] pase de reconexión, si dice volver
   */
  entra(enviar, pase = null) {
    this._caducarButacas()
    const vuelve = pase ? this._butacaDe(pase) : null
    if (vuelve) return this._reconectar(vuelve, enviar)
    if (this.llena) return null
    // **La ranura libre, no el número de jugadores** (vuelta 49). Con
    // `jugadores.size` bastaba para dos que entran seguidos y fallaba en cuanto
    // uno se iba: con p2 dentro, el que llegase cogía otra vez la ranura 1 —la
    // suya— y los dos aparecían **en el mismo sitio y del mismo color**. La
    // ranura es la única fuente de las dos cosas, así que un error ahí sale por
    // partida doble.
    const ocupadas = new Set([...this.jugadores.values()].map((j) => j.equipo))
    let equipo = 0
    while (equipo < this.salidas.length && ocupadas.has(equipo)) equipo += 1
    const salida = this.salidas[equipo]
    const pose = crearPose()
    const movimiento = new MovementController(pose)
    movimiento.setScenario(this.escenario)
    movimiento.reset()
    movimiento.setEnabled(true)
    pose.position.x = salida.x
    pose.position.z = salida.z

    const jugador = {
      id: `p${++this._siguienteId}`,
      /**
       * **Su ranura, que es su sitio de salida y su color.** El id no sirve para
       * esto: es un contador que no para de subir, así que dos jugadores pueden
       * ser perfectamente `p3` y `p5` —los dos impares— y un color deducido de
       * ahí los pintaría iguales.
       */
      equipo,
      enviar,
      pose,
      movimiento,
      /** Entradas recibidas y todavía sin ejecutar, en orden. */
      cola: [],
      /** Hasta que no hay colchón no se consume: es el amortiguador del jitter. */
      cebado: false,
      /** Último paso ejecutado. Es lo que se le confirma al cliente. */
      ack: -1,
      /** Pasos en los que no había entrada y el jugador no avanzó. */
      hambre: 0,
      /** Entradas que llegaron cuando su paso ya había pasado: se tiran. */
      tardias: 0,
      bytesEntrada: 0,
      bytesSalida: 0,
      estado: {},
      /**
       * **El historial de cuerpos**, para rebobinar. Un anillo de
       * `NET.historyTicks` posiciones: por cada paso, los siete números que
       * devuelve `playerBody()` más el propio paso. Con 60 pasos son un
       * segundo, tres veces el rebobinado máximo.
       */
      historial: new Array(NET.historyTicks).fill(null),
      vida: 100,
      /**
       * **El paso de ENTRADA en que vuelve a estar vivo**, o 0 si lo está
       * (vuelta 52). Va en el reloj de las entradas de ese jugador y no en el
       * del servidor, y eso es lo que hace que el cliente pueda predecir su
       * propia muerte: `n · SIM_STEP_MS` es el instante del mundo en los dos
       * extremos (ver `protocolo.js`), mientras que el paso del servidor es un
       * contador que el cliente no comparte. Con el reloj del servidor, «estoy
       * muerto» daría distinto a cada lado y la reconciliación no cerraría.
       */
      vivoEn: 0,
      /** Hasta qué paso no le puede hacer daño nadie. 0 = ya se puede. */
      invulnerableHasta: 0,
      /** Veredictos pendientes de mandarle. */
      disparos: [],
      /**
       * **El arma que dice llevar** (vuelta 56). La declara con cada disparo y
       * de ella sale la cadencia que se le exige; también viaja en la foto, que
       * es de donde el rival saca la silueta de su ficha flotante. El servidor
       * no lleva cargador ni recarga: eso es del cliente.
       */
      arma: null,
      /** Instante (reloj de pasos) del último disparo **aceptado**. */
      ultimoTiroEn: -Infinity,
      /** Disparos rechazados por cadencia. Se mira en el informe. */
      rapidos: 0,
      bajas: 0,
      muertes: 0,
      /** Pausas que puede pedir sin permiso. No se recuperan. */
      pausasLibres: PAUSE.free,
      /**
       * **Su dinero y lo que lleva encima** (vuelta 64). Viven aquí y no en el
       * cliente por lo de siempre: el cliente dibuja el panel y **pide**; lo que
       * se puede tener lo decide el servidor. Un cliente que mintiera sobre su
       * saldo compra exactamente nada.
       */
      dinero: ECONOMY.inicial,
      /** Lo comprado: el arma principal y los supresores montados. */
      inventario: { primaria: null, supresor: {}, reserva: {} },
      /** Escudo y casco, que ahora existen también en red. */
      escudo: 0,
      casco: false,
      /** Derrotas seguidas. De aquí sale el suelo que sube al que va perdiendo. */
      rachaDerrotas: 0,
      /**
       * **El pase de reconexión** (vuelta 62). Va en la bienvenida y el cliente
       * lo guarda; volver es enseñarlo. No se regenera al reconectar: es de la
       * butaca, no de la conexión.
       */
      pase: this._nuevoPase(),
      /** `{ desde }` mientras esté sin cable, o null. */
      desconectado: null,
    }
    this.jugadores.set(jugador.id, jugador)

    this._bienvenida(jugador)
    this._enviarEconomia(jugador)
    this._quizaArrancar()
    return jugador.id
  }

  /** Un pase: lo bastante largo para que no se adivine, y nada más. */
  _nuevoPase() {
    return `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`
  }

  _butacaDe(pase) {
    for (const j of this.jugadores.values()) if (j.pase === pase) return j
    return null
  }

  _bienvenida(jugador) {
    jugador.enviar(
      JSON.stringify({
        t: MSG.BIENVENIDA,
        id: jugador.id,
        equipo: jugador.equipo,
        pase: jugador.pase,
        escenario: this.escenario.key,
        hz: SIM.hz,
        n: this.paso,
        /**
         * **Quién manda en las opciones de la partida** (vuelta 67). Lo dice el
         * servidor y no lo deduce el cliente, por lo de siempre: una sala se
         * configura al nacer y **sólo cuenta lo que diga quien la creó**, así
         * que el panel del otro no puede enseñar esos controles como si
         * sirvieran de algo.
         *
         * Es la primera butaca, y no el id: el id es un contador que no para, y
         * la butaca sobrevive a una caída con su pase. Si el anfitrión abandona
         * de verdad, su butaca queda libre y el siguiente que entre la ocupa —y
         * con ella el mando—, que es lo correcto: sin él no queda nadie a quien
         * preguntar.
         */
        anfitrion: jugador.equipo === 0,
        salida: {
          x: jugador.pose.position.x,
          z: jugador.pose.position.z,
          // **Hacia dónde se mira al aparecer.** Lo decide el mapa y lo dice el
          // servidor: el cliente no puede deducirlo de su ranura sin llevar una
          // segunda copia de las salidas.
          yaw: this.salidas[jugador.equipo]?.yaw ?? 0,
        },
        /**
         * **Si esta partida tiene economía** (vuelta 64). Va en la bienvenida
         * porque decide algo que hay que saber **antes** del primer paso: con
         * economía se sale con la pistola y el arma principal la pone lo que
         * compres; sin ella —un huésped con `VEKTOR_RONDAS=0`, que es el mundo
         * de los bancos de netcode— el arma sigue siendo la de tus ajustes,
         * como hasta la 63. Sin este campo el cliente tendría que **deducirlo**
         * de que no le llegue un mensaje, que es adivinar por silencio.
         */
        /**
         * **Si hay economía**, que no es lo mismo que si hay rondas (vuelta
         * 72): un mapa puede jugarse a rondas y repartir el equipo en vez de
         * venderlo. El cliente lo necesita para no ofrecer una tienda que el
         * servidor va a rechazar — que es el fallo de la vuelta 65 por la otra
         * punta.
         */
        eco: this.conRondas && !this.dotacion ? 1 : 0,
      }),
    )
  }

  /**
   * **Volver a la misma butaca.** No se crea nada: se le vuelve a colgar el
   * cable al jugador que ya estaba, con su ranura, su vida, su arma y su
   * historial. Y se le manda la bienvenida otra vez, que es como se entera de
   * en qué paso va el mundo — que no es en el que lo dejó.
   */
  _reconectar(jugador, enviar) {
    jugador.enviar = enviar
    if (jugador.desconectado) this._caidos -= 1
    jugador.desconectado = null
    // Su cola es de antes de la caída: esas entradas son de un mundo que ya no
    // existe, y ejecutarlas sería moverlo por donde no ha estado.
    jugador.cola.length = 0
    jugador.cebado = false
    jugador.ack = -1
    this._bienvenida(jugador)
    // **La pausa por caída la levanta volver, no un botón.** Se va en cuanto no
    // queda ninguna butaca sin cable: es del mundo, no de nadie, así que nadie
    // la puede levantar a mano —y por eso tampoco gasta una de las tres libres—.
    if (this.pausa?.motivo === 'caida' && this.conectados.length === this.jugadores.size) {
      this.pausa = null
    }
    return jugador.id
  }

  /**
   * **Se ha cortado el cable, que no es lo mismo que irse** (vuelta 62). Un
   * cable que se corta **no manda ningún mensaje** —es la regla del transporte
   * de la vuelta 51— así que las dos cosas llegan por la misma puerta y la
   * única forma de distinguirlas es que el abandono **se diga**: `MSG.ADIOS` del
   * cliente. Todo cierre sin ese mensaje delante es una caída.
   *
   * Y el valor por defecto es el que menos duele si nos equivocamos, porque la
   * asimetría es clara: dar por abandonado a quien se le fue el wifi le quita
   * una partida que no había perdido; dar por caído a quien cerró la pestaña
   * sólo hace esperar al rival lo que dure la ventana —y ni eso, porque puede
   * cerrarla él—.
   */
  sedesconecta(id) {
    const jugador = this.jugadores.get(id)
    if (!jugador || jugador.desconectado) return
    // **Con la partida acabada no hay a qué volver**, así que la butaca se
    // suelta entera: reservarla sería dejar la sala llena para nadie.
    if (this.rondas.fase === 'fin' || this.rondas.fase === 'espera') {
      this.sale(id)
      return
    }
    jugador.desconectado = { desde: Date.now() }
    jugador.enviar = () => {}
    this._caidos += 1
    // Su cola no se ejecuta: el servidor no adivina (vuelta 45). Se tira aquí
    // para que al volver no le caiga encima un segundo de entradas viejas.
    jugador.cola.length = 0
    this._soltarLoSuyo(id)
    // **El mundo se para para el que sigue**, y esta pausa no es de nadie: no
    // gasta libres, no la levanta un botón y tiene su propio tope, que es la
    // ventana de reconexión.
    if (this.rondas.fase === 'compra' || this.rondas.fase === 'ronda') {
      this.pausa = {
        por: null,
        motivo: 'caida',
        quien: jugador.equipo,
        expiraEn: Date.now() + ROUNDS.reconexionSegundos * 1000,
      }
    }
  }

  /**
   * **Se va, y lo ha dicho.** La butaca se libera entera: no hay a quién
   * esperar. Con rondas en marcha, el rival gana la ronda —y con ella la
   * partida, porque un duelo no se juega solo—.
   */
  abandona(id) {
    const jugador = this.jugadores.get(id)
    if (!jugador) return
    const rival = [...this.jugadores.values()].find((j) => j !== jugador)
    this.sale(id)
    if (rival && this.rondas.fase !== 'espera' && !this.rondas.ganador) {
      this._terminarRonda(rival.equipo, 'abandono')
      if (!this.rondas.ganador) this._terminarPartida(rival.equipo, 'abandono')
    }
  }

  sale(id) {
    if (this.jugadores.get(id)?.desconectado) this._caidos -= 1
    this.jugadores.delete(id)
    this._soltarLoSuyo(id)
    // **Sin butacas, la partida vuelve a empezar.** El número de paso se
    // conserva —eso es del mundo, y volver con el mismo código no es empezar
    // otra partida (vueltas 47 y 58)— pero el marcador no: si no, dos amigos que
    // vuelven a ese código se encontrarían una partida acabada y sin forma de
    // jugar otra.
    if (this.jugadores.size === 0) this._reiniciarRondas()
    // Y si la pausa era por la caída de éste, ya no hay a quién esperar.
    if (this.pausa?.motivo === 'caida' && this.conectados.length === this.jugadores.size) {
      this.pausa = null
    }
  }

  /** Lo que deja de tener sentido en cuanto alguien deja de estar. */
  _soltarLoSuyo(id) {
    // **Irse levanta lo que uno tuviera puesto.** Una pausa de alguien que ya no
    // está deja el mundo parado para siempre.
    if (this.pausa?.por === id) this.pausa = null
    // Y una votación se queda sin quien la pidió, o sin quien tenía que
    // contestarla. Lo primero la cancela —ya no hay a quién pausarle nada—; lo
    // segundo la resuelve con los que quedan, que es lo mismo que hace el
    // final de la ventana.
    if (this.votacion?.por === id) this.votacion = null
    else if (this.votacion) {
      this.votacion.votos.delete(id)
      this._resolverVotacion(false)
    }
  }

  /** Un mensaje de un jugador. El huésped no lo mira: lo pasa tal cual. */
  recibe(id, datos) {
    const jugador = this.jugadores.get(id)
    if (!jugador) return
    jugador.bytesEntrada += datos.length
    let mensaje
    try {
      mensaje = JSON.parse(datos)
    } catch {
      return
    }
    if (mensaje.t === MSG.COLOCAR && this.depurar) {
      jugador.movimiento.reset()
      jugador.pose.position.x = mensaje.x
      jugador.pose.position.z = mensaje.z
      jugador.vida = 100
      jugador.vivoEn = 0
      jugador.historial.fill(null)
      return
    }
    if (mensaje.t === MSG.PAUSA) {
      this._pausa(jugador, mensaje.q)
      return
    }
    if (mensaje.t === MSG.COMPRAR) {
      this._comprar(jugador, mensaje.q, mensaje.a)
      return
    }
    if (mensaje.t !== MSG.ENTRADA) return
    // Una entrada de un paso que ya se ejecutó llega tarde y no sirve: volver
    // atrás sería rehacer el mundo entero, y el cliente ya no la espera.
    if (mensaje.n <= jugador.ack) {
      jugador.tardias += 1
      return
    }
    jugador.cola.push(mensaje)
  }

  /**
   * **Lo que se puede decir sobre la pausa**, y quién puede decirlo.
   *
   * Cuatro verbos y ninguna decisión del lado del cliente: `pedir` gasta una
   * libre, `votar` abre una votación, `si`/`no` la contestan y `reanudar`
   * levanta la propia.
   *
   * **Pedir y votar son verbos distintos a propósito** (vuelta 55). Hasta la 54
   * había uno solo y el servidor decidía cuál de las dos cosas era mirando las
   * libres que quedaran; con eso, un cliente con una cuenta de libres vieja —la
   * suya llega en la foto, o sea con un viaje de retraso— podía abrirle al rival
   * un cartel de votación que su jugador no había pedido. Un mensaje dice lo que
   * se quiere, no lo que se supone.
   */
  _pausa(jugador, que) {
    if (que === 'reanudar') {
      // **Sólo levanta la pausa quien la puso.** Si la levantase el otro, pedir
      // una pausa no serviría de nada.
      if (this.pausa?.por === jugador.id) this.pausa = null
      return
    }
    if (que === 'si' || que === 'no') {
      this._votar(jugador, que === 'si')
      return
    }
    // Ni una pausa puesta ni una votación en curso admiten otra encima: dos
    // cuentas atrás a la vez no se sabrían leer, ni en pantalla ni aquí.
    if (this.pausa || this.votacion) return
    if (que === 'pedir') {
      // **`pedir` es sólo para las libres.** Sin ninguna no hace nada: lo que
      // toca entonces es `votar`, y eso lo pide el jugador, no lo deduce esto.
      if (jugador.pausasLibres === 0) return
      jugador.pausasLibres -= 1
      this.pausa = this._conCuenta(jugador.id, PAUSE.freeMaxSeconds)
      return
    }
    if (que !== 'votar') return
    this.votacion = {
      por: jugador.id,
      expiraEn: Date.now() + PAUSE.voteWindowSeconds * 1000,
      votos: new Map(),
    }
    // Con la sala a medias no hay a quién preguntarle: se resuelve en el acto y
    // sale lo que diga el recuento, que con un solo jugador es su propio sí.
    this._resolverVotacion(false)
  }

  /** Una pausa concedida, con su tope en reloj de pared. */
  _conCuenta(por, segundos) {
    return { por, expiraEn: Date.now() + segundos * 1000 }
  }

  /**
   * Un voto. **No se cambia**: el primero que se dice es el que cuenta, o el
   * cartel se convertiría en un sitio donde se negocia mientras corre el reloj.
   */
  _votar(jugador, si) {
    const v = this.votacion
    if (!v || v.por === jugador.id || v.votos.has(jugador.id)) return
    v.votos.set(jugador.id, si)
    this._resolverVotacion(false)
  }

  /**
   * **El recuento, y qué pasa con quien no contesta** (vuelta 55).
   *
   * Quien la pide vota que sí sin decir nada: pedirla es quererla. Y quien deja
   * pasar la ventana **se suma a la opción que más apoyo tenga en ese momento**,
   * que es la regla que el encargo pide para que generalice el día que haya más
   * de un rival: con cuatro personas, tres a favor y una callada, esa callada no
   * puede valer lo mismo que un «no» explícito.
   *
   * Dos consecuencias que conviene tener a la vista:
   *
   * - **En 1v1 el silencio aprueba.** El único voto que hay antes de que la
   *   ventana acabe es el sí implícito de quien la pidió, así que el que va
   *   ganando es el sí. Es lo contrario de la vuelta 53 —donde el silencio era
   *   una negativa— y el motivo de aquello ya no existe: entonces el que la
   *   pedía se quedaba tirado esperando, y ahora está jugando.
   * - **Un empate no aprueba.** «La opción que más apoyo tenga» no existe
   *   cuando hay tantos a un lado como al otro, y una pausa que le para el
   *   mundo a media sala no sale de un empate.
   *
   * @param {boolean} porTiempo si lo llama el final de la ventana
   */
  _resolverVotacion(porTiempo) {
    const v = this.votacion
    if (!v) return
    let aFavor = 1
    let enContra = 0
    for (const si of v.votos.values()) si ? (aFavor += 1) : (enContra += 1)
    // Los caídos no votan: contarlos dejaría la ventana esperando a nadie.
    const faltan = Math.max(0, this.conectados.length - 1 - v.votos.size)
    if (faltan > 0 && !porTiempo) return
    if (aFavor > enContra) aFavor += faltan
    else enContra += faltan
    this.votacion = null
    // **Y si sale, es la pausa votada de la 54, sin tocar nada**: su tope, su
    // cuenta atrás y su dueño son los mismos.
    if (aFavor > enContra) this.pausa = this._conCuenta(v.por, PAUSE.votedMaxSeconds)
  }

  /**
   * **Se acabó el tiempo de una pausa.** Una normal se levanta y ya. Una de
   * caída significa que el que se fue no ha vuelto: **eso es un abandono**, con
   * la misma consecuencia que decirlo, porque esperar más sería dejar al que
   * está delante de la pantalla mirando un mundo parado sin final.
   */
  _caducarPausa() {
    const caida = this.pausa?.motivo === 'caida'
    this.pausa = null
    if (!caida) return
    for (const jugador of [...this.jugadores.values()]) {
      if (jugador.desconectado) this.abandona(jugador.id)
    }
  }

  /**
   * **El que espera no queda secuestrado** (vuelta 62). Pasados
   * `ROUNDS.abandonoDesdeSegundos` de la caída, el que sigue conectado puede dar
   * la partida por abandonada sin esperar los noventa. Es la otra mitad de la
   * regla de la vuelta 55: el mundo parado de uno no puede ser un efecto
   * secundario de lo que le pase a otro.
   */
  reclama(id) {
    if (this.pausa?.motivo !== 'caida') return false
    const quien = this.jugadores.get(id)
    if (!quien || quien.desconectado) return false
    const esperado = ROUNDS.reconexionSegundos - ROUNDS.abandonoDesdeSegundos
    if (this.pausa.expiraEn - Date.now() > esperado * 1000) return false
    this._caducarPausa()
    return true
  }

  /** Un paso del mundo. Lo llama el huésped a 60 Hz. */
  tick() {
    // **Toda pausa tiene su final** (vuelta 54): se reanuda sola al agotar su
    // tope, porque sin tope el único límite de un mundo parado era que el otro
    // se dignara a volver. Y va **antes** del corte de abajo, para que el paso
    // en que caduca sea ya un paso normal en vez de uno más de pausa.
    if (this.pausa && Date.now() >= this.pausa.expiraEn) this._caducarPausa()
    // Y las butacas reservadas fuera de una ronda —en la espera o con la partida
    // ya acabada—, que no tienen pausa que las caduque.
    if (this._caidos > 0) this._caducarButacas()
    // Y toda votación también (vuelta 55). Va fuera del corte a propósito: el
    // mundo no se para por una votación, así que su ventana corre en los pasos
    // normales — y aun así se comprueba aquí arriba, porque una pausa recién
    // caducada no puede dejar una votación esperando un paso más.
    if (this.votacion && Date.now() >= this.votacion.expiraEn) this._resolverVotacion(true)
    // **Con el mundo en pausa la foto sigue saliendo, pero nada avanza.** La
    // foto es cómo se enteran los dos de que hay pausa, así que callarse sería
    // dejarles sin la única señal; y el paso no sube porque el reloj del mundo
    // es él (misma regla que `engine.gameTime`).
    if (this.pausa) {
      this._enviarFoto()
      return
    }
    this.paso += 1
    for (const jugador of this.jugadores.values()) {
      if (!jugador.cebado) {
        if (jugador.cola.length < this.colchon) continue
        jugador.cebado = true
      }
      if (jugador.cola.length === 0) {
        jugador.hambre += 1
        continue
      }
      // **Una entrada por paso**, que es el ritmo al que las produce el cliente.
      // Sólo se consume más si la cola ha crecido por encima del colchón —un
      // cliente que se congeló y vuelve, o paquetes que llegan a pares—, y con
      // tope, para que ponerse al día no sea una avalancha de simulación.
      const exceso = jugador.cola.length - this.colchon
      const cuantas = Math.min(1 + Math.max(0, exceso), NET.maxCatchUpTicks)
      for (let i = 0; i < cuantas; i++) this._ejecutar(jugador, jugador.cola.shift())
    }

    /**
     * **Y los proyectiles, con los jugadores ya movidos.** Va aquí y no antes
     * porque contra lo que choca un proyectil es contra dónde está el rival
     * **al final de este paso**: resolverlo antes sería juzgarlo contra el paso
     * anterior, que es un rebobinado de uno que nadie ha pedido.
     */
    this._pasoDeProyectiles()

    // **Y dónde ha quedado cada uno.** Se anota siempre, incluso para quien no
    // avanzó por falta de entrada: no moverse también es una posición, y el
    // rebobinado tiene que encontrar algo en cada paso del anillo.
    for (const jugador of this.jugadores.values()) {
      // La reaparición ya **no** vive aquí: ocurre al ejecutar la primera
      // entrada del jugador que caiga en `vivoEn` o más allá (ver `_ejecutar`).
      // Contarla por pasos del servidor la ponía en un reloj que el cliente no
      // tiene, y entonces no podía predecirla.
      this._anotarCuerpo(jugador, this.paso)
    }

    // **Y el reloj de las rondas, al final del paso**: con el mundo ya movido y
    // los veredictos de este paso anotados. Cerrar una ronda a mitad de un
    // disparo sería dejar el tiro que la cierra sin contestar.
    this._rondasTick()

    if (this.paso % NET.snapshotEvery !== 0) return
    this._enviarFoto()
  }

  _enviarFoto() {
    /**
     * **Cuántas butacas están ocupadas** (vuelta 67). Un número, y hace falta
     * porque durante la fase de compra la foto sale **por destinatario** y no
     * lleva al rival (vuelta 62): desde el cliente, «¿ha entrado ya alguien?» no
     * se puede contestar mirando si hay pose. El panel decía «esperando» los
     * quince segundos enteros con el rival dentro, y lo que de verdad dependía
     * de ello —si las opciones de la partida siguen siendo tuyas— se quedaba
     * abierto cuando ya no debía.
     *
     * Cuenta **butacas**, no cables: quien se está cayendo sigue ocupando la
     * suya, y su sitio no está libre para nadie.
     */
    const foto = { t: MSG.FOTO, n: this.paso, p: {}, ocupadas: this.jugadores.size }
    // Sólo cuando hay algo que contar: en una partida normal esto no ocupa nada.
    // `resta` son los milisegundos que le quedan a la pausa —o a la votación—,
    // y se calculan **aquí**: el cliente no tiene el reloj del servidor, y una
    // cuenta atrás que cada pantalla calculase por su cuenta acabaría diciendo
    // dos cosas distintas del mismo cartel.
    if (this.pausa) {
      foto.pa = {
        por: this.pausa.por,
        resta: Math.max(0, this.pausa.expiraEn - Date.now()),
        // Y por qué: una pausa por caída no tiene dueño, así que el cartel del
        // que espera no puede ser el mismo que el de una pausa pedida.
        ...(this.pausa.motivo ? { motivo: this.pausa.motivo, quien: this.pausa.quien } : null),
      }
    }
    if (this.votacion) {
      foto.vo = { por: this.votacion.por, resta: Math.max(0, this.votacion.expiraEn - Date.now()) }
    }
    for (const jugador of this.jugadores.values()) {
      foto.p[jugador.id] = {
        ack: jugador.ack,
        hambre: jugador.hambre,
        vida: jugador.vida,
        // Escudo y casco viajan con la vida porque son lo mismo: cuánto aguantas
        // (vuelta 64). El **dinero** no, que ése es privado y va por su mensaje.
        esc: jugador.escudo,
        cas: jugador.casco ? 1 : 0,
        vivoEn: jugador.vivoEn,
        // **Lo que le queda de gracia, en ms**, y sólo mientras la tenga: el
        // HUD ya sabe dibujar ese marco desde el entrenamiento y lo único que
        // le faltaba era el número. Va calculado por el servidor, como el reloj
        // de la ronda y por la misma razón (vuelta 54): los relojes de las dos
        // pantallas y el suyo no coinciden.
        ...(jugador.invulnerableHasta > this.paso
          ? { inv: (jugador.invulnerableHasta - this.paso) * SIM_STEP_MS }
          : null),
        libres: jugador.pausasLibres,
        // Quién ha votado ya, para que su cartel se retire. Va por jugador y no
        // como lista en `vo` porque a cada cliente sólo le importa el suyo.
        ...(this.votacion?.votos.has(jugador.id) ? { vv: 1 } : null),
        // Y el arma que lleva, para la ficha flotante del rival. Sólo cuando se
        // sabe —o sea, desde su primer disparo—: antes no hay nada que decir.
        ...(jugador.arma ? { arma: jugador.arma } : null),
        bajas: jugador.bajas,
        muertes: jugador.muertes,
        yaw: jugador.pose.rotation.y,
        s: jugador.movimiento.snapshot(jugador.estado),
      }
      // Los veredictos de disparo se repiten unas cuantas fotos: si se mandaran
      // una sola vez, perder esa foto perdería el veredicto para siempre. El
      // cliente los descarta por número, así que repetirlos no cuesta nada.
      if (jugador.disparos.length > 0) {
        foto.p[jugador.id].disparos = jugador.disparos.map((d) => d.dato)
        for (const d of jugador.disparos) d.ttl -= 1
        jugador.disparos = jugador.disparos.filter((d) => d.ttl > 0)
      }
    }
    // **Las rondas, que son del mundo y las ven los dos igual.** Lo que viaja es
    // *cuánto queda* de la fase —calculado aquí, sobre el reloj de pasos— y no
    // hasta cuándo: el cliente no tiene ese reloj. Misma regla que la cuenta de
    // la pausa (vuelta 54).
    const r = this.rondas
    foto.rd = {
      n: r.n,
      f: r.fase,
      resta: r.hastaPaso ? Math.max(0, (r.hastaPaso - this.paso) * SIM_STEP_MS) : 0,
      m: r.marcador,
      ...(r.ganador !== null ? { g: r.ganador, mot: r.motivo } : null),
      ...(r.ultima ? { u: r.ultima } : null),
      ...(r.prorroga ? { pr: 1 } : null),
    }

    // **En la fase de compra nadie ve al otro, y eso lo garantiza el servidor**
    // (vuelta 62). No es que el cliente no lo dibuje: es que **no le llega** su
    // posición. Cuesta una foto por destinatario durante quince segundos de cada
    // ronda, y a cambio «no pueden verse» deja de depender de que el cliente
    // colabore, que es el único sitio donde esa promesa se puede romper.
    if (r.fase === 'compra') {
      for (const jugador of this.conectados) {
        const suya = { ...foto, p: { [jugador.id]: foto.p[jugador.id] } }
        const texto = JSON.stringify(suya)
        jugador.enviar(texto)
        jugador.bytesSalida += texto.length
      }
      return
    }

    const texto = JSON.stringify(foto)
    for (const jugador of this.jugadores.values()) {
      jugador.enviar(texto)
      jugador.bytesSalida += texto.length
    }
  }

  /** Lo que se mira mientras se juega. El huésped decide si lo imprime. */
  informe() {
    return [...this.jugadores.values()].map((j) => {
      const fila =
        `${j.id} ack ${j.ack} cola ${j.cola.length} hambre ${j.hambre} tardías ${j.tardias} ` +
        `vida ${j.vida} arma ${j.arma ?? '—'} rápidos ${j.rapidos} ` +
        `↑${(j.bytesEntrada / 1024).toFixed(2)} ↓${(j.bytesSalida / 1024).toFixed(2)} KB`
      j.bytesEntrada = 0
      j.bytesSalida = 0
      return fila
    })
  }

  // ------------------------------------------------------------------ dentro

  /** Guarda dónde estaba este jugador al acabar el paso `n`. */
  _anotarCuerpo(jugador, n) {
    const p = jugador.pose.position
    const cuerpo = cuerpoDeJugador(p.x, p.z, jugador.movimiento.feetY, jugador.movimiento.eyeHeight)
    cuerpo.n = n
    // **Y hacia dónde miraba** (vuelta 71). Es lo único del cuerpo que no dice
    // dónde está sino cómo estaba puesto, y hace falta para una sola cosa: la
    // puñalada por la espalda se juzga contra el rumbo **rebobinado** de la
    // víctima, que es hacia dónde miraba cuando le dieron y no hacia dónde mira
    // ahora. Sin esto, girarse a tiempo salvaría de un golpe que ya había
    // ocurrido.
    cuerpo.yaw = jugador.pose.rotation.y
    jugador.historial[n % NET.historyTicks] = cuerpo
  }

  /**
   * **El cuerpo de un jugador en un instante del pasado**, interpolado entre
   * los dos pasos que lo rodean. `objetivo` va en pasos fraccionarios.
   *
   * Devuelve null si ese instante se salió del anillo — un cliente con un
   * rebobinado mayor que el historial no puede compensarse, y eso es correcto:
   * el tope de `NET.maxRewindMs` está justo para que no pase.
   */
  _cuerpoRebobinado(jugador, objetivo) {
    const suelo = Math.floor(objetivo)
    const techo = Math.ceil(objetivo)
    const anillo = NET.historyTicks
    const a = jugador.historial[((suelo % anillo) + anillo) % anillo]
    const b = jugador.historial[((techo % anillo) + anillo) % anillo]
    // **Comprobar que la ranura es de esta vuelta del anillo.** Un índice
    // siempre devuelve algo; si el paso pedido se salió del historial, lo que
    // devuelve es una posición de hace un segundo, y eso no se distingue de un
    // rebobinado bueno mirando sólo el resultado. Mejor null y que el llamante
    // caiga al presente.
    if (!a || !b || a.n !== suelo || b.n !== techo) return null
    if (b.n < a.n) return a
    const tramo = b.n - a.n
    const alfa = tramo > 0 ? (objetivo - a.n) / tramo : 0
    if (!(alfa >= 0 && alfa <= 1)) return a
    const mezcla = (u, v) => u + (v - u) * alfa
    return {
      x: mezcla(a.x, b.x),
      z: mezcla(a.z, b.z),
      feetY: mezcla(a.feetY, b.feetY),
      radius: a.radius,
      legsTop: mezcla(a.legsTop, b.legsTop),
      torsoTop: mezcla(a.torsoTop, b.torsoTop),
      top: mezcla(a.top, b.top),
      // **Un rumbo no se interpola como un número**: entre 179° y −179° la
      // media recta da 0, o sea mirando justo al revés. Se interpola por el
      // camino corto, que es el único que el jugador ha recorrido de verdad.
      yaw: mezclaDeRumbo(a.yaw, b.yaw, alfa),
    }
  }

  /** Ejecuta una entrada. Es **la misma llamada** que hace el cliente. */
  _ejecutar(jugador, entrada) {
    const m = jugador.movimiento
    if (jugador.vivoEn > 0) {
      if (entrada.n < jugador.vivoEn) {
        // **Un muerto no se mueve.** La entrada se consume igual —el `ack`
        // avanza, o el cliente creería que se han perdido— pero no toca el
        // mundo. Hasta la vuelta 52 esto no existía y un abatido seguía paseando
        // durante los dos segundos de la reaparición, a la vista del rival.
        jugador.ack = entrada.n
        return
      }
      // Y la primera entrada que llega ya con derecho a vivir es la que
      // reaparece. Es una entrada concreta, con su número, así que el cliente
      // puede hacer exactamente lo mismo y no hay corrección que pagar.
      this._reaparecer(jugador)
    }
    desempaquetarTeclas(entrada.k, m.keys)
    // **El arma viaja con cada entrada y su peso entra en la simulación**
    // (vuelta 56). Es del movimiento, no del disparo: un rifle frena, y si sólo
    // lo supiera el cliente predeciría a una velocidad y el servidor simularía
    // a otra — medido antes de esto, 75 correcciones en 286 fotos y 2.5 u de
    // error. De aquí salen además la cadencia que se le exige y el arma que el
    // rival ve en su ficha.
    const arma = WEAPONS[WEAPON_ORDER[entrada.w]]
    if (arma) {
      jugador.arma = WEAPON_ORDER[entrada.w]
      m.setWeaponWeight(arma.weight)
    }
    jugador.pose.rotation.y = entrada.yaw
    if (entrada.jt >= 0) m.pressJump(instanteEnPaso(entrada.n, entrada.jt))
    m.update(SIM_STEP_MS / 1000, instanteDePaso(entrada.n))
    jugador.ack = entrada.n
    if (entrada.d) this._resolverTiro(jugador, entrada)
  }

/**
   * **Un arma de proyectil no se resuelve: se lanza** (vuelta 85).
   *
   * Y con eso se cae **la compensación de retraso**, a propósito y no por
   * olvido. Rebobinar al instante que el tirador tenía en pantalla (vuelta 46)
   * es lo correcto para una bala, que llega en el mismo paso en que sale: lo
   * que se corrige es el viaje del **mensaje**. Una flecha tarda medio segundo
   * en llegar, y ese medio segundo es del **mundo**, no de la red — esquivarla
   * es exactamente lo que el arma ofrece a quien la ve venir. Rebobinar aquí
   * sería matar a alguien por donde estaba cuando el otro soltó la cuerda.
   *
   * Lo que **sí** se conserva es todo lo de alrededor: la cadencia se valida
   * igual, el veredicto sale igual por su `seq` —el cliente espera uno y
   * dejarle sin él sería dejarle esperando— y la fase manda igual. Es la misma
   * idea que el cuchillo de la vuelta 71: una mecánica nueva no es un protocolo
   * nuevo.
   */
  _lanzarProyectil(tirador, entrada, arma, salida) {
    const d = entrada.d
    const p = tirador.pose.position
    _ojos.x = p.x; _ojos.y = p.y; _ojos.z = p.z
    const carga = Number.isFinite(d.c) ? Math.max(0, Math.min(1, d.c)) : 0
    const l = lanzamientoDeArma(arma, carga, _ojos, d.yaw, d.pitch, _lanzamiento)
    if (!l) return
    this.proyectiles.lanzar({
      tipo: l.tipo,
      dueno: tirador.id,
      x: l.x, y: l.y, z: l.z,
      vx: l.vx, vy: l.vy, vz: l.vz,
      g: l.g,
      fuerza: l.fuerza,
      intensidad: l.intensidad,
    })
    /**
     * **Y el lanzamiento se le cuenta al otro, no a los dos.** Quien lo tiró ya
     * lo tiene volando desde el instante del clic porque lo predijo, igual que
     * su propio movimiento: mandárselo sería pintarle una segunda flecha un
     * viaje más tarde.
     */
    for (const otro of this.jugadores.values()) {
      if (otro === tirador) continue
      otro.enviar(JSON.stringify({
        t: MSG.PROYECTIL,
        n: this.paso,
        k: l.tipo,
        x: +l.x.toFixed(3), y: +l.y.toFixed(3), z: +l.z.toFixed(3),
        vx: +l.vx.toFixed(3), vy: +l.vy.toFixed(3), vz: +l.vz.toFixed(3),
        g: l.g,
        i: +l.intensidad.toFixed(2),
      }))
    }
  }

  /**
   * **Un paso de los proyectiles que hay volando**, y es **del mundo y no de
   * nadie**: un cohete sobrevive a quien lo lanzó, que es la mitad de lo que lo
   * hace interesante. Por eso el pool cuelga de la partida y no del jugador, y
   * por eso una baja no lo apaga.
   */
  _pasoDeProyectiles() {
    if (this.proyectiles.vivos === 0) return
    const cuantos = this.proyectiles.paso(
      SIM_STEP_MS / 1000, this._cortarSegmento, this._proyectilContraJugadores,
    )
    for (let i = 0; i < cuantos; i++) {
      const im = this.proyectiles.impactos[i]
      const tirador = this.jugadores.get(im.dueno) ?? null
      /**
       * **Lo que explota reparte por área y sólo por área** (vuelta 86). Dar de
       * pleno no es un caso aparte que se sume: un cuerpo tocado por el cohete
       * está a distancia cero del centro de la explosión, así que **se lleva el
       * núcleo entero**, que es lo que hace que el impacto directo mate. Sumarle
       * además el daño directo sería contar dos veces lo mismo, y encima haría
       * que el número que mata dependiera de si la onda pilló al cuerpo por
       * delante o por detrás.
       */
      const explosion = explosionDeProyectil(im.tipo)
      if (explosion) {
        this._explotar(im, explosion, tirador)
        continue
      }
      if (!im.victima) continue
      /**
       * **El daño sale de la fuerza con la que salió, no del arma de ahora.**
       * Una flecha a medio cargar vale 45 y una llena 110, y entre que sale y
       * llega el tirador puede haber cambiado de arma. Lo que hirió es lo que
       * voló.
       */
      const dano = zoneDamage(im.zona, null, im.fuerza)
      this._aplicarDano(im.victima, dano, tirador, im.zona, false)
    }
  }

  /**
   * **Lo que revienta alrededor**, con la misma caída que usará una granada
   * (`caidaDeArea`, vuelta 85). Una sola fórmula: tres copias de «más cerca,
   * más fuerte» son tres formas distintas de repartir el mismo daño.
   *
   * **El dueño no está exento** —es la mitad del nombre en clave del U2— pero
   * se le rebaja (`explosion.propio`): un arma que se suicida al primer
   * despiste es un arma que nadie saca.
   *
   * Y lo que hace con una baja es **reponer un cohete** a quien lo tiró, con
   * tope: cada cohete que mata vale uno, así que llegar al máximo pide dos
   * cohetes con baja y no uno que mate a dos.
   */
  _explotar(im, explosion, tirador) {
    let mato = false
    for (const jugador of this.jugadores.values()) {
      if (!jugador.vida) continue
      const p = jugador.pose.position
      // Contra el **centro del cuerpo** y no contra los ojos: una onda no
      // elige altura, y medir a la cabeza haría que agacharse salvara de una
      // explosión, que es lo contrario de lo que hace agacharse.
      const cy = jugador.movimiento.feetY + jugador.movimiento.eyeHeight * 0.5
      const d = Math.hypot(p.x - im.x, cy - im.y, p.z - im.z)
      const k = caidaDeArea(d, explosion.radioU, explosion.nucleoU)
      if (k <= 0) continue
      const suyo = jugador === tirador ? explosion.propio : 1
      /**
       * **La onda entra por el torso**, que es la zona que no lleva ni la regla
       * del casco ni la del blanco entero: una esfera no elige dónde te pilla,
       * y fingir que sí sería una precisión que el modelo no tiene.
       */
      const baja = this._aplicarDano(jugador, explosion.dano * k * suyo, tirador, 'torso', false)
      if (baja && jugador !== tirador) mato = true
    }
    if (mato && tirador) this._reponerProyectil(tirador, im.tipo)
  }

  /**
   * **Un cohete que mata repone uno**, con tope. Es la regla entera: hacen
   * falta dos cohetes con baja para llegar al máximo, porque cada uno vale uno
   * — matar a dos de un solo cohete sigue valiendo uno.
   */
  _reponerProyectil(jugador, tipo) {
    const clave = claveDeProyectil(tipo)
    const r = clave ? WEAPONS[clave]?.tiro?.reserva : null
    if (!r) return
    const inv = jugador.inventario
    if (!inv) return
    const tiene = inv.reserva?.[clave] ?? 0
    if (tiene >= r.maxima) return
    if (!inv.reserva) inv.reserva = {}
    inv.reserva[clave] = Math.min(r.maxima, tiene + r.porBaja)
    this._enviarEconomia(jugador)
  }

  /**
   * **A quién le da un proyectil.** Contra el cuerpo de **ahora**, no contra
   * uno rebobinado: ver `_lanzarProyectil`.
   */
  _proyectilContraJugadores = (p) => {
    let mejor = null
    for (const jugador of this.jugadores.values()) {
      // Nadie se mata con lo que acaba de tirar **mientras está saliendo**. Con
      // un cohete esto dejará de valer —su explosión sí alcanza a quien la
      // tiró— pero el proyectil en sí no se clava en su propio dueño.
      if (jugador.id === p.dueno) continue
      if (!jugador.vida) continue
      const q = jugador.pose.position
      const cuerpo = cuerpoDeJugador(q.x, q.z, jugador.movimiento.feetY, jugador.movimiento.eyeHeight)
      _origen.x = p.x0; _origen.y = p.y0; _origen.z = p.z0
      _dirP.x = p.dx; _dirP.y = p.dy; _dirP.z = p.dz
      const golpe = hitPlayer(_origen, _dirP, cuerpo, p.largo + PROJECTILES.radio)
      if (!golpe) continue
      if (!mejor || golpe.distance < mejor.t) {
        _golpeP.t = golpe.distance
        _golpeP.victima = jugador
        _golpeP.zona = golpe.zone
        mejor = _golpeP
      }
    }
    return mejor
  }

  /** Contra qué choca un proyectil: la geometría del mapa de esta sala. */
  _cortarSegmento = (x0, y0, z0, x1, y1, z1) =>
    this.escenario ? this.escenario.cortarSegmento(x0, y0, z0, x1, y1, z1) : null

  /**
   * **El disparo, juzgado contra lo que el tirador tenía en pantalla.**
   *
   * El instante a rebobinar **no se estima: lo dice el disparo**. El cliente
   * dibuja al rival interpolando entre dos fotos, sabe exactamente en qué paso
   * del servidor lo tiene puesto, y manda ese número (`tv`). El servidor sólo
   * tiene que acotarlo. El porqué —y el doble conteo del RTT que tenía la
   * primera versión— está en `docs/decisions.md` §46.
   */
  _resolverTiro(tirador, entrada) {
    const d = entrada.d
    const rival = [...this.jugadores.values()].find((j) => j !== tirador)
    const salida = {
      seq: d.seq, impacto: false, zona: null, dano: 0, tapado: false, baja: false,
      sinRebobinar: false, retroceso: 0, lateral: 0, rebobinadoMs: 0,
      pedidoMs: 0, topado: false, rechazado: false,
    }
    // **La cadencia la valida el servidor; el arma la lleva el cliente**
    // (vuelta 56). Ver `NET.shotRateSlackTicks` para el reparto y para por qué
    // la holgura es un paso. Un disparo rechazado se contesta igual —el cliente
    // espera un veredicto por `seq` y dejarle sin él sería dejarle esperando—
    // pero no toca el mundo: ni rebobinado, ni daño, ni baja.
    if (!this._cadenciaValida(tirador, entrada)) {
      tirador.rapidos += 1
      salida.rechazado = true
      this._anotarVeredicto(tirador, salida)
      return
    }
    // **En la compra no se dispara.** Es una fase para elegir con qué salir, no
    // un sitio desde donde tirar a ciegas a un rival al que ni siquiera se le
    // manda la posición. Se contesta igual —el cliente espera un veredicto por
    // `seq`— pero como rechazado: ni daño ni baja.
    if (this.rondas.fase !== 'ronda' && this.rondas.fase !== 'espera') {
      salida.rechazado = true
      this._anotarVeredicto(tirador, salida)
      return
    }
    if (!tirador.vida) {
      this._anotarVeredicto(tirador, salida)
      return
    }
    /**
     * **Un arma de proyectil se desvía aquí** (vuelta 85), después de la
     * cadencia y de la fase y antes del rebobinado. Lo que lanza **no necesita
     * rival**: una flecha sale aunque no haya nadie delante y va a clavarse en
     * una pared, que es lo que la distingue de un rayo. Y el veredicto sale
     * igual —sin impacto, sin rechazo— porque el cliente espera uno por `seq`.
     */
    const armaDeTiro = WEAPONS[tirador.arma]?.tiro ? WEAPONS[tirador.arma] : null
    if (armaDeTiro) {
      this._lanzarProyectil(tirador, entrada, armaDeTiro, salida)
      this._anotarVeredicto(tirador, salida)
      return
    }
    if (!rival) {
      this._anotarVeredicto(tirador, salida)
      return
    }

    // El historial llega hasta `paso − 1`: este paso todavía no se ha anotado.
    const masViejo = this.paso - 1 - NET.maxRewindMs / SIM_STEP_MS
    const pedido = Number.isFinite(d.tv) ? d.tv : this.paso - 1
    const objetivo = Math.min(this.paso - 1, Math.max(masViejo, pedido))
    salida.rebobinadoMs = +((this.paso - 1 - objetivo) * SIM_STEP_MS).toFixed(1)
    // Lo que **pedía** el tirador, antes del tope. La diferencia entre los dos
    // números es lo que el tope le está negando, y es donde empieza a desacordar.
    salida.pedidoMs = +((this.paso - 1 - pedido) * SIM_STEP_MS).toFixed(1)
    salida.topado = salida.pedidoMs > salida.rebobinadoMs + 0.01

    const ahora = this._cuerpoRebobinado(rival, this.paso - 1)
    const cuerpo = this._cuerpoRebobinado(rival, objetivo) ?? ahora
    const p = tirador.pose.position
    const origen = { x: p.x, y: p.y, z: p.z }

    // **Y con qué arma**: desde la vuelta 70 el daño no sale sólo de la zona.
    // El arma es la que el servidor le reconoce al tirador, no la que diga el
    // cliente en el momento de dibujar — la misma que ya valida la cadencia.
    /**
     * **Un cuchillo se resuelve con su propia función** (vuelta 71), no con un
     * `if` dentro del disparo: el alcance es el del arma, el daño lo pone el
     * tipo de golpe y encima hay que decir si vino por la espalda. Lo que **no**
     * cambia es nada de lo de alrededor —la cadencia, el rebobinado, el tope y
     * el veredicto por `seq` son los mismos—, y eso es lo que hace que una
     * mecánica nueva no sea un protocolo nuevo.
     */
    const cuchillo = Boolean(WEAPONS[tirador.arma]?.melee)
    const tipo = tipoDeGolpe(d)
    const veredicto = cuchillo
      ? resolverCuchillada(origen, d.yaw, d.pitch, cuerpo, this.escenario.occluders, tirador.arma, tipo)
      : resolverDisparo(origen, d.yaw, d.pitch, cuerpo, this.escenario.occluders, tirador.arma)
    // **El control**: el mismo disparo sin rebobinar nada. No decide nada, se
    // manda para poder medir qué compra la compensación.
    const sin = cuchillo
      ? resolverCuchillada(origen, d.yaw, d.pitch, ahora, this.escenario.occluders, tirador.arma, tipo)
      : resolverDisparo(origen, d.yaw, d.pitch, ahora, this.escenario.occluders, tirador.arma)

    salida.impacto = veredicto.impacto
    salida.zona = veredicto.zona
    salida.dano = veredicto.dano
    salida.tapado = veredicto.tapado
    salida.sinRebobinar = sin.impacto
    // Lo que se había movido el rival desde el instante rebobinado: es, en
    // unidades, la asimetría que paga el que recibe. Y se manda además **la
    // componente lateral**, que es la que decide si el disparo entra: moverse
    // hacia el tirador no te saca de la línea de tiro.
    if (cuerpo && ahora) {
      const dx = ahora.x - cuerpo.x
      const dz = ahora.z - cuerpo.z
      salida.retroceso = +Math.hypot(dx, dz).toFixed(3)
      const dir = direccionDeMira(d.yaw, d.pitch)
      const plano = Math.hypot(dir.x, dir.z) || 1
      salida.lateral = +Math.abs((dx * -dir.z + dz * dir.x) / plano).toFixed(3)
    }

    // **Por la espalda no es más daño: es muerte**, y viaja en el veredicto
    // para que el tirador sepa al instante qué ha pasado — es la diferencia
    // entre un golpe y el golpe.
    salida.espalda = Boolean(veredicto.espalda)
    if (veredicto.impacto) {
      salida.baja = this._aplicarDano(
        rival, veredicto.dano, tirador, veredicto.zona,
        Boolean(veredicto.espalda) && tipo === 'fuerte',
      )
    }
    this._anotarVeredicto(tirador, salida)
  }

  /**
   * **¿Cabía este disparo?** (vuelta 56).
   *
   * Lo único que el servidor le exige a un arma es su ritmo. El cliente dice
   * cuál lleva (`d.w`) y de ahí salen las RPM; un arma que no existe en el
   * catálogo no dispara, que es la única forma de que declarar cualquier cosa
   * no sea gratis.
   *
   * Se mide en **número de paso**, no en la fracción del disparo: la fracción
   * es para el rebobinado, que necesita el instante exacto; la cadencia sólo
   * necesita un reloj monótono que compartan los dos extremos, y el paso lo es.
   * Y se acepta con una holgura de `NET.shotRateSlackTicks` pasos porque el
   * cliente programa sus disparos sobre esa misma rejilla: sin holgura, un arma
   * cuyo intervalo no sea múltiplo del paso se rechazaría uno de cada dos
   * disparos legítimos.
   *
   * **Sólo avanza el reloj si el disparo se acepta.** Si lo moviera también un
   * disparo rechazado, bastaría con pedir el doble de rápido para correr el
   * reloj hacia delante y colar el siguiente.
   */
  _cadenciaValida(tirador, entrada) {
    // El arma es la de **esta entrada**, la misma de la que ha salido el peso
    // con el que se acaba de mover: un disparo no puede declarar un arma y
    // andar con otra, porque es un solo campo.
    const arma = WEAPONS[WEAPON_ORDER[entrada.w]]
    if (!arma) return false
    const instante = instanteDePaso(entrada.n)
    /**
     * **Y un cuchillo tiene dos ritmos, uno por golpe** (vuelta 71): el flojo
     * se encadena y el fuerte no. Se le exige el del tipo que ha declarado, que
     * es el mismo campo con el que se resuelve el golpe — declarar «fuerte»
     * para pegar rápido sería pegar rápido con el daño del fuerte, así que la
     * cuenta tiene que salir del mismo sitio que el daño.
     */
    const golpe = arma.melee ? arma.melee[tipoDeGolpe(entrada.d)] ?? arma.melee.luz : null
    const rpm = golpe ? golpe.rpm : arma.rpm
    const intervalo = 60000 / rpm - NET.shotRateSlackTicks * SIM_STEP_MS
    if (instante < tirador.ultimoTiroEn + intervalo) return false
    tirador.ultimoTiroEn = instante
    return true
  }

  /** Un veredicto vive unas cuantas fotos, para que perder una no lo pierda. */
  _anotarVeredicto(jugador, dato) {
    jugador.disparos.push({ dato, ttl: NET.verdictRepeats })
  }

  /**
   * **Casco, escudo y vida, en ese orden** (vuelta 64). La escalera no se
   * escribe aquí: es `encajarImpacto`, la misma función que usa el jugador del
   * entrenamiento (`src/game/player.js`). Hasta esta vuelta el duelo sólo
   * restaba vida, y con la armería vendiendo chalecos eso habría sido una
   * tienda de humo — además de la diferencia entre modos que la convención de la
   * 63 llama fallo de producto.
   *
   * Devuelve si el disparo ha sido **baja**, que es lo que el tirador necesita
   * saber al instante.
   */
  _aplicarDano(victima, dano, tirador, zona = 'torso', mortal = false) {
    if (victima.vida <= 0) return false
    // **La gracia de salida se mira aquí y no en quien dispara** (vuelta 78):
    // es el único sitio por el que pasan las cuatro formas de hacer daño —bala,
    // cuchillada, cuchillada por la espalda y lo que venga—, así que una
    // comprobación arriba sería una comprobación que hay que acordarse de
    // repetir. El disparo se resuelve igual y **recibe su veredicto**: lo que
    // no hace es tocar el mundo.
    if (this.paso < victima.invulnerableHasta) return false
    const tras = encajarImpacto(
      { health: victima.vida, shield: victima.escudo, helmet: victima.casco },
      { zone: zona, damage: dano, weaponKey: tirador.arma, mortal },
    )
    victima.escudo = tras.shield
    victima.casco = tras.helmet
    victima.vida = tras.health
    if (victima.vida > 0) return false
    victima.muertes += 1
    tirador.bajas += 1
    // **Matar paga**, y se paga al instante: en un 1v1 la baja cierra la ronda,
    // así que sumarlo aquí o al repartir sería lo mismo — salvo el día que haya
    // más de dos, que es la razón de que vaya donde ocurre.
    if (this.conRondas) this._pagar(tirador, ECONOMY.premios.baja)
    // **Con rondas, una muerte no se reaparece: cierra la ronda** (vuelta 62).
    // El que vuelve a poner a los dos en pie es el reinicio de ronda, y hasta
    // entonces el muerto no se mueve — que es lo que ya hacía `vivoEn`, con un
    // número al que no se llega. Sin rondas en marcha sigue valiendo lo de
    // siempre: la reaparición en el reloj de las entradas de la víctima.
    victima.vivoEn =
      this.rondas.fase === 'ronda'
        ? Number.MAX_SAFE_INTEGER
        : victima.ack + Math.round(NET.respawnMs / SIM_STEP_MS)
    return true
  }

  _reaparecer(jugador) {
    // Su ranura de siempre: reaparecer no te cambia de sitio ni de color. Antes
    // salía de `indexOf` sobre el mapa, que cambia cuando alguien se va.
    const salida = this.salidas[jugador.equipo]
    jugador.movimiento.reset()
    jugador.pose.position.x = salida.x
    jugador.pose.position.z = salida.z
    // **Y mirando a donde mira su salida.** Dura un paso —la entrada siguiente
    // trae el rumbo del jugador y manda ella—, pero ese paso es el que decide
    // hacia dónde sale andando quien tenía W pulsada al reaparecer.
    jugador.pose.rotation.y = salida.yaw ?? 0
    jugador.vida = 100
    jugador.vivoEn = 0
    // La gracia es de **empezar la ronda**, no de reaparecer: sin rondas en
    // marcha, quien vuelve lo hace con las mismas reglas que tenía al caer.
    jugador.invulnerableHasta = 0
    jugador.hambre = 0
    // Reaparecer recarga, así que el reloj de cadencia vuelve a cero: arrastrar
    // el del último disparo de antes de morir castigaría el primer tiro nuevo.
    jugador.ultimoTiroEn = -Infinity
  }

  // ----------------------------------------------------------------- economía

  /** Suma con tope. El saldo no crece sin fin por no gastar. */
  _pagar(jugador, cuanto) {
    jugador.dinero = Math.min(ECONOMY.maximo, jugador.dinero + cuanto)
  }

  /** La entrada del catálogo, por su clave. */
  _delCatalogo(clave) {
    return catalogoDeTienda().find((i) => i.clave === clave) ?? null
  }

  /**
   * **Comprar.** Sólo durante la fase de compra, sólo lo que existe, sólo lo que
   * se puede pagar y —en la ronda 1— sólo lo que el techo deja.
   *
   * El techo de la ronda 1 **no es de dinero**: aunque sobre el saldo, un arma
   * principal no se compra esa ronda. Por eso se comprueba por `tipo` y no por
   * precio — bajar el precio de un rifle no puede abrir esa puerta por detrás.
   *
   * **El supresor no cuesta**: es el mismo interruptor de siempre, y aquí sólo
   * cambia de sitio (del ajuste del jugador al inventario de la partida, que es
   * quien manda en red). Conmuta, como el clic derecho.
   */
  _comprar(jugador, clave, arma = null) {
    if (!this.conRondas) return

    /**
     * **El supresor no es una compra, es un interruptor** (vuelta 64), y desde
     * la 73 **tampoco es un artículo**: salió del catálogo, porque un precio al
     * lado decía lo contrario que el juego —no cuesta nada, es del arma que ya
     * llevas y se conmuta en cualquier fase—.
     *
     * Así que se atiende **antes de mirar el catálogo** y no como un `tipo`
     * dentro de él. Viene por `MSG.COMPRAR` porque ése es el mensaje que el
     * cliente ya tenía para hablar del equipo, y darle uno propio habría sido
     * un verbo más en el protocolo para la misma conversación.
     */
    if (clave === 'supresor') {
      // El supresor de un arma **que se lleva**: la principal comprada o la
      // pistola, nunca la que no está en las manos de nadie.
      const cual = arma === 'pulse' ? 'pulse' : jugador.inventario.primaria
      if (!cual || !WEAPONS[cual]?.supportsSuppressor) return
      jugador.inventario.supresor[cual] = !jugador.inventario.supresor[cual]
      this._enviarEconomia(jugador)
      return
    }

    const item = this._delCatalogo(clave)
    if (!item || !item.disponible) return

    // **Y en un mapa sin economía se acaba aquí: no hay tienda que abrir.**
    // El corte va **después** del supresor a propósito: conmutarlo no es una
    // compra, es un interruptor del arma que ya llevas (vuelta 64), así que
    // sigue funcionando en cualquier fase y en cualquier mapa.
    if (this.dotacion) return
    // Lo demás sí es comprar, y **cuándo lo dice `compraAbierta`**, que es la
    // misma función que mira el panel del cliente (vuelta 65). Con fase, la
    // ventana es la fase; sin ella, la ronda entera — a cero se pidió una
    // partida rápida, no una partida sin tienda.
    if (!compraAbierta(this.rondas.fase, this.compraSegundos)) return
    if (this.rondas.n <= 1 && !ECONOMY.techoRonda1.includes(item.tipo)) return
    if (jugador.dinero < item.precio) return

    if (item.tipo === 'arma') {
      // La pistola va siempre puesta: comprarla no es nada.
      if (item.ranura !== 'primary') return
      // **Una principal cada vez.** Comprar otra sustituye a la que hubiera, y
      // lo pagado por la anterior no vuelve: es una decisión, no un carrito.
      jugador.inventario.primaria = item.clave
      /**
       * **Un arma con reserva se compra llena** (vuelta 86). El U2 llega con
       * dos cohetes, que es lo que se pidió: los otros dos se ganan matando. Va
       * aquí y no en el catálogo porque es del **arma**, no de su precio — el
       * día que haya otra con reserva, funciona sola.
       */
      const r = WEAPONS[item.clave]?.tiro?.reserva
      if (r) {
        if (!jugador.inventario.reserva) jugador.inventario.reserva = {}
        jugador.inventario.reserva[item.clave] = r.inicial
      }
    } else if (item.clave === 'chaleco') {
      const tope = ECONOMY.escudoPorChaleco
      if (jugador.escudo >= tope) return
      jugador.escudo = tope
    } else if (item.clave === 'casco') {
      if (jugador.casco) return
      jugador.casco = true
    } else {
      return
    }
    jugador.dinero -= item.precio
    this._enviarEconomia(jugador)
  }

  /**
   * **Lo que tiene y lo que puede**, a su dueño y a nadie más. Va como mensaje
   * suelto y no en la foto por dos motivos: cambia cada pocos minutos —no
   * sesenta veces por segundo— y el saldo del rival **no se enseña**, que en la
   * foto compartida viajaría a los dos.
   */
  _enviarEconomia(jugador) {
    if (!this.conRondas) return
    jugador.enviar(
      JSON.stringify({
        t: MSG.ECONOMIA,
        dinero: jugador.dinero,
        inv: {
          primaria: jugador.inventario.primaria,
          supresor: { ...jugador.inventario.supresor },
          escudo: jugador.escudo,
          casco: jugador.casco,
          /**
           * **La reserva de las armas que la tienen** (vuelta 86). Viaja en el
           * inventario y no en la foto por lo mismo que el dinero: cambia cada
           * pocos disparos, no sesenta veces por segundo, y es **de quien la
           * recibe** — cuántos cohetes le quedan al rival no se enseña.
           */
          reserva: { ...(jugador.inventario.reserva ?? {}) },
        },
        // El techo de la ronda 1, dicho por el servidor: el panel lo pinta, no
        // lo deduce. Si lo dedujera de su número de ronda —que llega en la foto,
        // o sea con un viaje de retraso— enseñaría comprable lo que no lo es.
        techo: this.rondas.n <= 1 ? ECONOMY.techoRonda1 : null,
        compra: this.compraSegundos,
      }),
    )
  }

  /**
   * **El reparto de dinero de la ronda que acaba de terminar.** Ganar da el
   * salto grande; perder, el suelo — y perder **seguidas** lo sube, porque sin
   * eso quien encadena tres rondas malas no vuelve nunca.
   *
   * Una ronda repetida (empate de vidas) no paga a nadie: no la ha ganado nadie.
   */
  _repartirDinero() {
    const ultima = this.rondas.ultima
    if (!ultima || ultima.ganador === null) return
    for (const jugador of this.jugadores.values()) {
      if (jugador.equipo === ultima.ganador) {
        jugador.rachaDerrotas = 0
        this._pagar(jugador, ECONOMY.premios.victoria)
        continue
      }
      const escalones = Math.min(ECONOMY.premios.rachaMax, jugador.rachaDerrotas)
      this._pagar(jugador, ECONOMY.premios.derrota + escalones * ECONOMY.premios.rachaDerrota)
      jugador.rachaDerrotas += 1
    }
  }

  /**
   * **Morir cuesta el equipo.** Quien cae empieza la ronda siguiente con la
   * pistola y sin chaleco; quien sobrevive conserva lo que lleve, con el escudo
   * por donde se quedó. Es lo que hace que el salto de economía del ganador
   * signifique algo: no es sólo dinero, es que el otro empieza desnudo.
   */
  _perderEquipo(jugador) {
    jugador.inventario.primaria = null
    jugador.escudo = 0
    jugador.casco = false
    /**
     * **Y la reserva se va con el arma** (vuelta 86). Lo que se gana matando no
     * se acumula entre vidas: es lo que se pidió, y sale gratis aquí porque
     * morir ya cuesta el equipo desde la vuelta 64 — el arma y sus cohetes son
     * lo mismo.
     */
    jugador.inventario.reserva = {}
  }

  /**
   * **Lo que reparte el mapa**, cuando en él no se compra (vuelta 72). Va por
   * el inventario de siempre, así que llega al cliente por `MSG.ECONOMIA` y de
   * ahí al motor: el arma se pone en la mano sola, que es exactamente lo que ya
   * hace una compra (vuelta 67). Una segunda forma de entregar un arma serían
   * dos maneras de acabar empuñándola.
   *
   * El cuchillo no está aquí porque no hace falta: se lleva siempre, como la
   * pistola, y eso lo sabe el motor sin preguntarle a nadie.
   */
  _dotar(jugador) {
    if (!this.dotacion) return
    jugador.inventario.primaria = this.dotacion.arma ?? null
    jugador.escudo = this.dotacion.chaleco ? ECONOMY.escudoPorChaleco : 0
    jugador.casco = Boolean(this.dotacion.casco)
  }

  // ------------------------------------------------------------------ rondas

  /**
   * **La partida empieza cuando hay dos, no cuando llega el primero.** Un duelo
   * con una silla vacía no es la ronda 1 corriendo sola: es la sala de espera.
   */
  _quizaArrancar() {
    if (!this.conRondas) return
    if (this.rondas.fase !== 'espera') return
    if (this.conectados.length < 2) return
    this._reiniciarRondas()
    this._empezarCompra()
  }

  /** El marcador a cero y la fase a la espera. No toca el reloj del mundo. */
  _reiniciarRondas() {
    const r = this.rondas
    r.n = 0
    r.fase = 'espera'
    r.hastaPaso = 0
    r.marcador = [0, 0]
    r.ganador = null
    r.motivo = null
    r.ultima = null
    r.prorroga = false
    r.prorrogaDesde = 0
  }

  /** Pasos que caben en unos segundos del mundo. */
  _pasosDe(segundos) {
    return Math.max(1, Math.round((segundos * 1000) / SIM_STEP_MS))
  }

  /**
   * **La fase de compra**: todos a su sitio, la caja puesta y quince segundos.
   *
   * Una ronda repetida —las dos vidas iguales al acabar el tiempo— **no gasta
   * número**: vuelve a ser la misma ronda, que es lo que quiere decir repetirla.
   */
  _empezarCompra() {
    if (this.rondas.ultima?.motivo !== 'empate') this.rondas.n += 1
    // **Primero se paga y se cuenta el equipo perdido**, y después se abre la
    // fase: el panel del cliente tiene que salir con el saldo de esta ronda, no
    // con el de la anterior.
    this._repartirDinero()
    for (const jugador of this.jugadores.values()) {
      if (jugador.vida <= 0) this._perderEquipo(jugador)
      // **Y si el mapa reparte, se reparte después de quitar** (vuelta 72): el
      // orden importa porque `_perderEquipo` deja al que cayó sin chaleco, y en
      // un mapa sin economía morir no puede costar el equipo — no hay forma de
      // recuperarlo.
      this._dotar(jugador)
      this._reaparecer(jugador)
      jugador.historial.fill(null)
      this._enviarEconomia(jugador)
    }

    // **A cero no hay fase de compra** (vuelta 64): las rondas se encadenan y
    // nadie se queda encerrado en su caja. No es un caso raro que haya que
    // esquivar, es una partida rápida — y por eso se decide aquí, donde está la
    // regla, y no en el reloj de fases.
    if (this.compraSegundos <= 0) {
      this._empezarRonda()
      return
    }
    this.rondas.fase = 'compra'
    this.rondas.hastaPaso = this.paso + this._pasosDe(this.compraSegundos)
    for (const jugador of this.jugadores.values()) {
      jugador.movimiento.setCorralito(this._cajaDe(jugador.equipo))
    }
  }

  /**
   * **El corralito de un jugador**, centrado en su salida. Las dos salidas están
   * a 5 u una de otra y la caja mide 4, así que **no se solapan**: dentro de la
   * fase de compra no hay forma de acabar encima del otro.
   */
  _cajaDe(equipo) {
    const salida = this.salidas[equipo] ?? this.salidas[0]
    // **Y la mide el mapa** (vuelta 78). Hasta aquí esto cogía `ROUNDS`
    // siempre, así que `duelo.cajaCompra` —que el formato sanea desde la 77—
    // no lo leía nadie: el editor escribía un número que el servidor ignoraba.
    const caja = this.escenario.cajaCompraDeDuelo
    const mx = caja.ancho / 2
    const mz = caja.fondo / 2
    return { minX: salida.x - mx, maxX: salida.x + mx, minZ: salida.z - mz, maxZ: salida.z + mz }
  }

  /** Se abre la caja y empieza a contar la ronda. */
  _empezarRonda() {
    /**
     * **Y una ronda nueva no hereda lo que había volando** (vuelta 85). Un
     * cohete lanzado en el último segundo de la anterior es del mundo anterior:
     * con los dos jugadores ya teletransportados a sus salidas, lo que haría es
     * reventar encima de alguien que acaba de aparecer. Es la misma razón por
     * la que un cambio de fase tira la cola de entradas sin confirmar (vuelta
     * 62).
     */
    this.proyectiles.apagarTodos()
    /**
     * **Y la reserva vuelve a lo de fábrica** (vuelta 86): lo que se gana
     * matando es de esa ronda, no del partido. Quien conserve el arma la
     * conserva llena; quien la haya perdido al morir no tiene nada que llenar.
     */
    for (const jugador of this.jugadores.values()) {
      const clave = jugador.inventario?.primaria
      const r = clave ? WEAPONS[clave]?.tiro?.reserva : null
      if (!r) continue
      if (!jugador.inventario.reserva) jugador.inventario.reserva = {}
      jugador.inventario.reserva[clave] = r.inicial
      this._enviarEconomia(jugador)
    }
    this.rondas.fase = 'ronda'
    this.rondas.hastaPaso = this.paso + this._pasosDe(ROUNDS.duracionSegundos)
    /**
     * **La gracia de salida, si el mapa la pide** (vuelta 78).
     *
     * Va **en número de paso**, como todo lo que dura varios pasos en esta
     * clase: `vivoEn`, el reloj de la ronda y el de la fase. Con un instante de
     * pared sería un tercer reloj que no comparte nadie, y en pausa seguiría
     * corriendo — que es el agujero que la vuelta 54 ya cerró dos veces.
     *
     * A 0 no hay gracia y no hay nada que escribir: los mapas de hoy siguen
     * empezando la ronda exactamente igual.
     */
    const gracia = this.escenario.invulnerabilidadDeDuelo
    const hasta = gracia > 0 ? this.paso + this._pasosDe(gracia / 1000) : 0
    for (const jugador of this.jugadores.values()) {
      jugador.movimiento.setCorralito(null)
      jugador.invulnerableHasta = hasta
    }
  }

  /**
   * **Se acabó el tiempo sin muerte: gana quien tenga más vida.** Y con las dos
   * vidas exactamente iguales la ronda **no cuenta para nadie y se repite**, que
   * es distinto de un empate a medias: nadie ha hecho más que el otro.
   */
  _rondaPorTiempo() {
    const vivos = [...this.jugadores.values()]
    const a = vivos.find((j) => j.equipo === 0)
    const b = vivos.find((j) => j.equipo === 1)
    if (!a || !b) return { ganador: a?.equipo ?? b?.equipo ?? null, motivo: 'vida' }
    if (a.vida === b.vida) return { ganador: null, motivo: 'empate' }
    return { ganador: a.vida > b.vida ? 0 : 1, motivo: 'vida' }
  }

  /**
   * Cierra la ronda en curso. `ganador` es una ranura, o null si la ronda se
   * repite. De aquí sale siempre o una partida terminada o una fase de compra.
   */
  _terminarRonda(ganador, motivo) {
    if (this.rondas.fase !== 'ronda' && this.rondas.fase !== 'compra') return
    this.rondas.ultima = { ganador, motivo, n: this.rondas.n }
    if (ganador !== null) this.rondas.marcador[ganador] += 1
    this._comprobarFinDePartida()
    // Y no se abre una compra para uno solo: si el otro se ha ido, lo que viene
    // detrás es el final de la partida, no la ronda siguiente.
    if (this.rondas.ganador === null && this.jugadores.size >= 2) this._empezarCompra()
  }

  /**
   * **La otra condición de victoria, que no es la de la ronda.**
   *
   * Antes de la prórroga basta la mayoría —ocho de catorce—. Al llegar a
   * catorce empatados se entra en prórroga, y allí **no vale la mayoría**: se
   * juega por tandas y gana quien vaya por delante al acabar una. Con muerte
   * súbita, las trece rondas anteriores valdrían lo mismo que la catorceava.
   */
  _comprobarFinDePartida() {
    const [a, b] = this.rondas.marcador
    const jugadas = a + b
    if (!this.rondas.prorroga) {
      const objetivo = Math.floor(ROUNDS.maxRondas / 2) + 1
      if (a >= objetivo) return this._terminarPartida(0, 'mayoria')
      if (b >= objetivo) return this._terminarPartida(1, 'mayoria')
      if (jugadas >= ROUNDS.maxRondas) {
        this.rondas.prorroga = true
        this.rondas.prorrogaDesde = jugadas
      }
      return
    }
    const deTanda = jugadas - this.rondas.prorrogaDesde
    if (deTanda > 0 && deTanda % ROUNDS.prorrogaTanda === 0 && a !== b) {
      this._terminarPartida(a > b ? 0 : 1, 'prorroga')
    }
  }

  _terminarPartida(ganador, motivo) {
    this.rondas.ganador = ganador
    this.rondas.motivo = motivo
    this.rondas.fase = 'fin'
    this.rondas.hastaPaso = 0
    for (const jugador of this.jugadores.values()) jugador.movimiento.setCorralito(null)
  }

  /**
   * **El reloj de las fases y el final de una ronda por muerte.** Se mira al
   * final del paso y no dentro del disparo a propósito: así el veredicto del
   * tiro que mata se anota como cualquier otro y la ronda se cierra después,
   * con el mundo ya consistente.
   */
  _rondasTick() {
    const r = this.rondas
    if (r.fase === 'espera' || r.fase === 'fin') return
    if (r.fase === 'ronda') {
      const muerto = [...this.jugadores.values()].find((j) => j.vida <= 0)
      if (muerto) {
        const rival = [...this.jugadores.values()].find((j) => j !== muerto)
        this._terminarRonda(rival ? rival.equipo : null, 'muerte')
        return
      }
    }
    if (this.paso < r.hastaPaso) return
    if (r.fase === 'compra') this._empezarRonda()
    else {
      const fin = this._rondaPorTiempo()
      this._terminarRonda(fin.ganador, fin.motivo)
    }
  }
}
