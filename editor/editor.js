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
import { CLAVES_INTEGRADAS, COLORS, MODOS_DE_MAPA, MODOS_MULTIJUGADOR, modosDeMapa, COVER, FANS, FONDOS, GIZMO, MOVEMENT, ESCALERAS, ESTAMPADOS, PRIMARY_WEAPONS, PRISMAS, ROUNDS, SCENARIOS, SURFACES, TARGET, TEAMS, TELEPORTS, TODOS, TUBES, ZIPLINES, PEANAS, WEAPONS, CATEGORIA_DE_RANURA, ECONOMY, capacidadDeTodos, coverHeight, coverTintedColor, esFotoDeFondo, esImagenDeEstampado, fisicaDeEscenario, giro180, rangoDeJugadores, scenarioRoom } from '../src/config.js'
import { Avatar } from '../src/game/avatar.js'
import { Engine } from '../src/game/engine.js'
import { MovementController } from '../src/game/movement.js'
import { Scenario } from '../src/game/scenario.js'
import { createScene } from '../src/game/scene.js'
import { hasLineOfSight } from '../src/game/sight.js'
import { INVULNERABILIDAD_MAX, SALA, mapaComoModulo, mapaNuevo, sanearMapa } from '../src/maps/formato.js'
import { puntosDePrisma } from '../src/maps/prisma.js'
import { cajasDeTubo } from '../src/maps/tubo.js'
import { cajasDeEscalera, medidasDeEscalera } from '../src/maps/escalera.js'
import { envolventeDePrisma } from '../src/maps/prisma.js'
import { montarCapaDeDuelo } from '../src/ui/duelo.jsx'
import { MODOS_DE_ARMAS, NOMBRE_DE_MODO, armasMarcables, reglasDeMapa } from '../src/game/arsenal.js'
import { geometriaDeArma } from '../src/game/peanas.js'
import { LOGO } from '../src/ui/logoPaths.js'
import { getKeybinds, keyLabel, keysOf } from '../src/keybinds.js'

const $ = (id) => document.getElementById(id)

// ---------------------------------------------------------------- estado

/** El mapa que se está editando. Es una definición de escenario, sin más. */
let mapa = mapaNuevo()
/** Índice de la pieza seleccionada, o −1. */
let seleccion = -1
/**
 * **Lo que está elegido cuando no es una pieza** (vuelta 78): una salida, la
 * zona de aparición o una caja de compra. Es excluyente con `seleccion` a
 * propósito —sólo se edita una cosa a la vez— y por eso se escriben juntos.
 */
let marcaElegida = null
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
 * **El borrador sabe de qué versión del disco salió** (vuelta 99), y por eso no
 * pisa lo que ha cambiado debajo.
 *
 * Era una de las dos puertas por las que `spawnZone` de Largo y Puerta volvía a
 * `z:16, d:4` en el PC de Yago. Dos cosas, y las dos hacían falta:
 *
 * - **Se escribía con sólo abrir un mapa**, sin tocarlo: el primer frame lo
 *   remonta y remontar anotaba el borrador. O sea que el borrador era «el
 *   último mapa que abriste», con lo que tuviera ese día.
 * - **Y al volver se abría por delante del fichero**, aunque el fichero
 *   hubiera cambiado después —por git, por otro PC, por un conflicto resuelto a
 *   mano—. Lo que se tenía delante era la copia vieja entera, y cualquier
 *   guardado la escribía encima de la nueva.
 *
 * Ahora el borrador guarda **el mapa y su base** —lo que había en el disco al
 * abrirlo— y sólo se escribe si el mapa se aparta de esa base. Al volver, si el
 * disco ya no es esa base, no se abre solo: se aparta (`APARTADO`) y la hoja de
 * Archivo ofrece abrirlo o tirarlo. Un borrador de antes de la 99 no sabe su
 * base, así que se aparta siempre: es justo el que puede traer lo viejo.
 */
const APARTADO = 'vektor.editor.borrador-apartado.v1'
/** Lo que había en el disco cuando se abrió lo que hay delante, como texto. */
let base = ''

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

const { scene, setRoom, setMuros } = createScene()
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

/**
 * **Lo que se dibuja y lo que se mide son dos cosas en cuanto algo se puede
 * ocultar** (vuelta 96), y esto es la línea que lo dice.
 *
 * `escenario` es el que está en la escena, y con el ojo puesto le faltan piezas.
 * De él colgaban además **dos medidas**: el denominador del presupuesto —«0.0031
 * ms con 40 piezas»— y la línea de visión entre las dos salidas de un mapa de
 * duelo. Las dos leídas del filtrado dirían lo que el editor está dibujando y no
 * lo que el mapa tiene, o sea que ocultar una pieza **bajaría el presupuesto** y
 * podría cambiar un «SE VEN» por un «sin línea de visión»: una medida que miente
 * por un ajuste de vista, que es el fallo de la vuelta 67 en un instrumento.
 *
 * Así que las dos leen `escenarioMedido`, que es el del mapa entero. **Sin nada
 * oculto son el mismo objeto**, así que el camino normal no monta nada de más ni
 * puede divergir; con algo oculto se monta un segundo sobre una escena de
 * mentira, que no dibuja.
 */
let escenarioMedido = null
/** Cajas invisibles, una por pieza, **sólo para poder pinchar**. */
const proxies = new THREE.Group()
scene.add(proxies)

/**
 * **Lo que sólo se ve construyendo** (vuelta 96): hoy, el contorno de una
 * barrera invisible. Es un grupo aparte de `proxies` porque no se pincha y
 * aparte de las marcas porque no es un gizmo — es la pieza, dibujada aquí porque
 * el juego a propósito no la dibuja.
 */
const fantasmas = new THREE.Group()
scene.add(fantasmas)
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

/**
 * **Todo lo configurable se coloca viendo el efecto** (vuelta 78).
 *
 * Es la convención permanente de Alchemist, y esta sección es lo que la
 * cumple: las salidas, la zona de aparición y las cajas de compra **son cosas
 * de la rejilla** —se arrastran, se imantan, se estiran por una esquina— y los
 * campos numéricos del panel se escriben solos mientras las mueves.
 *
 * Por qué, y no es de gusto: la mayoría de quien vaya a usar esto no ha
 * construido nunca en 3D, y un campo «Salida 2 · Z: −16» no dice **dónde** cae
 * eso hasta que se prueba el mapa. Un número sin representación es una barrera
 * de entrada, no una interfaz austera.
 *
 * Tres reglas:
 *
 * - **El dibujo sale del dato, no al revés.** Lo que se pinta aquí es
 *   `duelo.salidas`, `spawnZone` y `duelo.cajaCompra` tal cual: mover el cono
 *   escribe en el mapa y volver a pintar lo lee de ahí. Un estado intermedio
 *   «la posición del gizmo» sería una segunda verdad que se despega.
 * - **Mismo gesto que una pieza.** Arrastrar mueve, la rejilla cuadra y los
 *   candados no aplican porque estas cosas no tienen `kind`. Aprender a colocar
 *   una caja tiene que servir para colocar una salida.
 * - **Y no son geometría.** Fuera de `Scenario`, fuera de los oclusores y fuera
 *   del presupuesto: son ayudas de autor, como los láseres.
 */
const marcas = new THREE.Group()
scene.add(marcas)

/** Los colores de equipo del juego, que son los que se ven jugando. */
const COLORES_SALIDA = Object.values(TEAMS).map((t) => t.color)
const colorDeSalida = (i) => COLORES_SALIDA[i % COLORES_SALIDA.length]
/**
 * **Las del todos contra todos, en blanco** (vuelta 100). No son de ningún
 * equipo —en ese modo todos los rivales son del mismo color (propuesta 11 §1)—
 * y un mapa puede tener las dos listas a la vez: con el mismo azul y magenta,
 * no se sabría cuál es cuál.
 */
const COLOR_TODOS = 0xe8e8e8

/**
 * Radio del tirador de una esquina. Lo bastante gordo para pillarlo con el
 * ratón, y **más fino desde la vuelta 93** (0.45 → 0.34): la otra mitad de que
 * un tirador no tape la pieza es que no sea un cubo de medio metro. Lo que lo
 * acota de verdad es `GIZMO.fraccionDePieza`, ahí al lado.
 */
const TIRADOR = 0.34

/**
 * **Qué gana cuando el rayo toca varias cosas a la vez** (vuelta 78).
 *
 * No se puede decidir por distancia: un área es un volumen de cuarenta
 * unidades de lado y **contiene** los conos y las piezas que hay dentro, así
 * que mirando desde arriba su cara superior está siempre delante. Con la
 * distancia sola, la banda de aparición de El Espejo se comía el clic de sus
 * dos salidas y de todas las piezas de esa mitad del mapa.
 *
 * El orden es el del tamaño del gesto: un tirador es un cubo de medio metro y
 * pincharlo es intencionado; un área ocupa media sala y pincharla es lo que
 * pasa cuando no querías nada más.
 */
const PRIORIDAD = { tirador: 3, cuerpo: 2, pieza: 1, area: 0 }

/**
 * **Cuánto se agarra un aro de giro a cada lado de su trazo**, en unidades de
 * mundo. El trazo mide 0.05-0.06, así que esto es lo que lo hace pinchable (la
 * lección de la vuelta 93) sin convertirlo en un disco que tape lo que rodea
 * (la de la 96). Sale de la misma escala que los tiradores: media unidad es más
 * que el radio de un tirador y bastante menos que el aro más pequeño que se
 * dibuja.
 */
const ARO_AGARRE = 0.5

/**
 * **Lo que se pincha de una pieza es la pieza** (vuelta 96), y el material es
 * uno para todas: una malla invisible no se dibuja, así que no cuesta nada.
 */
const materialVolumen = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })

/**
 * **Un volumen invisible que hace pinchable lo que se ve de un elemento.**
 *
 * Es la pieza que faltaba para que todo lo colocable se comporte igual. Una caja
 * tiene su proxy desde la vuelta 76 (`proxies`) y por eso se arrastra pinchándola;
 * una rampa, una escalera, un prisma y un estampado sólo tenían **una bolita de
 * alambre de 0.42 en su centro** como cuerpo, y su geometría de verdad vive
 * fundida dentro de `Scenario`, que no se raycastea. O sea que arrastrarlos era
 * dar con esa bola, y un clic sobre la pieza no elegía nada.
 *
 * Va a **`PRIORIDAD.pieza`** y no a `cuerpo`: así compite con las cajas por
 * distancia, como una caja con otra, y los tiradores y las bolas siguen ganando
 * —que es lo que hace que estirar por una esquina siga funcionando con la pieza
 * debajo—.
 */
function volumenPinchable(geometria, marca, grupo) {
  const malla = new THREE.Mesh(geometria, materialVolumen)
  malla.userData.marca = { ...marca, prioridad: PRIORIDAD.pieza }
  grupo.add(malla)
  pinchables.push(malla)
  return malla
}

/**
 * **La cuña de una rampa**, para pincharla por donde se ve y no por su caja
 * envolvente: con una caja, el aire de encima del plano inclinado elegiría la
 * rampa, y eso es peor que no poder pincharla —un clic en el vacío tiene que
 * deseleccionar—. Seis vértices y ocho triángulos; el sentido de giro da igual
 * porque el material es `DoubleSide` y esto no se dibuja.
 */
function geometriaDeCuna(rampa, alto) {
  const enX = rampa.fromX !== undefined
  const x0 = Math.min(rampa.x, rampa.x + rampa.w)
  const x1 = Math.max(rampa.x, rampa.x + rampa.w)
  const z0 = Math.min(rampa.z, rampa.z + rampa.d)
  const z1 = Math.max(rampa.z, rampa.z + rampa.d)
  const desde = enX ? rampa.fromX : rampa.fromZ
  const hasta = enX ? rampa.toX : rampa.toZ
  // El extremo alto es `hasta`; si la rampa baja, el alto está en el mínimo.
  const sube = hasta >= desde
  const v = []
  if (enX) {
    const bajo = sube ? x0 : x1
    const arriba = sube ? x1 : x0
    v.push(bajo, 0, z0, bajo, 0, z1, arriba, 0, z1, arriba, 0, z0, arriba, alto, z1, arriba, alto, z0)
  } else {
    const bajo = sube ? z0 : z1
    const arriba = sube ? z1 : z0
    v.push(x0, 0, bajo, x1, 0, bajo, x1, 0, arriba, x0, 0, arriba, x1, alto, arriba, x0, alto, arriba)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  geo.setIndex([
    0, 1, 2, 0, 2, 3, // el suelo
    0, 1, 4, 0, 4, 5, // el plano inclinado
    3, 2, 4, 3, 4, 5, // el frente alto
    0, 5, 3, 1, 2, 4, // los dos costados
  ])
  return geo
}

/**
 * **Los tiradores de la pieza elegida** (vuelta 79).
 *
 * Hasta aquí una caja se movía arrastrándola y se redimensionaba **escribiendo
 * dos números en el panel**, que es exactamente la barrera de entrada que la
 * convención de la 78 viene a quitar: «Ancho 4.5» no dice *hasta dónde llega*
 * hasta que se prueba el mapa.
 *
 * **Y no es `TransformControls`**, que es lo primero que se miró porque es la
 * herramienta del motor para esto. Medido contra una pieza de verdad
 * (`tc79`), no encaja en cuatro sitios y los cuatro son el modelo de datos:
 *
 * - **Mueve el origen de un objeto; el dato es la esquina mínima.** El proxy de
 *   la pieza 0 del Plano A está en x −7.4 y la pieza empieza en −8. Su
 *   `translationSnap` cuadra el **centro**: con ancho 1.2, cuadrar el centro a
 *   1 u deja la esquina en −7.6, o sea fuera de la rejilla. La rejilla del
 *   editor cuadra lo que el fichero declara, que es la esquina.
 * - **Su `scaleSnap` cuadra el factor, no el tamaño.** Un factor de 1.4 sobre
 *   anchos de 1.2, 4.5 y 3.5 da 1.68, 6.3 y 4.9: tres tamaños y ninguno en la
 *   rejilla. Lo que hay que cuadrar es el resultado.
 * - **Escalar es simétrico.** Tirando de un lado se mueven **las dos caras**
 *   (medido: la cara mínima pasa de −8 a −8.3), y tirar de una esquina es
 *   justo lo contrario: la opuesta se queda clavada.
 * - **Y sus manijas no están en la caja.** Van en el origen y a tamaño de
 *   pantalla: el mismo gizmo sobre una pieza de 1.2 u y sobre una de 38. Lo que
 *   se pidió —«arrastrar desde una esquina»— no es lo que dibuja.
 *
 * Con manijas en las esquinas, además, **no hacen falta modos**: mover es
 * arrastrar el cuerpo y estirar es arrastrar una esquina. El conmutador de
 * UEFN existe porque su gizmo vive en el origen y ahí los tres gestos son el
 * mismo; aquí serían un estado más que recordar para no ganar nada.
 */
const gizmoPieza = new THREE.Group()
scene.add(gizmoPieza)

/** Lo que se puede pinchar de la pieza elegida. Plano, como `pinchables`. */
const tiradoresDePieza = []

/** Las cuatro esquinas en planta, en el orden (x,z), (x+w,z), (x+w,z+d), (x,z+d). */
const ESQUINAS = [[0, 0], [1, 0], [1, 1], [0, 1]]

const COLOR_GIZMO = 0x2fcb82

function nuevoTirador(marca, malla) {
  malla.userData.marca = { ...marca, prioridad: PRIORIDAD.tirador }
  gizmoPieza.add(malla)
  tiradoresDePieza.push(malla)
  return malla
}

/**
 * **Las esquinas son tejas, no cubos** (vuelta 93). Se agarran mirando el mapa
 * desde arriba, que es de donde se construye, así que lo que hace falta es
 * huella y no volumen: achatada a la mitad tapa la mitad del alzado de la pieza
 * y se pincha exactamente igual.
 */
for (const [i] of ESQUINAS.entries()) {
  nuevoTirador(
    { que: 'pieza-esquina', esquina: i },
    new THREE.Mesh(
      new THREE.BoxGeometry(TIRADOR, TIRADOR * 0.5, TIRADOR),
      new THREE.MeshBasicMaterial({ color: COLOR_GIZMO }),
    ),
  )
}

/**
 * **El alto se arrastra, y cae en el escalón más cercano.** El alto de una
 * pieza no es un número libre: es una palabra de `COVER.heights`, porque la
 * rampa de grises y el vocabulario de cobertura salen de ahí. Así que el
 * tirador no estira, **elige**: sube y baja y se queda en el escalón que le
 * pille más cerca, que es lo único que el dato admite.
 */
const tiradorAlto = nuevoTirador(
  { que: 'pieza-alto' },
  new THREE.Mesh(
    new THREE.BoxGeometry(TIRADOR * 1.6, TIRADOR * 0.5, TIRADOR * 1.6),
    new THREE.MeshBasicMaterial({ color: COLOR_GIZMO }),
  ),
)

/**
 * **Y el giro es un gesto, aunque sólo tenga cuatro posiciones.** La colisión
 * es AABB, así que lo único que un giro puede significar aquí es intercambiar
 * ancho y fondo; el aro se arrastra en redondo y **cuadra a 90°**, de modo que
 * lo que se ve girar es exactamente lo que el motor va a saber chocar. Un aro
 * libre dibujaría una caja girada que pararía las balas bien y se chocaría sin
 * girar, que es lo que la vuelta 74 dejó escrito que no se hace.
 */
const tiradorGiro = nuevoTirador(
  { que: 'pieza-giro' },
  // **Lo que se pincha no es el aro: es una bola invisible detrás.** Un toro
  // tiene el centro hueco, así que apuntarle a su centro —que es donde
  // cualquiera apunta— era un clic que se colaba por el agujero y
  // deseleccionaba la pieza. Es la misma idea que los `picker` de
  // `TransformControls`: se dibuja una forma y se pincha otra.
  new THREE.Mesh(
    new THREE.SphereGeometry(TIRADOR * 0.95, 8, 6),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  ),
)
const aroDeGiro = new THREE.Mesh(
  new THREE.TorusGeometry(TIRADOR * 0.8, TIRADOR * 0.22, 6, 12),
  new THREE.MeshBasicMaterial({ color: COLOR_GIZMO }),
)
aroDeGiro.rotation.x = Math.PI / 2
tiradorGiro.add(aroDeGiro)

/**
 * **Escalar la pieza entera manteniendo la proporción** (vuelta 93).
 *
 * Los cuatro tiradores de esquina estiran en planta y el de arriba elige
 * escalón, así que hacer una caja el doble de grande eran tres gestos y el
 * resultado no salía proporcionado. Éste es uno.
 *
 * Tres cosas que son el diseño:
 *
 * - **Va en la esquina máxima en 3D** —(x+w, alto, z+d)—, que es el vértice del
 *   volumen entero, y **clava la mínima**, exactamente igual que un tirador de
 *   esquina clava la opuesta. Así el gesto es el mismo que ya se sabe hacer, con
 *   un grado más.
 * - **La forma lo separa de todo lo demás** (la regla de la vuelta 67): una
 *   bola. Cubo achatado es una esquina, teja arriba es el alto, aro es el giro.
 *   El color no dice nada porque los cinco son el mismo verde.
 * - **Y el alto no se escala libre: cae al escalón más cercano.** El alto de
 *   una pieza es una palabra de `COVER.heights` (vuelta 79) y eso no se toca
 *   aquí: lo que hace este tirador es multiplicar el alto por el mismo factor
 *   que el ancho y quedarse con el escalón que le pille. O sea que la
 *   proporción es exacta en planta y **la más cercana que el vocabulario
 *   admite** en vertical. Un alto libre sería una segunda forma de decir cuánto
 *   mide una pieza, y con ella se cae la rampa de grises.
 */
const tiradorUniforme = nuevoTirador(
  { que: 'pieza-uniforme' },
  new THREE.Mesh(
    new THREE.SphereGeometry(TIRADOR * 0.62, 10, 8),
    new THREE.MeshBasicMaterial({ color: COLOR_GIZMO }),
  ),
)

/**
 * **Los tiradores se ven igual de lejos que de cerca**, que es lo único que
 * merecía la pena copiarle a `TransformControls`: un cubo de 0.45 u a ochenta
 * unidades son tres píxeles, o sea una manija que no se puede agarrar justo
 * cuando hace falta mirar el mapa entero. Va por frame y no en el repintado
 * porque la rueda mueve la cámara sin tocar el mapa.
 */
/**
 * **Y no más grandes que la pieza que agarran** (vuelta 93). La escala de
 * cámara conserva el tamaño en pantalla, que es correcto y es la mitad: sobre
 * una plataforma de dispositivo —1 u de lado y 0.2 de alto— los seis tiradores
 * tapaban la pieza, así que seleccionarla y moverla era pinchar un tirador. Se
 * acota contra **la dimensión más corta**, con suelo para que el tope de arriba
 * siga pudiéndose agarrar.
 *
 * Se escribe una vez porque lo miran los dos: quien los escala por frame y
 * quien los coloca al repintar —el aro va separado de la caja y ese hueco se
 * mide en tiradores—.
 */
function escalaDeGizmo(pieza) {
  const camara = Math.min(Math.max(orbita.radio / GIZMO.distanciaDeReferencia, 1), GIZMO.escalaMax)
  if (!pieza) return camara
  const alto = coverHeight(pieza.kind) - (pieza.base ? coverHeight(pieza.base) : 0)
  const corta = Math.min(pieza.w, pieza.d, alto)
  const cabe = (corta * GIZMO.fraccionDePieza) / TIRADOR
  return Math.max(Math.min(camara, cabe), GIZMO.escalaMin)
}

function escalarGizmoDePieza() {
  if (!gizmoPieza.visible) return
  const k = escalaDeGizmo(mapa.boxes[seleccion])
  for (const t of tiradoresDePieza) t.scale.setScalar(k)
}

/** Coloca los tiradores sobre la pieza elegida. Sale de `pintarContorno`. */
function pintarGizmoDePieza(pieza) {
  gizmoPieza.visible = Boolean(pieza)
  if (!pieza) return
  const alto = coverHeight(pieza.kind)
  const base = pieza.base ? coverHeight(pieza.base) : 0
  const k = escalaDeGizmo(pieza)
  for (const [i, [ex, ez]] of ESQUINAS.entries()) {
    gizmoPieza.children[i].position.set(pieza.x + ex * pieza.w, base + 0.1, pieza.z + ez * pieza.d)
  }
  tiradorAlto.position.set(pieza.x + pieza.w / 2, alto, pieza.z + pieza.d / 2)
  // La esquina máxima en 3D: el vértice del volumen, que es lo que se escala.
  tiradorUniforme.position.set(pieza.x + pieza.w, alto, pieza.z + pieza.d)
  // El aro va fuera de la caja, a media altura: dentro se confundiría con ella.
  // El hueco va **escalado**, o de lejos el aro se mete dentro de la pieza.
  tiradorGiro.position.set(
    pieza.x + pieza.w / 2,
    base + (alto - base) / 2,
    pieza.z + pieza.d + TIRADOR * 2 * k,
  )
}

/** Lo que se tira al repintar los marcadores. Materiales incluidos: son por marca. */
function limpiarMarcas() {
  for (const hijo of [...marcas.children]) {
    hijo.traverse?.((o) => {
      o.geometry?.dispose?.()
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose())
      else o.material?.dispose?.()
    })
    marcas.remove(hijo)
  }
}

/**
 * **Cómo se realza lo elegido, y por qué no hay una sola forma** (vuelta 79).
 *
 * Había una: subir la opacidad a 1 y escalar 1.35. Eso vale para un tirador
 * —un cubo de medio metro que además se agarra mejor cuando crece— y es un
 * fallo en un área, por dos motivos a la vez:
 *
 * - **Un área opaca tapa lo que contiene.** La banda de aparición envuelve a su
 *   spawner, así que elegirla lo hacía desaparecer; y como la elección
 *   sobrevive a los repintados, el efecto parecía aleatorio —«a veces está
 *   opaca»— y se curaba guardando, que es lo único que recarga la página y
 *   limpia la elección.
 * - **Y un área que crece deja de ser el dato.** Escalar el relleno un 35%
 *   dibuja una banda que no es la que el mapa declara, que es justo lo que la
 *   convención de la 78 prohíbe: el dibujo sale del dato, no al revés.
 *
 * Así que cada marcador **declara su realce donde se crea**. Un tirador crece;
 * un área **se aclara sin dejar de ser translúcida** y enciende sus aristas,
 * que es lo que se puede hacer con una caja hueca sin esconder su contenido.
 */
const REALCE_AREA_MAX = 0.22
const ARISTA_NORMAL = 0.55

/** Realce de lo que se agarra: crece, que además lo hace más fácil de pillar. */
function realceQueCrece(objeto) {
  objeto.userData.realce = (puesta) => objeto.scale.setScalar(puesta ? 1.35 : 1)
  return objeto
}

/** Una caja translúcida con su arista marcada: lo que se lee como «área». */
function cajaDeArea(w, d, alto, color, opacidad) {
  const grupo = new THREE.Group()
  const geo = new THREE.BoxGeometry(w, alto, d)
  const relleno = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: opacidad,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  grupo.add(relleno)
  const aristas = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: ARISTA_NORMAL }),
  )
  grupo.add(aristas)

  // **Se aclara, con tope, y nunca se escala.** El tope es lo que garantiza que
  // por mucho que se realce se siga viendo lo que hay dentro.
  relleno.userData.realce = (puesta) => {
    relleno.material.opacity = puesta ? Math.min(opacidad * 2.2, REALCE_AREA_MAX) : opacidad
    aristas.material.opacity = puesta ? 1 : ARISTA_NORMAL
  }
  return { grupo, relleno, aristas }
}

/**
 * **Hacia dónde mira cada cara de un estampado**, escrito una vez. Tiene que
 * decir lo mismo que `src/game/estampados.js` o el editor colocaría el logo en
 * una pared y el juego lo pondría en otra; se escribe aquí porque el módulo del
 * motor no exporta su tabla y **una tabla exportada para un editor es una puerta
 * al motor** — lo que sí guarda que digan lo mismo es `estampado93`, que compara
 * las dos.
 */
/** Cómo se dice al lado de cada cara hacia dónde da, para el desplegable. */
const RUMBO_DE_CARA = {
  norte: 'hacia −Z', sur: 'hacia +Z', este: 'hacia +X',
  oeste: 'hacia −X', suelo: 'hacia arriba', techo: 'hacia abajo',
}

const CARAS_DE_ESTAMPADO = {
  norte: { rotacion: [0, Math.PI, 0] },
  sur: { rotacion: [0, 0, 0] },
  este: { rotacion: [0, Math.PI / 2, 0] },
  oeste: { rotacion: [0, -Math.PI / 2, 0] },
  suelo: { rotacion: [-Math.PI / 2, 0, 0] },
  techo: { rotacion: [Math.PI / 2, 0, 0] },
}

/** Uno solo para todos los estampados del mapa. */
let cargadorDeTexturas = null

/**
 * **Una flecha tumbada, de A a B.** Dice hacia dónde se sube una rampa o una
 * escalera, que es lo único de las dos que no se lee en su huella: en planta,
 * una rampa que sube al norte y una que baja al norte son el mismo rectángulo.
 *
 * Es sólo dibujo: no se pincha (la dirección se cambia con el aro) y no entra en
 * `pinchables`. Va en triángulos y no en líneas porque en WebGL el grosor de una
 * línea no se toca, que es lo que ya se midió con el contorno de la brújula en
 * la vuelta 41 y con las marcas de superficie en la 82.
 */
function flechaDeSuelo(x0, z0, x1, z1, y) {
  const grupo = new THREE.Group()
  const dx = x1 - x0
  const dz = z1 - z0
  const largo = Math.hypot(dx, dz)
  if (largo < 1e-6) return grupo
  const material = new THREE.MeshBasicMaterial({
    color: COLOR_GIZMO, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
  })
  const ancho = Math.min(0.5, largo * 0.18)
  const cuerpo = new THREE.Mesh(new THREE.PlaneGeometry(largo * 0.72, ancho * 0.45), material)
  cuerpo.rotation.x = -Math.PI / 2
  cuerpo.position.set(x0 + dx * 0.36, y, z0 + dz * 0.36)
  cuerpo.rotation.z = -Math.atan2(dz, dx)
  grupo.add(cuerpo)
  const punta = new THREE.Mesh(new THREE.CircleGeometry(ancho, 3), material)
  punta.rotation.x = -Math.PI / 2
  punta.position.set(x0 + dx * 0.86, y, z0 + dz * 0.86)
  punta.rotation.z = -Math.atan2(dz, dx) - Math.PI / 2
  grupo.add(punta)
  return grupo
}

/**
 * **El aro que gira de noventa en noventa**, con su bola invisible detrás. Es el
 * mismo mecanismo que el aro de una pieza desde la vuelta 79 —se dibuja una
 * forma y se pincha otra, porque un toro tiene el centro hueco— y se comparte
 * entre la rampa y la escalera: dos copias del mismo aro serían dos gestos que
 * se despegan el día que uno cambie de radio.
 */
/**
 * **Y el aro se dibuja a ras de suelo, no flotando encima** (vuelta 96).
 *
 * La vuelta 79 lo puso a `alto + 0.35`, que parece lo natural —arriba, donde no
 * estorba— y con una cámara oblicua es lo contrario: un rayo que apunta al
 * centro de una pieza de 3.6 cruza el plano del aro **a unas dos unidades del
 * eje**, o sea justo en su banda. Medido a 45°, pinchar el centro de un prisma
 * daba `prisma-giro`: el aro de una pieza tapaba la pieza, que es la misma forma
 * del fallo del disco macizo por otra puerta.
 *
 * A ras de suelo el rayo lo cruza **donde está la pieza**, así que la banda queda
 * fuera de su huella y se ve desde arriba, que es de donde se construye (vuelta
 * 93). Es además donde ya estaba el anillo del hueco de un tubo.
 */
function aroDeCuartos(x, y, z, radio, marca, grupo) {
  const aro = new THREE.Mesh(
    new THREE.TorusGeometry(radio, 0.06, 6, 28),
    new THREE.MeshBasicMaterial({ color: COLOR_GIZMO }),
  )
  aro.rotation.x = -Math.PI / 2
  aro.position.set(x, y, z)
  grupo.add(aro)
  /**
   * **Y el picker de un aro es un aro** (vuelta 96). La 93 le puso debajo un
   * cilindro **macizo** con un argumento correcto a medias —un toro tiene el
   * centro hueco y apuntarle al centro era un clic que se colaba— y la mitad que
   * faltaba es que ese disco **tapa la pieza entera**: el aro de una rampa de
   * 3×6 mide 3.9 de radio, así que a prioridad de tirador se lleva cualquier
   * clic sobre su huella. De ahí salieron los tres síntomas que se reportaron
   * juntos: una rampa, una escalera y un tubo **sólo se podían girar y
   * redimensionar**, una escalera **seguía elegida** al pinchar una caja que
   * cayera dentro de su huella, y arrastrar el cuerpo era dar con una bolita de
   * 0.42 en el centro.
   *
   * Lo que la 93 compró se conserva entero: el aro sigue siendo gordo de pinchar
   * (`ARO_AGARRE`, medio radio de tolerancia a cada lado del trazo, que es mucho
   * más que sus 0.06 de tubo). Lo que cambia es que **el agujero del medio
   * vuelve a ser un agujero**, que es lo que deja llegar al cuerpo de debajo.
   */
  const pincha = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(0.05, radio - ARO_AGARRE), radio + ARO_AGARRE, 28),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
  )
  pincha.rotation.x = -Math.PI / 2
  pincha.position.copy(aro.position)
  /**
   * **Y es el único tirador que gana por distancia y no por prioridad**
   * (vuelta 96). Los demás —una esquina, el cubo del alto— están **sobre** su
   * pieza, y sin prioridad los taparía la propia cara que tienen debajo: para eso
   * existe `PRIORIDAD.tirador` desde la vuelta 79. Un aro está **fuera** de la
   * huella por construcción (radio + 0.9), así que nunca lo tapa su pieza y
   * prioridad de tirador sólo sirve para lo contrario: un rayo que atraviesa la
   * pieza y sale por el aro de detrás **giraba** en vez de elegir.
   *
   * Con `PRIORIDAD.pieza` la respuesta es la que se ve: la banda que está delante
   * gana, y la que queda detrás de la pieza pierde — que es exactamente lo que
   * hace la pieza al taparla.
   */
  pincha.userData.marca = { ...marca, prioridad: PRIORIDAD.pieza }
  /**
   * **Y va al grupo, no sólo a la lista.** `pinchables` es lo que se raycastea y
   * el `Raycaster` de three **no actualiza matrices de mundo**: un objeto que no
   * cuelga de la escena se queda con la identidad, así que este picker se
   * raycasteaba **en el origen** — un disco de cuatro unidades invisible en el
   * centro del mapa, robando clics con prioridad de tirador, y el aro de verdad
   * sin poder agarrarse. Todos los demás pickers del fichero sí se añaden; éste
   * era el único que se había quedado fuera.
   */
  grupo.add(pincha)
  pinchables.push(pincha)
  return pincha
}

/**
 * **Un aro en el plano de un estampado** (vuelta 95). El de las rampas se tumba
 * en el suelo porque lo que gira es una huella; un logo gira **dentro de su
 * pared**, así que el aro se pone en su mismo plano copiando su rotación — un
 * `TorusGeometry` nace en el XY local, que es el plano del `PlaneGeometry`, así
 * que se encaran solos.
 *
 * Y debajo va un disco invisible más ancho, que es la idea de los `picker` de
 * `TransformControls` y la lección de la vuelta 93: **un toro tiene el centro
 * hueco**, así que apuntarle al centro —que es donde apunta cualquiera— es un
 * clic que se cuela por el agujero y deselecciona.
 */
function aroEnPlano(centro, rotacion, radio, marca, grupo) {
  const aro = new THREE.Mesh(
    new THREE.TorusGeometry(radio, 0.05, 6, 28),
    new THREE.MeshBasicMaterial({ color: COLOR_GIZMO }),
  )
  aro.position.copy(centro)
  aro.rotation.copy(rotacion)
  grupo.add(aro)
  // Un aro, no un disco: el disco tapaba el propio estampado, así que pinchar
  // el logo lo giraba en vez de moverlo. Ver `aroDeCuartos`.
  const pincha = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(0.05, radio - ARO_AGARRE), radio + ARO_AGARRE, 28),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
  )
  pincha.position.copy(centro)
  pincha.rotation.copy(rotacion)
  // Por distancia y no por prioridad, como el de `aroDeCuartos`: un aro rodea su
  // pieza y nunca lo tapa ella, así que la prioridad sólo servía para ganarle
  // desde detrás.
  pincha.userData.marca = { ...marca, prioridad: PRIORIDAD.pieza }
  grupo.add(pincha)
  pinchables.push(pincha)
  return pincha
}

/**
 * **Un punto del mundo, en coordenadas de la ventana.** Lo piden los gestos que
 * ocurren en un plano que no es el suelo —girar y escalar un estampado—, donde
 * el punto del ratón proyectado contra el suelo no significa nada.
 */
const _proyectado = new THREE.Vector3()
function aPantalla(x, y, z) {
  const caja = lienzo.getBoundingClientRect()
  _proyectado.set(x, y, z).project(camara)
  return {
    x: caja.left + ((_proyectado.x + 1) / 2) * caja.width,
    y: caja.top + ((1 - _proyectado.y) / 2) * caja.height,
  }
}

/** Un tirador de esquina: se pincha y se estira. */
function tirador(color) {
  return realceQueCrece(new THREE.Mesh(
    new THREE.BoxGeometry(TIRADOR, TIRADOR, TIRADOR),
    new THREE.MeshBasicMaterial({ color }),
  ))
}

/** Lo que se puede pinchar de los marcadores, en plano y sin buscar en el árbol. */
const pinchables = []

/**
 * Rehace los marcadores desde el mapa. Sale de `remontar`, así que corre a lo
 * sumo una vez por frame y no por movimiento del ratón.
 */
/**
 * **Los tiradores son de lo elegido** (vuelta 96), como los de una caja desde la
 * vuelta 79 (`gizmoPieza.visible`).
 *
 * Es la asimetría que producía el síntoma reportado: una rampa, una escalera, un
 * tubo, un prisma y un estampado dibujaban **su gizmo entero siempre** —esquina,
 * cubo de alto y aro de giro, todos a `PRIORIDAD.tirador`—, así que en un mapa
 * con cuatro rampas cualquier clic caía en un tirador de alguna y el cuerpo era
 * inalcanzable: «solo girar y redimensionar», con todas las letras.
 *
 * Lo que se queda puesto siempre es **lo que informa y no lo que agarra**: el
 * volumen pinchable, la bola del centro, la flecha de subida de una rampa, el
 * anillo del hueco de un tubo y la imagen de un estampado. Lo que aparece al
 * elegir es lo que cambia números.
 */
function esLoElegido(prefijo, i) {
  return marcaElegida?.que?.startsWith(prefijo) === true && marcaElegida.i === i
}

function pintarMarcas() {
  limpiarMarcas()
  pinchables.length = 0

  const duelo = mapa.duelo ?? {}
  const salidas = mapa.soloDuelo && Array.isArray(duelo.salidas) ? duelo.salidas : []
  const caja = duelo.cajaCompra ?? ROUNDS.cajaCompra

  for (const [i, salida] of salidas.entries()) {
    // **Y el ojo apaga también su gizmo** (vuelta 96): un marcador de algo
    // que no se ve es un marcador que no marca nada, y además seguiría
    // pinchándose.
    if (estaOculto('salidas', i)) continue
    const color = colorDeSalida(i)
    const grupo = new THREE.Group()
    grupo.position.set(salida.x, 0, salida.z)

    // El cono es el jugador: alto de persona y anclado al suelo, para que se
    // lea contra las piezas de al lado sin tener que imaginárselo.
    const cono = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.8, 6),
      new THREE.MeshBasicMaterial({ color, wireframe: true }),
    )
    cono.position.y = 0.9
    cono.userData.marca = { que: 'salida', i, prioridad: PRIORIDAD.cuerpo }
    realceQueCrece(cono)

    grupo.add(cono)
    pinchables.push(cono)

    /**
     * **El rumbo se arrastra por la punta.** «Salida 2 · Rumbo 180» es una
     * cifra que hay que traducir a una dirección; una flecha que se agarra y se
     * gira, no. Y el rumbo importa: sin él, el que sale en el sur aparece
     * mirando a la pared del fondo (vuelta 66).
     */
    const yaw = salida.yaw ?? 0
    // Una cámara mira a −Z con yaw 0: `forward = (−sin, −cos)`.
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    const largo = 4
    const flecha = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.2, 0),
        new THREE.Vector3(fx * largo, 0.2, fz * largo),
      ]),
      new THREE.LineBasicMaterial({ color }),
    )
    grupo.add(flecha)

    const punta = tirador(color)
    punta.position.set(fx * largo, 0.2, fz * largo)
    punta.userData.marca = { que: 'rumbo', i, prioridad: PRIORIDAD.tirador }
    grupo.add(punta)
    pinchables.push(punta)

    // La caja de compra de esa salida: es un área y se ve como tal.
    const { grupo: cajaGrupo, relleno } = cajaDeArea(caja.ancho, caja.fondo, 2.4, 0x2fcb82, 0.07)
    cajaGrupo.position.y = 1.2
    grupo.add(cajaGrupo)

    // Y su esquina, para estirarla. Sólo una: la caja es cuadrada y centrada.
    const esquinaCaja = tirador(0x2fcb82)
    esquinaCaja.position.set(caja.ancho / 2, 0.2, caja.fondo / 2)
    esquinaCaja.userData.marca = { que: 'caja', i, prioridad: PRIORIDAD.tirador }
    grupo.add(esquinaCaja)
    pinchables.push(esquinaCaja)
    void relleno

    marcas.add(grupo)
  }

  /**
   * **Las salidas del todos contra todos** (vuelta 100), con el mismo gesto que
   * las del duelo: el cono se arrastra y la punta de la flecha gira. Sin caja de
   * compra, que ese modo no tiene tienda. Se leen sin crear la lista (vuelta
   * 83): pintar no puede escribir en el mapa.
   */
  for (const [i, salida] of salidasDeTodosLeer().entries()) {
    if (estaOculto('salidasTodos', i)) continue
    const grupo = new THREE.Group()
    grupo.position.set(salida.x, 0, salida.z)
    const cono = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.8, 6),
      new THREE.MeshBasicMaterial({ color: COLOR_TODOS, wireframe: true }),
    )
    cono.position.y = 0.9
    cono.userData.marca = { que: 'todos', i, prioridad: PRIORIDAD.cuerpo }
    realceQueCrece(cono)
    grupo.add(cono)
    pinchables.push(cono)
    const yaw = salida.yaw ?? 0
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    const largo = 3
    grupo.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.2, 0),
        new THREE.Vector3(fx * largo, 0.2, fz * largo),
      ]),
      new THREE.LineBasicMaterial({ color: COLOR_TODOS }),
    ))
    const punta = tirador(COLOR_TODOS)
    punta.position.set(fx * largo, 0.2, fz * largo)
    punta.userData.marca = { que: 'todos-rumbo', i, prioridad: PRIORIDAD.tirador }
    grupo.add(punta)
    pinchables.push(punta)
    marcas.add(grupo)
  }

  /**
   * **Las peanas** (vuelta 106): el zócalo y el arma que enseña, que es la misma
   * silueta extruida que se ve jugando. Lo que se pincha es un cilindro
   * invisible del tamaño del volumen de agarre, a prioridad de cuerpo, como un
   * cono de salida: se arrastra por él.
   */
  for (const [i, peana] of peanasDe().entries()) {
    if (estaOculto('peanas', i)) continue
    const grupo = new THREE.Group()
    grupo.position.set(peana.x, 0, peana.z)
    const zocalo = new THREE.Mesh(
      new THREE.CylinderGeometry(PEANAS.zocaloRadioU, PEANAS.zocaloRadioU, PEANAS.zocaloAltoU, PEANAS.zocaloLados),
      new THREE.MeshBasicMaterial({ color: COLORS.dispositivo }),
    )
    zocalo.position.y = PEANAS.zocaloAltoU / 2
    grupo.add(zocalo)
    const geom = geometriaDeArma(peana.arma)
    if (geom) {
      const arma = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: COLORS.crosshair, side: THREE.DoubleSide }))
      arma.position.y = PEANAS.alturaArmaU
      grupo.add(arma)
    }
    const agarre = new THREE.Mesh(
      new THREE.CylinderGeometry(PEANAS.radioU, PEANAS.radioU, PEANAS.altoAgarreU, 12),
      new THREE.MeshBasicMaterial({ color: COLORS.dispositivo, wireframe: true, transparent: true, opacity: 0.25 }),
    )
    agarre.position.y = PEANAS.alturaArmaU
    agarre.userData.marca = { que: 'peana', i, prioridad: PRIORIDAD.cuerpo }
    realceQueCrece(agarre)
    grupo.add(agarre)
    pinchables.push(agarre)
    marcas.add(grupo)
  }

  /**
   * **La zona de aparición, como una banda que se ve** (vuelta 43 + 78). Es una
   * caja —esquina mínima, ancho y fondo— y por eso se dibuja como una caja: se
   * arrastra entera y se estira por su esquina opuesta.
   */
  /**
   * **Todas las bandas, no la primera** (vuelta 78). `spawnZone` es una lista
   * —El Espejo declara dos, una por extremo— y el panel de la fase 3 sólo
   * editaba `[0]`. Dibujar sólo ésa sería peor que no dibujar ninguna: se vería
   * media regla y la otra mitad parecería no existir.
   */
  for (const [i, zona] of (mapa.spawnZone ?? []).entries()) {
    if (!(zona.w > 0 && zona.d > 0)) continue
    const grupo = new THREE.Group()
    const { grupo: cajaGrupo } = cajaDeArea(zona.w, zona.d, 3, 0x2f6bf0, 0.09)
    cajaGrupo.position.set(zona.x + zona.w / 2, 1.5, zona.z + zona.d / 2)
    cajaGrupo.children[0].userData.marca = { que: 'zona', i, prioridad: PRIORIDAD.area }
    pinchables.push(cajaGrupo.children[0])
    grupo.add(cajaGrupo)

    const esquina = tirador(0x2f6bf0)
    esquina.position.set(zona.x + zona.w, 0.25, zona.z + zona.d)
    esquina.userData.marca = { que: 'zona-esquina', i, prioridad: PRIORIDAD.tirador }
    grupo.add(esquina)
    pinchables.push(esquina)

    marcas.add(grupo)
  }

  /**
   * **La flecha de una superficie se arrastra** (vuelta 80, convención de la
   * 78). «Rumbo 90 · Fuerza 12» no dice hacia dónde ni cuánto hasta que se
   * prueba el mapa; una flecha que se agarra por la punta, sí — y con **una
   * sola punta se ponen las dos cosas**, porque el ángulo es el rumbo y el
   * largo es la fuerza. Es la punta de la flecha de una salida (vuelta 78) con
   * un grado de libertad más.
   */
  for (const [i, pieza] of mapa.boxes.entries()) {
    const sup = pieza.superficie
    if (!sup) continue
    const cx = pieza.x + pieza.w / 2
    const cz = pieza.z + pieza.d / 2
    const alto = coverHeight(pieza.kind)
    const grupo = new THREE.Group()

    /**
     * **El hielo no lleva tirador, y eso es la convención de la 78 bien
     * aplicada, no una excepción a ella** (vuelta 83).
     *
     * Lo que esa convención pide es poder poner una cosa **viendo el efecto**;
     * lo que no pide es inventarse un gesto. En el hielo `fuerza` es
     * **rozamiento** —cuánto te frena el suelo, en u/s²—, y una flecha
     * arrastrable prometería una dirección y una potencia que ahí no
     * significan nada. Lo que sí se ve es la marca del cristal que `Scenario`
     * pinta encima, que es lo que dice *qué es*; cuánto resbala se afina con
     * su número y se comprueba **probando**, que es el botón de al lado.
     */
    if (sup.tipo === 'hielo') { continue }

    if (sup.tipo === 'rebote') {
      // Vertical: la punta sube y baja, y lo que se lee en el largo es cuánto
      // te lanza. Girarla no significaría nada, así que no gira.
      const alta = alto + sup.fuerza * LARGO_POR_FUERZA
      grupo.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(cx, alto, cz), new THREE.Vector3(cx, alta, cz),
        ]),
        new THREE.LineBasicMaterial({ color: COLORS.electric }),
      ))
      const punta = tirador(COLORS.electric)
      punta.position.set(cx, alta, cz)
      punta.userData.marca = { que: 'sup-fuerza', i, prioridad: PRIORIDAD.tirador }
      grupo.add(punta)
      pinchables.push(punta)
    } else {
      const largo = sup.fuerza * LARGO_POR_FUERZA
      const dx = -Math.sin(sup.rumbo)
      const dz = -Math.cos(sup.rumbo)
      const px = cx + dx * largo
      const pz = cz + dz * largo
      grupo.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(cx, alto + 0.05, cz), new THREE.Vector3(px, alto + 0.05, pz),
        ]),
        new THREE.LineBasicMaterial({ color: COLORS.electric }),
      ))
      const punta = tirador(COLORS.electric)
      punta.position.set(px, alto + 0.05, pz)
      punta.userData.marca = { que: 'sup-flecha', i, prioridad: PRIORIDAD.tirador }
      grupo.add(punta)
      pinchables.push(punta)
    }
    marcas.add(grupo)
  }

  /**
   * **Un tubo se agarra entero, aunque el motor vea veintidós cajas** (vuelta
   * 81). Sus piezas no están en `mapa.boxes` —las despliega `Scenario` al
   * montar— así que no tienen proxy y no se pueden pinchar una a una: eso es
   * justo lo que se quiere. Lo que se pincha es **el tubo**, y lo que se
   * arrastra son sus tres números.
   *
   * El cuerpo es un cilindro abierto y translúcido puesto sobre el anillo de
   * verdad: se ve lo que hay dentro —que es donde se baja— y se sabe dónde hay
   * que pinchar para moverlo.
   */
  /**
   * **Un prisma se agarra como una pieza, y además gira libre** (vuelta 83).
   *
   * Los tres gestos de la vuelta 79 sin ningún modo —el cuerpo mueve, la
   * esquina estira, el cubo de arriba elige alto— y un cuarto que allí no
   * podía existir: **el aro gira a cualquier ángulo**. En una caja el aro
   * cuadra a 90° porque más que eso sería un gesto sin efecto —la colisión no
   * sabía girar—; aquí el ángulo que se ve girar es exactamente el que el
   * motor va a chocar, así que cuadrarlo sería recortarlo a mano.
   */
  for (const [i, prisma] of (mapa.prismas ?? []).entries()) {
    if (estaOculto('prismas', i)) continue
    const grupo = new THREE.Group()
    const puntos = puntosDePrisma(prisma)
    const alto = coverHeight(prisma.kind)
    const base = prisma.base ? coverHeight(prisma.base) : 0

    // La huella, dibujada con sus caras de verdad: es el dato, no un dibujo
    // paralelo (convención de la 78).
    const anillo = []
    for (let k = 0; k < puntos.length; k++) {
      const a = puntos[k]
      const b = puntos[(k + 1) % puntos.length]
      anillo.push(
        new THREE.Vector3(a.x, base + 0.03, a.z),
        new THREE.Vector3(b.x, base + 0.03, b.z),
        new THREE.Vector3(a.x, alto, a.z),
        new THREE.Vector3(b.x, alto, b.z),
        new THREE.Vector3(a.x, base + 0.03, a.z),
        new THREE.Vector3(a.x, alto, a.z),
      )
    }
    grupo.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(anillo),
      new THREE.LineBasicMaterial({ color: COLOR_GIZMO, transparent: true, opacity: 0.85 }),
    ))

    // El cuerpo que se pincha: una bola en el centro, a media altura. Como el
    // asa de un ventilador y por lo mismo —un prisma se pone encima del suelo,
    // así que un clic sobre su volumen se lo llevaría la losa de abajo.
    const cuerpo = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 8),
      new THREE.MeshBasicMaterial({ color: COLOR_GIZMO, wireframe: true }),
    )
    cuerpo.position.set(prisma.x, base + (alto - base) / 2, prisma.z)
    cuerpo.userData.marca = { que: 'prisma', i, prioridad: PRIORIDAD.cuerpo }
    realceQueCrece(cuerpo)
    grupo.add(cuerpo)
    pinchables.push(cuerpo)

    /**
     * Y su volumen también, extruido de **los mismos vértices** con los que el
     * motor lo dibuja y lo choca (`puntosDePrisma`): un prisma girado 37° sólo
     * se puede pinchar por donde se ve si lo que se pincha sale de ahí.
     */
    {
      const forma = new THREE.Shape(puntosDePrisma(prisma).map((p) => new THREE.Vector2(p.x, p.z)))
      const geo = new THREE.ExtrudeGeometry(forma, { depth: alto - base, bevelEnabled: false })
      /**
       * La sección va en el XY del `Shape` y la extrusión crece en +Z, así que
       * lo que hace falta es **cambiar Y por Z**, no girar: un giro de −90° deja
       * el prisma espejado en Z y el alto hacia abajo. Se escribe la matriz a
       * mano porque es exactamente eso y nada más.
       */
      geo.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1))
      geo.translate(0, base, 0)
      volumenPinchable(geo, { que: 'prisma', i }, grupo)
    }

    // Y sus tiradores sólo si está elegido: ver `esLoElegido`.
    if (!esLoElegido('prisma', i)) { marcas.add(grupo); continue }

    // Esquina: estira ancho y fondo **en los ejes del prisma**, no en los del
    // mundo. Con los del mundo, estirar uno girado 30° le cambiaría la forma en
    // diagonal y el número del panel diría otra cosa.
    const cos = Math.cos(prisma.giro ?? 0)
    const sen = Math.sin(prisma.giro ?? 0)
    const ex = prisma.x + (prisma.w / 2) * cos - (prisma.d / 2) * sen
    const ez = prisma.z + (prisma.w / 2) * sen + (prisma.d / 2) * cos
    const esquina = tirador(COLOR_GIZMO)
    esquina.position.set(ex, base + 0.25, ez)
    esquina.userData.marca = { que: 'prisma-esquina', i, prioridad: PRIORIDAD.tirador }
    grupo.add(esquina)
    pinchables.push(esquina)

    const tAlto = tirador(COLOR_GIZMO)
    tAlto.position.set(prisma.x, alto, prisma.z)
    tAlto.userData.marca = { que: 'prisma-alto', i, prioridad: PRIORIDAD.tirador }
    grupo.add(tAlto)
    pinchables.push(tAlto)

    /**
     * **El aro de giro, y sale de `aroDeCuartos`** (vuelta 96). Estaba escrito a
     * mano aquí —una cuarta copia del mismo aro, con su propio picker— y eso
     * costó exactamente lo que cuesta una copia: al arreglar el disco macizo que
     * tapaba las piezas, el prisma **se quedó sin arreglar** y era el único de
     * los cinco que seguía girándose al pinchar su cuerpo. La regla de la vuelta
     * 63 por la puerta del editor.
     *
     * Lo único suyo es que el prisma gira a cualquier ángulo y no a cuartos, y
     * eso lo decide quien mueve el aro (`prisma-giro`), no quien lo dibuja.
     */
    aroDeCuartos(prisma.x, base + 0.04, prisma.z, Math.max(prisma.w, prisma.d) / 2 + 0.9,
      { que: 'prisma-giro', i }, grupo)

    marcas.add(grupo)
  }

  /**
   * **Las rampas y las escaleras se colocan viendo el efecto** (vuelta 93), que
   * es la convención de la 78 y no una preferencia: «fromZ: −6, toZ: −12» no
   * dice hacia dónde se sube hasta que se prueba el mapa.
   *
   * Las dos llevan lo mismo y por el mismo motivo, así que se dibujan juntas: un
   * **cuerpo** para moverlas, una **esquina** para el tamaño, un **cubo arriba**
   * para el alto y un **aro** que gira **de noventa en noventa** —una rampa
   * declara su subida en un eje y los escalones son cajas, así que un ángulo
   * libre prometería un gesto que el motor no sabe chocar (vuelta 74)—. Y por
   * encima una **cuña de flechas** que dice hacia dónde se sube, porque eso es
   * lo único de las dos que no se lee en su huella.
   */
  /**
   * **Un estampado se coloca viendo el estampado** (vuelta 93), que es la
   * convención de la 78 en su caso más literal: lo que se está colocando es una
   * imagen, así que el marcador **lleva la imagen puesta**. Un rectángulo verde
   * con un número al lado no dice si el logo cabe en ese muro.
   *
   * Es una ayuda de autor, como los láseres: fuera de `Scenario`, fuera de los
   * oclusores y fuera del presupuesto. Lo que se juega lo monta
   * `src/game/estampados.js`.
   */
  for (const [i, est] of (mapa.estampados ?? []).entries()) {
    if (estaOculto('estampados', i)) continue
    const grupo = new THREE.Group()
    const cara = CARAS_DE_ESTAMPADO[est.cara] ?? CARAS_DE_ESTAMPADO.norte

    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
    })
    // La textura se pide y se pone cuando llega; sin ella queda el cuadro verde,
    // que sigue diciendo dónde está y de qué tamaño.
    cargadorDeTexturas ??= new THREE.TextureLoader()
    cargadorDeTexturas.load(est.imagen, (textura) => {
      textura.colorSpace = THREE.SRGBColorSpace
      material.map = textura
      material.needsUpdate = true
      sucio = false // La escena se redibuja cada frame: no hace falta remontar.
    }, undefined, () => { material.color.set(COLOR_GIZMO); material.opacity = 0.35 })

    const cuadro = new THREE.Mesh(new THREE.PlaneGeometry(est.ancho, est.alto), material)
    cuadro.position.set(est.x, est.y, est.z)
    cuadro.rotation.set(...cara.rotacion)
    // El giro dentro de su plano, en local, igual que en el motor.
    if (est.giro) cuadro.rotateZ(est.giro)
    cuadro.userData.marca = { que: 'est', i, prioridad: PRIORIDAD.cuerpo }
    cuadro.userData.realce = (puesta) => { material.opacity = puesta ? 1 : 0.9 }
    grupo.add(cuadro)
    pinchables.push(cuadro)

    // Su contorno, que es lo que se ve cuando la imagen es casi transparente.
    const borde = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(est.ancho, est.alto)),
      new THREE.LineBasicMaterial({ color: COLOR_GIZMO }),
    )
    borde.position.copy(cuadro.position)
    borde.rotation.copy(cuadro.rotation)
    grupo.add(borde)

    // Y sus cuatro tiradores sólo si está elegido: ver `esLoElegido`. Lo que se
    // queda siempre es la imagen y su contorno, que es lo que dice dónde está.
    if (!esLoElegido('est', i)) { marcas.add(grupo); continue }

    // La esquina, **en los ejes del cuadro**: estirarla en los del mundo daría
    // un ancho que el panel no reconoce cuando el logo mira al este.
    const esquina = tirador(COLOR_GIZMO)
    const mitad = new THREE.Vector3(est.ancho / 2, -est.alto / 2, 0).applyEuler(cuadro.rotation)
    esquina.position.set(est.x + mitad.x, est.y + mitad.y, est.z + mitad.z)
    esquina.userData.marca = { que: 'est-esquina', i, prioridad: PRIORIDAD.tirador }
    grupo.add(esquina)
    pinchables.push(esquina)

    /**
     * **Y la otra esquina de abajo escala sin deformar** (vuelta 95). Es el
     * séptimo tirador de una pieza (vuelta 93) aplicado a un logo, y aquí la
     * razón es más fuerte que allí: una pieza deformada sigue siendo una caja,
     * pero **un logo estirado es otro logo** — que es justo el motivo por el que
     * los estampados son la única excepción a «sin assets» (vuelta 93).
     *
     * Va achatada como las de una pieza, y en la esquina contraria a la que
     * deforma: las dos de abajo, una a cada lado, así que cuál es cuál se
     * aprende una vez.
     */
    const proporcion = tirador(COLOR_GIZMO)
    proporcion.scale.y = 0.5
    const otra = new THREE.Vector3(-est.ancho / 2, -est.alto / 2, 0).applyEuler(cuadro.rotation)
    proporcion.position.set(est.x + otra.x, est.y + otra.y, est.z + otra.z)
    proporcion.userData.marca = { que: 'est-proporcion', i, prioridad: PRIORIDAD.tirador }
    grupo.add(proporcion)
    pinchables.push(proporcion)

    const tAlto = tirador(COLOR_GIZMO)
    tAlto.position.set(est.x, est.y + est.alto / 2 + 0.4, est.z)
    tAlto.userData.marca = { que: 'est-alto', i, prioridad: PRIORIDAD.tirador }
    grupo.add(tAlto)
    pinchables.push(tAlto)

    aroEnPlano(
      cuadro.position,
      cuadro.rotation,
      Math.max(est.ancho, est.alto) / 2 + 0.5,
      { que: 'est-giro', i },
      grupo,
    )

    marcas.add(grupo)
  }

  for (const [i, rampa] of (mapa.ramps ?? []).entries()) {
    if (estaOculto('ramps', i)) continue
    const grupo = new THREE.Group()
    const alto = coverHeight(rampa.top)
    const enX = rampa.fromX !== undefined
    const minX = Math.min(rampa.x, rampa.x + rampa.w)
    const minZ = Math.min(rampa.z, rampa.z + rampa.d)
    const cx = minX + Math.abs(rampa.w) / 2
    const cz = minZ + Math.abs(rampa.d) / 2

    const cuerpo = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 8),
      new THREE.MeshBasicMaterial({ color: COLOR_GIZMO, wireframe: true }),
    )
    cuerpo.position.set(cx, alto / 2, cz)
    cuerpo.userData.marca = { que: 'rampa', i, prioridad: PRIORIDAD.cuerpo }
    realceQueCrece(cuerpo)
    grupo.add(cuerpo)
    pinchables.push(cuerpo)

    // Y la cuña entera se pincha, no sólo su bola: ver `volumenPinchable`.
    volumenPinchable(geometriaDeCuna(rampa, alto), { que: 'rampa', i }, grupo)

    // La flecha de subida se queda puesta siempre: dice hacia dónde sube, que
    // es información del mapa y no un mando.
    const bajo = enX ? rampa.fromX : rampa.fromZ
    const arriba = enX ? rampa.toX : rampa.toZ
    grupo.add(flechaDeSuelo(
      enX ? bajo : cx, enX ? cz : bajo,
      enX ? arriba : cx, enX ? cz : arriba,
      alto * 0.5 + 0.1,
    ))

    if (esLoElegido('rampa', i)) {
      const esquina = tirador(COLOR_GIZMO)
      esquina.position.set(minX + Math.abs(rampa.w), 0.15, minZ + Math.abs(rampa.d))
      esquina.userData.marca = { que: 'rampa-esquina', i, prioridad: PRIORIDAD.tirador }
      grupo.add(esquina)
      pinchables.push(esquina)

      const tAlto = tirador(COLOR_GIZMO)
      tAlto.position.set(cx, alto, cz)
      tAlto.userData.marca = { que: 'rampa-alto', i, prioridad: PRIORIDAD.tirador }
      grupo.add(tAlto)
      pinchables.push(tAlto)

      aroDeCuartos(cx, 0.04, cz, Math.max(Math.abs(rampa.w), Math.abs(rampa.d)) / 2 + 0.9,
        { que: 'rampa-giro', i }, grupo)
    }

    marcas.add(grupo)
  }

  for (const [i, esc] of (mapa.escaleras ?? []).entries()) {
    if (estaOculto('escaleras', i)) continue
    const grupo = new THREE.Group()
    const m = medidasDeEscalera(esc, COVER.stepHeight)
    const base = esc.base ?? 0
    const cima = base + esc.alto
    const enZ = esc.rumbo === 0 || esc.rumbo === 2
    const signo = esc.rumbo === 0 || esc.rumbo === 1 ? 1 : -1
    // El centro de la huella desplegada: el pie es `x`/`z` y crece en el rumbo.
    const cx = enZ ? esc.x + esc.ancho / 2 : esc.x + (signo * m.largo) / 2
    const cz = enZ ? esc.z + (signo * m.largo) / 2 : esc.z + esc.ancho / 2

    const cuerpo = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 8),
      new THREE.MeshBasicMaterial({ color: COLOR_GIZMO, wireframe: true }),
    )
    cuerpo.position.set(cx, base + esc.alto / 2, cz)
    cuerpo.userData.marca = { que: 'escalera', i, prioridad: PRIORIDAD.cuerpo }
    realceQueCrece(cuerpo)
    grupo.add(cuerpo)
    pinchables.push(cuerpo)

    /**
     * Y cada escalón se pincha. Sale de `cajasDeEscalera`, **la misma función
     * que despliega la escalera en el motor**, así que lo que se agarra es
     * exactamente lo que se ve y lo que se choca: un proxy calculado aparte
     * sería la escalera dibujada de una forma y pinchable de otra.
     */
    for (const caja of cajasDeEscalera(esc, COVER.stepHeight)) {
      const geo = new THREE.BoxGeometry(caja.w, coverHeight(caja.kind) - (caja.base ? coverHeight(caja.base) : 0), caja.d)
      geo.translate(caja.x + caja.w / 2, ((caja.base ? coverHeight(caja.base) : 0) + coverHeight(caja.kind)) / 2, caja.z + caja.d / 2)
      volumenPinchable(geo, { que: 'escalera', i }, grupo)
    }

    grupo.add(flechaDeSuelo(
      enZ ? cx : esc.x, enZ ? esc.z : cz,
      enZ ? cx : esc.x + signo * m.largo, enZ ? esc.z + signo * m.largo : cz,
      cima * 0.5 + 0.1,
    ))

    if (esLoElegido('escalera', i)) {
      // La esquina lejana de la huella: estira el ancho y la huella de un escalón.
      const esquina = tirador(COLOR_GIZMO)
      esquina.position.set(
        enZ ? esc.x + esc.ancho : esc.x + signo * m.largo,
        base + 0.15,
        enZ ? esc.z + signo * m.largo : esc.z + esc.ancho,
      )
      esquina.userData.marca = { que: 'escalera-esquina', i, prioridad: PRIORIDAD.tirador }
      grupo.add(esquina)
      pinchables.push(esquina)

      const tAlto = tirador(COLOR_GIZMO)
      tAlto.position.set(cx, cima, cz)
      tAlto.userData.marca = { que: 'escalera-alto', i, prioridad: PRIORIDAD.tirador }
      grupo.add(tAlto)
      pinchables.push(tAlto)

      aroDeCuartos(cx, base + 0.04, cz, Math.max(esc.ancho, m.largo) / 2 + 0.9,
        { que: 'escalera-giro', i }, grupo)
    }

    marcas.add(grupo)
  }

  for (const [i, tubo] of (mapa.tubos ?? []).entries()) {
    if (estaOculto('tubos', i)) continue
    const grupo = new THREE.Group()
    const fuera = tubo.radio + tubo.grosor

    const geo = new THREE.CylinderGeometry(fuera, fuera, tubo.alto, Math.max(8, tubo.caras * 2), 1, true)
    const cuerpo = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: COLOR_GIZMO, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide,
    }))
    cuerpo.position.set(tubo.x, tubo.base + tubo.alto / 2, tubo.z)
    cuerpo.userData.marca = { que: 'tubo', i, prioridad: PRIORIDAD.cuerpo }
    // Como un área (vuelta 79): se aclara con tope y **no se escala**, o el
    // realce dibujaría un tubo que no es el que el mapa declara.
    cuerpo.userData.realce = (puesta) => {
      cuerpo.material.opacity = puesta ? REALCE_AREA_MAX : 0.07
    }
    grupo.add(cuerpo)
    pinchables.push(cuerpo)

    // **El anillo del suelo es el hueco libre**, o sea el `radio` de verdad:
    // lo que hay que ver al colocarlo es por dónde se cabe, no por dónde acaba
    // la pared.
    const aro = new THREE.Mesh(
      new THREE.RingGeometry(tubo.radio - 0.04, tubo.radio, Math.max(12, tubo.caras * 2)),
      new THREE.MeshBasicMaterial({ color: COLOR_GIZMO, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    )
    aro.rotation.x = -Math.PI / 2
    aro.position.set(tubo.x, tubo.base + 0.03, tubo.z)
    grupo.add(aro)

    if (esLoElegido('tubo', i)) {
      // Radio: se tira de él por el suelo, como la esquina de una pieza.
      const tRadio = tirador(COLOR_GIZMO)
      tRadio.position.set(tubo.x + fuera, tubo.base + 0.25, tubo.z)
      tRadio.userData.marca = { que: 'tubo-radio', i, prioridad: PRIORIDAD.tirador }
      grupo.add(tRadio)
      pinchables.push(tRadio)

      // Alto: como el cubo de arriba de una pieza (vuelta 79), con el ratón en
      // pantalla — el suelo no dice nada de una altura.
      const tAlto = tirador(COLOR_GIZMO)
      tAlto.position.set(tubo.x, tubo.base + tubo.alto, tubo.z)
      tAlto.userData.marca = { que: 'tubo-alto', i, prioridad: PRIORIDAD.tirador }
      grupo.add(tAlto)
      pinchables.push(tAlto)
    }

    marcas.add(grupo)
  }

  /**
   * **Un ventilador es un volumen, y se agarra como tal** (vuelta 83). Cuatro
   * tiradores y ninguno es un modo, que es la regla de la 79: el cuerpo lo
   * mueve, la esquina le da planta, el cubo de arriba le da alto y la punta de
   * la flecha le da fuerza.
   *
   * La flecha de fuerza sale **por encima del volumen** a propósito: dentro ya
   * hay flechas dibujadas por `Scenario` —las que dicen qué es esto— y un
   * tirador entre ellas sería un tirador que no se encuentra.
   */
  for (const [i, v] of (mapa.ventiladores ?? []).entries()) {
    if (estaOculto('ventiladores', i)) continue
    const grupo = new THREE.Group()
    const { grupo: cajaGrupo } = cajaDeArea(v.w, v.d, v.alto, COLORS.electric, 0.07)
    cajaGrupo.position.set(v.x + v.w / 2, v.base + v.alto / 2, v.z + v.d / 2)
    cajaGrupo.children[0].userData.marca = { que: 'vent', i, prioridad: PRIORIDAD.area }
    pinchables.push(cajaGrupo.children[0])
    grupo.add(cajaGrupo)

    /**
     * **Y un asa en el centro, porque el volumen solo no se puede agarrar.**
     *
     * El orden de la vuelta 78 es tirador, cuerpo, pieza, área, y es correcto:
     * un área tiene que ser lo último para que las piezas de dentro sigan
     * siendo pinchables. El precio se ve con un ventilador y no se veía con
     * una banda de aparición: **un ventilador se pone encima del suelo**, así
     * que cualquier clic sobre su volumen atraviesa hasta la losa de abajo y
     * gana la losa. Medido: arrastrar el cuerpo movía cero.
     *
     * El asa lo resuelve sin tocar el orden, que es lo que no hay que tocar:
     * es un **cuerpo** (como el de un tubo o el destino de un teletransporte),
     * o sea por encima de una pieza y por debajo de un tirador, y el volumen
     * se queda como área para lo que el área es — poder pinchar lo de dentro.
     */
    const asa = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55),
      new THREE.MeshBasicMaterial({ color: COLORS.electric, wireframe: true }),
    )
    asa.position.set(v.x + v.w / 2, v.base + v.alto / 2, v.z + v.d / 2)
    asa.userData.marca = { que: 'vent', i, prioridad: PRIORIDAD.cuerpo }
    realceQueCrece(asa)
    grupo.add(asa)
    pinchables.push(asa)

    const esquina = tirador(COLORS.electric)
    esquina.position.set(v.x + v.w, v.base + 0.25, v.z + v.d)
    esquina.userData.marca = { que: 'vent-esquina', i, prioridad: PRIORIDAD.tirador }
    grupo.add(esquina)
    pinchables.push(esquina)

    const cx = v.x + v.w / 2
    const cz = v.z + v.d / 2
    const tAlto = tirador(COLORS.electric)
    tAlto.position.set(cx, v.base + v.alto, cz)
    tAlto.userData.marca = { que: 'vent-alto', i, prioridad: PRIORIDAD.tirador }
    grupo.add(tAlto)
    pinchables.push(tAlto)

    // La flecha de fuerza, como la de un rebote: su largo **es** el número.
    const yFlecha = v.base + v.alto + 0.6 + v.fuerza * LARGO_POR_FUERZA * 0.25
    grupo.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cx, v.base + v.alto + 0.4, cz),
        new THREE.Vector3(cx, yFlecha, cz),
      ]),
      new THREE.LineBasicMaterial({ color: COLORS.electric }),
    ))
    const punta = tirador(COLORS.electric)
    punta.position.set(cx, yFlecha, cz)
    punta.userData.marca = { que: 'vent-fuerza', i, prioridad: PRIORIDAD.tirador }
    grupo.add(punta)
    pinchables.push(punta)

    marcas.add(grupo)
  }

  /**
   * **Una tirolina son dos anclajes y el cable que los une** (vuelta 83), y
   * los dos anclajes se arrastran.
   *
   * Son **dos tiradores por extremo y no uno**, y la razón es que el gesto del
   * editor vive en el plano del suelo: un rayo contra y=0 dice X y Z y no sabe
   * nada de la altura (es lo mismo que obligó a estirar la flecha de un rebote
   * con el ratón en pantalla, vuelta 80). La bola pone dónde cae el anclaje en
   * planta; el cubo de encima, a qué altura.
   *
   * El cable, sus cruces y las flechas del sentido los dibuja `Scenario`, así
   * que salen igual aquí que jugando — que es la convención de la 78 al
   * derecho: **lo que se ve es el dato**, no un dibujo paralelo del editor.
   */
  for (const [i, t] of (mapa.tirolinas ?? []).entries()) {
    if (estaOculto('tirolinas', i)) continue
    const grupo = new THREE.Group()
    for (const [cual, p] of [['a', t.desde], ['b', t.hasta]]) {
      const bola = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 12, 8),
        new THREE.MeshBasicMaterial({ color: COLORS.electric, wireframe: true }),
      )
      bola.position.set(p.x, p.y, p.z)
      bola.userData.marca = { que: `tiro-${cual}`, i, prioridad: PRIORIDAD.cuerpo }
      realceQueCrece(bola)
      grupo.add(bola)
      pinchables.push(bola)

      const alto = tirador(COLORS.electric)
      alto.position.set(p.x, p.y + 1.1, p.z)
      alto.userData.marca = { que: `tiro-${cual}-alto`, i, prioridad: PRIORIDAD.tirador }
      grupo.add(alto)
      pinchables.push(alto)

      // Y la plomada hasta el suelo: sin ella, un anclaje a nueve unidades de
      // alto no dice **sobre qué sitio del mapa** está.
      grupo.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(p.x, 0.02, p.z),
          new THREE.Vector3(p.x, p.y, p.z),
        ]),
        new THREE.LineBasicMaterial({ color: COLORS.electric, transparent: true, opacity: 0.35 }),
      ))
    }
    marcas.add(grupo)
  }

  /**
   * **Un teletransporte son dos sitios y una línea entre ellos.** La línea no
   * es decoración: con cuatro parejas en el mapa, saber cuál lleva a cuál
   * leyendo ocho números es exactamente la barrera que la 78 vino a quitar.
   */
  for (const [i, tp] of (mapa.teletransportes ?? []).entries()) {
    if (estaOculto('teletransportes', i)) continue
    const grupo = new THREE.Group()
    const { grupo: cajaGrupo } = cajaDeArea(tp.w, tp.d, TELEPORTS.alto, COLORS.electric, 0.09)
    cajaGrupo.position.set(tp.x + tp.w / 2, TELEPORTS.alto / 2, tp.z + tp.d / 2)
    cajaGrupo.children[0].userData.marca = { que: 'tp', i, prioridad: PRIORIDAD.area }
    pinchables.push(cajaGrupo.children[0])
    grupo.add(cajaGrupo)

    const esquina = tirador(COLORS.electric)
    esquina.position.set(tp.x + tp.w, 0.25, tp.z + tp.d)
    esquina.userData.marca = { que: 'tp-esquina', i, prioridad: PRIORIDAD.tirador }
    grupo.add(esquina)
    pinchables.push(esquina)

    // El destino: un cono como el de una salida —es donde aparece alguien— con
    // su flecha de rumbo, por lo mismo que las salidas desde la vuelta 66.
    const cono = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.8, 6),
      new THREE.MeshBasicMaterial({ color: COLORS.electric, wireframe: true }),
    )
    cono.position.set(tp.destino.x, 0.9, tp.destino.z)
    cono.userData.marca = { que: 'tp-destino', i, prioridad: PRIORIDAD.cuerpo }
    realceQueCrece(cono)
    grupo.add(cono)
    pinchables.push(cono)

    const yaw = tp.destino.yaw ?? 0
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    grupo.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(tp.destino.x, 0.2, tp.destino.z),
        new THREE.Vector3(tp.destino.x + fx * 4, 0.2, tp.destino.z + fz * 4),
      ]),
      new THREE.LineBasicMaterial({ color: COLORS.electric }),
    ))
    const punta = tirador(COLORS.electric)
    punta.position.set(tp.destino.x + fx * 4, 0.2, tp.destino.z + fz * 4)
    punta.userData.marca = { que: 'tp-rumbo', i, prioridad: PRIORIDAD.tirador }
    grupo.add(punta)
    pinchables.push(punta)

    // La línea que las une, a media altura y punteada por tramos para que no
    // se confunda con una arista del mapa.
    grupo.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(tp.x + tp.w / 2, TELEPORTS.alto * 0.5, tp.z + tp.d / 2),
        new THREE.Vector3(tp.destino.x, 0.9, tp.destino.z),
      ]),
      new THREE.LineBasicMaterial({ color: COLORS.electric, transparent: true, opacity: 0.45 }),
    ))

    marcas.add(grupo)
  }

  pintarResaltado()
}

/** Cuánto mide en el mapa una unidad de fuerza, dibujada. */
const LARGO_POR_FUERZA = 0.14

/** El marcador elegido se enciende: sin esto no se sabe cuál escriben los campos. */
function pintarResaltado() {
  for (const objeto of pinchables) {
    const marca = objeto.userData.marca
    const puesta = Boolean(marcaElegida) &&
      marca.que === marcaElegida.que && (marca.i ?? -1) === (marcaElegida.i ?? -1)
    // **Cada uno se realza como puede** (vuelta 79): el realce lo declara quien
    // crea el marcador, no lo decide aquí un `if` sobre su material. Aquí sólo
    // se sabe qué está elegido.
    objeto.userData.realce?.(puesta)
  }
}

/** Dónde aparece el jugador en un mapa de entrenamiento. Sin esto se coloca a ciegas. */
const marcaSpawn = new THREE.Mesh(
  new THREE.ConeGeometry(0.5, 1.8, 4),
  new THREE.MeshBasicMaterial({ color: 0x2f6bf0, wireframe: true }),
)
marcaSpawn.userData.marca = { que: 'spawn', prioridad: PRIORIDAD.cuerpo }
scene.add(marcaSpawn)

/**
 * Remonta el mundo desde `mapa`. Se llama una vez por frame como mucho, con
 * bandera: arrastrar una caja cambia la definición en cada movimiento del ratón
 * y fundir geometrías por evento sería trabajo tirado.
 */
/** Una escena que no dibuja: lo que `Scenario` necesita y nada más. */
const escenaDeMentira = { add() {}, remove() {} }

/**
 * **Lo que le falta a un mapa para los modos en que se publica** (vuelta 101).
 * Un mapa publicado en el todos contra todos con ocho salidas **se ofrece** en
 * un lobby de diez, y el noveno que pulsa LISTO no tiene dónde salir; un mapa
 * de duelo se ofrece también de 2v2 a 5v5, y ahí los compañeros aparecen al
 * lado de su salida (`salidasDeEquipos`) — si una pared o un desnivel no les
 * deja sitio, salen apilados encima del primero. Las dos cosas son de las que
 * sólo se descubren jugando, que es tarde (vuelta 67): se dicen en la barra de
 * arriba, que es la que dice el estado (vuelta 77), y en las dos hojas.
 *
 * Se mide contra `escenarioMedido`, el mapa entero, y con las mismas funciones
 * que reparten las salidas en el servidor: un segundo cálculo sería un aviso
 * que dice una cosa y una sala que hace otra.
 */
let faltasDeSalidas = []
/** Las salidas del todos contra todos que se ven entre sí, medidas con retardo (abajo). */
let parejasQueSeVen = []
let medirParejasLuego = null
const MAYOR_EQUIPO = Math.max(...MODOS_MULTIJUGADOR.map((m) => m.porEquipo))
function medirFaltasDeSalidas(medido) {
  const modos = modosDeMapa(mapa)
  const faltas = []
  if (modos.includes('todos')) {
    // **De 3 a 10, los que quepan por sus salidas** (vuelta 105): un mapa con
    // seis salidas ya no es un mapa al que le faltan cuatro. Lo que falta de
    // verdad es bajar de tres, y eso va en rojo.
    const n = medido.salidasDeTodos.length
    if (n < TODOS.minSalidas) faltas.push(`todos contra todos: ${n} salida${n === 1 ? '' : 's'} y hacen falta ${TODOS.minSalidas}`)
    // Y si dos salidas se ven: la misma cuenta que «Medir», con retardo, porque
    // esto corre en cada arrastre y son N·(N−1)/2 rayos.
    clearTimeout(medirParejasLuego)
    medirParejasLuego = setTimeout(() => {
      parejasQueSeVen = salidasQueSeVen(salidasDeTodosLeer()).seVen
      pintarFaltasDeSalidas()
    }, 300)
  } else {
    parejasQueSeVen = []
  }
  if (modos.includes('duelo')) {
    const sinSitio = medido.salidasDeEquipos(MAYOR_EQUIPO).filter((p) => !p.libre).length
    if (sinSitio) {
      faltas.push(`${MAYOR_EQUIPO}v${MAYOR_EQUIPO}: ${sinSitio} compañero${sinSitio === 1 ? '' : 's'} sin sitio junto a su salida`)
    }
  }
  faltasDeSalidas = faltas
  pintarFaltasDeSalidas()
}
function pintarFaltasDeSalidas() {
  const todos = [...faltasDeSalidas]
  if (parejasQueSeVen.length) {
    todos.push(`todos contra todos: se ven ${parejasQueSeVen.length} pareja${parejasQueSeVen.length === 1 ? '' : 's'} de salidas (${parejasQueSeVen.slice(0, 4).join(', ')}${parejasQueSeVen.length > 4 ? '…' : ''})`)
  }
  // Rojo lo que deja el mapa sin jugarse bien en el todos contra todos; naranja
  // lo demás, que se juega igual (vuelta 105).
  const grave = todos.some((f) => f.startsWith('todos contra todos'))
  const aviso = $('barra-salidas')
  aviso.hidden = !todos.length
  aviso.className = `dato ${grave ? 'mal' : 'aprieta'}`
  aviso.textContent = todos.length ? `salidas · ${todos.join(' · ')}` : ''
  for (const id of ['salidas-aviso', 'salidas-aviso-duelo']) {
    $(id).hidden = !todos.length
    $(id).className = `nota ${grave ? 'mal' : 'aprieta'}`
    $(id).textContent = todos.length
      ? `Salidas: ${todos.join('; ')}. `
        + 'En el todos contra todos se añaden en la hoja Duelo y se separan con algo en medio; en equipos, aparta la salida de las paredes o de los desniveles.'
      : ''
  }
}

/**
 * **Qué salidas del todos contra todos se ven entre sí**, con el mismo rayo que
 * la aparición y contra el mapa entero —ocultar una pieza no puede cambiar el
 * veredicto—. La llaman «Medir» y el aviso de la barra (vuelta 105): una sola
 * cuenta, o el botón y el aviso podrían decir cosas distintas.
 */
function salidasQueSeVen(salidas) {
  const ojos = 1.7
  const seVen = []
  let cerca = Infinity
  for (let i = 0; i < salidas.length; i++) {
    for (let j = i + 1; j < salidas.length; j++) {
      const a = salidas[i]
      const b = salidas[j]
      cerca = Math.min(cerca, Math.hypot(b.x - a.x, b.z - a.z))
      if (escenarioMedido && hasLineOfSight(
        new THREE.Vector3(a.x, ojos, a.z), new THREE.Vector3(b.x, ojos, b.z), escenarioMedido.occluders,
      )) seVen.push(`${i + 1}–${j + 1}`)
    }
  }
  return { seVen, cerca, pares: (salidas.length * (salidas.length - 1)) / 2 }
}

function remontar() {
  if (escenarioMedido && escenarioMedido !== escenario) escenarioMedido.dispose()
  escenario?.dispose()
  escenario = new Scenario(scene, mapaParaDibujar())
  escenarioMedido = ocultos.size === 0 ? escenario : new Scenario(escenaDeMentira, mapa)
  setRoom(escenario.room)
  medirFaltasDeSalidas(escenarioMedido)

  proxies.clear()
  // Y estos se sueltan de verdad: `remontar` corre en cada arrastre, así que una
  // geometría por fotograma sin soltar es memoria que sólo sube.
  for (const hijo of fantasmas.children) { hijo.geometry.dispose(); hijo.material.dispose() }
  fantasmas.clear()
  for (const [indice, pieza] of mapa.boxes.entries()) {
    const alto = coverHeight(pieza.kind)
    const base = pieza.base ? coverHeight(pieza.base) : 0
    // **Un oculto tampoco se pincha** (vuelta 96): una pieza invisible que sigue
    // robando el clic es peor que una visible. El índice de los demás no se mueve
    // porque va escrito en el proxy y no es su posición en el grupo.
    if (estaOculto('boxes', indice)) continue
    const malla = new THREE.Mesh(new THREE.BoxGeometry(pieza.w, alto - base, pieza.d), materialProxy)
    malla.position.set(pieza.x + pieza.w / 2, base + (alto - base) / 2, pieza.z + pieza.d / 2)
    malla.userData.indice = indice
    proxies.add(malla)

    /**
     * **Y lo que el juego no dibuja, el editor sí** (vuelta 96). Una barrera
     * invisible no tiene malla en `Scenario` a propósito —es su razón de ser— y
     * eso dejaba una pieza que **desaparece del editor al deseleccionarla**: para
     * volver a dar con ella había que pinchar a ciegas donde el jugador se choca,
     * que es exactamente el segundo agujero que la vuelta 81 cerró con la lista
     * de dispositivos, por la otra puerta.
     *
     * Va como **contorno y no como caja translúcida**: sin luces, la silueta es
     * lo único que dice dónde está un plano (vuelta 38), y una caja rellena aquí
     * se confundiría con un cristal — que es la otra variante, y la diferencia
     * entre las dos es justo lo que hay que poder ver. Y no es geometría: fuera
     * de `proxies` y fuera de `pinchables`, porque el clic ya lo recoge el proxy
     * de arriba como en cualquier pieza.
     */
    if (pieza.barrera === 'invisible') {
      const aristas = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(pieza.w, alto - base, pieza.d)),
        new THREE.LineBasicMaterial({
          color: COVER.barrera.color, transparent: true, opacity: 0.55,
        }),
      )
      aristas.position.copy(malla.position)
      fantasmas.add(aristas)
    }
  }

  marcaSpawn.position.set(mapa.spawn.x, 0.9, mapa.spawn.z)
  // **Con fondo puesto, la rejilla de los muros no se dibuja** (vuelta 78):
  // aquí igual que jugando, porque lo que se ve editando tiene que ser lo que
  // se ve jugando.
  setMuros(!escenario.tieneFondo)
  pintarMarcas()
  pintarContorno()
  pintarLaseres()
  medirPresupuesto()
}

function pintarContorno() {
  pintarLaseres()
  const pieza = mapa.boxes[seleccion]
  contorno.visible = Boolean(pieza)
  pintarGizmoDePieza(pieza)
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
/** La pieza que había bajo el clic derecho, hasta saber si fue clic o arrastre. */
let candidatoApilar = -1

function aRejilla(v) {
  // Se redondea al paso y se limpia la coma flotante: 0.1 × 3 no es 0.3, y
  // una caja en 0.30000000000000004 ensucia el fichero y las comparaciones.
  return Number((Math.round(v / paso) * paso).toFixed(4))
}

/**
 * **Dónde nace algo nuevo: delante de la cámara y dentro de la sala** (vuelta
 * 96). Un solo sitio para todo lo colocable —cajas, prismas, tubos, rampas,
 * escaleras, estampados y los cinco dispositivos—, que es lo que se pidió.
 *
 * Lo de «delante de la cámara» ya lo hacían todos, y es correcto: un objeto que
 * nace en el origen es un objeto que hay que ir a buscar (vuelta 81). Lo que
 * faltaba es la otra mitad, y se reportó en un mapa de 50×50 **con la cámara
 * dentro**: el centro de órbita se mueve con el vuelo y no está acotado, así que
 * en cuanto se mira desde fuera del recinto —o desde encima de una esquina— lo
 * que se coloca nace fuera de la sala, donde no se puede jugar y donde el
 * saneado no dice nada porque un mapa puede tener piezas donde quiera.
 *
 * Se acota **la huella entera y no su esquina**, con `margen` de holgura contra
 * la pared: colocar algo mordiendo el muro es colocarlo a medias. Y si la huella
 * no cabe en la sala se centra, que es lo único que queda por decir.
 *
 * @param {number} ancho de la huella, en unidades
 * @param {number} fondo de la huella
 * @param {boolean} porElCentro `true` para lo que se sitúa por su centro —un
 *   tubo, un prisma, un estampado— y `false` para lo que va por su esquina
 *   mínima, que es la convención de una caja.
 */
function puntoParaColocar(ancho = 0, fondo = 0, porElCentro = false) {
  const sala = escenario?.room ?? scenarioRoom(mapa)
  const margen = 0.5
  const acotar = (centro, medida, mitadSala) => {
    const media = medida / 2
    const limite = mitadSala - margen - media
    // Si no cabe, al centro: es lo único honesto, y se ve.
    const c = limite <= 0 ? 0 : Math.min(Math.max(centro, -limite), limite)
    return aRejilla(porElCentro ? c : c - media)
  }
  return {
    x: acotar(orbita.centro.x, ancho, sala.width / 2),
    z: acotar(orbita.centro.z, fondo, sala.depth / 2),
  }
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
    /**
     * **El clic derecho sobre una pieza la apila** (vuelta 78). Apilar es la
     * acción que más se usa construyendo en altura y estaba enterrada en una
     * sección del panel; aquí es el mismo gesto con el que ya se está mirando
     * la pieza. Fuera de una pieza —que es casi toda la pantalla— el clic
     * derecho sigue siendo orbitar, que es lo que hace desde la vuelta 74.
     *
     * **Y se decide al soltar, no al pulsar** (vuelta 95). Apilar ocurría en el
     * `pointerdown`, así que **cualquier órbita que empiece con el puntero
     * encima de una pieza la apilaba** — y encima esa órbita no llegaba a
     * empezar, porque la rama salía con un `return`. En un mapa lleno eso es
     * media pantalla: se reportó como «una pieza se eleva flotando sin querer».
     *
     * La regla es la de cualquier gesto que puede ser un clic o un arrastre:
     * **quién es no se sabe hasta que el puntero se levanta**. Se orbita
     * siempre, se guarda la pieza candidata, y sólo si el puntero no se ha
     * movido cuenta como clic.
     */
    if (evento.button === 2) {
      const caja = lienzo.getBoundingClientRect()
      puntero.x = ((evento.clientX - caja.left) / caja.width) * 2 - 1
      puntero.y = -((evento.clientY - caja.top) / caja.height) * 2 + 1
      rayo.setFromCamera(puntero, camara)
      const debajo = rayo.intersectObjects(proxies.children, false)
      candidatoApilar = debajo.length > 0 ? debajo[0].object.userData.indice : -1
    }
    orbitando = {
      x: evento.clientX,
      y: evento.clientY,
      // De dónde salió, que es contra lo que se mide si hubo arrastre.
      x0: evento.clientX,
      y0: evento.clientY,
      pan: evento.button === 1 || evento.shiftKey,
    }
    return
  }
  if (evento.button !== 0) return

  const caja = lienzo.getBoundingClientRect()
  puntero.x = ((evento.clientX - caja.left) / caja.width) * 2 - 1
  puntero.y = -((evento.clientY - caja.top) / caja.height) * 2 + 1
  rayo.setFromCamera(puntero, camara)

  /**
   * **Un solo rayo y una prioridad, no dos pasadas.** Piezas y marcadores se
   * miran a la vez y gana el de más prioridad; a igualdad, el más cercano. Con
   * dos pasadas —marcadores primero, piezas después— un área que envuelve medio
   * mapa deja todas esas piezas inalcanzables, que es lo que pasaba.
   */
  const tiradores = gizmoPieza.visible ? tiradoresDePieza : []
  const tocadas = rayo
    .intersectObjects([...tiradores, ...pinchables, ...proxies.children], false)
    .map((h) => ({ hit: h, prioridad: h.object.userData.marca?.prioridad ?? PRIORIDAD.pieza }))
    .sort((a, b) => b.prioridad - a.prioridad || a.hit.distance - b.hit.distance)

  if (tocadas.length === 0) { elegir(-1); return }
  const elegido = tocadas[0].hit.object
  const punto = enSuelo(evento)

  const marca = elegido.userData.marca

  /**
   * **Un tirador de la pieza no cambia lo elegido.** Va por delante de
   * `elegirMarca` a propósito: ése apaga la selección (`seleccion = -1`) para
   * editar una cosa a la vez, y aquí la cosa que se edita **es** la pieza
   * elegida. Sin esta rama, pinchar su propia esquina la deseleccionaba y el
   * gizmo desaparecía debajo del dedo.
   */
  if (marca?.que?.startsWith('pieza-')) {
    const pieza = mapa.boxes[seleccion]
    if (punto && pieza) {
      anotarParaDeshacer()
      arrastrando = comenzarArrastreDePieza(marca, pieza, punto, evento)
    }
    return
  }

  /**
   * **La flecha de una superficie es de su pieza** (vuelta 80), así que
   * agarrarla **elige la pieza** en vez de apagar la selección: los números
   * que se están moviendo viven en su ficha. Es la misma rama que la de los
   * tiradores de la 79, y por el mismo motivo.
   */
  if (marca?.que?.startsWith('sup-')) {
    elegir(marca.i)
    if (punto) {
      anotarParaDeshacer()
      arrastrando = comenzarArrastreDeMarca(marca, punto)
    }
    return
  }

  if (marca) {
    elegirMarca(marca)
    if (punto) {
      anotarParaDeshacer()
      arrastrando = comenzarArrastreDeMarca(marca, punto)
    }
    return
  }

  elegir(elegido.userData.indice)
  const pieza = mapa.boxes[seleccion]
  if (punto && pieza) {
    // Se anota **al empezar el arrastre**, no en cada movimiento del ratón:
    // deshacer tiene que volver a donde estaba la caja, no un píxel atrás.
    anotarParaDeshacer()
    arrastrando = { que: 'pieza', dx: pieza.x - punto.x, dz: pieza.z - punto.z }
  }
})

/**
 * **Estirar y girar la pieza elegida, con la esquina opuesta clavada.**
 *
 * Lo que se guarda al empezar es el **ancla**: la esquina de enfrente de la que
 * se agarra. Estirar es entonces una resta contra ese punto fijo, y es lo que
 * distingue un tirador de esquina de un escalado —que mueve las dos caras—.
 */
function comenzarArrastreDePieza(marca, pieza, punto, evento) {
  if (marca.que === 'pieza-esquina') {
    const [ex, ez] = ESQUINAS[marca.esquina]
    return {
      que: 'pieza-esquina',
      // El ancla es la esquina diagonalmente opuesta, en coordenadas del mundo.
      anclaX: pieza.x + (1 - ex) * pieza.w,
      anclaZ: pieza.z + (1 - ez) * pieza.d,
    }
  }
  if (marca.que === 'pieza-alto') {
    return { que: 'pieza-alto', y0: evento.clientY, kind0: pieza.kind }
  }
  if (marca.que === 'pieza-uniforme') {
    // Se clava la esquina mínima, como un tirador de esquina clava la opuesta.
    const base = pieza.base ? coverHeight(pieza.base) : 0
    return {
      que: 'pieza-uniforme',
      anclaX: pieza.x,
      anclaZ: pieza.z,
      w0: pieza.w,
      d0: pieza.d,
      alto0: coverHeight(pieza.kind) - base,
      base,
    }
  }
  if (marca.que === 'pieza-giro') {
    const cx = pieza.x + pieza.w / 2
    const cz = pieza.z + pieza.d / 2
    return {
      que: 'pieza-giro',
      cx,
      cz,
      angulo0: Math.atan2(punto.z - cz, punto.x - cx),
      w0: pieza.w,
      d0: pieza.d,
    }
  }
  return null
}

/**
 * Un arrastre de tirador de pieza, resuelto contra el mapa. Vive al lado de
 * `moverMarca` y por la misma razón: la rejilla se aplica aquí, en un sitio.
 */
function moverTiradorDePieza(arrastre, punto, evento) {
  const pieza = mapa.boxes[seleccion]
  if (!pieza) return

  if (arrastre.que === 'pieza-esquina') {
    // De las dos esquinas —la clavada y la del puntero— salen los cuatro
    // números: la mínima es el origen y la diferencia es el tamaño. Escrito
    // así, arrastrar **más allá** del ancla no da un ancho negativo: da una
    // caja del otro lado, que es lo que hace cualquier editor.
    const x = aRejilla(punto.x)
    const z = aRejilla(punto.z)
    const w = Math.max(Math.abs(x - arrastre.anclaX), paso)
    const d = Math.max(Math.abs(z - arrastre.anclaZ), paso)
    pieza.w = Number(w.toFixed(4))
    pieza.d = Number(d.toFixed(4))
    pieza.x = Number((x < arrastre.anclaX ? arrastre.anclaX - w : arrastre.anclaX).toFixed(4))
    pieza.z = Number((z < arrastre.anclaZ ? arrastre.anclaZ - d : arrastre.anclaZ).toFixed(4))
    return
  }

  if (arrastre.que === 'pieza-alto') {
    /**
     * **Se elige escalón, no se estira.** El gesto es vertical y la pantalla
     * cuenta hacia abajo, así que subir el ratón sube la pieza. Cuánto cuesta
     * un escalón sale de la propia escalera —del alto de fábrica al siguiente—
     * y no de un número suelto: con `COVER` afinado, el gesto se afina con él.
     */
    const escalones = Object.entries(COVER.heights).sort((a, b) => a[1] - b[1])
    const base = pieza.base ? coverHeight(pieza.base) : 0
    const i0 = Math.max(escalones.findIndex(([k]) => k === arrastre.kind0), 0)
    const salto = Math.round((arrastre.y0 - evento.clientY) / GIZMO.pixelesPorEscalon)
    const i = Math.min(Math.max(i0 + salto, 0), escalones.length - 1)
    const [clave, alto] = escalones[i]
    // Un alto por debajo de su propia base sería una caja invertida.
    if (alto > base) pieza.kind = clave
    return
  }

  if (arrastre.que === 'pieza-uniforme') {
    /**
     * **Un solo factor, y sale de la proyección sobre la diagonal.** Tomar el
     * cociente de un eje haría que arrastrar en paralelo al otro no hiciera
     * nada; proyectar el puntero sobre la diagonal original da 1 exactamente en
     * la esquina de partida y crece tirando hacia fuera, que es el gesto.
     */
    const { anclaX, anclaZ, w0, d0, alto0, base } = arrastre
    const f = Math.max(
      ((punto.x - anclaX) * w0 + (punto.z - anclaZ) * d0) / (w0 * w0 + d0 * d0),
      0,
    )
    /**
     * **Y los dos lados cuadran a la rejilla, aunque eso cueste décimas de
     * proporción.** Lo contrario —cuadrar el lado largo y derivar el corto—
     * deja el corto fuera de la rejilla, y que lo que el fichero declara esté
     * en la rejilla es la ley del editor desde la 76. Con el paso a 1/10 la
     * proporción se conserva a una décima.
     */
    const w = Math.max(aRejilla(w0 * f), paso)
    const d = Math.max(aRejilla(d0 * f), paso)
    pieza.w = Number(w.toFixed(4))
    pieza.d = Number(d.toFixed(4))
    // El alto va al escalón más cercano al que pide el factor: es una palabra
    // de `COVER.heights` y eso no lo abre este tirador (vuelta 79).
    const escalones = Object.entries(COVER.heights)
      .filter(([, y]) => y > base)
      .sort((a, b) => a[1] - b[1])
    if (escalones.length) {
      const pedido = base + alto0 * f
      const [clave] = escalones.reduce(
        (mejor, act) => (Math.abs(act[1] - pedido) < Math.abs(mejor[1] - pedido) ? act : mejor),
      )
      pieza.kind = clave
    }
    return
  }

  if (arrastre.que === 'pieza-giro') {
    const angulo = Math.atan2(punto.z - arrastre.cz, punto.x - arrastre.cx)
    const cuartos = Math.round((angulo - arrastre.angulo0) / (Math.PI / 2))
    const gira = Math.abs(cuartos % 2) === 1
    const w = gira ? arrastre.d0 : arrastre.w0
    const d = gira ? arrastre.w0 : arrastre.d0
    // El centro se queda donde estaba: girar una pieza no la muda de sitio.
    pieza.w = w
    pieza.d = d
    pieza.x = aRejilla(arrastre.cx - w / 2)
    pieza.z = aRejilla(arrastre.cz - d / 2)
  }
}

/** Qué guarda cada tipo de arrastre para que el movimiento sea relativo. */
function comenzarArrastreDeMarca(marca, punto) {
  if (marca.que === 'spawn') {
    return { que: 'spawn', dx: mapa.spawn.x - punto.x, dz: mapa.spawn.z - punto.z }
  }
  if (marca.que === 'salida') {
    const s = salidasDe()[marca.i]
    return { que: 'salida', i: marca.i, dx: s.x - punto.x, dz: s.z - punto.z }
  }
  if (marca.que === 'rumbo') return { que: 'rumbo', i: marca.i }
  if (marca.que === 'todos') {
    const s = salidasDeTodosLeer()[marca.i]
    return { que: 'todos', i: marca.i, dx: s.x - punto.x, dz: s.z - punto.z }
  }
  if (marca.que === 'todos-rumbo') return { que: 'todos-rumbo', i: marca.i }
  if (marca.que === 'peana') {
    const pe = peanasDe()[marca.i]
    return { que: 'peana', i: marca.i, dx: pe.x - punto.x, dz: pe.z - punto.z }
  }
  if (marca.que === 'caja') return { que: 'caja' }
  if (marca.que === 'zona') {
    const z = mapa.spawnZone[marca.i]
    return { que: 'zona', i: marca.i, dx: z.x - punto.x, dz: z.z - punto.z }
  }
  if (marca.que === 'zona-esquina') return { que: 'zona-esquina', i: marca.i }
  if (marca.que === 'sup-fuerza' || marca.que === 'sup-flecha') {
    return { que: marca.que, i: marca.i }
  }
  if (marca.que === 'tp') {
    const tp = teletransportesDe()[marca.i]
    return { que: 'tp', i: marca.i, dx: tp.x - punto.x, dz: tp.z - punto.z }
  }
  if (marca.que === 'tp-destino') {
    const tp = teletransportesDe()[marca.i]
    return { que: 'tp-destino', i: marca.i, dx: tp.destino.x - punto.x, dz: tp.destino.z - punto.z }
  }
  if (marca.que === 'tp-esquina' || marca.que === 'tp-rumbo') {
    return { que: marca.que, i: marca.i }
  }
  if (marca.que === 'vent') {
    const v = ventiladoresDe()[marca.i]
    return { que: 'vent', i: marca.i, dx: v.x - punto.x, dz: v.z - punto.z }
  }
  if (marca.que === 'vent-esquina' || marca.que === 'vent-alto' || marca.que === 'vent-fuerza') {
    return { que: marca.que, i: marca.i }
  }
  if (marca.que === 'tiro-a' || marca.que === 'tiro-b') {
    const t = tirolinasDe()[marca.i]
    const p = marca.que === 'tiro-a' ? t.desde : t.hasta
    return { que: marca.que, i: marca.i, dx: p.x - punto.x, dz: p.z - punto.z }
  }
  if (marca.que === 'tiro-a-alto' || marca.que === 'tiro-b-alto') {
    return { que: marca.que, i: marca.i }
  }
  if (marca.que === 'prisma') {
    const p = prismasDe()[marca.i]
    return { que: 'prisma', i: marca.i, dx: p.x - punto.x, dz: p.z - punto.z }
  }
  if (marca.que === 'prisma-giro') {
    const p = prismasDe()[marca.i]
    return {
      que: 'prisma-giro',
      i: marca.i,
      giro0: p.giro ?? 0,
      angulo0: Math.atan2(punto.z - p.z, punto.x - p.x),
    }
  }
  if (marca.que === 'prisma-esquina' || marca.que === 'prisma-alto') {
    return { que: marca.que, i: marca.i }
  }
  if (marca.que === 'tubo') {
    const t = tubosDe()[marca.i]
    return { que: 'tubo', i: marca.i, dx: t.x - punto.x, dz: t.z - punto.z }
  }
  if (marca.que === 'tubo-radio' || marca.que === 'tubo-alto') {
    return { que: marca.que, i: marca.i }
  }
  if (marca.que === 'rampa') {
    const r = rampasDe()[marca.i]
    return { que: 'rampa', i: marca.i, dx: r.x - punto.x, dz: r.z - punto.z }
  }
  if (marca.que === 'escalera') {
    const e = escalerasDe()[marca.i]
    return { que: 'escalera', i: marca.i, dx: e.x - punto.x, dz: e.z - punto.z }
  }
  if (MARCAS_DE_RAMPA.has(marca.que) || MARCAS_DE_ESCALERA.has(marca.que)) {
    return { que: marca.que, i: marca.i }
  }
  if (marca.que === 'est') {
    const e = estampadosDe()[marca.i]
    return { que: 'est', i: marca.i, dx: e.x - punto.x, dz: e.z - punto.z }
  }
  if (MARCAS_DE_ESTAMPADO.has(marca.que)) return { que: marca.que, i: marca.i }
  return null
}

/**
 * **Mover un marcador es escribir en el mapa, y nada más.** Igual que
 * `colocar` con una pieza: la rejilla se aplica aquí, el dato queda escrito y
 * el repintado lo hace el frame siguiente. Los campos del panel se escriben
 * solos porque salen del mismo dato.
 */
function moverMarca(arrastre, punto) {
  if (arrastre.que === 'spawn') {
    mapa.spawn = {
      ...mapa.spawn,
      x: aRejilla(punto.x + arrastre.dx),
      z: aRejilla(punto.z + arrastre.dz),
    }
    return
  }
  if (arrastre.que === 'salida') {
    const s = salidasDe()[arrastre.i]
    s.x = aRejilla(punto.x + arrastre.dx)
    s.z = aRejilla(punto.z + arrastre.dz)
    return
  }
  if (arrastre.que === 'todos') {
    const s = salidasDeTodosLeer()[arrastre.i]
    if (!s) return
    s.x = aRejilla(punto.x + arrastre.dx)
    s.z = aRejilla(punto.z + arrastre.dz)
    return
  }
  if (arrastre.que === 'peana') {
    const pe = peanasDe()[arrastre.i]
    if (!pe) return
    pe.x = aRejilla(punto.x + arrastre.dx)
    pe.z = aRejilla(punto.z + arrastre.dz)
    return
  }
  if (arrastre.que === 'todos-rumbo') {
    const s = salidasDeTodosLeer()[arrastre.i]
    if (!s) return
    // El mismo rumbo que una salida de duelo: `atan2(−dx, −dz)`, a grados enteros.
    const dx = punto.x - s.x
    const dz = punto.z - s.z
    if (Math.hypot(dx, dz) < 0.2) return
    s.yaw = aRadianes(Math.round((Math.atan2(-dx, -dz) * 180) / Math.PI))
    return
  }
  if (arrastre.que === 'rumbo') {
    const s = salidasDe()[arrastre.i]
    // El rumbo que apunta de la salida al puntero. `atan2(−dx, −dz)` porque una
    // cámara mira a −Z con yaw 0: escribirlo al revés es el error de 180° de la
    // vuelta 60, aquí en forma de un jugador que sale de espaldas.
    const dx = punto.x - s.x
    const dz = punto.z - s.z
    if (Math.hypot(dx, dz) < 0.2) return
    // Se cuadra a grados enteros: un rumbo con siete decimales no es más
    // preciso, es un fichero que no se lee.
    const grados = Math.round((Math.atan2(-dx, -dz) * 180) / Math.PI)
    s.yaw = aRadianes(grados)
    return
  }
  if (arrastre.que === 'caja') {
    const s = salidasDe()[0]
    const lado = Math.max(aRejilla(Math.max(Math.abs(punto.x - s.x), Math.abs(punto.z - s.z)) * 2), 1)
    dueloDe().cajaCompra = { ancho: lado, fondo: lado }
    return
  }
  const zona = mapa.spawnZone?.[arrastre.i ?? 0]
  if (!zona) return
  if (arrastre.que === 'zona') {
    zona.x = aRejilla(punto.x + arrastre.dx)
    zona.z = aRejilla(punto.z + arrastre.dz)
    return
  }
  if (arrastre.que === 'zona-esquina') {
    // Se estira desde la esquina mínima, que es la que ancla la caja: el ancho
    // nunca baja de un paso, o la zona desaparecería al pasar de largo.
    zona.w = Math.max(aRejilla(punto.x - zona.x), paso)
    zona.d = Math.max(aRejilla(punto.z - zona.z), paso)
  }
}

/**
 * **Arrastrar una superficie o un teletransporte.** Vive al lado de
 * `moverMarca` y por lo mismo: la rejilla se aplica aquí, en un sitio.
 */
function moverMarcaDeSuperficie(arrastre, punto, evento) {
  if (arrastre.que === 'sup-fuerza') {
    /**
     * **La flecha vertical de un rebote se estira con el ratón en pantalla.**
     * El suelo no sirve para esto: un rayo contra el plano y=0 no dice nada de
     * una altura. Lo que se usa es cuánto ha subido el puntero, que es el
     * mismo gesto que el tirador del alto de una pieza (vuelta 79).
     */
    const sup = mapa.boxes[arrastre.i]?.superficie
    if (!sup) return
    if (arrastre.y0 === undefined) { arrastre.y0 = evento.clientY; arrastre.f0 = sup.fuerza }
    const delta = (arrastre.y0 - evento.clientY) / GIZMO.pixelesPorEscalon
    sup.fuerza = Number(Math.min(Math.max(arrastre.f0 + delta, 0.1), SURFACES.fuerzaMax).toFixed(2))
    return
  }
  if (arrastre.que === 'sup-flecha') {
    // **Un solo tirador pone las dos cosas**: el ángulo es el rumbo y la
    // distancia al centro de la pieza es la fuerza.
    const pieza = mapa.boxes[arrastre.i]
    const sup = pieza?.superficie
    if (!sup) return
    const cx = pieza.x + pieza.w / 2
    const cz = pieza.z + pieza.d / 2
    const dx = punto.x - cx
    const dz = punto.z - cz
    const largo = Math.hypot(dx, dz)
    if (largo < 0.2) return
    sup.rumbo = aRadianes(Math.round((Math.atan2(-dx, -dz) * 180) / Math.PI))
    sup.fuerza = Number(Math.min(Math.max(largo / LARGO_POR_FUERZA, 0.1), SURFACES.fuerzaMax).toFixed(2))
    return
  }

  const tp = teletransportesDe()[arrastre.i]
  if (!tp) return
  if (arrastre.que === 'tp') {
    tp.x = aRejilla(punto.x + arrastre.dx)
    tp.z = aRejilla(punto.z + arrastre.dz)
    return
  }
  if (arrastre.que === 'tp-esquina') {
    tp.w = Math.max(aRejilla(punto.x - tp.x), paso)
    tp.d = Math.max(aRejilla(punto.z - tp.z), paso)
    return
  }
  if (arrastre.que === 'tp-destino') {
    tp.destino.x = aRejilla(punto.x + arrastre.dx)
    tp.destino.z = aRejilla(punto.z + arrastre.dz)
    return
  }
  if (arrastre.que === 'tp-rumbo') {
    const dx = punto.x - tp.destino.x
    const dz = punto.z - tp.destino.z
    if (Math.hypot(dx, dz) < 0.2) return
    tp.destino.yaw = aRadianes(Math.round((Math.atan2(-dx, -dz) * 180) / Math.PI))
  }
}

/**
 * **Arrastrar un prisma.** Los tres gestos de una pieza (vuelta 79) más el que
 * allí no podía existir: **girar a cualquier ángulo**.
 */
function moverMarcaDePrisma(arrastre, punto, evento) {
  const p = prismasDe()[arrastre.i]
  if (!p) return
  if (arrastre.que === 'prisma') {
    p.x = aRejilla(punto.x + arrastre.dx)
    p.z = aRejilla(punto.z + arrastre.dz)
    return
  }
  if (arrastre.que === 'prisma-esquina') {
    /**
     * **Se estira en los ejes del prisma**, no en los del mundo: el puntero se
     * lleva a coordenadas locales, y de ahí salen el semiancho y el semifondo.
     * El centro se queda clavado, que es lo que distingue esto de la esquina
     * de una caja —allí se ancla la esquina opuesta porque `x`/`z` es la
     * mínima; aquí `x`/`z` **es el centro**, así que anclarlo es lo coherente
     * y además es lo único que deja girar y estirar sin pelearse.
     */
    const cos = Math.cos(p.giro ?? 0)
    const sen = Math.sin(p.giro ?? 0)
    const dx = punto.x - p.x
    const dz = punto.z - p.z
    const localX = dx * cos + dz * sen
    const localZ = -dx * sen + dz * cos
    p.w = Number(Math.max(aRejilla(Math.abs(localX) * 2), paso).toFixed(4))
    p.d = Number(Math.max(aRejilla(Math.abs(localZ) * 2), paso).toFixed(4))
    return
  }
  if (arrastre.que === 'prisma-alto') {
    // La misma escalera que una pieza: el alto no es un número libre, es una
    // palabra de `COVER.heights`.
    if (arrastre.y0 === undefined) { arrastre.y0 = evento.clientY; arrastre.kind0 = p.kind }
    const escalones = Object.entries(COVER.heights).sort((a, b) => a[1] - b[1])
    const base = p.base ? coverHeight(p.base) : 0
    const i0 = Math.max(escalones.findIndex(([k]) => k === arrastre.kind0), 0)
    const salto = Math.round((arrastre.y0 - evento.clientY) / GIZMO.pixelesPorEscalon)
    const i = Math.min(Math.max(i0 + salto, 0), escalones.length - 1)
    const [clave, alto] = escalones[i]
    if (alto > base) p.kind = clave
    return
  }
  if (arrastre.que === 'prisma-giro') {
    /**
     * **Y aquí el aro NO cuadra a 90°**, que es la diferencia entera de esta
     * vuelta. En una caja se cuadra porque la colisión no sabe girar y un aro
     * libre prometería un gesto sin efecto (vuelta 79); un prisma se choca
     * exactamente como se ve, así que recortarlo sería quitar a mano lo que se
     * acaba de construir.
     *
     * Lo que sí se cuadra es a **grados enteros**, como el rumbo de una salida:
     * un ángulo con siete decimales no es más preciso, es un fichero que no se
     * lee.
     */
    const angulo = Math.atan2(punto.z - p.z, punto.x - p.x)
    const grados = Math.round(((arrastre.giro0 + angulo - arrastre.angulo0) * 180) / Math.PI)
    p.giro = aRadianes(((grados % 360) + 540) % 360 - 180)
  }
}

/**
 * **Arrastrar un ventilador.** Cuatro gestos, y los dos que miden altura van
 * con el ratón en pantalla y no contra el suelo, por lo mismo que la flecha de
 * un rebote (vuelta 80): un rayo contra el plano y=0 no dice nada de una
 * altura.
 */
function moverMarcaDeVentilador(arrastre, punto, evento) {
  const v = ventiladoresDe()[arrastre.i]
  if (!v) return
  if (arrastre.que === 'vent') {
    v.x = aRejilla(punto.x + arrastre.dx)
    v.z = aRejilla(punto.z + arrastre.dz)
    return
  }
  if (arrastre.que === 'vent-esquina') {
    v.w = Math.max(aRejilla(punto.x - v.x), paso)
    v.d = Math.max(aRejilla(punto.z - v.z), paso)
    return
  }
  if (arrastre.que === 'vent-alto') {
    if (arrastre.y0 === undefined) { arrastre.y0 = evento.clientY; arrastre.a0 = v.alto }
    const delta = (arrastre.y0 - evento.clientY) / GIZMO.pixelesPorEscalon
    v.alto = Number(Math.min(Math.max(arrastre.a0 + delta, 0.5), FANS.altoMax).toFixed(2))
    return
  }
  if (arrastre.que === 'vent-fuerza') {
    if (arrastre.y0 === undefined) { arrastre.y0 = evento.clientY; arrastre.f0 = v.fuerza }
    const delta = (arrastre.y0 - evento.clientY) / GIZMO.pixelesPorEscalon
    v.fuerza = Number(Math.min(Math.max(arrastre.f0 + delta, 0.1), FANS.fuerzaMax).toFixed(2))
  }
}

/**
 * **Arrastrar una tirolina.** Dos anclajes, dos gestos cada uno: la bola por el
 * suelo y su cubo para la altura.
 *
 * La altura **no se cuadra a la rejilla**: un cable va de una cornisa a otra y
 * lo que hace falta es poder ponerlo justo encima de la cabeza de quien pasa
 * por debajo, no en números redondos. Lo que sí se redondea son dos decimales,
 * que es lo que evita un fichero con `7.400000000000001`.
 */
function moverMarcaDeTirolina(arrastre, punto, evento) {
  const t = tirolinasDe()[arrastre.i]
  if (!t) return
  const cual = arrastre.que.startsWith('tiro-a') ? 'desde' : 'hasta'
  const p = t[cual]
  if (arrastre.que === 'tiro-a' || arrastre.que === 'tiro-b') {
    p.x = aRejilla(punto.x + arrastre.dx)
    p.z = aRejilla(punto.z + arrastre.dz)
    return
  }
  if (arrastre.y0 === undefined) { arrastre.y0 = evento.clientY; arrastre.h0 = p.y }
  const delta = (arrastre.y0 - evento.clientY) / GIZMO.pixelesPorEscalon
  p.y = Number(Math.max(arrastre.h0 + delta, 0.2).toFixed(2))
}

/**
 * **Arrastrar un tubo.** Tres gestos y ninguno es un modo: el cuerpo lo mueve,
 * el tirador del suelo le da radio y el de arriba le da alto. Girarlo no está
 * porque **no significaría nada**: un anillo de revolución girado es el mismo
 * anillo. Es la misma respuesta que el aro de la vuelta 79 da al revés —allí
 * girar cambia la colisión, aquí no la cambiaría—, y el día que un tubo tenga
 * puerta, girarlo pasará a significar por dónde se entra.
 */
function moverMarcaDeTubo(arrastre, punto, evento) {
  const tubo = tubosDe()[arrastre.i]
  if (!tubo) return
  if (arrastre.que === 'tubo') {
    tubo.x = aRejilla(punto.x + arrastre.dx)
    tubo.z = aRejilla(punto.z + arrastre.dz)
    return
  }
  if (arrastre.que === 'tubo-radio') {
    // Se tira del borde **exterior**, así que lo que se escribe es el hueco:
    // el radio libre es la distancia menos la pared.
    const fuera = Math.hypot(punto.x - tubo.x, punto.z - tubo.z)
    tubo.radio = Math.min(Math.max(aRejilla(fuera - tubo.grosor), TUBES.radioMin), TUBES.radioMax)
    return
  }
  if (arrastre.que === 'tubo-alto') {
    if (arrastre.y0 === undefined) { arrastre.y0 = evento.clientY; arrastre.a0 = tubo.alto }
    const delta = (arrastre.y0 - evento.clientY) / GIZMO.pixelesPorEscalon
    tubo.alto = Number(Math.min(Math.max(arrastre.a0 + delta, TUBES.altoMin), TUBES.altoMax).toFixed(2))
  }
}

/**
 * **Arrastrar una rampa.** Cuatro gestos, los mismos que una pieza y por el
 * mismo reparto (vuelta 79): el cuerpo la mueve, la esquina la estira, el cubo
 * de arriba recorre la escalera de `COVER.heights` y el aro **gira su subida de
 * noventa en noventa**.
 *
 * Lo que el aro cambia no es la huella: es **por dónde se sube**. Las cuatro
 * posiciones son las cuatro caras por las que se puede entrar, y se escriben
 * como el par de extremos que toca (`fromZ`/`toZ` o `fromX`/`toX`) — que es de
 * donde el motor deriva el eje (vuelta 93). Girar no la muda de sitio: la huella
 * se queda y sólo se reescribe la dirección.
 */
function moverMarcaDeRampa(arrastre, punto, evento) {
  const r = rampasDe()[arrastre.i]
  if (!r) return
  if (arrastre.que === 'rampa') {
    r.x = aRejilla(punto.x + arrastre.dx)
    r.z = aRejilla(punto.z + arrastre.dz)
    orientarRampa(r, rumboDeRampa(r))
    return
  }
  if (arrastre.que === 'rampa-esquina') {
    r.w = Math.max(aRejilla(punto.x - r.x), paso)
    r.d = Math.max(aRejilla(punto.z - r.z), paso)
    orientarRampa(r, rumboDeRampa(r))
    return
  }
  if (arrastre.que === 'rampa-alto') {
    // Como el cubo de una pieza: se **elige** escalón, porque `top` es una
    // palabra de `COVER.heights` y de ella cuelga la rampa de grises.
    if (arrastre.y0 === undefined) { arrastre.y0 = evento.clientY; arrastre.k0 = r.top }
    r.top = escalonVecino(arrastre.k0, (arrastre.y0 - evento.clientY) / GIZMO.pixelesPorEscalon)
    return
  }
  if (arrastre.que === 'rampa-giro') {
    if (arrastre.a0 === undefined) {
      arrastre.cx = r.x + r.w / 2
      arrastre.cz = r.z + r.d / 2
      arrastre.a0 = Math.atan2(punto.z - arrastre.cz, punto.x - arrastre.cx)
      arrastre.r0 = rumboDeRampa(r)
    }
    const angulo = Math.atan2(punto.z - arrastre.cz, punto.x - arrastre.cx)
    const cuartos = Math.round((angulo - arrastre.a0) / (Math.PI / 2))
    orientarRampa(r, (((arrastre.r0 + cuartos) % 4) + 4) % 4)
  }
}

/** Por qué cara sube una rampa, en cuartos: 0 hacia +Z, 1 +X, 2 −Z, 3 −X. */
function rumboDeRampa(r) {
  if (r.fromX !== undefined) return r.toX > r.fromX ? 1 : 3
  return r.toZ > r.fromZ ? 0 : 2
}

/** Reescribe los extremos de una rampa para que suba hacia ese cuarto. */
function orientarRampa(r, rumbo) {
  const minX = r.x
  const maxX = r.x + r.w
  const minZ = r.z
  const maxZ = r.z + r.d
  delete r.fromX; delete r.toX; delete r.fromZ; delete r.toZ
  if (rumbo === 0) { r.fromZ = minZ; r.toZ = maxZ }
  else if (rumbo === 2) { r.fromZ = maxZ; r.toZ = minZ }
  else if (rumbo === 1) { r.fromX = minX; r.toX = maxX }
  else { r.fromX = maxX; r.toX = minX }
}

/** El escalón de `COVER.heights` a `salto` pasos del que se dé. */
function escalonVecino(desde, salto) {
  const escalera = Object.entries(COVER.heights).sort((a, b) => a[1] - b[1])
  const i0 = Math.max(escalera.findIndex(([k]) => k === desde), 0)
  const i = Math.min(Math.max(i0 + Math.round(salto), 0), escalera.length - 1)
  return escalera[i][0]
}

/**
 * **Arrastrar una escalera.** El mismo reparto que la rampa, con dos
 * diferencias que salen del dato y no del gesto: su alto es **un número libre**
 * —no una palabra del vocabulario, porque lo que se apila son escalones y no una
 * cobertura— y la esquina escribe **ancho y huella**, que es lo que de verdad se
 * elige: cuántos escalones caben lo decide `COVER.stepHeight`.
 */
function moverMarcaDeEscalera(arrastre, punto, evento) {
  const e = escalerasDe()[arrastre.i]
  if (!e) return
  const enZ = e.rumbo === 0 || e.rumbo === 2
  const signo = e.rumbo === 0 || e.rumbo === 1 ? 1 : -1
  if (arrastre.que === 'escalera') {
    e.x = aRejilla(punto.x + arrastre.dx)
    e.z = aRejilla(punto.z + arrastre.dz)
    return
  }
  if (arrastre.que === 'escalera-esquina') {
    const n = medidasDeEscalera(e, COVER.stepHeight).escalones
    const ancho = enZ ? punto.x - e.x : punto.z - e.z
    const largo = signo * (enZ ? punto.z - e.z : punto.x - e.x)
    e.ancho = Math.min(Math.max(aRejilla(Math.abs(ancho)), ESCALERAS.anchoMin), ESCALERAS.anchoMax)
    e.huella = Number(Math.min(Math.max(Math.abs(largo) / n, ESCALERAS.huellaMin), ESCALERAS.huellaMax).toFixed(3))
    return
  }
  if (arrastre.que === 'escalera-alto') {
    if (arrastre.y0 === undefined) { arrastre.y0 = evento.clientY; arrastre.a0 = e.alto }
    const delta = (arrastre.y0 - evento.clientY) / GIZMO.pixelesPorEscalon
    e.alto = Number(Math.min(Math.max(arrastre.a0 + delta * 0.5, ESCALERAS.altoMin), ESCALERAS.altoMax).toFixed(2))
    return
  }
  if (arrastre.que === 'escalera-giro') {
    if (arrastre.a0 === undefined) {
      const m = medidasDeEscalera(e, COVER.stepHeight)
      arrastre.cx = enZ ? e.x + e.ancho / 2 : e.x + (signo * m.largo) / 2
      arrastre.cz = enZ ? e.z + (signo * m.largo) / 2 : e.z + e.ancho / 2
      arrastre.a0 = Math.atan2(punto.z - arrastre.cz, punto.x - arrastre.cx)
      arrastre.r0 = e.rumbo
    }
    const angulo = Math.atan2(punto.z - arrastre.cz, punto.x - arrastre.cx)
    const cuartos = Math.round((angulo - arrastre.a0) / (Math.PI / 2))
    e.rumbo = (((arrastre.r0 + cuartos) % 4) + 4) % 4
  }
}

/**
 * **Arrastrar un estampado.** Tres gestos: el cuadro lo mueve en planta, la
 * esquina le da tamaño y el cubo de arriba lo sube. El alto en Y va por su
 * tirador y no por el arrastre del cuadro porque **un logo se coloca en una
 * pared**: mover en planta y en altura con el mismo gesto es lo que deja un
 * estampado a medio metro del suelo sin querer.
 */
function moverMarcaDeEstampado(arrastre, punto, evento) {
  const e = estampadosDe()[arrastre.i]
  if (!e) return
  if (arrastre.que === 'est') {
    e.x = aRejilla(punto.x + arrastre.dx)
    e.z = aRejilla(punto.z + arrastre.dz)
    return
  }
  if (arrastre.que === 'est-esquina') {
    // El ancho se mide en el plano del cuadro, o sea en el eje que la cara deja
    // libre; el alto, con el ratón en vertical.
    const enX = e.cara === 'norte' || e.cara === 'sur' || e.cara === 'suelo' || e.cara === 'techo'
    const ancho = 2 * Math.abs(enX ? punto.x - e.x : punto.z - e.z)
    e.ancho = Number(Math.min(Math.max(ancho, ESTAMPADOS.anchoMin), ESTAMPADOS.anchoMax).toFixed(2))
    if (arrastre.y0 === undefined) { arrastre.y0 = evento.clientY; arrastre.a0 = e.alto }
    const delta = (evento.clientY - arrastre.y0) / GIZMO.pixelesPorEscalon
    e.alto = Number(Math.min(Math.max(arrastre.a0 + delta * 0.5, ESTAMPADOS.altoMin), ESTAMPADOS.altoMax).toFixed(2))
    return
  }
  if (arrastre.que === 'est-alto') {
    if (arrastre.y0 === undefined) { arrastre.y0 = evento.clientY; arrastre.v0 = e.y }
    const delta = (arrastre.y0 - evento.clientY) / GIZMO.pixelesPorEscalon
    e.y = Number(Math.max(arrastre.v0 + delta * 0.5, 0).toFixed(2))
    return
  }
  /**
   * **Escalar sin deformar es un factor, no dos números** (vuelta 95). Se mide
   * cuánto se aleja el puntero del centro **en pantalla** y eso multiplica a los
   * dos lados: el gesto es el de agarrar una esquina y tirar, y funciona igual
   * mire la cámara desde donde mire, que es lo que un punto del suelo no da
   * cuando el logo está en una pared.
   *
   * Y **el tope se aplica al factor, no a cada lado**: acotando ancho y alto por
   * separado, el primero que llegara a su límite dejaría de crecer y el otro
   * seguiría — o sea deformándolo justo en el tirador que existe para no
   * deformarlo.
   */
  if (arrastre.que === 'est-proporcion') {
    const centro = aPantalla(e.x, e.y, e.z)
    const d = Math.hypot(evento.clientX - centro.x, evento.clientY - centro.y)
    if (arrastre.d0 === undefined) {
      arrastre.d0 = Math.max(d, 1)
      arrastre.a0 = e.ancho
      arrastre.h0 = e.alto
    }
    const minimo = Math.max(ESTAMPADOS.anchoMin / arrastre.a0, ESTAMPADOS.altoMin / arrastre.h0)
    const maximo = Math.min(ESTAMPADOS.anchoMax / arrastre.a0, ESTAMPADOS.altoMax / arrastre.h0)
    const factor = Math.min(Math.max(d / arrastre.d0, minimo), maximo)
    e.ancho = Number((arrastre.a0 * factor).toFixed(2))
    e.alto = Number((arrastre.h0 * factor).toFixed(2))
    return
  }
  /**
   * **El aro gira el logo dentro de su pared.** El ángulo se mide **en
   * pantalla** alrededor del centro proyectado, y no en el mundo: el plano de un
   * estampado puede ser vertical, y un punto del suelo no dice nada de un ángulo
   * dentro de una pared.
   *
   * Se resta porque en pantalla la Y crece hacia abajo, así que el ángulo corre
   * al revés que el del plano. Lo que se paga y hay que saber: **mirándolo desde
   * detrás, el logo gira al contrario del ratón**, porque desde ahí su plano se
   * ve espejado. Es el mismo precio que tiene cualquier gizmo plano y se arregla
   * dando la vuelta a la cámara.
   */
  if (arrastre.que === 'est-giro') {
    const centro = aPantalla(e.x, e.y, e.z)
    const angulo = Math.atan2(evento.clientY - centro.y, evento.clientX - centro.x)
    if (arrastre.a0 === undefined) { arrastre.a0 = angulo; arrastre.g0 = e.giro ?? 0 }
    const paso = (ESTAMPADOS.giroPasoDeg * Math.PI) / 180
    const vuelta = Math.PI * 2
    const bruto = arrastre.g0 - (angulo - arrastre.a0)
    e.giro = (((Math.round(bruto / paso) * paso) % vuelta) + vuelta) % vuelta
  }
}

/** Lo que gobierna `moverMarcaDeEstampado`. */
const MARCAS_DE_ESTAMPADO = new Set(['est', 'est-esquina', 'est-proporcion', 'est-alto', 'est-giro'])

/** Lo que gobierna `moverMarcaDeRampa`. */
const MARCAS_DE_RAMPA = new Set(['rampa', 'rampa-esquina', 'rampa-alto', 'rampa-giro'])

/** Lo que gobierna `moverMarcaDeEscalera`. */
const MARCAS_DE_ESCALERA = new Set(['escalera', 'escalera-esquina', 'escalera-alto', 'escalera-giro'])

/** Lo que gobierna `moverMarcaDeTubo`. */
const MARCAS_DE_TUBO = new Set(['tubo', 'tubo-radio', 'tubo-alto'])

/** Lo que gobierna `moverMarcaDePrisma`. */
const MARCAS_DE_PRISMA = new Set(['prisma', 'prisma-esquina', 'prisma-alto', 'prisma-giro'])

/** Lo que gobierna `moverMarcaDeVentilador`. */
const MARCAS_DE_VENTILADOR = new Set(['vent', 'vent-esquina', 'vent-alto', 'vent-fuerza'])

/** Lo que gobierna `moverMarcaDeTirolina`. */
const MARCAS_DE_TIROLINA = new Set(['tiro-a', 'tiro-b', 'tiro-a-alto', 'tiro-b-alto'])

/** Lo que gobierna `moverMarcaDeSuperficie` y no `moverMarca`. */
const MARCAS_DE_SUPERFICIE = new Set([
  'sup-fuerza', 'sup-flecha', 'tp', 'tp-esquina', 'tp-destino', 'tp-rumbo',
])

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
  if (arrastrando.que === 'pieza') {
    colocar(seleccion, punto.x + arrastrando.dx, punto.z + arrastrando.dz)
    return
  }
  if (arrastrando.que?.startsWith('pieza-')) {
    moverTiradorDePieza(arrastrando, punto, evento)
    sucio = true
    pintarPanel()
    return
  }
  if (MARCAS_DE_PRISMA.has(arrastrando.que)) moverMarcaDePrisma(arrastrando, punto, evento)
  else if (MARCAS_DE_TUBO.has(arrastrando.que)) moverMarcaDeTubo(arrastrando, punto, evento)
  else if (MARCAS_DE_RAMPA.has(arrastrando.que)) moverMarcaDeRampa(arrastrando, punto, evento)
  else if (MARCAS_DE_ESCALERA.has(arrastrando.que)) moverMarcaDeEscalera(arrastrando, punto, evento)
  else if (MARCAS_DE_ESTAMPADO.has(arrastrando.que)) moverMarcaDeEstampado(arrastrando, punto, evento)
  else if (MARCAS_DE_VENTILADOR.has(arrastrando.que)) moverMarcaDeVentilador(arrastrando, punto, evento)
  else if (MARCAS_DE_TIROLINA.has(arrastrando.que)) moverMarcaDeTirolina(arrastrando, punto, evento)
  else if (MARCAS_DE_SUPERFICIE.has(arrastrando.que)) moverMarcaDeSuperficie(arrastrando, punto, evento)
  else moverMarca(arrastrando, punto)
  sucio = true
  refrescarPanel()
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

/**
 * Cuánto puede moverse el puntero y seguir siendo un clic. Cuatro píxeles es lo
 * que tiembla una mano al pulsar un botón del ratón; por encima de eso, quien
 * lo movió quería mover la cámara.
 */
const APILAR_UMBRAL_PX = 4

const soltar = (evento) => {
  if (candidatoApilar >= 0 && orbitando && evento) {
    const movido = Math.hypot(evento.clientX - orbitando.x0, evento.clientY - orbitando.y0)
    if (movido <= APILAR_UMBRAL_PX) {
      elegir(candidatoApilar)
      apilar()
    }
  }
  candidatoApilar = -1
  arrastrando = null
  orbitando = null
}
lienzo.addEventListener('pointerup', soltar)
// Un gesto cancelado por el navegador no es un clic: no apila.
lienzo.addEventListener('pointercancel', () => soltar(null))

lienzo.addEventListener('wheel', (evento) => {
  evento.preventDefault()
  orbita.radio = Math.min(Math.max(orbita.radio * (1 + Math.sign(evento.deltaY) * 0.1), 5), 400)
}, { passive: false })

// ---------------------------------------------------------------- panel

function elegir(indice) {
  const habia = marcaElegida
  seleccion = indice
  marcaElegida = null
  // **Si había una marca, sus tiradores se van** (vuelta 96): desde esta vuelta
  // los tiradores son de lo elegido, así que dejar de elegir tiene que
  // remontarlos. Sólo cuando hace falta — `pintarMarcas` rehace todos los grupos.
  if (habia) pintarMarcas()
  pintarResaltado()
  pintarContorno()
  pintarPanel()
}

/** Elegir un marcador apaga la pieza elegida: se edita una cosa a la vez. */
function elegirMarca(marca) {
  const antes = marcaElegida
  marcaElegida = { que: marca.que, i: marca.i ?? -1 }
  seleccion = -1
  // Y al revés: los de lo que se acaba de elegir tienen que aparecer. Se compara
  // el par entero, porque pinchar el mismo cuerpo dos veces no cambia nada.
  if (antes?.que !== marcaElegida.que || antes?.i !== marcaElegida.i) pintarMarcas()
  pintarResaltado()
  pintarContorno()
  refrescarPanel()
  // Y se abre la hoja donde vive ese marcador: pinchar una salida y no ver sus
  // números en ninguna parte es media herramienta.
  if (marca.que === 'spawn' || marca.que.startsWith('est')) abrirPanel(true, 'mapa')
  else if (marca.que.startsWith('tubo') || marca.que.startsWith('prisma')
    || marca.que.startsWith('rampa') || marca.que.startsWith('escalera')) abrirPanel(true, 'construir')
  else if (marca.que.startsWith('tp') || marca.que.startsWith('vent') || marca.que.startsWith('tiro')) {
    abrirPanel(true, 'dispositivos')
  } else if (marca.que.startsWith('peana')) abrirPanel(true, 'reglas')
  else abrirPanel(true, 'duelo')
}

/**
 * **Las muestras de tinte se pintan con el color de verdad** (vuelta 93).
 *
 * Es la convención de la 78 aplicada a un color, y aquí es literal: lo que se
 * está eligiendo **es** un color, así que una lista de nombres —«musgo»,
 * «pizarra»— sería la barrera de entrada que esa convención vino a quitar. Cada
 * muestra se pinta con `coverTintedColor` a **la altura de la pieza elegida**,
 * que es el mismo cálculo que va a usar la escena: no puede prometer un color
 * que el mapa no dé.
 *
 * Y la primera muestra es **el gris**, o sea «sin tinte». Sale de la misma
 * función y ocupa el mismo sitio que las demás porque es una opción más y es la
 * de fábrica: esconderla detrás de un botón «quitar» sería no poder volver.
 */
function pintarTintes(caja, pieza, alto = pieza?.kind) {
  const nodo = $(caja)
  if (!pieza) { nodo.innerHTML = ''; return }
  /**
   * **Y una barrera no enseña muestras** (vuelta 95). Su color es el del
   * cristal, así que el saneado tira el tinte al guardar: dejar las siete
   * muestras pinchables sería un control que promete un color que el fichero va
   * a borrar, o sea el fallo de la vuelta 67 en pequeño. Se dice y se quita, que
   * es lo que la 94 hizo con los ajustes que el juego iba a ignorar — con la
   * diferencia de que aquí no hay nada que atenuar: no es que estas muestras no
   * signifiquen nada **ahora mismo**, es que en una barrera no significan nunca.
   */
  if (pieza.barrera) {
    nodo.innerHTML = '<p class="nota">Una <b>barrera</b> no lleva tinte: su color '
      + 'es el del cristal.</p>'
    return
  }
  const actual = pieza.tinte ?? ''
  const opciones = [['', 'sin tinte (gris del alto)'], ...Object.keys(COVER.tintes).map((t) => [t, t])]
  nodo.innerHTML = opciones.map(([clave, nombre]) => {
    // **El alto entra como argumento** porque no todas las piezas lo llaman
    // igual: una caja tiene `kind`, una rampa `top` y una escalera `alto`. La
    // muestra tiene que pintarse con **su** gris o prometería otro color.
    const color = coverTintedColor(alto, clave || null)
    return `<button type="button" role="radio" aria-checked="${clave === actual}"
      class="tinte${clave === actual ? ' tinte--puesto' : ''}"
      data-tinte="${clave}" title="${nombre} · ${color}"
      style="--tinte: ${color}"><span>${nombre}</span></button>`
  }).join('')
}

/** Y un clic escribe el tinte. `undefined` borra el campo: lo de fábrica no se guarda (vuelta 83). */
function tintesEscriben(caja, cual) {
  $(caja).addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-tinte]')
    if (!boton) return
    const pieza = cual()
    if (!pieza) return
    anotarParaDeshacer()
    /**
     * **Volver al gris borra la clave, no la pone en `undefined`.** `JSON`
     * se salta un `undefined` así que la comparación de deshacer/rehacer no lo
     * notaría, pero el objeto se quedaría con una clave que el fichero no tiene
     * — y la disciplina de la vuelta 83 es justo ésa: lo que vale su valor de
     * fábrica **no está**.
     */
    if (boton.dataset.tinte) pieza.tinte = boton.dataset.tinte
    else delete pieza.tinte
    sucio = true
    pintarPanel()
  })
}
tintesEscriben('p-tintes', () => mapa.boxes[seleccion])
tintesEscriben('k-tintes', () => prismaElegido())
tintesEscriben('r-tintes', () => rampaElegida())
tintesEscriben('e-tintes', () => escaleraElegida())

function rellenarAlturas() {
  const opciones = Object.entries(COVER.heights)
    .map(([clave, alto]) => `<option value="${clave}">${clave} · ${alto} u</option>`)
    .join('')
  $('p-kind').innerHTML = opciones
  // **La misma escalera para el prisma**, que es lo que hace que `kind: 'alta'`
  // signifique lo mismo en los dos: una segunda lista de alturas sería una
  // pieza que se apila con otra sin cuadrar.
  $('k-kind').innerHTML = opciones
  // Y la rampa, que también elige alto del vocabulario: `top` es una palabra de
  // `COVER.heights` y de ella sale su gris.
  $('r-top').innerHTML = opciones
  const rumbos = RUMBOS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')
  $('r-rumbo').innerHTML = rumbos
  $('e-rumbo').innerHTML = rumbos
  // **Y con el eje al lado** (vuelta 95): «norte» a secas no dice hacia dónde de
  // un mapa que se mira desde arriba, y el eje sí — es el mismo dato que la
  // tabla de caras del motor.
  $('est-cara').innerHTML = ESTAMPADOS.caras
    .map((c) => `<option value="${c}">${c} · ${RUMBO_DE_CARA[c]}</option>`).join('')
  $('abrir').innerHTML = `<option value="">(mapa nuevo)</option>` + Object.entries(SCENARIOS)
    .map(([clave, def]) => `<option value="${clave}">${def.label ?? clave}</option>`)
    .join('')
  // Los dos catálogos de la fase 3 salen del dato, no de una lista a mano:
  // añadir un fondo o un arma principal los pone aquí solo.
  rellenarFondos()
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
  /**
   * **Y si esa clave es la de un escenario del juego, se dice** (vuelta 94).
   * `SCENARIOS` funde los integrados con los de fichero dejando ganar al
   * fichero, así que guardar aquí con la clave de uno de ellos **lo sustituye
   * en todo el juego**: en el selector de entrenamiento, en el desplegable del
   * duelo y en el huésped. Eso es una decisión legítima —es cómo se edita un
   * mapa integrado— pero no puede tomarse sin enterarse: pasó con `empty`, y el
   * selector de entrenamiento se quedó con un solo escenario sin un aviso en
   * ninguna pantalla.
   */
  const choca = CLAVES_INTEGRADAS.includes(mapa.clave)
  $('clave-nota').hidden = !choca
  if (choca) {
    // **Y desde la vuelta 98 sólo en los modos donde se publica**: en los demás
    // el integrado sigue en su sitio (`escenariosDeModo`, en config.js).
    const donde = modosDeMapa(mapa)
    $('clave-nota').textContent = donde.length
      ? `Esta clave es la de un escenario del juego: al guardar, este mapa lo `
        + `sustituye en ${donde.length === 2 ? 'los dos modos' : `el ${donde[0]}`}. `
        + `Si no era la idea, cámbiala antes de guardar.`
      : `Esta clave es la de un escenario del juego. Como borrador no sustituye `
        + `nada; publicado, lo sustituiría en ese modo.`
  }
  $('label').value = mapa.label ?? ''
  /**
   * **Dónde se publica** (vuelta 98). Las casillas leen `modosDeMapa`, la misma
   * función de la que salen las listas del juego, así que un mapa viejo sin
   * `modos` enseña lo que el juego le ofrece de verdad —duelo si era
   * `soloDuelo`, entrenamiento si no, ninguno si era borrador—.
   */
  const modos = modosDeMapa(mapa)
  $('modo-entrenamiento').checked = modos.includes('entrenamiento')
  $('modo-duelo').checked = modos.includes('duelo')
  $('modo-todos').checked = modos.includes('todos')
  const nombres = { entrenamiento: 'el selector del entrenamiento', duelo: 'el desplegable del duelo', todos: 'el del todos contra todos' }
  $('publicado-nota').textContent = !modos.length
    ? 'Borrador: se guarda y se puede probar aquí, pero no aparece en el juego.'
    : `Sale en ${modos.map((m) => nombres[m]).join(' y en ')}.`
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
  $('cuenta').textContent = `${mapa.boxes.length} pieza${mapa.boxes.length === 1 ? '' : 's'}`
  // En el panel la palabra ya está en el rótulo de la sección: repetirla daba
  // «PIEZAS · 17 piezas».
  $('cuenta-panel').textContent = mapa.boxes.length
  /**
   * **Y si es un borrador, lo dice la barra** (vuelta 88). La regla de la 77 es
   * que la barra dice el estado y el panel guarda los mandos: «este mapa no lo
   * ve nadie» es estado, y enterarse abriendo una hoja es enterarse tarde —
   * justo lo que pasa cuando se guarda cuatro veces y no aparece en el juego.
   */
  $('barra-mapa').textContent =
    (mapa.label || mapa.clave || '(mapa nuevo)') + (modos.length ? '' : ' · borrador')

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
  pintarTintes('p-tintes', pieza)
  pintarBarrera(pieza)
  pintarSuperficieDePieza(pieza)
  pintarTubo()
  pintarEstampados()
  pintarCapas()
  pintarRampa()
  pintarEscalera()
  pintarPrisma()
  pintarTeletransportes()
  pintarVentiladores()
  pintarTirolinas()
  pintarDispositivos()
  $('deshacer').disabled = pila.atras.length === 0
  $('rehacer').disabled = pila.adelante.length === 0
  pintarPorDefecto()
}

/**
 * **El acabado de una barrera, y el número que decide si delimita** (vuelta 95).
 *
 * Lo que la ficha dice no es el alto otra vez: es **si con ese alto se salta
 * por encima**, calculado con la física **de este mapa** y no con la de fábrica
 * — Los Pilares sube 3.26 u donde el resto sube 1.25, así que un límite de 2 u
 * delimita en cuatro mapas y no en el quinto. Enterarse probando el mapa es
 * enterarse tarde (vuelta 67), y es además la convención de la 78: lo que se
 * configura se ve.
 */
function pintarBarrera(pieza) {
  const nota = $('p-barrera-nota')
  const aviso = $('p-barrera-aviso')
  $('p-barrera').value = pieza?.barrera ?? ''
  nota.hidden = !pieza?.barrera
  aviso.hidden = true
  if (!pieza?.barrera) return
  const fisica = fisicaDeEscenario(mapa)
  // El ápice de un salto sale de la parábola, no de una tabla: v²/2g con los
  // números del mapa. Es la misma cuenta que la ficha de un rebote.
  const apice = (fisica.jumpSpeed * fisica.jumpSpeed) / (2 * fisica.gravity)
  const alto = coverHeight(pieza.kind) - (pieza.base ? coverHeight(pieza.base) : 0)
  aviso.hidden = false
  // La clase se escribe **en las dos ramas**: dejarla puesta de la vez anterior
  // es cómo un aviso rojo se queda en rojo diciendo que todo está bien.
  if (alto <= apice) {
    aviso.className = 'aviso'
    aviso.innerHTML = `Con <b>${alto.toFixed(2)} u</b> se salta por encima: en este `
      + `mapa un salto sube <b>${apice.toFixed(2)} u</b>. Súbela o no delimita nada.`
    return
  }
  aviso.className = 'nota'
  aviso.innerHTML = `Con ${alto.toFixed(2)} u no se salta por encima `
    + `(un salto sube ${apice.toFixed(2)} u en este mapa). Por arriba <b>se pisa</b>, `
    + `como cualquier pieza.`
}

/**
 * **La superficie de la pieza elegida** (vuelta 80). El desplegable dice qué
 * es y los tres campos afinan; lo que la coloca de verdad es la flecha que se
 * arrastra en el mapa, que es la convención de la 78.
 */
function pintarSuperficieDePieza(pieza) {
  // Sin pieza elegida no hay nada que convertir, y la sección lo dice en vez
  // de enseñar un desplegable que no escribe en ninguna parte.
  $('disp-pieza').hidden = !pieza
  $('disp-sin-pieza').hidden = Boolean(pieza)
  $('p-es-dispositivo').hidden = !pieza?.superficie
  $('p-sup-invisible-linea').hidden = true
  $('p-sup-aviso-invisible').hidden = true
  if (!pieza) return
  const sup = pieza.superficie
  $('p-sup').value = sup?.tipo ?? ''
  const campos = $('p-sup-campos')
  campos.hidden = !sup
  $('p-sup-nota').hidden = !sup
  if (!sup) return
  $('p-sup-fuerza').value = sup.fuerza
  $('p-sup-fuerza').max = SURFACES.fuerzaMax
  $('p-sup-invisible-linea').hidden = false
  $('p-sup-invisible').checked = Boolean(sup.invisible)
  $('p-sup-aviso-invisible').hidden = !sup.invisible
  const esVelocidad = sup.tipo === 'velocidad'
  $('p-sup-rumbo').closest('label').hidden = !esVelocidad
  $('p-sup-salto').closest('label').hidden = !esVelocidad
  if (esVelocidad) {
    $('p-sup-rumbo').value = Math.round((sup.rumbo * 180) / Math.PI)
    $('p-sup-salto').value = sup.salto
  }
  // Lo que se dice es **lo que se va a notar jugando**, no el número otra vez:
  // un rebote se lee en unidades de altura y un lanzamiento contra el techo
  // del aire del mapa, que es lo que lo acota.
  const g = fisicaDeEscenario(mapa).gravity
  if (sup.tipo === 'hielo') {
    // **Y aquí `fuerza` es rozamiento**, así que la nota lo dice con todas las
    // letras: es el mismo campo con otro significado, y un panel que lo
    // llamara «fuerza» a secas invitaría a subirlo para resbalar más.
    $('p-sup-nota').textContent =
      `Aquí el número es el ROZAMIENTO (${sup.fuerza} u/s²): cuanto MÁS BAJO, `
      + `más se resbala. Soltar la tecla a la carrera deja unas `
      + `${(MOVEMENT.speed * MOVEMENT.speed / (2 * Math.max(sup.fuerza, 0.01)) / 2).toFixed(1)} u de deriva.`
    return
  }
  $('p-sup-nota').textContent = esVelocidad
    ? `Lanza a ${sup.fuerza.toFixed(1)} u/s (sin techo desde la vuelta 82; `
      + `el del aire de este mapa es ${fisicaDeEscenario(mapa).airStrafeMaxSpeed}).`
    : `Sube ${(sup.fuerza * sup.fuerza / (2 * g)).toFixed(2)} u sobre la pieza, `
      + `con la gravedad ${g} de este mapa.`
}

/**
 * **Leer una lista del mapa no puede escribir en el mapa** (vuelta 83).
 *
 * Los cinco accesores de listas —piezas macro, dispositivos, cables— la creaban
 * al pedirla: `if (!Array.isArray(mapa.x)) mapa.x = []`. Parece inofensivo y
 * no lo es, porque **el mapa es lo que compara deshacer/rehacer**: pintar el
 * panel le añadía campos al final, así que un mapa restaurado del historial ya
 * no era igual al que se había guardado —mismos datos, otro orden de claves— y
 * `ed76` [6] lo cazó con un «rehacer no devuelve el mapa al dígito».
 *
 * Así que leer devuelve una lista vacía **compartida y congelada** —si alguien
 * intenta escribir en ella, salta en vez de escribir en la nada— y quien va a
 * añadir algo pide la otra.
 */
const LISTA_VACIA = Object.freeze([])

function listaDe(campo) {
  return Array.isArray(mapa[campo]) ? mapa[campo] : LISTA_VACIA
}

/** La misma lista, creada si no está, para quien va a escribir en ella. */
function listaParaEscribir(campo) {
  if (!Array.isArray(mapa[campo])) mapa[campo] = []
  return mapa[campo]
}

/**
 * **Las salidas del todos contra todos** (vuelta 100): la lista para leer, que
 * no crea nada, y la de escribir, que crea el bloque `todos` si no está.
 */
function salidasDeTodosLeer() {
  return Array.isArray(mapa.todos?.salidas) ? mapa.todos.salidas : LISTA_VACIA
}
function salidasDeTodosParaEscribir() {
  if (!mapa.todos || typeof mapa.todos !== 'object') mapa.todos = {}
  if (!Array.isArray(mapa.todos.salidas)) mapa.todos.salidas = []
  return mapa.todos.salidas
}

/** Las peanas (vuelta 106): leer no crea la lista (vuelta 83). */
function peanasDe() {
  return listaDe('peanas')
}

/**
 * **Las reglas del mapa para escribir en ellas** (vuelta 106). La primera vez se
 * crean con lo que el mapa ya dice —y en un mapa de antes, como Los Pilares, eso
 * es su `sinEconomia` con su `dotacion`, que se pasan a las reglas y se borran
 * del bloque de duelo: dos sitios diciendo con qué se sale serían dos verdades—.
 */
function reglasParaEscribir() {
  if (!mapa.reglas) {
    const r = reglasDeMapa(mapa)
    mapa.reglas = { modo: r.modo }
    if (r.armas) mapa.reglas.armas = [...r.armas]
    const e = {}
    if (r.equipo.chaleco) e.chaleco = true
    if (r.equipo.casco) e.casco = true
    if (r.equipo.principal) e.principal = r.equipo.principal
    if (Object.keys(e).length) mapa.reglas.equipo = e
    if (mapa.duelo) { delete mapa.duelo.sinEconomia; delete mapa.duelo.dotacion }
  }
  return mapa.reglas
}

/** Y al revés: unas reglas que valen lo de fábrica no se escriben (vuelta 83). */
function limpiarReglas() {
  const r = mapa.reglas
  if (!r) return
  if (r.armas && r.armas.length === armasMarcables().length) delete r.armas
  if (r.equipo && !Object.keys(r.equipo).length) delete r.equipo
  if (r.modo === 'armeria' && !r.armas && !r.equipo) delete mapa.reglas
}

/** Los prismas del mapa. */
function prismasDe() {
  return listaDe('prismas')
}

/** El prisma elegido, o `null`. */
function prismaElegido() {
  if (!marcaElegida?.que?.startsWith('prisma')) return null
  return prismasDe()[marcaElegida.i] ?? null
}

/** Los tubos del mapa. Se materializa la lista al pedirla, como los teletransportes. */
function tubosDe() {
  return listaDe('tubos')
}

/** Las rampas y las escaleras del mapa (vuelta 93). */
function rampasDe() { return listaDe('ramps') }
function escalerasDe() { return listaDe('escaleras') }

function rampaElegida() {
  if (marcaElegida?.que !== 'rampa' && !marcaElegida?.que?.startsWith('rampa-')) return null
  return rampasDe()[marcaElegida.i] ?? null
}

function escaleraElegida() {
  if (marcaElegida?.que !== 'escalera' && !marcaElegida?.que?.startsWith('escalera-')) return null
  return escalerasDe()[marcaElegida.i] ?? null
}

/** El tubo elegido, o `null`. La selección de un tubo es una marca, como un área. */
function tuboElegido() {
  if (!marcaElegida?.que?.startsWith('tubo')) return null
  return tubosDe()[marcaElegida.i] ?? null
}

/**
 * **La ficha del tubo** (vuelta 81). Los números están al lado de los gestos,
 * como en todo lo demás desde la 78: lo que lo coloca es arrastrarlo, y esto
 * es para afinar a la décima y para leer **lo que cuesta** — que en un tubo no
 * es obvio, porque un objeto en el fichero son veintidós piezas en el motor.
 */
function pintarPrisma() {
  const prisma = prismaElegido()
  $('prisma').hidden = !prisma
  pintarTintes('k-tintes', prisma)
  if (!prisma) return
  $('k-x').value = prisma.x
  $('k-z').value = prisma.z
  $('k-w').value = prisma.w
  $('k-d').value = prisma.d
  $('k-base').value = prisma.base ?? 0
  $('k-lados').value = prisma.lados
  $('k-lados').min = PRISMAS.ladosMin
  $('k-lados').max = PRISMAS.ladosMax
  $('k-giro').value = Math.round(((prisma.giro ?? 0) * 180) / Math.PI)
  for (const id of ['k-x', 'k-z']) $(id).step = paso
  $('k-kind').value = prisma.kind
  /**
   * **Lo que se dice es lo que se va a notar jugando**, no el número otra vez:
   * lo que le importa a quien construye una columna es **por dónde se pasa**,
   * y eso es la apotema —lo más estrecho del polígono— más el radio del cuerpo.
   */
  const a = prisma.w / 2
  const b = prisma.d / 2
  if (prisma.lados === 4) {
    $('k-nota').textContent = `Una caja de ${prisma.w}×${prisma.d} girada ${Math.round((prisma.giro * 180) / Math.PI)}°.`
  } else {
    const apotema = Math.min(a, b) * Math.cos(Math.PI / prisma.lados)
    $('k-nota').textContent =
      `Pilar de ${prisma.lados} caras. Lo más estrecho mide ${(apotema * 2).toFixed(2)} u, `
      + `así que el jugador lo rodea a ${(apotema + COVER.playerRadius).toFixed(2)} u del centro.`
  }
}

function pintarTubo() {
  const tubo = tuboElegido()
  $('tubo').hidden = !tubo
  const cuantos = tubosDe().length
  $('cuenta-tubos').textContent = cuantos ? `· ${cuantos} tubo${cuantos === 1 ? '' : 's'}` : ''
  if (!tubo) return
  $('t-x').value = tubo.x
  $('t-z').value = tubo.z
  $('t-radio').value = tubo.radio
  $('t-grosor').value = tubo.grosor
  $('t-caras').value = tubo.caras
  $('t-alto').value = tubo.alto
  $('t-base').value = tubo.base
  for (const id of ['t-x', 't-z']) $(id).step = paso
  $('t-radio').min = TUBES.radioMin
  $('t-radio').max = TUBES.radioMax
  $('t-grosor').min = TUBES.grosorMin
  $('t-grosor').max = TUBES.grosorMax
  $('t-caras').min = TUBES.carasMin
  $('t-caras').max = TUBES.carasMax
  $('t-alto').min = TUBES.altoMin
  $('t-alto').max = TUBES.altoMax
  const piezas = cajasDeTubo(tubo).length
  $('t-nota').textContent =
    `Hueco libre de ${(tubo.radio * 2).toFixed(1)} u de diámetro, ` +
    `pared de ${tubo.grosor} y ${tubo.alto} u de alto. ` +
    `El motor lo ve como ${piezas} pieza${piezas === 1 ? '' : 's'}.`
}

/**
 * **La ficha de la rampa** (vuelta 93). Los números al lado de los gestos, como
 * las demás: la esquina y el aro son para colocar y esto es para afinar a la
 * décima (la convención de la 78).
 */
const RUMBOS = [['0', 'norte (+Z)'], ['1', 'este (+X)'], ['2', 'sur (−Z)'], ['3', 'oeste (−X)']]

function pintarRampa() {
  const r = rampaElegida()
  $('rampa').hidden = !r
  pintarTintes('r-tintes', r, r?.top)
  if (!r) return
  $('r-x').value = r.x
  $('r-z').value = r.z
  $('r-w').value = r.w
  $('r-d').value = r.d
  $('r-top').value = typeof r.top === 'string' ? r.top : ''
  $('r-rumbo').value = String(rumboDeRampa(r))
  for (const id of ['r-x', 'r-z', 'r-w', 'r-d']) $(id).step = paso
  /**
   * **Y lo que se dice es lo que se va a notar jugando**, no el número otra vez:
   * lo que le importa a quien coloca una rampa es **cuánto sube por paso**, o sea
   * si se sube cómodo o parece una cuesta. La pendiente sale de la misma división
   * que usa `_rampSlope` en el motor.
   */
  const alto = coverHeight(r.top)
  const recorrido = r.fromX !== undefined ? Math.abs(r.w) : Math.abs(r.d)
  const pendiente = recorrido > 0 ? (alto / recorrido) : Infinity
  $('r-nota').textContent =
    `Sube ${alto} u en ${recorrido} u de recorrido: ${(Math.atan(pendiente) * 180 / Math.PI).toFixed(0)}° `
    + `de inclinación. Es sólida sólo por arriba, así que por debajo no se pasa.`
}

/**
 * **La ficha de la escalera**, y lo que tiene de propio: dice **cuántos
 * escalones va a montar de verdad**.
 *
 * `COVER.stepHeight` (0.25) es lo que el jugador sube sin saltar, así que una
 * escalera con escalones más altos no se sube andando. El despliegue sube el
 * número hasta que quepan (`src/maps/escalera.js`) y **eso hay que decirlo
 * aquí**: enterarse probando el mapa es enterarse tarde, que es el fallo de la
 * vuelta 67 por la puerta de una macro.
 */
function pintarEscalera() {
  const e = escaleraElegida()
  $('escalera').hidden = !e
  pintarTintes('e-tintes', e, (e?.base ?? 0) + (e?.alto ?? 0))
  if (!e) return
  $('e-x').value = e.x
  $('e-z').value = e.z
  $('e-ancho').value = e.ancho
  $('e-alto').value = e.alto
  $('e-base').value = e.base ?? 0
  $('e-escalones').value = e.escalones
  $('e-huella').value = e.huella
  $('e-rumbo').value = String(e.rumbo ?? 0)
  for (const id of ['e-x', 'e-z']) $(id).step = paso
  $('e-ancho').min = ESCALERAS.anchoMin
  $('e-ancho').max = ESCALERAS.anchoMax
  $('e-alto').min = ESCALERAS.altoMin
  $('e-alto').max = ESCALERAS.altoMax
  $('e-escalones').min = ESCALERAS.escalonesMin
  $('e-escalones').max = ESCALERAS.escalonesMax
  $('e-huella').min = ESCALERAS.huellaMin
  $('e-huella').max = ESCALERAS.huellaMax

  const m = medidasDeEscalera(e, COVER.stepHeight)
  const piezas = cajasDeEscalera(e, COVER.stepHeight).length
  $('e-nota').textContent =
    `${m.escalones} escalón(es) de ${m.subida.toFixed(3)} u, `
    + `${m.largo.toFixed(1)} u de largo. El motor la ve como ${piezas} pieza(s).`
  $('e-aviso').hidden = !m.subidos
  $('e-aviso').textContent = m.subidos
    ? `Con ${e.escalones} escalón(es) cada uno mediría ${(e.escalones ? e.alto / e.escalones : e.alto).toFixed(2)} u `
      + `y no se sube andando (el tope es ${COVER.stepHeight}). Se montan ${m.escalones}.`
    : ''
}

/**
 * **Los estampados** (vuelta 93), y por qué su lista se enseña además del
 * marcador: **colocar y encontrar son dos problemas** (la lección de la 81 con
 * los dispositivos). Un logo pegado a un muro en un mapa de cuarenta piezas no
 * se distingue mirándolo desde arriba, así que la hoja los lista y pinchar uno
 * lo elige.
 */
function estampadosDe() { return listaDe('estampados') }

/**
 * **Qué tiene un mapa, en una sola tabla** (vuelta 96).
 *
 * De aquí salen tres cosas que antes vivían por separado o no existían: la lista
 * de capas, el **ojo** que oculta un elemento en el editor y la tecla **Supr**,
 * que hasta esta vuelta sólo borraba una caja. Un tipo nuevo se añade aquí y
 * hereda las tres.
 *
 * - `clave` es el nombre de su lista en el mapa, que es también la clave del ojo.
 * - `prefijo` es el de su marca, y se compara con `startsWith` porque una marca
 *   puede ser el cuerpo o uno de sus tiradores (`escalera`, `escalera-esquina`).
 *   El orden importa: si algún día hay un `estructura`, el más largo va primero.
 * - `lista` es el accesor de **lectura**; quien va a añadir pide el de escritura.
 * - `fila` describe un elemento en una línea. Es lo que se lee en la lista, así
 *   que dice lo que distingue a ése de sus hermanos y no el tipo otra vez.
 *
 * Las cajas están aquí para la lista y el ojo, y **no** para Supr: una caja se
 * elige por `seleccion` y tiene su propio camino desde la vuelta 76.
 */
const TIPOS_DE_MAPA = [
  {
    clave: 'boxes', prefijo: null, nombre: 'Piezas', lista: () => mapa.boxes ?? [],
    fila: (b) => `${b.kind} ${b.w}×${b.d}`
      + (b.barrera ? ` · barrera ${b.barrera}` : '')
      + (b.superficie ? ` · ${b.superficie.tipo}` : '')
      + (b.tinte ? ` · ${b.tinte}` : '')
      + (b.base ? ` · sobre ${b.base}` : ''),
  },
  {
    clave: 'prismas', prefijo: 'prisma', nombre: 'Prismas', lista: () => prismasDe(),
    fila: (k) => `${k.lados} lados ${k.w}×${k.d} · ${k.kind}`,
  },
  {
    clave: 'tubos', prefijo: 'tubo', nombre: 'Tubos', lista: () => tubosDe(),
    fila: (t) => `radio ${t.radio} · alto ${t.alto} · ${t.caras} caras`,
  },
  {
    clave: 'ramps', prefijo: 'rampa', nombre: 'Rampas', lista: () => rampasDe(),
    fila: (r) => `${r.w}×${r.d} · sube a ${r.top}`,
  },
  {
    clave: 'escaleras', prefijo: 'escalera', nombre: 'Escaleras', lista: () => escalerasDe(),
    fila: (e) => `ancho ${e.ancho} · alto ${e.alto} · ${medidasDeEscalera(e, COVER.stepHeight).escalones} escalones`,
  },
  {
    clave: 'estampados', prefijo: 'est', nombre: 'Estampados', lista: () => estampadosDe(),
    fila: (e) => `${e.imagen.split('/').pop()} · ${e.cara} · ${e.ancho}×${e.alto}`,
  },
  {
    clave: 'ventiladores', prefijo: 'vent', nombre: 'Ventiladores', lista: () => ventiladoresDe(),
    fila: (v) => `${v.w}×${v.d}×${v.alto} · fuerza ${v.fuerza}`,
  },
  {
    clave: 'tirolinas', prefijo: 'tiro', nombre: 'Tirolinas', lista: () => tirolinasDe(),
    fila: (t) => `de (${t.desde.x}, ${t.desde.z}) a (${t.hasta.x}, ${t.hasta.z})`,
  },
  {
    clave: 'teletransportes', prefijo: 'tp', nombre: 'Teletransportes', lista: () => teletransportesDe(),
    fila: (t) => `(${t.x}, ${t.z}) → (${t.destino.x}, ${t.destino.z})`,
  },
  {
    clave: 'salidas',
    prefijo: 'salida',
    nombre: 'Salidas de duelo',
    /**
     * **Se leen del mapa y no con `salidasDe()`**, que **escribe**: si no hay dos
     * salidas se las inventa y las deja puestas en `duelo.salidas`. Eso está bien
     * donde se usa —la hoja de duelo, que va a editarlas— y sería un desastre
     * aquí: esta lista se pinta con el panel, así que abrir Alchemist con
     * cualquier mapa le añadiría dos salidas de duelo **sin que nadie las
     * pidiera**, y de paso rompería la comparación de deshacer/rehacer, que es un
     * `JSON.stringify` del mapa (vuelta 83).
     *
     * Y sólo en un mapa de duelo, que es la misma condición con la que
     * `pintarMarcas` las dibuja: en los demás no significan nada.
     */
    lista: () => (mapa.soloDuelo && Array.isArray(mapa.duelo?.salidas) ? mapa.duelo.salidas : []),
    fila: (s, i) => `salida ${i + 1} · (${s.x}, ${s.z})`,
  },
  {
    /**
     * **Y las del todos contra todos** (vuelta 100), con su propia fila porque
     * son otra lista: un mapa puede tener las dos. Se leen sin crear nada, por
     * lo mismo que las de arriba.
     */
    clave: 'salidasTodos',
    prefijo: 'todos',
    nombre: 'Salidas (todos contra todos)',
    lista: () => salidasDeTodosLeer(),
    fila: (s, i) => `salida ${i + 1} · (${s.x}, ${s.z})`,
  },
  {
    /**
     * **Las peanas** (vuelta 106), con todo lo que da estar en esta tabla: fila
     * en Capas con su ojo, Supr y elegir pinchando la fila.
     */
    clave: 'peanas', prefijo: 'peana', nombre: 'Peanas', lista: () => peanasDe(),
    fila: (p) => `${WEAPONS[p.arma]?.label ?? p.arma} · (${p.x}, ${p.z})`,
  },
]

/**
 * **Lo que el ojo esconde, y sólo en el editor** (vuelta 96). Claves
 * `<lista>:<índice>`, en memoria y **no en el mapa**: es estado de vista, y el
 * mapa es lo que compara deshacer/rehacer con un `JSON.stringify` (vuelta 83), así
 * que meterle un campo de vista rompería esa comparación sin cambiar un dato.
 *
 * Lo que se paga, y va escrito porque no se adivina: **no sobrevive a guardar**,
 * porque guardar recarga la página (vuelta 75). Es lo correcto para un ojo —nadie
 * espera que dure— y es exactamente lo que **no** vale para un candado, que es
 * por lo que el candado no está en esta vuelta.
 */
const ocultos = new Set()
const estaOculto = (clave, i) => ocultos.has(`${clave}:${i}`)

/**
 * **El mapa que se dibuja**, que con algo oculto **no es el mapa**. Devuelve el
 * mismo objeto cuando no hay nada oculto: así el camino normal no paga ni una
 * copia y no puede comportarse distinto.
 *
 * Las salidas no se filtran aquí porque no las dibuja `Scenario` —son marcas del
 * editor— y su ojo lo aplica `pintarMarcas`.
 */
function mapaParaDibujar() {
  if (ocultos.size === 0) return mapa
  const copia = { ...mapa }
  for (const tipo of TIPOS_DE_MAPA) {
    if (tipo.clave === 'salidas') continue
    const lista = mapa[tipo.clave]
    if (!Array.isArray(lista)) continue
    copia[tipo.clave] = lista.filter((_, i) => !estaOculto(tipo.clave, i))
  }
  return copia
}

/**
 * **La lista de todo lo que hay en el mapa** (vuelta 96, fase 1 de la propuesta
 * 10). Sale de `TIPOS_DE_MAPA`, así que un tipo nuevo aparece aquí sin tocar esto
 * — que es el fallo que la vuelta 92 tuvo con las ranuras y la 89 con las filas
 * del `subgrid`: dos listas paralelas donde tenía que haber una.
 */
function pintarCapas() {
  const lista = $('capas-lista')
  if (!lista) return
  let total = 0
  const trozos = []
  for (const tipo of TIPOS_DE_MAPA) {
    const cosas = tipo.lista()
    if (!cosas.length) continue
    total += cosas.length
    const ocultasAqui = cosas.filter((_, i) => estaOculto(tipo.clave, i)).length
    trozos.push(`
      <section class="capa">
        <h3>${tipo.nombre} <span class="dato">${cosas.length}</span>
          <button type="button" class="ojo" data-capa-tipo="${tipo.clave}"
            title="${ocultasAqui === cosas.length ? 'Ver' : 'Ocultar'} todo ${tipo.nombre.toLowerCase()}"
            aria-pressed="${ocultasAqui === cosas.length}">${ocultasAqui === cosas.length ? '🙈' : '👁'}</button></h3>
        <ul>${cosas.map((cosa, i) => {
          const oculto = estaOculto(tipo.clave, i)
          const actual = tipo.prefijo
            ? marcaElegida?.que?.startsWith(tipo.prefijo) && marcaElegida.i === i
            : seleccion === i
          return `<li class="${actual ? 'actual' : ''}${oculto ? ' oculta' : ''}">
            <button type="button" data-capa="${tipo.clave}" data-i="${i}">${tipo.fila(cosa, i)}</button>
            <button type="button" class="ojo" data-capa-ojo="${tipo.clave}" data-i="${i}"
              title="${oculto ? 'Ver' : 'Ocultar'}" aria-pressed="${oculto}">${oculto ? '🙈' : '👁'}</button>
          </li>`
        }).join('')}</ul>
      </section>`)
  }
  lista.innerHTML = trozos.join('') || '<p class="nota">El mapa está vacío.</p>'
  $('capas-cuenta').textContent = total ? `· ${total} elementos` : ''
  // **Y que hay algo oculto se dice en el panel** (regla de la vuelta 77: el
  // estado se lee sin abrir nada; aquí, sin tener que recorrer la lista). Sin
  // esto, un mapa con media docena de piezas escondidas es un mapa que parece
  // tener menos de las que tiene, y eso se descubre probándolo — tarde.
  const aviso = $('capas-ocultas')
  aviso.hidden = ocultos.size === 0
  aviso.textContent = ocultos.size === 1
    ? '1 elemento oculto en el editor. Sigue en el mapa y en el juego.'
    : `${ocultos.size} elementos ocultos en el editor. Siguen en el mapa y en el juego.`
  $('capas-ver-todo').disabled = ocultos.size === 0
}

/** Cambia el ojo de uno o de un tipo entero y remonta. */
function alternarOjo(clave, i) {
  const tipo = TIPOS_DE_MAPA.find((t) => t.clave === clave)
  if (!tipo) return
  if (i === null) {
    const cosas = tipo.lista()
    const todosOcultos = cosas.length > 0 && cosas.every((_, k) => estaOculto(clave, k))
    for (let k = 0; k < cosas.length; k++) {
      if (todosOcultos) ocultos.delete(`${clave}:${k}`)
      else ocultos.add(`${clave}:${k}`)
    }
  } else if (estaOculto(clave, i)) ocultos.delete(`${clave}:${i}`)
  else ocultos.add(`${clave}:${i}`)
  // Ocultar lo que está elegido lo suelta: un gizmo de algo que no se ve es un
  // gizmo huérfano, y el panel enseñaría la ficha de una cosa invisible.
  if (tipo.prefijo
    ? marcaElegida?.que?.startsWith(tipo.prefijo) && (i === null || marcaElegida.i === i) && estaOculto(clave, marcaElegida.i)
    : seleccion >= 0 && (i === null || seleccion === i) && estaOculto(clave, seleccion)) {
    marcaElegida = null
    seleccion = -1
  }
  sucio = true
  remontar()
  pintarCapas()
  pintarPanel()
}

/** Los que Supr puede borrar: todos menos la caja, que va por `seleccion`. */
const BORRABLES = TIPOS_DE_MAPA
  .filter((t) => t.prefijo)
  .map((t) => [t.nombre.replace(/s$/, '').toLowerCase(), t.prefijo, t.lista])

/**
 * Borra el elemento elegido y devuelve su nombre, o `null` si no había ninguno.
 * Lo llaman los botones «Quitar» de cada ficha **y** la tecla Supr: dos caminos
 * hasta la misma acción es cómo uno acaba olvidándose de anotar el deshacer.
 */
function borrarLoElegido() {
  const que = marcaElegida?.que
  if (!que) return null
  const fila = BORRABLES.find(([, prefijo]) => que.startsWith(prefijo))
  if (!fila) return null
  const lista = fila[2]()
  const i = marcaElegida.i
  if (!(i >= 0) || i >= lista.length) return null
  anotarParaDeshacer()
  lista.splice(i, 1)
  marcaElegida = null
  sucio = true
  pintarPanel()
  // Y la hoja de Duelo si está abierta: las salidas viven ahí, y su propio
  // botón de quitar ya repintaba las dos cosas.
  if (panelAbierto()) pintarDuelo()
  contar([], `${fila[0]} borrado`)
  return fila[0]
}

function estampadoElegido() {
  if (!marcaElegida?.que?.startsWith('est')) return null
  return estampadosDe()[marcaElegida.i] ?? null
}

/** Lo que haya en `public/estampados/`, que lo dice el servidor de desarrollo. */
let imagenesDeEstampado = []

/**
 * Pide el listado y lo pinta. Devuelve **cuántas ha encontrado**, o `-1` si no
 * ha podido preguntar: quien la llama a mano tiene que poder decirlo, porque un
 * botón que repinta en silencio es un botón que no hace nada (vuelta 89) — y así
 * se reportó el de la vuelta 95, que sí llamaba a esto.
 */
async function cargarImagenesDeEstampado() {
  try {
    // **Sin caché, y a propósito.** La respuesta no lleva validador y lo que se
    // está preguntando es justo «¿ha cambiado la carpeta?»: una respuesta
    // reutilizada contesta la pregunta de antes.
    const respuesta = await fetch('/__editor/estampados', { cache: 'no-store' })
    if (!respuesta.ok) return -1
    const { imagenes } = await respuesta.json()
    if (!Array.isArray(imagenes)) return -1
    imagenesDeEstampado = imagenes
    pintarEstampados()
    return imagenes.length
  } catch {
    // Sin listado no pasa nada: el mapa se sigue editando. Es la misma respuesta
    // que con las fotos de fondo desde la vuelta 78.
    return -1
  }
}

function pintarEstampados() {
  const lista = estampadosDe()
  const cuantos = lista.length
  $('cuenta-estampados').textContent = cuantos
    ? `· ${cuantos} de ${ESTAMPADOS.colocadosMax}`
    : ''
  // El desplegable, con el peso al lado: es el precio de la única cosa que este
  // proyecto descarga, así que se ve antes de elegirla.
  $('est-imagen').innerHTML = imagenesDeEstampado
    .map((i) => `<option value="${i.url}">${i.nombre} · ${i.kb} KB</option>`)
    .join('')
  $('est-vacio').hidden = imagenesDeEstampado.length > 0
  $('est-poner').disabled = imagenesDeEstampado.length === 0 || cuantos >= ESTAMPADOS.colocadosMax

  $('est-lista').innerHTML = lista.map((e, i) => `
    <li${i === marcaElegida?.i && marcaElegida?.que?.startsWith('est') ? ' class="actual"' : ''}>
      <button type="button" data-est="${i}">${e.imagen.split('/').pop()}
        <span>${e.cara} · ${e.ancho}×${e.alto}</span></button>
    </li>`).join('')

  const e = estampadoElegido()
  $('est-ficha').hidden = !e
  if (!e) return
  $('est-x').value = e.x
  $('est-y').value = e.y
  $('est-z').value = e.z
  $('est-ancho').value = e.ancho
  $('est-alto').value = e.alto
  $('est-cara').value = e.cara
  $('est-giro').value = aGrados(e.giro ?? 0)
  const usadas = [...new Set(lista.map((x) => x.imagen))].length
  $('est-nota').textContent =
    `${usadas} de ${ESTAMPADOS.imagenesMax} imágenes distintas usadas. `
    + 'No tiene colisión y no recibe disparos.'
}

// ---------------------------------------------------------------- capas (96)
$('capas-lista').addEventListener('click', (evento) => {
  const ojo = evento.target.closest('button[data-capa-ojo]')
  if (ojo) { alternarOjo(ojo.dataset.capaOjo, Number(ojo.dataset.i)); return }
  const tipoEntero = evento.target.closest('button[data-capa-tipo]')
  if (tipoEntero) { alternarOjo(tipoEntero.dataset.capaTipo, null); return }
  const fila = evento.target.closest('button[data-capa]')
  if (!fila) return
  const clave = fila.dataset.capa
  const i = Number(fila.dataset.i)
  const tipo = TIPOS_DE_MAPA.find((t) => t.clave === clave)
  // Pinchar una fila **elige el elemento en la vista**, que es la mitad de para
  // qué existe esta lista (vuelta 81: colocar y encontrar son dos problemas).
  // Y no se puede elegir algo oculto: se enseña primero.
  if (estaOculto(clave, i)) alternarOjo(clave, i)
  if (tipo?.prefijo) elegirMarca({ que: tipo.prefijo, i })
  else elegir(i)
  pintarCapas()
})

$('capas-ver-todo').addEventListener('click', () => {
  if (ocultos.size === 0) return
  ocultos.clear()
  sucio = true
  remontar()
  pintarCapas()
  pintarPanel()
})

$('est-lista').addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-est]')
  if (!boton) return
  elegirMarca({ que: 'est', i: Number(boton.dataset.est) })
})

$('est-poner').addEventListener('click', () => {
  const url = $('est-imagen').value
  if (!esImagenDeEstampado(url)) return
  const lista = listaParaEscribir('estampados')
  if (lista.length >= ESTAMPADOS.colocadosMax) return
  anotarParaDeshacer()
  // Delante de la cámara y **a la altura de los ojos**, encarado al sur, que es
  // hacia donde mira quien lo está colocando desde arriba.
  lista.push({
    ...ESTAMPADOS.porDefecto,
    imagen: url,
    ...puntoParaColocar(ESTAMPADOS.porDefecto.ancho, ESTAMPADOS.porDefecto.ancho, true),
  })
  sucio = true
  elegirMarca({ que: 'est', i: lista.length - 1 })
})

$('est-borrar').addEventListener('click', () => {
  if (marcaElegida?.que?.startsWith('est')) borrarLoElegido()
})

const conEstampado = (aplicar) => (v) => {
  const e = estampadoElegido()
  if (e) aplicar(e, v)
}
campo('est-x', conEstampado((e, v) => { e.x = Number(v) || 0 }))
campo('est-y', conEstampado((e, v) => { e.y = Number(v) || 0 }))
campo('est-z', conEstampado((e, v) => { e.z = Number(v) || 0 }))
campo('est-ancho', conEstampado((e, v) => {
  e.ancho = Math.min(Math.max(Number(v) || e.ancho, ESTAMPADOS.anchoMin), ESTAMPADOS.anchoMax)
}))
campo('est-alto', conEstampado((e, v) => {
  e.alto = Math.min(Math.max(Number(v) || e.alto, ESTAMPADOS.altoMin), ESTAMPADOS.altoMax)
}))
campo('est-cara', conEstampado((e, v) => { if (ESTAMPADOS.caras.includes(v)) e.cara = v }))
campo('est-giro', conEstampado((e, v) => {
  const vuelta = Math.PI * 2
  e.giro = ((aRadianes(v) % vuelta) + vuelta) % vuelta
}))

/** Los ventiladores, con sus números al lado del dibujo. */
function pintarVentiladores() {
  const vs = mapa.ventiladores ?? []
  $('cuenta-vents').textContent = vs.length === 0 ? '' : `· ${vs.length}`
  const g = fisicaDeEscenario(mapa).gravity
  $('vent-fichas').innerHTML = vs
    .map((v, i) => {
      // **Lo que hace se dice en palabras, no en un número suelto.** «Fuerza
      // 42» no dice si se sube o se cae más despacio hasta que se prueba el
      // mapa, que es justo la barrera que la vuelta 78 vino a quitar.
      const neta = g - v.fuerza
      const que = neta < -0.01
        ? `sube solo (gravedad neta ${neta.toFixed(1)}, hacia arriba)`
        : neta < g * 0.5
          ? `se cae mucho más despacio (gravedad neta ${neta.toFixed(1)} de ${g})`
          : `apenas se nota (gravedad neta ${neta.toFixed(1)} de ${g})`
      return `
      <div class="ficha-salida${marcaElegida?.que?.startsWith('vent') && marcaElegida.i === i ? ' puesta' : ''}">
        <h3>Ventilador ${i + 1}</h3>
        <div class="trio">
          <label>X <input data-vent="${i}" data-campo="x" type="number" step="${paso}" value="${v.x}" /></label>
          <label>Z <input data-vent="${i}" data-campo="z" type="number" step="${paso}" value="${v.z}" /></label>
        </div>
        <div class="trio">
          <label>Ancho <input data-vent="${i}" data-campo="w" type="number" step="${paso}" min="${paso}" value="${v.w}" /></label>
          <label>Fondo <input data-vent="${i}" data-campo="d" type="number" step="${paso}" min="${paso}" value="${v.d}" /></label>
        </div>
        <div class="trio">
          <label>Base <input data-vent="${i}" data-campo="base" type="number" step="${paso}" min="0" value="${v.base}" /></label>
          <label>Alto <input data-vent="${i}" data-campo="alto" type="number" step="0.5" min="0.5" value="${v.alto}" /></label>
          <label>Fuerza <input data-vent="${i}" data-campo="fuerza" type="number" step="1" min="0.1" value="${v.fuerza}" /></label>
        </div>
        <p class="nota">Dentro ${que}.</p>
        <button data-vent-quitar="${i}" type="button">Quitar éste</button>
      </div>`
    })
    .join('')
}

/** Las tirolinas, con su largo y lo que se tarda en recorrerlas. */
function pintarTirolinas() {
  const ts = mapa.tirolinas ?? []
  $('cuenta-tiros').textContent = ts.length === 0 ? '' : `· ${ts.length}`
  $('tiro-fichas').innerHTML = ts
    .map((t, i) => {
      // **Lo que hace falta saber de un cable es cuánto tarda**, que es el
      // número que decide si cruzar por arriba compensa. Un largo en unidades
      // no lo contesta sin dividir.
      const largo = Math.hypot(t.hasta.x - t.desde.x, t.hasta.y - t.desde.y, t.hasta.z - t.desde.z)
      const seg = largo / Math.max(t.velocidad, 0.01)
      const cae = t.desde.y - t.hasta.y
      const pendiente = cae > 0.05 ? `baja ${cae.toFixed(1)} u` : cae < -0.05 ? `sube ${(-cae).toFixed(1)} u` : 'horizontal'
      return `
      <div class="ficha-salida${marcaElegida?.que?.startsWith('tiro') && marcaElegida.i === i ? ' puesta' : ''}">
        <h3>Tirolina ${i + 1}</h3>
        <div class="trio">
          <label>A · X <input data-tiro="${i}" data-campo="desde.x" type="number" step="${paso}" value="${t.desde.x}" /></label>
          <label>A · Y <input data-tiro="${i}" data-campo="desde.y" type="number" step="0.5" value="${t.desde.y}" /></label>
          <label>A · Z <input data-tiro="${i}" data-campo="desde.z" type="number" step="${paso}" value="${t.desde.z}" /></label>
        </div>
        <div class="trio">
          <label>B · X <input data-tiro="${i}" data-campo="hasta.x" type="number" step="${paso}" value="${t.hasta.x}" /></label>
          <label>B · Y <input data-tiro="${i}" data-campo="hasta.y" type="number" step="0.5" value="${t.hasta.y}" /></label>
          <label>B · Z <input data-tiro="${i}" data-campo="hasta.z" type="number" step="${paso}" value="${t.hasta.z}" /></label>
        </div>
        <label>Velocidad <input data-tiro="${i}" data-campo="velocidad" type="number" step="1"
          min="${ZIPLINES.velocidadMin}" max="${ZIPLINES.velocidadMax}" value="${t.velocidad}" /></label>
        <p class="nota">${largo.toFixed(1)} u, ${pendiente}, <b>${seg.toFixed(1)} s</b> de viaje.
          Al soltarse se sale a ${t.velocidad} u/s.</p>
        <button data-tiro-quitar="${i}" type="button">Quitar ésta</button>
      </div>`
    })
    .join('')
}

/** La lista de teletransportes, con sus números al lado del dibujo. */
function pintarTeletransportes() {
  const tps = mapa.teletransportes ?? []
  $('cuenta-tps').textContent = tps.length === 0 ? '' : `· ${tps.length}`
  $('tp-fichas').innerHTML = tps
    .map((tp, i) => `
      <div class="ficha-salida${marcaElegida?.que?.startsWith('tp') && marcaElegida.i === i ? ' puesta' : ''}">
        <h3>Teletransporte ${i + 1}</h3>
        <div class="trio">
          <label>X <input data-tp="${i}" data-campo="x" type="number" step="${paso}" value="${tp.x}" /></label>
          <label>Z <input data-tp="${i}" data-campo="z" type="number" step="${paso}" value="${tp.z}" /></label>
        </div>
        <div class="trio">
          <label>Ancho <input data-tp="${i}" data-campo="w" type="number" step="${paso}" min="${paso}" value="${tp.w}" /></label>
          <label>Fondo <input data-tp="${i}" data-campo="d" type="number" step="${paso}" min="${paso}" value="${tp.d}" /></label>
        </div>
        <div class="trio">
          <label>Sale en X <input data-tp="${i}" data-campo="dx" type="number" step="${paso}" value="${tp.destino.x}" /></label>
          <label>Sale en Z <input data-tp="${i}" data-campo="dz" type="number" step="${paso}" value="${tp.destino.z}" /></label>
          <label>Rumbo <input data-tp="${i}" data-campo="dyaw" type="number" step="5" value="${Math.round((tp.destino.yaw * 180) / Math.PI)}" /></label>
        </div>
        <button data-tp-quitar="${i}" type="button">Quitar éste</button>
      </div>`)
    .join('')
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
/**
 * **Las casillas de publicar** (vuelta 98). Escriben `modos` y **borran
 * `publicado`**, que dice la mitad de lo mismo: dos campos para una pregunta es
 * cómo acaban contestando distinto.
 *
 * Y marcar Duelo en un mapa que no es de duelo **lo hace de duelo**, con sus dos
 * salidas: un 1v1 sin dos sitios de salida no es un mapa que se pueda ofrecer, y
 * el saneado lo quitaría al guardar. Mejor que la casilla haga lo que promete
 * que que se desmarque sola.
 */
function escribirModos() {
  const modos = MODOS_DE_MAPA.filter((m) => $(`modo-${m}`).checked)
  mapa.modos = modos
  delete mapa.publicado
  if (modos.includes('duelo') && !mapa.soloDuelo) {
    mapa.soloDuelo = true
    salidasDe()
  }
  // **Y marcar el todos contra todos le pone sus salidas** (vuelta 100), por lo
  // mismo que el duelo: sin ellas el saneado quitaría el modo al guardar. Se
  // proponen **diez** desde la 101, las butacas del modo, y se colocan
  // arrastrándolas en la hoja Duelo. Con menos, el mapa se ofrece igual y la
  // barra lo dice (`medirFaltasDeSalidas`).
  if (modos.includes('todos') && salidasDeTodosLeer().length < TODOS.minSalidas) {
    while (salidasDeTodosLeer().length < TODOS.maxJugadores) anadirSalidaDeTodos()
  }
  anotarEnLaBarra(mapa.clave)
}
campo('modo-entrenamiento', escribirModos)
campo('modo-duelo', escribirModos)
campo('modo-todos', escribirModos)

/**
 * **Duplicar el mapa entero** (vuelta 98). Es la puerta que se pidió para sacar
 * de un mapa de duelo su versión de entrenamiento —otro spawn, sin salidas, sus
 * rutas— sin tocar el original. Tres cosas:
 *
 * - **La copia nace en borrador** (`modos: []`), como un mapa nuevo: si naciera
 *   publicada, habría dos mapas iguales en el mismo selector antes de haber
 *   cambiado nada.
 * - **Con una clave libre**, que es la que la hace otro fichero: con la misma,
 *   guardar la copia sería sobrescribir el original.
 * - **Y sin guardar.** Lo que falta es exactamente lo que se va a cambiar.
 */
$('duplicar-mapa').addEventListener('click', () => {
  const base = `${mapa.clave || 'mapa'}-copia`
  let clave = base
  for (let n = 2; SCENARIOS[clave] || clave === mapa.clave; n++) clave = `${base}-${n}`
  const copia = JSON.parse(JSON.stringify(mapa))
  copia.label = `${mapa.label || mapa.clave || 'Mapa'} (copia)`
  copia.modos = []
  delete copia.publicado
  cargar(copia, clave)
  $('duplicar-nota').textContent =
    `Copia abierta como «${clave}», en borrador y sin guardar. Cámbiale lo que quieras y elige dónde se publica en la hoja Mapa.`
})
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
 * **El acabado de la barrera** (vuelta 95). Poner una barrera **le quita el
 * tinte y el dispositivo**, que es exactamente lo que el saneado haría al
 * guardar: dejarlos puestos sería enseñar dos campos que el fichero va a tirar
 * —el fallo de la vuelta 67 por la puerta del panel— y quitarlos aquí es que el
 * creador vea el efecto en el mismo clic.
 */
campo('p-barrera', (v) => {
  const pieza = mapa.boxes[seleccion]
  if (!pieza) return
  if (!v) { delete pieza.barrera; return }
  pieza.barrera = v
  delete pieza.tinte
  delete pieza.superficie
})

/**
 * **La superficie de una pieza, por el panel** (vuelta 80). Lo que se escribe
 * aquí es lo mismo que mueve la flecha del mapa: un solo dato, dos puertas.
 */
campo('p-sup', (v) => {
  const pieza = mapa.boxes[seleccion]
  if (!pieza) return
  if (!v) { delete pieza.superficie; return }
  // Se parte de la receta, no de un objeto vacío: elegir «velocidad» y que la
  // pieza no haga nada hasta rellenar tres campos es el fallo de la vuelta 67
  // en pequeño — un control que promete lo que el juego todavía ignora.
  pieza.superficie = { ...SURFACES.porDefecto[v] }
})
campo('p-sup-fuerza', (v) => {
  const sup = mapa.boxes[seleccion]?.superficie
  if (sup) sup.fuerza = Math.min(Math.max(Number(v) || 0.1, 0.1), SURFACES.fuerzaMax)
})
campo('p-sup-rumbo', (v) => {
  const sup = mapa.boxes[seleccion]?.superficie
  if (sup?.tipo === 'velocidad') sup.rumbo = aRadianes(v)
})
$('p-sup-invisible').addEventListener('change', () => {
  const sup = mapa.boxes[seleccion]?.superficie
  if (!sup) return
  anotarParaDeshacer()
  // Se declara sólo cuando está puesta: un `false` en cada dispositivo de cada
  // mapa es ruido en el fichero (la regla del saneado).
  if ($('p-sup-invisible').checked) sup.invisible = true
  else delete sup.invisible
  sucio = true
  pintarPanel()
})

campo('p-sup-salto', (v) => {
  const sup = mapa.boxes[seleccion]?.superficie
  if (sup?.tipo === 'velocidad') {
    sup.salto = Math.min(Math.max(Number(v) || SURFACES.saltoMin, SURFACES.saltoMin), SURFACES.saltoMax)
  }
})

/**
 * Los campos del tubo. Se acotan **aquí y en el saneado**: el saneado es lo
 * que garantiza el fichero, y esto es lo que hace que el panel no enseñe un
 * número que al guardar va a cambiar solo.
 */
for (const [id, clave, min, max] of [
  ['t-x', 'x', -Infinity, Infinity],
  ['t-z', 'z', -Infinity, Infinity],
  ['t-radio', 'radio', TUBES.radioMin, TUBES.radioMax],
  ['t-grosor', 'grosor', TUBES.grosorMin, TUBES.grosorMax],
  ['t-caras', 'caras', TUBES.carasMin, TUBES.carasMax],
  ['t-alto', 'alto', TUBES.altoMin, TUBES.altoMax],
  ['t-base', 'base', 0, TUBES.altoMax],
]) {
  campo(id, (v) => {
    const tubo = tuboElegido()
    if (!tubo) return
    const n = Number(v)
    if (!Number.isFinite(n)) return
    tubo[clave] = clave === 'caras' ? Math.round(Math.min(Math.max(n, min), max)) : Math.min(Math.max(n, min), max)
  })
}

/**
 * Los campos del prisma. Se acotan **aquí y en el saneado**, como los del tubo:
 * el saneado garantiza el fichero y esto evita que el panel enseñe un número
 * que al guardar va a cambiar solo.
 */
for (const [id, clave] of [['k-x', 'x'], ['k-z', 'z'], ['k-w', 'w'], ['k-d', 'd']]) {
  campo(id, (v) => {
    const prisma = prismaElegido()
    const n = Number(v)
    if (!prisma || !Number.isFinite(n)) return
    prisma[clave] = clave === 'w' || clave === 'd' ? Math.max(n, paso) : n
  })
}
campo('k-lados', (v) => {
  const prisma = prismaElegido()
  const n = Number(v)
  if (!prisma || !Number.isFinite(n)) return
  prisma.lados = Math.round(Math.min(Math.max(n, PRISMAS.ladosMin), PRISMAS.ladosMax))
})
campo('k-giro', (v) => {
  const prisma = prismaElegido()
  const n = Number(v)
  if (!prisma || !Number.isFinite(n)) return
  // El campo va en **grados** y el fichero en radianes, como el rumbo de una
  // salida: lo que se escribe a mano se escribe en grados o no se escribe.
  prisma.giro = aRadianes(((n % 360) + 540) % 360 - 180)
})
campo('k-kind', (v) => {
  const prisma = prismaElegido()
  if (prisma) prisma.kind = v
})
campo('k-base', (v) => {
  const prisma = prismaElegido()
  if (!prisma) return
  const base = Math.max(Number(v) || 0, 0)
  // Subirlo lo sube **entero**, como una pieza: mover sólo la base lo
  // aplastaría contra su propio techo hasta hacerlo desaparecer.
  const grosor = Math.max(coverHeight(prisma.kind) - (prisma.base ? coverHeight(prisma.base) : 0), 0.1)
  if (base <= 0) delete prisma.base
  else prisma.base = Number(base.toFixed(4))
  prisma.kind = Number((base + grosor).toFixed(4))
})

$('k-borrar').addEventListener('click', () => {
  if (marcaElegida?.que?.startsWith('prisma')) borrarLoElegido()
})

$('t-borrar').addEventListener('click', () => {
  if (marcaElegida?.que?.startsWith('tubo')) borrarLoElegido()
})

// ------------------------------------------------- la rampa y la escalera (93)

/**
 * **Mover una rampa la reorienta**, y eso no es un efecto secundario: sus
 * extremos son coordenadas del mundo (`fromZ`/`toZ`), así que moverla sin
 * reescribirlos dejaría una rampa cuya huella está en un sitio y cuya subida se
 * mide en otro — y el motor la vería plana. `orientarRampa` los reescribe desde
 * la huella y el rumbo, que es el único par de datos del que salen los cuatro.
 */
const conRampa = (aplicar) => (v) => {
  const r = rampaElegida()
  if (r) { aplicar(r, v); orientarRampa(r, rumboDeRampa(r)) }
}
campo('r-x', conRampa((r, v) => { r.x = Number(v) || 0 }))
campo('r-z', conRampa((r, v) => { r.z = Number(v) || 0 }))
campo('r-w', conRampa((r, v) => { r.w = Math.max(Number(v) || paso, paso) }))
campo('r-d', conRampa((r, v) => { r.d = Math.max(Number(v) || paso, paso) }))
campo('r-top', (v) => { const r = rampaElegida(); if (r && v) r.top = v })
campo('r-rumbo', (v) => { const r = rampaElegida(); if (r) orientarRampa(r, Number(v) || 0) })

$('r-borrar').addEventListener('click', () => {
  if (marcaElegida?.que?.startsWith('rampa')) borrarLoElegido()
})

const conEscalera = (aplicar) => (v) => {
  const e = escaleraElegida()
  if (e) aplicar(e, v)
}
const acotado = (v, min, max, porDefecto) => {
  const n = Number(v)
  return Math.min(Math.max(Number.isFinite(n) ? n : porDefecto, min), max)
}
campo('e-x', conEscalera((e, v) => { e.x = Number(v) || 0 }))
campo('e-z', conEscalera((e, v) => { e.z = Number(v) || 0 }))
campo('e-ancho', conEscalera((e, v) => { e.ancho = acotado(v, ESCALERAS.anchoMin, ESCALERAS.anchoMax, e.ancho) }))
campo('e-alto', conEscalera((e, v) => { e.alto = acotado(v, ESCALERAS.altoMin, ESCALERAS.altoMax, e.alto) }))
campo('e-base', conEscalera((e, v) => { e.base = Math.max(Number(v) || 0, 0) }))
campo('e-huella', conEscalera((e, v) => { e.huella = acotado(v, ESCALERAS.huellaMin, ESCALERAS.huellaMax, e.huella) }))
/**
 * **Lo que se escribe aquí es lo que se pide, no lo que se monta.** El
 * despliegue sube el número si los escalones no se subirían andando, y el que
 * queda guardado es el pedido: bajarlo a mano al mínimo escribiría en el fichero
 * una decisión que no ha tomado nadie, y subir `COVER.stepHeight` algún día
 * dejaría escaleras con más escalones de los que hacen falta.
 */
campo('e-escalones', conEscalera((e, v) => {
  e.escalones = Math.round(acotado(v, ESCALERAS.escalonesMin, ESCALERAS.escalonesMax, e.escalones))
}))
campo('e-rumbo', conEscalera((e, v) => { e.rumbo = ((Math.round(Number(v) || 0) % 4) + 4) % 4 }))

$('e-borrar').addEventListener('click', () => {
  if (marcaElegida?.que?.startsWith('escalera')) borrarLoElegido()
})

/**
 * **Los dispositivos se colocan desde su hoja** (vuelta 81).
 *
 * Por debajo, un rebote y una plataforma de velocidad son **una pieza con
 * `superficie`** —eso no cambia, y es lo que hace que el motor no sepa que
 * existe un «dispositivo»—. Lo que cambia es la puerta: hasta aquí había que
 * crear la pieza, elegirla, bajar hasta «Superficie» dentro de su ficha y
 * abrir un desplegable, o sea saber la implementación para usar la mecánica.
 *
 * **El alto de fábrica no es decoración**: `COVER.stepHeight` es 0.25, así que
 * una plataforma más alta que eso sólo funciona cayendo encima y no entrando
 * andando (vuelta 80). Una que nazca siendo un bordillo es una que la mitad de
 * las veces no hace nada y no se sabe por qué.
 */
const ALTO_DE_PLATAFORMA = 0.2
/**
 * **El lado del próximo dispositivo** (vuelta 82). Era una constante de 4 y
 * «se sienten demasiado grandes y sin ninguna opción de ajuste» fue el
 * feedback literal. Ahora es estado: los presets lo escriben y el siguiente
 * que se ponga lo usa. No hay tope por arriba — estirar la pieza por su
 * esquina hace un dispositivo del tamaño del suelo de un mapa, que es lo que
 * pide un mapa «4fun» de sólo velocidad.
 */
let ladoDeDispositivo = 4

/** Cómo se llama cada superficie en pantalla. El catálogo está en `SURFACES`. */
const NOMBRE_DE_SUPERFICIE = { rebote: 'Rebote', velocidad: 'Velocidad', hielo: 'Hielo' }

function ponerDispositivo(cual) {
  anotarParaDeshacer()
  if (cual === 'teletransporte') { anadirTeletransporte(); return }
  // **Ni un ventilador ni una tirolina son una losa** (vuelta 83), así que no
  // pasan por aquí: uno es un volumen y la otra es un cable. Comparten botón
  // porque para quien construye son lo mismo —una cosa que te mueve— y eso es
  // lo que decide dónde va el botón, no cómo está guardado el dato.
  if (cual === 'ventilador') { anadirVentilador(); return }
  if (cual === 'tirolina') { anadirTirolina(); return }
  if (cual === 'barrera') { anadirBarrera(); return }
  const w = ladoDeDispositivo
  const d = ladoDeDispositivo
  // Se aparta de lo que ya haya ahí, como una forma nueva desde la vuelta 76:
  // dos plataformas seguidas caían una dentro de otra y la segunda no se veía,
  // así que el botón parecía no hacer nada la segunda vez.
  const { x, z: z0 } = puntoParaColocar(w, d)
  let z = z0
  while (mapa.boxes.some((pieza) => pieza.x === x && pieza.z === z)) z += d + paso
  mapa.boxes.push({
    x,
    z,
    w,
    d,
    kind: ALTO_DE_PLATAFORMA,
    superficie: { ...SURFACES.porDefecto[cual] },
  })
  sucio = true
  // **No se cambia de hoja.** Queda elegido y su flecha ya está dibujada en el
  // mapa, que es con lo que se coloca (convención de la 78); y sus números
  // salen justo debajo, en esta misma hoja. Mandar a quien acaba de pulsar un
  // botón a otra pestaña es perderle el sitio.
  elegir(mapa.boxes.length - 1)
}

/**
 * **Una barrera nace fina y alta** (vuelta 95), y por eso no pasa por el camino
 * de las losas: las otras dos plataformas nacen por debajo de un escalón para
 * que se pueda entrar andando (vuelta 80) y aquí eso sería lo contrario de lo
 * que se quiere. Lo que delimita es **la cara**, así que el grosor es lo de
 * menos y el alto lo es todo — y nace por encima del ápice de la física más
 * saltarina del juego, que es lo que hace que la primera que pongas ya
 * delimite en vez de tener que descubrir por qué no.
 *
 * Y nace **de cristal**, no invisible: una barrera invisible recién puesta es
 * una pieza que hay que buscar a ciegas.
 */
function anadirBarrera() {
  const base = COVER.barrera.porDefecto
  const w = ladoDeDispositivo
  const { x, z: z0 } = puntoParaColocar(w, base.grosor)
  let z = z0
  // Se aparta de lo que ya haya ahí, como cualquier forma nueva desde la 76.
  while (mapa.boxes.some((pieza) => pieza.x === x && pieza.z === z)) z += base.grosor + paso
  mapa.boxes.push({ x, z, w, d: base.grosor, kind: base.alto, barrera: 'cristal' })
  sucio = true
  elegir(mapa.boxes.length - 1)
}

/**
 * **Los presets de tamaño** (vuelta 82). Cambian el dispositivo elegido **sin
 * moverle el centro** —redimensionar desde una esquina lo desplazaría, y lo
 * que se está pidiendo es «esto mismo, más pequeño»— y dejan el lado puesto
 * para el siguiente.
 *
 * `suelo` no es un número más: es la sala entera, que es lo que hace falta
 * para un mapa de sólo velocidad o sólo rebote. Sale de `scenarioRoom`, o sea
 * del mismo sitio del que el juego saca sus paredes, y no de una constante.
 */
function ponerTamanoDeDispositivo(lado) {
  const pieza = mapa.boxes[seleccion]
  anotarParaDeshacer()
  if (lado === 'suelo') {
    const sala = scenarioRoom(mapa)
    if (pieza) {
      pieza.x = -sala.width / 2
      pieza.z = -sala.depth / 2
      pieza.w = sala.width
      pieza.d = sala.depth
    }
    ladoDeDispositivo = Math.min(sala.width, sala.depth)
  } else {
    const n = Number(lado)
    if (!Number.isFinite(n) || n <= 0) return
    if (pieza) {
      // El centro se queda donde estaba: lo que cambia es el tamaño.
      const cx = pieza.x + pieza.w / 2
      const cz = pieza.z + pieza.d / 2
      pieza.w = n
      pieza.d = n
      pieza.x = cx - n / 2
      pieza.z = cz - n / 2
    }
    ladoDeDispositivo = n
  }
  sucio = true
  pintarPanel()
}

$('disp-tamanos').addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-lado]')
  if (!boton) return
  ponerTamanoDeDispositivo(boton.dataset.lado)
})

document.querySelector('[data-hoja="dispositivos"] .formas').addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-dispositivo]')
  if (!boton) return
  ponerDispositivo(boton.dataset.dispositivo)
})

/**
 * **Y se encuentran.** Un rebote en un mapa de cuarenta piezas no se distingue
 * de una caja baja mirándolo desde arriba. La lista los nombra, dice dónde
 * están y los elige — que es lo que faltaba para que colocarlos sirviera de
 * algo.
 */
function pintarDispositivos() {
  const filas = []
  for (const [i, pieza] of mapa.boxes.entries()) {
    /**
     * **Y las barreras también se encuentran** (vuelta 95). Es el otro medio
     * problema de la vuelta 81 y aquí aprieta más: una barrera **invisible** no
     * se ve en el mapa **por definición**, así que sin esta fila la única forma
     * de dar con ella sería pinchar a ciegas donde el jugador se choca.
     */
    if (pieza.barrera) {
      const alto = (coverHeight(pieza.kind) - (pieza.base ? coverHeight(pieza.base) : 0)).toFixed(1)
      filas.push(`<li data-pieza="${i}"><b>Barrera</b> · ${pieza.barrera}, `
        + `${pieza.w}×${pieza.d} y ${alto} u de alto @ ${pieza.x},${pieza.z}</li>`)
      continue
    }
    if (!pieza.superficie) continue
    const sup = pieza.superficie
    // El nombre sale del catálogo y no de un `if` por tipo: añadir uno más a
    // `SURFACES.tipos` no puede dejar una fila llamándose «Velocidad».
    const que = NOMBRE_DE_SUPERFICIE[sup.tipo] ?? sup.tipo
    // **Y en el hielo `fuerza` no es fuerza, es rozamiento**, así que la fila
    // lo dice con su palabra. Un número con dos significados y una sola
    // etiqueta es cómo alguien pone 40 esperando resbalar más.
    const cuanto = sup.tipo === 'hielo' ? `rozamiento ${sup.fuerza}` : `fuerza ${sup.fuerza}`
    filas.push(`<li data-pieza="${i}"><b>${que}</b> · ${cuanto} @ ${pieza.x},${pieza.z}</li>`)
  }
  for (const [i, v] of ventiladoresDe().entries()) {
    filas.push(`<li data-vent="${i}"><b>Ventilador</b> · fuerza ${v.fuerza}, ${v.alto} u de alto @ ${v.x},${v.z}</li>`)
  }
  for (const [i, t] of tirolinasDe().entries()) {
    filas.push(`<li data-tiro="${i}"><b>Tirolina</b> · ${t.desde.x},${t.desde.y},${t.desde.z} → ${t.hasta.x},${t.hasta.y},${t.hasta.z}</li>`)
  }
  for (const [i, tp] of teletransportesDe().entries()) {
    filas.push(`<li data-tp="${i}"><b>Teletransporte</b> · ${tp.x},${tp.z} → ${tp.destino.x},${tp.destino.z}</li>`)
  }
  $('lista-disp').innerHTML = filas.join('') ||
    '<li class="vacia">Ninguno todavía. Pon uno con los botones de arriba.</li>'
  $('cuenta-disp').textContent = filas.length || ''
}

$('lista-disp').addEventListener('click', (evento) => {
  const fila = evento.target.closest('li')
  if (!fila) return
  if (fila.dataset.pieza !== undefined) elegir(Number(fila.dataset.pieza))
  else if (fila.dataset.vent !== undefined) elegirMarca({ que: 'vent', i: Number(fila.dataset.vent) })
  else if (fila.dataset.tiro !== undefined) elegirMarca({ que: 'tiro-a', i: Number(fila.dataset.tiro) })
  else if (fila.dataset.tp !== undefined) elegirMarca({ que: 'tp', i: Number(fila.dataset.tp) })
})

/** Los teletransportes: añadir, quitar y afinar sus números. */
function teletransportesDe() {
  return listaDe('teletransportes')
}

/** Poner uno delante de la cámara. Lo llaman su botón y la hoja de dispositivos. */
function anadirTeletransporte() {
  const tps = listaParaEscribir('teletransportes')
  const base = TELEPORTS.porDefecto
  // Se pone delante de la cámara, como una pieza nueva: un teletransporte que
  // nace en el origen es uno que hay que ir a buscar.
  const centro = orbita.centro
  tps.push({
    x: aRejilla(centro.x + base.x),
    z: aRejilla(centro.z + base.z),
    w: base.w,
    d: base.d,
    destino: { x: aRejilla(centro.x + base.destino.x + 6), z: aRejilla(centro.z + base.destino.z + 6), yaw: 0 },
  })
  elegirMarca({ que: 'tp', i: tps.length - 1 })
  sucio = true
  pintarPanel()
}

$('tp-anadir').addEventListener('click', () => {
  anotarParaDeshacer()
  anadirTeletransporte()
})

$('tp-fichas').addEventListener('click', (evento) => {
  const quitar = evento.target.dataset?.tpQuitar
  if (quitar === undefined) return
  anotarParaDeshacer()
  teletransportesDe().splice(Number(quitar), 1)
  marcaElegida = null
  sucio = true
  pintarPanel()
})

/** Los ventiladores: añadir, quitar y afinar sus números. */
function ventiladoresDe() {
  return listaDe('ventiladores')
}

/** Las tirolinas. Mismo patrón: la lista se crea al pedirla. */
function tirolinasDe() {
  return listaDe('tirolinas')
}

/** Uno delante de la cámara, como una pieza nueva. */
function anadirVentilador() {
  const vs = listaParaEscribir('ventiladores')
  const base = FANS.porDefecto
  const centro = orbita.centro
  vs.push({
    ...base,
    x: aRejilla(centro.x + base.x),
    z: aRejilla(centro.z + base.z),
  })
  elegirMarca({ que: 'vent', i: vs.length - 1 })
  sucio = true
  pintarPanel()
}

function anadirTirolina() {
  const ts = listaParaEscribir('tirolinas')
  const base = ZIPLINES.porDefecto
  const centro = orbita.centro
  ts.push({
    desde: { x: aRejilla(centro.x + base.desde.x), y: base.desde.y, z: aRejilla(centro.z + base.desde.z) },
    hasta: { x: aRejilla(centro.x + base.hasta.x), y: base.hasta.y, z: aRejilla(centro.z + base.hasta.z) },
    velocidad: base.velocidad,
  })
  elegirMarca({ que: 'tiro-a', i: ts.length - 1 })
  sucio = true
  pintarPanel()
}

$('vent-anadir').addEventListener('click', () => { anotarParaDeshacer(); anadirVentilador() })
$('tiro-anadir').addEventListener('click', () => { anotarParaDeshacer(); anadirTirolina() })

$('vent-fichas').addEventListener('click', (evento) => {
  const quitar = evento.target.dataset?.ventQuitar
  if (quitar === undefined) return
  anotarParaDeshacer()
  ventiladoresDe().splice(Number(quitar), 1)
  marcaElegida = null
  sucio = true
  pintarPanel()
})

$('vent-fichas').addEventListener('change', (evento) => {
  const campo = evento.target.dataset?.campo
  const i = evento.target.dataset?.vent
  if (campo === undefined || i === undefined) return
  const v = ventiladoresDe()[Number(i)]
  if (!v) return
  anotarParaDeshacer()
  const n = Number(evento.target.value) || 0
  if (campo === 'w' || campo === 'd') v[campo] = Math.max(n, paso)
  else if (campo === 'alto') v.alto = Math.min(Math.max(n, 0.5), FANS.altoMax)
  else if (campo === 'fuerza') v.fuerza = Math.min(Math.max(n, 0.1), FANS.fuerzaMax)
  else v[campo] = n
  sucio = true
  pintarPanel()
})

$('tiro-fichas').addEventListener('click', (evento) => {
  const quitar = evento.target.dataset?.tiroQuitar
  if (quitar === undefined) return
  anotarParaDeshacer()
  tirolinasDe().splice(Number(quitar), 1)
  marcaElegida = null
  sucio = true
  pintarPanel()
})

$('tiro-fichas').addEventListener('change', (evento) => {
  const campo = evento.target.dataset?.campo
  const i = evento.target.dataset?.tiro
  if (campo === undefined || i === undefined) return
  const t = tirolinasDe()[Number(i)]
  if (!t) return
  anotarParaDeshacer()
  const n = Number(evento.target.value) || 0
  if (campo === 'velocidad') {
    t.velocidad = Math.min(Math.max(n, ZIPLINES.velocidadMin), ZIPLINES.velocidadMax)
  } else {
    const [cual, eje] = campo.split('.')
    t[cual][eje] = n
  }
  sucio = true
  pintarPanel()
})

$('tp-fichas').addEventListener('change', (evento) => {
  const campoTp = evento.target.dataset?.campo
  const i = evento.target.dataset?.tp
  if (campoTp === undefined || i === undefined) return
  const tp = teletransportesDe()[Number(i)]
  if (!tp) return
  anotarParaDeshacer()
  const v = Number(evento.target.value) || 0
  if (campoTp === 'dx') tp.destino.x = v
  else if (campoTp === 'dz') tp.destino.z = v
  else if (campoTp === 'dyaw') tp.destino.yaw = aRadianes(v)
  else if (campoTp === 'w' || campoTp === 'd') tp[campoTp] = Math.max(v, paso)
  else tp[campoTp] = v
  sucio = true
  pintarPanel()
})

/**
 * **Apilar es poner la base en el techo de lo que haya debajo.**
 *
 * «Debajo» es la pieza más alta cuya huella se solapa con la de ésta, que es
 * lo que uno señala con el dedo al decir «encima de aquélla». Si no hay nada
 * debajo, lo dice en vez de no hacer nada.
 */
function apilar() {
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
}

$('p-apilar').addEventListener('click', apilar)

/**
 * **Subir y bajar una pieza son teclas** (vuelta 78). Colocar en altura pedía
 * abrir el panel, encontrar el campo «Base» y escribir un número, o sea salir
 * de la vista para mover algo que se está mirando. **R** sube y **F** baja, del
 * paso de la rejilla, y suben la pieza **entera**: el grosor es el que tenía —
 * mover sólo la base la aplastaría contra su propio techo, que es lo que hacía
 * la primera versión del campo en la vuelta 76.
 */
function subirPieza(cuanto) {
  const pieza = mapa.boxes[seleccion]
  if (!pieza) return
  anotarParaDeshacer()
  const base = pieza.base ? coverHeight(pieza.base) : 0
  const grosor = Math.max(coverHeight(pieza.kind) - base, 0.1)
  const nueva = Math.max(Number((base + cuanto).toFixed(4)), 0)
  if (nueva <= 0) delete pieza.base
  else pieza.base = nueva
  pieza.kind = Number((nueva + grosor).toFixed(4))
  sucio = true
  pintarPanel()
  /**
   * **Y se dice** (vuelta 95). Mover una pieza de altura no cambia su huella,
   * así que mirando el mapa desde arriba —que es de donde se construye— no se
   * nota: el segundo seguro contra un atajo pulsado sin querer es que la barra
   * lo cuente. Y sirve igual para el uso deliberado, que es poder afinar la
   * base sin abrir el panel.
   */
  contar([], nueva > 0 ? `base ${nueva.toFixed(2)} u` : 'apoyada en el suelo')
}

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
  /**
   * **Y una que no es una caja: el tubo** (vuelta 81). Sigue sin haber más
   * primitiva que la caja —`macro` dice que esto no va a `boxes` sino a
   * `tubos`, y `Scenario` lo despliega en cajas al montar—, pero componer un
   * pozo a mano con veintidós piezas es la barrera de entrada que la
   * convención de la 78 vino a quitar. Lo que se ofrece aquí sigue siendo algo
   * contra lo que el motor sabe chocar: por eso se puede ofrecer.
   */
  { id: 'tubo', nombre: 'Tubo', pista: 'pozo redondo', macro: 'tubo' },
  /**
   * **Y dos que se chocan giradas** (vuelta 83). Hasta esta vuelta el editor
   * no podía ofrecerlas y la razón estaba escrita: la colisión era AABB, así
   * que una caja girada se habría dibujado girada, parado las balas bien y
   * chocado sin girar. Con el prisma convexo el motor ya sabe chocarlas, y por
   * eso ahora sí (la regla de la 74).
   *
   * Son dos botones y un solo dato —`prismas`— porque para quien construye son
   * dos cosas distintas: un **muro girado** es la rotación libre que se pedía
   * desde la fase 5, y una **columna** es la curva. Por debajo, cuatro lados o
   * doce.
   */
  { id: 'muro-girado', nombre: 'Muro girado', pista: '12×1 a cualquier ángulo', macro: 'prisma', prisma: { w: 12, d: 1, kind: 'alta', lados: 4 } },
  { id: 'columna', nombre: 'Columna', pista: 'pilar de 12 caras', macro: 'prisma', prisma: { w: 3, d: 3, kind: 'alta', lados: 12 } },
  /**
   * **Y las dos formas de subir un nivel** (vuelta 93). Se pidieron las dos y
   * son dos cosas distintas jugando: por una **rampa** se sube sin tocar nada,
   * y por una **escalera** se sube pisando — así que un escalón es cobertura,
   * te puedes asomar por encima de uno sin exponer el cuerpo, y una rampa no.
   *
   * La rampa **existía en el motor desde el principio** —`groundHeightAt` la
   * interpola y es sólida sólo por arriba, y el Plano A lleva una en cada
   * extremo del Balcón— y lo único que le faltaba era esto: poder dibujarla. La
   * escalera es una macro como el tubo, y `Scenario` la despliega en escalones.
   */
  { id: 'rampa', nombre: 'Rampa', pista: 'sube 2.6 u en 6', macro: 'rampa' },
  { id: 'escalera', nombre: 'Escalera', pista: 'escalones que se suben andando', macro: 'escalera' },
]

function pintarFormas() {
  $('formas').innerHTML = FORMAS
    .map((f) => `<button type="button" data-forma="${f.id}"${f.macro ? ' class="macro"' : ''}><b>${f.nombre}</b><span>${f.pista}</span></button>`)
    .join('')
}

$('formas').addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-forma]')
  if (!boton) return
  const forma = FORMAS.find((f) => f.id === boton.dataset.forma)
  if (!forma) return
  anotarParaDeshacer()
  if (forma.macro === 'prisma') {
    const lista = listaParaEscribir('prismas')
    // Delante de la cámara y **por su centro**, que es lo que `x`/`z` significa
    // en un prisma: la esquina de algo que gira no quiere decir nada.
    const medida = { ...PRISMAS.porDefecto, ...forma.prisma }
    lista.push({
      ...medida,
      ...puntoParaColocar(medida.w ?? 2, medida.d ?? 2, true),
    })
    sucio = true
    elegirMarca({ que: 'prisma', i: lista.length - 1 })
    return
  }
  if (forma.macro === 'rampa') {
    const lista = listaParaEscribir('ramps')
    // Delante de la cámara y con su pie en la esquina mínima, como una pieza.
    // Nace subiendo hacia +Z, que es hacia donde mira quien la coloca.
    const { x, z } = puntoParaColocar(3, 6)
    lista.push({
      x, z,
      w: 3, d: 6,
      fromZ: z, toZ: z + 6,
      top: 'plataforma',
    })
    sucio = true
    elegirMarca({ que: 'rampa', i: lista.length - 1 })
    return
  }
  if (forma.macro === 'escalera') {
    const lista = listaParaEscribir('escaleras')
    // La huella de una escalera crece en su rumbo, así que se acota con su
    // largo desplegado y no con su ancho en los dos ejes.
    const medidas = medidasDeEscalera(ESCALERAS.porDefecto, COVER.stepHeight)
    lista.push({
      ...ESCALERAS.porDefecto,
      ...puntoParaColocar(ESCALERAS.porDefecto.ancho, medidas.largo),
    })
    sucio = true
    elegirMarca({ que: 'escalera', i: lista.length - 1 })
    return
  }
  if (forma.macro === 'tubo') {
    const tubos = listaParaEscribir('tubos')
    // Delante de la cámara, como una pieza nueva: uno que nace en el origen es
    // uno que hay que ir a buscar.
    const fuera = (TUBES.porDefecto.radio + TUBES.porDefecto.grosor) * 2
    tubos.push({
      ...TUBES.porDefecto,
      ...puntoParaColocar(fuera, fuera, true),
    })
    sucio = true
    elegirMarca({ que: 'tubo', i: tubos.length - 1 })
    return
  }
  /**
   * Se aparta de lo que ya haya en ese punto: dos piezas nuevas seguidas caían
   * una dentro de otra y la segunda no se veía, así que parecía que el botón no
   * hacía nada.
   *
   * **Y desde la vuelta 93 lo decide `huecoLibrePara`**, el mismo que el
   * duplicado. Lo de antes comparaba **la esquina exacta** —`pieza.x === x`— así
   * que una pieza nueva dentro de una grande no contaba como ocupado: es el
   * fallo del duplicado por esta otra puerta, y arreglar uno solo habría dejado
   * el otro en pie.
   */
  const donde = { ...puntoParaColocar(forma.w, forma.d), w: forma.w, d: forma.d, kind: forma.kind }
  const { x, z } = huecoLibrePara(donde) ?? donde
  mapa.boxes.push({ x, z, w: forma.w, d: forma.d, kind: forma.kind })
  sucio = true
  elegir(mapa.boxes.length - 1)
})

/**
 * **Una copia aparece en un hueco libre, y cerca** (vuelta 93).
 *
 * Duplicar ponía la copia en `x + w + paso`, o sea justo al lado, y eso falla
 * exactamente cuando más se usa: una pieza pequeña pegada a una grande tiene
 * «justo al lado» **dentro de la grande**. Y dentro no se ve —la cara de la
 * grande está delante— así que la copia existía, se llevaba el clic la grande
 * y había que reescalar algo para poder cogerla.
 *
 * Lo que decide el sitio es una **espiral de anillos por la rejilla** alrededor
 * de la original: se prueba el hueco de la derecha, y si está ocupado el de la
 * izquierda, el de delante, el de detrás, y luego el anillo siguiente. Dos
 * reglas:
 *
 * - **Cerca antes que cómodo.** Se recorre por anillos y no por filas, así que
 *   el sitio que sale es el libre **más próximo**: una copia que aparece a
 *   quince unidades es una copia que hay que ir a buscar, y eso ya lo hacía el
 *   botón de forma nueva mal (empujaba en `z` hasta salir del montón).
 * - **Y si no hay hueco, se pone encima y se dice.** Un mapa denso puede no
 *   tener sitio a tiro; dejar de duplicar sería peor, porque la pieza se puede
 *   mover. Lo que no se hace es fingir que se ha puesto en un hueco.
 */
function chocaConAlgo(caja, saltar = -1) {
  const solapa = (a, b) =>
    a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ
  const dentro = (a, b) => solapa(a, b) && a.base < b.alto && a.alto > b.base

  for (const [i, otra] of mapa.boxes.entries()) {
    if (i === saltar) continue
    if (dentro(caja, {
      minX: otra.x, maxX: otra.x + otra.w, minZ: otra.z, maxZ: otra.z + otra.d,
      base: otra.base ? coverHeight(otra.base) : 0, alto: coverHeight(otra.kind),
    })) return true
  }
  // Los prismas y los tubos también ocupan sitio: una copia dentro de una
  // columna es el mismo fallo con otra forma. Basta su envolvente.
  for (const prisma of mapa.prismas ?? []) {
    const e = envolventeDePrisma(prisma)
    if (dentro(caja, {
      ...e,
      base: prisma.base ? coverHeight(prisma.base) : 0,
      alto: coverHeight(prisma.kind),
    })) return true
  }
  for (const tubo of mapa.tubos ?? []) {
    const r = tubo.radio + tubo.grosor
    if (dentro(caja, {
      minX: tubo.x - r, maxX: tubo.x + r, minZ: tubo.z - r, maxZ: tubo.z + r,
      base: tubo.base ?? 0, alto: (tubo.base ?? 0) + tubo.alto,
    })) return true
  }
  return false
}

function huecoLibrePara(pieza) {
  const base = pieza.base ? coverHeight(pieza.base) : 0
  const alto = coverHeight(pieza.kind)
  const cajaEn = (x, z) => ({ minX: x, maxX: x + pieza.w, minZ: z, maxZ: z + pieza.d, base, alto })
  // El salto de un anillo es el tamaño de la pieza: menos deja la copia
  // solapando a la original por construcción, y más la aleja sin motivo.
  const dx = pieza.w + paso
  const dz = pieza.d + paso
  // El anillo 0 es el sitio pedido: para una pieza nueva es el bueno, y para
  // una copia choca con la original por construcción, así que no hay que
  // excluirlo a mano.
  for (let anillo = 0; anillo <= 12; anillo++) {
    for (let a = -anillo; a <= anillo; a++) {
      for (let b = -anillo; b <= anillo; b++) {
        if (Math.max(Math.abs(a), Math.abs(b)) !== anillo) continue
        const x = aRejilla(pieza.x + a * dx)
        const z = aRejilla(pieza.z + b * dz)
        if (!chocaConAlgo(cajaEn(x, z))) return { x, z }
      }
    }
  }
  return null
}

function duplicarPieza() {
  const pieza = mapa.boxes[seleccion]
  if (!pieza) return
  anotarParaDeshacer()
  const hueco = huecoLibrePara(pieza)
  mapa.boxes.push({ ...pieza, ...(hueco ?? { x: aRejilla(pieza.x + pieza.w + paso) }) })
  sucio = true
  elegir(mapa.boxes.length - 1)
  if (!hueco) contar([], 'no había hueco libre cerca: la copia sale solapada, muévela')
}

$('duplicar').addEventListener('click', duplicarPieza)

/**
 * **Y se copia y se pega con Ctrl+C y Ctrl+V** (vuelta 93), que es lo que
 * cualquiera prueba antes de buscar el botón. El portapapeles es **del
 * editor**, no el del sistema: lo que se copia es una pieza del mapa, no un
 * texto, y pasar por el portapapeles de verdad obligaría a serializarla, a
 * pedir permiso al navegador y a decidir qué hacer con lo que alguien pegue de
 * fuera. Pegar sin nada copiado duplica la elegida, que es lo que se esperaba.
 */
let copiada = null

window.addEventListener('keydown', (evento) => {
  if (motor || escribiendo()) return
  if (!(evento.ctrlKey || evento.metaKey) || evento.shiftKey) return
  if (evento.code === 'KeyC') {
    // Si hay texto seleccionado, Ctrl+C es del navegador: copiar una cifra del
    // panel es un gesto legítimo y esto no puede comérselo.
    if (!(document.getSelection()?.isCollapsed ?? true)) return
    const pieza = mapa.boxes[seleccion]
    if (!pieza) return
    evento.preventDefault()
    copiada = { ...pieza }
    contar([], 'pieza copiada · Ctrl+V la pega en un hueco libre')
    return
  }
  if (evento.code === 'KeyV') {
    evento.preventDefault()
    if (!copiada) { duplicarPieza(); return }
    anotarParaDeshacer()
    const hueco = huecoLibrePara(copiada)
    mapa.boxes.push({ ...copiada, ...(hueco ?? { x: aRejilla(copiada.x + copiada.w + paso) }) })
    sucio = true
    elegir(mapa.boxes.length - 1)
    if (!hueco) contar([], 'no había hueco libre cerca: la copia sale solapada, muévela')
  }
})

$('borrar').addEventListener('click', () => {
  if (!mapa.boxes[seleccion]) return
  anotarParaDeshacer()
  mapa.boxes.splice(seleccion, 1)
  sucio = true
  elegir(-1)
})

// ---------------------------------------------------------------- abrir y guardar

/**
 * Un mapa **como lo deja abrirlo**: saneado y con la sala materializada. Lo
 * usan `cargar` y la comparación del borrador con el disco, que tienen que
 * decir lo mismo byte a byte (vuelta 83: el saneado es un punto fijo).
 */
function comoSeAbre(definicion, clave) {
  const { mapa: limpio, problemas } = sanearMapa({ ...definicion, clave: clave ?? definicion.clave })
  // La sala se materializa al abrir: un escenario puede no declararla —la sala
  // vacía no lo hace— y entonces los tres campos del panel no tendrían qué
  // escribir. `scenarioRoom` es la misma función de la que sale en el juego.
  const sala = scenarioRoom(limpio)
  limpio.room = { width: sala.width, depth: sala.depth, height: sala.height }
  return { limpio, problemas }
}

/** Lo que hay en el disco de esa clave, como lo abriría el editor; `''` si no hay. */
function enElDisco(clave) {
  return clave && SCENARIOS[clave] ? JSON.stringify(comoSeAbre(SCENARIOS[clave], clave).limpio) : ''
}

function cargar(definicion, clave, baseDelDisco = null) {
  const { limpio, problemas } = comoSeAbre(definicion, clave)
  mapa = limpio
  // La base es **lo que hay en el disco con esa clave**, venga de donde venga
  // lo que se abre: abrir un mapa del disco no deja nada pendiente, y una copia,
  // una versión restaurada o un mapa nuevo sí. Un borrador trae la suya.
  base = baseDelDisco ?? enElDisco(limpio.clave)
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
  pintarPendientes()
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
    pintarPendientes()
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

// ---------------------------------------------------------------- subir

/**
 * **Subir es del editor, y por eso se ve** (vuelta 93).
 *
 * La vuelta 91 lo puso al final de `Alchemist.bat`, detrás de la llamada que
 * levanta Vite. Las dos formas de cerrar que el propio script anuncia —Ctrl+C
 * en la ventana, o cerrar la ventana— matan el `.bat` antes de ese paso: la
 * primera hace que `cmd.exe` pregunte «¿terminar el trabajo por lotes?» y
 * aborte, la segunda se lleva el árbol de procesos entero. O sea que el paso
 * era **inalcanzable justo como el script decía que se usara**, y no daba
 * ningún error: un mapa guardado se quedaba en ese PC y el juego seguía con el
 * de antes.
 *
 * Aquí no se puede saltar cerrando nada, y además **se ve sin abrir el panel**:
 * la barra de arriba dice cuántos mapas hay en este PC y no en el juego, que es
 * la regla de la 77 —la barra dice el estado—.
 */
/**
 * **Un mapa y una imagen son dos clases de trabajo perdido** (vuelta 94), así
 * que se cuentan por separado: «2 sin subir» no dice si lo que falta son dos
 * horas de cajas o un fichero arrastrado a una carpeta.
 */
function textoSinSubir(mapas, imagenes) {
  const trozos = []
  if (mapas) trozos.push(mapas === 1 ? '1 mapa' : `${mapas} mapas`)
  if (imagenes) trozos.push(imagenes === 1 ? '1 imagen' : `${imagenes} imágenes`)
  if (!trozos.length) return 'cambios sin subir al juego'
  return `${trozos.join(' y ')} sin subir al juego`
}

async function pintarPendientes() {
  const lista = $('pendientes')
  try {
    const respuesta = await fetch('/__editor/mapas-sin-subir')
    const { mapas, imagenes = [], otros, rama, conflictos = [], enCurso = null } = await respuesta.json()
    const hayAlgo = mapas.length > 0 || imagenes.length > 0 || otros > 0
    /**
     * **Un conflicto no se ofrece subir** (vuelta 99). Con un fichero de mapa
     * a medias de un choque —las marcas `<<<<<<<` dentro— el juego publicado no
     * cargaría, así que el botón se apaga y la barra lo dice en rojo, antes que
     * la cuenta de lo que falta por subir. El servidor se niega igual si se le
     * pide: esto es decirlo, no la puerta.
     */
    const hayConflicto = conflictos.length > 0 || enCurso !== null
    $('conflicto').hidden = !hayConflicto
    $('conflicto').textContent = hayConflicto
      ? `conflicto en ${conflictos.length ? conflictos.map((r) => r.split('/').pop()).join(', ') : `un ${enCurso} a medias`} · no se puede subir`
      : ''
    // Las imágenes van marcadas: en la lista, «nike.webp» al lado de
    // «espejo.js» no diría que una es geometría y la otra un asset.
    lista.innerHTML = [
      ...mapas.map((m) => `<li>${escapar(m)}</li>`),
      ...imagenes.map((i) => `<li>${escapar(i)} <span class="nota">imagen de estampado</span></li>`),
    ].join('')
    $('nada-pendiente').hidden = hayAlgo
    $('subir').disabled = !hayAlgo || hayConflicto
    // El registro y el historial no son mapas, pero suben con ellos: se dicen
    // aparte y no se cuentan, que es lo que deja que el número sea el número.
    $('subir-nota').textContent = [
      rama ? `rama: ${rama}` : '',
      otros ? `y ${otros} fichero(s) del registro y el historial` : '',
      hayConflicto ? 'hay un conflicto sin resolver: cierra Alchemist y vuelve a abrirlo, que el lanzador ofrece arreglarlo' : '',
    ].filter(Boolean).join(' · ')
    const aviso = $('sin-subir')
    aviso.hidden = !hayAlgo
    aviso.textContent = textoSinSubir(mapas.length, imagenes.length)
  } catch {
    // Sin servidor de desarrollo esto no existe, y no es un fallo del mapa.
    lista.innerHTML = ''
    $('subir').disabled = true
    $('sin-subir').hidden = true
    $('conflicto').hidden = true
  }
}

$('subir').addEventListener('click', async () => {
  $('subir').disabled = true
  $('subir-nota').textContent = 'subiendo…'
  try {
    const respuesta = await fetch('/__editor/subir', { method: 'POST' })
    const cuerpo = await respuesta.json()
    if (!respuesta.ok) {
      $('subir-nota').textContent = cuerpo.error ?? 'no se ha podido subir'
      $('subir').disabled = false
      return
    }
    const cuantos = (cuerpo.subidos?.length ?? 0) + (cuerpo.imagenes?.length ?? 0)
    $('subir-nota').textContent = cuantos
      ? `subidos ${cuantos} · en unos minutos están en el juego`
      : (cuerpo.nota ?? 'no había nada que subir')
  } catch (error) {
    $('subir-nota').textContent = `no se ha podido subir: ${error.message}`
  }
  pintarPendientes()
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
    onArma: (evento) => capa?.reaccionArma(evento),
    onPeana: (texto) => capa?.avisoDePeana(texto),
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
  /**
   * **Un mapa de duelo se prueba desde una salida, no desde el centro**
   * (vuelta 93).
   *
   * El `spawn` de un mapa es el punto de aparición del entrenamiento; un mapa de
   * duelo reparte **dos salidas** y el sitio lo da el servidor por ranura
   * (vuelta 49), así que su `spawn` no significa nada y probarlo dejaba al
   * jugador plantado en medio del mapa. Eso no es una vista que ese mapa
   * ofrezca: en El Espejo el centro es justo lo que las dos salidas tienen
   * tapado.
   *
   * Dos cosas:
   *
   * - **Las salidas salen de `scenario.salidasDeDuelo`**, que es la misma
   *   función de la que las saca el servidor. Una segunda lectura de
   *   `duelo.salidas` aquí sería un editor que enseña un sitio y una partida que
   *   usa otro.
   * - **Y va antes de arrancar.** `ponerSalida` se recuerda en el movimiento
   *   (vuelta 93) porque el spawn sale de `setScenario` y el motor lo vuelve a
   *   llamar con cada ajuste aplicado —lo primero que hace una sesión—: puesto
   *   después de `requestStart`, la salida duraba menos de un frame y el jugador
   *   aparecía en el centro igual, sin un error en ninguna pantalla.
   * - **Y cada «Probar» cambia de lado.** Con giro de 180° la simetría sale por
   *   construcción (vuelta 66) pero *verla* pide mirar las dos, y si siempre
   *   saliera por la misma, la mitad del mapa no se probaría nunca.
   */
  // **Y uno de todos contra todos, desde sus salidas** (vuelta 100), por lo
  // mismo: su `spawn` tampoco es donde se sale.
  const deTodos = motor.scenario?.salidasDeTodos ?? []
  const salidas = limpio.soloDuelo ? motor.scenario?.salidasDeDuelo : deTodos.length ? deTodos : null
  if (salidas?.length) {
    const cual = ladoDeDuelo++ % salidas.length
    const salida = salidas[cual]
    motor.movement.ponerSalida(salida.x, salida.z, salida.yaw ?? 0)
    contar(problemas, `probando desde la salida ${cual + 1} de ${salidas.length} · ESC para volver`)
  }

  motor.tiroDeHerramienta = $('tiro-muneco').checked
  motor.start()
  motor.requestStart('endless')

  // El vuelo se aplica después de arrancar: `requestStart` reaparece, y
  // reaparecer pone al jugador en el suelo.
  if ($('god').checked) motor.movement.setVolando(true)
}

/** Por qué salida sale el próximo «Probar» de un mapa de duelo. */
let ladoDeDuelo = 0

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

/**
 * **Cada herramienta con su tecla, y las teclas son funciones** (vuelta 78).
 *
 * El plantado de muñecos sólo se podía apagar desde el panel, y el panel se
 * abre con ESPACIO — que volando **es subir**: con el God mode puesto no había
 * forma de volver a disparar de verdad sin salir de la prueba entera. Sobrecargar
 * una tecla con dos significados según el estado es cómo se llega ahí.
 *
 * F1, F2 y F3 porque **no las usa ninguna mecánica del juego** y porque esta
 * página no comparte binds con él: `KEYBINDS` es un mapa saneado y reasignable
 * del jugador, y una tecla de herramienta que no existe en ninguna partida no
 * tiene por qué gastarle una entrada. La G se queda como estaba: ya estaba en
 * los dedos.
 */
const HERRAMIENTAS = {
  F1: () => { $('tiro-muneco').checked = !$('tiro-muneco').checked; $('tiro-muneco').dispatchEvent(new Event('change')) },
  F2: () => ponerGod(!$('god').checked),
  F3: () => limpiarPlantados(),
  KeyG: () => ponerGod(!$('god').checked),
}

window.addEventListener('keydown', (evento) => {
  if (!motor) return
  const accion = HERRAMIENTAS[evento.code]
  if (!accion) return
  evento.preventDefault()
  accion()
  // Y se dice lo que ha pasado: probando no hay panel a la vista, así que un
  // interruptor que se mueve en silencio es un interruptor que no se sabe en
  // qué posición está.
  capa?.ayuda(
    `${$('tiro-muneco').checked ? 'plantando muñecos (F1)' : 'disparo normal (F1)'} · ` +
    `${$('god').checked ? 'volando (F2)' : 'con gravedad (F2)'} · ${plantados.length} puestos`,
    1600,
  )
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

/**
 * **Las teclas de construir**, y sólo editando: con el motor montado las
 * teclas son del motor (la misma regla que ESPACIO y que la G del vuelo).
 */
window.addEventListener('keydown', (evento) => {
  if (motor || escribiendo() || evento.ctrlKey || evento.metaKey || evento.altKey) return
  /**
   * **Subir y bajar dejan de ser R y F** (vuelta 95). Eran R y F desde la
   * vuelta 78, y **la R es recargar en el juego**: quien construye un mapa es
   * quien más lo juega, así que la pulsa por costumbre con una pieza elegida y
   * la pieza se va hacia arriba. Se reportó como «una pieza se eleva flotando
   * sin querer», y el remedio era Ctrl+Z.
   *
   * La regla de la vuelta 78 decía que **las teclas de herramienta son suyas y
   * no se sobrecargan**, y esto es su otra mitad: tampoco pueden ser las del
   * juego. Re Pág y Av Pág no están en ningún bind de `KEYBINDS` ni pueden
   * estarlo, y dicen arriba y abajo sin que haya que aprendérselo. Lo que se
   * paga es que la mano sale de WASD, y es lo correcto: mover una pieza de
   * altura no es un gesto que se repita cien veces seguidas, y un atajo cómodo
   * que se dispara solo no es cómodo.
   */
  if (evento.code === 'PageUp') { evento.preventDefault(); subirPieza(paso); return }
  if (evento.code === 'PageDown') {
    evento.preventDefault()
    // **Bajar sobre una pieza ya apoyada la apila**: bajar de cero no lleva a
    // ninguna parte, y lo que se quiere al llegar al suelo es asentarla.
    const pieza = mapa.boxes[seleccion]
    const base = pieza?.base ? coverHeight(pieza.base) : 0
    if (pieza && base <= 0) apilar()
    else subirPieza(-paso)
    return
  }
  if (evento.code === 'Delete' || evento.code === 'Backspace') {
    /**
     * **Supr borra lo elegido, sea lo que sea** (vuelta 96). Hasta aquí salía
     * con un `if (seleccion < 0) return`, y `seleccion` es **sólo una caja**:
     * rampa, escalera, tubo, prisma, estampado, ventilador, tirolina,
     * teletransporte y salida se eligen como *marca*, con `seleccion = -1`. O sea
     * que la tecla no borraba a ninguno de los nueve, y se reportó de la escalera
     * porque es la que se estaba usando.
     *
     * Lo que lo cierra no es enumerarlos aquí: es que **borrar uno sea una sola
     * función** (`borrarLoElegido`), con su tabla al lado de los accesores. Un
     * tipo nuevo que se añada a esa tabla hereda la tecla sin tocar esto.
     */
    if (seleccion >= 0) { evento.preventDefault(); $('borrar').click(); return }
    if (borrarLoElegido()) evento.preventDefault()
  }
})

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
  escalarGizmoDePieza()
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
    // **Del mapa entero y no de lo que se dibuja** (vuelta 96): ver `escenarioMedido`.
    for (const malla of escenarioMedido.occluders) {
      triangulos += (malla.geometry?.index?.count ?? malla.geometry?.attributes?.position?.count ?? 0) / 3
    }

    const aprieta = media > PRESUPUESTO_MS
    // En la barra, lo corto; en el panel, con su denominador entero (vuelta 46).
    const corto = `${media.toFixed(4)} ms/paso` + (aprieta ? ' — SE PASA' : '')
    const largo = `${media.toFixed(4)} ms de colisión por paso (peor bloque ${peor.toFixed(4)})` +
      ` · ${escenarioMedido.boxes.length} piezas · ${Math.round(triangulos)} triángulos` +
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
    try {
      const texto = JSON.stringify(mapa)
      // **Abrir no es editar** (vuelta 99): igual que la base, no hay nada que
      // salvar y un borrador ahí sólo serviría para resucitar esta versión el
      // día que el disco cambie.
      if (texto === base) localStorage.removeItem(BORRADOR)
      else localStorage.setItem(BORRADOR, JSON.stringify({ v: 2, mapa, base }))
    } catch (error) {
      contar([`no se puede guardar el borrador: ${error.message}`], '')
    }
  }, 400)
}

/** Enseña u oculta el borrador apartado en la hoja de Archivo. */
function pintarApartado(nota = '') {
  let guardado = null
  try { guardado = localStorage.getItem(APARTADO) } catch { /* sin almacén no hay apartado */ }
  let clave = ''
  try { clave = guardado ? (JSON.parse(guardado).mapa?.clave ?? '') : '' } catch { /* roto: se ofrece tirarlo */ }
  $('apartado').hidden = !guardado
  $('apartado-nota').hidden = !guardado && !nota
  $('apartado-nota').textContent = nota || (guardado
    ? `Hay un borrador de «${clave || 'un mapa'}» de antes de que ese mapa cambiara en el disco. `
      + 'No se abre solo: guardarlo pisaría lo nuevo con lo viejo.'
    : '')
}

$('abrir-apartado').addEventListener('click', () => {
  let guardado = null
  try { guardado = JSON.parse(localStorage.getItem(APARTADO) ?? 'null') } catch { /* roto */ }
  if (!guardado?.mapa) { pintarApartado('El borrador apartado no se puede leer.'); return }
  // Se abre con la base **del disco de hoy**: lo que tienes delante ya no es
  // lo guardado, así que el borrador vuelve a contar como cambio pendiente.
  cargar(guardado.mapa, undefined, enElDisco(guardado.mapa.clave) || null)
  try { localStorage.removeItem(APARTADO) } catch { /* da igual */ }
  pintarApartado()
  contar([], 'borrador apartado abierto · ojo: es anterior a lo que hay en el disco')
})

$('tirar-apartado').addEventListener('click', () => {
  try { localStorage.removeItem(APARTADO) } catch { /* da igual */ }
  pintarApartado('Borrador apartado tirado.')
})

function recuperarBorrador(pedido) {
  let guardado = null
  try { guardado = localStorage.getItem(BORRADOR) } catch { return false }
  if (!guardado) return false
  try {
    const leido = JSON.parse(guardado)
    // Antes de la 99 el borrador era el mapa a secas, sin su base.
    const borrador = leido?.v === 2 ? leido.mapa : leido
    const suBase = leido?.v === 2 ? leido.base : null
    /**
     * **Un borrador de otro mapa no manda sobre la dirección** (vuelta 76). El
     * borrador es «lo que estabas haciendo» y por eso gana por defecto; pero si
     * la barra pide un mapa **concreto** y el borrador es de otro, lo que se ha
     * pedido es ese otro. Sin esto, `/editor/#pilares` abría lo último que se
     * hubiera tocado y no había forma de decir cuál se quiere.
     */
    if (pedido && borrador.clave !== pedido) return false
    /**
     * **Y un borrador no manda sobre un disco que ha cambiado** (vuelta 99).
     * Si su mapa existe en el disco y no es la versión de la que salió —o no
     * se sabe, porque es de antes de la 99—, se aparta y se abre lo del disco.
     */
    const disco = enElDisco(borrador.clave)
    if (disco && suBase !== disco) {
      try {
        localStorage.setItem(APARTADO, JSON.stringify({ v: 2, mapa: borrador, base: suBase }))
        localStorage.removeItem(BORRADOR)
      } catch { /* sin almacén no hay a dónde apartarlo; al menos no se abre */ }
      // Se abre lo que hay en el disco de ese mismo mapa: es lo que se estaba
      // editando, en su versión de hoy.
      if (!pedido) cargar(SCENARIOS[borrador.clave], borrador.clave)
      contar([], `el borrador de ${borrador.clave} era de antes de que el mapa cambiara: `
        + 'se ha apartado sin abrirlo (hoja Archivo)')
      return !pedido
    }
    cargar(borrador, undefined, suBase ?? '')
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
    // Lo que llega por el relevo **acaba de escribirse** en el disco, aunque el
    // registro que lo trae todavía no esté servido: es su propia base.
    cargar(guardadoMapa, undefined, JSON.stringify(comoSeAbre(guardadoMapa).limpio))
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
    // Si el borrador de este mapa se acaba de apartar, lo que se dice es eso.
    if (!$('estado').textContent) contar([], `abierto ${deLaBarra} · guardado en src/maps/`)
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
  pintarFondo()
  // **Lo que este mapa no tiene se apaga, no se enseña vacío.** Un mapa de
  // entrenamiento no tiene salidas ni dotación —tiene un spawn y rutas—, y
  // unos campos en blanco ahí prometen algo que el juego va a ignorar, que es
  // el fallo del selector de la vuelta 67.
  $('duelo-campos').hidden = !mapa.soloDuelo

  const duelo = mapa.duelo ?? {}
  pintarFichasDeSalida()
  pintarTodos()
  $('caja-compra').value = duelo.cajaCompra?.ancho ?? ROUNDS.cajaCompra.ancho
  $('invulnerabilidad').value = duelo.invulnerabilidadMs ?? 0
  $('invulnerabilidad').max = INVULNERABILIDAD_MAX

  $('sin-economia').checked = Boolean(duelo.sinEconomia)
  $('dotacion-campos').hidden = !duelo.sinEconomia
  $('dotacion-arma').value = duelo.dotacion?.arma ?? Object.keys(PRIMARY_WEAPONS)[0]
  $('dotacion-escudo').checked = Boolean(duelo.dotacion?.chaleco)
  $('dotacion-casco').checked = Boolean(duelo.dotacion?.casco)

  // **Los campos escriben en la banda elegida**, que es la que está encendida
  // en la vista. Con varias, editar siempre la primera sería un panel que
  // contradice lo que se está mirando.
  const zona = mapa.spawnZone?.[zonaElegida()]
  for (const [id, valor] of [['zona-x', zona?.x], ['zona-z', zona?.z], ['zona-w', zona?.w], ['zona-d', zona?.d]]) {
    $(id).value = valor ?? ''
  }
  const cuantas = mapa.spawnZone?.length ?? 0
  $('cuenta-zonas').textContent = cuantas
    ? `${cuantas} banda${cuantas === 1 ? '' : 's'} · editando la ${zonaElegida() + 1}`
    : 'ninguna'

  $('fisica-propia').checked = Boolean(mapa.fisica)
  $('fisica-campos').hidden = !mapa.fisica
  $('fis-gravedad').value = mapa.fisica?.gravity ?? MOVEMENT.gravity
  $('fis-salto').value = mapa.fisica?.jumpSpeed ?? MOVEMENT.jumpSpeed
  $('fis-aire').value = mapa.fisica?.airStrafeMaxSpeed ?? MOVEMENT.airStrafeMaxSpeed
  notaDeFisica()
  pintarPorDefecto()
}

/**
 * **Una ficha por Player Spawner** (vuelta 78), con el color de su equipo.
 *
 * Es la otra mitad de los conos de la rejilla: allí se coloca y se gira, y aquí
 * se afina a la décima y se lee qué jugador es. Leer «1» y «2» en una lista y
 * ver dos conos de colores en la vista tienen que casar sin pensar, así que el
 * filo de la ficha es exactamente el color del cono — los dos salen de `TEAMS`,
 * que es el mismo dato con el que el juego tiñe a los jugadores.
 *
 * Y las fichas se regeneran enteras en vez de actualizarse: son dos o tres, y
 * un `innerHTML` que se lee de un vistazo vale más que un diff que hay que
 * seguir con el dedo.
 */
function pintarFichasDeSalida() {
  const salidas = mapa.soloDuelo && Array.isArray(mapa.duelo?.salidas) ? mapa.duelo.salidas : []
  $('cuenta-salidas').textContent = salidas.length
    ? `${salidas.length}${salidas.length === 2 ? '' : ' · un 1v1 necesita dos'}`
    : ''
  $('cuenta-salidas').className = `nota ${salidas.length === 2 ? 'cabe' : 'aprieta'}`

  const arma = mapa.duelo?.sinEconomia
    ? (PRIMARY_WEAPONS[mapa.duelo?.dotacion?.arma]?.label ?? 'sin arma')
    : 'la que compre'

  $('salidas-fichas').innerHTML = salidas.map((s, i) => {
    const puesta = marcaElegida?.que === 'salida' && marcaElegida.i === i
    return `<div class="ficha-salida ${puesta ? 'puesta' : ''}" style="--filo:${colorDeSalida(i)}">
      <h4><span class="punto"></span>Jugador ${i + 1}
        <button type="button" data-quitar="${i}" title="Quitar este spawner">✕</button></h4>
      <div class="trio">
        <label>X <input data-salida="${i}" data-clave="x" type="number" step="0.5" value="${s.x}" /></label>
        <label>Z <input data-salida="${i}" data-clave="z" type="number" step="0.5" value="${s.z}" /></label>
        <label>Rumbo <input data-salida="${i}" data-clave="yaw" type="number" step="15" value="${aGrados(s.yaw)}" /></label>
      </div>
      <p class="nota">Sale con <b>${arma}</b>.</p>
    </div>`
  }).join('')
}

/**
 * **Los campos de una ficha escriben en el mapa, como cualquier otro campo.**
 *
 * Van delegados porque las fichas se regeneran: un `addEventListener` por
 * campo se quedaría colgado del nodo viejo en el primer repintado, que es el
 * clásico «el número se escribe una vez y luego deja de hacer nada».
 */
$('salidas-fichas').addEventListener('change', (evento) => {
  const campo = evento.target.closest('input[data-salida]')
  if (!campo) return
  anotarParaDeshacer()
  const s = salidasDe()[Number(campo.dataset.salida)]
  if (!s) return
  const clave = campo.dataset.clave
  s[clave] = clave === 'yaw' ? aRadianes(campo.value) : (Number(campo.value) || 0)
  sucio = true
  refrescarPanel()
})

$('salidas-fichas').addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-quitar]')
  if (!boton) return
  anotarParaDeshacer()
  salidasDe().splice(Number(boton.dataset.quitar), 1)
  marcaElegida = null
  sucio = true
  refrescarPanel()
})

/**
 * **Añadir un spawner lo pone en la rejilla, no en un formulario.** Cae en el
 * centro de la vista —donde estás mirando— y desde ahí se arrastra. Un campo
 * en blanco con «X: 0, Z: 0» pondría la salida en el origen, que en un mapa
 * simétrico es el peor sitio posible.
 */
$('salida-anadir').addEventListener('click', () => {
  anotarParaDeshacer()
  if (!mapa.soloDuelo) mapa.soloDuelo = true
  const salidas = salidasDe()
  // Y dentro de la sala, como todo lo colocable: una salida fuera del recinto
  // es un jugador que aparece donde no se puede jugar.
  const { x, z } = puntoParaColocar(1.2, 1.2, true)
  salidas.push({ x, z, yaw: Math.atan2(-(0 - x), -(0 - z)) })
  marcaElegida = { que: 'salida', i: salidas.length - 1 }
  sucio = true
  refrescarPanel()
  contar([], `spawner ${salidas.length} puesto en ${x},${z} · arrástralo por la rejilla`)
})

/**
 * **La sección del todos contra todos** (vuelta 100). Se rellena al abrir el
 * panel, como el resto de la hoja: el número de jugadores **es** el número de
 * salidas, y las fichas son las del duelo con otro color.
 */
function pintarTodos() {
  const salidas = salidasDeTodosLeer()
  $('todos-jugadores').value = salidas.length
  $('todos-jugadores').max = TODOS.maxSalidas
  // **Caben tantos como salidas, de 3 a 10** (vuelta 105), con la misma cuenta
  // que el lobby: por debajo de tres, rojo.
  const pocas = salidas.length < TODOS.minSalidas
  $('cuenta-todos').textContent = !salidas.length
    ? ''
    : pocas
      ? `${salidas.length} salida${salidas.length === 1 ? '' : 's'} · hacen falta ${TODOS.minSalidas}`
      : `${salidas.length} salidas · ${rangoDeJugadores(capacidadDeTodos(mapa))}`
  $('cuenta-todos').className = `nota ${pocas ? 'mal' : 'cabe'}`
  $('todos-fichas').innerHTML = salidas.map((s, i) => {
    const puesta = marcaElegida?.que === 'todos' && marcaElegida.i === i
    return `<div class="ficha-salida ${puesta ? 'puesta' : ''}" style="--filo:#e8e8e8">
      <h4><span class="punto"></span>Salida ${i + 1}
        <button type="button" data-quitar-todos="${i}" title="Quitar esta salida">✕</button></h4>
      <div class="trio">
        <label>X <input data-todos="${i}" data-clave="x" type="number" step="0.5" value="${s.x}" /></label>
        <label>Z <input data-todos="${i}" data-clave="z" type="number" step="0.5" value="${s.z}" /></label>
        <label>Rumbo <input data-todos="${i}" data-clave="yaw" type="number" step="15" value="${aGrados(s.yaw)}" /></label>
      </div>
    </div>`
  }).join('')
}

/**
 * **Una salida nueva, en un sitio libre de la sala**: sobre un anillo al 70 %
 * del lado, repartidas por ángulo, y mirando al centro. No es el sitio bueno
 * —eso lo decide quien construye, arrastrando— sino uno que no está encima de
 * otra salida ni fuera del recinto.
 */
function anadirSalidaDeTodos() {
  const salidas = salidasDeTodosParaEscribir()
  if (salidas.length >= TODOS.maxSalidas) {
    contar([], `el tope es ${TODOS.maxSalidas} salidas`)
    return null
  }
  const sala = scenarioRoom(mapa)
  const n = salidas.length
  const angulo = (n * 2 * Math.PI) / Math.max(TODOS.minSalidas, n + 1) + n * 0.39
  const x = aRejilla(Math.sin(angulo) * sala.width * 0.35)
  const z = aRejilla(Math.cos(angulo) * sala.depth * 0.35)
  salidas.push({ x, z, yaw: aRadianes(Math.round((Math.atan2(x, z) * 180) / Math.PI)) })
  return salidas.length - 1
}

$('todos-anadir').addEventListener('click', () => {
  anotarParaDeshacer()
  const i = anadirSalidaDeTodos()
  if (i === null) return
  marcaElegida = { que: 'todos', i }
  sucio = true
  refrescarPanel()
  contar([], `salida ${i + 1} del todos contra todos · arrástrala por la rejilla`)
})

/**
 * **El número de salidas pone y quita salidas** (vuelta 100; se llamaba
 * «Jugadores» hasta la 101, cuando pudo haber más salidas que butacas).
 * Subirlo añade las que falten en sitios libres; bajarlo quita las
 * **últimas**, que son las que se pusieron después.
 */
campo('todos-jugadores', (v) => {
  const quiere = Math.max(0, Math.min(TODOS.maxSalidas, Math.round(Number(v) || 0)))
  const salidas = salidasDeTodosParaEscribir()
  while (salidas.length < quiere) anadirSalidaDeTodos()
  if (salidas.length > quiere) salidas.splice(quiere)
  if (!salidas.length) delete mapa.todos
  marcaElegida = null
  pintarTodos()
})

$('todos-fichas').addEventListener('change', (evento) => {
  const entrada = evento.target.closest('input[data-todos]')
  if (!entrada) return
  anotarParaDeshacer()
  const s = salidasDeTodosLeer()[Number(entrada.dataset.todos)]
  if (!s) return
  const clave = entrada.dataset.clave
  s[clave] = clave === 'yaw' ? aRadianes(entrada.value) : (Number(entrada.value) || 0)
  sucio = true
  refrescarPanel()
})

$('todos-fichas').addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-quitar-todos]')
  if (!boton) return
  anotarParaDeshacer()
  salidasDeTodosParaEscribir().splice(Number(boton.dataset.quitarTodos), 1)
  if (!mapa.todos.salidas.length) delete mapa.todos
  marcaElegida = null
  sucio = true
  refrescarPanel()
})

/** Todas mirando al centro de la sala: `atan2(x, z)`, la cuenta de `salidasGiro90`. */
$('t-centro').addEventListener('click', () => {
  const salidas = salidasDeTodosLeer()
  if (!salidas.length) return
  anotarParaDeshacer()
  for (const s of salidas) s.yaw = aRadianes(Math.round((Math.atan2(s.x, s.z) * 180) / Math.PI))
  sucio = true
  refrescarPanel()
})

/**
 * **Lo que un mapa de todos contra todos tiene que garantizar se mide**: que
 * ninguna salida vea a otra, con el mismo rayo que la aparición y contra el mapa
 * entero —ocultar una pieza no puede cambiar el veredicto—. Y la distancia más
 * corta entre dos, que es cuánto aire tiene quien acaba de aparecer.
 */
$('t-medir').addEventListener('click', () => {
  const salidas = salidasDeTodosLeer()
  if (salidas.length < 2) {
    $('t-medida').textContent = 'Hacen falta al menos dos salidas para medir.'
    return
  }
  const { seVen, cerca, pares } = salidasQueSeVen(salidas)
  parejasQueSeVen = seVen
  pintarFaltasDeSalidas()
  $('t-medida').textContent = `${cerca.toFixed(1)} u entre las dos más cercanas · ` + (seVen.length
    ? `SE VEN ${seVen.length} de ${pares} pares (${seVen.slice(0, 6).join(', ')}${seVen.length > 6 ? '…' : ''}): mete algo en medio`
    : `ninguna ve a otra (${pares} pares)`)
  $('t-medida').className = `nota ${seVen.length ? 'mal' : 'cabe'}`
})

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
  // **Lo que se publica se fija antes de tocar esto** (vuelta 98). En un mapa sin
  // `modos`, dónde sale se deduce de `soloDuelo`, así que desmarcarlo lo movería
  // del duelo al entrenamiento sin que nadie lo haya pedido. Se escribe lo que
  // había y, si deja de ser de duelo, se le quita sólo el duelo.
  mapa.modos = modosDeMapa(mapa)
  delete mapa.publicado
  mapa.soloDuelo = $('solo-duelo').checked || undefined
  if (!mapa.soloDuelo) mapa.modos = mapa.modos.filter((m) => m !== 'duelo')
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
/**
 * **El desplegable de fondo lleva los cuatro dibujados y las fotos que haya**
 * (vuelta 78).
 *
 * Las fotos salen de `public/fondos/`, que las lista el servidor de desarrollo:
 * dejar un `.jpg` ahí y abrir el editor es todo lo que hay que hacer para
 * verlo puesto. Es la vía que la vuelta 77 dejó cerrada, abierta **para poder
 * valorarla** — un panorama fotográfico sigue siendo el primer asset externo
 * del proyecto y eso sigue sin decidirse; lo que ya no hay es que decidirlo a
 * ciegas.
 *
 * Y el valor de una foto **no es una clave, es un objeto con su ruta**, que es
 * lo que hace que en el fichero del mapa se vea que depende de un archivo.
 */
let fotosDeFondo = []

function rellenarFondos() {
  const puestos = Object.entries(FONDOS)
    .map(([clave, f]) => `<option value="${clave}">${f.label}</option>`).join('')
  const fotos = fotosDeFondo.length
    ? `<optgroup label="Fotos de public/fondos/">${fotosDeFondo
        .map((f) => `<option value="foto:${f.url}">${f.nombre}</option>`).join('')}</optgroup>`
    : ''
  $('fondo').innerHTML =
    `<option value="">(ninguno, sólo la rejilla)</option>${puestos}${fotos}`
  pintarFondo()
}

async function cargarFotosDeFondo() {
  try {
    const respuesta = await fetch('/__editor/fondos')
    if (!respuesta.ok) return
    const { fotos } = await respuesta.json()
    if (!Array.isArray(fotos) || fotos.length === 0) return
    fotosDeFondo = fotos
    rellenarFondos()
  } catch {
    // Sin listado no pasa nada: quedan los cuatro dibujados, que es lo que
    // había. El editor no puede depender de una petición para arrancar.
  }
}

/** Escribe en el desplegable lo que el mapa tenga, y dice lo que eso cuesta. */
function pintarFondo() {
  const fondo = mapa.fondo
  $('fondo').value = esFotoDeFondo(fondo) ? `foto:${fondo.url}` : (fondo ?? '')
  const nodo = $('fondo-nota')
  if (esFotoDeFondo(fondo)) {
    nodo.className = 'nota aprieta'
    nodo.textContent =
      'Este mapa usa una foto: es un archivo que el navegador descarga, y el ' +
      'primero del proyecto. Los cuatro de arriba se dibujan en un canvas y no ' +
      'descargan nada. Déjala en public/fondos/ para que exista donde se juegue.'
  } else if (fondo) {
    nodo.className = 'nota cabe'
    nodo.textContent = 'Dibujado al vuelo: ni descarga, ni colisión, ni presupuesto.'
  } else {
    nodo.className = 'nota'
    nodo.textContent = ''
  }
}

campo('fondo', (v) => {
  if (v.startsWith('foto:')) {
    const url = v.slice(5)
    mapa.fondo = esFotoDeFondo({ tipo: 'imagen', url }) ? { tipo: 'imagen', url } : undefined
  } else mapa.fondo = FONDOS[v] ? v : undefined
  pintarFondo()
})

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
  if (escenarioMedido) {
    // Los ojos a la altura de siempre, y el mismo rayo que usa la aparición. Y
    // contra el mapa entero: ocultar una pieza no puede cambiar el veredicto.
    const ojos = 1.7
    seVen = hasLineOfSight(
      new THREE.Vector3(a.x, ojos, a.z),
      new THREE.Vector3(b.x, ojos, b.z),
      escenarioMedido.occluders,
    )
  }
  $('s-medida').textContent =
    `${dist.toFixed(1)} u entre salidas` +
    (seVen === null ? '' : seVen
      ? ' · SE VEN: la ronda empieza resuelta, mete algo en medio'
      : ' · sin línea de visión entre ellas')
  $('s-medida').className = `nota ${seVen ? 'aprieta' : 'cabe'}`
})

/**
 * **La gracia de salida es del mapa y la aplica el servidor** (vuelta 78).
 *
 * No es un campo decorativo: `Partida._empezarRonda` la lee de
 * `scenario.invulnerabilidadDeDuelo` y `_aplicarDano` la respeta, y el HUD la
 * dibuja con el mismo marco azul del entrenamiento. Escribir aquí un número
 * que el servidor ignorase sería el fallo de la vuelta 67.
 */
campo('invulnerabilidad', (v) => {
  const ms = Math.min(Math.max(Number(v) || 0, 0), INVULNERABILIDAD_MAX)
  const d = dueloDe()
  if (ms <= 0) delete d.invulnerabilidadMs
  else d.invulnerabilidadMs = Math.round(ms)
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
/** Cuál de las bandas están escribiendo los campos: la elegida, o la primera. */
function zonaElegida() {
  if (marcaElegida?.que === 'zona' || marcaElegida?.que === 'zona-esquina') {
    return Math.max(0, marcaElegida.i ?? 0)
  }
  return 0
}

for (const [id, clave] of [['zona-x', 'x'], ['zona-z', 'z'], ['zona-w', 'w'], ['zona-d', 'd']]) {
  campo(id, (v) => {
    if (!mapa.spawnZone?.length) mapa.spawnZone = [{ x: 0, z: 0, w: 0, d: 0 }]
    const zona = mapa.spawnZone[zonaElegida()] ?? mapa.spawnZone[0]
    zona[clave] = Number(v) || 0
  })
}
/**
 * **Dibujar la zona la pone en la rejilla con un tamaño que se ve.** Con cero
 * de ancho no se dibuja nada, así que «crear» y luego «estirar desde la
 * esquina» sería crear algo invisible: nace como una banda que cruza la sala
 * por delante del spawn, que es lo que una zona de aparición *es* (vuelta 43).
 */
$('zona-crear').addEventListener('click', () => {
  anotarParaDeshacer()
  const sala = scenarioRoom(mapa)
  const fondo = 6
  if (!Array.isArray(mapa.spawnZone)) mapa.spawnZone = []
  mapa.spawnZone.push({
    x: aRejilla(-sala.width / 2),
    z: aRejilla(mapa.spawn.z - fondo / 2),
    w: aRejilla(sala.width),
    d: fondo,
  })
  marcaElegida = { que: 'zona', i: mapa.spawnZone.length - 1 }
  sucio = true
  refrescarPanel()
})

/** Quita **la banda elegida**, no todas: con dos, borrarlo todo no es deshacer. */
$('zona-quitar').addEventListener('click', () => {
  if (!mapa.spawnZone?.length) return
  anotarParaDeshacer()
  mapa.spawnZone.splice(zonaElegida(), 1)
  marcaElegida = null
  sucio = true
  refrescarPanel()
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

/**
 * **De dónde partir, en vez de un campo en blanco** (vuelta 78).
 *
 * «Gravedad: ___» pide afinar decimales a quien todavía no sabe qué hace un
 * decimal ahí. Lo que hay aquí son **las físicas que ya existen y se han
 * jugado** —la de siempre y la de Los Pilares— más dos combinaciones con su
 * cuenta hecha, y cada una dice **lo que se sube de un salto**, que es el
 * número con el que de verdad se construye: en Los Pilares la torre mide 3.2
 * porque el ápice es 3.26 (vuelta 72).
 *
 * Las dos primeras salen del juego y no de una copia: `fisicaDeEscenario` es la
 * misma función que lee el motor, así que si algún día cambia la gravedad de
 * Los Pilares, aquí cambia sola.
 */
function recetasDeFisica() {
  const deMapa = (clave, nombre, porque) => {
    const f = fisicaDeEscenario(clave)
    return { nombre, porque, ...f }
  }
  return [
    deMapa('duelo', 'La de siempre', 'la de todos los mapas menos uno'),
    deMapa('pilares', 'Los Pilares', 'saltos largos y air-strafe como forma de moverse'),
    {
      nombre: 'Luna',
      porque: 'muy flotante: llegar arriba es fácil y caer, lento',
      gravity: 8,
      jumpSpeed: 7,
      airStrafeMaxSpeed: 14,
    },
    {
      nombre: 'Pesada',
      porque: 'el suelo manda: saltar apenas despega',
      gravity: 42,
      jumpSpeed: 9,
      airStrafeMaxSpeed: 8,
    },
  ]
}

function pintarRecetasDeFisica() {
  $('fisica-recetas').innerHTML = recetasDeFisica().map((r, i) => {
    const apice = (r.jumpSpeed * r.jumpSpeed) / (2 * r.gravity)
    const vuelo = ((2 * r.jumpSpeed) / r.gravity) * 1000
    return `<button type="button" data-receta="${i}">
      <b>${r.nombre}</b><span>${r.porque}</span>
      <span class="cifras">gravedad ${r.gravity} · salto ${r.jumpSpeed} · aire ${r.airStrafeMaxSpeed}
        → sube ${apice.toFixed(2)} u en ${vuelo.toFixed(0)} ms</span>
    </button>`
  }).join('')
}

$('fisica-recetas').addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-receta]')
  if (!boton) return
  const r = recetasDeFisica()[Number(boton.dataset.receta)]
  if (!r) return
  anotarParaDeshacer()
  mapa.fisica = {
    gravity: r.gravity,
    jumpSpeed: r.jumpSpeed,
    airStrafeMaxSpeed: r.airStrafeMaxSpeed,
  }
  sucio = true
  refrescarPanel()
  contar([], `física «${r.nombre}» puesta · afínala desde ahí`)
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
 * **El panel vuelve al lateral, con raíl de iconos y ancho arrastrable**
 * (vuelta 78).
 *
 * La vuelta 77 lo puso flotante y centrado con un argumento correcto —una
 * barra fija de 300 px no escala a once secciones, y el menú del duelo ya
 * había enseñado a dónde lleva eso (`menu62`)— pero resolvió el escalado
 * rompiendo lo que la herramienta hace: **construir es mirar el mapa**, y un
 * panel centrado tapa justo la parte que se está tocando. Se abría para mover
 * un número, se cerraba para mirar, se volvía a abrir.
 *
 * El raíl resuelve las dos cosas a la vez, y por eso no es «volver atrás»:
 *
 * - **Las secciones crecen por el raíl, no por la columna.** Una sección nueva
 *   es un icono más en una lista vertical de 56 px; la columna de contenido no
 *   se entera. El problema de escala de la 77 no puede volver.
 * - **La vista pierde sólo el ancho que le des**, y lo das arrastrando el
 *   borde. Colocar piezas y escribir una física piden anchos distintos.
 * - **Y el raíl está siempre**, abierto el panel o no: es la única pista
 *   permanente de qué se puede configurar aquí dentro. Cada icono lleva su
 *   palabra debajo, porque un raíl de pictogramas es un examen.
 *
 * ESPACIO sigue abriendo y cerrando, y sigue siendo del editor: esta página no
 * comparte binds con el juego (la misma regla que la **G** del vuelo), y con el
 * motor montado la tecla es del motor.
 */
const ANCHO_PANEL = 'vektor.editor.ancho.v1'
const ANCHO_MIN = 240
const ANCHO_MAX = 760

/** Qué hoja estaba abierta la última vez. Reabrir en otra es perder el sitio. */
let pestanaActual = 'construir'

function panelAbierto() { return $('lateral').dataset.abierto === 'true' }

function abrirPanel(abrir = true, pestana = null) {
  if (motor) return
  if (pestana) pestanaActual = pestana
  $('lateral').dataset.abierto = String(Boolean(abrir))
  // Volar con el panel puesto sería mover la cámara a ciegas detrás de él.
  if (abrir) {
    teclasCamara.clear()
    elegirPestana(pestanaActual)
    refrescarPanel()
  }
  redimensionar()
}

function elegirPestana(cual) {
  pestanaActual = cual
  for (const boton of document.querySelectorAll('#rail button[data-pestana]')) {
    boton.classList.toggle('puesta', boton.dataset.pestana === cual)
  }
  for (const hoja of document.querySelectorAll('.hoja')) {
    hoja.hidden = hoja.dataset.hoja !== cual
  }
}

for (const boton of document.querySelectorAll('#rail button[data-pestana]')) {
  boton.addEventListener('click', () => {
    // Pinchar la sección que ya está abierta cierra: es el gesto que todo el
    // mundo prueba, y sin él hay que ir hasta el botón de cerrar.
    if (panelAbierto() && pestanaActual === boton.dataset.pestana) abrirPanel(false)
    else abrirPanel(true, boton.dataset.pestana)
  })
}
$('cerrar-panel').addEventListener('click', () => abrirPanel(false))

/**
 * **El tirador de ancho.** Se guarda porque cambiarlo cada vez es el ajuste que
 * nadie usa, y `localStorage` es por origen como todo lo demás de esta página.
 */
function ponerAncho(px) {
  const ancho = Math.min(Math.max(Math.round(px), ANCHO_MIN), ANCHO_MAX)
  $('lateral').style.setProperty('--ancho-panel', `${ancho}px`)
  try { localStorage.setItem(ANCHO_PANEL, String(ancho)) } catch { /* sin persistencia se edita igual */ }
  redimensionar()
}
try {
  const guardado = Number(localStorage.getItem(ANCHO_PANEL))
  if (Number.isFinite(guardado) && guardado > 0) ponerAncho(guardado)
} catch { /* ídem */ }

$('tirador').addEventListener('pointerdown', (evento) => {
  evento.preventDefault()
  $('tirador').setPointerCapture(evento.pointerId)
  $('tirador').classList.add('tirando')
  const mover = (e) => ponerAncho(e.clientX - $('rail').getBoundingClientRect().width)
  const soltar = () => {
    $('tirador').classList.remove('tirando')
    window.removeEventListener('pointermove', mover)
    window.removeEventListener('pointerup', soltar)
  }
  window.addEventListener('pointermove', mover)
  window.addEventListener('pointerup', soltar)
})

/**
 * **El panel se rellena al abrirlo, no por frame.** Está cerrado casi todo el
 * tiempo y sus campos no cambian solos: pintarlos sesenta veces por segundo
 * sería la regla del HUD (cero repintado por frame) rota por comodidad.
 *
 * Con una excepción que la vuelta 78 añade y que **no** rompe la regla:
 * arrastrando un marcador sí se repinta, porque ahí los números **son** la
 * lectura de lo que estás moviendo. Eso corre mientras el ratón está abajo, no
 * siempre.
 */
function refrescarPanel() {
  if (!panelAbierto()) return
  pintarPanel()
  pintarDuelo()
  pintarReglas()
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

// ------------------------------------------------- restablecer por valor

/**
 * **Un botón de restablecer por ajuste, como en las opciones del juego**
 * (vuelta 78; la idea, de la 59).
 *
 * El botón general es todo o nada, y aquí «todo» es el mapa entero: trastear
 * con la gravedad y querer volver atrás no puede costar también la sala y las
 * salidas. El valor sale de **una sola tabla** y el botón se inyecta al lado de
 * su campo, así que no hay una segunda lista de valores de fábrica que se pueda
 * quedar vieja — que es exactamente la razón por la que en el juego la fila se
 * identifica por la clave del ajuste y no por su descriptor.
 *
 * Se queda **deshabilitado y no oculto** cuando el campo ya está en su valor:
 * un botón que aparece y desaparece mueve la fila de sitio al rozarla.
 */
const DEFECTOS = {
  // La sala de un mapa en blanco, que sale de `mapaNuevo` y no de un número
  // escrito aquí: si algún día el mapa nuevo nace en otra sala, esto la sigue.
  'sala-w': () => mapaNuevo().room.width,
  'sala-d': () => mapaNuevo().room.depth,
  'sala-h': () => mapaNuevo().room.height,
  'spawn-x': () => 0,
  'spawn-z': () => 0,
  'paso': () => 0.5,
  'p-base': () => 0,
  'caja-compra': () => ROUNDS.cajaCompra.ancho,
  'invulnerabilidad': () => 0,
  'fis-gravedad': () => MOVEMENT.gravity,
  'fis-salto': () => MOVEMENT.jumpSpeed,
  'fis-aire': () => MOVEMENT.airStrafeMaxSpeed,
}

function montarPorDefecto() {
  for (const id of Object.keys(DEFECTOS)) {
    const campo = $(id)
    if (!campo || campo.parentElement.querySelector('.por-defecto')) continue
    const boton = document.createElement('button')
    boton.type = 'button'
    boton.className = 'por-defecto'
    boton.dataset.para = id
    boton.textContent = 'por defecto'
    boton.title = 'Restablece sólo este valor'
    boton.addEventListener('click', () => {
      campo.value = String(DEFECTOS[id]())
      campo.dispatchEvent(new Event('change', { bubbles: true }))
    })
    campo.parentElement.appendChild(boton)
  }
}

/** Apaga los que ya están en su valor. Se llama al pintar, como todo lo demás. */
function pintarPorDefecto() {
  for (const boton of document.querySelectorAll('.por-defecto')) {
    const campo = $(boton.dataset.para)
    if (!campo) continue
    const actual = Number(campo.value)
    const fabrica = Number(DEFECTOS[boton.dataset.para]())
    boton.disabled = Number.isFinite(actual) && Math.abs(actual - fabrica) < 1e-9
  }
}

// --------------------------------------------------------------- la marca

/**
 * **La marca de agua de Vektor Alchemist** (vuelta 78).
 *
 * Es el personaje sin texto, trazado con potrace como el resto de la identidad
 * (`Reference/Logo/alchemist.png` → `npm run trace:logo`), así que **no es un
 * asset**: al navegador le llega un trazado, no una imagen. Y es opcional: si
 * la referencia todavía no está, `LOGO.alchemist` vale `null` y la esquina se
 * queda vacía en vez de enseñar un hueco roto.
 *
 * `fill-rule: evenodd` por la razón de siempre (vuelta 35): potrace mete los
 * huecos en el mismo trazado contando con esa regla, y con la de por defecto
 * la marca se rellena entera y sale una mancha.
 */
function pintarMarca() {
  const marca = LOGO.alchemist
  if (!marca) return
  $('marca').innerHTML =
    `<svg viewBox="${marca.viewBox}" fill="#d8d8d8" fill-rule="evenodd" ` +
    `role="img" aria-label="Vektor Alchemist"><path d="${marca.d}"/></svg>`
}

// ---------------------------------------------------------------- atajos

/**
 * **Los atajos, a la vista** (vuelta 78).
 *
 * Un editor con teclas escondidas dentro de un panel que hay que abrir es un
 * editor sin teclas: quien no las sabe no va a buscarlas ahí. La lista sale de
 * **una tabla**, no escrita a mano en el HTML, para que añadir un atajo sea
 * añadir una fila y no acordarse de dos sitios.
 */
const ATAJOS = [
  ['ESPACIO', 'abre y cierra el panel'],
  ['Clic izq.', 'elige y arrastra una pieza, una salida o una zona'],
  ['Esquinas', 'estira la pieza elegida · el cubo de arriba cambia su alto'],
  ['Flecha azul', 'rumbo y fuerza de una superficie · vertical, cuánto lanza'],
  ['Aro verde', 'gira la pieza 90° (ancho y fondo cambiados)'],
  ['Clic der.', 'orbita la cámara · un clic sin arrastrar sobre una pieza la apila'],
  ['Rueda', 'acerca y aleja'],
  ['WASD', 'vuela la cámara (el ratón sobre el mapa)'],
  ['Q / E', 'baja y sube la cámara'],
  ['Mayús', 'corre, volando'],
  ['Re Pág / Av Pág', 'sube y baja la pieza elegida'],
  ['Ctrl+Z', 'deshacer · con Mayús, rehacer'],
  ['Ctrl+C / V', 'copia y pega la pieza elegida, en un hueco libre'],
  ['Supr', 'borra la pieza elegida'],
  ['ESC', 'cierra el panel · y vuelve de «probar»'],
  ['F1 / F2 / F3', 'plantar muñecos · volar · limpiar (probando)'],
]

/**
 * **Y la tecla del juego que aparece en una ficha sale del bind** (vuelta 97).
 *
 * Los atajos de arriba son **del editor** y van escritos: son suyos y no están en
 * `KEYBINDS` (vuelta 78). La de la tirolina no: es la acción contextual del
 * juego, reasignable, y la ficha la tenía escrita como «E» — o sea la única
 * tecla del panel que podía estar mintiendo.
 */
function pintarTeclasDelJuego() {
  const contextual = $('tecla-contextual')
  if (contextual) contextual.textContent = keyLabel(keysOf('use', getKeybinds())[0])
}

pintarTeclasDelJuego()

function pintarAtajos() {
  $('atajos-lista').innerHTML = ATAJOS
    .map(([tecla, que]) => `<dt>${tecla}</dt><dd>${que}</dd>`)
    .join('')
}

const ATAJOS_PLEGADO = 'vektor.editor.atajos.v1'
$('atajos-plegar').addEventListener('click', () => {
  const plegado = $('atajos').dataset.plegado !== 'true'
  $('atajos').dataset.plegado = String(plegado)
  try { localStorage.setItem(ATAJOS_PLEGADO, String(plegado)) } catch { /* da igual */ }
})
try {
  if (localStorage.getItem(ATAJOS_PLEGADO) === 'true') $('atajos').dataset.plegado = 'true'
} catch { /* ídem */ }

capa = montarCapaDeDuelo($('capa'))

pintarFormas()
pintarAtajos()
pintarRecetasDeFisica()
montarPorDefecto()
pintarMarca()
rellenarAlturas()
cargarFotosDeFondo()
cargarImagenesDeEstampado()

/**
 * **Y la lista se rehace sin reiniciar, por tres puertas** (vueltas 95 y 96).
 *
 * La 95 puso una sola —volver a la ventana— con este argumento: «dejar un
 * fichero en una carpeta se hace fuera del navegador, así que volver a la
 * ventana *es* la señal». Suena bien y **no es verdad**: es *una* señal, y sólo
 * si el navegador llega a perder el foco y a recuperarlo. Copiando el fichero
 * desde una ventana que está encima, arrastrándolo, o descargándolo con el
 * propio navegador, no hay ninguna vuelta que detectar — y se reportó
 * exactamente así, «no aparece hasta cerrar Alchemist».
 *
 * La que no falla es la primera, y es la que la 95 no vio: **quien ve aparecer
 * el fichero es el servidor**, que ya tiene la carpeta vigilada. El aviso llega
 * por el canal de HMR, así que existe sólo en desarrollo, que es donde existe
 * esta página. Las otras dos se quedan porque no estorban y cubren el caso de
 * que el aviso no llegue —un fichero copiado antes de abrir, un servidor
 * reiniciado por debajo—.
 */
if (import.meta.hot) {
  import.meta.hot.on('vektor:estampados', () => { cargarImagenesDeEstampado() })
}
window.addEventListener('focus', () => { cargarImagenesDeEstampado() })
$('est-buscar').addEventListener('click', async () => {
  // **Y el botón dice lo que ha encontrado.** Es la mitad que faltaba: pulsarlo
  // repintaba el desplegable con la misma lista y desde fuera eso es idéntico a
  // un botón roto. No hay más mecanismo aquí que decirlo en voz alta.
  const aviso = $('est-buscados')
  aviso.hidden = false
  aviso.textContent = 'Buscando…'
  const cuantas = await cargarImagenesDeEstampado()
  aviso.textContent = cuantas < 0
    ? 'No se ha podido preguntar a la carpeta.'
    : cuantas === 0
      ? 'La carpeta public/estampados/ está vacía.'
      : `${cuantas} ${cuantas === 1 ? 'imagen' : 'imágenes'} en la carpeta.`
})
abrirLoQueToque()
pintarApartado()
elegirPestana(pestanaActual)
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
  get marcas() { return marcas },
  get fantasmas() { return fantasmas },
  get escenarioMedido() { return escenarioMedido },
  get proxies() { return proxies },
  get pinchables() { return pinchables },
  get tiradoresDePieza() { return tiradoresDePieza },
  get marcaElegida() { return marcaElegida },
  get seleccion() { return seleccion },
  get panelAbierto() { return panelAbierto() },
  get pestana() { return pestanaActual },
  coverHeight,
  abrirPanel,
  cargar,
  colocar,
  elegir,
  elegirMarca,
  moverMarca,
  sanear: () => sanearMapa(mapa),
  /** Para un banco que edita el mapa a mano: lo que haría cualquier control. */
  marcarSucio() { sucio = true },
  probar,
  dejarDeProbar,
  /**
   * **Y dos instrumentos más, de la vuelta 93.** El primero es para medir en
   * píxeles: un tirador que «es más pequeño» no dice nada, y lo que hay que
   * afirmar es que **cabe en la pieza que agarra** en la misma captura (la
   * regla del denominador, vuelta 46). Es la matriz con la que se dibuja, así
   * que lo que devuelve es lo que se ve.
   */
  TIRADOR,
  proyectar(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(camara)
    const caja = renderer.domElement.getBoundingClientRect()
    return { x: ((v.x + 1) / 2) * caja.width, y: ((1 - v.y) / 2) * caja.height }
  },
  /**
   * El segundo arrastra un tirador por su nombre. Pinchar una bola de medio
   * metro con coordenadas de pantalla es una medida que falla por el ángulo de
   * cámara y no por el código, y lo que se está midiendo es qué le hace al mapa
   * —no el `raycast`, que ya lo miden los `pinchables`—.
   */
  arrastrarTirador(que, punto) {
    const pieza = mapa.boxes[seleccion]
    if (!pieza) return null
    const marca = tiradoresDePieza.find((t) => t.userData.marca.que === que)?.userData.marca
    if (!marca) return null
    const arrastre = comenzarArrastreDePieza(marca, pieza, punto, { clientY: 0 })
    if (!arrastre) return null
    moverTiradorDePieza(arrastre, punto, { clientY: 0 })
    sucio = true
    return { ...pieza }
  },
}

// ---------------------------------------------------------------- reglas

/**
 * **La hoja «Reglas de partida»** (vuelta 106, propuesta 08): con qué armas se
 * juega en este mapa y cómo se consiguen. Tres modos excluyentes —Armería,
 * Equipadas y Peanas—, las armas del mapa marcadas con su código de armería (el
 * nombre que el jugador conoce, vuelta 98) y el equipo de salida. Se guarda en
 * el mapa (`reglas`), y lo que vale lo de fábrica no se escribe.
 *
 * Se pinta al abrir la hoja y al cambiar algo, no por frame (la regla del HUD
 * en una página sin React).
 */
const FRASE_DE_MODO = {
  armeria: 'Se compra (duelo y equipos) o se equipa en la armería (todos contra todos), sólo entre las armas marcadas.',
  equipadas: 'Todos salen con el mismo equipo, el de abajo. Sin tienda ni dinero; al morir se vuelve a salir con él.',
  peanas: 'Se sale con el equipo base y las armas se cogen de las peanas, apuntando y con la tecla de acción. Sin tienda ni dinero.',
}

function pintarReglas() {
  const hoja = document.querySelector('[data-hoja="reglas"]')
  if (!hoja || hoja.hidden) return
  const r = reglasDeMapa(mapa)
  for (const b of hoja.querySelectorAll('[data-modo]')) b.setAttribute('aria-pressed', String(b.dataset.modo === r.modo))
  $('reglas-modo-nota').textContent = FRASE_DE_MODO[r.modo]

  // Las armas del mapa, por categorías, con su código.
  const marcables = armasMarcables()
  const marcada = (clave) => !r.armas || r.armas.includes(clave)
  $('reglas-cuenta').textContent = `· ${marcables.filter((i) => marcada(i.clave)).length} de ${marcables.length}`
  const porCategoria = new Map()
  for (const item of marcables) {
    if (!porCategoria.has(item.categoria)) porCategoria.set(item.categoria, [])
    porCategoria.get(item.categoria).push(item)
  }
  const caja = $('reglas-armas')
  caja.innerHTML = ''
  for (const [categoria, items] of porCategoria) {
    const grupo = document.createElement('div')
    grupo.className = 'reglas-cat'
    const titulo = document.createElement('h3')
    titulo.textContent = `${categoria} · ${ECONOMY.categorias[categoria] ?? ''}`
    const todas = document.createElement('button')
    todas.type = 'button'; todas.textContent = 'todas'; todas.dataset.cat = categoria; todas.dataset.valor = '1'
    const ninguna = document.createElement('button')
    ninguna.type = 'button'; ninguna.textContent = 'ninguna'; ninguna.dataset.cat = categoria; ninguna.dataset.valor = '0'
    titulo.append(' ', todas, ' ', ninguna)
    grupo.appendChild(titulo)
    for (const item of items) {
      const l = document.createElement('label')
      l.className = 'checkline'
      l.innerHTML = `<input type="checkbox" data-arma="${item.clave}" ${marcada(item.clave) ? 'checked' : ''}/> <span class="codigo">${item.categoria} ${item.codigo}</span> ${item.nombre}`
      grupo.appendChild(l)
    }
    caja.appendChild(grupo)
  }

  // El equipo: entero en Equipadas, sólo el base en Peanas, nada en Armería.
  const e = r.equipo
  $('reglas-equipo').hidden = r.modo === 'armeria'
  $('reglas-equipo-armas').hidden = r.modo !== 'equipadas'
  $('reglas-chaleco').checked = Boolean(e.chaleco)
  $('reglas-casco').checked = Boolean(e.casco)
  const opciones = (slot, valor, vacio) => [
    `<option value="">${vacio}</option>`,
    ...marcables.filter((i) => WEAPONS[i.clave]?.slot === slot && marcada(i.clave))
      .map((i) => `<option value="${i.clave}" ${i.clave === valor ? 'selected' : ''}>${i.categoria} ${i.codigo} · ${i.nombre}</option>`),
  ].join('')
  $('reglas-principal').innerHTML = opciones('primary', e.principal, 'ninguna')
  $('reglas-pistola').innerHTML = opciones('secondary', e.pistola, 'la de serie')
  $('reglas-especial').innerHTML = opciones('special', e.especial, 'ninguna')
  const granadas = $('reglas-granadas')
  granadas.innerHTML = ''
  for (const item of marcables.filter((i) => WEAPONS[i.clave]?.slot === 'throwable' && marcada(i.clave))) {
    const l = document.createElement('label')
    l.className = 'checkline'
    l.innerHTML = `<input type="checkbox" data-granada="${item.clave}" ${(e.granadas ?? []).includes(item.clave) ? 'checked' : ''}/> ${item.nombre}`
    granadas.appendChild(l)
  }

  // Las peanas.
  const peanas = peanasDe()
  $('reglas-peanas').hidden = r.modo !== 'peanas' && peanas.length === 0
  $('cuenta-peanas').textContent = `· ${peanas.length}${peanas.length ? ` · ${new Set(peanas.map((p) => p.arma)).size} armas` : ''}`
  const elegida = marcaElegida?.que === 'peana' ? peanas[marcaElegida.i] : null
  $('peana-ficha').hidden = !elegida
  if (elegida) {
    $('peana-arma').innerHTML = marcables.filter((i) => marcada(i.clave))
      .map((i) => `<option value="${i.clave}" ${i.clave === elegida.arma ? 'selected' : ''}>${i.categoria} ${i.codigo} · ${i.nombre}</option>`).join('')
  }
  // **Los avisos**: peanas en un modo que no las usa, y una peana al alcance de
  // un anclaje de tirolina, donde la tecla haría dos cosas según dónde mires.
  const avisos = []
  if (peanas.length && r.modo !== 'peanas') avisos.push('Estas peanas no se pueden coger: el mapa no está en modo Peanas (se conservan).')
  if (r.modo === 'peanas' && !peanas.length) avisos.push('Modo Peanas sin ninguna peana: se sale sólo con el equipo base y la pistola.')
  for (const [i, p] of peanas.entries()) {
    for (const t of tirolinasDe()) {
      for (const a of [t.desde, t.hasta]) {
        if (Math.hypot(a.x - p.x, a.z - p.z) < ZIPLINES.alcanceU + PEANAS.radioU) {
          avisos.push(`La peana ${i + 1} está al alcance de un cable: la tecla de acción coge el arma si la apuntas y el cable si no.`)
        }
      }
    }
  }
  $('peanas-aviso').textContent = avisos.join(' ')
}

/** Aplica un cambio a las reglas, anotando el deshacer y repintando. */
function cambiarReglas(fn) {
  anotarParaDeshacer()
  fn(reglasParaEscribir())
  limpiarReglas()
  sucio = true
  pintarPanel()
  pintarReglas()
}

document.querySelector('[data-hoja="reglas"]')?.addEventListener('click', (evento) => {
  const modo = evento.target.closest('[data-modo]')?.dataset.modo
  if (modo && MODOS_DE_ARMAS.includes(modo)) {
    cambiarReglas((r) => { r.modo = modo })
    return
  }
  const cat = evento.target.dataset?.cat
  if (cat !== undefined) {
    const valor = evento.target.dataset.valor === '1'
    cambiarReglas((r) => {
      const todas = armasMarcables()
      const actuales = new Set(r.armas ?? todas.map((i) => i.clave))
      for (const i of todas) if (String(i.categoria) === cat) (valor ? actuales.add(i.clave) : actuales.delete(i.clave))
      r.armas = todas.map((i) => i.clave).filter((c) => actuales.has(c))
    })
  }
})
document.querySelector('[data-hoja="reglas"]')?.addEventListener('change', (evento) => {
  const t = evento.target
  if (t.dataset.arma) {
    cambiarReglas((r) => {
      const todas = armasMarcables().map((i) => i.clave)
      const actuales = new Set(r.armas ?? todas)
      if (t.checked) actuales.add(t.dataset.arma); else actuales.delete(t.dataset.arma)
      r.armas = todas.filter((c) => actuales.has(c))
      // El equipo no puede llevar lo que el mapa ya no admite.
      const e = r.equipo
      if (e) {
        for (const k of ['principal', 'pistola', 'especial']) if (e[k] && !actuales.has(e[k])) delete e[k]
        if (e.granadas) { e.granadas = e.granadas.filter((g) => actuales.has(g)); if (!e.granadas.length) delete e.granadas }
      }
    })
    return
  }
  if (t.dataset.granada) {
    cambiarReglas((r) => {
      const e = (r.equipo ??= {})
      const g = new Set(e.granadas ?? [])
      if (t.checked) g.add(t.dataset.granada); else g.delete(t.dataset.granada)
      e.granadas = [...g].slice(0, ECONOMY.granadasMax)
      if (!e.granadas.length) delete e.granadas
    })
    return
  }
  const campos = { 'reglas-principal': 'principal', 'reglas-pistola': 'pistola', 'reglas-especial': 'especial' }
  if (campos[t.id]) {
    cambiarReglas((r) => {
      const e = (r.equipo ??= {})
      if (t.value) e[campos[t.id]] = t.value; else delete e[campos[t.id]]
    })
    return
  }
  if (t.id === 'reglas-chaleco' || t.id === 'reglas-casco') {
    const clave = t.id === 'reglas-chaleco' ? 'chaleco' : 'casco'
    cambiarReglas((r) => {
      const e = (r.equipo ??= {})
      if (t.checked) e[clave] = true; else delete e[clave]
    })
    return
  }
  if (t.id === 'peana-arma' && marcaElegida?.que === 'peana') {
    anotarParaDeshacer()
    const p = peanasDe()[marcaElegida.i]
    if (p) p.arma = t.value
    sucio = true
    pintarPanel()
    pintarReglas()
  }
})

/**
 * **Poner una peana** (vuelta 106): delante de la cámara y dentro de la sala,
 * con la primera arma marcada, y elegida. La convención de la vuelta 96.
 */
function anadirPeana(arma, cerca = null) {
  const r = reglasDeMapa(mapa)
  const clave = arma ?? armasMarcables().find((i) => !r.armas || r.armas.includes(i.clave))?.clave
  if (!clave) return null
  const lista = listaParaEscribir('peanas')
  if (lista.length >= PEANAS.max) { contar([], `tope de ${PEANAS.max} peanas`); return null }
  const punto = cerca ?? puntoParaColocar(1, 1, true)
  lista.push({ x: punto.x, z: punto.z, arma: clave })
  return lista.length - 1
}

$('peana-anadir')?.addEventListener('click', () => {
  anotarParaDeshacer()
  const i = anadirPeana()
  if (i === null) return
  marcaElegida = { que: 'peana', i }
  sucio = true
  pintarPanel()
  pintarReglas()
  contar([], `peana ${i + 1} · arrástrala por la rejilla`)
})

/**
 * **Duplicar la elegida**: la misma arma, a dos unidades en el primer sitio
 * libre de un anillo. Las peanas se repiten —diez de Krakov son diez sitios
 * donde se consigue un Krakov—, así que duplicar es el gesto normal, no un atajo.
 */
$('peana-duplicar')?.addEventListener('click', () => {
  if (marcaElegida?.que !== 'peana') return
  const origen = peanasDe()[marcaElegida.i]
  if (!origen) return
  const libre = (x, z) => peanasDe().every((p) => Math.hypot(p.x - x, p.z - z) >= 1.5)
  let sitio = null
  for (let k = 0; k < 8 && !sitio; k++) {
    const a = (k / 8) * Math.PI * 2
    const x = aRejilla(origen.x + Math.cos(a) * 2)
    const z = aRejilla(origen.z + Math.sin(a) * 2)
    if (libre(x, z)) sitio = { x, z }
  }
  anotarParaDeshacer()
  const i = anadirPeana(origen.arma, sitio ?? { x: origen.x + 2, z: origen.z })
  if (i === null) return
  marcaElegida = { que: 'peana', i }
  sucio = true
  pintarPanel()
  pintarReglas()
  contar([], `peana ${i + 1} · copia de la ${peanasDe().indexOf(origen) + 1}`)
})

$('peana-quitar')?.addEventListener('click', () => {
  if (marcaElegida?.que !== 'peana') return
  borrarLoElegido()
  pintarReglas()
})
