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
import { COLORS, NET, TARGET, TEAMS, WEAPONS } from '../src/config.js'
import { Engine } from '../src/game/engine.js'
import { Avatar } from '../src/game/avatar.js'
import { updateSettings } from '../src/settings.js'
import { hasLineOfSight } from '../src/game/sight.js'
import { cuerpoDeJugador } from './pose.js'
import { resolverDisparo } from './disparo.js'
import { ClienteRed } from './cliente.js'
import { conRedSimulada, transporteWebSocket } from './transporte.js'
import { normalizarCodigo } from './codigo.js'
import { codigoDeLaDireccion, direccionDeLaBarra, enlaceDeSala, urlDeSala } from './sala-cliente.js'

const lienzo = document.getElementById('lienzo')
const aviso = document.getElementById('aviso')
const panel = document.getElementById('panel')
const avisoRed = document.getElementById('aviso-red')
const panelPausa = document.getElementById('pausa')
const panelVoto = document.getElementById('votacion')
const mira = document.getElementById('mira')
const $ = (id) => document.getElementById(id)

// El color de la mira sale de `config.js` y de ningún otro sitio, igual que en
// `src/ui/Crosshair.jsx`: se publica como variable CSS y la hoja de estilos la
// lee. Dos literales del mismo gris es cómo acaban siendo dos grises distintos.
document.documentElement.style.setProperty('--crosshair-color', COLORS.crosshair)

/**
 * **El escenario de la partida lo manda el servidor**, y hoy es uno solo. Se
 * fija en los ajustes **antes** de construir el motor porque de ahí lo lee él:
 * montar uno y cambiarlo después sería rehacer colisión, rutas y sala en
 * caliente. La bienvenida trae el del servidor y el panel de F3 lo enseña, que
 * es donde se vería una discrepancia el día que haya más de uno.
 */
updateSettings({ scenario: 'largoYPuerta' })

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
const motor = new Engine(lienzo, {
  onFrame: (stats) => pintarHud(stats),
  onWeapon: (w) => pintarArma(w),
  onDamage: (fraccion, rumbo) => marcarDano(fraccion, rumbo),
  onVerdict: (v) => marcarDisparo(v),
})

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
$('enlace').value = enlaceDeSala(codigo)

/**
 * **La página ensambla la red; el motor sólo la usa.** El cliente se construye
 * con la cámara, el movimiento y los oclusores **del motor** —son los mismos que
 * dibujan y contra los que se choca, no copias— y `usarRed` se lo entrega antes
 * de arrancar. La regla de la vuelta 45 sigue en pie: `engine.js` no sabe de
 * sockets ni de códigos de sala.
 */
const cliente = new ClienteRed({
  camara: motor.camera,
  movimiento: motor.movement,
  oclusores: motor.scenario.occluders,
  transporte: conRedSimulada(transporteWebSocket(urlDeSala(codigo)), enlace),
})
cliente.onBienvenida = (m) => {
  // **La ranura la manda el servidor**, y es la misma de la que sale su sitio de
  // salida: deducir el color del id (`p1`, `p2`) parece equivalente y no lo es,
  // porque el id es un contador que no para —dos jugadores pueden ser `p3` y
  // `p5` y quedarse otra vez del mismo color—.
  const mio = equipos[m.equipo % equipos.length]
  const suyo = equipos[(m.equipo + 1) % equipos.length]
  fantasma.setColor(TEAMS[mio].color)
  // El cuerpo del rival lo tiñe el motor al montar la sesión: sale de la misma
  // ranura, y ahí es donde vive desde la vuelta 56.
  $('quien').innerHTML = `${m.id} · <span style="color:${TEAMS[mio].color}">${TEAMS[mio].label}</span>`
  $('quienDbg').textContent = `${m.id} · ${mio} · ${m.escenario}`
  document.title = `Vektor · ${codigo} · ${m.id}`
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
  mira.classList.add('dado')
  mira.classList.toggle('mato', !!v.baja)
  clearTimeout(apagarMarca)
  apagarMarca = setTimeout(() => mira.classList.remove('dado', 'mato'),
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
function pintarPausa() {
  const p = cliente.pausa
  $('libres').textContent = `pausas ${p.libres} · rival ${p.rivalLibres}`
  $('libresMenu').textContent = p.libres
  // **El botón de votación sólo existe cuando es la única salida** (vuelta 55):
  // con libres que gastar, pedirle permiso al rival sería pedir por pedir.
  $('pedirVoto').hidden = p.libres > 0 || p.pausada || cliente.votacion.activa
  if (p.pausada) {
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
    if (p.mia && document.pointerLockElement === lienzo) document.exitPointerLock()
  } else {
    panelPausa.hidden = true
  }
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
$('copiar').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('enlace').value)
    $('copiar').textContent = 'copiado'
    setTimeout(() => { $('copiar').textContent = 'copiar' }, 1200)
  } catch {
    // El portapapeles necesita permiso y contexto seguro. Si no lo hay, el
    // enlace está escrito ahí al lado para seleccionarlo a mano.
    $('enlace').select()
  }
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
  // **Soltar el ratón pide pausa**, que es lo que hace Escape desde el punto de
  // vista del jugador. Hasta la vuelta 53 sólo se abría el menú y el mundo
  // seguía corriendo por detrás: con WASD se andaba con el menú puesto. No se
  // pide si ya hay pausa o petición, ni cuando el ratón se ha soltado porque la
  // partida se ha caído.
  // **Y sólo si quedan libres** (vuelta 55). Sin ninguna, Escape abre el menú de
  // siempre y ahí está el botón de pedir votación: abrirle al rival un cartel
  // por el gesto de soltar el ratón sería pedirle permiso sin querer.
  if (!capturado && !redCaida && !cliente.pausa.pausada && cliente.pausa.libres > 0) {
    cliente.pedirPausa()
  }
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
  aviso.hidden = capturado
  // Mira, vida y «abatido» son de jugar; con el ratón suelto tapan el menú.
  document.body.classList.toggle('jugando', capturado)
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
motor.start()

const costes = []
function pintarHud(stats) {
  const ahora = performance.now()
  pintarVitales(stats)
  pintarArmaEnVivo(stats)
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
  pintarRed(ahora)
  pintarPanel()
}

/**
 * **Vida, munición y abatido son de jugar, así que se pintan siempre**, esté el
 * panel de depuración abierto o no.
 *
 * Desde la vuelta 56 los números salen del motor (`onFrame`), que ya los tiene
 * todos: vida y cuenta de reaparición **las dice el servidor** —y la cuenta va
 * en el reloj de las entradas, el mismo con el que se decide, así que la
 * pantalla y la reaparición caen en el mismo instante— y cargador, recarga y
 * arma son del cliente.
 */
let vidaPintada = -1
let cuentaPintada = ''
function pintarVitales(stats) {
  // **Sólo se escribe en el DOM cuando el número ha cambiado.** Va por frame, y
  // escribir `textContent` sesenta veces por segundo con el mismo valor es
  // trabajo de maquetación por nada: la misma regla por la que el HUD del juego
  // se actualiza por refs y no repinta por frame.
  const vida = Math.max(0, Math.min(100, Math.round(stats.health)))
  if (vida !== vidaPintada) {
    vidaPintada = vida
    $('vitalN').textContent = vida
    $('vitalN').className = stats.lowHealth ? 'mal' : ''
    $('vitalB').firstElementChild.style.width = `${vida}%`
    $('abatido').classList.toggle('puesto', !stats.alive)
  }
  if (stats.alive) return
  const texto = `reapareces en ${(stats.respawnLeftMs / 1000).toFixed(1)}`
  if (texto !== cuentaPintada) {
    cuentaPintada = texto
    $('reaparece').textContent = texto
  }
}

/** El cargador, que cambia disparo a disparo. Mismo criterio: sólo si cambia. */
let municionPintada = ''
function pintarArmaEnVivo(stats) {
  const texto = stats.reloading
    ? `${'·'.repeat(1 + Math.floor(stats.reloadProgress * 6))}`
    : `${stats.ammo} / ${stats.magazine}`
  if (texto === municionPintada) return
  municionPintada = texto
  $('municion').textContent = texto
  $('municion').classList.toggle('mal', !stats.reloading && stats.ammo <= Math.max(1, stats.magazine * 0.25))
}

/**
 * Y el nombre del arma, que sólo cambia al cambiar de arma — una pulsación, no
 * un valor por frame, que es por lo que viaja por callback y no en `stats`.
 * Con silenciador se dice, porque cambia cómo suena y a quién se oye.
 */
function pintarArma({ weaponKey, suppressed }) {
  const arma = WEAPONS[weaponKey]
  $('arma').textContent = arma ? arma.label + (suppressed ? ' · SUPR' : '') : ''
}

/**
 * **De dónde te han disparado** (la cuña de la vuelta 40, aquí en su versión
 * mínima). El ángulo lo calcula el motor con el vector de la cámara y medido en
 * horizontal; esta página sólo lo pinta. El `conic-gradient` cuenta los grados
 * desde arriba y en el sentido del reloj, que es la misma convención, así que
 * no hay conversión que pueda salir espejada.
 */
let apagarDano = 0
function marcarDano(fraccion, rumbo) {
  const cuna = $('dano')
  cuna.style.setProperty('--angulo', `${(rumbo * 180) / Math.PI}deg`)
  cuna.style.opacity = String(Math.min(1, 0.35 + fraccion))
  cuna.classList.add('puesto')
  clearTimeout(apagarDano)
  apagarDano = setTimeout(() => cuna.classList.remove('puesto'), 500)
}

let ultimoInforme = 0
function pintarPanel() {
  const ahora = performance.now()
  if (ahora - ultimoInforme < 200) return
  const ventana = (ahora - ultimoInforme) / 1000
  ultimoInforme = ahora
  const m = cliente.medidas
  $('hayRival').textContent = cliente.poseDelRival() ? 'dentro' : 'esperando'
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
  verDesde: hasLineOfSight,
  cuerpoDe: cuerpoDeJugador,
  resolver: resolverDisparo,
  NET,
}
