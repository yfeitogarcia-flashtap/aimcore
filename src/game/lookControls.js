/**
 * Rotación de cámara a partir del movimiento crudo del ratón (Pointer Lock).
 *
 * No hay suavizado ni aceleración: 1 count del ratón = un ángulo fijo, que es
 * lo que espera cualquiera que venga de un FPS. La sensibilidad usa la
 * convención de 0.022°/count, así que es comparable con la de otros juegos.
 */

import * as THREE from 'three'
import { LOOK } from '../config.js'

const DEG_TO_RAD = Math.PI / 180

export class LookControls {
  /**
   * @param {THREE.PerspectiveCamera} camera
   */
  constructor(camera) {
    this.camera = camera
    this.camera.rotation.order = 'YXZ'
    this.yaw = 0
    this.pitch = 0
    this.enabled = false
    this.radiansPerCount = LOOK.sensitivity * LOOK.degreesPerCount * DEG_TO_RAD
    this.pitchLimit = LOOK.pitchLimitDeg * DEG_TO_RAD
    this._onMouseMove = this._onMouseMove.bind(this)
  }

  connect(target = document) {
    target.addEventListener('mousemove', this._onMouseMove)
    this._target = target
  }

  disconnect() {
    if (this._target) this._target.removeEventListener('mousemove', this._onMouseMove)
    this._target = null
  }

  /** Vuelve a mirar al frente. */
  reset() {
    this.yaw = 0
    this.pitch = 0
    this._apply()
  }

  /** Cambia la sensibilidad en caliente (lo usará el menú de opciones). */
  setSensitivity(sensitivity) {
    this.radiansPerCount = sensitivity * LOOK.degreesPerCount * DEG_TO_RAD
  }

  _onMouseMove(event) {
    if (!this.enabled) return
    // movementX/Y llega en counts crudos: sin aceleración del sistema.
    this.yaw -= event.movementX * this.radiansPerCount
    this.pitch -= event.movementY * this.radiansPerCount
    if (this.pitch > this.pitchLimit) this.pitch = this.pitchLimit
    else if (this.pitch < -this.pitchLimit) this.pitch = -this.pitchLimit
    this._apply()
  }

  _apply() {
    this.camera.rotation.set(this.pitch, this.yaw, 0)
  }
}
