/**
 * Explosivo de escenario: aparición, cuenta atrás, pitido y desactivación.
 *
 * Vive aparte del motor porque es una mecánica completa con su propio estado y
 * su propio ciclo. El motor sólo necesita tres cosas de aquí: arrancarlo,
 * avanzarlo cada frame y preguntar cómo acabó.
 *
 * **No tiene ayuda de interfaz.** No publica nada al HUD ni dibuja nada en
 * pantalla: la única pista para encontrarlo es el pitido, que sube de volumen al
 * acercarse. El marcador existe en el mundo, así que se ve si se mira hacia él,
 * pero hay que buscarlo.
 *
 * El progreso de desactivación sí se enseña, pero **en el propio marcador**: un
 * anillo que se llena. Mantener una tecla tres segundos a ciegas sería cruel, y
 * ponerlo en el HUD delataría que estás al lado.
 */

import * as THREE from 'three'
import { COLORS, OBJECTIVE } from '../config.js'
import { playObjectiveBeep } from '../audio/sfx.js'
import { createEmitter } from '../audio/spatial.js'

/** Cómo acabó, o null si sigue en marcha. */
export const OUTCOME = {
  DEFUSED: 'defused',
  EXPLODED: 'exploded',
}

const _playerXZ = new THREE.Vector3()

/** Sectores del anillo de desactivación. Fija el grano con el que se rellena. */
const RING_SEGMENTS = 48

/** Altura de una posición: un número, o una clave del vocabulario de cobertura. */
function resolveY(value, coverHeights) {
  if (typeof value === 'number') return value
  return coverHeights[value] ?? 0
}

export class Objective {
  /**
   * @param {THREE.Scene} scene
   * @param {object} coverHeights `COVER.heights`, para resolver sitios elevados
   */
  constructor(scene, coverHeights) {
    this.scene = scene
    this.coverHeights = coverHeights

    this.sites = []
    this.active = false
    this.outcome = null
    /** Sitio elegido en esta sesión. */
    this.site = null

    this.startedAt = 0
    this.elapsedMs = 0
    /** Progreso de desactivación, 0..1. Se pierde entero al soltar la tecla. */
    this.defuseProgress = 0

    this._nextBeepAt = 0
    this._geometries = []
    this._materials = []

    this.group = new THREE.Group()
    this.group.visible = false
    this._buildMarker()
    scene.add(this.group)

    // Emisor genérico: el explosivo no sabe de audio espacial más allá de
    // colocarlo y pasárselo a la voz. Si está apagado, `input` da null y el
    // pitido cae solo a la ruta de siempre.
    this.emitter = createEmitter(scene)
  }

  _buildMarker() {
    const color = new THREE.Color(COLORS.objective)

    // Cuerpo: un octaedro. No se parece a ninguna diana ni a ninguna caja de
    // cobertura, que es todo lo que se le pide a la silueta.
    const bodyGeometry = new THREE.OctahedronGeometry(OBJECTIVE.markerRadius, 0)
    const bodyMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
    })
    this.body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    this.body.position.y = OBJECTIVE.markerHeight
    this.group.add(this.body)

    const edgeGeometry = new THREE.EdgesGeometry(bodyGeometry)
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true })
    this.edges = new THREE.LineSegments(edgeGeometry, edgeMaterial)
    this.edges.position.copy(this.body.position)
    this.group.add(this.edges)

    // Anillo de desactivación: en el suelo, alrededor del marcador. Se
    // construye entero **una vez** y se rellena moviendo el rango de dibujo, no
    // regenerando la geometría: rehacerla cada frame sería alocar durante los
    // tres segundos que dura, justo en el bucle caliente.
    this._ringRadius = OBJECTIVE.defuseRadius * 0.28
    const ringGeometry = new THREE.RingGeometry(
      this._ringRadius * 0.72,
      this._ringRadius,
      RING_SEGMENTS,
      1,
      Math.PI / 2,
      -Math.PI * 2,
    )
    this._ringIndexCount = ringGeometry.index.count
    this.ring = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.04
    this.ring.visible = false
    this.group.add(this.ring)

    this._geometries.push(bodyGeometry, edgeGeometry, ringGeometry)
    this._materials.push(bodyMaterial, edgeMaterial, this.ring.material)
  }

  /** Sitios posibles del escenario montado. Vacío = este escenario no tiene. */
  setSites(sites) {
    this.sites = sites && sites.length ? sites : []
    this.clear()
  }

  /** ¿Puede haber explosivo en el escenario actual? */
  get available() {
    return this.sites.length > 0
  }

  /** Lo que queda de cuenta atrás, en ms. */
  get timeLeftMs() {
    return Math.max(0, OBJECTIVE.timerMs - this.elapsedMs)
  }

  /** Arranca la cuenta atrás en un sitio al azar de los curados. */
  begin(now) {
    if (!this.available) return false
    this.site = this.sites[(Math.random() * this.sites.length) | 0]
    const y = resolveY(this.site.y, this.coverHeights)
    this.group.position.set(this.site.x, y, this.site.z)
    this.group.visible = true
    // El pitido sale de la altura del marcador, no de los pies del sitio.
    this.emitter.setPosition(this.site.x, y + OBJECTIVE.markerHeight, this.site.z)

    this.active = true
    this.outcome = null
    this.startedAt = now
    this.elapsedMs = 0
    this.defuseProgress = 0
    this.ring.visible = false
    this._nextBeepAt = now
    return true
  }

  clear() {
    this.active = false
    this.outcome = null
    this.site = null
    this.elapsedMs = 0
    this.defuseProgress = 0
    this.group.visible = false
    this.ring.visible = false
  }

  /**
   * Avance por frame.
   *
   * @param {number} now reloj en ms
   * @param {number} deltaSeconds tiempo de juego; cero en pausa, que congela
   *   la cuenta atrás igual que congela las dianas
   * @param {THREE.Camera} camera
   * @param {boolean} defuseHeld si la tecla de desactivar está pulsada
   * @returns {string|null} el desenlace, el frame en que ocurre
   */
  update(now, deltaSeconds, camera, defuseHeld) {
    if (!this.active) return null

    if (deltaSeconds > 0) this.elapsedMs += deltaSeconds * 1000

    const distance = this._distanceTo(camera)
    this._updateDefuse(deltaSeconds, distance, defuseHeld)
    if (!this.active) return this.outcome

    this._updateMarker(now)
    this._updateBeep(now, distance)

    if (this.elapsedMs >= OBJECTIVE.timerMs) {
      this.active = false
      this.outcome = OUTCOME.EXPLODED
      this.group.visible = false
      return this.outcome
    }
    return null
  }

  /**
   * ¿Está el jugador a tiro de desactivar? Lo pregunta la acción contextual: es
   * lo que decide si `use` desactiva o saca el artilugio, y tiene que salir de
   * **aquí** —mismo radio, misma distancia horizontal— y no de una segunda
   * cuenta en el motor que un día se separe de ésta.
   */
  isPlayerInRange(camera) {
    return this.active && this._distanceTo(camera) <= OBJECTIVE.defuseRadius
  }

  /** Distancia horizontal del jugador al explosivo. La altura no cuenta. */
  _distanceTo(camera) {
    _playerXZ.set(camera.position.x - this.group.position.x, 0, camera.position.z - this.group.position.z)
    return _playerXZ.length()
  }

  _updateDefuse(deltaSeconds, distance, defuseHeld) {
    const inRange = distance <= OBJECTIVE.defuseRadius
    if (!defuseHeld || !inRange || deltaSeconds <= 0) {
      // Soltar, alejarse o pausar cancela el progreso. Sin penalización: lo
      // único que se pierde es el tiempo, que ya lo cobra la puntuación.
      if (this.defuseProgress !== 0 && (!defuseHeld || !inRange)) {
        this.defuseProgress = 0
        this.ring.visible = false
      }
      return
    }

    this.defuseProgress += (deltaSeconds * 1000) / OBJECTIVE.defuseMs
    if (this.defuseProgress >= 1) {
      this.defuseProgress = 1
      this.active = false
      this.outcome = OUTCOME.DEFUSED
      this.group.visible = false
      return
    }
    this._updateRing()
  }

  _updateRing() {
    this.ring.visible = true
    // Sólo se dibujan los triángulos completos que cubre el progreso: el rango
    // tiene que caer en múltiplo de 3 o el último triángulo sale roto.
    const triangles = Math.floor((this._ringIndexCount / 3) * this.defuseProgress)
    this.ring.geometry.setDrawRange(0, triangles * 3)
  }

  /** Parpadeo. Nunca se apaga del todo: un marcador invisible no es un marcador. */
  _updateMarker(now) {
    const phase = (now / 1000) * OBJECTIVE.blinkHz * Math.PI * 2
    const wave = (Math.sin(phase) + 1) / 2
    const opacity = OBJECTIVE.blinkMin + (OBJECTIVE.blinkMax - OBJECTIVE.blinkMin) * wave
    this.body.material.opacity = opacity
    this.edges.material.opacity = opacity * 0.8
  }

  /**
   * Pitido: el tempo y el tono los pone la cuenta atrás, el volumen la distancia
   * al jugador. Es la única pista que hay para encontrarlo.
   */
  _updateBeep(now, distance) {
    if (now < this._nextBeepAt) return
    const beep = OBJECTIVE.beep
    const urgency = Math.min(1, this.elapsedMs / OBJECTIVE.timerMs)

    const span = beep.farDistance - beep.nearDistance
    const t = span > 0 ? (distance - beep.nearDistance) / span : 0
    const near = 1 - (t < 0 ? 0 : t > 1 ? 1 : t)
    const volume = beep.minVolume + (beep.maxVolume - beep.minVolume) * near
    playObjectiveBeep(urgency, volume, this.emitter)

    const interval =
      beep.slowIntervalMs + (beep.fastIntervalMs - beep.slowIntervalMs) * urgency
    this._nextBeepAt = now + interval
  }

  dispose() {
    this.emitter.dispose()
    this.scene.remove(this.group)
    for (const geometry of this._geometries) geometry.dispose()
    for (const material of this._materials) material.dispose()
    this._geometries.length = 0
    this._materials.length = 0
  }
}
