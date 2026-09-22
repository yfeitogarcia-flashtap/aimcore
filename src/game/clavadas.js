/**
 * **Los cuchillos clavados** (vuelta 90): lo primero de Vektor que un jugador
 * deja en el mundo y que se puede volver a coger.
 *
 * Hasta aquí todo lo que salía de un arma **terminaba**. Una bala se resuelve
 * con un rayo en el paso en que sale, una flecha revienta contra lo que toque y
 * una granada estalla: al acabar un vuelo, la ranura del pool queda libre y del
 * proyectil no queda nada. El Fang no — se clava donde cayó y **se queda**,
 * hasta que empiece la ronda siguiente o alguien pase por encima.
 *
 * Por eso es un módulo aparte y no un estado más de `proyectiles.js`: lo que
 * hay aquí **no vuela**. No tiene parábola, ni reloj, ni gravedad, ni choca con
 * nada; tiene una posición, un rumbo para dibujarlo y un identificador. Meterlo
 * en el pool de vuelo habría sido pasear por el bucle caliente, sesenta veces
 * por segundo, objetos que ya no se mueven.
 *
 * **Y no importa three**, igual que `proyectiles.js` y `movement.js`: esto lo
 * monta el motor en el navegador **y `net/partida.js` en Node**, porque en el
 * duelo quién recoge un cuchillo lo decide el servidor —es inventario, y eso lo
 * reparte él desde la vuelta 64—. Lo que se ve sale de `vuelo.js`, que es donde
 * ya vive el dibujo de un proyectil.
 *
 * Dos decisiones que son el diseño:
 *
 * - **El identificador lo pone quien manda.** En el duelo lo asigna el
 *   servidor y viaja en el mensaje; en el entrenamiento lo pone el motor. No se
 *   deriva de la ranura del pool ni del número de serie del vuelo, porque
 *   ninguno de los dos vale entre extremos: el cliente y el servidor lanzan sus
 *   proyectiles en órdenes distintos bajo latencia, así que un número de serie
 *   suyo nombraría cosas distintas en cada pantalla.
 * - **El alcance se mide desde el pecho**, no desde los pies. Un cuchillo
 *   clavado en una pared a la altura de la cara se coge pasando por delante, y
 *   uno clavado a tres metros hay que saltar a por él. Con los pies como
 *   centro, lo primero sería inalcanzable y lo segundo se cogería desde la
 *   barbilla — una sola esfera bien puesta contesta las dos cosas.
 */

import { CLAVADAS } from '../config.js'

export class Clavadas {
  constructor(pool = CLAVADAS.pool) {
    this.pool = pool
    /** Identificador, y **cero es ranura libre**. Lo pone quien planta. */
    this.id = new Int32Array(pool)
    this.x = new Float64Array(pool)
    this.y = new Float64Array(pool)
    this.z = new Float64Array(pool)
    /** Con qué rumbo llegó, unitario: es lo único que necesita quien la dibuja. */
    this.dx = new Float64Array(pool)
    this.dy = new Float64Array(pool)
    this.dz = new Float64Array(pool)
    /** De quién era. No decide nada hoy; lo lee quien quiera contar algo. */
    this.dueno = new Array(pool).fill(null)
    this.vivas = 0
    this._siguienteId = 1
  }

  /**
   * **Un identificador nuevo.** Sólo lo llama quien manda en el mundo: el
   * servidor en el duelo y el motor en el entrenamiento. Un cliente de una
   * partida en red **no lo llama nunca** — sus cuchillos los nombra el
   * servidor, que es lo que hace que los tres extremos hablen de la misma cosa.
   */
  nuevoId() {
    return this._siguienteId++
  }

  /**
   * **Clava una.** Si ese identificador ya está puesto no hace nada: en red el
   * mensaje puede repetirse, y plantar dos veces la misma dejaría una que nunca
   * se podría recoger del todo.
   *
   * @returns {boolean} si ha entrado
   */
  plantar({ id, x, y, z, dx = 0, dy = 0, dz = -1, dueno = null }) {
    if (!(id > 0)) return false
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false
    let libre = -1
    for (let i = 0; i < this.pool; i++) {
      if (this.id[i] === id) return false
      if (libre < 0 && this.id[i] === 0) libre = i
    }
    /**
     * **Un pool lleno no tira la más vieja**, que es la regla de
     * `proyectiles.js`: lo que ya está en el mundo se queda. Con el tope de
     * `CLAVADAS.pool` por encima de lo que dos jugadores pueden llevar, esto no
     * ocurre jugando — y si ocurriera, perder la que acaba de caer es mejor que
     * borrarle a alguien la que ya sabía dónde estaba.
     */
    if (libre < 0) return false
    this.id[libre] = id
    this.x[libre] = x
    this.y[libre] = y
    this.z[libre] = z
    const largo = Math.hypot(dx, dy, dz)
    if (largo > 1e-6) {
      this.dx[libre] = dx / largo
      this.dy[libre] = dy / largo
      this.dz[libre] = dz / largo
    } else {
      this.dx[libre] = 0
      this.dy[libre] = 0
      this.dz[libre] = -1
    }
    this.dueno[libre] = dueno
    this.vivas += 1
    return true
  }

  /** La quita, por identificador. @returns {boolean} si estaba */
  quitar(id) {
    if (!(id > 0)) return false
    for (let i = 0; i < this.pool; i++) {
      if (this.id[i] !== id) continue
      this.id[i] = 0
      this.dueno[i] = null
      this.vivas -= 1
      return true
    }
    return false
  }

  /**
   * **Todas fuera.** Lo llama una ronda que empieza, por lo mismo que apaga los
   * proyectiles en vuelo (vuelta 85): un cambio de fase tira lo que quedaba del
   * mundo anterior.
   */
  limpiar() {
    this.id.fill(0)
    this.dueno.fill(null)
    this.vivas = 0
  }

  /**
   * **¿Hay alguna al alcance de quien está ahí?**, y devuelve su identificador
   * o 0. Se mide desde el pecho (ver la cabecera del módulo) y gana la más
   * cercana, que es lo que hace que pasar entre dos recoja la de al lado y no
   * la de detrás.
   *
   * Es una distancia por cuchillo y por paso, con el pool en ocho: no asigna
   * nada y no toca el presupuesto.
   *
   * @param {number} x,feetY,z dónde están los pies de quien pasa
   */
  alAlcanceDe(x, feetY, z, alcance = CLAVADAS.alcanceU) {
    if (this.vivas === 0) return 0
    const cy = feetY + CLAVADAS.alturaDelPechoU
    const max = alcance * alcance
    let mejor = 0
    let mejorD = Infinity
    for (let i = 0; i < this.pool; i++) {
      if (this.id[i] === 0) continue
      const ex = this.x[i] - x
      const ey = this.y[i] - cy
      const ez = this.z[i] - z
      const d = ex * ex + ey * ey + ez * ez
      if (d > max || d >= mejorD) continue
      mejorD = d
      mejor = this.id[i]
    }
    return mejor
  }
}
