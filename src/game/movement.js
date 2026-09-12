/**
 * Movimiento del jugador: desplazamiento horizontal, salto y agachado.
 *
 * Cinemática básica, sin motor de físicas: una velocidad horizontal constante
 * y un salto **resuelto en forma cerrada**. El suelo es y = 0 en la sala vacía;
 * con un escenario montado lo marca su geometría, y el jugador choca contra las
 * cajas resolviendo **un eje cada vez**, que es lo que hace que rozar un muro
 * deslice en lugar de frenar en seco.
 *
 * El salto **no se integra frame a frame**. Se guarda el instante y el estado
 * del despegue y cada frame se evalúa la parábola directamente:
 *
 *     y(t) = y0 + v0·t - ½·g·t²
 *     v(t) = v0 - g·t
 *
 * Integrar por pasos —restar la gravedad y mover, como hacía antes— acumula el
 * error del método de Euler, y ese error depende del tamaño del paso: el mismo
 * salto subía 1.21 u a 60 Hz y 1.25 a 240 Hz, un 3.3% de diferencia según el
 * monitor. Con la forma cerrada el único residuo es **dónde caen las muestras**,
 * no la trayectoria, y eso está acotado por ½·g·(dt/2)² — 0.6 mm a 60 Hz.
 *
 * La posición vertical se modela en dos piezas independientes:
 *  - `feetY`, la altura de los pies sobre el suelo, que sólo cambia al saltar.
 *  - `eyeHeight`, la altura de los ojos sobre los pies, que sólo cambia al
 *    agacharse.
 * La cámara es la suma de las dos, así que agacharse en el aire (o saltar
 * agachado) sale gratis y sin casos especiales.
 *
 * Sobre esa forma cerrada se apoya el **salto encadenado**: como la parábola es
 * exacta, el instante en que los pies tocan el suelo también lo es —sale de
 * resolver y(t) = suelo, no del frame que lo detecta—, y la ventana de
 * encadenado se puede medir en milisegundos reales contra ese instante.
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

    // Estado del despegue: con esto y el tiempo de vuelo sale toda la parábola.
    this._airTime = 0
    this._launchY = 0
    this._launchVelocity = 0

    /**
     * Salto encadenado. Tres marcas, las tres en milisegundos reales:
     *  - `_jumpPressedAt`: cuándo se pulsó SPACE, tomado del propio evento de
     *    teclado y no del frame que lo atiende.
     *  - `_landedAt`: el instante **exacto** del último aterrizaje, despejado de
     *    la parábola (ver `_land`).
     *  - `_landingSpeed`: la marcha horizontal que se traía al tocar el suelo,
     *    que es lo único que conserva un encadenado.
     * Ambos arrancan en -Infinity para que el primer salto de una sesión nunca
     * pueda salir encadenado por accidente.
     */
    this._jumpPressedAt = -Infinity
    this._landedAt = -Infinity
    this._landingSpeed = MOVEMENT.speed
    /** ¿El vuelo en curso salió de un encadenado? Sólo informativo. */
    this.chainedJump = false

    /** Sala vigente. La marca el escenario; la vacía usa la de siempre. */
    this.room = ROOM

    /**
     * Último estado sano conocido, para la red de seguridad de `_guardState`.
     * Son escalares sueltos a propósito: el bucle caliente no aloca.
     */
    this._safeX = 0
    this._safeZ = 0
    this._safeFeetY = 0
    /** Cuántas veces ha hecho falta la red. En juego normal, cero. */
    this.recoveries = 0

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
   * pedidas, así que mantener SHIFT y C a la vez da agachado — y seguiría
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
    // La sala la trae el escenario aunque no tenga geometría: el límite de
    // movimiento tiene que ser el mismo que el de las paredes que se dibujan.
    this.room = scenario ? scenario.room : ROOM
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
    this._airTime = 0
    this._launchY = this.feetY
    this._launchVelocity = 0
    this._jumpPressedAt = -Infinity
    this._landedAt = -Infinity
    this._landingSpeed = MOVEMENT.speed
    this.chainedJump = false
    this._safeX = this.spawnX
    this._safeZ = this.spawnZ
    this._safeFeetY = this.feetY
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

  /**
   * @param {number} dt segundos transcurridos desde el frame anterior
   * @param {number} [now] instante real del frame, en ms. Sólo lo usa la
   *   ventana del salto encadenado, que se mide contra el reloj del teclado.
   */
  update(dt, now = performance.now()) {
    if (!this.enabled) return
    this._updateHorizontal(dt)
    this._updateVertical(dt, now)
    this._updateLandingDip(dt)
    this.camera.position.y = this.feetY + this.eyeHeight - this.landingDip
    this._guardState()
  }

  /**
   * Red de seguridad: ningún frame sale de aquí con el jugador en un valor que
   * no sea un número finito.
   *
   * No tapa un bug conocido —medio millón de frames de alternancia rápida de
   * salto y agachado con deltas de 0 a 100 ms no han producido ni uno—, y
   * precisamente por eso está: si algún día una cuenta nueva mete un NaN, lo que
   * no puede pasar es que se propague al render. Una posición NaN viaja a la
   * matriz de la cámara, de ahí al `matrix3d` que el CSS3DRenderer escribe en el
   * tablero, y de ahí al compositor del navegador, que es el único sitio de toda
   * la cadena donde un número roto se puede llevar por delante la pestaña entera.
   *
   * Se vuelve al último estado sano, que se guarda cada frame que lo es. El
   * contador `recoveries` queda expuesto a propósito: en juego normal tiene que
   * valer siempre cero, y las auditorías lo comprueban.
   */
  _guardState() {
    const position = this.camera.position
    const sano =
      Number.isFinite(position.x) &&
      Number.isFinite(position.y) &&
      Number.isFinite(position.z) &&
      Number.isFinite(this.feetY) &&
      Number.isFinite(this.verticalVelocity) &&
      Number.isFinite(this.eyeHeight) &&
      Number.isFinite(this.landingDip) &&
      Number.isFinite(this._airTime) &&
      Number.isFinite(this._launchY) &&
      Number.isFinite(this._launchVelocity) &&
      Number.isFinite(this._airSpeed)

    if (sano) {
      this._safeX = position.x
      this._safeZ = position.z
      this._safeFeetY = this.feetY
      return
    }

    this.recoveries += 1
    // Al suelo, quieto y de pie, donde se estaba la última vez que todo era un
    // número. El vuelo en curso se cancela entero: media parábola con un NaN
    // dentro no se puede continuar.
    this.feetY = Number.isFinite(this._safeFeetY) ? this._safeFeetY : 0
    this.verticalVelocity = 0
    this.airborne = false
    this._airTime = 0
    this._launchY = this.feetY
    this._launchVelocity = 0
    this._airSpeed = MOVEMENT.speed
    this._landingSpeed = MOVEMENT.speed
    this._landedAt = -Infinity
    this._jumpPressedAt = -Infinity
    this.eyeHeight = MOVEMENT.standHeight
    this.landingDip = 0
    this._dipFrom = 0
    this._dipElapsedMs = 0
    this._landingImpact = 0
    position.set(
      Number.isFinite(this._safeX) ? this._safeX : this.spawnX,
      this.feetY + this.eyeHeight,
      Number.isFinite(this._safeZ) ? this._safeZ : this.spawnZ,
    )
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
      //
      // La altura que se usa es la **más baja del frame**, no la de ahora. La
      // horizontal corre antes que la vertical, así que dar por bueno un paso
      // con los pies donde están y caer después es cómo se acababa dentro de un
      // cajón: la horizontal admitía pasar por encima de una pieza que la
      // vertical, un frame más abajo, ya no dejaba pisar. Los dos sistemas
      // tienen que admitir lo mismo, y manda el más restrictivo.
      const feetY = Math.min(this.feetY, this._feetYAfter(dt))
      const headY = feetY + this.eyeHeight
      const fromX = position.x
      const fromZ = position.z
      position.x = this.scenario.resolveAxis('x', fromX, wantedX, fromZ, feetY, headY)
      position.z = this.scenario.resolveAxis('z', fromZ, wantedZ, position.x, feetY, headY)
      // Cierre contra las cuñas: resolver por ejes valida cada uno con la
      // coordenada del otro a medias, y una diagonal contra el costado de una
      // rampa se colaba una fracción de paso por la esquina. Se intenta
      // conservar el deslizamiento —primero un eje, luego el otro— y sólo si
      // ninguno vale se queda donde estaba.
      if (this.scenario.rampBlocksMove(position.x, position.z, fromX, fromZ, feetY)) {
        if (!this.scenario.rampBlocksMove(position.x, fromZ, fromX, fromZ, feetY)) {
          position.z = fromZ
        } else if (!this.scenario.rampBlocksMove(fromX, position.z, fromX, fromZ, feetY)) {
          position.x = fromX
        } else {
          position.x = fromX
          position.z = fromZ
        }
      }
    } else {
      position.x = wantedX
      position.z = wantedZ
    }

    // Acotado a las paredes de la sala, cada frame. El único límite es el
    // real: se recorre entera menos el margen que se deja junto al muro.
    const limitX = this.room.width / 2 - MOVEMENT.wallMargin
    const limitZ = this.room.depth / 2 - MOVEMENT.wallMargin
    if (position.x > limitX) position.x = limitX
    else if (position.x < -limitX) position.x = -limitX
    if (position.z > limitZ) position.z = limitZ
    else if (position.z < -limitZ) position.z = -limitZ
  }

  /**
   * Dónde estarán los pies al final de este frame. Sale de la misma parábola
   * cerrada que usa `_updateVertical`, así que no es una estimación: es el valor
   * que `feetY` va a tomar dentro de un momento.
   */
  _feetYAfter(dt) {
    if (!this.airborne) return this.feetY
    const t = this._airTime + dt
    return this._launchY + this._launchVelocity * t - 0.5 * MOVEMENT.gravity * t * t
  }

  _updateVertical(dt, now) {
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
      this._takeOff(MOVEMENT.jumpSpeed, this._isChainPress())
      // La pulsación se gasta al despegar: mantener SPACE sigue rebotando en
      // cada aterrizaje, como siempre, pero esos rebotes son saltos normales.
      // Encadenar es acertar el tiempo, no dejar la tecla apoyada.
      this._jumpPressedAt = -Infinity
    }

    if (!this.airborne) {
      // Sin salto de por medio el jugador sigue al suelo: subir una rampa es
      // pegarse a ella, y salirse de una plataforma es empezar a caer.
      if (ground >= this.feetY - 1e-6) {
        this.feetY = ground
        return
      }
      // Se ha salido de un borde andando: cae desde parado.
      this._takeOff(0)
    }

    const g = MOVEMENT.gravity
    this._airTime += dt
    const t = this._airTime
    this.feetY = this._launchY + this._launchVelocity * t - 0.5 * g * t * t
    this.verticalVelocity = this._launchVelocity - g * t

    // Sólo se aterriza bajando. Subiendo, el suelo sólo puede estar por encima
    // si el jugador acaba de pasar sobre un bordillo, y eso no es un impacto.
    if (this.feetY <= ground && this.verticalVelocity <= 0) this._land(ground, now)
  }

  /**
   * ¿La pulsación de SPACE pendiente cae dentro de la ventana de encadenado?
   *
   * Se compara **pulsación contra aterrizaje**, las dos en tiempo real: la
   * primera sale del evento de teclado y la segunda de la parábola. Ni una ni
   * otra dependen de cuándo dibuje el monitor, así que la ventana mide lo mismo
   * a 60 que a 240 Hz. La tolerancia vale a los dos lados —pulsar un pelo antes
   * de tocar el suelo cuenta igual que un pelo después—, que es lo que hace que
   * el encadenado se sienta como un ritmo y no como un reflejo.
   */
  _isChainPress() {
    if (!Number.isFinite(this._jumpPressedAt) || !Number.isFinite(this._landedAt)) return false
    return Math.abs(this._jumpPressedAt - this._landedAt) <= MOVEMENT.chainJumpWindowMs
  }

  /**
   * Arranca un vuelo: congela la marcha y anota desde dónde y con qué velocidad
   * se despega. A partir de aquí la trayectoria ya no depende de cuántas veces
   * se evalúe ni cada cuánto.
   *
   * En un **encadenado** la única diferencia es de dónde sale la marcha: en
   * lugar de recalcularla desde el suelo se conserva la que se traía al
   * aterrizar. Nada más — ni empuje vertical extra, ni multiplicador, ni
   * ganancia por encadenar otra vez. Y como `_airSpeed` sólo puede nacer de
   * `currentSpeed`, que nunca pasa de `MOVEMENT.speed`, por inducción ninguna
   * cadena puede superar la marcha de carrera: conservar no es acelerar.
   *
   * @param {number} velocity velocidad vertical inicial (0 al salirse de un borde)
   * @param {boolean} [chained] si el salto encadena con el aterrizaje anterior
   */
  _takeOff(velocity, chained = false) {
    this._airSpeed = chained ? this._landingSpeed : this.currentSpeed
    this.chainedJump = chained
    this._airTime = 0
    this._launchY = this.feetY
    this._launchVelocity = velocity
    this.verticalVelocity = velocity
    this.airborne = true
  }

  /**
   * Toma de tierra. Guarda la fuerza del impacto para el sonido y arranca el
   * hundimiento de cámara. Una caída suave —bajarse de un bordillo— no dispara
   * ninguna de las dos cosas.
   *
   * La velocidad de impacto **no es la del frame en que se detecta el suelo**,
   * que llegaría pasado de largo y dependería del refresco. Sale de la
   * conservación de energía sobre la parábola —v² = v0² + 2·g·(y0 − suelo)—, así
   * que un mismo salto suena y hunde la cámara igual a 60 que a 240 Hz.
   */
  _land(ground, now) {
    const g = MOVEMENT.gravity
    const drop = this._launchY - ground
    const impactSq = this._launchVelocity * this._launchVelocity + 2 * g * drop
    const fallSpeed = impactSq > 0 ? Math.sqrt(impactSq) : 0

    // Instante exacto del contacto, por el mismo motivo que la velocidad de
    // impacto: el frame que lo detecta llega pasado de largo y llega más tarde
    // cuanto menos refresco haya. De la parábola, tocar el suelo es
    //     ½·g·t² − v0·t + (suelo − y0) = 0  →  t = (v0 + fallSpeed) / g
    // y lo que sobra respecto al tiempo de vuelo acumulado es el retraso del
    // frame, que se descuenta del reloj. Sin esto, la ventana de encadenado
    // sería un frame más generosa a 240 Hz que a 60.
    this._landedAt = now - (this._airTime - (this._launchVelocity + fallSpeed) / g) * 1000
    this._landingSpeed = this._airSpeed

    this.feetY = ground
    this.verticalVelocity = 0
    this.airborne = false
    this.chainedJump = false
    this._airTime = 0
    this._launchY = ground
    this._launchVelocity = 0

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
    // La marca del salto sale del **evento**, no del frame que lo atiende:
    // `timeStamp` va en el mismo origen de tiempos que `performance.now()`, así
    // que la ventana de encadenado no hereda el retraso del bucle de dibujo.
    if (action === 'jump') {
      this._jumpPressedAt =
        Number.isFinite(event.timeStamp) && event.timeStamp > 0
          ? event.timeStamp
          : performance.now()
    }
  }

  _onKeyUp(event) {
    const action = this.keyMap.get(event.code)
    if (!action) return
    // El keyup se atiende siempre, incluso con los controles ya desactivados:
    // si no, una tecla soltada durante la pausa se quedaría marcada.
    this.keys[action] = false
  }
}
