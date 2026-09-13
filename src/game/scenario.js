/**
 * Escenarios con cobertura: geometría, colisión y anclajes de aparición.
 *
 * Un escenario se declara como datos en `SCENARIOS` (config.js) y este módulo
 * lo convierte en tres cosas que consume el resto del motor:
 *
 *  - **Mallas** para dibujar. Se fusionan por tipo de pieza, así que 20 cajas
 *    salen en 5 llamadas de dibujo y no en 20.
 *  - **Colisionadores**: una lista plana de AABB más las rampas, que se
 *    resuelven aparte porque no frenan y sí levantan el suelo.
 *  - **Anclajes** resueltos, con su metadato intacto.
 *
 * Sin luces ni materiales PBR, igual que el resto de la escena: `MeshBasicMaterial`
 * de color plano más una arista un tono por encima, que es lo que le da al
 * bloque su silueta contra el fondo negro.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { COVER, SCENARIOS, coverEdgeColor, coverHeight, scenarioRoom } from '../config.js'

/**
 * Prisma triangular para las rampas: rectángulo abajo y una única arista
 * arriba, en el lado alto. Se construye a mano porque `BoxGeometry` no hace
 * cuñas, y con `DoubleSide` para no depender del orden de los vértices.
 */
function buildRampGeometry(ramp) {
  const x0 = ramp.x
  const x1 = ramp.x + ramp.w
  const zLow = ramp.fromZ
  const zHigh = ramp.toZ
  const top = coverHeight(ramp.top)

  const a = [x0, 0, zLow]
  const b = [x1, 0, zLow]
  const c = [x1, 0, zHigh]
  const d = [x0, 0, zHigh]
  const e = [x0, top, zHigh]
  const f = [x1, top, zHigh]

  const tris = [
    a, b, c, a, c, d, // suelo
    a, b, f, a, f, e, // rampa
    d, c, f, d, f, e, // cara alta
    a, d, e, // costado x0
    b, f, c, // costado x1
  ]

  const positions = new Float32Array(tris.length * 3)
  for (let i = 0; i < tris.length; i++) {
    positions[i * 3] = tris[i][0]
    positions[i * 3 + 1] = tris[i][1]
    positions[i * 3 + 2] = tris[i][2]
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** Acota un valor a un intervalo. El bucle de colisión lo usa por frame. */
function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value
}

/**
 * Frena `to` contra la banda `[lo, hi]` de un obstáculo, viniendo de `from`.
 *
 * Nunca devuelve una posición **más metida** en la banda que `from`, y nunca
 * empuja hacia atrás: lo peor que puede pasar es quedarse donde se estaba.
 */
function clampAgainstBand(to, from, lo, hi) {
  if (to <= lo || to >= hi) return to
  if (from <= lo) return Math.min(to, lo)
  if (from >= hi) return Math.max(to, hi)
  // `from` ya estaba dentro de la banda: se impide hundirse más hacia la cara
  // que tiene más cerca, y salir por la otra sigue siendo libre.
  return from - lo <= hi - from ? Math.min(to, from) : Math.max(to, from)
}

/**
 * Un escenario ya montado. Mientras `key` sea `empty` no hay geometría, no hay
 * colisión y no hay anclajes: el motor se comporta exactamente como antes.
 */
export class Scenario {
  /**
   * @param {THREE.Scene} scene
   * @param {string} key clave dentro de SCENARIOS
   */
  constructor(scene, key) {
    this.scene = scene
    this.key = SCENARIOS[key] ? key : 'empty'
    this.definition = SCENARIOS[this.key]

    this.group = new THREE.Group()
    this.materials = []
    this.geometries = []

    /** AABB de colisión: {minX, maxX, minZ, maxZ, bottom, top}. */
    this.boxes = []
    /** Rampas: no frenan, sólo levantan el suelo. */
    this.ramps = []
    /** Mallas contra las que se comprueba la visibilidad de un punto. */
    this.occluders = []
    /**
     * Rutas ya resueltas. Cada una es un conjunto de puntos mutuamente
     * alcanzables en línea recta, y lleva la cuenta de cuántos muñecos patrullan
     * por ella ahora mismo.
     * @type {Array<{id: string, zone: string, requiresPeek: boolean, floorY: number, points: Array<object>, liveCount: number}>}
     */
    this.routes = []
    /**
     * Todos los puntos de todas las rutas, en plano. **No hay dos clases de
     * punto**: cualquiera de éstos vale para que aparezca un muñeco y para que
     * patrulle hacia él.
     */
    this.points = []

    this._build()
    scene.add(this.group)
  }

  /** ¿Este escenario tiene cobertura, o es la sala vacía de siempre? */
  get hasGeometry() {
    return this.boxes.length > 0 || this.ramps.length > 0
  }

  /** Punto de aparición del jugador. */
  get spawn() {
    return this.definition.spawn
  }

  /**
   * Sala de este escenario: la de `ROOM` salvo que traiga la suya. Es la
   * medida que consumen la grilla, los límites de movimiento, el acotado de
   * dianas y el tablero de acciones, así que **no hay dos versiones** del
   * tamaño de la sala que se puedan desincronizar.
   */
  get room() {
    return scenarioRoom(this.key)
  }

  /**
   * Sitios posibles del explosivo. Vacío en los escenarios que no tienen
   * objetivo, que es como la sala vacía se queda sin él sin ningún caso especial.
   */
  get objectiveSites() {
    return this.definition.objectiveSites ?? []
  }

  /**
   * Recogibles curados: vida, escudo y casco. Vacío en la sala vacía, que es
   * como se queda sin ellos sin ningún caso especial, igual que con el explosivo.
   */
  get pickupSites() {
    return this.definition.pickups ?? []
  }

  _build() {
    const definition = this.definition
    /** Geometrías agrupadas por tipo de pieza, para fusionarlas de una vez. */
    const byKind = new Map()

    for (const box of definition.boxes) {
      const height = coverHeight(box.kind)
      const bottom = box.base ? coverHeight(box.base) : 0
      const thickness = height - bottom
      if (thickness <= 0) continue

      this.boxes.push({
        minX: box.x,
        maxX: box.x + box.w,
        minZ: box.z,
        maxZ: box.z + box.d,
        bottom,
        top: height,
        kind: box.kind,
      })

      const geometry = new THREE.BoxGeometry(box.w, thickness, box.d)
      geometry.translate(box.x + box.w / 2, bottom + thickness / 2, box.z + box.d / 2)
      if (!byKind.has(box.kind)) byKind.set(box.kind, [])
      byKind.get(box.kind).push(geometry)
    }

    for (const ramp of definition.ramps) {
      const top = coverHeight(ramp.top)
      this.ramps.push({
        minX: ramp.x,
        maxX: ramp.x + ramp.w,
        minZ: Math.min(ramp.z, ramp.z + ramp.d),
        maxZ: Math.max(ramp.z, ramp.z + ramp.d),
        fromZ: ramp.fromZ,
        toZ: ramp.toZ,
        top,
      })
      if (!byKind.has('rampa')) byKind.set('rampa', [])
      byKind.get('rampa').push(buildRampGeometry(ramp))
    }

    for (const [kind, geometries] of byKind) {
      const merged = mergeGeometries(geometries, false)
      for (const geometry of geometries) geometry.dispose()
      if (!merged) continue

      const fill = COVER.colors[kind] ?? COVER.colors.media
      const material = new THREE.MeshBasicMaterial({
        color: fill,
        side: kind === 'rampa' ? THREE.DoubleSide : THREE.FrontSide,
      })
      const mesh = new THREE.Mesh(merged, material)
      this.group.add(mesh)
      this.occluders.push(mesh)
      this.materials.push(material)
      this.geometries.push(merged)

      // Arista: mismo volumen, un tono por encima. Sin ella los bloques del
      // mismo gris se funden entre sí contra el fondo negro.
      const edgeGeometry = new THREE.EdgesGeometry(merged, 20)
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: coverEdgeColor(kind),
        transparent: true,
        opacity: COVER.edgeOpacity,
      })
      this.group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial))
      this.materials.push(edgeMaterial)
      this.geometries.push(edgeGeometry)
    }

    for (const definitionRoute of definition.routes ?? []) {
      const floorY = coverHeight(definitionRoute.y)
      const route = {
        id: definitionRoute.id,
        zone: definitionRoute.zone,
        /** ¿Obliga a asomarse a descubierto para tirarle? */
        requiresPeek: Boolean(definitionRoute.peek),
        /** Suelo sobre el que se apoyan sus puntos: 0 o la altura de la plataforma. */
        floorY,
        points: [],
        /** Cuántos muñecos patrullan por ella ahora mismo. */
        liveCount: 0,
      }
      for (const point of definitionRoute.points) {
        route.points.push({
          id: point.id,
          route,
          zone: route.zone,
          requiresPeek: route.requiresPeek,
          floorY,
          position: new THREE.Vector3(point.x, floorY, point.z),
          occupied: false,
        })
      }
      this.routes.push(route)
      for (const point of route.points) this.points.push(point)
    }
  }

  /**
   * Altura del suelo bajo un punto.
   *
   * Para las **cajas** no hay nada que decidir: si el punto cae dentro de la
   * huella, lo que hay bajo los pies es su techo. Estar dentro de la huella de
   * una caja sólo puede pasar habiendo entrado por arriba —la colisión mantiene
   * el centro del jugador a un radio de cualquier cara—, así que tratarlas como
   * muro ahí no protegía de nada y sí dejaba un agujero: la horizontal admite el
   * paso cuando el techo queda a menos de un escalón de los pies, pero corre
   * **antes** que la vertical, y un frame de caída bastaba para que al llegar ya
   * no diese el escalón. El jugador se quedaba hundido dentro del cajón en vez
   * de aterrizar encima. Los dos sistemas tienen que admitir los mismos sitios.
   *
   * Para las **rampas** sí se mira el escalón: su huella es transitable de
   * verdad por la parte baja, y la cuña no puede levantar a nadie de golpe.
   *
   * @param {number} feetY altura actual de los pies, para decidir qué pisa
   */
  groundHeightAt(x, z, feetY) {
    let ground = 0
    const reach = feetY + COVER.stepHeight

    for (let i = 0; i < this.boxes.length; i++) {
      const box = this.boxes[i]
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue
      if (box.top <= ground) continue
      ground = box.top
    }

    for (let i = 0; i < this.ramps.length; i++) {
      const height = this._rampHeightAt(this.ramps[i], x, z)
      if (height === null || height > reach || height <= ground) continue
      ground = height
    }

    return ground
  }

  /** Altura de una rampa en un punto, o null si el punto queda fuera de ella. */
  _rampHeightAt(ramp, x, z) {
    if (x < ramp.minX || x > ramp.maxX || z < ramp.minZ || z > ramp.maxZ) return null
    const span = ramp.toZ - ramp.fromZ
    if (span === 0) return ramp.top
    let t = (z - ramp.fromZ) / span
    if (t < 0) t = 0
    else if (t > 1) t = 1
    return ramp.top * t
  }

  /**
   * Resuelve la colisión horizontal **en un solo eje**. Llamarla una vez por
   * eje —primero X con la Z vieja, luego Z con la X ya corregida— es lo que
   * hace que rozar un muro deslice en lugar de frenar en seco.
   *
   * Dos reglas que vienen de bugs reales y siguen en pie: **nunca se empuja
   * hacia atrás** —sacar al jugador por la cara más próxima parece razonable
   * hasta que la caja es enorme: la plataforma del Balcón ocupa el ancho entero
   * de la sala, y a quien quedara dentro de su huella lo escupía cuarenta
   * unidades de golpe, contra la pared— y **a quien ya esté metido se le deja
   * salir**, por la cara que tenga más cerca.
   *
   * Las dos reglas salen de una sola cuenta. En cada eje la caja ocupa la banda
   * `[minA - radio, maxA + radio]` —la huella, engordada el cuerpo del jugador—
   * y lo único que se decide es si el paso **mete más** al jugador en ella:
   *
   *  - si el destino no toca la banda, no hay choque;
   *  - si venía de fuera, se frena en la cara por la que entraba;
   *  - si ya estaba dentro de la banda, no se le empuja: sólo se le impide
   *    hundirse más hacia la cara que tiene más cerca. Salir siempre se puede.
   *
   * Nada de esto compara la caja expandida con la posición de partida, que es
   * donde estaba el fallo: `from + radius > minA` parece equivalente a «ya
   * estaba dentro» y no lo es. Al frenar, `from` queda exactamente en
   * `minA - radius`, y sumarle el radio **no siempre devuelve `minA`** en coma
   * flotante — con la Media de x −1, −1.4 + 0.4 da −0.9999999999999999, mayor
   * que −1. El muro dejaba de bloquear al segundo frame de contacto y se entraba
   * andando. Pasaba en esa cara y no en las demás, que redondeaban al otro lado.
   *
   * Y la banda tampoco vale como «ya estaba dentro»: tras un salto se aterriza
   * rozando una pieza —el centro fuera, el cilindro dentro—, y tratar eso como
   * «dentro» abría la puerta de par en par. Por eso la regla no es «dentro o
   * fuera» sino «más adentro o no».
   *
   * @param {'x'|'z'} axis
   * @param {number} from posición en ese eje antes de moverse
   * @param {number} to posición propuesta
   * @param {number} other posición en el otro eje
   * @param {number} feetY altura de los pies
   * @param {number} headY altura de la coronilla
   * @returns {number} la posición admitida
   */
  resolveAxis(axis, from, to, other, feetY, headY) {
    const delta = to - from
    if (delta === 0) return to

    const radius = COVER.playerRadius
    const reach = feetY + COVER.stepHeight
    let resolved = to

    for (let i = 0; i < this.boxes.length; i++) {
      const box = this.boxes[i]
      // Ni suelo que se pisa ni techo bajo el que se pasa: sólo estorba lo que
      // corta a la altura del cuerpo.
      if (box.top <= reach || box.bottom >= headY) continue

      const minB = axis === 'x' ? box.minZ : box.minX
      const maxB = axis === 'x' ? box.maxZ : box.maxX
      if (other + radius <= minB || other - radius >= maxB) continue

      const lo = (axis === 'x' ? box.minX : box.minZ) - radius
      const hi = (axis === 'x' ? box.maxX : box.maxZ) + radius
      resolved = clampAgainstBand(resolved, from, lo, hi)
    }

    // Las rampas también son sólidas. No estaban en `boxes` —sólo las usaba
    // `groundHeightAt`— así que no bloqueaban nada: se entraba andando dentro de
    // la cuña, de pie y agachado, y se salía por el otro lado.
    for (let i = 0; i < this.ramps.length; i++) {
      const ramp = this.ramps[i]
      const minA = axis === 'x' ? ramp.minX : ramp.minZ
      const maxA = axis === 'x' ? ramp.maxX : ramp.maxZ
      const minB = axis === 'x' ? ramp.minZ : ramp.minX
      const maxB = axis === 'x' ? ramp.maxZ : ramp.maxX
      if (other + radius <= minB || other - radius >= maxB) continue

      const lo = minA - radius
      const hi = maxA + radius
      if (resolved <= lo || resolved >= hi) continue

      // El punto de la cuña que el jugador pisaría, acotado a su huella. Se
      // mide en el **centro**, no en el borde del cilindro: `groundHeightAt`
      // decide el suelo por el centro, y si aquí se mirase medio cuerpo por
      // delante este test sería más severo que aquél — a pocos FPS el primer
      // paso dentro de la rampa veía ya 0.26 u de cuña y la declaraba muro,
      // dejando la subida bloqueada desde el primer escalón.
      const leadA = clamp(resolved, minA, maxA)
      const sideB = clamp(other, minB, maxB)
      const toX = axis === 'x' ? leadA : sideB
      const toZ = axis === 'x' ? sideB : leadA
      const fromX = axis === 'x' ? from : other
      const fromZ = axis === 'x' ? other : from
      if (!this._rampBlocks(ramp, toX, toZ, fromX, fromZ, feetY)) continue

      resolved = clampAgainstBand(resolved, from, lo, hi)
    }

    return resolved
  }

  /** Cuánto sube una rampa por unidad recorrida. */
  _rampSlope(ramp) {
    const span = Math.abs(ramp.toZ - ramp.fromZ)
    return span === 0 ? Infinity : ramp.top / span
  }

  /**
   * ¿La cuña `ramp` corta el cuerpo al ir de (fromX,fromZ) a (x,z)?
   *
   * La regla es **sólo por encima**: estorba cuando su superficie en el punto de
   * llegada sube por encima de lo que el jugador ya pisa más de lo que puede
   * subir en ese tramo — un escalón, más lo que la propia rampa gana de altura
   * en la distancia recorrida.
   *
   * Ese segundo término es lo que hace que subir la rampa **no dependa del
   * refresco**: a 60 Hz el paso es 0.11 u y la rampa gana 0.05, pero con el
   * delta máximo que admite el bucle el paso es 0.65 y gana 0.28, más que el
   * escalón. Sin el término, la rampa se volvía intransitable a pocos FPS.
   *
   * Pero **sólo cuenta si ya se está encima**: al entrar desde fuera no hay
   * crédito de pendiente. Si lo hubiera, este test sería más permisivo que
   * `groundHeightAt` —que no lo tiene— y se podría poner un pie en un punto de
   * la cuña que el suelo luego se niega a levantar: el jugador se quedaba
   * enterrado unos centímetros. Los dos sistemas tienen que admitir exactamente
   * los mismos sitios.
   *
   * Y el término de comparación es la altura de la rampa **donde está** el
   * jugador, no su altura de pies a secas — salvo que esté enterrado en ella,
   * en cuyo caso mandan los pies y no puede seguir hundiéndose.
   */
  _rampBlocks(ramp, x, z, fromX, fromZ, feetY) {
    const ahead = this._rampHeightAt(ramp, x, z)
    if (ahead === null) return false
    const under = this._rampHeightAt(ramp, fromX, fromZ)
    const supported = under !== null && under <= feetY + COVER.stepHeight
    const base = supported ? Math.max(feetY, under) : feetY
    const climb = supported ? this._rampSlope(ramp) * Math.abs(z - fromZ) : 0
    return ahead > base + COVER.stepHeight + climb
  }

  /**
   * ¿Acabar en (x,z) viniendo de (fromX,fromZ) dejaría el cuerpo dentro de una
   * cuña? La colisión se resuelve **un eje cada vez**, y eso valida cada eje con
   * la coordenada del otro a medias: una diagonal contra el costado de una rampa
   * podía colarse una fracción de paso por la esquina. Esto es el cierre: lo que
   * la resolución por ejes deje pasar, no se admite.
   */
  rampBlocksMove(x, z, fromX, fromZ, feetY) {
    for (let i = 0; i < this.ramps.length; i++) {
      if (this._rampBlocks(this.ramps[i], x, z, fromX, fromZ, feetY)) return true
    }
    return false
  }

  dispose() {
    this.scene.remove(this.group)
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials) material.dispose()
    this.geometries.length = 0
    this.materials.length = 0
    this.occluders.length = 0
    this.boxes.length = 0
    this.ramps.length = 0
    this.routes.length = 0
    this.points.length = 0
  }
}
