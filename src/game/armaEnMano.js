/**
 * **El arma en la mano** (maqueta detrás de `armaEnPantalla`, apagada de
 * fábrica; vuelta 103, rehecha en la 104).
 *
 * Desde la vuelta 38 Vektor no dibuja el arma: lo que se ve de ella es su
 * silueta en el HUD. Esto es la maqueta de lo contrario, para decidir con ella
 * delante, y se construye con lo que ya hay:
 *
 * - **El arma es su silueta**, el trazado de potrace de `weaponPaths.js`,
 *   extruido con un grosor fino y **aristas redondeadas** (un bisel de tres
 *   pasos). El perfil no se toca: las dos tapas son exactamente la foto de
 *   `Reference/Weapons/`, y el contorno encendido se dibuja sobre ellas. Sale de
 *   la misma función que el HUD (`weaponShape`), así que con supresor es la otra
 *   foto, como allí.
 * - **La mano es una esfera** del color de tu equipo —la del muñeco, no un
 *   antebrazo— que asoma por el borde de abajo, con el arma encima.
 * - **Tiene su propia escena, su cámara y sus dos luces**, y se dibuja después
 *   del mundo tras limpiar la profundidad: nunca se mete en una pared, y las
 *   luces no tocan el mundo, que sigue sin ninguna (vuelta 38).
 *
 * **Y el cañón apunta al centro de la mira, por construcción** (vuelta 104). La
 * cámara del arma tiene un campo de visión **vertical y fijo** (`VIEWMODEL.fov`),
 * así que el borde de abajo está siempre a la misma altura y el centro de la
 * pantalla es siempre su eje −Z, sea cual sea la relación de aspecto y el
 * campo de visión del juego (la mirilla lo cambia; esta cámara no). La geometría
 * se centra para que **la línea del cañón pase por el origen del arma**, y el
 * arma se orienta con `lookAt` hacia un punto de ese eje
 * (`VIEWMODEL.convergenciaU`): la recta del cañón corta el centro de la pantalla
 * en ese punto, exactamente. Los gestos (retroceso, balanceo, inercia) la
 * mueven un instante y vuelve.
 *
 * Nada de esto toca el juego: la bala sale de los ojos y el retroceso de verdad
 * es de la cámara (vuelta 61). Sin asignar memoria por frame: la geometría de
 * cada arma se hace una vez y se guarda.
 */

import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { VIEWMODEL } from '../config.js'
import { weaponShape } from '../ui/weaponSilhouette.js'

const GRADO = Math.PI / 180
const _arriba = new THREE.Vector3(0, 1, 0)
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _qGiro = new THREE.Quaternion()
const _eje = new THREE.Vector3(0, 0, 1)
const _o = new THREE.Vector3()
const _g = new THREE.Vector3()
const _p = new THREE.Vector3()

export class ArmaEnMano {
  constructor() {
    const v = VIEWMODEL
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(v.fov, 1, 0.01, 10)
    // Dos luces sólo para esta escena: la que hace que la esfera se lea como
    // esfera y que el bisel se lea como una arista redonda.
    this.scene.add(new THREE.HemisphereLight(v.luz.cielo, v.luz.suelo, v.luz.ambiente))
    const sol = new THREE.DirectionalLight(0xffffff, v.luz.directa)
    sol.position.set(v.luz.desde.x, v.luz.desde.y, v.luz.desde.z)
    this.scene.add(sol)

    /** Lo que se mueve entero con los gestos: la mano, y el arma encima. */
    this.raiz = new THREE.Group()
    this.scene.add(this.raiz)
    this.arma = new THREE.Group()
    this.raiz.add(this.arma)

    this.matRelleno = new THREE.MeshLambertMaterial({ color: v.relleno })
    this.matContorno = new THREE.LineBasicMaterial({ color: v.contorno, transparent: true, opacity: v.contornoOpacidad })
    this.matMano = new THREE.MeshLambertMaterial({ color: '#2F6BF0' })
    this.mano = new THREE.Mesh(new THREE.SphereGeometry(v.mano.radioU, 32, 20), this.matMano)
    this.raiz.add(this.mano)

    /** Dónde está la mano en reposo: pegada al borde de abajo (`_anclar`). */
    this._mano = new THREE.Vector3()
    this._anclar()

    /** Geometrías hechas, por silueta: cambiar de arma no vuelve a extruir. */
    this._cache = new Map()
    this._clave = null
    this.visible = false
    this._convergencia = 0

    // Estado de los gestos, en números sueltos.
    this._retroceso = 0
    this._paso = 0
    this._inercia = 0
    this._yawAntes = null
    this._recarga = 0
    this._subir = 1
  }

  /**
   * La mano, asomando por el borde de abajo. Con el campo de visión vertical
   * fijo, el borde está a `−|z|·tan(fov/2)` a esa profundidad **en cualquier
   * relación de aspecto**: por eso esto se calcula una vez.
   */
  _anclar() {
    const v = VIEWMODEL
    const r = v.mano.radioU
    const borde = -Math.abs(v.mano.z) * Math.tan((v.fov / 2) * GRADO)
    this._mano.set(v.mano.x, borde + (2 * v.mano.asoma - 1) * r, v.mano.z)
  }

  /** El color de la mano es el de tu equipo. */
  colorDeEquipo(color) {
    // Se llama cada frame: sólo se toca el material si cambia.
    if (color === this._color) return
    this._color = color
    this.matMano.color.set(color)
  }

  /** Pone en la mano el arma que toque. Sin trazado, no hay arma que enseñar. */
  poner(weaponKey, suprimido = false) {
    const forma = weaponShape(weaponKey, suprimido)
    const clave = forma ? `${weaponKey}|${forma === weaponShape(weaponKey, false) ? '' : 'sil'}` : null
    if (clave === this._clave) return
    this._clave = clave
    this.arma.clear()
    this.visible = Boolean(forma)
    this.mano.visible = this.visible
    if (!forma) return
    let hecha = this._cache.get(clave)
    if (!hecha) {
      hecha = extruirSilueta(forma, this.matRelleno, this.matContorno, VIEWMODEL.miranALaDerecha.includes(weaponKey))
      this._cache.set(clave, hecha)
    }
    this.arma.add(hecha.grupo)
    this._colocar(hecha.empunadura)
    this._tapaVisible(hecha)
    // Al sacar un arma, sube desde abajo.
    this._subir = 0
  }

  /**
   * **La pose de reposo: la empuñadura sobre la mano y el cañón al centro.**
   * Dos condiciones que dependen la una de la otra —girar el arma mueve dónde
   * cae la empuñadura, y moverla cambia el giro que apunta al centro—, así que
   * se resuelven por aproximaciones: cuatro vueltas bastan porque el giro es de
   * pocos grados. Una vez por arma, nunca por frame.
   */
  _colocar(empunadura) {
    const v = VIEWMODEL
    const objetivo = _p.set(0, 0, -v.convergenciaU)
    // Dónde tiene que quedar la empuñadura: encima de la mano.
    const agarre = _g.copy(this._mano)
    agarre.y += v.mano.radioU * v.mano.apoyo
    _qGiro.setFromAxisAngle(_eje, v.alabeoDeg * GRADO)
    _o.copy(agarre).sub(empunadura)
    for (let i = 0; i < 4; i++) {
      _m.lookAt(_o, objetivo, _arriba)
      _q.setFromRotationMatrix(_m).multiply(_qGiro)
      _o.copy(empunadura).applyQuaternion(_q)
      _o.subVectors(agarre, _o)
    }
    _m.lookAt(_o, objetivo, _arriba)
    this.arma.quaternion.setFromRotationMatrix(_m).multiply(_qGiro)
    // La raíz vive en la mano (es el pivote de los gestos); el arma, relativa a ella.
    this.arma.position.copy(_o).sub(this._mano)
    this._convergencia = _o.distanceTo(objetivo)
  }

  /**
   * **El contorno, sólo en la tapa que mira a la cámara.** Con las dos, la de
   * detrás asomaba por el canto y cada arista salía doble. Qué tapa se ve no
   * cambia con los gestos (son de pocos grados), así que se decide una vez.
   */
  _tapaVisible(hecha) {
    // El eje del grosor del arma es su x local; la cámara está en el origen.
    const normal = _g.set(1, 0, 0).applyQuaternion(this.arma.quaternion)
    const haciaCamara = _p.copy(this.arma.position).add(this._mano).negate()
    const derecha = normal.dot(haciaCamara) > 0
    hecha.tapas[0].visible = !derecha
    hecha.tapas[1].visible = derecha
  }

  /** A qué distancia, a lo largo del cañón, corta el eje de la mira. */
  convergencia() {
    return this._convergencia
  }

  /** Un punto de la línea del cañón en el espacio de la cámara del arma (para medir). */
  puntoDelCanon(distancia) {
    this.raiz.updateMatrixWorld(true)
    return this.arma.localToWorld(new THREE.Vector3(0, 0, -distancia))
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

    // Los gestos son desplazamientos y giros **alrededor de la mano**: el
    // retroceso levanta el cañón pivotando en ella, que es como se ve un tiro.
    const r = this._retroceso
    const m = this._mano
    this.raiz.position.set(
      m.x + this._inercia + Math.sin(this._paso) * v.balanceo.amplitudU * bamboleo,
      m.y - Math.abs(Math.cos(this._paso)) * v.balanceo.amplitudU * 0.7 * bamboleo
        - this._recarga * v.recarga.bajaU - bajada * 0.3,
      m.z + r * v.retroceso.atrasU,
    )
    this.raiz.rotation.set(r * v.retroceso.arribaGrados * GRADO, 0, -this._recarga * v.recarga.giroGrados * GRADO)
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
    this.mano.geometry.dispose()
    this.matRelleno.dispose()
    this.matContorno.dispose()
    this.matMano.dispose()
  }
}

/**
 * **La silueta, en 3D.** El trazado del SVG se convierte en formas y se extruye
 * con el grosor del arma y un bisel redondeado; el contorno se dibuja sobre las
 * dos tapas, que son el perfil exacto de la foto. Se orienta con la boca hacia
 * delante: en las fotos de referencia el cañón mira a la izquierda (−x) y el eje
 * y del SVG va hacia abajo.
 *
 * Devuelve el grupo, con **la línea del cañón pasando por su origen y a lo largo
 * de −Z**, y **dónde está la empuñadura**, que no está escrita en ninguna parte:
 * se estima como el punto de la silueta más bajo en su tercio trasero, que en una
 * foto de perfil es la culata o el pistolete. La altura del cañón se estima igual,
 * como el centro de lo que hay en la punta.
 */
function extruirSilueta(forma, matRelleno, matContorno, alReves = false) {
  const v = VIEWMODEL
  const [, , anchoVB] = forma.viewBox.split(/\s+/).map(Number)
  const escala = v.largoU / anchoVB
  const datos = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${forma.d}"/></svg>`)
  const formas = []
  for (const camino of datos.paths) formas.push(...SVGLoader.createShapes(camino))

  // Grosor total = cuerpo + los dos biseles. Todo en unidades del SVG.
  const bisel = v.bisel.grosorU / escala
  const cuerpo = Math.max(0.1, v.grosorU / escala - 2 * bisel)
  const geom = new THREE.ExtrudeGeometry(formas, {
    depth: cuerpo,
    bevelEnabled: true,
    bevelThickness: bisel,
    bevelSize: v.bisel.anchoU / escala,
    bevelSegments: v.bisel.segmentos,
    curveSegments: v.curvas,
  })

  // El contorno, sobre las dos tapas: el perfil exacto, sin las aristas del bisel.
  const contornos = [-bisel, cuerpo + bisel].map((z) => {
    const lineas = []
    for (const f of formas) {
      const { shape, holes } = f.extractPoints(v.curvas)
      for (const puntos of [shape, ...holes]) {
        for (let i = 0; i < puntos.length; i++) {
          const a = puntos[i]
          const b = puntos[(i + 1) % puntos.length]
          lineas.push(a.x, a.y, z, b.x, b.y, z)
        }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(lineas, 3))
    return g
  })

  // Las mismas transformaciones a las dos: centrar, pasar a unidades, girar.
  geom.computeBoundingBox()
  const caja = geom.boundingBox
  const cx = -(caja.min.x + caja.max.x) / 2
  const cy = -(caja.min.y + caja.max.y) / 2
  const cz = -(caja.min.z + caja.max.z) / 2
  for (const g of [geom, ...contornos]) {
    g.translate(cx, cy, cz)
    // El SVG va con la y hacia abajo.
    g.scale(escala, -escala, escala)
    // La boca (−x) hacia delante (−z); si la foto mira a la derecha, la +x.
    g.rotateY(alReves ? Math.PI / 2 : -Math.PI / 2)
  }
  geom.computeBoundingBox()
  const b = geom.boundingBox
  const largo = b.max.z - b.min.z
  const pos = geom.attributes.position

  // La altura del cañón: el centro de lo que hay en la punta.
  let bajo = Infinity
  let alto = -Infinity
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) > b.min.z + largo * v.punta) continue
    const y = pos.getY(i)
    if (y < bajo) bajo = y
    if (y > alto) alto = y
  }
  const canon = Number.isFinite(bajo) ? (bajo + alto) / 2 : 0
  for (const g of [geom, ...contornos]) g.translate(0, -canon, 0)
  geom.computeBoundingBox()
  geom.computeVertexNormals()

  // La empuñadura: el vértice más bajo del tercio trasero (z positiva).
  const c = geom.boundingBox
  const corte = c.max.z - (c.max.z - c.min.z) / 3
  let mejor = null
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i)
    if (z < corte - (c.max.z - c.min.z) * 0.25) continue
    const y = pos.getY(i)
    if (!mejor || y < mejor.y) mejor = { y, z }
  }
  const empunadura = new THREE.Vector3(0, mejor?.y ?? c.min.y, mejor?.z ?? c.max.z * 0.5)

  const grupo = new THREE.Group()
  grupo.add(new THREE.Mesh(geom, matRelleno))
  const tapas = contornos.map((g) => new THREE.LineSegments(g, matContorno))
  grupo.add(...tapas)
  return { grupo, empunadura, tapas }
}
