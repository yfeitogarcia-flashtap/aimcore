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
 * **Dos modelos para el aire, tras el interruptor `MOVEMENT.airVector`**, y uno
 * de los dos acabará borrándose:
 *
 * - **Vector** (`true`): en el aire hay una velocidad horizontal de verdad,
 *   `_airVelX`/`_airVelZ`, que se siembra al despegar y se acelera con el
 *   `airAccelerate` clásico —proyectar la velocidad sobre la dirección pedida,
 *   acotar, sumar—. De ahí sale que soltar W conserve **hacia dónde ibas** y que
 *   el estrafe vaya girando la marcha en vez de saltar a lateral puro. Trae
 *   inercia de regalo: sin teclas se sigue volando.
 * - **Escalar** (`false`): lo de antes. Una marcha sin dirección
 *   (`_airSpeed`) y una dirección recalculada cada frame desde las teclas y el
 *   yaw. `_updateAirStrafe` sube esa marcha por ángulo girado.
 *
 * **El suelo es el mismo en los dos casos** y no se ha tocado: sin aceleración
 * ni fricción, la dirección sale de las teclas y la marcha de `currentSpeed`.
 *
 * El techo (`MOVEMENT.airStrafeMaxSpeed`) vale para los dos.
 *
 * Todo esto es inerte si `MOVEMENT.enabled` es false: la cámara se queda
 * clavada en el centro a la altura de pie, que es la línea base de puntería.
 */

import { COVER, LANDING, MOVEMENT, ROOM, weaponSpeedFactor } from '../config.js'
import { defaultKeybinds, keysOf } from '../keybinds.js'

const DEG_TO_RAD = Math.PI / 180
const TWO_PI = Math.PI * 2
/**
 * Holgura para decidir si un eje llegó a donde quería. `resolveAxis` devuelve
 * el destino **exacto** cuando no hay nada delante, así que cualquier diferencia
 * de verdad es mucho mayor que esto: el margen sólo evita comparar dos coma
 * flotante con `===`.
 */
const CLIP_EPSILON = 1e-9

/** Las siete acciones del movimiento, tal como se llaman en `KEYBINDS`. */
const MOVEMENT_ACTIONS = ['forward', 'back', 'left', 'right', 'jump', 'walk', 'crouch']

/**
 * Invierte los binds a un mapa código de tecla -> acción, con las alternativas
 * fijas incluidas. Sólo se queda con las acciones del movimiento: las de arma y
 * las de equipo las atiende el motor.
 */
function buildKeyMap(binds) {
  const map = new Map()
  for (const action of MOVEMENT_ACTIONS) {
    for (const code of keysOf(action, binds)) map.set(code, action)
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

    // Arranca con los de fábrica; el motor empuja los del jugador en cuanto
    // existe, igual que hace con los ajustes.
    this.keyMap = buildKeyMap(defaultKeybinds())
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
    /**
     * Marcha congelada mientras se está en el aire. Ver `currentSpeed`.
     *
     * Congelada salvo por una cosa: el **air-strafe** la sube mientras se
     * estrafea girando bien (ver `_updateAirStrafe`), siempre por debajo de
     * `MOVEMENT.airStrafeMaxSpeed`.
     */
/** Lo que frena el arma equipada. Ver `setWeaponWeight`. */
    this.loadFactor = 1
    this._airSpeed = this.topSpeed
    /**
     * Velocidad horizontal en el aire del **modelo vectorial**, en componentes
     * sueltas para no alocar. Nace al despegar, la mueve `_updateAirAccel` y la
     * recorta la colisión; en el suelo no existe.
     */
    this._airVelX = 0
    this._airVelZ = 0
    /** La que se traía al aterrizar, que es lo que conserva un encadenado. */
    this._landingVelX = 0
    this._landingVelZ = 0
    /** Dirección pedida por las teclas, unitaria. La escribe `_readWish`. */
    this._wishX = 0
    this._wishZ = 0
    /** ¿Frenó la pared de la sala este frame? Lo anota `_moveTo`. */
    this._wallClampedX = false
    this._wallClampedZ = false
    /** Yaw del frame anterior: de su diferencia sale el giro del air-strafe. */
    this._lastYaw = camera.rotation.y
    /**
     * ¿La maniobra de air-strafe está activa este frame? Informativo —dice que
     * se cumplen las condiciones, no que quede techo por ganar—. No lo lee
     * nadie del juego: está para poder medirlo.
     */
    this.airStrafing = false

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
    this._landingSpeed = this.topSpeed
    /** ¿El vuelo en curso salió de un encadenado? Sólo informativo. */
    this.chainedJump = false

    /**
     * **Fatiga de salto.** Dos marcas y nada más:
     *  - `_stillJumps`: saltos seguidos que acabaron sin velocidad horizontal.
     *  - `_flightMaxSpeed`: la marcha más alta del vuelo en curso. Es un
     *    **máximo**, no una integral, así que no depende de cuántos frames lo
     *    muestreen; y es velocidad y no desplazamiento a propósito, porque un
     *    bhop cerrado avanza poco en línea recta y va rápido.
     */
    this._stillJumps = 0
    this._flightMaxSpeed = 0

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

    /**
     * **Cuántas veces se ha teletransportado el jugador.** Sube en cada
     * `reset()`, que es el único sitio donde la posición salta sin recorrer el
     * camino. Quien interpole el dibujado mira esto para no dibujar el salto
     * como un barrido por medio mapa.
     */
    this.poseEpoch = 0

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

  /**
   * Adopta una asignación de teclas nueva. Se sueltan todas: una tecla que
   * estuviera pulsada con el mapa viejo no va a soltarse nunca con el nuevo, y
   * el jugador se quedaría andando solo.
   */
  setKeybinds(binds) {
    this.keyMap = buildKeyMap(binds)
    this.releaseKeys()
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
    if (this.airborne) {
      return MOVEMENT.airVector ? Math.hypot(this._airVelX, this._airVelZ) : this._airSpeed
    }
    let speed = MOVEMENT.speed
    if (this.keys.walk && MOVEMENT.walkSpeed < speed) speed = MOVEMENT.walkSpeed
    if (this.keys.crouch && MOVEMENT.crouchSpeed < speed) speed = MOVEMENT.crouchSpeed
    // El peso multiplica **las tres marchas**, no sólo la carrera: si sólo
    // frenase corriendo, andar con el rifle sería más rápido que correr con él
    // en cuanto el factor bajase de walkSpeed/speed.
    return speed * this.loadFactor
  }

  /**
   * **La carrera con lo que llevas encima.** Es el techo de la marcha de a pie y
   * de lo que se siembra al despegar, y sale de un solo sitio para que cambiar
   * de arma no deje un `MOVEMENT.speed` suelto por detrás.
   */
  get topSpeed() {
    return MOVEMENT.speed * this.loadFactor
  }

  /**
   * **Lo que pesa el arma equipada**, en kilos. El motor la llama cada vez que
   * cambia el arma vigente —cambiar de ranura, cambiar la principal en
   * opciones, equipar desde la armería—, nunca por frame.
   *
   * El factor sale de `weaponSpeedFactor`, que es también el que usa la armería
   * para decir cuánto frena: una sola cuenta para lo que se siente y para lo que
   * se enseña.
   *
   * **En el aire no cambia nada**, y es la regla de siempre: la marcha se
   * congela al despegar, así que cambiar de arma a media trayectoria no alarga
   * ni acorta el vuelo. Y el techo del air-strafe (`airStrafeMaxSpeed`) tampoco
   * se toca: el aire es técnica, y hacer que el rifle también la castigue sería
   * cobrar dos veces por lo mismo.
   */
  setWeaponWeight(weightKg) {
    this.loadFactor = weaponSpeedFactor(weightKg)
  }

  /**
   * Velocidad a la que se está desplazando el jugador ahora mismo: cero si no
   * pulsa nada o si los controles están apagados. El movimiento no tiene
   * aceleración, así que se deduce del estado de las teclas sin necesidad de
   * guardar la velocidad frame a frame.
   */
  get horizontalSpeed() {
    if (!this.enabled) return 0
    // Con vector, en el aire la marcha no depende de las teclas: hay inercia, y
    // soltarlas no te para. Preguntar por las teclas diría que está quieto
    // alguien que va cruzando la sala por el aire.
    if (this.airborne && MOVEMENT.airVector) return this.currentSpeed
    const keys = this.keys
    const moving = keys.forward || keys.back || keys.left || keys.right
    return moving ? this.currentSpeed : 0
  }

  /**
   * Dirección que piden las teclas, unitaria y en el plano XZ, en `_wishX` y
   * `_wishZ`. El cabeceo no interviene: mirar al suelo o al cielo no cambia
   * hacia dónde se anda. Normalizar evita que la diagonal corra más que un eje.
   *
   * Es **el único sitio** donde se convierte «qué teclas hay pulsadas» en una
   * dirección: la usan el paso por el suelo, la siembra del vector al despegar y
   * la aceleración aérea. Tres copias de esta trigonometría es como acaban
   * andando y volando hacia sitios distintos.
   *
   * @returns {boolean} si se pide alguna dirección
   */
  _readWish() {
    const keys = this.keys
    const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
    const z = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0)
    if (x === 0 && z === 0) return false
    const yaw = this.camera.rotation.y
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    // forward = (−sin, −cos); right = (cos, −sin).
    const inverse = 1 / Math.hypot(x, z)
    this._wishX = (-sin * z + cos * x) * inverse
    this._wishZ = (-cos * z - sin * x) * inverse
    return true
  }

  /** ¿Manda el vector de velocidad ahora mismo? Sólo en el aire y con el flag. */
  get usingAirVector() {
    return MOVEMENT.airVector && this.airborne
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
    this.poseEpoch += 1
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
    this._landingSpeed = this.topSpeed
    this.chainedJump = false
    this._stillJumps = 0
    this._flightMaxSpeed = 0
    this._airSpeed = this.topSpeed
    this._airVelX = 0
    this._airVelZ = 0
    this._landingVelX = 0
    this._landingVelZ = 0
    this._lastYaw = this.camera.rotation.y
    this.airStrafing = false
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
    // Antes que la horizontal: lo que se gane este frame ya mueve este frame.
    if (MOVEMENT.airVector) this._updateAirAccel(dt)
    else this._updateAirStrafe(dt)
    this._updateHorizontal(dt)
    // La marcha del vuelo se mira **antes** de la vertical, que es donde se
    // aterriza: si no, el frame del aterrizaje se mediría con el vuelo ya
    // cerrado y todos los saltos parecerían parados.
    if (this.airborne) {
      const speed = this.horizontalSpeed
      if (speed > this._flightMaxSpeed) this._flightMaxSpeed = speed
    }
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
      Number.isFinite(this._airSpeed) &&
      // El vector es **estado guardado**: al contrario que la marcha escalar,
      // que se recalcula cada frame desde las teclas, un NaN aquí se queda.
      Number.isFinite(this._airVelX) &&
      Number.isFinite(this._airVelZ)

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
    this._airSpeed = this.topSpeed
    this._landingSpeed = this.topSpeed
    this._airVelX = 0
    this._airVelZ = 0
    this._landingVelX = 0
    this._landingVelZ = 0
    this.airStrafing = false
    this._stillJumps = 0
    this._flightMaxSpeed = 0
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

  /**
   * **Aceleración en el aire.** La maniobra clásica de bunny-hop: en el aire,
   * con un estrafe puro —A o D, sin avanzar— y girando el ratón hacia el mismo
   * lado que la tecla, la marcha sube por encima de la de carrera.
   *
   * Cuatro decisiones, y las cuatro son el mecanismo:
   *
   * - **Se paga por ángulo, no por tiempo.** La ganancia es proporcional a los
   *   radianes girados en la dirección correcta, así que lo que acelera es
   *   mover el ratón; mantener la tecla con la vista quieta no da nada. Es
   *   también lo que la hace independiente del refresco: el ángulo total de un
   *   giro es el mismo se dibuje en 35 frames o en 140.
   * - **El giro que cuenta está acotado por velocidad angular**
   *   (`airStrafeMaxYawRateDeg`), no por frame. Sin ese tope un flick de un
   *   frame regalaría el techo entero; con él, medio segundo de giro vale lo
   *   mismo a 60 que a 240 Hz porque el límite es `rate · dt`.
   * - **El techo es duro.** `airStrafeMaxSpeed` no se pasa nunca, así que
   *   encadenar saltos no puede acelerar indefinidamente: la marcha máxima del
   *   juego es ésa, y este método es el **único** sitio donde `_airSpeed` sube.
   * - **Dejar de cumplir las condiciones no frena.** Soltar el estrafe, parar
   *   el ratón o pulsar W dejan de sumar; lo ganado se conserva hasta aterrizar
   *   —y de ahí en adelante sólo lo conserva un encadenado, como siempre.
   *
   * El giro se mide sobre el yaw de la cámara, que incluye el empuje del arma.
   * Es deliberado: el retroceso mueve la mira de verdad, y su aporte es de
   * décimas de grado con el signo alternando, contra los 140°/s que cuentan.
   */
  _updateAirStrafe(dt) {
    const yaw = this.camera.rotation.y
    // Diferencia normalizada a (−π, π]: aquí el yaw viene acumulado sin
    // envolver, pero esto lo deja a salvo de quien lo coloque de otra manera.
    let delta = yaw - this._lastYaw
    if (delta > Math.PI) delta -= TWO_PI
    else if (delta < -Math.PI) delta += TWO_PI
    this._lastYaw = yaw
    this.airStrafing = false

    if (!this.airborne || !(dt > 0)) return

    // Estrafe puro: A o D —no las dos— y sin avanzar. Con W pulsada esto es
    // correr en el aire, que no acelera y nunca lo ha hecho.
    const keys = this.keys
    const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
    if (x === 0 || keys.forward) return

    // Hacia el mismo lado que la tecla: mover el ratón a la derecha **resta**
    // yaw (ver lookControls), así que D (+1) pide delta negativo y A (−1),
    // positivo. Producto negativo = giro y estrafe van del mismo lado.
    if (x * delta >= 0) return
    this.airStrafing = true

    const max = MOVEMENT.airStrafeMaxSpeed
    if (this._airSpeed >= max) return
    const cap = MOVEMENT.airStrafeMaxYawRateDeg * DEG_TO_RAD * dt
    const turned = Math.abs(delta) < cap ? Math.abs(delta) : cap
    const gained = this._airSpeed + MOVEMENT.airStrafeGainPerRad * turned
    this._airSpeed = gained < max ? gained : max
  }

  /**
   * **Aceleración aérea del modelo vectorial**, el `airAccelerate` de toda la
   * vida: se proyecta la velocidad actual sobre la dirección pedida, se mira
   * cuánto falta para la velocidad deseada y se suma esa diferencia acotada por
   * `accel · wishSpeed · dt`.
   *
   * Todo el mecanismo está en la proyección. Con la vista puesta donde vas, la
   * proyección ya vale toda tu marcha —muy por encima de los 0.78 u/s de
   * `wishSpeed`—, no falta nada y no se gana nada: por eso **aquí no hace falta
   * la condición «W suelta»** del modelo escalar, sale sola. Y con la dirección
   * pedida casi perpendicular a la marcha, la proyección es casi cero, cabe
   * ganancia entera y lo que se suma es perpendicular: la velocidad crece y
   * **gira**. Girar el ratón es lo que mantiene esa perpendicularidad mientras
   * la marcha rota; de ahí que air-strafear sea un ritmo de giro y no una tecla.
   *
   * Dos consecuencias que conviene tener escritas:
   *
   * - **Girar demasiado rápido frena.** Si el giro se adelanta, la dirección
   *   pedida se va por detrás de la marcha y lo que se suma resta. Medido en la
   *   simulación previa: seis saltos a 40°/s dan 8.33 u/s y los mismos a 140°/s
   *   dan 3.84. Es justo al revés que en el modelo escalar, que premiaba girar
   *   rápido hasta su tope.
   * - **Esto es una integración y no tiene forma cerrada**, porque la entrada es
   *   el ratón. Medido: 0.38% de diferencia entre 60 y 1000 Hz en seis saltos
   *   encadenados. Es una excepción aceptada a la regla del refresco —ver
   *   `docs/decisions.md` §32—, no un descuido: el ratón se muestrea una vez por
   *   frame y subdividir la integración no lo arregla (medido, no cambia ni el
   *   cuarto decimal).
   */
  _updateAirAccel(dt) {
    this.airStrafing = false
    // El yaw se sigue anotando aunque este modelo no lo use: si se apaga el
    // interruptor en caliente, el escalar necesita un `_lastYaw` fresco o su
    // primera diferencia sería el giro acumulado de todo el rato anterior.
    this._lastYaw = this.camera.rotation.y
    if (!this.airborne || !(dt > 0)) return
    if (!this._readWish()) return

    // Sólo cuenta el trozo de frame que se pasa en el aire. En el frame del
    // aterrizaje eso es una fracción, y cobrarlo entero hacía que un vuelo
    // acelerase más cuanto menos refresco hubiera.
    const left = this._airTimeLeft()
    const step = dt < left ? dt : left
    if (!(step > 0)) return

    const wishSpeed = MOVEMENT.speed * MOVEMENT.airWishFactor
    const current = this._airVelX * this._wishX + this._airVelZ * this._wishZ
    const missing = wishSpeed - current
    if (missing <= 0) return

    let gain = MOVEMENT.airAccel * wishSpeed * step
    if (gain > missing) gain = missing
    this._airVelX += this._wishX * gain
    this._airVelZ += this._wishZ * gain
    this.airStrafing = true

    // El techo, igual de duro que en el modelo escalar: aquí se acota el módulo
    // del vector, que es el **único** sitio donde puede crecer.
    const max = MOVEMENT.airStrafeMaxSpeed
    const speed = Math.hypot(this._airVelX, this._airVelZ)
    if (speed > max) {
      const scale = max / speed
      this._airVelX *= scale
      this._airVelZ *= scale
    }
  }

  /**
   * Siembra la velocidad del vuelo con lo que se llevaba al despegar: la marcha
   * de suelo en la dirección que pidan las teclas. Sin teclas se despega sin
   * velocidad horizontal, que es lo mismo que hacía el modelo escalar.
   */
  _seedAirVelocity() {
    if (!this._readWish()) {
      this._airVelX = 0
      this._airVelZ = 0
      return
    }
    const speed = this.currentSpeed
    this._airVelX = this._wishX * speed
    this._airVelZ = this._wishZ * speed
  }

  /**
   * El paso horizontal del frame. Decide **a dónde se quería ir** —que es lo
   * único que cambia entre los dos modelos— y deja que el mismo bloque de
   * colisión resuelva a dónde se llega.
   */
  _updateHorizontal(dt) {
    const position = this.camera.position
    const fromX = position.x
    const fromZ = position.z
    let wantedX
    let wantedZ

    if (this.usingAirVector) {
      // En el aire manda la velocidad guardada, no las teclas: el input ya se
      // ha gastado en `_updateAirAccel`, que es quien la dobla.
      if (this._airVelX === 0 && this._airVelZ === 0) return
      wantedX = fromX + this._airVelX * dt
      wantedZ = fromZ + this._airVelZ * dt
    } else {
      if (!this._readWish()) return
      const step = this.currentSpeed * dt
      wantedX = fromX + this._wishX * step
      wantedZ = fromZ + this._wishZ * step
    }

    this._moveTo(fromX, fromZ, wantedX, wantedZ, dt)
    if (this.usingAirVector) this._clipAirVelocity(fromX, fromZ, wantedX, wantedZ)
  }

  /**
   * Qué le pasa a la velocidad cuando algo frena el paso. La componente
   * bloqueada se anula y la otra sobrevive entera: eso es lo que hace que rozar
   * una esquina deslice conservando la marcha en vez de pararse en seco, y lo
   * que evita que empujar contra un muro guarde velocidad para soltarla de
   * golpe al doblarlo.
   *
   * **Con una excepción que no es un parche, es la regla entera:** sólo se
   * pierde la marcha contra lo que **seguiría parando en lo alto del salto**. Un
   * cajón bajo deja de estorbar en cuanto los pies pasan de su techo menos el
   * escalón, así que rozarle la cara subiendo no es chocar, es rasparlo de paso:
   * matar ahí la marcha rompía saltar encima de la cobertura baja —medido, de
   * subirse 12 de 12 a no subirse ninguna—. Para distinguir una cosa de otra no
   * hace falta saber qué pieza fue: se le vuelve a preguntar **a la misma
   * colisión** con los pies donde van a estar en el ápice.
   *
   * La pared de la sala no entra en ese trato: no tiene techo que superar.
   */
  _clipAirVelocity(fromX, fromZ, wantedX, wantedZ) {
    const position = this.camera.position
    if (Math.abs(position.x - wantedX) > CLIP_EPSILON) {
      if (this._wallClampedX || !this._clearsAtApex('x', fromX, wantedX, fromZ)) this._airVelX = 0
    }
    if (Math.abs(position.z - wantedZ) > CLIP_EPSILON) {
      if (this._wallClampedZ || !this._clearsAtApex('z', fromZ, wantedZ, position.x)) this._airVelZ = 0
    }
  }

  /**
   * ¿Lo que acaba de frenar este paso dejará de estorbar en lo alto del vuelo?
   * Se resuelve el **mismo** paso contra la **misma** colisión, cambiando sólo la
   * altura de los pies por la del ápice. Sólo se llama en el frame en que algo
   * bloquea, así que no está en el camino caliente.
   */
  _clearsAtApex(axis, from, wanted, other) {
    if (!this.scenario) return false
    const apex = this._apexFeetY()
    const resolved = this.scenario.resolveAxis(axis, from, wanted, other, apex, apex + this.eyeHeight)
    return Math.abs(resolved - wanted) <= CLIP_EPSILON
  }

  /**
   * Altura de pies en lo más alto que le queda al vuelo. Sale de la parábola
   * cerrada: subiendo, el ápice es `y0 + v0²/2g`; bajando, lo más alto que queda
   * es donde se está.
   */
  _apexFeetY() {
    const v0 = this._launchVelocity
    if (v0 <= 0) return this.feetY
    return this._launchY + (v0 * v0) / (2 * MOVEMENT.gravity)
  }

  /**
   * Resuelve el paso contra el escenario y las paredes. **Idéntico para los dos
   * modelos de aire y para el suelo**: la colisión no sabe de dónde salió la
   * intención, sólo de dónde se venía y a dónde se iba.
   */
  _moveTo(fromX, fromZ, wantedX, wantedZ, dt) {
    const position = this.camera.position

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
    // Se anota quién frenó: contra la pared de la sala no hay ápice que valga,
    // y la velocidad se pierde siempre (ver `_clipAirVelocity`).
    this._wallClampedX = position.x > limitX || position.x < -limitX
    this._wallClampedZ = position.z > limitZ || position.z < -limitZ
    if (position.x > limitX) position.x = limitX
    else if (position.x < -limitX) position.x = -limitX
    if (position.z > limitZ) position.z = limitZ
    else if (position.z < -limitZ) position.z = -limitZ
  }

  /**
   * Velocidad con la que se llegaría al suelo desde el vuelo en curso, por
   * conservación de energía sobre la parábola: v² = v0² + 2·g·(y0 − suelo).
   * De aquí salen **las dos** cosas que necesitan saber cuándo acaba el vuelo:
   * la fuerza del aterrizaje y cuánto queda de aire. Una sola copia de la
   * fórmula, que es como no se desincronizan.
   */
  _fallSpeedFrom(ground) {
    const drop = this._launchY - ground
    const impactSq = this._launchVelocity * this._launchVelocity + 2 * MOVEMENT.gravity * drop
    return impactSq > 0 ? Math.sqrt(impactSq) : 0
  }

  /**
   * Segundos que le quedan al vuelo. Despejando la parábola, tocar el suelo es
   * `t = (v0 + velocidadDeImpacto) / g`, y lo que queda es eso menos lo volado.
   *
   * Sirve para que la aceleración aérea cobre **el tiempo que de verdad se pasa
   * en el aire** y no un frame entero: sin esto, el último frame del vuelo
   * acelera de más y cuánto de más depende del refresco, que es justo lo que
   * este proyecto no se permite.
   */
  _airTimeLeft() {
    if (!this.airborne) return 0
    const position = this.camera.position
    const ground = this.scenario
      ? this.scenario.groundHeightAt(position.x, position.z, this.feetY)
      : 0
    const total = (this._launchVelocity + this._fallSpeedFrom(ground)) / MOVEMENT.gravity
    const left = total - this._airTime
    return left > 0 ? left : 0
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
      this._takeOff(MOVEMENT.jumpSpeed * this.jumpFactor(now), this._isChainPress(), dt)
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
      this._takeOff(0, false, dt)
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
   * **Factor de fatiga del próximo salto**, 1 = salto entero.
   *
   * Lo que se desgasta es el **impulso vertical**: se multiplica `jumpSpeed` al
   * despegar y la parábola se sigue resolviendo en forma cerrada, así que un
   * salto fatigado se comporta igual a 60 que a 240 Hz. No hay bloqueo ni cuota
   * de saltos —saltar siempre hace algo— y hay suelo (`minFactor`).
   *
   * Los dos primeros saltos parados salen gratis: rebotar un par de veces es un
   * gesto normal, y penalizarlo desde el primero se sentiría como un error del
   * juego. Del tercero en adelante cada uno resta.
   *
   * Y se olvida sola: `recoverMs` sin saltar y el contador vuelve a cero. La
   * fatiga es del rebote, no del jugador.
   */
  jumpFactor(now = performance.now()) {
    const fatigue = MOVEMENT.jumpFatigue
    if (Number.isFinite(this._landedAt) && now - this._landedAt > fatigue.recoverMs) {
      this._stillJumps = 0
    }
    const over = this._stillJumps - fatigue.freeJumps + 1
    if (over <= 0) return 1
    return Math.max(fatigue.minFactor, 1 - fatigue.penaltyPerJump * over)
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
   * aterrizar —el número en el modelo escalar, el vector entero en el otro, y
   * ahí «conservar» incluye **hacia dónde ibas**—. Nada más: ni empuje vertical
   * extra, ni multiplicador, ni ganancia por encadenar otra vez.
   *
   * **Encadenar sigue sin acelerar** en los dos modelos, y por el mismo
   * argumento: la marcha aérea nace de `currentSpeed` (≤ `MOVEMENT.speed`) o de
   * un aterrizaje anterior, y el único sitio que puede subirla es la
   * aceleración aérea —`_updateAirStrafe` o `_updateAirAccel`—, que acaba
   * acotando a `MOVEMENT.airStrafeMaxSpeed`. Por inducción, ninguna cadena, por
   * larga que sea, supera ese techo.
   *
   * @param {number} velocity velocidad vertical inicial (0 al salirse de un borde)
   * @param {boolean} [chained] si el salto encadena con el aterrizaje anterior
   * @param {number} [dt] el frame en curso. El despegue ocurre dentro del paso
   *   vertical, que corre **después** del aéreo, así que sin esto el primer
   *   frame de cada vuelo se quedaba sin acelerar — un frame entero, o sea 16.7
   *   ms a 60 Hz contra 4.2 a 240: una diferencia por refresco de las que aquí
   *   se arreglan, no se documentan.
   */
  _takeOff(velocity, chained = false, dt = 0) {
    // `currentSpeed` se lee **antes** de marcar `airborne`, así que devuelve la
    // marcha de suelo: es la que se congela (escalar) o la que siembra el
    // vector.
    this._airSpeed = chained ? this._landingSpeed : this.currentSpeed
    if (chained) {
      this._airVelX = this._landingVelX
      this._airVelZ = this._landingVelZ
    } else {
      this._seedAirVelocity()
    }
    this.chainedJump = chained
    // Vuelo nuevo, marca a cero: la marcha la mide `update()` frame a frame, y
    // el vuelo más corto posible —un salto con la fatiga a tope— dura 318 ms,
    // muy por encima del tope de delta de un frame.
    this._flightMaxSpeed = 0
    this._airTime = 0
    this._launchY = this.feetY
    this._launchVelocity = velocity
    this.verticalVelocity = velocity
    this.airborne = true
    // Ya está en el aire: este frame le toca acelerar como a cualquier otro.
    if (dt > 0 && MOVEMENT.airVector) this._updateAirAccel(dt)
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
    const fallSpeed = this._fallSpeedFrom(ground)

    // Instante exacto del contacto, por el mismo motivo que la velocidad de
    // impacto: el frame que lo detecta llega pasado de largo y llega más tarde
    // cuanto menos refresco haya. De la parábola, tocar el suelo es
    //     ½·g·t² − v0·t + (suelo − y0) = 0  →  t = (v0 + fallSpeed) / g
    // y lo que sobra respecto al tiempo de vuelo acumulado es el retraso del
    // frame, que se descuenta del reloj. Sin esto, la ventana de encadenado
    // sería un frame más generosa a 240 Hz que a 60.
    this._landedAt = now - (this._airTime - (this._launchVelocity + fallSpeed) / g) * 1000
    // **Fatiga**: el vuelo que se cierra cuenta como parado o no según la marcha
    // más alta que llegó a tener. Un solo salto con desplazamiento de verdad
    // borra la cuenta entera, que es lo que hace que quien domina el bhop no
    // note nunca esta regla.
    if (this._flightMaxSpeed < MOVEMENT.jumpFatigue.minSpeed) this._stillJumps += 1
    else this._stillJumps = 0
    this._flightMaxSpeed = 0

    this._landingSpeed = this._airSpeed
    // Lo que conserva un encadenado con vector no es un número, es a dónde ibas
    // y a qué marcha. Fuera de la ventana esto no lo lee nadie: el salto
    // siguiente vuelve a sembrar desde el suelo.
    this._landingVelX = this._airVelX
    this._landingVelZ = this._airVelZ
    this._airVelX = 0
    this._airVelZ = 0

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
    // lo queda Chrome (ver el comentario de KEYBINDS en config.js).
    event.preventDefault()
    this.keys[action] = true
    // La marca del salto sale del **evento**, no del frame que lo atiende:
    // `timeStamp` va en el mismo origen de tiempos que `performance.now()`, así
    // que la ventana de encadenado no hereda el retraso del bucle de dibujo.
    //
    // Y con el tick fijo de la vuelta 44 sigue valiendo tal cual, que no es
    // evidente: el `now` que recibe un paso **es un instante real** —el que
    // representa el final de ese paso, un resto por detrás del frame—, así que
    // el aterrizaje que se despeja de la parábola sale también en tiempo real.
    // Los dos extremos de la ventana viven en el mismo reloj sin traducir nada;
    // traducirlos, que fue lo primero que se probó, es lo que metería el error.
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
