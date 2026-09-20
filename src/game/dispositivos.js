/**
 * **El destello de usar un dispositivo** (vuelta 82).
 *
 * Desde esta vuelta es **norma permanente**: un dispositivo nace con su sonido
 * y con su efecto visual de uso, decididos al construirlo y no añadidos
 * después. El motivo es el mismo que llevó a dibujar una marca sobre cada losa
 * en la vuelta 80 —en un juego sin texturas ni luces, lo que no se dibuja no
 * existe— llevado un paso más allá: la marca dice *qué es* esto, y el destello
 * dice *que acaba de pasar*. Sin lo segundo, pisar una plataforma de rebote y
 * saltar por tu cuenta se ven exactamente igual.
 *
 * **Un `InstancedMesh` y nada más**, que es el patrón de `impacts.js`: una
 * geometría, un material y una malla para todo el pool. Encender un destello es
 * escribir una matriz y un color, y apagarse es que ese color baje a negro —con
 * mezcla aditiva, negro **es** invisible—. Cero alocaciones por uso y por
 * frame.
 *
 * **Y lo que distingue los cuatro gestos es la forma, no el color** (la regla
 * de la vuelta 67, y la de la 80 para el azul eléctrico):
 *
 * - **Rebote**: un anillo tumbado que **se abre y sube**. Es la onda del
 *   muelle soltándose.
 * - **Velocidad**: un anillo **de pie**, encarado al rumbo de lanzamiento, que
 *   se estrecha y **sale disparado hacia donde lanza**. Se lee como haber
 *   pasado por un aro.
 * - **Puerta, al entrar**: un anillo tumbado que **se cierra sobre sí mismo**.
 * - **Ventilador**: un anillo tumbado que **sube rápido y se abre poco**. Se
 *   distingue del rebote en que el rebote es un golpe —se abre mucho y se
 *   queda— y esto es una corriente: sube atravesándote.
 * - **Hielo**: un anillo **bajo y ancho** a los pies, que se abre y no sube.
 *   Es la nube de un derrape, y no compite con nada: los otros tres suben.
 * - **Tirolina**: un anillo **de pie** que se estrecha y sale por el cable, o
 *   sea el de la plataforma de velocidad más apretado. Que se parezcan es
 *   correcto y es la idea: las dos te lanzan, y lo que las separa es que una
 *   lanza al vacío y la otra por un raíl — que es lo que dice el cable, no el
 *   anillo. El **traqueteo** de ir viajando no enciende ninguno: sólo suena, o
 *   un viaje de cinco segundos serían veinticinco aros.
 * - **Puerta, al salir**: el mismo, **al revés**. Los dos extremos de un
 *   teletransporte se dibujan a propósito con el mismo gesto invertido: es lo
 *   que hace que llegar se lea como la otra mitad de haber entrado.
 *
 * Igual que la marca, esto **no es geometría del mapa**: fuera de `occluders`,
 * fuera del presupuesto y sin que ningún rayo le pregunte nada.
 */

import * as THREE from 'three'
import { COLORS, SURFACES } from '../config.js'

/** Temporales de módulo: el bucle caliente no asigna. */
const _dummy = new THREE.Object3D()
const _color = new THREE.Color()
const _base = new THREE.Color()
const _mira = new THREE.Vector3()

/** Los cuatro gestos, por su nombre. El quinto sería una entrada más aquí. */
const GESTOS = {
  rebote: { clave: 'rebote', dePie: false },
  velocidad: { clave: 'velocidad', dePie: true, alza: 0.9 },
  ventilador: { clave: 'ventilador', dePie: false },
  hielo: { clave: 'hielo', dePie: false },
  // `alza` cero: el punto que manda la tirolina **es** el del cable, que ya
  // está en el aire. Los 0.9 de la plataforma son para subir el aro desde el
  // suelo hasta la cintura, y aquí no hay suelo del que subir.
  tirolina: { clave: 'tirolina', dePie: true, alza: 0 },
  'tp-entrada': { clave: 'tpEntrada', dePie: false },
  'tp-salida': { clave: 'tpSalida', dePie: false },
}

export class Dispositivos {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene
    /** @type {THREE.InstancedMesh | null} */
    this.mesh = null
    const pool = SURFACES.destello.pool
    /** Cuándo se encendió cada ranura, en tiempo de juego. 0 = apagada. */
    this.desde = new Float64Array(pool)
    /** Qué gesto es cada ranura, como índice en `_gestos`. */
    this.gesto = new Int8Array(pool)
    /** Origen y dirección de cada una, en tres arrays planos para no alocar. */
    this.origen = new Float32Array(pool * 3)
    this.direccion = new Float32Array(pool * 3)
    this._gestos = Object.values(GESTOS)
    this._next = 0
    this.vivas = 0
    /** Cuántos destellos se han encendido. Lo miran los bancos. */
    this.usos = 0
  }

  /** Monta el pool. Idempotente. */
  build() {
    if (this.mesh) return
    const pool = SURFACES.destello.pool
    // Un anillo fino, en el plano XY y mirando a +Z: tumbarlo o ponerlo de pie
    // es sólo cómo se oriente cada instancia.
    const geometry = new THREE.RingGeometry(0.74, 1, 28)
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, pool)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    _color.set(0, 0, 0)
    _dummy.scale.set(0, 0, 0)
    _dummy.position.set(0, 0, 0)
    _dummy.quaternion.identity()
    _dummy.updateMatrix()
    for (let i = 0; i < pool; i++) {
      mesh.setMatrixAt(i, _dummy.matrix)
      mesh.setColorAt(i, _color)
    }
    this.scene.add(mesh)
    this.mesh = mesh
  }

  /**
   * Enciende el destello de un uso.
   *
   * @param {'rebote'|'velocidad'|'tp-entrada'|'tp-salida'} tipo
   * @param {number} x @param {number} y @param {number} z dónde ha pasado
   * @param {number} rumbo hacia dónde, para el que lo necesita
   * @param {number} now reloj del mundo (`engine.gameTime`)
   */
  emitir(tipo, x, y, z, rumbo, now) {
    if (!this.mesh) return
    const gesto = GESTOS[tipo]
    if (!gesto) return
    const pool = SURFACES.destello.pool
    const i = this._next
    this._next = (this._next + 1) % pool
    if (this.desde[i] === 0) this.vivas += 1
    this.desde[i] = now
    this.gesto[i] = this._gestos.indexOf(gesto)
    this.usos += 1

    this.origen[i * 3] = x
    this.origen[i * 3 + 1] = y
    this.origen[i * 3 + 2] = z
    // Rumbo de cámara: mira a −Z con yaw 0, así que la dirección es
    // (−sin, −cos). La misma conversión que dibuja su galón.
    this.direccion[i * 3] = -Math.sin(rumbo)
    this.direccion[i * 3 + 1] = 0
    this.direccion[i * 3 + 2] = -Math.cos(rumbo)
    this._colocar(i, 0)
    this._pintar(i, 1)
  }

  /**
   * Mueve los vivos y apaga los cumplidos.
   *
   * Va con el **reloj del mundo**, como todo lo temporizado del motor: en pausa
   * un destello se queda quieto en vez de consumirse a espaldas del jugador.
   */
  update(now) {
    if (!this.mesh || this.vivas === 0) return
    const vida = SURFACES.destello.duracionMs
    let tocado = false
    for (let i = 0; i < this.desde.length; i++) {
      const desde = this.desde[i]
      if (desde === 0) continue
      const t = (now - desde) / vida
      if (t >= 1 || t < 0) {
        this.desde[i] = 0
        this.vivas -= 1
        this._pintar(i, 0)
        this._colocar(i, 1, true)
        tocado = true
        continue
      }
      this._colocar(i, t)
      this._pintar(i, 1 - t)
      tocado = true
    }
    if (tocado) {
      this.mesh.instanceMatrix.needsUpdate = true
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    }
  }

  /** Dónde y de qué tamaño va una ranura en el instante `t` de su vida (0..1). */
  _colocar(i, t, apagar = false) {
    const gesto = this._gestos[this.gesto[i]]
    const cfg = SURFACES.destello[gesto.clave]
    const r = cfg.r0 + (cfg.r1 - cfg.r0) * t
    const ox = this.origen[i * 3]
    const oy = this.origen[i * 3 + 1]
    const oz = this.origen[i * 3 + 2]

    if (gesto.dePie) {
      // De pie y encarado al rumbo: el anillo viaja hacia donde lanza.
      const dx = this.direccion[i * 3]
      const dz = this.direccion[i * 3 + 2]
      const avance = cfg.avanza * t
      _dummy.position.set(ox + dx * avance, oy + (gesto.alza ?? 0), oz + dz * avance)
      _mira.set(_dummy.position.x + dx, _dummy.position.y, _dummy.position.z + dz)
      _dummy.lookAt(_mira)
    } else {
      _dummy.position.set(ox, oy + (cfg.sube ?? 0) * t, oz)
      // Tumbado: el anillo nace mirando a +Z, así que se acuesta sobre el suelo.
      _dummy.rotation.set(-Math.PI / 2, 0, 0)
      _dummy.quaternion.setFromEuler(_dummy.rotation)
    }
    _dummy.scale.setScalar(apagar ? 0 : r)
    _dummy.updateMatrix()
    this.mesh.setMatrixAt(i, _dummy.matrix)
  }

  /** El brillo. Se apaga bajando a negro, que con mezcla aditiva es invisible. */
  _pintar(i, vida) {
    _base.set(COLORS.electric)
    _color.copy(_base).multiplyScalar(vida <= 0 ? 0 : vida)
    this.mesh.setColorAt(i, _color)
  }

  /** Apaga todos sin destruir el pool: al empezar sesión o cambiar de mapa. */
  clear() {
    if (!this.mesh) return
    for (let i = 0; i < this.desde.length; i++) {
      if (this.desde[i] === 0) continue
      this.desde[i] = 0
      this._pintar(i, 0)
      this._colocar(i, 1, true)
    }
    this.vivas = 0
    this.mesh.instanceMatrix.needsUpdate = true
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
