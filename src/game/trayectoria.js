/**
 * **La curva que va a seguir el proyectil, dibujada antes de soltarlo**
 * (vuelta 85).
 *
 * Es la convención de la vuelta 78 —«todo lo configurable se coloca viendo el
 * efecto»— aplicada por primera vez **dentro de la partida**. Un arma de tiro
 * curvo sin la curva delante es un arma que se aprende fallando: «32 u/s a 18
 * grados» no dice *dónde cae* hasta que se prueba, que es exactamente la
 * barrera que aquella vuelta vino a quitar del editor.
 *
 * Tres reglas, y ninguna es decoración:
 *
 * - **Sale de la misma fórmula que el vuelo.** `puntoDeVuelo`, la de
 *   `proyectiles.js`, evaluada en `TRAJECTORY.puntos` instantes. No es una
 *   aproximación de la trayectoria: **es** la trayectoria, muestreada. Una
 *   segunda fórmula aquí sería una mira que promete un sitio y un proyectil
 *   que va a otro, que es el fallo de la vuelta 67 con un arma en la mano.
 * - **Se corta donde el proyectil chocaría**, con el mismo `cortarSegmento`
 *   que usa el vuelo. Una curva que atraviesa una pared dice que se puede
 *   disparar a través de ella.
 * - **Y la carga se lee en la propia curva.** La luz que sube por el láser
 *   **es** el indicador de potencia: llega a la punta y ahí se queda, y eso es
 *   la señal de carga completa. Una barra en el HUD habría sido un segundo
 *   sitio donde mirar justo cuando hay que estar mirando al rival.
 *
 * Como todo lo que dibuja el motor y no es geometría del mapa: **fuera de
 * `occluders`**, fuera del presupuesto de colisión y sin que ningún rayo le
 * pregunte nada.
 */

import * as THREE from 'three'
import { COLORS, TRAJECTORY } from '../config.js'
import { puntoDeVuelo } from './proyectiles.js'

const _p = { x: 0, y: 0, z: 0 }

export class Trayectoria {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene
    const n = TRAJECTORY.puntos
    // Dos mallas y dos materiales, y nada más: la línea entera apagada y el
    // trozo encendido que sube con la carga. Se reescriben sus posiciones por
    // frame; no se crean geometrías.
    this._pos = new Float32Array(n * 3)
    this._posCola = new Float32Array((TRAJECTORY.colaPuntos + 1) * 3)

    this.geom = new THREE.BufferGeometry()
    this.geom.setAttribute('position', new THREE.BufferAttribute(this._pos, 3))
    this.mat = new THREE.LineBasicMaterial({
      color: COLORS.dispositivo, transparent: true, opacity: 0.45, depthWrite: false,
    })
    this.linea = new THREE.Line(this.geom, this.mat)
    this.linea.frustumCulled = false
    this.linea.visible = false

    this.geomCola = new THREE.BufferGeometry()
    this.geomCola.setAttribute('position', new THREE.BufferAttribute(this._posCola, 3))
    this.matCola = new THREE.LineBasicMaterial({
      color: COLORS.dispositivo, transparent: true, opacity: 1, depthWrite: false,
    })
    this.cola = new THREE.Line(this.geomCola, this.matCola)
    this.cola.frustumCulled = false
    this.cola.visible = false

    // El punto de caída: un anillo tumbado donde acaba la curva. Es lo que se
    // mira de verdad al apuntar — la curva dice *cómo* llega y esto *dónde*.
    this.geomAro = new THREE.BufferGeometry()
    const lados = 18
    const aro = new Float32Array((lados + 1) * 3)
    for (let i = 0; i <= lados; i++) {
      const a = (i / lados) * Math.PI * 2
      aro[i * 3] = Math.cos(a) * TRAJECTORY.radioDeCaida
      aro[i * 3 + 1] = 0
      aro[i * 3 + 2] = Math.sin(a) * TRAJECTORY.radioDeCaida
    }
    this.geomAro.setAttribute('position', new THREE.BufferAttribute(aro, 3))
    this.matAro = new THREE.LineBasicMaterial({ color: COLORS.dispositivo, transparent: true, opacity: 0.9 })
    this.aro = new THREE.Line(this.geomAro, this.matAro)
    this.aro.frustumCulled = false
    this.aro.visible = false

    scene.add(this.linea)
    scene.add(this.cola)
    scene.add(this.aro)
  }

  /** Se apaga sin borrar nada: lo que vale cero no se recalcula. */
  ocultar() {
    this.linea.visible = false
    this.cola.visible = false
    this.aro.visible = false
  }

  /**
   * **Dibuja la curva de este instante.**
   *
   * @param {object} origen de dónde sale, `{x,y,z}`
   * @param {object} v velocidad de salida, `{x,y,z}`
   * @param {number} g la gravedad del proyectil
   * @param {number} carga 0..1, que es lo que sube la luz
   * @param {(x0,y0,z0,x1,y1,z1)=>object|null} cortar contra la geometría
   * @param {object} desvio de cuánto se separa el **dibujo** del arranque real,
   *   en coordenadas de mundo. Decae a cero en `TRAJECTORY.convergeEn` puntos,
   *   así que el punto de caída —que es lo que se apunta— no se mueve.
   */
  dibujar(origen, v, g, carga, cortar, desvio) {
    const n = TRAJECTORY.puntos
    const paso = TRAJECTORY.segundosMax / (n - 1)
    const conv = Math.max(1, TRAJECTORY.convergeEn)
    let ultimo = n - 1
    // El recorrido **real**, que es contra el que se corta: lo que el desvío
    // mueve es sólo dónde se pinta cada punto.
    let px = origen.x, py = origen.y, pz = origen.z
    let cortado = false

    /** El punto `i` con el desvío que le toque, que decae a cero en `conv`. */
    const pintar = (i, x, y, z) => {
      const k = i >= conv ? 0 : 1 - i / conv
      this._pos[i * 3] = x + desvio.x * k
      this._pos[i * 3 + 1] = y + desvio.y * k
      this._pos[i * 3 + 2] = z + desvio.z * k
    }
    pintar(0, px, py, pz)

    for (let i = 1; i < n; i++) {
      const q = puntoDeVuelo(origen.x, origen.y, origen.z, v.x, v.y, v.z, g, paso * i, _p)
      const corte = cortar ? cortar(px, py, pz, q.x, q.y, q.z) : null
      if (corte) {
        // La curva se acaba donde el proyectil se acabaría, y el resto de los
        // puntos se apilan ahí: una línea de buffer fijo no puede encogerse,
        // así que lo que sobra se dibuja de largo cero.
        for (let k = i; k < n; k++) pintar(k, corte.x, corte.y, corte.z)
        px = corte.x; py = corte.y; pz = corte.z
        ultimo = i
        cortado = true
        break
      }
      pintar(i, q.x, q.y, q.z)
      px = q.x; py = q.y; pz = q.z
    }
    if (!cortado) ultimo = n - 1
    this.geom.attributes.position.needsUpdate = true
    this.geom.computeBoundingSphere()
    this.linea.visible = true

    /**
     * **La luz que sube.** Su punta recorre la curva con la carga, así que a
     * cero está pegada al jugador y a uno toca el punto de caída. No es una
     * barra: es la misma línea, encendida.
     */
    const cola = TRAJECTORY.colaPuntos
    const punta = Math.max(0, Math.min(ultimo, Math.round(carga * ultimo)))
    const desde = Math.max(0, punta - cola)
    for (let k = 0; k <= cola; k++) {
      const idx = Math.min(ultimo, desde + k)
      this._posCola[k * 3] = this._pos[idx * 3]
      this._posCola[k * 3 + 1] = this._pos[idx * 3 + 1]
      this._posCola[k * 3 + 2] = this._pos[idx * 3 + 2]
    }
    this.geomCola.attributes.position.needsUpdate = true
    this.geomCola.computeBoundingSphere()
    this.cola.visible = true

    this.aro.position.set(px, py + 0.02, pz)
    this.aro.visible = true
  }

  dispose() {
    this.scene.remove(this.linea)
    this.scene.remove(this.cola)
    this.scene.remove(this.aro)
    this.geom.dispose()
    this.geomCola.dispose()
    this.geomAro.dispose()
    this.mat.dispose()
    this.matCola.dispose()
    this.matAro.dispose()
  }
}
