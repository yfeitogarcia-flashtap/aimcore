/**
 * **Resolver un disparo: un solo sitio** (vuelta 46).
 *
 * Lo llaman los dos extremos y por eso vive aparte:
 *
 * - El **servidor**, contra el cuerpo del rival **rebobinado** al instante que
 *   el tirador tenía en pantalla. Ése es el veredicto que cuenta.
 * - El **cliente**, contra el cuerpo del rival **tal como lo está dibujando**,
 *   que es literalmente lo que hay en la pantalla en el momento del clic.
 *
 * Comparar los dos veredictos es la medida de si la compensación de retraso
 * funciona, y esa medida sólo significa algo si el código es el mismo: dos
 * copias de la fórmula y una discrepancia ya no diría nada de la red.
 *
 * Por debajo no hay nada nuevo. `hitPlayer` es el corte analítico contra el
 * cilindro por zonas que el juego ya usa para los muñecos que te disparan, y
 * `hasLineOfSight` es el único raycast de «¿se ve eso desde aquí?» del motor.
 * Aquí sólo se les llama en el orden correcto: primero el corte, que es
 * aritmética, y **sólo si entra** el rayo contra la cobertura, que es caro. Es
 * el mismo reparto que hace `engine._isBlockedByCover`.
 */
import * as THREE from 'three'
import { NET } from '../src/config.js'
import { hitPlayer, zoneDamage } from '../src/game/player.js'
import { hasLineOfSight } from '../src/game/sight.js'

const _origen = new THREE.Vector3()
const _impacto = new THREE.Vector3()
const _dir = { x: 0, y: 0, z: 0 }

/**
 * **A dónde apunta la mira.** Con el orden YXZ de la cámara del juego, mirar al
 * frente es −Z y mirar arriba es +Y.
 */
export function direccionDeMira(yaw, pitch, out = _dir) {
  const cp = Math.cos(pitch)
  out.x = -Math.sin(yaw) * cp
  out.y = Math.sin(pitch)
  out.z = -Math.cos(yaw) * cp
  return out
}

/**
 * @param {{x:number,y:number,z:number}} origen los ojos del tirador
 * @param {number} yaw rumbo **del clic**, no el del paso
 * @param {number} pitch
 * @param {object} cuerpo el del rival, de `cuerpoDeJugador`
 * @param {Array} oclusores geometría del escenario, o vacío
 * @param {string|null} arma con qué se dispara. Desde la vuelta 70 el daño no
 *   es sólo de la zona: la Scout mata de una al cuerpo y eso lo declara el arma
 *   (`damageScale`). Sin ella, el daño es el del modelo de zonas de siempre.
 * @returns {{impacto:boolean, zona:string|null, distancia:number, dano:number, tapado:boolean}}
 */
export function resolverDisparo(origen, yaw, pitch, cuerpo, oclusores, arma = null) {
  const fallo = { impacto: false, zona: null, distancia: 0, dano: 0, tapado: false }
  if (!cuerpo) return fallo

  const dir = direccionDeMira(yaw, pitch)
  const golpe = hitPlayer(origen, dir, cuerpo, NET.shotRange)
  if (!golpe) return fallo

  // Sólo a lo que entra se le gasta rayo. Y el rayo va al **punto de impacto**,
  // no al centro del cuerpo: disparar a la cabeza asomada por encima de una
  // caja no puede fallar porque el pecho esté tapado.
  if (oclusores && oclusores.length > 0) {
    _origen.set(origen.x, origen.y, origen.z)
    _impacto.set(
      origen.x + dir.x * golpe.distance,
      origen.y + dir.y * golpe.distance,
      origen.z + dir.z * golpe.distance,
    )
    if (!hasLineOfSight(_origen, _impacto, oclusores)) {
      return { impacto: false, zona: null, distancia: golpe.distance, dano: 0, tapado: true }
    }
  }

  return {
    impacto: true,
    zona: golpe.zone,
    distancia: golpe.distance,
    dano: zoneDamage(golpe.zone, arma),
    tapado: false,
  }
}
