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
import { crearPose } from './pose.js'
import { MSG, desempaquetarTeclas, instanteDePaso, instanteDeSalto } from './protocolo.js'

const ESCENARIO = process.env.VEKTOR_ESCENARIO || 'largoYPuerta'
/**
 * El colchón contra el jitter, ajustable desde fuera para poder barrerlo sin
 * tocar `config.js`. El valor de casa es `NET.jitterBufferTicks`.
 */
const COLCHON = Number(process.env.VEKTOR_BUFFER) || NET.jitterBufferTicks
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
  }
}

/** Ejecuta una entrada. Es **la misma llamada** que hace el cliente. */
function ejecutar(jugador, entrada) {
  const m = jugador.movimiento
  desempaquetarTeclas(entrada.k, m.keys)
  jugador.pose.rotation.y = entrada.yaw
  if (entrada.jt >= 0) m.pressJump(instanteDeSalto(entrada.n, entrada.jt))
  m.update(SIM_STEP_MS / 1000, instanteDePaso(entrada.n))
  jugador.ack = entrada.n
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

  if (paso % NET.snapshotEvery !== 0) return
  const foto = { t: MSG.FOTO, n: paso, p: {} }
  for (const jugador of jugadores.values()) {
    foto.p[jugador.id] = {
      ack: jugador.ack,
      hambre: jugador.hambre,
      yaw: jugador.pose.rotation.y,
      s: jugador.movimiento.snapshot(jugador.estado),
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
