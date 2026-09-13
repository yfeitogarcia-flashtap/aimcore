/**
 * **El avatar del jugador: el mismo cuerpo que una diana, con otro color.**
 *
 * Hasta la vuelta 37 esto era un humanoide de cuarenta y dos piezas —brazos que
 * se afinaban, hombreras de varias facetas, dedos, botas de cuatro piezas y
 * cuatro líneas de luz metidas en su canal—. Se tiró entero y a propósito; el
 * porqué está en `docs/decisions.md` §38. En dos frases: un modelo con
 * extremidades **promete** información que no da —no hay esqueleto ni animación,
 * así que los brazos no apuntan a ningún sitio— y la forma no puede ser lo que
 * distinga a un rival, porque un cuerpo se ve distinto desde cada ángulo. Lo que
 * distingue a un rival es **el color**, que se ve igual desde todos.
 *
 * Así que la forma es **una sola y vive en `body.js`**, la construyen igual las
 * dianas de entrenamiento y esto, y lo único que cambia entre una cosa y otra es
 * el color: naranja para una diana, el de su equipo para un jugador.
 *
 * Sigue sin tener lógica de juego —ni vida, ni impactos, ni colisión— y sigue
 * sin **arma visible**, ni aquí ni en primera persona: lo que se dibuja de un
 * arma es su silueta en el HUD y su ficha flotante, no un modelo en la mano.
 */

import * as THREE from 'three'
import { AVATAR, MOVEMENT, TARGET_TYPES, TEAMS } from '../config.js'
import { bodySection, zoneColors } from './body.js'

/** Las medidas de las tres zonas, tal como las declara el hitbox. */
const ZONES = {}
for (const part of TARGET_TYPES.hitbox.parts) ZONES[part.zone] = part

/** Altura total en unidades de radio: de los pies a la coronilla. */
const BODY_TOP = ZONES.head.offsetY + ZONES.head.radius

/** La banda que ocupa una zona, en fracciones de la altura total. */
function band(part) {
  const half = (part.height ?? part.radius * 2) / 2
  return [(part.offsetY - half) / BODY_TOP, (part.offsetY + half) / BODY_TOP]
}

export class Avatar {
  /**
   * @param {number} scale el radio con el que se dibujan los muñecos, para que
   *   el avatar mida exactamente lo que mide una diana
   * @param {string} [color] color de equipo; por defecto, el primero del catálogo
   */
  constructor(scale = 0.45, color = TEAMS[Object.keys(TEAMS)[0]].color) {
    this.group = new THREE.Group()
    this.height = BODY_TOP * scale
    this.color = color

    /** Piezas por zona, para poder teñir o resaltar una zona entera. */
    this.zones = { head: [], torso: [], legs: [] }
    this._geometries = []
    this._materials = []

    for (const part of TARGET_TYPES.hitbox.parts) {
      const [from, to] = band(part)
      const geometry = bodySection(from, to, this.height)
      const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
      const mesh = new THREE.Mesh(geometry, material)
      // Cada banda sale centrada en sí misma, así que se coloca en su altura.
      mesh.position.y = ((from + to) / 2) * this.height
      // La zona a la que pertenece, para repintarla sin buscar.
      mesh.userData.zone = part.zone
      this.group.add(mesh)
      this.zones[part.zone].push(mesh)
      this._geometries.push(geometry)
      this._materials.push(material)
    }

    this.setColor(color)
  }

  /**
   * Tiñe el cuerpo entero con el color de un equipo.
   *
   * Las tres zonas no quedan del mismo tono exacto: se les aplica **la misma
   * rampa que llevan las dianas** —cabeza aclarada, piernas × 0.72— para que un
   * avatar de equipo se lea por zonas igual que un muñeco. Es la rampa, no tres
   * colores nuevos: el color de equipo sigue siendo una sola variable.
   */
  setColor(color) {
    this.color = color
    const tones = zoneColors(color)
    for (const zone of Object.keys(this.zones)) {
      for (const mesh of this.zones[zone]) mesh.material.color.copy(tones[zone])
    }
  }

  /**
   * **Agacharse achata el cuerpo.** Sólo escala en Y, sin esqueleto y sin
   * animación: el factor sale de la altura de ojos que ya lleva el movimiento,
   * que es el mismo dato del que salen las zonas de disparo al agacharse. Una
   * escritura por frame.
   *
   * @param {number} eyeHeight altura de ojos vigente, en unidades de mundo
   */
  setEyeHeight(eyeHeight) {
    if (!AVATAR.crouchSquash) return
    const factor = eyeHeight / MOVEMENT.standHeight
    this.group.scale.y = Number.isFinite(factor) && factor > 0 ? factor : 1
  }

  dispose() {
    for (const geometry of this._geometries) geometry.dispose()
    for (const material of this._materials) material.dispose()
    this.group.parent?.remove(this.group)
  }
}
