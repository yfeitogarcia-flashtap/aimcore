/**
 * Movimiento del jugador: desplazamiento horizontal, salto y agachado.
 *
 * Cinemática básica, sin motor de físicas: una velocidad horizontal constante
 * y una única integración de la gravedad para el salto. El suelo es y = 0 y no
 * hay más colisiones que el acotado al radio de movimiento.
 *
 * La posición vertical se modela en dos piezas independientes:
 *  - `feetY`, la altura de los pies sobre el suelo, que sólo cambia al saltar.
 *  - `eyeHeight`, la altura de los ojos sobre los pies, que sólo cambia al
 *    agacharse.
 * La cámara es la suma de las dos, así que agacharse en el aire (o saltar
 * agachado) sale gratis y sin casos especiales.
 *
 * Todo esto es inerte si `MOVEMENT.enabled` es false: la cámara se queda
 * clavada en el centro a la altura de pie, que es la línea base de puntería.
 */

import * as THREE from 'three'
import { MOVEMENT } from '../config.js'

// Vectores de módulo: el bucle no aloca nada.
const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()

/** Invierte MOVEMENT.keys a un mapa código de tecla -> acción. */
function buildKeyMap(keys) {
  const map = new Map()
  for (const action of Object.keys(keys)) {
    for (const code of keys[action]) map.set(code, action)
  }
  return map
}

export class MovementController {
  /**
   * @param {THREE.PerspectiveCamera} camera
   */
  constructor(camera) {
    this.camera = camera
    this.enabled = false

    this.keyMap = buildKeyMap(MOVEMENT.keys)
    this.keys = { forward: false, back: false, left: false, right: false, jump: false, crouch: false }

    /** Altura de los pies sobre el suelo. Sólo el salto la mueve. */
    this.feetY = 0
    this.verticalVelocity = 0
    this.airborne = false
    /** Altura de los ojos sobre los pies. Sólo el agachado la mueve. */
    this.eyeHeight = MOVEMENT.standHeight

    this._onKeyDown = this._onKeyDown.bind(this)
    this._onKeyUp = this._onKeyUp.bind(this)
    this._onBlur = this.releaseKeys.bind(this)
  }

  connect(target = window) {
    if (!MOVEMENT.enabled) return
    target.addEventListener('keydown', this._onKeyDown)
    target.addEventListener('keyup', this._onKeyUp)
    // Alt-tab con una tecla pulsada dejaría al jugador andando solo.
    target.addEventListener('blur', this._onBlur)
    this._target = target
  }

  disconnect() {
    if (!this._target) return
    this._target.removeEventListener('keydown', this._onKeyDown)
    this._target.removeEventListener('keyup', this._onKeyUp)
    this._target.removeEventListener('blur', this._onBlur)
    this._target = null
  }

  /**
   * Los controles sólo responden durante una sesión en curso. Al desactivar se
   * sueltan las teclas, para que una pausa con W pulsada no arranque andando.
   */
  setEnabled(value) {
    this.enabled = value && MOVEMENT.enabled
    if (!this.enabled) this.releaseKeys()
  }

  releaseKeys() {
    const keys = this.keys
    keys.forward = false
    keys.back = false
    keys.left = false
    keys.right = false
    keys.jump = false
    keys.crouch = false
  }

  /** Devuelve al jugador al centro, de pie y en el suelo. */
  reset() {
    this.releaseKeys()
    this.feetY = 0
    this.verticalVelocity = 0
    this.airborne = false
    this.eyeHeight = MOVEMENT.standHeight
    this.camera.position.set(0, MOVEMENT.standHeight, 0)
  }

  /** @param {number} dt segundos transcurridos desde el frame anterior */
  update(dt) {
    if (!this.enabled) return
    this._updateHorizontal(dt)
    this._updateVertical(dt)
    this.camera.position.y = this.feetY + this.eyeHeight
  }

  _updateHorizontal(dt) {
    const keys = this.keys
    const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
    const z = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0)
    if (x === 0 && z === 0) return

    // Base en el plano XZ a partir del yaw: el cabeceo no interviene, así que
    // mirar al suelo o al cielo no cambia hacia dónde se anda.
    const yaw = this.camera.rotation.y
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    _forward.set(-sin, 0, -cos)
    _right.set(cos, 0, -sin)

    // Normalizar el input evita que la diagonal sea más rápida que un eje.
    const inverse = 1 / Math.hypot(x, z)
    const step = (keys.crouch ? MOVEMENT.crouchSpeed : MOVEMENT.speed) * dt * inverse

    const position = this.camera.position
    position.x += (_forward.x * z + _right.x * x) * step
    position.z += (_forward.z * z + _right.z * x) * step

    // Acotado al radio, cada frame.
    const distanceSq = position.x * position.x + position.z * position.z
    const radius = MOVEMENT.radius
    if (distanceSq > radius * radius) {
      const scale = radius / Math.sqrt(distanceSq)
      position.x *= scale
      position.z *= scale
    }
  }

  _updateVertical(dt) {
    // Agachado: la altura de ojos persigue su objetivo a velocidad constante.
    const targetEye = this.keys.crouch ? MOVEMENT.crouchHeight : MOVEMENT.standHeight
    const step = MOVEMENT.crouchTransitionSpeed * dt
    if (this.eyeHeight < targetEye) this.eyeHeight = Math.min(targetEye, this.eyeHeight + step)
    else if (this.eyeHeight > targetEye) this.eyeHeight = Math.max(targetEye, this.eyeHeight - step)

    // Salto: sólo desde el suelo, así que no hay doble salto posible.
    if (this.keys.jump && !this.airborne) {
      this.verticalVelocity = MOVEMENT.jumpSpeed
      this.airborne = true
    }
    if (!this.airborne) return

    this.verticalVelocity -= MOVEMENT.gravity * dt
    this.feetY += this.verticalVelocity * dt
    if (this.feetY <= 0) {
      this.feetY = 0
      this.verticalVelocity = 0
      this.airborne = false
    }
  }

  _onKeyDown(event) {
    if (!this.enabled || event.repeat) return
    const action = this.keyMap.get(event.code)
    if (!action) return
    // Corta el scroll con espacio y flechas. No alcanza a Ctrl+W: ese atajo se
    // lo queda Chrome (ver el comentario de MOVEMENT.keys en config.js).
    event.preventDefault()
    this.keys[action] = true
  }

  _onKeyUp(event) {
    const action = this.keyMap.get(event.code)
    if (!action) return
    // El keyup se atiende siempre, incluso con los controles ya desactivados:
    // si no, una tecla soltada durante la pausa se quedaría marcada.
    this.keys[action] = false
  }
}
