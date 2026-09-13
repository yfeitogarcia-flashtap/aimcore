/**
 * **Recogibles del escenario**: cruces de vida, cargas de escudo y el casco.
 *
 * Es la versión provisional de lo que algún día saldrá de una economía. Hoy no
 * se compran: están puestos a mano en el mapa (ver `pickups` en `SCENARIOS`) y
 * se cogen **por proximidad**, sin tecla y sin apuntar — la tecla contextual es
 * del explosivo y meter aquí una segunda cosa que hace `E` sería exactamente lo
 * que se decidió no hacer en la vuelta 33.
 *
 * Quien decide si un recogible se consume **no es este módulo**: pregunta por
 * callback y, si el jugador no tenía hueco —inventario lleno, vida al máximo—,
 * el objeto se queda donde está. Aquí sólo hay geometría y proximidad.
 *
 * Los marcadores son sólidos facetados sin textura, como todo lo demás, y giran
 * y se balancean despacio: es lo que hace que se lean como objeto y no como una
 * esquina de la cobertura.
 */

import * as THREE from 'three'
import { COLORS, PICKUPS } from '../config.js'

const _playerXZ = new THREE.Vector3()

/** Altura de una posición: un número, o una clave del vocabulario de cobertura. */
function resolveY(value, coverHeights) {
  if (typeof value === 'number') return value
  return coverHeights[value] ?? 0
}

/**
 * Geometría de cada clase. Sin texturas y sin luces: lo que las distingue es la
 * silueta y el color, no un icono pegado.
 */
function createGeometry(kind, size) {
  switch (kind) {
    case 'health': {
      // Una cruz: dos prismas cruzados. Se lee a distancia y de cualquier lado.
      const bar = new THREE.BoxGeometry(size * 2.4, size * 0.8, size * 0.8)
      const post = new THREE.BoxGeometry(size * 0.8, size * 2.4, size * 0.8)
      const merged = new THREE.BufferGeometry()
      const positions = [
        ...bar.getAttribute('position').array,
        ...post.getAttribute('position').array,
      ]
      const index = [
        ...bar.getIndex().array,
        ...Array.from(post.getIndex().array, (i) => i + bar.getAttribute('position').count),
      ]
      merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      merged.setIndex(index)
      bar.dispose()
      post.dispose()
      return merged
    }
    case 'helmet':
      // Media esfera de pocos lados: un casco es lo único con forma de cabeza.
      return new THREE.SphereGeometry(size * 1.2, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2)
    case 'shield':
    default:
      // La carga: el mismo octaedro que el núcleo del avatar, y el mismo azul.
      return new THREE.OctahedronGeometry(size * 1.3)
  }
}

const COLOR_BY_KIND = {
  health: COLORS.health,
  shield: COLORS.electric,
  helmet: COLORS.gear,
}

export class PickupField {
  /**
   * @param {THREE.Scene} scene
   * @param {object} coverHeights `COVER.heights`, para los sitios elevados
   * @param {(kind: string) => boolean} onCollect devuelve si se consume
   */
  constructor(scene, coverHeights, onCollect) {
    this.scene = scene
    this.coverHeights = coverHeights
    this.onCollect = onCollect
    /** @type {Array<object>} */
    this.items = []
    this._geometries = []
    this._materials = new Map()
    this.active = false
  }

  /** ¿Este escenario trae recogibles? */
  get available() {
    return this.items.length > 0
  }

  /**
   * Monta los recogibles de un escenario. Se llama al cambiar de escenario, no
   * por sesión: las mallas se quedan y lo que cambia es si están visibles.
   */
  setSites(sites) {
    this.clear()
    this._dispose()
    for (const site of sites ?? []) {
      const geometry = createGeometry(site.kind, PICKUPS.size)
      this._geometries.push(geometry)
      const color = COLOR_BY_KIND[site.kind] ?? COLORS.health
      let material = this._materials.get(color)
      if (!material) {
        material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
        this._materials.set(color, material)
      }
      const mesh = new THREE.Mesh(geometry, material)
      const y = resolveY(site.y, this.coverHeights)
      mesh.position.set(site.x, y + PICKUPS.standY, site.z)
      mesh.visible = false
      this.scene.add(mesh)
      this.items.push({
        id: site.id,
        kind: site.kind,
        zone: site.zone,
        mesh,
        baseY: y + PICKUPS.standY,
        taken: false,
        respawnAt: 0,
      })
    }
  }

  /** Arranca una sesión: todo vuelve a estar en su sitio. */
  begin() {
    this.active = true
    for (const item of this.items) {
      item.taken = false
      item.respawnAt = 0
      item.mesh.visible = true
    }
  }

  /** Apaga el campo: fuera de sesión no hay nada que recoger ni que dibujar. */
  clear() {
    this.active = false
    for (const item of this.items) item.mesh.visible = false
  }

  /**
   * Avance por frame: giro, balanceo, reapariciones y recogida.
   *
   * La recogida es **una distancia al cuadrado por objeto**, no un raycast: con
   * ocho objetos son ocho restas, y cabe de sobra en el presupuesto.
   *
   * @param {number} deltaSeconds cero en pausa, como todo lo demás
   */
  update(now, deltaSeconds, camera) {
    if (!this.active) return
    const spin = (PICKUPS.spinRpm / 60) * Math.PI * 2 * deltaSeconds
    const bob = Math.sin(now * 0.001 * PICKUPS.bobHz * Math.PI * 2) * PICKUPS.bobUnits
    const radiusSq = PICKUPS.radius * PICKUPS.radius
    _playerXZ.copy(camera.position)

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]
      if (item.taken) {
        if (now < item.respawnAt) continue
        item.taken = false
        item.mesh.visible = true
      }
      item.mesh.rotation.y += spin
      item.mesh.position.y = item.baseY + bob

      const dx = _playerXZ.x - item.mesh.position.x
      const dz = _playerXZ.z - item.mesh.position.z
      const dy = _playerXZ.y - item.baseY
      if (dx * dx + dz * dz > radiusSq) continue
      // La vertical se mira con más manga: el jugador mide casi dos unidades y
      // la cámara está en los ojos, así que el objeto le queda por los pies.
      if (Math.abs(dy) > PICKUPS.radius * 2.5) continue

      if (!this.onCollect(item.kind)) continue
      item.taken = true
      item.respawnAt = now + PICKUPS.respawnMs
      item.mesh.visible = false
    }
  }

  _dispose() {
    for (const item of this.items) this.scene.remove(item.mesh)
    for (const geometry of this._geometries) geometry.dispose()
    this._geometries = []
    this.items = []
  }

  dispose() {
    this._dispose()
    for (const material of this._materials.values()) material.dispose()
    this._materials.clear()
  }
}
