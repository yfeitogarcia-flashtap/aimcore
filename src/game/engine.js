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
  FRAME_LIMITS,
  OBJECTIVE,
  MOVEMENT,
  HELP,
  PLAYER,
  RECOIL_RESET_MS,
  RENDER,
  SECONDARY_WEAPON,
  DEATHMATCH_DURATIONS,
  SESSION_DURATION_S,
  SESSION_MODES,
  TARGET,
  WEAPONS,
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
  playDryFire,
  playHeal,
  playHelmetCrack,
  playHit,
  playLanding,
  playObjectiveDefused,
  playObjectiveExplosion,
  playShieldCharge,
  playUiConfirm,
} from '../audio/sfx.js'
import { loadWeaponSamples, playWeaponShot } from '../audio/samples.js'
import { attachListener, detachListener, setSpatialEnabled } from '../audio/spatial.js'
import { ActionPanel } from './actionPanel.js'
import { Avatar } from './avatar.js'
import { EnemyFire } from './enemyFire.js'
import { DummyMarkers } from './markers.js'
import { MuzzleFlash } from './muzzleFlash.js'
import { PickupField } from './pickups.js'
import { PlayerStatus, playerBody } from './player.js'
import { getSettings, subscribeSettings, updateSettings } from '../settings.js'
import { eventCode, getKeybinds, keysOf, subscribeKeybinds } from '../keybinds.js'

/** Centro exacto de la pantalla: el crosshair no se mueve, así que es constante. */
const SCREEN_CENTER = new THREE.Vector2(0, 0)

/** Tope de delta por frame: evita saltos del reloj tras un parón del navegador. */
const MAX_FRAME_DELTA_MS = 100

const DEG_TO_RAD = Math.PI / 180

// Vectores de módulo para desviar el rayo: el disparo no aloca nada.
const _spreadU = new THREE.Vector3()
const _spreadV = new THREE.Vector3()
const _spreadUp = new THREE.Vector3(0, 1, 0)
const _spreadFallback = new THREE.Vector3(1, 0, 0)
/** Hacia dónde mira la cámara, para saber de qué lado te han disparado. */
const _bearingForward = new THREE.Vector3()

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
   * @param {HTMLCanvasElement} canvas
   * @param {{
   *   onPhaseChange?: (phase: string) => void,
   *   onFrame?: (stats: object) => void,
   *   onShot?: (hit: boolean) => void,
   *   onFinish?: (summary: object) => void,
   * }} callbacks
   */
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas
    this.callbacks = callbacks

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
    this.scenario = new Scenario(this.scene, getSettings().scenario)
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
    try {
      const result = element.requestPointerLock({ unadjustedMovement: true })
      if (result && typeof result.catch === 'function') result.catch(fallback)
    } catch {
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
    this._applyScenario(settings.scenario)
    setSpatialEnabled(settings.spatialAudio)
    this.controls.setSensitivity(settings.sensitivity)
    const limit = FRAME_LIMITS[settings.frameLimit].fps
    this._frameIntervalMs = limit > 0 ? 1000 / limit : 0
    this._frameAccumulator = 0
    this.helpMessagesEnabled = settings.helpMessages
    // Cambiar de arma principal cambia la ranura, no el arma vigente: si en ese
    // momento llevabas la pistola, la principal nueva te espera en la tecla 1.
    // Y espera **llena**: el cargador guardado era el de la que ya no llevas.
    if (settings.weapon !== this.slots.primary) {
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
    this.enemyFire.setEnabled(this.scenario.hasGeometry && settings.targetType === 'hitbox')
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
    this.enemyFire.setEnabled(this.scenario.hasGeometry && getSettings().targetType === 'hitbox')
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
    this.slot = 'primary'
    this.weaponKey = this.slots.primary
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
    this.suppressorEnabled = settings.suppressor && this.weapon.supportsSuppressor
    // **Y lo que pesa se nota al andar.** Va aquí y no en `_equipSlot` porque
    // éste es el único sitio por el que pasan los tres caminos que cambian el
    // arma vigente: la tecla, el ajuste de principal y la armería.
    this.movement.setWeaponWeight(this.weapon.weight)
    this.actionPanel.update({
      weaponLabel: this.weapon.label,
      suppressorSupported: this.weapon.supportsSuppressor,
      suppressorEnabled: this.suppressorEnabled,
    })
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
    this.endless = this.mode === 'deathmatch' && deathmatchSeconds === 0
    this.durationMs =
      (this.mode === 'deathmatch' ? deathmatchSeconds : SESSION_DURATION_S) * 1000
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
    this.enemyFire.begin()
    this.pickups.begin()
    // La primera diana nace en la posición ya reseteada del jugador.
    this.camera.updateMatrixWorld()
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

  _onMouseDown(event) {
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
      playDryFire()
      // Pedir R mientras la recarga ya corre sería un mal consejo: el HUD
      // enseña su barra y no hay nada que pulsar.
      if (!this.reloading) this._showHelp('Pulsa R para recargar')
      return
    }
    this._tryShoot(now)
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

  /** Abatido: se congela al jugador y arranca la cuenta de reaparición. */
  _downPlayer() {
    this.status.die()
    this._stopShieldSound()
    this._releaseTrigger()
    this._cancelReload()
    this._defuseHeld = false
    // La mirada se queda: ver quién te ha matado es información. Lo que se
    // apaga es andar y disparar.
    this.movement.setEnabled(false)
  }

  _respawnPlayer() {
    this.status.respawn()
    this.movement.reset()
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
    // Y se pausa aquí mismo, sin esperar al evento de pointer lock: el cambio de
    // captura es asíncrono y hasta que llega seguiría corriendo el reloj —y con
    // él los muñecos—. Es el mismo `_suspend` que usa Escape, no una segunda
    // pausa.
    this._suspend()
    this.callbacks.onArmoury?.()
  }

  _onKeyDown(event) {
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
      case 'suppressor':
        updateSettings({ suppressor: !getSettings().suppressor })
        break
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
  _tryShoot(now) {
    // Recargando o sin munición no sale nada. El aviso del cargador vacío lo
    // da la pulsación del gatillo, no este camino.
    if (this.reloading || this.ammo <= 0) return false
    // Abatido tampoco: el arma se calla hasta reaparecer.
    if (!this.status.alive) return false

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
    this._shoot()
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

  /** Empuja la cámara según el disparo que toque del patrón. */
  _applyRecoil(weapon) {
    const pattern = weapon.recoil
    // Agotado el patrón, el retroceso se queda en su techo y deja de crecer.
    if (this._sprayIndex >= pattern.length) return
    const step = pattern[this._sprayIndex]
    this.controls.applyRecoil(step[0], step[1])
  }

  _shoot() {
    this.shots += 1

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
      // Con cobertura por medio, el disparo se para en el muro. Sin esto se
      // podría matar a través de la Espina y el escenario entero dejaría de
      // significar nada. Es un raycast más por disparo, no por frame.
      if (hit && this._isBlockedByCover(hit)) hit = null
    }

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
   * ¿Hay geometría del escenario más cerca que el impacto? Se comprueba con el
   * rayo ya desviado por retroceso y dispersión, así que un tiro que se va a la
   * cobertura se come la cobertura.
   */
  _isBlockedByCover(hit) {
    const occluders = this.scenario.occluders
    if (occluders.length === 0) return false
    this.raycaster.near = 0
    this.raycaster.far = hit.distance
    const blockers = this.raycaster.intersectObjects(occluders, false)
    this.raycaster.far = Infinity
    return blockers.length > 0
  }

  _onPointerLockChange() {
    if (this.isLocked) {
      if (this.phase === PHASE.IDLE || this.phase === PHASE.FINISHED) this._beginSession()
      else if (this.phase === PHASE.PAUSED) {
        this.controls.enabled = true
        // Abatido se reanuda mirando, no andando: el movimiento vuelve con el
        // jugador, no con el ratón.
        this.movement.setEnabled(this.status.alive)
        this._setPhase(PHASE.RUNNING)
      }
    } else {
      // Perder la captura en plena partida pausa el reloj en lugar de
      // terminarla: salir con Escape no debería arruinar la sesión.
      this._suspend()
    }
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
    const delta = Math.min(now - this._lastFrameTime, MAX_FRAME_DELTA_MS)
    this._lastFrameTime = now
    this._sampleFps(delta)

    if (this.phase === PHASE.RUNNING) {
      // El reloj del mundo avanza aquí y **sólo aquí**: pausar es dejar de
      // sumarle, y con eso se para todo lo que cuelga de él.
      this.gameTime += delta
      this._updateReload(this.gameTime)
      this.elapsedMs += delta
      // Con explosivo, el reloj de la sesión es su cuenta atrás: la duración
      // fija no se aplica, o los 30 s cortarían la partida antes de los 45.
      if (!this.endless && !this.objectiveRunning && this.elapsedMs >= this.durationMs) {
        this.elapsedMs = this.durationMs
        this._finishSession()
      } else {
        // `delta` ya viene acotado, así que la integración del salto no pega
        // un salto raro si el navegador se queda parado un momento.
        this.movement.update(delta / 1000, now)
        const landing = this.movement.takeLandingImpact()
        if (landing > 0) playLanding(landing)
        // Fuego automático: como mucho un disparo por frame. A 60 Hz eso son
        // 3600 RPM de techo, muy por encima de cualquier arma del roster.
        if (this._triggerHeld && !this._triggerConsumedByPanel && this.weapon.mode === 'auto') {
          this._tryShoot(this.gameTime)
        }
      }
    }

    // La vista del avatar se lleva la cámara mientras esté abierta. Va después
    // del movimiento y antes de dibujar, como cualquier otra cosa que la mueva.
    if (this._avatarDebug) this._updateAvatarDebug(delta / 1000)
    // Agacharse achata el cuerpo. Va aquí y no en el movimiento porque es
    // presentación, no física: una escritura de escala con la altura de ojos
    // que el movimiento ya ha resuelto este frame.
    this.avatar?.setEyeHeight(this.movement.eyeHeight)

    // **El mundo sólo avanza jugando**, y va con el reloj del mundo. Las dos
    // cosas juntas, porque cada una sola dejaba un agujero: pasar delta cero
    // congelaba lo que iba por delta y dejaba corriendo lo que iba por fecha
    // —los muñecos siguieron disparando en pausa hasta la vuelta 42—, y parar
    // el reloj sin dejar de llamar habría dejado colar el disparo que tocaba
    // justo en el frame de pausar.
    if (this.phase === PHASE.RUNNING) {
      this.targets.update(this.gameTime, delta / 1000, this.camera)
      // El combate va después de las dianas: los muñecos disparan desde donde
      // han quedado este frame, no desde donde estaban en el anterior.
      this._updateCombat(this.gameTime, delta)
      this._updateObjective(this.gameTime, delta / 1000)
    }
    this.actionPanel.follow(this.camera)
    this.actionPanel.syncLayout()
    this._publishStats()
    this.renderer.render(this.scene, this.camera)
    this.cssRenderer.render(this.cssScene, this.camera)
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
