/**
 * Panel de acciones rápidas dentro de la sala.
 *
 * Tiene dos mitades que van sincronizadas:
 *  - Lo que se ve es DOM colocado en el espacio con `CSS3DRenderer`, así que
 *    hereda la tipografía y el verde de marca de la hoja de estilos sin tener
 *    que repintarlos en WebGL.
 *  - Lo que se dispara son planos invisibles en la escena WebGL, uno por
 *    botón, colgados de un grupo con la misma transformación que el tablero.
 *    Compartir transformación es lo que mantiene alineados el dibujo y el
 *    blanco sin repetir la trigonometría en dos sitios.
 *
 * El DOM no recibe eventos de puntero: con el ratón capturado no habría
 * clicks, y la única forma de accionarlo es dispararle.
 */

import * as THREE from 'three'
import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { ACTION_PANEL, ROOM, actionPanelMetrics } from '../config.js'

/** Botones, en el orden en que aparecen. */
const BUTTONS = [
  { id: 'pause', label: 'Pausa' },
  { id: 'restart', label: 'Reiniciar' },
  { id: 'weapon', label: 'Arma' },
  { id: 'suppressor', label: 'Silenciador' },
  { id: 'options', label: 'Opciones' },
]

export class ActionPanel {
  /**
   * @param {THREE.Scene} scene escena WebGL, para los planos de impacto
   * @param {THREE.Scene} cssScene escena paralela del CSS3DRenderer
   */
  constructor(scene, cssScene) {
    this.scene = scene
    this.cssScene = cssScene
    this._needsLayout = true

    this.element = document.createElement('div')
    this.element.className = 'action-panel'
    this.element.style.width = `${ACTION_PANEL.widthPx}px`
    this.element.style.height = `${ACTION_PANEL.heightPx}px`

    this.buttons = new Map()
    for (const definition of BUTTONS) {
      const button = document.createElement('div')
      button.className = 'action-panel__button'
      const label = document.createElement('span')
      label.className = 'action-panel__label'
      label.textContent = definition.label
      const value = document.createElement('span')
      value.className = 'action-panel__value'
      button.append(label, value)
      this.element.append(button)
      this.buttons.set(definition.id, { element: button, value, mesh: null })
    }

    // Tablero: a la derecha del punto de aparición, mirando hacia él.
    this.object = new CSS3DObject(this.element)
    this.object.rotation.y = -Math.PI / 2
    cssScene.add(this.object)

    // Los planos viven en un grupo con la misma transformación, de modo que
    // basta colocarlos en coordenadas de píxel del tablero.
    this.group = new THREE.Group()
    this.group.rotation.copy(this.object.rotation)
    scene.add(this.group)

    this._hitMaterial = new THREE.MeshBasicMaterial()
    this._activeMeshes = []
    this._applyRoom(ROOM)
  }

  /**
   * Adopta las medidas de una sala. El tablero se encoge con ella —misma
   * distancia angular desde el jugador, misma altura de mirada— en lugar de
   * quedarse a tamaño de sala grande: con la sala a 40, un tablero de 19.8 u
   * ocuparía media planta y no habría dónde poner nada.
   */
  _applyRoom(room) {
    const metrics = actionPanelMetrics(room)
    this._metrics = metrics
    this._maxX = metrics.maxX
    // El tablero mide `widthPx * scale` de ancho y está girado para mirar a -X,
    // así que se extiende a lo largo de Z: media anchura a cada lado del ancla.
    this._halfSpan = metrics.halfSpan
    this._maxZ = room.depth / 2 - this._halfSpan - ACTION_PANEL.wallOffset
    this.object.position.set(metrics.distance, metrics.height, this.object.position.z)
    this.object.scale.setScalar(metrics.scale)
    this.group.position.copy(this.object.position)
    this.group.scale.copy(this.object.scale)
  }

  /**
   * Mantiene la distancia con el jugador.
   *
   * El tablero se queda donde lo pone el anclaje al spawn mientras el jugador
   * ande por su sitio. Si se acerca, se aparta en lugar de plantársele delante
   * —ahora que la sala se recorre entera, se puede llegar hasta él—, y nunca
   * pasa de la pared.
   */
  /**
   * Ancla el tablero al punto de aparición del jugador. Hasta que hubo
   * escenarios el spawn era siempre el origen y bastaba con dejarlo en z = 0;
   * ahora cada escenario aparece donde quiere y el tablero lo sigue, o se
   * quedaría a media sala del jugador.
   *
   * La Z se acota para que el tablero entero quepa dentro de la sala: con el
   * ancla pegada a la pared trasera, media pizarra se saldría por detrás.
   */
  setAnchor(spawn, room = ROOM) {
    this._applyRoom(room)
    const z = Math.max(-this._maxZ, Math.min(this._maxZ, spawn ? spawn.z : 0))
    this.object.position.z = z
    this.group.position.z = z
  }

  /** Volumen que el escenario debe dejar libre para que el tablero quepa. */
  get clearVolume() {
    const metrics = this._metrics
    return {
      minX: metrics.distance,
      maxX: this._maxX,
      minZ: this.object.position.z - this._halfSpan,
      maxZ: this.object.position.z + this._halfSpan,
      minY: metrics.height - metrics.halfHeight,
      maxY: metrics.height + metrics.halfHeight,
    }
  }

  follow(camera) {
    const wanted = Math.max(this._metrics.distance, camera.position.x + this._metrics.minDistance)
    const x = Math.min(wanted, this._maxX)
    if (x === this.object.position.x) return
    this.object.position.x = x
    this.group.position.x = x
  }

  /** Refresca etiquetas y qué botones están disponibles. */
  update({ weaponLabel, suppressorSupported, suppressorEnabled }) {
    const weapon = this.buttons.get('weapon')
    if (weapon.value.textContent !== weaponLabel) {
      weapon.value.textContent = weaponLabel
      this._needsLayout = true
    }

    const suppressor = this.buttons.get('suppressor')
    const estado = suppressorEnabled ? 'activado' : 'desactivado'
    if (suppressor.value.textContent !== estado) suppressor.value.textContent = estado
    suppressor.element.classList.toggle('action-panel__button--on', suppressorEnabled)
    // El botón desaparece con las armas que no admiten silenciador, y con él
    // su plano de impacto: no se puede disparar a lo que no está.
    if (suppressor.element.hidden !== !suppressorSupported) {
      suppressor.element.hidden = !suppressorSupported
      this._needsLayout = true
    }
  }

  /**
   * Alinea los planos de impacto con la caja real de cada botón. Se hace sobre
   * el DOM ya maquetado en lugar de calcular la rejilla a mano, así que el
   * blanco sigue al diseño aunque cambien los estilos.
   */
  syncLayout() {
    if (!this._needsLayout) return
    // El CSS3DRenderer inserta el elemento al primer render; hasta entonces no
    // hay maquetación de la que leer.
    if (this.element.offsetWidth === 0) return

    const halfWidth = ACTION_PANEL.widthPx / 2
    const halfHeight = ACTION_PANEL.heightPx / 2
    this._activeMeshes.length = 0

    for (const [id, button] of this.buttons) {
      const element = button.element
      if (element.hidden) {
        if (button.mesh) button.mesh.visible = false
        continue
      }
      const width = element.offsetWidth
      const height = element.offsetHeight
      if (!button.mesh) {
        button.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._hitMaterial)
        // Invisible pero presente: el raycaster de three no filtra por
        // visibilidad, así que sigue sirviendo de blanco.
        button.mesh.visible = false
        button.mesh.userData.buttonId = id
        this.group.add(button.mesh)
      }
      button.mesh.scale.set(width, height, 1)
      button.mesh.position.set(
        element.offsetLeft + width / 2 - halfWidth,
        // El DOM crece hacia abajo y el mundo hacia arriba.
        halfHeight - (element.offsetTop + height / 2),
        1,
      )
      button.mesh.updateMatrixWorld(true)
      this._activeMeshes.push(button.mesh)
    }
    this._needsLayout = false
  }

  /**
   * @returns {string | null} el botón alcanzado, o null si el disparo no da en
   *   el tablero. Es un raycast aparte del de las dianas.
   */
  raycast(raycaster) {
    if (this._activeMeshes.length === 0) return null
    const hits = raycaster.intersectObjects(this._activeMeshes, false)
    if (hits.length === 0) return null
    // La distancia sale de aquí para que el motor pueda decidir por proximidad
    // entre el tablero y lo que haya por delante.
    return { buttonId: hits[0].object.userData.buttonId, distance: hits[0].distance }
  }

  dispose() {
    this.cssScene.remove(this.object)
    this.scene.remove(this.group)
    this.element.remove()
    for (const button of this.buttons.values()) button.mesh?.geometry.dispose()
    this._hitMaterial.dispose()
  }
}
