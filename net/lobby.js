/**
 * **El lobby: la sala antes que la partida** (vuelta 101).
 *
 * Hasta la 100 una sala **era** una partida: se creaba con el primer socket, con
 * el modo, el mapa y la fase de compra que dijera su dirección, y el que llegaba
 * detrás entraba a jugar en el acto. Jugándolo con cuatro personas se vio lo que
 * cuesta: nadie sabía cuántos faltaban, la configuración la veía sólo quien la
 * había puesto, y al acabar volvía a salir la pantalla de crear la sala.
 *
 * Ahora hay un paso antes. Se entra en la sala, se coge **hueco**, se pulsa
 * **LISTO**, y el anfitrión lanza cuando hay bastantes. Lo de dentro —rondas,
 * economía, disparos— sigue siendo `Partida`, que **no sabe que hay un lobby
 * delante**: recibe a los listos con su ranura y un `enviar` como siempre. Es la
 * misma separación que la vuelta 47 hizo entre la partida y el huésped, un
 * escalón más arriba: el huésped pone el reloj y el cable, el lobby pone quién
 * juega y con qué, y la partida pone el mundo.
 *
 * **Y los huéspedes no se enteran**: `Lobby` tiene la misma cara que tenía
 * `Partida` para ellos —`entra`, `recibe`, `abandona`, `sedesconecta`,
 * `reclama`, `tick`, `vacia`, `pausada`, `paso`— así que Node y el Durable
 * Object lo montan donde montaban la partida.
 *
 * Tres reglas que son el diseño:
 *
 * - **Una partida nueva por lanzamiento, en la misma sala.** La revancha no es
 *   «reiniciar» la de antes: es otra `Partida`, con los que estén listos y con
 *   **el número de paso donde iba**, que es lo que deja a los clientes seguir
 *   con su reloj (vuelta 45). Un solo camino, sea la primera o la décima.
 * - **Lo que manda la sala lo decide el anfitrión, y sólo entre partidas.** Con
 *   una en juego la configuración no se toca: sería cambiarle el mapa a diez
 *   personas a mitad de una ronda.
 * - **El pase es del lobby, no de la partida.** Volver a la sala con tu pase te
 *   sienta en tu hueco y, si estabas jugando, en tu butaca de la partida — que
 *   se reconecta con el suyo, por el camino de la vuelta 62.
 */
import { CUENTA_DE_SALA, ROUNDS, bandoDeRanura, capacidadDeTodos, escenarioDeSala, esModoDeEquipos, minimoParaLanzar, modoDeSala, plazasDeModo } from '../src/config.js'
import { Partida } from './partida.js'
import { MSG, esDelLobby } from './protocolo.js'

/** Cuántos pueden esperar en la sala sin hueco, además de los que juegan. */
const EN_ESPERA = 2

export class Lobby {
  /**
   * @param {object} o
   * @param {(modo: string, mapa: string) => object} o.crearEscenario monta el
   *   escenario de un mapa: lo pone el huésped, que es quien sabe con qué
   *   (three en Node y en el Durable Object).
   * @param {boolean} [o.auto] **sin lobby**: cada uno que llega entra a jugar,
   *   como hasta la vuelta 100. Es lo que usan los bancos de netcode, que miden
   *   la red y no la sala (`VEKTOR_LOBBY=0`).
   */
  constructor({ crearEscenario, modo = null, mapa = null, compra = null, colchon, depurar = false, rondas = true, auto = false }) {
    this.crearEscenario = crearEscenario
    this.opcionesDePartida = { colchon, depurar, rondas }
    this.auto = auto
    this.config = { modo: modoDeSala(modo), mapa: null, compra: ROUNDS.compraSegundos }
    this.config.mapa = escenarioDeSala(this.config.modo, mapa)
    if (Number.isFinite(compra) && ROUNDS.compraOpciones.includes(compra)) this.config.compra = compra
    /** Los de la sala, por su id de lobby (`j1`, `j2`…), en orden de llegada. */
    this.miembros = new Map()
    this._siguiente = 0
    /** Quién manda: el primero que llegó y sigue dentro. */
    this.anfitrion = null
    /** La partida en curso o la última jugada, o null. */
    this.partida = null
    this.numeroPartida = 0
    /** El paso del mundo cuando no hay partida: sigue contando para no volver atrás. */
    this._paso = 0
    this._escenarios = new Map()
    this._estadoPublicado = ''
    /**
     * **La cuenta atrás del LISTO** (vuelta 107, D2), o null. `desde` y
     * `todosDesde` son del reloj de pared; `fase` es 0, 1 (aviso) o 2 (urgente),
     * y cambia la foto de la sala cuando cambia.
     */
    this.cuenta = null
    /** El reloj de la cuenta: lo cambian los bancos para no esperar 45 s de verdad. */
    this.ahora = () => Date.now()
  }

  // --------------------------------------------------------- lo que ve el huésped

  get paso() {
    return this.partida ? this.partida.paso : this._paso
  }

  get pausada() {
    return this.partida ? this.partida.pausada : false
  }

  get conectados() {
    return [...this.miembros.values()].filter((m) => !m.desconectado)
  }

  get vacia() {
    return this.conectados.length === 0
  }

  /** Los jugadores de la partida, para `/salud`. */
  get jugadores() {
    return this.partida ? this.partida.jugadores : new Map()
  }

  informe() {
    return this.partida ? this.partida.informe() : []
  }

  /** Los huecos que ofrece la sala con su modo y su mapa: el tope, no cuántos hay. */
  get huecos() {
    const { modo, mapa } = this.config
    if (esModoDeEquipos(modo)) return plazasDeModo(modo)
    return capacidadDeTodos(this._escenario(modo, mapa).definition).max
  }

  _escenario(modo, mapa) {
    const clave = `${modo}|${mapa}`
    let e = this._escenarios.get(clave)
    if (!e) {
      e = this.crearEscenario(modo, mapa)
      this._escenarios.set(clave, e)
    }
    return e
  }

  // ------------------------------------------------------------- entrar y salir

  /**
   * Entra alguien, o vuelve con su pase. Devuelve su id de lobby, o null si la
   * sala está llena.
   */
  entra(enviar, pase = null) {
    const vuelve = pase ? [...this.miembros.values()].find((m) => m.pase === pase) : null
    if (vuelve) return this._reconectar(vuelve, enviar)
    const conHueco = [...this.miembros.values()].filter((m) => m.hueco !== null).length
    if (this.miembros.size >= this.huecos + EN_ESPERA || (this.auto && conHueco >= this.huecos)) return null
    const numero = ++this._siguiente
    const m = {
      id: `j${numero}`,
      numero,
      /** Su nombre en la sala. No hay cuentas: es el orden de llegada. */
      nick: `VK-${String(numero).padStart(2, '0')}`,
      enviar,
      pase: `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`,
      hueco: null,
      listo: false,
      /** Ha pulsado «Volver a jugar»: está en el lobby aunque la partida acabada siga. */
      vuelto: false,
      desconectado: null,
      /** Su id en la partida en curso, o null si no juega en ella. */
      pid: null,
      pasePartida: null,
    }
    this.miembros.set(m.id, m)
    if (!this.anfitrion) this.anfitrion = m.id
    this._sentar(m)
    if (this.auto) this._entrarDirecto(m)
    this._publicar(true)
    return m.id
  }

  _reconectar(m, enviar) {
    m.enviar = enviar
    m.desconectado = null
    // Primero la sala, que es lo que dice qué mapa montar; después la partida,
    // que reconecta su butaca y manda su bienvenida.
    this._publicar(true)
    if (m.pid && this.partida?.jugadores.has(m.pid)) {
      this.partida.entra(this._sumidero(m, this.partida), m.pasePartida)
    } else {
      m.pid = null
    }
    return m.id
  }

  /** Se va, y lo ha dicho (`MSG.ADIOS`). */
  abandona(id) {
    const m = this.miembros.get(id)
    if (!m) return
    if (m.pid && this.partida) this.partida.abandona(m.pid)
    this.miembros.delete(id)
    if (this.anfitrion === id) this.anfitrion = this.conectados[0]?.id ?? [...this.miembros.keys()][0] ?? null
    this._quizaSoltarPartida()
    this._publicar(true)
  }

  /** Se ha cortado el cable: se guarda su sitio (vuelta 62). */
  sedesconecta(id) {
    const m = this.miembros.get(id)
    if (!m || m.desconectado) return
    m.desconectado = { desde: Date.now() }
    m.enviar = () => {}
    if (m.pid && this.partida) this.partida.sedesconecta(m.pid)
    // **El mando pasa a quien sigue**, y vuelve si el anfitrión regresa: una
    // sala no puede quedarse sin nadie que pueda lanzar porque a uno se le fue
    // el wifi.
    if (this.anfitrion === id) this.anfitrion = this.conectados[0]?.id ?? id
    this._publicar(true)
  }

  reclama(id) {
    const m = this.miembros.get(id)
    if (m?.pid && this.partida) this.partida.reclama(m.pid)
  }

  // ---------------------------------------------------------------- mensajes

  recibe(id, datos) {
    const m = this.miembros.get(id)
    if (!m) return
    // **Un vistazo antes de leer**: la partida recibe sesenta entradas por
    // segundo y jugador, y parsearlas dos veces —aquí y allí— sería el doble de
    // trabajo para mirar una letra. Los mensajes del lobby empiezan por `l`.
    if (datos.startsWith('{"t":"l')) {
      let mensaje
      try {
        mensaje = JSON.parse(datos)
      } catch {
        return
      }
      if (esDelLobby(mensaje.t)) this._delLobby(m, mensaje)
      return
    }
    if (m.pid && this.partida) this.partida.recibe(m.pid, datos)
  }

  _delLobby(m, mensaje) {
    const esAnfitrion = m.id === this.anfitrion
    switch (mensaje.t) {
      case MSG.CONFIG:
        if (esAnfitrion && !this._enJuego()) this._configurar(mensaje)
        break
      case MSG.LISTO:
        m.listo = Boolean(mensaje.v) && m.hueco !== null
        break
      case MSG.HUECO: {
        const h = Number(mensaje.h)
        if (Number.isInteger(h) && h >= 0 && h < this.huecos && !this._ocupado(h)) m.hueco = h
        break
      }
      case MSG.MEZCLAR:
        if (esAnfitrion && !this._enJuego()) this._mezclar()
        break
      case MSG.LANZAR:
        if (esAnfitrion) this._lanzar()
        break
      case MSG.VOLVER:
        // **«Volver a jugar» es volver al lobby y estar listo** (vuelta 101):
        // un solo gesto para los dos, que es lo que se pidió.
        m.vuelto = true
        m.listo = m.hueco !== null
        break
      case MSG.ENTRAR:
        this._entrarEnMarcha(m)
        break
      case MSG.SACAR: {
        // **Sacar de la sala** (vuelta 107, D2): del anfitrión, a otro, y fuera
        // de una partida en juego — echar a alguien a mitad de una ronda es
        // decidirle la ronda a su equipo.
        const otro = this.miembros.get(mensaje.id)
        if (esAnfitrion && otro && otro !== m && !this._enJuego()) this._expulsar(otro, CUENTA_DE_SALA.motivoSacado)
        return
      }
      default:
        return
    }
    this._publicar(true)
  }

  // ------------------------------------------------------------------- reglas

  _enJuego() {
    return Boolean(this.partida && !this.partida.terminada && this.partida.conectados.length > 0)
  }

  _ocupado(h) {
    for (const m of this.miembros.values()) if (m.hueco === h) return true
    return false
  }

  /**
   * **Dónde se sienta quien llega.** En un modo por equipos, en el bando que
   * tenga menos; si no queda ninguno libre, espera sin hueco — puede mirar la
   * sala y cogerlo en cuanto se libere.
   */
  _sentar(m) {
    const huecos = this.huecos
    if (m.hueco !== null && m.hueco < huecos && ![...this.miembros.values()].some((o) => o !== m && o.hueco === m.hueco)) return
    m.hueco = null
    const libres = []
    for (let h = 0; h < huecos; h++) if (!this._ocupado(h)) libres.push(h)
    if (libres.length === 0) return
    if (esModoDeEquipos(this.config.modo)) {
      const cuenta = [0, 0]
      for (const o of this.miembros.values()) if (o.hueco !== null) cuenta[bandoDeRanura(o.hueco)] += 1
      const bando = cuenta[1] < cuenta[0] ? 1 : 0
      m.hueco = libres.find((h) => bandoDeRanura(h) === bando) ?? libres[0]
    } else {
      m.hueco = libres[0]
    }
  }

  _configurar({ modo, mapa, compra }) {
    const antes = `${this.config.modo}|${this.config.mapa}`
    if (modo !== undefined) this.config.modo = modoDeSala(modo)
    this.config.mapa = escenarioDeSala(this.config.modo, mapa !== undefined ? mapa : this.config.mapa)
    if (compra !== undefined && ROUNDS.compraOpciones.includes(Number(compra))) this.config.compra = Number(compra)
    if (`${this.config.modo}|${this.config.mapa}` === antes) return
    /**
     * **Cambiar el modo o el mapa desmarca a todos** (vuelta 101). Estar listo
     * es estar listo **para algo**, y ese algo acaba de cambiar: un LISTO que se
     * dio para un duelo en El Espejo no puede lanzar un 5v5 en Los Pilares.
     * La fase de compra no desmarca: es cuánto se tarda en empezar, no a qué.
     */
    for (const m of this.miembros.values()) m.listo = false
    // **Y la cuenta atrás vuelve a empezar** (vuelta 107, D2): los 45 s eran
    // para decidirse sobre el mapa de antes.
    this.cuenta = null
    // Y se vuelve a sentar a cada uno, en orden de llegada: un 5v5 que pasa a
    // duelo deja a ocho sin hueco, y un duelo que pasa a 3v3 reparte los bandos.
    const orden = [...this.miembros.values()]
    for (const m of orden) m.hueco = null
    for (const m of orden) this._sentar(m)
  }

  /** **Mezclar**: los que tienen hueco, al azar y equilibrados. */
  _mezclar() {
    if (!esModoDeEquipos(this.config.modo)) return
    const sentados = [...this.miembros.values()].filter((m) => m.hueco !== null)
    for (let i = sentados.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[sentados[i], sentados[j]] = [sentados[j], sentados[i]]
    }
    for (const m of sentados) m.hueco = null
    // Alternando bando, que es lo que la ranura par/impar ya hace sola.
    sentados.forEach((m, i) => { m.hueco = i })
  }

  /**
   * **Qué falta para poder lanzar**, dicho para la pantalla. Lo miran el botón
   * del anfitrión y el aviso de «Faltan X jugadores» de todos, y es la misma
   * función que decide si `_lanzar` hace algo: un botón encendido que el
   * servidor ignora sería el fallo de la vuelta 67.
   */
  requisitos() {
    const modo = this.config.modo
    const listos = [...this.miembros.values()].filter((m) => m.listo && m.hueco !== null && !m.desconectado)
    const minimo = minimoParaLanzar(modo)
    let faltan = 0
    let motivo = ''
    if (esModoDeEquipos(modo)) {
      const porBando = [0, 0]
      for (const m of listos) porBando[bandoDeRanura(m.hueco)] += 1
      faltan = (porBando[0] === 0 ? 1 : 0) + (porBando[1] === 0 ? 1 : 0)
      if (faltan > 0) {
        motivo = porBando[0] === 0 && porBando[1] === 0
          ? 'Falta un jugador listo en cada equipo'
          : `Falta un jugador listo en el equipo ${porBando[0] === 0 ? 'azul' : 'magenta'}`
      }
    } else {
      faltan = Math.max(0, minimo - listos.length)
      if (faltan > 0) motivo = `${faltan === 1 ? 'Falta' : 'Faltan'} ${faltan} jugador${faltan === 1 ? '' : 'es'} listo${faltan === 1 ? '' : 's'} para comenzar`
      /**
       * **Y no se lanza con más gente de la que cabe** (vuelta 105). Cada mapa
       * del todos contra todos admite tantos como salidas tenga; cambiar a uno
       * más pequeño deja a alguien sin hueco, y lanzar así sería empezar una
       * partida dejándole mirando. Cuenta todo el que está en la sala —también
       * quien se ha caído, que conserva su sitio (vuelta 62)—.
       */
      const enSala = this.miembros.size
      if (enSala > this.huecos) {
        const sobran = enSala - this.huecos
        motivo = `Sois ${enSala} y en este mapa caben ${this.huecos}: elige uno con más salidas o que salga${sobran === 1 ? '' : 'n'} ${sobran}`
        faltan = Math.max(faltan, 1)
      }
    }
    if (!motivo && this._enJuego()) motivo = 'Hay una partida en juego'
    return { listos: listos.length, minimo, maximo: this.huecos, faltan, puede: faltan === 0 && !this._enJuego(), motivo }
  }

  /**
   * **Lanzar**: una partida nueva con los listos. La sala se publica **antes**
   * de meterlos, porque es lo que les dice qué mapa montar; la bienvenida de la
   * partida llega detrás, sobre el mapa ya puesto.
   */
  _lanzar() {
    const req = this.requisitos()
    if (!req.puede) return
    const listos = [...this.miembros.values()].filter((m) => m.listo && m.hueco !== null && !m.desconectado)
    const { modo, mapa, compra } = this.config
    const escenario = this.crearEscenario(modo, mapa)
    this.partida = new Partida({
      escenario,
      ...this.opcionesDePartida,
      modo,
      compraSegundos: compra,
      pasoInicial: this.paso,
      numero: ++this.numeroPartida,
      arranqueManual: true,
      // **Y vigila la inactividad** (vuelta 107, D3): quien pasa dos minutos sin
      // tocar nada sale **de la sala**, con su motivo, como quien no marcó LISTO.
      afk: true,
    })
    const partida = this.partida
    partida.alExpulsar = (pid, razon) => {
      if (this.partida !== partida) return
      const m = [...this.miembros.values()].find((o) => o.pid === pid)
      if (m) this._expulsar(m, razon)
      else partida.abandona(pid)
    }
    for (const m of this.miembros.values()) {
      m.pid = null
      m.pasePartida = null
      m.vuelto = false
    }
    for (const m of listos) m.pid = 'entrando'
    this._publicar(true)
    for (const m of listos) {
      const pid = this.partida.entra(this._sumidero(m, this.partida), null, { ranura: m.hueco, nick: m.nick })
      m.pid = pid
      m.pasePartida = pid ? this.partida.jugadores.get(pid).pase : null
      m.listo = false
    }
    this.partida.arrancar()
    this._publicar(true)
  }

  /**
   * **Entrar con la partida en marcha**, sólo en el todos contra todos: ahí no
   * hay rondas que desequilibrar y una butaca libre es sitio para uno más. En
   * los de equipos se espera a la siguiente, que es lo que hace el CS.
   */
  _entrarEnMarcha(m) {
    if (!this.partida || this.partida.terminada || esModoDeEquipos(this.partida.modo)) return
    if (m.pid || m.hueco === null || m.desconectado) return
    const pid = this.partida.entra(this._sumidero(m, this.partida), null, { ranura: m.hueco, nick: m.nick })
    if (!pid) return
    m.pid = pid
    m.pasePartida = this.partida.jugadores.get(pid).pase
    m.vuelto = false
  }

  /** Sin lobby (`auto`): quien llega entra a jugar, como hasta la vuelta 100. */
  _entrarDirecto(m) {
    if (!this.partida) {
      const { modo, mapa, compra } = this.config
      this.partida = new Partida({
        escenario: this.crearEscenario(modo, mapa),
        ...this.opcionesDePartida,
        modo,
        compraSegundos: compra,
        pasoInicial: this.paso,
        numero: ++this.numeroPartida,
      })
    }
    m.listo = true
    m.pid = 'entrando'
    this._publicar(true)
    const pid = this.partida.entra(this._sumidero(m, this.partida), null, { ranura: m.hueco, nick: m.nick })
    m.pid = pid
    m.pasePartida = pid ? this.partida.jugadores.get(pid).pase : null
  }

  /**
   * **El `enviar` que se le da a la partida**, atado a ella: si la partida deja
   * de ser la de la sala —se lanza otra—, lo que diga ya no llega a nadie. Sin
   * esto, una partida vieja seguiría hablándole a quien ya juega en la nueva.
   */
  _sumidero(m, partida) {
    return (texto) => {
      if (this.partida === partida) m.enviar(texto)
    }
  }

  /** Sin nadie jugando, la partida se suelta y el paso sigue desde donde iba. */
  _quizaSoltarPartida() {
    if (!this.partida) return
    if (this.partida.jugadores.size > 0) return
    this._paso = this.partida.paso
    this.partida = null
    for (const m of this.miembros.values()) m.pid = null
  }

  // ------------------------------------------------------- la cuenta atrás (D2)

  /**
   * **Quién está en la sala esperando jugar**: con hueco, con cable y mirando la
   * sala —no quien está en una partida, ni quien sigue en la pantalla del final
   * sin haber pulsado «Volver a jugar»—. Es a quien la cuenta mira y a quien
   * puede echar.
   */
  _presentes() {
    return [...this.miembros.values()].filter((m) => m.hueco !== null && !m.desconectado && (!m.pid || m.vuelto))
  }

  /** ¿Con esta gente se puede jugar? La misma regla que `requisitos`, sin mirar LISTO. */
  _bastan(lista) {
    const modo = this.config.modo
    if (esModoDeEquipos(modo)) {
      const porBando = [0, 0]
      for (const m of lista) porBando[bandoDeRanura(m.hueco)] += 1
      return porBando[0] > 0 && porBando[1] > 0
    }
    return lista.length >= minimoParaLanzar(modo) && this.miembros.size <= this.huecos
  }

  /**
   * **La cuenta atrás, en cada paso** (vuelta 107, D2). Se arma sola cuando hay
   * gente suficiente, se para sola cuando deja de haberla, y al llegar al final
   * lanza con los listos y saca a los demás. Todo lo que cambia se publica en
   * la foto de la sala, que es lo que ven las pantallas.
   */
  _cuentaTick() {
    if (this.auto) return
    const ahora = this.ahora()
    const presentes = this._enJuego() ? [] : this._presentes()
    if (!this._bastan(presentes)) {
      if (this.cuenta) { this.cuenta = null; this._publicar(true) }
      return
    }
    if (!this.cuenta) {
      this.cuenta = { desde: ahora, todosDesde: null, fase: 0 }
      this._publicar(true)
    }
    const c = this.cuenta
    const todos = presentes.every((m) => m.listo) && this.requisitos().puede
    if (todos !== (c.todosDesde !== null)) {
      c.todosDesde = todos ? ahora : null
      this._publicar(true)
    }
    const t = ahora - c.desde
    const fase = t >= CUENTA_DE_SALA.urgenteSegundos * 1000 ? 2 : t >= CUENTA_DE_SALA.avisoSegundos * 1000 ? 1 : 0
    if (fase !== c.fase) { c.fase = fase; this._publicar(true) }
    if (c.todosDesde !== null && ahora - c.todosDesde >= CUENTA_DE_SALA.todosListosSegundos * 1000) {
      this.cuenta = null
      this._lanzar()
      return
    }
    if (t < CUENTA_DE_SALA.totalSegundos * 1000) return
    // **Se acabó el tiempo**: fuera quien no marcó, y a jugar si quedan bastantes.
    this.cuenta = null
    for (const m of presentes) if (!m.listo) this._expulsar(m, CUENTA_DE_SALA.motivoNoListo)
    if (this.requisitos().puede) this._lanzar()
    else this._publicar(true)
  }

  /** Lo que le queda a la cuenta, en ms, para la foto de la sala. */
  _restaDeCuenta() {
    const c = this.cuenta
    if (!c) return null
    const ahora = this.ahora()
    const total = CUENTA_DE_SALA.totalSegundos * 1000 - (ahora - c.desde)
    const todos = c.todosDesde === null ? Infinity : CUENTA_DE_SALA.todosListosSegundos * 1000 - (ahora - c.todosDesde)
    return Math.max(0, Math.min(total, todos))
  }

  /**
   * **Sacar a alguien de la sala, diciéndole por qué.** El `ADIOS` es el mensaje
   * de siempre (vuelta 62) y la pantalla ya sabe enseñar su motivo en rojo; su
   * sitio se libera como si se hubiera ido él.
   */
  _expulsar(m, razon) {
    try {
      m.enviar(JSON.stringify({ t: MSG.ADIOS, razon }))
    } catch {
      /* el cable se está cerrando */
    }
    this.abandona(m.id)
  }

  // --------------------------------------------------------------------- reloj

  tick() {
    this._cuentaTick()
    if (this.partida) this.partida.tick()
    else this._paso += 1
    // Una vez por segundo: lo que caduca y lo que ha cambiado de estado solo.
    if (this.paso % 60 !== 0) return
    this._mantener()
  }

  /**
   * **Lo que cambia sin que nadie mande un mensaje**: la partida que se acaba
   * sola, la butaca que la partida da por abandonada, y quien lleva demasiado
   * sin cable fuera de una partida.
   */
  _mantener() {
    const tope = ROUNDS.reconexionSegundos * 1000
    const ahora = Date.now()
    for (const m of [...this.miembros.values()]) {
      if (m.pid && m.pid !== 'entrando' && this.partida && !this.partida.jugadores.has(m.pid)) m.pid = null
      if (m.desconectado && !m.pid && ahora - m.desconectado.desde >= tope) this.abandona(m.id)
    }
    this._quizaSoltarPartida()
    this._publicar(false)
  }

  // ------------------------------------------------------------------ la foto

  /**
   * **El estado de la sala, a cada uno el suyo**: lo común se escribe una vez
   * y cada destinatario lleva además quién es. Se manda **al cambiar**, no por
   * paso — la sala cambia cada varios segundos.
   *
   * @param {boolean} forzar mandarlo aunque no haya cambiado nada visible
   */
  _publicar(forzar) {
    const p = this.partida
    const estado = !p ? 'ninguna' : p.terminada ? 'fin' : 'juego'
    const comun = {
      anf: this.anfitrion,
      modo: this.config.modo,
      mapa: this.config.mapa,
      compra: this.config.compra,
      huecos: this.huecos,
      m: [...this.miembros.values()].map((m) => ({
        id: m.id,
        n: m.nick,
        h: m.hueco,
        ...(m.listo ? { l: 1 } : null),
        ...(m.vuelto ? { v: 1 } : null),
        ...(m.desconectado ? { c: 1 } : null),
        ...(m.pid ? { p: 1 } : null),
      })),
      pt: p ? { n: p.numero, e: estado, modo: p.modo, mapa: p.escenario.key } : { n: 0, e: 'ninguna' },
      req: this.requisitos(),
      // La cuenta atrás (vuelta 107): cuánto le queda, en qué fase está y si es
      // la corta de «todos listos». Cuánto queda se redondea al segundo, que es
      // lo que se enseña: así la foto sólo cambia una vez por segundo.
      ...(this.cuenta ? { cta: { s: Math.ceil(this._restaDeCuenta() / 1000), f: this.cuenta.fase, ...(this.cuenta.todosDesde !== null ? { t: 1 } : null) } } : null),
    }
    const texto = JSON.stringify(comun)
    if (!forzar && texto === this._estadoPublicado) return
    this._estadoPublicado = texto
    const cuerpo = texto.slice(1)
    for (const m of this.miembros.values()) {
      if (m.desconectado) continue
      // **Y su pase**, que es suyo y de nadie más: es lo que le devuelve a su
      // sitio si recarga o se le cae el cable (vuelta 62).
      m.enviar(`{"t":"${MSG.LOBBY}","tu":"${m.id}","pase":"${m.pase}",${cuerpo}`)
    }
  }
}

