/**
 * **El arma en la mano** (maqueta detrás de `armaEnPantalla`, apagada de
 * fábrica; vuelta 103, rehecha en la 104 y calibrada en la 105).
 *
 * Desde la vuelta 38 Vektor no dibuja el arma: lo que se ve de ella es su
 * silueta en el HUD. Esto es la maqueta de lo contrario, para decidir con ella
 * delante, y se construye con lo que ya hay:
 *
 * - **El arma es su silueta**, el trazado de potrace de `weaponPaths.js`,
 *   extruido con un grosor fino y **aristas redondeadas**. El perfil no se toca:
 *   las dos tapas son exactamente la foto de `Reference/Weapons/`. Sale de la
 *   misma función que el HUD (`weaponShape`), así que con supresor es la otra
 *   foto, como allí.
 * - **La mano es una esfera** del color de tu equipo que **envuelve la
 *   empuñadura** y se corta con el borde de abajo; opcionalmente, otra más
 *   pequeña bajo el guardamanos (`VIEWMODEL.manoDeApoyo`).
 * - **Tiene su propia escena, su cámara y sus dos luces**, y se dibuja después
 *   del mundo tras limpiar la profundidad: nunca se mete en una pared, y las
 *   luces no tocan el mundo, que sigue sin ninguna (vuelta 38).
 *
 * **La colocación es por tipo de arma** (vuelta 105, `VIEWMODEL.poses`): cerca
 * de la cámara, grande, casi paralela a la vista y **empuñada**, con la parte de
 * atrás saliéndose por el borde. El giro hacia dentro es pequeño y se escribe
 * (`giroDeg`); el cabeceo sale de pedir que la recta del cañón pase por el eje
 * de la mira, así que el arma apunta a la mira y la perspectiva la lleva hacia
 * el centro. La cámara del arma tiene un campo de visión **vertical y fijo**:
 * el mismo encuadre en 16:9, 21:9 y 4:3, y quieto con la mirilla.
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
const _q = new THREE.Quaternion()
const _qGiro = new THREE.Quaternion()
const _eje = new THREE.Vector3(0, 0, 1)
const _e = new THREE.Euler(0, 0, 0, 'YXZ')
const _o = new THREE.Vector3()
const _g = new THREE.Vector3()
const _p = new THREE.Vector3()
const _blanco = new THREE.Color('#ffffff')

/** La pose y los agarres de un arma, con los valores de rifle si no declara nada. */
function datosDeArma(weaponKey) {
  const a = VIEWMODEL.armas[weaponKey] ?? {}
  return {
    pose: VIEWMODEL.poses[a.pose] ?? VIEWMODEL.poses.rifle,
    largo: a.largo ?? 1,
    agarre: a.agarre ?? 0.33,
    apoyo: a.apoyo ?? null,
  }
}

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

    /** Lo que se mueve entero con los gestos: la mano, y el arma que empuña. */
    this.raiz = new THREE.Group()
    this.scene.add(this.raiz)
    this.arma = new THREE.Group()
    this.raiz.add(this.arma)

    this.matRelleno = new THREE.MeshLambertMaterial({ color: v.relleno })
    this.matContorno = new THREE.LineBasicMaterial({ color: v.contorno, transparent: true, opacity: v.contornoOpacidad })
    this.matMano = new THREE.MeshLambertMaterial({ color: '#2F6BF0' })
    // El piloto holográfico (vuelta 105): sólo líneas, que suman luz.
    this.matHolo = new THREE.LineBasicMaterial({
      color: '#2F6BF0', transparent: true, opacity: v.holograma.opacidad, depthWrite: false,
    })
    this._esfera = new THREE.SphereGeometry(1, 32, 20)
    this.mano = new THREE.Mesh(this._esfera, this.matMano)
    this.mano.scale.setScalar(v.mano.radioU)
    this.raiz.add(this.mano)
    /** La mano de apoyo: la misma esfera, más pequeña, bajo el guardamanos. */
    this.manoDeApoyo = new THREE.Mesh(this._esfera, this.matMano)
    this.manoDeApoyo.scale.setScalar(v.mano.radioU * v.apoyo.radio)
    this.manoDeApoyo.visible = false
    this.raiz.add(this.manoDeApoyo)

    /** Dónde está la mano en reposo: pegada al borde de abajo (`_anclar`). */
    this._mano = new THREE.Vector3()

    /** Geometrías hechas, por silueta: cambiar de arma no vuelve a extruir. */
    this._cache = new Map()
    this._clave = null
    this.visible = false
    this._convergencia = null

    // Estado de los gestos, en números sueltos.
    this._retroceso = 0
    this._paso = 0
    this._inercia = 0
    this._yawAntes = null
    this._recarga = 0
    this._subir = 1
  }

  /**
   * La mano, cortada por el borde de abajo. Con el campo de visión vertical
   * fijo, el borde está a `−|z|·tan(fov/2)` a esa profundidad **en cualquier
   * relación de aspecto**: por eso el encuadre no depende de la pantalla.
   */
  _anclar(pose) {
    const r = VIEWMODEL.mano.radioU
    const borde = -Math.abs(pose.z) * Math.tan((VIEWMODEL.fov / 2) * GRADO)
    this._mano.set(pose.x, borde + (2 * pose.asoma - 1) * r, pose.z)
  }

  /** El color de la mano es el de tu equipo. */
  colorDeEquipo(color) {
    // Se llama cada frame: sólo se toca el material si cambia.
    if (color === this._color) return
    this._color = color
    this.matMano.color.set(color)
    // Luminoso: el color del equipo aclarado hacia el blanco, que es lo que lo
    // separa del gris del suelo sin inventar un color.
    this.matHolo.color.set(color).lerp(_blanco, VIEWMODEL.holograma.aclarado)
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
    this.manoDeApoyo.visible = false
    if (!forma) return
    const datos = datosDeArma(weaponKey)
    let hecha = this._cache.get(clave)
    if (!hecha) {
      hecha = extruirSilueta(forma, this.matRelleno, this.matContorno, datos)
      this._cache.set(clave, hecha)
    }
    // **El holograma** (piloto, vuelta 105): la misma pieza, así que el encuadre
    // y el agarre son los de la v3 por construcción. Sin relleno y con **un solo
    // contorno, en el plano medio**: las dos caras a la vez se leían como dos
    // armas fantasma, porque desde atrás la perspectiva las separa.
    const holo = VIEWMODEL.holograma.armas.includes(weaponKey)
    hecha.grupo.children[0].visible = !holo
    for (const tapa of hecha.tapas) {
      tapa.material = holo ? this.matHolo : this.matContorno
      tapa.position.x = 0
    }
    this.arma.add(hecha.grupo)
    this._colocar(hecha, datos)
    this._tapaVisible(hecha)
    if (holo) {
      const [medio, otra] = hecha.tapas
      medio.geometry.computeBoundingBox()
      const caja = medio.geometry.boundingBox
      medio.position.x = -(caja.min.x + caja.max.x) / 2
      medio.visible = true
      otra.visible = false
    }
    // Al sacar un arma, sube desde abajo.
    this._subir = 0
  }

  /**
   * **La pose de reposo: el arma empuñada, y apuntando a la mira.** La mano va
   * donde dice la pose; el arma se cuelga de ella por su empuñadura. El giro
   * hacia dentro está escrito y el cabeceo se despeja: la recta del cañón corta
   * el plano vertical del eje (x = 0) a cierta profundidad, y el cabeceo es el
   * que la hace cortar también el horizontal (y = 0) ahí. Como mover el arma
   * cambia ese cabeceo y el cabeceo mueve el arma, se resuelve por
   * aproximaciones: cinco vueltas, una vez por arma y nunca por frame.
   */
  _colocar(hecha, datos) {
    const v = VIEWMODEL
    const pose = datos.pose
    this._anclar(pose)
    // En el arma, dónde va el centro de la mano: dentro del puño.
    const agarre = _g.copy(hecha.agarre)
    agarre.y += v.mano.radioU * v.mano.envuelve
    this._convergencia = null
    if (pose.pantallaDeg != null) {
      // El cuchillo: de plano a la cámara (la foto, tal cual), girado en el
      // plano de la pantalla y ladeado un poco.
      _q.setFromAxisAngle(_arriba, Math.PI / 2)
      _qGiro.setFromAxisAngle(_eje, pose.pantallaDeg * GRADO)
      _q.premultiply(_qGiro)
      _qGiro.setFromAxisAngle(_arriba, (pose.ladeoDeg ?? 0) * GRADO)
      _q.premultiply(_qGiro)
      _o.copy(agarre).applyQuaternion(_q)
      _o.subVectors(this._mano, _o)
    } else {
      const lado = Math.sign(pose.x) || 1
      const giro = lado * pose.giroDeg * GRADO
      let cabeceo = 0
      for (let i = 0; i < 5; i++) {
        _q.setFromEuler(_e.set(cabeceo, giro, 0))
        _o.copy(agarre).applyQuaternion(_q)
        _o.subVectors(this._mano, _o)
        // tan(cabeceo) = −O.y · sen(giro) / O.x: la y llega a cero donde la x.
        if (Math.abs(_o.x) > 1e-4) cabeceo = Math.atan((-_o.y * Math.sin(giro)) / _o.x)
      }
      _q.setFromEuler(_e.set(cabeceo, giro, 0))
      _o.copy(agarre).applyQuaternion(_q)
      _o.subVectors(this._mano, _o)
      this._convergencia = Math.abs(_o.x / (Math.sin(giro) * Math.cos(cabeceo)))
    }
    this.arma.quaternion.copy(_q)
    // La raíz vive en la mano (es el pivote de los gestos); el arma, relativa a ella.
    this.arma.position.copy(_o).sub(this._mano)
    // La mano de apoyo, bajo el guardamanos, si la hay y se ha pedido.
    if (v.manoDeApoyo && hecha.apoyo) {
      const r2 = v.mano.radioU * v.apoyo.radio
      _p.copy(hecha.apoyo)
      _p.y += r2 * v.apoyo.envuelve
      _p.applyQuaternion(_q).add(this.arma.position)
      this.manoDeApoyo.position.copy(_p)
      this.manoDeApoyo.visible = true
    }
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

  /** A qué distancia, a lo largo del cañón, corta el eje de la mira (`null` con el cuchillo). */
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
    this.matHolo.dispose()
  }
}

/**
 * **La silueta, en 3D.** El trazado del SVG se convierte en formas y se extruye
 * con el grosor del arma y un bisel redondeado; el contorno se dibuja sobre las
 * dos tapas, que son el perfil exacto de la foto. Se orienta con la boca hacia
 * delante: en todas las fotos de referencia el cañón (o la hoja) mira a la
 * izquierda (−x), y el eje y del SVG va hacia abajo. **Mide `largoU` de punta a
 * punta**, sea cual sea el hueco que la foto deja alrededor.
 *
 * Devuelve el grupo, con **la línea del cañón pasando por su origen y a lo largo
 * de −Z**, y **dónde van las manos**: el punto más bajo de la silueta en la
 * fracción del largo que declara `VIEWMODEL.armas` (la empuñadura y, si la hay,
 * el guardamanos). La altura del cañón se estima como el centro de lo que hay en
 * la punta.
 */
function extruirSilueta(forma, matRelleno, matContorno, datos) {
  const v = VIEWMODEL
  const datosSvg = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${forma.d}"/></svg>`)
  const formas = []
  for (const camino of datosSvg.paths) formas.push(...SVGLoader.createShapes(camino))
  // El largo de verdad es el de la silueta, no el del lienzo de la foto.
  let minX = Infinity
  let maxX = -Infinity
  for (const f of formas) {
    for (const pt of f.extractPoints(v.curvas).shape) {
      if (pt.x < minX) minX = pt.x
      if (pt.x > maxX) maxX = pt.x
    }
  }
  const escala = (datos.pose.largoU * datos.largo) / Math.max(1e-6, maxX - minX)

  // Grosor total = cuerpo + los dos biseles. Todo en unidades del SVG.
  const bisel = v.bisel.grosorU / escala
  const cuerpo = Math.max(0.1, (datos.pose.grosorU ?? v.grosorU) / escala - 2 * bisel)
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

  // Las mismas transformaciones a las tres: centrar, pasar a unidades, girar.
  geom.computeBoundingBox()
  const caja = geom.boundingBox
  const cx = -(caja.min.x + caja.max.x) / 2
  const cy = -(caja.min.y + caja.max.y) / 2
  const cz = -(caja.min.z + caja.max.z) / 2
  for (const g of [geom, ...contornos]) {
    g.translate(cx, cy, cz)
    // El SVG va con la y hacia abajo.
    g.scale(escala, -escala, escala)
    // La boca (−x) hacia delante (−z).
    g.rotateY(-Math.PI / 2)
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

  // Las manos: el punto más bajo de la silueta a esa fracción desde atrás (+z).
  const c = geom.boundingBox
  const bajoEn = (fraccion) => {
    const z0 = c.max.z - fraccion * largo
    const ventana = largo * 0.04
    let mejor = null
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i)
      if (Math.abs(z - z0) > ventana) continue
      const y = pos.getY(i)
      if (!mejor || y < mejor.y) mejor = { y, z }
    }
    return new THREE.Vector3(0, mejor?.y ?? c.min.y, mejor?.z ?? z0)
  }
  const agarre = bajoEn(datos.agarre)
  const apoyo = datos.apoyo == null ? null : bajoEn(datos.apoyo)

  const grupo = new THREE.Group()
  grupo.add(new THREE.Mesh(geom, matRelleno))
  const tapas = contornos.map((g) => new THREE.LineSegments(g, matContorno))
  grupo.add(...tapas)
  return { grupo, agarre, apoyo, tapas }
}
