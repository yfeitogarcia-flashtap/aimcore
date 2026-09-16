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
import { NET, PAUSE, SIM, SIM_STEP_MS, WEAPONS, WEAPON_ORDER } from '../src/config.js'
import { MovementController } from '../src/game/movement.js'
import { crearPose, cuerpoDeJugador } from './pose.js'
import { direccionDeMira, resolverDisparo } from './disparo.js'
import { MSG, desempaquetarTeclas, instanteDePaso, instanteEnPaso } from './protocolo.js'

export class Partida {
  /**
   * @param {object} opciones
   * @param {import('../src/game/scenario.js').Scenario} opciones.escenario
   * @param {number} [opciones.colchon] pasos de amortiguador contra el jitter
   * @param {boolean} [opciones.depurar] atiende `MSG.COLOCAR` (bancos de prueba)
   */
  constructor({ escenario, colchon = NET.jitterBufferTicks, depurar = false }) {
    this.escenario = escenario
    this.colchon = colchon
    this.depurar = depurar
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
    /** Dos sitios de salida separados, para no aparecer uno dentro del otro. */
    this.salidas = [
      { x: escenario.spawn.x - 2.5, z: escenario.spawn.z },
      { x: escenario.spawn.x + 2.5, z: escenario.spawn.z },
    ]
  }

  get llena() {
    return this.jugadores.size >= 2
  }

  get vacia() {
    return this.jugadores.size === 0
  }

  /**
   * ¿Está el mundo parado? Lo pregunta el huésped para no gastar pasos. Una
   * votación en curso **no** lo para (vuelta 55): mientras se decide se juega.
   */
  get pausada() {
    return this.pausa !== null
  }

  /**
   * Un jugador entra. Devuelve su id, o null si la partida está llena.
   * @param {(texto: string) => void} enviar
   */
  entra(enviar) {
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
    }
    this.jugadores.set(jugador.id, jugador)

    enviar(
      JSON.stringify({
        t: MSG.BIENVENIDA,
        id: jugador.id,
        equipo,
        escenario: this.escenario.key,
        hz: SIM.hz,
        n: this.paso,
        salida: { x: pose.position.x, z: pose.position.z },
      }),
    )
    return jugador.id
  }

  sale(id) {
    this.jugadores.delete(id)
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
    const faltan = Math.max(0, this.jugadores.size - 1 - v.votos.size)
    if (faltan > 0 && !porTiempo) return
    if (aFavor > enContra) aFavor += faltan
    else enContra += faltan
    this.votacion = null
    // **Y si sale, es la pausa votada de la 54, sin tocar nada**: su tope, su
    // cuenta atrás y su dueño son los mismos.
    if (aFavor > enContra) this.pausa = this._conCuenta(v.por, PAUSE.votedMaxSeconds)
  }

  /** Un paso del mundo. Lo llama el huésped a 60 Hz. */
  tick() {
    // **Toda pausa tiene su final** (vuelta 54): se reanuda sola al agotar su
    // tope, porque sin tope el único límite de un mundo parado era que el otro
    // se dignara a volver. Y va **antes** del corte de abajo, para que el paso
    // en que caduca sea ya un paso normal en vez de uno más de pausa.
    if (this.pausa && Date.now() >= this.pausa.expiraEn) this.pausa = null
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

    if (this.paso % NET.snapshotEvery !== 0) return
    this._enviarFoto()
  }

  _enviarFoto() {
    const foto = { t: MSG.FOTO, n: this.paso, p: {} }
    // Sólo cuando hay algo que contar: en una partida normal esto no ocupa nada.
    // `resta` son los milisegundos que le quedan a la pausa —o a la votación—,
    // y se calculan **aquí**: el cliente no tiene el reloj del servidor, y una
    // cuenta atrás que cada pantalla calculase por su cuenta acabaría diciendo
    // dos cosas distintas del mismo cartel.
    if (this.pausa) {
      foto.pa = { por: this.pausa.por, resta: Math.max(0, this.pausa.expiraEn - Date.now()) }
    }
    if (this.votacion) {
      foto.vo = { por: this.votacion.por, resta: Math.max(0, this.votacion.expiraEn - Date.now()) }
    }
    for (const jugador of this.jugadores.values()) {
      foto.p[jugador.id] = {
        ack: jugador.ack,
        hambre: jugador.hambre,
        vida: jugador.vida,
        vivoEn: jugador.vivoEn,
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
    if (!rival || !tirador.vida) {
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

    const veredicto = resolverDisparo(origen, d.yaw, d.pitch, cuerpo, this.escenario.occluders)
    // **El control**: el mismo disparo sin rebobinar nada. No decide nada, se
    // manda para poder medir qué compra la compensación.
    const sin = resolverDisparo(origen, d.yaw, d.pitch, ahora, this.escenario.occluders)

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

    if (veredicto.impacto) salida.baja = this._aplicarDano(rival, veredicto.dano, tirador)
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
    const intervalo = 60000 / arma.rpm - NET.shotRateSlackTicks * SIM_STEP_MS
    if (instante < tirador.ultimoTiroEn + intervalo) return false
    tirador.ultimoTiroEn = instante
    return true
  }

  /** Un veredicto vive unas cuantas fotos, para que perder una no lo pierda. */
  _anotarVeredicto(jugador, dato) {
    jugador.disparos.push({ dato, ttl: NET.verdictRepeats })
  }

  /**
   * Vida, y nada más: ni escudo, ni casco, ni reaparición escalada.
   * Devuelve si el disparo ha sido **baja**, que es lo que el tirador necesita
   * saber al instante.
   */
  _aplicarDano(victima, dano, tirador) {
    if (victima.vida <= 0) return false
    victima.vida = Math.max(0, victima.vida - dano)
    if (victima.vida > 0) return false
    victima.muertes += 1
    tirador.bajas += 1
    // **En el reloj de la víctima**, que es el único que ella y su cliente
    // comparten: dentro de tantas entradas suyas vuelve. Como produce una por
    // paso, son los `respawnMs` de siempre.
    victima.vivoEn = victima.ack + Math.round(NET.respawnMs / SIM_STEP_MS)
    return true
  }

  _reaparecer(jugador) {
    // Su ranura de siempre: reaparecer no te cambia de sitio ni de color. Antes
    // salía de `indexOf` sobre el mapa, que cambia cuando alguien se va.
    const salida = this.salidas[jugador.equipo]
    jugador.movimiento.reset()
    jugador.pose.position.x = salida.x
    jugador.pose.position.z = salida.z
    jugador.vida = 100
    jugador.vivoEn = 0
    // Reaparecer recarga, así que el reloj de cadencia vuelve a cero: arrastrar
    // el del último disparo de antes de morir castigaría el primer tiro nuevo.
    jugador.ultimoTiroEn = -Infinity
  }
}
