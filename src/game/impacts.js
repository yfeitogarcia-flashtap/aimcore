/**
 * **La marca de una bala en una superficie.**
 *
 * Es el único aviso que dice **dónde ha ido a parar** un disparo que no dio: la
 * mira dice *que* has fallado, y esto dice *por dónde*. Sin él, tirar contra una
 * pared y tirar al aire se ven exactamente igual, y no hay forma de corregir.
 *
 * **Vive en el motor y no en el duelo**, que es la convención de la vuelta 63:
 * lo que se construye para el 1v1 se construye una vez y sale igual en los dos
 * modos. Aquí el disparo contra la cobertura del Plano A deja la misma marca
 * entrenando contra muñecos que jugando contra una persona, porque es el mismo
 * objeto llamado desde el mismo sitio (`engine._shoot`).
 *
 * **No es una luz ni una calcomanía.** En esta escena no hay ni una luz, así que
 * una marca oscura sobre una caja gris no se vería; y una calcomanía de verdad
 * —textura, proyección, recorte contra la geometría— es justo lo que este
 * proyecto no tiene (cero assets, y el presupuesto de frame no admite recortar
 * mallas). Lo que hay es **la misma estrella aditiva del fogonazo**, encarada a
 * la superficie en vez de a la cámara: los dos extremos de la misma bala se
 * dibujan con la misma silueta a propósito.
 *
 * **Un `InstancedMesh` y nada más.** Una geometría, un material y una malla para
 * todo el pool; encender una marca es escribir una matriz y un color, y
 * apagarse es que ese color baje a negro —con mezcla aditiva, negro **es**
 * invisible—. Así el desvanecido no necesita un material por ranura, que es lo
 * que habría hecho falta para bajar la opacidad una a una. Cero alocaciones por
 * disparo y por frame.
 */

import * as THREE from 'three'
import { COLORS, IMPACTS } from '../config.js'
import { flashStarGeometry } from './muzzleFlash.js'

/** Temporales de módulo: el bucle caliente no asigna. */
const _dummy = new THREE.Object3D()
const _color = new THREE.Color()
const _base = new THREE.Color()
const _mira = new THREE.Vector3()

export class Impacts {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene
    /** @type {THREE.InstancedMesh | null} */
    this.mesh = null
    /** Cuándo se encendió cada ranura, en tiempo de juego. 0 = apagada. */
    this.desde = new Float64Array(IMPACTS.pool)
    this._next = 0
    this.vivas = 0
    /** Cuántas marcas se han encendido. Lo miran los bancos. */
    this.marcas = 0
  }

  /** Monta el pool. Idempotente: se llama al construir el motor y ya está. */
  build() {
    if (this.mesh) return
    const geometry = flashStarGeometry(IMPACTS.sizeU)
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: IMPACTS.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // La marca se pinta **pegada a la cara** que ha recibido el tiro, así que
      // sin esto pierde el desempate contra ella de forma intermitente según el
      // ángulo. Es el mismo recurso que el contorno negro de la brújula, por el
      // mismo motivo y en el sentido contrario.
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, IMPACTS.pool)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    _color.set(0, 0, 0)
    _dummy.scale.set(0, 0, 0)
    _dummy.position.set(0, 0, 0)
    _dummy.quaternion.identity()
    _dummy.updateMatrix()
    for (let i = 0; i < IMPACTS.pool; i++) {
      mesh.setMatrixAt(i, _dummy.matrix)
      mesh.setColorAt(i, _color)
    }
    this.scene.add(mesh)
    this.mesh = mesh
  }

  /**
   * Enciende una marca en un punto de una superficie.
   *
   * La ranura más vieja es la que se reutiliza: con veinticuatro y una vida de
   * cuatro décimas, el arma más rápida del arsenal (800 RPM) tiene dieciocho
   * balas en el aire antes de pisar la primera, y si alguna vez se pisara, lo
   * que se pierde es la que ya se estaba apagando.
   *
   * @param {THREE.Vector3} punto dónde ha dado, en coordenadas de mundo
   * @param {THREE.Vector3} normal normal de la superficie, unitaria
   * @param {number} now reloj del mundo (`engine.gameTime`)
   */
  spawn(punto, normal, now) {
    if (!this.mesh) return
    const i = this._next
    this._next = (this._next + 1) % IMPACTS.pool
    if (this.desde[i] === 0) this.vivas += 1
    this.desde[i] = now
    this.marcas += 1

    // Un palmo por delante de la cara: pegada del todo parpadearía contra ella.
    _dummy.position.copy(normal).multiplyScalar(IMPACTS.offsetU).add(punto)
    // Encarada a la superficie, que es lo contrario del fogonazo: éste sí tiene
    // orientación propia que decir —la de la pared— y billboardearlo lo dejaría
    // flotando de frente en mitad de una caja.
    _mira.copy(_dummy.position).add(normal)
    _dummy.lookAt(_mira)
    _dummy.scale.set(1, 1, 1)
    _dummy.updateMatrix()
    this.mesh.setMatrixAt(i, _dummy.matrix)
    this.mesh.instanceMatrix.needsUpdate = true
    this._pintar(i, 1)
  }

  /**
   * Baja el brillo de las que siguen encendidas y apaga las cumplidas.
   *
   * Va con el **reloj del mundo**, como todo lo temporizado del motor: en pausa
   * una marca se queda quieta en vez de apagarse a espaldas del jugador.
   */
  update(now) {
    if (!this.mesh || this.vivas === 0) return
    let tocado = false
    for (let i = 0; i < IMPACTS.pool; i++) {
      const desde = this.desde[i]
      if (desde === 0) continue
      const t = (now - desde) / IMPACTS.lifeMs
      if (t >= 1 || t < 0) {
        this.desde[i] = 0
        this.vivas -= 1
        this._pintar(i, 0)
        tocado = true
        continue
      }
      this._pintar(i, 1 - t)
      tocado = true
    }
    if (tocado && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  /**
   * El brillo de una marca. El primer instante va **por encima del uno**
   * (`flashBoost`): una bala contra una pared es un golpe y luego un rastro, y
   * sin ese escalón las dos mitades se ven igual — un puntito que se apaga.
   */
  _pintar(i, vida) {
    _base.set(COLORS.muzzleFlash)
    const fuerza = vida <= 0 ? 0 : vida > 1 - IMPACTS.flashPart ? IMPACTS.flashBoost * vida : vida
    _color.copy(_base).multiplyScalar(fuerza)
    this.mesh.setColorAt(i, _color)
  }

  /** Apaga todas sin destruir el pool: al empezar una sesión o cambiar de mapa. */
  clear() {
    if (!this.mesh) return
    for (let i = 0; i < IMPACTS.pool; i++) {
      if (this.desde[i] === 0) continue
      this.desde[i] = 0
      this._pintar(i, 0)
    }
    this.vivas = 0
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  dispose() {
    if (!this.mesh) return
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.mesh.dispose()
    this.mesh = null
    this.vivas = 0
  }
}
