/**
 * **El arma en la mano** (vuelta 103, maqueta detrás de `armaEnPantalla`).
 *
 * Desde la vuelta 38 Vektor no dibuja el arma: lo que se ve de ella es su
 * silueta en el HUD. Esto es la maqueta de lo contrario, para decidir con ella
 * delante, y se construye con lo que ya hay:
 *
 * - **El arma es su silueta**, el trazado de potrace de `weaponPaths.js`,
 *   extruido a un recorte con grosor y con el contorno encendido. Es la
 *   estética del resto del juego —líneas sobre negro— y no pide ni un modelo ni
 *   una textura. Y sale de la misma función que el HUD (`weaponShape`), así que
 *   con supresor es la otra foto, como allí.
 * - **El brazo es el del avatar**: un tubo del color de tu equipo que llega
 *   desde abajo a la derecha hasta la empuñadura.
 * - **Va en su propia escena y con su propia cámara**, dibujada después del
 *   mundo y tras limpiar la profundidad. Así el arma nunca se mete en una pared
 *   y su encuadre no cambia con el del jugador, que es como lo hacen todos.
 *
 * Nada de esto toca el juego: la bala sale de los ojos, el retroceso de verdad
 * es de la cámara (vuelta 61) y esto sólo lo acompaña. Sin asignar memoria por
 * frame: la geometría de cada arma se hace una vez y se guarda.
 */

import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { VIEWMODEL } from '../config.js'
import { weaponShape } from '../ui/weaponSilhouette.js'

const GRADO = Math.PI / 180
const _desde = new THREE.Vector3()
const _hasta = new THREE.Vector3()
const _eje = new THREE.Vector3()
const _arriba = new THREE.Vector3(0, 1, 0)

export class ArmaEnMano {
  constructor() {
    const v = VIEWMODEL
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(v.fov, 1, 0.01, 10)
    /** Lo que se mueve entero: el arma y la mano, con los cinco gestos. */
    this.raiz = new THREE.Group()
    this.scene.add(this.raiz)
    this.arma = new THREE.Group()
    this.raiz.add(this.arma)

    this.matRelleno = new THREE.MeshBasicMaterial({ color: v.relleno })
    this.matContorno = new THREE.LineBasicMaterial({ color: v.contorno, transparent: true, opacity: v.contornoOpacidad })
    this.matBrazo = new THREE.MeshBasicMaterial({ color: '#2F6BF0' })
    // El antebrazo, más oscuro que la mano: lo que tiene que mandar es el arma.
    this.matTubo = new THREE.MeshBasicMaterial({ color: '#2F6BF0' })
    this.matBrazoContorno = new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.55 })

    // El antebrazo: un tubo de largo 1 que se estira y se orienta en cada
    // cambio de arma, y una mano redonda en la empuñadura.
    const tubo = new THREE.CylinderGeometry(v.brazo.radioU, v.brazo.radioU * 1.2, 1, 10, 1, true)
    tubo.translate(0, 0.5, 0)
    this.brazo = new THREE.Mesh(tubo, this.matTubo)
    this.brazo.add(new THREE.LineSegments(new THREE.EdgesGeometry(tubo, 40), this.matBrazoContorno))
    this.mano = new THREE.Mesh(new THREE.SphereGeometry(v.brazo.radioU * 1.1, 12, 8), this.matBrazo)
    this.raiz.add(this.brazo, this.mano)

    /** Geometrías hechas, por silueta: cambiar de arma no vuelve a extruir. */
    this._cache = new Map()
    this._clave = null
    this.visible = false

    // Estado de los gestos, en números sueltos.
    this._retroceso = 0
    this._paso = 0
    this._inercia = 0
    this._yawAntes = null
    this._recarga = 0
    this._subir = 1
  }

  /** El color del brazo es el de tu equipo. */
  colorDeEquipo(color) {
    // Se llama cada frame: sólo se toca el material si cambia.
    if (color === this._color) return
    this._color = color
    this.matBrazo.color.set(color)
    this.matTubo.color.set(color).multiplyScalar(VIEWMODEL.brazo.tonoTubo)
  }

  /** Pone en la mano el arma que toque. Sin trazado, no hay arma que enseñar. */
  poner(weaponKey, suprimido = false) {
    const forma = weaponShape(weaponKey, suprimido)
    const clave = forma ? `${weaponKey}|${forma === weaponShape(weaponKey, false) ? '' : 'sil'}` : null
    if (clave === this._clave) return
    this._clave = clave
    this.arma.clear()
    this.visible = Boolean(forma)
    if (!forma) return
    let hecha = this._cache.get(clave)
    if (!hecha) {
      hecha = extruirSilueta(forma, this.matRelleno, this.matContorno, VIEWMODEL.miranALaDerecha.includes(weaponKey))
      this._cache.set(clave, hecha)
    }
    this.arma.add(hecha.grupo)
    this._empunadura = hecha.empunadura
    // Al sacar un arma, sube desde abajo.
    this._subir = 0
  }

  /** Un disparo: el arma recula y cabecea, y se recupera sola. */
  disparo(fuerza = 1) {
    this._retroceso = Math.min(1.6, this._retroceso + fuerza)
  }

  /**
   * Un frame. `dt` en segundos; `velocidad` horizontal del jugador en u/s;
   * `enSuelo` apaga el balanceo en el aire; `recargando` baja el arma.
   */
  actualizar(dt, camara, velocidad, enSuelo, recargando) {
    const v = VIEWMODEL
    this._retroceso *= Math.exp(-(dt * 1000) / v.retroceso.vidaMs)
    if (enSuelo) this._paso += velocidad * dt * v.balanceo.pasosPorU * Math.PI * 2
    const bamboleo = enSuelo ? Math.min(1, velocidad / 6.5) : 0
    // La inercia: al girar, el arma se queda un poco atrás y vuelve.
    const yaw = camara.rotation.y
    if (this._yawAntes !== null) {
      let d = yaw - this._yawAntes
      if (d > Math.PI) d -= Math.PI * 2
      if (d < -Math.PI) d += Math.PI * 2
      this._inercia = Math.max(-v.inercia.maxU, Math.min(v.inercia.maxU, this._inercia + d * v.inercia.porRadian))
    }
    this._yawAntes = yaw
    this._inercia *= Math.exp(-(dt * 1000) / v.inercia.vidaMs)
    this._recarga += ((recargando ? 1 : 0) - this._recarga) * Math.min(1, dt * 10)
    this._subir = Math.min(1, this._subir + (dt * 1000) / v.subirMs)
    const bajada = (1 - this._subir) * (1 - this._subir)

    const r = this._retroceso
    const s = v.sitio
    this.raiz.position.set(
      s.x + this._inercia + Math.sin(this._paso) * v.balanceo.amplitudU * bamboleo,
      s.y - Math.abs(Math.cos(this._paso)) * v.balanceo.amplitudU * 0.7 * bamboleo
        - this._recarga * v.recarga.bajaU - bajada * 0.3 + r * 0.008,
      s.z + r * v.retroceso.atrasU,
    )
    this.raiz.rotation.set(
      (s.cabeceoDeg + r * v.retroceso.arribaGrados) * GRADO,
      s.giroDeg * GRADO,
      (s.alabeoDeg - this._recarga * v.recarga.giroGrados) * GRADO,
    )
    this.raiz.updateMatrixWorld(true)
    this._colocarBrazo()
  }

  /** El tubo va de fuera de la pantalla a la empuñadura del arma que llevas. */
  _colocarBrazo() {
    const b = VIEWMODEL.brazo
    this.brazo.visible = this.mano.visible = this.visible
    if (!this.visible) return
    _hasta.copy(this._empunadura)
    this.arma.localToWorld(_hasta)
    this.raiz.worldToLocal(_hasta)
    // El origen del brazo es fijo en pantalla: se pasa a coordenadas de la raíz.
    _desde.set(b.desde.x, b.desde.y, b.desde.z)
    this.raiz.worldToLocal(_desde)
    _eje.subVectors(_hasta, _desde)
    const largo = _eje.length()
    this.brazo.position.copy(_desde)
    this.brazo.scale.set(1, largo, 1)
    this.brazo.quaternion.setFromUnitVectors(_arriba, _eje.divideScalar(largo || 1))
    this.mano.position.copy(_hasta)
  }

  /** La segunda pasada: encima del mundo, con la profundidad limpia. */
  dibujar(renderer) {
    if (!this.visible) return
    const lienzo = renderer.domElement
    const aspecto = lienzo.width / Math.max(1, lienzo.height)
    if (this.camera.aspect !== aspecto) {
      this.camera.aspect = aspecto
      this.camera.updateProjectionMatrix()
    }
    const antes = renderer.autoClear
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
    renderer.autoClear = antes
  }

  dispose() {
    for (const hecha of this._cache.values()) {
      hecha.grupo.traverse((o) => o.geometry?.dispose())
    }
    this._cache.clear()
    this.brazo.geometry.dispose()
    this.mano.geometry.dispose()
    this.matRelleno.dispose()
    this.matContorno.dispose()
    this.matBrazo.dispose()
    this.matTubo.dispose()
    this.matBrazoContorno.dispose()
  }
}

/**
 * **La silueta, en 3D.** El trazado del SVG se convierte en formas, se extruye
 * con el grosor del arma y se le pone el contorno. Se orienta con la boca hacia
 * delante: en las fotos de referencia el cañón mira a la izquierda (−x) y el
 * eje y del SVG va hacia abajo.
 *
 * Devuelve también **dónde está la empuñadura**, que no está escrita en ninguna
 * parte: se estima como el punto de la silueta más bajo en su tercio trasero,
 * que en una foto de perfil es la culata o el pistolete.
 */
function extruirSilueta(forma, matRelleno, matContorno, alReves = false) {
  const v = VIEWMODEL
  const [, , anchoVB] = forma.viewBox.split(/\s+/).map(Number)
  const escala = v.largoU / anchoVB
  const datos = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${forma.d}"/></svg>`)
  const formas = []
  for (const camino of datos.paths) formas.push(...SVGLoader.createShapes(camino))
  const geom = new THREE.ExtrudeGeometry(formas, { depth: v.grosorU / escala, bevelEnabled: false, curveSegments: 3 })
  geom.computeBoundingBox()
  const caja = geom.boundingBox
  // Centrada en su caja, y el SVG va con la y hacia abajo.
  geom.translate(-(caja.min.x + caja.max.x) / 2, -(caja.min.y + caja.max.y) / 2, -(caja.min.z + caja.max.z) / 2)
  geom.scale(escala, -escala, escala)
  // La boca (−x) hacia delante (−z); si la foto mira a la derecha, la +x.
  geom.rotateY(alReves ? Math.PI / 2 : -Math.PI / 2)
  geom.computeBoundingBox()

  const grupo = new THREE.Group()
  grupo.add(new THREE.Mesh(geom, matRelleno))
  grupo.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, 25), matContorno))

  // La empuñadura: el vértice más bajo del tercio trasero (z positiva).
  const pos = geom.attributes.position
  const b = geom.boundingBox
  const corte = b.max.z - (b.max.z - b.min.z) / 3
  let mejor = null
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i)
    if (z < corte - (b.max.z - b.min.z) * 0.25) continue
    const y = pos.getY(i)
    if (!mejor || y < mejor.y) mejor = { x: pos.getX(i), y, z }
  }
  const empunadura = new THREE.Vector3(mejor?.x ?? 0, (mejor?.y ?? b.min.y) + 0.04, mejor?.z ?? b.max.z * 0.5)
  return { grupo, empunadura }
}
