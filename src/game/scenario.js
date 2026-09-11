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
import { COVER, SCENARIOS, coverEdgeColor, coverHeight } from '../config.js'

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
    /** Mallas contra las que se comprueba la visibilidad de un anclaje. */
    this.occluders = []
    /** Anclajes de aparición ya resueltos. */
    this.anchors = []
    /**
     * Grupos de patrulla por id, con sus puntos ya resueltos. Cada anclaje
     * apunta al suyo con `cluster`; los que no tienen dan muñecos quietos.
     * @type {Map<string, Array<{id: string, position: THREE.Vector3}>>}
     */
    this.patrolClusters = new Map()

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
   * Sitios posibles del explosivo. Vacío en los escenarios que no tienen
   * objetivo, que es como la sala vacía se queda sin él sin ningún caso especial.
   */
  get objectiveSites() {
    return this.definition.objectiveSites ?? []
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

    const clusters = definition.patrolClusters ?? {}
    for (const id of Object.keys(clusters)) {
      this.patrolClusters.set(
        id,
        clusters[id].map((point) => ({
          id: point.id,
          position: new THREE.Vector3(point.x, coverHeight(point.y ?? 0), point.z),
        })),
      )
    }

    for (const anchor of definition.anchors) {
      this.anchors.push({
        id: anchor.id,
        zone: anchor.zone,
        /** Suelo sobre el que se apoya la diana: 0 o la altura de la plataforma. */
        floorY: coverHeight(anchor.y),
        /** ¿Obliga a asomarse a descubierto para tirarle? */
        requiresPeek: Boolean(anchor.peek),
        /** Grupo de patrulla al que sale este muñeco, o null si se queda quieto. */
        cluster: anchor.cluster ? this.patrolClusters.get(anchor.cluster) ?? null : null,
        position: new THREE.Vector3(anchor.x, coverHeight(anchor.y), anchor.z),
      })
    }
  }

  /**
   * Altura del suelo bajo un punto. Sólo cuentan las superficies que el jugador
   * podría pisar desde donde está: una caja cuyo techo le queda por encima de la
   * cabeza es un muro, no un suelo.
   *
   * @param {number} feetY altura actual de los pies, para decidir qué pisa
   */
  groundHeightAt(x, z, feetY) {
    let ground = 0
    const reach = feetY + COVER.stepHeight

    for (let i = 0; i < this.boxes.length; i++) {
      const box = this.boxes[i]
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue
      if (box.top > reach || box.top <= ground) continue
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
   * El bloqueo va **en el sentido del avance**, no hacia la cara más cercana.
   * Sacar al jugador por la cara más próxima parece razonable hasta que la caja
   * es enorme: la plataforma del Balcón ocupa el ancho entero de la sala, así
   * que a quien quedara dentro de su huella lo escupía cuarenta unidades de
   * golpe, contra la pared. Se leía como un teletransporte.
   *
   * Por lo mismo, a quien ya estuviera dentro de una caja antes de moverse no
   * se le empuja: se le deja salir. Un empujón ahí es siempre peor que el
   * problema que arregla.
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

      const minA = axis === 'x' ? box.minX : box.minZ
      const maxA = axis === 'x' ? box.maxX : box.maxZ
      const minB = axis === 'x' ? box.minZ : box.minX
      const maxB = axis === 'x' ? box.maxZ : box.maxX

      if (other + radius <= minB || other - radius >= maxB) continue
      if (resolved + radius <= minA || resolved - radius >= maxA) continue
      // Ya estaba dentro en este eje antes de moverse: no es un choque.
      if (from + radius > minA && from - radius < maxA) continue

      resolved =
        delta > 0 ? Math.min(resolved, minA - radius) : Math.max(resolved, maxA + radius)
    }

    return resolved
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
    this.anchors.length = 0
  }
}
