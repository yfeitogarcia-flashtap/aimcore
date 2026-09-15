/**
 * **El adaptador de cámara.** `movement.js` guarda la posición del jugador en
 * `camera.position` y lee el rumbo de `camera.rotation.y`, y no toca nada más
 * de la cámara: catorce sitios, todos `position.{x,y,z}` o `rotation.y`. Eso es
 * exactamente lo que hay aquí, en un objeto plano.
 *
 * Con esto el módulo de movimiento entero —colisión, salto, air-strafe, peso del
 * arma— corre en Node sin navegador, sin three y sin cambiar una línea. En el
 * cliente no se usa para el movimiento: allí la cámara de verdad ya tiene esta
 * forma. Sí se usa para `cuerpoDeJugador`, abajo.
 */
import { playerBody } from '../src/game/player.js'
export function crearPose(x = 0, y = 0, z = 0, yaw = 0) {
  return {
    position: {
      x,
      y,
      z,
      set(nx, ny, nz) {
        this.x = nx
        this.y = ny
        this.z = nz
        return this
      },
    },
    rotation: { y: yaw },
  }
}

/** Una cámara de mentira que sólo tiene lo que `playerBody` le pide. */
const _falsa = { position: { x: 0, y: 0, z: 0 } }

/**
 * **El cuerpo de un jugador a partir de números sueltos.** Es `playerBody` del
 * juego, sin una segunda fórmula: las tres alturas de zona salen de
 * `TARGET_TYPES.hitbox.parts` escaladas por la altura de ojos, igual que cuando
 * te disparan los muñecos. El día que cambie el modelo de zonas, cambia aquí
 * solo.
 *
 * Lo usan el historial del servidor —para rebobinar— y el cliente, para
 * resolver contra el rival tal como lo está dibujando.
 */
export function cuerpoDeJugador(x, z, feetY, eyeHeight) {
  _falsa.position.x = x
  _falsa.position.z = z
  return playerBody(_falsa, eyeHeight, feetY)
}
