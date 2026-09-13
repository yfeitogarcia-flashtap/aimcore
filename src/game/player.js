/**
 * **El jugador como blanco**: vida, escudo, casco y reaparición.
 *
 * Hasta ahora el jugador era una cámara con colisión. Desde que los muñecos
 * disparan también es algo a lo que se le puede dar, y esto es lo que decide
 * dónde le han dado y qué pasa entonces.
 *
 * **La geometría no se inventa aquí.** Las tres zonas salen de
 * `TARGET_TYPES.hitbox.parts` —las mismas con las que el jugador dispara a un
 * muñeco— escaladas a su altura de ojos, que cambia al agacharse. Es el sistema
 * de daño por zona de siempre mirando al revés: cabeza 100, torso 50, piernas
 * 34, sobre 100 de vida.
 *
 * **Reparto de la protección**, que es toda la mecánica en dos frases: el escudo
 * cubre el cuerpo y absorbe el porcentaje que diga el arma que dispara; la
 * cabeza no la cubre nadie más que el casco, y el casco es binario —el primer
 * disparo lo rompe y el siguiente mata—. Que mate sale solo del modelo: la
 * cabeza vale 100 de 100.
 *
 * No sabe nada de quién dispara ni de dónde: recibe un rayo y un arma.
 */

import * as THREE from 'three'
import { COVER, PLAYER, TARGET_TYPES, WEAPONS } from '../config.js'

/** Las tres zonas del hitbox, indexadas por nombre. */
const ZONES = {}
for (const part of TARGET_TYPES.hitbox.parts) ZONES[part.zone] = part

/**
 * Cortes de altura del muñeco, en sus propias unidades (múltiplos del radio),
 * y la altura de los ojos con la que se escalan. Salen de las piezas, no de
 * números escritos aquí: la cabeza empieza donde acaba el torso.
 */
const LEGS_TOP = ZONES.legs.offsetY + ZONES.legs.height / 2
const TORSO_TOP = ZONES.torso.offsetY + ZONES.torso.height / 2
const BODY_TOP = ZONES.head.offsetY + ZONES.head.radius
/** Los «ojos» del muñeco son el centro de su cabeza. Es la referencia de escala. */
const EYE_LEVEL = ZONES.head.offsetY

const _toPlayer = new THREE.Vector3()

export class PlayerStatus {
  constructor() {
    this.reset()
  }

  /** Estado de arranque de sesión: la dotación provisional de `PLAYER`. */
  reset() {
    this.health = PLAYER.maxHealth
    this.shield = PLAYER.shield.segment * PLAYER.shield.startSegments
    this.charges = PLAYER.shield.startCharges
    this.helmet = PLAYER.helmet.startsEquipped
    this.alive = true
    /** Acumulados de la sesión: alimentan la puntuación. */
    this.damageTaken = 0
    this.deaths = 0
    /**
     * Los dos relojes de esta clase van **por delta, no por fecha**: en pausa
     * el motor deja de pasar tiempo y se congelan solos. Con un instante
     * absoluto, pausar quince segundos se habría comido una reaparición entera.
     */
    this.respawnMs = PLAYER.respawn.baseMs
    this.respawnLeftMs = 0
    this.applyLeftMs = 0
  }

  /** Reaparecer: la misma dotación de salida, sin tocar el inventario. */
  respawn() {
    this.health = PLAYER.maxHealth
    this.shield = PLAYER.shield.segment * PLAYER.shield.startSegments
    this.alive = true
    this.applyLeftMs = 0
    this.respawnLeftMs = 0
  }

  get shieldSegments() {
    return Math.ceil(this.shield / PLAYER.shield.segment)
  }

  get maxSegments() {
    return Math.round(PLAYER.shield.max / PLAYER.shield.segment)
  }

  /** ¿Se está aplicando una carga ahora mismo? */
  get applying() {
    return this.applyLeftMs > 0
  }

  /** Progreso 0..1 de la carga en curso, para el HUD. */
  get applyProgress() {
    if (!this.applying) return 0
    return 1 - this.applyLeftMs / PLAYER.shield.applyMs
  }

  /**
   * Empieza a aplicar una carga del inventario.
   * @returns {boolean} si ha empezado de verdad (hay carga y hay hueco)
   */
  beginShieldApply() {
    if (!this.alive || this.applying) return false
    if (this.charges <= 0) return false
    if (this.shield >= PLAYER.shield.max) return false
    this.charges -= 1
    this.applyLeftMs = PLAYER.shield.applyMs
    return true
  }

  /**
   * Avanza los dos relojes.
   * @param {number} deltaMs tiempo de juego; cero en pausa
   * @returns {{ shieldReady: boolean, respawnReady: boolean }}
   */
  tick(deltaMs) {
    const result = { shieldReady: false, respawnReady: false }
    if (deltaMs <= 0) return result
    if (this.applying) {
      this.applyLeftMs -= deltaMs
      if (this.applyLeftMs <= 0) {
        this.applyLeftMs = 0
        this.shield = Math.min(PLAYER.shield.max, this.shield + PLAYER.shield.segment)
        result.shieldReady = true
      }
    }
    if (!this.alive) {
      this.respawnLeftMs -= deltaMs
      if (this.respawnLeftMs <= 0) {
        this.respawnLeftMs = 0
        result.respawnReady = true
      }
    }
    return result
  }

  /** Corta la carga en curso sin devolverla: morir cancela. */
  cancelShieldApply() {
    this.applyLeftMs = 0
  }

  /** @returns {boolean} si la carga cabía en el inventario */
  addCharge() {
    if (this.charges >= PLAYER.shield.maxCharges) return false
    this.charges += 1
    return true
  }

  /** @returns {boolean} si hacía falta curarse */
  heal(amount = PLAYER.healthPickup) {
    if (!this.alive || this.health >= PLAYER.maxHealth) return false
    this.health = Math.min(PLAYER.maxHealth, this.health + amount)
    return true
  }

  /** @returns {boolean} si no llevaba casco ya */
  equipHelmet() {
    if (this.helmet) return false
    this.helmet = true
    return true
  }

  /**
   * Encaja un disparo en una zona.
   *
   * @param {string} zone 'head' | 'torso' | 'legs'
   * @param {number} damage daño de la zona, ya escalado por quien dispara
   * @param {string} weaponKey arma del atacante; de ella sale `shieldAbsorb`
   * @returns {{ zone: string, killed: boolean, helmetBroken: boolean, health: number,
   *   shieldHit: boolean, damage: number }}
   */
  takeHit(zone, damage, weaponKey) {
    const result = {
      zone,
      killed: false,
      helmetBroken: false,
      shieldHit: false,
      damage: 0,
      health: this.health,
    }
    if (!this.alive) return result

    // El casco se come el primer disparo a la cabeza entero y se rompe. El
    // siguiente encuentra la cabeza descubierta, y la cabeza vale una vida.
    if (zone === 'head' && this.helmet) {
      this.helmet = false
      result.helmetBroken = true
      return result
    }

    let toHealth = damage
    // El escudo sólo cubre el cuerpo. Lo que absorbe sale del arma que dispara,
    // fijo y sin caída por distancia todavía.
    if (zone !== 'head' && this.shield > 0) {
      const absorb = WEAPONS[weaponKey]?.shieldAbsorb ?? 0
      const taken = Math.min(this.shield, damage * absorb)
      this.shield -= taken
      toHealth = damage - taken
      result.shieldHit = taken > 0
    }

    this.health -= toHealth
    this.damageTaken += damage
    result.damage = damage
    result.health = this.health
    if (this.health <= 0) {
      this.health = 0
      result.killed = true
    }
    return result
  }

  /**
   * Anota una muerte y arranca la cuenta de reaparición.
   *
   * El tiempo de espera es **un acumulador**, no una racha contada aparte: cada
   * muerte lo sube y cada baja lo baja (ver `onKill`). Así «+2 s por cada muerte
   * consecutiva sin baja entre medias» es una consecuencia de las dos reglas y
   * no un tercer contador que se pueda desincronizar.
   */
  die() {
    this.alive = false
    this.health = 0
    this.deaths += 1
    this.cancelShieldApply()
    this.respawnLeftMs = this.respawnMs
    this.respawnMs = Math.min(PLAYER.respawn.maxMs, this.respawnMs + PLAYER.respawn.stepMs)
    return this.respawnLeftMs
  }

  /**
   * Una baja del jugador descuenta espera, pero **sólo si la espera ya se ha ido
   * de las manos**: por debajo del umbral no hay nada que perdonar.
   */
  onKill() {
    const respawn = PLAYER.respawn
    if (this.respawnMs <= respawn.killCreditAboveMs) return
    this.respawnMs = Math.max(respawn.baseMs, this.respawnMs - respawn.killCreditMs)
  }

  /** ¿Parpadea el HUD? Poca vida **y** sin escudo: con escudo no hay urgencia. */
  get lowHealth() {
    return this.alive && this.shield <= 0 && this.health < PLAYER.lowHealth
  }
}

/**
 * **Dónde tiene el cuerpo el jugador ahora mismo.** Los cortes salen de las
 * proporciones del hitbox escaladas por la altura de ojos: agachado el cuerpo
 * mide menos y las tres zonas bajan con él, sin una segunda tabla de alturas.
 *
 * @param {THREE.Camera} camera
 * @param {number} eyeHeight altura de los ojos sobre los pies
 * @param {number} feetY altura de los pies. Llega del movimiento y no se deduce
 *   de la cámara: entre las dos está el hundimiento del aterrizaje, y nueve
 *   centímetros bastan para cambiar de zona un disparo que roza la cintura.
 */
export function playerBody(camera, eyeHeight, feetY) {
  const k = eyeHeight / EYE_LEVEL
  return {
    x: camera.position.x,
    z: camera.position.z,
    feetY,
    radius: COVER.playerRadius,
    legsTop: feetY + LEGS_TOP * k,
    torsoTop: feetY + TORSO_TOP * k,
    top: feetY + BODY_TOP * k,
  }
}

/**
 * ¿Ese disparo entra, y por dónde?
 *
 * El cuerpo es el **mismo cilindro que usa la colisión** (`COVER.playerRadius`),
 * acotado arriba y abajo por la altura de las zonas. Se resuelve analíticamente
 * y no con un raycast contra una malla porque no hay malla: el jugador es una
 * cámara, y montarle un cuerpo invisible sólo para que le disparen sería tener
 * dos cuerpos que se pueden desincronizar.
 *
 * @param {{x:number,y:number,z:number}} origin
 * @param {THREE.Vector3} direction unitaria
 * @param {object} body el de `playerBody`
 * @param {number} maxDistance
 * @returns {{ zone: string, distance: number } | null}
 */
export function hitPlayer(origin, direction, body, maxDistance) {
  // Cilindro vertical: el problema se resuelve en el plano XZ.
  const dx = origin.x - body.x
  const dz = origin.z - body.z
  const a = direction.x * direction.x + direction.z * direction.z
  if (a <= 1e-9) return null
  const b = 2 * (dx * direction.x + dz * direction.z)
  const c = dx * dx + dz * dz - body.radius * body.radius
  const disc = b * b - 4 * a * c
  if (disc < 0) return null

  const root = Math.sqrt(disc)
  let t = (-b - root) / (2 * a)
  // Dentro del cilindro (a bocajarro), el corte de entrada queda detrás.
  if (t < 0) t = (-b + root) / (2 * a)
  if (t < 0 || t > maxDistance) return null

  const y = origin.y + direction.y * t
  if (y < body.feetY || y > body.top) return null

  const zone = y <= body.legsTop ? 'legs' : y <= body.torsoTop ? 'torso' : 'head'
  return { zone, distance: t }
}

/** Punto al que apunta quien dispara al jugador: el pecho, no los pies. */
export function aimPoint(body, factor, out = _toPlayer) {
  return out.set(body.x, body.feetY + (body.top - body.feetY) * factor, body.z)
}

/** Daño de una zona, tal como lo declara el modelo de hitbox. */
export function zoneDamage(zone) {
  return ZONES[zone]?.damage ?? 0
}
