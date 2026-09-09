/**
 * Gestión de la diana activa y del feedback visual al acertarla.
 *
 * Reglas de rendimiento que sigue este módulo:
 *  - Una única esfera para la diana: al acertar se reposiciona, nunca se
 *    destruye ni se recrea.
 *  - Los "pops" salen de un pool fijo con geometría compartida.
 *  - El muestreo de posiciones reutiliza vectores de módulo: cero alocaciones
 *    en el camino caliente.
 */

import * as THREE from 'three'
import { COLORS, ROOM, SPAWN, TARGET, FEEDBACK } from '../config.js'

const DEG_TO_RAD = Math.PI / 180

// Vectores temporales reutilizados (nunca se crean dentro del loop).
const _axis = new THREE.Vector3()
const _u = new THREE.Vector3()
const _v = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _candidate = new THREE.Vector3()
const _prevDir = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _fallbackRef = new THREE.Vector3(1, 0, 0)

/** Curva de salida del pop: rápido al principio, se frena al final. */
function easeOut(t) {
  return 1 - (1 - t) * (1 - t)
}

export class TargetManager {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene

    this.geometry = new THREE.SphereGeometry(
      TARGET.radius,
      TARGET.widthSegments,
      TARGET.heightSegments,
    )
    this.material = new THREE.MeshBasicMaterial({ color: COLORS.target })

    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.visible = false
    // La diana se testea a mano con el raycaster; no hace falta frustum culling
    // ni actualización automática de matrices más allá de lo que hacemos aquí.
    this.mesh.matrixAutoUpdate = true
    scene.add(this.mesh)

    // Pool de pops: esferas blancas que crecen y se desvanecen.
    this.popMaterials = []
    this.pops = []
    for (let i = 0; i < FEEDBACK.targetPopPoolSize; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: COLORS.targetHit,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(this.geometry, material)
      mesh.visible = false
      scene.add(mesh)
      this.popMaterials.push(material)
      this.pops.push({ mesh, material, startedAt: 0, active: false })
    }
    this._nextPop = 0

    /** Momento (ms, performance.now) en el que debe aparecer la próxima diana. */
    this._spawnAt = 0
    this._pendingSpawn = false
    this._hasPrevious = false
    this._previousPosition = new THREE.Vector3()

    this.cosConeHalfAngle = Math.cos(SPAWN.coneHalfAngleDeg * DEG_TO_RAD)
    this.cosMinSeparation = Math.cos(SPAWN.minAngularSeparationDeg * DEG_TO_RAD)
  }

  /** ¿Hay una diana en pantalla ahora mismo? */
  get isActive() {
    return this.mesh.visible
  }

  /** Oculta la diana y cancela cualquier aparición pendiente. */
  clear() {
    this.mesh.visible = false
    this._pendingSpawn = false
    this._hasPrevious = false
  }

  /** Coloca una diana nueva de inmediato. */
  spawn(camera) {
    this._samplePosition(camera, _candidate)
    this.mesh.position.copy(_candidate)
    this.mesh.visible = true
    this._previousPosition.copy(_candidate)
    this._hasPrevious = true
    this._pendingSpawn = false
  }

  /**
   * Registra un acierto: lanza el pop en la posición de la diana, la oculta y
   * programa la siguiente aparición.
   */
  registerHit(now) {
    this._spawnPop(this.mesh.position, now)
    this.mesh.visible = false
    this._spawnAt = now + SPAWN.respawnDelayMs
    this._pendingSpawn = true
  }

  /**
   * Avance por frame: aparición diferida y animación de los pops.
   * Trabajo acotado y sin alocaciones.
   */
  update(now, camera) {
    if (this._pendingSpawn && now >= this._spawnAt) this.spawn(camera)

    for (let i = 0; i < this.pops.length; i++) {
      const pop = this.pops[i]
      if (!pop.active) continue
      const t = (now - pop.startedAt) / FEEDBACK.targetPopMs
      if (t >= 1) {
        pop.active = false
        pop.mesh.visible = false
        pop.material.opacity = 0
        continue
      }
      const eased = easeOut(t)
      const scale = 1 + (FEEDBACK.targetPopScale - 1) * eased
      pop.mesh.scale.setScalar(scale)
      pop.material.opacity = FEEDBACK.targetPopOpacity * (1 - eased)
    }
  }

  _spawnPop(position, now) {
    const pop = this.pops[this._nextPop]
    this._nextPop = (this._nextPop + 1) % this.pops.length
    pop.mesh.position.copy(position)
    pop.mesh.scale.setScalar(1)
    pop.material.opacity = FEEDBACK.targetPopOpacity
    pop.mesh.visible = true
    pop.startedAt = now
    pop.active = true
  }

  /**
   * Muestrea una posición dentro de un cono centrado en la dirección de la
   * cámara, descartando candidatos que caigan fuera de la zona jugable o
   * demasiado cerca de la diana anterior.
   */
  _samplePosition(camera, out) {
    this._buildConeBasis(camera)

    const { min: dMin, max: dMax } = TARGET.distance
    const margin = TARGET.radius + ROOM.step
    const limitX = ROOM.width / 2 - margin
    const limitZ = ROOM.depth / 2 - margin

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

      if (out.y < TARGET.yRange.min || out.y > TARGET.yRange.max) continue
      if (Math.abs(out.x) > limitX || Math.abs(out.z) > limitZ) continue

      // Separación angular vista desde la cámara: evita dianas "encadenadas".
      if (this._hasPrevious) {
        _prevDir.subVectors(this._previousPosition, camera.position).normalize()
        if (_prevDir.dot(_dir) > this.cosMinSeparation) continue
      }

      return out
    }

    // Salvavidas: ningún candidato pasó los filtros (p. ej. mirando a una
    // esquina). Acotamos el último y seguimos: mejor una diana algo forzada
    // que ninguna.
    out.y = THREE.MathUtils.clamp(out.y, TARGET.yRange.min, TARGET.yRange.max)
    out.x = THREE.MathUtils.clamp(out.x, -limitX, limitX)
    out.z = THREE.MathUtils.clamp(out.z, -limitZ, limitZ)
    return out
  }

  /**
   * Eje del cono (dirección de la cámara con el cabeceo acotado) más dos
   * vectores perpendiculares que forman la base para el muestreo.
   */
  _buildConeBasis(camera) {
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

    // Base ortonormal alrededor del eje.
    const reference = Math.abs(_axis.y) > 0.99 ? _fallbackRef : _up
    _u.crossVectors(reference, _axis).normalize()
    _v.crossVectors(_axis, _u).normalize()
  }

  dispose() {
    this.scene.remove(this.mesh)
    for (let i = 0; i < this.pops.length; i++) this.scene.remove(this.pops[i].mesh)
    this.geometry.dispose()
    this.material.dispose()
    for (let i = 0; i < this.popMaterials.length; i++) this.popMaterials[i].dispose()
  }
}
