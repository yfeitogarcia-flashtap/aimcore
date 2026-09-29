/**
 * **Lo que se ve de una peana** (vuelta 106, propuesta 08): un zócalo bajo, el
 * arma encima girando despacio y, a quien la ve, **la misma ficha que un
 * jugador** —silueta y nombre—. Sólo dibuja: qué hay en cada una y quién la
 * puede coger lo dicen el escenario y `arsenal.js`.
 *
 * Tres reglas:
 *
 * - **Una malla por tipo de arma** (`InstancedMesh`), así que diez peanas de
 *   Krakov son una llamada de dibujo. El arma es su silueta de siempre
 *   (`WEAPON_PATHS`), **plana y encarada a quien mira**, que es lo único que
 *   Vektor dibuja de un arma. Extruida y girando costaba el triple de
 *   triángulos y pasaba de canto la mitad del tiempo.
 * - **No es geometría del mapa**: fuera de `occluders`, sin colisión y sin
 *   recibir rayos. Una peana que parase balas sería cobertura que nadie decidió.
 * - **La ficha sale con las reglas de visibilidad de los jugadores**: encuadre y
 *   línea de visión (vuelta 42), así que una peana detrás de una pared no se
 *   anuncia. Sin la espera de sostener la mira de un rival, porque aquí la ficha
 *   es la información con la que se decide ir a por ella; y con tope de fichas y
 *   de cortes por frame, porque veinte peanas en el encuadre no pueden ser
 *   veinte preguntas en un frame.
 */

import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { CSS3DSprite } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { COLORS, MARKERS, PEANAS, WEAPONS } from '../config.js'
import { WEAPON_PATHS } from '../ui/weaponPaths.js'
import { nameplateElement } from './markers.js'

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3(1, 1, 1)
const _p = new THREE.Vector3()
const _y = new THREE.Vector3(0, 1, 0)
const _frente = new THREE.Vector3()

/** La silueta del arma, plana, centrada y con el largo de `PEANAS.largoArmaU`. */
export function geometriaDeArma(clave) {
  const forma = WEAPON_PATHS[clave]
  if (!forma) return null
  const svg = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${forma.d}"/></svg>`)
  const formas = []
  for (const camino of svg.paths) formas.push(...SVGLoader.createShapes(camino))
  const geom = new THREE.ShapeGeometry(formas, 2)
  geom.computeBoundingBox()
  const c = geom.boundingBox
  const escala = PEANAS.largoArmaU / Math.max(1e-6, c.max.x - c.min.x)
  geom.translate(-(c.min.x + c.max.x) / 2, -(c.min.y + c.max.y) / 2, 0)
  // El SVG va con la y hacia abajo.
  geom.scale(escala, -escala, 1)
  return geom
}

export class DibujoDePeanas {
  constructor(scene, cssScene) {
    this.scene = scene
    this.cssScene = cssScene
    this.group = new THREE.Group()
    this.group.name = 'peanas'
    scene.add(this.group)
    this._matArma = new THREE.MeshBasicMaterial({ color: COLORS.crosshair, side: THREE.DoubleSide })
    this._matZocalo = new THREE.MeshBasicMaterial({ color: COLORS.dispositivo })
    this._geomZocalo = new THREE.CylinderGeometry(PEANAS.zocaloRadioU, PEANAS.zocaloRadioU, PEANAS.zocaloAltoU, PEANAS.zocaloLados)
    this._geomZocalo.translate(0, PEANAS.zocaloAltoU / 2, 0)
    /** Una geometría por arma, que no cambia de un mapa a otro. */
    this._geoms = new Map()
    this._mallas = []
    this._zocalos = null
    this.peanas = []
    this.scenario = null
    /** Por peana: si se la ve (último corte) y cuándo toca volver a preguntar. */
    this._vista = new Uint8Array(0)
    this._proxima = new Float64Array(0)
    this._orden = new Int32Array(0)
    this._dist = new Float64Array(0)
    /** El pool de fichas: tantas como `fichasMax`, y nunca más. */
    this._fichas = []
    for (let i = 0; i < PEANAS.fichasMax; i++) {
      const dom = nameplateElement()
      dom.root.classList.add('nameplate--peana')
      const sprite = new CSS3DSprite(dom.root)
      sprite.visible = false
      cssScene.add(sprite)
      this._fichas.push({ dom, sprite, arma: null })
    }
    /** Cuántas fichas se ven este frame, para los bancos. */
    this.fichasVisibles = 0
  }

  /** Monta las peanas de un escenario, o ninguna. */
  montar(scenario) {
    this._desmontar()
    this.scenario = scenario
    this.peanas = scenario?.reglas?.modo === 'peanas' ? scenario.peanas : []
    const n = this.peanas.length
    this._vista = new Uint8Array(n)
    this._proxima = new Float64Array(n)
    this._orden = new Int32Array(n)
    this._dist = new Float64Array(n)
    if (!n) return
    this._zocalos = new THREE.InstancedMesh(this._geomZocalo, this._matZocalo, n)
    this._zocalos.raycast = () => {}
    this._zocalos.frustumCulled = false
    for (let i = 0; i < n; i++) {
      const p = this.peanas[i]
      _m.makeTranslation(p.x, p.y, p.z)
      this._zocalos.setMatrixAt(i, _m)
    }
    this.group.add(this._zocalos)
    const porArma = new Map()
    for (let i = 0; i < n; i++) {
      const a = this.peanas[i].arma
      if (!porArma.has(a)) porArma.set(a, [])
      porArma.get(a).push(i)
    }
    for (const [arma, indices] of porArma) {
      if (!this._geoms.has(arma)) this._geoms.set(arma, geometriaDeArma(arma))
      const geom = this._geoms.get(arma)
      if (!geom) continue
      const malla = new THREE.InstancedMesh(geom, this._matArma, indices.length)
      malla.raycast = () => {}
      malla.frustumCulled = false
      malla.userData.indices = indices
      this.group.add(malla)
      this._mallas.push(malla)
    }
  }

  _desmontar() {
    for (const m of this._mallas) { this.group.remove(m); m.dispose() }
    this._mallas.length = 0
    if (this._zocalos) { this.group.remove(this._zocalos); this._zocalos.dispose(); this._zocalos = null }
    for (const f of this._fichas) f.sprite.visible = false
    this.peanas = []
  }

  /**
   * Una vez por frame, con la pose de dibujo: el vaivén de las armas encaradas y qué fichas
   * se ven. `now` es el reloj de pared; el vaivén es decoración y no del mundo.
   */
  update(camera, now) {
    const n = this.peanas.length
    this.fichasVisibles = 0
    if (!n) return
    // Cada arma encarada a la cámara en planta, con su vaivén: una matriz por
    // instancia, sin asignar nada. El vaivén va desfasado por peana para que
    // una fila de ellas no suba y baje a la vez como un solo objeto.
    const o = camera.position
    const fase = (now / 1000) * PEANAS.vaivenPorSegundo * Math.PI * 2
    for (const malla of this._mallas) {
      const indices = malla.userData.indices
      for (let k = 0; k < indices.length; k++) {
        const i = indices[k]
        const p = this.peanas[i]
        _q.setFromAxisAngle(_y, Math.atan2(o.x - p.x, o.z - p.z))
        _p.set(p.x, p.y + PEANAS.alturaArmaU + Math.sin(fase + i * 1.7) * PEANAS.vaivenU, p.z)
        _m.compose(_p, _q, _s)
        malla.setMatrixAt(k, _m)
      }
      malla.instanceMatrix.needsUpdate = true
    }

    // Las fichas: las más cercanas de las que se ven, delante y al alcance.
    camera.getWorldDirection(_frente)
    let cortes = PEANAS.cortesPorFrame
    let candidatas = 0
    const lejos2 = PEANAS.fichaDistanciaU * PEANAS.fichaDistanciaU
    const cerca2 = PEANAS.fichaMinU * PEANAS.fichaMinU
    for (let i = 0; i < n; i++) {
      const p = this.peanas[i]
      const dx = p.x - o.x
      const dy = p.y + PEANAS.alturaArmaU - o.y
      const dz = p.z - o.z
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 > lejos2 || d2 < cerca2 || dx * _frente.x + dy * _frente.y + dz * _frente.z <= 0) continue
      if (now >= this._proxima[i] && cortes > 0) {
        cortes -= 1
        this._proxima[i] = now + PEANAS.recompruebaMs
        this._vista[i] = this.scenario.peanaALaVista(i, o.x, o.y, o.z) ? 1 : 0
      }
      if (!this._vista[i]) continue
      this._orden[candidatas] = i
      this._dist[candidatas] = d2
      candidatas += 1
    }
    // Las `fichasMax` más cercanas, por selección: con seis fichas y ciento
    // sesenta peanas son mil comparaciones, sin ordenar ni asignar.
    for (let f = 0; f < this._fichas.length; f++) {
      const ficha = this._fichas[f]
      let mejor = -1
      for (let c = 0; c < candidatas; c++) {
        if (this._orden[c] < 0) continue
        if (mejor < 0 || this._dist[c] < this._dist[mejor]) mejor = c
      }
      if (mejor < 0) { ficha.sprite.visible = false; continue }
      const i = this._orden[mejor]
      this._orden[mejor] = -1
      const p = this.peanas[i]
      const distancia = Math.sqrt(this._dist[mejor])
      const escala = Math.min(MARKERS.maxScale, Math.max(1, distancia / MARKERS.referenceDistance))
      ficha.sprite.position.set(p.x, p.y + PEANAS.alturaArmaU + 0.55 * escala, p.z)
      ficha.sprite.scale.setScalar(escala / MARKERS.nameplate.pixelsPerUnit)
      ficha.sprite.visible = true
      this.fichasVisibles += 1
      if (ficha.arma !== p.arma) {
        const forma = WEAPON_PATHS[p.arma]
        if (forma) {
          ficha.dom.weapon.setAttribute('viewBox', forma.viewBox)
          ficha.dom.path.setAttribute('d', forma.d)
        }
        ficha.dom.nick.textContent = WEAPONS[p.arma]?.label ?? p.arma
        ficha.arma = p.arma
      }
    }
  }

  dispose() {
    this._desmontar()
    for (const f of this._fichas) { this.cssScene.remove(f.sprite); f.dom.root.remove() }
    for (const g of this._geoms.values()) g?.dispose()
    this._geomZocalo.dispose()
    this._matArma.dispose()
    this._matZocalo.dispose()
    this.scene.remove(this.group)
  }
}
