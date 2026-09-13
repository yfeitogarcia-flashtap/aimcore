/**
 * Avatar humanoide del jugador: el modelo que se verá cuando haya rivales.
 *
 * **Comparte anatomía con el muñeco de puntería.** La altura y las tres zonas
 * —cabeza, torso, piernas— salen de `TARGET_TYPES.hitbox`, así que esto no es
 * «otro muñeco»: es la representación visual del sistema de zonas que ya existe.
 * Lo que pone la **forma** es `AVATAR.figure`, medido sobre la referencia de
 * estilo (`Reference/Avatar/player-avatar-style.png`) barriendo su silueta fila
 * a fila. Altura del hitbox, proporciones de la referencia.
 *
 * **Todo el cuerpo es un solo primitivo: el prisma de anillos** (ver `prism`).
 * Un anillo es un corte horizontal —altura, ancho, fondo y desplazamiento— y una
 * pieza es la lista de sus cortes. De ahí salen las tres cosas que el modelo de
 * cajas no podía dar:
 *
 *  - **Extremidades que se afinan de verdad.** El brazo mide 0.036 de la altura
 *    en el hombro y 0.028 antes del codo; el muslo, 0.086 en la cadera y 0.058
 *    antes de la rodilla. Son anillos, no dos cajas de grosor distinto.
 *  - **Articulaciones resueltas.** Hombro, codo, cadera y rodilla son piezas
 *    estrecha-ancha-estrecha cuyos extremos **entran dentro** de los dos tramos
 *    que unen: no hay dos bloques tocándose por un canto, hay una pieza que
 *    envuelve la junta. En la referencia el codo mide 0.059 contra los 0.028 del
 *    brazo justo encima, y eso es exactamente lo que se ve.
 *  - **Secciones de más de cuatro caras**: ocho en el tronco, seis en
 *    extremidades y cabeza. Una caja tiene cuatro siluetas posibles; un prisma
 *    de ocho se lee redondeado sin dejar de ser facetado.
 *
 * **Tres canales, y sólo uno se puede personalizar:**
 *
 *  1. **Piel.** Paneles negros con **la misma grilla del suelo y las paredes**
 *     encima. No es una textura: es el generador de líneas de `grid.js`, el
 *     mismo que monta la sala, a paso de cuerpo. Es la skin de serie, y es lo
 *     único que cambia `setColor()`.
 *  2. **Luz.** Dos líneas continuas de la coronilla a las botas **por delante y
 *     por detrás**, más el núcleo del pecho. Canal **fijo**: el día que haya
 *     equipos, éste llevará su color —por eso `setColor()` no lo toca, y por eso
 *     va también por la espalda: a un rival se le reconoce igual de frente que
 *     de espaldas—.
 *  3. **Aristas.** El filo de cada panel, un gris por encima del de la grilla.
 *
 * Y no hay texturas porque **no hay ni una luz en la escena**: todo se dibuja
 * con materiales planos. Con la piel en negro el tono ya no separa nada, así que
 * el volumen entero lo dibujan las aristas y la rejilla.
 *
 * Las líneas —grilla, aristas y luz— se **fusionan** en tres objetos para todo
 * el cuerpo en vez de colgar de cada pieza: con una rejilla por cara, un avatar
 * suelto serían cientos de objetos y en multijugador habrá varios.
 *
 * No tiene lógica de juego: ni vida, ni impactos, ni colisión. Es geometría.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { AVATAR, TARGET_TYPES } from '../config.js'
import { buildGridGeometries } from './grid.js'

/** Las medidas de las tres zonas, tal como las declara el hitbox. */
const ZONES = {}
for (const part of TARGET_TYPES.hitbox.parts) ZONES[part.zone] = part

/** Altura total del muñeco en unidades de su radio: de los pies a la coronilla. */
const BODY_TOP = ZONES.head.offsetY + ZONES.head.radius

/** Tono de una pieza: el color base multiplicado, que sin luces es todo lo que hay. */
function shade(base, factor) {
  return new THREE.Color(base).multiplyScalar(factor)
}

/**
 * Ángulos de los vértices de una sección de `n` caras.
 *
 * Los vértices van a medio paso, de modo que las **caras** quedan centradas en
 * los ejes: con cuatro lados sale una caja alineada con X y Z, y con seis u ocho
 * hay siempre una cara mirando al frente. Eso es lo que deja poner la grilla y
 * las líneas de luz sobre una cara plana en vez de sobre una arista.
 */
function vertexAngles(sides) {
  const step = (Math.PI * 2) / sides
  const angles = []
  for (let k = 0; k < sides; k++) angles.push((k + 0.5) * step)
  return angles
}

/**
 * Un anillo convertido en vértices. `w` y `d` son el **ancho y el fondo totales**
 * de la pieza a esa altura, no radios: así las medidas de `AVATAR.figure` se
 * escriben tal como se midieron sobre la referencia.
 */
function ringVertices(ring, angles) {
  // Con los vértices a medio paso, el punto más lejano en X no está en el eje:
  // hay que dividir por su coseno para que el **ancho** salga el pedido.
  let maxCos = 0
  let maxSin = 0
  for (const a of angles) {
    maxCos = Math.max(maxCos, Math.abs(Math.cos(a)))
    maxSin = Math.max(maxSin, Math.abs(Math.sin(a)))
  }
  const rx = ring.w / 2 / maxCos
  const rz = ring.d / 2 / maxSin
  const x = ring.x ?? 0
  const z = ring.z ?? 0
  return angles.map((a) => new THREE.Vector3(x + Math.cos(a) * rx, ring.y, z + Math.sin(a) * rz))
}

/**
 * **Dónde está la superficie del prisma a una x dada**, en su mitad delantera.
 *
 * No es lo mismo que la media profundidad del anillo: un prisma tiene caras, y
 * a la altura de la cadera la línea de luz pasa a 0.062 del eje, que ya no cae
 * en la cara frontal sino en la diagonal de al lado. Poniéndola a media
 * profundidad flotaba justo ahí —y con ella su canal—. Esto devuelve la z del
 * contorno en esa x, que es donde está el cuerpo de verdad.
 */
function surfaceZ(w, d, x, sides) {
  const angles = vertexAngles(sides)
  let maxCos = 0
  let maxSin = 0
  for (const a of angles) {
    maxCos = Math.max(maxCos, Math.abs(Math.cos(a)))
    maxSin = Math.max(maxSin, Math.abs(Math.sin(a)))
  }
  const rx = w / 2 / maxCos
  const rz = d / 2 / maxSin
  const points = angles.map((a) => ({ x: Math.cos(a) * rx, z: Math.sin(a) * rz }))
  const target = Math.min(Math.abs(x), rx)
  let best = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a.z <= 0 && b.z <= 0) continue
    const lo = Math.min(a.x, b.x)
    const hi = Math.max(a.x, b.x)
    if (target < lo - 1e-9 || target > hi + 1e-9) continue
    const t = hi - lo < 1e-9 ? 0 : (target - lo) / (hi - lo)
    const z = a.x < b.x ? a.z + (b.z - a.z) * t : b.z + (a.z - b.z) * t
    best = Math.max(best, z)
  }
  return best
}

/**
 * **El único primitivo del cuerpo.** Un prisma definido por una lista de anillos
 * de abajo arriba, cerrado por las dos tapas.
 *
 * Se construye a mano en vez de deformar geometrías de three porque
 * `EdgesGeometry` —de donde salen los filos— necesita que las caras compartan
 * vértices: con geometrías sueltas dibujaría cada triángulo por separado y el
 * modelo se llenaría de rayas.
 *
 * @param {Array<{y:number,w:number,d:number,x?:number,z?:number}>} rings
 * @param {number} sides caras de la sección
 */
function prism(rings, sides) {
  const angles = vertexAngles(sides)
  const positions = []
  for (const ring of rings) {
    for (const v of ringVertices(ring, angles)) positions.push(v.x, v.y, v.z)
  }

  const index = []
  // Laterales: un quad por cara y por tramo, con el giro hacia fuera. Una cara
  // al revés sencillamente no se dibuja con `FrontSide` y deja un agujero.
  for (let r = 0; r < rings.length - 1; r++) {
    const a = r * sides
    const b = (r + 1) * sides
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides
      index.push(a + k, b + k2, a + k2)
      index.push(a + k, b + k, b + k2)
    }
  }
  // Tapas: abanico desde el primer vértice de cada anillo extremo.
  const last = (rings.length - 1) * sides
  for (let k = 1; k < sides - 1; k++) {
    index.push(0, k, k + 1)
    index.push(last, last + k + 1, last + k)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  return geometry
}

export class Avatar {
  /**
   * @param {number} scale radio del torso en unidades de mundo. Por defecto, el
   *   mismo con el que se dibuja un muñeco de tamaño normal.
   */
  constructor(scale = 0.45) {
    this.scale = scale
    /** Altura total del modelo. La pone el hitbox, no la referencia. */
    this.height = BODY_TOP * scale
    this.group = new THREE.Group()
    /** Piezas por zona, para poder teñir o resaltar una zona entera. */
    this.zones = { head: [], torso: [], legs: [] }
    this._geometries = []
    this._materials = []

    // Las tres colecciones que se fusionan al final del montaje.
    this._gridBase = []
    this._gridAccent = []
    this._edges = []
    this._lights = []
    this._channel = []

    this._edgeMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(AVATAR.edgeColor),
      transparent: true,
      opacity: 0.85,
    })
    this._gridMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(AVATAR.gridColor) })
    this._gridAccentMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(AVATAR.gridAccentColor),
    })
    /** El canal de luz: núcleo y las cuatro líneas. El futuro color de equipo. */
    this._lightMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(AVATAR.teamColor) })
    /**
     * Los labios de la hendidura por la que corre cada línea. Van por el tono
     * de la articulación y **no los toca `setColor()`**: son la pared del canal
     * de luz, no piel. El día que la luz lleve el color de equipo, el canal que
     * la aloja tiene que seguir leyéndose igual.
     */
    this._channelMaterial = new THREE.MeshBasicMaterial({
      color: shade(AVATAR.color, AVATAR.shades.joint),
    })
    this._materials.push(
      this._edgeMaterial,
      this._gridMaterial,
      this._gridAccentMaterial,
      this._lightMaterial,
      this._channelMaterial,
    )

    this._build()
  }

  // --- primitivas ----------------------------------------------------------

  /** Una altura de `AVATAR.figure.levels`, en unidades de mundo. */
  _level(key) {
    return AVATAR.figure.levels[key] * this.height
  }

  /** Un ancho de `AVATAR.figure.widths`, en unidades de mundo. */
  _width(key) {
    return AVATAR.figure.widths[key] * this.height
  }

  /**
   * Un fondo de `AVATAR.figure.depths`, en unidades de mundo. Mismas unidades
   * que `_width` y por el mismo motivo: desde la vuelta 36 la profundidad está
   * **medida** sobre las vistas de perfil, no derivada del ancho.
   */
  _depth(key) {
    return AVATAR.figure.depths[key] * this.height
  }

  /**
   * Una pieza: su prisma, su tono, sus filos y —si se pide— su grilla.
   *
   * @param {string} zone a qué zona del hitbox pertenece
   * @param {Array<object>} rings anillos, de abajo arriba
   */
  _piece(zone, rings, { sides, factor, grid = false, edgeAngle = 24 }) {
    const geometry = prism(rings, sides)
    const material = new THREE.MeshBasicMaterial({ color: shade(AVATAR.color, factor) })
    const mesh = new THREE.Mesh(geometry, material)
    // Con qué factor se pintó, para poder repintarla sin reconstruir nada.
    mesh.userData.shade = factor
    this.group.add(mesh)
    this.zones[zone].push(mesh)
    this._geometries.push(geometry)
    this._materials.push(material)

    // El umbral de arista alto es deliberado: entre anillo y anillo de un mismo
    // tramo el giro es de pocos grados y **no** debe salir una raya, o el afinado
    // continuo se leería como una pila de rodajas. Donde sí gira de golpe —una
    // articulación, el filo de una hombrera— la arista aparece sola.
    const edges = new THREE.EdgesGeometry(geometry, edgeAngle)
    this._edges.push(edges)

    if (grid) this._skin(rings, sides)
    return mesh
  }

  /**
   * La grilla sobre una pieza: un trozo por cara y por tramo.
   *
   * Se **mide** por el anillo más estrecho del tramo y se **coloca** sobre el
   * plano de la cara: al revés se quedaría dentro de la pieza y no se vería ni
   * una línea, que es exactamente lo que pasó la primera vez que se intentó.
   */
  _skin(rings, sides) {
    const angles = vertexAngles(sides)
    const step = (Math.PI * 2) / sides
    for (let r = 0; r < rings.length - 1; r++) {
      const a = ringVertices(rings[r], angles)
      const b = ringVertices(rings[r + 1], angles)
      const height = Math.abs(rings[r + 1].y - rings[r].y)
      if (height <= AVATAR.gridStep) continue
      for (let k = 0; k < sides; k++) {
        const k2 = (k + 1) % sides
        const wide = Math.min(a[k].distanceTo(a[k2]), b[k].distanceTo(b[k2]))
        if (wide <= AVATAR.gridStep) continue
        const cx = (a[k].x + a[k2].x + b[k].x + b[k2].x) / 4
        const cy = (a[k].y + a[k2].y + b[k].y + b[k2].y) / 4
        const cz = (a[k].z + a[k2].z + b[k].z + b[k2].z) / 4
        // La cara k está centrada en el ángulo (k+1)·paso, y un giro en Y lleva
        // el +Z local a (sin, 0, cos): de ahí que el giro sea 90° menos el
        // ángulo de la cara.
        this._skinFace(wide * 0.94, height, cx, cy, cz, Math.PI / 2 - (k + 1) * step)
      }
    }
    void angles
  }

  /** Un trozo de grilla sobre una cara, girado a su sitio. */
  _skinFace(width, height, x, y, z, rotationY) {
    const { base, accent } = buildGridGeometries(
      width,
      height,
      AVATAR.gridStep,
      AVATAR.gridAccentEvery,
    )
    // Un pelo por fuera del panel: con la línea exactamente en la cara, el
    // z-fighting la hace parpadear al girar.
    const matrix = new THREE.Matrix4()
      .makeRotationY(rotationY)
      .setPosition(x, y, z)
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, AVATAR.stripOffset))
    base.applyMatrix4(matrix)
    accent.applyMatrix4(matrix)
    this._gridBase.push(base)
    this._gridAccent.push(accent)
  }

  /**
   * **Un tramo de la línea de luz**, de un punto a otro.
   *
   * Se da por sus dos extremos y no por posición y ángulo: los tramos encadenan
   * —coronilla, barbilla, cuello, ingle, rodilla, bota— y lo único que hay que
   * garantizar es que el final de uno sea el principio del siguiente. La
   * inclinación sale sola.
   */
  _lightSegment(size, from, to) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    if (length <= 1e-6) return
    const geometry = new THREE.BoxGeometry(size, length, size)
    geometry.rotateZ(-Math.atan2(dx, dy))
    geometry.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2)
    this._lights.push(geometry)
  }

  // --- montaje --------------------------------------------------------------

  _build() {
    const L = (k) => this._level(k)
    const W = (k) => this._width(k)
    const D = (k) => this._depth(k)
    const { sides } = AVATAR.figure

    this._buildTrunk(L, W, D, sides)
    this._buildHead(L, W, D, sides)
    for (const side of [-1, 1]) {
      this._buildArm(side, L, W, D, sides)
      this._buildLeg(side, L, W, D, sides)
    }
    this._buildLights(L, W, D, sides)
    this._mergeLines()
  }

  /**
   * Tronco: **una sola pieza** de la ingle al hombro, con seis anillos.
   *
   * Era lo que más se notaba con cajas: pecho y cintura eran dos bloques y entre
   * ellos había un escalón. Con anillos, el reloj de arena de la referencia
   * —0.202 de ancho en el pecho, 0.134 en la cintura, 0.195 en la cadera— sale
   * como una silueta continua.
   */
  _buildTrunk(L, W, D, sides) {
    const rings = [
      { y: L('hip') - this.height * 0.02, w: W('crotch') * 0.86, d: D('crotch') },
      { y: L('hip'), w: W('hip'), d: D('hip') },
      { y: L('waist'), w: W('waist'), d: D('waist') },
      { y: L('ribs'), w: W('ribs'), d: D('ribs') },
      { y: L('chest'), w: W('chest'), d: D('chest') },
      { y: L('shoulder'), w: W('chest') * 0.93, d: D('torsoTop') },
    ]
    this._piece('torso', rings, { sides: sides.torso, factor: AVATAR.shades.chest, grid: true })

    // Cuello: corto y estrechándose, del hombro a la barbilla. Sin él la cabeza
    // se apoya en los hombros y el modelo no tiene dónde girarla el día que gire.
    this._piece(
      'torso',
      [
        // El anillo de abajo va ancho a propósito: es el trapecio subiendo del
        // hombro al cuello, y sin él la silueta a la altura de la barbilla
        // salía un 28% más estrecha que la de la referencia.
        { y: L('shoulder') - this.height * 0.01, w: W('neck') * 1.45, d: D('neckBase') },
        { y: L('neck'), w: W('neck') * 1.3, d: D('neck') },
        { y: L('chin') + this.height * 0.01, w: W('neck') * 0.84, d: D('neck') * 0.86 },
      ],
      { sides: sides.limb, factor: AVATAR.shades.joint },
    )

    // Núcleo: octaedro, el mismo azul que las líneas, y el único sitio donde el
    // modelo brilla de verdad. Es la pista visual de la carga del escudo.
    const coreGeometry = new THREE.OctahedronGeometry(AVATAR.coreRadius * this.height)
    this.core = new THREE.Mesh(coreGeometry, this._lightMaterial)
    // Hundido: con el centro en la cara del pecho sobresalía un radio entero y
    // de perfil era un pincho. Asomando un 40% se lee como un núcleo empotrado.
    const coreZ = D('chest') / 2 - AVATAR.coreRadius * this.height * 0.6
    this.core.position.set(0, L('chest') - this.height * 0.02, coreZ)
    this.group.add(this.core)
    this.zones.torso.push(this.core)
    this._geometries.push(coreGeometry)
  }

  /**
   * Cabeza: casco de cuatro anillos. Ancho en las sienes (0.100 de la altura),
   * cerrado arriba (0.055) y en la barbilla (0.066), y **más profundo que
   * ancho**, como una cabeza.
   */
  _buildHead(L, W, D, sides) {
    const top = this.height
    const rings = [
      { y: L('chin'), w: W('chin'), d: D('chin'), z: W('chin') * 0.08 },
      { y: L('chin') + (L('temples') - L('chin')) * 0.3, w: W('temples') * 0.68, d: D('jaw') },
      { y: L('chin') + (L('temples') - L('chin')) * 0.7, w: W('temples'), d: D('headMid') },
      { y: L('temples'), w: W('temples') * 0.98, d: D('temples') },
      { y: top - this.height * 0.01, w: W('crown'), d: D('crown') },
    ]
    this._piece('head', rings, { sides: sides.head, factor: AVATAR.shades.chest, grid: true })
  }

  /**
   * Brazo: hombrera, alerón, húmero, codo, antebrazo, palma y cinco dedos.
   *
   * El húmero **se afina** de 0.036 a 0.028 y el codo vuelve a abrirse a 0.059:
   * eso es lo que hace que se lea un brazo y no un tubo. La hombrera y el codo
   * son piezas estrecha-ancha-estrecha cuyos extremos entran dentro de los
   * tramos vecinos, así que no hay junta a la vista por ningún lado.
   *
   * Dos piezas del brazo se rehicieron en la vuelta 36 con las vistas nuevas:
   *
   *  - **La hombrera, porque la vista cenital la enseña por arriba.** Era un
   *    casquete de seis caras y una sola pieza, que desde arriba es una tapa
   *    lisa. Ahora son dos de ocho —casquete y alerón volado por debajo— y la
   *    junta entre ellas es la arista que se ve en la referencia. De fondo mide
   *    0.137 contra los 0.117 de ancho: es el punto **más profundo de todo el
   *    cuerpo**, y estaba puesto en 0.111.
   *  - **La mano, porque en cuatro de las seis vistas se le ven los dedos.** Era
   *    un puño macizo y aplanado. Ahora es una palma y cinco dedos, cada uno su
   *    propio prisma: fusionarlos en una pieza los volvería a leer como una
   *    manopla, que es justo lo que había.
   */
  _buildArm(side, L, W, D, sides) {
    const { armX, pauldronX, hand } = AVATAR.figure
    const X = (k) => side * armX[k] * this.height
    const h = this.height
    const step = h * 0.012

    // Hombrera: **una tapa sobre el hombro**, no una pieza colgada del brazo:
    // su centro cae dentro del tronco y lo que sobresale es su borde.
    const capX = side * pauldronX * h
    const pd = (k) => D('pauldron') * k
    this._piece(
      'torso',
      [
        { y: L('shoulder') - h * 0.030, w: W('pauldron') * 0.74, d: pd(0.82), x: capX * 1.02 },
        { y: L('shoulder') - h * 0.005, w: W('pauldron'), d: pd(1), x: capX },
        { y: L('shoulder') + h * 0.018, w: W('pauldron') * 0.93, d: pd(0.93), x: capX * 0.96 },
        // Hasta el nivel 0.828: en la referencia el hombro ya está ahí arriba, y
        // cortándolo en 0.808 el cuello salía un 68% más estrecho que el suyo.
        { y: h * 0.828, w: W('pauldron') * 0.66, d: pd(0.72), x: capX * 0.88 },
      ],
      { sides: sides.pauldron, factor: AVATAR.shades.joint },
    )

    // Alerón: el vuelo de abajo de la hombrera, que es lo que le da el borde.
    // Su anillo ancho queda **por fuera** del casquete y sus dos extremos por
    // dentro, así que la pieza se lee como una placa montada, no como un aro.
    this._piece(
      'torso',
      [
        { y: L('shoulder') - h * 0.074, w: W('pauldron') * 0.58, d: pd(0.68), x: (capX + X('shoulder')) / 2 },
        { y: L('shoulder') - h * 0.050, w: W('pauldron') * 0.99, d: pd(0.96), x: capX * 1.05 },
        { y: L('shoulder') - h * 0.032, w: W('pauldron') * 0.78, d: pd(0.84), x: capX * 1.02 },
      ],
      { sides: sides.pauldron, factor: AVATAR.shades.limb },
    )

    // Húmero: del hombro al codo, afinándose y abriéndose hacia fuera.
    this._piece(
      'torso',
      [
        // El anillo estrecho (0.028) es **intermedio**: el húmero sigue hasta
        // meterse dentro del codo. Cortarlo ahí dejaba un hueco de aire entre
        // el brazo y la articulación.
        { y: L('elbow') + h * 0.012, w: W('armNarrow') * 1.02, d: D('armNarrow') * 1.02, x: X('elbow') },
        { y: L('armNarrow'), w: W('armNarrow'), d: D('armNarrow'), x: (X('shoulder') + X('elbow')) / 2 },
        { y: L('armNarrow') + (L('shoulder') - L('armNarrow')) * 0.5, w: W('armUpper') * 0.95, d: D('armUpper') * 0.97, x: X('shoulder') * 0.55 + X('elbow') * 0.45 },
        { y: L('shoulder') - h * 0.012, w: W('armUpper'), d: D('armUpper'), x: X('shoulder') },
        { y: L('shoulder') + h * 0.02, w: W('armUpper') * 0.78, d: D('armUpper') * 0.82, x: X('shoulder') * 0.96 },
      ],
      { sides: sides.limb, factor: AVATAR.shades.limb },
    )

    // Codo: estrecha-ancha-estrecha, metida por dentro de los dos tramos. En la
    // referencia mide 0.059 contra los 0.028 del brazo justo encima, y es la
    // articulación que más se ve.
    this._piece(
      'torso',
      [
        { y: L('elbow') - h * 0.035, w: W('forearm') * 0.9, d: D('forearm') * 0.9, x: X('elbow') },
        { y: L('elbow'), w: W('elbow'), d: D('elbow'), x: X('elbow') },
        { y: L('elbow') + h * 0.03, w: W('armNarrow') * 1.08, d: D('armNarrow') * 1.08, x: X('elbow') },
      ],
      { sides: sides.joint, factor: AVATAR.shades.joint },
    )

    // Antebrazo: del codo a la muñeca, afinándose otra vez.
    this._piece(
      'torso',
      [
        { y: L('wrist'), w: W('wrist'), d: D('wrist'), x: X('wrist') },
        { y: L('wrist') + (L('elbow') - L('wrist')) * 0.5, w: W('forearm') * 0.9, d: D('forearm') * 0.9, x: (X('wrist') + X('elbow')) / 2 },
        { y: L('elbow') - step, w: W('forearm'), d: D('forearm'), x: X('elbow') },
        { y: L('elbow') + step, w: W('forearm') * 0.85, d: D('forearm') * 0.86, x: X('elbow') },
      ],
      { sides: sides.limb, factor: AVATAR.shades.limb },
    )

    this._buildHand(side, L, W, D, sides, X('wrist'), hand)
  }

  /**
   * Mano: la palma y los cinco dedos.
   *
   * La palma mira hacia atrás —es como está en la referencia— así que lo ancho
   * de la mano (0.050) va en x y lo fino (0.028) en z; el pulgar es el único que
   * sale por delante. Los cuatro dedos no miden lo mismo: sus largos relativos
   * están en `figure.hand.largo`, porque cuatro dedos iguales se leen como un
   * peine.
   */
  _buildHand(side, L, W, D, sides, hx, hand) {
    const h = this.height
    const step = h * 0.012
    const knuckles = h * hand.knuckles

    this._piece(
      'torso',
      [
        { y: knuckles, w: W('hand'), d: D('hand'), x: hx },
        { y: knuckles + (L('wrist') - knuckles) * 0.55, w: W('hand') * 0.93, d: D('hand') * 1.06, x: hx },
        { y: L('wrist') + step, w: W('wrist'), d: D('wrist'), x: hx },
      ],
      { sides: sides.joint, factor: AVATAR.shades.boot },
    )

    for (let f = 0; f < 4; f++) {
      const fx = hx + side * (f - 1.5) * hand.spread * h
      const length = h * hand.length * hand.largo[f]
      this._piece(
        'torso',
        [
          { y: knuckles - length, w: W('fingerTip'), d: D('finger') * 0.78, x: fx + side * h * 0.0015 },
          { y: knuckles - length * 0.45, w: W('finger') * 0.92, d: D('finger') * 0.94, x: fx },
          { y: knuckles + h * 0.008, w: W('finger'), d: D('finger'), x: fx },
        ],
        { sides: sides.finger, factor: AVATAR.shades.limb, edgeAngle: 18 },
      )
    }

    // Pulgar: por delante de la palma y hacia dentro, que es lo que lo separa de
    // un quinto dedo.
    const tx = hx - side * W('hand') * 0.44
    const ty = h * hand.thumbY
    const tl = h * hand.thumbLength
    this._piece(
      'torso',
      [
        { y: ty - tl, w: W('thumb') * 0.78, d: D('finger') * 1.0, x: tx - side * h * 0.005, z: D('hand') * 0.62 },
        { y: ty - tl * 0.42, w: W('thumb'), d: D('finger') * 1.15, x: tx, z: D('hand') * 0.48 },
        { y: ty, w: W('thumb') * 0.85, d: D('finger'), x: tx + side * h * 0.003, z: D('hand') * 0.22 },
      ],
      { sides: sides.finger, factor: AVATAR.shades.limb, edgeAngle: 18 },
    )
  }

  /**
   * Pierna: cadera, muslo, rodilla, espinilla y bota.
   *
   * Mismo esquema que el brazo y por el mismo motivo: el muslo se afina de 0.086
   * a 0.058 camino de la rodilla, la rodilla vuelve a 0.086 y la espinilla se
   * cierra de 0.078 a 0.042 en el tobillo.
   *
   * Lo que cambió con las vistas de perfil es el **volumen**: el cuádriceps mide
   * 0.101 de fondo en la cadera y el gemelo 0.067 bajo la rodilla, los dos
   * medidos, contra los 0.090 y 0.075 que salían de multiplicar el ancho. Y la
   * bota se rehízo entera: ver `_buildBoot`.
   */
  _buildLeg(side, L, W, D, sides) {
    // El eje de la pierna se abre según se baja (ver `figure.legX`), así que
    // cada anillo pide el suyo en lugar de compartir una separación fija.
    const X = (k) => side * AVATAR.figure.legX[k] * this.height
    const step = this.height * 0.012

    // Cadera: la junta con el tronco, metida por dentro de los dos.
    this._piece(
      'legs',
      [
        { y: L('hip') - this.height * 0.055, w: W('thighTop') * 0.95, d: D('thighTop') * 0.95, x: X('hip') },
        { y: L('hip') - this.height * 0.015, w: W('thighTop') * 1.12, d: D('thighTop') * 1.10, x: X('hip') },
        { y: L('hip') + this.height * 0.02, w: W('thighTop') * 0.88, d: D('thighTop') * 0.88, x: X('hip') * 0.9 },
      ],
      { sides: sides.joint, factor: AVATAR.shades.joint },
    )

    // Muslo.
    this._piece(
      'legs',
      [
        // Mismo criterio que en el húmero: el anillo estrecho (0.058) es
        // intermedio y el muslo sigue hasta meterse dentro de la rodilla.
        { y: L('knee') + this.height * 0.012, w: W('thighNarrow') * 1.02, d: D('thighNarrow') * 1.02, x: X('knee') },
        { y: L('thighNarrow'), w: W('thighNarrow'), d: D('thighNarrow'), x: X('thighNarrow') },
        { y: L('thighNarrow') + (L('hip') - L('thighNarrow')) * 0.5, w: W('thighTop') * 0.85, d: D('thighMid'), x: (X('hip') + X('thighNarrow')) / 2 },
        { y: L('hip') - step, w: W('thighTop'), d: D('thighTop'), x: X('hip') },
        { y: L('hip') + step * 1.6, w: W('thighTop') * 0.82, d: D('thighTop') * 0.84, x: X('hip') },
      ],
      { sides: sides.limb, factor: AVATAR.shades.limb, grid: true },
    )

    // Rodilla: la articulación más visible de la referencia —0.086 contra los
    // 0.058 del muslo justo encima— y con la punta hacia delante.
    this._piece(
      'legs',
      [
        { y: L('knee') - this.height * 0.04, w: W('shinTop') * 0.92, d: D('shinTop') * 0.92, x: X('knee') },
        { y: L('knee'), w: W('knee'), d: D('knee'), x: X('knee'), z: this.height * 0.004 },
        { y: L('knee') + this.height * 0.035, w: W('thighNarrow') * 1.06, d: D('thighNarrow') * 1.06, x: X('knee') },
      ],
      { sides: sides.joint, factor: AVATAR.shades.joint },
    )

    // Espinilla: gemelo justo bajo la rodilla y cierre hasta el tobillo.
    this._piece(
      'legs',
      [
        { y: L('ankle'), w: W('ankle'), d: D('ankle'), x: X('ankle') },
        { y: L('calf'), w: W('calf'), d: D('calf'), x: X('calf') },
        { y: L('knee') - step, w: W('shinTop'), d: D('shinTop'), x: X('knee') },
        { y: L('knee') + step, w: W('shinTop') * 0.86, d: D('shinTop') * 0.88, x: X('knee') },
      ],
      { sides: sides.limb, factor: AVATAR.shades.limb, grid: true },
    )

    this._buildBoot(side, L, W, D, sides, X)
  }

  /**
   * **La bota: caña, pie, suela y talón.**
   *
   * Era una sola pieza de tres anillos que salía hacia delante «un 20% de su
   * fondo». De perfil mide 0.180 de la puntera al talón —tenía 0.148— y su
   * centro cae 0.066 por delante del eje de la pierna, no 0.030. Las dos vistas
   * de perfil dan el mismo número hasta el cuarto decimal, y la vista inferior
   * da lo que no se veía en ninguna otra: que la suela es su propia pieza y el
   * talón otra, más estrecha que el antepié (0.060 contra 0.078).
   *
   * Que sean cuatro piezas y no una no es detalle por detalle: con una sola, un
   * anillo tiene **un** ancho a cada altura, así que un talón estrecho detrás y
   * un antepié ancho delante no caben en la misma bota.
   */
  _buildBoot(side, L, W, D, sides, X) {
    const h = this.height
    const boot = AVATAR.figure.boot
    const Z = (k) => boot.z[k] * h
    const soleX = side * AVATAR.figure.legX.sole * h

    // Caña: del empeine para arriba, envolviendo el tobillo.
    this._piece(
      'legs',
      [
        { y: h * boot.instep, w: W('boot') * 0.80, d: D('bootInstep'), x: X('ankle'), z: Z('instep') },
        { y: L('ankle'), w: W('ankle') * 1.24, d: D('bootAnkle'), x: X('ankle'), z: Z('ankle') },
        { y: h * boot.shaftTop, w: W('ankle') * 1.15, d: D('bootShaft'), x: X('ankle'), z: Z('shaft') },
      ],
      { sides: sides.limb, factor: AVATAR.shades.boot },
    )

    // Pie: del borde de la suela al empeine. Es lo que sale hacia delante, y va
    // a ocho caras porque con cuatro la puntera es un filo y la bota entera se
    // lee como una cuña.
    this._piece(
      'legs',
      [
        { y: h * boot.soleTop, w: W('boot'), d: D('bootFoot'), x: soleX, z: Z('foot') },
        { y: h * boot.toe, w: W('boot') * 0.99, d: D('bootFoot') * 0.86, x: soleX, z: Z('foot') * 0.82 },
        { y: h * (boot.soleTop + boot.instep) * 0.5, w: W('boot') * 0.96, d: D('bootFoot') * 0.64, x: (soleX + X('ankle')) / 2, z: Z('foot') * 0.52 },
        { y: h * boot.instep, w: W('boot') * 0.82, d: D('bootInstep') * 1.02, x: X('ankle'), z: Z('instep') },
      ],
      { sides: sides.foot, factor: AVATAR.shades.boot },
    )

    // Suela: la plancha de apoyo, y **lo único que toca el suelo**.
    this._piece(
      'legs',
      [
        { y: 0, w: W('boot') * 0.97, d: D('sole'), x: soleX, z: Z('sole') },
        { y: h * boot.soleTop, w: W('boot'), d: D('sole') * 0.96, x: soleX, z: Z('sole') * 0.97 },
      ],
      { sides: sides.foot, factor: AVATAR.shades.joint },
    )

    // Talón: por detrás de la espinilla y más estrecho que el antepié.
    this._piece(
      'legs',
      [
        { y: 0, w: W('heel'), d: D('heel'), x: X('ankle'), z: Z('heel') },
        { y: h * boot.heelTop, w: W('heel') * 0.84, d: D('heel') * 0.88, x: X('ankle'), z: Z('heel') * 0.88 },
      ],
      { sides: sides.boot, factor: AVATAR.shades.joint },
    )
  }

  /**
   * **Las cuatro líneas de luz**: dos por delante y dos por la espalda, de la
   * coronilla a las botas, **cada una dentro de su canal**.
   *
   * Son continuas —cada tramo empieza donde acaba el anterior— y se declaran
   * como la cadena de puntos por la que pasan. Las de atrás son las mismas con
   * la z cambiada de signo: el color de equipo tiene que reconocerse igual
   * persiguiendo a alguien que de frente. La vista posterior del turnaround
   * confirma el recorrido que ya estaba medido de frente.
   *
   * **Dónde se apoya cada punto.** Hasta la vuelta 36 la línea se ponía a *media
   * profundidad* del anillo, y eso sólo es la superficie si el punto cae en la
   * cara frontal. En la cadera la línea pasa a 0.062 del eje, que con un prisma
   * de ocho caras ya es la diagonal de al lado: allí flotaba. Ahora cada punto
   * lleva el anillo entero —ancho, fondo y caras— y `surfaceZ` devuelve dónde
   * está el contorno **en esa x**.
   */
  _buildLights(L, W, D, sides) {
    const size = AVATAR.stripWidth * this.height
    const h = this.height
    /** Separación de la línea a esa altura, medida sobre la referencia. */
    const S = (k) => AVATAR.stripSpread[k] * h

    /**
     * Cada punto de la cadena lleva **la pieza sobre la que va montado**: el
     * anillo con el que se construyó y dónde está su centro en z (`zc`). Es la
     * única forma de que la línea quede pegada por delante **y** por detrás sin
     * números a ojo: puesta a media profundidad del cuerpo, en las rodillas
     * —que sobresalen— se metía dentro de la pieza y desaparecía justo en la
     * articulación.
     */
    const boot = AVATAR.figure.boot
    /** Eje de la pieza sobre la que va el punto: la pierna no baja por el centro. */
    const legX = (k) => AVATAR.figure.legX[k] * h
    const chain = [
      { x: S('crown'), y: h - h * 0.005, w: W('crown'), d: D('crown'), n: sides.head, cx: 0, zc: 0 },
      { x: S('chin'), y: L('chin') + h * 0.012, w: W('chin'), d: D('chin'), n: sides.head, cx: 0, zc: W('chin') * 0.08 },
      { x: S('shoulder'), y: L('shoulder'), w: W('chest') * 0.93, d: D('torsoTop'), n: sides.torso, cx: 0, zc: 0 },
      { x: S('chest'), y: L('chest'), w: W('chest'), d: D('chest'), n: sides.torso, cx: 0, zc: 0 },
      { x: S('waist'), y: L('waist'), w: W('waist'), d: D('waist'), n: sides.torso, cx: 0, zc: 0 },
      { x: S('hip'), y: L('hip') - h * 0.01, w: W('hip'), d: D('hip'), n: sides.torso, cx: 0, zc: 0 },
      { x: S('thighNarrow'), y: L('thighNarrow'), w: W('thighNarrow'), d: D('thighNarrow'), n: sides.limb, cx: legX('thighNarrow'), zc: 0 },
      { x: S('knee'), y: L('knee'), w: W('knee'), d: D('knee'), n: sides.joint, cx: legX('knee'), zc: h * 0.004 },
      { x: S('calf'), y: L('calf'), w: W('calf'), d: D('calf'), n: sides.limb, cx: legX('calf'), zc: 0 },
      { x: S('ankle'), y: L('ankle') + h * 0.02, w: W('ankle') * 1.24, d: D('bootAnkle'), n: sides.limb, cx: legX('ankle'), zc: boot.z.ankle * h },
    ]
    // Un pelo por fuera de la pieza, como la grilla: a ras se ve el z-fighting.
    const offset = AVATAR.stripOffset * h

    for (const side of [-1, 1]) {
      for (const front of [1, -1]) {
        /** La superficie del cuerpo en ese punto, ya con el lado y la cara. */
        const skin = (p) => {
          const x = p.x * side
          // La x que importa es **respecto al eje de la pieza**: por la pierna
          // la línea baja pegada al muslo, no a 0.080 del centro del cuerpo.
          const z = p.zc + front * surfaceZ(p.w, p.d, x - p.cx * side, p.n)
          return { x, y: p.y, z }
        }
        for (let i = 0; i < chain.length - 1; i++) {
          const from = skin(chain[i])
          const to = skin(chain[i + 1])
          // La barra, con su cara exterior a ras de piel: dentro del canal.
          this._lightSegment(
            size,
            { ...from, z: from.z + front * (offset - size / 2) },
            { ...to, z: to.z + front * (offset - size / 2) },
          )
          this._lightChannelSegment(from, to, front)
        }
      }
    }
  }

  /**
   * **Los dos labios del canal** de un tramo. Con piezas opacas y sin CSG un
   * canal no se puede restar —un hueco tallado en el prisma sigue tapado por la
   * cara del prisma—, así que se levanta: dos listones a los lados del recorrido
   * y la barra al fondo.
   *
   * El desplazamiento va **perpendicular al tramo**, no en x: el recorrido se
   * tuerce en el collar y en la ingle, y un labio en x se cruzaría con la línea.
   */
  _lightChannelSegment(from, to, front) {
    const { width, rail, rise } = AVATAR.lightChannel
    const h = this.height
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    if (length <= 1e-6) return
    const px = dy / length
    const py = -dx / length
    const apart = ((width + rail) / 2) * h
    for (const lip of [-1, 1]) {
      const geometry = new THREE.BoxGeometry(rail * h, length, rise * h)
      geometry.rotateZ(-Math.atan2(dx, dy))
      geometry.translate(
        (from.x + to.x) / 2 + px * apart * lip,
        (from.y + to.y) / 2 + py * apart * lip,
        (from.z + to.z) / 2 + (front * rise * h) / 2,
      )
      this._channel.push(geometry)
    }
  }

  /**
   * Fusiona grilla, filos y luces en tres objetos. Es lo que hace que la piel de
   * rejilla no cueste un objeto por cara: con ocho caras por tramo y una docena
   * de tramos, colgarlas de cada pieza serían cientos.
   */
  _mergeLines() {
    const addLines = (list, material) => {
      if (list.length === 0) return
      const merged = mergeGeometries(list, false)
      for (const geometry of list) geometry.dispose()
      list.length = 0
      if (!merged) return
      this.group.add(new THREE.LineSegments(merged, material))
      this._geometries.push(merged)
    }
    // El canal va antes que los filos a propósito: sus labios llevan arista como
    // cualquier otra pieza —es lo que hace que la hendidura se lea como
    // hendidura y no como dos tiras pegadas— y esa arista entra en el mismo
    // objeto fusionado, no en uno cuarto.
    const channel = mergeGeometries(this._channel, false)
    for (const geometry of this._channel) geometry.dispose()
    this._channel.length = 0
    if (channel) {
      this.channel = new THREE.Mesh(channel, this._channelMaterial)
      this.group.add(this.channel)
      this._geometries.push(channel)
      this._edges.push(new THREE.EdgesGeometry(channel, 24))
    }

    addLines(this._gridBase, this._gridMaterial)
    addLines(this._gridAccent, this._gridAccentMaterial)
    addLines(this._edges, this._edgeMaterial)

    const lights = mergeGeometries(this._lights, false)
    for (const geometry of this._lights) geometry.dispose()
    this._lights.length = 0
    if (lights) {
      this.lights = new THREE.Mesh(lights, this._lightMaterial)
      this.group.add(this.lights)
      this._geometries.push(lights)
    }
  }

  /**
   * Tiñe la **piel** del avatar. Una variable, no un sistema de skins: cambia el
   * color base y los tonos de cada panel se recalculan solos.
   *
   * El canal de luz —las cuatro líneas y el núcleo— no se toca, y eso no es sólo
   * estética: es el canal que llevará el color de equipo, y un jugador no puede
   * pintarse del color del rival.
   */
  setColor(color) {
    this.color = color
    for (const zone of Object.keys(this.zones)) {
      for (const mesh of this.zones[zone]) {
        // Las piezas de luz no llevan tono guardado y se quedan como están.
        const factor = mesh.userData.shade
        if (factor === undefined) continue
        mesh.material.color.copy(shade(color, factor))
      }
    }
  }

  dispose() {
    for (const geometry of this._geometries) geometry.dispose()
    for (const material of this._materials) material.dispose()
    this.group.parent?.remove(this.group)
  }
}
