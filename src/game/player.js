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
 * **Y unos segundos de gracia al reaparecer** (`PLAYER.respawn.invulnerableMs`),
 * porque reaparecer donde estabas con los mismos muñecos encarados al mismo
 * sitio es morir otra vez antes de ver la pantalla. Van por delta como los otros
 * dos relojes de aquí, así que en pausa no corren.
 *
 * No sabe nada de quién dispara ni de dónde: recibe un rayo y un arma.
 */

import * as THREE from 'three'
import { AVATAR, PLAYER, TARGET, TARGET_TYPES, WEAPONS } from '../config.js'
import { BODY_HEIGHT, MAX_RADIUS, ZONE_BANDS, bodyHeightFor, hitRadiusAt } from './body.js'

/**
 * **Las zonas de disparo del juego, indexadas por nombre — de todos los tipos
 * de diana y no de uno** (vuelta 78).
 *
 * Esta tabla salía sólo de `TARGET_TYPES.hitbox`, que tiene `head`, `torso` y
 * `legs`. La Clásica y el Cono declaran **una sola zona**, `single`, así que
 * desde la vuelta 70 —cuando `applyHit` dejó de leer `part.damage` y pasó a
 * preguntar aquí— un disparo a una diana clásica devolvía `0` y la diana
 * **no moría nunca**: parpadeaba de blanco, que es lo que hace una zona que
 * encaja un impacto y sobrevive, y se quedaba ahí.
 *
 * No dio ningún error, y ésa es la lección: **una zona desconocida valía cero
 * en silencio**. Ahora la tabla se deriva del catálogo entero, que es donde
 * están escritas las zonas que el juego puede producir, y `dianas78` comprueba
 * que ninguna de ellas hace cero.
 */
const ZONES = {}
for (const type of Object.values(TARGET_TYPES)) {
  for (const part of type.parts) ZONES[part.zone] = part
}

/** El perfil de la figura, que es de donde sale el ancho del hitbox. */
const PROFILE = AVATAR.body.profile

const _toPlayer = new THREE.Vector3()

/**
 * **Cómo encaja un cuerpo un disparo: casco, escudo y vida, en ese orden.**
 *
 * Es una función **pura y compartida** (vuelta 64): la llaman el jugador del
 * entrenamiento (`PlayerStatus.takeHit`, aquí debajo) y el servidor del duelo
 * (`net/partida.js`), que hasta ahora sólo sabía restar vida. Dos copias de
 * esta escalera es cómo un chaleco acaba absorbiendo distinto según el modo —y
 * desde la vuelta 63 una diferencia entre modos que nadie decidió es un fallo
 * de producto, no un detalle.
 *
 * Las dos reglas que están aquí y no en quien llama:
 *
 * - **El casco es binario y se come el disparo entero.** El primero a la cabeza
 *   lo rompe y se para ahí; el siguiente encuentra la cabeza descubierta, y la
 *   cabeza vale una vida en el modelo de zonas. Que mate no es un caso especial.
 * - **El escudo cubre el cuerpo, nunca la cabeza**, y lo que absorbe sale del
 *   **arma que dispara** (`shieldAbsorb`), fijo y sin caída por distancia.
 *
 * @param {{health:number, shield:number, helmet:boolean}} estado
 * @param {{zone:string, damage:number, weaponKey:string}} tiro
 * @returns {{health:number, shield:number, helmet:boolean, damage:number,
 *   helmetBroken:boolean, shieldHit:boolean, killed:boolean}}
 */
export function encajarImpacto(estado, { zone, damage, weaponKey, mortal = false }) {
  const salida = {
    health: estado.health,
    shield: estado.shield,
    helmet: estado.helmet,
    damage: 0,
    helmetBroken: false,
    shieldHit: false,
    killed: false,
  }
  /**
   * **La puñalada por la espalda mata, y mata antes que nada** (vuelta 71).
   * Va aquí arriba, por delante del casco y del escudo, porque **no es más
   * daño: es muerte**. Un número grande lo pararía un chaleco y entonces «un
   * fuerte por la espalda mata siempre» pasaría a ser «mata casi siempre», que
   * es otra regla. Lo que se anota como daño es la vida que quedaba, para que
   * los acumulados del resumen sigan sumando lo que de verdad se quitó.
   */
  if (mortal) {
    salida.health = 0
    salida.damage = estado.health
    salida.killed = true
    return salida
  }
  if (zone === 'head' && estado.helmet) {
    salida.helmet = false
    salida.helmetBroken = true
    return salida
  }
  let aLaVida = damage
  if (zone !== 'head' && estado.shield > 0) {
    const absorbe = WEAPONS[weaponKey]?.shieldAbsorb ?? 0
    const parado = Math.min(estado.shield, damage * absorbe)
    salida.shield = estado.shield - parado
    aLaVida = damage - parado
    salida.shieldHit = parado > 0
  }
  salida.health = Math.max(0, estado.health - aLaVida)
  salida.damage = damage
  salida.killed = salida.health <= 0
  return salida
}

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
    this.invulnerableLeftMs = 0
  }

  /** Reaparecer: la misma dotación de salida, sin tocar el inventario. */
  respawn() {
    this.health = PLAYER.maxHealth
    this.shield = PLAYER.shield.segment * PLAYER.shield.startSegments
    this.alive = true
    this.applyLeftMs = 0
    this.respawnLeftMs = 0
    // Reaparecer donde estabas, con los mismos muñecos encarados al mismo sitio,
    // es morir otra vez antes de ver la pantalla.
    this.invulnerableLeftMs = PLAYER.respawn.invulnerableMs
  }

  /** ¿Está en los segundos de gracia de la reaparición? */
  get invulnerable() {
    return this.alive && this.invulnerableLeftMs > 0
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
    if (this.invulnerableLeftMs > 0) {
      this.invulnerableLeftMs -= deltaMs
      if (this.invulnerableLeftMs <= 0) this.invulnerableLeftMs = 0
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
      blocked: false,
      damage: 0,
      health: this.health,
    }
    if (!this.alive) return result

    // Los segundos de gracia van **antes que el casco**: si no, reaparecer con
    // casco y recibir un tiro a la cabeza gastaría el casco sin quitar vida, y
    // la invulnerabilidad habría costado el casco. Esto es de **este** jugador
    // —el del duelo no tiene gracia al reaparecer— y por eso se queda aquí y no
    // en la regla compartida.
    if (this.invulnerableLeftMs > 0) {
      result.blocked = true
      return result
    }

    const tras = encajarImpacto(this, { zone, damage, weaponKey })
    this.helmet = tras.helmet
    this.shield = tras.shield
    this.health = tras.health
    if (tras.helmetBroken) {
      result.helmetBroken = true
      return result
    }
    this.damageTaken += damage
    result.shieldHit = tras.shieldHit
    result.damage = damage
    result.health = this.health
    result.killed = tras.killed
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
    this.invulnerableLeftMs = 0
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
 * **Y la altura total es la que se dibuja** (vuelta 65), no una escala propia:
 * sale de `bodyHeightFor`, que es exactamente lo que mide el avatar con esos
 * ojos. Hasta la 65 esto escalaba poniendo los ojos en el centro de la cabeza
 * —la convención de un muñeco— y salía un cuerpo 2.7 cm más alto que la
 * coronilla dibujada.
 *
 * @param {THREE.Camera} camera
 * @param {number} eyeHeight altura de los ojos sobre los pies
 * @param {number} feetY altura de los pies. Llega del movimiento y no se deduce
 *   de la cámara: entre las dos está el hundimiento del aterrizaje, y nueve
 *   centímetros bastan para cambiar de zona un disparo que roza la cintura.
 */
export function playerBody(camera, eyeHeight, feetY) {
  const height = bodyHeightFor(eyeHeight)
  return {
    x: camera.position.x,
    z: camera.position.z,
    feetY,
    /**
     * **El radio mayor de la figura, que acota y no decide.** Es el cilindro
     * que la envuelve —para descartar barato y para acotar distancias—, no el
     * ancho del hitbox: ése lo pone el perfil a cada altura.
     *
     * **Y no encoge al agacharse**, porque el cuerpo tampoco: `setEyeHeight`
     * achata el avatar **sólo en Y** y lo deja igual de ancho. Escalar el ancho
     * con la altura dejaba al agachado un 38% más estrecho de lo que se ve
     * —medido en `hitbox65`: 12.533 rayos de silueta sin hitbox detrás—. De
     * aquí sale también el ancho de dentro de `hitPlayer`, que es la única
     * forma de que un cuerpo rebobinado —que llega interpolado, sin altura de
     * ojos— sepa lo ancho que era.
     */
    radius: MAX_RADIUS * BODY_HEIGHT,
    legsTop: feetY + ZONE_BANDS.legs[1] * height,
    torsoTop: feetY + ZONE_BANDS.torso[1] * height,
    top: feetY + height,
  }
}

/**
 * ¿Ese disparo entra, y por dónde?
 *
 * **El volumen que recibe disparos es la silueta que se dibuja** (vuelta 65).
 * Hasta entonces era el cilindro de la colisión (`COVER.playerRadius`, 0.4) a
 * todas las alturas, y eso son dos cuerpos distintos: la figura mide 0.293 en
 * su punto más ancho y **0.137 en la cabeza**, así que había un anillo de aire
 * de 26 cm alrededor del cráneo que contaba como impacto en la cabeza —o sea
 * cien de daño, o sea muerto de un tiro apuntando visiblemente fuera—.
 *
 * Ahora se resuelve contra **el mismo perfil que dibuja `body.js`**: la figura
 * es un sólido de revolución, así que su silueta es el perfil desde cualquier
 * ángulo, y un corte contra el sólido es un corte contra lo que se ve. El
 * perfil es una poligonal, así que cada tramo es un tronco de cono y el corte
 * es una cuadrática por tramo — veintiuna, y sólo para el disparo que pasa el
 * descarte del cilindro envolvente. No hay malla contra la que lanzar un rayo:
 * el jugador es una cámara, y montarle un cuerpo invisible sólo para que le
 * disparen serían dos cuerpos que se desincronizan.
 *
 * Y el perfil se mete hacia dentro por `HIT_INSET`, el apotema de la sección:
 * la malla tiene diez caras y de canto es más estrecha que su radio, así que
 * sin ese margen el volumen asomaría un 4.9% por fuera de lo que se ve. La
 * garantía va **en un solo sentido a propósito**: lo que no se ve no se puede
 * acertar.
 *
 * @param {{x:number,y:number,z:number}} origin
 * @param {THREE.Vector3} direction unitaria
 * @param {object} body el de `playerBody`
 * @param {number} maxDistance
 * @returns {{ zone: string, distance: number } | null}
 */
export function hitPlayer(origin, direction, body, maxDistance) {
  const height = body.top - body.feetY
  if (!(height > 0)) return null
  // La altura la pone la postura; el ancho, no. Sale del radio envolvente, que
  // es lo único que un cuerpo rebobinado trae del ancho que tenía.
  const ancho = body.radius / MAX_RADIUS

  const dx = origin.x - body.x
  const dz = origin.z - body.z
  const a = direction.x * direction.x + direction.z * direction.z
  const b = 2 * (dx * direction.x + dz * direction.z)
  const c = dx * dx + dz * dz

  // Descarte contra el cilindro envolvente: la inmensa mayoría de los disparos
  // se van por aquí sin tocar un solo tronco de cono. Con un rayo vertical la
  // cuadrática degenera y no descarta nada, así que se salta.
  //
  // Y de paso sale **la franja de alturas que el rayo puede llegar a tocar**,
  // que es lo que deja no mirar los veintiún tramos: un disparo horizontal a la
  // cabeza sólo cruza los dos o tres de arriba.
  let yLo = -Infinity
  let yHi = Infinity
  if (a > 1e-9) {
    const disc = b * b - 4 * a * (c - body.radius * body.radius)
    if (disc < 0) return null
    const root = Math.sqrt(disc)
    const tEntra = Math.max(0, (-b - root) / (2 * a))
    const tSale = Math.min(maxDistance, (-b + root) / (2 * a))
    if (tSale < tEntra) return null
    const yA = origin.y + direction.y * tEntra
    const yB = origin.y + direction.y * tSale
    yLo = Math.min(yA, yB)
    yHi = Math.max(yA, yB)
    if (yHi < body.feetY || yLo > body.top) return null
  }

  let mejor = Infinity
  // Los tramos del perfil, cada uno un tronco de cono.
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const nivel0 = PROFILE[i][0]
    const nivel1 = PROFILE[i + 1][0]
    const y0 = body.feetY + nivel0 * height
    const y1 = body.feetY + nivel1 * height
    if (y1 < yLo || y0 > yHi) continue
    const r0 = hitRadiusAt(nivel0) * ancho
    const r1 = hitRadiusAt(nivel1) * ancho
    // Radio del tronco en función de la altura: r(y) = k0 + m·(y − y0).
    const m = (r1 - r0) / (y1 - y0)
    const k0 = r0 + m * (origin.y - y0)
    const k1 = m * direction.y
    // |p(t) − eje|² = r(y(t))², que es otra cuadrática en t.
    const qa = a - k1 * k1
    const qb = b - 2 * k0 * k1
    const qc = c - k0 * k0
    if (Math.abs(qa) < 1e-12) {
      if (Math.abs(qb) < 1e-12) continue
      mejor = _mejorCorte(-qc / qb, origin, direction, k0, k1, y0, y1, maxDistance, mejor)
      continue
    }
    const disc = qb * qb - 4 * qa * qc
    if (disc < 0) continue
    const root = Math.sqrt(disc)
    mejor = _mejorCorte((-qb - root) / (2 * qa), origin, direction, k0, k1, y0, y1, maxDistance, mejor)
    mejor = _mejorCorte((-qb + root) / (2 * qa), origin, direction, k0, k1, y0, y1, maxDistance, mejor)
  }

  // Las dos tapas. Un disparo desde arriba justo en la vertical de la coronilla
  // —o desde abajo, por una tronera— entra por un disco y por ningún cono.
  if (Math.abs(direction.y) > 1e-9) {
    mejor = _mejorTapa(body.feetY, hitRadiusAt(0) * ancho, origin, direction, dx, dz, maxDistance, mejor)
    mejor = _mejorTapa(body.top, hitRadiusAt(1) * ancho, origin, direction, dx, dz, maxDistance, mejor)
  }

  if (!Number.isFinite(mejor)) return null
  const y = origin.y + direction.y * mejor
  const zone = y <= body.legsTop ? 'legs' : y <= body.torsoTop ? 'torso' : 'head'
  return { zone, distance: mejor }
}

/** ¿Ese corte con el cono vale, y mejora al que ya había? Sin asignar nada. */
function _mejorCorte(t, origin, direction, k0, k1, y0, y1, maxDistance, mejor) {
  if (!(t >= 0) || t > maxDistance || t >= mejor) return mejor
  // El cono es infinito: sólo vale el trozo que ocupa este tramo del perfil…
  const y = origin.y + direction.y * t
  if (y < y0 - 1e-9 || y > y1 + 1e-9) return mejor
  // …y la hoja de radio positivo, no su reflejo por debajo del vértice.
  if (k0 + k1 * t < 0) return mejor
  return t
}

/** Lo mismo con una tapa: el disco de un extremo. */
function _mejorTapa(yTapa, radio, origin, direction, dx, dz, maxDistance, mejor) {
  const t = (yTapa - origin.y) / direction.y
  if (!(t >= 0) || t > maxDistance || t >= mejor) return mejor
  const px = dx + direction.x * t
  const pz = dz + direction.z * t
  if (px * px + pz * pz > radio * radio) return mejor
  return t
}

/**
 * **¿El golpe viene por la espalda?** (vuelta 71)
 *
 * Se mide el ángulo entre hacia dónde mira la víctima y hacia dónde está quien
 * le pega: por detrás es lo contrario de mirarse, o sea un coseno negativo. El
 * arco (`arcoDeg`) es el cono completo centrado en la nuca, así que 120°
 * significa 60° a cada lado y de costado no cuenta.
 *
 * **El rumbo entra como vector, no como ángulo, a propósito.** Un yaw de cámara
 * mira a −Z y el `facing` de un muñeco mira a +Z (ver `facingDesdeCamara`, en
 * `markers.js`): el mismo número significa lo contrario según de dónde venga, y
 * esta función la llaman los dos. Que cada uno traiga su vector deja la
 * conversión donde está la convención y no aquí dentro, que es donde un signo
 * invertido no se ve nunca — un error de 180° aquí sería «te matan de frente».
 *
 * @param {number} ax,az dónde está quien ataca
 * @param {number} vx,vz dónde está la víctima
 * @param {number} fx,fz hacia dónde mira la víctima, unitario y en el plano
 * @param {number} arcoDeg el cono completo, en grados
 */
export function esPorLaEspalda(ax, az, vx, vz, fx, fz, arcoDeg) {
  const dx = ax - vx
  const dz = az - vz
  const largo = Math.hypot(dx, dz)
  // Encima de ella no es ni por delante ni por detrás: no cuenta como espalda.
  if (!(largo > 1e-6)) return false
  const coseno = (dx * fx + dz * fz) / largo
  // El ángulo entre «hacia dónde mira» y «dónde está el atacante». Por la
  // espalda del todo son 180°.
  const anguloDeg = (Math.acos(Math.max(-1, Math.min(1, coseno))) * 180) / Math.PI
  return anguloDeg >= 180 - arcoDeg / 2
}

/** Punto al que apunta quien dispara al jugador: el pecho, no los pies. */
export function aimPoint(body, factor, out = _toPlayer) {
  return out.set(body.x, body.feetY + (body.top - body.feetY) * factor, body.z)
}

/**
 * **Lo que vale una bala en esa zona, con el arma que la dispara.**
 *
 * El modelo de zonas dice la **forma** del daño —cabeza 100, torso 50, piernas
 * 34— y el arma dice cuánto vale la suya (`damageScale`, vuelta 70). Hasta la
 * Scout no hizo falta porque las tres armas pegaban igual, y escribir un número
 * de daño por arma entonces habría sido inventarse un dato; con un fusil de
 * francotirador que mata de un tiro al cuerpo, el dato existe.
 *
 * **Lo que ya vale una vida entera no se escala**, por la misma razón que
 * `ENEMY.bodyDamageScale` tampoco toca la cabeza: la cabeza vale 100 de 100 y
 * de ahí cuelga la regla del casco —el primero a la cabeza lo rompe y el
 * siguiente mata—. Escalarla dejaría el casco en papel con unas armas y en muro
 * con otras. Desde la vuelta 78 la condición **sale del número y no del
 * nombre**, y así cubre también la zona única de la Clásica y el Cono, que
 * valen lo mismo por el mismo motivo: son el blanco entero.
 *
 * Sin `weaponKey`, o con un arma que no declara el campo, vale 1: las tres de
 * siempre no cambian ni un punto.
 */
export function zoneDamage(zone, weaponKey = null) {
  const base = ZONES[zone]?.damage ?? 0
  if (base >= TARGET.maxHealth) return base
  return base * (WEAPONS[weaponKey]?.damageScale ?? 1)
}
