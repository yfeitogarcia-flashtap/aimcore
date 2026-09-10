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
import { CAMERA, MOVEMENT, RENDER, SESSION_DURATION_S } from '../config.js'
import { createScene } from './scene.js'
import { LookControls } from './lookControls.js'
import { MovementController } from './movement.js'
import { TargetManager } from './targets.js'
import { initAudio, playHit, playShot } from '../audio/sfx.js'
import { getSettings, subscribeSettings } from '../settings.js'

/** Centro exacto de la pantalla: el crosshair no se mueve, así que es constante. */
const SCREEN_CENTER = new THREE.Vector2(0, 0)

/** Tope de delta por frame: evita saltos del reloj tras un parón del navegador. */
const MAX_FRAME_DELTA_MS = 100

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

    const { scene, dispose: disposeScene } = createScene()
    this.scene = scene
    this._disposeScene = disposeScene

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)

    this.controls = new LookControls(this.camera)
    this.movement = new MovementController(this.camera)
    this.movement.reset()
    // Con la variante de movimiento activa el cono deja de seguir la mirada:
    // nace en la posición del jugador y apunta a una dirección fija del mundo.
    this.targets = new TargetManager(this.scene, getSettings(), {
      anchoredAxis: MOVEMENT.enabled,
    })
    this.raycaster = new THREE.Raycaster()
    this._applySettings(getSettings())

    this.phase = PHASE.IDLE
    this.durationMs = SESSION_DURATION_S * 1000
    this.elapsedMs = 0
    this.shots = 0
    this.hits = 0
    this.kills = 0

    // Objeto de estadísticas reutilizado: el HUD lo lee sin que se genere
    // basura en cada frame.
    this.stats = {
      phase: this.phase,
      timeLeftMs: this.durationMs,
      hits: 0,
      misses: 0,
      shots: 0,
      kills: 0,
      accuracy: 0,
    }

    this._rafId = 0
    this._lastFrameTime = 0
    this._running = false

    this._onMouseDown = this._onMouseDown.bind(this)
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
    this.canvas.addEventListener('contextmenu', this._onContextMenu)
    document.addEventListener('pointerlockchange', this._onPointerLockChange)
    this.controls.connect(document)
    this.movement.connect(window)

    this._unsubscribeSettings = subscribeSettings((settings) => this._applySettings(settings))

    this._resizeObserver = new ResizeObserver(this._onResize)
    this._resizeObserver.observe(this.canvas.parentElement || this.canvas)
    this._onResize()

    this._lastFrameTime = performance.now()
    this._rafId = requestAnimationFrame(this._loop)
  }

  dispose() {
    this._running = false
    cancelAnimationFrame(this._rafId)
    this.canvas.removeEventListener('mousedown', this._onMouseDown)
    this.canvas.removeEventListener('contextmenu', this._onContextMenu)
    document.removeEventListener('pointerlockchange', this._onPointerLockChange)
    this.controls.disconnect()
    this.movement.disconnect()
    if (this._unsubscribeSettings) this._unsubscribeSettings()
    if (this._resizeObserver) this._resizeObserver.disconnect()
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
    this.targets.dispose()
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
    this.controls.reset()
    this.requestLock()
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
    this.controls.setSensitivity(settings.sensitivity)
    const hadSession = this.targets.sessionActive
    this.targets.configure(settings)
    if (hadSession) this.targets.beginSession(this.camera, performance.now())
  }

  _setPhase(phase) {
    if (this.phase === phase) return
    this.phase = phase
    this.stats.phase = phase
    this.callbacks.onPhaseChange?.(phase)
  }

  _beginSession() {
    this.elapsedMs = 0
    this.shots = 0
    this.hits = 0
    this.kills = 0
    this.controls.enabled = true
    this.movement.reset()
    this.movement.setEnabled(true)
    // La primera diana nace en la posición ya reseteada del jugador.
    this.camera.updateMatrixWorld()
    this.targets.beginSession(this.camera, performance.now())
    this._setPhase(PHASE.RUNNING)
  }

  _finishSession() {
    this.controls.enabled = false
    this.movement.setEnabled(false)
    this.targets.clear()
    this._setPhase(PHASE.FINISHED)
    if (this.isLocked) document.exitPointerLock()

    const seconds = this.durationMs / 1000
    this.callbacks.onFinish?.({
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
    // Así el click que arranca (o reanuda) la sesión nunca cuenta como fallo.
    if (!this.isLocked) {
      this.requestLock()
      return
    }
    if (this.phase !== PHASE.RUNNING) return
    this._shoot()
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
      hit = this.targets.raycast(this.raycaster)
    }

    // El sonido de disparo suena siempre; el de acierto se superpone.
    playShot()
    if (hit) {
      this.hits += 1
      const { killed } = this.targets.applyHit(hit, performance.now())
      if (killed) this.kills += 1
      playHit()
    }

    this.callbacks.onShot?.(hit !== null)
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
  }

  _loop(now) {
    this._rafId = requestAnimationFrame(this._loop)

    const delta = Math.min(now - this._lastFrameTime, MAX_FRAME_DELTA_MS)
    this._lastFrameTime = now

    if (this.phase === PHASE.RUNNING) {
      this.elapsedMs += delta
      if (this.elapsedMs >= this.durationMs) {
        this.elapsedMs = this.durationMs
        this._finishSession()
      } else {
        // `delta` ya viene acotado, así que la integración del salto no pega
        // un salto raro si el navegador se queda parado un momento.
        this.movement.update(delta / 1000)
      }
    }

    // En pausa el delta va a cero: las dianas se congelan con el cronómetro,
    // pero los pops en curso siguen apagándose porque van con `now`.
    const targetDelta = this.phase === PHASE.RUNNING ? delta / 1000 : 0
    this.targets.update(now, targetDelta, this.camera)
    this._publishStats()
    this.renderer.render(this.scene, this.camera)
  }

  _publishStats() {
    const stats = this.stats
    stats.timeLeftMs = Math.max(0, this.durationMs - this.elapsedMs)
    stats.hits = this.hits
    stats.shots = this.shots
    stats.misses = this.shots - this.hits
    stats.kills = this.kills
    stats.accuracy = this.shots > 0 ? (this.hits / this.shots) * 100 : 0
    this.callbacks.onFrame?.(stats)
  }
}
