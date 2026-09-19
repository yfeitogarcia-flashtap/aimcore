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
import { COVER, FONDOS, MOVEMENT, PRIMARY_WEAPONS, ROUNDS, SCENARIOS, TARGET, coverColor, coverHeight, giro180, scenarioRoom } from '../src/config.js'
import { Avatar } from '../src/game/avatar.js'
import { Engine } from '../src/game/engine.js'
import { MovementController } from '../src/game/movement.js'
import { Scenario } from '../src/game/scenario.js'
import { createScene } from '../src/game/scene.js'
import { hasLineOfSight } from '../src/game/sight.js'
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
  /**
   * **El derecho se deriva del frente, no se escribe a mano** (vuelta 77). La
   * cámara está en esféricas alrededor del centro, así que mira hacia
   * `(−sin yaw, −cos yaw)` —aplastado al suelo: volar mirando hacia abajo no
   * debe hundirte—. El derecho es ese frente girado 90°, o sea
   * `(cos yaw, −sin yaw)`, y la primera versión lo puso con el signo cambiado:
   * **A movía a la derecha y D a la izquierda**.
   *
   * Es el mismo error de convención que la brújula de la vuelta 60 en pequeño,
   * y se evita igual: escribir los dos vectores una vez y sumarlos, en vez de
   * meter los senos a mano en cada componente.
   */
  const frente = [-Math.sin(orbita.yaw), -Math.cos(orbita.yaw)]
  const derecho = [Math.cos(orbita.yaw), -Math.sin(orbita.yaw)]
  orbita.centro.x += (adelante * frente[0] + lado * derecho[0]) * v
  orbita.centro.z += (adelante * frente[1] + lado * derecho[1]) * v
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
 * Salen de la **base** de la pieza elegida y cruzan la sala de lado a lado, que
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
    const base = pieza.base ? coverHeight(pieza.base) : 0
    /**
     * **A la altura de la base, no del centro** (vuelta 77). Con el centro, una
     * pieza apoyada en el suelo tenía el láser flotando a media altura: para
     * alinear hay que ver la línea **contra la superficie sobre la que se
     * apoya**, y la de una pieza del suelo es el suelo. Es la misma idea que
     * el imán —lo que se cuadra son caras, no centros—, por la otra puerta.
     */
    linea.position.set(pieza.x + pieza.w / 2, base, pieza.z + pieza.d / 2)
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
 * **El imán pega a la cara de al lado, y mueve por un solo eje** (vuelta 77).
 *
 * Construir con cajas es poner una contra otra, así que lo que tiene que
 * coincidir son **caras**: el borde izquierdo de ésta con el derecho de
 * aquélla, o los dos bordes izquierdos si se están alineando en fila.
 *
 * Y **gana un eje, no los dos**. La primera versión enganchaba en x y en z por
 * separado, así que arrimar una pieza a la cara de su vecina la **desviaba de
 * lado** de paso: encajabas por un eje y el otro se te movía sin haberlo
 * pedido. Un imán que corrige dos ejes a la vez no es un imán, es un
 * teletransporte corto.
 *
 * Lo que hace falta es un **raíl**: se mira la cara más cercana de todo el
 * mapa, se aplica **ésa** y el otro eje se queda exactamente donde lo dejó el
 * arrastre. Encajar contra una pared es entonces un desplazamiento recto, que
 * es lo que uno está haciendo con la mano.
 *
 * Y se aplica **después** de la rejilla: la rejilla es la regla general y el
 * imán la excepción cuando hay algo con lo que alinearse. Al revés, la rejilla
 * desharía lo que el imán acaba de cuadrar.
 */
function alImán(pieza, indice) {
  if (!$('iman').checked) return
  let mejor = null
  for (const eje of ['x', 'z']) {
    const medida = eje === 'x' ? 'w' : 'd'
    const otroEje = eje === 'x' ? 'z' : 'x'
    const miOtraMedida = eje === 'x' ? 'd' : 'w'
    const mio = [pieza[eje], pieza[eje] + pieza[medida]]
    for (const [otroIndice, otra] of mapa.boxes.entries()) {
      if (otroIndice === indice) continue
      // Sólo con las que se solapan en el otro eje: pegarse a la cara de una
      // caja que está en la otra punta del mapa no alinea nada.
      const otraMedida = eje === 'x' ? 'd' : 'w'
      if (pieza[otroEje] > otra[otroEje] + otra[otraMedida] + IMAN) continue
      if (otra[otroEje] > pieza[otroEje] + pieza[miOtraMedida] + IMAN) continue

      for (const suyo of [otra[eje], otra[eje] + otra[medida]]) {
        for (const [cual, valor] of mio.entries()) {
          const d = Math.abs(valor - suyo)
          /**
           * **Una cara ya cuadrada no gasta el raíl.** Si el otro eje coincide
           * exactamente —lo normal al construir en fila— su distancia es cero
           * y ganaría siempre, dejando sin efecto el único enganche que hacía
           * falta. Mover cero no es enganchar.
           */
          if (d < 1e-6) continue
          // El empate se queda con el primero: sin esto, dos caras a la misma
          // distancia en ejes distintos harían saltar el raíl de eje según el
          // orden en que se recorran las piezas.
          if (d > IMAN || (mejor && d >= mejor.d)) continue
          mejor = { d, eje, destino: cual === 0 ? suyo : suyo - pieza[medida] }
        }
      }
    }
  }
  if (mejor) pieza[mejor.eje] = Number(mejor.destino.toFixed(4))
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
  // Los dos catálogos de la fase 3 salen del dato, no de una lista a mano:
  // añadir un fondo o un arma principal los pone aquí solo.
  $('fondo').innerHTML = `<option value="">(ninguno, sólo la rejilla)</option>` +
    Object.entries(FONDOS).map(([clave, f]) => `<option value="${clave}">${f.label}</option>`).join('')
  $('dotacion-arma').innerHTML = Object.entries(PRIMARY_WEAPONS)
    .map(([clave, w]) => `<option value="${clave}">${w.label ?? clave}</option>`).join('')
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
  /**
   * **La misma cifra en la barra y en el panel** (vuelta 77). El panel está
   * cerrado la mayor parte del tiempo, así que lo que hay que saber siempre
   * —cuántas piezas llevas— se escribe también fuera. Una sola línea de
   * escritura para los dos nodos: dos sitios que la calculen es cómo acaban
   * diciendo cosas distintas.
   */
  const piezas = `${mapa.boxes.length} pieza${mapa.boxes.length === 1 ? '' : 's'}`
  $('cuenta').textContent = piezas
  $('cuenta-panel').textContent = piezas
  $('barra-mapa').textContent = mapa.label || mapa.clave || '(mapa nuevo)'

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
    // Dónde acabó el rayo. Sólo llega con el tiro de herramienta puesto, y es
    // el mismo rayo que resuelve un disparo: uno, no dos (vuelta 64).
    onSuperficie: (punto) => plantar(punto),
  }, { escenario: limpio, dianas: conMunecos })
  capa?.jugando(true)
  motor.tiroDeHerramienta = $('tiro-muneco').checked
  motor.start()
  motor.requestStart('endless')
  // El vuelo se aplica después de arrancar: `requestStart` reaparece, y
  // reaparecer pone al jugador en el suelo.
  if ($('god').checked) motor.movement.setVolando(true)
}

/**
 * **Los muñecos plantados son un instrumento de medida** (vuelta 77), como el
 * fantasma del duelo o los números detrás de F3. Sirven para contestar una
 * pregunta que ninguna cifra contesta —«¿desde dónde se defiende esta
 * cornisa?»— y por eso **no se guardan con el mapa**: dónde puede nacer un
 * muñeco de verdad sale de un barrido medido (`rutas-buscar.mjs`), no de
 * ponerlos a ojo. Escribirlos en el fichero sería colar a mano justo el dato
 * que la propuesta dejó fuera del editor a propósito.
 *
 * Se dibujan con `crearCuerpo`, que es **la única forma de figura humana del
 * juego** (vuelta 38): así lo que mides es la silueta que recibe disparos y no
 * un cilindro parecido.
 */
const plantados = []

function plantar(punto) {
  if (!motor) return
  // Con el color de equipo y no con el naranja de las dianas: lo que se
  // pregunta es si **un jugador** se defiende ahí, no si cabe un blanco.
  const cuerpo = new Avatar(TARGET.radius)
  // Anclado a los pies, como el hitbox: el punto es donde acabó el rayo.
  cuerpo.group.position.set(punto.x, punto.y, punto.z)
  motor.scene.add(cuerpo.group)
  plantados.push(cuerpo)
  $('cuenta-plantados').textContent = `${plantados.length}`
}

function limpiarPlantados() {
  for (const cuerpo of plantados) cuerpo.dispose()
  plantados.length = 0
  $('cuenta-plantados').textContent = ''
}

$('limpiar-plantados').addEventListener('click', limpiarPlantados)

$('tiro-muneco').addEventListener('change', () => {
  if (motor) motor.tiroDeHerramienta = $('tiro-muneco').checked
})

/**
 * **El vuelo se enciende con G, y la G es del editor.** El juego no comparte
 * binds con esta página: allí `KEYBINDS` es un mapa saneado y reasignable, y
 * aquí es una tecla de herramienta que no existe en ninguna partida. Meterla en
 * `KEYBINDS` habría sido reservarle al jugador una tecla para algo que no puede
 * usar nunca.
 */
function ponerGod(valor) {
  $('god').checked = valor
  motor?.movement.setVolando(valor)
}

$('god').addEventListener('change', () => ponerGod($('god').checked))

window.addEventListener('keydown', (evento) => {
  if (evento.code !== 'KeyG' || !motor) return
  evento.preventDefault()
  ponerGod(!$('god').checked)
})

function dejarDeProbar() {
  if (!motor) return
  // Los muñecos cuelgan de la escena del motor, que se va entera: hay que
  // soltarlos antes o quedan sus geometrías sin dueño.
  limpiarPlantados()
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
  escenario?.seguirConFondo(camara)
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

    const aprieta = media > PRESUPUESTO_MS
    // En la barra, lo corto; en el panel, con su denominador entero (vuelta 46).
    const corto = `${media.toFixed(4)} ms/paso` + (aprieta ? ' — SE PASA' : '')
    const largo = `${media.toFixed(4)} ms de colisión por paso (peor bloque ${peor.toFixed(4)})` +
      ` · ${escenario.boxes.length} piezas · ${Math.round(triangulos)} triángulos` +
      ` · de ${PASOS_MEDIDOS} pasos · presupuesto ${PRESUPUESTO_MS} ms` +
      (aprieta ? ' — SE PASA' : '')
    for (const [id, texto] of [['presupuesto', corto], ['presupuesto-panel', largo]]) {
      const nodo = $(id)
      nodo.className = `${id === 'presupuesto' ? 'dato' : 'nota'} ${aprieta ? 'aprieta' : 'cabe'}`
      nodo.textContent = texto
    }
  } catch (error) {
    $('presupuesto-panel').textContent = `no se ha podido medir: ${error.message}`
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
// ---------------------------------------------------------------- la fase 3

/**
 * **La fase 3: el mapa deja de ser sólo geometría** (vuelta 77).
 *
 * Salidas con rumbo, zona de aparición y caja de compra **como áreas**,
 * simetría por giro, física propia y dotación. Todo esto ya lo entendía el
 * juego desde las vueltas 66 y 72 — lo que faltaba era poder escribirlo sin
 * abrir `config.js`.
 *
 * Una regla gobierna la hoja entera: **el editor escribe el dato, no una
 * versión suya del dato.** `duelo.salidas`, `spawnZone`, `duelo.cajaCompra`,
 * `fisica` y `duelo.dotacion` son los campos que leen `partida.js` y
 * `scenario.js` tal cual, y el saneado que los valida es el mismo
 * (`src/maps/formato.js`). Un formulario que guardase «su» forma y la
 * tradujera al guardar sería una segunda definición de mapa.
 */

/** Los dos grados y radianes: el dato viaja en radianes, la pantalla se lee en grados. */
const aGrados = (rad) => Math.round(((rad ?? 0) * 180) / Math.PI)
const aRadianes = (deg) => (Number(deg) || 0) * Math.PI / 180

function dueloDe() {
  if (!mapa.duelo) mapa.duelo = {}
  return mapa.duelo
}

function salidasDe() {
  const d = dueloDe()
  if (!Array.isArray(d.salidas) || d.salidas.length !== 2) {
    // Dos y no una: un 1v1 sin dos sitios de salida es un mapa donde los dos
    // aparecen encima, que es exactamente el fallo que arregló la vuelta 66.
    const sala = scenarioRoom(mapa)
    const z = sala.depth / 2 - 4
    d.salidas = [{ x: 0, z, yaw: 0 }, { x: 0, z: -z, yaw: Math.PI }]
  }
  return d.salidas
}

/** Rellena la hoja de duelo desde el mapa. Se llama al abrir el panel, no por frame. */
function pintarDuelo() {
  $('solo-duelo').checked = Boolean(mapa.soloDuelo)
  $('fondo').value = mapa.fondo ?? ''
  // **Lo que este mapa no tiene se apaga, no se enseña vacío.** Un mapa de
  // entrenamiento no tiene salidas ni dotación —tiene un spawn y rutas—, y
  // unos campos en blanco ahí prometen algo que el juego va a ignorar, que es
  // el fallo del selector de la vuelta 67.
  $('duelo-campos').hidden = !mapa.soloDuelo

  const duelo = mapa.duelo ?? {}
  const salidas = Array.isArray(duelo.salidas) ? duelo.salidas : []
  for (const [i, prefijo] of ['s1', 's2'].entries()) {
    const s = salidas[i] ?? {}
    $(`${prefijo}-x`).value = s.x ?? ''
    $(`${prefijo}-z`).value = s.z ?? ''
    $(`${prefijo}-yaw`).value = s.yaw === undefined ? '' : aGrados(s.yaw)
  }
  $('caja-compra').value = duelo.cajaCompra?.ancho ?? ROUNDS.cajaCompra.ancho

  $('sin-economia').checked = Boolean(duelo.sinEconomia)
  $('dotacion-campos').hidden = !duelo.sinEconomia
  $('dotacion-arma').value = duelo.dotacion?.arma ?? Object.keys(PRIMARY_WEAPONS)[0]
  $('dotacion-escudo').checked = Boolean(duelo.dotacion?.chaleco)
  $('dotacion-casco').checked = Boolean(duelo.dotacion?.casco)

  const zona = mapa.spawnZone?.[0]
  for (const [id, valor] of [['zona-x', zona?.x], ['zona-z', zona?.z], ['zona-w', zona?.w], ['zona-d', zona?.d]]) {
    $(id).value = valor ?? ''
  }

  $('fisica-propia').checked = Boolean(mapa.fisica)
  $('fisica-campos').hidden = !mapa.fisica
  $('fis-gravedad').value = mapa.fisica?.gravity ?? MOVEMENT.gravity
  $('fis-salto').value = mapa.fisica?.jumpSpeed ?? MOVEMENT.jumpSpeed
  $('fis-aire').value = mapa.fisica?.airStrafeMaxSpeed ?? MOVEMENT.airStrafeMaxSpeed
  notaDeFisica()
}

/**
 * **Lo que un mapa construye con su física sale de ella, no del gusto** (vuelta
 * 72): en Los Pilares un salto sube 3.26 u, así que la torre mide 3.2. El
 * editor hace esa cuenta delante de ti en vez de dejarla para el papel.
 */
function notaDeFisica() {
  const g = Number($('fis-gravedad').value) || MOVEMENT.gravity
  const v = Number($('fis-salto').value) || MOVEMENT.jumpSpeed
  const apice = (v * v) / (2 * g)
  const vuelo = (2 * v) / g
  $('fisica-nota').textContent =
    `Con estos números un salto sube ${apice.toFixed(2)} u y dura ${(vuelo * 1000).toFixed(0)} ms. ` +
    `Una pieza de hasta ${(apice + 0.25).toFixed(1)} u se sube desde el suelo contando el escalón.`
}

campo('solo-duelo', () => {
  mapa.soloDuelo = $('solo-duelo').checked || undefined
  // Dos salidas en cuanto se declara mapa de duelo: un 1v1 **son** dos sitios
  // de salida, así que proponerlas no es adivinar, es la definición. Se ponen
  // en extremos opuestos y mirándose, que es lo único que no puede estar mal.
  if (mapa.soloDuelo) {
    salidasDe()
    const [a, b] = mapa.duelo.salidas
    if (!Number.isFinite(a.yaw) || !Number.isFinite(b.yaw)) {
      a.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z))
      b.yaw = Math.atan2(-(a.x - b.x), -(a.z - b.z))
    }
  }
  pintarDuelo()
})
campo('fondo', (v) => { mapa.fondo = FONDOS[v] ? v : undefined })

for (const [i, prefijo] of ['s1', 's2'].entries()) {
  for (const [sufijo, clave] of [['x', 'x'], ['z', 'z'], ['yaw', 'yaw']]) {
    campo(`${prefijo}-${sufijo}`, (v) => {
      const s = salidasDe()[i]
      s[clave] = clave === 'yaw' ? aRadianes(v) : (Number(v) || 0)
    })
  }
}

/**
 * **Que se miren no es un adorno**: es el fallo de la vuelta 66 resuelto de una
 * vez. Sin rumbo, el que sale en el sur aparece mirando a la pared del fondo, y
 * el rumbo correcto es una cuenta —`atan2` hacia la otra salida— que nadie
 * tiene por qué hacer a mano.
 */
$('s-mirarse').addEventListener('click', () => {
  anotarParaDeshacer()
  const [a, b] = salidasDe()
  // La cámara mira a −Z con yaw 0, o sea `forward = (−sin, −cos)`: el rumbo que
  // apunta de A a B es `atan2(−dx, −dz)`. Escribirlo al revés es el error de
  // 180° de la vuelta 60, aquí en forma de dos jugadores de espaldas.
  a.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z))
  b.yaw = Math.atan2(-(a.x - b.x), -(a.z - b.z))
  pintarDuelo()
  sucio = true
})

/**
 * **Las salidas se miden contra la geometría montada, no contra el dato.** Que
 * dos puntos estén a 32 u no dice nada si hay línea de visión entre ellos: lo
 * que un mapa de duelo tiene que garantizar es que la ronda **no empiece
 * resuelta** (vuelta 66).
 */
$('s-medir').addEventListener('click', () => {
  const [a, b] = salidasDe()
  const dist = Math.hypot(b.x - a.x, b.z - a.z)
  let seVen = null
  if (escenario) {
    // Los ojos a la altura de siempre, y el mismo rayo que usa la aparición.
    const ojos = 1.7
    seVen = hasLineOfSight(
      new THREE.Vector3(a.x, ojos, a.z),
      new THREE.Vector3(b.x, ojos, b.z),
      escenario.occluders,
    )
  }
  $('s-medida').textContent =
    `${dist.toFixed(1)} u entre salidas` +
    (seVen === null ? '' : seVen
      ? ' · SE VEN: la ronda empieza resuelta, mete algo en medio'
      : ' · sin línea de visión entre ellas')
  $('s-medida').className = `nota ${seVen ? 'aprieta' : 'cabe'}`
})

campo('caja-compra', (v) => {
  const lado = Math.max(Number(v) || 0, 1)
  dueloDe().cajaCompra = { ancho: lado, fondo: lado }
})

campo('sin-economia', () => {
  const d = dueloDe()
  d.sinEconomia = $('sin-economia').checked || undefined
  // **Sin economía y sin dotación se sale con la pistola y nada más**, que no
  // es lo que nadie quiere decir al marcar esa casilla. Se propone una y el
  // saneado se queja si se quita.
  if (d.sinEconomia && !d.dotacion) {
    d.dotacion = { arma: Object.keys(PRIMARY_WEAPONS)[0], chaleco: true, casco: false }
  }
  pintarDuelo()
})

for (const [id, clave] of [['dotacion-arma', 'arma'], ['dotacion-escudo', 'chaleco'], ['dotacion-casco', 'casco']]) {
  campo(id, (v) => {
    const d = dueloDe()
    if (!d.dotacion) d.dotacion = { arma: Object.keys(PRIMARY_WEAPONS)[0], chaleco: false, casco: false }
    d.dotacion[clave] = clave === 'arma' ? v : $(id).checked
  })
}

/**
 * **La zona de aparición es una caja, no una bolsa** (vuelta 43): la regla es
 * «de la línea del muro hacia atrás no aparece nadie». Se declara con la misma
 * convención que una pieza —esquina mínima, ancho y fondo— justo para que no
 * haya dos vocabularios de área en el mismo fichero.
 */
for (const [id, clave] of [['zona-x', 'x'], ['zona-z', 'z'], ['zona-w', 'w'], ['zona-d', 'd']]) {
  campo(id, (v) => {
    if (!mapa.spawnZone?.length) mapa.spawnZone = [{ x: 0, z: 0, w: 0, d: 0 }]
    mapa.spawnZone[0][clave] = Number(v) || 0
  })
}
$('zona-quitar').addEventListener('click', () => {
  anotarParaDeshacer()
  mapa.spawnZone = []
  pintarDuelo()
  sucio = true
})

/**
 * **Giro de 180°, no espejo** (vuelta 66), y aquí se ve por qué en un clic:
 * dibujas media sala y el botón pone la otra. Con un espejo cada jugador
 * tendría la esquina estrecha por un lado distinto, o sea un mapa distinto para
 * cada uno; con el giro, **la vista de uno es la del otro**.
 *
 * Lo que va **centrado en el origen no se duplica**: su copia girada caería
 * encima de sí misma, y eso son dos mallas en el mismo sitio — que no se ve y
 * se paga en cada frame.
 */
$('giro-aplicar').addEventListener('click', () => {
  const centradas = mapa.boxes.filter((p) => enElOrigen(p))
  const aGirar = mapa.boxes.filter((p) => !enElOrigen(p))
  anotarParaDeshacer()
  mapa.boxes = [...giro180(aGirar), ...centradas]
  seleccion = -1
  sucio = true
  refrescarPanel()
  contar([], `giradas ${aGirar.length} · ${centradas.length} centrada(s) no se duplican`)
})

/** Centrada en el origen: su giro se solaparía consigo misma. */
function enElOrigen(p) {
  return Math.abs(p.x + p.w / 2) < 0.001 && Math.abs(p.z + p.d / 2) < 0.001
}

/**
 * **La simetría se comprueba, no se supone** (`mapa66`). Escribir dos veces
 * cada caja es escribir la ocasión de que una se quede a media unidad de su
 * pareja, y media unidad es una esquina que existe para uno y no para el otro.
 */
$('giro-comprobar').addEventListener('click', () => {
  const huerfanas = []
  for (const p of mapa.boxes) {
    if (enElOrigen(p)) continue
    const pareja = mapa.boxes.find((q) => (
      Math.abs(q.x + (p.x + p.w)) < 0.001 && Math.abs(q.z + (p.z + p.d)) < 0.001 &&
      Math.abs(q.w - p.w) < 0.001 && Math.abs(q.d - p.d) < 0.001 &&
      coverHeight(q.kind) === coverHeight(p.kind)
    ))
    if (!pareja) huerfanas.push(p)
  }
  const nodo = $('giro-nota')
  nodo.className = `nota ${huerfanas.length ? 'aprieta' : 'cabe'}`
  nodo.textContent = huerfanas.length
    ? `${huerfanas.length} pieza(s) sin pareja girada: ${huerfanas.slice(0, 4).map((p) => `${p.w}×${p.d} @ ${p.x},${p.z}`).join(' · ')}`
    : `Las ${mapa.boxes.length} piezas tienen su pareja girada.`
})

campo('fisica-propia', () => {
  if ($('fisica-propia').checked) {
    mapa.fisica = mapa.fisica ?? {
      gravity: MOVEMENT.gravity,
      jumpSpeed: MOVEMENT.jumpSpeed,
      airStrafeMaxSpeed: MOVEMENT.airStrafeMaxSpeed,
    }
  } else {
    delete mapa.fisica
  }
  pintarDuelo()
})

for (const [id, clave] of [['fis-gravedad', 'gravity'], ['fis-salto', 'jumpSpeed'], ['fis-aire', 'airStrafeMaxSpeed']]) {
  campo(id, (v) => {
    if (!mapa.fisica) return
    mapa.fisica[clave] = Math.max(Number(v) || 0, 0.1)
    notaDeFisica()
  })
}

// ---------------------------------------------------------------- el panel

/**
 * **El panel flota y se abre con ESPACIO** (vuelta 77).
 *
 * Era una barra lateral fija de 300 px, y eso tenía dos precios que se pagaban
 * a la vez: **el mapa se mira desde fuera** y un tercio del ancho no estaba
 * mirándolo, y sobre todo que este panel va a crecer con cada fase — la fase 3
 * le añade salidas, zonas, simetría, física y dotación—. Una columna que crece
 * hasta salirse de la ventana es exactamente lo que le pasó al menú del duelo,
 * que estuvo tres vueltas con los botones de abajo fuera de la pantalla
 * (`menu62`).
 *
 * Tres reglas que son el diseño:
 *
 * - **Lo que se lee siempre no está aquí dentro.** La barra de arriba lleva el
 *   mapa, las piezas, el presupuesto y el estado. Un panel que hay que abrir
 *   para saber cuántas piezas llevas es un panel que se deja abierto, y
 *   entonces no era flotante.
 * - **Pestañas, no una columna.** Cinco hojas y no diez secciones apiladas:
 *   con la fase 3 la columna medía dos pantallas.
 * - **Y ESPACIO es del editor.** El juego salta con ESPACIO, pero esta página
 *   no comparte binds con el juego (es la misma regla que la **G** del vuelo)
 *   y el panel **no se abre jugando**: con el motor montado, esa tecla es del
 *   motor y aquí no se mira.
 */
/**
 * **El panel se rellena al abrirlo, no por frame.** Está cerrado casi todo el
 * tiempo y sus campos no cambian solos: pintarlos sesenta veces por segundo
 * sería la regla del HUD (cero repintado por frame) rota por comodidad.
 */
function refrescarPanel() {
  pintarPanel()
  pintarDuelo()
}

function panelAbierto() { return !$('telon').hidden }

function abrirPanel(abrir = true) {
  if (motor) return
  $('telon').hidden = !abrir
  // Volar con el panel puesto sería mover la cámara a ciegas detrás de él.
  if (abrir) { teclasCamara.clear(); sobreLaVista = false }
  if (abrir) refrescarPanel()
}

$('abrir-panel').addEventListener('click', () => abrirPanel(true))
$('cerrar-panel').addEventListener('click', () => abrirPanel(false))

// Un clic **en el telón y no en el panel** cierra. El telón se lo come, que es
// para lo que está: sin él llegaría al lienzo y movería una pieza.
$('telon').addEventListener('pointerdown', (evento) => {
  if (evento.target === $('telon')) abrirPanel(false)
})

for (const boton of document.querySelectorAll('#pestanas button')) {
  boton.addEventListener('click', () => elegirPestana(boton.dataset.pestana))
}

function elegirPestana(cual) {
  for (const boton of document.querySelectorAll('#pestanas button')) {
    boton.classList.toggle('puesta', boton.dataset.pestana === cual)
  }
  for (const hoja of document.querySelectorAll('.hoja')) {
    hoja.hidden = hoja.dataset.hoja !== cual
  }
}

window.addEventListener('keydown', (evento) => {
  if (evento.code !== 'Space' || motor) return
  /**
   * **Escribiendo, ESPACIO es un espacio.** En un botón, en cambio, se
   * intercepta a propósito: ESPACIO activa el botón que tenga el foco, y con
   * una pestaña recién pulsada eso convertiría la tecla del panel en «vuelve a
   * pulsar lo último». Aquí ESPACIO significa **el panel**, siempre.
   */
  if (document.activeElement?.matches('input:not([type=checkbox]), textarea, select')) return
  evento.preventDefault()
  abrirPanel(!panelAbierto())
})

// Escape cierra el panel antes que nada. Jugando no puede estar abierto, así
// que no se pelea con el Escape que vuelve de «probar».
window.addEventListener('keydown', (evento) => {
  if (evento.code === 'Escape' && panelAbierto()) { evento.preventDefault(); abrirPanel(false) }
})

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
  get plantados() { return plantados },
  coverHeight,
  cargar,
  colocar,
  elegir,
  sanear: () => sanearMapa(mapa),
  probar,
  dejarDeProbar,
}
