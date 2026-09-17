/**
 * **El huésped de la nube: un Durable Object por código de partida**
 * (vuelta 47).
 *
 * Es el gemelo de `net/servidor.mjs`, y hace exactamente lo mismo que él:
 * aceptar conexiones, llevar el reloj y mover bytes. La partida —movimiento,
 * disparo, rebobinado— es `net/partida.js`, **el mismo fichero** que corre en
 * local. Ése era el punto de sacarla de dentro del servidor en esta vuelta: hay
 * dos huéspedes y una sola regla del juego.
 *
 * **Por qué un Durable Object y no un Worker normal.** Un Worker no tiene sitio
 * donde poner un mundo: cada petición puede caer en una máquina distinta y no
 * hay estado entre ellas. Un Durable Object es lo contrario por definición —un
 * único objeto, en un único sitio, con memoria—, y `idFromName(código)` es
 * justo la pieza que faltaba: **el código de la partida es la dirección del
 * objeto**. Dos personas que teclean el mismo código acaban en el mismo mundo
 * sin registro, sin base de datos y sin matchmaking.
 *
 * **El reloj vuelve a ser del huésped**, como en Node, pero aquí hay algo que
 * en un proceso de sobremesa no pasa: el isolate se puede quedar sin CPU o
 * despertarse tarde. Con el «apuntar al instante exacto» de Node, volver de un
 * parón de tres segundos serían 180 pasos seguidos de golpe —un pico de CPU y
 * una ráfaga de 180 fotos a los dos clientes—. Así que el atraso se acota con
 * `SIM.maxFrameDeltaMs`, el mismo número con el que el motor acota el frame
 * largo del navegador, y lo que quede por encima se da por perdido re-anclando.
 * Es la misma decisión que ya se tomó en la vuelta 44 y el mismo número.
 */
import * as THREE from 'three'
import { SIM, SIM_STEP_MS } from '../src/config.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG } from '../net/protocolo.js'
import { Partida } from '../net/partida.js'

/** Hoy sólo hay un mapa jugable con cobertura. Cuando haya más, vendrá del código. */
const ESCENARIO = 'largoYPuerta'

/** Pasos de atraso que se admiten antes de re-anclar el reloj en vez de correr. */
const MAX_ATRASO = Math.max(1, Math.round(SIM.maxFrameDeltaMs / SIM_STEP_MS))

export class Sala {
  constructor(state, env) {
    this.state = state
    this.env = env
    /**
     * El escenario se monta **una vez por sala**, no por conexión: son 20
     * piezas de geometría y sus oclusores, y montarlo dos veces sería dos
     * mundos distintos con los mismos datos.
     */
    this.escenario = new Scenario(new THREE.Scene(), ESCENARIO)
    /**
     * `MSG.COLOCAR` sólo se atiende si la variable está puesta, igual que
     * `VEKTOR_DEBUG` en el huésped de sobremesa. Sin ella —o sea, en el
     * despliegue— el mensaje se tira sin mirarlo, así que no es una vía para
     * colocarse donde a uno le convenga. Está para poder pasar los mismos
     * bancos de medida contra este huésped que contra el de Node.
     */
    this.partida = new Partida({ escenario: this.escenario, depurar: !!env.VEKTOR_DEBUG })
    /** Si ya se configuró la fase de compra: sólo la pone quien crea la sala. */
    this._compraPuesta = false
    this.reloj = null
    this.arranque = 0
  }

  async fetch(peticion) {
    if (peticion.headers.get('Upgrade') !== 'websocket') {
      return new Response('Esto es una sala de Vektor: se entra por WebSocket.', { status: 426 })
    }

    // **La duración de la fase de compra viaja en la dirección** (vuelta 64) y
    // sólo la pone quien crea la sala: el segundo en entrar no le reescribe la
    // partida al primero. El acotado es de `Partida`, que es quien lo sabe.
    if (!this._compraPuesta && this.partida.vacia) {
      const compra = Number(new URL(peticion.url).searchParams.get('compra'))
      if (Number.isFinite(compra)) {
        this.partida.configurarCompra(compra)
        this._compraPuesta = true
      }
    }

    const par = new WebSocketPair()
    const cliente = par[0]
    const servidor = par[1]
    servidor.accept()

    // `enviar` es lo único que la partida sabe de un socket. Aquí, además,
    // escribir en uno que ya se cerró tira una excepción y se llevaría por
    // delante el paso entero —o sea, al otro jugador—, así que se traga.
    const id = this.partida.entra((texto) => {
      try {
        servidor.send(texto)
      } catch {
        /* el socket se está cerrando; la desconexión llega enseguida */
      }
    })
    if (!id) {
      servidor.send(JSON.stringify({ t: MSG.ADIOS, razon: 'la partida está llena (1v1)' }))
      servidor.close(1000, 'llena')
      return new Response(null, { status: 101, webSocket: cliente })
    }

    servidor.addEventListener('message', (evento) => {
      this.partida.recibe(id, evento.data)
    })
    const salir = () => {
      this.partida.sale(id)
      if (this.partida.vacia) this._pararReloj()
    }
    servidor.addEventListener('close', salir)
    servidor.addEventListener('error', salir)

    this._arrancarReloj()
    return new Response(null, { status: 101, webSocket: cliente })
  }

  /**
   * **El mundo sólo corre mientras hay alguien.** Una sala vacía con el reloj
   * puesto es un objeto que nunca se duerme, y en la cuenta de Cloudflare eso se
   * paga por tiempo de ejecución: 60 pasos por segundo de una sala en la que no
   * hay nadie. Se arranca al entrar el primero y se para al salir el último.
   */
  _arrancarReloj() {
    if (this.reloj !== null) return
    this.arranque = Date.now() - this.partida.paso * SIM_STEP_MS
    this._programar()
  }

  _pararReloj() {
    if (this.reloj !== null) clearTimeout(this.reloj)
    this.reloj = null
  }

  _programar() {
    const objetivo = this.arranque + (this.partida.paso + 1) * SIM_STEP_MS
    const espera = Math.max(0, objetivo - Date.now())
    this.reloj = setTimeout(() => {
      this.reloj = null
      if (this.partida.vacia) return
      this._latir()
      this._programar()
    }, espera)
  }

  /**
   * Un paso, o los que se deban hasta el tope. Lo que exceda del tope no se
   * recupera: se re-ancla el reloj y el mundo sigue desde aquí. Perder pasos es
   * peor que darlos todos de golpe sólo si alguien los estaba esperando, y no
   * los espera nadie: el cliente reconcilia contra la foto que llegue.
   */
  _latir() {
    // **Con el mundo en pausa el reloj de pared sigue, y el del mundo no.** Hay
    // que re-anclar en cada latido o al reanudar se debería medio minuto de
    // pasos de golpe. La partida sigue mandando su foto —es cómo se enteran los
    // dos de que hay pausa— pero no avanza nada.
    if (this.partida.pausada) {
      this.partida.tick()
      this.arranque = Date.now() - this.partida.paso * SIM_STEP_MS
      return
    }
    const debidos = Math.floor((Date.now() - this.arranque) / SIM_STEP_MS) - this.partida.paso
    if (debidos > MAX_ATRASO) {
      this.partida.tick()
      this.arranque = Date.now() - this.partida.paso * SIM_STEP_MS
      return
    }
    for (let i = 0; i < Math.max(1, debidos); i++) this.partida.tick()
  }
}
