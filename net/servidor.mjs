/**
 * **El huésped de sobremesa: Node + `ws`** (vuelta 45, adelgazado en la 47).
 *
 * Hasta la 46 este fichero era la partida entera. Al llegar Cloudflare la
 * lógica se mudó a `net/partida.js` y aquí quedó **sólo lo que es de Node**:
 * abrir un puerto, aceptar sockets, llevar el reloj y escribir el informe. El
 * huésped de la nube (`worker/partida-do.js`) hace lo mismo con las piezas de
 * Cloudflare, y los dos corren **la misma partida**.
 *
 * Lo que hay que seguir mirando de aquí es cuánto código de juego tiene:
 * ninguno. `Partida` importa `movement.js`, `scenario.js` y `config.js` tal
 * cual y les pone un objeto plano donde iría la cámara (`pose.js`).
 */
import * as THREE from 'three'
import { WebSocketServer } from 'ws'
import { NET, SIM, SIM_STEP_MS } from '../src/config.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG } from './protocolo.js'
import { Partida } from './partida.js'

const ESCENARIO = process.env.VEKTOR_ESCENARIO || 'largoYPuerta'
/**
 * El colchón contra el jitter, ajustable desde fuera para poder barrerlo sin
 * tocar `config.js`. El valor de casa es `NET.jitterBufferTicks`.
 */
const COLCHON = Number(process.env.VEKTOR_BUFFER) || NET.jitterBufferTicks
/** Sólo con esto encendido se atiende la colocación de pruebas (ver `MSG.COLOCAR`). */
const DEPURAR = !!process.env.VEKTOR_DEBUG

const escenario = new Scenario(new THREE.Scene(), ESCENARIO)
const partida = new Partida({ escenario, colchon: COLCHON, depurar: DEPURAR })

/**
 * El reloj del huésped. Se apunta al instante exacto del paso siguiente en vez
 * de dormir un intervalo fijo: `setInterval` deriva, y aquí la deriva es que el
 * servidor consuma entradas a otro ritmo del que las produce el cliente.
 */
const arranque = performance.now()
let arrastre = 0
function programar() {
  const objetivo = arranque + arrastre + (partida.paso + 1) * SIM_STEP_MS
  const espera = Math.max(0, objetivo - performance.now())
  setTimeout(() => {
    partida.tick()
    // **En pausa el reloj del mundo no avanza, y el de pared sí.** Sin
    // re-anclar, el objetivo se quedaría fijo, la espera en cero y esto sería un
    // bucle a máxima velocidad mientras dure la pausa. Es lo mismo que hace el
    // huésped de la nube, por la misma razón.
    if (partida.pausada) arrastre = performance.now() - arranque - partida.paso * SIM_STEP_MS
    programar()
  }, espera)
}

const wss = new WebSocketServer({ port: NET.port })
wss.on('connection', (socket) => {
  // `enviar` es lo único que la partida sabe de un socket, y el estado del
  // socket es cosa del huésped: escribir en uno que se está cerrando tira.
  const id = partida.entra((texto) => {
    if (socket.readyState !== 1) return
    socket.send(texto)
  })
  if (!id) {
    socket.send(JSON.stringify({ t: MSG.ADIOS, razon: 'la partida está llena (1v1)' }))
    socket.close()
    return
  }
  console.log(`+ ${id} conectado (${partida.jugadores.size}/2)`)

  socket.on('message', (datos) => partida.recibe(id, datos))
  socket.on('close', () => {
    partida.sale(id)
    console.log(`- ${id} desconectado (${partida.jugadores.size}/2)`)
  })
})

programar()
console.log(`Vektor · servidor 1v1 local en ws://localhost:${NET.port}`)
console.log(`escenario ${ESCENARIO} · ${SIM.hz} Hz · colchón ${COLCHON} pasos · ${escenario.occluders.length} oclusores`)

// Un informe cada cinco segundos, que es lo que se mira mientras se juega.
setInterval(() => {
  if (partida.vacia) return
  console.log(`paso ${partida.paso} · ${partida.informe().join(' | ')}`)
}, 5000)
