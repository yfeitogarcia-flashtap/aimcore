/**
 * **El servidor autoritativo, versión de sobremesa** (vuelta 45).
 *
 * Node + `ws`, sin despliegue y sin nube: el objetivo de esta vuelta es ver
 * funcionar la predicción y la reconciliación con dos pestañas del mismo
 * navegador, no montar infraestructura. Cloudflare Durable Objects viene
 * después (`docs/propuestas/02-multijugador-1v1.md`).
 *
 * Lo que hay que mirar de aquí es **cuánto código de juego tiene**: ninguno.
 * Importa `movement.js`, `scenario.js` y `config.js` tal cual, les pone un
 * objeto plano donde iría la cámara (`pose.js`) y ya tiene la física del juego
 * corriendo fuera del navegador. Lo único propio del servidor es el reparto de
 * entradas y el paso del reloj.
 *
 * **El servidor no adivina.** Si a un jugador no le ha llegado la entrada de un
 * paso, ese jugador **no avanza** ese paso, y cuando llegue se pone al día
 * consumiendo hasta `NET.maxCatchUpTicks` seguidas. La alternativa —repetir la
 * última entrada— mete un paso que el cliente nunca predijo, o sea una
 * corrección inventada por el servidor. Prefiero que la corrección aparezca
 * sólo cuando hay una causa de verdad: pérdida de paquetes.
 */
import * as THREE from 'three'
import { WebSocketServer } from 'ws'
import { NET, SIM, SIM_STEP_MS } from '../src/config.js'
import { MovementController } from '../src/game/movement.js'
import { Scenario } from '../src/game/scenario.js'
import { crearPose, cuerpoDeJugador } from './pose.js'
import { direccionDeMira, resolverDisparo } from './disparo.js'
import { MSG, desempaquetarTeclas, instanteDePaso, instanteEnPaso } from './protocolo.js'

const ESCENARIO = process.env.VEKTOR_ESCENARIO || 'largoYPuerta'
/**
 * El colchón contra el jitter, ajustable desde fuera para poder barrerlo sin
 * tocar `config.js`. El valor de casa es `NET.jitterBufferTicks`.
 */
const COLCHON = Number(process.env.VEKTOR_BUFFER) || NET.jitterBufferTicks
/** Sólo con esto encendido se atiende la colocación de pruebas (ver `MSG.COLOCAR`). */
const DEPURAR = !!process.env.VEKTOR_DEBUG
const escenario = new Scenario(new THREE.Scene(), ESCENARIO)

/** Dos sitios de salida separados, para no aparecer uno dentro del otro. */
const SALIDAS = [
  { x: escenario.spawn.x - 2.5, z: escenario.spawn.z },
  { x: escenario.spawn.x + 2.5, z: escenario.spawn.z },
]

let siguienteId = 0
const jugadores = new Map()

function crearJugador(socket) {
  const ranura = jugadores.size % SALIDAS.length
  const salida = SALIDAS[ranura]
  const pose = crearPose()
  const movimiento = new MovementController(pose)
  movimiento.setScenario(escenario)
  movimiento.reset()
  movimiento.setEnabled(true)
  pose.position.x = salida.x
  pose.position.z = salida.z

  return {
    id: `p${++siguienteId}`,
    socket,
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
     * devuelve `playerBody()` más el propio paso. Con 60 pasos son un segundo,
     * tres veces el rebobinado máximo.
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
}

/** Guarda dónde estaba este jugador al acabar el paso `n`. */
function anotarCuerpo(jugador, n) {
  const p = jugador.pose.position
  const cuerpo = cuerpoDeJugador(p.x, p.z, jugador.movimiento.feetY, jugador.movimiento.eyeHeight)
  cuerpo.n = n
  jugador.historial[n % NET.historyTicks] = cuerpo
}

/**
 * **El cuerpo del rival en un instante del pasado**, interpolado entre los dos
 * pasos que lo rodean. `objetivo` va en pasos fraccionarios.
 *
 * Devuelve null si ese instante se salió del anillo — un cliente con un
 * rebobinado mayor que el historial no puede compensarse, y eso es correcto:
 * el tope de `NET.maxRewindMs` está justo para que no pase.
 */
function cuerpoRebobinado(jugador, objetivo) {
  const suelo = Math.floor(objetivo)
  const techo = Math.ceil(objetivo)
  const a = jugador.historial[((suelo % NET.historyTicks) + NET.historyTicks) % NET.historyTicks]
  const b = jugador.historial[((techo % NET.historyTicks) + NET.historyTicks) % NET.historyTicks]
  // **Comprobar que la ranura es de esta vuelta del anillo.** Un índice siempre
  // devuelve algo; si el paso pedido se salió del historial, lo que devuelve es
  // una posición de hace un segundo, y eso no se distingue de un rebobinado
  // bueno mirando sólo el resultado. Mejor null y que el llamante caiga al
  // presente.
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
function ejecutar(jugador, entrada) {
  const m = jugador.movimiento
  desempaquetarTeclas(entrada.k, m.keys)
  jugador.pose.rotation.y = entrada.yaw
  if (entrada.jt >= 0) m.pressJump(instanteEnPaso(entrada.n, entrada.jt))
  m.update(SIM_STEP_MS / 1000, instanteDePaso(entrada.n))
  jugador.ack = entrada.n
  if (entrada.d) resolverTiro(jugador, entrada)
}

/**
 * **El disparo, juzgado contra lo que el tirador tenía en pantalla.**
 *
 * El instante a rebobinar **no se estima: lo dice el disparo**. El cliente
 * dibuja al rival interpolando entre dos fotos, sabe exactamente en qué paso
 * del servidor lo tiene puesto, y manda ese número (`tv`). El servidor sólo
 * tiene que acotarlo.
 *
 * La primera versión lo estimaba desde el ping —`RTT + interpolación` hacia
 * atrás— y salía **de más**, hasta el doble: el RTT se contaba dos veces sin
 * verse. Una porque la foto que el cliente reconoce salió hace un viaje de
 * ida; otra porque su entrada, al llegar, espera en la cola del servidor
 * justo lo que el cliente se adelanta, que es **otro RTT entero** (vuelta 45).
 * El síntoma: con 25 ms de ida el rebobinado ya se comía el tope de 200 ms, y
 * el rival salía rebobinado 3.8 u —más de medio segundo— con el ping a cero.
 * Medirlo en vez de estimarlo no es una optimización: es la diferencia entre
 * compensar el retraso y compensar el doble del retraso.
 *
 * Lo que sigue siendo del servidor es **el tope** (`NET.maxRewindMs`). `tv` lo
 * manda el cliente, así que un cliente que mintiera pediría rebobinar más; el
 * tope es lo que acota el daño, y es también lo que acota la asimetría que
 * sufre el que recibe —«me han matado detrás de la pared» no puede pasar de
 * ahí—. El día que haya partidas públicas, además del tope habrá que
 * contrastar `tv` con lo que el servidor sabe del ping de ese cliente.
 */
function resolverTiro(tirador, entrada) {
  const d = entrada.d
  const rival = [...jugadores.values()].find((j) => j !== tirador)
  const salida = { seq: d.seq, impacto: false, zona: null, dano: 0, tapado: false,
                   sinRebobinar: false, retroceso: 0, lateral: 0, rebobinadoMs: 0,
                   pedidoMs: 0, topado: false }
  if (!rival || !tirador.vida) {
    anotarVeredicto(tirador, salida)
    return
  }

  // El historial llega hasta `paso − 1`: este paso todavía no se ha anotado.
  const masViejo = paso - 1 - NET.maxRewindMs / SIM_STEP_MS
  const pedido = Number.isFinite(d.tv) ? d.tv : paso - 1
  const objetivo = Math.min(paso - 1, Math.max(masViejo, pedido))
  salida.rebobinadoMs = +((paso - 1 - objetivo) * SIM_STEP_MS).toFixed(1)
  // Lo que **pedía** el tirador, antes del tope. La diferencia entre los dos
  // números es lo que el tope le está negando, y es donde empieza a desacordar.
  salida.pedidoMs = +((paso - 1 - pedido) * SIM_STEP_MS).toFixed(1)
  salida.topado = salida.pedidoMs > salida.rebobinadoMs + 0.01

  const ahora = cuerpoRebobinado(rival, paso - 1)
  const cuerpo = cuerpoRebobinado(rival, objetivo) ?? ahora
  const p = tirador.pose.position
  const origen = { x: p.x, y: p.y, z: p.z }

  const veredicto = resolverDisparo(origen, d.yaw, d.pitch, cuerpo, escenario.occluders)
  // **El control**: el mismo disparo sin rebobinar nada. No decide nada, se
  // manda para poder medir qué compra la compensación.
  const sin = resolverDisparo(origen, d.yaw, d.pitch, ahora, escenario.occluders)

  salida.impacto = veredicto.impacto
  salida.zona = veredicto.zona
  salida.dano = veredicto.dano
  salida.tapado = veredicto.tapado
  salida.sinRebobinar = sin.impacto
  // Lo que se había movido el rival desde el instante rebobinado: es, en
  // unidades, la asimetría que paga el que recibe.
  //
  // Y se manda además **la componente lateral**, que es la que decide si el
  // disparo entra o no: moverse hacia el tirador o alejarse de él no te saca de
  // la línea de tiro, y contar ese trozo diluye la medida. Se proyecta sobre la
  // perpendicular horizontal a la dirección del disparo.
  if (cuerpo && ahora) {
    const dx = ahora.x - cuerpo.x
    const dz = ahora.z - cuerpo.z
    salida.retroceso = +Math.hypot(dx, dz).toFixed(3)
    const dir = direccionDeMira(d.yaw, d.pitch)
    const plano = Math.hypot(dir.x, dir.z) || 1
    // Perpendicular en el plano: (−dz, dx) del propio rumbo, normalizada.
    salida.lateral = +Math.abs((dx * -dir.z + dz * dir.x) / plano).toFixed(3)
  }

  if (veredicto.impacto) aplicarDano(rival, veredicto.dano, tirador)
  anotarVeredicto(tirador, salida)
}

/** Un veredicto vive unas cuantas fotos, para que perder una no lo pierda. */
function anotarVeredicto(jugador, dato) {
  jugador.disparos.push({ dato, ttl: NET.verdictRepeats })
}

/** Vida, y nada más: ni escudo, ni casco, ni reaparición escalada. */
function aplicarDano(victima, dano, tirador) {
  if (victima.vida <= 0) return
  victima.vida = Math.max(0, victima.vida - dano)
  if (victima.vida > 0) return
  victima.muertes += 1
  tirador.bajas += 1
  victima.reaparecerEn = paso + Math.round(NET.respawnMs / SIM_STEP_MS)
}

function reaparecer(jugador) {
  const salida = SALIDAS[[...jugadores.keys()].indexOf(jugador.id) % SALIDAS.length]
  jugador.movimiento.reset()
  jugador.pose.position.x = salida.x
  jugador.pose.position.z = salida.z
  jugador.vida = 100
  jugador.reaparecerEn = 0
}

let paso = 0

function tick() {
  paso += 1
  for (const jugador of jugadores.values()) {
    if (!jugador.cebado) {
      if (jugador.cola.length < COLCHON) continue
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
    const exceso = jugador.cola.length - COLCHON
    const cuantas = Math.min(1 + Math.max(0, exceso), NET.maxCatchUpTicks)
    for (let i = 0; i < cuantas; i++) ejecutar(jugador, jugador.cola.shift())
  }

  // **Y dónde ha quedado cada uno.** Se anota siempre, incluso para quien no
  // avanzó por falta de entrada: no moverse también es una posición, y el
  // rebobinado tiene que encontrar algo en cada paso del anillo.
  for (const jugador of jugadores.values()) {
    if (jugador.reaparecerEn > 0 && paso >= jugador.reaparecerEn) reaparecer(jugador)
    anotarCuerpo(jugador, paso)
  }

  if (paso % NET.snapshotEvery !== 0) return
  const foto = { t: MSG.FOTO, n: paso, p: {} }
  for (const jugador of jugadores.values()) {
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
  for (const jugador of jugadores.values()) {
    if (jugador.socket.readyState !== 1) continue
    jugador.socket.send(texto)
    jugador.bytesSalida += texto.length
  }
}

/**
 * El reloj del servidor. Se apunta al instante exacto del paso siguiente en vez
 * de dormir un intervalo fijo: `setInterval` deriva, y aquí la deriva es que el
 * servidor consuma entradas a otro ritmo del que las produce el cliente.
 */
const arranque = performance.now()
function programar() {
  const objetivo = arranque + (paso + 1) * SIM_STEP_MS
  const espera = Math.max(0, objetivo - performance.now())
  setTimeout(() => {
    tick()
    programar()
  }, espera)
}

const wss = new WebSocketServer({ port: NET.port })
wss.on('connection', (socket) => {
  if (jugadores.size >= 2) {
    socket.send(JSON.stringify({ t: MSG.ADIOS, razon: 'la partida está llena (1v1)' }))
    socket.close()
    return
  }
  const jugador = crearJugador(socket)
  jugadores.set(jugador.id, jugador)
  console.log(`+ ${jugador.id} conectado (${jugadores.size}/2)`)

  socket.send(
    JSON.stringify({
      t: MSG.BIENVENIDA,
      id: jugador.id,
      escenario: ESCENARIO,
      hz: SIM.hz,
      n: paso,
      salida: { x: jugador.pose.position.x, z: jugador.pose.position.z },
    }),
  )

  socket.on('message', (datos) => {
    jugador.bytesEntrada += datos.length
    let mensaje
    try {
      mensaje = JSON.parse(datos)
    } catch {
      return
    }
    if (mensaje.t === MSG.COLOCAR && DEPURAR) {
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
  })

  socket.on('close', () => {
    jugadores.delete(jugador.id)
    console.log(`- ${jugador.id} desconectado (${jugadores.size}/2)`)
  })
})

programar()
console.log(`Vektor · servidor 1v1 local en ws://localhost:${NET.port}`)
console.log(`escenario ${ESCENARIO} · ${SIM.hz} Hz · colchón ${COLCHON} pasos · ${escenario.occluders.length} oclusores`)

// Un informe cada cinco segundos, que es lo que se mira mientras se juega.
setInterval(() => {
  if (jugadores.size === 0) return
  const filas = [...jugadores.values()].map(
    (j) =>
      `${j.id} ack ${j.ack} cola ${j.cola.length} hambre ${j.hambre} tardías ${j.tardias} ` +
      `↑${(j.bytesEntrada / 5 / 1024).toFixed(2)} ↓${(j.bytesSalida / 5 / 1024).toFixed(2)} KB/s`,
  )
  console.log(`paso ${paso} · ${filas.join(' | ')}`)
  for (const j of jugadores.values()) {
    j.bytesEntrada = 0
    j.bytesSalida = 0
  }
}, 5000)
