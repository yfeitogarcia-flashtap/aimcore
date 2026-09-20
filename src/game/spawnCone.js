/**
 * **El abanico de aparición, dibujado** (vuelta 78).
 *
 * Es la regla de Alchemist llevada al panel del juego: **lo que se configura se
 * ve**. «Ancho del cono de aparición: 74°» no dice nada hasta que se ha jugado
 * una ronda con ese número; el cono puesto delante lo dice antes de empezar.
 *
 * Cuatro cosas, y ninguna es de estilo:
 *
 * - **Sale de las mismas cuentas que sortean una diana.** El eje se lo pide a
 *   `Targets` (`ejeDeAparicion`), que es quien acota el cabeceo, y el rango de
 *   distancias también (`rangoDeDistancia`). Dibujarlo con una copia de la
 *   fórmula sería un dibujo que promete un sitio donde no aparece nadie, que es
 *   exactamente el fallo que este cono viene a evitar.
 * - **No es geometría del mundo.** Ni oclusor, ni colisión, ni presupuesto:
 *   `depthWrite: false` y `renderOrder` alto, como la marca de bala y el fondo.
 * - **Se rehace al cambiar, no por frame.** La apertura sólo se mueve cuando se
 *   arrastra el slider; seguir a la cámara es escribir una posición y un
 *   cuaternión, que es lo único que corre mientras está puesto.
 * - **Y se ve desde dentro.** El vértice está en la cámara, así que lo que se
 *   mira es la cara interior: `BackSide`, aditivo y flojo. Con `FrontSide` un
 *   cono con el vértice en el ojo no dibuja nada.
 */

import * as THREE from 'three'
import { COLORS } from '../config.js'

/** Lados del cono. Suficientes para que el borde no se lea como un polígono. */
const LADOS = 48

const _adelante = new THREE.Vector3(0, 0, -1)

export class SpawnCone {
  constructor(scene) {
    this.scene = scene
    this.group = new THREE.Group()
    this.group.visible = false
    // Por si alguien barre la escena: esto no es una pieza del mapa.
    this.group.userData.ayuda = true
    scene.add(this.group)

    const color = new THREE.Color(COLORS.action)

    this.superficie = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.07,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.superficie.renderOrder = 6
    this.group.add(this.superficie)

    this.lineas = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    )
    this.lineas.renderOrder = 7
    this.group.add(this.lineas)

    /** Lo último con lo que se construyó, para no rehacerlo por frame. */
    this._medio = -1
    this._cerca = -1
    this._lejos = -1
  }

  /**
   * Rehace la malla si la apertura o el rango han cambiado.
   *
   * @param {number} medioAngulo semiángulo del abanico, en radianes
   * @param {number} cerca distancia mínima de aparición
   * @param {number} lejos distancia máxima
   */
  configurar(medioAngulo, cerca, lejos) {
    if (medioAngulo === this._medio && cerca === this._cerca && lejos === this._lejos) return
    this._medio = medioAngulo
    this._cerca = cerca
    this._lejos = lejos

    const radio = Math.tan(medioAngulo) * lejos
    // `openEnded`: un cono con tapa sería un disco opaco a la distancia de
    // aparición, o sea justo delante de donde hay que mirar.
    this.superficie.geometry.dispose()
    const cono = new THREE.ConeGeometry(radio, lejos, LADOS, 1, true)
    // `ConeGeometry` crece en +Y con el vértice arriba. Se tumba para que el
    // vértice quede en el origen y el eje mire a −Z, que es la convención de
    // una cámara de three.js.
    cono.rotateX(Math.PI / 2)
    cono.translate(0, 0, -lejos / 2)
    this.superficie.geometry = cono

    // Los «láseres»: los cuatro bordes del abanico y los dos aros que marcan
    // entre qué distancias se sortea. Los aros son lo que convierte el cono en
    // una medida —se lee dónde empieza y dónde acaba— en vez de en una niebla.
    const puntos = []
    for (let i = 0; i < 4; i++) {
      const phi = (i / 4) * Math.PI * 2
      const r = Math.tan(medioAngulo) * lejos
      puntos.push(0, 0, 0, Math.cos(phi) * r, Math.sin(phi) * r, -lejos)
    }
    for (const distancia of [cerca, lejos]) {
      const r = Math.tan(medioAngulo) * distancia
      for (let i = 0; i < LADOS; i++) {
        const a = (i / LADOS) * Math.PI * 2
        const b = ((i + 1) / LADOS) * Math.PI * 2
        puntos.push(
          Math.cos(a) * r, Math.sin(a) * r, -distancia,
          Math.cos(b) * r, Math.sin(b) * r, -distancia,
        )
      }
    }
    this.lineas.geometry.dispose()
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(puntos, 3))
    this.lineas.geometry = geo
  }

  /** Cuelga el vértice de la cámara y apunta el cono por el eje que se le dé. */
  colocar(posicion, eje) {
    this.group.position.copy(posicion)
    this.group.quaternion.setFromUnitVectors(_adelante, eje)
  }

  setVisible(visible) {
    this.group.visible = visible
  }

  get visible() {
    return this.group.visible
  }

  dispose() {
    this.scene.remove(this.group)
    this.superficie.geometry.dispose()
    this.superficie.material.dispose()
    this.lineas.geometry.dispose()
    this.lineas.material.dispose()
  }
}
