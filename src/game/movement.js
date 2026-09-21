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

import { COVER, EDITOR, FANS, LANDING, MOVEMENT, ROOM, ZIPLINES, fisicaDeEscenario, weaponSpeedFactor } from '../config.js'
import { defaultKeybinds, keysOf, typingInField } from '../keybinds.js'

const DEG_TO_RAD = Math.PI / 180
const TWO_PI = Math.PI * 2
/**
 * Holgura para decidir si un eje llegó a donde quería. `resolveAxis` devuelve
 * el destino **exacto** cuando no hay nada delante, así que cualquier diferencia
 * de verdad es mucho mayor que esto: el margen sólo evita comparar dos coma
 * flotante con `===`.
 */
const CLIP_EPSILON = 1e-9

/**
 * **El rumbo de un cable, en la convención de la cámara.** Mira a −Z con yaw 0,
 * que es la misma conversión con la que se dibuja el galón de una plataforma de
 * velocidad — y el error de 180° de la vuelta 60 es lo que pasa cuando cada
 * llamante la escribe por su cuenta.
 */
function rumboDeCable(cable) {
  return Math.atan2(-cable.dirX, -cable.dirZ)
}

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
    /**
     * **Lo que el paso está ejecutando.** Lo lee `update()`. Fuera de la red lo
     * escribe el teclado y es lo mismo que la intención; por la red lo escribe
     * `desempaquetarTeclas` con la entrada que toque — **también al reejecutar
     * una vieja**, que es de lo que va la separación de abajo.
     */
    this.keys = {
      forward: false,
      back: false,
      left: false,
      right: false,
      jump: false,
      walk: false,
      crouch: false,
      /**
       * **La tecla contextual** (vuelta 83), que entra aquí con la tirolina.
       *
       * Y la escribe **el motor**, no `buildKeyMap`: `use` no está en
       * `MOVEMENT_ACTIONS` a propósito, porque la prioridad de esa tecla ya
       * está decidida y vive en un sitio donde el movimiento no puede mirar —
       * dentro del radio del explosivo, `use` desactiva y **nunca hace nada
       * más ahí dentro** (vuelta 27)—. Si la capturara este módulo, esa regla
       * tendría que escribirse por segunda vez y aquí no hay bomba que
       * consultar.
       */
      use: false,
    }
    /**
     * **Lo que el jugador está pulsando ahora.** Lo escribe el teclado y de
     * aquí lo muestrea quien produzca la entrada del paso.
     *
     * Por defecto **es el mismo objeto** que `keys`: sin red, la intención y lo
     * que se ejecuta son lo mismo y separarlos sería una copia por paso para
     * nada. `separateInput()` los desdobla, y eso es lo que hace falta en red:
     * la reconciliación reejecuta entradas guardadas, así que `keys` se llena
     * sesenta veces por segundo con máscaras **del pasado**. Con un solo objeto
     * cada foto borraba la tecla que el jugador tenía pulsada — medido: con W
     * apretada, `teclas.forward` volvía a `false` en el primer paso y el jugador
     * no se movía en absoluto.
     */
    this.input = this.keys

    /** Altura de los pies sobre el suelo. Sólo el salto la mueve. */
    this.feetY = 0
    this.verticalVelocity = 0
    this.airborne = false
    /** **Vuelo del editor.** Aquí y no sólo en `setVolando`: un campo que se
     * lee antes de escribirse vale `undefined`, y `undefined` no es `false`
     * para quien lo compare. */
    this.volando = false
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
    /**
     * **La velocidad del suelo** (vuelta 83), que es lo que el hielo estrena.
     *
     * Fuera del hielo vale cero y **el juego es exactamente el de antes**: el
     * paso de a pie sigue siendo posición más dirección por marcha. Viaja en
     * `snapshot()` porque sobrevive a un paso, igual que los seis campos del
     * deslizamiento.
     */
    this._sueloVelX = 0
    this._sueloVelZ = 0
    /** Cuándo toca el próximo raspado de hielo. Cosmético: no viaja. */
    this._raspadoAt = 0
    /**
     * ¿Se pisaba hielo en el paso anterior? De su flanco sale la siembra, que
     * es lo que hace que entrar corriendo en una pista no te pare en el borde.
     * Viaja por lo mismo que `_crouchWasDown`: es la máscara de un paso.
     */
    this._enHieloAntes = false
    /**
     * **La tirolina** (vuelta 83): el estado de movimiento nuevo de esta
     * vuelta, y el primero desde el deslizamiento.
     *
     * Son cuatro campos y los cuatro viajan: si vas colgado, de qué cable
     * —**un índice** en la lista que los dos extremos derivan del mismo mapa,
     * así que no viaja ningún número del mapa—, desde qué punto del cable
     * enganchaste y cuánto tiempo llevas. Lo recorrido **no** es un campo: sale
     * de `velocidad · tiempo`, que es la forma cerrada.
     */
    this.enTirolina = false
    this._tiroCable = -1
    this._tiroD0 = 0
    this._tiroTime = 0
    /**
     * La máscara de la tecla contextual del paso anterior. De ella sale el
     * flanco, exactamente como `_crouchWasDown` con el deslizamiento: así
     * engancharse y soltarse son **pulsaciones** y no una tecla apoyada, y no
     * hace falta ni un campo más en el protocolo.
     */
    this._useWasDown = false
    /** Cuándo toca el próximo traqueteo de la polea. Cosmético: no viaja. */
    this._poleaAt = 0
    /** La superficie bajo los pies de este paso. La escribe `update`. */
    this._superficieDeSuelo = null
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
     * **Con qué gravedad está anclado el vuelo en curso** (vuelta 83).
     *
     * Normalmente es la del mapa. Dentro de un ventilador es
     * `gravedad − fuerza`, que puede ser **negativa**: ahí se acelera hacia
     * arriba. Es un campo y no una consulta porque la parábola tiene que
     * evaluarse con la **misma** g con la que se ancló — cambiarla a mitad de
     * vuelo sin re-anclar daría un salto de posición, que es exactamente lo
     * que la forma cerrada evita. Viaja en `snapshot()` porque sobrevive a un
     * paso.
     */
    this._gVuelo = MOVEMENT.gravity
    /** Cuándo toca la próxima ráfaga de ventilador. Cosmético: no viaja. */
    this._rafagaAt = 0

    /**
     * Salto encadenado. Tres marcas, las tres en milisegundos reales:
     *  - `_jumpPressedAt`: cuándo se pulsó SPACE, tomado del propio evento de
     *    teclado y no del frame que lo atiende. **Desde la vuelta 68 es lo que
     *    despega**, y no `keys.jump`: el salto va por flanco, así que esta marca
     *    se gasta —vuelve a `-Infinity`— en cuanto se usa.
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

    /**
     * **Deslizamiento** (vuelta 69). Seis campos y ninguno más, y los seis
     * viajan en `snapshot()` porque sobreviven a un paso:
     *  - `sliding` y `_slideTime`: si hay uno en marcha y cuánto lleva. La
     *    velocidad es una **forma cerrada** de ese tiempo, no una integración.
     *  - `_slideDirX/_slideDirZ`: hacia dónde, congelado al entrar. Un
     *    deslizamiento no se gobierna: es lo que lo distingue de correr
     *    agachado, y de paso es lo que lo deja resuelto en forma cerrada.
     *  - `_slideSpeed0`: el empujón de entrada, congelado con el arma que se
     *    llevaba — cambiar de arma a media caída no lo acelera.
     *  - `_slideEndedAt`: cuándo acabó el último, para el enfriamiento.
     * Y `_crouchWasDown`, que es lo que convierte la tecla en **flanco**: lo
     * que arranca un deslizamiento es pulsar, no tener pulsado. Se deduce de la
     * máscara del paso anterior, así que no hace falta un campo nuevo en el
     * protocolo — los dos extremos ejecutan los mismos pasos con las mismas
     * máscaras y deducen el mismo flanco.
     */
    this.sliding = false
    this._slideTime = 0
    this._slideDirX = 0
    this._slideDirZ = 0
    this._slideSpeed0 = 0
    this._slideEndedAt = -Infinity
    this._crouchWasDown = false

    /** Sala vigente. La marca el escenario; la vacía usa la de siempre. */
    this.room = ROOM
    /** Física vigente. La marca el escenario; sin él, la de `MOVEMENT`. */
    this.fisica = fisicaDeEscenario(null)
    /** Caja de la fase de compra, o null. Ver `setCorralito`. */
    this._corralito = null

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
    /**
     * **Dentro de un área de teletransporte** (vuelta 80). Es el flanco: entrar
     * dispara, quedarse dentro no. Viaja en `snapshot()` porque sobrevive a un
     * paso, igual que la máscara de agachado del deslizamiento.
     */
    this._enTeletransporte = false
    /**
     * El rumbo que pide el último teletransporte, o `null`. No es estado del
     * mundo —se consume en el mismo frame y no viaja—: es un recado para quien
     * tiene los controles de la cámara, que es su dueño (vuelta 66).
     */
    this.rumboPedido = null
    /**
     * **Lo que un dispositivo acaba de hacerte**, o `null` (vuelta 82).
     *
     * Es un **recado de un paso vivo**, exactamente como `rumboPedido`: lo
     * escribe el paso que lo produce y lo consume quien dibuja y suena, una
     * sola vez. Va por aquí y no en `snapshot()` porque no es estado —no
     * sobrevive a un paso, no hay nada que reconciliar— y sobre todo porque
     * **el servidor no lo necesita**: los efectos y los sonidos son del
     * cliente, y `partida.js` no tiene ni escena ni altavoces.
     *
     * Ojo con la mitad que no se ve, que es la misma trampa que el rumbo:
     * **reejecutar una entrada no puede volver a sonar**. La reconciliación
     * pasa por este mismo `update`, así que una plataforma dentro de la cola
     * sin confirmar dispararía su destello varias veces por segundo. Lo
     * limpia `cliente.js` tras reejecutar.
     */
    this.usoDeDispositivo = null

    this._onKeyDown = this._onKeyDown.bind(this)
    this._onKeyUp = this._onKeyUp.bind(this)
    this._onBlur = () => { this.releaseKeys(); this.releaseInput() }
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
    if (!this.enabled) {
      this.releaseKeys()
      this.releaseInput()
    }
  }

  /**
   * Adopta una asignación de teclas nueva. Se sueltan todas: una tecla que
   * estuviera pulsada con el mapa viejo no va a soltarse nunca con el nuevo, y
   * el jugador se quedaría andando solo.
   */
  setKeybinds(binds) {
    this.keyMap = buildKeyMap(binds)
    this.releaseKeys()
    this.releaseInput()
  }

  /**
   * **Desdobla la intención de lo que se ejecuta.** Lo llama el motor al
   * conectarse a una partida: ver `input`. Devuelve el objeto de intención, que
   * es lo que el productor de entradas tiene que muestrear.
   */
  separateInput() {
    if (this.input === this.keys) this.input = { ...this.keys }
    return this.input
  }

  /** Suelta lo que el jugador tiene pulsado. Ver `releaseKeys`. */
  releaseInput() {
    const input = this.input
    if (input === this.keys) return
    for (const k of Object.keys(input)) input[k] = false
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
    keys.use = false
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
    // Deslizándose la marcha no la ponen las teclas: la pone la recta que va
    // del empujón a la marcha de agachado. Y sí es «la marcha vigente», que es
    // lo que esta propiedad significa — quien salta desde un deslizamiento pide
    // la suya aparte (ver `_updateVertical`).
    if (this.sliding) return this._velocidadDeDeslizamiento()
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
    // Un deslizamiento avanza sin teclas: la dirección se congeló al entrar.
    // Preguntar por las teclas diría que está quieto alguien que cruza un vano
    // a 9 u/s, y de esto cuelgan las pisadas y la dispersión por velocidad.
    if (this.sliding) return this.currentSpeed
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
    /**
     * **«Tiene geometría» no era la pregunta** (vuelta 80). Lo que el
     * movimiento necesita de un escenario dejó de ser sólo contra qué chocar:
     * desde que un mapa puede declarar teletransportes, uno **sin una sola
     * caja** sigue teniendo algo que resolver aquí. Con la condición de antes,
     * un mapa de sólo puertas se montaba con `scenario = null` y no
     * teletransportaba a nadie — sin un error en ninguna pantalla, que es como
     * se pierden estas cosas.
     */
    // **«Tiene geometría» no era la pregunta** (vuelta 80), y desde la 83 hay
    // un tercer sitio donde se ve: un mapa de sólo ventiladores tampoco tiene
    // contra qué chocar y aun así el movimiento lo necesita.
    const util = scenario && (
      scenario.hasGeometry ||
      scenario.teletransportes?.length > 0 ||
      scenario.ventiladores?.length > 0 ||
      scenario.tirolinas?.length > 0
    )
    this.scenario = util ? scenario : null
    // La sala la trae el escenario aunque no tenga geometría: el límite de
    // movimiento tiene que ser el mismo que el de las paredes que se dibujan.
    this.room = scenario ? scenario.room : ROOM
    const spawn = scenario ? scenario.spawn : null
    this.spawnX = spawn ? spawn.x : 0
    this.spawnZ = spawn ? spawn.z : 0
    /**
     * **Y su física** (vuelta 72). Un mapa puede pesar menos: la gravedad, el
     * impulso del salto y el techo del aire salen de aquí y no de `MOVEMENT`,
     * que pasa a ser **lo que vale si el mapa no dice otra cosa**.
     *
     * Se lee del escenario y no de un ajuste ni de un modo, y eso es lo que la
     * hace segura en red: los dos extremos montan el mismo mapa —lo dice la
     * sala— y por tanto derivan los mismos números sin que viaje ninguno. Un
     * campo de física en el protocolo sería una física que se puede mentir.
     */
    this.fisica = scenario ? scenario.fisica : fisicaDeEscenario(null)
  }

  /**
   * **Todo el estado que decide cómo sigue moviéndose este jugador** (vuelta
   * 45), para mandarlo por la red y volver a colocarlo tal cual.
   *
   * Vive aquí y no en quien lo manda por la misma razón de siempre: los campos
   * son de este módulo, y una lista de nombres escrita en otro sitio se
   * desincroniza el día que se añada uno. Si añades estado que sobreviva a un
   * frame, añádelo también aquí.
   *
   * Lo que **no** entra, y por qué:
   *  - `camera.position.y`, que sale de `feetY + eyeHeight − landingDip`.
   *  - `_wishX/_wishZ`, que se recalculan cada paso desde teclas y yaw.
   *  - `_safe*`, la red de `_guardState`: se resiembra sola con el primer paso
   *    sano, y mandar un estado de emergencia sería mandar el problema.
   *  - `loadFactor`, `room`, `scenario` y `spawn*`, que son configuración de la
   *    partida y no cambian de un paso a otro.
   */
  snapshot(out = {}) {
    const p = this.camera.position
    out.x = p.x
    out.z = p.z
    out.feetY = this.feetY
    out.verticalVelocity = this.verticalVelocity
    out.airborne = this.airborne
    // El vuelo en curso, que es lo que resuelve la parábola en forma cerrada.
    out.airTime = this._airTime
    out.launchY = this._launchY
    out.launchVelocity = this._launchVelocity
    /**
     * **Y con qué gravedad se ancló** (vuelta 83): dentro de un ventilador no
     * es la del mapa, y la parábola tiene que evaluarse con la misma con la
     * que empezó.
     *
     * **Va `undefined` cuando vale lo de siempre**, y eso no es una
     * micro-optimización: esta foto la manda el servidor a los dos jugadores
     * **sesenta veces por segundo**, así que cada campo cuesta unos 60 B/s por
     * jugador. Los nueve que esta vuelta añade pesan 138 B por jugador y foto
     * —medido—, o sea **16 KB/s de bajada** que casi nadie va a usar: los
     * ventiladores, el hielo y las tirolinas son de un mapa que los declare.
     *
     * `JSON.stringify` **se salta las propiedades `undefined`**, así que esto
     * las borra del cable sin borrarlas del objeto —la forma se conserva, que
     * es lo que el bucle caliente necesita— y `restore()` ya devolvía el valor
     * de fábrica a lo que no llegara. Medido en `red45`: **135.8 → 121.5 KB/s**
     * con los dos jugadores volando, y **lo de siempre vuelve a costar lo de
     * siempre**.
     *
     * La regla, para el día que se añada estado nuevo: **lo que vale su valor
     * de fábrica no viaja**.
     */
    out.gVuelo = this._gVuelo === this.fisica.gravity ? undefined : this._gVuelo
    // La marcha aérea, en los dos modelos.
    out.airSpeed = this._airSpeed
    out.airVelX = this._airVelX
    out.airVelZ = this._airVelZ
    // Lo que conserva un encadenado, y las dos marcas que deciden si lo hay.
    out.landingSpeed = this._landingSpeed
    out.landingVelX = this._landingVelX
    out.landingVelZ = this._landingVelZ
    // **La velocidad del suelo** (vuelta 83), que es lo que el hielo estrena, y
    // la máscara de la que sale su flanco. Fuera del hielo valen cero y false.
    out.sueloVelX = this._sueloVelX || undefined
    out.sueloVelZ = this._sueloVelZ || undefined
    out.enHieloAntes = this._enHieloAntes || undefined
    out.landedAt = this._landedAt
    out.jumpPressedAt = this._jumpPressedAt
    out.chainedJump = this.chainedJump
    // Fatiga de salto.
    out.stillJumps = this._stillJumps
    out.flightMaxSpeed = this._flightMaxSpeed
    // Postura y hundimiento de cámara.
    out.eyeHeight = this.eyeHeight
    out.landingDip = this.landingDip
    out.dipFrom = this._dipFrom
    out.dipElapsedMs = this._dipElapsedMs
    // El yaw del paso anterior: el air-strafe escalar cobra por la diferencia.
    out.lastYaw = this._lastYaw
    /**
     * **Y la marca de teletransporte** (vuelta 50). Es el único campo que no
     * describe *dónde* está el jugador sino *cómo* llegó, y viaja por la misma
     * razón que existe: quien dibuja tiene que saber que entre estos dos estados
     * no hay camino. Sin ella, una reaparición se dibujaba como un barrido en
     * línea recta desde el punto de muerte hasta el spawn — el rival pasaba por
     * posiciones en las que nunca estuvo.
     */
    out.poseEpoch = this.poseEpoch
    out.enTeletransporte = this._enTeletransporte
    // **Deslizamiento** (vuelta 69): los seis campos que sobreviven a un paso,
    // más la máscara de agachado del paso anterior, que es de donde sale el
    // flanco. Sin esto, la reconciliación reejecuta entradas con un
    // deslizamiento a medias y cada foto trae una corrección.
    out.sliding = this.sliding
    out.slideTime = this._slideTime
    out.slideDirX = this._slideDirX
    out.slideDirZ = this._slideDirZ
    out.slideSpeed0 = this._slideSpeed0
    out.slideEndedAt = this._slideEndedAt
    out.crouchWasDown = this._crouchWasDown
    // **Tirolina** (vuelta 83): los cuatro campos del estado más la máscara de
    // la que sale su flanco. Sin ellos, la reconciliación reejecuta entradas
    // con un jugador que el servidor cree colgado y el cliente andando.
    out.enTirolina = this.enTirolina || undefined
    out.tiroCable = this._tiroCable === -1 ? undefined : this._tiroCable
    out.tiroD0 = this._tiroD0 || undefined
    out.tiroTime = this._tiroTime || undefined
    out.useWasDown = this._useWasDown || undefined
    return out
  }

  /** Coloca el estado que devolvió `snapshot()`. */
  restore(state) {
    const p = this.camera.position
    p.x = state.x
    p.z = state.z
    this.feetY = state.feetY
    this.verticalVelocity = state.verticalVelocity
    this.airborne = state.airborne
    this._airTime = state.airTime
    this._launchY = state.launchY
    this._launchVelocity = state.launchVelocity
    this._gVuelo = Number.isFinite(state.gVuelo) ? state.gVuelo : this.fisica.gravity
    this._airSpeed = state.airSpeed
    this._airVelX = state.airVelX
    this._airVelZ = state.airVelZ
    this._landingSpeed = state.landingSpeed
    this._landingVelX = state.landingVelX
    this._landingVelZ = state.landingVelZ
    this._sueloVelX = Number.isFinite(state.sueloVelX) ? state.sueloVelX : 0
    this._sueloVelZ = Number.isFinite(state.sueloVelZ) ? state.sueloVelZ : 0
    this._enHieloAntes = Boolean(state.enHieloAntes)
    // Los dos centinelas son `-Infinity` y JSON no sabe escribirlo: cualquier
    // cosa que no sea un número finito vuelve a significar «nunca».
    this._landedAt = Number.isFinite(state.landedAt) ? state.landedAt : -Infinity
    this._jumpPressedAt = Number.isFinite(state.jumpPressedAt)
      ? state.jumpPressedAt
      : -Infinity
    this.chainedJump = state.chainedJump
    this._stillJumps = state.stillJumps
    this._flightMaxSpeed = state.flightMaxSpeed
    this.eyeHeight = state.eyeHeight
    this.landingDip = state.landingDip
    this._dipFrom = state.dipFrom
    this._dipElapsedMs = state.dipElapsedMs
    this._lastYaw = state.lastYaw
    // La época la manda el servidor, que es quien sabe si ha habido
    // teletransporte. Un estado antiguo sin el campo deja la de aquí como
    // estaba, que es lo que valía antes de que viajara.
    if (Number.isFinite(state.poseEpoch)) this.poseEpoch = state.poseEpoch
    this._enTeletransporte = Boolean(state.enTeletransporte)
    this.sliding = Boolean(state.sliding)
    this._slideTime = Number.isFinite(state.slideTime) ? state.slideTime : 0
    this._slideDirX = Number.isFinite(state.slideDirX) ? state.slideDirX : 0
    this._slideDirZ = Number.isFinite(state.slideDirZ) ? state.slideDirZ : 0
    this._slideSpeed0 = Number.isFinite(state.slideSpeed0) ? state.slideSpeed0 : 0
    // Como los dos centinelas del salto: lo que no sea finito vuelve a
    // significar «nunca», que es lo que JSON hace con `-Infinity`.
    this._slideEndedAt = Number.isFinite(state.slideEndedAt) ? state.slideEndedAt : -Infinity
    this._crouchWasDown = Boolean(state.crouchWasDown)
    this.enTirolina = Boolean(state.enTirolina)
    this._tiroCable = Number.isFinite(state.tiroCable) ? state.tiroCable : -1
    this._tiroD0 = Number.isFinite(state.tiroD0) ? state.tiroD0 : 0
    this._tiroTime = Number.isFinite(state.tiroTime) ? state.tiroTime : 0
    this._useWasDown = Boolean(state.useWasDown)
    p.y = this.feetY + this.eyeHeight - this.landingDip
  }

  /**
   * **Marca una pulsación de salto en un instante dado del reloj del mundo.**
   * Jugando lo hace el propio `_onKeyDown` con el `timeStamp` del evento; por la
   * red la pulsación llega dentro de un paquete de entrada y hay que volver a
   * ponerla en el reloj **compartido**, o los dos extremos de la ventana de
   * encadenado vivirían en relojes distintos. Ver `net/protocolo.js`.
   */
  pressJump(at) {
    this._jumpPressedAt = at
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
    this._gVuelo = this.fisica.gravity
    this._jumpPressedAt = -Infinity
    this._landedAt = -Infinity
    this._landingSpeed = this.topSpeed
    this.chainedJump = false
    this._stillJumps = 0
    this._flightMaxSpeed = 0
    // Reaparecer dentro de un área de teletransporte no puede mandarte a su
    // destino: el flanco se reinicia y se vuelve a pedir al entrar de verdad.
    this._enTeletransporte = false
    this.rumboPedido = null
    this.usoDeDispositivo = null
    this._pararDeslizamiento()
    this._airSpeed = this.topSpeed
    this._airVelX = 0
    this._airVelZ = 0
    this._landingVelX = 0
    this._landingVelZ = 0
    this._sueloVelX = 0
    this._sueloVelZ = 0
    this._enHieloAntes = false
    // Reaparecer suelta el cable, por lo mismo que suelta el área de
    // teletransporte: el estado de antes de morir no manda sobre el de ahora.
    this.enTirolina = false
    this._tiroCable = -1
    this._tiroD0 = 0
    this._tiroTime = 0
    this._useWasDown = false
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
    /**
     * **Volar es una herramienta del editor, no una mecánica** (vuelta 77).
     *
     * Existe para una sola cosa: poder apuntar a una cornisa a la que no se
     * llega de pie, y plantar ahí un muñeco. Por eso es un `if` **al principio
     * del paso** y no una rama dentro de la vertical — así no hay ni un camino
     * nuevo que recorra el modelo de movimiento, ni un campo más en
     * `snapshot()`, ni nada que pueda discrepar entre los dos extremos de una
     * partida en red. Lo enciende el editor y sólo el editor.
     *
     * Y **apagarlo no teletransporta**: se deja al jugador en el aire con
     * `airborne` y su parábola de siempre, así que cae con la gravedad del mapa
     * y aterriza como en cualquier salto. Vektor no tiene daño por caída, así
     * que «sin daño» sale solo: no hay nada que desactivar.
     */
    if (this.volando) {
      this._volar(dt)
      this._guardState()
      return
    }
    /**
     * **Sobre qué se está, antes de mover nada** (vuelta 83). La horizontal
     * corre antes que la vertical, así que el hielo necesita saber qué pisa
     * **ahora**, no lo que averigüe la vertical después. Se respeta la única
     * regla del captador (vuelta 80): se lee en la línea de al lado de su
     * propio `groundHeightAt` y con la misma posición.
     */
    if (this.scenario) {
      const p = this.camera.position
      this.scenario.groundHeightAt(p.x, p.z, this.feetY)
      this._superficieDeSuelo = this.scenario.superficieDelSuelo
    } else {
      this._superficieDeSuelo = null
    }

    /**
     * **La tirolina manda sobre el paso entero** (vuelta 83), y por eso está
     * aquí arriba y no metida dentro de la horizontal o de la vertical.
     *
     * Es la forma del vuelo del editor (vuelta 77) aplicada a una mecánica de
     * verdad: colgado de un cable no hay marcha de suelo, ni parábola, ni
     * deslizamiento, ni colisión que resolver — hay un punto de un segmento y
     * un reloj. Meterlo como una rama dentro del modelo sería un camino nuevo
     * por el que los dos extremos de una partida pueden discrepar; así es un
     * `if` con un `return`, y lo de debajo no se entera de que existe.
     */
    if (this._updateTirolina(dt, now)) {
      this._updateLandingDip(dt)
      this.camera.position.y = this.feetY + this.eyeHeight - this.landingDip
      this._guardState()
      return
    }

    // Antes que la horizontal, porque decide con qué marcha y hacia dónde se
    // mueve este paso.
    this._updateSlide(dt, now)
    // Antes que la horizontal: lo que se gane este frame ya mueve este frame.
    if (MOVEMENT.airVector) this._updateAirAccel(dt)
    else this._updateAirStrafe(dt)
    this._updateHorizontal(dt, now)
    // La marcha del vuelo se mira **antes** de la vertical, que es donde se
    // aterriza: si no, el frame del aterrizaje se mediría con el vuelo ya
    // cerrado y todos los saltos parecerían parados.
    if (this.airborne) {
      const speed = this.horizontalSpeed
      if (speed > this._flightMaxSpeed) this._flightMaxSpeed = speed
    }
    this._updateVertical(dt, now)
    // Al final del paso, con la posición ya definitiva: un teletransporte que
    // se comprobara a medio paso mandaría al jugador desde un sitio en el que
    // todavía no estaba.
    this._raspadoDeHielo(now)
    this._comprobarTeletransporte()
    this._updateLandingDip(dt)
    this.camera.position.y = this.feetY + this.eyeHeight - this.landingDip
    this._guardState()
  }

  /**
   * **El vuelo del editor**: las teclas mandan directamente, con la colisión de
   * siempre y sin gravedad.
   *
   * La colisión horizontal se conserva a propósito: volar **a través** de la
   * geometría haría imposible juzgar si una cornisa se defiende, que es justo
   * para lo que se vuela. Lo que se quita es la gravedad y el suelo.
   *
   * **Y la horizontal no puede ser la del aire** (vuelta 78). La primera
   * versión llamaba a `_updateHorizontal`, y como el vuelo fuerza `airborne`,
   * ahí manda el modelo vectorial: la velocidad guardada, no las teclas. Con
   * `_airVelX`/`_airVelZ` a cero —que es como se entra a volar— esa función
   * **se sale en la primera línea**, así que volando no se movía uno de sitio
   * en ninguna dirección; lo poco que se movía era la inercia que quedara de un
   * salto anterior. Aquí el paso se resuelve como el de a pie —`_readWish` y
   * `_moveTo`— pero a la marcha del vuelo, que es lo que hace que cruzar el
   * mapa por arriba no cueste un minuto.
   */
  _volar(dt) {
    // Sin gravedad no hay vuelo que resolver: el estado del despegue se limpia
    // para que al soltar el vuelo se caiga desde aquí y no desde el salto de
    // hace un minuto.
    this.airborne = true
    this._airTime = 0
    this._launchY = this.feetY
    this._launchVelocity = 0
    this.verticalVelocity = 0
    // Y la velocidad del aire también, o al apagar el vuelo se saldría
    // disparado con la marcha que se traía de antes de encenderlo.
    this._airVelX = 0
    this._airVelZ = 0

    if (this._readWish()) {
      const position = this.camera.position
      const fromX = position.x
      const fromZ = position.z
      const paso = EDITOR.vuelo * dt
      this._moveTo(fromX, fromZ, fromX + this._wishX * paso, fromZ + this._wishZ * paso, dt)
    }
    const sube = Number(Boolean(this.keys.jump)) - Number(Boolean(this.keys.crouch))
    this.feetY = Math.max(this.feetY + sube * EDITOR.vuelo * dt, 0)
    this.camera.position.y = this.feetY + this.eyeHeight
  }

  /**
   * Enciende o apaga el vuelo. Al apagarlo **no se coloca a nadie**: se deja
   * cayendo, que es lo que hace que aterrizar sea el aterrizaje de siempre.
   */
  setVolando(valor) {
    this.volando = Boolean(valor)
    if (!this.volando) {
      this.airborne = true
      this._airTime = 0
      this._launchY = this.feetY
      this._launchVelocity = 0
      this.verticalVelocity = 0
    }
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
      Number.isFinite(this._airVelZ) &&
      // El deslizamiento también es estado guardado: su velocidad sale de un
      // tiempo que se acumula y de un empujón que se congeló al entrar.
      Number.isFinite(this._slideTime) &&
      Number.isFinite(this._slideSpeed0) &&
      Number.isFinite(this._slideDirX) &&
      Number.isFinite(this._slideDirZ)

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
    this._pararDeslizamiento()
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

    const max = this.fisica.airStrafeMaxSpeed
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
    const velXAntes = this._airVelX
    const velZAntes = this._airVelZ
    this._airVelX += this._wishX * gain
    this._airVelZ += this._wishZ * gain
    this.airStrafing = true

    /**
     * El techo, igual de duro que en el modelo escalar: aquí se acota el módulo
     * del vector, que es el **único** sitio donde puede crecer.
     *
     * **Y desde la vuelta 82 el techo no puede bajar de lo que ya traías.** Lo
     * que este tope tiene que impedir es que el air-strafe *gane* por encima
     * de `airStrafeMaxSpeed`; lo que no puede hacer es **quitar** marcha que no
     * ha puesto él. Con una plataforma de velocidad lanzando a 60, mirar de
     * lado dejaba `current` por debajo de `wishSpeed`, entraba por la ganancia
     * y el escalado de abajo frenaba el vuelo entero de 60 a 9.5 **en un
     * paso**: un lanzamiento que se apagaba por girar la cabeza. Con el techo
     * en `max(techo, lo que ya había)` el caso de siempre sale idéntico —si ya
     * ibas por debajo del techo, el máximo es el techo— y un lanzamiento se
     * conserva.
     */
    const speedAntes = Math.hypot(velXAntes, velZAntes)
    const max = Math.max(this.fisica.airStrafeMaxSpeed, speedAntes)
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
  _seedAirVelocity(speed = this.currentSpeed) {
    if (!this._readWish()) {
      this._airVelX = 0
      this._airVelZ = 0
      return
    }
    this._airVelX = this._wishX * speed
    this._airVelZ = this._wishZ * speed
  }

  /**
   * El paso horizontal del frame. Decide **a dónde se quería ir** —que es lo
   * único que cambia entre los dos modelos— y deja que el mismo bloque de
   * colisión resuelva a dónde se llega.
   */
  _updateHorizontal(dt, now) {
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
    } else if (this.sliding) {
      // La dirección se congeló al entrar: deslizarse no se gobierna, y por eso
      // lo que decide dónde acabas es **desde dónde entraste**.
      //
      // Y lo que avanza el paso **no es velocidad × dt**: es la diferencia de
      // dos distancias resueltas en forma cerrada. Con la velocidad, la suma de
      // los pasos es una integración de Euler de una recta y se pasa de largo
      // en `(v0 − vfin)/2 × dt`, o sea **más cuanto menos refresco**: medido
      // antes de esto, 4.309 u a 60 Hz contra 4.245 a 240, un 1.49%. Es la
      // misma razón por la que el salto no integra su parábola.
      const step = this._avanceDeDeslizamiento(dt)
      wantedX = fromX + this._slideDirX * step
      wantedZ = fromZ + this._slideDirZ * step
    } else if (this._gobiernaElHielo(dt, now)) {
      // **En hielo manda la velocidad del suelo, no las teclas** (vuelta 83).
      // Es la misma forma que el aire con vector: el input ya se ha gastado
      // acelerándola, y lo que mueve el paso es ella.
      if (this._sueloVelX === 0 && this._sueloVelZ === 0) return
      wantedX = fromX + this._sueloVelX * dt
      wantedZ = fromZ + this._sueloVelZ * dt
    } else {
      if (!this._readWish()) return
      const step = this.currentSpeed * dt
      wantedX = fromX + this._wishX * step
      wantedZ = fromZ + this._wishZ * step
    }

    this._moveTo(fromX, fromZ, wantedX, wantedZ, dt)
    if (this.usingAirVector) this._clipAirVelocity(fromX, fromZ, wantedX, wantedZ)
    // Y la del suelo por lo mismo que la del aire: empujar contra un muro no
    // puede guardar marcha para soltarla de golpe al doblarlo.
    if (this._sueloVelX !== 0 || this._sueloVelZ !== 0) {
      this._clipVelocidadDeSuelo(fromX, fromZ, wantedX, wantedZ)
    }
  }

  /**
   * **El hielo, que es el único sitio del juego donde el suelo tiene
   * velocidad** (vuelta 83).
   *
   * Devuelve si este paso lo gobierna él. Y la primera línea **es** la mitad
   * del diseño: sin hielo debajo y sin velocidad que quede, se sale, y el paso
   * lo resuelve el camino de siempre. Por eso un mapa sin hielo acaba en la
   * misma coordenada hasta el último decimal — está medido, no supuesto.
   *
   * El modelo son tres cosas y ninguna es nueva en este motor:
   *
   * 1. **La tecla acelera, no coloca.** Se proyecta la velocidad sobre lo que
   *    se pide y se suma lo que falte, acotado por `aceleracion · dt`. Es
   *    literalmente `_updateAirAccel`, que es de lo que el hielo es primo: en
   *    los dos sitios la marcha tiene dirección propia y la tecla sólo la
   *    empuja.
   * 2. **El rozamiento lo declara el mapa**, en `superficie.fuerza`, y es una
   *    frenada en u/s². Fuera del hielo manda `frenadoFuera`, que es alto: un
   *    derrape de un par de décimas y se recupera el control.
   * 3. **Y por debajo de un umbral se pone a cero exacto.** No es cosmético:
   *    es lo que devuelve el paso al camino de siempre, y sin él una velocidad
   *    residual de 1e-9 dejaría el modelo nuevo encendido para siempre.
   *
   * Lo que se paga, y va escrito porque es una excepción de las gordas: **esto
   * es una integración**, no tiene forma cerrada porque la entrada son las
   * teclas paso a paso. Es la misma excepción que el modelo vectorial del aire
   * (vuelta 32) y lo que la hace segura es lo mismo: el mundo va a **60 Hz
   * fijos** desde la 44, así que los dos extremos de una partida dan los
   * mismos pasos con las mismas máscaras y no hay nada que reconciliar.
   */
  _gobiernaElHielo(dt, now) {
    const cfg = MOVEMENT.hielo
    const enHielo = this._superficieDeSuelo?.tipo === 'hielo' && !this.airborne
    /**
     * **Entrar con la marcha que traías**, que es el flanco. Sin esto, pisar
     * una pista corriendo te dejaría clavado en el borde: la velocidad
     * arrancaría de cero y la aceleración del hielo es baja a propósito. Se
     * siembra con lo que venías haciendo — lo que aterrizó, si vienes por el
     * aire, y lo que pedían las teclas si vienes andando.
     */
    if (enHielo && !this._enHieloAntes) {
      /**
       * **Y «lo que venías haciendo» caduca** (vuelta 84). `_landingVelX/Z` se
       * escribe en cada aterrizaje y **no se borra nunca** —su comentario decía
       * «fuera de la ventana esto no lo lee nadie», y desde la vuelta 83 lo lee
       * esto—, así que un salto cualquiera dejaba escrito un rumbo que seguía
       * ahí un minuto después. Entrar andando en una pista te sembraba **hacia
       * donde aterrizaste la última vez**, y en hielo manda la velocidad del
       * suelo y no las teclas: si aquel rumbo apuntaba hacia fuera, entrabas,
       * te sacaba, volvías a entrar y te volvía a sacar. Se sentía exactamente
       * como lo que contó quien lo jugó —«un escalón que no deja entrar desde
       * ciertos ángulos»— y medido eran **0 de 36 rumbos**.
       *
       * La ventana es la del encadenado, y no un número nuevo: es la que ya
       * significa «todavía llevas la marcha con la que aterrizaste», la misma
       * que decide si un salto encadena. `_landedAt` ya viaja en `snapshot()`,
       * así que los dos extremos deciden esto igual sin un campo más.
       */
      const deVuelo =
        Number.isFinite(this._landedAt) && now - this._landedAt <= MOVEMENT.chainJumpWindowMs
      if (deVuelo && (this._landingVelX !== 0 || this._landingVelZ !== 0)) {
        this._sembrarVelocidadDeSuelo(this._landingVelX, this._landingVelZ)
      } else if (this._readWish()) {
        this._sembrarVelocidadDeSuelo(this._wishX * this.currentSpeed, this._wishZ * this.currentSpeed)
      }
    }
    this._enHieloAntes = enHielo

    if (!enHielo && this._sueloVelX === 0 && this._sueloVelZ === 0) return false
    if (!(dt > 0)) return true

    const tope = this.topSpeed * cfg.factorMarchaMax
    if (this._readWish()) {
      const actual = this._sueloVelX * this._wishX + this._sueloVelZ * this._wishZ
      const objetivo = enHielo ? tope : this.currentSpeed
      const falta = objetivo - actual
      if (falta > 0) {
        const gana = Math.min(cfg.aceleracion * dt, falta)
        this._sueloVelX += this._wishX * gana
        this._sueloVelZ += this._wishZ * gana
      }
    }

    // Rozamiento: el del mapa si estás encima, el del suelo normal si ya has
    // salido y lo que queda es la inercia.
    const roce = enHielo ? this._superficieDeSuelo.fuerza : cfg.frenadoFuera
    const v = Math.hypot(this._sueloVelX, this._sueloVelZ)
    if (v > 0) {
      const queda = Math.max(0, v - roce * dt)
      if (queda <= cfg.umbralParada) {
        this._sueloVelX = 0
        this._sueloVelZ = 0
        // Se ha parado del todo: fuera del hielo, el paso vuelve a ser el de
        // siempre **este mismo paso**, no el siguiente.
        if (!enHielo) return false
      } else {
        const k = queda / v
        this._sueloVelX *= k
        this._sueloVelZ *= k
      }
    }

    // Y el techo, que es duro como el del air-strafe.
    const vFinal = Math.hypot(this._sueloVelX, this._sueloVelZ)
    if (vFinal > tope) {
      const k = tope / vFinal
      this._sueloVelX *= k
      this._sueloVelZ *= k
    }
    return true
  }

  /**
   * **Entrar en el hielo con la marcha que traías**, no parado. Sin esto, pisar
   * una pista corriendo te dejaría quieto en el borde — que es lo contrario de
   * lo que hace el hielo.
   */
  _sembrarVelocidadDeSuelo(x, z) {
    this._sueloVelX = x
    this._sueloVelZ = z
  }

  /**
   * **Y un raspado cada tanto mientras se resbale de verdad** (norma de la
   * vuelta 82: un dispositivo nace con su voz). Sólo por encima de un umbral de
   * marcha: caminar por una pista no raspa, derrapar sí.
   */
  _raspadoDeHielo(now) {
    const cfg = MOVEMENT.hielo
    if (this._superficieDeSuelo?.tipo !== 'hielo' || this.airborne) {
      this._raspadoAt = 0
      return
    }
    const v = Math.hypot(this._sueloVelX, this._sueloVelZ)
    if (v < this.topSpeed * cfg.umbralSonido) return
    if (now < this._raspadoAt) return
    this._raspadoAt = now + cfg.pulsoMs
    this._avisarDeUso('hielo', v, 0)
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
   * **Lo mismo para la velocidad del suelo** (vuelta 83), y más simple: en el
   * suelo no hay ápice al que mirar, así que lo que frena, frena. La componente
   * bloqueada se anula y la otra sobrevive entera, que es lo que hace que rozar
   * una pared deslizando por hielo te haga seguirla en vez de pararte en seco.
   */
  _clipVelocidadDeSuelo(fromX, fromZ, wantedX, wantedZ) {
    const position = this.camera.position
    if (Math.abs(position.x - wantedX) > CLIP_EPSILON) this._sueloVelX = 0
    if (Math.abs(position.z - wantedZ) > CLIP_EPSILON) this._sueloVelZ = 0
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
    const g = this._gVuelo
    /**
     * **Con la gravedad efectiva en negativo la parábola no tiene máximo**
     * (vuelta 83): dentro de un ventilador se sube y punto. El máximo de
     * verdad está **encima del ventilador**, ya con la gravedad de siempre, y
     * sale en dos tramos — se sale por su techo con
     * `v² = v0² + 2·(−g)·(techo − y0)` y desde ahí se sube `v²/2g`.
     */
    if (g <= 0) {
      const techo = this.scenario
        ? this.scenario.techoDeVentiladorEn(this.camera.position.x, this.camera.position.z, this.feetY)
        : -Infinity
      if (!Number.isFinite(techo)) return this.feetY
      const subida = Math.max(0, techo - this._launchY)
      const vSalida = Math.sqrt(Math.max(0, v0 * v0 + 2 * -g * subida))
      return techo + (vSalida * vSalida) / (2 * this.fisica.gravity)
    }
    return this._launchY + (v0 * v0) / (2 * g)
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

    // **Y el corralito, si lo hay** (vuelta 62): la caja de la fase de compra.
    // Va **aquí y no en el servidor** por la razón de siempre: el cliente
    // predice su propio movimiento, así que un límite que sólo conociera un
    // lado sería una corrección en cada paso contra la pared invisible.
    const c = this._corralito
    if (c) {
      if (position.x > c.maxX) position.x = c.maxX
      else if (position.x < c.minX) position.x = c.minX
      if (position.z > c.maxZ) position.z = c.maxZ
      else if (position.z < c.minZ) position.z = c.minZ
      this._wallClampedX = this._wallClampedX || position.x === c.maxX || position.x === c.minX
      this._wallClampedZ = this._wallClampedZ || position.z === c.maxZ || position.z === c.minZ
    }
  }

  /**
   * **La caja dentro de la que se puede andar**, o `null` para la sala entera.
   * Hoy la pone la fase de compra del duelo; es deliberadamente tonta —cuatro
   * números y un acotado— porque lo que decide cuándo hay corralito es una regla
   * de juego, y ésa vive en `net/partida.js`.
   */
  setCorralito(caja) {
    this._corralito = caja
      ? { minX: caja.minX, maxX: caja.maxX, minZ: caja.minZ, maxZ: caja.maxZ }
      : null
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
    const impactSq = this._launchVelocity * this._launchVelocity + 2 * this._gVuelo * drop
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
    // Con la gravedad efectiva a cero o en negativo el vuelo no se acaba: se
    // está subiendo dentro de un ventilador y lo que queda es «todo».
    const g = this._gVuelo
    if (g <= 0) return Infinity
    const total = (this._launchVelocity + this._fallSpeedFrom(ground)) / g
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
    return this._launchY + this._launchVelocity * t - 0.5 * this._gVuelo * t * t
  }

  _updateVertical(dt, now) {
    // Agachado: la altura de ojos persigue su objetivo a velocidad constante.
    let targetEye = this.keys.crouch ? MOVEMENT.crouchHeight : MOVEMENT.standHeight
    /**
     * **Y no se levanta uno debajo de algo** (vuelta 83).
     *
     * Ésta es la comprobación que la vuelta 69 dejó anotada y que `slide69` [9]
     * llevaba cuatro vueltas guardando en forma de alarma: la colisión
     * horizontal sabe pasar por debajo de una pieza con la base levantada
     * (`box.bottom >= headY`), así que agacharse abre pasos — y sin esto, al
     * soltar la tecla el jugador se ponía de pie **dentro** del dintel.
     *
     * Lo que acota es **el objetivo, no la altura de ojos**, para que subir siga
     * siendo la misma interpolación de siempre: debajo del techo el objetivo es
     * más bajo y ya está. Y no baja de agachado: por debajo de eso el jugador
     * estaría metido en el suelo, y de que no se cuele por un hueco más bajo que
     * su postura se encarga la horizontal, que mide la cabeza en
     * `feetY + eyeHeight`.
     *
     * Y es el **mismo número** que usa la horizontal, que es lo que hace que los
     * dos sistemas admitan los mismos sitios: ahí la cabeza es `feetY +
     * eyeHeight`, así que el techo que deja pasar es el que deja levantarse.
     */
    if (this.scenario && targetEye > MOVEMENT.crouchHeight) {
      const p = this.camera.position
      const techo = this.scenario.techoSobre(p.x, p.z, this.feetY)
      if (techo < Infinity) {
        const hueco = techo - this.feetY - CLIP_EPSILON
        if (hueco < targetEye) targetEye = Math.max(hueco, MOVEMENT.crouchHeight)
      }
    }
    const step = MOVEMENT.crouchTransitionSpeed * dt
    if (this.eyeHeight < targetEye) this.eyeHeight = Math.min(targetEye, this.eyeHeight + step)
    else if (this.eyeHeight > targetEye) this.eyeHeight = Math.max(targetEye, this.eyeHeight - step)

    const position = this.camera.position
    const ground = this.scenario
      ? this.scenario.groundHeightAt(position.x, position.z, this.feetY)
      : 0
    // **Y sobre qué** (vuelta 80). Se lee en la línea de al lado de la consulta
    // y con la misma posición, que es la única regla que tiene ese captador.
    const superficie = this.scenario ? this.scenario.superficieDelSuelo : null

    // **Salta una pulsación, no una tecla apretada** (vuelta 68), y sólo desde
    // el suelo o dentro de la gracia de borde, así que sigue sin haber doble
    // salto posible.
    if (this._pulsacionDeSaltoViva(now) && (!this.airborne || this._enGraciaDeBorde())) {
      // **Saltar es la salida del deslizamiento** (vuelta 69), y la marcha con
      // la que se sale se decide **antes** de cerrarlo, porque cerrarlo devuelve
      // `currentSpeed` a la de agachado —la tecla sigue pulsada— y eso sería
      // saltar a 2.6 desde un gesto que se hace a 9.4.
      let marchaDeSalida = 0
      if (this.sliding) {
        marchaDeSalida = MOVEMENT.slide.keepSpeedOnJump ? this.currentSpeed : this.topSpeed
        this._terminarDeslizamiento(now)
      }
      this._takeOff(this.fisica.jumpSpeed * this.jumpFactor(now), this._isChainPress(), dt, marchaDeSalida)
      // La pulsación se gasta al despegar, y ésa es la mitad del mecanismo: una
      // pulsación despega **una vez**. Dejar SPACE apoyada ya no rebota en cada
      // aterrizaje, porque la tecla apretada no vuelve a ser un flanco.
      this._jumpPressedAt = -Infinity
    }

    if (!this.airborne) {
      /**
       * **Un ventilador que puede contigo te levanta del suelo** (vuelta 83).
       * Sin esto, quedarse de pie dentro de uno no haría nada: el empuje sólo
       * existe para quien ya está volando, y la única manera de usarlo sería
       * saltar dentro. Es la misma idea que «pisarla cuenta, no sólo caer
       * sobre ella» de la vuelta 80, aplicada a un volumen en vez de a una
       * losa. Despega con velocidad cero: lo que sube es la gravedad negativa.
       */
      if (this._gravedadEfectiva() < 0) {
        this._takeOff(0, false, dt)
        this._avisarDeUso('ventilador', -this._gVuelo, 0)
      }
    }

    if (!this.airborne) {
      // Sin salto de por medio el jugador sigue al suelo: subir una rampa es
      // pegarse a ella, y salirse de una plataforma es empezar a caer.
      if (ground >= this.feetY - 1e-6) {
        this.feetY = ground
        // **Y pisarla cuenta, no sólo caer sobre ella** (vuelta 80). Entrar
        // andando en una plataforma de rebote no produce ningún aterrizaje
        // —nunca se estuvo en el aire—, así que colgar el impulso sólo de
        // `_land` dejaba una plataforma que funciona saltando encima y no
        // pisándola, que es una diferencia que nadie decidiría.
        this._impulsarPorSuperficie(superficie, dt, false)
        return
      }
      // Se ha salido de un borde andando: cae desde parado.
      // Deslizándose vale lo mismo que saltando: el vuelo se siembra con la
      // carrera y no con el empujón, o tirarse por una cornisa sería la forma
      // barata de llegar al techo del aire.
      let marchaAlCaer = 0
      if (this.sliding) {
        marchaAlCaer = MOVEMENT.slide.keepSpeedOnJump ? this.currentSpeed : this.topSpeed
        this._terminarDeslizamiento(now)
      }
      this._takeOff(0, false, dt, marchaAlCaer)
    }

    // **Entrar o salir de un ventilador cierra la parábola y abre otra**
    // (vuelta 83). Va aquí, justo antes de evaluarla, y no en el paso
    // siguiente: evaluar con una g y anclar con otra es el salto de posición
    // que la forma cerrada existe para no tener.
    this._reanclarSiCambiaLaGravedad()
    this._rafagaDeVentilador(now)

    const g = this._gVuelo
    this._airTime += dt
    const t = this._airTime
    this.feetY = this._launchY + this._launchVelocity * t - 0.5 * g * t * t
    this.verticalVelocity = this._launchVelocity - g * t

    // Sólo se aterriza bajando. Subiendo, el suelo sólo puede estar por encima
    // si el jugador acaba de pasar sobre un bordillo, y eso no es un impacto.
    if (this.feetY <= ground && this.verticalVelocity <= 0) {
      this._land(ground, now)
      // El impulso va **después** de aterrizar y no en su lugar: `_land` es
      // quien resuelve el instante exacto del contacto, la fuerza del golpe y
      // la marcha que se traía, y un rebote necesita las tres.
      this._impulsarPorSuperficie(superficie, dt, true)
    }
  }

  /**
   * **La gravedad con la que se vuela aquí mismo** (vuelta 83).
   *
   * La del mapa menos lo que empujen los ventiladores en los que estés. Puede
   * salir **negativa**, y eso es exactamente lo que significa un ventilador que
   * puede contigo: se acelera hacia arriba.
   *
   * Se pregunta con los pies donde están ahora, una vez por paso. Sale un
   * número y no un objeto por lo mismo que `superficieDelSuelo`: esto está en
   * el bucle caliente y el bucle caliente no asigna.
   */
  _gravedadEfectiva() {
    const g = this.fisica.gravity
    if (!this.scenario?.ventiladores?.length) return g
    const position = this.camera.position
    const empuje = this.scenario.ventiladorEn(position.x, position.z, this.feetY)
    return empuje > 0 ? g - empuje : g
  }

  /**
   * **Cruzar la frontera de un ventilador re-ancla el vuelo** (vuelta 83).
   *
   * Es la pieza que hace que un empuje sostenido quepa en este motor. La
   * vertical está resuelta en **forma cerrada** desde el despegue, así que no
   * se le puede sumar una fuerza por frame —eso es integrar por Euler, y su
   * error va con el tamaño del paso, que es justo lo que la vuelta 44 quitó—.
   * Lo que se hace es tratar cada tramo como **su propia parábola**: entrar o
   * salir de un ventilador cierra la de antes y abre otra, con la posición y la
   * velocidad que había en ese instante.
   *
   * Dos consecuencias que conviene ver:
   *
   * - **Dentro de un tramo no hay error acumulado**, porque sigue siendo forma
   *   cerrada. Lo que se cuantiza al paso es **dónde cae la frontera**, y eso
   *   en este juego es un número fijo (60 Hz, vuelta 44) y el mismo en los dos
   *   extremos de una partida: cruzan en el mismo paso porque dan los mismos
   *   pasos.
   * - **Y no hace falta un campo en el protocolo.** La gravedad anclada sale de
   *   dónde estás y del mapa, que los dos lados tienen; viaja en `snapshot()`
   *   por lo mismo que `sliding` —sobrevive a un paso— y no porque haga falta
   *   comunicarla.
   */
  _reanclarSiCambiaLaGravedad() {
    const g = this._gravedadEfectiva()
    if (g === this._gVuelo) return false
    this._launchY = this.feetY
    this._launchVelocity = this.verticalVelocity
    this._airTime = 0
    this._gVuelo = g
    return true
  }

  /**
   * **Un ventilador suelta una ráfaga cada tanto mientras estés dentro**
   * (vuelta 83, norma de la 82).
   *
   * Uno que sonara una vez al entrar y luego callara no se leería como un
   * ventilador; y un bucle de verdad —arrancar y parar una fuente que dura lo
   * que dure— es maquinaria que ninguna otra voz de este juego tiene. Una
   * ráfaga cada `FANS.pulsoMs` **es** el sonido de un ventilador y sale gratis
   * con lo que ya hay.
   *
   * El reloj es el del paso y la marca **no viaja**: esto es cosmético, el
   * servidor no lo mira y una repetición de la reconciliación la tira
   * `cliente.js` con el resto del recado.
   */
  _rafagaDeVentilador(now) {
    if (this._gVuelo >= this.fisica.gravity) {
      this._rafagaAt = 0
      return
    }
    if (now < this._rafagaAt) return
    this._rafagaAt = now + FANS.pulsoMs
    this._avisarDeUso('ventilador', this.fisica.gravity - this._gVuelo, 0)
  }

  /**
   * **Lo que una superficie del mapa te hace al pisarla** (vuelta 80).
   *
   * Todo pasa por `_takeOff`, que es lo que lo hace barato y seguro: no hay un
   * camino nuevo por el modelo vertical, la parábola sigue resuelta en forma
   * cerrada —o sea idéntica a cualquier refresco— y no hay un solo campo nuevo
   * en `snapshot()`. Los dos extremos de una partida montan el mismo mapa y
   * derivan el mismo empuje **sin que viaje ningún número**, que es el patrón
   * de la física de la vuelta 72.
   *
   * @param {boolean} aterrizando si venimos de `_land` (y por tanto hay una
   *   marcha de aterrizaje que conservar) o de pisar la pieza andando.
   * @returns {boolean} si ha despegado.
   */
  _impulsarPorSuperficie(sup, dt, aterrizando) {
    if (!sup) return false

    if (sup.tipo === 'rebote') {
      // **Conserva, no multiplica**, que es la regla del salto encadenado
      // (vuelta 68): el rebote pone la vertical y la horizontal es la que
      // traías. Llegando por el aire eso es el vector del aterrizaje
      // (`chained`); llegando andando es tu marcha de suelo, que es lo que
      // siembra `_takeOff` por su cuenta.
      this._reiniciarFatiga()
      this._takeOff(sup.fuerza, aterrizando, dt)
      this._avisarDeUso('rebote', sup.fuerza, 0)
      return true
    }

    if (sup.tipo === 'velocidad') {
      this._reiniciarFatiga()
      // Despega **sin encadenar**: lo que manda es el rumbo de la plataforma,
      // no hacia dónde venías, así que sembrar con el vector del aterrizaje
      // sólo serviría para que lo pisase encima.
      this._takeOff(sup.salto, false, dt)
      /**
       * **Y lanza lo que diga el mapa, sin acotarlo al techo del aire** (vuelta
       * 82, que revierte la regla de la 80).
       *
       * Aquello decía que saltarse `airStrafeMaxSpeed` abriría un camino para
       * pasar del techo sin air-strafe. Es verdad y ya no importa, por tres
       * razones que se ven jugando: el techo de fábrica son **9.5 u/s, que es
       * la marcha de correr**, así que la plataforma apenas sacaba al jugador
       * de su propia losa; el air-strafe es una **técnica del jugador** y esto
       * es una **decisión del mapa**, que no es lo mismo y no compite con ella
       * —hay que ir a pisar la losa—; y subir el techo del mapa para poder
       * lanzar fuerte (que era la salida que ofrecía la 80) cambia de paso
       * cómo vuela **todo** el mapa, que es justo lo que no se quería.
       *
       * Sigue sin viajar ningún número: los dos extremos montan el mismo mapa
       * y derivan el mismo empuje.
       */
      const v = sup.fuerza
      // Rumbo de cámara: mira a −Z con yaw 0, así que la dirección es
      // (−sin, −cos). Es la misma conversión que dibuja su flecha.
      this._airVelX = -Math.sin(sup.rumbo) * v
      this._airVelZ = -Math.cos(sup.rumbo) * v
      this._airSpeed = v
      this._avisarDeUso('velocidad', v, sup.rumbo)
      return true
    }

    return false
  }

  /**
   * **¿Hay cable al alcance de la mano?** Lo pregunta el motor para repartir la
   * tecla contextual, y sale de **la misma función** que decide el enganche: si
   * lo mirase por su cuenta, habría dos ideas de «estoy al lado de un cable» y
   * se despegarían el día que una de las dos cambie de radio.
   */
  hayTirolinaAlAlcance() {
    if (this.enTirolina) return true
    if (!this.scenario) return false
    const p = this.camera.position
    return this.scenario.tirolinaAlAlcance(p.x, p.y, p.z) !== null
  }

  /**
   * **La tirolina** (vuelta 83). Devuelve `true` si este paso lo resuelve ella.
   *
   * Engancharse y soltarse van **por flanco** de la tecla contextual, como el
   * salto desde la 68 y el deslizamiento desde la 69: mantenerla pulsada da un
   * enganche, no un enganche por paso. Y el flanco se deduce comparando la
   * máscara de este paso con la del anterior, así que **no hace falta ni un
   * campo más en el protocolo** — los dos extremos ejecutan los mismos pasos
   * con las mismas máscaras.
   *
   * Hay tres maneras de bajarse y las tres acaban en lo mismo (`_soltarTirolina`):
   * volver a pulsar la tecla, saltar, o llegar al final del cable.
   */
  _updateTirolina(dt, now) {
    const pulsada = Boolean(this.keys.use)
    const flanco = pulsada && !this._useWasDown
    this._useWasDown = pulsada

    if (!this.enTirolina) {
      if (!flanco || !this.scenario) return false
      const p = this.camera.position
      const enganche = this.scenario.tirolinaAlAlcance(p.x, p.y, p.z)
      if (!enganche) return false
      this._engancharTirolina(enganche)
      /**
       * **Y sigue hacia abajo: el paso del enganche también avanza.**
       *
       * Gastarlo en agarrarse parecía inofensivo y no lo era, y el banco lo
       * cazó a la primera: un paso perdido es **una fracción distinta del
       * viaje según el refresco** —a 60 Hz es 1 de 90 y a 240 es 1 de 360—,
       * así que el recorrido de un cable salía con **0.84% de dispersión**
       * entre monitores. Una forma cerrada no puede permitirse eso, y la causa
       * no estaba en la fórmula sino en cuántas veces se evalúa.
       */
    } else if (flanco || this._pulsacionDeSaltoViva(now)) {
      const cable = this.scenario?.tirolinas?.[this._tiroCable]
      // **Saltar gasta la pulsación**, o el mismo flanco que te baja del cable
      // te haría saltar otra vez en el paso siguiente.
      if (!flanco) this._jumpPressedAt = -Infinity
      this._soltarTirolina(cable ?? null)
      // **Y el paso sigue siendo de aire**: `_takeOff` se ha llamado con `dt`
      // cero a propósito, así que lo de debajo da el primer paso de vuelo
      // completo y no se pierde ni uno.
      return false
    }

    const cable = this.scenario?.tirolinas?.[this._tiroCable]
    // El mapa ha cambiado debajo: se baja sin impulso, que es lo honesto —
    // conservar la velocidad de un cable que ya no existe sería inventarla.
    if (!cable) {
      this._soltarTirolina(null)
      return false
    }
    /**
     * **Se avanza en forma cerrada**, como la parábola del salto y como el
     * deslizamiento: lo recorrido sale de `velocidad · tiempo` desde el
     * enganche, no de sumar `v · dt` paso a paso. A velocidad constante los dos
     * dan casi lo mismo —casi—, y este proyecto ya sabe lo que cuesta ese
     * «casi» cuando alguien cambia de monitor.
     */
    this._tiroTime += dt * 1000
    const restante = cable.largo - this._tiroD0
    let recorrido = cable.velocidad * (this._tiroTime / 1000)
    const final = recorrido >= restante
    if (final) recorrido = restante
    this._colocarEnElCable(cable, this._tiroD0 + recorrido)
    this._poleaDeTirolina(cable, now)
    if (final) this._soltarTirolina(cable)
    /**
     * **El paso que llega al final se gasta en el cable**, y el vuelo empieza
     * en el siguiente. Es una cuantización de un paso —16.67 ms, iguales en
     * cualquier monitor porque el mundo va a 60 Hz fijos desde la vuelta 44— y
     * la alternativa era peor: dejar correr el resto del paso después de haber
     * recorrido ya su trozo de cable movería al jugador dos veces.
     */
    return true
  }

  /**
   * Agarra el cable. **Pega al jugador a él**, y eso es un salto de hasta
   * `ZIPLINES.alcanceU`: para quien te dibuja es un teletransporte, así que
   * sube `poseEpoch` — la regla de las vueltas 44 y 50, que existe justo para
   * que un salto no se dibuje como un barrido.
   */
  _engancharTirolina(enganche) {
    const cable = this.scenario.tirolinas[enganche.i]
    this._pararDeslizamiento()
    this.enTirolina = true
    this._tiroCable = enganche.i
    this._tiroD0 = enganche.d0
    this._tiroTime = 0
    this._poleaAt = 0
    /**
     * **Colgado cuenta como estar en el aire**, y no es un detalle de
     * implementación: la dispersión de disparo del juego se aplica «siempre en
     * el aire», y disparar desde una tirolina tiene que costar lo que cuesta
     * disparar en movimiento. Lo que no hay es parábola — de eso se encarga el
     * `return` de `_updateTirolina`.
     */
    this.airborne = true
    this.verticalVelocity = 0
    this._airTime = 0
    this._launchVelocity = 0
    this._gVuelo = this.fisica.gravity
    this._airSpeed = 0
    this._airVelX = 0
    this._airVelZ = 0
    this._sueloVelX = 0
    this._sueloVelZ = 0
    this.poseEpoch += 1
    this._colocarEnElCable(cable, enganche.d0)
    this._launchY = this.feetY
    this._avisoDeCable('tirolina', cable)
  }

  /**
   * Suelta el cable. **Conserva su velocidad**, la vertical en la parábola y la
   * horizontal en el vector del aire.
   *
   * No es la regla del deslizamiento —que siembra el vuelo con tu carrera y no
   * con su empujón de 9.43— y la diferencia no es de gusto: allí lo que se
   * evitaba era que una **técnica del jugador** (el air-strafe) rematara por
   * encima del techo lo que otra técnica había dado. Aquí la velocidad **la
   * decide el mapa**, exactamente como en la plataforma de la vuelta 82, y el
   * techo del aire no la acota por la misma razón que allí.
   */
  _soltarTirolina(cable) {
    this.enTirolina = false
    this._tiroCable = -1
    this._tiroD0 = 0
    this._tiroTime = 0
    if (!cable) return
    const v = cable.velocidad
    // Un empuje del mapa no es un salto tuyo, así que no gasta fatiga.
    this._reiniciarFatiga()
    // `dt` cero: quien llama decide si el resto del paso es de vuelo.
    this._takeOff(cable.dirY * v, false, 0)
    this._airVelX = cable.dirX * v
    this._airVelZ = cable.dirZ * v
    this._airSpeed = Math.hypot(this._airVelX, this._airVelZ)
    this._avisoDeCable('tirolina', cable)
  }

  /**
   * El aviso de un cable, **en el punto del cable y no en los pies**. Los pies
   * de quien va colgado están metro y medio por debajo, así que el aro saldría
   * flotando bajo la polea.
   */
  _avisoDeCable(tipo, cable) {
    const p = this.camera.position
    const y = this.feetY + this.eyeHeight + ZIPLINES.caidaU
    this._avisarDeUso(tipo, cable.velocidad, rumboDeCable(cable), p.x, y, p.z)
  }

  /** Dónde queda el jugador colgado del punto `d` del cable. */
  _colocarEnElCable(cable, d) {
    const p = this.camera.position
    p.x = cable.desde.x + cable.dirX * d
    p.z = cable.desde.z + cable.dirZ * d
    const y = cable.desde.y + cable.dirY * d
    // `feetY` es lo que `update()` convierte en altura de cámara al cerrar el
    // paso, así que la caída se resta aquí una sola vez.
    this.feetY = y - ZIPLINES.caidaU - this.eyeHeight
  }

  /**
   * **El traqueteo de la polea**, una ráfaga cada `ZIPLINES.pulsoMs`. Es la
   * misma idea que el pulso del ventilador y por el mismo motivo: un bucle de
   * verdad —arrancar y parar una fuente— es maquinaria que este proyecto no
   * tiene en ninguna otra voz, y un cable que sólo suena al agarrarlo no se
   * lee como un cable.
   *
   * Va por el reloj del mundo, así que en pausa no suena; y **no pisa un aviso
   * que ya hubiera**, porque el enganche y el primer traqueteo pueden caer en
   * el mismo paso y de los dos el que cuenta es el enganche.
   */
  _poleaDeTirolina(cable, now) {
    if (now < this._poleaAt) return
    this._poleaAt = now + ZIPLINES.pulsoMs
    if (this.usoDeDispositivo) return
    this._avisoDeCable('tirolina-viaje', cable)
  }

  /**
   * Un empuje del mapa no es un salto tuyo, así que no gasta fatiga. Sin esto,
   * rebotar tres veces seguidas en la misma plataforma la iría apagando —la
   * fatiga cuenta vuelos parados— y el mapa dejaría de funcionar a la cuarta.
   */
  _reiniciarFatiga() {
    this._stillJumps = 0
  }

  /**
   * Deja el recado de que un dispositivo acaba de actuar, en el sitio donde ha
   * pasado. Un objeto por uso y no por paso: un uso es un suceso raro —pisar
   * una losa—, no algo del bucle caliente.
   */
  _avisarDeUso(tipo, fuerza, rumbo, x = this.camera.position.x, y = this.feetY, z = this.camera.position.z) {
    this.usoDeDispositivo = { tipo, fuerza, rumbo, x, y, z }
  }

  /** El uso que dejó el último paso, **una sola vez**. Lo consume el motor. */
  consumirUsoDeDispositivo() {
    const uso = this.usoDeDispositivo
    this.usoDeDispositivo = null
    return uso
  }

  /**
   * **Un teletransporte cambia dónde estás, no cómo vas** (vuelta 80).
   *
   * Se comprueba al final del paso, cuando la posición ya es la definitiva, y
   * **entra por flanco**: mientras sigas dentro de un área no vuelve a
   * disparar, o aparecer encima de la salida de al lado sería un bucle. El
   * flanco es un booleano y viaja en `snapshot()` por la razón de siempre —es
   * estado que sobrevive a un paso— igual que la máscara de agachado del
   * deslizamiento.
   *
   * Tres cosas que son el diseño:
   *
   * - **Sube `poseEpoch`.** Es lo que hace que el rival lo vea como un salto en
   *   su instante exacto y no como un barrido por medio mapa (vueltas 44 y 50).
   *   Sin esto se dibujaría recorriendo posiciones en las que nadie estuvo.
   * - **La parábola se re-ancla.** Quien llega por el aire sigue volando, así
   *   que `_launchY` y el reloj del vuelo pasan a ser los del sitio nuevo: la
   *   forma cerrada se evalúa desde el despegue, y dejarlo como estaba sería
   *   evaluar una caída que empezó en otro sitio.
   * - **Y el rumbo lo pide, no lo escribe.** El dueño del rumbo es
   *   `LookControls` (vuelta 66): escribir `camera.rotation.y` desde aquí lo
   *   reescribiría el ratón en el paso siguiente. Se publica y lo aplica quien
   *   tiene los controles; el servidor no tiene ninguno y no lo necesita,
   *   porque el rumbo le llega en la entrada del cliente.
   */
  _comprobarTeletransporte() {
    if (!this.scenario?.teletransportes?.length) return
    const position = this.camera.position
    const tp = this.scenario.teletransporteEn(position.x, position.z, this.feetY)
    if (!tp) {
      this._enTeletransporte = false
      return
    }
    if (this._enTeletransporte) return
    this._enTeletransporte = true

    // De dónde salía, que es la mitad del efecto: el anillo que se cierra.
    const desdeX = position.x
    const desdeY = this.feetY
    const desdeZ = position.z

    position.x = tp.destino.x
    position.z = tp.destino.z
    const suelo = this.scenario.groundHeightAt(position.x, position.z, 0)
    this.feetY = this.airborne ? Math.max(this.feetY, suelo) : suelo
    if (this.airborne) {
      this._launchY = this.feetY
      this._launchVelocity = this.verticalVelocity
      this._airTime = 0
    }
    this.poseEpoch += 1
    this.rumboPedido = tp.destino.yaw
    // Los dos extremos: el gesto de entrar y el de salir son el mismo al
    // revés, y por eso se dibujan los dos (la regla del anillo de la 80 —
    // llegar sin saber dónde has llegado es lo mismo que no verlo salir).
    this._avisarDeUso('puerta', 0, tp.destino.yaw)
    this.usoDeDispositivo.desdeX = desdeX
    this.usoDeDispositivo.desdeY = desdeY
    this.usoDeDispositivo.desdeZ = desdeZ
  }

  /**
   * El rumbo que pidió el último teletransporte, **una sola vez**. Lo consume
   * quien tiene los controles de la cámara.
   */
  consumirRumboPedido() {
    const yaw = this.rumboPedido
    this.rumboPedido = null
    return yaw
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
   * **El deslizamiento**, entero: cuándo empieza, cuándo acaba y nada más.
   *
   * Corre **antes** que la horizontal porque decide con qué marcha y hacia
   * dónde se mueve este paso. Con el interruptor apagado es esta línea y ya:
   * no hay ningún otro sitio del juego que pregunte por el deslizamiento.
   *
   * **Empieza en el flanco de la tecla de agachado**, no mientras esté pulsada,
   * que es la misma regla que el salto desde la vuelta 68 y por el mismo
   * motivo: si no, agacharse y correr sería deslizarse sin parar.
   */
  _updateSlide(dt, now) {
    const cfg = MOVEMENT.slide
    if (!cfg.enabled) return

    const agachado = this.keys.crouch
    const flanco = agachado && !this._crouchWasDown
    this._crouchWasDown = agachado

    if (this.sliding) {
      // Tres finales, y ninguno necesita saber por qué: soltar la tecla, que se
      // acabe el tiempo, o dejar el suelo. El cuarto —saltar— lo cierra
      // `_updateVertical`, que es quien despega.
      //
      // **El tiempo se mira antes de sumar el paso**, a propósito: así el paso
      // que cruza el final sigue siendo un paso de deslizamiento, y el avance
      // —que se calcula acotando el reloj a la duración— recorre exactamente lo
      // que faltaba y ni una unidad más. Sumando primero, ese último trozo se
      // perdería, y lo que se perdiera dependería del refresco.
      if (!agachado || this.airborne || this._slideTime * 1000 >= cfg.durationMs) {
        this._terminarDeslizamiento(now)
        return
      }
      this._slideTime += dt
      return
    }

    if (!flanco || this.airborne) return
    if (now - this._slideEndedAt < cfg.cooldownMs) return
    /**
     * **La marcha que se exige es la de antes de agacharse.** En el paso del
     * flanco la tecla ya está pulsada, así que `currentSpeed` devolvería la de
     * agachado (2.6) y no se podría entrar nunca. Y se compara contra **tu**
     * carrera, no contra un número suelto: el peso del arma se va en la
     * división y un rifle se desliza igual que una pistola.
     */
    const marchaSinAgachar = (this.keys.walk ? MOVEMENT.walkSpeed : MOVEMENT.speed) * this.loadFactor
    if (marchaSinAgachar < cfg.minSpeedFactor * this.topSpeed) return
    // Y hay que ir a algún sitio: la dirección del deslizamiento es la que se
    // pide en el instante de entrar, y sin teclas no hay ninguna.
    if (!this._readWish()) return

    this.sliding = true
    this._slideTime = 0
    this._slideDirX = this._wishX
    this._slideDirZ = this._wishZ
    this._slideSpeed0 = cfg.boostFactor * this.topSpeed
  }

  /**
   * La marcha del deslizamiento en este instante: **una recta**, no una
   * integración. Va del empujón de entrada a la marcha de agachado en
   * `durationMs`, así que la desaceleración sale de despejarla y un
   * deslizamiento mide lo mismo a 60 que a 240 Hz —y seguiría midiendo lo mismo
   * si un día el servidor simulara a otro ritmo, que es para lo que la forma
   * cerrada existe en esta casa—.
   */
  _velocidadDeDeslizamiento() {
    const total = MOVEMENT.slide.durationMs / 1000
    const fin = MOVEMENT.crouchSpeed * this.loadFactor
    if (!(total > 0)) return fin
    const t = this._slideTime > total ? total : this._slideTime
    const v = this._slideSpeed0 - ((this._slideSpeed0 - fin) / total) * t
    return v > fin ? v : fin
  }

  /**
   * **Cuánto avanza este paso**, en forma cerrada. La distancia recorrida en
   * `t` con una velocidad que baja en línea recta es
   * `d(t) = v0·t − ½·a·t²`, y lo del paso es `d(t) − d(t − dt)`. El reloj se
   * acota a la duración por los dos lados, así que el paso que cruza el final
   * recorre justo lo que quedaba: la suma telescopa a `d(duración)` **sea cual
   * sea el tamaño del paso**.
   */
  _avanceDeDeslizamiento(dt) {
    const total = MOVEMENT.slide.durationMs / 1000
    if (!(total > 0)) return 0
    const fin = MOVEMENT.crouchSpeed * this.loadFactor
    const a = (this._slideSpeed0 - fin) / total
    const d = (t) => {
      const c = t < 0 ? 0 : t > total ? total : t
      return this._slideSpeed0 * c - 0.5 * a * c * c
    }
    return d(this._slideTime) - d(this._slideTime - dt)
  }

  /** Cierra el deslizamiento y arranca su enfriamiento. */
  _terminarDeslizamiento(now) {
    if (!this.sliding) return
    this.sliding = false
    this._slideTime = 0
    this._slideEndedAt = now
  }

  /**
   * Borra el deslizamiento **sin** enfriamiento, que es otra cosa: lo llaman la
   * reaparición y la red de seguridad de `_guardState`. Un teletransporte no
   * deja a medias un gesto, lo cancela; y cobrar el enfriamiento de un
   * deslizamiento que el jugador no llegó a hacer sería castigarle por morirse.
   */
  _pararDeslizamiento() {
    this.sliding = false
    this._slideTime = 0
    this._slideDirX = 0
    this._slideDirZ = 0
    this._slideSpeed0 = 0
    this._slideEndedAt = -Infinity
    this._crouchWasDown = false
  }

  /**
   * **¿Hay una pulsación de salto sin gastar y todavía fresca?**
   *
   * Es la pregunta que sustituye a «¿está SPACE apretada?» (vuelta 68). Una
   * pulsación se anota con su instante —el del evento jugando, el del paso por
   * la red— y se gasta poniéndola a `-Infinity` al despegar, así que mantener
   * la tecla no produce ningún salto más: para saltar otra vez hay que soltar y
   * volver a pulsar, que es lo que un flanco significa.
   *
   * Y vive `MOVEMENT.jumpBufferMs` porque pulsar un pelo antes de tocar el
   * suelo es lo normal, no un error: el flanco cae en el aire y sin memoria se
   * perdería. La edad puede salir **negativa** —el `now` de un paso es un resto
   * por detrás del frame en que se atendió la tecla—, y eso es una pulsación
   * más fresca todavía.
   */
  _pulsacionDeSaltoViva(now) {
    return now - this._jumpPressedAt <= MOVEMENT.jumpBufferMs
  }

  /**
   * **Gracia de borde** (*coyote time*): salirse de una superficie andando no
   * quita el salto de inmediato.
   *
   * No hace falta una marca aparte para saber que este vuelo salió de un borde:
   * es el **único** que despega con velocidad vertical cero (`_takeOff(0)` en
   * `_updateVertical`), porque cualquier salto de verdad arranca con
   * `jumpSpeed` por su factor de fatiga, que tiene suelo. Un campo menos es
   * también un campo menos que serializar en `snapshot()`, o sea un campo menos
   * que pueda desincronizar a los dos extremos de una partida en red.
   */
  _enGraciaDeBorde() {
    return (
      this.airborne &&
      this._launchVelocity === 0 &&
      this._airTime * 1000 <= MOVEMENT.coyoteMs
    )
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
  _takeOff(velocity, chained = false, dt = 0, marchaForzada = 0) {
    // `currentSpeed` se lee **antes** de marcar `airborne`, así que devuelve la
    // marcha de suelo: es la que se congela (escalar) o la que siembra el
    // vector. `marchaForzada` es la puerta de un solo uso del deslizamiento
    // (vuelta 69): quien despega desde uno no se lleva sus 9.43 u/s, se lleva
    // su carrera. Va como argumento y no como campo a propósito — se gasta en
    // el mismo paso, así que no hay nada que guardar ni que mandar por la red.
    const marcha = chained ? this._landingSpeed : marchaForzada || this.currentSpeed
    this._airSpeed = marcha
    if (chained) {
      this._airVelX = this._landingVelX
      this._airVelZ = this._landingVelZ
    } else {
      this._seedAirVelocity(marcha)
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
    // Se despega con la gravedad que toque **aquí**: dentro de un ventilador,
    // la suya. Sin esto el primer tramo del vuelo se evaluaría con la del mapa
    // y el re-anclaje del paso siguiente lo corregiría de golpe.
    this._gVuelo = this._gravedadEfectiva()
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
    // La g del vuelo que acaba, no la del mapa: quien cae dentro de un
    // ventilador cae más despacio, y el instante exacto del contacto —que es
    // lo que esta función despeja— sale de la parábola que se estaba volando.
    const g = this._gVuelo
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
    // Escribiendo en un campo no se juega: ver `typingInField`.
    if (!this.enabled || event.repeat || typingInField()) return
    const action = this.keyMap.get(event.code)
    if (!action) return
    // Corta el scroll con espacio y flechas. No alcanza a Ctrl+W: ese atajo se
    // lo queda Chrome (ver el comentario de KEYBINDS en config.js).
    event.preventDefault()
    this.input[action] = true
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
    //
    // **Y no se escribe cuando la entrada va separada** (vuelta 68), que es
    // decir «cuando hay alguien reejecutando mis entradas»: ahí el reloj del
    // mundo es el **número de paso** y este `timeStamp` es del reloj local, dos
    // números sin nada que ver. Antes daba igual porque lo único que decidía
    // esta marca era si el salto encadenaba, y `_aplicar` la pisaba con la
    // buena antes de que nadie la usara; desde que es **la marca que despega**,
    // una de reloj ajeno es un salto por paso o ninguno, según qué reloj vaya
    // por delante. Por la red la pone `pressJump`, que es su sitio.
    if (action === 'jump' && this.keys === this.input) {
      this._jumpPressedAt =
        Number.isFinite(event.timeStamp) && event.timeStamp > 0
          ? event.timeStamp
          : performance.now()
    }
  }

  _onKeyUp(event) {
    if (typingInField()) return
    const action = this.keyMap.get(event.code)
    if (!action) return
    // El keyup se atiende siempre, incluso con los controles ya desactivados:
    // si no, una tecla soltada durante la pausa se quedaría marcada.
    this.input[action] = false
  }
}
