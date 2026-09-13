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
 *
 * En modo dinámico cada diana viva persigue un destino aleatorio dentro de su
 * propio volumen de aparición, a velocidad constante y en línea recta. Los
 * destinos salen del mismo muestreo que las apariciones, así que el tipo de
 * anclaje ya decide los ejes: una figura anclada a los pies sólo recibe
 * destinos a nivel de suelo y, por tanto, sólo se mueve en X/Z.
 */

import * as THREE from 'three'
import { bodySection } from './body.js'
import {
  COLORS,
  COVER,
  ENEMY,
  FEEDBACK,
  MAX_SIMULTANEOUS_TARGETS,
  ROOM,
  SIMULTANEOUS_TARGETS,
  SPAWN,
  TARGET,
  TARGET_TYPES,
} from '../config.js'

const DEG_TO_RAD = Math.PI / 180

/**
 * Altura del muñeco en unidades de su radio: de los pies a la coronilla. La
 * misma cuenta que hacen `player.js` y `enemyFire.js`, y por el mismo motivo —
 * la altura no se escribe, sale de las piezas.
 */
const BODY_TOP = TARGET_TYPES.hitbox.parts.reduce(
  (top, part) => Math.max(top, part.offsetY + (part.height ?? part.radius * 2) / 2),
  0,
)

/** Huecos extra sobre el tope de dianas vivas, para las que se están apagando. */
const DYING_SLOTS = 6

// Vectores temporales reutilizados (nunca se crean dentro del loop).
const _axis = new THREE.Vector3()
const _u = new THREE.Vector3()
const _v = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _candidate = new THREE.Vector3()
// Propios del test de visibilidad de anclajes, para no pisar `_candidate`.
const _anchorProbe = new THREE.Vector3()
const _direction = new THREE.Vector3()
// Mirada horizontal del jugador, para el sesgo hacia delante.
const _viewForward = new THREE.Vector3()
const _otherDir = new THREE.Vector3()
const _center = new THREE.Vector3()
const _motion = new THREE.Vector3()
const _dir2 = new THREE.Vector3()
const _previousDestination = new THREE.Vector3()
const _bestDestination = new THREE.Vector3()

/** Altura del suelo de la sala. */
const FLOOR_Y = 0
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
    case 'body': {
      // La banda del cuerpo simple que le toca a esta zona. Sale del mismo
      // módulo que el avatar del jugador (`body.js`): una sola forma, y el
      // color es lo único que cambia entre una diana y un rival.
      const half = (part.height ?? part.radius * 2) / 2
      const top = BODY_TOP
      return bodySection((part.offsetY - half) / top, (part.offsetY + half) / top, top * radius)
    }
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

    this.cosMinSeparation = Math.cos(SPAWN.minAngularSeparationDeg * DEG_TO_RAD)
    // Se recalculan en configure(), porque dependen del tipo de diana.
    this.coneHalfAngle = SPAWN.coneHalfAngleDeg * DEG_TO_RAD
    this.cosConeHalfAngle = Math.cos(this.coneHalfAngle)

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
    /** Dianas vivas permitidas a la vez. Con 1, la siguiente espera a la baja. */
    this.maxAlive = 1
    this.dynamic = false
    /** Velocidad de patrulla vigente. La pone el ajuste, no la constante. */
    this.patrolSpeed = TARGET.moveSpeed

    this.aliveCount = 0
    this.sessionActive = false
    this._nextSpawnAt = 0
    this._hasLastSpawn = false
    this._lastSpawnPosition = new THREE.Vector3()

    /**
     * Anclajes curados de un escenario con cobertura. Mientras esté vacío se
     * usa el muestreo por cono de siempre.
     */
    this.points = []
    this.routes = []
    this._occluders = []
    this._visibilityRay = new THREE.Raycaster()
    /** Orden barajado de anclajes. Preasignado: barajar no aloca. */
    this._pointOrder = new Int32Array(0)
    /** Sello de la elección en curso, para no repetir raycasts. Ver `_pickPoint`. */
    this._visibilityStamp = 0
    /** Subconjunto de los que caen delante del jugador. Mismo tamaño, se llena en parte. */
    this._forwardOrder = new Int32Array(0)
    this.cosForwardBias = Math.cos((SPAWN.forwardBiasConeDeg / 2) * DEG_TO_RAD)
    /**
     * Cuántos muñecos vivos tiene cada zona ahora mismo, y cuántos admite una
     * como mucho. Se rellena al elegir sitio (ver `_measureZoneLoad`); el Map
     * se crea una vez y se reutiliza, que aparecer no está en el bucle caliente
     * pero tampoco hace falta ensuciar el montón.
     */
    this._zoneLoad = new Map()
    this._zoneQuota = Infinity
    /** Zona que esta elección está intentando evitar, o null. */
    this._skipZone = null
    /** Zona del último muñeco que salió, para no repetirla si hay alternativa. */
    this._recentZone = null

    this.configure(settings)
  }

  /**
   * Aplica los ajustes. Sólo reconstruye las mallas si cambió algo que afecta
   * a la geometría; el resto de valores se leen en caliente.
   */
  configure(settings) {
    this.distance = settings.spawnDistance
    this.spawnIntervalMs = settings.spawnIntervalMs
    this.maxAlive = SIMULTANEOUS_TARGETS[settings.simultaneousTargets].count
    this.dynamic = settings.dynamic
    this.patrolSpeed = settings.patrolSpeed

    const geometryChanged =
      settings.targetType !== this.typeKey || settings.targetRadius !== this.radius
    this.typeKey = settings.targetType
    this.radius = settings.targetRadius

    // Cada tipo puede traer su propio abanico de aparición.
    const profile = this.spawnProfile
    this.coneHalfAngle =
      (profile ? profile.spawnConeHalfAngleDeg : SPAWN.coneHalfAngleDeg) * DEG_TO_RAD
    this.cosConeHalfAngle = Math.cos(this.coneHalfAngle)

    if (geometryChanged) this._buildPool()
  }

  /**
   * Monta los anclajes de un escenario. Con anclajes, las dianas dejan de
   * muestrearse dentro de un cono: salen donde el escenario dice que importa
   * —una tronera, una boca de paso, la esquina de un cajón—, que es justo lo
   * que un cono no sabe hacer.
   *
   * @param {Array<object>} routes rutas ya resueltas por el escenario
   * @param {Array<object>} points todos sus puntos, en plano
   * @param {Array<THREE.Object3D>} occluders geometría contra la que se
   *   comprueba la visibilidad
   * @param {object} [room] sala del escenario, que es la que acota el muestreo
   *   por cono cuando no hay rutas
   */
  setRoutes(routes, points, occluders, room = ROOM) {
    this.routes = routes && routes.length ? routes : []
    this.points = points && points.length ? points : []
    this._occluders = occluders || []
    this.room = room
    if (this._pointOrder.length !== this.points.length) {
      this._pointOrder = new Int32Array(this.points.length)
      this._forwardOrder = new Int32Array(this.points.length)
    }
    for (let i = 0; i < this.points.length; i++) {
      this._pointOrder[i] = i
      this.points[i].occupied = false
      this.points[i].visibilityStamp = -1
      this.points[i].visible = false
    }
    for (let i = 0; i < this.routes.length; i++) this.routes[i].liveCount = 0
    this._recentZone = null
  }

  /** ¿Estamos en un escenario con rutas curadas? */
  get useRoutes() {
    return this.points.length > 0
  }

  /** El tipo de diana vigente, tal cual está descrito en config.js. */
  get type() {
    return TARGET_TYPES[this.typeKey]
  }

  /** Reglas de aparición propias del tipo, si las tiene (ver config.js). */
  get spawnProfile() {
    return this.type.spawn
  }

  /** ¿La figura se apoya en el suelo en lugar de flotar? */
  get anchoredToFloor() {
    return this.type.anchor === 'feet'
  }

  /**
   * Distancia del origen de la figura a su centro visual. Cero si el origen ya
   * es el centro; la semialtura si el origen está en los pies. Sirve para
   * medir separaciones y para que el pop crezca desde el centro.
   */
  get centerOffsetY() {
    return this.anchoredToFloor ? this.type.halfHeight * this.radius : 0
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
    // Reconstruir el pool descarta instancias sin soltarlas, así que los
    // anclajes se liberan también por su lado: si no, un cambio de tamaño de
    // diana dejaría medio escenario marcado como ocupado para siempre.
    for (let i = 0; i < this.points.length; i++) this.points[i].occupied = false
    for (let i = 0; i < this.routes.length; i++) this.routes[i].liveCount = 0
    this.aliveCount = 0
    this.sessionActive = false
    this._hasLastSpawn = false
    this._recentZone = null
  }

  /**
   * Avance por frame: movimiento, apariciones programadas, destellos y pops.
   * Trabajo acotado y sin alocaciones.
   *
   * @param {number} deltaSeconds tiempo de juego transcurrido. Llega a cero en
   *   pausa, de modo que las dianas se congelan con el cronómetro.
   */
  update(now, deltaSeconds, camera) {
    for (let i = 0; i < this.instances.length; i++) {
      const instance = this.instances[i]
      if (instance.state === 'dying') {
        this._updateDying(instance, now)
      } else if (instance.state === 'alive') {
        this._updateFlashes(instance, now)
        this._updateFacing(instance, deltaSeconds)
        // Con anclajes curados, el muestreo de destinos sigue prohibido —un
        // punto al azar acabaría dentro de un muro—, pero un muñeco con grupo de
        // patrulla sí se mueve: entre puntos verificados como alcanzables en
        // línea recta. Clásica y cono se quedan quietas en escenario.
        if (this.dynamic && deltaSeconds > 0 && (!this.useRoutes || instance.route)) {
          this._updateMotion(instance, deltaSeconds, now, camera)
        }
      }
    }

    if (!this.sessionActive || now < this._nextSpawnAt) return

    // Sale una diana cada `spawnIntervalMs` mientras quede sitio. Con
    // `maxAlive` a 1 el sitio sólo se libera al caer la que hubiera, que es el
    // comportamiento de siempre; de 2 en adelante se van acumulando.
    if (this.aliveCount < this.maxAlive) this._spawn(camera, now)
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
    // La distancia sale de aquí para que el motor pueda comprobar si hay
    // cobertura por delante sin repetir el raycast contra las dianas.
    return { instance, part, distance: hits[0].distance }
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
    // Altura del centro visual al morir: el pop crece alrededor de este punto.
    const offsetY = this.centerOffsetY
    instance.popCenterY = offsetY === 0 ? 0 : instance.group.position.y + offsetY
    this.aliveCount -= 1
    // Con una sola diana viva, la siguiente se cuenta desde la baja: es lo que
    // hace que la cadencia se sienta como el respawn del Gridshot. Con varias
    // manda el reloj continuo de las apariciones.
    if (this.maxAlive === 1) this._nextSpawnAt = now + this.spawnIntervalMs
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

    if (this.useRoutes) {
      const point = this._pickPoint(camera, instance)
      if (!point) {
        // Nada visible desde donde está el jugador. Se reintenta en un rato,
        // nunca en el frame siguiente: el test de visibilidad es de activación.
        this._nextSpawnAt = now + SPAWN.pointRetryMs
        return
      }
      point.occupied = true
      point.route.liveCount += 1
      this._recentZone = point.zone
      instance.point = point
      // Sólo patrullan los muñecos que se apoyan en el suelo: una esfera
      // flotante caminando entre cajas no tendría ningún sentido.
      instance.route = this.anchoredToFloor ? point.route : null
      instance.routeIndex = point.route.points.indexOf(point)
      _candidate.copy(point.position)
      if (!this.anchoredToFloor) _candidate.y += COVER.targetStandY
    } else {
      instance.point = null
      instance.route = null
      instance.routeIndex = -1
      this._samplePosition(camera, _candidate)
    }
    instance.group.position.copy(_candidate)
    instance.group.scale.setScalar(1)
    instance.health = TARGET.maxHealth
    instance.state = 'alive'
    instance.popCenterY = 0
    // Referencia limpia para el primer destino: el punto donde acaba de
    // aparecer, no lo que quedara de su vida anterior.
    instance.destination.copy(instance.group.position)
    // Nace mirando a donde estaba mirando el que ocupó esa ranura antes sería
    // un yaw heredado sin sentido: arranca mirando al frente del mapa.
    instance.facing = 0
    instance.facingTarget = 0
    // El destino se elige siempre, aunque el modo dinámico esté apagado: así
    // encenderlo a mitad de pausa no deja dianas con un destino inventado.
    this._pickDestination(instance, camera, now)
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
    if (instance.point) {
      instance.point.occupied = false
      instance.point.route.liveCount -= 1
      // Dónde cayó. Al volver, este muñeco no repite sitio: reaparecer en el
      // mismo punto en el que acaban de matarte es lo que convierte una ruta en
      // una galería de tiro.
      instance.lastPoint = instance.point
      instance.point = null
    }
    instance.route = null
    instance.routeIndex = -1
  }

  /**
   * Elige un punto libre y **visible** desde la cámara, con tres preferencias
   * encadenadas. En orden, porque cada una puede quedarse sin candidatos:
   *
   *  1. **Delante.** Sortear entre todos los visibles por igual hacía que la
   *     mitad de las dianas naciera a la espalda, y girarse a ciegas no es
   *     apuntar. Con probabilidad `SPAWN.forwardBiasChance` se mira sólo dentro
   *     del cono de `SPAWN.forwardBiasConeDeg`; el resto de las veces, todo. No
   *     es siempre a propósito: una sorpresa ocasional a la espalda mantiene la
   *     atención, siempre que no sea lo normal.
   *  2. **Rutas libres.** Entre los candidatos se prefieren los de rutas por las
   *     que no patrulle ya otro muñeco. Dos muñecos en la misma ruta se pisan el
   *     recorrido; repartirlos es lo que hace que el mapa se lea.
   *  3. **Nunca donde caíste.** El punto en el que murió este mismo muñeco queda
   *     descartado. Es una regla dura: si no hay otro sitio, no se aparece y se
   *     reintenta, que es preferible a reaparecer bajo el punto de mira.
   *
   * Si una preferencia no da ninguno visible se pasa a la siguiente — antes
   * quedarse sin diana que ser fiel al sesgo.
   *
   * Por encima de las tres manda el **cupo de zona** (`_measureZoneLoad`), que
   * no es una preferencia sino un límite: una zona con el cupo lleno queda
   * fuera del sorteo pase lo que pase. Y por debajo de las tres hay una cuarta,
   * blanda: **no repetir la zona del último que salió** si hay alternativa.
   *
   * Las pasadas son relajaciones de la **misma** elección, no elecciones
   * distintas, así que la moneda del sesgo se echa una sola vez y vale para
   * todas.
   */
  _pickPoint(camera, instance) {
    const avoid = instance.lastPoint ?? null
    // Las pasadas se solapan —un punto descartado por no estar visible en la
    // primera se volvería a mirar en la segunda—, y cada comprobación es un
    // raycast contra toda la geometría. Un sello por llamada hace que cada punto
    // se mire **como mucho una vez** por aparición: con 69 puntos, el peor caso
    // pasó de 148 raycasts a 69.
    this._visibilityStamp += 1
    this._measureZoneLoad()
    const biased = Math.random() < SPAWN.forwardBiasChance

    // 1. Con la zona del último descartada, que es lo que evita que una racha
    //    de reapariciones se quede viviendo en la misma esquina del mapa. Esta
    //    pasada **exige ruta libre**: cambiar de zona no vale tanto como para
    //    meter a dos muñecos en el mismo recorrido, y sin esa condición la
    //    rotación se comía la preferencia de ruta (medido: el reparto por rutas
    //    bajaba del 100% al 97%).
    if (this._recentZone !== null) {
      this._skipZone = this._recentZone
      const rotated = this._pickVisible(camera, avoid, biased, true)
      if (rotated) return rotated
    }

    // 2. Sin esa preferencia: repetir zona es peor que quedarse sin diana, pero
    //    sólo un poco.
    this._skipZone = null
    const visible = this._pickVisible(camera, avoid, biased, false)
    if (visible) return visible

    // 3. Y si con el cupo puesto no queda **nada visible**, sale donde no se ve.
    //    Es el único caso en que un muñeco aparece fuera de la vista, y es
    //    deliberado: significa que el jugador está plantado en un sitio desde el
    //    que sólo se ve una zona, y la alternativa sería dárselos todos ahí —que
    //    es exactamente el fallo que esto arregla—. Que haya que ir a buscarlos
    //    es la respuesta al campeo, no un efecto secundario.
    return this._pickUnseen(avoid)
  }

  /**
   * Las tres preferencias de siempre, todas sobre puntos visibles.
   *
   * @param {boolean} onlyFree exigir ruta libre y rendirse si no la hay, en vez
   *   de caer en una ruta ya ocupada. Lo usa la pasada de rotación de zona.
   */
  _pickVisible(camera, avoid, biased, onlyFree) {
    if (biased) {
      const forward = this._collectForward(camera, avoid)
      const free = this._firstVisible(camera, this._forwardOrder, forward, true)
      if (free) return free
      if (!onlyFree) {
        const any = this._firstVisible(camera, this._forwardOrder, forward, false)
        if (any) return any
      }
    }

    const order = this._pointOrder
    for (let i = 0; i < order.length; i++) order[i] = i
    const free = this._firstVisible(camera, order, order.length, true, avoid)
    if (free) return free
    if (onlyFree) return null
    return this._firstVisible(camera, order, order.length, false, avoid)
  }

  /**
   * Reparto por zonas de los que están vivos, y cuántos admite una zona.
   *
   * El cupo se mide sobre los que **habrá** cuando salga éste, así que con dos
   * vivos y `zoneShare` a 0.5 el cupo es 1: el segundo no puede caer donde está
   * el primero. De ahí sale la garantía, que es de bulto y no estadística: en
   * cuanto hay dos muñecos, hay dos zonas.
   *
   * Los que se están muriendo no cuentan —ya no suman en `aliveCount`—, pero su
   * punto sigue ocupado hasta que termine el pop, así que tampoco estorban.
   */
  _measureZoneLoad() {
    const load = this._zoneLoad
    load.clear()
    for (let i = 0; i < this.instances.length; i++) {
      const instance = this.instances[i]
      if (instance.state !== 'alive' || !instance.point) continue
      const zone = instance.point.zone
      load.set(zone, (load.get(zone) ?? 0) + 1)
    }
    this._zoneQuota = Math.max(1, Math.ceil((this.aliveCount + 1) * SPAWN.zoneShare))
  }

  /** ¿Este punto está en una zona que ahora mismo no admite a nadie más? */
  _isZoneBlocked(point) {
    if (point.zone === this._skipZone) return true
    return (this._zoneLoad.get(point.zone) ?? 0) >= this._zoneQuota
  }

  /**
   * Último recurso: un punto libre de una zona con cupo, **sin mirar si se ve**.
   * No se le pide visibilidad porque justo aquí es donde la visibilidad es el
   * problema: si desde donde está plantado el jugador sólo se ven puntos de una
   * zona, respetar la visibilidad y el cupo a la vez es imposible, y de los dos
   * el que sostiene el mapa es el cupo.
   */
  _pickUnseen(avoid) {
    const order = this._pointOrder
    for (let i = 0; i < order.length; i++) order[i] = i
    this._shuffle(order, order.length)
    // Aquí tampoco se tira por la borda la preferencia de ruta: primero las
    // libres, y sólo si no queda ninguna se comparte recorrido.
    for (let pasada = 0; pasada < 2; pasada++) {
      for (let i = 0; i < order.length; i++) {
        const point = this.points[order[i]]
        if (point.occupied || point === avoid) continue
        if (this._isZoneBlocked(point)) continue
        if (pasada === 0 && point.route.liveCount > 0) continue
        return point
      }
    }
    return null
  }

  /** Baraja los `count` primeros índices. Fisher-Yates, sin alocar. */
  _shuffle(order, count) {
    for (let i = count - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      const tmp = order[i]
      order[i] = order[j]
      order[j] = tmp
    }
  }

  /**
   * Índices de los puntos que caen delante del jugador, en `_forwardOrder`.
   *
   * El ángulo se mide **sólo en horizontal**: mirar al suelo no debe dejar de
   * considerar "delante" lo que tienes delante.
   *
   * @returns {number} cuántos hay
   */
  _collectForward(camera, avoid) {
    camera.getWorldDirection(_viewForward)
    _viewForward.y = 0
    const length = _viewForward.length()
    // Mirando en vertical perfecta no hay dirección horizontal que comparar.
    if (length < 1e-4) return 0
    _viewForward.multiplyScalar(1 / length)

    let count = 0
    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i]
      if (point.occupied || point === avoid) continue
      if (this._isZoneBlocked(point)) continue
      _direction.subVectors(point.position, camera.position)
      _direction.y = 0
      const distance = _direction.length()
      if (distance < 1e-4) continue
      const dot = (_direction.x * _viewForward.x + _direction.z * _viewForward.z) / distance
      if (dot >= this.cosForwardBias) this._forwardOrder[count++] = i
    }
    return count
  }

  /**
   * Baraja los `count` primeros índices de `order` y devuelve el primer punto
   * libre y visible. El primer elemento visible de una permutación uniforme
   * está distribuido uniformemente entre los visibles, así que el sorteo sale
   * gratis — y de paso ahorra raycasts: se dejan de mirar en cuanto uno acierta.
   *
   * @param {boolean} onlyFreeRoutes limitar a rutas sin nadie patrullando
   * @param {object} [avoid] punto descartado (donde cayó este mismo muñeco)
   */
  _firstVisible(camera, order, count, onlyFreeRoutes, avoid = null) {
    this._shuffle(order, count)
    for (let i = 0; i < count; i++) {
      const point = this.points[order[i]]
      if (point.occupied || point === avoid) continue
      if (this._isZoneBlocked(point)) continue
      if (onlyFreeRoutes && point.route.liveCount > 0) continue
      if (this._isVisibleCached(camera, point)) return point
    }
    return null
  }

  /**
   * Visibilidad de un punto, con memoria dentro de una misma elección. Ver el
   * sello en `_pickPoint`: sin él, las pasadas encadenadas repiten raycasts.
   */
  _isVisibleCached(camera, point) {
    if (point.visibilityStamp === this._visibilityStamp) return point.visible
    point.visibilityStamp = this._visibilityStamp
    point.visible = this._isPointVisible(camera, point)
    return point.visible
  }

  /**
   * Línea de visión entre el jugador y un punto. Sólo se llama al activar un
   * punto, nunca por frame: con cobertura por medio esto es un raycast contra
   * toda la geometría y no cabe en el presupuesto de un frame.
   */
  _isPointVisible(camera, point) {
    if (this._occluders.length === 0) return true

    _anchorProbe.copy(point.position)
    _anchorProbe.y +=
      this.anchoredToFloor ? this.type.halfHeight * this.radius : COVER.targetStandY

    _direction.subVectors(_anchorProbe, camera.position)
    const distance = _direction.length()
    if (distance <= 1e-4) return true
    _direction.multiplyScalar(1 / distance)

    this._visibilityRay.set(camera.position, _direction)
    this._visibilityRay.near = 0
    // Un pelo por delante de la diana: si no, la propia cobertura pegada a ella
    // contaría como obstáculo.
    this._visibilityRay.far = distance - 0.15
    const hits = this._visibilityRay.intersectObjects(this._occluders, false)
    return hits.length === 0
  }

  /**
   * Movimiento lineal hacia el destino, a velocidad constante y sin easing.
   * Al llegar —o al agotar el tiempo máximo— se elige otro destino.
   */
  _updateMotion(instance, deltaSeconds, now, camera) {
    const position = instance.group.position
    _motion.subVectors(instance.destination, position)
    const remaining = _motion.length()
    const step = this.patrolSpeed * deltaSeconds

    if (remaining <= step) {
      position.copy(instance.destination)
      this._pickDestination(instance, camera, now)
      return
    }
    position.addScaledVector(_motion, step / remaining)
    // Patrullando se mira hacia donde se anda. Lo pisa el fuego enemigo mientras
    // haya contacto: al que te está viendo se le nota porque te encara.
    instance.facingTarget = Math.atan2(_motion.x, _motion.z)
    if (now >= instance.destinationUntil) this._pickDestination(instance, camera, now)
  }

  /**
   * **El único sitio donde la orientación avanza.** Gira hacia `facingTarget` a
   * ritmo acotado, por el camino corto.
   *
   * Va con el delta de juego, así que en pausa se congela como todo lo demás, y
   * el ángulo se normaliza a (-π, π] antes de acotarlo: sin eso, ir de 170° a
   * -170° —diez grados— daría la vuelta larga por los 350.
   */
  _updateFacing(instance, deltaSeconds) {
    if (deltaSeconds <= 0) return
    let delta = instance.facingTarget - instance.facing
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    const step = TARGET.turnRateDeg * DEG_TO_RAD * deltaSeconds
    instance.facing += delta > step ? step : delta < -step ? -step : delta
  }

  /**
   * Elige destino dentro del mismo volumen del que salen las apariciones. Por
   * eso el tipo de anclaje basta para fijar los ejes: una figura de pie sólo
   * recibe destinos a nivel de suelo y nunca cambia de altura estando viva.
   */
  _pickDestination(instance, camera, now) {
    if (instance.route) {
      this._pickRouteDestination(instance, now)
      return
    }

    // El destino que traía sirve de referencia; al sortear se sobrescribe.
    _previousDestination.copy(instance.destination)

    let accepted = false
    let bestDot = Infinity
    for (let attempt = 0; attempt < SPAWN.destinationAttempts; attempt++) {
      this._samplePosition(camera, instance.destination, false)
      const dot = this._destinationClosestDot(camera, instance, _previousDestination)
      if (dot <= this.cosMinSeparation) {
        accepted = true
        break
      }
      if (dot < bestDot) {
        bestDot = dot
        _bestDestination.copy(instance.destination)
      }
    }

    // Con muchas dianas en poco sitio puede no haber hueco limpio, y el bucle
    // nunca debe quedarse dando vueltas. Al agotar los intentos nos quedamos
    // con el mejor de los probados —el de mayor separación— en vez de con el
    // último por orden de llegada, que podía ser el peor de todos.
    if (!accepted) instance.destination.copy(_bestDestination)

    instance.destinationUntil = now + TARGET.moveMaxSeconds * 1000
  }

  /**
   * Siguiente punto de la ruta, distinto del que se acaba de dejar.
   *
   * No hace falta comprobar nada: **cada par de la ruta está verificado como
   * alcanzable en línea recta** al definir el escenario, así que cualquier
   * elección es válida y no hay forma de que el muñeco se encaje en un muro.
   * Esa verificación es lo que permite prescindir de pathfinding entero.
   */
  _pickRouteDestination(instance, now) {
    const points = instance.route.points
    if (points.length === 0) return

    let index = (Math.random() * points.length) | 0
    if (points.length > 1 && index === instance.routeIndex) {
      // Un solo salto basta para no repetir, y reparte uniforme entre el resto.
      index = (index + 1 + ((Math.random() * (points.length - 1)) | 0)) % points.length
    }

    instance.routeIndex = index
    instance.destination.copy(points[index].position)

    // El plazo se calcula del tramo, no es el tope genérico: un muñeco de
    // patrulla camina **hasta llegar**, y reelegir a mitad de camino rompería
    // "al llegar a un punto, elige otro". Se deja margen sólo como red de
    // seguridad, por si algo lo empuja fuera de su recta.
    const distance = instance.group.position.distanceTo(instance.destination)
    const travelMs = (distance / this.patrolSpeed) * 1000
    instance.destinationUntil = now + travelMs * 2 + 500
  }

  /** Pop de muerte: la diana entera crece y se desvanece. */
  _updateDying(instance, now) {
    const t = (now - instance.dyingSince) / FEEDBACK.targetPopMs
    if (t >= 1) {
      this._release(instance)
      return
    }
    const eased = easeOut(t)
    const scale = 1 + (FEEDBACK.targetPopScale - 1) * eased
    instance.group.scale.setScalar(scale)
    // Escalar mueve el origen. Con el origen en los pies eso estiraría la
    // figura hacia arriba, así que se compensa para que crezca desde su centro.
    if (instance.popCenterY !== 0) {
      instance.group.position.y = instance.popCenterY - this.centerOffsetY * scale
    }
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

    // El pool se dimensiona para el máximo elegible, así que cambiar de opción
    // en el panel no obliga a reconstruirlo.
    const poolSize = MAX_SIMULTANEOUS_TARGETS + DYING_SLOTS
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

      const instance = {
        group,
        parts,
        state: 'free',
        health: TARGET.maxHealth,
        dyingSince: 0,
        popCenterY: 0,
        destination: new THREE.Vector3(),
        destinationUntil: 0,
        /** Punto de ruta que ocupa, si el escenario las usa. */
        point: null,
        /** Ruta por la que patrulla, si la hay. Null = se queda donde nace. */
        route: null,
        /** Punto de la ruta hacia el que camina, para no repetirlo al llegar. */
        routeIndex: -1,
        /** Dónde cayó la última vez. No vuelve a nacer ahí. */
        lastPoint: null,
        /**
         * **Identidad provisional.** La ficha flotante necesita un nick y un
         * arma, y hoy no hay ni cuentas ni inventario: el nick es la ranura del
         * pool y el arma, la del `ENEMY`. Cuando existan de verdad, lo que
         * cambia es quién escribe estos dos campos, no quién los lee.
         */
        nick: `${TARGET.nickPrefix}-${String(i + 1).padStart(2, '0')}`,
        weaponKey: ENEMY.weapon,
        /** El día que haya equipos: a un compañero se le ve la ficha siempre. */
        friendly: false,
        /**
         * **Hacia dónde mira**, en yaw, con la convención de siempre: la
         * dirección es `(sin yaw, 0, cos yaw)`.
         *
         * `facingTarget` es hacia dónde **quiere** mirar y lo escribe quien lo
         * sabe —la patrulla mientras camina, el fuego enemigo mientras te ve—;
         * `facing` es hacia dónde mira de verdad y lo lleva un solo integrador
         * (`_updateFacing`), acotado a `TARGET.turnRateDeg`. Con dos escritores
         * del valor final la brújula daría saltos según quién escribiera último.
         *
         * No cambia nada del comportamiento: el muñeco dispara igual mire donde
         * mire. Es lo que lee la brújula de `markers.js`.
         */
        facing: 0,
        facingTarget: 0,
      }
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
   *
   * Con anclaje a los pies el cono deja de decidir la altura: la figura se
   * apoya en el suelo y sólo se usa la dirección horizontal del cono, con la
   * distancia elegida medida en el plano X/Z.
   *
   * @param {boolean} [checkSeparation] los destinos del modo dinámico no
   *   necesitan guardar distancia con las demás dianas; las apariciones sí.
   */
  _samplePosition(camera, out, checkSeparation = true) {
    this._buildConeBasis(camera)

    const anchoredToFloor = this.anchoredToFloor
    const halfHeight = this.type.halfHeight * this.radius
    const room = this.room ?? ROOM
    const margin = halfHeight + room.step
    const limitX = room.width / 2 - margin
    const limitZ = room.depth / 2 - margin
    // Flotando, la figura no debe atravesar el suelo: el mínimo depende de su
    // altura. Apoyada en el suelo, la altura no se muestrea.
    const minY = Math.max(TARGET.yRange.min, halfHeight + 0.1)
    const maxY = Math.max(minY, TARGET.yRange.max)

    const [dMin, dMax] = this._distanceRange()
    // Rumbo del abanico: la componente horizontal del eje del cono.
    const axisAzimuth = Math.atan2(-_axis.x, -_axis.z)

    for (let attempt = 0; attempt < SPAWN.maxSampleAttempts; attempt++) {
      // Cada diana sortea su propia distancia: es lo que da variedad de
      // profundidad en vez de dejarlas todas sobre el mismo arco.
      const distance = dMin + Math.random() * (dMax - dMin)

      if (anchoredToFloor) {
        // Aparición puramente horizontal: se sortea el azimut dentro del
        // abanico y la altura la pone el suelo. Sortear el azimut directamente
        // —en lugar de muestrear un cono 3D y aplastarlo— reparte el ángulo de
        // forma uniforme; aplastar amontonaba las dianas cerca del eje.
        const azimuth = axisAzimuth + (Math.random() * 2 - 1) * this.coneHalfAngle
        out.set(
          camera.position.x - Math.sin(azimuth) * distance,
          FLOOR_Y,
          camera.position.z - Math.cos(azimuth) * distance,
        )
      } else {
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

        out.copy(camera.position).addScaledVector(_dir, distance)
        if (out.y < minY || out.y > maxY) continue
      }

      if (Math.abs(out.x) > limitX || Math.abs(out.z) > limitZ) continue
      if (checkSeparation && this._tooCloseToExisting(camera, out)) continue

      return out
    }

    // Salvavidas: ningún candidato pasó los filtros (p. ej. con la sala llena
    // o mirando a una esquina). Acotamos el último y seguimos: mejor una diana
    // algo forzada que ninguna.
    out.y = anchoredToFloor ? FLOOR_Y : THREE.MathUtils.clamp(out.y, minY, maxY)
    out.x = THREE.MathUtils.clamp(out.x, -limitX, limitX)
    out.z = THREE.MathUtils.clamp(out.z, -limitZ, limitZ)
    return out
  }

  /**
   * Rango de distancias del que sortea cada diana.
   *
   * Con perfil de tipo la horquilla es proporcional al valor del slider —así
   * el mismo control sigue mandando— y nunca baja del mínimo absoluto. Sin
   * perfil se mantiene la dispersión fija de siempre.
   *
   * @returns {[number, number]}
   */
  _distanceRange() {
    const profile = this.spawnProfile
    if (!profile) {
      return [Math.max(1, this.distance - TARGET.distanceSpread), this.distance + TARGET.distanceSpread]
    }
    const min = Math.max(profile.minSpawnDistance, this.distance * profile.distanceScale.min)
    return [min, Math.max(min, this.distance * profile.distanceScale.max)]
  }

  /**
   * Separación angular vista desde el jugador: evita dianas encadenadas y, en
   * modo acumulativo, que dos se solapen en pantalla.
   *
   * Se compara contra el centro visual de cada figura, no contra su origen:
   * con anclaje a los pies el origen está en el suelo y mediría hacia abajo.
   */
  _tooCloseToExisting(camera, position) {
    for (let i = 0; i < this.instances.length; i++) {
      const instance = this.instances[i]
      if (instance.state !== 'alive') continue
      if (this._tooCloseAngularly(camera, position, instance.group.position)) return true
    }
    // Sin dianas vivas, el listón lo pone la última que hubo: así el modo no
    // acumulativo sigue forzando el flick entre una diana y la siguiente.
    if (this.aliveCount === 0 && this._hasLastSpawn) {
      return this._tooCloseAngularly(camera, position, this._lastSpawnPosition)
    }
    return false
  }

  /**
   * La comprobación de separación en crudo: ¿se ven estos dos puntos
   * demasiado juntos desde el jugador? La comparten las apariciones y los
   * destinos del modo dinámico, para que el criterio sea uno solo.
   *
   * Se compara el centro visual de cada figura, no su origen: con anclaje a
   * los pies el origen está en el suelo y mediría hacia abajo.
   */
  _tooCloseAngularly(camera, a, b) {
    return this._separationDot(camera, a, b) > this.cosMinSeparation
  }

  /**
   * Coseno del ángulo que separa dos puntos vistos desde el jugador. Cuanto
   * mayor, más juntos se ven — comparar cosenos evita un `acos` por candidato.
   */
  _separationDot(camera, a, b) {
    const offsetY = this.centerOffsetY
    _center.set(a.x, a.y + offsetY, a.z)
    _dir2.subVectors(_center, camera.position).normalize()
    _center.set(b.x, b.y + offsetY, b.z)
    _otherDir.subVectors(_center, camera.position).normalize()
    return _dir2.dot(_otherDir)
  }

  /**
   * ¿Cuánto pisa el destino recién sorteado? Devuelve la separación al vecino
   * más cercano, como coseno: mide contra las demás dianas vivas y contra el
   * destino que esta misma traía, para que reelegir suponga de verdad un
   * cambio de rumbo.
   */
  _destinationClosestDot(camera, instance, previousDestination) {
    const candidate = instance.destination
    let closest = -1
    for (let i = 0; i < this.instances.length; i++) {
      const other = this.instances[i]
      if (other === instance || other.state !== 'alive') continue
      const dot = this._separationDot(camera, candidate, other.group.position)
      if (dot > closest) closest = dot
    }
    const previous = this._separationDot(camera, candidate, previousDestination)
    return previous > closest ? previous : closest
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
