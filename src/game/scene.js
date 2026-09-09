/**
 * Construcción de la escena: fondo negro y una sala de líneas finas.
 *
 * Todo es `LineSegments` con `LineBasicMaterial` — sin luces, sin sombras, sin
 * materiales PBR. La grilla es regular (1 unidad) y con acentos cada
 * `ROOM.accentEvery`, de modo que sirve como sistema de coordenadas legible
 * para los patrones de aparición que vengan más adelante.
 */

import * as THREE from 'three'
import { COLORS, ROOM } from '../config.js'

/**
 * Genera la geometría de una grilla plana en el plano XY, centrada en el
 * origen. Devuelve dos arrays de vértices: líneas normales y líneas de acento.
 */
function buildGridGeometries(width, height, step, accentEvery) {
  const base = []
  const accent = []
  const halfW = width / 2
  const halfH = height / 2

  const isAccent = (value) => {
    const n = Math.round(value / step)
    return n % accentEvery === 0
  }

  // Líneas verticales (recorren la altura).
  for (let x = -halfW; x <= halfW + 1e-6; x += step) {
    const target = isAccent(x + halfW) ? accent : base
    target.push(x, -halfH, 0, x, halfH, 0)
  }
  // Líneas horizontales (recorren el ancho).
  for (let y = -halfH; y <= halfH + 1e-6; y += step) {
    const target = isAccent(y + halfH) ? accent : base
    target.push(-halfW, y, 0, halfW, y, 0)
  }

  const toGeometry = (vertices) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    return geometry
  }

  return { base: toGeometry(base), accent: toGeometry(accent) }
}

/**
 * Un plano de grilla como `THREE.Group` (líneas base + líneas de acento),
 * orientado en XY y listo para posicionar/rotar.
 */
function createGridPlane(width, height, materials) {
  const { base, accent } = buildGridGeometries(width, height, ROOM.step, ROOM.accentEvery)
  const group = new THREE.Group()
  group.add(new THREE.LineSegments(base, materials.base))
  group.add(new THREE.LineSegments(accent, materials.accent))
  return group
}

/**
 * Crea la escena completa.
 * @returns {{ scene: THREE.Scene, dispose: () => void }}
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

  const { width, depth, height } = ROOM
  const halfW = width / 2
  const halfD = depth / 2

  const room = new THREE.Group()

  // Suelo (plano XZ, y = 0).
  const floor = createGridPlane(width, depth, floorMaterials)
  floor.rotation.x = -Math.PI / 2
  room.add(floor)

  // Pared frontal (-Z) y trasera (+Z).
  const front = createGridPlane(width, height, wallMaterials)
  front.position.set(0, height / 2, -halfD)
  room.add(front)

  const back = createGridPlane(width, height, wallMaterials)
  back.position.set(0, height / 2, halfD)
  room.add(back)

  // Paredes laterales (±X).
  const left = createGridPlane(depth, height, wallMaterials)
  left.rotation.y = Math.PI / 2
  left.position.set(-halfW, height / 2, 0)
  room.add(left)

  const right = createGridPlane(depth, height, wallMaterials)
  right.rotation.y = -Math.PI / 2
  right.position.set(halfW, height / 2, 0)
  room.add(right)

  scene.add(room)

  const dispose = () => {
    room.traverse((object) => {
      if (object.isLineSegments) object.geometry.dispose()
    })
    wallMaterials.base.dispose()
    wallMaterials.accent.dispose()
    floorMaterials.base.dispose()
    floorMaterials.accent.dispose()
  }

  return { scene, dispose }
}
