/**
 * **El editor de mapas de Vektor** (vuelta 74, fase 1).
 *
 * Dibuja cajas sobre la rejilla vacía y las prueba **con el motor de verdad**:
 * «probar» construye un `Engine` contra la definición que se está editando, así
 * que el movimiento, la colisión y la física son los del juego y no una
 * simulación aparte. Es la misma idea que hizo barata la vuelta 56 —el duelo
 * hospeda el motor entero— aplicada a una herramienta.
 *
 * Tres cosas que son el diseño y conviene no deshacer:
 *
 * - **Lo que se ve editando es lo que se ve jugando.** La escena de edición
 *   monta un `Scenario` de verdad —mallas fundidas por tipo, aristas y grises
 *   de `COVER`— y encima, invisibles, una caja por pieza **sólo para poder
 *   pincharla**. Dibujar las piezas por nuestra cuenta habría sido un segundo
 *   aspecto del mismo mapa.
 * - **El editor no puede poder construir algo contra lo que el motor no sepa
 *   chocar.** Hoy eso son cajas alineadas a los ejes, y el giro es de 90°
 *   —intercambiar ancho y fondo—, que es lo único que una colisión AABB admite.
 *   Ver `docs/propuestas/05-editor-de-mapas.md` §3.
 * - **Y no toca los ajustes del jugador.** El mapa entra por
 *   `new Engine(lienzo, callbacks, { escenario })`, que es la puerta que abrió
 *   la vuelta 60 justo para esto.
 */

import * as THREE from 'three'
import { COVER, SCENARIOS, coverColor, coverHeight, scenarioRoom } from '../src/config.js'
import { Engine } from '../src/game/engine.js'
import { MovementController } from '../src/game/movement.js'
import { Scenario } from '../src/game/scenario.js'
import { createScene } from '../src/game/scene.js'
import { SALA, mapaComoModulo, mapaNuevo, sanearMapa } from '../src/maps/formato.js'
import { montarCapaDeDuelo } from '../src/ui/duelo.jsx'

const $ = (id) => document.getElementById(id)

// ---------------------------------------------------------------- estado

/** El mapa que se está editando. Es una definición de escenario, sin más. */
let mapa = mapaNuevo()
/** Índice de la pieza seleccionada, o −1. */
let seleccion = -1
/** Cuánto se mueve una pieza por paso. 0.5 de partida: la escala de los mapas de hoy. */
let paso = 0.5
/** Candados por dimensión: con uno echado, esa medida no la toca nada. */
const candados = { w: false, d: false, alto: false }
/** La capa de HUD del juego, montada una vez. */
let capa = null

/**
 * **Deshacer y rehacer, sobre definiciones enteras y no sobre operaciones.**
 *
 * Un mapa son unos pocos kilobytes, así que guardar el estado completo antes
 * de cada cambio es más barato que escribir la inversa de cada operación — y
 * **mucho menos frágil**: una operación invertida mal deja el mapa en un
 * estado que nunca existió, y eso no se nota hasta tres pasos después.
 *
 * `atras` guarda estados anteriores y `adelante` los que se han deshecho; un
 * cambio nuevo tira `adelante`, que es lo que hace cualquier editor y lo que
 * evita ramas de historia que nadie sabría leer.
 */
const pila = { atras: [], adelante: [] }
const DESHACER_MAX = 80

function anotarParaDeshacer() {
  pila.atras.push(JSON.stringify(mapa))
  if (pila.atras.length > DESHACER_MAX) pila.atras.shift()
  pila.adelante.length = 0
}

function mover(desde, hacia) {
  const estado = desde.pop()
  if (!estado) return
  hacia.push(JSON.stringify(mapa))
  const { mapa: recuperado } = sanearMapa(JSON.parse(estado))
  mapa = recuperado
  seleccion = Math.min(seleccion, mapa.boxes.length - 1)
  sucio = true
  pintarPanel()
  pintarContorno()
}
/** Hay que remontar el escenario en el frame siguiente. */
let sucio = true
/** El motor, sólo mientras se prueba. */
let motor = null
/** Lo que se propone como comentario del próximo guardado. */
let comentarioSugerido = ''
/** Guardado del borrador, aplazado: escribir por cada píxel arrastrado es tonto. */
let aplazado = 0

/**
 * **Dónde vive el borrador.** Es la mitad «no pierdas lo que estás haciendo»
 * del encargo, y es un fallo distinto del que cubre el historial: aquél deja
 * volver a una versión **guardada**, y esto salva lo que todavía no lo está.
 * Por eso son dos cosas y no una.
 *
 * `localStorage` es por origen, como en el resto del juego: cambiar de puerto
 * deja el borrador atrás, una vez.
 */
const BORRADOR = 'vektor.editor.borrador.v1'

/**
 * **El relevo de después de guardar.**
 *
 * Guardar escribe un fichero que `config.js` importa, así que Vite recarga la
 * página **siempre** — y con razón: `SCENARIOS` acaba de cambiar. Lo que no
 * puede pasar es que esa recarga se lleve por delante lo que tenías delante.
 *
 * Volver a leer el mapa de `SCENARIOS` no vale: la recarga llega antes de que
 * el servidor sirva el registro nuevo, así que a veces el mapa recién guardado
 * todavía no está ahí y te devolvía uno en blanco. Lo que cruza la recarga es
 * **el estado exacto**, por `sessionStorage`, que muere con la pestaña porque
 * es lo que tiene que hacer.
 */
const RELEVO = 'vektor.editor.relevo.v1'

/**
 * **Qué mapa está abierto va en la dirección** (`/editor/#clave`).
 *
 * No es un adorno: guardar un mapa **nuevo** reescribe el registro, y eso
 * reinicia el servidor y recarga la página. Sin esto, la recarga te devolvía un
 * mapa en blanco justo después de guardar — el mapa estaba en el disco y el
 * editor no lo enseñaba, que desde fuera se lee como haberlo perdido.
 *
 * Y de paso la dirección de un mapa se puede guardar en marcadores.
 */
function anotarEnLaBarra(clave) {
  const quiere = clave ? `#${clave}` : ''
  if (location.hash !== quiere) history.replaceState(null, '', `${location.pathname}${quiere}`)
}

// ---------------------------------------------------------------- escena

const lienzo = $('lienzo')
const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

const { scene, setRoom } = createScene()
const camara = new THREE.PerspectiveCamera(55, 1, 0.1, 1000)

/** Órbita: el mapa se mira desde fuera, así que la cámara vive en esféricas. */
const orbita = { radio: 60, yaw: 0, pitch: 0.95, centro: new THREE.Vector3(0, 0, 0) }

/**
 * **Volar con WASD mientras el ratón está sobre el mapa** (vuelta 76).
 *
 * La primera versión pedía además el botón apretado, y eso deja el vuelo
 * inalcanzable justo cuando se usa: se mira una esquina, se suelta, y para
 * acercarse hay que volver a agarrar. Lo que de verdad hacía falta era no
 * robarle las teclas a quien está escribiendo, y eso son dos condiciones
 * propias —el puntero sobre la vista y el foco fuera de un campo— y no el
 * botón, que las cumplía de rebote.
 *
 * Es `typingInField` (vuelta 56) en esta página: el editor sí tiene campos de
 * texto, así que la pregunta «¿esto es escribir o es jugar?» hay que
 * contestarla, no evitarla.
 *
 * Y lo que se mueve es **el centro de la órbita**: la cámara sigue mirando a
 * donde miraba, así que volar y orbitar son el mismo gesto encadenado y no dos
 * modos entre los que elegir.
 */
const teclasCamara = new Set()
const VUELO = { base: 22, corriendo: 3.2 }
let sobreLaVista = false

const escribiendo = () => Boolean(document.activeElement?.matches('input, textarea, select'))

window.addEventListener('keydown', (e) => { if (!motor && !escribiendo()) teclasCamara.add(e.code) })
window.addEventListener('keyup', (e) => teclasCamara.delete(e.code))
window.addEventListener('blur', () => teclasCamara.clear())

function volar(dt) {
  if (!(orbitando || sobreLaVista) || escribiendo() || teclasCamara.size === 0) return
  const adelante = Number(teclasCamara.has('KeyW')) - Number(teclasCamara.has('KeyS'))
  const lado = Number(teclasCamara.has('KeyD')) - Number(teclasCamara.has('KeyA'))
  const sube = Number(teclasCamara.has('KeyE')) - Number(teclasCamara.has('KeyQ'))
  if (!adelante && !lado && !sube) return

  const v = VUELO.base * dt * (teclasCamara.has('ShiftLeft') || teclasCamara.has('ShiftRight') ? VUELO.corriendo : 1)
  // Adelante es hacia donde mira la cámara, aplastado al suelo: volar mirando
  // hacia abajo no debe hundirte, que es lo que hace inmanejable un vuelo.
  const sin = Math.sin(orbita.yaw)
  const cos = Math.cos(orbita.yaw)
  orbita.centro.x -= (adelante * sin + lado * cos) * v
  orbita.centro.z -= (adelante * cos - lado * sin) * v
  orbita.centro.y = Math.max(orbita.centro.y + sube * v, 0)
}

function colocarCamara() {
  const { radio, yaw, pitch, centro } = orbita
  camara.position.set(
    centro.x + radio * Math.sin(pitch) * Math.sin(yaw),
    centro.y + radio * Math.cos(pitch),
    centro.z + radio * Math.sin(pitch) * Math.cos(yaw),
  )
  camara.lookAt(centro)
}

/** Escenario montado ahora mismo: lo que se ve es exactamente lo que se juega. */
let escenario = null
/** Cajas invisibles, una por pieza, **sólo para poder pinchar**. */
const proxies = new THREE.Group()
scene.add(proxies)
const materialProxy = new THREE.MeshBasicMaterial({ visible: false })

/** El contorno de la pieza elegida, en el verde de acción. */
const contorno = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
  new THREE.LineBasicMaterial({ color: 0x2fcb82 }),
)
contorno.visible = false
scene.add(contorno)

/**
 * **Los láseres de alineación**, uno por eje y cada uno con su interruptor.
 *
 * Salen del **centro** de la pieza elegida y cruzan la sala de lado a lado, que
 * es lo que deja ver de un vistazo con qué está alineada y con qué no. Rojos
 * porque es el único color de la paleta que no significa nada en el mundo del
 * editor —el naranja es de las dianas y el verde es la selección—, y finos
 * para no tapar la pieza que se está colocando.
 */
const EJES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }
const laseres = {}
for (const [eje, dir] of Object.entries(EJES)) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-dir[0], -dir[1], -dir[2]),
    new THREE.Vector3(dir[0], dir[1], dir[2]),
  ])
  const linea = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xe4462b }))
  linea.visible = false
  scene.add(linea)
  laseres[eje] = linea
}

function pintarLaseres() {
  const pieza = mapa.boxes[seleccion]
  for (const [eje, linea] of Object.entries(laseres)) {
    const encendido = $(`laser-${eje}`)?.checked && Boolean(pieza)
    linea.visible = encendido
    if (!encendido) continue
    const alto = coverHeight(pieza.kind)
    const base = pieza.base ? coverHeight(pieza.base) : 0
    // El láser pasa por el centro de la pieza: alineas centros, que es lo que
    // se mira al construir, y no esquinas, que dependen del tamaño.
    linea.position.set(pieza.x + pieza.w / 2, base + (alto - base) / 2, pieza.z + pieza.d / 2)
    // Largo de sobra para cruzar cualquier sala, que es lo que lo hace útil.
    const largo = Math.max(escenario?.room.width ?? 40, escenario?.room.depth ?? 40) * 2
    linea.scale.setScalar(largo)
  }
}

for (const eje of Object.keys(EJES)) {
  $(`laser-${eje}`).addEventListener('change', pintarLaseres)
}

/** Dónde aparece el jugador. Sin esto se coloca a ciegas. */
const marcaSpawn = new THREE.Mesh(
  new THREE.ConeGeometry(0.5, 1.8, 4),
  new THREE.MeshBasicMaterial({ color: 0x2f6bf0, wireframe: true }),
)
scene.add(marcaSpawn)

/**
 * Remonta el mundo desde `mapa`. Se llama una vez por frame como mucho, con
 * bandera: arrastrar una caja cambia la definición en cada movimiento del ratón
 * y fundir geometrías por evento sería trabajo tirado.
 */
function remontar() {
  escenario?.dispose()
  escenario = new Scenario(scene, mapa)
  setRoom(escenario.room)

  proxies.clear()
  for (const [indice, pieza] of mapa.boxes.entries()) {
    const alto = coverHeight(pieza.kind)
    const base = pieza.base ? coverHeight(pieza.base) : 0
    const malla = new THREE.Mesh(new THREE.BoxGeometry(pieza.w, alto - base, pieza.d), materialProxy)
    malla.position.set(pieza.x + pieza.w / 2, base + (alto - base) / 2, pieza.z + pieza.d / 2)
    malla.userData.indice = indice
    proxies.add(malla)
  }

  marcaSpawn.position.set(mapa.spawn.x, 0.9, mapa.spawn.z)
  pintarContorno()
  pintarLaseres()
  medirPresupuesto()
}

function pintarContorno() {
  pintarLaseres()
  const pieza = mapa.boxes[seleccion]
  contorno.visible = Boolean(pieza)
  if (!pieza) return
  const alto = coverHeight(pieza.kind)
  const base = pieza.base ? coverHeight(pieza.base) : 0
  contorno.scale.set(pieza.w, Math.max(alto - base, 0.01), pieza.d)
  contorno.position.set(pieza.x + pieza.w / 2, base + (alto - base) / 2, pieza.z + pieza.d / 2)
}

// ---------------------------------------------------------------- cámara y ratón

const rayo = new THREE.Raycaster()
const puntero = new THREE.Vector2()
const suelo = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const golpe = new THREE.Vector3()

let arrastrando = null
let orbitando = null

function aRejilla(v) {
  // Se redondea al paso y se limpia la coma flotante: 0.1 × 3 no es 0.3, y
  // una caja en 0.30000000000000004 ensucia el fichero y las comparaciones.
  return Number((Math.round(v / paso) * paso).toFixed(4))
}

/** Hasta dónde busca el imán una cara con la que alinearse. */
const IMAN = 0.6

/**
 * **El imán pega a la cara de al lado, no al centro.**
 *
 * Construir con cajas es poner una contra otra, así que lo que tiene que
 * coincidir son **caras**: el borde izquierdo de ésta con el derecho de
 * aquélla, o los dos bordes izquierdos si se están alineando en fila. Se
 * comparan las cuatro combinaciones por eje y gana la más cercana, siempre que
 * esté dentro de `IMAN`.
 *
 * Y se aplica **después** de la rejilla: la rejilla es la regla general y el
 * imán la excepción cuando hay algo con lo que alinearse. Al revés, la rejilla
 * desharía lo que el imán acaba de cuadrar.
 */
function alImán(pieza, indice) {
  if (!$('iman').checked) return
  for (const eje of ['x', 'z']) {
    const medida = eje === 'x' ? 'w' : 'd'
    const mio = [pieza[eje], pieza[eje] + pieza[medida]]
    let mejor = null
    for (const [otroIndice, otra] of mapa.boxes.entries()) {
      if (otroIndice === indice) continue
      // Sólo con las que se solapan en el otro eje: pegarse a la cara de una
      // caja que está en la otra punta del mapa no alinea nada.
      const otroEje = eje === 'x' ? 'z' : 'x'
      const otraMedida = eje === 'x' ? 'd' : 'w'
      if (pieza[otroEje] > otra[otroEje] + otra[otraMedida] + IMAN) continue
      if (otra[otroEje] > pieza[otroEje] + pieza[eje === 'x' ? 'd' : 'w'] + IMAN) continue

      for (const suyo of [otra[eje], otra[eje] + otra[medida]]) {
        for (const [cual, valor] of mio.entries()) {
          const d = Math.abs(valor - suyo)
          if (d > IMAN || (mejor && d >= mejor.d)) continue
          mejor = { d, destino: cual === 0 ? suyo : suyo - pieza[medida] }
        }
      }
    }
    if (mejor) pieza[eje] = Number(mejor.destino.toFixed(4))
  }
}

function enSuelo(evento) {
  const caja = lienzo.getBoundingClientRect()
  puntero.x = ((evento.clientX - caja.left) / caja.width) * 2 - 1
  puntero.y = -((evento.clientY - caja.top) / caja.height) * 2 + 1
  rayo.setFromCamera(puntero, camara)
  return rayo.ray.intersectPlane(suelo, golpe) ? golpe.clone() : null
}

lienzo.addEventListener('contextmenu', (e) => e.preventDefault())

// El puntero sobre la vista es lo que convierte WASD en cámara. Al salir se
// sueltan las teclas: si no, cruzar al panel con W apretada dejaría la cámara
// volando sola.
lienzo.addEventListener('pointerenter', () => { sobreLaVista = true })
lienzo.addEventListener('pointerleave', () => { sobreLaVista = false; teclasCamara.clear() })

lienzo.addEventListener('pointerdown', (evento) => {
  lienzo.setPointerCapture(evento.pointerId)

  if (evento.button === 2 || evento.button === 1) {
    orbitando = { x: evento.clientX, y: evento.clientY, pan: evento.button === 1 || evento.shiftKey }
    return
  }
  if (evento.button !== 0) return

  const caja = lienzo.getBoundingClientRect()
  puntero.x = ((evento.clientX - caja.left) / caja.width) * 2 - 1
  puntero.y = -((evento.clientY - caja.top) / caja.height) * 2 + 1
  rayo.setFromCamera(puntero, camara)
  const tocadas = rayo.intersectObjects(proxies.children, false)

  if (tocadas.length === 0) { elegir(-1); return }
  elegir(tocadas[0].object.userData.indice)

  const punto = enSuelo(evento)
  const pieza = mapa.boxes[seleccion]
  if (punto && pieza) {
    // Se anota **al empezar el arrastre**, no en cada movimiento del ratón:
    // deshacer tiene que volver a donde estaba la caja, no un píxel atrás.
    anotarParaDeshacer()
    arrastrando = { dx: pieza.x - punto.x, dz: pieza.z - punto.z }
  }
})

lienzo.addEventListener('pointermove', (evento) => {
  if (orbitando) {
    const dx = evento.clientX - orbitando.x
    const dy = evento.clientY - orbitando.y
    orbitando.x = evento.clientX
    orbitando.y = evento.clientY
    if (orbitando.pan) {
      // Panear en el plano del suelo, a escala de lo lejos que esté la cámara.
      const escala = orbita.radio * 0.0015
      orbita.centro.x -= (dx * Math.cos(orbita.yaw) - dy * Math.sin(orbita.yaw)) * escala
      orbita.centro.z += (dx * Math.sin(orbita.yaw) + dy * Math.cos(orbita.yaw)) * escala
    } else {
      orbita.yaw -= dx * 0.005
      // El pitch se acota para no cruzar el cenit, que voltea la vista.
      orbita.pitch = Math.min(Math.max(orbita.pitch - dy * 0.005, 0.05), Math.PI / 2 - 0.02)
    }
    return
  }

  if (!arrastrando) return
  const punto = enSuelo(evento)
  if (!punto) return
  colocar(seleccion, punto.x + arrastrando.dx, punto.z + arrastrando.dz)
})

/**
 * **Dónde acaba una pieza que se mueve, sea quien sea quien la mueva.** El
 * arrastre, el imán y la rejilla se aplican aquí y en un solo sitio: escribir
 * la misma cadena en el `pointermove` y otra vez en cualquier otro camino es
 * cómo el ratón y el teclado acaban cuadrando distinto.
 */
function colocar(indice, x, z) {
  const pieza = mapa.boxes[indice]
  if (!pieza) return
  pieza.x = aRejilla(x)
  pieza.z = aRejilla(z)
  alImán(pieza, indice)
  sucio = true
  pintarPanel()
}

const soltar = () => { arrastrando = null; orbitando = null }
lienzo.addEventListener('pointerup', soltar)
lienzo.addEventListener('pointercancel', soltar)

lienzo.addEventListener('wheel', (evento) => {
  evento.preventDefault()
  orbita.radio = Math.min(Math.max(orbita.radio * (1 + Math.sign(evento.deltaY) * 0.1), 5), 400)
}, { passive: false })

// ---------------------------------------------------------------- panel

function elegir(indice) {
  seleccion = indice
  pintarContorno()
  pintarPanel()
}

function rellenarAlturas() {
  const opciones = Object.entries(COVER.heights)
    .map(([clave, alto]) => `<option value="${clave}">${clave} · ${alto} u</option>`)
    .join('')
  $('p-kind').innerHTML = opciones
  $('abrir').innerHTML = `<option value="">(mapa nuevo)</option>` + Object.entries(SCENARIOS)
    .map(([clave, def]) => `<option value="${clave}">${def.label ?? clave}</option>`)
    .join('')
  anunciarLimites()
}

/**
 * **La sala tiene un tope, y no es el presupuesto de geometría** (vuelta 76).
 *
 * Son dos límites distintos y conviene que se lean como tales. El de la sala
 * es **duro y del formato** (`SALA`, en `src/maps/formato.js`): lo sanea el
 * mismo código que lee un mapa al montarlo, así que un número fuera de rango
 * no llega al juego venga del editor o de un fichero escrito a mano.
 *
 * El presupuesto no es eso: es una **medida**, y lo que mide es lo que cuesta
 * la colisión por paso de mundo. No se derivan el uno del otro, y atarlos sería
 * mentir en los dos sentidos — una sala de 200×200 con cuatro cajas es barata,
 * y una de 40×40 con cuatrocientas no cabe en el presupuesto.
 */
function anunciarLimites() {
  for (const id of ['sala-w', 'sala-d']) { $(id).min = SALA.min; $(id).max = SALA.max }
  $('sala-h').min = SALA.alto.min
  $('sala-h').max = SALA.alto.max
  $('limites').textContent =
    `La sala va de ${SALA.min} a ${SALA.max} u de lado y de ${SALA.alto.min} a ${SALA.alto.max} de alto. ` +
    'Lo que cuesta un mapa no sale de su tamaño sino de sus piezas: eso lo mide el presupuesto, ahí abajo.'
}

/** Escribe el estado en el panel. No al revés: el panel no guarda nada. */
function pintarPanel() {
  $('clave').value = mapa.clave ?? ''
  $('label').value = mapa.label ?? ''
  // **La sala sale del mapa, no del escenario montado.** Remontar va con
  // bandera y ocurre en el frame siguiente, así que preguntarle al escenario
  // enseñaba la sala del mapa *anterior*: abrir Los Pilares decía 40×40.
  const sala = scenarioRoom(mapa)
  $('sala-w').value = sala.width
  $('sala-d').value = sala.depth
  $('sala-h').value = sala.height
  $('spawn-x').value = mapa.spawn.x
  $('spawn-z').value = mapa.spawn.z
  $('paso').value = paso
  $('cuenta').textContent = `${mapa.boxes.length}`

  $('lista').innerHTML = mapa.boxes
    .map((p, i) => `<li data-i="${i}" class="${i === seleccion ? 'puesta' : ''}">${String(i).padStart(2, '0')} · ${p.kind} · ${p.w}×${p.d} @ ${p.x},${p.z}</li>`)
    .join('')

  const pieza = mapa.boxes[seleccion]
  $('pieza').hidden = !pieza
  if (pieza) {
    const base = pieza.base ? coverHeight(pieza.base) : 0
    $('p-x').value = pieza.x
    $('p-z').value = pieza.z
    $('p-w').value = pieza.w
    $('p-d').value = pieza.d
    $('p-alto').value = coverHeight(pieza.kind)
    $('p-base').value = base || 0
    // El desplegable sólo dice algo si la altura sale del vocabulario; con un
    // número, se queda en blanco en vez de enseñar una clave que no es.
    $('p-kind').value = typeof pieza.kind === 'string' ? pieza.kind : ''
    // Los tiradores de los números se mueven con el paso elegido, que es lo
    // que hace que la flecha arriba/abajo haga lo mismo que arrastrar.
    for (const id of ['p-x', 'p-z', 'p-w', 'p-d']) $(id).step = paso
    $('p-alto').step = 0.1
    avisarDeAire(pieza)
  }
  $('deshacer').disabled = pila.atras.length === 0
  $('rehacer').disabled = pila.adelante.length === 0
}

/**
 * **Una pieza con aire debajo es un vano, y el motor todavía no lo cubre.**
 *
 * La colisión sabe pasar por debajo de algo (`box.bottom >= headY`), pero
 * **nadie comprueba que no te levantes debajo**: ninguna pieza de ningún mapa
 * tenía la base en el aire hasta ahora, así que agacharse no abría ni un paso.
 * Desde que la base se escribe a mano eso se puede construir, y lo honesto no
 * es prohibirlo ni callarlo: es decirlo donde se está haciendo.
 *
 * Apilar no lo dispara —una pieza sobre otra no tiene aire debajo—, que es el
 * caso normal. Está escrito en `CLAUDE.md` y su banco es `slide69` [9].
 */
function avisarDeAire(pieza) {
  const base = pieza.base ? coverHeight(pieza.base) : 0
  let apoyada = base <= 0
  for (const [i, otra] of mapa.boxes.entries()) {
    if (apoyada || i === seleccion) continue
    if (pieza.x >= otra.x + otra.w || otra.x >= pieza.x + pieza.w) continue
    if (pieza.z >= otra.z + otra.d || otra.z >= pieza.z + pieza.d) continue
    if (coverHeight(otra.kind) >= base - 0.001) apoyada = true
  }
  $('aviso-aire').hidden = apoyada
  $('aviso-aire').textContent = apoyada ? '' :
    `Esta pieza empieza a ${base} u con aire debajo: es un vano. Se dibuja y para las balas, ` +
    'pero el juego todavía no comprueba que no te levantes debajo de ella (agachado). ' +
    'Hasta que esa comprobación exista, mejor apoyarla sobre algo.'
}

$('lista').addEventListener('click', (evento) => {
  const fila = evento.target.closest('li')
  if (fila) elegir(Number(fila.dataset.i))
})

/** Un campo escribe en el mapa y marca sucio. Nada más: remontar es del bucle. */
function campo(id, aplicar) {
  $(id).addEventListener('change', () => {
    anotarParaDeshacer()
    aplicar($(id).value)
    sucio = true
    pintarPanel()
  })
}

campo('clave', (v) => {
  mapa.clave = v.trim().replace(/[^a-zA-Z0-9_-]/g, '-')
  anotarEnLaBarra(mapa.clave)
})
campo('label', (v) => { mapa.label = v })
campo('sala-w', (v) => { mapa.room = { ...mapa.room, width: Number(v) } })
campo('sala-d', (v) => { mapa.room = { ...mapa.room, depth: Number(v) } })
campo('sala-h', (v) => { mapa.room = { ...mapa.room, height: Number(v) } })
campo('spawn-x', (v) => { mapa.spawn = { ...mapa.spawn, x: Number(v) } })
campo('spawn-z', (v) => { mapa.spawn = { ...mapa.spawn, z: Number(v) } })
campo('paso', (v) => { paso = Number(v) || 0.5 })

// Posición: libre. Las dimensiones, con candado.
for (const [id, clave] of [['p-x', 'x'], ['p-z', 'z']]) {
  campo(id, (v) => { if (mapa.boxes[seleccion]) mapa.boxes[seleccion][clave] = Number(v) })
}

/**
 * **Los candados son por dimensión, y bloquean el dato, no el control.**
 *
 * Se comprueban aquí —en el único sitio que escribe esa medida— y no apagando
 * el campo en el navegador: un `disabled` apaga el teclado y deja pasar todo
 * lo demás, y lo que hay que bloquear es que esa medida cambie, venga del
 * número, del arrastre o de un preset. Es la regla de la vuelta 67 con el
 * selector de la fase de compra, en pequeño.
 */
for (const [id, clave] of [['p-w', 'w'], ['p-d', 'd']]) {
  campo(id, (v) => {
    const pieza = mapa.boxes[seleccion]
    if (!pieza || candados[clave]) return
    pieza[clave] = Math.max(Number(v), 0.1)
  })
}
for (const clave of ['w', 'd', 'alto']) {
  $(`lock-${clave}`).addEventListener('change', (e) => { candados[clave] = e.target.checked })
}

/**
 * **La altura se escribe de dos maneras y es el mismo dato.**
 *
 * `kind` es «lo alto que llega esta pieza»: una clave del vocabulario
 * (`media`, `alta`…) **o un número**. El desplegable pone la clave y el número
 * pone el número, y el gris lo decide `coverColor`, que para un número coge el
 * de la altura más cercana — así el tono sigue diciendo la altura (vuelta 76).
 */
campo('p-alto', (v) => {
  const pieza = mapa.boxes[seleccion]
  if (!pieza || candados.alto) return
  const base = pieza.base ? coverHeight(pieza.base) : 0
  pieza.kind = Math.max(Number(v), base + 0.1)
})
campo('p-kind', (v) => {
  const pieza = mapa.boxes[seleccion]
  if (!pieza || candados.alto) return
  pieza.kind = v
})

/**
 * **Base es «desde qué altura empieza», no «sobre qué pieza se apoya».**
 *
 * Era un desplegable del vocabulario y no se entendía, con razón: lo que uno
 * quiere al apilar es *poner una caja encima de otra*, y eso con un menú de
 * nombres de alturas hay que deducirlo. Ahora es **un número**, como el alto —
 * base 0 es el suelo, base 2.6 empieza a dos y pico— y apilar tiene su botón.
 */
campo('p-base', (v) => {
  const pieza = mapa.boxes[seleccion]
  if (!pieza) return
  const base = Math.max(Number(v) || 0, 0)
  // **Subir una pieza es subirla entera, no estirarla.** El grosor es el que
  // tiene ahora mismo; moviendo sólo la base, escribir un número aquí
  // aplastaría la caja contra su propio techo hasta hacerla desaparecer.
  const grosor = Math.max(coverHeight(pieza.kind) - (pieza.base ? coverHeight(pieza.base) : 0), 0.1)
  if (base <= 0) delete pieza.base
  else pieza.base = Number(base.toFixed(4))
  pieza.kind = Number((base + grosor).toFixed(4))
})

/**
 * **Apilar es poner la base en el techo de lo que haya debajo.**
 *
 * «Debajo» es la pieza más alta cuya huella se solapa con la de ésta, que es
 * lo que uno señala con el dedo al decir «encima de aquélla». Si no hay nada
 * debajo, lo dice en vez de no hacer nada.
 */
$('p-apilar').addEventListener('click', () => {
  const pieza = mapa.boxes[seleccion]
  if (!pieza) return
  let techo = 0
  for (const [i, otra] of mapa.boxes.entries()) {
    if (i === seleccion) continue
    if (pieza.x >= otra.x + otra.w || otra.x >= pieza.x + pieza.w) continue
    if (pieza.z >= otra.z + otra.d || otra.z >= pieza.z + pieza.d) continue
    techo = Math.max(techo, coverHeight(otra.kind))
  }
  if (techo <= 0) { contar([], 'no hay ninguna pieza debajo de ésta sobre la que apilar'); return }
  anotarParaDeshacer()
  const grosor = coverHeight(pieza.kind) - (pieza.base ? coverHeight(pieza.base) : 0)
  pieza.base = Number(techo.toFixed(4))
  pieza.kind = Number((techo + Math.max(grosor, 0.1)).toFixed(4))
  sucio = true
  pintarPanel()
  contar([], `apilada sobre la pieza de debajo: base ${pieza.base}, techo ${pieza.kind}`)
})

/**
 * **El giro es de 90° y es intercambiar ancho y fondo.** No hay rotación libre
 * porque la colisión es AABB: una caja girada se dibujaría girada, pararía las
 * balas bien y se chocaría sin girar.
 */
$('p-giro').addEventListener('click', () => {
  const pieza = mapa.boxes[seleccion]
  if (!pieza) return
  anotarParaDeshacer()
  const centroX = pieza.x + pieza.w / 2
  const centroZ = pieza.z + pieza.d / 2
  ;[pieza.w, pieza.d] = [pieza.d, pieza.w]
  pieza.x = aRejilla(centroX - pieza.w / 2)
  pieza.z = aRejilla(centroZ - pieza.d / 2)
  sucio = true
  pintarPanel()
})

/**
 * **El menú de formas son presets de la misma caja.**
 *
 * No hay más primitiva que la caja alineada a los ejes porque no hay más
 * colisión que ésa: un muro y un bordillo se distinguen en sus números y en su
 * `kind`, no en su geometría. Poner aquí un cilindro o una cuña sería ofrecer
 * algo contra lo que el motor no sabe chocar.
 */
const FORMAS = [
  { id: 'cubo', nombre: 'Cubo', pista: '3×3 media', w: 3, d: 3, kind: 'media' },
  { id: 'prisma', nombre: 'Prisma', pista: '5×2 media', w: 5, d: 2, kind: 'media' },
  { id: 'muro', nombre: 'Muro', pista: '12×1 alta', w: 12, d: 1, kind: 'alta' },
  { id: 'bordillo', nombre: 'Bordillo', pista: '4×1.5 bajo', w: 4, d: 1.5, kind: 'bordillo' },
  { id: 'plataforma', nombre: 'Plataforma', pista: '8×8 pisable', w: 8, d: 8, kind: 'plataforma' },
  { id: 'parapeto', nombre: 'Parapeto', pista: '8×1 alto', w: 8, d: 1, kind: 'parapeto' },
]

function pintarFormas() {
  $('formas').innerHTML = FORMAS
    .map((f) => `<button type="button" data-forma="${f.id}"><b>${f.nombre}</b><span>${f.pista}</span></button>`)
    .join('')
}

$('formas').addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-forma]')
  if (!boton) return
  const forma = FORMAS.find((f) => f.id === boton.dataset.forma)
  if (!forma) return
  anotarParaDeshacer()
  // Se aparta de lo que ya haya en ese punto: dos piezas nuevas seguidas caían
  // una dentro de otra y la segunda no se veía, así que parecía que el botón
  // no hacía nada.
  let x = aRejilla(orbita.centro.x - forma.w / 2)
  let z = aRejilla(orbita.centro.z - forma.d / 2)
  while (mapa.boxes.some((pieza) => pieza.x === x && pieza.z === z)) z += forma.d + paso
  mapa.boxes.push({ x, z, w: forma.w, d: forma.d, kind: forma.kind })
  sucio = true
  elegir(mapa.boxes.length - 1)
})

$('duplicar').addEventListener('click', () => {
  const pieza = mapa.boxes[seleccion]
  if (!pieza) return
  anotarParaDeshacer()
  mapa.boxes.push({ ...pieza, x: pieza.x + pieza.w + paso })
  sucio = true
  elegir(mapa.boxes.length - 1)
})

$('borrar').addEventListener('click', () => {
  if (!mapa.boxes[seleccion]) return
  anotarParaDeshacer()
  mapa.boxes.splice(seleccion, 1)
  sucio = true
  elegir(-1)
})

// ---------------------------------------------------------------- abrir y guardar

function cargar(definicion, clave) {
  const { mapa: limpio, problemas } = sanearMapa({ ...definicion, clave: clave ?? definicion.clave })
  mapa = limpio
  // La sala se materializa al abrir: un escenario puede no declararla —la sala
  // vacía no lo hace— y entonces los tres campos del panel no tendrían qué
  // escribir. `scenarioRoom` es la misma función de la que sale en el juego.
  const sala = scenarioRoom(limpio)
  mapa.room = { width: sala.width, depth: sala.depth, height: sala.height }
  seleccion = -1
  sucio = true
  pila.atras.length = 0
  pila.adelante.length = 0
  contar(problemas)
  anotarEnLaBarra(mapa.clave)
  // Que el desplegable diga qué hay abierto. Se comprueba **contra sus
  // opciones** y no contra `SCENARIOS`: un mapa recién guardado ya está en el
  // catálogo pero todavía no en este desplegable, y asignar un valor que no
  // existe deja al navegador con el de antes — o sea enseñando otro mapa.
  const abribles = [...$('abrir').options].map((o) => o.value)
  $('abrir').value = abribles.includes(mapa.clave) ? mapa.clave : ''
  pintarPanel()
  pintarVersiones()
}

function contar(problemas, estado = '') {
  $('estado').textContent = estado
  $('problemas').innerHTML = problemas.map((p) => `<li>${p}</li>`).join('')
}

$('abrir').addEventListener('change', (evento) => {
  const clave = evento.target.value
  cargar(clave ? SCENARIOS[clave] : mapaNuevo(), clave || undefined)
})

/**
 * **Guardar pregunta qué cambia.** Un historial sin comentarios es una lista de
 * fechas: sirve para saber que hubo diez guardados y no para encontrar el
 * bueno. El comentario es lo único que hace que una versión se pueda elegir sin
 * abrirlas todas.
 */
$('guardar').addEventListener('click', () => {
  const { mapa: limpio, problemas } = sanearMapa(mapa)
  if (!limpio.clave) { contar(['hace falta una clave para guardar'], ''); return }
  $('dlg-clave').textContent = limpio.clave
  $('dlg-comentario').value = comentarioSugerido
  $('dlg-nota').textContent = problemas.length
    ? `${problemas.length} cosa(s) que el saneado va a dejar fuera — ver el panel`
    : `${limpio.boxes.length} pieza(s)`
  $('dlg-guardar').showModal()
  $('dlg-comentario').focus()
})

$('dlg-guardar').addEventListener('close', () => {
  if ($('dlg-guardar').returnValue !== 'guardar') return
  guardar($('dlg-comentario').value)
})

async function guardar(comentario) {
  const { mapa: limpio, problemas } = sanearMapa(mapa)
  contar(problemas, 'guardando…')
  try {
    const respuesta = await fetch('/__editor/guardar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Va **el dato**, no el texto del fichero: quien serializa un mapa es el
      // servidor, con la misma función que usa esta página (vuelta 75).
      body: JSON.stringify({ clave: limpio.clave, mapa: limpio, comentario }),
    })
    const cuerpo = await respuesta.json()
    if (!respuesta.ok) { contar([cuerpo.error ?? 'no se ha podido guardar'], ''); return }

    comentarioSugerido = ''
    localStorage.removeItem(BORRADOR)
    const nota = cuerpo.anotada ? `versión ${cuerpo.versiones}` : 'sin cambios: no se anota versión'
    const estado = `guardado en ${cuerpo.fichero} · ${nota}`

    // El relevo se deja puesto **antes** de tocar la pantalla: la recarga de
    // Vite puede llegar en cualquier momento a partir de aquí.
    try {
      sessionStorage.setItem(RELEVO, JSON.stringify({ mapa: limpio, orbita, estado }))
    } catch { /* sin relevo se recarga en blanco, que es molesto y no es perder nada */ }

    contar(cuerpo.problemas ?? problemas, estado)
    pintarVersiones()
  } catch (error) {
    contar([`no se ha podido guardar: ${error.message}`], '')
  }
}

// ---------------------------------------------------------------- versiones

function cuando(iso) {
  const d = new Date(iso)
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function pintarVersiones() {
  const clave = mapa.clave
  const lista = $('versiones')
  if (!clave) { lista.innerHTML = ''; $('sin-versiones').hidden = false; $('cuenta-versiones').textContent = ''; return }
  try {
    const respuesta = await fetch(`/__editor/historial?clave=${encodeURIComponent(clave)}`)
    const { versiones, aviso } = await respuesta.json()
    $('cuenta-versiones').textContent = versiones.length ? `${versiones.length}` : ''
    $('sin-versiones').hidden = versiones.length > 0
    // De la más reciente hacia atrás: lo que se busca casi siempre es lo último.
    lista.innerHTML = [...versiones].reverse().map((v, desdeArriba) => `
      <li class="${desdeArriba === 0 ? 'actual' : ''}">
        <span>
          <span class="que">${escapar(v.comentario)}</span><br>
          <span class="cuando">${cuando(v.instante)} · ${v.piezas} pieza(s)</span>
        </span>
        <button type="button" data-i="${v.indice}">Restaurar</button>
      </li>`).join('')
    if (aviso) {
      contar([], `el historial de este mapa pasa de ${aviso} versiones: conviene podarlo a mano`)
    }
  } catch {
    lista.innerHTML = ''
    $('cuenta-versiones').textContent = '(sin servidor)'
  }
}

/** Un comentario lo escribe una persona, así que no se mete en el DOM sin más. */
function escapar(texto) {
  const nodo = document.createElement('span')
  nodo.textContent = texto
  return nodo.innerHTML
}

/**
 * **Restaurar carga, no escribe.** La versión se pone delante en el editor y
 * se vuelve la del disco cuando se guarda. Así volver atrás **no puede romper
 * el mapa**: se puede mirar una versión vieja sin comprometerse, y si no era
 * ésa, se abre otra.
 */
$('versiones').addEventListener('click', async (evento) => {
  const boton = evento.target.closest('button[data-i]')
  if (!boton) return
  const respuesta = await fetch(`/__editor/historial?clave=${encodeURIComponent(mapa.clave)}&i=${boton.dataset.i}`)
  if (!respuesta.ok) { contar(['esa versión no está'], ''); return }
  const version = await respuesta.json()
  cargar(version.mapa, mapa.clave)
  comentarioSugerido = `restaurado de ${cuando(version.instante)} («${version.comentario}»)`
  contar([], `cargada la versión de ${cuando(version.instante)} · guarda para dejarla fija`)
})

// ---------------------------------------------------------------- probar

/**
 * **Probar es el motor, no una vista previa.** Se construye contra la
 * definición que hay delante —con su sala, su física y su colisión— y se
 * destruye al volver, que es lo que garantiza que lo siguiente que pruebes sea
 * la geometría que acabas de tocar y no la de hace tres cambios.
 */
function probar() {
  if (motor) return
  const { mapa: limpio, problemas } = sanearMapa(mapa)

  /**
   * **Si hay muñecos o no es del mundo que se monta** (vuelta 76), y entra por
   * la misma puerta que el escenario: `new Engine(…, { escenario, dianas })`.
   *
   * Quitarle las rutas al mapa —que fue lo primero que se probó— **no vale**:
   * sin rutas las dianas no desaparecen, se muestrean por cono como en la sala
   * vacía. Medido, salía una igual. Y tocar `simultaneousTargets` tampoco: ése
   * es el ajuste del jugador, y reescribírselo por abrir el editor es el fallo
   * de la vuelta 60 por otra puerta.
   */
  const conMunecos = $('con-munecos').checked
  contar(problemas, conMunecos ? 'probando con muñecos · ESC para volver' : 'probando · ESC para volver')

  document.body.classList.add('jugando')
  teclasCamara.clear()
  cancelAnimationFrame(bucle)
  bucle = 0
  $('caja-juego').hidden = false

  motor = new Engine($('juego'), {
    /**
     * **El HUD y la mira son los del juego** (vuelta 73), montados por
     * `montarCapaDeDuelo`. Escribir aquí una tercera versión sería el fallo de
     * producto de la vuelta 63 por la puerta del editor: un mapa se prueba con
     * lo que se ve jugando, o no se está probando lo mismo.
     */
    onFrame: (stats) => capa?.pintar(stats),
    onWeapon: (w) => capa?.arma(w.weaponKey, w.suppressed),
    onDamage: (fraccion, rumbo) => capa?.dano(fraccion, rumbo),
    onHelp: (texto, ms) => capa?.ayuda(texto, ms),
    onScope: (puesta) => capa?.apuntando(puesta),
    onMeleeRange: (dentro, espalda) => capa?.aCuchillo(dentro, espalda),
  }, { escenario: limpio, dianas: conMunecos })
  capa?.jugando(true)
  motor.start()
  motor.requestStart('endless')
}

function dejarDeProbar() {
  if (!motor) return
  motor.dispose()
  motor = null
  capa?.jugando(false)
  $('caja-juego').hidden = true
  document.body.classList.remove('jugando')
  contar([], '')
  redimensionar()
  if (!bucle) frame()
}

$('deshacer').addEventListener('click', () => mover(pila.atras, pila.adelante))
$('rehacer').addEventListener('click', () => mover(pila.adelante, pila.atras))

window.addEventListener('keydown', (evento) => {
  // Con el ratón dentro del juego las teclas son del juego, no del editor.
  if (motor || !(evento.ctrlKey || evento.metaKey) || evento.code !== 'KeyZ') return
  // Y no se roban si se está escribiendo en un campo del panel.
  if (document.activeElement?.matches('input, textarea, select')) return
  evento.preventDefault()
  mover(...(evento.shiftKey ? [pila.adelante, pila.atras] : [pila.atras, pila.adelante]))
})

$('probar').addEventListener('click', probar)

window.addEventListener('keydown', (evento) => {
  if (evento.code !== 'Escape') return
  // Salir de la captura lo resuelve el navegador (vuelta 48); esto es lo otro
  // que hace Escape aquí: volver a editar.
  if (motor && !document.pointerLockElement) dejarDeProbar()
})

// ---------------------------------------------------------------- bucle

function redimensionar() {
  const caja = $('vista').getBoundingClientRect()
  renderer.setSize(caja.width, caja.height, false)
  camara.aspect = caja.width / Math.max(caja.height, 1)
  camara.updateProjectionMatrix()
}
window.addEventListener('resize', redimensionar)

/**
 * El bucle de editar. **Se para del todo mientras se prueba**: devolver pronto
 * seguía pidiendo un frame por frame al mismo navegador que está corriendo el
 * juego, y el juego es lo único que importa en ese momento.
 */
let bucle = 0
let ultimoFrame = 0
function frame(ahora = performance.now()) {
  bucle = requestAnimationFrame(frame)
  // Acotado como el del motor: volver de otra pestaña no puede mandar la
  // cámara a la otra punta del mapa de un salto.
  const dt = Math.min((ahora - ultimoFrame) / 1000, 0.1)
  ultimoFrame = ahora
  if (sucio) { sucio = false; remontar(); anotarBorrador() }
  volar(dt)
  colocarCamara()
  renderer.render(scene, camara)
}

// ---------------------------------------------------------------- presupuesto

/**
 * **El presupuesto se mide, no se cuenta.**
 *
 * Contar cajas sería el número fácil y el equivocado: las mallas se funden por
 * tipo, así que veinte cajas son cinco llamadas de dibujo. Lo que de verdad
 * cuesta una pieza es que **la colisión recorre todas las cajas, por eje y por
 * paso** — y ése es justo el número que el proyecto presupuesta desde la
 * vuelta 44: ~0.2 ms p99 por paso de mundo, con un paso real costando 0.07 con
 * ocho muñecos.
 *
 * Así que se ejecutan pasos de verdad con el movimiento del juego contra la
 * geometría que hay delante, y se enseña el coste **con su denominador al
 * lado** (piezas y triángulos), que es la regla de la vuelta 46.
 *
 * **Y lo que se ha medido construyendo esto conviene decirlo**: con colisión
 * AABB y las mallas fundidas por tipo, un mapa **no puede** romper el
 * presupuesto por geometría. Medido en el propio editor: 0 piezas 0.0000 ms por
 * paso, 200 piezas 0.0001, **1500 piezas 0.0004** — contra un presupuesto de
 * 0.2 y un paso real de 0.07 con ocho muñecos. O sea que el aviso es un
 * cortafuegos para el día que una pieza cueste de verdad (un vano, un tejado,
 * una rotación), y hasta entonces lo que hace el panel es **enseñar lo que
 * cuesta tu mapa**, que ya es lo que faltaba.
 */
const PRESUPUESTO_MS = 0.2
/**
 * **Un paso suelto no se puede cronometrar en un navegador** (vuelta 76).
 *
 * `performance.now()` viene acotado a 100 µs fuera de un contexto aislado, y un
 * paso contra diecisiete cajas cuesta mucho menos que eso. La primera versión
 * medía paso a paso y daba **0.000 ms p99 en Los Pilares** —que no es un mapa
 * barato, es un reloj sin resolución—; la segunda midió bloques de 25 y dio
 * **el mismo 0.0010 para 0 piezas que para 600**, o sea seguía leyendo el
 * escalón del reloj y no el mapa. Es la trampa de la vuelta 62 con el audio
 * —un número solo no dice de cuántos sale— por la puerta del cronómetro.
 *
 * Lo que sí tiene resolución es **el total**: dos mil pasos cuestan
 * milisegundos enteros, así que la media por paso sale de dividir eso, y ésa es
 * la cifra que se compara con el presupuesto. El peor bloque va al lado para
 * ver un pico, sabiendo que está cuantizado — y por eso se enseñan los dos y no
 * uno.
 */
const PASOS_POR_BLOQUE = 100
const BLOQUES_MEDIDOS = 20
const PASOS_MEDIDOS = PASOS_POR_BLOQUE * BLOQUES_MEDIDOS

const camaraDePrueba = new THREE.PerspectiveCamera()
let movimientoDePrueba = null

function medirPresupuesto() {
  if (!escenario) return
  try {
    if (!movimientoDePrueba) movimientoDePrueba = new MovementController(camaraDePrueba)
    movimientoDePrueba.setScenario(escenario)
    movimientoDePrueba.reset()
    // Andando en diagonal: es lo que toca la colisión en los dos ejes, que es
    // donde está el coste. Parado no se mide nada.
    movimientoDePrueba.keys.forward = true
    movimientoDePrueba.keys.right = true

    const muestras = new Float64Array(BLOQUES_MEDIDOS)
    let reloj = performance.now()
    let pasos = 0
    const arranque = performance.now()
    for (let b = 0; b < BLOQUES_MEDIDOS; b++) {
      const t0 = performance.now()
      for (let i = 0; i < PASOS_POR_BLOQUE; i++) {
        movimientoDePrueba.update(1000 / 60, reloj)
        reloj += 1000 / 60
        pasos++
        // Se reaparece de vez en cuando: si no, el jugador acaba en una esquina
        // contra la pared y deja de tocar geometría, que es medir el caso bueno.
        if (pasos % 90 === 89) movimientoDePrueba.reset()
      }
      muestras[b] = (performance.now() - t0) / PASOS_POR_BLOQUE
    }
    const media = (performance.now() - arranque) / PASOS_MEDIDOS
    muestras.sort()
    // Con veinte bloques esto **es** el peor de ellos, y así se dice: un
    // percentil sobre veinte muestras es un nombre elegante para un máximo.
    const peor = muestras[BLOQUES_MEDIDOS - 1]

    let triangulos = 0
    for (const malla of escenario.occluders) {
      triangulos += (malla.geometry?.index?.count ?? malla.geometry?.attributes?.position?.count ?? 0) / 3
    }

    const nodo = $('presupuesto')
    const aprieta = media > PRESUPUESTO_MS
    nodo.className = `nota ${aprieta ? 'aprieta' : 'cabe'}`
    nodo.textContent = `${media.toFixed(4)} ms de colisión por paso (peor bloque ${peor.toFixed(4)})` +
      ` · ${escenario.boxes.length} piezas · ${Math.round(triangulos)} triángulos` +
      ` · de ${PASOS_MEDIDOS} pasos` + ` · presupuesto ${PRESUPUESTO_MS} ms` +
      (aprieta ? ' — SE PASA' : '')
  } catch (error) {
    $('presupuesto').textContent = `no se ha podido medir: ${error.message}`
  }
}

// ---------------------------------------------------------------- borrador

/**
 * Guarda el borrador **aplazado**: `sucio` se levanta en cada píxel de un
 * arrastre, y escribir en `localStorage` sesenta veces por segundo es la misma
 * clase de trabajo tirado que fundir geometrías por evento.
 */
function anotarBorrador() {
  clearTimeout(aplazado)
  aplazado = setTimeout(() => {
    // Sin persistencia se edita igual, pero tragárselo en silencio es
    // indistinguible de un editor que pierde el trabajo por su cuenta
    // (la regla del `try/catch` de la vuelta 60).
    try { localStorage.setItem(BORRADOR, JSON.stringify(mapa)) } catch (error) {
      contar([`no se puede guardar el borrador: ${error.message}`], '')
    }
  }, 400)
}

function recuperarBorrador(pedido) {
  let guardado = null
  try { guardado = localStorage.getItem(BORRADOR) } catch { return false }
  if (!guardado) return false
  try {
    const borrador = JSON.parse(guardado)
    /**
     * **Un borrador de otro mapa no manda sobre la dirección** (vuelta 76). El
     * borrador es «lo que estabas haciendo» y por eso gana por defecto; pero si
     * la barra pide un mapa **concreto** y el borrador es de otro, lo que se ha
     * pedido es ese otro. Sin esto, `/editor/#pilares` abría lo último que se
     * hubiera tocado y no había forma de decir cuál se quiere.
     */
    if (pedido && borrador.clave !== pedido) return false
    cargar(borrador)
    contar([], 'borrador recuperado · «Abrir» lo descarta')
    return true
  } catch {
    return false
  }
}

/**
 * **Qué se abre al entrar, en este orden y por este motivo:**
 *
 * 1. El **borrador**, si lo hay: es lo que estabas haciendo y no habías
 *    guardado, y perderlo al recargar es justo lo que viene a evitar.
 * 2. Lo que diga la **dirección**: al guardar un mapa nuevo la página recarga
 *    —el registro cambia y con él la configuración de Vite— y el borrador se
 *    ha borrado porque ya está en el disco. Sin este paso, guardar te dejaba
 *    delante de un mapa en blanco.
 * 3. Un mapa **en blanco**.
 */
function recuperarRelevo() {
  let guardado = null
  try { guardado = sessionStorage.getItem(RELEVO) } catch { return false }
  if (!guardado) return false
  // Se consume: un relevo que sobrevive a su recarga volvería a abrirse la
  // próxima vez y pisaría lo que estuvieras haciendo.
  try { sessionStorage.removeItem(RELEVO) } catch { /* da igual */ }
  try {
    const { mapa: guardadoMapa, orbita: vista, estado } = JSON.parse(guardado)
    cargar(guardadoMapa)
    if (vista) { orbita.radio = vista.radio; orbita.yaw = vista.yaw; orbita.pitch = vista.pitch }
    contar([], estado ?? '')
    return true
  } catch {
    return false
  }
}

function abrirLoQueToque() {
  // El relevo primero: es lo que acaba de guardarse, y la recarga que lo trae
  // aquí es consecuencia de haberlo guardado.
  if (recuperarRelevo()) return
  const deLaBarra = decodeURIComponent(location.hash.slice(1))
  if (recuperarBorrador(SCENARIOS[deLaBarra] ? deLaBarra : '')) return
  if (deLaBarra && SCENARIOS[deLaBarra]) {
    cargar(SCENARIOS[deLaBarra], deLaBarra)
    contar([], `abierto ${deLaBarra} · guardado en src/maps/`)
    return
  }
  cargar(mapaNuevo())
}

/**
 * **La capa del juego se monta una vez**, no en cada «Probar». React monta y
 * desmonta en modo estricto, y construirla con cada prueba sería pagar ese
 * baile cada vez — además de perder el HUD entre pruebas.
 */
capa = montarCapaDeDuelo($('capa'))

pintarFormas()
rellenarAlturas()
abrirLoQueToque()
redimensionar()
frame()

/**
 * **El asa para los bancos**, igual que `window.vektorNet` en la página del
 * duelo (vuelta 45). Es un instrumento de medida y no una función del editor:
 * lo que hace falta para poder afirmar que el paseo de prueba es el del motor
 * —su cámara, su movimiento y su escenario— en vez de suponerlo.
 *
 * Con captadores y no con copias: `motor` se construye y se destruye al entrar
 * y salir de «probar», así que una referencia guardada apuntaría al de antes.
 */
window.vektorEditor = {
  get mapa() { return mapa },
  get motor() { return motor },
  get escenario() { return motor ? motor.scenario : escenario },
  get camara() { return motor?.camera ?? camara },
  get movimiento() { return motor?.movement ?? null },
  get orbita() { return orbita },
  get laseres() { return laseres },
  coverHeight,
  cargar,
  colocar,
  elegir,
  sanear: () => sanearMapa(mapa),
  probar,
  dejarDeProbar,
}
