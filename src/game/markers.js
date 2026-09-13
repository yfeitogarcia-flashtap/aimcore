/**
 * **Lo que se ve encima de un muñeco**: la brújula de orientación y los dos
 * iconos de estado.
 *
 * Todo vive en el mundo, no en la interfaz. No es un capricho de estilo: son
 * datos **de un sitio concreto del mapa**, y una lista en una esquina de la
 * pantalla obliga a traducir «hay dos» a «cuáles», que es justo el trabajo que
 * se quería ahorrar.
 *
 * **Tres piezas y dos comportamientos distintos, a propósito:**
 *
 *  - **La brújula** dice hacia dónde mira el muñeco, y por eso **no se
 *    billboardea**: va paralela al suelo y gira sólo en yaw. Un triángulo que se
 *    girase hacia la cámara apuntaría siempre al jugador y no diría nada. Está
 *    siempre que el muñeco esté: es orientación pasiva, no un aviso.
 *  - **Los iconos `?` y `!`** sí se billboardean, como cualquier icono flotante:
 *    lo que tienen que hacer es leerse. `?` mientras el muñeco te ha visto y aún
 *    no dispara, `!` mientras te dispara. Son situacionales y se apagan al
 *    perder el contacto o al caer el muñeco — lo segundo sale solo, porque un
 *    muñeco que no está vivo no tiene marcador.
 *
 * **Un marcador no encoge con la distancia más allá de `referenceDistance`.**
 * A 30 u —el largo del Plano A— un icono de tamaño de mundo son cuatro píxeles,
 * y lo que no se ve no se cuenta. A partir de esa distancia el marcador escala
 * con ella, de modo que conserva su tamaño en pantalla, con un tope para que de
 * cerca no tape al muñeco.
 *
 * **Los glifos son geometría, no una textura.** Aquí no hay assets de ningún
 * tipo, tampoco un lienzo con texto pintado: el `!` son dos polígonos y el `?`
 * es un arco muestreado, construidos una vez y compartidos por todo el pool.
 *
 * No decide nada: le dan el pool y en qué fase está cada muñeco (`phaseOf`, de
 * `enemyFire.js`) y coloca. Si algún día hay más estados, la máquina sigue
 * estando en un solo sitio.
 */

import * as THREE from 'three'
import { COLORS, MARKERS, TARGET_TYPES } from '../config.js'

/** Altura del muñeco en unidades de su radio, igual que en `enemyFire.js`. */
const DUMMY_HEIGHT = TARGET_TYPES.hitbox.parts.reduce(
  (top, part) => Math.max(top, part.offsetY + (part.height ?? part.radius * 2) / 2),
  0,
)

/**
 * **La brújula.** Un triángulo isósceles en el plano XZ, con la punta hacia +Z
 * —la convención de yaw de todo el motor: la dirección de `facing` es
 * `(sin yaw, 0, cos yaw)`— y los dos vértices de la cola levantados `rise`.
 *
 * Ese levantamiento es lo único que no es un triángulo plano, y está medido: con
 * la brújula perfectamente plana el jugador la ve **de canto** —su cabeza y la
 * del muñeco están a la misma altura— y desaparece. Con la cola arriba, de perfil
 * queda una cuña cuya pendiente sigue diciendo hacia dónde apunta.
 */
function compassGeometry(height) {
  const length = MARKERS.compass.length * height
  const width = MARKERS.compass.width * height
  const rise = MARKERS.compass.rise * height
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        0, 0, length / 2,
        -width / 2, rise, -length / 2,
        width / 2, rise, -length / 2,
      ],
      3,
    ),
  )
  // Las dos caras: se mira desde arriba y desde abajo según dónde esté el
  // muñeco, y una cara sola desaparece por el lado malo.
  geometry.setIndex([0, 1, 2, 0, 2, 1])
  return geometry
}

/** Un rectángulo centrado en (cx, cy), como polígono para `THREE.Shape`. */
function barShape(cx, cy, width, height) {
  const shape = new THREE.Shape()
  shape.moveTo(cx - width / 2, cy - height / 2)
  shape.lineTo(cx + width / 2, cy - height / 2)
  shape.lineTo(cx + width / 2, cy + height / 2)
  shape.lineTo(cx - width / 2, cy + height / 2)
  shape.closePath()
  return shape
}

/**
 * **El `!`**: una barra que se afina hacia abajo y un punto separado. Se afina
 * porque una barra recta más un cuadrado se lee como dos rectángulos sueltos.
 */
function bangShapes(size) {
  const w = size * 0.22
  const stem = new THREE.Shape()
  stem.moveTo(-w / 2, size / 2)
  stem.lineTo(w / 2, size / 2)
  stem.lineTo(w * 0.34, -size * 0.08)
  stem.lineTo(-w * 0.34, -size * 0.08)
  stem.closePath()
  return [stem, barShape(0, -size * 0.38, w * 0.86, w * 0.86)]
}

/**
 * **El `?`**: un arco de 250° muestreado como banda —no hay tipografía de la que
 * sacarlo— más el tallo y el punto.
 */
function queryShapes(size) {
  const thickness = size * 0.2
  const radius = size * 0.26
  const from = Math.PI * 1.42
  const to = -Math.PI * 0.22
  const steps = 14
  const outer = []
  const inner = []
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const cy = size * 0.22
    outer.push([cos * (radius + thickness / 2), cy + sin * (radius + thickness / 2)])
    inner.push([cos * (radius - thickness / 2), cy + sin * (radius - thickness / 2)])
  }
  const arc = new THREE.Shape()
  arc.moveTo(outer[0][0], outer[0][1])
  for (let i = 1; i < outer.length; i++) arc.lineTo(outer[i][0], outer[i][1])
  for (let i = inner.length - 1; i >= 0; i--) arc.lineTo(inner[i][0], inner[i][1])
  arc.closePath()

  // El tallo baja desde el final del arco hasta encima del punto.
  const end = outer[outer.length - 1]
  const stem = barShape((end[0] + inner[inner.length - 1][0]) / 2 * 0.4, -size * 0.06, thickness, size * 0.3)
  return [arc, stem, barShape(0, -size * 0.38, thickness, thickness)]
}

/** Un glifo: sus formas fusionadas en una sola geometría plana. */
function glyphGeometry(shapes) {
  return new THREE.ShapeGeometry(shapes)
}

export class DummyMarkers {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene
    this.enabled = false
    this.radius = 0
    /** @type {Array<object>} un juego de marcadores por ranura del pool */
    this.slots = []
    this._geometries = []

    this._compassMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLORS.facing),
      transparent: true,
      opacity: MARKERS.compass.opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this._alertMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.alert) })
    this._threatMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.threat) })
    this._materials = [this._compassMaterial, this._alertMaterial, this._threatMaterial]
  }

  /** Sólo donde hay quien dispare: la misma condición que `enemyFire`. */
  setEnabled(value) {
    this.enabled = Boolean(value)
    if (!this.enabled) this._hideAll()
  }

  /**
   * Monta un juego de marcadores por ranura del pool. Se llama al cambiar de
   * tamaño de diana o de pool, no por frame.
   *
   * @param {number} count ranuras del pool
   * @param {number} radius radio con el que están dibujados los muñecos
   */
  build(count, radius) {
    this.dispose()
    this.radius = radius
    const height = DUMMY_HEIGHT * radius
    const compass = compassGeometry(height)
    const iconSize = MARKERS.icon.size * height
    const bang = glyphGeometry(bangShapes(iconSize))
    const query = glyphGeometry(queryShapes(iconSize))
    this._geometries.push(compass, bang, query)

    this.compassY = height + MARKERS.compass.gap * height
    this.iconY = this.compassY + MARKERS.icon.gap * height + iconSize / 2

    for (let i = 0; i < count; i++) {
      const group = new THREE.Group()
      group.visible = false
      // La brújula cuelga de su propio grupo: el de fuera lleva la posición y la
      // escala por distancia, y éste el yaw. Así el icono no hereda el giro.
      const needle = new THREE.Mesh(compass, this._compassMaterial)
      needle.position.y = this.compassY
      group.add(needle)

      const alert = new THREE.Mesh(query, this._alertMaterial)
      alert.position.y = this.iconY
      alert.visible = false
      group.add(alert)

      const threat = new THREE.Mesh(bang, this._threatMaterial)
      threat.position.y = this.iconY
      threat.visible = false
      group.add(threat)

      this.scene.add(group)
      this.slots.push({ group, needle, alert, threat })
    }
  }

  /**
   * Coloca los marcadores del frame.
   *
   * @param {number} now
   * @param {Array<object>} instances el pool, tal cual
   * @param {THREE.Camera} camera
   * @param {(instance: object, now: number) => string} phaseOf de `enemyFire`
   */
  update(now, instances, camera, phaseOf) {
    if (!this.enabled || this.slots.length === 0) return
    for (let i = 0; i < instances.length && i < this.slots.length; i++) {
      const instance = instances[i]
      const slot = this.slots[i]
      if (instance.state !== 'alive') {
        slot.group.visible = false
        continue
      }
      const position = instance.group.position
      slot.group.visible = true
      slot.group.position.copy(position)
      slot.needle.rotation.y = instance.facing

      // Tamaño aparente: más allá de la distancia de referencia el marcador
      // crece con ella y deja de encoger en pantalla.
      const distance = camera.position.distanceTo(position)
      const scale = Math.min(MARKERS.maxScale, Math.max(1, distance / MARKERS.referenceDistance))
      slot.group.scale.setScalar(scale)

      const phase = phaseOf(instance, now)
      slot.alert.visible = phase === 'alert'
      slot.threat.visible = phase === 'firing'
      // Los iconos sí miran a la cámara: lo suyo es leerse, no orientar.
      if (slot.alert.visible || slot.threat.visible) {
        slot.alert.quaternion.copy(camera.quaternion)
        slot.threat.quaternion.copy(camera.quaternion)
      }
    }
    for (let i = instances.length; i < this.slots.length; i++) this.slots[i].group.visible = false
  }

  _hideAll() {
    for (const slot of this.slots) slot.group.visible = false
  }

  dispose() {
    for (const slot of this.slots) this.scene.remove(slot.group)
    for (const geometry of this._geometries) geometry.dispose()
    this.slots = []
    this._geometries = []
  }

  /** Al cerrar del todo: los materiales se comparten y se sueltan una vez. */
  disposeMaterials() {
    this.dispose()
    for (const material of this._materials) material.dispose()
  }
}
