/**
 * Dianas: aparición, geometría por tipo, zonas de impacto y feedback visual.
 *
 * El modelo es el mismo para los tres tipos de diana. Cada diana es un
 * `THREE.Group` con una o varias piezas; cada pieza tiene su propio daño, y
 * la diana muere cuando la vida compartida llega a cero. La "Clásica" y el
 * "Cono" son simplemente dianas de una pieza que quita 100 de 100, así que
 * caen de un disparo sin necesitar ningún caso especial.
 *
 * Reglas de rendimiento:
 *  - Pool fijo de dianas: se reutilizan, no se crean ni se destruyen en juego.
 *    Sólo se reconstruye al cambiar de tipo o de tamaño desde opciones, que
 *    nunca ocurre con la partida en marcha.
 *  - Geometrías compartidas entre todas las instancias; los materiales son por
 *    instancia porque cada una parpadea y se desvanece por su cuenta.
 *  - El muestreo de posiciones y el bucle de animación reutilizan vectores de
 *    módulo: cero alocaciones en el camino caliente.
 */

import * as THREE from 'three'
import { COLORS, FEEDBACK, ROOM, SPAWN, TARGET, TARGET_TYPES } from '../config.js'

const DEG_TO_RAD = Math.PI / 180

/** Huecos extra sobre el tope de dianas vivas, para las que se están apagando. */
const DYING_SLOTS = 6

// Vectores temporales reutilizados (nunca se crean dentro del loop).
const _axis = new THREE.Vector3()
const _u = new THREE.Vector3()
const _v = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _candidate = new THREE.Vector3()
const _otherDir = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _fallbackRef = new THREE.Vector3(1, 0, 0)
const _flashColor = new THREE.Color(COLORS.targetHit)

/** Curva de salida del pop: rápido al principio, se frena al final. */
function easeOut(t) {
  return 1 - (1 - t) * (1 - t)
}

/**
 * Geometría de una pieza. Todas las medidas de `part` son múltiplos del radio
 * elegido en opciones, así que el slider de tamaño escala sin deformar.
 */
function createPartGeometry(part, radius) {
  const r = part.radius * radius
  const segments = TARGET.widthSegments
  switch (part.shape) {
    case 'cone':
      return new THREE.ConeGeometry(r, part.height * radius, segments)
    case 'cylinder':
      return new THREE.CylinderGeometry(r, r, part.height * radius, segments)
    case 'capsule': {
      // CapsuleGeometry recibe el tramo recto, no la altura total.
      const straight = Math.max(0.001, part.height * radius - 2 * r)
      return new THREE.CapsuleGeometry(r, straight, 6, segments)
    }
    case 'sphere':
    default:
      return new THREE.SphereGeometry(r, segments, TARGET.heightSegments)
  }
}

export class TargetManager {
  /**
   * @param {THREE.Scene} scene
   * @param {object} settings ajustes iniciales (ver src/settings.js)
   * @param {{ anchoredAxis?: boolean }} [options] `anchoredAxis` fija el eje
   *   del cono a una dirección del mundo en lugar de seguir a la cámara.
   */
  constructor(scene, settings, { anchoredAxis = false } = {}) {
    this.scene = scene
    this.anchoredAxis = anchoredAxis

    this.cosConeHalfAngle = Math.cos(SPAWN.coneHalfAngleDeg * DEG_TO_RAD)
    this.cosMinSeparation = Math.cos(SPAWN.minAngularSeparationDeg * DEG_TO_RAD)

    // Dirección fija del cono, en la misma convención que la cámara: yaw 0
    // mira hacia -Z.
    const anchorYaw = SPAWN.anchoredAxisYawDeg * DEG_TO_RAD
    const anchorPitch = SPAWN.anchoredAxisPitchDeg * DEG_TO_RAD
    const anchorCosPitch = Math.cos(anchorPitch)
    this.anchoredDirection = new THREE.Vector3(
      -Math.sin(anchorYaw) * anchorCosPitch,
      Math.sin(anchorPitch),
      -Math.cos(anchorYaw) * anchorCosPitch,
    ).normalize()

    /** @type {Array<object>} pool de dianas reutilizables */
    this.instances = []
    this.partGeometries = []
    /** Array persistente que se rellena para el raycast: no genera basura. */
    this._raycastMeshes = []

    this.typeKey = null
    this.radius = TARGET.radius
    this.distance = TARGET_TYPES.classic.defaultDistance
    this.spawnIntervalMs = SPAWN.respawnDelayMs
    this.accumulative = false

    this.aliveCount = 0
    this.sessionActive = false
    this._nextSpawnAt = 0
    this._hasLastSpawn = false
    this._lastSpawnPosition = new THREE.Vector3()

    this.configure(settings)
  }

  /**
   * Aplica los ajustes. Sólo reconstruye las mallas si cambió algo que afecta
   * a la geometría; el resto de valores se leen en caliente.
   */
  configure(settings) {
    this.distance = settings.spawnDistance
    this.spawnIntervalMs = settings.spawnIntervalMs
    this.accumulative = settings.accumulative

    const geometryChanged =
      settings.targetType !== this.typeKey || settings.targetRadius !== this.radius
    this.typeKey = settings.targetType
    this.radius = settings.targetRadius
    if (geometryChanged) this._buildPool()
  }

  /** El tipo de diana vigente, tal cual está descrito en config.js. */
  get type() {
    return TARGET_TYPES[this.typeKey]
  }

  /** ¿Hay alguna diana viva ahora mismo? */
  get hasActive() {
    return this.aliveCount > 0
  }

  /** Arranca una sesión: limpia todo y saca la primera diana. */
  beginSession(camera, now) {
    this.clear()
    this.sessionActive = true
    this._spawn(camera, now)
  }

  /** Apaga todas las dianas y detiene las apariciones. */
  clear() {
    for (const instance of this.instances) this._release(instance)
    this.aliveCount = 0
    this.sessionActive = false
    this._hasLastSpawn = false
  }

  /**
   * Avance por frame: apariciones programadas, destellos de zona y pops.
   * Trabajo acotado y sin alocaciones.
   */
  update(now, camera) {
    for (let i = 0; i < this.instances.length; i++) {
      const instance = this.instances[i]
      if (instance.state === 'dying') this._updateDying(instance, now)
      else if (instance.state === 'alive') this._updateFlashes(instance, now)
    }

    if (!this.sessionActive || now < this._nextSpawnAt) return

    if (this.accumulative) {
      // Cadencia continua: sale una diana cada `spawnIntervalMs` mientras
      // quede sitio, haya impactado la anterior o no.
      if (this.aliveCount < TARGET.maxActive) this._spawn(camera, now)
    } else if (this.aliveCount === 0) {
      // Una sola diana viva: la siguiente espera a que caiga la actual.
      this._spawn(camera, now)
    }
  }

  /** Prepara las matrices de mundo justo antes de un raycast. */
  updateMatrices() {
    for (let i = 0; i < this.instances.length; i++) {
      const instance = this.instances[i]
      if (instance.state === 'alive') instance.group.updateMatrixWorld(true)
    }
  }

  /**
   * Lanza el rayo contra las dianas vivas.
   * @returns {{ instance: object, part: object } | null} la pieza más cercana
   */
  raycast(raycaster) {
    const meshes = this._raycastMeshes
    meshes.length = 0
    for (let i = 0; i < this.instances.length; i++) {
      const instance = this.instances[i]
      if (instance.state !== 'alive') continue
      for (let j = 0; j < instance.parts.length; j++) meshes.push(instance.parts[j].mesh)
    }
    if (meshes.length === 0) return null

    const hits = raycaster.intersectObjects(meshes, false)
    if (hits.length === 0) return null
    const { instance, part } = hits[0].object.userData
    return { instance, part }
  }

  /**
   * Descuenta el daño de la zona alcanzada.
   * @returns {{ killed: boolean, zone: string }}
   */
  applyHit(hit, now) {
    const { instance, part } = hit
    instance.health -= part.damage

    if (instance.health > 0) {
      // Sobrevive: la zona parpadea para que se vea que el disparo entró.
      part.flashUntil = now + FEEDBACK.zoneFlashMs
      part.material.color.copy(_flashColor)
      return { killed: false, zone: part.zone }
    }

    instance.state = 'dying'
    instance.dyingSince = now
    this.aliveCount -= 1
    if (!this.accumulative) this._nextSpawnAt = now + this.spawnIntervalMs
    return { killed: true, zone: part.zone }
  }

  // --- interno -------------------------------------------------------------

  _spawn(camera, now) {
    let instance = null
    for (let i = 0; i < this.instances.length; i++) {
      if (this.instances[i].state === 'free') {
        instance = this.instances[i]
        break
      }
    }
    if (!instance) return

    this._samplePosition(camera, _candidate)
    instance.group.position.copy(_candidate)
    instance.group.scale.setScalar(1)
    instance.health = TARGET.maxHealth
    instance.state = 'alive'
    for (let i = 0; i < instance.parts.length; i++) {
      const part = instance.parts[i]
      part.material.opacity = 1
      part.material.color.copy(part.baseColor)
      part.flashUntil = 0
      part.mesh.visible = true
    }
    instance.group.visible = true

    this.aliveCount += 1
    this._lastSpawnPosition.copy(_candidate)
    this._hasLastSpawn = true
    this._nextSpawnAt = now + this.spawnIntervalMs
  }

  _release(instance) {
    instance.state = 'free'
    instance.group.visible = false
  }

  /** Pop de muerte: la diana entera crece y se desvanece. */
  _updateDying(instance, now) {
    const t = (now - instance.dyingSince) / FEEDBACK.targetPopMs
    if (t >= 1) {
      this._release(instance)
      return
    }
    const eased = easeOut(t)
    instance.group.scale.setScalar(1 + (FEEDBACK.targetPopScale - 1) * eased)
    const opacity = FEEDBACK.targetPopOpacity * (1 - eased)
    for (let i = 0; i < instance.parts.length; i++) {
      const part = instance.parts[i]
      part.material.opacity = opacity
      part.material.color.copy(_flashColor)
    }
  }

  /** Devuelve las zonas destelladas a su color en cuanto expira el destello. */
  _updateFlashes(instance, now) {
    for (let i = 0; i < instance.parts.length; i++) {
      const part = instance.parts[i]
      if (part.flashUntil === 0 || now < part.flashUntil) continue
      part.material.color.copy(part.baseColor)
      part.flashUntil = 0
    }
  }

  /** Rehace el pool con la geometría del tipo y el tamaño vigentes. */
  _buildPool() {
    this._disposePool()

    const type = this.type
    this.partGeometries = type.parts.map((part) => createPartGeometry(part, this.radius))

    const poolSize = TARGET.maxActive + DYING_SLOTS
    for (let i = 0; i < poolSize; i++) {
      const group = new THREE.Group()
      group.visible = false
      const parts = []

      for (let p = 0; p < type.parts.length; p++) {
        const definition = type.parts[p]
        // `transparent` va activado siempre aunque la opacidad sea 1: cambiarlo
        // en caliente obligaría a recompilar el shader en pleno pop.
        const material = new THREE.MeshBasicMaterial({
          color: definition.color,
          transparent: true,
          opacity: 1,
        })
        const mesh = new THREE.Mesh(this.partGeometries[p], material)
        mesh.position.y = definition.offsetY * this.radius
        group.add(mesh)

        const part = {
          mesh,
          material,
          zone: definition.zone,
          damage: definition.damage,
          baseColor: new THREE.Color(definition.color),
          flashUntil: 0,
        }
        // Referencias directas: el raycast resuelve zona y diana sin buscar.
        mesh.userData.part = part
        parts.push(part)
      }

      const instance = { group, parts, state: 'free', health: TARGET.maxHealth, dyingSince: 0 }
      for (let p = 0; p < parts.length; p++) parts[p].mesh.userData.instance = instance

      this.scene.add(group)
      this.instances.push(instance)
    }

    this.aliveCount = 0
  }

  _disposePool() {
    for (const instance of this.instances) {
      this.scene.remove(instance.group)
      for (const part of instance.parts) part.material.dispose()
    }
    for (const geometry of this.partGeometries) geometry.dispose()
    this.instances = []
    this.partGeometries = []
    this._raycastMeshes.length = 0
  }

  /**
   * Muestrea una posición dentro del cono, descartando candidatos que caigan
   * fuera de la zona jugable o demasiado cerca de una diana ya presente.
   *
   * El vértice del cono es siempre `camera.position`, o sea la posición actual
   * del jugador con su altura real —agachado o en el aire incluidos—, porque
   * la cámara *es* el jugador.
   */
  _samplePosition(camera, out) {
    this._buildConeBasis(camera)

    const halfHeight = this.type.halfHeight * this.radius
    const margin = halfHeight + ROOM.step
    const limitX = ROOM.width / 2 - margin
    const limitZ = ROOM.depth / 2 - margin
    // La figura no debe atravesar el suelo: el mínimo depende de su altura.
    const minY = Math.max(TARGET.yRange.min, halfHeight + 0.1)
    const maxY = Math.max(minY, TARGET.yRange.max)

    const dMin = Math.max(1, this.distance - TARGET.distanceSpread)
    const dMax = this.distance + TARGET.distanceSpread

    for (let attempt = 0; attempt < SPAWN.maxSampleAttempts; attempt++) {
      // Muestreo uniforme sobre el casquete esférico del cono.
      const cosTheta = this.cosConeHalfAngle + Math.random() * (1 - this.cosConeHalfAngle)
      const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta))
      const phi = Math.random() * Math.PI * 2

      _dir
        .copy(_axis)
        .multiplyScalar(cosTheta)
        .addScaledVector(_u, sinTheta * Math.cos(phi))
        .addScaledVector(_v, sinTheta * Math.sin(phi))
        .normalize()

      const distance = dMin + Math.random() * (dMax - dMin)
      out.copy(camera.position).addScaledVector(_dir, distance)

      if (out.y < minY || out.y > maxY) continue
      if (Math.abs(out.x) > limitX || Math.abs(out.z) > limitZ) continue
      if (this._tooCloseToExisting(camera, _dir)) continue

      return out
    }

    // Salvavidas: ningún candidato pasó los filtros (p. ej. con la sala llena
    // o mirando a una esquina). Acotamos el último y seguimos: mejor una diana
    // algo forzada que ninguna.
    out.y = THREE.MathUtils.clamp(out.y, minY, maxY)
    out.x = THREE.MathUtils.clamp(out.x, -limitX, limitX)
    out.z = THREE.MathUtils.clamp(out.z, -limitZ, limitZ)
    return out
  }

  /**
   * Separación angular vista desde el jugador: evita dianas encadenadas y, en
   * modo acumulativo, que dos se solapen en pantalla.
   */
  _tooCloseToExisting(camera, direction) {
    for (let i = 0; i < this.instances.length; i++) {
      const instance = this.instances[i]
      if (instance.state !== 'alive') continue
      _otherDir.subVectors(instance.group.position, camera.position).normalize()
      if (_otherDir.dot(direction) > this.cosMinSeparation) return true
    }
    // Sin dianas vivas, el listón lo pone la última que hubo: así el modo no
    // acumulativo sigue forzando el flick entre una diana y la siguiente.
    if (this.aliveCount === 0 && this._hasLastSpawn) {
      _otherDir.subVectors(this._lastSpawnPosition, camera.position).normalize()
      if (_otherDir.dot(direction) > this.cosMinSeparation) return true
    }
    return false
  }

  /**
   * Eje del cono más dos vectores perpendiculares que forman la base para el
   * muestreo.
   *
   * Hay dos regímenes:
   *  - Anclado (variante de movimiento): el eje es una dirección fija del
   *    mundo. No lo rota ni la mirada, ni el salto, ni el agachado; sólo se
   *    mueve el vértice, que es el jugador. Es lo que hace que desplazarse
   *    cambie de verdad el ángulo hacia las dianas.
   *  - Siguiendo a la cámara (línea base estática): el eje es la dirección de
   *    la mirada con el cabeceo acotado, para que mirar al suelo no mande las
   *    dianas bajo tierra.
   */
  _buildConeBasis(camera) {
    if (this.anchoredAxis) {
      _axis.copy(this.anchoredDirection)
    } else {
      camera.getWorldDirection(_axis)

      const horizontal = Math.hypot(_axis.x, _axis.z)
      if (horizontal < 1e-5) {
        // Mirando en vertical: no hay componente horizontal de la que tirar.
        _axis.set(0, 0, -1)
      } else {
        const pitch = Math.asin(THREE.MathUtils.clamp(_axis.y, -1, 1))
        const clamped = THREE.MathUtils.clamp(
          pitch,
          SPAWN.axisPitchClampDeg.min * DEG_TO_RAD,
          SPAWN.axisPitchClampDeg.max * DEG_TO_RAD,
        )
        if (clamped !== pitch) {
          const cos = Math.cos(clamped)
          _axis.set((_axis.x / horizontal) * cos, Math.sin(clamped), (_axis.z / horizontal) * cos)
        }
      }
      _axis.normalize()
    }

    // Base ortonormal alrededor del eje.
    const reference = Math.abs(_axis.y) > 0.99 ? _fallbackRef : _up
    _u.crossVectors(reference, _axis).normalize()
    _v.crossVectors(_axis, _u).normalize()
  }

  dispose() {
    this._disposePool()
  }
}
