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
import { COLORS, COVER, FANS, FONDOS, GIZMO, MOVEMENT, PRIMARY_WEAPONS, PRISMAS, ROUNDS, SCENARIOS, SURFACES, TARGET, TEAMS, TELEPORTS, TUBES, ZIPLINES, coverHeight, esFotoDeFondo, fisicaDeEscenario, giro180, scenarioRoom } from '../src/config.js'
import { Avatar } from '../src/game/avatar.js'
import { Engine } from '../src/game/engine.js'
import { MovementController } from '../src/game/movement.js'
import { Scenario } from '../src/game/scenario.js'
import { createScene } from '../src/game/scene.js'
import { hasLineOfSight } from '../src/game/sight.js'
import { INVULNERABILIDAD_MAX, SALA, mapaComoModulo, mapaNuevo, sanearMapa } from '../src/maps/formato.js'
import { puntosDePrisma } from '../src/maps/prisma.js'
import { cajasDeTubo } from '../src/maps/tubo.js'
import { montarCapaDeDuelo } from '../src/ui/duelo.jsx'
import { LOGO } from '../src/ui/logoPaths.js'

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

/** Radio del tirador de una esquina. Lo bastante gordo para pillarlo con el ratón. */
const TIRADOR = 0.45

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

for (const [i] of ESQUINAS.entries()) {
  nuevoTirador(
    { que: 'pieza-esquina', esquina: i },
    new THREE.Mesh(
      new THREE.BoxGeometry(TIRADOR, TIRADOR, TIRADOR),
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
 * **Los tiradores se ven igual de lejos que de cerca**, que es lo único que
 * merecía la pena copiarle a `TransformControls`: un cubo de 0.45 u a ochenta
 * unidades son tres píxeles, o sea una manija que no se puede agarrar justo
 * cuando hace falta mirar el mapa entero. Va por frame y no en el repintado
 * porque la rueda mueve la cámara sin tocar el mapa.
 */
function escalarGizmoDePieza() {
  if (!gizmoPieza.visible) return
  const k = Math.min(Math.max(orbita.radio / GIZMO.distanciaDeReferencia, 1), GIZMO.escalaMax)
  for (const t of tiradoresDePieza) t.scale.setScalar(k)
}

/** Coloca los tiradores sobre la pieza elegida. Sale de `pintarContorno`. */
function pintarGizmoDePieza(pieza) {
  gizmoPieza.visible = Boolean(pieza)
  if (!pieza) return
  const alto = coverHeight(pieza.kind)
  const base = pieza.base ? coverHeight(pieza.base) : 0
  for (const [i, [ex, ez]] of ESQUINAS.entries()) {
    gizmoPieza.children[i].position.set(pieza.x + ex * pieza.w, base + 0.1, pieza.z + ez * pieza.d)
  }
  tiradorAlto.position.set(pieza.x + pieza.w / 2, alto, pieza.z + pieza.d / 2)
  // El aro va fuera de la caja, a media altura: dentro se confundiría con ella.
  tiradorGiro.position.set(
    pieza.x + pieza.w / 2,
    base + (alto - base) / 2,
    pieza.z + pieza.d + TIRADOR * 2,
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
function pintarMarcas() {
  limpiarMarcas()
  pinchables.length = 0

  const duelo = mapa.duelo ?? {}
  const salidas = mapa.soloDuelo && Array.isArray(duelo.salidas) ? duelo.salidas : []
  const caja = duelo.cajaCompra ?? ROUNDS.cajaCompra

  for (const [i, salida] of salidas.entries()) {
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
     * **El aro, y lo que se pincha no es el aro** (vuelta 79). Un toro tiene el
     * centro hueco y apuntarle al centro —que es donde apunta cualquiera— es un
     * clic que se cuela por el agujero. Debajo va una bola invisible.
     */
    const radioAro = Math.max(prisma.w, prisma.d) / 2 + 0.9
    const aro = new THREE.Mesh(
      new THREE.TorusGeometry(radioAro, 0.06, 6, 28),
      new THREE.MeshBasicMaterial({ color: COLOR_GIZMO }),
    )
    aro.rotation.x = -Math.PI / 2
    aro.position.set(prisma.x, alto + 0.35, prisma.z)
    grupo.add(aro)
    const pinchaAro = new THREE.Mesh(
      new THREE.CylinderGeometry(radioAro + 0.25, radioAro + 0.25, 0.3, 16),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    pinchaAro.position.copy(aro.position)
    pinchaAro.userData.marca = { que: 'prisma-giro', i, prioridad: PRIORIDAD.tirador }
    grupo.add(pinchaAro)
    pinchables.push(pinchaAro)

    marcas.add(grupo)
  }

  for (const [i, tubo] of (mapa.tubos ?? []).entries()) {
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
    /**
     * **El clic derecho sobre una pieza la apila** (vuelta 78). Apilar es la
     * acción que más se usa construyendo en altura y estaba enterrada en una
     * sección del panel; aquí es el mismo gesto con el que ya se está mirando
     * la pieza. Fuera de una pieza —que es casi toda la pantalla— el clic
     * derecho sigue siendo orbitar, que es lo que hace desde la vuelta 74.
     */
    if (evento.button === 2) {
      const caja = lienzo.getBoundingClientRect()
      puntero.x = ((evento.clientX - caja.left) / caja.width) * 2 - 1
      puntero.y = -((evento.clientY - caja.top) / caja.height) * 2 + 1
      rayo.setFromCamera(puntero, camara)
      const debajo = rayo.intersectObjects(proxies.children, false)
      if (debajo.length > 0) {
        elegir(debajo[0].object.userData.indice)
        apilar()
        return
      }
    }
    orbitando = { x: evento.clientX, y: evento.clientY, pan: evento.button === 1 || evento.shiftKey }
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
  marcaElegida = null
  pintarResaltado()
  pintarContorno()
  pintarPanel()
}

/** Elegir un marcador apaga la pieza elegida: se edita una cosa a la vez. */
function elegirMarca(marca) {
  marcaElegida = { que: marca.que, i: marca.i ?? -1 }
  seleccion = -1
  pintarResaltado()
  pintarContorno()
  refrescarPanel()
  // Y se abre la hoja donde vive ese marcador: pinchar una salida y no ver sus
  // números en ninguna parte es media herramienta.
  if (marca.que === 'spawn') abrirPanel(true, 'mapa')
  else if (marca.que.startsWith('tubo') || marca.que.startsWith('prisma')) abrirPanel(true, 'construir')
  else if (marca.que.startsWith('tp') || marca.que.startsWith('vent') || marca.que.startsWith('tiro')) {
    abrirPanel(true, 'dispositivos')
  } else abrirPanel(true, 'duelo')
}

function rellenarAlturas() {
  const opciones = Object.entries(COVER.heights)
    .map(([clave, alto]) => `<option value="${clave}">${clave} · ${alto} u</option>`)
    .join('')
  $('p-kind').innerHTML = opciones
  // **La misma escalera para el prisma**, que es lo que hace que `kind: 'alta'`
  // signifique lo mismo en los dos: una segunda lista de alturas sería una
  // pieza que se apila con otra sin cuadrar.
  $('k-kind').innerHTML = opciones
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
  $('cuenta').textContent = `${mapa.boxes.length} pieza${mapa.boxes.length === 1 ? '' : 's'}`
  // En el panel la palabra ya está en el rótulo de la sección: repetirla daba
  // «PIEZAS · 17 piezas».
  $('cuenta-panel').textContent = mapa.boxes.length
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
  pintarSuperficieDePieza(pieza)
  pintarTubo()
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
  if (!marcaElegida?.que?.startsWith('prisma')) return
  anotarParaDeshacer()
  prismasDe().splice(marcaElegida.i, 1)
  marcaElegida = null
  sucio = true
  pintarPanel()
})

$('t-borrar').addEventListener('click', () => {
  if (!marcaElegida?.que?.startsWith('tubo')) return
  anotarParaDeshacer()
  tubosDe().splice(marcaElegida.i, 1)
  marcaElegida = null
  sucio = true
  pintarPanel()
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
  const w = ladoDeDispositivo
  const d = ladoDeDispositivo
  // Se aparta de lo que ya haya ahí, como una forma nueva desde la vuelta 76:
  // dos plataformas seguidas caían una dentro de otra y la segunda no se veía,
  // así que el botón parecía no hacer nada la segunda vez.
  const x = aRejilla(orbita.centro.x - w / 2)
  let z = aRejilla(orbita.centro.z - d / 2)
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
    lista.push({
      ...PRISMAS.porDefecto,
      ...forma.prisma,
      x: aRejilla(orbita.centro.x),
      z: aRejilla(orbita.centro.z),
    })
    sucio = true
    elegirMarca({ que: 'prisma', i: lista.length - 1 })
    return
  }
  if (forma.macro === 'tubo') {
    const tubos = listaParaEscribir('tubos')
    // Delante de la cámara, como una pieza nueva: uno que nace en el origen es
    // uno que hay que ir a buscar.
    tubos.push({
      ...TUBES.porDefecto,
      x: aRejilla(orbita.centro.x),
      z: aRejilla(orbita.centro.z),
    })
    sucio = true
    elegirMarca({ que: 'tubo', i: tubos.length - 1 })
    return
  }
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
  if (evento.code === 'KeyR') { evento.preventDefault(); subirPieza(paso); return }
  if (evento.code === 'KeyF') {
    evento.preventDefault()
    // **F sobre una pieza ya apoyada la apila**: bajar de cero no lleva a
    // ninguna parte, y lo que se quiere al llegar al suelo es asentarla.
    const pieza = mapa.boxes[seleccion]
    const base = pieza?.base ? coverHeight(pieza.base) : 0
    if (pieza && base <= 0) apilar()
    else subirPieza(-paso)
    return
  }
  if (evento.code === 'Delete' || evento.code === 'Backspace') {
    if (seleccion < 0) return
    evento.preventDefault()
    $('borrar').click()
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
  pintarFondo()
  // **Lo que este mapa no tiene se apaga, no se enseña vacío.** Un mapa de
  // entrenamiento no tiene salidas ni dotación —tiene un spawn y rutas—, y
  // unos campos en blanco ahí prometen algo que el juego va a ignorar, que es
  // el fallo del selector de la vuelta 67.
  $('duelo-campos').hidden = !mapa.soloDuelo

  const duelo = mapa.duelo ?? {}
  pintarFichasDeSalida()
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
  const x = aRejilla(orbita.centro.x)
  const z = aRejilla(orbita.centro.z)
  salidas.push({ x, z, yaw: Math.atan2(-(0 - x), -(0 - z)) })
  marcaElegida = { que: 'salida', i: salidas.length - 1 }
  sucio = true
  refrescarPanel()
  contar([], `spawner ${salidas.length} puesto en ${x},${z} · arrástralo por la rejilla`)
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
  ['Clic der.', 'orbita la cámara · sobre una pieza, la apila'],
  ['Rueda', 'acerca y aleja'],
  ['WASD', 'vuela la cámara (el ratón sobre el mapa)'],
  ['Q / E', 'baja y sube la cámara'],
  ['Mayús', 'corre, volando'],
  ['R / F', 'sube y baja la pieza elegida'],
  ['Ctrl+Z', 'deshacer · con Mayús, rehacer'],
  ['Supr', 'borra la pieza elegida'],
  ['ESC', 'cierra el panel · y vuelve de «probar»'],
  ['F1 / F2 / F3', 'plantar muñecos · volar · limpiar (probando)'],
]

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
abrirLoQueToque()
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
  probar,
  dejarDeProbar,
}
