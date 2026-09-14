/**
 * **El adaptador de cámara.** `movement.js` guarda la posición del jugador en
 * `camera.position` y lee el rumbo de `camera.rotation.y`, y no toca nada más
 * de la cámara: catorce sitios, todos `position.{x,y,z}` o `rotation.y`. Eso es
 * exactamente lo que hay aquí, en un objeto plano.
 *
 * Con esto el módulo de movimiento entero —colisión, salto, air-strafe, peso del
 * arma— corre en Node sin navegador, sin three y sin cambiar una línea. En el
 * cliente no se usa: allí la cámara de verdad ya tiene esta forma.
 */
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
