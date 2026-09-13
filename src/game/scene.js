/**
 * Construcción de la escena: fondo negro y una sala de líneas finas.
 *
 * Todo es `LineSegments` con `LineBasicMaterial` — sin luces, sin sombras, sin
 * materiales PBR. La grilla es regular (1 unidad) y con acentos cada
 * `ROOM.accentEvery`, de modo que sirve como sistema de coordenadas legible
 * para los patrones de aparición que vengan más adelante.
 *
 * El generador de líneas está en `grid.js`: el avatar lleva **esta misma
 * grilla** como piel, y dos copias se habrían separado a la primera.
 */

import * as THREE from 'three'
import { COLORS, ROOM } from '../config.js'
import { buildGridGeometries } from './grid.js'

/**
 * Un plano de grilla como `THREE.Group` (líneas base + líneas de acento),
 * orientado en XY y listo para posicionar/rotar.
 */
function createGridPlane(width, height, materials, room) {
  const { base, accent } = buildGridGeometries(width, height, room.step, room.accentEvery)
  const group = new THREE.Group()
  group.add(new THREE.LineSegments(base, materials.base))
  group.add(new THREE.LineSegments(accent, materials.accent))
  return group
}

/**
 * Crea la escena completa.
 *
 * La sala se monta aparte, con `setRoom`, porque **cada escenario trae la
 * suya**: el Plano A vive en 40×40 y la sala vacía en 80×80. Reconstruirla es
 * tirar cuatro paredes y un suelo de líneas, así que se hace entero en lugar de
 * escalar el grupo: escalando, el paso de la grilla dejaría de ser una unidad y
 * el suelo ya no serviría de sistema de coordenadas.
 *
 * @returns {{ scene: THREE.Scene, setRoom: (room: object) => void, dispose: () => void }}
 */
export function createScene() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLORS.background)

  // Materiales compartidos por todos los planos: 4 en total, no uno por pared.
  const wallMaterials = {
    base: new THREE.LineBasicMaterial({ color: COLORS.grid }),
    accent: new THREE.LineBasicMaterial({ color: COLORS.gridAccent }),
  }
  const floorMaterials = {
    base: new THREE.LineBasicMaterial({ color: COLORS.gridFloor }),
    accent: new THREE.LineBasicMaterial({ color: COLORS.gridFloorAccent }),
  }

  /** @type {THREE.Group | null} */
  let group = null
  /** Medidas montadas ahora mismo, para no rehacer la sala sin motivo. */
  let current = null

  const disposeGroup = () => {
    if (!group) return
    group.traverse((object) => {
      if (object.isLineSegments) object.geometry.dispose()
    })
    scene.remove(group)
    group = null
  }

  const setRoom = (room = ROOM) => {
    if (current && current.width === room.width && current.depth === room.depth &&
        current.height === room.height && current.step === room.step &&
        current.accentEvery === room.accentEvery) {
      return
    }
    disposeGroup()
    current = room

    const { width, depth, height } = room
    const halfW = width / 2
    const halfD = depth / 2
    group = new THREE.Group()

    // Suelo (plano XZ, y = 0).
    const floor = createGridPlane(width, depth, floorMaterials, room)
    floor.rotation.x = -Math.PI / 2
    group.add(floor)

    // Pared frontal (-Z) y trasera (+Z).
    const front = createGridPlane(width, height, wallMaterials, room)
    front.position.set(0, height / 2, -halfD)
    group.add(front)

    const back = createGridPlane(width, height, wallMaterials, room)
    back.position.set(0, height / 2, halfD)
    group.add(back)

    // Paredes laterales (±X).
    const left = createGridPlane(depth, height, wallMaterials, room)
    left.rotation.y = Math.PI / 2
    left.position.set(-halfW, height / 2, 0)
    group.add(left)

    const right = createGridPlane(depth, height, wallMaterials, room)
    right.rotation.y = -Math.PI / 2
    right.position.set(halfW, height / 2, 0)
    group.add(right)

    scene.add(group)
  }

  setRoom(ROOM)

  const dispose = () => {
    disposeGroup()
    wallMaterials.base.dispose()
    wallMaterials.accent.dispose()
    floorMaterials.base.dispose()
    floorMaterials.accent.dispose()
  }

  return { scene, setRoom, dispose }
}
