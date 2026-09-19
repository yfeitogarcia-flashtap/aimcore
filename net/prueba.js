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
import { masterGain, playEquip, playRoundTick } from '../src/audio/sfx.js'
import { COLORS, CROSSHAIR, DUEL_SCENARIOS, ECONOMY, NET, ROUNDS, TARGET, TEAMS, WEAPONS, catalogoDeTienda } from '../src/config.js'
import { Engine } from '../src/game/engine.js'
import { Avatar } from '../src/game/avatar.js'
import { hasLineOfSight } from '../src/game/sight.js'
import { cuerpoDeJugador } from './pose.js'
import { resolverDisparo } from './disparo.js'
import { ClienteRed } from './cliente.js'
import { conRedSimulada, transporteWebSocket } from './transporte.js'
import { montarCapaDeDuelo } from '../src/ui/duelo.jsx'
import { normalizarCodigo } from './codigo.js'
import { compraAbierta } from './protocolo.js'
import { codigoDeLaDireccion, direccionDeLaBarra, enlaceDeSala, mapaDeLaDireccion, urlDeSala } from './sala-cliente.js'

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
const ESCENARIO = mapaDeLaDireccion()

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
  // Al cerrar un panel vuelve lo que había debajo: con el ratón suelto, el menú.
  alCerrarPanel: () => {
    aviso.hidden = document.pointerLockElement === lienzo || !tienda.hidden
  },
})

const motor = new Engine(lienzo, {
  onFrame: (stats) => pintarHud(stats),
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
  onArmoury: () => {
    if (cliente.conEconomia) alternarTienda()
    else capa.panel(capa.hayPanel() ? null : 'ficha')
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
}, { escenario: ESCENARIO })

/**
 * **El fantasma: dónde dice el servidor que estás tú.** Es lo que hace visible
 * la reconciliación — sin pérdida de paquetes va clavado dentro de tu cabeza y
 * no se ve; con pérdida se despega, y eso es exactamente la corrección.
 *
 * Lo pone la página y no el motor porque es un **instrumento de medida**, no
 * una pieza del juego: vive detrás de F3 con los demás y apagado de fábrica.
 */
const equipos = Object.keys(TEAMS)
const fantasma = new Avatar(TARGET.radius, TEAMS[equipos[0]].color)
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
$('codigo').textContent = codigo
$('enlace').value = enlaceDeSala(codigo, window.location, ESCENARIO)

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
function partidaGuardada() {
  try {
    const crudo = localStorage.getItem(CLAVE_PARTIDA)
    return crudo ? JSON.parse(crudo) : null
  } catch {
    return null
  }
}
function guardarPartida(dato) {
  try {
    if (dato) localStorage.setItem(CLAVE_PARTIDA, JSON.stringify(dato))
    else localStorage.removeItem(CLAVE_PARTIDA)
  } catch {
    /* sin persistencia se juega igual; lo que se pierde es poder reconectar */
  }
}

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

const cliente = new ClienteRed({
  camara: motor.camera,
  movimiento: motor.movement,
  controles: motor.controls,
  oclusores: motor.scenario.occluders,
  transporte: conRedSimulada(
    transporteWebSocket(urlDeSala(codigo, window.location, paseDeVuelta, compraElegida, ESCENARIO)),
    enlace,
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
  if (m.escenario && m.escenario !== ESCENARIO) {
    window.location.href = enlaceDeSala(codigo, window.location, m.escenario)
    return
  }
  const mio = equipos[m.equipo % equipos.length]
  const suyo = equipos[(m.equipo + 1) % equipos.length]
  fantasma.setColor(TEAMS[mio].color)
  // El cuerpo del rival lo tiñe el motor al montar la sesión: sale de la misma
  // ranura, y ahí es donde vive desde la vuelta 56.
  $('quien').innerHTML = `${m.id} · <span style="color:${TEAMS[mio].color}">${TEAMS[mio].label}</span>`
  $('quienDbg').textContent = `${m.id} · ${mio} · ${m.escenario}`
  document.title = `Vektor · ${codigo} · ${m.id}`
  // La butaca, para poder volver a ella si se cae el cable.
  if (m.pase) guardarPartida({ codigo, pase: m.pase, cuando: Date.now() })
  // Y con la bienvenida se sabe por fin si las opciones de la partida son tuyas.
  pintarConfigurable()
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
  $('hayRival').textContent = '—'
  // Se suelta el ratón: seguir capturado en una partida que ya no existe es
  // dejar al jugador encerrado en una pantalla que no responde.
  if (document.pointerLockElement === lienzo) document.exitPointerLock()
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

function pintarPausa() {
  const p = cliente.pausa
  // Las pausas que quedan se dicen **en el menú**, que es donde se gastan
  // (vuelta 73). Estaban además pegadas al bloque de vida, y ese bloque es
  // ahora el del juego: dos sitios para el mismo número es uno que se queda
  // viejo.
  $('libresMenu').textContent = p.libres
  // **El botón de votación sólo existe cuando es la única salida** (vuelta 55):
  // con libres que gastar, pedirle permiso al rival sería pedir por pedir.
  // Pausar, sólo con libres que gastar y sin nada en marcha; pedir votación,
  // sólo cuando ya no quedan. Nunca los dos a la vez: son la misma acción con
  // distinto precio, y dos botones juntos obligan a leerlos para saber cuál.
  $('pausar').hidden = p.libres <= 0 || p.pausada || cliente.votacion.activa
  $('pedirVoto').hidden = p.libres > 0 || p.pausada || cliente.votacion.activa
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
    if (!caidaAntes && document.pointerLockElement === lienzo) document.exitPointerLock()
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
      document.exitPointerLock()
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

cliente.conectar()

// Entrar en otra sala es **recargar en su dirección**, no reconectar por
// dentro: un mundo nuevo es un escenario, un movimiento y un historial nuevos, y
// rehacerlos a mano en caliente es la forma de dejarse la mitad.
$('entrar').addEventListener('click', () => {
  const otro = normalizarCodigo($('otro').value)
  if (!otro) {
    $('otro').style.borderColor = '#E4462B'
    return
  }
  // Y aquí también la dirección de la barra, no el enlace limpio: entrar en
  // otra sala no puede perder con qué servidor se estaba hablando.
  location.href = direccionDeLaBarra(otro)
  location.reload()
})
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
async function copiarEnlace() {
  const campo = $('enlace')
  const texto = campo.value
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

$('copiar').addEventListener('click', async () => {
  const boton = $('copiar')
  const bien = await copiarEnlace()
  if (!bien) $('enlace').select()
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
addEventListener('click', (e) => {
  if (document.pointerLockElement === lienzo) return
  if (e.target.closest('.control')) return
  // **Capturar es cosa del motor** desde la vuelta 56: además del `pointerLock`
  // arranca el contexto de audio —que no existe sin un gesto y éste es el único
  // que hay seguro—, pide las muestras de disparo y engancha el listener
  // espacial a la cámara. Es idempotente, y Chrome puede rechazar la captura
  // justo después de un Escape: no es un error del que haya que enterarse.
  motor.requestLock()
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
  aviso.hidden = capturado || !tienda.hidden || capa.hayPanel()
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
// **Lo que cambia de fase se pinta al cambiar, no por frame.**
cliente.onRonda = (r) => {
  pintarFaseDeRonda(r)
  // **La tienda se entera del cambio de fase por aquí**, no por la economía: un
  // cambio de fase abre o cierra la ventana y no manda un `MSG.ECONOMIA` (nada
  // ha cambiado de lo que tienes). Sin esto, el panel abierto se quedaba con el
  // rótulo y los botones de la fase anterior.
  if (!tienda.hidden) pintarTienda()
}

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
function salirAlMenu() {
  guardarPartida(null)
  cliente.abandonar()
  window.location.href = NET.rutaJuego
}
// Y la salida del cartel de fin: suelta la butaca —la partida ya está decidida,
// no hay nada que reservar— y deja a la vista el menú, que es donde se teclea
// otro código. Sin esto el cartel es una pantalla sin salida.
$('finSalir').addEventListener('click', () => {
  salirAlMenu()
})
// **Y cerrar la pestaña no manda nada, a propósito.** La primera versión mandaba
// el adiós en `pagehide`, y estaba mal por una razón que sólo se ve al probarlo:
// el navegador dispara ese evento **igual al recargar**, y recargar es justo
// como se vuelve a una partida. Con eso puesto, reconectar era abandonar.
// Cerrar la pestaña es una caída como cualquier otra: quedan noventa segundos
// para volver y, si no se vuelve, acaba en abandono igual. Es el lado seguro del
// error, que es la regla de esta vuelta entera.

// **Reconectar**: sólo si este navegador tiene una partida a medias que no es
// ésta. Si es ésta, ya se ha entrado con el pase y no hay nada que pulsar.
if (guardada && guardada.codigo !== codigo) {
  const boton = $('reconectar')
  boton.hidden = false
  boton.textContent = `Reconectar a ${guardada.codigo}`
  boton.addEventListener('click', () => {
    window.location.href = `/duelo/${guardada.codigo}${window.location.search}`
  })
}

motor.start()

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
  $('rondaMarcador').textContent = `${r.marcador[cliente.equipo ?? 0]} – ${r.marcador[1 - (cliente.equipo ?? 0)]}`
  $('ronda').classList.toggle('compra', r.fase === 'compra')
  const anterior = r.ultima
  const dice = {
    compra: anterior
      ? anterior.motivo === 'empate'
        ? 'RONDA EMPATADA · SE REPITE'
        : anterior.ganador === cliente.equipo ? 'RONDA GANADA · COMPRA' : 'RONDA PERDIDA · COMPRA'
      : 'FASE DE COMPRA',
    ronda: ' ',
    espera: 'ESPERANDO AL RIVAL',
    fin: ' ',
  }
  $('rondaFase').textContent = dice[r.fase] ?? ' '
  // **Al acabar la compra, la tienda se cierra sola.** Dejarla abierta sería
  // dejar al jugador con el ratón suelto justo cuando empieza la ronda; y fuera
  // de la fase no hay nada que comprar. Se repinta en cada cambio de fase por lo
  // mismo que se repinta el cartel de pausa: el estado ha cambiado.
  if (r.fase !== 'compra') alternarTienda(false)
  pintarTienda()
  const acabo = r.ganador !== null
  $('fin').classList.toggle('puesto', acabo)
  if (!acabo) return
  const gane = r.ganador === cliente.equipo
  $('finQuien').textContent = gane ? 'PARTIDA GANADA' : 'PARTIDA PERDIDA'
  $('finQuien').style.color = gane ? '#2FCB82' : '#E4462B'
  const porque = {
    mayoria: 'por mayoría de rondas',
    prorroga: 'en la prórroga',
    abandono: gane ? 'el rival ha abandonado' : 'has abandonado la partida',
  }
  $('finDetalle').textContent =
    `${r.marcador[cliente.equipo ?? 0]} – ${r.marcador[1 - (cliente.equipo ?? 0)]} · ${porque[r.motivo] ?? ''}`
  // Se acabó: ya no hay butaca a la que volver.
  guardarPartida(null)
  if (document.pointerLockElement === lienzo) document.exitPointerLock()
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
    // **Y con el rival dentro, las opciones de la partida se cierran** (vuelta
    // 67): cambiarlas empieza otra sala y le deja fuera. Se repinta al cambiar y
    // no cada vez, que es la regla del HUD.
    pintarConfigurable()
  }
  $('hayRival').textContent = dentro ? 'dentro' : 'esperando'
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
  $('rtt').textContent = `${m.rtt.toFixed(1)} ms`
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
        `<span class="precio">${item.deSerie ? 'de serie' : `$${item.precio}`}</span>` +
        `<span class="codigo">${item.categoria} ${item.codigo}</span>` +
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
  // **Cuándo está abierta la tienda lo dice `compraAbierta`**, la misma función
  // que el servidor mira para aceptar la compra (vuelta 65). Sin fase de compra
  // configurada no hay ventana entre rondas donde meterla, así que la ventana es
  // la ronda entera — y hasta la 65 eso era no poder comprar en toda la partida.
  if (!compraAbierta(fase, eco.compra)) return 'fuera de la compra'
  if (eco.techo && !eco.techo.includes(item.tipo)) return 'ronda 1: sin armas'
  if (item.clave === 'chaleco' && eco.inv.escudo >= ECONOMY.escudoPorChaleco) return 'puesto'
  if (item.clave === 'casco' && eco.inv.casco) return 'puesto'
  if (item.clave === eco.inv.primaria) return 'equipada'
  if (eco.dinero < item.precio) return 'sin saldo'
  return null
}

/** Repinta la tienda con lo que dice el servidor. */
function pintarTienda() {
  const eco = cliente.economia
  const fase = cliente.rondas.fase
  $('compraReal').textContent = eco.compra > 0 ? `${eco.compra} s` : 'sin fase'
  if (tienda.hidden) return
  $('tiendaDinero').textContent = `$${eco.dinero}`
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
  aviso.hidden = abrir || document.pointerLockElement === lienzo
  if (abrir) pintarTienda()
}

/**
 * **La combinación numérica**: categoría y código, dos teclas. Se escucha aquí y
 * no en el motor porque es de la tienda — y con el ratón suelto el motor ya no
 * mira las teclas de arma, así que un `1` no saca la pistola por detrás.
 */
document.addEventListener('keydown', (evento) => {
  if (tienda.hidden) return
  if (evento.key === 'Escape') {
    alternarTienda(false)
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
  const item = ECONOMY.catalogo.find((i) => i.categoria === categoria && i.codigo === codigo)
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
  invAnterior = { primaria: inv.primaria, escudo: inv.escudo, casco: inv.casco }
  if (!antes) return
  if (inv.primaria && inv.primaria !== antes.primaria) playEquip('arma')
  else if (inv.escudo > antes.escudo) playEquip('chaleco')
  else if (inv.casco && !antes.casco) playEquip('casco')
}

const ecoDelMotor = cliente.onEconomia
cliente.onEconomia = (eco) => {
  ecoDelMotor?.(eco)
  sonarLoComprado(eco.inv)
  pintarTienda()
}

/**
 * **El selector de mapa** (vuelta 72), al lado del de la fase de compra y con
 * exactamente las mismas reglas: es del anfitrión, sólo mientras no haya
 * entrado nadie, y cambiarlo **empieza otra partida** —una sala ya creada no se
 * reconfigura—. La lista sale de `DUEL_SCENARIOS`, derivada del propio dato:
 * añadir un mapa de duelo es marcarlo `soloDuelo`, no tocar este desplegable.
 */
const mapaSel = $('mapaSel')
for (const [clave, def] of Object.entries(DUEL_SCENARIOS)) {
  const opcion = document.createElement('option')
  opcion.value = clave
  opcion.textContent = def.label
  mapaSel.appendChild(opcion)
}
mapaSel.value = ESCENARIO
mapaSel.addEventListener('change', () => {
  if (!puedeConfigurar()) {
    pintarConfigurable()
    return
  }
  const destino = new URL(window.location.href)
  destino.searchParams.set('mapa', mapaSel.value)
  destino.hash = ''
  destino.pathname = destino.pathname.replace(/\/duelo\/[^/]+$/, '/duelo')
  window.location.href = destino.toString()
})

// **El selector de la fase de compra**, en la pantalla donde se crea la partida.
const selector = $('compraSel')
for (const segundos of ROUNDS.compraOpciones) {
  const opcion = document.createElement('option')
  opcion.value = String(segundos)
  opcion.textContent = segundos === 0 ? 'sin fase (rápida)' : `${segundos} s`
  selector.appendChild(opcion)
}
selector.value = String(compraElegida)
selector.addEventListener('change', () => {
  // **Y si esto no es tuyo, no hace nada** (vuelta 67). El `disabled` ya lo
  // impide en el navegador; la comprobación está aquí porque lo que hay detrás
  // —empezar otra partida— es irreversible, y una puerta que se cierra sola no
  // se deja apoyada en el CSS.
  if (!puedeConfigurar()) {
    pintarConfigurable()
    return
  }
  const segundos = Number(selector.value)
  try {
    localStorage.setItem(CLAVE_COMPRA, String(segundos))
  } catch {
    /* sin persistencia vale para esta partida y ya */
  }
  // **Partida nueva**: una sala ya creada no se reconfigura, así que cambiar
  // esto empieza otra, con su código y su enlace. Fingir lo contrario sería
  // enseñar un número que el servidor no está usando.
  const destino = new URL(window.location.href)
  destino.searchParams.set('compra', String(segundos))
  destino.hash = ''
  destino.pathname = destino.pathname.replace(/\/duelo\/[^/]+$/, '/duelo')
  window.location.href = destino.toString()
})

/**
 * **Las opciones de la partida son de quien la crea, y sólo hasta que llega
 * alguien** (vuelta 67).
 *
 * Jugando por primera vez entre dos PCs salió el fallo entero: el que se unió
 * por el enlace tocó el desplegable de la fase de compra y **se fue a una
 * partida nueva** —código nuevo, ranura 0, color azul— dejando a su rival solo
 * en la de antes. No es que el cambio fallara: es que ese control **no era
 * suyo**, y lo que hay detrás de él es empezar otra partida.
 *
 * Dos condiciones, y las dos son la misma idea por sus dos extremos:
 *
 * - **Anfitrión.** Lo dice el servidor en la bienvenida, no se deduce del color
 *   ni del id. Una sala se configura al nacer y sólo cuenta lo que diga quien la
 *   creó, así que enseñarle el control al otro es prometerle algo que el
 *   servidor va a ignorar.
 * - **Y sólo mientras no haya nadie dentro.** Cambiarlo abandona la sala, y con
 *   ella a quien ya haya entrado por tu enlace. Que el anfitrión pueda hacerlo
 *   es correcto; que pueda hacerlo **sin enterarse de que su amigo ya estaba**,
 *   no.
 */
function puedeConfigurar() {
  return cliente.anfitrion && cliente.ocupadas < 2
}

/**
 * **Un mapa que reparte no tiene fase de compra** (vuelta 72), así que su
 * selector se apaga y dice por qué. No es la misma puerta que la de arriba —eso
 * es de quién manda; esto es de qué mapa se juega— y por eso se pregunta al
 * dato del escenario y no al servidor: la respuesta no depende de la sala.
 */
function reparteElMapa(clave) {
  return Boolean(DUEL_SCENARIOS[clave]?.duelo?.dotacion)
}

function pintarConfigurable() {
  const puede = puedeConfigurar()
  const reparte = reparteElMapa(mapaSel.value)
  selector.disabled = !puede || reparte
  mapaSel.disabled = !puede
  selector.title = reparte
    ? 'este mapa reparte el equipo: no hay tienda ni fase de compra'
    : puede
      ? 'cambiarla empieza una partida nueva, con otro código'
      : cliente.anfitrion
        ? 'ya hay alguien dentro: cambiarla le dejaría fuera'
        : 'la elige quien crea la partida'
  // Corto a propósito: va en la fila del número, y el menú no puede crecer.
  $('compraQuien').textContent = reparte
    ? '· el mapa reparte'
    : puede
      ? '· cambiarla empieza otra'
      : cliente.anfitrion
        ? '· con rival, ya no'
        : '· la elige el anfitrión'
}
pintarConfigurable()

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
