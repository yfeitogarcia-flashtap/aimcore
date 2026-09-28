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
import { ECONOMY, NET, PAUSE, PLAYER, PROJECTILES, ROUNDS, SIM, SIM_STEP_MS, TODOS, WEAPONS, WEAPON_ORDER, bandoDeRanura, catalogoDeTienda, modoDeSala, modoMultijugador } from '../src/config.js'
import { MovementController } from '../src/game/movement.js'
import { encajarImpacto, hitPlayer, zoneDamage } from '../src/game/player.js'
import { Clavadas } from '../src/game/clavadas.js'
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
/** La ficha de tiro entera, que es lo que una granada necesita mirar. */
const tiroDeProyectil = (tipo) => WEAPONS[claveDeProyectil(tipo)]?.tiro ?? null
import { crearPose, cuerpoDeJugador } from './pose.js'
import { direccionDeMira, resolverCuchillada, resolverDisparo, resolverEscopeta } from './disparo.js'
import { MSG, compraAbierta, desempaquetarTeclas, instanteDePaso, instanteEnPaso } from './protocolo.js'
import { Interes } from './interes.js'

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
    modo = 'duelo',
    pasoInicial = 0,
    numero = 1,
    arranqueManual = false,
  }) {
    this.escenario = escenario
    /**
     * **Qué partida de la sala es ésta** (vuelta 101). Una sala juega varias
     * —la revancha es otra partida en la misma sala—, y el cliente lo necesita
     * para saber que una bienvenida nueva no es una reconexión sino otra
     * partida, con otro mundo.
     */
    this.numero = numero
    /**
     * **Quién la arranca** (vuelta 101). Sola, al entrar el segundo, como hasta
     * la 100; o a mano, desde el lobby, que mete a todos los listos de golpe y
     * sólo entonces la pone en marcha. Arrancarla con el segundo de diez sería
     * empezar la ronda 1 mientras los otros ocho todavía están entrando.
     */
    this.arranqueManual = arranqueManual
    /**
     * **El modo de la sala** (vuelta 100): `duelo` o `todos`. Se decide al nacer
     * —viaja en la dirección del socket, como el mapa y la fase de compra— y lo
     * que cambia son tres cosas: de qué lista salen las salidas, cuántos caben y
     * si hay rondas. El todos contra todos **no tiene rondas, ni economía, ni
     * pausa**: es un marcador y un cronómetro encima de la reaparición por
     * reloj de entradas de la vuelta 52 (propuesta 11 §5).
     */
    this.modo = modoDeSala(modo)
    /**
     * **Cuántos por bando** (vuelta 101): uno en un duelo, de dos a cinco en los
     * de equipos y cero en el todos contra todos. El duelo **es** un modo por
     * equipos de uno —mismas rondas, misma economía, misma compra— y por eso no
     * hay aquí una rama «duelo» y otra «equipos»: hay un número.
     */
    this.porEquipo = modoMultijugador(this.modo).porEquipo
    this.enEquipos = this.porEquipo > 0
    const todos = !this.enEquipos
    if (todos) rondas = false
    /**
     * **Cada cuántos pasos sale una foto** en esta sala. Ver `NET.fotoCada`: el
     * duelo se queda a 60 Hz y el todos contra todos va a 20.
     */
    this.fotoCada = NET.fotoCada[this.modo] ?? 1
    /**
     * **La partida del todos contra todos**, que no son rondas: una fase
     * (`espera`, `juego` o `fin`), su final en número de paso y el ganador.
     * `n` cuenta partidas y es lo que el cliente mira para tirar su cola sin
     * confirmar cuando todos reaparecen a la vez — la misma regla que un
     * cambio de fase en las rondas (vuelta 62).
     */
    this.todos = { n: 0, fase: 'espera', hastaPaso: 0, ganador: null }
    /**
     * **El marcador sale cuando cambia, no en cada foto** (vuelta 100). Son
     * bajas, muertes y pausas de todos los de la sala, y con cincuenta dentro
     * mandarlo en cada foto a cada uno serían dos megas por segundo de algo que
     * cambia cada muchos segundos. El transporte no pierde mensajes (es un
     * WebSocket), así que basta con mandarlo al cambiar y a quien entra.
     */
    this._marcadorSucio = true
    /**
     * **Lo que hay volando, y es del mundo y no de nadie** (vuelta 85). Un
     * cohete sobrevive a quien lo lanzó —que es la mitad de lo que lo hace
     * interesante— así que su dueño es la partida, no el jugador: una baja no
     * lo apaga y abandonar tampoco.
     */
    this.proyectiles = new Proyectiles(PROJECTILES.pool * 2)
    /**
     * **Los cuchillos clavados, y son del servidor** (vuelta 90). Un cuchillo
     * en el suelo es munición, y lo que se puede tener lo decide él desde la
     * vuelta 64: si cada cliente lo recogiera por su cuenta, los dos podrían
     * recoger el mismo. Los clientes lo dibujan y nada más.
     */
    this.clavadas = new Clavadas()
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
    // En el todos contra todos no se reparte (vuelta 100): cada uno sale con lo
    // que haya elegido en su armería — ver `libres` en la bienvenida.
    this.dotacion = todos ? null : escenario.dotacionDeDuelo
    this.compraSegundos = ROUNDS.compraSegundos
    this.configurarCompra(compraSegundos)
    this.colchon = colchon
    this.depurar = depurar
    this.conRondas = rondas
    /**
     * **El paso no vuelve a cero entre partidas de la misma sala** (vuelta
     * 101): el reloj de la red es el número de paso (vuelta 45), y un cliente
     * que venía por el 9 000 no puede encontrarse de golpe en el 0 — su enganche
     * al reloj lo leería como un parón de dos minutos al revés.
     */
    this.paso = pasoInicial
    /**
     * **Las pausas libres de cada bando** (vuelta 101). En un duelo son del
     * jugador, tres cada uno, como desde la vuelta 53; en un 5v5 serían treinta
     * pausas por partida, que es una partida que no se juega. Con más de uno
     * por bando son **del bando**, tres para los cinco — que es lo que hace el
     * CS con sus tiempos muertos tácticos.
     */
    this.libresDeBando = [PAUSE.free, PAUSE.free]
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
      /**
       * **Quién ha dicho «listo» en una compra sin límite** (vuelta 102), por
       * ranura. Vacío en cualquier otra fase y en las compras con reloj.
       */
      listos: new Set(),
    }
    /**
     * **Las salidas las declara el mapa** (vuelta 66). En el de duelo están en
     * extremos opuestos —32 u y el centro tapado por medio—; en cualquier otro,
     * `salidasDeDuelo` cae al reparto de antes, que era el spawn del escenario
     * con 2.5 u a cada lado. Eso nunca fue un reparto de sitios: era la forma de
     * que dos jugadores no aparecieran uno dentro del otro, y puesto a servir de
     * 1v1 empezaba la ronda con los dos a cinco unidades.
     */
    this.salidas = todos ? escenario.salidasDeTodos : escenario.salidasDeEquipos(this.porEquipo)
    /**
     * **Cuántos caben**: dos en un duelo y, en el todos contra todos, **tantos
     * como salidas declara el mapa** —la propuesta 11 §4: el tope se deriva de
     * la lista, no es un número aparte que la pueda contradecir—.
     */
    this.plazas = todos ? Math.min(this.salidas.length, TODOS.maxJugadores) : this.porEquipo * 2
  }

  /**
   * **¿Se ha acabado la partida?** (vuelta 101). Lo pregunta el lobby para
   * ofrecer «Volver a jugar»: con rondas es que hay ganador; en el todos contra
   * todos, que la fase es la del final. Ya no vuelve a empezar sola (la 100
   * esperaba diez segundos y arrancaba otra): la siguiente la decide la sala.
   */
  get terminada() {
    return this.enEquipos ? this.rondas.fase === 'fin' : this.todos.fase === 'fin'
  }

  /** ¿Hay una partida en juego (ni esperando ni acabada)? */
  get enJuego() {
    return this.enEquipos
      ? this.rondas.fase === 'compra' || this.rondas.fase === 'ronda'
      : this.todos.fase === 'juego'
  }

  /** Las pausas libres que le quedan a un jugador: las suyas, o las de su bando. */
  _libresDe(jugador) {
    return this.porEquipo > 1 ? this.libresDeBando[jugador.bando] : jugador.pausasLibres
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
    // **Sin límite es un valor, no un tope** (vuelta 102): se guarda tal cual y
    // cada sitio que preguntaba `<= 0` («no hay fase») pregunta `=== 0`.
    if (segundos === ROUNDS.compraSinLimite) { this.compraSegundos = ROUNDS.compraSinLimite; return }
    this.compraSegundos = Math.max(0, Math.min(60, Math.round(segundos)))
  }

  /** ¿La fase de compra de esta sala la cierra un «listo» de todos y no un reloj? */
  get compraSinLimite() {
    return this.compraSegundos === ROUNDS.compraSinLimite
  }

  /**
   * **Los que tienen que decir «listo»** (vuelta 102): los que juegan y siguen
   * conectados. Quien se ha caído no bloquea la ronda —si no, una caída sería
   * una pausa sin tope—, y cuando vuelve se le vuelve a esperar.
   */
  _faltanListos() {
    let faltan = 0
    for (const j of this.jugadores.values()) {
      if (j.bando === null || j.desconectado) continue
      if (!this.rondas.listos.has(j.ranura)) faltan += 1
    }
    return faltan
  }

  /**
   * **«Listo» en una compra sin límite** (vuelta 102). Sólo cuenta ahí: en las
   * compras con reloj —las de competición— no hay forma de acortarla, que es lo
   * que las hace iguales para los dos. Se puede desmarcar, y la ronda empieza
   * en el paso siguiente al último «listo» (`_rondasTick`), no aquí dentro de
   * un mensaje.
   */
  _listoParaRonda(jugador, listo) {
    if (!this.compraSinLimite || this.rondas.fase !== 'compra' || jugador.bando === null) return
    if (listo) this.rondas.listos.add(jugador.ranura)
    else this.rondas.listos.delete(jugador.ranura)
  }

  get llena() {
    return this.jugadores.size >= this.plazas
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
  entra(enviar, pase = null, { ranura: pedida = null, nick = null } = {}) {
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
    const ocupadas = new Set([...this.jugadores.values()].map((j) => j.ranura))
    // **La ranura la puede pedir el lobby** (vuelta 101): es el hueco que eligió
    // el jugador, y de ella salen su bando, su salida y su color. Si está
    // cogida o no existe, la primera libre, como siempre.
    let ranura = 0
    if (Number.isInteger(pedida) && pedida >= 0 && pedida < this.plazas && !ocupadas.has(pedida)) ranura = pedida
    else while (ranura < this.salidas.length && ocupadas.has(ranura)) ranura += 1
    const salida = this.salidas[ranura]
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
       * **Su butaca y su bando son dos cosas** (vuelta 101). Hasta la 100 las
       * dos se llamaban `equipo` y eran el mismo número, que en un 1v1 es
       * verdad: la butaca 0 es el bando azul. En un 3v3 no: la butaca dice su
       * salida y su sitio en el marcador, y el bando, con quién juega. La
       * ranura par es el bando 0 y la impar el 1, así que un duelo no cambia.
       */
      ranura,
      bando: this.enEquipos ? bandoDeRanura(ranura) : null,
      /** Su nombre en la sala, si se lo ha dado el lobby; si no, el de su ranura. */
      nick: typeof nick === 'string' && nick ? nick.slice(0, 16) : null,
      /**
       * **Su ranura, que es su sitio de salida y su color.** El id no sirve para
       * esto: es un contador que no para de subir, así que dos jugadores pueden
       * ser perfectamente `p3` y `p5` —los dos impares— y un color deducido de
       * ahí los pintaría iguales.
       */
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
      inventario: { primaria: null, secundaria: null, especial: null, granadas: [], supresor: {}, reserva: {} },
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
      /** Quién entra en su foto, con su memoria. Ver `net/interes.js`. */
      interes: new Interes(),
      /**
       * **Por qué salida vuelve** (vuelta 100), o null para la suya. En el todos
       * contra todos no es la de su butaca: sería reaparecer siempre en el mismo
       * sitio, que es donde le espera quien acaba de matarle. La elige el
       * servidor al matarle y viaja en su foto, así que el cliente predice la
       * reaparición en el sitio bueno y no hay corrección que pagar.
       */
      salidaSiguiente: null,
      /** Quién le hizo daño por última vez, para la cuña de dirección. */
      golpeadoPor: null,
    }
    this.jugadores.set(jugador.id, jugador)
    this._marcadorSucio = true

    this._bienvenida(jugador)
    this._enviarEconomia(jugador)
    /**
     * **Quien llega con la partida en marcha** (vuelta 101). En el todos contra
     * todos entra y juega, con la gracia de reaparecer; con rondas, en la
     * compra sale en su caja y en plena ronda **espera muerto a la siguiente**,
     * que es lo que hace el CS: entrar vivo a mitad de una ronda que se decide
     * por quién queda en pie sería regalarle un jugador a un bando.
     */
    if (this.enEquipos && this.conRondas) {
      if (this.rondas.fase === 'compra') jugador.movimiento.setCorralito(this._cajaDe(ranura))
      else if (this.rondas.fase === 'ronda') { jugador.vida = 0; jugador.vivoEn = Number.MAX_SAFE_INTEGER }
    } else if (!this.enEquipos && this.todos.fase === 'juego') {
      jugador.invulnerableHasta = this.paso + Math.round(PLAYER.respawn.invulnerableMs / SIM_STEP_MS)
    }
    if (!this.arranqueManual) this._quizaArrancar()
    return jugador.id
  }

  /** **Arrancar a mano** (vuelta 101): lo llama el lobby con todos ya dentro. */
  arrancar() {
    this._quizaArrancar()
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
        // `equipo` es la ranura, con el nombre de siempre: lo leen la página y
        // los bancos desde la vuelta 49. Lo nuevo va con su nombre.
        equipo: jugador.ranura,
        ranura: jugador.ranura,
        bando: jugador.bando,
        por: this.porEquipo,
        partida: this.numero,
        nick: jugador.nick,
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
        anfitrion: jugador.ranura === 0,
        salida: {
          x: jugador.pose.position.x,
          z: jugador.pose.position.z,
          // **Hacia dónde se mira al aparecer.** Lo decide el mapa y lo dice el
          // servidor: el cliente no puede deducirlo de su ranura sin llevar una
          // segunda copia de las salidas.
          yaw: this.salidas[jugador.ranura]?.yaw ?? 0,
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
        /**
         * **El modo, el ritmo de la foto y cuántos caben** (vuelta 100). Los
         * tres los decide la sala al nacer y el cliente los necesita antes de
         * la primera foto: el ritmo, para saber con cuánto retraso dibujar a
         * los demás; las plazas, para montar tantos cuerpos como pueda haber.
         */
        modo: this.modo,
        fc: this.fotoCada,
        plazas: this.plazas,
        /**
         * **Y todas las salidas, en el todos contra todos**: el servidor elige
         * por cuál reaparece cada uno (ver `salidaSiguiente`) y lo dice por su
         * número, así que el cliente tiene que tener la lista para predecirlo.
         * En el duelo no hace falta: se vuelve siempre a la propia.
         */
        salidas: this.salidas.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw ?? 0 })),
        /**
         * **Si las armas son libres** (vuelta 100): ni se compran ni las
         * reparte el mapa, así que las elige cada uno en su armería. El
         * servidor no pierde nada que no perdiera ya —valida la cadencia del
         * arma que cada entrada declara (vuelta 56)—, y es lo que hace un todos
         * contra todos sin rondas.
         */
        libres: !this.enEquipos && !this.dotacion ? 1 : 0,
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
    this._marcadorSucio = true
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
    // En el todos contra todos, la partida en marcha es `todos.fase` y no las
    // rondas, que ahí no existen.
    const enMarcha = this.enJuego
    if (!enMarcha) {
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
    this._marcadorSucio = true
    // **El mundo se para para el que sigue**, y esta pausa no es de nadie: no
    // gasta libres, no la levanta un botón y tiene su propio tope, que es la
    // ventana de reconexión.
    // **Sólo en un duelo** (vuelta 101): con diez en la sala, que se caiga uno no
    // puede parar el mundo de los otros nueve noventa segundos. En los de
    // equipos su butaca se guarda igual, pero la ronda sigue: no está en la
    // foto de nadie ni encaja daño, y para decidir quién queda en pie cuenta
    // como caído.
    if (this.porEquipo === 1 && (this.rondas.fase === 'compra' || this.rondas.fase === 'ronda')) {
      this.pausa = {
        por: null,
        motivo: 'caida',
        quien: jugador.ranura,
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
    const enJuego = this.enJuego
    this.sale(id)
    /**
     * **Irse deja al bando en uno menos, y un bando vacío pierde** (vuelta
     * 101). En un 1v1 es lo de la vuelta 62 —el rival gana la ronda y con ella
     * la partida, porque un duelo no se juega solo—; en un 3v3 que se vaya uno
     * no acaba nada, y lo que acaba la partida es que no quede nadie de un
     * lado.
     */
    if (!this.enEquipos || !enJuego || this.rondas.ganador !== null) return
    const quedan = [...this.jugadores.values()].filter((j) => j.bando === jugador.bando).length
    if (quedan > 0) return
    const otro = 1 - jugador.bando
    this._terminarRonda(otro, 'abandono')
    if (this.rondas.ganador === null) this._terminarPartida(otro, 'abandono')
  }

  sale(id) {
    if (this.jugadores.get(id)?.desconectado) this._caidos -= 1
    this.jugadores.delete(id)
    this._soltarLoSuyo(id)
    for (const otro of this.jugadores.values()) otro.interes.olvidar(id)
    this._marcadorSucio = true
    // Un todos contra todos con uno solo dentro no es una partida: vuelve a la
    // espera, y el que quede sigue andando por el mapa hasta que llegue otro.
    if (!this.enEquipos && this.todos.fase === 'juego' && this.conectados.length < 2) this._esperarTodos()
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
    if (mensaje.t === MSG.LISTO_COMPRA) {
      this._listoParaRonda(jugador, Boolean(mensaje.v))
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
    // **En el todos contra todos no se pausa** (vuelta 100). Pausar es parar el
    // mundo de todos (vuelta 53), y que uno de diez congele a los otros nueve
    // no es una conversación que se pueda tener en la misma habitación.
    if (!this.enEquipos) return
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
      if (this._libresDe(jugador) <= 0) return
      if (this.porEquipo > 1) this.libresDeBando[jugador.bando] -= 1
      else jugador.pausasLibres -= 1
      this._marcadorSucio = true
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
      // **Y nunca más de las que hay.** Con `colchon` en cero —que hoy no pasa,
      // pero es un número de configuración— `exceso` vale la cola entera y esto
      // pedía una entrada de más: `shift()` devolvía `undefined` y el paso
      // reventaba con la sala dentro. Un tope que depende de un ajuste tiene
      // que acotarse contra lo que de verdad hay.
      const cuantas = Math.min(1 + Math.max(0, exceso), NET.maxCatchUpTicks, jugador.cola.length)
      for (let i = 0; i < cuantas; i++) this._ejecutar(jugador, jugador.cola.shift())
    }

    /**
     * **Y los proyectiles, con los jugadores ya movidos.** Va aquí y no antes
     * porque contra lo que choca un proyectil es contra dónde está el rival
     * **al final de este paso**: resolverlo antes sería juzgarlo contra el paso
     * anterior, que es un rebobinado de uno que nadie ha pedido.
     */
    this._pasoDeProyectiles()
    // **Y se recoge lo que haya debajo, con los jugadores ya movidos**: por lo
    // mismo que los proyectiles van detrás del movimiento y no delante.
    this._pasoDeClavadas()

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
    if (!this.enEquipos) this._todosTick()

    if (this.paso % this.fotoCada !== 0) return
    this._enviarFoto()
  }

  /**
   * **La foto, y desde la vuelta 100 es una por destinatario.**
   *
   * Hasta aquí salía una sola y la recibían todos, con todos dentro: el
   * cuadrado —N fotos de N cuerpos— que con diez jugadores son 33 Mbit/s de
   * una sala (`salas97`). Ahora cada uno recibe **la suya**, y la hacen tres
   * piezas que se escriben una vez por foto y se juntan por destinatario:
   *
   * - **Lo común** —el paso, las butacas, la pausa, las rondas, la partida del
   *   todos contra todos y, sólo cuando cambia, el marcador—, que es lo mismo
   *   para todos y se serializa una vez.
   * - **Tu entrada**, entera: es la que reconcilia tu predicción, así que lleva
   *   todo lo que llevaba (el `ack`, tu movimiento completo, tus veredictos).
   * - **La de cada uno de los demás que entre en tu foto**, y **ligera**: dónde
   *   está, hacia dónde mira, si está vivo y con qué arma. Es lo único que
   *   hace falta para dibujarle, y su movimiento completo —treinta y tantos
   *   campos— era la mitad de los bytes de una foto que no lo usaba para nada.
   *   Se serializa **una vez por foto**, la pida uno o la pidan nueve.
   *
   * Quién entra en tu foto **no se decide aquí**: lo decide `net/interes.js`,
   * y es el único sitio. La fase de compra (vuelta 62) era una rama aparte de
   * este método y ahora es un caso más de esa regla.
   */
  _enviarFoto() {
    const comun = this._fotoComun()
    const sala = { fase: this.rondas.fase, escenario: this.escenario }
    // Las ligeras se hacen a demanda y se guardan lo que dura esta foto.
    for (const j of this.jugadores.values()) j._ligera = null
    for (const jugador of this.jugadores.values()) {
      // Veredictos: se descuentan aquí, una vez por foto y jugador, se le mande
      // o no — quien está sin cable no los necesita y no pueden acumularse.
      const propia = this._entradaPropia(jugador)
      if (jugador.desconectado) continue
      let texto = `${comun}"${jugador.id}":${propia}`
      for (const otro of this.jugadores.values()) {
        if (otro === jugador) continue
        if (!jugador.interes.entra(jugador, otro, sala, this.paso)) continue
        if (otro._ligera === null) otro._ligera = `,"${otro.id}":${JSON.stringify(this._entradaLigera(otro))}`
        texto += otro._ligera
      }
      texto += '}}'
      jugador.enviar(texto)
      jugador.bytesSalida += texto.length
    }
  }

  /**
   * **Lo que llevan todas las fotos**, hasta la apertura de `p` incluida. Se
   * escribe a mano como texto porque cada destinatario le pega detrás lo suyo,
   * y es lo que evita serializar diez veces lo mismo.
   */
  _fotoComun() {
    /**
     * **Cuántas butacas están ocupadas** (vuelta 67). Un número, y hace falta
     * porque la foto sale **por destinatario** y no tiene por qué llevar a
     * nadie más: desde el cliente, «¿ha entrado ya alguien?» no se puede
     * contestar mirando si hay pose. Cuenta **butacas**, no cables.
     */
    let texto = `{"t":"${MSG.FOTO}","n":${this.paso},"ocupadas":${this.jugadores.size}`
    // Sólo cuando hay algo que contar. `resta` son los milisegundos que le
    // quedan a la pausa —o a la votación—, y se calculan **aquí**: el cliente
    // no tiene el reloj del servidor.
    if (this.pausa) {
      texto += `,"pa":${JSON.stringify({
        por: this.pausa.por,
        resta: Math.max(0, this.pausa.expiraEn - Date.now()),
        // Y por qué: una pausa por caída no tiene dueño.
        ...(this.pausa.motivo ? { motivo: this.pausa.motivo, quien: this.pausa.quien } : null),
      })}`
    }
    if (this.votacion) {
      texto += `,"vo":${JSON.stringify({ por: this.votacion.por, resta: Math.max(0, this.votacion.expiraEn - Date.now()) })}`
    }
    // **Las rondas, que son del mundo y las ven los dos igual.** Lo que viaja es
    // *cuánto queda* de la fase, no hasta cuándo (vuelta 54).
    const r = this.rondas
    texto += `,"rd":${JSON.stringify({
      n: r.n,
      f: r.fase,
      // Sin límite no hay «cuánto queda»: -1, y la lista de los que están listos.
      resta: r.hastaPaso === Infinity ? -1 : r.hastaPaso ? Math.max(0, (r.hastaPaso - this.paso) * SIM_STEP_MS) : 0,
      ...(r.fase === 'compra' && this.compraSinLimite ? { li: [...r.listos], nl: this._faltanListos() } : null),
      m: r.marcador,
      ...(r.ganador !== null ? { g: r.ganador, mot: r.motivo } : null),
      ...(r.ultima ? { u: r.ultima } : null),
      ...(r.prorroga ? { pr: 1 } : null),
    })}`
    // **Y la partida del todos contra todos**, con la misma forma.
    if (!this.enEquipos) {
      const t = this.todos
      texto += `,"td":${JSON.stringify({
        n: t.n,
        f: t.fase,
        resta: t.hastaPaso ? Math.max(0, (t.hastaPaso - this.paso) * SIM_STEP_MS) : 0,
        obj: TODOS.bajasParaGanar,
        ...(t.ganador !== null ? { g: t.ganador } : null),
      })}`
    }
    if (this._marcadorSucio) {
      this._marcadorSucio = false
      texto += `,"mc":${JSON.stringify(this._marcador())}`
    }
    return `${texto},"p":{`
  }

  /**
   * **El marcador de la sala**: una fila por butaca, con su ranura, sus bajas,
   * sus muertes y sus pausas libres. Viaja cuando cambia (`_marcadorSucio`).
   * `c` vale 1 si esa butaca está sin cable.
   */
  _marcador() {
    return [...this.jugadores.values()].map((j) => ({
      id: j.id, r: j.ranura, b: j.bajas, m: j.muertes, l: this._libresDe(j),
      // Su bando y su nombre, si los tiene (vuelta 101): con más de uno por
      // lado, el marcador se lee por bandos, y el nombre lo pone el lobby.
      ...(j.bando !== null ? { bd: j.bando } : null),
      ...(j.nick ? { n: j.nick } : null),
      ...(j.desconectado ? { c: 1 } : null),
    }))
  }

  /**
   * **Tu entrada de la foto, entera.** Es la que tenía cada jugador hasta la
   * vuelta 99, más su ranura y —en el todos contra todos— por dónde vuelve y
   * quién le ha dado. Devuelve el texto ya serializado.
   */
  _entradaPropia(jugador) {
    const e = {
      ack: jugador.ack,
      hambre: jugador.hambre,
      vida: jugador.vida,
      // Escudo y casco viajan con la vida porque son lo mismo: cuánto aguantas
      // (vuelta 64). El **dinero** no, que ése es privado y va por su mensaje.
      esc: jugador.escudo,
      cas: jugador.casco ? 1 : 0,
      vivoEn: jugador.vivoEn,
      // **Lo que le queda de gracia, en ms**, y sólo mientras la tenga.
      ...(jugador.invulnerableHasta > this.paso
        ? { inv: (jugador.invulnerableHasta - this.paso) * SIM_STEP_MS }
        : null),
      libres: this._libresDe(jugador),
      // Quién ha votado ya, para que su cartel se retire.
      ...(this.votacion?.votos.has(jugador.id) ? { vv: 1 } : null),
      ...(jugador.arma ? { arma: jugador.arma } : null),
      // **El destello de mira, y sólo cuando lo hay** (vuelta 90).
      ...(jugador.mirilla ? { mir: 1 } : null),
      bajas: jugador.bajas,
      muertes: jugador.muertes,
      // **Por qué salida vuelve**, mientras está abatido y sólo si no es la
      // suya: el cliente predice la reaparición y tiene que saber dónde.
      ...(jugador.vivoEn > 0 && jugador.salidaSiguiente !== null ? { sal: jugador.salidaSiguiente } : null),
      // **Quién le ha dado por última vez** (vuelta 100). Con un solo rival la
      // cuña de daño apuntaba a «el otro»; con nueve hay que decir cuál.
      ...(jugador.golpeadoPor ? { gp: jugador.golpeadoPor } : null),
      yaw: jugador.pose.rotation.y,
      s: jugador.movimiento.snapshot(jugador.estado),
    }
    // Los veredictos de disparo se repiten unas cuantas fotos: si se mandaran
    // una sola vez, perder esa foto perdería el veredicto para siempre. El
    // cliente los descarta por número, así que repetirlos no cuesta nada.
    if (jugador.disparos.length > 0) {
      e.disparos = jugador.disparos.map((d) => d.dato)
      for (const d of jugador.disparos) d.ttl -= 1
      jugador.disparos = jugador.disparos.filter((d) => d.ttl > 0)
    }
    return JSON.stringify(e)
  }

  /**
   * **La entrada de otro, ligera** (vuelta 100): lo que hace falta para
   * dibujarle y nada más. Su movimiento se reduce a lo que usa quien dibuja
   * —posición, pies, ojos y la época de pose, que es lo que dice que ha saltado
   * sin recorrer el camino (vuelta 50)— y **redondeado al milímetro**: esto no
   * reconcilia nada, sólo se pinta, y un milímetro no se ve.
   */
  _entradaLigera(jugador) {
    const s = jugador.movimiento.snapshot(jugador.estado)
    const mm = (v) => Math.round(v * 1000) / 1000
    return {
      r: jugador.ranura,
      ...(jugador.bando !== null ? { b: jugador.bando } : null),
      vida: jugador.vida,
      ...(jugador.arma ? { arma: jugador.arma } : null),
      ...(jugador.mirilla ? { mir: 1 } : null),
      yaw: mm(jugador.pose.rotation.y),
      s: { x: mm(s.x), z: mm(s.z), feetY: mm(s.feetY), eyeHeight: mm(s.eyeHeight), poseEpoch: s.poseEpoch },
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
    /**
     * **Y si tiene la mirilla puesta** (vuelta 90), que es lo único que el
     * servidor sabe de lo que un jugador está haciendo y no de dónde está. No
     * toca el mundo —no mueve, no frena, no dispara—: sólo se reenvía en la
     * foto para que el rival lo dibuje.
     *
     * **Se comprueba contra el arma que este mismo paso declara**, así que un
     * cliente no puede pintarle un destello al otro con una pistola en la mano.
     * Lo que no se puede impedir desde aquí es que se lo calle: la mirilla es
     * del cliente desde la vuelta 70 y el servidor no ve el botón derecho.
     */
    jugador.mirilla = entrada.z === 1 && Boolean(arma?.scope?.destello)
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
    /**
     * **Y lo de una granada viaja acotado**, como la carga y como el paso a
     * rebobinar de la vuelta 46. Lo que llega es **cuánto se ha sostenido**, no
     * la mecha: `mechaDeGranada` la deriva con su suelo de un segundo dentro,
     * así que un cliente que pidiera cero se lleva el suelo igual. Mentir aquí
     * sólo puede **alargar** tu propia mecha, que es peor para quien miente.
     */
    const sostenidoS = Number.isFinite(d.h) ? Math.max(0, Math.min(60, d.h)) : 0
    const corto = d.j === 1
    const l = lanzamientoDeArma(arma, carga, _ojos, d.yaw, d.pitch, _lanzamiento, { corto, sostenidoS })
    if (!l) return
    this.proyectiles.lanzar({
      tipo: l.tipo,
      dueno: tirador.id,
      x: l.x, y: l.y, z: l.z,
      vx: l.vx, vy: l.vy, vz: l.vz,
      g: l.g,
      fuerza: l.fuerza,
      intensidad: l.intensidad,
      rebote: l.rebote,
      roce: l.roce,
      reposoU: l.reposoU,
      mechaS: l.mechaS,
    })
    /**
     * **Y la reserva baja al lanzar** (vuelta 90), que es un agujero que no es
     * de esta vuelta: el servidor **sólo la subía**. Se ponía al comprar
     * (vuelta 86) y volvía a subir con `_premiarBajaDeProyectil`, así que
     * `inv.reserva` no medía lo que te queda sino lo que te dieron — y como el
     * inventario viaja y el cliente lo copia tal cual, un cohete que mataba
     * **repartía de más**: con dos gastados, la baja devolvía tres.
     *
     * Baja **una por lanzamiento y con suelo en cero**, que es exactamente la
     * misma cuenta que hace el cliente al rellenar el cargador — allí el
     * disparo vacía el cargador y el cargador se llena de la reserva, aquí se
     * resta directamente, y las dos ocurren en el mismo instante. Sin esto, el
     * Fang no se podría recoger nunca: el servidor creería que siempre llevas
     * el tope.
     *
     * **Y no se manda `MSG.ECONOMIA` por esto**: el cliente ya lo predice al
     * recargar, y un mensaje por lanzamiento sería tráfico para decirle lo que
     * acaba de hacer. La siguiente economía que salga —una compra, una ronda,
     * una recogida— lo lleva ya corregido.
     */
    if (arma.tiro.reserva) {
      const inv = tirador.inventario
      if (!inv.reserva) inv.reserva = {}
      const tiene = inv.reserva[tirador.arma] ?? arma.tiro.reserva.inicial
      inv.reserva[tirador.arma] = Math.max(0, tiene - 1)
    }
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
        // **De quién es** (vuelta 100): con más de un rival, «el rival» ya no
        // dice nada, y quien dibuja lo necesita para saber si es suyo.
        de: tirador.id,
        x: +l.x.toFixed(3), y: +l.y.toFixed(3), z: +l.z.toFixed(3),
        vx: +l.vx.toFixed(3), vy: +l.vy.toFixed(3), vz: +l.vz.toFixed(3),
        g: l.g,
        i: +l.intensidad.toFixed(2),
        // **Y con qué mecha sale**, porque el otro extremo no la puede derivar:
        // lo que la decide es cuánto la ha tenido en la mano su dueño, y eso no
        // está en ninguna entrada que el rival haya ejecutado.
        m: Number.isFinite(l.mechaS) ? +l.mechaS.toFixed(3) : undefined,
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
      /**
       * **Y una granada reparte lo suyo** (vuelta 87). El Core es la explosión
       * de siempre; la KO frena y **eso sí es del servidor**, porque el
       * movimiento lo decide él (vuelta 56) y el aturdimiento viaja en
       * `movement.snapshot()`. La Blind no aparece aquí en absoluto: cegar es
       * algo que le pasa a **una pantalla**, y las pantallas las tienen los
       * clientes, que montan el mismo mapa y el mismo pool.
       */
      const tiro = tiroDeProyectil(im.tipo)
      if (tiro?.aturdimiento) this._aturdir(im, tiro.aturdimiento, tirador)
      const explosion = tiro?.explosion ?? null
      if (explosion) {
        this._explotar(im, explosion, tirador)
        continue
      }
      if (tiro?.granada) continue
      /**
       * **Acertar la gasta; fallar la deja clavada** (vuelta 90). La misma
       * regla que el motor aplica en el entrenamiento, y por eso se lee del
       * mismo campo del arma: dos ideas de cuándo se recupera un cuchillo
       * serían dos juegos.
       */
      if (tiro?.clavable && !im.victima) {
        this._clavar(im)
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
   * **Deja el cuchillo donde ha chocado y se lo dice a los dos** (vuelta 90).
   *
   * El rumbo que viaja es la normal de la superficie del revés, que es lo que
   * el motor usa también para dibujarlo: en una pared, la hoja metida hacia
   * dentro; en el suelo, clavada de punta. Y va **a los dos**, incluido quien
   * lo lanzó — un vuelo lo predice su dueño, pero dónde acaba clavado es del
   * mundo y lo dice el servidor.
   */
  _clavar(im) {
    const id = this.clavadas.nuevoId()
    if (!this.clavadas.plantar({
      id, x: im.x, y: im.y, z: im.z, dx: -im.nx, dy: -im.ny, dz: -im.nz, dueno: im.dueno,
    })) return
    this._avisarClavadas({
      t: MSG.CLAVADA,
      i: id,
      x: +im.x.toFixed(3), y: +im.y.toFixed(3), z: +im.z.toFixed(3),
      dx: +(-im.nx).toFixed(3), dy: +(-im.ny).toFixed(3), dz: +(-im.nz).toFixed(3),
    })
  }

  /** El mismo mensaje a todo el mundo: aquí no hay nada privado. */
  _avisarClavadas(mensaje) {
    const texto = JSON.stringify(mensaje)
    for (const jugador of this.jugadores.values()) jugador.enviar(texto)
  }

  /**
   * **Quién recoge un cuchillo, y es el servidor quien lo dice** (vuelta 90).
   *
   * Un paso por jugador y por cuchillo, con el pool en ocho y las dos cosas a
   * cero casi siempre: sale por la primera línea sin tocar nada.
   *
   * Tres reglas, y las tres son las del entrenamiento porque salen del mismo
   * dato:
   *
   * - **Hay que llevar Fang.** Recoger es recargar, no comprar: un arma no se
   *   adquiere pisándola, o la tienda pasaría a ser una sugerencia. Y en red
   *   eso importa más que en el entrenamiento, porque el cuchillo del suelo
   *   puede ser del rival.
   * - **Y no se llevan más de las que se compraron**, con el `reserva.maxima`
   *   de siempre.
   * - **Un muerto no recoge.** Recoger es un gesto de andar por encima, y un
   *   abatido no anda.
   */
  _pasoDeClavadas() {
    if (this.clavadas.vivas === 0) return
    for (const jugador of this.jugadores.values()) {
      if (!jugador.vida) continue
      const clave = (jugador.inventario.granadas ?? []).find((g) => WEAPONS[g]?.tiro?.clavable)
      if (!clave) continue
      const r = WEAPONS[clave].tiro.reserva
      const tiene = jugador.inventario.reserva?.[clave] ?? 0
      if (tiene >= r.maxima) continue
      const p = jugador.pose.position
      const id = this.clavadas.alAlcanceDe(p.x, jugador.movimiento.feetY, p.z)
      if (!id) continue
      this.clavadas.quitar(id)
      if (!jugador.inventario.reserva) jugador.inventario.reserva = {}
      jugador.inventario.reserva[clave] = Math.min(r.maxima, tiene + 1)
      // **A los dos, porque los dos lo están dibujando**; y el inventario, sólo
      // a quien se lo lleva, que es la regla de `MSG.ECONOMIA` desde la 64.
      this._avisarClavadas({ t: MSG.CLAVADA, i: id, q: 1 })
      this._enviarEconomia(jugador)
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
   * **Lo que una KO le quita a la marcha** (vuelta 87), con la misma caída de
   * área que el daño (`caidaDeArea`) y aplicado por el mismo `movement.aturdir`
   * que usa el entrenamiento: dos escaleras de aturdimiento serían dos juegos.
   *
   * **El reloj es el de las entradas** —`n · SIM_STEP_MS`, el mismo que recibe
   * `update()`— y no el de pared ni el del servidor, que es la regla del
   * protocolo desde la vuelta 45 y lo que hace que el campo que viaja en
   * `snapshot()` signifique lo mismo en las dos pantallas.
   */
  _aturdir(im, e, tirador) {
    const ahora = instanteDePaso(this.paso)
    for (const jugador of this.jugadores.values()) {
      if (!jugador.vida) continue
      const p = jugador.pose.position
      const cy = jugador.movimiento.feetY + jugador.movimiento.eyeHeight * 0.5
      const d = Math.hypot(p.x - im.x, cy - im.y, p.z - im.z)
      const k = caidaDeArea(d, e.radioU, e.nucleoU) * (jugador === tirador ? e.propio : 1)
      if (k <= 0) continue
      jugador.movimiento.aturdir(ahora + e.duracionMs, e.duracionMs, e.frenoMax * k)
    }
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
    // **Y con el resultado en pantalla tampoco** (vuelta 100): la partida del
    // todos contra todos se ha acabado, y lo que se dispare entonces no cuenta.
    if (!this.enEquipos && this.todos.fase === 'fin') {
      salida.rechazado = true
      this._anotarVeredicto(tirador, salida)
      return
    }
    if (!tirador.vida) {
      this._anotarVeredicto(tirador, salida)
      return
    }
    // Ya es un disparo de verdad: los demás lo oyen y lo ven salir.
    this._contarTiro(tirador, entrada)
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


    // El historial llega hasta `paso − 1`: este paso todavía no se ha anotado.
    const masViejo = this.paso - 1 - NET.maxRewindMs / SIM_STEP_MS
    const pedido = Number.isFinite(d.tv) ? d.tv : this.paso - 1
    const objetivo = Math.min(this.paso - 1, Math.max(masViejo, pedido))
    salida.rebobinadoMs = +((this.paso - 1 - objetivo) * SIM_STEP_MS).toFixed(1)
    // Lo que **pedía** el tirador, antes del tope. La diferencia entre los dos
    // números es lo que el tope le está negando, y es donde empieza a desacordar.
    salida.pedidoMs = +((this.paso - 1 - pedido) * SIM_STEP_MS).toFixed(1)
    salida.topado = salida.pedidoMs > salida.rebobinadoMs + 0.01

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
    /**
     * **Y una escopeta se resuelve con su patrón** (vuelta 91), con la misma
     * función que el cliente y desde la misma semilla: es `net/disparo.js`
     * otra vez, que es lo que impide que el tirador vea entrar seis perdigones
     * y el servidor cuente dos. La semilla viene del cliente (`d.p`) y el
     * servidor no la valida porque no hay nada que validar en un sorteo — el
     * desvío lo sortea el cliente desde la vuelta 88, así que esto no le da
     * ningún poder que no tuviera.
     */
    const escopeta = Boolean(WEAPONS[tirador.arma]?.perdigones)
    const semilla = (d.p ?? 0) >>> 0
    const resolver = (contra) => (
      cuchillo
        ? resolverCuchillada(origen, d.yaw, d.pitch, contra, this.escenario.occluders, tirador.arma, tipo)
        : escopeta
          ? resolverEscopeta(origen, d.yaw, d.pitch, semilla, contra, this.escenario.occluders, tirador.arma)
          : resolverDisparo(origen, d.yaw, d.pitch, contra, this.escenario.occluders, tirador.arma)
    )
    /**
     * **Contra todos los demás, y gana el más cercano** (vuelta 100). Hasta aquí
     * había «el rival» y se resolvía contra él; con más de dos, la bala es la
     * misma y lo que cambia es contra quién se prueba. Cada uno se rebobina a
     * **su** instante —el mismo `objetivo`, porque el tirador los tiene a todos
     * dibujados con el mismo reloj de fotos— y de los que entran, se queda el
     * primero que la bala toca, que es lo que haría un rayo.
     */
    let rival = null
    let veredicto = null
    let cuerpo = null
    let ahora = null
    for (const otro of this.jugadores.values()) {
      if (otro === tirador || otro.desconectado) continue
      // **Un compañero no para la bala** (vuelta 101): sin fuego amigo, un
      // cuerpo de tu bando delante de un rival sería un escudo que nadie ha
      // pedido. La bala pasa, y el cliente hace la misma cuenta.
      if (this.enEquipos && otro.bando === tirador.bando) continue
      const suAhora = this._cuerpoRebobinado(otro, this.paso - 1)
      const suCuerpo = this._cuerpoRebobinado(otro, objetivo) ?? suAhora
      if (!suCuerpo) continue
      const v = resolver(suCuerpo)
      if (!rival || (v.impacto && (!veredicto.impacto || v.distancia < veredicto.distancia))) {
        rival = otro
        veredicto = v
        cuerpo = suCuerpo
        ahora = suAhora
      }
    }
    if (!rival) {
      this._anotarVeredicto(tirador, salida)
      return
    }
    // **El control**: el mismo disparo sin rebobinar nada. No decide nada, se
    // manda para poder medir qué compra la compensación.
    const sin = ahora ? resolver(ahora) : veredicto

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
    // **Y sale ya** (vuelta 101), sin esperar a la foto: ver `MSG.VEREDICTO`.
    // La foto lo sigue repitiendo por si éste se pierde.
    jugador.enviar(JSON.stringify({ t: MSG.VEREDICTO, d: dato }))
  }

  /**
   * **El disparo, contado a los demás** (vuelta 101). Hasta aquí un disparo en
   * red sólo lo sabían quien lo hacía y el servidor, así que un rival que te
   * vaciaba un cargador **no sonaba ni se veía disparar**: ni fogonazo, ni la
   * voz de su arma, ni el silbido de la bala que te pasaba cerca. Contra los
   * muñecos del entrenamiento las tres cosas existen desde la vuelta 40, y un
   * modo que no las tiene es un juego distinto (convención de la vuelta 63).
   *
   * Va a todos menos a él y no por la foto, que llega tarde y cada tres pasos:
   * un disparo es un instante, y el sonido tiene que caer en él. Lleva lo que
   * hace falta para dibujarlo y oírlo, que es lo mismo que el tirador ya dijo
   * al disparar: dónde, hacia dónde, con qué y con qué voz. **No lleva si ha
   * dado** —eso es del veredicto y de la vida—, así que no enseña nada que el
   * sonido no fuera a decir igual.
   */
  _contarTiro(tirador, entrada) {
    const d = entrada.d
    const p = tirador.pose.position
    const texto = JSON.stringify({
      t: MSG.TIRO,
      de: tirador.id,
      w: entrada.w,
      ...(d.s ? { s: 1 } : null),
      ...(d.m ? { m: d.m } : null),
      x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
      yaw: +d.yaw.toFixed(4), pitch: +d.pitch.toFixed(4),
    })
    for (const otro of this.jugadores.values()) {
      if (otro === tirador || otro.desconectado) continue
      otro.enviar(texto)
    }
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
    // **A quien no tiene cable no se le hace daño** (vuelta 100): no está en la
    // foto de nadie (`net/interes.js`), así que un golpe suyo sería un golpe a
    // algo que nadie ve. Y con el resultado de un todos contra todos en
    // pantalla, tampoco: la partida se ha acabado.
    if (victima.desconectado) return false
    if (!this.enEquipos && this.todos.fase === 'fin') return false
    /**
     * **Sin fuego amigo** (vuelta 101). Un compañero no encaja daño tuyo: ni
     * bala, ni cuchillo, ni onda. Es lo que hace el modo casual del CS, y la
     * razón es la misma — con diez en un mapa, el fuego amigo castiga sobre todo
     * al que tiene la mala suerte de estar en la línea. Lo que sí se conserva es
     * que **tu propia onda te alcanza** (el U2 de la vuelta 86): eso no es fuego
     * amigo, es tu cohete.
     */
    if (this.enEquipos && tirador && tirador !== victima && tirador.bando === victima.bando) return false
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
    if (tirador && tirador !== victima) victima.golpeadoPor = tirador.id
    // **A quien le dan, ya** (vuelta 101): ver `MSG.GOLPE`.
    victima.enviar(JSON.stringify({
      t: MSG.GOLPE, vida: victima.vida, esc: victima.escudo, cas: victima.casco ? 1 : 0,
      ...(victima.golpeadoPor ? { gp: victima.golpeadoPor } : null),
    }))
    if (victima.vida > 0) return false
    // **Y la baja, a todos y en el acto** (vuelta 101): ver `MSG.BAJA`.
    const baja = JSON.stringify({ t: MSG.BAJA, v: victima.id, ...(tirador ? { de: tirador.id } : null) })
    for (const j of this.jugadores.values()) if (!j.desconectado) j.enviar(baja)
    victima.muertes += 1
    // Un suicidio —la onda de tu propio cohete— no es una baja de nadie.
    if (tirador && tirador !== victima) tirador.bajas += 1
    this._marcadorSucio = true
    // **Y por dónde vuelve**, en el todos contra todos: la salida más lejos de
    // quien siga vivo (ver `_salidaMasLibre`).
    if (!this.enEquipos) victima.salidaSiguiente = this._salidaMasLibre(victima)
    // **Matar paga**, y se paga al instante: en un 1v1 la baja cierra la ronda,
    // así que sumarlo aquí o al repartir sería lo mismo — salvo el día que haya
    // más de dos, que es la razón de que vaya donde ocurre.
    if (this.conRondas && tirador && tirador !== victima) this._pagar(tirador, ECONOMY.premios.baja)
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
    // En el todos contra todos, la que le haya elegido el servidor al caer.
    const salida = this.salidas[jugador.salidaSiguiente ?? jugador.ranura] ?? this.salidas[jugador.ranura]
    jugador.salidaSiguiente = null
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
    /**
     * **En el todos contra todos, sí** (vuelta 100): ahí reaparecer **es**
     * empezar, y con ocho en un mapa alguien puede estar mirando a tu salida.
     * La misma gracia que el entrenamiento (`PLAYER.respawn.invulnerableMs`),
     * que es de donde el HUD ya sabe pintarla.
     */
    if (!this.enEquipos) {
      jugador.invulnerableHasta = this.paso + Math.round(PLAYER.respawn.invulnerableMs / SIM_STEP_MS)
    }
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
      /**
       * **Y desde la vuelta 90 también se compra pistola.** Es la primera
       * compra del juego que **sustituye** algo que ya llevas en vez de llenar
       * un hueco, y eso no necesita ninguna regla nueva: la ranura es una, así
       * que comprar el Reaper es escribirlo en ella. Lo que la de serie
       * garantiza es que quitarlo —morir— tenga a qué volver.
       *
       * ---
       *
       * **Y el Reaper era gratis, desde la vuelta 90** (encontrado en la 92).
       * Su rama escribía la ranura, mandaba la economía y **salía con un
       * `return`** — y el cobro está al final de esta función, detrás de todas
       * las ramas. O sea que el primer artículo del juego que sustituye algo
       * que ya llevas era también el único que no se pagaba, sin un error en
       * ninguna pantalla: el panel lo daba por comprado porque el servidor
       * decía que lo llevaba, y decía la verdad.
       *
       * Lo cazó construir la ranura especial, porque su rama salió calcada y
       * el banco de la vuelta miró el saldo: **una mecánica nueva es lo que
       * enseña los agujeros de la anterior**, otra vez. Y lo que lo cierra no
       * es acordarse del cobro en tres sitios, es que **haya un solo camino
       * hasta él** — que es la misma disciplina que `zoneDamage` y
       * `encajarImpacto`, aplicada a la caja.
       */
      /**
       * **Y desde la vuelta 92 hay una tercera ranura que se compra: la
       * especial.** El arco y el U2 salieron de la principal, y eso cambia la
       * economía por donde tiene que cambiarla: ya no es «o rifle o cohete»
       * —que era una prohibición disfrazada de precio— sino «los dos, si te lo
       * puedes pagar». El U2 sigue costando 4200, así que llevarlo con un
       * rifle son dos rondas buenas.
       *
       * Las tres ranuras son **la misma forma**: la ranura es una, comprar
       * sustituye, y el arma con reserva llega llena. Lo único que cambia es
       * en qué campo se escribe, así que se escribe una vez y se elige el
       * campo — tres bloques con tres `return` era lo que escondía el fallo de
       * aquí abajo.
       */
      const CAMPO = { primary: 'primaria', secondary: 'secundaria', special: 'especial' }
      const campo = CAMPO[item.ranura]
      if (!campo) return
      /**
       * **Comprar lo que ya llevas no es comprar**, así que no cuesta. Es la
       * misma guarda que el chaleco y el casco tienen desde la vuelta 64, y
       * aquí hacía falta desde que una ranura tiene dos armas: sin ella,
       * pulsar dos veces el Reaper cobra dos veces por lo mismo.
       */
      if (jugador.inventario[campo] === item.clave) return
      jugador.inventario[campo] = item.clave
      this._darReservaInicial(jugador, item.clave)
    } else if (item.clave === 'chaleco') {
      const tope = ECONOMY.escudoPorChaleco
      if (jugador.escudo >= tope) return
      jugador.escudo = tope
    } else if (item.clave === 'casco') {
      if (jugador.casco) return
      jugador.casco = true
    } else if (item.tipo === 'utilidad' && item.ranura === 'throwable') {
      /**
       * **Las granadas, y se llevan varias clases** (vuelta 88; la 87 guardaba
       * una sola).
       *
       * Lo de la 87 decía «la ranura es una, así que comprar otra sustituye», y
       * eso es un razonamiento sobre la implementación, no sobre el juego: la
       * ranura es **la tecla**, y una tecla puede ciclar. Lo que producía era
       * una tienda que cobra dos artículos y entrega uno, sin decirlo. Medido
       * jugando: una KO y dos Blind compradas, y a la ronda sólo salió la Blind.
       *
       * Ahora es una lista con tope (`ECONOMY.granadasMax`), y las tres reglas
       * que la hacen honesta:
       *
       * - **Comprar la que ya llevas la rellena**, no la duplica: es lo que ya
       *   hacía y es lo que deja gastarse el dinero sobrante en munición.
       * - **Pasado el tope se rechaza**, y el panel lo dice antes de cobrar —
       *   `porQueNo` mira el mismo inventario, así que no hay una segunda idea
       *   de si cabe.
       * - **Y llega llena**, con su reserva, por el mismo camino que el U2: una
       *   segunda forma de entregar munición serían dos.
       */
      const llevo = jugador.inventario.granadas ?? []
      if (!llevo.includes(item.clave) && llevo.length >= ECONOMY.granadasMax) return
      if (!llevo.includes(item.clave)) llevo.push(item.clave)
      jugador.inventario.granadas = llevo
      const r = WEAPONS[item.clave]?.tiro?.reserva
      if (r) {
        if (!jugador.inventario.reserva) jugador.inventario.reserva = {}
        jugador.inventario.reserva[item.clave] = r.inicial
      }
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
          secundaria: jugador.inventario.secundaria,
          especial: jugador.inventario.especial ?? null,
          granadas: [...(jugador.inventario.granadas ?? [])],
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
      if (jugador.bando === ultima.ganador) {
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
    /**
     * **Y la pistola comprada** (vuelta 90). Morir cuesta el equipo, y una
     * pistola de 900 que sobreviviera a la muerte sería el único artículo del
     * catálogo que se paga una vez por partida. Se queda a cero y no en la de
     * serie a propósito: quién es la de serie lo dice `SECONDARY_WEAPON`, y
     * escribirlo también aquí sería un segundo sitio que puede decir otra cosa.
     */
    jugador.inventario.secundaria = null
    // Y la especial (vuelta 92), que es equipo como todo lo demás: un U2 de
    // 4200 que sobreviviera a la muerte sería lo que la nota de la pistola de
    // aquí arriba dice que no puede ser.
    jugador.inventario.especial = null
    // Y las granadas, que son equipo como todo lo demás.
    jugador.inventario.granadas = []
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
   * **Un arma con reserva se compra llena** (vuelta 86). El U2 llega con dos
   * cohetes, que es lo que se pidió: los otros dos se ganan matando. Es del
   * **arma** y no de su precio, así que el día que haya otra con reserva
   * funciona sola — y desde la vuelta 92 lo llaman las dos ranuras que venden
   * armas, que es lo que evita que una lo haga y la otra se olvide.
   */
  _darReservaInicial(jugador, clave) {
    const r = WEAPONS[clave]?.tiro?.reserva
    if (!r) return
    if (!jugador.inventario.reserva) jugador.inventario.reserva = {}
    jugador.inventario.reserva[clave] = r.inicial
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
    if (!this.enEquipos) {
      if (this.todos.fase === 'espera' && this.conectados.length >= 2) this._empezarTodos()
      return
    }
    if (!this.conRondas) return
    if (this.rondas.fase !== 'espera') return
    // **Uno en cada bando, conectado** (vuelta 101). En un duelo es «hay dos»,
    // que es lo que miraba esto; en un 3v3 se puede empezar dos contra tres si
    // los jugadores quieren, pero no tres contra nadie.
    const conectados = this.conectados
    if (!conectados.some((j) => j.bando === 0) || !conectados.some((j) => j.bando === 1)) return
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
    if (this.compraSegundos === 0) {
      this._empezarRonda()
      return
    }
    this.rondas.fase = 'compra'
    this.rondas.listos.clear()
    // **Sin límite no tiene final en el reloj** (vuelta 102): la cierra el
    // último «listo», en `_rondasTick`. `Infinity` y no un número muy grande,
    // para que ninguna cuenta de «cuánto queda» pueda parecer un tiempo.
    this.rondas.hastaPaso = this.compraSinLimite ? Infinity : this.paso + this._pasosDe(this.compraSegundos)
    for (const jugador of this.jugadores.values()) {
      jugador.movimiento.setCorralito(this._cajaDe(jugador.ranura))
    }
  }

  /**
   * **El corralito de un jugador**, centrado en su salida. Las dos salidas están
   * a 5 u una de otra y la caja mide 4, así que **no se solapan**: dentro de la
   * fase de compra no hay forma de acabar encima del otro.
   */
  _cajaDe(ranura) {
    const salida = this.salidas[ranura] ?? this.salidas[0]
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
     * **Y el suelo se limpia de cuchillos** (vuelta 90), por lo mismo que se
     * apaga lo que volaba: una ronda que empieza tira lo que quedaba del mundo
     * anterior. Se dice con un mensaje y no se deja deducir de la fase, porque
     * deducirlo sería una segunda idea de cuándo empieza una ronda — y la
     * primera ya viaja en la foto.
     */
    this.clavadas.limpiar()
    this._avisarClavadas({ t: MSG.CLAVADA, l: 1 })
    /**
     * **Y la reserva se rellena hasta lo de fábrica, sin bajar de lo que
     * traigas** (vuelta 88; la 86 la ponía en `inicial` a secas).
     *
     * Lo de la 86 era «lo que se gana matando es de esa ronda, no del partido»,
     * y jugándolo se vio que eso dejaba la regla del U2 **inalcanzable**: la
     * única baja que repone un cohete es la que se hace con un cohete, y en un
     * 1v1 **esa baja cierra la ronda**. Así que el premio se cobraba y lo
     * borraba `_empezarRonda` un instante después, sin un aviso en ninguna
     * pantalla. Medido jugando: «impactó en el pecho del rival y no se repuso
     * el misil extra» — y sí se había repuesto.
     *
     * Con `max(inicial, lo que tenga)` la promesa del arma se cumple donde se
     * hizo —matar con un cohete te deja con uno más la ronda siguiente, hasta
     * `maxima`— y lo que la 86 quería proteger sigue protegido, porque **morir
     * te quita el arma** y con ella su reserva (`_perderEquipo`): el que pierde
     * no acumula nada.
     */
    /**
     * **Y se recorren las dos ranuras que pueden llevar un arma con reserva**
     * (vuelta 92). Esto miraba sólo `primaria`, que era exacto mientras el U2
     * estuviera ahí; con el cohete en la especial, mirar una sola ranura era
     * dejar la regla de arriba sin ningún arma a la que aplicarse — el fallo
     * silencioso de siempre, y esta vez con la vuelta anterior delante.
     */
    for (const jugador of this.jugadores.values()) {
      let cambio = false
      for (const clave of [jugador.inventario?.primaria, jugador.inventario?.especial]) {
        const r = clave ? WEAPONS[clave]?.tiro?.reserva : null
        if (!r) continue
        if (!jugador.inventario.reserva) jugador.inventario.reserva = {}
        const tiene = jugador.inventario.reserva[clave] ?? 0
        jugador.inventario.reserva[clave] = Math.min(r.maxima, Math.max(r.inicial, tiene))
        cambio = true
      }
      if (cambio) this._enviarEconomia(jugador)
    }
    this.rondas.fase = 'ronda'
    this.rondas.listos.clear()
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
    /**
     * **Con bandos, primero cuántos quedan en pie y después cuánta vida**
     * (vuelta 101). En un duelo es la regla de la 62 tal cual —queda uno de
     * cada lado, gana el de más vida—; en un 3v3, dos vivos contra uno ganan
     * aunque ese uno esté entero, que es lo que dice el marcador de pie.
     */
    const cuenta = [{ vivos: 0, vida: 0 }, { vivos: 0, vida: 0 }]
    for (const j of this.jugadores.values()) {
      if (j.bando === null || j.desconectado || j.vida <= 0) continue
      cuenta[j.bando].vivos += 1
      cuenta[j.bando].vida += j.vida
    }
    const [a, b] = cuenta
    if (a.vivos !== b.vivos) return { ganador: a.vivos > b.vivos ? 0 : 1, motivo: 'vida' }
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
    if (this.rondas.ganador !== null) return
    const bandos = new Set([...this.jugadores.values()].map((j) => j.bando))
    if (bandos.has(0) && bandos.has(1)) this._empezarCompra()
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
      /**
       * **La ronda se acaba cuando un bando se queda sin nadie en pie**
       * (vuelta 101). En un duelo es la primera muerte, como desde la 62; en un
       * 3v3, la tercera de un lado. Quien está sin cable cuenta como caído: no
       * está en la foto de nadie ni encaja daño, así que esperar a que alguien
       * le mate sería esperar a que acabe el reloj.
       */
      const enPie = [0, 0]
      for (const j of this.jugadores.values()) {
        if (j.bando !== null && !j.desconectado && j.vida > 0) enPie[j.bando] += 1
      }
      if (enPie[0] === 0 || enPie[1] === 0) {
        const ganador = enPie[0] === enPie[1] ? null : enPie[0] > 0 ? 0 : 1
        this._terminarRonda(ganador, ganador === null ? 'empate' : 'muerte')
        return
      }
    }
    if (r.fase === 'compra' && this.compraSinLimite && this._faltanListos() === 0) {
      this._empezarRonda()
      return
    }
    if (this.paso < r.hastaPaso) return
    if (r.fase === 'compra') this._empezarRonda()
    else {
      const fin = this._rondaPorTiempo()
      this._terminarRonda(fin.ganador, fin.motivo)
    }
  }

  // ------------------------------------------------------ todos contra todos

  /**
   * **La salida por la que vuelve un abatido** (vuelta 100): la que queda más
   * lejos del vivo más cercano. Es la regla más simple que evita lo único que
   * no puede pasar en un todos contra todos —volver delante de quien acaba de
   * matarte— y no pide nada que el servidor no tenga ya: posiciones y la lista
   * de salidas. Con los que tienen gracia no se cuenta, que están saliendo.
   */
  _salidaMasLibre(quien) {
    let mejor = quien.ranura
    let lejos = -1
    for (let i = 0; i < this.salidas.length; i++) {
      const s = this.salidas[i]
      let cerca = Infinity
      for (const otro of this.jugadores.values()) {
        if (otro === quien || otro.desconectado || otro.vida <= 0) continue
        const p = otro.pose.position
        const d = Math.hypot(p.x - s.x, p.z - s.z)
        if (d < cerca) cerca = d
      }
      if (cerca > lejos) { lejos = cerca; mejor = i }
    }
    return mejor
  }

  /** Se abre una partida: marcador a cero, todos en pie y el reloj en marcha. */
  _empezarTodos() {
    const t = this.todos
    t.n += 1
    t.fase = 'juego'
    t.ganador = null
    t.hastaPaso = this.paso + this._pasosDe(TODOS.minutos * 60)
    // **Todos reaparecen a la vez**, cada uno en su salida: es lo que hace que
    // la partida empiece igual para todos. Es un teletransporte que decide el
    // servidor —sube la época de pose (vuelta 50)— y el cliente lo lee porque
    // `td.n` ha cambiado, que es la misma señal que un cambio de ronda.
    for (const j of this.jugadores.values()) {
      j.bajas = 0
      j.muertes = 0
      j.salidaSiguiente = null
      j.golpeadoPor = null
      this._reaparecer(j)
      j.historial.fill(null)
    }
    this.proyectiles.apagarTodos()
    this.clavadas.limpiar()
    this._avisarClavadas({ t: MSG.CLAVADA, l: 1 })
    this._marcadorSucio = true
  }

  /** Sin rivales no hay partida: se espera, con el marcador como esté. */
  _esperarTodos() {
    const t = this.todos
    t.fase = 'espera'
    t.hastaPaso = 0
    t.ganador = null
  }

  /**
   * **Quién gana**: el primero en llegar a las bajas, o el que más lleve al
   * acabarse el tiempo. Un empate arriba no tiene ganador — se dice, no se
   * sortea.
   */
  _terminarTodos() {
    const t = this.todos
    let mejor = null
    let empate = false
    for (const j of this.jugadores.values()) {
      if (!mejor || j.bajas > mejor.bajas) { mejor = j; empate = false }
      else if (j.bajas === mejor.bajas) empate = true
    }
    t.fase = 'fin'
    t.ganador = mejor && !empate ? mejor.ranura : -1
    // **Y se queda acabada** (vuelta 101): el resultado en pantalla con sus dos
    // botones, «Volver a jugar» y «Salir al menú». La siguiente la arranca la
    // sala, que es donde se decide quién sigue.
    t.hastaPaso = 0
  }

  /** El reloj de la partida, al final de cada paso, como el de las rondas. */
  _todosTick() {
    const t = this.todos
    if (t.fase === 'espera') return
    if (t.fase === 'juego') {
      for (const j of this.jugadores.values()) {
        if (j.bajas >= TODOS.bajasParaGanar) { this._terminarTodos(); return }
      }
      if (this.paso >= t.hastaPaso) this._terminarTodos()
      return
    }
  }
}
