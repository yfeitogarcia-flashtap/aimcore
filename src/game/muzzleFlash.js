/**
 * **El fogonazo de un disparo enemigo.**
 *
 * Una estrella encarada a la cámara, del tamaño de un puño, encendida en la
 * boca del arma durante unas decenas de milisegundos. Es la tercera señal de «te
 * están disparando» y la única que no necesita ni oído ni HUD: **se ve dónde
 * está el que dispara**, aunque el muñeco sea una silueta naranja entre cajas.
 *
 * **No es una luz.** En esta escena no hay ninguna —ni ambiente, ni direccional,
 * ni sombras— así que un fogonazo no puede iluminar nada. Lo que hay es un
 * `MeshBasicMaterial` con mezcla aditiva, que es el mismo truco de «esto emite»
 * que ya usan el pop de la diana acertada y el marcador del explosivo.
 *
 * **Y no hay arma visible en ninguna parte**, aquí tampoco: el fogonazo sale de
 * la altura del pecho porque es de ahí de donde sale el disparo
 * (`ENEMY.muzzleHeightFactor`), no porque haya un cañón dibujado.
 *
 * Lo que cuesta: una geometría y un material para todo el pool, una estrella por
 * ranura y, por frame, recorrer las que estén encendidas —como mucho una por
 * muñeco— para apagarlas. Cero alocaciones.
 *
 * No decide nada: `enemyFire.js` avisa de que ha salido un tiro y de dónde, y
 * esto lo dibuja. La misma regla que los marcadores.
 */

import * as THREE from 'three'
import { COLORS, FEEDBACK, TARGET_TYPES } from '../config.js'

/** Altura del muñeco en unidades de su radio, igual que en los marcadores. */
const DUMMY_HEIGHT = TARGET_TYPES.hitbox.parts.reduce(
  (top, part) => Math.max(top, part.offsetY + (part.height ?? part.radius * 2) / 2),
  0,
)

/**
 * **La forma del destello: una estrella de cuatro puntas**, no un cuadrado.
 *
 * Cuesta lo mismo —nueve vértices y ocho triángulos, una sola vez para todo el
 * pool— y la diferencia es toda: un cuadrado blanco pegado al pecho se lee como
 * una tarjeta, y una estrella se lee como algo que se enciende. Sin luces en la
 * escena, la silueta es lo único que dice qué es una cosa; es la misma razón por
 * la que el casco del suelo lleva visera.
 */
function flashGeometry(width) {
  const long = width / 2
  const short = long * 0.36
  const positions = [0, 0, 0]
  const index = []
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const r = i % 2 === 0 ? long : short
    positions.push(Math.cos(angle) * r, Math.sin(angle) * r, 0)
    index.push(0, i + 1, ((i + 1) % 8) + 1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  return geometry
}

export class MuzzleFlash {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene
    /** @type {Array<{mesh: THREE.Mesh, until: number}>} */
    this.slots = []
    this._next = 0
    this._geometry = null
    this._material = null
  }

  /**
   * Reconstruye el pool. Se llama cuando cambia el número de ranuras o el
   * tamaño de los muñecos, no por frame ni por sesión.
   *
   * @param {number} count ranuras del pool de dianas
   * @param {number} radius radio con el que están dibujados los muñecos
   */
  build(count, radius) {
    this.dispose()
    this._geometry = flashGeometry(FEEDBACK.muzzleFlashSize * DUMMY_HEIGHT * radius)
    // Aditivo y sin escribir profundidad: un destello tapado a medias por una
    // caja se vería como un recorte, y lo que hace es encenderse, no ocupar.
    this._material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLORS.muzzleFlash),
      transparent: true,
      opacity: FEEDBACK.muzzleFlashOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this._geometry, this._material)
      mesh.visible = false
      mesh.renderOrder = 2
      this.scene.add(mesh)
      this.slots.push({ mesh, until: 0 })
    }
  }

  /**
   * Enciende un fogonazo en un punto del mundo.
   *
   * Las ranuras se reparten en anillo y no por muñeco: con ocho disparando a la
   * vez y 55 ms de destello contra los 100 ms que separa dos tiros del arma más
   * rápida, nunca hacen falta más de las que hay, y si alguna vez faltasen lo
   * que se pierde es el más viejo, que ya se estaba apagando.
   */
  flash(x, y, z, now) {
    if (this.slots.length === 0) return
    const slot = this.slots[this._next]
    this._next = (this._next + 1) % this.slots.length
    slot.mesh.position.set(x, y, z)
    slot.mesh.visible = true
    slot.until = now + FEEDBACK.muzzleFlashMs
  }

  /**
   * Apaga los que ya han cumplido y encara a la cámara los que siguen vivos.
   *
   * El billboard es una copia de cuaternión, como los iconos de estado: un
   * destello no tiene orientación propia que decir, así que mirar a la cámara es
   * lo único que tiene sentido.
   */
  update(now, camera) {
    for (const slot of this.slots) {
      if (!slot.mesh.visible) continue
      if (now >= slot.until) {
        slot.mesh.visible = false
        continue
      }
      slot.mesh.quaternion.copy(camera.quaternion)
    }
  }

  /** Apaga todo sin destruir el pool: al acabar una sesión, o al morir. */
  clear() {
    for (const slot of this.slots) {
      slot.mesh.visible = false
      slot.until = 0
    }
  }

  dispose() {
    for (const slot of this.slots) this.scene.remove(slot.mesh)
    this.slots.length = 0
    this._next = 0
    this._geometry?.dispose()
    this._material?.dispose()
    this._geometry = null
    this._material = null
  }
}
