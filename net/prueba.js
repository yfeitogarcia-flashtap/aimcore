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
 * El bucle es el del motor: **paso fijo de 60 Hz con arrastre del resto**, y la
 * cámara se dibuja interpolada entre los dos últimos pasos. No se reutiliza
 * `engine.js` a propósito: ahí dentro están el HUD, el audio, las dianas y las
 * fases, y nada de eso hace falta para responder a la pregunta de esta vuelta.
 */
import * as THREE from 'three'
import { CAMERA, NET, RENDER, SIM_STEP_MS, TEAMS } from '../src/config.js'
import { createScene } from '../src/game/scene.js'
import { Scenario } from '../src/game/scenario.js'
import { MovementController } from '../src/game/movement.js'
import { Avatar } from '../src/game/avatar.js'
import { LookControls } from '../src/game/lookControls.js'
import { hasLineOfSight } from '../src/game/sight.js'
import { cuerpoDeJugador } from './pose.js'
import { resolverDisparo } from './disparo.js'
import { ClienteRed } from './cliente.js'
import { conRedSimulada, transporteWebSocket } from './transporte.js'
import { normalizarCodigo } from './codigo.js'
import { codigoDeLaDireccion, direccionDeLaBarra, enlaceDeSala, urlDeSala } from './sala-cliente.js'

const lienzo = document.getElementById('lienzo')
const aviso = document.getElementById('aviso')
const $ = (id) => document.getElementById(id)

const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: RENDER.antialias })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio))
const { scene, setRoom } = createScene()
const camara = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
camara.rotation.order = 'YXZ'

const escenario = new Scenario(scene, 'largoYPuerta')
setRoom(escenario.room)

const movimiento = new MovementController(camara)
movimiento.setScenario(escenario)
movimiento.reset()
movimiento.setEnabled(true)

const controles = new LookControls(camara)
const equipos = Object.keys(TEAMS)

/** El rival, con el cuerpo de siempre y el color del otro equipo. */
const rival = new Avatar(0.45, TEAMS[equipos[1]].color)
rival.group.visible = false
scene.add(rival.group)

/**
 * **El fantasma: dónde dice el servidor que estás tú.** Es lo que hace visible
 * la reconciliación — sin pérdida de paquetes va clavado dentro de tu cabeza y
 * no se ve; con pérdida se despega, y eso es exactamente la corrección.
 */
const fantasma = new Avatar(0.45, TEAMS[equipos[0]].color)
for (const zona of Object.keys(fantasma.zones)) {
  for (const malla of fantasma.zones[zona]) {
    malla.material.transparent = true
    malla.material.opacity = 0.3
    malla.material.depthWrite = false
  }
}
scene.add(fantasma.group)

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

const cliente = new ClienteRed({
  camara,
  movimiento,
  oclusores: escenario.occluders,
  transporte: conRedSimulada(transporteWebSocket(urlDeSala(codigo)), enlace),
})
cliente.onBienvenida = (m) => {
  $('quien').textContent = `${m.id} · ${m.escenario}`
  document.title = `Vektor · ${codigo} · ${m.id}`
}
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

lienzo.addEventListener('click', () => {
  if (document.pointerLockElement !== lienzo) lienzo.requestPointerLock()
})
/**
 * **El disparo sale del evento**, con su instante real y con el rumbo que tenía
 * la mira en ese momento — no el del paso, que se muestreó al empezarlo y el
 * ratón se mueve entre medias.
 */
addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== lienzo || e.button !== 0) return
  const ts = Number.isFinite(e.timeStamp) && e.timeStamp > 0 ? e.timeStamp : performance.now()
  cliente.disparar(ts, camara.rotation.y, camara.rotation.x)
})
document.addEventListener('pointerlockchange', () => {
  const capturado = document.pointerLockElement === lienzo
  aviso.hidden = capturado
  controles.enabled = capturado
  if (capturado) controles.connect(document)
  else controles.disconnect()
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

// ------------------------------------------------------------------ bucle
let ultimoFrame = performance.now()
let acumulador = 0
let paso = 0
const previa = new THREE.Vector3()
const actual = new THREE.Vector3()
let posaLista = false
let epoca = movimiento.poseEpoch
const costes = []

function redimensionar() {
  const { clientWidth: w, clientHeight: h } = lienzo
  if (w === 0 || h === 0) return
  camara.aspect = w / h
  camara.updateProjectionMatrix()
  renderer.setSize(w, h, false)
}
addEventListener('resize', redimensionar)
redimensionar()

function bucle(ahora) {
  requestAnimationFrame(bucle)
  const delta = Math.min(ahora - ultimoFrame, 100)
  ultimoFrame = ahora

  const tolerancia = Math.min(1, SIM_STEP_MS * 0.1)
  acumulador += delta
  let pasos = 0
  while (acumulador >= SIM_STEP_MS - tolerancia) {
    acumulador -= SIM_STEP_MS
    pasos += 1
  }
  // **Y engancharse al reloj del servidor.** El acumulador solo no basta: un
  // frame largo se acota a 100 ms y los pasos que se pierden ahí no se
  // recuperan nunca, así que el cliente se iría quedando atrás y sus entradas
  // llegarían selladas con un paso cada vez más viejo. Con banda muerta de dos
  // pasos, para no oscilar.
  const objetivo = cliente.pasoObjetivo()
  if (objetivo > 0) {
    const desfase = objetivo - (paso + pasos)
    if (desfase > NET.clockDeadbandTicks) pasos += Math.min(NET.maxCatchUpTicks, desfase)
    else if (desfase < -NET.clockDeadbandTicks && pasos > 0) pasos -= 1
  }

  for (let i = 0; i < pasos; i++) {
    paso = cliente.paso + 1
    // Cuándo empezó **este** paso en tiempo real, para repartir la pulsación de
    // salto dentro de él.
    inicioDePaso = ahora - acumulador - (pasos - i) * SIM_STEP_MS
    previa.copy(camara.position)
    const t0 = performance.now()
    cliente.dar(paso, inicioDePaso)
    costes.push(performance.now() - t0)
    if (costes.length > 600) costes.shift()
    if (epoca !== movimiento.poseEpoch) { epoca = movimiento.poseEpoch; previa.copy(camara.position) }
    actual.copy(camara.position)
    posaLista = true
  }

  // El rival, en el pasado y entre dos fotos.
  const pose = cliente.poseDelRival()
  if (pose) {
    rival.group.visible = true
    rival.group.position.set(pose.x, pose.feetY, pose.z)
    rival.group.rotation.y = pose.yaw
    rival.setEyeHeight(pose.eyeHeight)
    $('retraso').textContent = `${pose.retraso.toFixed(1)} pasos · ${(pose.retraso * SIM_STEP_MS).toFixed(0)} ms atrás`
  } else {
    rival.group.visible = false
    $('retraso').textContent = 'esperando rival'
  }

  // El fantasma: la última palabra del servidor sobre ti.
  if (cliente.autoritativo && $('gho').checked) {
    fantasma.group.visible = true
    fantasma.group.position.set(cliente.autoritativo.x, cliente.autoritativo.feetY, cliente.autoritativo.z)
    fantasma.setEyeHeight(cliente.autoritativo.eyeHeight)
  } else {
    fantasma.group.visible = false
  }

  // Dibujado interpolado, igual que en el motor: la pose intermedia vive lo que
  // dura el `render()` y después se devuelve la autoritativa.
  let interpolando = false
  if (posaLista) {
    const alfa = Math.min(1, Math.max(0, acumulador / SIM_STEP_MS))
    camara.position.lerpVectors(previa, actual, alfa)
    interpolando = true
  }
  renderer.render(scene, camara)
  if (interpolando) camara.position.copy(actual)

  pintarPanel()
}

let ultimoInforme = 0
function pintarPanel() {
  const ahora = performance.now()
  if (ahora - ultimoInforme < 200) return
  const ventana = (ahora - ultimoInforme) / 1000
  ultimoInforme = ahora
  const m = cliente.medidas
  $('pasos').textContent = `${paso} · ${m.pasoServidor} · ${m.ack}`
  $('rtt').textContent = `${m.rtt.toFixed(1)} ms`
  $('pendientes').textContent = `${m.pendientes}`
  const err = m.errorUltimo
  $('error').innerHTML = `<span class="${err > NET.visibleCorrection ? 'mal' : 'bien'}">${err.toExponential(2)} u</span>`
  $('errorMax').textContent = `${m.errorMax.toExponential(2)} u`
  $('correcciones').textContent = `${m.correcciones} de ${m.fotos} fotos`
  // La pérdida la cuenta el transporte, que es de quien es el cable.
  $('perdidos').textContent = `↑${enlace.tirados ?? 0} ↓${enlace.tiradosEntrada ?? 0} de ${m.enviados}`
  $('hambre').textContent = `${m.hambre}`
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
  $('caudal').textContent =
    `${(m.bytesSalida / ventana / 1024).toFixed(2)} / ${(m.bytesEntrada / ventana / 1024).toFixed(2)} KB/s`
  m.bytesSalida = 0
  m.bytesEntrada = 0
  if (costes.length > 30) {
    const orden = [...costes].sort((a, b) => a - b)
    $('coste').textContent =
      `p50 ${orden[Math.floor(orden.length * 0.5)].toFixed(3)} · p99 ${orden[Math.floor(orden.length * 0.99)].toFixed(3)} ms`
  }
}

requestAnimationFrame(bucle)

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
  cliente, movimiento, camara, escenario, enlace, rival, costes,
  get paso() { return paso },
  verDesde: hasLineOfSight,
  cuerpoDe: cuerpoDeJugador,
  resolver: resolverDisparo,
  NET,
}
