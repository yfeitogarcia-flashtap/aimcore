/**
 * Movimiento del jugador: desplazamiento horizontal, salto y agachado.
 *
 * Cinemática básica, sin motor de físicas: una velocidad horizontal constante
 * y una única integración de la gravedad para el salto. El suelo es y = 0 en la
 * sala vacía; con un escenario montado lo marca su geometría, y el jugador
 * choca contra las cajas resolviendo **un eje cada vez**, que es lo que hace
 * que rozar un muro deslice en lugar de frenar en seco.
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
import { COVER, LANDING, MOVEMENT, ROOM } from '../config.js'

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
    this.keys = {
      forward: false,
      back: false,
      left: false,
      right: false,
      jump: false,
      walk: false,
      crouch: false,
    }

    /** Altura de los pies sobre el suelo. Sólo el salto la mueve. */
    this.feetY = 0
    this.verticalVelocity = 0
    this.airborne = false
    /** Altura de los ojos sobre los pies. Sólo el agachado la mueve. */
    this.eyeHeight = MOVEMENT.standHeight
    /** Marcha congelada mientras se está en el aire. Ver `currentSpeed`. */
    this._airSpeed = MOVEMENT.speed

    /** Escenario contra el que se colisiona. Null = sala vacía, suelo en y = 0. */
    this.scenario = null
    /** Dónde aparece el jugador. Lo fija el escenario. */
    this.spawnX = 0
    this.spawnZ = 0

    /**
     * Hundimiento de cámara al aterrizar. Puramente sensorial: no toca la
     * física, sólo resta unos centímetros a la altura de los ojos y los
     * devuelve en `LANDING.dipMs`.
     */
    this.landingDip = 0
    this._dipFrom = 0
    this._dipElapsedMs = 0
    /**
     * Fuerza del último aterrizaje, 0..1, para que el motor le ponga sonido.
     * Lo lee y lo consume `takeLandingImpact()`.
     */
    this._landingImpact = 0

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
    keys.walk = false
    keys.crouch = false
  }

  /**
   * Velocidad horizontal vigente. Se queda con la **más lenta** de las marchas
   * pedidas, así que mantener SHIFT y CTRL a la vez da agachado — y seguiría
   * siendo así aunque un día se retoquen las constantes.
   */
  get currentSpeed() {
    // En el aire la marcha se queda como estaba al despegar. Sin esto,
    // agacharse a media trayectoria bajaba la velocidad de 6.5 a 2.6 de golpe
    // —el vuelo dura lo mismo pero recorres la mitad—, y eso se siente
    // exactamente como quedarse flotando a cámara lenta.
    if (this.airborne) return this._airSpeed
    let speed = MOVEMENT.speed
    if (this.keys.walk && MOVEMENT.walkSpeed < speed) speed = MOVEMENT.walkSpeed
    if (this.keys.crouch && MOVEMENT.crouchSpeed < speed) speed = MOVEMENT.crouchSpeed
    return speed
  }

  /**
   * Velocidad a la que se está desplazando el jugador ahora mismo: cero si no
   * pulsa nada o si los controles están apagados. El movimiento no tiene
   * aceleración, así que se deduce del estado de las teclas sin necesidad de
   * guardar la velocidad frame a frame.
   */
  get horizontalSpeed() {
    if (!this.enabled) return 0
    const keys = this.keys
    const moving = keys.forward || keys.back || keys.left || keys.right
    return moving ? this.currentSpeed : 0
  }

  /**
   * Monta (o quita) el escenario contra el que se colisiona y adopta su punto
   * de aparición.
   */
  setScenario(scenario) {
    this.scenario = scenario && scenario.hasGeometry ? scenario : null
    const spawn = scenario ? scenario.spawn : null
    this.spawnX = spawn ? spawn.x : 0
    this.spawnZ = spawn ? spawn.z : 0
  }

  /** Devuelve al jugador a su punto de aparición, de pie y en el suelo. */
  reset() {
    this.releaseKeys()
    this.feetY = this.scenario
      ? this.scenario.groundHeightAt(this.spawnX, this.spawnZ, 0)
      : 0
    this.verticalVelocity = 0
    this.airborne = false
    this.eyeHeight = MOVEMENT.standHeight
    this.landingDip = 0
    this._dipFrom = 0
    this._dipElapsedMs = 0
    this._landingImpact = 0
    this.camera.position.set(this.spawnX, this.feetY + MOVEMENT.standHeight, this.spawnZ)
  }

  /**
   * Devuelve la fuerza del último aterrizaje (0..1) y la consume. Cero si no ha
   * habido ninguno desde la última llamada. El sonido lo pone el motor: aquí no
   * se toca audio.
   */
  takeLandingImpact() {
    const impact = this._landingImpact
    this._landingImpact = 0
    return impact
  }

  /** @param {number} dt segundos transcurridos desde el frame anterior */
  update(dt) {
    if (!this.enabled) return
    this._updateHorizontal(dt)
    this._updateVertical(dt)
    this._updateLandingDip(dt)
    this.camera.position.y = this.feetY + this.eyeHeight - this.landingDip
  }

  /**
   * El hundimiento entra de golpe en el instante del impacto y se recupera con
   * una salida suave. Al revés —entrar suave— se sentiría como un ascensor.
   */
  _updateLandingDip(dt) {
    if (this.landingDip === 0) return
    this._dipElapsedMs += dt * 1000
    const t = this._dipElapsedMs / LANDING.dipMs
    if (t >= 1) {
      this.landingDip = 0
      return
    }
    const eased = 1 - (1 - t) * (1 - t)
    this.landingDip = this._dipFrom * (1 - eased)
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
    const step = this.currentSpeed * dt * inverse

    const position = this.camera.position
    const wantedX = position.x + (_forward.x * z + _right.x * x) * step
    const wantedZ = position.z + (_forward.z * z + _right.z * x) * step

    if (this.scenario) {
      // Un eje cada vez: X contra la Z vieja, y luego Z contra la X ya
      // corregida. Resolver los dos a la vez dejaría al jugador clavado en
      // cuanto rozara una esquina.
      const headY = this.feetY + this.eyeHeight
      const fromX = position.x
      const fromZ = position.z
      position.x = this.scenario.resolveAxis('x', fromX, wantedX, fromZ, this.feetY, headY)
      position.z = this.scenario.resolveAxis('z', fromZ, wantedZ, position.x, this.feetY, headY)
    } else {
      position.x = wantedX
      position.z = wantedZ
    }

    // Acotado a las paredes de la sala, cada frame. El único límite es el
    // real: se recorre entera menos el margen que se deja junto al muro.
    const limitX = ROOM.width / 2 - MOVEMENT.wallMargin
    const limitZ = ROOM.depth / 2 - MOVEMENT.wallMargin
    if (position.x > limitX) position.x = limitX
    else if (position.x < -limitX) position.x = -limitX
    if (position.z > limitZ) position.z = limitZ
    else if (position.z < -limitZ) position.z = -limitZ
  }

  _updateVertical(dt) {
    // Agachado: la altura de ojos persigue su objetivo a velocidad constante.
    const targetEye = this.keys.crouch ? MOVEMENT.crouchHeight : MOVEMENT.standHeight
    const step = MOVEMENT.crouchTransitionSpeed * dt
    if (this.eyeHeight < targetEye) this.eyeHeight = Math.min(targetEye, this.eyeHeight + step)
    else if (this.eyeHeight > targetEye) this.eyeHeight = Math.max(targetEye, this.eyeHeight - step)

    const position = this.camera.position
    const ground = this.scenario
      ? this.scenario.groundHeightAt(position.x, position.z, this.feetY)
      : 0

    // Salto: sólo desde el suelo, así que no hay doble salto posible.
    if (this.keys.jump && !this.airborne) {
      this._airSpeed = this.currentSpeed
      this.verticalVelocity = MOVEMENT.jumpSpeed
      this.airborne = true
    }

    if (!this.airborne) {
      // Sin salto de por medio el jugador sigue al suelo: subir una rampa es
      // pegarse a ella, y salirse de una plataforma es empezar a caer.
      if (ground >= this.feetY - 1e-6) {
        this.feetY = ground
        return
      }
      // Se ha salido de un borde andando: conserva la marcha que llevaba.
      this._airSpeed = this.currentSpeed
      this.airborne = true
      this.verticalVelocity = 0
    }

    this.verticalVelocity -= MOVEMENT.gravity * dt
    this.feetY += this.verticalVelocity * dt
    if (this.feetY <= ground) {
      this._land(ground)
    }
  }

  /**
   * Toma de tierra. Guarda la fuerza del impacto para el sonido y arranca el
   * hundimiento de cámara. Una caída suave —bajarse de un bordillo— no dispara
   * ninguna de las dos cosas.
   */
  _land(ground) {
    const fallSpeed = -this.verticalVelocity
    this.feetY = ground
    this.verticalVelocity = 0
    this.airborne = false

    if (fallSpeed <= LANDING.minSpeed) return
    const span = LANDING.fullSpeed - LANDING.minSpeed
    let strength = span > 0 ? (fallSpeed - LANDING.minSpeed) / span : 1
    if (strength > 1) strength = 1

    this._landingImpact = strength
    this._dipFrom = LANDING.dipUnits * strength
    this.landingDip = this._dipFrom
    this._dipElapsedMs = 0
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
