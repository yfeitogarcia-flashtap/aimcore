/**
 * Avatar humanoide del jugador: el modelo que se verá cuando haya rivales.
 *
 * **Comparte anatomía con el muñeco de puntería.** Cabeza, torso y piernas salen
 * de las mismas medidas que `TARGET_TYPES.hitbox` —alturas, radios y centros—,
 * así que esto no es «otro muñeco»: es la representación visual del sistema de
 * zonas que ya existe. Si mañana el torso empieza más arriba, se mueve en un
 * sitio y se mueven los dos.
 *
 * Lo que añade sobre la diana es lo que una diana no necesita: hombros, brazos,
 * articulaciones, botas y **costuras**. Y lo que no añade es textura: en esta
 * escena no hay ni una luz, así que el volumen lo dan las facetas con su tono y
 * las líneas brillantes por las aristas. Una textura aquí no se vería; una línea
 * sí, y además es lo que sugiere circuitería.
 *
 * No tiene lógica de juego: ni vida, ni impactos, ni colisión. Es geometría.
 */

import * as THREE from 'three'
import { AVATAR, TARGET_TYPES } from '../config.js'

/** Las medidas de las tres zonas, tal como las declara el hitbox. */
const ZONES = {}
for (const part of TARGET_TYPES.hitbox.parts) ZONES[part.zone] = part

/** Tono de una pieza: el color base multiplicado, que sin luces es todo lo que hay. */
function shade(base, factor) {
  return new THREE.Color(base).multiplyScalar(factor)
}

/**
 * Aristas de una geometría como líneas brillantes. Es la «circuitería»: no son
 * un contorno decorativo, son lo que hace legible un cuerpo mate en una escena
 * sin luces.
 */
function seams(geometry, material) {
  return new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), material)
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

    this._seamMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(AVATAR.seamColor),
      transparent: true,
      opacity: 0.9,
    })
    this._materials.push(this._seamMaterial)

    this._build()
  }

  /** Una caja con su tono y sus costuras, colgada de la zona que le toque. */
  _piece(zone, width, height, depth, x, y, z, factor) {
    const geometry = new THREE.BoxGeometry(width, height, depth)
    const material = new THREE.MeshBasicMaterial({ color: shade(AVATAR.color, factor) })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    // Con qué factor se pintó, para poder repintarla sin reconstruir nada.
    mesh.userData.shade = factor
    mesh.add(seams(geometry, this._seamMaterial))
    this.group.add(mesh)
    this.zones[zone].push(mesh)
    this._geometries.push(geometry)
    this._materials.push(material)
    return mesh
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

    // --- piernas: muslo, espinilla y bota, dos veces --------------------------
    const legX = AVATAR.legGap * torsoR
    const legR = AVATAR.legRadius * torsoR
    const thighH = legsH * 0.46
    const shinH = legsH * 0.38
    const bootH = legsH * 0.16
    for (const side of [-1, 1]) {
      this._piece('legs', legR * 2, thighH, legR * 2.1, side * legX, legsY + legsH / 2 - thighH / 2, 0, AVATAR.shades.limb)
      // La rodilla es una pieza aparte y más oscura: sin luces, una articulación
      // sólo se lee si cambia de tono.
      this._piece('legs', legR * 1.7, legsH * 0.08, legR * 1.9, side * legX, legsY + legsH / 2 - thighH - legsH * 0.04, 0, AVATAR.shades.joint)
      this._piece('legs', legR * 1.8, shinH, legR * 1.9, side * legX, legsY + legsH / 2 - thighH - legsH * 0.08 - shinH / 2, 0, AVATAR.shades.limb)
      this._piece('legs', legR * 2, bootH, legR * 3, side * legX, legsY - legsH / 2 + bootH / 2, legR * 0.4, AVATAR.shades.boot)
    }

    // --- torso: pecho, cintura, hombros y núcleo ------------------------------
    const chestW = AVATAR.chestWidth * torsoR
    const chestD = AVATAR.chestDepth * torsoR
    const chestH = torsoH * 0.58
    this._piece('torso', chestW, chestH, chestD, 0, torsoY + torsoH / 2 - chestH / 2, 0, AVATAR.shades.chest)
    this._piece('torso', chestW * 0.78, torsoH * 0.34, chestD * 0.88, 0, torsoY - torsoH / 2 + torsoH * 0.17, 0, AVATAR.shades.limb)

    const shoulderX = (AVATAR.shoulderWidth * torsoR) / 2
    const shoulderY = torsoY + torsoH / 2 - chestH * 0.18
    for (const side of [-1, 1]) {
      this._piece('torso', torsoR * 0.62, torsoR * 0.62, chestD, side * shoulderX, shoulderY, 0, AVATAR.shades.joint)
    }

    // Núcleo: el mismo azul que las costuras, y el único sitio donde el modelo
    // brilla de verdad. Es la pista visual de la carga eléctrica del escudo.
    const coreGeometry = new THREE.OctahedronGeometry(AVATAR.coreRadius * torsoR)
    const coreMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(AVATAR.seamColor) })
    this.core = new THREE.Mesh(coreGeometry, coreMaterial)
    this.core.position.set(0, torsoY + torsoH * 0.12, chestD / 2)
    this.group.add(this.core)
    this.zones.torso.push(this.core)
    this._geometries.push(coreGeometry)
    this._materials.push(coreMaterial)

    // --- brazos ---------------------------------------------------------------
    const armR = AVATAR.armRadius * torsoR
    const upperH = torsoH * 0.42
    const foreH = torsoH * 0.38
    for (const side of [-1, 1]) {
      // Separados del pecho a propósito: pegados, de frente el torso y los
      // brazos eran un solo bloque.
      const armX = side * (shoulderX + armR + AVATAR.armGap * torsoR)
      this._piece('torso', armR * 2, upperH, armR * 2, armX, shoulderY - upperH / 2 - torsoR * 0.18, 0, AVATAR.shades.limb)
      this._piece('torso', armR * 1.7, torsoH * 0.06, armR * 1.9, armX, shoulderY - upperH - torsoR * 0.2, 0, AVATAR.shades.joint)
      this._piece('torso', armR * 1.8, foreH, armR * 1.8, armX, shoulderY - upperH - torsoR * 0.24 - foreH / 2, 0, AVATAR.shades.limb)
    }

    // Cuello: sin él la cabeza se apoya en los hombros y el modelo no tiene
    // dónde girarla el día que gire.
    const neckH = AVATAR.neckHeight * torsoR
    this._piece('torso', torsoR * 0.42, neckH, torsoR * 0.42, 0, torsoY + torsoH / 2 + neckH / 2, 0, AVATAR.shades.joint)

    // --- cabeza: cráneo facetado y visor --------------------------------------
    const skullGeometry = new THREE.IcosahedronGeometry(headR, 0)
    const skullMaterial = new THREE.MeshBasicMaterial({ color: shade(AVATAR.color, AVATAR.shades.chest) })
    const skull = new THREE.Mesh(skullGeometry, skullMaterial)
    skull.userData.shade = AVATAR.shades.chest
    skull.position.y = headY
    skull.add(seams(skullGeometry, this._seamMaterial))
    this.group.add(skull)
    this.zones.head.push(skull)
    this._geometries.push(skullGeometry)
    this._materials.push(skullMaterial)

    const visorGeometry = new THREE.BoxGeometry(headR * 1.45, headR * 0.34, headR * 0.3)
    const visorMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(AVATAR.seamColor) })
    const visor = new THREE.Mesh(visorGeometry, visorMaterial)
    visor.position.set(0, headY + headR * 0.08, headR * 0.82)
    this.group.add(visor)
    this.zones.head.push(visor)
    this._geometries.push(visorGeometry)
    this._materials.push(visorMaterial)

    // Costura central: del cuello a la cintura, por delante. Es lo que ata el
    // conjunto y lo que hace que de perfil no parezca una pila de cajas.
    const spine = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, torsoY + torsoH / 2, chestD / 2 + 0.001),
      new THREE.Vector3(0, torsoY - torsoH / 2, chestD / 2 + 0.001),
    ])
    this.group.add(new THREE.Line(spine, this._seamMaterial))
    this._geometries.push(spine)
  }

  /**
   * Tiñe el avatar. **Una variable, no un sistema de skins**: cambia el color
   * base y los tonos de cada pieza se recalculan solos. Las costuras y el núcleo
   * no se tocan — son la parte eléctrica, y es lo que hace reconocible al modelo.
   */
  setColor(color) {
    this.color = color
    for (const zone of Object.keys(this.zones)) {
      for (const mesh of this.zones[zone]) {
        // Las piezas eléctricas —núcleo y visor— no llevan tono guardado y se
        // quedan como están: son la parte que identifica al modelo.
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
