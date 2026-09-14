/**
 * **Los muñecos disparan.**
 *
 * Sólo con escenario montado y muñecos de hitbox completo: sin cobertura no
 * habría dónde meterse, y una esfera flotante no tiene con qué disparar.
 *
 * Lo que hace, por muñeco vivo y en este orden, porque cada paso puede cortar
 * el siguiente:
 *
 *  1. **Distancia.** Una resta, no un rayo. Fuera de `ENEMY.engageRange` no hay
 *     nada más que mirar.
 *  2. **Línea de visión.** Un raycast contra toda la geometría del escenario, y
 *     por eso **no es por frame**: se recomprueba cada `ENEMY.sightCheckMs` y se
 *     reparte entre muñecos, para que ocho no la comprueben en el mismo. Es la
 *     misma regla que la visibilidad de los puntos de aparición.
 *  3. **Reacción.** Desde que te ve hasta que abre fuego pasa el `reactionMs`
 *     del nivel de dificultad elegido.
 *     Perderte de vista lo reinicia: asomarse y volver a cubrirse funciona.
 *  4. **Cadencia.** La del arma, con el **mismo cálculo que el jugador**: el
 *     siguiente disparo se cuenta desde el instante en que tocaba éste, no desde
 *     el frame en que ha salido. Un muñeco a 600 RPM dispara igual a 60 que a
 *     240 Hz.
 *
 * El disparo se resuelve **analíticamente** contra el cuerpo del jugador (ver
 * `player.js`): una dirección desviada dentro del cono de la dificultad y un
 * corte contra el cilindro. Ni un raycast más por bala.
 *
 * No sabe de vida ni de escudo: avisa por callback de dónde ha dado y con qué
 * arma, y quien lleva la cuenta decide.
 *
 * **Y publica en qué estado está cada muñeco** (`phaseOf`), que es lo que leen
 * los marcadores de `markers.js`. Es un dato que este módulo ya tiene —hay
 * visión, ha pasado la reacción— y calcularlo otra vez fuera sería una segunda
 * versión de la misma máquina de estados.
 */

import * as THREE from 'three'
import {
  AUDIO,
  ENEMY,
  ENEMY_DEFAULT_DIFFICULTY,
  ENEMY_DIFFICULTIES,
  TARGET,
  TARGET_TYPES,
  WEAPONS,
} from '../config.js'
import { playWeaponShot } from '../audio/samples.js'
import { playBulletWhizz } from '../audio/sfx.js'
import { createEmitter } from '../audio/spatial.js'
import { aimPoint, hitPlayer, zoneDamage } from './player.js'

const DEG_TO_RAD = Math.PI / 180

// Vectores de módulo: el bucle no aloca.
const _muzzle = new THREE.Vector3()
const _aim = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _u = new THREE.Vector3()
const _v = new THREE.Vector3()
/** Punto de máxima aproximación de una bala al oído del jugador. */
const _near = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _fallback = new THREE.Vector3(1, 0, 0)

/** Altura total del muñeco en unidades de su radio, para colocar la boca del arma. */
const DUMMY_HEIGHT = TARGET_TYPES.hitbox.parts.reduce(
  (top, part) => Math.max(top, part.offsetY + (part.height ?? part.radius * 2) / 2),
  0,
)

/**
 * Desvía una dirección dentro de un cono. Es la misma construcción que usa la
 * dispersión del jugador en `engine.js`; aquí el ángulo lo pone la dificultad.
 */
function applySpread(direction, spreadDeg) {
  const theta = Math.random() * spreadDeg * DEG_TO_RAD
  if (theta <= 0) return
  const phi = Math.random() * Math.PI * 2
  const reference = Math.abs(direction.y) > 0.99 ? _fallback : _up
  _u.crossVectors(reference, direction).normalize()
  _v.crossVectors(direction, _u).normalize()
  const sin = Math.sin(theta)
  direction
    .multiplyScalar(Math.cos(theta))
    .addScaledVector(_u, sin * Math.cos(phi))
    .addScaledVector(_v, sin * Math.sin(phi))
    .normalize()
}

export class EnemyFire {
  /**
   * @param {THREE.Scene} scene dónde cuelgan los emisores de sonido
   * @param {(hit: {zone: string, damage: number, weaponKey: string,
   *   fromX: number, fromY: number, fromZ: number}) => void} onHit
   * @param {(x: number, y: number, z: number, now: number) => void} [onShot] cada
   *   disparo que sale, con la boca del arma. Lo pinta quien quiera —hoy el
   *   fogonazo— y este módulo no sabe qué se hace con ello.
   */
  constructor(scene, onHit, onShot = null) {
    this.scene = scene
    this.onHit = onHit
    this.onShot = onShot
    this.enabled = false
    this.occluders = []
    /** Estado por muñeco. El pool es fijo, así que el Map no crece sin fin. */
    this._states = new Map()
    this._ray = new THREE.Raycaster()
    /** Disparos que han entrado en esta sesión. Sólo para medir. */
    this.shotsFired = 0
    this.shotsHit = 0
    /** Y cuántos han fallado pasando lo bastante cerca como para oírse. */
    this.whizzes = 0
    /** Rayos de silbido que quedan en este frame. Ver `ENEMY.whizz.raysPerFrame`. */
    this._whizzBudget = ENEMY.whizz.raysPerFrame
    /** Radio con el que están dibujados los muñecos. Lo refresca `setRadius`. */
    this._radius = TARGET.radius
    /** Nivel de dificultad vigente. Lo pone el ajuste, no la constante. */
    this.difficultyKey = ENEMY_DEFAULT_DIFFICULTY
  }

  /** El arma con la que disparan, tal cual la declara `WEAPONS`. */
  get weapon() {
    return WEAPONS[ENEMY.weapon]
  }

  /**
   * El nivel de dificultad vigente. Sale del ajuste y **no de `ENEMY`**: los dos
   * números van juntos (ver `ENEMY_DIFFICULTIES`) y quien los elige es el panel.
   */
  get difficulty() {
    return ENEMY_DIFFICULTIES[this.difficultyKey] ?? ENEMY_DIFFICULTIES.normal
  }

  /** @param {string} key una clave de `ENEMY_DIFFICULTIES` */
  setDifficulty(key) {
    this.difficultyKey = key
  }

  /**
   * **En qué anda un muñeco ahora mismo**, para quien lo quiera enseñar:
   *
   * - `'idle'` — ni te ve ni te tiene encarado.
   * - `'alert'` — te ve y está en su ventana de reacción: aún no dispara.
   * - `'firing'` — te ve y ya ha abierto fuego. Incluye las pausas de ráfaga y
   *   la recarga: sigue encarado y el siguiente tiro va a salir.
   *
   * Sale del estado que este módulo ya lleva, no de una segunda cuenta.
   */
  phaseOf(instance, now) {
    if (!this.enabled) return 'idle'
    const state = this._states.get(instance)
    if (!state || !state.hasSight) return 'idle'
    return state.reacting ? 'alert' : 'firing'
  }

  setOccluders(occluders) {
    this.occluders = occluders || []
  }

  /**
   * @param {boolean} value sólo se enciende con escenario y hitbox completo
   */
  setEnabled(value) {
    this.enabled = Boolean(value)
  }

  /** Arranca una sesión: todo el mundo sin contacto y con el cargador lleno. */
  begin() {
    this.shotsFired = 0
    this.shotsHit = 0
    this.whizzes = 0
    for (const state of this._states.values()) this._resetState(state)
  }

  _resetState(state) {
    state.hasSight = false
    // Te ve y todavía no ha disparado. Se apaga en cuanto sale el primer tiro,
    // así que no hay que deducirlo de los relojes desde fuera.
    state.reacting = false
    state.nextShotAt = 0
    state.burst = 0
    state.ammo = this.weapon.magazine
    // La primera comprobación se reparte al azar: sin esto, ocho muñecos que
    // aparecen juntos lanzan sus ocho rayos en el mismo frame para siempre.
    state.nextSightAt = 0
  }

  _stateFor(instance, now) {
    let state = this._states.get(instance)
    if (!state) {
      // Dos emisores y no uno: el disparo suena en la boca del arma y el
      // silbido, si lo hay, al lado del oído. Con uno solo, colocarlo para el
      // segundo movería el primero mientras suena.
      state = { emitter: createEmitter(this.scene), whizzEmitter: createEmitter(this.scene) }
      this._resetState(state)
      state.nextSightAt = now + Math.random() * ENEMY.sightCheckMs
      this._states.set(instance, state)
    }
    return state
  }

  /**
   * Avance por frame. `body` es el cuerpo del jugador (ver `playerBody`), o null
   * si está muerto: un muñeco no dispara a quien está esperando reaparecer.
   *
   * @param {Array<object>} instances el pool de dianas, tal cual
   */
  update(now, instances, body) {
    // Sin jugador al que disparar —abatido, o el combate apagado— nadie tiene
    // contacto. Se limpia en vez de salir sin más: si no, los marcadores se
    // quedarían encendidos sobre muñecos que ya no apuntan a nadie.
    if (!this.enabled || !body) {
      for (const state of this._states.values()) {
        state.hasSight = false
        state.reacting = false
      }
      return
    }
    const weapon = this.weapon
    const intervalMs = 60000 / weapon.rpm
    /** Presupuesto de rayos de este frame. Ver `ENEMY.sightChecksPerFrame`. */
    let sightBudget = ENEMY.sightChecksPerFrame
    // El de los silbidos va aparte y se reparte igual: son dos rayos distintos
    // con dos motivos distintos, y uno no se puede comer el presupuesto del otro.
    this._whizzBudget = ENEMY.whizz.raysPerFrame

    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i]
      if (instance.state !== 'alive') continue

      const position = instance.group.position
      const dx = body.x - position.x
      const dz = body.z - position.z
      const flat = Math.hypot(dx, dz)
      const state = this._stateFor(instance, now)

      if (flat > ENEMY.engageRange) {
        state.hasSight = false
        state.reacting = false
        continue
      }

      // Boca del arma: a la altura del pecho del muñeco, no en sus pies.
      _muzzle.set(position.x, position.y + DUMMY_HEIGHT * this._radius * ENEMY.muzzleHeightFactor, position.z)
      aimPoint(body, ENEMY.aimHeightFactor, _aim)

      // Al que le toca mirar y no le queda presupuesto se queda con lo que
      // sabía y lo mira en el frame siguiente: su reloj **no** se reengancha,
      // así que nadie pierde el turno, sólo lo retrasa un frame.
      if (now >= state.nextSightAt && sightBudget > 0) {
        sightBudget -= 1
        state.nextSightAt = now + ENEMY.sightCheckMs
        const sees = this._canSee(_muzzle, _aim)
        if (sees && !state.hasSight) {
          // Te acaba de ver: el reloj de reacción empieza aquí.
          state.nextShotAt = now + this.difficulty.reactionMs
          state.burst = 0
          state.reacting = true
        }
        state.hasSight = sees
        if (!sees) state.reacting = false
      }
      // Mientras te vea, te encara. Sólo escribe **hacia dónde quiere mirar**:
      // quien gira es el integrador de `targets.js`, para que haya un solo sitio
      // donde la orientación avanza y no dos que se peleen por ella.
      if (state.hasSight) instance.facingTarget = Math.atan2(dx, dz)
      if (!state.hasSight) continue
      if (now < state.nextShotAt) continue

      // Igual que el jugador: el siguiente se cuenta desde el momento en que
      // éste tocaba. Si vamos más de un intervalo tarde, se reancla.
      const scheduled = now - state.nextShotAt > intervalMs ? now : state.nextShotAt
      state.nextShotAt = scheduled + intervalMs
      this._fire(now, state, _muzzle, _aim, body, weapon)
    }
  }

  /** El radio con el que están dibujados los muñecos ahora mismo. */
  setRadius(radius) {
    this._radius = radius
  }

  _canSee(from, to) {
    if (this.occluders.length === 0) return true
    _dir.subVectors(to, from)
    const distance = _dir.length()
    if (distance <= 1e-4) return true
    _dir.multiplyScalar(1 / distance)
    this._ray.set(from, _dir)
    this._ray.near = 0
    this._ray.far = distance - 0.1
    const blockers = this._ray.intersectObjects(this.occluders, false)
    this._ray.far = Infinity
    return blockers.length === 0
  }

  /** ¿Hay geometría del escenario antes del impacto? */
  _blocked(origin, direction, distance) {
    if (this.occluders.length === 0) return false
    this._ray.set(origin, direction)
    this._ray.near = 0
    this._ray.far = distance
    const blockers = this._ray.intersectObjects(this.occluders, false)
    this._ray.far = Infinity
    return blockers.length > 0
  }

  _fire(now, state, muzzle, aim, body, weapon) {
    state.reacting = false
    _dir.subVectors(aim, muzzle)
    const distance = _dir.length()
    if (distance <= 1e-4) return
    _dir.multiplyScalar(1 / distance)
    applySpread(_dir, this.difficulty.spreadDeg)

    state.emitter.setPosition(muzzle.x, muzzle.y, muzzle.z)
    // Mismo camino que el disparo del jugador: si el arma de los muñecos tiene
    // muestra grabada, suena la muestra, y si no, la síntesis.
    playWeaponShot(ENEMY.weapon, false, state.emitter, AUDIO.enemyShotVolume)
    // Que ha salido un tiro, y de dónde. Lo pinta quien quiera —hoy el fogonazo
    // de `muzzleFlash.js`— y aquí no se sabe qué se hace con ello.
    //
    // **El punto que se publica va un palmo por delante del pecho**, en la
    // dirección del disparo, y no en el eje del cuerpo: lo que sale del eje se
    // dibuja dentro del muñeco y lo tapa su propia malla. La bala sigue saliendo
    // de donde salía; esto es sólo dónde se ve el destello.
    const front = DUMMY_HEIGHT * this._radius * ENEMY.muzzleForwardFactor
    this.onShot?.(
      muzzle.x + _dir.x * front,
      muzzle.y + _dir.y * front,
      muzzle.z + _dir.z * front,
      now,
    )
    this.shotsFired += 1

    // El corte contra el cilindro decide **en qué zona** entra el disparo; lo que
    // decide si entra de verdad es que no haya cobertura por delante. Es el
    // mismo `_isBlockedByCover` que ya se le aplica al disparo del jugador, y
    // hace falta porque la línea de visión se recomprueba cada `sightCheckMs`:
    // sin esto, meterse detrás de la Espina no te libra de las balas que ya
    // venían de camino. Cuesta un rayo por disparo **que acierta**, no por
    // disparo.
    const hit = hitPlayer(muzzle, _dir, body, distance + body.radius * 2)
    if (hit && !this._blocked(muzzle, _dir, hit.distance)) {
      this.shotsHit += 1
      // La cabeza no se escala: vale 100 y mata, que es de lo que depende la
      // regla del casco. El cuerpo sí, porque el jugador cruza el mapa bajo
      // fuego de varios a la vez.
      const base = zoneDamage(hit.zone)
      const damage = hit.zone === 'head' ? base : base * ENEMY.bodyDamageScale
      // **Y de dónde vino.** Sin esto, recibir un disparo sólo dice que te han
      // dado; el indicador direccional necesita el punto, y va en tres números
      // sueltos y no en el vector, que es de módulo y se reescribe en el
      // siguiente disparo.
      this.onHit({
        zone: hit.zone,
        damage,
        weaponKey: ENEMY.weapon,
        fromX: muzzle.x,
        fromY: muzzle.y,
        fromZ: muzzle.z,
      })
    } else if (!hit) {
      // Ni ha dado ni la ha parado la cobertura: puede que te haya rozado.
      this._maybeWhizz(state, muzzle, body, distance)
    }

    // Cargador y ráfaga: lo que evita que un arma automática vacíe los treinta
    // tiros de una sentada y no deje hueco para responder.
    state.ammo -= 1
    if (state.ammo <= 0) {
      state.ammo = weapon.magazine
      state.nextShotAt = Math.max(state.nextShotAt, now + weapon.reloadMs)
      state.burst = 0
      return
    }
    state.burst += 1
    if (state.burst >= ENEMY.burstShots) {
      state.burst = 0
      state.nextShotAt += ENEMY.burstPauseMs
    }
  }

  /**
   * **El silbido de la que ha fallado por poco.**
   *
   * Se mide la distancia de la trayectoria **al oído** —el centro de la banda de
   * la cabeza, que es donde están— y no al cuerpo: lo que se modela es el
   * chasquido al pasar, y eso se oye donde se oye. Si pasa dentro de
   * `ENEMY.whizz.radius`, el emisor va al **punto de máxima aproximación**, que
   * es por donde pasó de verdad: de ahí sale la dirección, que es toda la
   * información que da este sonido.
   *
   * Tres cosas que lo cortan antes de sonar, y las tres son la misma idea —que
   * esa bala no te ha pasado cerca—:
   *
   *  - **Por detrás no**: si el punto más próximo cae detrás de la boca del arma
   *    (`t <= 0`), el disparo se alejaba desde el primer metro.
   *  - **De cerca no** (`minShooterDistance`): a bocajarro el propio disparo ya
   *    dice de dónde viene, y el punto de aproximación cae casi en la cámara.
   *  - **Y si la para una caja, no**. Cuesta un rayo, y por eso va el último:
   *    sólo lo pagan las que han pasado las otras dos, que son pocas. Y ese rayo
   *    va con presupuesto por frame (`ENEMY.whizz.raysPerFrame`), como el de la
   *    visión: pasado el tope se pierde **un silbido**, no una bala.
   */
  _maybeWhizz(state, muzzle, body, shooterDistance) {
    if (shooterDistance < ENEMY.whizz.minShooterDistance) return
    const earY = (body.torsoTop + body.top) / 2
    const ox = body.x - muzzle.x
    const oy = earY - muzzle.y
    const oz = body.z - muzzle.z
    const t = ox * _dir.x + oy * _dir.y + oz * _dir.z
    if (t <= 0) return
    const px = ox - _dir.x * t
    const py = oy - _dir.y * t
    const pz = oz - _dir.z * t
    if (px * px + py * py + pz * pz > ENEMY.whizz.radius * ENEMY.whizz.radius) return
    if (this._whizzBudget <= 0) return
    this._whizzBudget -= 1
    if (this._blocked(muzzle, _dir, t)) return

    _near.copy(_dir).multiplyScalar(t).add(muzzle)
    state.whizzEmitter.setPosition(_near.x, _near.y, _near.z)
    playBulletWhizz(state.whizzEmitter, AUDIO.whizzVolume)
    this.whizzes += 1
  }

  dispose() {
    for (const state of this._states.values()) {
      state.emitter.dispose()
      state.whizzEmitter.dispose()
    }
    this._states.clear()
  }
}
