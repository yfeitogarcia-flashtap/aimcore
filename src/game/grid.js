/**
 * La grilla: un generador de líneas y nada más.
 *
 * Vivía dentro de `scene.js`, que es quien monta el suelo y las paredes. Desde
 * que el avatar lleva **la misma grilla** encima —su skin de serie es negro con
 * esta rejilla— hay dos sitios que la necesitan, y copiarla habría dejado dos
 * grillas que se parecen hasta que alguien toque una.
 *
 * Lo único que cambia entre la sala y el cuerpo es el **paso**: 1 unidad para
 * una sala de 40, y `AVATAR.gridStep` para un torso de 0.6, donde un paso de 1
 * daría una sola línea. Misma función, misma convención de acentos.
 */

import * as THREE from 'three'

/**
 * Vértices de una grilla plana en XY, centrada en el origen, partida en dos
 * listas: líneas normales y líneas de acento.
 *
 * @param {number} width anchura total
 * @param {number} height altura total
 * @param {number} step separación entre líneas
 * @param {number} accentEvery una de cada cuántas líneas es de acento
 * @returns {{ base: THREE.BufferGeometry, accent: THREE.BufferGeometry }}
 */
export function buildGridGeometries(width, height, step, accentEvery) {
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

  return { base: toGeometry(base), accent: toGeometry(accent) }
}

function toGeometry(vertices) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  return geometry
}
