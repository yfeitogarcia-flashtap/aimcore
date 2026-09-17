/**
 * Motor del prototipo: render, sesión, input y detección de aciertos.
 *
 * Vive completamente fuera de React. React sólo pinta el HUD y recibe avisos
 * por callback, de modo que el bucle de render nunca provoca re-renders.
 *
 * Contrato de rendimiento del bucle:
 *  - Un único `requestAnimationFrame`, atado al refresco real del monitor.
 *  - Nada de alocaciones ni de creación de geometría por frame.
 *  - El único trabajo por frame es: animar los pops, comprobar el reloj y
 *    renderizar.
 */

import * as THREE from 'three'
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import {
  ACCURACY,
  ACTION_PANEL,
  AVATAR,
  CAMERA,
  COVER,
  FOOTSTEPS,
  FRAME_LIMITS,
  OBJECTIVE,
  MOVEMENT,
  HELP,
  IMPACTS,
  PLAYER,
  RECOIL_RESET_MS,
  RENDER,
  SECONDARY_WEAPON,
  DEATHMATCH_DURATIONS,
  SESSION_DURATION_S,
  SESSION_MODES,
  SIM,
  NET,
  SIM_STEP_MS,
  TARGET,
  TEAMS,
  WEAPONS,
  weaponSpeedFactor,
} from '../config.js'
import { createScene } from './scene.js'
import { Scenario } from './scenario.js'
import { Objective, OUTCOME } from './objective.js'
import { computeScore } from './scoring.js'
import { createSceneTransition } from './transition.js'
import { LookControls } from './lookControls.js'
import { MovementController } from './movement.js'
import { TargetManager } from './targets.js'
import {
  initAudio,
  playDamage,
  playFootstep,
  playHeal,
  playHelmetCrack,
  playHit,
  playKill,
  playLanding,
  playObjectiveDefused,
  playObjectiveExplosion,
  playShieldCharge,
  playUiConfirm,
} from '../audio/sfx.js'
import { loadWeaponSamples, playDrySound, playWeaponReload, playWeaponShot } from '../audio/samples.js'
import { attachListener, createEmitter, detachListener, setSpatialEnabled } from '../audio/spatial.js'
import { ActionPanel } from './actionPanel.js'
import { Avatar } from './avatar.js'
import { EnemyFire } from './enemyFire.js'
import { DummyMarkers, facingDesdeCamara } from './markers.js'
import { MuzzleFlash } from './muzzleFlash.js'
import { Impacts } from './impacts.js'
import { PickupField } from './pickups.js'
import { PlayerStatus, playerBody } from './player.js'
import { getSettings, subscribeSettings, updateSettings } from '../settings.js'
import { eventCode, getKeybinds, keysOf, subscribeKeybinds, typingInField } from '../keybinds.js'

/** Centro exacto de la pantalla: el crosshair no se mueve, así que es constante. */
const SCREEN_CENTER = new THREE.Vector2(0, 0)

const DEG_TO_RAD = Math.PI / 180

// Vectores de módulo para desviar el rayo: el disparo no aloca nada.
const _spreadU = new THREE.Vector3()
const _spreadV = new THREE.Vector3()
const _spreadUp = new THREE.Vector3(0, 1, 0)
const _spreadFallback = new THREE.Vector3(1, 0, 0)
/** Hacia dónde mira la cámara, para saber de qué lado te han disparado. */
const _bearingForward = new THREE.Vector3()
/**
 * Lo que devuelve `_superficieBajoElRayo`, reutilizado: el bucle caliente no
 * asigna, y esto se consume en el acto.
 */
const _impacto = { punto: new THREE.Vector3(), normal: new THREE.Vector3(), distancia: 0 }
const _normales = new THREE.Matrix3()
const _dir = new THREE.Vector3()

/**
 * **La fase de un rival real, que hoy no existe** (vuelta 56). `markers.js`
 * pide quién está en alerta y quién disparando, y eso es el estado de la
 * máquina de `enemyFire`: una persona no la tiene. Deducirlo desde fuera
 * mirando relojes sería la segunda copia que la vuelta 37 se negó a tener, así
 * que los dos iconos se quedan apagados hasta que el disparo del rival viaje en
 * la foto. La brújula y la ficha no dependen de esto.
 */
const _sinFase = () => 'idle'

/**
 * Desvía una dirección un ángulo aleatorio dentro de un cono de `spreadDeg`.
 *
 * Se aplica **al rayo, no a la cámara**: la dispersión es una desviación del
 * disparo, no un temblor de la mira. El retroceso sí mueve la cámara, así que
 * al desviar la dirección que ya lleva ese empuje los dos offsets se suman.
 *
 * @param {THREE.Vector3} direction se modifica en el sitio; queda normalizada
 */
function applySpread(direction, spreadDeg) {
  const theta = Math.random() * spreadDeg * DEG_TO_RAD
  if (theta <= 0) return
  const phi = Math.random() * Math.PI * 2

  // Base ortonormal perpendicular a la dirección de tiro.
  const reference = Math.abs(direction.y) > 0.99 ? _spreadFallback : _spreadUp
  _spreadU.crossVectors(reference, direction).normalize()
  _spreadV.crossVectors(direction, _spreadU).normalize()

  const sin = Math.sin(theta)
  direction
    .multiplyScalar(Math.cos(theta))
    .addScaledVector(_spreadU, sin * Math.cos(phi))
    .addScaledVector(_spreadV, sin * Math.sin(phi))
    .normalize()
}

export const PHASE = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  FINISHED: 'finished',
}

export class Engine {
  /**
   * **¿Admite esta plataforma el movimiento sin ajustar?** Se descubre al
   * primer intento y se recuerda para todos: es una propiedad del navegador, no
   * de una partida. Ver `requestLock`.
   */
  static _sinMovimientoCrudo = false

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{
   *   onPhaseChange?: (phase: string) => void,
   *   onFrame?: (stats: object) => void,
   *   onShot?: (hit: boolean) => void,
   *   onFinish?: (summary: object) => void,
   * }} callbacks
   */
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [callbacks]
   * @param {{escenario?: string}} [opciones] `escenario` **fija** el mapa y deja
   *   fuera el ajuste del jugador. Lo usa el duelo, que siempre juega el Plano A.
   */
  constructor(canvas, callbacks = {}, opciones = {}) {
    this.canvas = canvas
    this.callbacks = callbacks
    /**
     * **El escenario del duelo no es una preferencia del jugador** (vuelta 60).
     * Hasta la 58 la página del duelo lo conseguía llamando a `updateSettings`
     * antes de construir el motor, y eso tenía dos precios que se pagaban
     * callando: **le reescribía al jugador su escenario guardado** en cada
     * visita a un enlace de duelo —que es la mitad del «no se guarda la
     * configuración» que se veía jugando— y dejaba el mapa colgando del store,
     * así que cualquier cambio de ajuste en mitad de un duelo (la **V** del
     * silenciador, sin ir más lejos) reconstruía el escenario al del jugador
     * **en mitad de la partida**.
     *
     * Con esto el duelo dice qué mapa juega y no toca nada de nadie.
     */
    this._escenarioFijo = opciones.escenario ?? null

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: RENDER.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio))

    const { scene, setRoom, dispose: disposeScene } = createScene()
    this.scene = scene
    this._setRoom = setRoom
    this._disposeScene = disposeScene

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)

    this.controls = new LookControls(this.camera)

    // El escenario se monta antes que el movimiento: de él salen la colisión y
    // el punto de aparición.
    this.scenario = new Scenario(this.scene, this._escenarioFijo ?? getSettings().scenario)
    // La sala la manda el escenario: la grilla y las paredes se montan a su
    // medida, y con ellas el límite real de movimiento.
    this._setRoom(this.scenario.room)

    this.movement = new MovementController(this.camera)
    this.movement.setScenario(this.scenario)
    this.movement.reset()
    // Con la variante de movimiento activa el cono deja de seguir la mirada:
    // nace en la posición del jugador y apunta a una dirección fija del mundo.
    this.targets = new TargetManager(this.scene, getSettings(), {
      anchoredAxis: MOVEMENT.enabled,
    })
    this.raycaster = new THREE.Raycaster()

    // Capa CSS3D: escena propia y renderizador propio, montados sobre el
    // canvas y con los eventos de puntero desactivados —el panel se dispara,
    // no se pulsa—.
    this.cssScene = new THREE.Scene()
    this.cssRenderer = new CSS3DRenderer()
    const cssElement = this.cssRenderer.domElement
    cssElement.className = 'app__css3d'
    // El único contrato con el motor es run(build): cómo se presente el cambio
    // es asunto exclusivo del módulo. Ver src/game/transition.js.
    this.transition = createSceneTransition({
      host: canvas.parentElement ?? document.body,
      scene: this.scene,
      camera: this.camera,
    })

    this.objective = new Objective(this.scene, COVER.heights)
    this.objective.setSites(this.scenario.objectiveSites)

    /**
     * **El jugador como blanco.** Vida, escudo, casco y reaparición; el módulo
     * no sabe de motor y el motor no sabe de fórmulas de daño.
     */
    this.status = new PlayerStatus()
    /** Los muñecos disparando, y los recogibles que hacen falta para aguantarlo. */
    /** El fogonazo de cada disparo enemigo. Sólo dibuja: el aviso viene de fuera. */
    this.muzzleFlash = new MuzzleFlash(this.scene)
    /**
     * **Las marcas de bala**, que son del motor y no de un modo (vuelta 64):
     * el mismo pool dibuja el disparo que se come la Espina entrenando y el que
     * se la come en un duelo. El pool se monta una vez y no depende de cuántos
     * muñecos haya, porque una marca es de la **superficie**, no de quien
     * dispara.
     */
    this.impacts = new Impacts(this.scene)
    this.impacts.build()
    this.enemyFire = new EnemyFire(
      this.scene,
      (hit) => this._onPlayerHit(hit),
      (x, y, z, now) => this.muzzleFlash.flash(x, y, z, now),
    )
    /** Brújula e iconos de estado sobre cada muñeco. Sólo dibuja; no decide. */
    this.markers = new DummyMarkers(this.scene, this.cssScene)
    // Enlazado una vez: pasarlo como flecha en el bucle sería una función nueva
    // por frame, y el bucle caliente no aloca.
    this._enemyPhase = (instance, now) => this.enemyFire.phaseOf(instance, now)
    this.pickups = new PickupField(this.scene, COVER.heights, (kind) => this._collect(kind))
    this.pickups.setSites(this.scenario.pickupSites)
    this.enemyFire.setOccluders(this.scenario.occluders)
    this.markers.setOccluders(this.scenario.occluders)
    /** Mando del zumbido de carga, mientras dure. */
    this._shieldSound = null

    this.actionPanel = new ActionPanel(this.scene, this.cssScene)
    this.actionPanel.setAnchor(this.scenario.spawn, this.scenario.room)
    this.targets.setRoutes(this.scenario.routes, this.scenario.points, this.scenario.occluders, this.scenario.room)
    /**
     * Asignación de teclas vigente. El motor la lee para sus acciones y se la
     * empuja al movimiento, igual que hace con los ajustes: los subsistemas no
     * van a buscar el store por su cuenta.
     */
    this._binds = getKeybinds()
    this.movement.setKeybinds(this._binds)
    this._unsubscribeKeybinds = subscribeKeybinds((binds) => {
      this._binds = binds
      this.movement.setKeybinds(binds)
    })

    /** Última activación del panel, para el antirrebote. */
    this._lastPanelActionAt = -Infinity
    /** Si la pulsación en curso ya se gastó en el panel, no dispara. */
    this._triggerConsumedByPanel = false

    /**
     * **La partida en red, o null.** Lo pone `usarRed()` antes de `start()`, y
     * de él cuelga todo lo que la vuelta 56 saca del motor: quién decide el
     * movimiento, el disparo, la vida y la reaparición.
     */
    this.net = null
    /** El cuerpo del rival y su época de pose, para no interpolar un salto. */
    this._rivalAvatar = null
    /** Adaptador rival→instancia para `markers`. Ver `_syncRival`. */
    this._rivalInstancia = null
    /** Vida del servidor en la foto anterior, para saber si te han dado. */
    this._vidaPrevia = PLAYER.maxHealth
    /** ¿Estaba abatido en el frame anterior? Para no repetir el abatimiento. */
    this._abatidoEnRed = false

    this.phase = PHASE.IDLE
    this.durationMs = SESSION_DURATION_S * 1000
    /**
     * **El modo de la sesión** (`SESSION_MODES`): `timed` es la ronda con
     * cronómetro —y con explosivo, donde lo haya— y `deathmatch` es el
     * escenario sin bomba, que dura lo que diga su ajuste.
     */
    this.mode = 'timed'
    this._pendingMode = 'timed'
    /**
     * **El reloj del mundo.** Milisegundos de *juego*: avanza con el delta del
     * frame **sólo mientras se juega**, así que en pausa no se mueve. De él
     * cuelgan todos los tiempos del combate —cadencia y recarga del arma,
     * visión, reacción y ráfagas de los muñecos, apariciones, pops— para que
     * pausar congele el mundo entero y no sólo las partes que se acordaron de
     * usar el delta.
     *
     * El de fuera (`performance.now()`) se queda donde tiene que estar: el
     * limitador de FPS, la media de frames y el movimiento, que compara contra
     * el `timeStamp` de los eventos del navegador y **tiene** que ir en el mismo
     * origen de tiempos que ellos.
     */
    this.gameTime = 0
    /**
     * Sesión sin cronómetro: no termina sola, la cierra el jugador. Se deriva
     * del modo y su duración, y sigue significando **sólo** eso, que es lo que
     * leen el HUD y el resumen.
     */
    this.endless = false
    this.elapsedMs = 0
    this.shots = 0
    this.hits = 0
    this.kills = 0

    /**
     * **Dos ranuras, y la pistola no se elige.** La principal es la del ajuste
     * `weapon` y sale con la tecla 1; la secundaria va siempre puesta y sale
     * con la 2. `weaponKey` sigue siendo el arma vigente, que es lo que lee
     * todo lo demás —las RPM, el retroceso, el silenciador—: la ranura sólo
     * dice de dónde salió.
     */
    this.slots = { primary: getSettings().weapon, secondary: SECONDARY_WEAPON }
    this.slot = 'primary'
    /**
     * **El arma que dejas se queda como estaba.** Aquí se guarda el cargador de
     * la que no llevas encima y **lo que le faltaba de recarga**, no la fecha en
     * la que acababa: una recarga no avanza en la espalda, se reanuda donde se
     * quedó al volver a equiparla. Con una fecha absoluta, cambiar de arma
     * cinco segundos sería recargar gratis — el mismo agujero que ya se cerró
     * con la cuenta atrás del explosivo.
     */
    this._stowed = {}

    /** Arma vigente y estado de la ráfaga en curso. */
    this.weaponKey = this.slots.primary
    this._triggerHeld = false
    this._lastShotAt = -Infinity
    /** Momento en el que toca el siguiente disparo, según las RPM del arma. */
    this._nextShotAt = -Infinity
    /** Disparos consecutivos de la ráfaga: indexa el patrón de retroceso. */
    this._sprayIndex = 0

    /** Cargador y recarga. */
    this.ammo = 0
    this.reloadEndsAt = 0
    this.reloadStartedAt = 0
    /** Si ya se avisó de munición baja en este cargador, para no repetirlo. */
    this._lowAmmoWarned = false
    this.suppressorEnabled = false
    this.helpMessagesEnabled = true

    /** Tecla de desactivar mantenida. */
    this._defuseHeld = false
    /** Marcador abierto: la tecla del marcador está pulsada ahora mismo. */
    this._scoreboardHeld = false
    /** Desenlace del explosivo de la sesión, o null si no hubo explosivo. */
    this.objectiveOutcome = null

    // Objeto de estadísticas reutilizado: el HUD lo lee sin que se genere
    // basura en cada frame.
    this.stats = {
      phase: this.phase,
      fps: 0,
      endless: false,
      timeLeftMs: this.durationMs,
      hits: 0,
      misses: 0,
      shots: 0,
      kills: 0,
      accuracy: 0,
      ammo: 0,
      magazine: 0,
      reloading: false,
      reloadProgress: 0,
      /** El cronómetro cuenta hacia arriba: práctica libre y modo escenario. */
      countUp: false,
      /** Hay puntuación por estrellas que enseñar. */
      scoring: false,
      stars: 5,
      /** Marcador abierto, y lo que enseña. */
      scoreboard: false,
      nick: PLAYER.nick,
      deaths: 0,
      /** Estado del jugador. Sólo tiene sentido con muñecos que disparan. */
      combat: false,
      health: PLAYER.maxHealth,
      maxHealth: PLAYER.maxHealth,
      shield: 0,
      shieldSegments: 0,
      maxSegments: 3,
      charges: 0,
      helmet: false,
      applying: false,
      applyProgress: 0,
      alive: true,
      respawnLeftMs: 0,
      respawnMs: PLAYER.respawn.baseMs,
      /** Segundos de gracia que quedan tras reaparecer. */
      invulnerableLeftMs: 0,
      invulnerableMs: PLAYER.respawn.invulnerableMs,
      lowHealth: false,
    }

    this._rafId = 0
    this._lastFrameTime = 0
    this._running = false

    /** Intervalo objetivo entre fotogramas, en ms. Cero = sin límite. */
    this._frameIntervalMs = 0
    /** Acumulador del limitador: reparte los ticks de rAF entre fotogramas. */
    this._frameAccumulator = 0
    this._lastRafTime = 0

    /**
     * **El acumulador del mundo** (vuelta 44). Mismo mecanismo que el limitador
     * de fotogramas —sumar el tiempo real, descontar un intervalo cada vez que
     * toca y **guardar el sobrante**—, sólo que aquí lo que se reparte son
     * pasos de simulación y no dibujados.
     */
    this._simAccumulator = 0
    /**
     * Reloj del mundo, en el origen de tiempos de `performance.now()`. Avanza
     * de paso en paso, así que el final del último paso queda un
     * `_simAccumulator` por detrás de este frame. **No es un reloj aparte**: es
     * un instante real, y por eso el aterrizaje que se despeja de la parábola
     * se compara sin traducir con el `timeStamp` de un evento de teclado.
     */
    this._simTime = 0

    /**
     * **Las dos poses entre las que se dibuja.** La simulación va a 60 Hz y el
     * monitor puede ir a 240: sin interpolar, la cámara daría cuatro pasos
     * iguales y uno de salto. `_simPrev` es dónde estaba el jugador al empezar
     * el último paso, `_simCurr` dónde acabó, y lo que se dibuja es el punto
     * intermedio que toque según lo que lleve acumulado el frame.
     *
     * **La posición autoritativa sigue siendo `camera.position`**, no esta copia:
     * la interpolada se pone justo antes de dibujar y se quita justo después
     * (`_applyRenderPose` / `_restoreSimPose`), así que fuera de esas tres
     * líneas la cámara está donde el jugador está de verdad y cualquiera puede
     * escribirla sin que el frame siguiente se la pise.
     */
    this._simPrev = new THREE.Vector3()
    this._simCurr = new THREE.Vector3()
    /** Épocas de pose vistas: si el movimiento teletransporta, no se interpola. */
    this._simPoseEpoch = -1
    /** ¿La cámara lleva ahora mismo la pose de dibujado en vez de la buena? */
    this._interpolating = false

    // Media móvil de FPS sobre una ventana corta de fotogramas ya dibujados.
    this._frameSamples = new Float32Array(RENDER.fpsSampleFrames)
    this._frameSampleIndex = 0
    this._frameSampleCount = 0
    this._frameSampleSum = 0
    this.fps = 0

    // Al final del constructor a propósito: reparte los ajustes guardados
    // sobre un estado ya completo. Hacerlo antes dejaba el límite de
    // fotogramas a cero, pisado por su propia inicialización.
    this._applySettings(getSettings())

    this._onMouseDown = this._onMouseDown.bind(this)
    this._onMouseUp = this._onMouseUp.bind(this)
    this._onKeyDown = this._onKeyDown.bind(this)
    this._onKeyUp = this._onKeyUp.bind(this)
    this._onWindowBlur = this._onWindowBlur.bind(this)
    this._onContextMenu = this._onContextMenu.bind(this)
    this._onPointerLockChange = this._onPointerLockChange.bind(this)
    this._onResize = this._onResize.bind(this)
    this._loop = this._loop.bind(this)
  }

  /** Engancha listeners, ajusta tamaño y arranca el bucle de render. */
  /**
   * **Conecta el motor a una partida en red** (vuelta 56, la «Opción B»).
   *
   * El motor no construye el cliente ni sabe de sockets: lo recibe ya montado.
   * Es la misma regla de siempre —la red vive en `net/`— llevada hasta donde se
   * puede llevar: `net/prueba.js` ensambla el transporte y el `ClienteRed` con
   * la cámara, el movimiento y los oclusores **de este motor**, y a partir de
   * ahí el motor le habla por tres verbos (`pasosDeFrame`, `dar`, `disparar`) y
   * le lee tres estados (`vida`, `vivoEn`, `poseDelRival`).
   *
   * Lo que cambia con esto no es un modo de juego: es de dónde sale la verdad.
   * Movimiento, disparo, vida y reaparición dejan de decidirse aquí y pasan a
   * obedecer al servidor; el arma —cargador, recarga, retroceso, sonido— se
   * queda del lado del cliente, y lo único que el servidor le exige es la
   * cadencia (ver `NET.shotRateSlackTicks`).
   *
   * **Las teclas pasan a ser el mismo objeto**, no una copia: el cliente las
   * empaqueta desde `movement.keys` y las desempaqueta encima. Dos objetos que
   * hay que copiar en cada paso es cómo se desincronizan, y además deja que los
   * bancos sigan escribiendo en `cliente.teclas` como han hecho desde la 45.
   *
   * Se llama **antes** de `start()`.
   */
  usarRed(cliente) {
    this.net = cliente
    /**
     * **Las teclas del cliente son la intención, no lo que se ejecuta.** Son el
     * mismo objeto que el del movimiento —una copia por paso es justo lo que el
     * bucle caliente no hace— pero el desdoblado importa: la reconciliación
     * reejecuta entradas guardadas y llena `movement.keys` con máscaras del
     * pasado, así que apuntar aquí a `keys` borraba sesenta veces por segundo la
     * tecla que el jugador tenía pulsada. Medido: con W apretada el jugador no
     * se movía en absoluto. Ver `movement.separateInput`.
     */
    cliente.teclas = this.movement.separateInput()
    /**
     * **La sesión de red empieza con la bienvenida, no con el clic** (vuelta
     * 56). Fuera de la red el clic es lo que arranca una ronda; aquí la ronda ya
     * está corriendo al otro lado, y un jugador conectado que no manda entradas
     * es un jugador al que el servidor deja parado — y que, si le matan, no
     * reaparece nunca, porque la reaparición cuelga de sus propias entradas. El
     * clic enciende el mando; la bienvenida enciende el mundo.
     *
     * Y va **en el mismo turno** que la bienvenida, no en el frame siguiente:
     * `_beginSession` suelta las teclas, así que arrancar un frame tarde puede
     * comerse una tecla pulsada justo al entrar. Se encadena con lo que la
     * página ya hubiera puesto —por eso se asigna después de ella—, que es la
     * forma de no pelearse por un callback que usan los dos.
     */
    const suyo = cliente.onBienvenida
    cliente.onBienvenida = (m) => {
      suyo?.(m)
      /**
       * **Con economía se sale con la pistola** (vuelta 64): la ranura principal
       * empieza vacía y la llena lo que compres. Sin economía —el huésped de los
       * bancos, `VEKTOR_RONDAS=0`— el arma sigue siendo la del ajuste del
       * jugador, que es como funcionaba hasta la 63: vaciarla allí dejaría a los
       * bancos de netcode midiendo el peso y la cadencia de una pistola.
       *
       * Va aquí y no en `usarRed` porque **quién manda se sabe al entrar**, no
       * al enchufar el cliente: la bienvenida lo dice (`eco`).
       */
      if (m.eco) {
        this.slots.primary = null
        if (this.slot === 'primary') {
          this.slot = 'secondary'
          this.weaponKey = this.slots.secondary
          this._cancelReload()
          this._refillMagazine()
        }
        this._aplicarInventario(cliente.economia?.inv)
      }
      if (this.phase !== PHASE.RUNNING) this._beginSession()
    }

    // **El veredicto lo cuenta el motor**, que es de quien son los contadores y
    // el audio: aciertos, bajas y sus dos voces. Quien lo quiera para pintar
    // una marca lo recibe por callback, igual que el daño.
    cliente.onVeredicto = (v) => this._onVerdict(v)
    /**
     * **Y la marca en la pared**, que la pone el veredicto **local** y no el del
     * servidor: lo que dice dónde acabó tu bala es el rayo que tú disparaste,
     * mientras que el del servidor llega un viaje después y dice otra cosa —si
     * le diste—. Si le diste, no hay marca: el rival no la necesita, que para
     * eso está el anillo de la mira.
     */
    cliente.onTiroLocal = (veredicto, d) => {
      if (!veredicto.impacto) this._impactoDeRed(d.yaw, d.pitch)
    }

    /**
     * **En red lo que llevas no es un ajuste tuyo: es lo que has comprado**
     * (vuelta 64). La ranura principal sale del inventario del servidor, y con
     * ella el supresor de cada arma. Se arranca **sin principal** —la ronda 1 se
     * juega con la pistola— y cada `MSG.ECONOMIA` la vuelve a poner.
     */
    this._invRed = null
    cliente.onEconomia = (eco) => this._aplicarInventario(eco.inv)
    return cliente
  }

  /**
   * **Lo comprado, puesto** (vuelta 64). Es el único camino por el que cambia el
   * arma principal en red: ni el ajuste del jugador ni la armería local pintan
   * nada aquí, porque en una partida con economía lo que llevas lo decide el
   * servidor.
   *
   * Si te quedas sin principal —morir cuesta el equipo— y la llevabas en la
   * mano, se saca la pistola: quedarse empuñando un arma que ya no existe es la
   * versión silenciosa del mismo fallo.
   */
  _aplicarInventario(inv) {
    if (!inv) return
    this._invRed = inv
    const antes = this.slots.primary
    this.slots.primary = inv.primaria ?? null
    if (antes && antes !== this.slots.primary) delete this._stowed[antes]
    if (this.slot === 'primary' && !this.slots.primary) {
      this.slot = 'secondary'
      this.weaponKey = this.slots.secondary
      this._cancelReload()
      this._refillMagazine()
    } else if (this.slot === 'primary' && this.weaponKey !== this.slots.primary) {
      this.weaponKey = this.slots.primary
      this._cancelReload()
      this._refillMagazine()
    }
    this._publishWeapon(getSettings())
  }

  /**
   * Qué pasó con uno de tus disparos, según el servidor. **El del servidor y no
   * el tuyo**: la marca de impacto tiene que decir que le has dado de verdad,
   * no que a ti te lo pareció (vuelta 46).
   */
  _onVerdict(v) {
    if (v.impacto) {
      this.hits += 1
      playHit()
    }
    if (v.baja) {
      this.kills += 1
      playKill()
    }
    this.callbacks.onVerdict?.(v)
  }

  /** ¿Hay una partida en red al otro lado? Lo preguntan los seis adaptados. */
  get enRed() {
    return this.net !== null
  }

  start() {
    if (this._running) return
    this._running = true

    this.canvas.addEventListener('mousedown', this._onMouseDown)
    // El "soltar" se escucha en la ventana: si el botón se libera fuera del
    // canvas, el arma tiene que dejar de disparar igualmente.
    window.addEventListener('mouseup', this._onMouseUp)
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    window.addEventListener('blur', this._onWindowBlur)
    this.canvas.addEventListener('contextmenu', this._onContextMenu)
    document.addEventListener('pointerlockchange', this._onPointerLockChange)
    this.controls.connect(document)
    this.movement.connect(window)

    this._unsubscribeSettings = subscribeSettings((settings) => this._applySettings(settings))

    const parent = this.canvas.parentElement
    if (parent) parent.appendChild(this.cssRenderer.domElement)

    this._resizeObserver = new ResizeObserver(this._onResize)
    this._resizeObserver.observe(this.canvas.parentElement || this.canvas)
    this._onResize()

    this._lastFrameTime = performance.now()
    this._lastRafTime = this._lastFrameTime
    this._simTime = this._lastFrameTime
    this._rafId = requestAnimationFrame(this._loop)
  }

  dispose() {
    this._running = false
    cancelAnimationFrame(this._rafId)
    this.canvas.removeEventListener('mousedown', this._onMouseDown)
    window.removeEventListener('mouseup', this._onMouseUp)
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('blur', this._onWindowBlur)
    this.canvas.removeEventListener('contextmenu', this._onContextMenu)
    document.removeEventListener('pointerlockchange', this._onPointerLockChange)
    this.controls.disconnect()
    this.movement.disconnect()
    if (this._unsubscribeSettings) this._unsubscribeSettings()
    if (this._unsubscribeKeybinds) this._unsubscribeKeybinds()
    if (this._resizeObserver) this._resizeObserver.disconnect()
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
    this.avatar?.dispose()
    this._stopShieldSound()
    this.enemyFire.dispose()
    this.markers.disposeMaterials()
    this.muzzleFlash.dispose()
    this.impacts.dispose()
    this.pickups.dispose()
    this.actionPanel.dispose()
    this.cssRenderer.domElement.remove()
    this.targets.dispose()
    this.objective.dispose()
    detachListener()
    this.scenario.dispose()
    this.transition.dispose()
    this._disposeScene()
    this.renderer.dispose()
  }

  /** ¿Tenemos el ratón capturado? */
  get isLocked() {
    return document.pointerLockElement === this.canvas
  }

  /**
   * Pide el Pointer Lock. Debe llamarse desde un gesto del usuario.
   * `unadjustedMovement` desactiva la aceleración del sistema operativo, que es
   * justo lo que queremos en un aim trainer; si el navegador no lo soporta,
   * caemos al modo normal.
   */
  requestLock() {
    initAudio()
    // Las muestras de disparo, si las hay, también necesitan el contexto. No se
    // espera a que lleguen: hasta que estén, se dispara sintetizado.
    loadWeaponSamples()
    // El listener necesita el contexto de audio, que no existe hasta este
    // gesto. Es idempotente: llamarla en cada click no cuesta nada.
    attachListener(this.camera)
    const element = this.canvas
    const fallback = () => {
      try {
        element.requestPointerLock()
      } catch {
        /* El navegador puede rechazarlo (p. ej. cooldown tras Escape). */
      }
    }
    // **Y si esta plataforma no admite la opción, no se vuelve a pedir**
    // (vuelta 62). `unadjustedMovement` es de Chromium y en algunos sistemas
    // —este contenedor, sin ir más lejos— se rechaza con `NotSupportedError`.
    // El rechazo llega **en una promesa**, o sea un turno después, y para
    // entonces el gesto del usuario ya se ha gastado: el reintento de dentro del
    // `catch` sale rechazado **sin decir nada**, y el jugador se queda sin poder
    // recuperar el ratón por más que pinche. Medido: cinco clics en diez
    // segundos, ninguno captura.
    //
    // Preguntar antes no se puede —no hay detección de característica— así que
    // se pregunta **una vez** y se recuerda. Se paga un clic la primera vez y
    // ninguno después.
    if (Engine._sinMovimientoCrudo) {
      fallback()
      return
    }
    try {
      const result = element.requestPointerLock({ unadjustedMovement: true })
      if (result && typeof result.catch === 'function') {
        result.catch((error) => {
          if (error?.name === 'NotSupportedError') Engine._sinMovimientoCrudo = true
          fallback()
        })
      }
    } catch {
      Engine._sinMovimientoCrudo = true
      fallback()
    }
  }

  /**
   * Arranca una sesión nueva desde la pantalla de resumen. Deja la fase como
   * está a propósito: si el navegador rechaza la captura (hay un cooldown tras
   * pulsar Escape), el resumen sigue en pantalla con su botón en lugar de
   * dejar al jugador mirando un canvas vacío. La sesión empieza de verdad
   * cuando llega el evento de pointerlock.
   */
  restart() {
    // Reiniciar conserva el modo: quien estaba en Deathmatch sigue en él.
    this._pendingMode = this.mode
    this.controls.reset()
    this.requestLock()
  }

  /**
   * Pide la captura del ratón para arrancar una sesión en el modo indicado.
   * El modo se guarda aquí y lo recoge `_beginSession` cuando llega el evento
   * de pointerlock, que es cuando la sesión empieza de verdad.
   */
  requestStart(mode = 'timed') {
    this._pendingMode = SESSION_MODES[mode] ? mode : 'timed'
    this.controls.reset()
    this.requestLock()
  }

  /**
   * Vuelve a la pantalla de inicio. Con dos modos de sesión hace falta un
   * camino de vuelta: desde el resumen sólo se podía reiniciar el mismo modo.
   */
  goToStart() {
    this.controls.enabled = false
    this.movement.setEnabled(false)
    this._releaseTrigger()
    this._cancelReload()
    this.targets.clear()
    this.pickups.clear()
    this.muzzleFlash.clear()
    this.impacts.clear()
    this._stopShieldSound()
    if (this.isLocked) document.exitPointerLock()
    this._setPhase(PHASE.IDLE)
  }

  /**
   * Cierra la sesión a mano y saca el resumen. Es la única forma de terminar
   * una práctica libre, y también vale para abandonar una cronometrada.
   */
  finishSession() {
    if (this.phase !== PHASE.RUNNING && this.phase !== PHASE.PAUSED) return
    this._finishSession()
  }

  /**
   * Reparte los ajustes del panel de opciones entre quien los usa.
   *
   * Cambiar el tipo o el tamaño de diana rehace las mallas. El panel sólo se
   * abre con la partida parada (antes de empezar o en pausa), así que esa
   * reconstrucción nunca cae dentro del bucle caliente; si había dianas en
   * pantalla se vuelven a repartir, porque las viejas dejan de existir.
   */
  _applySettings(settings) {
    // Con escenario fijo el ajuste del jugador no manda aquí: ver `_escenarioFijo`.
    this._applyScenario(this._escenarioFijo ?? settings.scenario)
    setSpatialEnabled(settings.spatialAudio)
    this.controls.setSensitivity(settings.sensitivity)
    const limit = FRAME_LIMITS[settings.frameLimit].fps
    this._frameIntervalMs = limit > 0 ? 1000 / limit : 0
    this._frameAccumulator = 0
    this.helpMessagesEnabled = settings.helpMessages
    // Cambiar de arma principal cambia la ranura, no el arma vigente: si en ese
    // momento llevabas la pistola, la principal nueva te espera en la tecla 1.
    // Y espera **llena**: el cargador guardado era el de la que ya no llevas.
    // **En red la principal no sale de los ajustes: sale de lo que has comprado**
    // (vuelta 64). Sin esta condición, el ajuste guardado del jugador le
    // devolvía el rifle en cuanto se aplicaba cualquier opción — o sea, un arma
    // que no ha pagado y que el servidor no le reconoce.
    if (!this.enRed && settings.weapon !== this.slots.primary) {
      delete this._stowed[this.slots.primary]
      delete this._stowed[settings.weapon]
      this.slots.primary = settings.weapon
      if (this.slot === 'primary') {
        this.weaponKey = settings.weapon
        this._releaseTrigger()
        this._cancelReload()
        this._refillMagazine()
      }
    }
    this._publishWeapon(settings)
    // Los muñecos disparan **sólo con escenario y hitbox completo**: sin
    // cobertura no habría dónde meterse, y una esfera flotante no dispara.
    this.enemyFire.setEnabled(!this.enRed && this.scenario.hasGeometry && settings.targetType === 'hitbox')
    this.enemyFire.setRadius(settings.targetRadius)
    this.enemyFire.setDifficulty(settings.enemyDifficulty)
    const hadSession = this.targets.sessionActive
    // **Volver a sembrar sólo si el tablero ha dejado de valer.** `configure`
    // dice si hubo que rehacer las mallas, que es el único caso en que las
    // dianas en pantalla ya no existen. Hasta la vuelta 42 se sembraba con
    // **cualquier** ajuste: tocar el silenciador en la pausa, con tres muñecos
    // ya abatidos, borraba la ronda y la volvía a llenar entera —y con el
    // jugador parado en su zona, encima de él—.
    const rebuilt = this.targets.configure(settings)
    this._syncMarkers(settings)
    // El cupo de ronda sí se recalcula siempre: cambiar el selector de
    // simultáneas con el explosivo puesto cambia cuántos quedan por salir, y
    // eso no necesita rehacer nada.
    if (hadSession) {
      this.targets.setRoundBudget(this.objectiveRunning ? this.targets.maxAlive : 0)
    }
    // Con un cambio de escenario en marcha la siembra la hace `_buildScenario`,
    // ya con el mundo nuevo montado: sembrar aquí usaría los anclajes viejos.
    if (hadSession && rebuilt && !this.transition.active) {
      this.targets.beginSession(this.camera, this.gameTime)
    }
  }

  /**
   * Pide un cambio de escenario. El montaje va dentro de una transición, pero
   * aquí no se sabe de qué tipo: sólo que `_buildScenario` se llamará en algún
   * momento con el jugador sin ver la escena.
   *
   * Se guarda la clave pedida en lugar de capturarla: si llegan varias mientras
   * la transición corre, se monta la última y no una intermedia.
   */
  _applyScenario(key) {
    this._wantedScenarioKey = key
    if (this.scenario.key === key && !this.transition.active) return
    this.transition.run(() => this._buildScenario(this._wantedScenarioKey))
  }

  /**
   * Monta el escenario nuevo. Cambia el mundo entero bajo los pies del jugador,
   * así que además de la geometría recoloca al jugador, reancla el panel y
   * repone los anclajes de aparición.
   */
  _buildScenario(key) {
    if (this.scenario.key === key) return
    const hadSession = this.targets.sessionActive

    this.scenario.dispose()
    this.scenario = new Scenario(this.scene, key)
    this._setRoom(this.scenario.room)
    this.movement.setScenario(this.scenario)
    this.movement.reset()
    this.camera.updateMatrixWorld()
    this.actionPanel.setAnchor(this.scenario.spawn, this.scenario.room)
    this.targets.setRoutes(this.scenario.routes, this.scenario.points, this.scenario.occluders, this.scenario.room)
    this.objective.setSites(this.scenario.objectiveSites)
    this.pickups.setSites(this.scenario.pickupSites)
    this.enemyFire.setOccluders(this.scenario.occluders)
    this.markers.setOccluders(this.scenario.occluders)
    this.enemyFire.setEnabled(!this.enRed && this.scenario.hasGeometry && getSettings().targetType === 'hitbox')
    this._syncMarkers(getSettings())

    // Las dianas vivas estaban ancladas a un mundo que ya no existe. Si había
    // sesión en marcha se vuelve a sembrar desde la posición nueva del jugador,
    // con el cupo de ronda recalculado como en cualquier otra resiembra.
    if (hadSession) {
      this.targets.setRoundBudget(this.objectiveRunning ? this.targets.maxAlive : 0)
      this.targets.beginSession(this.camera, this.gameTime)
    }
  }

  /** El arma vigente, tal cual está descrita en config.js. */
  get weapon() {
    return WEAPONS[this.weaponKey]
  }

  /**
   * **Equipar una ranura.** Guarda el arma que se deja tal cual estaba —balas y
   * lo que le faltase de recarga— y saca la otra como la dejaste.
   *
   * Suelta el gatillo y pone el patrón de retroceso a cero: cambiar de arma no
   * puede heredar la ráfaga de la anterior, que es de otra arma.
   */
  _equipSlot(slot) {
    const key = this.slots[slot]
    if (!key || key === this.weaponKey) return
    // Del reloj del mundo, como el resto de los tiempos del arma: lo que se
    // guarda de una recarga a medias es lo que le faltaba, y eso no puede
    // medirse en un reloj que sigue corriendo con el juego parado.
    const now = this.gameTime
    this._stowed[this.weaponKey] = {
      ammo: this.ammo,
      // Lo que le faltaba, no cuándo acababa: guardada así, la recarga se
      // congela mientras el arma está en la espalda.
      reloadLeftMs: this.reloading ? Math.max(0, this.reloadEndsAt - now) : 0,
      lowAmmoWarned: this._lowAmmoWarned,
    }
    this._releaseTrigger()
    this._sprayIndex = 0
    this.slot = slot
    this.weaponKey = key
    const stowed = this._stowed[key]
    if (!stowed) {
      // La primera vez que sale, sale llena.
      this._cancelReload()
      this._refillMagazine()
    } else {
      this.ammo = stowed.ammo
      this._lowAmmoWarned = stowed.lowAmmoWarned
      if (stowed.reloadLeftMs > 0) {
        // Se reanuda donde se quedó: el progreso que enseña el HUD sale de
        // `reloadStartedAt`, así que se retrasa lo ya recorrido.
        this.reloadStartedAt = now - (this.weapon.reloadMs - stowed.reloadLeftMs)
        this.reloadEndsAt = now + stowed.reloadLeftMs
      } else {
        this._cancelReload()
      }
    }
    this._publishWeapon(getSettings())
  }

  /**
   * **La dotación de salida**: las dos armas llenas y la principal en la mano.
   * Se llama al empezar una sesión, no al reaparecer —morir no te cambia el
   * arma que llevabas—.
   */
  _resetLoadout() {
    this._stowed = {}
    // **Se puede no tener principal** (vuelta 64): en el duelo la ranura 1
    // empieza vacía y se llena comprando. Poner la mano en una ranura vacía deja
    // `weapon` sin definir, y eso se manifiesta lejos —en el HUD, leyendo el
    // cargador de un arma que no existe— así que la dotación empieza en la
    // ranura que de verdad tiene algo.
    this.slot = this.slots.primary ? 'primary' : 'secondary'
    this.weaponKey = this.slots[this.slot]
  }

  /**
   * Publica el arma vigente: al HUD por callback y al tablero de acciones.
   *
   * Va por callback y no por `stats` a propósito. El HUD se actualiza por refs
   * en cada frame, pero la silueta del arma y su rótulo son React: cambian
   * cuando se cambia de arma —una pulsación—, no sesenta veces por segundo.
   */
  _publishWeapon(settings) {
    // El silenciador sólo cuenta si el arma **vigente** lo admite: la pistola lo
    // lleva y el Rift no, así que esto cambia al cambiar de ranura.
    // **En red el supresor es del inventario, no del ajuste guardado**: es del
    // arma de esta partida, y quien lleva la cuenta de lo que tienes es el
    // servidor (vuelta 64). Fuera de la red sigue siendo el ajuste de siempre.
    const puesto = this.enRed
      ? Boolean(this._invRed?.supresor?.[this.weaponKey])
      : Boolean(settings.suppressor[this.weaponKey])
    this.suppressorEnabled = puesto && this.weapon.supportsSuppressor
    // **Y lo que pesa se nota al andar.** Va aquí y no en `_equipSlot` porque
    // éste es el único sitio por el que pasan los tres caminos que cambian el
    // arma vigente: la tecla, el ajuste de principal y la armería.
    this.movement.setWeaponWeight(this.weapon.weight)
    this.actionPanel.update({
      weaponLabel: this.weapon.label,
      suppressorSupported: this.weapon.supportsSuppressor,
      suppressorEnabled: this.suppressorEnabled,
    })
    // **Y la red se entera de qué arma se empuña**, porque viaja en cada entrada:
    // el peso frena y el servidor le exige su cadencia (vuelta 56). Se pone
    // aquí porque éste es el único sitio por el que pasan los tres caminos que
    // cambian el arma vigente.
    if (this.enRed) this.net.arma = this.weaponKey
    this.callbacks.onWeapon?.({
      weaponKey: this.weaponKey,
      suppressed: this.suppressorEnabled,
    })
  }

  /** ¿Hay una recarga en curso? */
  get reloading() {
    return this.reloadEndsAt > 0
  }

  /** Deja el cargador lleno y el aviso de munición baja rearmado. */
  _refillMagazine() {
    this.ammo = this.weapon.magazine
    this._lowAmmoWarned = false
  }

  /**
   * Arranca una recarga. No hace nada si ya hay una en curso —pulsar R varias
   * veces ni la reinicia ni la acumula— ni con el cargador ya lleno.
   */
  _startReload(now) {
    if (this.reloading || this.phase !== PHASE.RUNNING) return
    if (this.ammo >= this.weapon.magazine) return
    this.reloadStartedAt = now
    this.reloadEndsAt = now + this.weapon.reloadMs
    // Suena **una vez, al empezar**, y no se corta si la recarga se cancela: lo
    // que se grabó es un gesto entero. Sin muestra no suena nada, que es lo que
    // hacía hasta la vuelta 63.
    playWeaponReload(this.weaponKey)
  }

  _cancelReload() {
    this.reloadEndsAt = 0
    this.reloadStartedAt = 0
  }

  /** Cierra la recarga cuando le toca: cargador lleno y patrón desde cero. */
  _updateReload(now) {
    if (!this.reloading || now < this.reloadEndsAt) return
    this._cancelReload()
    this._refillMagazine()
    // El patrón de retroceso vuelve al principio: un cargador nuevo es una
    // ráfaga nueva.
    this._sprayIndex = 0
  }

  /** Lanza un aviso temporal al HUD, si el jugador los tiene activados. */
  _showHelp(text) {
    if (!this.helpMessagesEnabled) return
    this.callbacks.onHelp?.(text, HELP.messageDurationMs)
  }

  /**
   * Radio angular del desvío que le toca al próximo disparo, en grados.
   *
   * Se abre corriendo —por encima del umbral de velocidad— y también en el
   * aire, donde no hay marcha que valga: saltar penaliza como correr. Caminar
   * con SHIFT y agacharse quedan por debajo del umbral, así que disparan con
   * precisión completa, igual que estar quieto.
   */
  get currentSpreadDeg() {
    const movement = this.movement
    if (movement.airborne || movement.horizontalSpeed > ACCURACY.speedThreshold) {
      return ACCURACY.movementSpreadDeg
    }
    return 0
  }

  _setPhase(phase) {
    if (this.phase === phase) return
    this.phase = phase
    this.stats.phase = phase
    // El zumbido del escudo va con el estado, no por su cuenta: la carga se
    // congela en pausa —va por delta— y el sonido tiene que congelarse con
    // ella. Al reanudar se relanza por lo que quede, que es lo que evita que
    // una carga termine en silencio.
    if (phase !== PHASE.RUNNING) this._stopShieldSound()
    else if (this.status.applying) {
      this._shieldSound = playShieldCharge(this.status.applyLeftMs / 1000)
    }
    // Salir de la partida cierra el marcador: si no, quedaría abierto sobre el
    // resumen con los datos de una sesión que ya terminó.
    if (phase !== PHASE.RUNNING) this._scoreboardHeld = false
    this.callbacks.onPhaseChange?.(phase)
  }

  _beginSession() {
    this.mode = this._pendingMode
    // **La duración sale del modo**, y «sin cronómetro» es una duración más, no
    // un modo aparte: un Deathmatch de cinco minutos y uno sin límite son el
    // mismo modo con dos relojes. `endless` queda como lo que siempre fue —esta
    // sesión no acaba sola— para el HUD y el resumen.
    const deathmatchSeconds = DEATHMATCH_DURATIONS[getSettings().deathmatchDuration].seconds
    // **En red la sesión no acaba sola** (vuelta 56): la partida dura lo que
    // dure la sala, que es lo único que hoy existe al otro lado. Un cronómetro
    // local cerraría la sesión de uno y dejaría al otro jugando.
    this.endless = this.enRed || (this.mode === 'deathmatch' && deathmatchSeconds === 0)
    this.durationMs = this.enRed
      ? Infinity
      : (this.mode === 'deathmatch' ? deathmatchSeconds : SESSION_DURATION_S) * 1000
    this.stats.endless = this.endless
    this.elapsedMs = 0
    this.shots = 0
    this.hits = 0
    this.kills = 0
    this.controls.enabled = true
    this._releaseTrigger()
    this._cancelReload()
    this._resetLoadout()
    this._refillMagazine()
    this._publishWeapon(getSettings())
    this._lastShotAt = -Infinity
    this._nextShotAt = -Infinity
    this.movement.reset()
    this.movement.setEnabled(true)
    this._defuseHeld = false
    this.objectiveOutcome = null
    // Vida, escudo y casco vuelven a la dotación de salida, y los recogibles a
    // su sitio. El combate se enciende solo: `enemyFire` ya sabe si toca.
    this.status.reset()
    this._stopShieldSound()
    this.muzzleFlash.clear()
    this.impacts.clear()
    this.camera.updateMatrixWorld()

    // **Una sesión de red no siembra nada** (vuelta 56). Ni dianas, ni
    // explosivo, ni recogibles, ni muñecos que disparen: el único blanco es el
    // rival y lo pone el servidor. Se apagan aquí y no en `_applySettings`
    // porque es la sesión la que decide qué se monta, y el motor le sigue
    // hablando a los cuatro módulos desde los mismos sitios de siempre.
    if (this.enRed) {
      this.targets.clear()
      this.objective.clear()
      this.pickups.clear()
      this.enemyFire.setEnabled(false)
      this._prepararRival()
      // **Y se empieza en la ranura que el servidor ha dado**, no en el spawn
      // del escenario: `movement.reset()` conoce uno solo y el servidor reparte
      // dos, separados para no aparecer uno dentro del otro. Sin esto, el primer
      // paso de cada partida llegaba con 2.5 u de error y su corrección.
      this.net.colocarEnSalida()
      this.camera.updateMatrixWorld()
      // Encendido para toda la partida: ver `_onPointerLockChange`.
      this.movement.setEnabled(true)
      if (!this.isLocked) this.movement.disconnect()
      // **Y se entra en paso con el servidor.** Mientras se estaba en el menú el
      // contador propio no avanzaba: empezar desde ahí sería mandar entradas
      // selladas con pasos que el servidor dejó atrás hace rato.
      if (this.net.relojFresco()) this.net.reanclar(this.net.pasoObjetivo())
      this.net.soltarAcumulador()
      this._simAccumulator = 0
      this._simPoseEpoch = -1
      this._setPhase(PHASE.RUNNING)
      return
    }

    this.enemyFire.begin()
    this.pickups.begin()
    // La primera diana nace en la posición ya reseteada del jugador.
    const now = this.gameTime
    // **Con explosivo armado no hay reaparición**: el selector de simultáneas
    // pasa a decir cuántos muñecos hay *en toda la ronda*, no cuántos a la vez.
    // Es lo que convierte la ronda en una ronda —se acaban— en vez de en una
    // fuente infinita mientras corre la cuenta atrás. Se decide **antes** de
    // sembrar, porque la primera diana sale dentro de `beginSession`.
    const conExplosivo = this.mode === 'timed' && this.objective.available
    this.targets.setRoundBudget(conExplosivo ? this.targets.maxAlive : 0)
    this.targets.beginSession(this.camera, now)
    // El explosivo sólo existe con escenario y con cronómetro. En práctica libre
    // no: esa modalidad existe para no terminar sola, y un explosivo que la
    // cerrase a los 45 s rompería su único contrato.
    this.objective.clear()
    if (conExplosivo) this.objective.begin(now)
    this._setPhase(PHASE.RUNNING)
  }

  /** ¿Es el explosivo quien lleva el reloj de esta sesión? */
  get objectiveRunning() {
    return this.objective.active
  }

  _finishSession() {
    this.controls.enabled = false
    this._releaseTrigger()
    this._defuseHeld = false
    this.movement.setEnabled(false)
    this.targets.clear()
    this.objective.clear()
    this.pickups.clear()
    this._stopShieldSound()
    this._setPhase(PHASE.FINISHED)
    if (this.isLocked) document.exitPointerLock()

    // En práctica libre, y con explosivo, el ritmo se mide contra lo que la
    // sesión haya durado de verdad, no contra la duración nominal.
    const openEnded = this.endless || this.objectiveOutcome !== null
    const seconds = (openEnded ? this.elapsedMs : this.durationMs) / 1000
    // Detonar no puntúa: es un resultado de fallo aparte, no una estrella baja.
    const score = this.objectiveOutcome === OUTCOME.DEFUSED ? this._currentScore() : null
    this.callbacks.onFinish?.({
      objectiveOutcome: this.objectiveOutcome,
      stars: score ? score.stars : 0,
      scoreValue: score ? score.value : 0,
      scoreParts: score ? score.parts : null,
      endless: this.endless,
      mode: this.mode,
      deaths: this.status.deaths,
      hits: this.hits,
      misses: this.shots - this.hits,
      shots: this.shots,
      // Con el hitbox, impactos y dianas abatidas dejan de coincidir: la
      // precisión mide los disparos que entraron, el ritmo mide las bajas.
      kills: this.kills,
      accuracy: this.shots > 0 ? (this.hits / this.shots) * 100 : 0,
      targetsPerSecond: seconds > 0 ? this.kills / seconds : 0,
      durationS: seconds,
    })
  }

  _onContextMenu(event) {
    event.preventDefault()
  }

  /**
   * Pone o quita el supresor del arma **que se lleva en la mano**, que es la
   * regla de la vuelta 43: el supresor es de cada arma y no del jugador. Un arma
   * que no lo admite no hace nada — y hoy las tres lo admiten.
   */
  _alternarSupresor() {
    const arma = this.weapon
    if (!arma?.supportsSuppressor) return
    if (this.enRed) {
      // En red se pide: lo que tienes lo lleva el servidor.
      this.net.comprar('supresor', this.weaponKey)
      return
    }
    const settings = getSettings()
    updateSettings({ suppressor: { ...settings.suppressor, [this.weaponKey]: !settings.suppressor[this.weaponKey] } })
  }

  _onMouseDown(event) {
    /**
     * **El clic derecho pone y quita el supresor del arma que llevas**
     * (vuelta 64). Es el mismo gesto en los dos modos —ahí está la convención de
     * la 63— y lo que cambia es quién lleva la cuenta: fuera de la red, el
     * ajuste de siempre; en red, el inventario del servidor, que contesta con
     * `MSG.ECONOMIA` y de ahí vuelve por `_aplicarInventario`.
     *
     * Va antes del filtro del gatillo porque no es disparar, y pide el ratón
     * capturado por lo mismo que lo pide disparar: con el ratón suelto estás en
     * un menú.
     */
    if (event.button === 2) {
      event.preventDefault()
      if (!this.isLocked || this.phase !== PHASE.RUNNING) return
      this._alternarSupresor()
      return
    }
    if (!this._isBind('shoot', event)) return

    // Sin el ratón capturado, el click sirve para capturarlo: no dispara.
    // Así el click que arranca (o reanuda) la sesión nunca cuenta como fallo,
    // y mantener pulsado durante ese click tampoco arranca una ráfaga: el
    // gatillo sólo se considera apretado desde aquí.
    if (!this.isLocked) {
      this.requestLock()
      return
    }
    if (this.phase !== PHASE.RUNNING) return

    this._triggerHeld = true
    const now = this.gameTime
    // **El instante real del clic**, que es de donde sale la fracción de paso
    // del disparo en red. Fuera de la red no se usa y no cuesta nada.
    const ts = Number.isFinite(event.timeStamp) && event.timeStamp > 0
      ? event.timeStamp
      : performance.now()

    // Darle a un botón es accionarlo, no disparar: no cuenta como acierto ni
    // como fallo, no gasta munición y no mueve la cámara. Pero sólo gana si es
    // lo más cercano bajo el punto de mira — ver `_tryPanelAction`.
    if (this._tryPanelAction(now)) {
      this._triggerConsumedByPanel = true
      return
    }

    // Con el cargador vacío el gatillo suena en seco, una vez por pulsación:
    // el fuego automático no repite el clic, que sería insufrible.
    //
    // **Y suena también durante la recarga**, que es lo único que hay con el
    // cargador a cero: la última bala arranca la recarga sola (`_consumeAmmo`),
    // así que «vacío y sin recargar» es un estado que el juego no produce nunca.
    // Mientras esta condición pedía `!this.reloading`, el clic existía, sonaba
    // en una prueba que ponía ese estado a mano, y no se podía oír jugando.
    if (this.ammo <= 0) {
      playDrySound()
      // Pedir R mientras la recarga ya corre sería un mal consejo: el HUD
      // enseña su barra y no hay nada que pulsar.
      if (!this.reloading) this._showHelp('Pulsa R para recargar')
      return
    }
    this._tryShoot(now, ts)
  }

  _onMouseUp(event) {
    if (!this._isBind('shoot', event)) return
    this._releaseTrigger()
  }

  /**
   * ¿Este evento —de teclado o de ratón— es la acción pedida? Un solo sitio
   * donde se compara input contra binds, y usa el mismo vocabulario de códigos
   * que el panel de controles.
   */
  _isBind(action, event) {
    return keysOf(action, this._binds).includes(eventCode(event))
  }

  /**
   * Avanza el explosivo y cierra la sesión cuando se resuelve. Desactivarlo y
   * que detone terminan igual de rápido: los dos son un final, no un evento.
   */
  _updateObjective(now, deltaSeconds) {
    if (!this.objective.active) return
    // En pausa el explosivo se congela entero, cuenta atrás y pitido incluidos,
    // igual que las dianas. El progreso de desactivación se conserva: pausar no
    // es soltar la tecla.
    if (this.phase !== PHASE.RUNNING) return
    const outcome = this.objective.update(now, deltaSeconds, this.camera, this._defuseHeld)
    if (!outcome) return

    this.objectiveOutcome = outcome
    if (outcome === OUTCOME.DEFUSED) playObjectiveDefused()
    else playObjectiveExplosion()
    this._finishSession()
  }

  /**
   * **Combate.** Los relojes del jugador, el fuego enemigo y los recogibles.
   *
   * Va con el delta de juego y no con `performance.now()` para los dos relojes
   * que pueden esperar —la carga del escudo y la reaparición—, así que pausar no
   * regala una reaparición de quince segundos.
   *
   * @param {number} deltaMs tiempo de juego del frame; cero en pausa
   */
  _updateCombat(now, deltaMs) {
    // **En red el combate no se simula: se obedece** (vuelta 56). No hay
    // muñecos a los que dar un paso ni una cuenta de reaparición que descontar
    // —las dos cosas las lleva el servidor—, así que lo que queda es leer lo
    // que ha llegado y ponerlo en pantalla.
    if (this.enRed) {
      this._syncRival(now, deltaMs)
      return
    }
    const status = this.status
    const { shieldReady, respawnReady } = status.tick(deltaMs)
    if (shieldReady) this._stopShieldSound()
    if (respawnReady) this._respawnPlayer()

    // El cuerpo sale del movimiento, no de la cámara: entre las dos está el
    // hundimiento del aterrizaje.
    const body = status.alive
      ? playerBody(this.camera, this.movement.eyeHeight, this.movement.feetY)
      : null
    this.enemyFire.update(now, this.targets.instances, body)
    // Los marcadores van **después** del fuego: enseñan el estado de este frame,
    // no el del anterior.
    this.markers.update(now, deltaMs, this.targets.instances, this.camera, this._enemyPhase)
    // Los fogonazos van con `now` y no con el delta de juego: son de los
    // disparos que acaban de salir, y en pausa no sale ninguno.
    this.muzzleFlash.update(now, this.camera)
    this.pickups.update(now, deltaMs / 1000, this.camera)
  }

  /**
   * Los marcadores siguen al pool: mismas ranuras, mismo radio y la misma
   * condición de encendido que el fuego enemigo —sin quien dispare no hay
   * estado que enseñar, y una brújula sobre una esfera flotante no dice nada—.
   *
   * Se reconstruyen sólo cuando cambia el tamaño o el número de ranuras, no por
   * frame ni por sesión.
   */
  _syncMarkers(settings) {
    // **En red hay un solo blanco y es una persona** (vuelta 56). Los
    // marcadores no se enteran: siguen recibiendo una lista de instancias con
    // la misma forma de siempre, y el adaptador que la fabrica está en
    // `_syncRival`. Una ranura, del tamaño del cuerpo de un jugador.
    if (this.enRed) {
      this.markers.setEnabled(true)
      if (this.markers.slots.length !== 1 || this.markers.radius !== TARGET.radius) {
        this.markers.build(1, TARGET.radius)
      }
      return
    }
    const enabled = this.enemyFire.enabled
    this.markers.setEnabled(enabled)
    if (!enabled) return
    const slots = this.targets.instances.length
    if (this.markers.slots.length !== slots || this.markers.radius !== settings.targetRadius) {
      this.markers.build(slots, settings.targetRadius)
      // El pool de fogonazos va con el mismo disparador y por el mismo motivo:
      // una ranura por muñeco y el tamaño escalado con el suyo.
      this.muzzleFlash.build(slots, settings.targetRadius)
    }
  }

  /**
   * **El rival de carne y hueso, y los marcadores puestos encima** (vuelta 56).
   *
   * Aquí está el adaptador que pedía la evaluación: `markers.update` espera una
   * lista de instancias con `{ state, group.position, facing, friendly, nick,
   * weaponKey }` y lo que hay es la pose interpolada de una persona. Se fabrica
   * **una sola instancia, reutilizada**, y el cuerpo del rival es el objeto que
   * la lleva: así la brújula gira con su rumbo de verdad y la ficha flotante
   * sale apuntándole, con su arma y su ranura, sin que `markers.js` sepa que al
   * otro lado hay una red.
   *
   * Dos cosas que no son evidentes:
   *
   * - **Un cadáver no se dibuja, y tampoco se marca.** `poseDelRival` publica
   *   `vivo` del lado viejo de la interpolación (vuelta 52), y de ahí sale el
   *   `state` que apaga la ranura entera — brújula, iconos y ficha.
   * - **Los iconos `?` y `!` se quedan apagados**, y es a propósito: dicen «te
   *   ha visto» y «te está disparando», y eso es estado de una máquina que hoy
   *   sólo existe para los muñecos. Deducirlo desde fuera mirando relojes sería
   *   la segunda copia que la vuelta 37 se negó a tener. El día que el disparo
   *   del rival viaje en la foto, la fase sale de ahí y no de una suposición.
   */
  _syncRival(now, deltaMs) {
    this._leerEstadoDeRed()
    const pose = this.net.poseDelRival()
    const avatar = this._rivalAvatar
    const instancia = this._rivalInstancia
    if (!avatar || !instancia) return
    if (!pose || !pose.vivo) {
      avatar.group.visible = false
      instancia.state = 'down'
      // Un abatido no pisa, y al reaparecer lo hace en otro sitio: sin esto, el
      // salto del teletransporte contaría como suelo andado y sonaría una
      // ráfaga de pisadas en el punto de aparición.
      this._rivalPrevX = null
      this._rivalPrevZ = null
      this._rivalPasoX = null
      this._rivalPasoZ = null
      this._rivalPasoT = 0
      this._rivalPisadaT = 0
    } else {
      avatar.group.visible = true
      avatar.group.position.set(pose.x, pose.feetY, pose.z)
      avatar.group.rotation.y = pose.yaw
      avatar.setEyeHeight(pose.eyeHeight)
      instancia.state = 'alive'
      // **El yaw del rival es el de su cámara, y `facing` es de un marcador.**
      // Son convenciones opuestas —una mira a −Z y la otra a +Z— y pasarlo tal
      // cual pintaba la brújula apuntando a su espalda. El cuerpo se queda con
      // el yaw crudo a propósito: es un sólido de revolución, así que su giro
      // no se ve, y ponerle el de la brújula sería decir que tiene frente.
      instancia.facing = facingDesdeCamara(pose.yaw)
      instancia.weaponKey = this.net.rival.arma ?? instancia.weaponKey
      this._pisadasDelRival(pose)
    }
    this.markers.update(now, deltaMs, this._rivalInstancias, this.camera, _sinFase)
  }

  /**
   * **Las pisadas del rival** (vuelta 60), que es lo que deja oír a alguien que
   * no ves. Se apoyan en la pose que ya se está dibujando, así que no piden ni
   * un dato más al protocolo ni un rayo por frame.
   *
   * Tres cosas que son el mecanismo:
   *
   * - **El paso se mide en suelo andado, no en tiempo.** Una zancada es un trozo
   *   de suelo (`FOOTSTEPS.strideU`), así que agacharse o andar bajan el ritmo
   *   solos, sin una segunda tabla de cadencias. Por tiempo, un agachado pisaría
   *   igual de rápido que uno corriendo, que es como se oye que las pisadas son
   *   de mentira.
   * - **Un teletransporte no es suelo andado.** La época de pose ya dice cuándo
   *   el rival ha saltado (vuelta 50) y aquí se traduce en olvidar la referencia:
   *   si no, reaparecer sonaría a media docena de pisadas de golpe.
   * - **Y el jugador no oye las suyas.** Esto sólo mira al rival. Las propias no
   *   dicen nada que no sepas —estás pulsando la tecla— y taparían justo lo que
   *   se quiere oír.
   * - **Sólo se oye a quien corre** (vuelta 63). Andar con SHIFT y agacharse no
   *   suenan **en absoluto**: es lo que promete la tecla, y lo que cuesta es la
   *   velocidad. Antes sonaban más bajo, que es otra cosa — con el volumen de
   *   un rival a doce unidades por medio, «más bajo» se oye igual.
   * - **Y hay un radio.** Fuera de `FOOTSTEPS.maxDistanceU`, silencio; dentro,
   *   el panner del emisor sube con la cercanía hasta el techo de
   *   `AUDIO.footstepVolume` y no pasa de ahí.
   */
  _pisadasDelRival(pose) {
    const emisor = this._rivalEmisor
    if (!emisor) return

    const previaX = this._rivalPrevX
    const previaZ = this._rivalPrevZ
    const ahora = performance.now()
    const antes = this._rivalPisadaT
    this._rivalPrevX = pose.x
    this._rivalPrevZ = pose.z
    // Sin referencia —acaba de entrar, de reaparecer o de saltar— este frame
    // sólo sirve para sembrarla.
    if (previaX === null) {
      this._rivalPisadaT = ahora
      return
    }

    const avance = Math.hypot(pose.x - previaX, pose.z - previaZ)
    // **La pose del rival se mueve con el frame, no con el paso de mundo**, y
    // este método corre dentro del paso: en un frame que gasta dos pasos, el
    // segundo ve exactamente la misma pose que el primero. Así que aquí no se
    // usa el `stepMs` —dividir el avance de un frame entre un paso infla la
    // velocidad, y con frames largos la inflaba por encima del techo del aire y
    // el guardia de teletransporte borraba la cuenta en cada frame: medido,
    // **cero pisadas** con el rival andando de verdad—. El reloj de esto es el
    // de pared, que es el que mueve lo que se está midiendo.
    if (avance === 0) return
    this._rivalPisadaT = ahora
    const dt = ahora - antes
    if (dt <= 0) return
    const velocidad = (avance / dt) * 1000

    // Un salto de pose no es suelo andado: por encima del techo del aire es que
    // ha habido teletransporte.
    if (velocidad > MOVEMENT.airStrafeMaxSpeed * 2) {
      this._rivalPasoX = null
      this._rivalPasoZ = null
      this._rivalPasoT = 0
      return
    }

    // **Agachado no se oye** (vuelta 63), y sale de la altura de ojos, que ya
    // viaja en la foto: es el mismo dato del que el cuerpo saca su achatamiento,
    // así que no hace falta un campo nuevo. Va como regla propia y no confiada
    // al umbral de abajo —que también lo dejaría fuera por lento— porque es lo
    // que promete la tecla: subir `crouchSpeed` algún día no puede devolverle el
    // ruido a quien se agacha.
    if (pose.eyeHeight <= (MOVEMENT.crouchHeight + MOVEMENT.standHeight) / 2) return

    // Fuera del radio, silencio total. El panner ya llega a cero justo aquí
    // (`fullDistanceU`/`maxDistanceU`), así que esto no cambia lo que se oye:
    // ahorra el trabajo y, sobre todo, **dice la regla** en un sitio donde se
    // lee. Las dos puntas tienen que decir lo mismo.
    const lejos = Math.hypot(pose.x - this.camera.position.x, pose.z - this.camera.position.z)
    if (lejos > FOOTSTEPS.maxDistanceU) return

    // **Una zancada es lo que te has movido, no lo que ha sumado el dibujo.** El
    // rival se interpola entre fotos y esa trayectoria tiembla: sumando el
    // avance de cada frame, el camino sale más largo que el recorrido y las
    // pisadas salen de más —medido, 11 en 13.3 u con una zancada de 1.9, o sea
    // media docena de sobra—. Se mide contra dónde se dio la última.
    if (this._rivalPasoX === null) {
      this._rivalPasoX = pose.x
      this._rivalPasoZ = pose.z
      this._rivalPasoT = ahora
      return
    }
    const zancada = Math.hypot(pose.x - this._rivalPasoX, pose.z - this._rivalPasoZ)
    if (zancada < FOOTSTEPS.strideU) return
    const zancadaMs = ahora - this._rivalPasoT
    this._rivalPasoX = pose.x
    this._rivalPasoZ = pose.z
    this._rivalPasoT = ahora

    // **Y sólo se oye a quien corre**, medido **sobre la zancada** y no sobre el
    // frame. Andar con SHIFT compra **silencio**, no un volumen más bajo: para
    // eso está la tecla, y lo que cuesta es la velocidad.
    //
    // La marcha de un frame no sirve para decidirlo: el rival se dibuja
    // interpolando entre fotos y esa trayectoria **tiembla**, así que un paseo
    // de 3.8 u/s pica por encima del umbral cada pocos frames y sonaba igual —
    // medido, 4 pisadas andando con la regla puesta sobre el frame. La zancada
    // es una ventana de un tercio de segundo, que es justo lo que promedia ese
    // temblor: la idea de la vuelta 60 —una zancada es un trozo de suelo—
    // aplicada también al **cuánto tardó** en darla.
    //
    // El umbral es fracción de **su** carrera, con el peso de su arma contado
    // por la misma función que frena al jugador: contra los 6.5 de la pistola,
    // un rival con la Rift (5.88) correría en silencio.
    const suArma = WEAPONS[this.net?.rival?.arma]
    const suCarrera = MOVEMENT.speed * weaponSpeedFactor(suArma?.weight ?? 0)
    const marchaDeZancada = zancadaMs > 0 ? (zancada / zancadaMs) * 1000 : 0
    if (marchaDeZancada < suCarrera * FOOTSTEPS.runFraction) return

    // **Todas las pisadas que suenan son de alguien corriendo**, así que todas
    // suenan al techo: lo que cambia entre una y otra es la distancia, y de eso
    // se encarga el panner (la regla de siempre — con panner, atenuar además a
    // mano sería atenuar dos veces).
    this._rivalPisadas += 1
    playFootstep(1, emisor)
  }

  /**
   * Monta el cuerpo del rival y su instancia de marcador. Se llama al empezar
   * la sesión de red: el nick sale de la ranura que el servidor haya dado, que
   * es la misma de la que sale su color.
   */
  _prepararRival() {
    // `TEAMS` va por nombre y la ranura es un número: el orden de las claves es
    // el mismo que usa el servidor para repartirlas (ver `salidas`).
    const suyo = TEAMS[Object.keys(TEAMS)[this.net.equipoRival % Object.keys(TEAMS).length]]
    if (!this._rivalAvatar) {
      this._rivalAvatar = new Avatar(TARGET.radius, suyo.color)
      this._rivalAvatar.group.visible = false
      this.scene.add(this._rivalAvatar.group)
      this._rivalInstancia = {
        state: 'down',
        group: this._rivalAvatar.group,
        facing: 0,
        friendly: false,
        nick: '',
        weaponKey: null,
      }
      this._rivalInstancias = [this._rivalInstancia]
      /**
       * **El emisor cuelga del cuerpo del rival**, así que se mueve con él y
       * nadie tiene que acordarse de colocarlo. Se crea una vez: un emisor por
       * pisada serían sesenta nodos de audio por segundo.
       *
       * **Y lleva la curva de las pisadas, no la de la sala** (vuelta 63): pleno
       * hasta `FOOTSTEPS.fullDistanceU` y apagado del todo en `maxDistanceU`.
       * Con la de `SPATIAL` —pensada para que un sonido se oiga de punta a punta
       * de un mapa de 55 u— una pisada a doce unidades salía a un decibelio de
       * una a cuatro, que es un radar y no una pista. Por eso este emisor es
       * hoy **el de las pisadas**: si el rival gana otra voz posicionada (su
       * disparo, un grito), va en un emisor suyo, con su curva.
       */
      this._rivalEmisor = createEmitter(this._rivalAvatar.group, {
        refDistance: FOOTSTEPS.fullDistanceU,
        maxDistance: FOOTSTEPS.maxDistanceU,
        rolloffFactor: 1,
      })
      /**
       * Dónde y cuándo se dio la última pisada. Una zancada es **distancia**, y
       * lo que tardó en darse es lo que dice si el rival corre o pasea: el frame
       * suelto tiembla demasiado para decidirlo (vuelta 63).
       */
      this._rivalPasoX = null
      this._rivalPasoZ = null
      this._rivalPasoT = 0
      this._rivalPrevX = null
      this._rivalPrevZ = null
      /** Cuándo se leyó la pose del rival por última vez, en reloj de pared. */
      this._rivalPisadaT = 0
      /** Cuántas pisadas del rival se han soltado. Lo miran los bancos. */
      this._rivalPisadas = 0
    }
    this._rivalAvatar.setColor(suyo.color)
    this._rivalInstancia.nick = this.net.nickRival
    this._syncMarkers(getSettings())
  }

  /**
   * Un disparo enemigo ha entrado. Aquí se decide qué significa; el módulo que
   * dispara sólo sabe de geometría.
   */
  _onPlayerHit({ zone, damage, weaponKey, fromX, fromZ }) {
    const result = this.status.takeHit(zone, damage, weaponKey)
    // En los segundos de gracia el disparo no existe: ni daño, ni sonido, ni
    // anillo. Un anillo de daño sin daño enseñaría lo contrario de lo que pasa.
    if (result.blocked) return
    const bearing = this._bearingTo(fromX, fromZ)
    if (result.helmetBroken) {
      // El único aviso de que la cabeza se ha quedado descubierta.
      playHelmetCrack()
      this.callbacks.onDamage?.(0, bearing)
      return
    }
    playDamage(Math.min(1, damage / PLAYER.maxHealth))
    this.callbacks.onDamage?.(damage / PLAYER.maxHealth, bearing)
    if (!result.killed) return
    this._downPlayer()
  }

  /**
   * **Hacia dónde queda un punto del mundo, desde donde miras ahora.** Cero es
   * justo delante, positivo a la derecha, π a la espalda.
   *
   * Se mide **en horizontal**, con la misma razón que el cono de aparición: un
   * disparo que llega desde arriba sigue llegando desde un lado, y mirar al
   * suelo no puede cambiar de qué lado. Y sale del vector de la cámara y no de
   * su `rotation.y` porque el empuje del retroceso también mueve la mira: lo que
   * hay que contestar es hacia dónde girar **desde lo que se ve**.
   */
  _bearingTo(x, z) {
    this.camera.getWorldDirection(_bearingForward)
    const fx = _bearingForward.x
    const fz = _bearingForward.z
    const flat = Math.hypot(fx, fz)
    if (flat < 1e-6) return 0
    const dx = x - this.camera.position.x
    const dz = z - this.camera.position.z
    // Derecha de la cámara, en el plano: forward × arriba.
    return Math.atan2((-fz * dx + fx * dz) / flat, (fx * dx + fz * dz) / flat)
  }

  /**
   * **El estado de red, leído de la foto** (vuelta 56). Se llama una vez por
   * paso, desde `_syncRival`, y es el único sitio donde vida, abatido y
   * reaparición entran en el motor.
   *
   * Los tres métodos de abajo no cambian de forma: lo que cambia es **quién los
   * llama**. Fuera de la red los llama `status`, que lleva la cuenta; en red
   * los llama esto, que no lleva ninguna — el servidor ya la lleva, y una
   * segunda cuenta local es exactamente la que acaba discrepando.
   *
   * Y el aviso de daño sale de comparar la vida con la de la foto anterior, no
   * de un evento: un campo que ya viaja dice lo mismo que un mensaje nuevo, y
   * perder una foto no pierde el golpe porque la siguiente trae la vida igual.
   * Lo que se pierde es **de cuántos golpes** venía, que no es lo que el anillo
   * de la mira enseña.
   */
  _leerEstadoDeRed() {
    const vida = this.net.vida
    const abatido = vida <= 0
    if (vida < this._vidaPrevia) {
      const pose = this.net.poseDelRival()
      const rumbo = pose ? this._bearingTo(pose.x, pose.z) : 0
      const cuanto = (this._vidaPrevia - vida) / PLAYER.maxHealth
      playDamage(Math.min(1, cuanto))
      this.callbacks.onDamage?.(cuanto, rumbo)
    }
    this._vidaPrevia = vida
    if (abatido && !this._abatidoEnRed) {
      this._abatidoEnRed = true
      this._downPlayer()
      return
    }
    if (!abatido && this._abatidoEnRed) {
      this._abatidoEnRed = false
      this._respawnPlayer()
    }
  }

  /** Abatido: se congela al jugador y arranca la cuenta de reaparición. */
  _downPlayer() {
    // **En red la muerte ya la ha decidido el servidor**: `status` no lleva la
    // cuenta de nada y llamarle aquí arrancaría una reaparición local que iría
    // por su lado. Lo demás —soltar el gatillo, cancelar la recarga— sí es del
    // cliente y se hace igual.
    if (!this.enRed) this.status.die()
    this._stopShieldSound()
    this._releaseTrigger()
    this._cancelReload()
    this._defuseHeld = false
    // La mirada se queda: ver quién te ha matado es información. Lo que se
    // apaga es andar y disparar. **En red no**: quien decide que un muerto no
    // se mueve es el servidor, que ignora sus entradas hasta `vivoEn` (vuelta
    // 52), y apagar además el movimiento local dejaría de producir entradas —y
    // sin entradas suyas no reaparece nunca, porque la reaparición cuelga de
    // ellas—. El resultado se ve igual: 0.00 u con la tecla pulsada.
    if (!this.enRed) this.movement.setEnabled(false)
  }

  _respawnPlayer() {
    // **La reaparición en red ya ha ocurrido**: la hizo `_aplicar` al ejecutar
    // la primera entrada que alcanzaba `vivoEn`, y con ella el `reset()` que
    // sube la época de pose. Repetirla aquí sería un segundo teletransporte, y
    // encima uno que el servidor no predijo.
    if (!this.enRed) {
      this.status.respawn()
      this.movement.reset()
    }
    this.movement.setEnabled(this.phase === PHASE.RUNNING)
    // Las dos armas llenas, pero en la mano sigue la que llevabas: reaparecer
    // repone munición, no te cambia de arma.
    this._stowed = {}
    this._refillMagazine()
    this.camera.updateMatrixWorld()
  }

  /**
   * Un recogible bajo los pies. Devuelve si se consume: con el inventario lleno
   * o la vida al máximo, el objeto se queda donde está para cuando haga falta.
   */
  _collect(kind) {
    const status = this.status
    if (!status.alive) return false
    if (kind === 'health') {
      if (!status.heal()) return false
      playHeal()
      this._showHelp('Vida recuperada')
      return true
    }
    if (kind === 'helmet') {
      if (!status.equipHelmet()) return false
      playUiConfirm()
      this._showHelp('Casco equipado')
      return true
    }
    if (!status.addCharge()) return false
    playUiConfirm()
    this._showHelp('Carga de escudo · pulsa 4 para aplicarla')
    return true
  }

  /**
   * Puntuación viva de la sesión. Se recalcula cada vez que se pide, que es en
   * cada frame: son cuatro divisiones y una media, muy por debajo de lo que
   * costaría guardarla y mantenerla sincronizada.
   */
  _currentScore() {
    return computeScore({
      shots: this.shots,
      hits: this.hits,
      elapsedMs: this.elapsedMs,
      // Cada arma se juzga contra lo que es razonable acertar con ella.
      precisionTarget: this.weapon.precisionTarget,
      // Ya no son reservadas: desde que los muñecos disparan, esto son datos.
      damageTaken: this.status.damageTaken,
      deaths: this.status.deaths,
    })
  }

  _onWindowBlur() {
    // Alt-tab con E pulsada dejaría el explosivo desactivándose solo.
    this._defuseHeld = false
    // Y con TAB pulsada —que es justo la mitad de un alt-tab— dejaría el
    // marcador abierto para siempre: la tecla se suelta fuera de la ventana y
    // el `keyup` no llega nunca.
    this._scoreboardHeld = false
  }

  _onKeyUp(event) {
    if (typingInField()) return
    if (this._isBind('use', event)) this._defuseHeld = false
    if (this._isBind('scoreboard', event)) this._scoreboardHeld = false
  }

  /**
   * Abre o cierra la armería. **Pausa como Escape**: se suelta el ratón y el
   * cambio de fase lo hace `_onPointerLockChange`, que es el único sitio del
   * motor que sabe pasar a pausa. Duplicar ahí una segunda forma de pausar es
   * como acaban dos estados que no coinciden.
   */
  _toggleArmoury() {
    if (this.isLocked) document.exitPointerLock()
    // **En red la armería no pausa** (vuelta 64). Una pausa es parar el mundo de
    // los dos y sólo la decide el servidor (vuelta 53): abrir tu panel de compra
    // no puede congelarle la partida a nadie — y durante la fase de compra el
    // mundo ya está haciendo lo suyo, con cada uno en su caja. Lo que sí se hace
    // es soltar el ratón, porque comprar con el ratón pide poder pinchar.
    if (this.enRed) {
      this.callbacks.onArmoury?.()
      return
    }
    // Y se pausa aquí mismo, sin esperar al evento de pointer lock: el cambio de
    // captura es asíncrono y hasta que llega seguiría corriendo el reloj —y con
    // él los muñecos—. Es el mismo `_suspend` que usa Escape, no una segunda
    // pausa.
    this._suspend()
    this.callbacks.onArmoury?.()
  }

  _onKeyDown(event) {
    // **Escribiendo en un campo no se juega** (vuelta 56). El juego no tiene ni
    // un campo de texto y por eso hasta aquí no hacía falta; la página del duelo
    // sí —el código de la sala—, y con el motor completo teclear ahí era jugar:
    // la `B` abría la armería y `preventDefault` se comía lo escrito.
    if (typingInField()) return
    /**
     * **La pulsación de salto viaja, y con su instante real** (vuelta 56). El
     * movimiento también la anota por su cuenta con `event.timeStamp`, pero esa
     * marca está en el reloj local y `movement.update` la va a comparar contra
     * el reloj **compartido** de los pasos; la entrada la vuelve a poner en el
     * bueno (`_aplicar` llama a `pressJump` antes de `update`, así que la pisa
     * antes de que nadie la use). Sin esto los dos extremos de la ventana de
     * encadenado vivirían en relojes distintos — ver `net/protocolo.js`.
     */
    if (this.enRed && !event.repeat && this._isBind('jump', event)) {
      const ts = Number.isFinite(event.timeStamp) && event.timeStamp > 0
        ? event.timeStamp
        : performance.now()
      this.net.pulsarSalto(ts)
    }
    // La vista del avatar es de depuración: se abre esté como esté la partida,
    // que para eso existe — inspeccionar el modelo sin montar un multijugador.
    if (this._isBind('avatarDebug', event) && !event.repeat) {
      event.preventDefault()
      this._toggleAvatarDebug()
      return
    }
    // **El marcador se abre mientras se mantenga la tecla.** Va antes del filtro
    // de `repeat` porque el navegador repite TAB mientras está pulsada y cada
    // repetición hay que cancelarla también: sin `preventDefault` en todas, el
    // foco se pasea por la página por debajo del juego.
    // **La armería se abre esté como esté la partida.** Jugando pausa —por el
    // mismo camino que Escape, soltando el ratón— y en el menú o en la pausa
    // sólo abre, que ahí no hay nada que parar. Va antes del filtro de fase por
    // eso mismo.
    if (this._isBind('armoury', event) && !event.repeat) {
      event.preventDefault()
      this._toggleArmoury()
      return
    }
    if (this._isBind('scoreboard', event)) {
      // **Fuera de la partida, TAB es del navegador.** En la pausa y en
      // opciones es como se recorre un panel con el teclado, y quedárnosla ahí
      // dejaría los ajustes sin navegación. Sólo se intercepta jugando, que es
      // donde no hay nada que enfocar y sí un marcador que enseñar.
      if (this.phase !== PHASE.RUNNING) return
      event.preventDefault()
      this._scoreboardHeld = true
      return
    }
    if (this.phase !== PHASE.RUNNING || !this.isLocked || event.repeat) return

    // **La acción contextual.** Dentro del radio del explosivo, `use` desactiva
    // y no hace nada más: que ahí dentro sacara un artilugio sería perder la
    // ronda por un reflejo. Fuera del radio equipa el lanzacohetes, que todavía
    // no existe — la tecla está reservada y el hueco, hecho.
    if (this._isBind('use', event)) {
      event.preventDefault()
      this._defuseHeld = true
      if (!this.objective.isPlayerInRange(this.camera)) this._equipUltimate()
      return
    }

    if (this._isBind('reload', event)) {
      event.preventDefault()
      this._startReload(this.gameTime)
      return
    }

    // **Las dos ranuras.** La 1 saca la principal y la 2 la pistola, siempre la
    // misma: la 2 no depende de lo que haya elegido nadie en opciones.
    if (this._isBind('primary', event)) {
      event.preventDefault()
      this._equipSlot('primary')
      return
    }

    if (this._isBind('secondary', event)) {
      event.preventDefault()
      this._equipSlot('secondary')
      return
    }

    if (this._isBind('cycleWeapon', event)) {
      event.preventDefault()
      this._runPanelAction('weapon')
      return
    }

    if (this._isBind('suppressor', event)) {
      event.preventDefault()
      this._runPanelAction('suppressor')
      return
    }

    // **Aplicar una carga de escudo.** La tecla 4 deja de estar reservada: es
    // la primera de las seis de equipo que hace algo. No se puede cancelar y no
    // frena al jugador — lo que cuesta son los dos segundos de zumbido, que en
    // campo abierto se oyen desde lejos.
    if (this._isBind('shield', event)) {
      event.preventDefault()
      this._applyShield()
    }
  }

  /** Arranca una carga de escudo, si hay carga y hay hueco. */
  _applyShield() {
    if (!this.status.beginShieldApply()) return
    this._stopShieldSound()
    this._shieldSound = playShieldCharge(PLAYER.shield.applyMs / 1000)
  }

  _stopShieldSound() {
    this._shieldSound?.stop()
    this._shieldSound = null
  }

  /**
   * Equipar el lanzacohetes/ultimate. **Reservado**: la tecla existe y el hueco
   * está hecho, pero no hay artilugio que equipar todavía. Se deja como función
   * y no como comentario suelto para que el día que exista se vea de dónde
   * cuelga — y para que la acción contextual ya tenga sus dos ramas escritas.
   */
  _equipUltimate() {}

  /**
   * **Vista del avatar** (depuración). Planta el modelo delante y gira la cámara
   * a su alrededor, para poder mirarlo sin esperar a que exista el multijugador.
   *
   * Sólo fuera de una sesión en marcha: durante la partida la cámara es del
   * jugador y el cronómetro corre, y una vista de depuración no puede costar
   * segundos de ronda. Con la partida parada —inicio, pausa o resumen— no hay
   * nada que estropear.
   */
  _toggleAvatarDebug() {
    if (this._avatarDebug) {
      this._exitAvatarDebug()
      return
    }
    if (this.phase === PHASE.RUNNING) return
    this._enterAvatarDebug()
  }

  _enterAvatarDebug() {
    if (!this.avatar) {
      this.avatar = new Avatar(TARGET.radius)
      this.scene.add(this.avatar.group)
    }
    // Se planta en el punto de aparición, mirando al sitio desde el que se le va
    // a mirar: la cámara orbita, el modelo no se mueve.
    const spawn = this.scenario.spawn
    const ground = this.scenario.groundHeightAt(spawn.x, spawn.z, 0)
    this.avatar.group.position.set(spawn.x, ground, spawn.z)
    this.avatar.group.visible = true

    this._avatarDebug = true
    this._avatarAngle = 0
    // Se guarda la cámara entera para devolverla exactamente donde estaba.
    this._cameraBeforeDebug = {
      position: this.camera.position.clone(),
      rotation: this.camera.rotation.clone(),
    }
    this.controls.enabled = false
    this.movement.setEnabled(false)
    this.callbacks.onAvatarDebug?.(true)
  }

  _exitAvatarDebug() {
    this._avatarDebug = false
    if (this.avatar) this.avatar.group.visible = false
    const saved = this._cameraBeforeDebug
    if (saved) {
      this.camera.position.copy(saved.position)
      this.camera.rotation.copy(saved.rotation)
      this.camera.updateMatrixWorld()
    }
    this._cameraBeforeDebug = null
    this.controls.enabled = this.isLocked
    this.movement.setEnabled(this.phase === PHASE.RUNNING)
    this.callbacks.onAvatarDebug?.(false)
  }

  /** Órbita lenta alrededor del avatar. Sólo corre con la vista abierta. */
  _updateAvatarDebug(deltaSeconds) {
    this._avatarAngle += (AVATAR.debugRpm / 60) * Math.PI * 2 * deltaSeconds
    const target = this.avatar.group.position
    const distance = AVATAR.debugDistance
    this.camera.position.set(
      target.x + Math.sin(this._avatarAngle) * distance,
      target.y + AVATAR.debugHeight,
      target.z + Math.cos(this._avatarAngle) * distance,
    )
    this.camera.lookAt(target.x, target.y + AVATAR.debugHeight * 0.78, target.z)
    this.camera.updateMatrixWorld()
  }

  /** Suelta el gatillo y deja el patrón de retroceso listo para otra ráfaga. */
  _releaseTrigger() {
    this._triggerHeld = false
    this._triggerConsumedByPanel = false
    this._sprayIndex = 0
  }

  /**
   * Raycast propio contra el panel de acciones, sin pasar por nada del arma.
   * Usa la mira limpia: la dispersión por movimiento desvía balas, no la
   * intención de pulsar un botón.
   *
   * @returns {boolean} si la pulsación se ha gastado en el panel
   */
  _tryPanelAction(now) {
    if (now - this._lastPanelActionAt < ACTION_PANEL.cooldownMs) return false
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(SCREEN_CENTER, this.camera)
    const panelHit = this.actionPanel.raycast(this.raycaster)
    if (!panelHit) return false
    // El tablero no tiene prioridad por ser el tablero: sólo se acciona si no
    // hay nada por delante. Con una diana o un muro entre medias, el disparo es
    // un disparo. Antes bastaba con que el rayo tocase el tablero en algún
    // punto, así que una diana pegada a un botón era imposible de matar.
    if (this._isNearerThanPanel(panelHit.distance)) return false

    this._lastPanelActionAt = now
    playUiConfirm()
    this._runPanelAction(panelHit.buttonId)
    return true
  }

  /**
   * ¿Hay una diana o una estructura más cerca que el tablero, sobre el mismo
   * rayo? Se mide con el rayo limpio de la cámara, no con el desviado por
   * retroceso y dispersión: la decisión es "a qué está apuntando el jugador",
   * y a un botón no se le falla por ir corriendo.
   */
  _isNearerThanPanel(panelDistance) {
    if (this.targets.hasActive) {
      this.targets.updateMatrices()
      const hit = this.targets.raycast(this.raycaster)
      if (hit && hit.distance < panelDistance) return true
    }

    const occluders = this.scenario.occluders
    if (occluders.length > 0) {
      this.raycaster.near = 0
      this.raycaster.far = panelDistance
      const blockers = this.raycaster.intersectObjects(occluders, false)
      this.raycaster.far = Infinity
      if (blockers.length > 0) return true
    }

    return false
  }

  _runPanelAction(buttonId) {
    switch (buttonId) {
      case 'pause':
        // Mismo camino que Escape: soltar el ratón pausa el cronómetro.
        if (this.isLocked) document.exitPointerLock()
        break
      case 'restart':
        // Ya estamos capturados, así que la sesión arranca aquí mismo en vez
        // de esperar al evento de pointerlock.
        this._beginSession()
        break
      case 'weapon':
        // **Alterna ranura, no recorre el catálogo.** Antes esto cambiaba el
        // ajuste, así que «cambiar de arma» en mitad de una partida se guardaba
        // como preferencia; ahora es lo que hace cambiar de arma en un juego:
        // sacar la otra de las dos que llevas.
        this._equipSlot(this.slot === 'primary' ? 'secondary' : 'primary')
        break
      // **Se conmuta el del arma que llevas**, no un interruptor del jugador:
      // desde la vuelta 43 cada arma tiene el suyo y la armería enseña los tres.
      // Un arma que no lo admita no se toca.
      case 'suppressor': {
        if (!this.weapon.supportsSuppressor) break
        const suppressor = getSettings().suppressor
        updateSettings({
          suppressor: { ...suppressor, [this.weaponKey]: !suppressor[this.weaponKey] },
        })
        break
      }
      case 'options':
        if (this.isLocked) document.exitPointerLock()
        this.callbacks.onOpenOptions?.()
        break
      default:
        break
    }
  }

  /**
   * Dispara si la cadencia del arma lo permite. Es el único camino hacia
   * `_shoot`: tanto el click como el fuego automático pasan por aquí, así que
   * las RPM acotan por igual a las dos.
   *
   * @returns {boolean} si el disparo llegó a salir
   */
  _tryShoot(now, instanteReal = this._simTime) {
    // Recargando o sin munición no sale nada. El aviso del cargador vacío lo
    // da la pulsación del gatillo, no este camino.
    if (this.reloading || this.ammo <= 0) return false
    // Abatido tampoco: el arma se calla hasta reaparecer. En red, quien dice
    // si estás vivo es el servidor.
    if (this.enRed ? this.net.vida <= 0 : !this.status.alive) return false

    const weapon = this.weapon
    const intervalMs = 60000 / weapon.rpm
    if (now < this._nextShotAt) return false

    // El siguiente disparo se cuenta desde el momento en que ESTE tocaba, no
    // desde el frame en que ha salido. Sin esto, el redondeo al refresco del
    // monitor infla el intervalo y las RPM reales dependerían de los Hz de la
    // pantalla. Si vamos más de un intervalo tarde —una pausa, un cambio de
    // arma— se reancla en `now` para no soltar una ráfaga de golpe.
    const scheduled = now - this._nextShotAt > intervalMs ? now : this._nextShotAt
    this._nextShotAt = scheduled + intervalMs

    // Una pausa lo bastante larga cierra la ráfaga: la siguiente vuelve a
    // empezar por el primer disparo del patrón.
    if (now - this._lastShotAt > RECOIL_RESET_MS) this._sprayIndex = 0
    this._lastShotAt = now

    // El orden importa: primero se dispara desde donde apunta la mira ahora
    // —con el retroceso ya acumulado de los disparos anteriores— y después el
    // arma empuja. Así el primer disparo de cada ráfaga sale limpio.
    this._shoot(instanteReal)
    this._applyRecoil(weapon)
    this._sprayIndex += 1
    this._consumeAmmo(weapon, now)
    return true
  }

  /**
   * Descuenta la bala y avisa cuando el cargador se queda corto. El aviso sale
   * una sola vez por cargador: al bajar del umbral, o al vaciarse si se pasó
   * de largo entre disparos.
   */
  _consumeAmmo(weapon, now) {
    this.ammo -= 1
    // Al vaciarse, la recarga arranca sola: quedarse mirando un gatillo muerto
    // no aporta nada. R sigue sirviendo para recargar antes de tiempo.
    if (this.ammo <= 0) {
      this._startReload(now)
      return
    }
    if (this._lowAmmoWarned) return
    const lowThreshold = Math.max(1, Math.floor(weapon.magazine * HELP.lowAmmoRatio))
    if (this.ammo > lowThreshold) return
    this._lowAmmoWarned = true
    this._showHelp('Pulsa R para recargar')
  }

  /**
   * Empuja la cámara según el disparo que toque del patrón.
   *
   * **El retroceso es una fuerza continua, no una animación con final** (vuelta
   * 61). Hasta la 60, agotado el patrón dejaba de empujar, y eso no se leía como
   * «ha llegado a su techo»: se leía como que **el arma se controla sola**. Con
   * la Rift —15 pasos de patrón y cargador de 30— eran **quince disparos
   * seguidos sin retroceso ninguno**, clavados en el mismo punto, o sea media
   * ráfaga convertida en un láser.
   *
   * Lo que no había, y el síntoma hacía sospechar, es una recuperación: la mira
   * **nunca vuelve sola** (ver `applyRecoil` en `lookControls.js`). Lo que había
   * era un array que se acababa.
   */
  _applyRecoil(weapon) {
    const pattern = weapon.recoil
    if (!pattern.length) return
    const step = pattern[this._pasoDelPatron(weapon)]
    this.controls.applyRecoil(step[0], step[1])
  }

  /**
   * Qué paso del patrón toca. Dentro del patrón, el que dice el índice; pasado
   * el final, **la cola en bucle** (`recoilLoopFrom`): la subida es de una vez y
   * el vaivén no se acaba mientras se mantenga el gatillo.
   *
   * Sin `recoilLoopFrom` la cola es el último paso, así que un arma a la que se
   * le olvide el número sigue empujando en vez de quedarse quieta. Que el
   * retroceso no pare es la regla; dónde repite es tuning.
   */
  _pasoDelPatron(weapon) {
    const pattern = weapon.recoil
    if (this._sprayIndex < pattern.length) return this._sprayIndex
    const desde = Math.min(
      Math.max(0, weapon.recoilLoopFrom ?? pattern.length - 1),
      pattern.length - 1,
    )
    const largo = pattern.length - desde
    return desde + ((this._sprayIndex - pattern.length) % largo)
  }

  _shoot(instanteReal = this._simTime) {
    this.shots += 1

    /**
     * **En red el disparo no se resuelve aquí: se manda** (vuelta 56). Quién
     * ha recibido el tiro lo decide el servidor rebobinando, y el veredicto
     * vuelve por `onVeredicto`; lo que se resuelve en local —contra el rival
     * tal como está dibujado ahora mismo— ya lo hace `net/cliente.js`, que es
     * el mismo código que corre el servidor (`net/disparo.js`). Duplicarlo aquí
     * serían dos fórmulas y una discrepancia que no diría nada de la red.
     *
     * El instante es **real**, no de juego: de él sale la fracción de paso con
     * la que viaja el disparo, y ésa es la mitad de la compensación de retraso.
     * Un clic trae el suyo del evento; el fuego automático, el del paso.
     */
    if (this.enRed) {
      this.camera.updateMatrixWorld()
      this.net.disparar(instanteReal, this.camera.rotation.y, this.camera.rotation.x)
      playWeaponShot(this.weaponKey, this.suppressorEnabled)
      this.callbacks.onShot?.(false)
      // La marca en la pared no se pone aquí: se pone cuando el cliente resuelve
      // este disparo contra el rival que estabas viendo (`onTiroLocal`, un paso
      // después). Si le diste, no hay marca — y quién recibió el tiro no lo
      // decide el motor, que es la regla de la vuelta 56.
      return
    }

    let hit = null
    if (this.targets.hasActive) {
      // Las matrices se actualizan a mano: el disparo ocurre entre frames y la
      // cámara puede haber rotado con el último mousemove.
      this.camera.updateMatrixWorld()
      this.targets.updateMatrices()
      this.raycaster.setFromCamera(SCREEN_CENTER, this.camera)
      // La cámara ya lleva el retroceso acumulado; encima se le suma el
      // desvío por movimiento, que es distinto en cada disparo.
      applySpread(this.raycaster.ray.direction, this.currentSpreadDeg)
      hit = this.targets.raycast(this.raycaster)
    } else {
      this.camera.updateMatrixWorld()
      this.raycaster.setFromCamera(SCREEN_CENTER, this.camera)
      applySpread(this.raycaster.ray.direction, this.currentSpreadDeg)
    }

    // **Dónde acaba la bala si no da en un muñeco**, con el rayo ya desviado
    // por retroceso y dispersión. De aquí salen las dos cosas que antes se
    // preguntaban por separado: si la cobertura tapa el tiro —sin esto se
    // mataría a través de la Espina y el escenario dejaría de significar algo—
    // y dónde poner la marca. Es **un** rayo por disparo, no dos, y nunca por
    // frame.
    const superficie = this._superficieBajoElRayo()
    if (hit && superficie && superficie.distancia < hit.distance) hit = null
    if (!hit && superficie) this.impacts.spawn(superficie.punto, superficie.normal, this.gameTime)

    // El sonido de disparo suena siempre; el de acierto se superpone.
    // Con muestra grabada suena la muestra; sin ella, la síntesis de siempre.
    // Quien dispara no elige: eso lo decide `samples.js`.
    playWeaponShot(this.weaponKey, this.suppressorEnabled)
    if (hit) {
      this.hits += 1
      const { killed } = this.targets.applyHit(hit, this.gameTime)
      if (killed) {
        this.kills += 1
        // Una baja perdona parte de la espera, si es que hay algo que perdonar.
        this.status.onKill()
      }
      playHit()
    }

    this.callbacks.onShot?.(hit !== null)
  }

  /**
   * **Contra qué superficie acaba el rayo que hay puesto en `this.raycaster`**:
   * una pieza de cobertura, o el suelo y las paredes de la sala. Devuelve el
   * punto, su normal y la distancia, o `null` si no hay ninguna —que fuera de
   * la sala no puede pasar, pero un escenario sin montar sí—.
   *
   * Dos mitades, y la segunda no es un rayo: **la sala es una caja y se
   * resuelve en aritmética**. Las paredes y el suelo están dibujados con líneas
   * (`grid.js`), no con mallas, así que no hay contra qué lanzar un rayo; y aun
   * habiéndolas, seis planos analíticos cuestan menos que un `intersectObjects`
   * y dan la normal exacta en vez de la de un triángulo.
   *
   * El objeto que devuelve es **de módulo y se reutiliza**: quien lo reciba lo
   * consume en el acto (la regla de cero alocaciones del bucle caliente).
   */
  _superficieBajoElRayo() {
    const ray = this.raycaster.ray
    let mejor = Infinity
    _impacto.punto.set(0, 0, 0)
    _impacto.normal.set(0, 1, 0)

    const occluders = this.scenario.occluders
    if (occluders.length > 0) {
      this.raycaster.near = 0
      this.raycaster.far = Infinity
      const golpes = this.raycaster.intersectObjects(occluders, false)
      const golpe = golpes.length > 0 ? golpes[0] : null
      if (golpe) {
        mejor = golpe.distance
        _impacto.punto.copy(golpe.point)
        if (golpe.face) {
          // De espacio de objeto a mundo. Las cajas no giran, pero las rampas
          // sí, y una normal girada a mano es la forma de dibujar una marca
          // atravesada dentro de la cuña.
          _normales.getNormalMatrix(golpe.object.matrixWorld)
          _impacto.normal.copy(golpe.face.normal).applyMatrix3(_normales).normalize()
        } else {
          _impacto.normal.copy(ray.direction).negate()
        }
      }
    }

    // La sala: el jugador está dentro de la caja, así que lo que se busca es
    // por dónde **sale** el rayo. Con el origen dentro, eso es el menor de los
    // tres cortes contra la pareja de planos de cada eje.
    const room = this.scenario.room
    const half = { x: room.width / 2, y: room.height, z: room.depth / 2 }
    const o = ray.origin
    const d = ray.direction
    let salida = Infinity
    let eje = -1
    let signo = 1
    const mirar = (dv, ov, min, max, cual) => {
      if (dv === 0) return
      const t = (dv > 0 ? max - ov : min - ov) / dv
      if (t >= 0 && t < salida) {
        salida = t
        eje = cual
        signo = dv > 0 ? -1 : 1
      }
    }
    mirar(d.x, o.x, -half.x, half.x, 0)
    mirar(d.y, o.y, 0, half.y, 1)
    mirar(d.z, o.z, -half.z, half.z, 2)

    if (salida < mejor) {
      mejor = salida
      _impacto.punto.copy(d).multiplyScalar(salida).add(o)
      _impacto.normal.set(eje === 0 ? signo : 0, eje === 1 ? signo : 0, eje === 2 ? signo : 0)
    }
    if (!Number.isFinite(mejor)) return null
    _impacto.distancia = mejor
    return _impacto
  }

  /**
   * **La marca de un disparo de red**, puesta donde el cliente ha resuelto que
   * la bala acabó. Llega un paso después de apretar —el veredicto local se saca
   * al ejecutar la entrada, que es donde lo hace el servidor— y eso son 16 ms
   * que no se ven; lo que se gana es no tener una segunda idea de «a quién le
   * has dado» dentro del motor.
   */
  _impactoDeRed(yaw, pitch) {
    if (!this.impacts.mesh) return
    // La misma dirección con la que viajó el disparo, construida igual que en
    // `net/disparo.js`: el rayo de aquí no puede apuntar a otro sitio que el
    // que se resolvió allí.
    _dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
    this.raycaster.ray.origin.copy(this.camera.position)
    this.raycaster.ray.direction.copy(_dir).normalize()
    const superficie = this._superficieBajoElRayo()
    if (superficie) this.impacts.spawn(superficie.punto, superficie.normal, this.gameTime)
  }

  _onPointerLockChange() {
    if (this.isLocked) {
      if (this.enRed) {
        // **Capturar el ratón no arranca nada: lo que arranca es la partida.**
        // Lo que se enciende aquí es el *mando* —mirar y teclear—, no el mundo:
        // el mundo lleva corriendo desde que el servidor dio la bienvenida.
        this.controls.enabled = true
        this.movement.connect(window)
        if (this.phase !== PHASE.RUNNING) this._beginSession()
        return
      }
      if (this.phase === PHASE.IDLE || this.phase === PHASE.FINISHED) this._beginSession()
      else if (this.phase === PHASE.PAUSED) {
        this.controls.enabled = true
        // Abatido se reanuda mirando, no andando: el movimiento vuelve con el
        // jugador, no con el ratón.
        this.movement.setEnabled(this.status.alive)
        this._setPhase(PHASE.RUNNING)
      }
      return
    }
    /**
     * **En red, soltar el ratón no pausa nada** (vuelta 56, y es la regla de la
     * 53). Una pausa es parar el mundo de los dos y sólo la decide el servidor;
     * un `_suspend()` aquí sería justo el «estoy en pausa» local que aquella
     * vuelta quitó — y además dejaría de producir entradas, así que un abatido
     * no volvería a reaparecer nunca: la reaparición cuelga de sus entradas.
     *
     * Lo que sí se hace es la verdad de lo que pasa: se sueltan las teclas
     * —quien abre el menú no está pulsando nada— y se apaga la mirada. El mundo
     * sigue corriendo hasta que la foto diga otra cosa.
     */
    if (this.enRed) {
      this.controls.enabled = false
      this._releaseTrigger()
      // **Se desconecta el teclado, no se apaga el movimiento.** El servidor
      // sigue ejecutando las entradas de este jugador pase lo que pase, así que
      // el cliente tiene que seguir prediciéndolas: apagar `movement` pararía
      // `update()` en este lado y sólo en éste, o sea una corrección por paso.
      // Lo que sobra con el ratón suelto son las teclas, y eso se quita
      // quitando el oyente.
      this.movement.disconnect()
      this.movement.releaseKeys()
      this.movement.releaseInput()
      return
    }
    // Perder la captura en plena partida pausa el reloj en lugar de
    // terminarla: salir con Escape no debería arruinar la sesión.
    this._suspend()
  }

  /**
   * **Soltar la partida sin terminarla.** Apaga controles y movimiento, suelta
   * el gatillo y pasa a pausa si se estaba jugando.
   *
   * Existe como método porque hay **dos** formas de dejar de jugar sin acabar
   * —Escape, que suelta el ratón, y abrir la armería— y las dos tienen que dejar
   * exactamente el mismo estado. Dos trozos de código parecidos es como acaba
   * una pausa con el gatillo todavía pulsado.
   */
  _suspend() {
    this.controls.enabled = false
    this._releaseTrigger()
    this.movement.setEnabled(false)
    if (this.phase === PHASE.RUNNING) this._setPhase(PHASE.PAUSED)
  }

  _onResize() {
    const parent = this.canvas.parentElement
    const width = parent ? parent.clientWidth : window.innerWidth
    const height = parent ? parent.clientHeight : window.innerHeight
    if (width === 0 || height === 0) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.cssRenderer.setSize(width, height)
  }

  _loop(now) {
    this._rafId = requestAnimationFrame(this._loop)

    const rafDelta = now - this._lastRafTime
    this._lastRafTime = now
    if (!this._dueThisTick(rafDelta)) return

    // El delta del juego es el tiempo real transcurrido desde el fotograma
    // anterior *dibujado*, no el intervalo objetivo: si se limita a 60 en un
    // monitor de 240, el reloj del juego tiene que seguir yendo a tiempo real.
    const delta = Math.min(now - this._lastFrameTime, SIM.maxFrameDeltaMs)
    this._lastFrameTime = now
    this._sampleFps(delta)

    this._advanceSimulation(now, delta)

    // La vista del avatar se lleva la cámara mientras esté abierta. Va después
    // del movimiento y antes de dibujar, como cualquier otra cosa que la mueva.
    if (this._avatarDebug) this._updateAvatarDebug(delta / 1000)
    // Agacharse achata el cuerpo. Va aquí y no en el movimiento porque es
    // presentación, no física: una escritura de escala con la altura de ojos
    // que el movimiento ya ha resuelto este frame.
    this.avatar?.setEyeHeight(this.movement.eyeHeight)
    // Y la cámara pasa a la pose de dibujado, que ya no es la del último paso.
    this._applyRenderPose()

    this.actionPanel.follow(this.camera)
    this.actionPanel.syncLayout()
    this._publishStats()
    this.renderer.render(this.scene, this.camera)
    this.cssRenderer.render(this.cssScene, this.camera)

    // **Y se devuelve.** La pose interpolada vive sólo lo que dura el dibujado:
    // fuera de estas tres líneas `camera.position` es siempre la autoritativa,
    // que es lo que deja que cualquiera la escriba sin que el frame siguiente
    // se la pise.
    this._restoreSimPose()
  }

  /**
   * **El mundo avanza en pasos de tamaño fijo** (vuelta 44), y el monitor sólo
   * decide cuándo se dibuja. Es el mismo mecanismo que el limitador de
   * fotogramas —sumar el tiempo real, descontar un intervalo cuando toca y
   * **guardar el sobrante**— aplicado a la simulación en vez de al dibujado, y
   * con la misma tolerancia por la misma razón: sin ella, un monitor a 60 Hz
   * entrega frames de 16.666 ms contra un paso de 16.667 y el primer paso se
   * escaparía por los pelos.
   *
   * El porqué está en `config.js` (`SIM`): el modelo vectorial del aire es una
   * integración cuya entrada es el ratón, y con paso variable su resultado
   * dependía del refresco. Con paso fijo el juego se comporta a 240 Hz
   * exactamente como se comporta a 60.
   *
   * `delta` ya viene acotado por `SIM.maxFrameDeltaMs`, así que un parón del
   * navegador no se paga con una avalancha de pasos: seis como mucho.
   */
  _advanceSimulation(now, delta) {
    const step = SIM_STEP_MS
    // **En red el ritmo lo pone el cliente** (vuelta 56). No es el mismo
    // acumulador con otro nombre: además del sobrante lleva el enganche al
    // reloj del servidor, el re-anclaje tras un parón y el freno con suelo, que
    // son las vueltas 49 y 51 y no tienen sentido fuera de una partida. Vive en
    // `net/cliente.js` para que no haya dos copias de ese cálculo.
    if (this.enRed) {
      this._advanceNet(now, delta)
      return
    }
    const tolerance = Math.min(1, step * 0.1)
    this._simAccumulator += delta

    while (this._simAccumulator >= step - tolerance) {
      this._simAccumulator -= step
      this._simTime += step
      this._simStep(step)
    }

    // **Re-anclado del reloj del mundo.** Los pasos son fijos y los frames no,
    // así que el final del último paso queda un `_simAccumulator` por detrás de
    // este frame: `_simTime` es un **instante real**, no un reloj aparte, y por
    // eso el aterrizaje que se despeja de la parábola se puede comparar sin
    // traducir con el `timeStamp` de un evento de teclado. Por construcción
    // esta línea no cambia nada; hace falta para el caso en que `delta` se haya
    // acotado —un parón largo—, donde los dos relojes se separarían para
    // siempre si no se volvieran a juntar aquí.
    this._simTime = now - this._simAccumulator
  }

  /**
   * **Los pasos de un frame en red** (vuelta 56).
   *
   * El mundo sigue yendo a 60 Hz fijos; lo que cambia es quién decide cuántos
   * pasos caben en este frame, y la respuesta no es el acumulador solo: es el
   * acumulador **enganchado al reloj del servidor**. Eso vive en el cliente
   * (`pasosDeFrame`), que además es quien mueve al jugador dentro de cada paso.
   *
   * Tres cosas que son el mecanismo:
   *
   * - **En pausa no se gasta paso y el acumulador no guarda el rato parado.**
   *   Dejarlo acumular sería soltar un minuto de pasos de golpe al reanudar; es
   *   la misma razón por la que el motor acota el frame largo.
   * - **Un re-anclaje no se interpola.** Tras un parón el número de paso salta,
   *   y dibujar el punto intermedio sería barrer medio mapa: se suelta la pose
   *   guardada, igual que con un teletransporte.
   * - **`_simTime` se re-ancla al final**, exactamente como fuera de la red:
   *   sigue siendo un instante real un sobrante por detrás de este frame, y de
   *   ahí sale la fracción con la que viaja la pulsación de salto.
   */
  _advanceNet(now, delta) {
    // Antes de la bienvenida no hay reloj al que engancharse: consultarlo sería
    // leer un atraso que crece contra un mundo en el que nadie está jugando.
    if (this.phase !== PHASE.RUNNING || this.net.pausa.pausada) {
      this.net.soltarAcumulador()
      this._simAccumulator = 0
      this._simTime = now
      return
    }
    const { pasos, reanclado } = this.net.pasosDeFrame(now, delta)
    // **Un re-anclaje no se interpola.** Soltar la época hace que el paso
    // siguiente vuelva a sembrar las dos poses, que es el mismo mecanismo con
    // el que no se interpola un teletransporte.
    if (reanclado) this._simPoseEpoch = -1
    for (let i = 0; i < pasos; i++) {
      // Cuándo empezó **este** paso en tiempo real: de ahí sale la fracción de
      // paso con la que viajan la pulsación de salto y el clic de disparo.
      const inicio = now - this.net.acumulador - (pasos - i) * SIM_STEP_MS
      this._simTime = inicio + SIM_STEP_MS
      this._simStep(SIM_STEP_MS, inicio)
    }
    this._simAccumulator = this.net.acumulador
    this._simTime = now - this._simAccumulator
  }

  /**
   * Un paso de mundo. Es literalmente lo que hacía el frame hasta la vuelta 43,
   * con dos diferencias: el delta es fijo y las tres actualizaciones del mundo
   * —dianas, combate y objetivo— viven ya en el mismo sitio que el movimiento
   * en vez de en un segundo bloque más abajo. La condición de fase sigue siendo
   * la misma y sigue cubriéndolas a todas: **el mundo sólo avanza jugando**, y
   * pausar es dejar de sumarle al reloj (ver `CLAUDE.md`).
   */
  _simStep(stepMs, inicioDePaso = this._simTime - stepMs) {
    if (this.phase !== PHASE.RUNNING) return

    // El reloj del mundo avanza aquí y **sólo aquí**: pausar es dejar de
    // sumarle, y con eso se para todo lo que cuelga de él.
    this.gameTime += stepMs
    this._updateReload(this.gameTime)
    this.elapsedMs += stepMs
    // Con explosivo, el reloj de la sesión es su cuenta atrás: la duración
    // fija no se aplica, o los 30 s cortarían la partida antes de los 45.
    if (!this.endless && !this.objectiveRunning && this.elapsedMs >= this.durationMs) {
      this.elapsedMs = this.durationMs
      this._finishSession()
      return
    }

    // De dónde sale el jugador este paso. Se lee de la cámara y no de la copia
    // anterior a propósito: **la posición autoritativa es `camera.position`**,
    // y quien la escriba desde fuera —una reaparición, una prueba, la vista de
    // depuración— manda sobre lo que hubiera guardado el dibujado.
    this._simPrev.copy(this.camera.position)

    // **En red no se mueve el motor: se da un paso de red.** `dar()` muestrea
    // las teclas —que son las mismas de `movement.keys`—, predice llamando al
    // mismo `movement.update` y manda la entrada sellada con su número de paso.
    // Llamar aquí a `movement.update` además sería dar el paso dos veces.
    if (this.enRed) this.net.dar(this.net.paso + 1, inicioDePaso)
    else this.movement.update(stepMs / 1000, this._simTime)

    // Y aquí queda dónde acaba. Si el movimiento ha teletransportado (`reset`),
    // la época cambia y este paso no se interpola: se dibuja donde toca en vez
    // de barrer medio mapa.
    if (this._simPoseEpoch !== this.movement.poseEpoch) {
      this._simPoseEpoch = this.movement.poseEpoch
      this._simPrev.copy(this.camera.position)
    }
    this._simCurr.copy(this.camera.position)

    const landing = this.movement.takeLandingImpact()
    if (landing > 0) playLanding(landing)
    // Fuego automático: como mucho un disparo por paso. A 60 Hz eso son 3600
    // RPM de techo, muy por encima de cualquier arma del roster — y desde la
    // vuelta 44 ese techo ya no depende del refresco ni del límite de FPS.
    if (this._triggerHeld && !this._triggerConsumedByPanel && this.weapon.mode === 'auto') {
      this._tryShoot(this.gameTime)
    }

    // Las marcas de bala se apagan con el **reloj del mundo** y en los dos
    // modos, así que van aquí y no dentro del combate —que en red vuelve antes—.
    // En pausa una marca se queda quieta en vez de apagarse a tus espaldas.
    this.impacts.update(this.gameTime)

    // Dianas y explosivo son del entrenamiento: en red no hay ni una cosa ni
    // otra, y el combate lo sustituye el estado que llega del servidor.
    if (!this.enRed) this.targets.update(this.gameTime, stepMs / 1000, this.camera)
    // El combate va después de las dianas: los muñecos disparan desde donde
    // han quedado este paso, no desde donde estaban en el anterior.
    this._updateCombat(this.gameTime, stepMs)
    if (!this.enRed) this._updateObjective(this.gameTime, stepMs / 1000)
  }

  /**
   * **La pose con la que se dibuja este frame.** Entre dos pasos de mundo la
   * cámara se coloca en el punto intermedio que le toque, así que un monitor de
   * 240 Hz sigue viendo movimiento a 240 Hz aunque el mundo vaya a 60. La
   * rotación no entra aquí: la escribe el ratón evento a evento y ya es fina.
   *
   * Sólo mientras se juega. En pausa la cámara se queda en la última pose
   * autoritativa, que es la que de verdad ocupa el jugador, y la vista de
   * depuración (F3) mueve la cámara por su cuenta sin que esto la pise.
   */
  _applyRenderPose() {
    this._interpolating = false
    // La vista de depuración manda sobre la cámara mientras esté abierta.
    if (this._avatarDebug) return
    // Fuera de la partida no hay nada entre lo que interpolar: la cámara ya
    // está donde el jugador está de verdad.
    if (this.phase !== PHASE.RUNNING) return
    if (this._simPoseEpoch !== this.movement.poseEpoch) return
    const alpha = this._simAccumulator / SIM_STEP_MS
    this.camera.position.lerpVectors(
      this._simPrev,
      this._simCurr,
      alpha < 0 ? 0 : alpha > 1 ? 1 : alpha,
    )
    this._interpolating = true
  }

  /** Devuelve la cámara a la pose autoritativa en cuanto se ha dibujado. */
  _restoreSimPose() {
    if (!this._interpolating) return
    this._interpolating = false
    this.camera.position.copy(this._simCurr)
  }

  /**
   * Decide si a este tick de rAF le toca dibujar.
   *
   * En vez de saltarse fotogramas a lo bruto, se acumula el tiempo y se
   * descuenta un intervalo objetivo cada vez que se dibuja, guardando el
   * sobrante. Así el ritmo medio sale exacto aunque el objetivo no sea un
   * divisor del refresco del monitor, y el movimiento no va a tirones.
   *
   * La tolerancia evita el fallo clásico de pedir el mismo límite que el
   * refresco de la pantalla: un tick de 4.166 ms no llega por los pelos a un
   * objetivo de 4.167 y el ritmo se quedaría a la mitad.
   */
  _dueThisTick(rafDelta) {
    const interval = this._frameIntervalMs
    if (interval <= 0) return true

    this._frameAccumulator += rafDelta
    const tolerance = Math.min(1, interval * 0.1)
    if (this._frameAccumulator < interval - tolerance) return false

    this._frameAccumulator -= interval
    // Si el monitor no da para el límite pedido, no se acumula una deuda
    // imposible de pagar: se dibuja en cada tick y ya está.
    if (this._frameAccumulator > interval) this._frameAccumulator = interval
    return true
  }

  /** Media móvil de los últimos fotogramas dibujados. */
  _sampleFps(delta) {
    if (delta <= 0) return
    const samples = this._frameSamples
    const index = this._frameSampleIndex
    this._frameSampleSum += delta - samples[index]
    samples[index] = delta
    this._frameSampleIndex = (index + 1) % samples.length
    if (this._frameSampleCount < samples.length) this._frameSampleCount += 1
    this.fps = this._frameSampleSum > 0 ? (this._frameSampleCount * 1000) / this._frameSampleSum : 0
  }

  _publishStats() {
    const stats = this.stats
    stats.fps = this.fps
    stats.ammo = this.ammo
    stats.magazine = this.weapon.magazine
    stats.reloading = this.reloading
    stats.reloadProgress = this.reloading
      ? Math.min(1, (this.gameTime - this.reloadStartedAt) / this.weapon.reloadMs)
      : 0
    stats.endless = this.endless
    // El cronómetro cuenta hacia arriba en práctica libre y también con
    // explosivo: enseñar lo que queda sería un temporizador de bomba en el HUD,
    // y la cuenta atrás sólo se puede oír, no leer.
    stats.countUp = this.endless || this.objectiveRunning
    stats.timeLeftMs = stats.countUp
      ? this.elapsedMs
      : Math.max(0, this.durationMs - this.elapsedMs)
    stats.hits = this.hits
    stats.shots = this.shots
    stats.misses = this.shots - this.hits
    stats.kills = this.kills
    stats.accuracy = this.shots > 0 ? (this.hits / this.shots) * 100 : 0
    // **El marcador**, con los datos de la sesión y no con una copia aparte:
    // bajas y precisión ya estaban aquí, y muertes es el único dato nuevo.
    // Sólo se abre jugando; en pausa y en el resumen hay paneles de verdad.
    stats.scoreboard = this._scoreboardHeld && this.phase === PHASE.RUNNING
    stats.deaths = this.status.deaths
    stats.nick = PLAYER.nick
    // Estrellas en vivo: sólo hay puntuación donde hay objetivo que puntuar.
    stats.scoring = this.objective.active
    if (stats.scoring) stats.stars = this._currentScore().stars

    // **En red la vida la dice el servidor** (vuelta 56), y el bloque de
    // vitales sale siempre: hay quien dispare por definición. Escudo y casco se
    // quedan a cero a propósito — esta vuelta es sólo vida.
    if (this.enRed) {
      stats.combat = true
      stats.health = this.net.vida
      // **Escudo y casco existen en red desde la vuelta 64**, porque hay una
      // tienda que los vende. Las cargas no: recargar el chaleco a mano es del
      // entrenamiento, y en el duelo se compra entre rondas.
      stats.shield = this.net.escudo ?? 0
      stats.shieldSegments = Math.ceil((this.net.escudo ?? 0) / PLAYER.shield.segment)
      stats.maxSegments = Math.round(PLAYER.shield.max / PLAYER.shield.segment)
      stats.charges = 0
      stats.helmet = !!this.net.casco
      stats.applying = false
      stats.applyProgress = 0
      stats.alive = this.net.vida > 0
      stats.respawnLeftMs = this.net.restaReaparicionMs()
      stats.respawnMs = NET.respawnMs
      stats.invulnerableLeftMs = 0
      stats.invulnerableMs = 0
      stats.lowHealth = this.net.vida > 0 && this.net.vida < PLAYER.lowHealth
      stats.deaths = this.net.muertes ?? 0
      stats.kills = this.net.bajas ?? this.kills
      this.callbacks.onFrame?.(stats)
      return
    }
    // Vida y escudo: el bloque sólo aparece donde hay quien dispare.
    const status = this.status
    stats.combat = this.enemyFire.enabled
    stats.health = status.health
    stats.shield = status.shield
    stats.shieldSegments = status.shieldSegments
    stats.maxSegments = status.maxSegments
    stats.charges = status.charges
    stats.helmet = status.helmet
    stats.applying = status.applying
    stats.applyProgress = status.applyProgress
    stats.alive = status.alive
    stats.respawnLeftMs = status.respawnLeftMs
    stats.respawnMs = status.respawnMs
    stats.invulnerableLeftMs = status.invulnerableLeftMs
    stats.invulnerableMs = PLAYER.respawn.invulnerableMs
    stats.lowHealth = status.lowHealth
    this.callbacks.onFrame?.(stats)
  }
}
