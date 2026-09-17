/**
 * **El huésped de Node** (vuelta 45, adelgazado en la 47, **crecido en la 58**).
 *
 * Hasta la 57 este fichero era el huésped *de sobremesa*: un puerto, **una sola
 * partida** —el código de sala viajaba y se ignoraba— y ningún fichero servido,
 * porque la página la ponía `vite` al lado. Servía para mirar dos pestañas en
 * local y para los bancos, y para nada más.
 *
 * La 58 lo convierte en el huésped **del despliegue**, por el bloqueo de IPs de
 * LaLiga (`docs/propuestas/03-servidor-con-ip-propia.md`): Cloudflare sirve
 * desde IPs compartidas y las operadoras españolas las anulan enteras, ignorando
 * el SNI, así que se llevan por delante la página igual que la partida. La
 * respuesta es una IP que no comparte nadie, y eso quiere decir un proceso
 * normal en un sitio normal — o sea, éste.
 *
 * Le faltaban tres cosas, y **ninguna es de juego**:
 *
 * 1. **Encaminar por código de sala.** En la nube lo resolvía `idFromName` sin
 *    que nadie llevara una lista; aquí la lista es un `Map` y hay que llevarla.
 * 2. **Un reloj por sala**, conservando la regla de la 47: una sala vacía no
 *    gasta reloj, y aun así **el número de paso se conserva** entre visitas.
 * 3. **Servir los ficheros del juego**, que es lo que hacía el binding de assets
 *    de Cloudflare.
 *
 * Lo que **no** cambia es lo de siempre, y es el motivo de que esto quepa en un
 * fichero: la partida es `net/partida.js` y no tiene una línea de red. Un
 * jugador entra con una función `enviar(texto)` y quién la implementa no se sabe
 * desde ahí. Hay tres huéspedes y una sola regla del juego.
 */
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { WebSocketServer } from 'ws'
import { NET, SIM, SIM_STEP_MS } from '../src/config.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG } from './protocolo.js'
import { Partida } from './partida.js'
import { normalizarCodigo, rutaDeSala } from './codigo.js'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLICO = path.join(RAIZ, 'dist')

const ESCENARIO = process.env.VEKTOR_ESCENARIO || 'largoYPuerta'
/**
 * El colchón contra el jitter, ajustable desde fuera para poder barrerlo sin
 * tocar `config.js`. El valor de casa es `NET.jitterBufferTicks`.
 */
const COLCHON = Number(process.env.VEKTOR_BUFFER) || NET.jitterBufferTicks
/**
 * **A rondas, salvo que se diga lo contrario** (vuelta 62). `VEKTOR_RONDAS=0`
 * deja el duelo como estaba hasta la 61 —un mundo que no se reinicia— y es lo
 * que usan los bancos que miden netcode: matan al mismo blanco una y otra vez, y
 * con rondas cada muerte abre quince segundos de compra en los que no se
 * dispara. Es la hermana de `VEKTOR_DEBUG`: existe para poder medir.
 */
const RONDAS = process.env.VEKTOR_RONDAS !== '0'
/** Sólo con esto encendido se atiende la colocación de pruebas (ver `MSG.COLOCAR`). */
const DEPURAR = !!process.env.VEKTOR_DEBUG
/** El puerto lo pone el entorno en un despliegue; en local, el de siempre. */
const PUERTO = Number(process.env.PORT) || NET.port

/** Pasos de atraso que se admiten antes de re-anclar el reloj en vez de correr. */
const MAX_ATRASO = Math.max(1, Math.round(SIM.maxFrameDeltaMs / SIM_STEP_MS))

// ---------------------------------------------------------------------------
// La sala
// ---------------------------------------------------------------------------

/**
 * Una partida con su reloj. Es el gemelo de `worker/sala.js` —el Durable
 * Object— y hace lo mismo con las piezas de Node.
 *
 * **El reloj es del huésped, a propósito.** Las dos implementaciones se parecen
 * y no se comparten: lo que tienen en común es la regla («no se recupera
 * corriendo por encima de `MAX_ATRASO`, se re-ancla»), y esa regla vive escrita
 * en `CLAUDE.md` y en los tres relojes que la cumplen. Lo que cambia entre un
 * huésped y otro es de quién es el `setTimeout`.
 */
class Sala {
  constructor(codigo) {
    this.codigo = codigo
    /**
     * El escenario se monta **una vez por sala**, no por conexión: son 20 piezas
     * de geometría con sus oclusores, y montarlo dos veces serían dos mundos
     * distintos con los mismos datos.
     */
    this.escenario = new Scenario(new THREE.Scene(), ESCENARIO)
    this.partida = new Partida({ escenario: this.escenario, colchon: COLCHON, depurar: DEPURAR, rondas: RONDAS })
    this.reloj = null
    this.arranque = 0
    this.vaciaDesde = Date.now()
  }

  get vacia() {
    return this.partida.vacia
  }

  /**
   * Conecta un socket a la partida. Devuelve el id, o null si está llena.
   * `pase` es el de reconexión, si el cliente dice volver (vuelta 62).
   */
  entra(socket, pase = null) {
    // `enviar` es lo único que la partida sabe de un socket, y el estado del
    // socket es cosa del huésped: escribir en uno que se está cerrando tira y se
    // llevaría por delante el paso entero, o sea al otro jugador.
    const id = this.partida.entra((texto) => {
      if (socket.readyState !== 1) return
      try {
        socket.send(texto)
      } catch {
        /* el socket se está cerrando; la desconexión llega enseguida */
      }
    }, pase)
    if (!id) {
      socket.send(JSON.stringify({ t: MSG.ADIOS, razon: 'la partida está llena (1v1)' }))
      socket.close()
      return null
    }

    socket.on('message', (datos) => this.partida.recibe(id, datos))
    // **Irse se dice, y el huésped es quien lo oye** (vuelta 62). El mensaje es
    // del protocolo pero lo que hace es cerrar el cable, que es de aquí: marca
    // el socket como despedido **antes** de cerrarlo, para que el `close` que
    // viene detrás no lo vuelva a contar como una caída.
    socket.on('message', (datos) => {
      let mensaje
      try {
        mensaje = JSON.parse(datos)
      } catch {
        return
      }
      if (mensaje.t === MSG.ADIOS) {
        socket.vektorFuera = true
        this.partida.abandona(id)
        this._trasSalida(id)
        try {
          socket.close()
        } catch {
          /* ya se estaba cerrando */
        }
      } else if (mensaje.t === MSG.RECLAMAR) {
        this.partida.reclama(id)
      }
    })
    // **Un cable mudo no se cierra solo.** Un portátil que se duerme o un cable
    // arrancado no producen `close` hasta que TCP se rinde, que son minutos: el
    // que sigue delante de la pantalla vería un rival congelado sin que nadie
    // diga nada. El ping es del huésped, no del protocolo — la partida no
    // pregunta por el estado del cable, se entera de que se cerró.
    socket.vektorVivo = true
    socket.on('pong', () => { socket.vektorVivo = true })
    const latido = setInterval(() => {
      if (!socket.vektorVivo) {
        clearInterval(latido)
        socket.terminate()
        return
      }
      socket.vektorVivo = false
      try {
        socket.ping()
      } catch {
        /* se está cerrando; el close llega enseguida */
      }
    }, NET.pingMs)

    const salir = () => {
      clearInterval(latido)
      if (socket.vektorFuera) return
      socket.vektorFuera = true
      // **Sin adiós delante, es una caída**: la butaca se guarda y el mundo se
      // para para el que queda, hasta que vuelva o se le dé por abandonado.
      this.partida.sedesconecta(id)
      this._trasSalida(id)
    }
    socket.on('close', salir)
    socket.on('error', salir)

    this._arrancarReloj()
    console.log(`+ ${this.codigo}/${id} (${this.partida.conectados.length}/2)`)
    return id
  }

  /** Lo que hay que mirar cada vez que alguien deja de estar. */
  _trasSalida(id) {
    if (this.vacia) {
      this._pararReloj()
      this.vaciaDesde = Date.now()
    }
    console.log(`- ${this.codigo}/${id} (${this.partida.conectados.length}/2)`)
  }

  /**
   * **El mundo sólo corre mientras hay alguien.** Se arranca al entrar el
   * primero y se para al salir el último, y el re-anclaje del arranque contra el
   * paso actual es lo que hace que **el número de paso se conserve**: volver a
   * entrar con el mismo código no es empezar otra partida.
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
      if (this.vacia) return
      this._latir()
      this._programar()
    }, espera)
  }

  /**
   * Un paso, o los que se deban hasta el tope. Lo que exceda no se recupera: se
   * re-ancla y el mundo sigue desde aquí. Es la regla de los tres relojes.
   *
   * **Esto es nuevo en el huésped de Node**, y es una corrección: hasta la 57
   * apuntaba al instante exacto del paso siguiente sin tope ninguno, así que
   * volver de un parón largo —el proceso sin CPU, la máquina dormida— eran
   * cientos de pasos seguidos y una ráfaga de fotos a los dos clientes. En un
   * proceso de sobremesa no pasaba nunca; en un servidor de verdad, sí. El
   * número es `SIM.maxFrameDeltaMs`, el mismo con el que el motor acota el frame
   * largo del navegador desde la vuelta 44.
   */
  _latir() {
    // Con el mundo en pausa el reloj de pared sigue y el del mundo no: hay que
    // re-anclar en cada latido o al reanudar se debería medio minuto de pasos.
    // La partida sigue mandando su foto —es cómo se enteran los dos de que hay
    // pausa— pero no avanza nada.
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

/**
 * **El registro de salas, que en la nube no hacía falta.**
 * `idFromName(código)` era determinista y el objeto lo materializaba Cloudflare;
 * aquí el `Map` es esa misma función y el que la tiene que barrer somos
 * nosotros. Sigue sin haber matchmaking ni lista de partidas hacia fuera: el
 * código es la dirección y punto.
 */
const salas = new Map()

function salaDe(codigo) {
  let sala = salas.get(codigo)
  if (!sala) {
    sala = new Sala(codigo)
    salas.set(codigo, sala)
  }
  return sala
}

/**
 * **Parar el reloj y olvidar el mundo son dos cosas.** El reloj para al salir el
 * último para no gastar CPU; el mundo se queda **para que el paso se conserve**
 * si alguien vuelve. Lo que no puede es quedarse para siempre, que es lo único
 * que en Cloudflare resolvía la plataforma por su cuenta.
 */
setInterval(() => {
  const ahora = Date.now()
  for (const [codigo, sala] of salas) {
    if (!sala.vacia) continue
    if (ahora - sala.vaciaDesde < NET.salaOlvidadaMs) continue
    sala._pararReloj()
    salas.delete(codigo)
  }
}, 60000).unref?.()

// ---------------------------------------------------------------------------
// Los ficheros del juego
// ---------------------------------------------------------------------------

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}
/** Lo que vale la pena comprimir. Un mp3 ya viene comprimido. */
const COMPRIMIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.map'])

/**
 * **Se comprime aquí porque ya no lo hace nadie por nosotros.** Cloudflare
 * gzipeaba de oficio; un proceso de Node no. El paquete del juego son ~900 KB de
 * los que la mayoría es JavaScript, y en un despliegue el tráfico se paga: sin
 * esto, cada visita costaría el triple de lo que tiene que costar.
 *
 * La caché es del proceso y no caduca **a propósito**: `dist/` no cambia
 * mientras el servidor corre —un despliegue nuevo es un proceso nuevo—, así que
 * no hay nada que invalidar.
 */
const cache = new Map()

async function leer(relativo) {
  const enCache = cache.get(relativo)
  if (enCache !== undefined) return enCache

  const destino = path.resolve(PUBLICO, '.' + path.posix.normalize('/' + relativo))
  // Nada fuera de `dist/`, pase lo que pase por la barra de direcciones.
  if (destino !== PUBLICO && !destino.startsWith(PUBLICO + path.sep)) {
    cache.set(relativo, null)
    return null
  }
  let datos
  try {
    datos = await readFile(destino)
  } catch {
    cache.set(relativo, null)
    return null
  }
  const extension = path.extname(destino).toLowerCase()
  const fichero = {
    datos,
    tipo: TIPOS[extension] || 'application/octet-stream',
    gz: COMPRIMIBLE.has(extension) ? gzipSync(datos, { level: 9 }) : null,
    // Los ficheros de `assets/` llevan el hash del contenido en el nombre, así
    // que no pueden cambiar sin cambiar de nombre: se pueden cachear para
    // siempre. El resto, nunca — o un despliegue no se vería.
    inmutable: relativo.startsWith('assets/'),
  }
  cache.set(relativo, fichero)
  return fichero
}

function servir(respuesta, peticion, fichero) {
  const aceptaGzip = /\bgzip\b/.test(peticion.headers['accept-encoding'] || '')
  const cuerpo = fichero.gz && aceptaGzip ? fichero.gz : fichero.datos
  const cabeceras = {
    'Content-Type': fichero.tipo,
    'Content-Length': cuerpo.length,
    'Cache-Control': fichero.inmutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  }
  if (cuerpo === fichero.gz) cabeceras['Content-Encoding'] = 'gzip'
  respuesta.writeHead(200, cabeceras)
  respuesta.end(cuerpo)
}

/**
 * La huella de lo que este proceso va a servir: los nombres de los assets, que
 * Vite genera a partir de su contenido. **Se lee una vez, al arrancar**, que es
 * justo cuando queda fijado lo que se sirve —de ahí en adelante todo sale de la
 * caché en memoria—. Comparar esto con `ls dist/assets` dice en un segundo si el
 * huésped se ha quedado con un build viejo.
 */
const HUELLA = (() => {
  try {
    const assets = readdirSync(path.join(PUBLICO, 'assets')).sort().join(' ')
    // **Y las páginas, que no llevan hash en el nombre** (vuelta 62). Vite le
    // pone al nombre de cada `asset` un hash de su contenido, así que listarlos
    // basta para saber qué JS se sirve; los `.html` se llaman siempre igual y
    // **llevan dentro el CSS del duelo**. Sin esto, arreglar una regla de estilo
    // y no reiniciar el huésped daba una huella idéntica con la página vieja
    // servida — que es justo el falso negativo que esta huella existe para
    // cerrar. Pasó, y costó un banco en rojo.
    const paginas = ['index.html', path.join('net', 'prueba.html')]
      .map((rel) => {
        try {
          const crudo = readFileSync(path.join(PUBLICO, rel))
          return `${rel}:${createHash('sha1').update(crudo).digest('hex').slice(0, 8)}`
        } catch {
          return `${rel}:—`
        }
      })
      .join(' ')
    return `${assets} · ${paginas}`
  } catch {
    return 'sin dist'
  }
})()

const texto = (respuesta, codigo, cuerpo) => {
  respuesta.writeHead(codigo, { 'Content-Type': 'text/plain; charset=utf-8' })
  respuesta.end(cuerpo)
}

// ---------------------------------------------------------------------------
// El portero: las mismas rutas que `worker/index.js`
// ---------------------------------------------------------------------------

/**
 * `null` si la ruta no es de sala; el código si es válida; `false` si es de sala
 * y el código no vale. Lo mismo que hace el Worker, con la misma normalización
 * —la de `net/codigo.js`, que usan los dos extremos— porque si el cliente y el
 * servidor normalizaran cada uno a su manera, teclear el código en minúsculas
 * llevaría a otra sala y el síntoma serían dos amigos solos en dos salas.
 */
function codigoDeRuta(ruta) {
  const enSala = ruta.match(/^\/sala\/([^/]+)\/?$/)
  if (!enSala) return null
  return normalizarCodigo(enSala[1]) || false
}

const servidor = http.createServer(async (peticion, respuesta) => {
  const url = new URL(peticion.url, `http://${peticion.headers.host || 'localhost'}`)

  const codigo = codigoDeRuta(url.pathname)
  if (codigo === false) return texto(respuesta, 400, 'Ese código de partida no existe.')
  if (codigo) return texto(respuesta, 426, 'Esto es una sala de Vektor: se entra por WebSocket.')

  // Un sitio al que mirar para saber si esto está vivo, y lo que la plataforma
  // consulta para decidir si hay que reiniciar.
  //
  // **Y dice qué máquina contesta, que no es un adorno** (vuelta 59). Las salas
  // viven en la memoria de este proceso, así que dos máquinas sirviendo la misma
  // aplicación son **dos mundos** para el mismo código de partida: cada jugador
  // entra en el suyo, los dos se creen `p1` y no se ven. Pasó en la primera
  // prueba real, y desde fuera es indistinguible de un fallo de enrutado. Con la
  // máquina en la respuesta, pedir `/salud` dos veces lo dice en un segundo.
  if (url.pathname === '/salud') {
    const ocupadas = [...salas.values()].filter((s) => !s.vacia)
    respuesta.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    return respuesta.end(JSON.stringify({
      ok: true,
      /**
       * **Qué build está sirviendo** (vuelta 61). Los ficheros se cachean en
       * memoria al primer pedido, así que un `npm run build` por debajo **no le
       * cambia nada** a un huésped ya levantado: sigue sirviendo lo de antes
       * hasta que se reinicie. Está avisado en `CLAUDE.md` desde la 58 y aun así
       * ha costado dos vueltas — la última, un banco en rojo que parecía una
       * regresión del juego y era un bundle viejo.
       *
       * Vite pone el hash del contenido en el nombre de cada asset, así que los
       * nombres **son** la huella: si esto no coincide con lo que hay en
       * `dist/`, el huésped está sirviendo otra cosa.
       */
      build: HUELLA,
      maquina: process.env.FLY_MACHINE_ID || 'local',
      region: process.env.FLY_REGION || 'local',
      escenario: ESCENARIO,
      rondas: RONDAS,
      hz: SIM.hz,
      salas: salas.size,
      ocupadas: ocupadas.length,
      jugadores: ocupadas.reduce((n, s) => n + s.partida.jugadores.size, 0),
      arribaSegundos: Math.round(process.uptime()),
    }))
  }

  // **El enlace que se le manda a un amigo** (`/duelo/<código>`) es una ruta que
  // no existe como fichero: se sirve la página del duelo y el código lo lee el
  // cliente de la propia dirección. Así el enlace se puede dictar y no lleva ni
  // interrogante ni almohadilla.
  const ruta = url.pathname.startsWith('/duelo')
    ? 'net/prueba.html'
    : url.pathname.replace(/^\/+/, '') || 'index.html'

  let fichero = await leer(ruta)
  // Cloudflare servía `/net/prueba` sin extensión como dirección canónica; se
  // admiten las dos para que un enlace viejo no se quede en blanco.
  if (!fichero && !path.extname(ruta)) fichero = await leer(ruta + '.html')
  if (!fichero && !path.extname(ruta)) fichero = await leer(path.posix.join(ruta, 'index.html'))
  if (!fichero) return texto(respuesta, 404, 'Aquí no hay nada.')

  servir(respuesta, peticion, fichero)
})

// ---------------------------------------------------------------------------
// El cable
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ noServer: true })

servidor.on('upgrade', (peticion, socket, cabeza) => {
  const url = new URL(peticion.url, `http://${peticion.headers.host || 'localhost'}`)
  const codigo = codigoDeRuta(url.pathname)
  if (!codigo) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
    return socket.destroy()
  }
  wss.handleUpgrade(peticion, socket, cabeza, (ws) => {
    // **El pase viaja en la dirección**, no en un mensaje: la partida lo
    // necesita para decidir si esto es una butaca nueva o una que ya estaba, y
    // eso se decide en `entra`, antes de que haya llegado ningún mensaje.
    salaDe(codigo).entra(ws, url.searchParams.get('pase'))
  })
})

servidor.listen(PUERTO, () => {
  console.log(`Vektor · huésped en el puerto ${PUERTO}`)
  console.log(`escenario ${ESCENARIO} · ${SIM.hz} Hz · colchón ${COLCHON} pasos · ` +
    `rondas ${RONDAS ? 'SÍ' : 'no'} · depurar ${DEPURAR ? 'SÍ' : 'no'}`)
  console.log(`la página en /  ·  el duelo en /duelo/<código>  ·  las salas en ${rutaDeSala('<código>')}`)
})

// Un informe cada cinco segundos, que es lo que se mira mientras se juega.
setInterval(() => {
  for (const sala of salas.values()) {
    if (sala.vacia) continue
    console.log(`[${sala.codigo}] paso ${sala.partida.paso} · ${sala.partida.informe().join(' | ')}`)
  }
}, 5000)
