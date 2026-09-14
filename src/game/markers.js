/**
 * **Lo que se ve encima de un muñeco**: la brújula, los dos iconos de estado y
 * la ficha de identificación.
 *
 * Todo vive en el mundo, no en la interfaz. No es un capricho de estilo: son
 * datos **de un sitio concreto del mapa**, y una lista en una esquina de la
 * pantalla obliga a traducir «hay dos» a «cuáles», que es justo el trabajo que
 * se quería ahorrar.
 *
 * **Tres capas, de abajo arriba, y cada una con su regla:**
 *
 *  1. **La brújula** (verde, volumen 3D, *siempre*). Dice hacia dónde mira el
 *     muñeco, y por eso **no se billboardea**: gira sólo en yaw. Un marcador que
 *     se girase hacia la cámara apuntaría siempre al jugador y no diría nada.
 *     Es volumen y no un triángulo plano porque un triángulo plano a la altura
 *     de los ojos —que es la altura normal— se ve de canto y ocupa cero píxeles
 *     (medido, `docs/decisions.md` §37.4).
 *  2. **Los iconos `?` y `!`** (billboard, *situacionales*). `?` mientras el
 *     muñeco te ha visto y aún no dispara, `!` mientras te dispara. Se
 *     billboardean porque lo suyo es leerse, no orientar.
 *  3. **La ficha arma + nick** (billboard, *condicionada*). Sale tras mantener
 *     la mira encima `MARKERS.nameplate.dwellMs`, nunca por estar a la vista: una
 *     ficha por muñeco visible sería una pantalla de rótulos. Es DOM en el
 *     espacio (`CSS3DRenderer`), igual que era el tablero de acciones, para
 *     reutilizar la tipografía y la silueta del arma que ya existen.
 *
 * **Un marcador no encoge con la distancia más allá de `referenceDistance`.**
 * A 30 u —el largo del Plano A— un icono de tamaño de mundo son cuatro píxeles,
 * y lo que no se ve no se cuenta.
 *
 * **Los glifos son geometría, no una textura.** Aquí no hay assets de ningún
 * tipo, tampoco un lienzo con texto pintado: el `!` son dos polígonos y el `?`
 * es un arco muestreado, construidos una vez y compartidos por todo el pool.
 *
 * No decide nada del juego: le dan el pool y en qué fase está cada muñeco
 * (`phaseOf`, de `enemyFire.js`) y coloca.
 */

import * as THREE from 'three'
import { CSS3DSprite } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { COLORS, ENEMY, MARKERS, TARGET_TYPES, WEAPONS } from '../config.js'
import { WEAPON_PATHS } from '../ui/weaponPaths.js'

/** Altura del muñeco en unidades de su radio, igual que en `enemyFire.js`. */
const DUMMY_HEIGHT = TARGET_TYPES.hitbox.parts.reduce(
  (top, part) => Math.max(top, part.offsetY + (part.height ?? part.radius * 2) / 2),
  0,
)

const DEG_TO_RAD = Math.PI / 180

// Vectores de módulo: el bucle no aloca.
const _toTarget = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _origin = new THREE.Vector3()
const _dir = new THREE.Vector3()

/**
 * **La brújula.** Una cuña: rectángulo en la cola y punta en el morro, con el
 * morro hacia +Z —la convención de yaw de todo el motor: la dirección de
 * `facing` es `(sin yaw, 0, cos yaw)`—.
 *
 * Desde arriba se lee como un triángulo que apunta; de canto, como una cuña que
 * baja hacia la punta. Las dos lecturas dicen lo mismo, que es de lo que se
 * trata: la referencia (`avatar-compass.png`) la dibuja precisamente de perfil.
 */
function compassGeometry(height) {
  const l = MARKERS.compass.length * height
  const w = MARKERS.compass.width * height
  const h = MARKERS.compass.height * height
  // **El morro cae.** A media altura de la cola la cuña es simétrica de perfil y
  // de frente y de espaldas se ve la misma silueta; con el morro por debajo, el
  // perfil tiene pendiente y la pendiente **apunta**. Es una segunda señal de
  // orientación, independiente del claro/oscuro de la cola: una es de forma y la
  // otra de tono, y se leen en sitios distintos —la forma de perfil, el tono de
  // frente—.
  const noseY = h / 2 - MARKERS.compass.noseDrop * h
  const positions = [
    // Cola: cuatro esquinas.
    -w / 2, 0, -l / 2,
    w / 2, 0, -l / 2,
    w / 2, h, -l / 2,
    -w / 2, h, -l / 2,
    // Morro: un solo vértice.
    0, noseY, l / 2,
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex([
    // Las cuatro caras que van al morro.
    0, 1, 4,
    1, 2, 4,
    2, 3, 4,
    3, 0, 4,
    // Tapa de la cola, en su propio grupo: lleva otro material.
    0, 2, 1, 0, 3, 2,
  ])
  // **Dos tonos, y no es decoración.** Visto justo de frente o justo de espaldas,
  // la silueta de una cuña es la misma —el rectángulo de la cola— y sin luces en
  // la escena no hay sombreado que las separe: un muñeco encarado y uno de
  // espaldas se verían igual. Con la tapa de la cola en un verde más oscuro, de
  // frente se ve el claro y de espaldas el oscuro.
  geometry.addGroup(0, 12, 0)
  geometry.addGroup(12, 6, 1)
  geometry.computeBoundingSphere()
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

  const end = outer[outer.length - 1]
  const stem = barShape(((end[0] + inner[inner.length - 1][0]) / 2) * 0.4, -size * 0.06, thickness, size * 0.3)
  return [arc, stem, barShape(0, -size * 0.38, thickness, thickness)]
}

/**
 * La ficha: dos filas de DOM, silueta arriba y nick debajo. Se construye a mano
 * y no con React porque vive en la escena del `CSS3DRenderer`, fuera del árbol.
 */
function nameplateElement() {
  const root = document.createElement('div')
  root.className = 'nameplate'
  const weapon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  weapon.setAttribute('class', 'nameplate__weapon')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  weapon.appendChild(path)
  const nick = document.createElement('span')
  nick.className = 'nameplate__nick'
  root.appendChild(weapon)
  root.appendChild(nick)
  return { root, weapon, path, nick }
}

export class DummyMarkers {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Scene} cssScene escena paralela del `CSS3DRenderer`
   */
  constructor(scene, cssScene) {
    this.scene = scene
    this.cssScene = cssScene
    this.enabled = false
    this.radius = 0
    /** @type {Array<object>} un juego de marcadores por ranura del pool */
    this.slots = []
    this._geometries = []
    this.occluders = []
    this._ray = new THREE.Raycaster()

    this._compassMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLORS.action),
      // Las cuatro caras de la cuña: se mira desde cualquier lado.
      side: THREE.DoubleSide,
      // **Empujada un pelo hacia atrás** para que el contorno gane el desempate
      // de profundidad. Sin esto, la línea y la cara están exactamente en el
      // mismo plano y el contorno aparece a trozos según el ángulo.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    /** La tapa de la cola, más oscura: es lo que separa «de frente» de «de espaldas». */
    this._compassTailMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLORS.action).multiplyScalar(MARKERS.compass.tailShade),
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    /**
     * **El contorno negro de la brújula.** La misma técnica que las aristas de
     * la cobertura y del marcador del explosivo: `EdgesGeometry` sobre la propia
     * malla y `LineSegments` encima, o sea el mismo volumen dibujado dos veces y
     * ningún vértice escrito aparte.
     *
     * Lo que resuelve: la brújula es verde y se dibuja sobre lo que haya detrás
     * —una caja gris clara, un muñeco naranja, la rejilla—. Sin borde, contra una
     * cara clara pierde el filo y la cuña deja de leerse como cuña, que es de
     * donde sale la orientación.
     */
    this._compassEdgeMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(COLORS.outline),
      // **A media opacidad, que es lo único que se puede afinar de una línea en
      // WebGL** —`linewidth` se ignora—. Medido en la vuelta 41: devuelve el
      // anillo exterior de píxeles que el negro entero borraba (116 px contra
      // 75 a 12 u) y conserva el 96% del filo que compra contra la cobertura
      // clara. El porqué completo, en `MARKERS.compass.outlineOpacity`.
      transparent: MARKERS.compass.outlineOpacity < 1,
      opacity: MARKERS.compass.outlineOpacity,
    })
    this._alertMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.alert) })
    this._threatMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.threat) })
    this._materials = [
      this._compassMaterial,
      this._compassTailMaterial,
      this._compassEdgeMaterial,
      this._alertMaterial,
      this._threatMaterial,
    ]

    this._cosCone = Math.cos(MARKERS.nameplate.coneDeg * DEG_TO_RAD)
  }

  /** Sólo donde hay quien dispare: la misma condición que `enemyFire`. */
  setEnabled(value) {
    this.enabled = Boolean(value)
    if (!this.enabled) this._hideAll()
  }

  /** La geometría del escenario, para el único rayo que lanza esto. */
  setOccluders(occluders) {
    this.occluders = occluders || []
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
    // El contorno sale de la propia cuña, no de una lista de aristas escrita a
    // mano: si el morro cambia de altura, el borde cambia con él.
    const compassEdges = new THREE.EdgesGeometry(compass)
    const iconSize = MARKERS.icon.size * height
    const bang = new THREE.ShapeGeometry(bangShapes(iconSize))
    const query = new THREE.ShapeGeometry(queryShapes(iconSize))
    this._geometries.push(compass, compassEdges, bang, query)

    /**
     * **Dónde va cada capa, y por qué en dos trozos.**
     *
     * La altura de un marcador sobre la cabeza es `bodyTop + offset · escala`:
     * la coronilla **no** escala con la distancia —está donde está— y la pila
     * de marcadores sí, porque su tamaño también. Multiplicar la altura entera
     * por la escala, que es lo que hacía el grupo escalado sin más, manda los
     * marcadores a volar tres cuerpos por encima de un muñeco lejano.
     */
    this.bodyTop = height
    this.compassOffset = MARKERS.compass.gap * height
    this.iconOffset =
      this.compassOffset + MARKERS.compass.height * height + MARKERS.icon.gap * height + iconSize / 2
    this.plateOffset = this.iconOffset + iconSize / 2 + MARKERS.nameplate.gap * height

    for (let i = 0; i < count; i++) {
      const group = new THREE.Group()
      group.visible = false
      const needle = new THREE.Mesh(compass, [this._compassMaterial, this._compassTailMaterial])
      // El contorno cuelga de la aguja, así que hereda su giro en yaw y el
      // escalado de tamaño aparente sin una segunda escritura por frame.
      needle.add(new THREE.LineSegments(compassEdges, this._compassEdgeMaterial))
      group.add(needle)

      const alert = new THREE.Mesh(query, this._alertMaterial)
      alert.visible = false
      group.add(alert)

      const threat = new THREE.Mesh(bang, this._threatMaterial)
      threat.visible = false
      group.add(threat)

      // La ficha va en la escena del CSS3DRenderer, que es otra escena: se
      // coloca en mundo, no colgada del grupo.
      const dom = nameplateElement()
      const plate = new CSS3DSprite(dom.root)
      plate.scale.setScalar(1 / MARKERS.nameplate.pixelsPerUnit)
      plate.visible = false
      this.cssScene.add(plate)

      this.scene.add(group)
      this.slots.push({
        group,
        needle,
        alert,
        threat,
        plate,
        dom,
        /** Cuánto lleva la mira encima, y hasta cuándo sigue puesta la ficha. */
        dwellMs: 0,
        plateUntil: 0,
        /** Lo que se comprobó de cobertura, y cuándo toca volver a mirarlo. */
        clear: false,
        nextCheckAt: 0,
        /** Lo último que se escribió en el DOM, para no tocarlo por frame. */
        shownNick: null,
        shownWeapon: null,
      })
    }
  }

  /**
   * Coloca los marcadores del frame.
   *
   * @param {number} now
   * @param {number} deltaMs tiempo de juego; en pausa, cero
   * @param {Array<object>} instances el pool, tal cual
   * @param {THREE.Camera} camera
   * @param {(instance: object, now: number) => string} phaseOf de `enemyFire`
   */
  update(now, deltaMs, instances, camera, phaseOf) {
    if (!this.enabled || this.slots.length === 0) return
    camera.getWorldDirection(_forward)
    let rayBudget = MARKERS.nameplate.raysPerFrame

    for (let i = 0; i < instances.length && i < this.slots.length; i++) {
      const instance = instances[i]
      const slot = this.slots[i]
      if (instance.state !== 'alive') {
        slot.group.visible = false
        slot.plate.visible = false
        slot.dwellMs = 0
        slot.plateUntil = 0
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
      // El grupo va escalado, así que las alturas se dividen por la escala para
      // que la coronilla no se mueva: en mundo queda `bodyTop + offset · escala`.
      const anchor = this.bodyTop / scale
      slot.needle.position.y = anchor + this.compassOffset
      slot.alert.position.y = anchor + this.iconOffset
      slot.threat.position.y = anchor + this.iconOffset

      const phase = phaseOf(instance, now)
      slot.alert.visible = phase === 'alert'
      slot.threat.visible = phase === 'firing'
      // Los iconos sí miran a la cámara: lo suyo es leerse, no orientar.
      if (slot.alert.visible || slot.threat.visible) {
        slot.alert.quaternion.copy(camera.quaternion)
        slot.threat.quaternion.copy(camera.quaternion)
      }

      rayBudget = this._updateNameplate(now, deltaMs, instance, slot, camera, distance, scale, rayBudget)
    }
    for (let i = instances.length; i < this.slots.length; i++) {
      this.slots[i].group.visible = false
      this.slots[i].plate.visible = false
    }
  }

  /**
   * **La ficha, y la única decisión de este módulo**: se enseña a quien lleves
   * un rato apuntando, o a un compañero siempre.
   *
   * El «apuntando» se mide **por ángulo**, no con un rayo por frame: un rayo por
   * muñeco y por frame es justo lo que el presupuesto no admite, la misma regla
   * que la visión del enemigo. El rayo se lanza una sola vez, al cumplirse el
   * tiempo, para descartar que haya cobertura por medio, y se repite cada
   * `recheckMs` mientras la ficha siga puesta.
   */
  _updateNameplate(now, deltaMs, instance, slot, camera, distance, scale, rayBudget) {
    const plate = slot.plate
    // El día que haya equipos, a un compañero se le ve la ficha siempre: no hay
    // que apuntar a alguien para saber quién es si juega contigo.
    const friendly = instance.friendly === true

    _toTarget.copy(instance.group.position)
    // **A la cabeza, no al centro del cuerpo.** Por ángulo daría igual, pero este
    // mismo vector es el que se usa para el rayo de cobertura, y ahí no da igual:
    // asomado por encima de una caja, lo que se ve de un muñeco es la cabeza, y
    // un rayo al pecho choca contra la caja y dejaría sin ficha justo al que
    // estás mirando.
    _toTarget.y += this.bodyTop * MARKERS.nameplate.aimHeight
    _toTarget.sub(camera.position)
    const length = _toTarget.length()
    const aiming = length > 1e-3 && _toTarget.dot(_forward) / length >= this._cosCone

    if (aiming && deltaMs > 0) slot.dwellMs += deltaMs
    else if (!aiming) slot.dwellMs = 0

    if (friendly || (aiming && slot.dwellMs >= MARKERS.nameplate.dwellMs)) {
      // Un solo rayo, y sólo cuando toca: al cumplirse el tiempo y cada
      // `recheckMs`. Sin presupuesto, se queda con lo que sabía.
      if (!friendly && now >= slot.nextCheckAt && rayBudget > 0) {
        rayBudget -= 1
        slot.nextCheckAt = now + MARKERS.nameplate.recheckMs
        slot.clear = !this._blocked(camera.position, _toTarget, length)
      }
      if (friendly || slot.clear) slot.plateUntil = now + MARKERS.nameplate.holdMs
    }

    const show = friendly || now < slot.plateUntil
    plate.visible = show
    if (!show) return rayBudget

    // La ficha va **sin escalar con la distancia**: es DOM, y el CSS3DSprite ya
    // la mantiene de frente. Lo que sí sigue es la misma corrección de tamaño
    // aparente que el resto, para que a 30 u se siga leyendo.
    plate.position.copy(instance.group.position)
    plate.position.y += this.bodyTop + this.plateOffset * scale
    plate.scale.setScalar(scale / MARKERS.nameplate.pixelsPerUnit)

    const nick = instance.nick ?? ''
    const weaponKey = instance.weaponKey ?? ENEMY.weapon
    if (nick !== slot.shownNick) {
      slot.dom.nick.textContent = nick
      slot.shownNick = nick
    }
    if (weaponKey !== slot.shownWeapon) {
      const shape = WEAPON_PATHS[weaponKey]
      if (shape) {
        slot.dom.weapon.setAttribute('viewBox', shape.viewBox)
        slot.dom.path.setAttribute('d', shape.d)
      }
      slot.dom.root.title = WEAPONS[weaponKey]?.label ?? ''
      slot.shownWeapon = weaponKey
    }
    return rayBudget
  }

  /** ¿Hay geometría del escenario entre la cámara y la ficha? */
  _blocked(origin, direction, distance) {
    if (this.occluders.length === 0) return false
    _origin.copy(origin)
    _dir.copy(direction).normalize()
    this._ray.set(_origin, _dir)
    this._ray.near = 0
    this._ray.far = distance - 0.2
    const hit = this._ray.intersectObjects(this.occluders, false)
    this._ray.far = Infinity
    return hit.length > 0
  }

  _hideAll() {
    for (const slot of this.slots) {
      slot.group.visible = false
      slot.plate.visible = false
    }
  }

  dispose() {
    for (const slot of this.slots) {
      this.scene.remove(slot.group)
      this.cssScene.remove(slot.plate)
      slot.dom.root.remove()
    }
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
