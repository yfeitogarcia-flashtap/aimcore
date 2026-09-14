/**
 * **Línea de visión: un solo sitio.**
 *
 * La pregunta «¿se ve eso desde aquí?» se hace en tres sitios distintos del
 * motor —al elegir dónde nace un muñeco (`targets.js`), al decidir si la
 * brújula y la ficha se dibujan encima de él (`markers.js`) y al medir cuánto
 * tapa la cobertura en las auditorías— y hasta la vuelta 42 cada uno tenía su
 * copia del mismo raycast, con su propia holgura. Dos copias de una fórmula es
 * cómo se desincronizan: la brújula salía sobre muñecos que el sistema de
 * aparición consideraba tapados.
 *
 * Lo que hace es lo mínimo: un rayo contra la geometría del escenario. Quién lo
 * llama, con qué frecuencia y con qué presupuesto de frame **no es cosa de
 * aquí** —es un raycast contra todo el escenario y no cabe por frame, así que
 * cada llamante lo reparte como le toca (`ENEMY.sightCheckMs`,
 * `MARKERS.sight.recheckMs`)—.
 *
 * Cero alocaciones por llamada salvo la lista de impactos, que la devuelve
 * three.js.
 */

import * as THREE from 'three'

const _dir = new THREE.Vector3()
const _ray = new THREE.Raycaster()

/**
 * **La holgura del final del rayo.** Se para un pelo antes del objetivo: sin
 * ella, la propia cobertura pegada a un muñeco —la caja tras la que se asoma—
 * cuenta como obstáculo y nada se ve nunca.
 */
export const SIGHT_SLACK = 0.15

/**
 * ¿Hay línea de visión entre dos puntos del mundo?
 *
 * @param {THREE.Vector3} origin desde dónde se mira
 * @param {THREE.Vector3} target qué se mira
 * @param {Array<THREE.Object3D>} occluders geometría del escenario
 * @returns {boolean} true si nada se interpone (y también sin escenario)
 */
export function hasLineOfSight(origin, target, occluders) {
  if (!occluders || occluders.length === 0) return true

  _dir.subVectors(target, origin)
  const distance = _dir.length()
  if (distance <= 1e-4) return true
  _dir.multiplyScalar(1 / distance)

  _ray.set(origin, _dir)
  _ray.near = 0
  _ray.far = distance - SIGHT_SLACK
  const hits = _ray.intersectObjects(occluders, false)
  _ray.far = Infinity
  return hits.length === 0
}
