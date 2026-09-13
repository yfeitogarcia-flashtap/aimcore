/**
 * Avatar humanoide del jugador: el modelo que se verá cuando haya rivales.
 *
 * **Comparte anatomía con el muñeco de puntería.** Cabeza, torso y piernas salen
 * de las mismas medidas que `TARGET_TYPES.hitbox` —alturas, radios y centros—,
 * así que esto no es «otro muñeco»: es la representación visual del sistema de
 * zonas que ya existe. Si mañana el torso empieza más arriba, se mueve en un
 * sitio y se mueven los dos.
 *
 * **Tres canales, y sólo uno se puede personalizar:**
 *
 *  1. **Piel.** Paneles planos y angulares —cada pieza se estrecha, ninguna es
 *     un prisma recto y ninguna es redonda— en negro, con **la misma grilla del
 *     suelo y las paredes** encima. No es una textura: es el generador de líneas
 *     de `grid.js`, el mismo que monta la sala, a paso de cuerpo. Es la skin de
 *     serie, la que se tiene sin comprar nada. `setColor()` cambia ésta.
 *  2. **Luz.** Líneas verticales emisivas por torso y piernas, el visor y el
 *     núcleo. Canal **fijo**: el día que haya equipos, éste llevará su color, y
 *     por eso `setColor()` no lo toca.
 *  3. **Aristas.** El filo de cada panel, en el gris de acento de la grilla.
 *
 * Y no hay texturas porque **no hay ni una luz en la escena**: todo se dibuja
 * con materiales planos. Sin sombreado, lo que da volumen son las aristas y la
 * grilla; con la piel en negro el tono ya no separa nada —multiplicar negro por
 * 0.62 sigue siendo negro—, así que el trabajo lo hacen las líneas.
 *
 * Las líneas —grilla, aristas y luz— se **fusionan** en tres objetos para todo
 * el cuerpo en vez de colgar de cada pieza: con una rejilla por cara, un avatar
 * suelto eran cuarenta objetos y en multijugador habrá varios.
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

/** Tono de una pieza: el color base multiplicado, que sin luces es todo lo que hay. */
function shade(base, factor) {
  return new THREE.Color(base).multiplyScalar(factor)
}

/**
 * **Panel angular.** Una caja cuyas tapas superior e inferior se estrechan: es
 * lo que separa una armadura de un ladrillo, y lo que hace que el modelo se lea
 * facetado sin una sola luz que le dé un brillo.
 *
 * Se construye a mano en lugar de deformar una `BoxGeometry` porque los índices
 * de sus vértices son un detalle de three, y `EdgesGeometry` —de donde salen los
 * filos— necesita que las caras compartan vértices para no dibujar cada
 * triángulo por separado.
 *
 * @param {number} topScale fracción del ancho en la tapa de arriba (1 = recto)
 * @param {number} bottomScale ídem en la de abajo
 */
function taperedBox(width, height, depth, topScale = 1, bottomScale = 1) {
  const hw = width / 2
  const hh = height / 2
  const hd = depth / 2
  const b = bottomScale
  const t = topScale
  const positions = new Float32Array([
    -hw * b, -hh, -hd * b,
    hw * b, -hh, -hd * b,
    hw * b, -hh, hd * b,
    -hw * b, -hh, hd * b,
    -hw * t, hh, -hd * t,
    hw * t, hh, -hd * t,
    hw * t, hh, hd * t,
    -hw * t, hh, hd * t,
  ])
  // Caras con el giro hacia fuera: con `FrontSide`, una cara al revés
  // sencillamente no se dibuja y el modelo sale con agujeros.
  const index = [
    0, 1, 2, 0, 2, 3, // abajo
    4, 6, 5, 4, 7, 6, // arriba
    3, 2, 6, 3, 6, 7, // +Z
    1, 0, 4, 1, 4, 5, // -Z
    2, 1, 5, 2, 5, 6, // +X
    0, 3, 7, 0, 7, 4, // -X
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
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

    this._edgeMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(AVATAR.edgeColor),
      transparent: true,
      opacity: 0.85,
    })
    this._gridMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(AVATAR.gridColor) })
    this._gridAccentMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(AVATAR.gridAccentColor),
    })
    /** El canal de luz: visor, núcleo y líneas. El futuro color de equipo. */
    this._lightMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(AVATAR.teamColor) })
    this._materials.push(
      this._edgeMaterial,
      this._gridMaterial,
      this._gridAccentMaterial,
      this._lightMaterial,
    )

    this._build()
  }

  /**
   * Un panel con su tono, sus filos y su grilla, colgado de la zona que le
   * toque. Las líneas no se añaden al panel: se guardan para fusionarlas.
   */
  _panel(zone, { w, h, d, x, y, z = 0, factor, top = 1, bottom = 1, grid = true }) {
    const geometry = taperedBox(w, h, d, top, bottom)
    const material = new THREE.MeshBasicMaterial({ color: shade(AVATAR.color, factor) })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    // Con qué factor se pintó, para poder repintarla sin reconstruir nada.
    mesh.userData.shade = factor
    this.group.add(mesh)
    this.zones[zone].push(mesh)
    this._geometries.push(geometry)
    this._materials.push(material)

    const edges = new THREE.EdgesGeometry(geometry, 20)
    edges.translate(x, y, z)
    this._edges.push(edges)

    // La grilla se **mide** por la cara más estrecha —una rejilla del ancho
    // completo se saldría por el lado que se cierra— y se **coloca** a la altura
    // de la más ancha: puesta a la estrecha se queda dentro del panel y no se ve
    // ni una línea, que es exactamente lo que pasó la primera vez.
    if (grid) {
      const narrow = Math.min(top, bottom)
      const wide = Math.max(top, bottom)
      this._skinFace(w * narrow, h, x, y, z + (d * wide) / 2, 0)
      this._skinFace(w * narrow, h, x, y, z - (d * wide) / 2, Math.PI)
      this._skinFace(d * narrow, h, x + (w * wide) / 2, y, z, Math.PI / 2)
      this._skinFace(d * narrow, h, x - (w * wide) / 2, y, z, -Math.PI / 2)
    }
    return mesh
  }

  /** Un trozo de grilla sobre una cara, girada a su sitio. */
  _skinFace(width, height, x, y, z, rotationY) {
    if (width <= AVATAR.gridStep || height <= AVATAR.gridStep) return
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
   * **Un tramo de la línea de luz**, de un punto a otro. Es el canal fijo —el
   * que llevará el color de equipo—, así que no es una arista más: es una caja
   * fina y emisiva por delante del panel.
   *
   * Se da por sus dos extremos y no por posición y ángulo: los tramos encadenan
   * —coronilla, cuello, ingle, bota— y lo único que hay que garantizar es que el
   * final de uno sea el principio del siguiente. La inclinación sale sola.
   */
  _lightSegment(width, depth, from, to) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    if (length <= 1e-6) return
    const geometry = new THREE.BoxGeometry(width, length, depth)
    geometry.rotateZ(-Math.atan2(dx, dy))
    geometry.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2)
    this._lights.push(geometry)
  }

  _build() {
    const s = this.scale
    const torso = ZONES.torso
    const legs = ZONES.legs
    const head = ZONES.head

    const torsoY = torso.offsetY * s
    const torsoH = torso.height * s
    const torsoR = torso.radius * s
    const legsY = legs.offsetY * s
    const legsH = legs.height * s
    const headY = head.offsetY * s
    const headR = head.radius * s

    const taperIn = 1 - AVATAR.taper
    const taperOut = 1 + AVATAR.taper * 0.5
    const stripW = AVATAR.stripWidth * torsoR

    // --- piernas: muslo, rodilla, espinilla y bota, dos veces ----------------
    const legX = AVATAR.legGap * torsoR
    const legR = AVATAR.legRadius * torsoR
    const thighH = legsH * 0.46
    const shinH = legsH * 0.38
    const bootH = legsH * 0.16
    const thighY = legsY + legsH / 2 - thighH / 2
    const kneeY = legsY + legsH / 2 - thighH - legsH * 0.04
    const shinY = legsY + legsH / 2 - thighH - legsH * 0.08 - shinH / 2
    for (const side of [-1, 1]) {
      // El muslo se cierra hacia la rodilla y la espinilla hacia el tobillo:
      // es lo que da la silueta de pierna en vez de dos cajas iguales.
      this._panel('legs', {
        w: legR * 2, h: thighH, d: legR * 2.1, x: side * legX, y: thighY,
        factor: AVATAR.shades.limb, top: 1, bottom: taperIn,
      })
      this._panel('legs', {
        w: legR * 1.7, h: legsH * 0.08, d: legR * 1.9, x: side * legX, y: kneeY,
        factor: AVATAR.shades.joint, grid: false,
      })
      this._panel('legs', {
        w: legR * 1.8, h: shinH, d: legR * 1.9, x: side * legX, y: shinY,
        factor: AVATAR.shades.limb, top: 1, bottom: taperIn,
      })
      this._panel('legs', {
        w: legR * 2, h: bootH, d: legR * 3, x: side * legX, y: legsY - legsH / 2 + bootH / 2,
        z: legR * 0.4, factor: AVATAR.shades.boot, top: taperIn, grid: false,
      })
    }

    // --- torso: pecho, cintura, hombros y núcleo ------------------------------
    const chestW = AVATAR.chestWidth * torsoR
    const chestD = AVATAR.chestDepth * torsoR
    const chestH = torsoH * 0.58
    const chestY = torsoY + torsoH / 2 - chestH / 2
    const waistY = torsoY - torsoH / 2 + torsoH * 0.17
    // El pecho se abre hacia arriba y la cintura se cierra hacia abajo: el
    // trapecio de toda armadura, y lo que hace que de perfil no sea una pila.
    this._panel('torso', {
      w: chestW, h: chestH, d: chestD, x: 0, y: chestY,
      factor: AVATAR.shades.chest, top: taperOut, bottom: taperIn,
    })
    this._panel('torso', {
      w: chestW * 0.78, h: torsoH * 0.34, d: chestD * 0.88, x: 0, y: waistY,
      factor: AVATAR.shades.limb, top: 1, bottom: taperIn,
    })

    const shoulderX = (AVATAR.shoulderWidth * torsoR) / 2
    const shoulderY = torsoY + torsoH / 2 - chestH * 0.18
    for (const side of [-1, 1]) {
      this._panel('torso', {
        w: torsoR * 0.62, h: torsoR * 0.62, d: chestD, x: side * shoulderX, y: shoulderY,
        factor: AVATAR.shades.joint, top: taperIn, grid: false,
      })
    }

    // Núcleo: octaedro, el mismo azul, y el único sitio donde el modelo brilla
    // de verdad. Es la pista visual de la carga eléctrica del escudo.
    const coreGeometry = new THREE.OctahedronGeometry(AVATAR.coreRadius * torsoR)
    this.core = new THREE.Mesh(coreGeometry, this._lightMaterial)
    this.core.position.set(0, torsoY + torsoH * 0.12, chestD / 2)
    this.group.add(this.core)
    this.zones.torso.push(this.core)
    this._geometries.push(coreGeometry)

    // --- brazos ---------------------------------------------------------------
    const armR = AVATAR.armRadius * torsoR
    const upperH = torsoH * 0.42
    const foreH = torsoH * 0.38
    for (const side of [-1, 1]) {
      // Separados del pecho a propósito: pegados, de frente el torso y los
      // brazos eran un solo bloque.
      const armX = side * (shoulderX + armR + AVATAR.armGap * torsoR)
      this._panel('torso', {
        w: armR * 2, h: upperH, d: armR * 2, x: armX, y: shoulderY - upperH / 2 - torsoR * 0.18,
        factor: AVATAR.shades.limb, top: 1, bottom: taperIn, grid: false,
      })
      this._panel('torso', {
        w: armR * 1.7, h: torsoH * 0.06, d: armR * 1.9, x: armX, y: shoulderY - upperH - torsoR * 0.2,
        factor: AVATAR.shades.joint, grid: false,
      })
      this._panel('torso', {
        w: armR * 1.8, h: foreH, d: armR * 1.8, x: armX,
        y: shoulderY - upperH - torsoR * 0.24 - foreH / 2,
        factor: AVATAR.shades.limb, top: 1, bottom: taperIn, grid: false,
      })
    }

    // Cuello: sin él la cabeza se apoya en los hombros y el modelo no tiene
    // dónde girarla el día que gire.
    const neckH = AVATAR.neckHeight * torsoR
    this._panel('torso', {
      w: torsoR * 0.42, h: neckH, d: torsoR * 0.42, x: 0, y: torsoY + torsoH / 2 + neckH / 2,
      factor: AVATAR.shades.joint, grid: false,
    })

    // --- cabeza: cráneo de dos paneles y visor --------------------------------
    // Dos paneles en lugar de un poliedro: el de arriba se cierra hacia la
    // coronilla y el de abajo hacia la mandíbula, que es una cabeza con
    // dirección y no una bola facetada.
    this._panel('head', {
      w: headR * 1.7, h: headR * 1.15, d: headR * 1.6, x: 0, y: headY + headR * 0.3,
      factor: AVATAR.shades.chest, top: taperIn, grid: false,
    })
    this._panel('head', {
      w: headR * 1.55, h: headR * 0.75, d: headR * 1.45, x: 0, y: headY - headR * 0.5,
      factor: AVATAR.shades.limb, bottom: taperIn, grid: false,
    })

    // --- las dos líneas de luz, de la coronilla a las botas -------------------
    // Son **continuas**: cada tramo empieza donde acaba el anterior, así que lo
    // que se declara es la cadena de puntos por la que pasan y no un ángulo por
    // pieza. De aquí sale también la cara del modelo: la línea sólo va por
    // delante, y eso es lo que dice de un vistazo hacia dónde mira.
    // Las z van pegadas a la cara de cada panel, no por delante: de perfil, medio
    // decímetro de aire entre la línea y el cuerpo se ve enseguida.
    const crown = { x: AVATAR.stripHeadSpread * torsoR * 0.55, y: headY + headR * 1.05, z: headR * 0.55 }
    const chin = { x: AVATAR.stripHeadSpread * torsoR, y: headY - headR * 0.7, z: headR * 0.78 }
    // El pecho se **abre** hacia arriba (`taperOut`), así que su cara delantera
    // queda más adelante que media profundidad: con `chestD * 0.44` la línea se
    // metía dentro del panel y desaparecía del cuello al esternón.
    const neck = { x: AVATAR.stripHeadSpread * torsoR, y: torsoY + torsoH / 2, z: chestD * 0.58 }
    const groin = { x: AVATAR.stripChestSpread * torsoR, y: legsY + legsH / 2, z: chestD * 0.36 }
    const knee = { x: AVATAR.stripLegSpread * torsoR, y: kneeY, z: legR * 0.95 }
    const boot = { x: AVATAR.stripLegSpread * torsoR, y: legsY - legsH / 2 + bootH, z: legR * 1.05 }
    const mirror = (point, side) => ({ x: point.x * side, y: point.y, z: point.z })
    for (const side of [-1, 1]) {
      const chain = [crown, chin, neck, groin, knee, boot]
      for (let i = 0; i < chain.length - 1; i++) {
        this._lightSegment(stripW, stripW, mirror(chain[i], side), mirror(chain[i + 1], side))
      }
    }

    this._mergeLines()
  }

  /**
   * Fusiona grilla, filos y luces en tres objetos. Es lo que hace que la piel de
   * rejilla no cueste un objeto por cara.
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
   * El canal de luz —líneas, visor y núcleo— no se toca, y desde esta vuelta eso
   * no es sólo estética: es el canal que llevará el color de equipo, y un jugador
   * no puede pintarse del color del rival.
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
