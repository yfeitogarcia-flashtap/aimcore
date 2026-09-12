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
  CAMERA,
  COVER,
  FRAME_LIMITS,
  OBJECTIVE,
  MOVEMENT,
  HELP,
  RECOIL_RESET_MS,
  RENDER,
  SESSION_DURATION_S,
  WEAPON_KEYS,
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
  playDryFire,
  playHit,
  playLanding,
  playObjectiveDefused,
  playObjectiveExplosion,
  playShot,
  playUiConfirm,
} from '../audio/sfx.js'
import { attachListener, detachListener, setSpatialEnabled } from '../audio/spatial.js'
import { ActionPanel } from './actionPanel.js'
import { getSettings, subscribeSettings, updateSettings } from '../settings.js'

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

    this.actionPanel = new ActionPanel(this.scene, this.cssScene)
    this.actionPanel.setAnchor(this.scenario.spawn, this.scenario.room)
    this.targets.setRoutes(this.scenario.routes, this.scenario.points, this.scenario.occluders, this.scenario.room)
    /** Última activación del panel, para el antirrebote. */
    this._lastPanelActionAt = -Infinity
    /** Si la pulsación en curso ya se gastó en el panel, no dispara. */
    this._triggerConsumedByPanel = false

    this.phase = PHASE.IDLE
    this.durationMs = SESSION_DURATION_S * 1000
    /** Sesión sin cronómetro: no termina sola, la cierra el jugador. */
    this.endless = false
    this._pendingEndless = false
    this.elapsedMs = 0
    this.shots = 0
    this.hits = 0
    this.kills = 0

    /** Arma vigente y estado de la ráfaga en curso. */
    this.weaponKey = getSettings().weapon
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
    if (this._resizeObserver) this._resizeObserver.disconnect()
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
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
    // Reiniciar conserva el modo: quien estaba en práctica libre sigue en ella.
    this._pendingEndless = this.endless
    this.controls.reset()
    this.requestLock()
  }

  /**
   * Pide la captura del ratón para arrancar una sesión en el modo indicado.
   * El modo se guarda aquí y lo recoge `_beginSession` cuando llega el evento
   * de pointerlock, que es cuando la sesión empieza de verdad.
   */
  requestStart(endless = false) {
    this._pendingEndless = endless
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
    // El silenciador sólo cuenta si el arma lo admite: así dejar el ajuste
    // puesto y cambiar a un arma que no lo lleva no hace nada raro.
    this.suppressorEnabled = settings.suppressor && this.weapon.supportsSuppressor
    if (settings.weapon !== this.weaponKey) {
      this.weaponKey = settings.weapon
      this.suppressorEnabled = settings.suppressor && this.weapon.supportsSuppressor
      this._releaseTrigger()
      this._cancelReload()
      this._refillMagazine()
    }
    this.actionPanel.update({
      weaponLabel: this.weapon.label,
      suppressorSupported: this.weapon.supportsSuppressor,
      suppressorEnabled: this.suppressorEnabled,
    })
    const hadSession = this.targets.sessionActive
    this.targets.configure(settings)
    // Con un cambio de escenario en marcha la siembra la hace `_buildScenario`,
    // ya con el mundo nuevo montado: sembrar aquí usaría los anclajes viejos.
    if (hadSession && !this.transition.active) {
      this.targets.beginSession(this.camera, performance.now())
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

    // Las dianas vivas estaban ancladas a un mundo que ya no existe. Si había
    // sesión en marcha se vuelve a sembrar desde la posición nueva del jugador.
    if (hadSession) this.targets.beginSession(this.camera, performance.now())
  }

  /** El arma vigente, tal cual está descrita en config.js. */
  get weapon() {
    return WEAPONS[this.weaponKey]
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
    this.callbacks.onPhaseChange?.(phase)
  }

  _beginSession() {
    this.endless = this._pendingEndless
    this.stats.endless = this.endless
    this.elapsedMs = 0
    this.shots = 0
    this.hits = 0
    this.kills = 0
    this.controls.enabled = true
    this._releaseTrigger()
    this._cancelReload()
    this._refillMagazine()
    this._lastShotAt = -Infinity
    this._nextShotAt = -Infinity
    this.movement.reset()
    this.movement.setEnabled(true)
    this._defuseHeld = false
    this.objectiveOutcome = null
    // La primera diana nace en la posición ya reseteada del jugador.
    this.camera.updateMatrixWorld()
    const now = performance.now()
    this.targets.beginSession(this.camera, now)
    // El explosivo sólo existe con escenario y con cronómetro. En práctica libre
    // no: esa modalidad existe para no terminar sola, y un explosivo que la
    // cerrase a los 45 s rompería su único contrato.
    this.objective.clear()
    if (!this.endless && this.objective.available) this.objective.begin(now)
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
    // Sólo botón izquierdo.
    if (event.button !== 0) return

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
    const now = performance.now()

    // Darle a un botón es accionarlo, no disparar: no cuenta como acierto ni
    // como fallo, no gasta munición y no mueve la cámara. Pero sólo gana si es
    // lo más cercano bajo el punto de mira — ver `_tryPanelAction`.
    if (this._tryPanelAction(now)) {
      this._triggerConsumedByPanel = true
      return
    }

    // Con el cargador vacío el gatillo suena en seco, una vez por pulsación:
    // el fuego automático no repite el clic, que sería insufrible.
    if (!this.reloading && this.ammo <= 0) {
      playDryFire()
      this._showHelp('Pulsa R para recargar')
      return
    }
    this._tryShoot(now)
  }

  _onMouseUp(event) {
    if (event.button !== 0) return
    this._releaseTrigger()
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
      // RESERVADAS: sin mecánica todavía, y con peso 0 no entran en la media.
      damageTaken: 0,
      deaths: 0,
    })
  }

  _onWindowBlur() {
    // Alt-tab con E pulsada dejaría el explosivo desactivándose solo.
    this._defuseHeld = false
  }

  _onKeyUp(event) {
    if (OBJECTIVE.defuseKeys.includes(event.code)) this._defuseHeld = false
  }

  _onKeyDown(event) {
    if (this.phase !== PHASE.RUNNING || !this.isLocked || event.repeat) return

    if (OBJECTIVE.defuseKeys.includes(event.code)) {
      event.preventDefault()
      this._defuseHeld = true
      return
    }

    if (!WEAPON_KEYS.reload.includes(event.code)) return
    event.preventDefault()
    this._startReload(performance.now())
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
      case 'weapon': {
        const keys = Object.keys(WEAPONS)
        const next = keys[(keys.indexOf(this.weaponKey) + 1) % keys.length]
        updateSettings({ weapon: next })
        break
      }
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
    playShot(this.suppressorEnabled)
    if (hit) {
      this.hits += 1
      const { killed } = this.targets.applyHit(hit, performance.now())
      if (killed) this.kills += 1
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
        this.movement.setEnabled(true)
        this._setPhase(PHASE.RUNNING)
      }
    } else {
      this.controls.enabled = false
      this._releaseTrigger()
      this.movement.setEnabled(false)
      // Perder la captura en plena partida pausa el reloj en lugar de
      // terminarla: salir con Escape no debería arruinar la sesión.
      if (this.phase === PHASE.RUNNING) this._setPhase(PHASE.PAUSED)
    }
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
      this._updateReload(now)
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
          this._tryShoot(now)
        }
      }
    }

    // En pausa el delta va a cero: las dianas se congelan con el cronómetro,
    // pero los pops en curso siguen apagándose porque van con `now`.
    const targetDelta = this.phase === PHASE.RUNNING ? delta / 1000 : 0
    this.targets.update(now, targetDelta, this.camera)
    this._updateObjective(now, targetDelta)
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
      ? Math.min(1, (performance.now() - this.reloadStartedAt) / this.weapon.reloadMs)
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
    // Estrellas en vivo: sólo hay puntuación donde hay objetivo que puntuar.
    stats.scoring = this.objective.active
    if (stats.scoring) stats.stars = this._currentScore().stars
    this.callbacks.onFrame?.(stats)
  }
}
