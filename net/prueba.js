/**
 * **La página del duelo 1v1** (vuelta 45; desde la 47 también en la nube).
 *
 * No es una pantalla del juego —no hay menú, ni armería, ni dianas, ni
 * puntuación— y por eso sigue siendo una página aparte y no una fase de
 * `App.jsx`. Aquí sólo hay lo justo para ver moverse y dispararse a dos personas
 * —la sala y el escenario de verdad, un cuerpo por jugador, ratón y teclado— más
 * el panel de medidas, que era el motivo de la vuelta 45 y se queda porque es
 * donde se ve la red.
 *
 * Desde la vuelta 47 **sí entra en el build**: dejó de ser una herramienta para
 * mirar dos pestañas en local y pasó a ser lo que se le manda a un amigo. Habla
 * con `net/servidor.mjs` en local y con el Durable Object en Cloudflare, y no
 * sabe cuál de los dos hay al otro lado (ver `sala-cliente.js`).
 *
 * **Desde la vuelta 56 el mundo lo pone `engine.js`**, el motor completo: arma,
 * cargador, recarga, retroceso, dispersión, marcadores y HUD, contra un rival
 * de verdad. Hasta entonces esta página montaba su propia escena mínima, y era
 * lo correcto —la pregunta de la vuelta 45 era sobre la red—; la de la 56 es la
 * contraria. Lo que sigue siendo suyo: el código de partida, el menú, los
 * avisos de conexión, las pausas y los números de F3.
 */
import { armaPermitida } from '../src/game/arsenal.js'
import { masterGain, playEquip, playRoundTick } from '../src/audio/sfx.js'
import { BANDOS, COLORS, CROSSHAIR, ECONOMY, NET, RESUME_KEY_DELAY_MS, ROUNDS, TARGET, TODOS, WEAPONS, articuloDeCombinacion, catalogoDeTienda, colorDeJugador, definicionDeSala, esModoDeEquipos, modoMultijugador } from '../src/config.js'
import { Engine } from '../src/game/engine.js'
import { Avatar } from '../src/game/avatar.js'
import { hasLineOfSight } from '../src/game/sight.js'
import { cuerpoDeJugador } from './pose.js'
import { resolverDisparo } from './disparo.js'
import { ClienteRed } from './cliente.js'
import { conLobby, conRedSimulada, transporteWebSocket } from './transporte.js'
import { montarCapaDeDuelo } from '../src/ui/duelo.jsx'
import { montarLobby } from '../src/ui/Lobby.jsx'
import { vigilarActualizaciones } from '../src/ui/actualizacion.js'
import { montarPantallaCompleta } from '../src/escritorio.js'
import { crearVueltaConEscape } from '../src/ui/volverConEscape.js'
import { soltarRaton } from '../src/game/captura.js'
import { getKeybinds, keyLabel, keysOf, subscribeKeybinds } from '../src/keybinds.js'
import { MSG, compraAbierta } from './protocolo.js'
import { codigoDeLaDireccion, direccionDeLaBarra, enlaceDeSala, mapaDeLaDireccion, modoDeLaDireccion, urlDeSala } from './sala-cliente.js'
import { nickDeRanura } from './cliente.js'

const lienzo = document.getElementById('lienzo')
const aviso = document.getElementById('aviso')
const panel = document.getElementById('panel')
const avisoRed = document.getElementById('aviso-red')
const panelPausa = document.getElementById('pausa')
const panelVoto = document.getElementById('votacion')

const marca = document.getElementById('marca')
const $ = (id) => document.getElementById(id)

// El color de la mira sale de `config.js` y de ningún otro sitio, igual que en
// `src/ui/Crosshair.jsx`: se publica como variable CSS y la hoja de estilos la
// lee. Dos literales del mismo gris es cómo acaban siendo dos grises distintos.
document.documentElement.style.setProperty('--crosshair-color', COLORS.crosshair)
// **La mira es la misma que la del entrenamiento** (vuelta 67): los tres números
// salen de `CROSSHAIR` y los publican las dos páginas. Antes el duelo llevaba la
// suya escrita a mano —trazos de un píxel y un punto en el centro—, que es una
// diferencia entre modos que no decidió nadie.
for (const [nombre, valor] of [
  ['--crosshair-gap', `${CROSSHAIR.gapPx}px`],
  ['--crosshair-length', `${CROSSHAIR.lengthPx}px`],
  ['--crosshair-thickness', `${CROSSHAIR.thicknessPx}px`],
]) document.documentElement.style.setProperty(nombre, valor)

/**
 * **El escenario de la partida lo manda el servidor**, y hoy es uno solo. Se le
 * dice al motor al construirlo, y **no pasa por los ajustes del jugador**.
 *
 * Hasta la vuelta 58 esto era un `updateSettings({ scenario })`, y costaba dos
 * cosas que no se veían: le **reescribía al jugador su escenario guardado** cada
 * vez que abría un enlace de duelo —la mitad del «no se guarda la configuración»
 * que se notaba jugando— y dejaba el mapa colgando del store, así que tocar
 * cualquier ajuste en mitad de un duelo reconstruía el escenario en caliente. El
 * escenario de una partida no es una preferencia de nadie.
 */
/**
 * **Y desde la vuelta 72 hay dos mapas de duelo**, así que el de esta partida
 * sale de la dirección —donde lo puso quien la creó— y no de una constante. Lo
 * que manda de verdad sigue siendo el servidor: lo dice en la bienvenida, y si
 * no coincide con lo que se ha montado aquí, la página se recarga con el bueno
 * (ver `onBienvenida`). Es el mismo reparto que el resto de las opciones de la
 * sala desde la vuelta 67: el cliente propone, la sala dispone.
 */
/**
 * **Y el modo** (vuelta 100): un duelo o un todos contra todos. Sale de la
 * dirección como el mapa, por el mismo motivo y con el mismo reparto —lo decide
 * quien crea la sala—, y va antes que él porque cada modo tiene su lista.
 */
const MODO = modoDeLaDireccion()
const ESCENARIO = mapaDeLaDireccion()
/**
 * **El modo de la partida que se juega, no el de la dirección** (vuelta 101).
 * Desde que hay lobby la sala cambia de modo sin recargar la página, así que
 * «¿es un todos contra todos?» se pregunta a la bienvenida de la partida en
 * curso, que es quien lo sabe.
 */
const esTodos = () => cliente.todosContraTodos

/**
 * **El motor completo, con la red enchufada** (vuelta 56). Hasta aquí esta
 * página montaba su propia escena mínima —cámara, escenario, movimiento y dos
 * cuerpos— porque la pregunta de la vuelta 45 era sobre la red y el motor no
 * hacía falta. Ahora la pregunta es la contraria: si el juego de verdad —arma,
 * cargador, recarga, retroceso, dispersión, marcadores, HUD— funciona contra un
 * rival real. Así que el mundo lo pone `engine.js` y esta página se queda con lo
 * que siempre fue suyo: el código de partida, el menú, los avisos de conexión,
 * las pausas y los números de F3.
 */
/**
 * **La capa de interfaz, que es la del juego** (vuelta 73). Va antes que el
 * motor porque sus callbacks la usan desde el primer frame.
 */
const capa = montarCapaDeDuelo(document.getElementById('capa'), {
  // En el todos contra todos la armería equipa: ahí las armas son libres. Lo
  // dice cada bienvenida (`capa.equipa`), que es donde se sabe.
  equipa: false,
  // Al cerrar un panel vuelve lo que había debajo: con el ratón suelto, el menú.
  alCerrarPanel: () => {
    aviso.hidden = vista !== 'juego' || document.pointerLockElement === lienzo || !tienda.hidden
  },
})

const motor = new Engine(lienzo, {
  onFrame: (stats) => pintarHud(stats),
  onArma: (evento) => capa.reaccionArma(evento),
  onPeana: (texto) => capa.avisoDePeana(texto),
  onWeapon: (w) => capa.arma(w.weaponKey, w.suppressed),
  onDamage: (fraccion, rumbo) => capa.dano(fraccion, rumbo),
  onVerdict: (v) => marcarDisparo(v),
  onHelp: (texto, ms) => capa.ayuda(texto, ms),
  // **La armería es de la página, como el menú** (vuelta 64). El motor sabe que
  // se ha pedido —la tecla es suya, reasignable en opciones— y quién la dibuja
  // depende de dónde se juegue: en el juego es el panel de React, aquí es la
  // tienda de abajo. Lo que el motor no hace en red es pausar.
  /**
   * **La tecla de armería abre lo que haya que abrir** (vuelta 73). Donde se
   * compra, la tienda; donde el mapa reparte, **las fichas** — que hasta aquí
   * no se podían ver en ninguna parte del duelo, ni siquiera las de la Scout y
   * el Vanta, que están enteras desde las vueltas 70 y 71. En la 72 esta tecla
   * no hacía nada en Los Pilares, que era honesto y seguía sin enseñar los
   * números.
   */
  /**
   * **Y la misma tecla la cierra y te devuelve a jugar** (vuelta 101). Cerrarla
   * dejaba el ratón suelto, y lo que se enseña con el ratón suelto es el menú
   * de ESC —el del código de la sala—: la segunda B, la de volver a comprar o la
   * de cerrar, acababa en esa pantalla. Cerrar la tienda es volver a la partida.
   */
  onArmoury: () => {
    const abierta = cliente.conEconomia ? !tienda.hidden : capa.hayPanel()
    if (abierta) {
      volviendo()
      vuelta.cancelar()
      motor.requestLock()
      return
    }
    if (cliente.conEconomia) alternarTienda(true)
    else capa.panel('ficha')
  },
  /**
   * **Apuntando con mirilla se quita la mira de la página** (vuelta 70): la
   * lente trae la suya —cruceta fina y punto rojo— y dos miras a la vez es una
   * encima de otra. Es lo mismo que hace el entrenamiento; la lente, que es lo
   * que de verdad se comparte, la dibuja el motor.
   */
  onScope: (puesta) => capa.apuntando(puesta),
  /**
   * **La mira dice si hay alguien a distancia de cuchillo** (vuelta 71). Es lo
   * único que un arma sin modelo en la mano puede decir **antes** de golpear, y
   * llega como pulsación —al entrar y al salir del alcance—, no por frame.
   */
  onMeleeRange: (dentro, espalda) => capa.aCuchillo(dentro, espalda),
}, { escenario: definicionDeSala(MODO, ESCENARIO) })

/**
 * **El fantasma: dónde dice el servidor que estás tú.** Es lo que hace visible
 * la reconciliación — sin pérdida de paquetes va clavado dentro de tu cabeza y
 * no se ve; con pérdida se despega, y eso es exactamente la corrección.
 *
 * Lo pone la página y no el motor porque es un **instrumento de medida**, no
 * una pieza del juego: vive detrás de F3 con los demás y apagado de fábrica.
 */
const fantasma = new Avatar(TARGET.radius, BANDOS[0].color)
for (const zona of Object.keys(fantasma.zones)) {
  for (const malla of fantasma.zones[zona]) {
    malla.material.transparent = true
    malla.material.opacity = 0.3
    malla.material.depthWrite = false
  }
}
fantasma.group.visible = false
motor.scene.add(fantasma.group)

/**
 * **El enlace.** Latencia, jitter y pérdida son propiedades del cable, así que
 * viven en el transporte y no en el netcode: el cliente no sabe que existen.
 * Los mandos del panel escriben en este objeto y el cambio entra en el paquete
 * siguiente.
 */
const enlace = { latenciaMs: 0, jitterMs: 0, perdida: 0 }

/**
 * **El código de la partida.** Sale de la dirección si la trae y si no se
 * inventa uno, así que abrir la página ya es haber creado una partida: no hay
 * botón de «crear». Y se deja puesto en la barra de direcciones con
 * `replaceState` —sin recargar— para que copiarla de ahí valga como enlace.
 */
const codigo = codigoDeLaDireccion()
history.replaceState(null, '', direccionDeLaBarra(codigo))
$('codigoMenu').textContent = codigo
/**
 * **El enlace lleva lo que la sala tiene puesto** (vuelta 101): modo y mapa, que
 * desde el lobby cambian sin recargar. Sirve para lo de siempre —quien lo abre
 * monta ya el mapa bueno— y si la sala se hubiera olvidado, la vuelve a crear
 * con la misma configuración.
 */
let configDeSala = { modo: MODO, mapa: ESCENARIO }
const enlaceActual = () => enlaceDeSala(codigo, window.location, configDeSala.mapa, configDeSala.modo)
$('enlaceMenu').value = enlaceActual()

/**
 * **La página ensambla la red; el motor sólo la usa.** El cliente se construye
 * con la cámara, el movimiento y los oclusores **del motor** —son los mismos que
 * dibujan y contra los que se choca, no copias— y `usarRed` se lo entrega antes
 * de arrancar. La regla de la vuelta 45 sigue en pie: `engine.js` no sabe de
 * sockets ni de códigos de sala.
 */
/**
 * **La partida a medias que tenga este navegador** (vuelta 62).
 *
 * Es lo único que se guarda entre visitas: el código y el pase de la butaca.
 * Vive aquí y no en el netcode porque *dónde* se guarda algo entre dos visitas
 * no es del cliente de red; y en `localStorage` con su `try/catch`, como los
 * ajustes — sin persistencia se juega igual, pero **es por origen**: mudar el
 * despliegue de dominio deja atrás la partida a medias, una vez.
 */
const CLAVE_PARTIDA = 'vektor.duelo.v1'
/**
 * **Un sitio por pestaña, no por navegador** (vuelta 101). El pase se guardaba
 * en `localStorage`, que es del navegador entero: dos pestañas abiertas con el
 * mismo enlace —o la app y el navegador en la misma sesión de Windows cuando
 * comparten perfil— enseñaban **el mismo pase** y se sentaban en la misma
 * butaca. Eran dos personas moviendo un solo jugador, y la sala contaba uno
 * menos de los que había delante: se reportó como «éramos cuatro y el recuento
 * decía tres».
 *
 * Ahora cada pestaña tiene su nombre (`sessionStorage`, que sobrevive a recargar
 * pero no se comparte con otra pestaña) y cada sitio guardado dice de qué
 * pestaña es y cuándo dio señales de vida por última vez. Se usa el sitio **de
 * esta pestaña**, o uno que lleve un rato sin latir —el de una pestaña cerrada,
 * que es volver a una partida a medias, lo de la vuelta 62—, y nunca el de una
 * pestaña que sigue abierta.
 */
const CLAVE_PESTANA = 'vektor.pestana'
const pestana = (() => {
  try {
    let id = sessionStorage.getItem(CLAVE_PESTANA)
    if (!id) {
      id = Math.random().toString(36).slice(2, 10)
      sessionStorage.setItem(CLAVE_PESTANA, id)
    }
    return id
  } catch {
    return Math.random().toString(36).slice(2, 10)
  }
})()
/** Cuánto sin latir para dar un sitio por abandonado por su pestaña. */
const SIN_LATIR_MS = 6000
function sitiosGuardados() {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE_PARTIDA) ?? 'null')
    // El formato de antes de la 101 era un solo sitio sin pestaña: se lee como
    // uno que no late, que es lo que era.
    if (crudo && !Array.isArray(crudo)) return [{ ...crudo, pestana: null, latido: 0 }]
    return Array.isArray(crudo) ? crudo : []
  } catch {
    return []
  }
}
function escribirSitios(lista) {
  try {
    if (lista.length) localStorage.setItem(CLAVE_PARTIDA, JSON.stringify(lista.slice(-8)))
    else localStorage.removeItem(CLAVE_PARTIDA)
  } catch {
    /* sin persistencia se juega igual; lo que se pierde es poder reconectar */
  }
}
function partidaGuardada() {
  const ahora = Date.now()
  const lista = sitiosGuardados()
  return lista.find((s) => s.codigo === codigo && s.pestana === pestana)
    ?? lista.find((s) => s.codigo === codigo && ahora - (s.latido ?? 0) > SIN_LATIR_MS)
    ?? lista.find((s) => s.pestana === pestana)
    ?? lista.find((s) => ahora - (s.latido ?? 0) > SIN_LATIR_MS)
    ?? null
}
function guardarPartida(dato) {
  const lista = sitiosGuardados().filter((s) => s.pestana !== pestana && !(dato && s.pase === dato.pase))
  if (dato) lista.push({ ...dato, pestana, latido: Date.now() })
  escribirSitios(lista)
}
// **Y el latido**: mientras esta pestaña esté abierta, su sitio es suyo.
setInterval(() => {
  const lista = sitiosGuardados()
  const mio = lista.find((s) => s.pestana === pestana)
  if (!mio) return
  mio.latido = Date.now()
  escribirSitios(lista)
}, 2000)

/**
 * **Cuánto dura la fase de compra en la partida que se cree aquí** (vuelta 64).
 *
 * Sale de la dirección (`?compra=10`) si la trae —así el enlace que se manda la
 * lleva puesta— y si no, de la preferencia guardada en este navegador. Viaja en
 * la dirección del socket y **sólo cuenta si esta página es la que crea la
 * sala**: al segundo en entrar se le ignora, que es lo que impide que llegue
 * alguien y le reconfigure la partida al que la montó.
 *
 * Por eso el selector, al cambiar, **recarga con una partida nueva**: una sala
 * ya creada no se reconfigura, y fingir que sí sería enseñar un número que el
 * servidor no está usando. Lo que se ve debajo del selector es lo que dice el
 * servidor, no lo que pide el selector.
 */
const CLAVE_COMPRA = 'vektor.duelo.compra'
function compraPreferida() {
  /**
   * **`Number(null)` es 0, y 0 es una opción válida** — «sin fase de compra».
   * Así que aquí se pregunta primero si el dato **está**, y sólo entonces se
   * convierte: leerlo con `Number(...)` a secas hacía que cualquier página sin
   * el parámetro pidiera una partida rápida sin que nadie la hubiera elegido.
   * Lo cazó el humo de la página: `compra: 0` en una sala recién creada.
   */
  const valido = (crudo) => {
    if (crudo === null || crudo === undefined || crudo === '') return null
    const n = Number(crudo)
    return Number.isFinite(n) && ROUNDS.compraOpciones.includes(n) ? n : null
  }
  const enDireccion = valido(new URLSearchParams(window.location.search).get('compra'))
  if (enDireccion !== null) return enDireccion
  try {
    const guardado = valido(localStorage.getItem(CLAVE_COMPRA))
    if (guardado !== null) return guardado
  } catch {
    /* sin persistencia se juega igual */
  }
  return ROUNDS.compraSegundos
}
const compraElegida = compraPreferida()

const guardada = partidaGuardada()
// **El pase sólo vale para su código.** Enseñar el de otra partida no es volver
// a ésta: sería pedir una butaca que en esta sala no existe.
const paseDeVuelta = guardada?.codigo === codigo ? guardada.pase : null
// Y lo cogemos para esta pestaña ya: si otra pestaña lo mira ahora, late.
if (paseDeVuelta) guardarPartida({ codigo, pase: paseDeVuelta, cuando: Date.now() })

const cliente = new ClienteRed({
  camara: motor.camera,
  movimiento: motor.movement,
  controles: motor.controls,
  oclusores: motor.scenario.occluders,
  /**
   * **El cable lleva dos conversaciones** (vuelta 101): la de la sala y la de
   * la partida. `conLobby` aparta la de la sala —sus mensajes empiezan por
   * `l`— y el cliente de red sigue viendo un transporte que sólo le habla de
   * la partida, como siempre.
   */
  transporte: conLobby(
    conRedSimulada(
      transporteWebSocket(urlDeSala(codigo, window.location, paseDeVuelta, compraElegida, ESCENARIO, MODO)),
      enlace,
    ),
    (m) => alEstadoDeSala(m),
  ),
})
cliente.onBienvenida = (m) => {
  // **La ranura la manda el servidor**, y es la misma de la que sale su sitio de
  // salida: deducir el color del id (`p1`, `p2`) parece equivalente y no lo es,
  // porque el id es un contador que no para —dos jugadores pueden ser `p3` y
  // `p5` y quedarse otra vez del mismo color—.
  /**
   * **El mapa lo dice la sala** (vuelta 72). Si se ha montado otro —alguien
   * abrió un enlace sin el mapa puesto, o pidió uno y la sala ya existía con
   * otro—, lo correcto es recargar con el bueno: seguir jugando contra una
   * geometría que el servidor no tiene sería una corrección por paso contra
   * paredes que sólo existen en una pantalla.
   */
  /**
   * **El mapa ya está montado**: lo puso el lobby al ver la partida lanzada
   * (`alEstadoDeSala`), antes de que llegase esta bienvenida. Hasta la 100 la
   * página se recargaba si no coincidía; desde que hay lobby el mapa cambia
   * entre partidas y el motor lo cambia en caliente (`fijarEscenario`).
   */
  // **Tu color**: el de tu bando o, en el todos contra todos, el de tu butaca.
  const tuyo = m.bando !== null && m.bando !== undefined ? BANDOS[m.bando] : colorDeJugador(m.ranura ?? m.equipo)
  fantasma.setColor(tuyo.color)
  $('quien').innerHTML = `${m.nick ?? m.id} · <span style="color:${tuyo.color}">${tuyo.label}</span>`
  $('quienDbg').textContent = `${m.id} · ranura ${m.ranura} · ${m.escenario}`
  document.title = `Vektor · ${codigo} · ${m.nick ?? m.id}`
  $('titulo').textContent = `Vektor · ${modoMultijugador(m.modo).label}`
  capa.equipa(Boolean(m.libres))
  // Qué admite el mapa de esta partida (vuelta 106): la armería y la tienda lo miran.
  capa.reglas(motor.scenario.reglas)
}
// **Después de poner lo suyo**: `usarRed` encadena sobre la bienvenida para
// arrancar la sesión en el mismo turno, y encadenar sobre algo que todavía no
// está puesto es perderlo.
motor.usarRed(cliente)
/**
 * **La marca de impacto.** Se enciende con el veredicto **del servidor**, que es
 * el que decide: avisar con el veredicto propio sería prometer una baja que
 * luego no aparece en la vida del rival.
 */
let apagarMarca = 0
function marcarDisparo(v) {
  // El sonido lo pone el motor, que es de quien es el audio; aquí sólo se
  // pinta. Baja y acierto **se distinguen por forma**, no por intensidad: la
  // baja cierra un intercambio y hay que poder saberlo sin mirar.
  if (!v.impacto) return
  // **Y se pinta encima de la mira, no con la mira** (vuelta 67): la referencia
  // contra la que se apunta no se mueve ni cuando aciertas.
  marca.classList.add('puesto')
  marca.classList.toggle('baja', !!v.baja)
  clearTimeout(apagarMarca)
  apagarMarca = setTimeout(() => marca.classList.remove('puesto', 'baja'),
                           v.baja ? NET.killMarkerMs : NET.hitMarkerMs)
}
/**
 * **Lo que ve el jugador cuando la partida deja de estar.** Dos estados, y la
 * diferencia importa: el **amarillo** es «no llegan fotos», que puede pasarse
 * solo; el **rojo** es definitivo —te han echado o el cable se ha cortado— y no
 * se va a arreglar mirando.
 */
let redCaida = null
function pintarRed(ahora) {
  if (redCaida) {
    avisoRed.hidden = false
    avisoRed.classList.remove('suave')
    avisoRed.innerHTML = `PARTIDA DESCONECTADA — ${redCaida.motivo}` +
      '<small>recarga la página para volver a entrar</small>'
    return
  }
  const silencio = cliente.silencioMs(ahora)
  cliente.medidas.sinFotosMs = silencio
  if (silencio > NET.offlineMs) {
    avisoRed.hidden = false
    avisoRed.classList.add('suave')
    avisoRed.innerHTML = `SIN CONEXIÓN — ${(silencio / 1000).toFixed(1)} s sin noticias del servidor` +
      '<small>tu jugador se sigue moviendo aquí, pero nadie más lo ve</small>'
  } else {
    avisoRed.hidden = true
  }
}
cliente.onDesconectado = (d) => {
  redCaida = d
  // Y el panel deja de decir «conectando…» debajo de un cartel que dice que no
  // hay partida: dos mensajes que se contradicen es medio arreglo.
  $('quien').textContent = 'fuera de la partida'
  // Se suelta el ratón: seguir capturado en una partida que ya no existe es
  // dejar al jugador encerrado en una pantalla que no responde.
  if (document.pointerLockElement === lienzo) soltarRaton()
  pintarRed(performance.now())
}
/** `mm:ss` de unos milisegundos, redondeando hacia arriba: 0 es 0, no 0.4. */
function reloj(ms) {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * **Lo que se ve de la pausa.** Tres estados y ninguno se inventa aquí: todos
 * vienen de la foto. Lo único que decide esta página es cómo se cuentan.
 *
 * El cartel se **reconstruye sólo cuando cambia el estado** (lo avisa
 * `onPausa`); la cuenta atrás, que cambia por frame, la escribe `pintarRestas`
 * en su propio nodo. Rehacer el `innerHTML` sesenta veces por segundo se
 * llevaría por delante el botón de reanudar en mitad de un clic.
 */
/**
 * **Soltar el ratón es cosa del instante en que llega la pausa, no del
 * repintado** (vuelta 62). La regla de la 55 —una pausa tuya te suelta el
 * ratón— estaba escrita como «si la pausa es mía y tengo el ratón, suéltalo», y
 * eso se ejecuta **cada vez que cambia algo del bloque de pausa**: la cuenta de
 * libres, por ejemplo, que llega una foto después de la pausa.
 *
 * El efecto era que el jugador no podía recuperar el ratón: pinchaba, el
 * navegador le daba la captura, y la foto siguiente se la quitaba otra vez —con
 * la pausa todavía puesta, porque levantarla cuesta un viaje—. Cinco clics en
 * diez segundos, ninguno se queda. Y el clic es justo el gesto con el que se
 * reanuda, así que la pausa tampoco se levantaba.
 */
let pausaMiaAntes = false
let caidaAntes = false

/** Las filas de la tabla de controles (vuelta 98). Van aquí arriba porque `pintarPausa` puede repintarla antes de llegar a la tabla. */
const CONTROLES_DEL_DUELO = [
  { direcciones: true, que: 'Moverse' },
  { accion: 'jump', que: 'Saltar' },
  { accion: 'crouch', que: 'Agacharse' },
  { accion: 'walk', que: 'Andar sin hacer ruido' },
  { accion: 'shoot', que: 'Disparar' },
  { accion: 'reload', que: 'Recargar' },
  { accion: 'primary', que: 'Arma principal' },
  { accion: 'secondary', que: 'Pistola' },
  { accion: 'melee', que: 'Cuchillo' },
  { accion: 'throwable', que: 'Arrojadizos' },
  { accion: 'special', que: 'Arma especial' },
  { accion: 'use', que: 'Usar' },
  { accion: 'armoury', que: 'Armería y tienda' },
  { accion: 'scoreboard', que: 'Marcador' },
]

/** Las pausas libres que quedan, para la fila de Escape. Las escribe `pintarPausa`. */
let libresQueQuedan = null

function pintarPausa() {
  const p = cliente.pausa
  // Las pausas que quedan se dicen **en el menú**, que es donde se gastan
  // (vuelta 73). Estaban además pegadas al bloque de vida, y ese bloque es
  // ahora el del juego: dos sitios para el mismo número es uno que se queda
  // viejo.
  libresQueQuedan = p.libres
  const libres = document.getElementById('libresMenu')
  if (libres) libres.textContent = p.libres
  else pintarControles(getKeybinds())
  // **El botón de votación sólo existe cuando es la única salida** (vuelta 55):
  // con libres que gastar, pedirle permiso al rival sería pedir por pedir.
  // Pausar, sólo con libres que gastar y sin nada en marcha; pedir votación,
  // sólo cuando ya no quedan. Nunca los dos a la vez: son la misma acción con
  // distinto precio, y dos botones juntos obligan a leerlos para saber cuál.
  // **Y sin rival no hay partida que pausar** (vuelta 98): el menú es entonces
  // el de crear la sala (`pintarBotonesDelMenu`).
  // **Y en el todos contra todos no se pausa** (vuelta 100): uno de diez no
  // puede parar el mundo a los otros nueve, y el servidor lo ignora. Un botón
  // que promete lo que el servidor no va a hacer es el fallo de la vuelta 67.
  const sinPartida = cliente.ocupadas < 2 || esTodos()
  $('pausar').hidden = sinPartida || p.libres <= 0 || p.pausada || cliente.votacion.activa
  $('pedirVoto').hidden = sinPartida || p.libres > 0 || p.pausada || cliente.votacion.activa
  if (p.pausada && p.motivo === 'caida') {
    // **La pausa por caída no la ha puesto nadie**, así que no lleva botón de
    // reanudar: la levanta que el otro vuelva. Lo que sí lleva —pasados los
    // primeros segundos— es la salida del que espera, para no tener que aguantar
    // la ventana entera mirando un mundo parado (vuelta 62).
    panelPausa.hidden = false
    panelPausa.innerHTML =
      '<b>RIVAL DESCONECTADO</b><em id="pausaResta">&nbsp;</em>' +
      '<small>la partida se reanuda si vuelve · si no, se da por abandonada</small>' +
      '<button id="reclamar" hidden>dar la partida por abandonada</button>'
    $('reclamar').addEventListener('click', () => cliente.reclamar())
    // Sólo al llegar: ver la nota de arriba.
    if (!caidaAntes && document.pointerLockElement === lienzo) soltarRaton()
  } else if (p.pausada) {
    panelPausa.hidden = false
    panelPausa.innerHTML = '<b>PARTIDA EN PAUSA</b><em id="pausaResta">&nbsp;</em>' +
      (p.mia
        ? '<small>la has pedido tú · al acabarse la cuenta se reanuda sola</small>' +
          '<button id="reanudar">reanudar</button>'
        : '<small>la ha pedido el rival · al acabarse la cuenta se reanuda sola</small>')
    if (p.mia) $('reanudar').addEventListener('click', () => cliente.reanudar())
    // **Una pausa tuya te suelta el ratón** (vuelta 55). Con las libres el orden
    // era el contrario —Escape suelta y luego llega la pausa—, pero una votada
    // llega jugando, y quedarse capturado en un mundo parado es no tener con qué
    // reanudarlo. Al rival no se le toca: él no ha pedido nada, y devolverle al
    // menú sería castigarle por haber dicho que sí.
    if (p.mia && !pausaMiaAntes && document.pointerLockElement === lienzo) {
      soltarRaton()
    }
  } else {
    panelPausa.hidden = true
  }
  pausaMiaAntes = p.pausada && p.mia
  caidaAntes = p.pausada && p.motivo === 'caida'
  // **Y el cartel nace con su número, no con un hueco.** El bloque se rehace al
  // cambiar de estado y la cuenta la escribe `pintarRestas`, que va por frame:
  // entre una cosa y la otra hay un fotograma con la cuenta en blanco. Se ve al
  // entrar en pausa y, cuando llega la cuenta de libres una foto después, otra
  // vez. Escribirla aquí mismo cuesta una llamada y la quita.
  if (p.pausada) pintarRestas(performance.now())
  medirCartel()
  pintarVotacion()
}
/** El menú se centra bajo el cartel: ver `--pausaAlto` en la hoja de estilos. */
function medirCartel() {
  document.body.style.setProperty('--pausaAlto',
    panelPausa.hidden ? '0px' : `${panelPausa.offsetHeight}px`)
}
cliente.onPausa = pintarPausa
/**
 * **Y una vez al arrancar, porque el estado inicial también es un estado.**
 * `onPausa` avisa de los **cambios**, así que al empezar una partida —donde no
 * ha habido ninguna pausa todavía— no se llamaba nunca y el botón de pausar se
 * quedaba con el `hidden` que trae el HTML. Con el de votación no se notó: ése
 * sólo hace falta cuando se agotan las libres, y agotarlas **es** un cambio.
 */
pintarPausa()

/**
 * **El cartel de la votación, que entra desde el borde derecho** (vuelta 55).
 *
 * Sale sólo a quien tiene que votar —al que la pidió no se le pregunta nada, y
 * ya se ha ido a jugar— y **no para el mundo**: se contesta jugando. De ahí sus
 * dos formas de contestar, que no son una redundancia sino las dos situaciones
 * reales: con el ratón capturado un botón no se puede pinchar —el clic va al
 * `pointerlock`—, así que **Intro** y **N** son el camino de quien está jugando;
 * los botones son para quien tenga el ratón suelto. Cada botón lleva su tecla
 * escrita, que es lo que evita tener que contar esto en ninguna parte.
 *
 * La entrada es una transición de `transform`, no un `hidden` que se quita: un
 * cartel que aparece de golpe en el borde de la pantalla se confunde con un
 * fogonazo, y uno que entra deslizándose se lee como algo que llega.
 */
function pintarVotacion() {
  const v = cliente.votacion
  const visible = v.activa && !v.mia && !v.votado
  if (!visible) {
    // Se retira deslizándose por donde vino; `hidden` iría después, pero no
    // hace falta: fuera de pantalla no recibe clics porque no tiene sitio.
    panelVoto.classList.remove('puesto')
    return
  }
  if (!panelVoto.dataset.montado) {
    panelVoto.innerHTML =
      '<b>VOTACIÓN DE PAUSA</b><em id="votoResta">&nbsp;</em>' +
      '<small>tu rival se ha quedado sin pausas libres y pide una · ' +
      'la partida sigue mientras decides</small>' +
      '<div class="acciones">' +
      '<button id="votoSi">Aceptar <kbd>Intro</kbd></button>' +
      '<button id="votoNo" class="declinar">Declinar <kbd>N</kbd></button>' +
      '</div>'
    $('votoSi').addEventListener('click', () => cliente.votar(true))
    $('votoNo').addEventListener('click', () => cliente.votar(false))
    panelVoto.dataset.montado = '1'
  }
  // El deslizamiento necesita un frame con el cartel ya colocado fuera: si se
  // pone la clase en el mismo turno en que nace el nodo, el navegador no tiene
  // dos estados entre los que animar y aparece de golpe.
  requestAnimationFrame(() => panelVoto.classList.add('puesto'))
}

/** Las dos cuentas atrás, que van por frame y no por foto. */
function pintarRestas(ahora) {
  const dePausa = document.getElementById('pausaResta')
  if (dePausa) {
    const resta = cliente.restaPausaMs(ahora)
    dePausa.textContent = resta === null ? '' : reloj(resta)
    // **El botón de dar por abandonada aparece solo**, pasados los primeros
    // segundos de la caída. Se enseña aquí —que es lo que corre por frame— y no
    // al pintar el cartel, porque el cartel se pinta una vez y esto es una
    // cuenta atrás. Rehacer el cartel por frame se llevaría el clic por delante.
    const reclamar = document.getElementById('reclamar')
    if (reclamar && resta !== null) {
      reclamar.hidden = resta > (ROUNDS.reconexionSegundos - ROUNDS.abandonoDesdeSegundos) * 1000
    }
  }
  const deVoto = document.getElementById('votoResta')
  if (deVoto && panelVoto.classList.contains('puesto')) {
    const resta = cliente.restaVotacionMs(ahora)
    deVoto.textContent = resta === null ? '' : reloj(resta)
  }
}

/**
 * **Y se puede contestar con teclas**, que es lo que necesita quien está
 * jugando: soltar el ratón para pinchar un botón abre el menú encima de la
 * partida, y la partida está corriendo. Ni Intro ni N son teclas de movimiento.
 */
addEventListener('keydown', (e) => {
  const v = cliente.votacion
  if (!v.activa || v.mia || v.votado || escribiendo()) return
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); cliente.votar(true) }
  else if (e.code === 'KeyN') { e.preventDefault(); cliente.votar(false) }
})

/**
 * **Pedir la votación devuelve a jugar en el acto.** Es el punto entero de la
 * vuelta 55: se manda la solicitud, se cierra el menú y se recupera el ratón.
 * Quien la pide no espera en ninguna parte — si sale, se entera porque el mundo
 * se para; si no sale, no pasa nada y no hay ningún aviso que cerrar.
 */
/**
 * **Pausar es un botón, no un gesto** (vuelta 60). Hasta la 58 soltar el ratón
 * pedía la pausa por su cuenta, y eso hacía que abrir el menú —para mirar el
 * código, copiar el enlace o teclear otro— gastase una de las tres libres sin
 * que nadie la hubiera pedido. Ahora Escape abre el menú y nada más; lo que
 * gasta una pausa es pulsar aquí.
 */
$('pausar').addEventListener('click', () => {
  cliente.pedirPausa()
})
$('pedirVoto').addEventListener('click', () => {
  cliente.pedirVotacion()
  motor.requestLock()
})

/**
 * **Y si se despliega una versión nueva, se entera sola** (vuelta 93). Aquí
 * «se puede recargar» es **el ratón suelto**: con el ratón capturado estás
 * jugando, y en un duelo recargar no te cuesta la ronda sólo a ti — se la
 * cuesta también al rival, que se queda mirando a un muñeco quieto los noventa
 * segundos de la ventana de reconexión. Con el menú o la tienda delante, no.
 */
vigilarActualizaciones({
  puedeRecargar: () => document.pointerLockElement === null,
})

/**
 * **Y la pantalla completa de la app** (vuelta 97), montada aquí por lo mismo que
 * el vigilante de arriba: es de la ventana y no de un modo, así que las dos
 * páginas llaman a la misma función. En un navegador no hace nada.
 */
montarPantallaCompleta()

/**
 * **Los controles del menú los escribe esto, con la tecla que hay puesta**
 * (vuelta 97). Ver el comentario de `#controles` en `prueba.html`: estaban a mano
 * y son reasignables. Se repinta al cambiar un bind —se pueden cambiar sin salir
 * de la partida desde la vuelta 73, que es cuando el menú de ESC ganó su botón de
 * opciones— y se construye con nodos y no con una cadena de HTML: el rótulo de
 * una tecla sale de un catálogo cerrado, pero pegar texto en `innerHTML` es una
 * costumbre que un día se lleva una comilla.
 */

function pintarControles(binds) {
  // La tienda se cierra con la tecla de armería, que también es un bind: aquí
  // decía «B» en duro (vuelta 97).
  const cierra = document.getElementById('tiendaCierra')
  if (cierra) cierra.textContent = keyLabel(keysOf('armoury', binds)[0])

  /**
   * **Una tabla de dos columnas** (vuelta 98): qué hace y con qué tecla. Las
   * filas se escriben con nodos y no con `innerHTML`, porque las teclas salen de
   * lo que el jugador ha guardado (la regla de la 97 con el HTML de esta página).
   */
  const cuerpo = document.getElementById('controles')
  if (!cuerpo) return
  cuerpo.textContent = ''
  const filas = CONTROLES_DEL_DUELO.map((c) => [
    c.que,
    c.direcciones
      ? ['forward', 'left', 'back', 'right'].map((a) => keyLabel(keysOf(a, binds)[0])).join(' ')
      : keyLabel(keysOf(c.accion, binds)[0]),
  ])
  // Dos teclas que no son binds y van escritas: Escape es la salida del ratón
  // (está en `FORBIDDEN_KEYS`) y F3 es de esta página, como las del editor.
  filas.push(['Este menú (no pausa por sí solo)', 'ESC'])
  filas.push(['Números de red', 'F3'])
  for (const [que, tecla] of filas) {
    const tr = document.createElement('tr')
    const a = document.createElement('td')
    a.textContent = que
    const b = document.createElement('td')
    const kbd = document.createElement('kbd')
    kbd.textContent = tecla
    b.append(kbd)
    tr.append(a, b)
    cuerpo.append(tr)
  }
  if (libresQueQuedan !== null) {
    const tr = document.createElement('tr')
    const a = document.createElement('td')
    a.textContent = 'Pausas que te quedan sin pedir permiso'
    const b = document.createElement('td')
    b.id = 'libresMenu'
    b.textContent = String(libresQueQuedan)
    tr.append(a, b)
    cuerpo.append(tr)
  }
}

/**
 * **El botón del teclado abre y cierra la tabla.** Es un `.control`: se pincha
 * con el ratón suelto y su clic no cuenta como el que captura (vuelta 48).
 */
$('invitar').addEventListener('click', () => {
  const abierta = $('invitacion').hidden
  $('invitacion').hidden = !abierta
  $('invitar').setAttribute('aria-expanded', String(abierta))
})

$('teclado').addEventListener('click', () => {
  const abierta = $('tablaControles').hidden
  $('tablaControles').hidden = !abierta
  $('teclado').setAttribute('aria-expanded', String(abierta))
})

/**
 * **Qué botones lleva el menú, según haya partida** (vuelta 98). Sin rival esto
 * es la pantalla de crear la sala: «Volver» al menú del juego, y ni pausar ni
 * abandonar, porque no hay partida que pausar ni de la que irse. Con el rival
 * dentro es la pausa de una partida, y ahí van las dos cosas y «Volver» se va:
 * volver al menú en mitad de una partida **es** abandonarla, y dos botones que
 * hacen lo mismo con dos nombres es uno que miente.
 */
function pintarBotonesDelMenu() {
  // **El menú de ESC es ya sólo de la partida** (vuelta 101): crear la sala es
  // el lobby, así que aquí no hay un «Volver» de antes de jugar.
  pintarPausa()
}

pintarControles(getKeybinds())
subscribeKeybinds(pintarControles)

cliente.conectar()

/**
 * **Y el campo de teclear un código se quitó** (vuelta 92).
 *
 * Estaba desde la 47 como la otra puerta a una sala y lo que se comparte de
 * verdad es el enlace entero: teclear seis caracteres no llega a ningún sitio
 * al que el enlace no lleve ya, y sí puede llevar a una sala equivocada si se
 * teclean mal. Un control que sólo produce el mismo resultado o uno peor no es
 * una opción, es una forma de equivocarse.
 *
 * Lo que **no** se ha tocado es nada de debajo: el alfabeto sin parejas que se
 * confunden al dictar (vuelta 47), `normalizarCodigo` y `direccionDeLaBarra`
 * siguen en pie porque los usa el propio enlace. Entrar en otra sala es abrir
 * su dirección — que es exactamente lo que este botón hacía, con un paso más.
 */
/**
 * **Copiar el enlace, y que se copie de verdad** (vuelta 67).
 *
 * `navigator.clipboard` **no existe fuera de un contexto seguro**, y una IP de
 * red por `http://` —que es justo cómo se juega en casa desde otro PC— no lo es.
 * Así que `await navigator.clipboard.writeText(...)` ni siquiera fallaba al
 * escribir: petaba al leer `writeText` de `undefined`, se lo comía el `catch`, y
 * lo único que pasaba era que el texto quedaba seleccionado. Desde fuera, un
 * botón que no hace nada.
 *
 * Debajo va `document.execCommand('copy')`, que está obsoleto y **funciona sin
 * contexto seguro**, que es exactamente lo que hace falta aquí. Y el botón dice
 * qué ha pasado en los tres casos: copiado, o «selecciónalo» si no se ha podido
 * —porque entonces hay algo que hacer a mano y el jugador tiene que saberlo—.
 */
async function copiarTexto(texto, campo = $('enlaceMenu')) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    /* sin permiso: queda el camino de abajo */
  }
  try {
    campo.focus()
    campo.select()
    campo.setSelectionRange(0, texto.length)
    return document.execCommand('copy')
  } catch {
    return false
  }
}

$('copiarMenu').addEventListener('click', async () => {
  const boton = $('copiarMenu')
  $('enlaceMenu').value = enlaceActual()
  const bien = await copiarTexto(enlaceActual())
  if (!bien) $('enlaceMenu').select()
  boton.textContent = bien ? 'copiado' : 'selecciónalo'
  setTimeout(() => { boton.textContent = 'copiar' }, 1600)
})

// ---------------------------------------------------------------- entrada
const MAPA = {
  KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  Space: 'jump', KeyC: 'crouch', ShiftLeft: 'walk',
}
// Cuándo empezó el paso que se está dando, para repartir la pulsación de salto.
let inicioDePaso = performance.now()
/**
 * Escribir un código de sala es escribir letras, y tres de ellas —W, A, S, D—
 * son andar. Mientras el foco está en un campo de texto el teclado es del
 * campo, no del juego. Hace falta desde que el panel tiene dónde teclear.
 */
const escribiendo = () => document.activeElement?.tagName === 'INPUT'
addEventListener('keydown', (e) => {
  const accion = MAPA[e.code]
  if (!accion || e.repeat || escribiendo()) return
  // Con el mundo parado, una tecla no es una intención: es ruido que se
  // aplicaría entero al reanudar.
  if (cliente.pausa.pausada) return
  e.preventDefault()
  cliente.teclas[accion] = true
  // El salto se sella con el instante real del evento, no con el del paso que
  // lo atiende: es lo que conserva la precisión de la ventana de encadenado.
  if (accion === 'jump') {
    cliente.pulsarSalto(Number.isFinite(e.timeStamp) && e.timeStamp > 0 ? e.timeStamp : performance.now())
  }
})
addEventListener('keyup', (e) => {
  const accion = MAPA[e.code]
  if (accion && !escribiendo()) cliente.teclas[accion] = false
})
addEventListener('blur', () => {
  for (const k of Object.keys(cliente.teclas)) cliente.teclas[k] = false
})

/**
 * **Un clic en cualquier sitio que no sea un control captura el ratón.**
 *
 * Estaba en el canvas, y el canvas **nunca recibía el clic**: el aviso ocupa la
 * pantalla entera (`inset: 0`), va después en el documento y no llevaba
 * `z-index`, así que se pinta encima; y los eventos suben, no bajan. Resultado:
 * la página no se podía empezar a jugar, y no salió en ninguna suite porque los
 * bancos escriben en `cliente.teclas` desde dentro y nunca hicieron clic. La
 * lección está en `docs/decisions.md` §48.
 *
 * Por eso ahora escucha el documento —que es quien recibe todo— y la única
 * excepción son los controles: copiar el enlace, teclear un código o mover un
 * mando de depuración se hacen con el ratón suelto, y capturarlo al tocarlos
 * dejaría el enlace a medias y la partida empezada.
 */
/**
 * **La vuelta a la partida** (vuelta 101): cierra lo que haya abierto encima y
 * pide la captura. ESC, la tecla de armería con la tienda abierta y el clic
 * llegan todos aquí. Mientras se espera al navegador, el menú no asoma —se está
 * volviendo—, y si la captura no llega en un par de segundos (el navegador la
 * rechazó) vuelve a salir, para que nadie se quede mirando el HUD sin mando.
 */
const vuelta = crearVueltaConEscape(() => motor.requestLock())
let volviendoHasta = 0
function cerrarLoDeEncima() {
  if (!tienda.hidden) alternarTienda(false)
  if (capa.hayPanel()) capa.panel(null)
  $('tablaControles').hidden = true
  $('teclado').setAttribute('aria-expanded', 'false')
}
function volviendo() {
  cerrarLoDeEncima()
  aviso.hidden = true
  volviendoHasta = performance.now() + RESUME_KEY_DELAY_MS + 900
  setTimeout(() => {
    if (document.pointerLockElement === lienzo || vista !== 'juego') return
    if (performance.now() < volviendoHasta) return
    aviso.hidden = !tienda.hidden || capa.hayPanel() || $('fin').classList.contains('puesto')
  }, RESUME_KEY_DELAY_MS + 1000)
}

addEventListener('click', (e) => {
  if (vista !== 'juego') return
  if (document.pointerLockElement === lienzo) return
  /**
   * **Con un panel abierto, un clic es del panel** (vuelta 103). La armería y
   * las opciones son de React y no llevan `.control`, así que pinchar una
   * pestaña de categoría o una ficha **capturaba el ratón**, y capturarlo cierra
   * el panel: se reportó como «pinchar en la armería te saca de la armería».
   * Y se mira el camino del evento y no `closest`, porque React puede haber
   * quitado del documento el botón pinchado —la pestaña que deja de estar
   * elegida se vuelve a pintar— antes de que el clic llegue aquí.
   */
  if (capa.hayPanel()) return
  if (e.composedPath().some((n) => n instanceof Element && n.classList.contains('control'))) return
  vuelta.cancelar()
  // **Capturar es cosa del motor** desde la vuelta 56: además del `pointerLock`
  // arranca el contexto de audio —que no existe sin un gesto y éste es el único
  // que hay seguro—, pide las muestras de disparo y engancha el listener
  // espacial a la cámara. Es idempotente, y Chrome puede rechazar la captura
  // justo después de un Escape: no es un error del que haya que enterarse.
  motor.requestLock()
})

/**
 * **ESC es un «atrás» forzado, y acaba en la partida** (vuelta 89; desde la 101,
 * de una vez). Jugando, ESC es del navegador y abre el menú. Con el menú puesto,
 * **cualquier ESC** cierra lo que haya encima —la tienda, las opciones, la tabla
 * de controles— y vuelve a la partida; si cae dentro de la espera del navegador
 * (`RESUME_KEY_DELAY_MS`) no se tira, se anota y se cumple en cuanto se puede
 * (`crearVueltaConEscape`). Hasta la 101 esas pulsaciones se perdían, y quien
 * aporreaba ESC para volver se quedaba en el menú.
 *
 * El ESC de la tienda lo recibe antes su manejador (está en `document`), que la
 * cierra y nada más: la vuelta es de aquí.
 */
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (vista !== 'juego' || $('fin').classList.contains('puesto')) return
  if (document.pointerLockElement === lienzo) return
  e.preventDefault()
  if (vuelta.pedir()) volviendo()
})

/**
 * **F3 enseña los números**, como en el juego. Están apagados de fábrica: un
 * jugador no tiene por qué mirar el error de reconciliación, y los mandos de
 * red estropeada al lado del código de partida invitan a tocarlos sin saber que
 * lo que hacen es empeorar tu propia conexión a propósito.
 */
addEventListener('keydown', (e) => {
  if (e.code !== 'F3') return
  e.preventDefault()
  panel.hidden = !panel.hidden
})
// El disparo lo lleva el motor desde la vuelta 56: cargador, cadencia, recarga,
// retroceso y dispersión son suyos, y lo que sale a la red es el clic sellado
// con su instante real. Esta página ya no toca el gatillo.
document.addEventListener('pointerlockchange', () => {
  const capturado = document.pointerLockElement === lienzo
  if (!capturado) vuelta.soltado()
  else {
    vuelta.cancelar()
    volviendoHasta = 0
    // El código se vuelve a esconder: se enseña cuando se pide (vuelta 101).
    $('invitacion').hidden = true
    $('invitar').setAttribute('aria-expanded', 'false')
  }
  // **Soltar el ratón ya no pide pausa** (vuelta 60). Lo hizo desde la 53, y la
  // idea era buena —que el mundo no siguiera corriendo con el menú puesto— pero
  // el precio se veía jugando: abrir el menú para mirar el código, copiar el
  // enlace o teclear otro **gastaba una de las tres libres** sin que nadie la
  // hubiera pedido, y no había forma de abrirlo sin pagarla.
  //
  // Ahora Escape abre el menú y nada más; pausar es el botón de ahí dentro. Lo
  // que la 53 arregló de verdad sigue en pie y es lo que importaba: **soltar el
  // ratón suelta las teclas**, así que con el menú puesto no se anda. Lo que se
  // acepta a cambio es que el mundo siga corriendo mientras miras el menú, o
  // sea que ahí sigues siendo un blanco — igual que en la votación de la 55, y
  // por la misma razón: pausar al rival no puede ser un efecto secundario de un
  // gesto tuyo.
  // **Y volver a pinchar la levanta**, si era tuya. Escape pausa, clic reanuda:
  // sin esto se recuperaba el ratón con el mundo todavía congelado, que es
  // justo el estado confuso que esta vuelta viene a quitar. La del rival no se
  // toca — sólo la levanta quien la puso.
  if (capturado && cliente.pausa.mia) cliente.reanudar()
  if (!capturado) {
    // **Y soltar el ratón suelta las teclas**, igual que perder el foco. No es
    // una pausa local fingida —la pausa la decide el servidor y tarda un viaje
    // en llegar— sino la verdad de lo que pasa: quien abre el menú no está
    // pulsando nada. Sin esto, entre Escape y la confirmación del servidor se
    // andaba un viaje entero: medido, 0.22 u con 35 ms de RTT.
    // Las teclas y la mirada las suelta el motor, en el mismo evento y por la
    // misma razón (ver `_onPointerLockChange`). Aquí queda lo que es de la
    // página: qué se enseña.
  }
  // El menú se abre y se cierra muchas veces sin que la pausa cambie de estado,
  // y lo que se enseña ahí dentro depende de las libres que queden: se repinta
  // al abrirlo, que es cuando se mira.
  if (!capturado) pintarPausa()
  // Y si lo que hay abierto es la tienda, el menú no vuelve: son dos pantallas
  // de la misma situación —el ratón suelto— y sólo cabe una.
  aviso.hidden = vista !== 'juego' || capturado || !tienda.hidden || capa.hayPanel() || performance.now() < volviendoHasta
  // **La mira es de jugar**: con el ratón suelto no se apunta a nada y tapa el
  // menú. El resto del HUD se queda puesto, que es lo que hace el juego.
  document.body.classList.toggle('jugando', capturado)
  capa.jugando(capturado)
  // Y si se recupera el ratón con un panel abierto, el panel se cierra: no se
  // juega con las opciones delante.
  if (capturado) capa.panel(null)
})

for (const [id, campo] of [['lat', 'latenciaMs'], ['jit', 'jitterMs']]) {
  $(id).addEventListener('input', (e) => {
    enlace[campo] = +e.target.value
    $(id + 'V').textContent = e.target.value
  })
}
$('per').addEventListener('input', (e) => {
  enlace.perdida = +e.target.value / 100
  $('perV').textContent = e.target.value
})
$('gho').addEventListener('change', (e) => { fantasma.group.visible = e.target.checked })

// ------------------------------------------------------------------ pantalla
$('gho').addEventListener('change', (e) => { fantasma.group.visible = e.target.checked })

/**
 * **El bucle es el del motor desde la vuelta 56.** Aquí no queda ninguno: lo
 * que había —acumulador, enganche al reloj del servidor, re-anclaje, freno con
 * suelo y dibujado interpolado— se ha movido a `cliente.pasosDeFrame()` y a
 * `engine._advanceNet()`, que es donde puede haber **uno solo**. Esta página se
 * engancha por `onFrame`, que el motor publica una vez por fotograma.
 */
/**
 * **El todos contra todos, arriba y centrado** (vuelta 100): el reloj y nada
 * más. Hasta la 101 llevaba debajo «1 · líder 1 / 20» —tus bajas, las del que
 * va primero y el objetivo— y jugándolo **no se entendía**. Lo que un jugador
 * pregunta de reojo es cuánto queda; cuántas llevan todos y cuántas hacen falta
 * lo dice el marcador de TAB, con todas las letras (`pintarTabla`).
 */
let todosPintado = ''
function pintarTodos() {
  const t = cliente.todos
  const seg = Math.ceil(Math.max(0, t.resta) / 1000)
  const reloj = t.fase === 'juego' ? `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}` : ' '
  const clave = `${reloj}|${t.fase}`
  if (clave === todosPintado) return
  todosPintado = clave
  $('rondaTiempo').textContent = reloj
  $('rondaMarcador').textContent = ''
}

function pintarFaseTodos(t) {
  $('rondaN').textContent = 'TODOS CONTRA TODOS'
  $('rondaFase').textContent = t.fase === 'espera' ? 'ESPERANDO RIVALES' : ' '
  todosPintado = ''
  const acabo = t.fase === 'fin'
  if (!acabo) {
    ponerFin(null)
    return
  }
  const gane = t.ganador === cliente.ranura
  const puesto = 1 + cliente.marcador.filter((f) => f.b > (cliente.bajas ?? 0)).length
  ponerFin({
    titulo: t.ganador === -1 ? 'EMPATE ARRIBA' : gane ? 'HAS GANADO' : `GANA ${cliente.nickDe(t.ganador)}`,
    color: gane ? '#2FCB82' : '#EDEDED',
    detalle: `${cliente.bajas ?? 0} bajas tuyas · ${puesto}º de ${cliente.marcador.length}`,
  })
}

/**
 * **El cartel del final, uno para todos los modos** (vuelta 101). Hasta aquí el
 * duelo y el todos contra todos pintaban cada uno el suyo —con un botón, con
 * ninguno, o con «la siguiente empieza sola»— y lo que se pidió es uno: el
 * resultado, **Volver a jugar** destacado y latiendo, y **Salir al menú**.
 * Volver a jugar te devuelve a la sala listo para la siguiente, con el mismo
 * modo y el mismo mapa; la lanza el anfitrión cuando estéis.
 *
 * @param {null|{titulo: string, color: string, detalle: string}} fin
 */
function ponerFin(fin) {
  $('fin').classList.toggle('puesto', Boolean(fin))
  document.body.classList.toggle('con-fin', Boolean(fin))
  if (!fin) return
  $('finQuien').textContent = fin.titulo
  $('finQuien').style.color = fin.color
  $('finDetalle').textContent = fin.detalle
  if (document.pointerLockElement === lienzo) soltarRaton()
}

/**
 * **El marcador de la sala, con TAB** (vuelta 100; en todos los modos y con el
 * objetivo escrito desde la 101). Es la misma tecla y la misma forma que el del
 * entrenamiento —abierto mientras se mantiene, y sólo jugando—. Arriba dice
 * **qué hace falta para ganar**, que es la línea que el reloj llevaba debajo y
 * nadie entendía; con eso cada uno saca sus cuentas mirando las filas. En un
 * modo por equipos va por bandos, con las rondas de cada uno. Se rehace cuando
 * cambia (`marcadorVersion`, las rondas), no por frame.
 */
let tablaVersion = ''
function pintarTabla(abierta) {
  const tabla = $('tablaTodos')
  tabla.hidden = !abierta
  if (!abierta) return
  const r = cliente.rondas
  const version = `${cliente.marcadorVersion}|${r.marcador}|${cliente.todos.objetivo}`
  if (tablaVersion === version) return
  tablaVersion = version
  const fila = (f) => {
    const yo = f.id === cliente.id
    const color = esTodos() ? colorDeJugador(f.r).color : BANDOS[f.bd ?? f.r % 2].color
    return `<tr class="${yo ? 'yo' : ''}${f.c ? ' caido' : ''}"><td><span class="swatch" style="background:${color}"></span>` +
      `${f.n ?? cliente.nickDe(f.r)}${yo ? ' · tú' : ''}${f.c ? ' · sin conexión' : ''}</td>` +
      `<td>${f.b}</td><td>${f.m}</td><td>${f.m ? (f.b / f.m).toFixed(2) : f.b.toFixed(2)}</td></tr>`
  }
  const orden = (a, b) => b.b - a.b || a.m - b.m
  if (esTodos()) {
    const obj = cliente.todos.objetivo || TODOS.bajasParaGanar
    $('tablaObjetivo').textContent = `Gana el primero en llegar a ${obj} bajas · o el que más lleve a los ${TODOS.minutos} min`
    $('tablaFilas').innerHTML = [...cliente.marcador].sort(orden).map(fila).join('')
    return
  }
  const mayoria = Math.floor(ROUNDS.maxRondas / 2) + 1
  $('tablaObjetivo').textContent = r.prorroga
    ? `Prórroga: gana el equipo que vaya por delante al acabar una tanda de ${ROUNDS.prorrogaTanda}`
    : `Gana el primer equipo en llegar a ${mayoria} rondas (de ${ROUNDS.maxRondas})`
  $('tablaFilas').innerHTML = [0, 1].map((bando) => {
    const suyos = cliente.marcador.filter((f) => (f.bd ?? f.r % 2) === bando).sort(orden)
    return `<tr class="bando"><td colspan="4" style="color:${BANDOS[bando].color}">Equipo ${BANDOS[bando].label.toLowerCase()} · ` +
      `${r.marcador[bando] ?? 0} ronda${(r.marcador[bando] ?? 0) === 1 ? '' : 's'}</td></tr>` + suyos.map(fila).join('')
  }).join('')
}

// **Lo que cambia de fase se pinta al cambiar, no por frame.**
cliente.onRonda = (r) => {
  pintarFaseDeRonda(r)
  // **La tienda se entera del cambio de fase por aquí**, no por la economía: un
  // cambio de fase abre o cierra la ventana y no manda un `MSG.ECONOMIA` (nada
  // ha cambiado de lo que tienes). Sin esto, el panel abierto se quedaba con el
  // rótulo y los botones de la fase anterior.
  if (!tienda.hidden) pintarTienda()
}
cliente.onTodos = (t) => pintarFaseTodos(t)

// **Irse se dice.** Es lo único que distingue un abandono de una caída: sin este
// mensaje, cerrar la pestaña y que se caiga el wifi llegan por la misma puerta.
/**
 * **Las opciones, sin salir de la partida** (vuelta 73). Es el panel del juego
 * —el mismo componente, los mismos ajustes, el mismo store— y por eso trae de
 * una vez la sección de controles, la sensibilidad y **la sensibilidad de la
 * mirilla**, que existe desde la vuelta 70 y en el duelo no se podía alcanzar.
 *
 * No pausa: una pausa es parar el mundo de los dos y sólo la decide el servidor
 * (vuelta 53). Aquí eres un blanco mientras lo miras, igual que con el menú
 * desde la 60 y con la tienda desde la 64 — y por eso el botón de pausar sigue
 * estando al lado, que es lo que sí para el mundo.
 */
$('opciones').addEventListener('click', () => {
  aviso.hidden = true
  capa.panel('opciones')
})

$('salir').addEventListener('click', () => {
  salirAlMenu()
})

/**
 * **Irse es irse a algún sitio** (vuelta 67). Hasta aquí el botón mandaba el
 * adiós, cerraba el cable y **dejaba al jugador en la misma pantalla**: el menú
 * de una partida de la que acababa de salir, con su código, su enlace y su
 * botón de pausa. Desde fuera se leía como que el botón no hacía nada.
 *
 * El adiós va primero y la navegación después, y en ese orden importa: es el
 * único mensaje que distingue un abandono de una caída (vuelta 62), y descargar
 * la página cierra el socket sin decir nada.
 */
function salirAlMenu(seccion = '') {
  guardarPartida(null)
  cliente.abandonar()
  window.location.href = `${NET.rutaJuego}${seccion}`
}
// Y la salida del cartel de fin: suelta la butaca —la partida ya está decidida,
// no hay nada que reservar— y deja a la vista el menú, que es donde se teclea
// otro código. Sin esto el cartel es una pantalla sin salida.
$('finSalir').addEventListener('click', () => {
  salirAlMenu()
})
/**
 * **Volver a jugar** (vuelta 101): a la sala, y listo. El servidor lo apunta
 * (`MSG.VOLVER`) y el estado de la sala que vuelve ya dice que estás en el
 * lobby; la siguiente la lanza el anfitrión con los que estéis listos.
 */
$('finOtra').addEventListener('click', () => {
  mandarALaSala({ t: MSG.VOLVER })
})

// ------------------------------------------------------------------ el lobby
/**
 * **La sala, antes que la partida** (vuelta 101). La página abre **sólo el
 * lobby**: sin mapa detrás, sin motor en marcha y sin nada que capture el
 * ratón. Lo que se ve lo decide el estado de la sala que manda el servidor:
 * con una partida en juego en la que estás, el juego; con todo lo demás —antes
 * de la primera, entre partidas o esperando a la siguiente—, el lobby.
 */
let vista = null
let estadoDeSala = null
let motorArrancado = false
/** El modo del escenario montado en el motor, para saber si hay que cambiarlo. */
let modoMontado = MODO

const lobbyUI = montarLobby(document.getElementById('lobby'), {
  codigo,
  enlace: enlaceActual(),
  api: {
    config: (cambios) => mandarALaSala({ t: MSG.CONFIG, ...cambios }),
    listo: (v) => mandarALaSala({ t: MSG.LISTO, v: Boolean(v) }),
    hueco: (h) => mandarALaSala({ t: MSG.HUECO, h }),
    mezclar: () => mandarALaSala({ t: MSG.MEZCLAR }),
    lanzar: () => mandarALaSala({ t: MSG.LANZAR }),
    entrar: () => mandarALaSala({ t: MSG.ENTRAR }),
    salir: () => salirAlMenu(),
    copiar: (texto) => copiarTexto(texto),
    /**
     * **El raíl de la cabina, desde aquí** (vuelta 101): Armería y Opciones se
     * abren encima, que son los mismos paneles del juego (vuelta 73); Inicio y
     * Entrenar son otra página, y salir hacia allí es salir de la sala.
     */
    ir: (seccion) => {
      if (seccion === 'armeria') capa.panel('ficha')
      else if (seccion === 'opciones') capa.panel('opciones')
      else if (seccion === 'entrenamiento') salirAlMenu('#entrenamiento')
      else if (seccion === 'inicio') salirAlMenu()
    },
  },
})

/** Un mensaje a la sala. Va por el mismo cable que la partida. */
function mandarALaSala(mensaje) {
  cliente.transporte.send(JSON.stringify(mensaje))
}

/**
 * **Llega el estado de la sala** (`MSG.LOBBY`): se repinta el lobby y se
 * decide qué se ve. Si hay una partida lanzada en la que estás, se monta su
 * mapa —si no es el que hay— **antes** de que llegue su bienvenida, que viene
 * detrás por el mismo cable.
 */
function alEstadoDeSala(sala) {
  estadoDeSala = sala
  configDeSala = { modo: sala.modo, mapa: sala.mapa }
  const yo = sala.m.find((m) => m.id === sala.tu) ?? null
  const pt = sala.pt
  const enPartida = Boolean(yo?.p) && pt.e !== 'ninguna'
  const quiereJuego = enPartida && !(pt.e === 'fin' && yo?.v)
  if (quiereJuego && pt.mapa && (pt.mapa !== motor.scenario.key || pt.modo !== modoMontado)) {
    motor.fijarEscenario(definicionDeSala(pt.modo, pt.mapa))
    modoMontado = pt.modo
  }
  // La barra y el enlace llevan la configuración de la sala, sin recargar.
  const barra = new URL(window.location.href)
  barra.searchParams.set('mapa', sala.mapa)
  if (sala.modo === 'duelo') barra.searchParams.delete('modo')
  else barra.searchParams.set('modo', sala.modo)
  history.replaceState(null, '', barra.toString())
  $('enlaceMenu').value = enlaceActual()
  // El sitio, para volver a él si se cae el cable o se recarga la página.
  if (yo) guardarPartida({ codigo, pase: sala.pase ?? guardada?.pase ?? null, cuando: Date.now() })
  const otra = partidaGuardada()
  lobbyUI.pintar({
    estado: sala,
    enlace: enlaceActual(),
    reconectar: otra && otra.codigo !== codigo
      ? { codigo: otra.codigo, ir: () => { window.location.href = `/duelo/${otra.codigo}` } }
      : null,
  })
  ponerVista(quiereJuego ? 'juego' : 'lobby')
}

/**
 * **Lobby o juego.** En el lobby el motor no dibuja, el ratón no se captura y
 * lo que es de jugar no se enseña; en el juego, al revés, y la primera vez
 * arranca el motor.
 */
function ponerVista(cual) {
  if (vista === cual) return
  vista = cual
  const enLobby = cual === 'lobby'
  document.body.classList.toggle('en-lobby', enLobby)
  $('lobby').hidden = !enLobby
  capa.conHud(!enLobby)
  motor.dibujar(!enLobby)
  if (enLobby) {
    if (document.pointerLockElement === lienzo) soltarRaton()
    alternarTienda(false)
    return
  }
  capa.panel(null)
  if (!motorArrancado) {
    motorArrancado = true
    motor.start()
  }
  aviso.hidden = document.pointerLockElement === lienzo
}
// **Y cerrar la pestaña no manda nada, a propósito.** La primera versión mandaba
// el adiós en `pagehide`, y estaba mal por una razón que sólo se ve al probarlo:
// el navegador dispara ese evento **igual al recargar**, y recargar es justo
// como se vuelve a una partida. Con eso puesto, reconectar era abandonar.
// Cerrar la pestaña es una caída como cualquier otra: quedan noventa segundos
// para volver y, si no se vuelve, acaba en abandono igual. Es el lado seguro del
// error, que es la regla de esta vuelta entera.

// **El motor no arranca al cargar** (vuelta 101): arranca con la primera
// partida (`ponerVista('juego')`). En el lobby no hay mundo que mover ni que
// dibujar.

const costes = []
function pintarHud(stats) {
  const ahora = performance.now()
  // **El HUD es el del juego** (vuelta 73): vida, escudo, casco, munición,
  // recarga, viñeta de abatido y marca de Vektor salen de `Hud.jsx` por refs,
  // igual que en el entrenamiento. Aquí sólo se le pasa el mismo `stats` que ya
  // venía publicando el motor — no hacía falta ni un campo nuevo.
  capa.pintar(stats)
  // El fantasma: la última palabra del servidor sobre ti. Va aquí y no en el
  // motor porque es un instrumento de medida, no una pieza del juego.
  if (cliente.autoritativo && $('gho').checked) {
    fantasma.group.visible = true
    fantasma.group.position.set(cliente.autoritativo.x, cliente.autoritativo.feetY, cliente.autoritativo.z)
    fantasma.setEyeHeight(cliente.autoritativo.eyeHeight)
  } else {
    fantasma.group.visible = false
  }
  pintarRestas(ahora)
  pintarRonda()
  pintarTabla(Boolean(stats.scoreboard))
  pintarRed(ahora)
  pintarPanel()
}

/**
 * **El marcador de ronda.** Se reparte como el cartel de la pausa: lo que cambia
 * de fase se escribe **al cambiar** (`onRonda`) y la cuenta, que baja sesenta
 * veces por segundo, va en su propio nodo y sólo cuando cambia el segundo.
 * Rehacer el bloque por frame es la regla del HUD rota por la puerta de atrás.
 */
let restaPintada = ''
/** El último segundo que ya ha pitado, para que cada uno suene una vez. */
let segPitado = -1
function pintarRonda() {
  if (esTodos()) {
    pintarTodos()
    return
  }
  const r = cliente.rondas
  if (r.fase === 'espera' || r.fase === 'fin') {
    if (restaPintada !== '') {
      restaPintada = ''
      $('rondaTiempo').textContent = ' '
    }
    return
  }
  // **La cuenta la calcula el servidor y aquí sólo se enseña.** Viaja *cuánto
  // queda*, no hasta cuándo: los relojes de las dos pantallas y el del servidor
  // no coinciden. Y como el reloj de la ronda es el número de paso, en pausa no
  // baja sola: deja de bajar porque el mundo deja de avanzar.
  /**
   * **En la compra sin límite no hay cuenta: hay listos** (vuelta 102). Lo que
   * se enseña en el sitio del reloj es cuántos han dicho «listo» de cuántos, y
   * se repinta el botón de la tienda con el mismo cambio, que es cuando cambia.
   */
  if (r.fase === 'compra' && r.sinLimite) {
    const texto = `LISTOS ${r.listos.length}/${r.listos.length + r.faltan}`
    if (texto === restaPintada) return
    restaPintada = texto
    $('rondaTiempo').textContent = texto
    pintarListo()
    return
  }
  const seg = Math.ceil(Math.max(0, r.resta) / 1000)
  const texto = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`
  if (texto === restaPintada) return
  restaPintada = texto
  $('rondaTiempo').textContent = texto

  /**
   * **Que la ronda se acaba se oye, no sólo se ve** (vuelta 73). El rojo ya
   * estaba —desde la 62, a 20 s— y no bastaba: es información en un sitio al
   * que no se mira, y lo que se notaba jugando era aparecer de vuelta en la
   * salida sin que nada lo hubiera dicho. El oído no hay que apuntarlo a
   * ninguna parte, que es exactamente el problema.
   *
   * Un pitido por segundo dentro de la ventana, y **uno por segundo de verdad**:
   * se dispara en el cambio de cifra, que es el mismo sitio donde se escribe el
   * reloj, así que no hay un segundo temporizador que pueda desfasarse del que
   * se ve. En pausa el reloj de la ronda no baja —es el número de paso— y por
   * tanto tampoco suena: sale solo, sin una condición más.
   *
   * Y sólo en la ronda: en la fase de compra la cuenta también baja, pero ahí
   * no se acaba nada, se empieza.
   */
  const avisando = r.fase === 'ronda' && seg > 0 && seg <= ROUNDS.avisoFinalSegundos
  $('ronda').classList.toggle('poco', avisando)
  if (avisando && seg !== segPitado) playRoundTick(seg === 1)
  segPitado = avisando ? seg : -1
}

/**
 * **Lo que sólo cambia al cambiar de fase.** Incluye el cartel de fin de
 * partida, que es lo último que pinta esta página: con la partida acabada no hay
 * nada debajo que mirar.
 */
function pintarFaseDeRonda(r) {
  $('rondaN').textContent = r.prorroga ? `PRÓRROGA · RONDA ${r.n}` : `RONDA ${r.n} de ${ROUNDS.maxRondas}`
  const mio = cliente.bando ?? cliente.equipo ?? 0
  $('rondaMarcador').textContent = `${r.marcador[mio]} – ${r.marcador[1 - mio]}`
  $('ronda').classList.toggle('compra', r.fase === 'compra')
  const anterior = r.ultima
  const dice = {
    compra: anterior
      ? anterior.motivo === 'empate'
        ? 'RONDA EMPATADA · SE REPITE'
        : anterior.ganador === (cliente.bando ?? cliente.equipo) ? 'RONDA GANADA · COMPRA' : 'RONDA PERDIDA · COMPRA'
      : 'FASE DE COMPRA',
    ronda: ' ',
    espera: cliente.porEquipo > 1 ? 'ESPERANDO A LOS EQUIPOS' : 'ESPERANDO AL RIVAL',
    fin: ' ',
  }
  // **Y en la sin límite, cómo se termina** (vuelta 102): con la tecla de la
  // tienda, que es donde está el «Listo». La tecla sale del bind (vuelta 97).
  const comoSeAcaba = r.fase === 'compra' && r.sinLimite
    ? ` · ${keyLabel(keysOf('armoury', getKeybinds())[0])} → LISTO`
    : ''
  $('rondaFase').textContent = (dice[r.fase] ?? ' ') + comoSeAcaba
  // **Al acabar la compra, la tienda se cierra sola.** Dejarla abierta sería
  // dejar al jugador con el ratón suelto justo cuando empieza la ronda; y fuera
  // de la fase no hay nada que comprar. Se repinta en cada cambio de fase por lo
  // mismo que se repinta el cartel de pausa: el estado ha cambiado.
  if (r.fase !== 'compra') alternarTienda(false)
  pintarTienda()
  const acabo = r.ganador !== null
  if (!acabo) {
    ponerFin(null)
    return
  }
  const gane = r.ganador === mio
  const duelo = cliente.porEquipo <= 1
  const porque = {
    mayoria: 'por mayoría de rondas',
    prorroga: 'en la prórroga',
    abandono: gane ? (duelo ? 'el rival ha abandonado' : 'el otro equipo se ha quedado sin nadie') : 'tu equipo se ha quedado sin nadie',
  }
  ponerFin({
    titulo: duelo ? (gane ? 'PARTIDA GANADA' : 'PARTIDA PERDIDA') : (gane ? 'GANA TU EQUIPO' : 'GANA EL OTRO EQUIPO'),
    color: gane ? '#2FCB82' : '#E4462B',
    detalle: `${r.marcador[mio]} – ${r.marcador[1 - mio]} · ${porque[r.motivo] ?? ''}`,
  })
}

/**
 * **Vida, munición, arma y abatido los dibuja el HUD del juego** (vuelta 73).
 *
 * Aquí vivían cuatro funciones —`pintarVitales`, `pintarArmaEnVivo`,
 * `pintarArma` y `marcarDano`— que eran una copia recortada de lo que
 * `src/ui/Hud.jsx` lleva haciendo desde la vuelta 34, y «recortada» es la
 * palabra: **esta copia no tenía chaleco**. Se compraba en la ronda 1, el
 * servidor lo cobraba y lo aplicaba, y en pantalla no salía nada. Tampoco tenía
 * casco, ni marca de Vektor, ni los segundos de gracia.
 *
 * No hizo falta cambiar ni un campo del motor: `stats` ya traía todo eso desde
 * la vuelta 64 —`shieldSegments`, `helmet`, `charges`— y lo que faltaba era
 * quién lo dibujase. Es la convención de la vuelta 63 hasta el final: lo que ya
 * funciona en un modo no se reescribe, se llama.
 */

let ultimoInforme = 0
/** Si había rival la última vez que se miró, para repintar sólo al cambiar. */
let huboRival = false
function pintarPanel() {
  const ahora = performance.now()
  if (ahora - ultimoInforme < 200) return
  const ventana = (ahora - ultimoInforme) / 1000
  ultimoInforme = ahora
  const m = cliente.medidas
  // **«Hay rival» lo dice el servidor, no la pose.** Durante la fase de compra
  // la foto sale por destinatario y no trae al otro (vuelta 62), así que mirar
  // `poseDelRival()` decía «esperando» los quince segundos enteros con el rival
  // dentro — y con él, dejaba abiertas unas opciones que ya no lo estaban.
  const dentro = cliente.ocupadas >= 2
  if (dentro !== huboRival) {
    huboRival = dentro
    pintarBotonesDelMenu()
  }
  // El caudal se mide sobre la ventana, así que hay que vaciarlo aunque el panel
  // esté cerrado: si no, al abrirlo la primera lectura sería la suma de todo lo
  // que ha pasado desde que se cerró.
  const subida = m.bytesSalida / ventana / 1024
  const bajada = m.bytesEntrada / ventana / 1024
  m.bytesSalida = 0
  m.bytesEntrada = 0
  if (panel.hidden) return
  $('caudal').textContent = `${subida.toFixed(2)} / ${bajada.toFixed(2)} KB/s`
  $('pasos').textContent = `${cliente.paso} · ${m.pasoServidor} · ${m.ack}`
  $('rtt').textContent = `${m.rtt.toFixed(1)} ms (reloj ${cliente._rttReloj.toFixed(0)})`
  // **Con cuánto pasado se dibuja al rival** (vuelta 103): sube solo cuando la
  // red llega a tirones. Si esto pasa de 100 ms, el wifi está dando saltos.
  $('colchon').textContent = m.colchonMs ? `${m.colchonMs.toFixed(0)} ms` : '—'
  $('pendientes').textContent = `${m.pendientes}`
  const err = m.errorUltimo
  $('error').innerHTML = `<span class="${err > NET.visibleCorrection ? 'mal' : 'bien'}">${err.toExponential(2)} u</span>`
  $('errorMax').textContent = `${m.errorMax.toExponential(2)} u`
  $('correcciones').textContent = `${m.correcciones} de ${m.fotos} fotos`
  // La pérdida la cuenta el transporte, que es de quien es el cable.
  $('perdidos').textContent = `↑${enlace.tirados ?? 0} ↓${enlace.tiradosEntrada ?? 0} de ${m.enviados}`
  $('hambre').textContent = `${m.hambre}`
  $('reanclajes').textContent = `${m.reanclajes}`
  $('silencio').textContent = redCaida ? 'desconectado' : `${m.sinFotosMs.toFixed(0)} ms`
  $('vida').innerHTML = cliente.vida > 0
    ? `<span class="${cliente.vida < 45 ? 'mal' : 'bien'}">${cliente.vida}</span>`
    : '<span class="mal">ABATIDO</span>'
  if (m.disparos > 0) {
    const pct = (100 * m.acuerdos / m.disparos).toFixed(0)
    $('disparos').innerHTML =
      `${m.disparos} · <span class="${m.acuerdos === m.disparos ? 'bien' : 'mal'}">${pct}%</span>` +
      (m.fantasmas || m.sorpresas ? ` (${m.fantasmas}✗ ${m.sorpresas}✚)` : '')
    $('sinreb').textContent = `${(100 * m.acuerdosSinRebobinar / m.disparos).toFixed(0)}% de acuerdo`
    if (m.ultimoDisparo) $('ultimo').textContent =
      `${m.ultimoDisparo.yo} / ${m.ultimoDisparo.servidor}` + (m.ultimoDisparo.dano ? ` (−${m.ultimoDisparo.dano})` : '')
    $('rebobinado').textContent = `${m.rebobinadoMs.toFixed(0)} ms · ${m.retrocesoMax.toFixed(2)} u`
  }
  if (costes.length > 30) {
    const orden = [...costes].sort((a, b) => a - b)
    $('coste').textContent =
      `p50 ${orden[Math.floor(orden.length * 0.5)].toFixed(3)} · p99 ${orden[Math.floor(orden.length * 0.99)].toFixed(3)} ms`
  }
}


// ---------------------------------------------------------------- la armería
/**
 * **La tienda, dentro de la partida** (vuelta 64).
 *
 * Se abre con la tecla de armería —del motor, reasignable en las opciones del
 * juego— y **no pausa**: una pausa es parar el mundo de los dos y sólo la decide
 * el servidor (vuelta 53). Lo que sí hace es soltar el ratón, porque comprar con
 * el ratón pide poder pinchar; es un `.control`, así que un clic aquí dentro no
 * cuenta como el clic que captura (vuelta 48).
 *
 * **Dos formas de comprar, y las dos son la misma llamada**: pinchar el artículo
 * o teclear su combinación (categoría + código). La combinación va escrita en la
 * esquina de cada uno, que es lo que enseña a comprar sin ratón — y lo que hace
 * que quien juegue en serio no tenga que soltarlo.
 *
 * Y **aquí no se decide nada**: se dibuja lo que dice el servidor y se pide. El
 * saldo, el techo de la ronda 1 y lo que ya se lleva vienen en `MSG.ECONOMIA`.
 */
const tienda = $('tienda')
/** Los botones del catálogo, por clave. Se montan una vez. */
const articulos = new Map()
/** Lo que se lleva tecleado de una combinación: '' o la categoría. */
let tecleado = ''

function montarTienda() {
  const porCategoria = new Map()
  for (const item of catalogoDeTienda()) {
    if (!porCategoria.has(item.categoria)) porCategoria.set(item.categoria, [])
    porCategoria.get(item.categoria).push(item)
  }
  const grid = $('tiendaGrid')
  grid.innerHTML = ''
  for (const [categoria, items] of [...porCategoria].sort((a, b) => a[0] - b[0])) {
    const caja = document.createElement('div')
    caja.className = 'cat'
    const titulo = document.createElement('h2')
    titulo.textContent = `${categoria} · ${ECONOMY.categorias[categoria] ?? '—'}`
    caja.appendChild(titulo)
    for (const item of items.sort((a, b) => a.codigo - b.codigo)) {
      const boton = document.createElement('button')
      boton.className = 'art'
      boton.type = 'button'
      boton.innerHTML =
        `<span>${item.nombre}<span class="nota">&nbsp;</span></span>` +
        `<span class="der"><span class="precio">${item.deSerie ? 'de serie' : `$${item.precio}`}</span>` +
        `<span class="codigo">${item.categoria} ${item.codigo}</span></span>` +
        // **El precinto de lo que no existe** (vuelta 65). Va en el montaje y no
        // en el repintado porque no depende de nada: una granada no existe hoy y
        // no existirá a mitad de partida. Lo que sí se repinta es lo demás.
        (item.disponible ? '' : '<span class="sello">Próximamente</span>')
      if (!item.disponible) boton.classList.add('proximamente')
      boton.addEventListener('click', () => comprar(item))
      caja.appendChild(boton)
      articulos.set(item.clave, { item, boton, nota: boton.querySelector('.nota') })
    }
    grid.appendChild(caja)
  }
}

/** Pedir la compra. Quien dice si cabe es el servidor; esto sólo pide. */
function comprar(item) {
  if (!item.disponible) return
  cliente.comprar(item.clave, null)
}

/**
 * **Por qué no se puede comprar algo**, o null si se puede. El orden es el de la
 * frustración: primero lo que no existe, luego lo que la ronda no deja, luego lo
 * que ya llevas y por último el dinero — que es lo único que se arregla solo.
 */
function porQueNo(item, eco, fase) {
  // Lo que no existe no da razón escrita: lo dice su precinto, que se ve de un
  // vistazo y no compite con «sin saldo» por el mismo hueco de diez píxeles.
  if (!item.disponible) return ''
  if (item.deSerie) return 'siempre contigo'
  // **Lo que el mapa no admite** (vuelta 106), con la misma función que el servidor.
  if (!armaPermitida(motor.scenario.reglas, item.clave)) return 'no en este mapa'
  // **Cuándo está abierta la tienda lo dice `compraAbierta`**, la misma función
  // que el servidor mira para aceptar la compra (vuelta 65). Sin fase de compra
  // configurada no hay ventana entre rondas donde meterla, así que la ventana es
  // la ronda entera — y hasta la 65 eso era no poder comprar en toda la partida.
  if (!compraAbierta(fase, eco.compra)) return 'fuera de la compra'
  if (eco.techo && !eco.techo.includes(item.tipo)) return 'ronda 1: sin armas'
  if (item.clave === 'chaleco' && eco.inv.escudo >= ECONOMY.escudoPorChaleco) return 'puesto'
  if (item.clave === 'casco' && eco.inv.casco) return 'puesto'
  if (item.clave === eco.inv.primaria) return 'equipada'
  if (item.clave === eco.inv.secundaria) return 'equipada'
  if (item.clave === eco.inv.especial) return 'equipada'
  /**
   * **Y el tope de granadas lo dice el panel antes de cobrar** (vuelta 88).
   * Mira el mismo inventario que el servidor, así que no hay una segunda idea
   * de si cabe otra — la regla sigue siendo suya (`ECONOMY.granadasMax`), esto
   * sólo la enseña. Comprar una que ya llevas **sí** vale: rellena.
   */
  if (item.ranura === 'throwable') {
    const llevo = eco.inv.granadas ?? []
    if (!llevo.includes(item.clave) && llevo.length >= ECONOMY.granadasMax) {
      return `sólo ${ECONOMY.granadasMax} clases`
    }
  }
  if (eco.dinero < item.precio) return 'sin saldo'
  return null
}

/**
 * **El «Listo» de la compra sin límite** (vuelta 102), en la tienda: es donde
 * se está al comprar, así que es donde se dice que ya se ha terminado. Sólo se
 * enseña en esa fase; dice cuántos faltan y si el tuyo ya cuenta. Marcarlo
 * cierra la tienda y te devuelve a la partida —cerrar la tienda es volver
 * (vuelta 101)—; desmarcarlo no, porque quien se desmarca va a comprar algo más.
 */
function pintarListo() {
  const boton = $('tiendaListo')
  const r = cliente.rondas
  const ver = r.fase === 'compra' && r.sinLimite
  boton.hidden = !ver
  if (!ver) return
  const listo = cliente.listoEnCompra
  boton.setAttribute('aria-pressed', String(listo))
  boton.classList.toggle('button--primary', !listo)
  boton.textContent = listo
    ? `Listo ✓ · faltan ${r.faltan} · pulsa para desmarcar`
    : `Listo · empezar la ronda (${r.listos.length}/${r.listos.length + r.faltan})`
}
$('tiendaListo').addEventListener('click', () => marcarListo())
function marcarListo() {
  const listo = !cliente.listoEnCompra
  cliente.listoParaRonda(listo)
  if (!listo) return
  volviendo()
  vuelta.cancelar()
  motor.requestLock()
}

/** Repinta la tienda con lo que dice el servidor. */
function pintarTienda() {
  const eco = cliente.economia
  const fase = cliente.rondas.fase
  if (tienda.hidden) return
  $('tiendaDinero').textContent = `$${eco.dinero}`
  pintarListo()
  $('tiendaFase').textContent = !compraAbierta(fase, eco.compra)
    ? 'sólo se compra entre rondas'
    : fase === 'compra'
      ? `fase de compra · ronda ${cliente.rondas.n}`
      : `tienda abierta · ronda ${cliente.rondas.n}`
  for (const { item, boton, nota } of articulos.values()) {
    const razon = porQueNo(item, eco, fase)
    boton.disabled = razon !== null
    // **Lo que se puede comprar ahora mismo se marca**, que es lo que separa un
    // artículo de verdad de uno precintado sin tener que leer la nota.
    boton.classList.toggle('puedo', razon === null)
    const puesto =
      item.clave === eco.inv.primaria ||
      item.clave === eco.inv.especial ||
      (eco.inv.granadas ?? []).includes(item.clave) ||
      (item.clave === 'chaleco' && eco.inv.escudo > 0) ||
      (item.clave === 'casco' && eco.inv.casco)
    boton.classList.toggle('puesto', !!puesto)
    /**
     * **«Equipado» lo dice la palabra, no sólo un borde** (vuelta 73). Lo que
     * llevas puesto se marcaba con un filo verde, y de un vistazo eso no se
     * distingue de «esto lo puedes comprar», que también es un borde. La nota
     * ya existía para decir por qué **no** se puede comprar algo, y «porque ya
     * lo tienes» es esa misma frase — así que gana a la razón, que para un
     * artículo puesto decía «puesto», la palabra que nadie busca.
     */
    nota.textContent = puesto ? 'Equipado' : (razon ?? '') || ' '
  }
}

// Las fichas se abren desde la tienda: es la misma pregunta —qué llevo y qué
// hace— y el menú de ESC no puede crecer una fila más (vuelta 62).
$('fichas').addEventListener('click', () => {
  alternarTienda(false)
  capa.panel('ficha')
})

function alternarTienda(abrir = tienda.hidden) {
  tienda.hidden = !abrir
  tecleado = ''
  $('tiendaTecleado').textContent = ' '
  /**
   * **Con la tienda abierta, el menú se quita de en medio.** Las dos cosas salen
   * al soltar el ratón —el menú porque es lo que se enseña sin captura, la
   * tienda porque se ha pedido— y el menú ocupa la pantalla entera: se pintaban
   * una encima de otra, y su cuadro del centro (`#sala`, que es un `.control`)
   * se comía los clics de la tienda **y el clic con el que se vuelve a jugar**.
   * Al cerrar vuelve el menú, salvo que el ratón ya esté capturado.
   */
  aviso.hidden = vista !== 'juego' || abrir || document.pointerLockElement === lienzo
  if (abrir) pintarTienda()
}

/**
 * **La combinación numérica**: categoría y código, dos teclas. Se escucha aquí y
 * no en el motor porque es de la tienda — y con el ratón suelto el motor ya no
 * mira las teclas de arma, así que un `1` no saca la pistola por detrás.
 */
document.addEventListener('keydown', (evento) => {
  if (tienda.hidden) return
  // **Intro es «Listo»** en la compra sin límite (vuelta 102): la tienda es un
  // panel de teclado —se compra tecleando— y el botón se alcanza sin el ratón.
  if (evento.key === 'Enter' && cliente.rondas.sinLimite && cliente.rondas.fase === 'compra') {
    evento.preventDefault()
    marcarListo()
    return
  }
  if (evento.key === 'Escape') {
    // **Cerrarla con ESC es volver a la partida** (vuelta 101): el menú del
    // código no asoma por detrás. El manejador de ESC de la ventana recibe esta
    // misma pulsación después, así que se para aquí: pedir la captura dos veces
    // en el mismo instante es una petición de sobra al navegador.
    evento.stopPropagation()
    alternarTienda(false)
    if (vuelta.pedir(performance.now(), true)) volviendo()
    // La vuelta 91 hacía lo contrario —cerrar reiniciaba la espera para que se
    // viera el menú— y jugando se leyó como lo que era: la tienda llevaba a la
    // pantalla del código de la sala en mitad de una ronda.
    return
  }
  if (!/^[0-9]$/.test(evento.key)) return
  evento.preventDefault()
  tecleado += evento.key
  if (tecleado.length < 2) {
    $('tiendaTecleado').textContent = `${tecleado} _`
    return
  }
  const categoria = Number(tecleado[0])
  const codigo = Number(tecleado[1])
  // La misma tabla que la armería (vuelta 98): una combinación no puede comprar
  // aquí algo distinto de lo que equipa allí.
  const item = articuloDeCombinacion(categoria, codigo)
  $('tiendaTecleado').textContent = item
    ? `${categoria} ${codigo} · ${item.nombre}`
    : `${categoria} ${codigo} · no hay nada ahí`
  tecleado = ''
  if (item) comprar(item)
})

montarTienda()
/**
 * **Se encadena con lo que el motor ya hubiera puesto**, no se sustituye. El
 * motor escucha este mismo aviso para ponerte en la mano lo que has comprado
 * (`_aplicarInventario`), y asignar aquí encima se lo lleva por delante: el
 * síntoma fue comprar la Rift, verla cobrada en el panel y que la tecla 1
 * siguiera sacando la pistola. Es la misma forma que ya tenía `onBienvenida`, y
 * por el mismo motivo — dos dueños para un callback.
 */
/**
 * **Lo que suena es lo que te han dado, no lo que has pedido** (vuelta 73).
 *
 * El sonido de equipar se dispara comparando el inventario con el de antes, y
 * eso hace dos cosas de una: suena **al ponértelo** —que es lo que pedía el
 * encargo— y no suena si no llegaba el saldo, porque entonces el servidor no
 * cambia nada. No hace falta preguntar por el dinero: la ausencia de cambio
 * **es** la respuesta.
 *
 * Y sólo se mira lo que se puede comprar. El supresor también cambia esta clave
 * y no es una compra (vuelta 64): tiene su propio clic y su propio sonido en el
 * arma, y hacerle sonar el cerrojo aquí sería contarlo dos veces.
 */
let invAnterior = null
function sonarLoComprado(inv) {
  const antes = invAnterior
  const granadas = [...(inv.granadas ?? [])]
  invAnterior = { primaria: inv.primaria, secundaria: inv.secundaria, escudo: inv.escudo, casco: inv.casco, granadas }
  if (!antes) return
  if (inv.primaria && inv.primaria !== antes.primaria) playEquip('arma')
  // **Y una pistola comprada suena a arma** (vuelta 90), que es lo que es: el
  // cerrojo de `playEquip`. Va detrás de la principal porque las dos no pueden
  // llegar en el mismo mensaje — una compra es un artículo.
  else if (inv.secundaria && inv.secundaria !== antes.secundaria) playEquip('arma')
  else if (inv.escudo > antes.escudo) playEquip('chaleco')
  else if (inv.casco && !antes.casco) playEquip('casco')
  // **Y una granada nueva suena a utilidad** (vuelta 88), que es la cuarta voz
  // de `playEquip` y llevaba desde la 73 sin nadie que la sacara: la ranura
  // guardaba una sola clase, así que «llevo una más» no era un estado que
  // existiera. Se mira **la lista**, no el saldo — la ausencia de cambio sigue
  // siendo la respuesta a si se pudo pagar.
  else if (granadas.some((g) => !antes.granadas.includes(g))) playEquip('utilidad')
}

const ecoDelMotor = cliente.onEconomia
cliente.onEconomia = (eco) => {
  ecoDelMotor?.(eco)
  sonarLoComprado(eco.inv)
  pintarTienda()
  /**
   * **Y el dinero al HUD** (vuelta 88), que hasta aquí sólo se veía abriendo la
   * tienda — o sea justo cuando ya es tarde para pensarlo.
   *
   * `conEconomia` y no «¿llega este mensaje?»: en un mapa que reparte (vuelta
   * 72) el inventario también viaja por aquí, y ahí un `$0` en pantalla diría
   * que estás arruinado en vez de que no hay tienda. Es la regla de la 64 —que
   * hay economía lo dice la bienvenida, no el silencio— aplicada a un rótulo.
   */
  capa.dinero(cliente.conEconomia ? eco.dinero : null)
}

// Para las sondas de medida: todo lo que hace falta, en un solo sitio.
/**
 * **El asa de depuración de la página.** Esto no es una pantalla del juego: es
 * el banco, y los bancos de medida entran por aquí.
 *
 * `verDesde`, `cuerpoDe` y `resolver` son `hasLineOfSight`, `cuerpoDeJugador` y
 * `resolverDisparo` tal cual, y están por una razón concreta: los
 * bancos eligen los puestos desde los datos del escenario, y para eso
 * preguntaban por el módulo con un `import()` a `/src/game/sight.js` — que
 * existe con Vite en desarrollo y **no** existe en lo que se despliega, donde
 * todo está empaquetado. Sin esto, el mismo banco no se puede pasar contra los
 * dos huéspedes, que es justo lo que hay que poder hacer.
 */
window.vektorNet = {
  cliente, motor, enlace, fantasma, costes,
  /** El último estado de la sala y qué se está viendo (vuelta 101). */
  get sala() { return estadoDeSala },
  get vista() { return vista },
  mandarALaSala,
  // Los bancos llevan desde la vuelta 45 hablando de `camara`, `movimiento` y
  // `escenario`: siguen siendo los mismos objetos, sólo que ahora los construye
  // el motor. Renombrarlos habría sido reescribir nueve suites para no ganar nada.
  get camara() { return motor.camera },
  get movimiento() { return motor.movement },
  get escenario() { return motor.scenario },
  get rival() { return motor._rivalAvatar },
  get paso() { return cliente.paso },
  /**
   * **El nodo máster**, para que un banco pueda medir amplitud en vez de contar
   * llamadas a funciones. Es la regla de la vuelta 31: lo que se mide de un
   * sonido es que **se oiga**, y eso sólo se ve en la salida.
   */
  get audio() { return masterGain() },
  verDesde: hasLineOfSight,
  cuerpoDe: cuerpoDeJugador,
  resolver: resolverDisparo,
  NET,
}

// **Se empieza en el lobby**, y al final del módulo: la vista toca la tienda y
// el menú, que se definen más arriba.
ponerVista('lobby')
