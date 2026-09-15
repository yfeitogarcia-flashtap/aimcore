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
import { NET, SIM, SIM_STEP_MS } from '../src/config.js'
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
      /** Paso en que vuelve a estar vivo, o 0. */
      reaparecerEn: 0,
      /** Veredictos pendientes de mandarle. */
      disparos: [],
      bajas: 0,
      muertes: 0,
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
      jugador.reaparecerEn = 0
      jugador.historial.fill(null)
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

  /** Un paso del mundo. Lo llama el huésped a 60 Hz. */
  tick() {
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
      if (jugador.reaparecerEn > 0 && this.paso >= jugador.reaparecerEn) this._reaparecer(jugador)
      this._anotarCuerpo(jugador, this.paso)
    }

    if (this.paso % NET.snapshotEvery !== 0) return
    const foto = { t: MSG.FOTO, n: this.paso, p: {} }
    for (const jugador of this.jugadores.values()) {
      foto.p[jugador.id] = {
        ack: jugador.ack,
        hambre: jugador.hambre,
        vida: jugador.vida,
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
        `vida ${j.vida} ↑${(j.bytesEntrada / 1024).toFixed(2)} ↓${(j.bytesSalida / 1024).toFixed(2)} KB`
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
    desempaquetarTeclas(entrada.k, m.keys)
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
      seq: d.seq, impacto: false, zona: null, dano: 0, tapado: false,
      sinRebobinar: false, retroceso: 0, lateral: 0, rebobinadoMs: 0,
      pedidoMs: 0, topado: false,
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

    if (veredicto.impacto) this._aplicarDano(rival, veredicto.dano, tirador)
    this._anotarVeredicto(tirador, salida)
  }

  /** Un veredicto vive unas cuantas fotos, para que perder una no lo pierda. */
  _anotarVeredicto(jugador, dato) {
    jugador.disparos.push({ dato, ttl: NET.verdictRepeats })
  }

  /** Vida, y nada más: ni escudo, ni casco, ni reaparición escalada. */
  _aplicarDano(victima, dano, tirador) {
    if (victima.vida <= 0) return
    victima.vida = Math.max(0, victima.vida - dano)
    if (victima.vida > 0) return
    victima.muertes += 1
    tirador.bajas += 1
    victima.reaparecerEn = this.paso + Math.round(NET.respawnMs / SIM_STEP_MS)
  }

  _reaparecer(jugador) {
    // Su ranura de siempre: reaparecer no te cambia de sitio ni de color. Antes
    // salía de `indexOf` sobre el mapa, que cambia cuando alguien se va.
    const salida = this.salidas[jugador.equipo]
    jugador.movimiento.reset()
    jugador.pose.position.x = salida.x
    jugador.pose.position.z = salida.z
    jugador.vida = 100
    jugador.reaparecerEn = 0
  }
}
