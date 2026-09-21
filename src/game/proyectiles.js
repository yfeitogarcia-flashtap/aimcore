/**
 * **Lo que vuela y tarda en llegar** (vuelta 85).
 *
 * Es el modelo, y **no sabe dibujar ni sabe a quién hace daño**: avanza
 * parábolas y dice contra qué han chocado. Las dos cosas que deja fuera son las
 * dos que cambian según quién lo llame — el entrenamiento resuelve contra
 * muñecos con mallas, el servidor contra cuerpos rebobinados— y meterlas aquí
 * sería la segunda implementación que la vuelta 63 prohíbe.
 *
 * Por eso vive aparte y **sin importar three**: lo puede montar el motor, la
 * página del duelo y `net/partida.js` en Node, que es lo mismo que hace
 * `movement.js` con su pose plana.
 *
 * Tres cosas que son el diseño:
 *
 * - **La posición está en forma cerrada.** `p(t) = p0 + v0·t + ½·a·t²`, con `t`
 *   contado desde el lanzamiento. Un paso no suma `v·dt`: evalúa la fórmula en
 *   `t` y en `t − dt` y se queda con el segmento entre las dos. Es la parábola
 *   del salto (vuelta 27) aplicada a otra cosa, y sirve para lo mismo: el
 *   resultado no depende del tamaño del paso, así que los dos extremos de una
 *   partida en red coinciden dígito a dígito.
 * - **El paso es un segmento, no un punto.** Un cohete a 60 u/s avanza una
 *   unidad por paso: comprobar sólo dónde acaba lo dejaría atravesando una
 *   pared de 0.6. Lo que se comprueba es el trozo recorrido, entero.
 * - **Y el pool es fijo y no asigna.** Arrays tipados, un objeto de impacto de
 *   módulo que se reutiliza, y una lista de impactos que se vacía y se vuelve a
 *   llenar. Es el bucle caliente.
 */

import { PROJECTILES } from '../config.js'

/** Los estados de una ranura del pool. */
const LIBRE = 0
const VOLANDO = 1

/**
 * **Dónde está un proyectil a los `t` segundos de salir.**
 *
 * Exportada porque la llama también quien **dibuja la curva antes de
 * disparar**: el láser del arco evalúa esta misma función en veinticuatro
 * instantes, así que lo que se ve y lo que pasa no pueden discrepar — que es la
 * única forma de que una mira de tiro curvo no mienta.
 *
 * @param {object} out donde se escribe. Se reutiliza: esto va en el bucle.
 */
export function puntoDeVuelo(x0, y0, z0, vx, vy, vz, g, t, out) {
  out.x = x0 + vx * t
  out.y = y0 + vy * t - 0.5 * g * t * t
  out.z = z0 + vz * t
  return out
}

export class Proyectiles {
  constructor(pool = PROJECTILES.pool) {
    this.pool = pool
    this.estado = new Uint8Array(pool)
    /** Origen del vuelo, que es de donde se evalúa la parábola. */
    this.x0 = new Float64Array(pool)
    this.y0 = new Float64Array(pool)
    this.z0 = new Float64Array(pool)
    /** Velocidad de salida. */
    this.vx = new Float64Array(pool)
    this.vy = new Float64Array(pool)
    this.vz = new Float64Array(pool)
    /** Gravedad de **este** proyectil: la declara su arma, no el mapa. */
    this.g = new Float64Array(pool)
    /** Segundos de vuelo, que es la `t` de la fórmula. */
    this.t = new Float64Array(pool)
    /** Dónde está ahora, que es lo que lee quien dibuja. */
    this.x = new Float64Array(pool)
    this.y = new Float64Array(pool)
    this.z = new Float64Array(pool)
    /** Qué clase de proyectil es, como índice en el catálogo de quien llama. */
    this.tipo = new Array(pool).fill(null)
    /** De quién es, para no hacerse daño a sí mismo con lo que acaba de salir. */
    this.dueno = new Array(pool).fill(null)
    /** Lo que vale su impacto. Lo interpreta quien lo recibe. */
    this.fuerza = new Float64Array(pool)
    /**
     * **Con cuánta fuerza salió, de 0 a 1.** Es lo único de aquí que existe
     * sólo para que se vea: una flecha a tope se dibuja más larga que una
     * floja, y quien la ve venir tiene que poder distinguirlas. Va aparte de
     * `fuerza` porque son cosas distintas — aquélla es un número de la escala
     * del juego y ésta es una proporción.
     */
    this.intensidad = new Float64Array(pool)
    /**
     * **Cuándo tiene que reventar por su cuenta**, en segundos de vuelo, o
     * `Infinity`. Es lo que una granada cocinada necesita y una flecha no: la
     * flecha revienta al tocar algo, la granada también cuando se le acaba la
     * mecha. Aquí es un número; qué significa reventar lo decide el llamante.
     */
    this.mecha = new Float64Array(pool)
    /** Un número que sube: identifica un vuelo aunque su ranura se reutilice. */
    this.serie = new Int32Array(pool)
    this._siguienteSerie = 1
    this.vivos = 0

    /** Los impactos de este paso. Se vacía y se rellena: no se crea. */
    this.impactos = []
    for (let i = 0; i < pool; i++) {
      this.impactos.push({
        i: 0, serie: 0, tipo: null, dueno: null, fuerza: 0,
        x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0,
        victima: null, zona: null, porMecha: false,
      })
    }
    this._cuantos = 0
    this._p = { x: 0, y: 0, z: 0 }
    this._q = { x: 0, y: 0, z: 0 }
  }

  /** La primera ranura libre, o −1. Un pool lleno **no tira al más viejo**:
   *  un proyectil que desaparece a medio vuelo es peor que uno que no sale. */
  _libre() {
    for (let i = 0; i < this.pool; i++) if (this.estado[i] === LIBRE) return i
    return -1
  }

  /**
   * **Lanza uno.** Devuelve su número de serie, o 0 si no cabía.
   *
   * @param {object} p `{ tipo, dueno, x, y, z, vx, vy, vz, g, fuerza, mechaS }`
   */
  lanzar(p) {
    /**
     * **Un proyectil con un número roto no sale** (vuelta 86). Es la regla de
     * `_guardState` en el movimiento —ningún frame sale con un valor que no sea
     * finito— aplicada aquí, y hace falta por una razón que costó encontrarla:
     * **un `NaN` en la velocidad no choca con nada**, porque ninguna
     * comparación con `NaN` es cierta. El proyectil no se para en la pared, no
     * caduca por distancia y se queda volando para siempre con lo que le
     * cuelgue detrás. Un vuelo que no sale es un fallo que se ve; uno que vuela
     * para siempre es un fallo que degrada en silencio.
     */
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return 0
    if (!Number.isFinite(p.vx) || !Number.isFinite(p.vy) || !Number.isFinite(p.vz)) return 0
    const i = this._libre()
    if (i < 0) return 0
    this.estado[i] = VOLANDO
    this.x0[i] = p.x; this.y0[i] = p.y; this.z0[i] = p.z
    this.x[i] = p.x; this.y[i] = p.y; this.z[i] = p.z
    this.vx[i] = p.vx; this.vy[i] = p.vy; this.vz[i] = p.vz
    this.g[i] = p.g ?? 0
    this.t[i] = 0
    this.tipo[i] = p.tipo ?? null
    this.dueno[i] = p.dueno ?? null
    this.fuerza[i] = p.fuerza ?? 0
    this.intensidad[i] = p.intensidad ?? 1
    this.mecha[i] = Number.isFinite(p.mechaS) ? p.mechaS : Infinity
    const serie = this._siguienteSerie++
    this.serie[i] = serie
    this.vivos += 1
    return serie
  }

  /**
   * **Adelanta un vuelo recién nacido**, por su número de serie.
   *
   * Lo pide el único caso en que un proyectil llega tarde: el del rival, cuyo
   * lanzamiento ha viajado por la red. Se le suma el tiempo perdido **a su
   * reloj**, que con la parábola en forma cerrada es todo lo que hace falta —no
   * hay que simular los pasos que se perdió—. Lo que se paga, y va escrito
   * porque no se adivina: **esos pasos no comprueban choques**, así que un
   * proyectil que hubiera reventado dentro de la ventana aparece pasado su
   * muro. Son 25 ms de viaje típico, o sea 1.3 u con un cohete a 50 u/s, y el
   * paso siguiente ya lo resuelve contra la geometría de verdad.
   */
  adelantar(serie, segundos) {
    if (!(segundos > 0)) return false
    for (let i = 0; i < this.pool; i++) {
      if (this.estado[i] !== VOLANDO || this.serie[i] !== serie) continue
      this.t[i] += segundos
      const p = puntoDeVuelo(this.x0[i], this.y0[i], this.z0[i], this.vx[i], this.vy[i], this.vz[i], this.g[i], this.t[i], this._p)
      this.x[i] = p.x; this.y[i] = p.y; this.z[i] = p.z
      return true
    }
    return false
  }

  /** Apaga una ranura sin que cuente como impacto. Lo usa una ronda que empieza. */
  apagarTodos() {
    this.estado.fill(LIBRE)
    this.vivos = 0
    this._cuantos = 0
  }

  /**
   * **Un paso de mundo.**
   *
   * `dt` va en **segundos** y el reloj de un proyectil es el suyo propio —los
   * segundos que lleva volando— así que no hace falta pasarle ningún instante:
   * es lo que hace que reejecutar una entrada en la reconciliación dé el mismo
   * sitio que la primera vez.
   *
   * @param {number} dt segundos
   * @param {(x0,y0,z0,x1,y1,z1)=>({x,y,z,nx,ny,nz,t}|null)} cortar contra la
   *   geometría. Es `scenario.cortarSegmento`, y se le pasa en vez de
   *   guardarse el escenario para que el servidor le dé el suyo.
   * @param {null|((p)=>({t,victima,zona}|null))} contraCuerpos quién recibe el
   *   golpe. Se le pasa `{ x0,y0,z0, dx,dy,dz, largo, dueno }` y devuelve el
   *   más cercano, o `null`. Fuera lo deciden cosas distintas: el
   *   entrenamiento pregunta a los muñecos, el duelo al cuerpo del rival.
   * @returns {number} cuántos impactos hay en `this.impactos`
   */
  paso(dt, cortar, contraCuerpos = null) {
    this._cuantos = 0
    if (this.vivos === 0) return 0

    for (let i = 0; i < this.pool; i++) {
      if (this.estado[i] !== VOLANDO) continue
      const antes = this.t[i]
      let ahora = antes + dt
      let porMecha = false
      /**
       * **La mecha corta el paso, no lo salta.** Una granada que revienta a
       * mitad de paso tiene que reventar **donde estaba en ese instante**, no
       * donde habría acabado: con pasos de 16.7 ms eso son hasta 90 cm de
       * diferencia en el centro de una explosión, que es la mitad de su radio.
       */
      if (ahora >= this.mecha[i]) { ahora = this.mecha[i]; porMecha = true }

      const p = puntoDeVuelo(this.x0[i], this.y0[i], this.z0[i], this.vx[i], this.vy[i], this.vz[i], this.g[i], antes, this._p)
      const px = p.x, py = p.y, pz = p.z
      const q = puntoDeVuelo(this.x0[i], this.y0[i], this.z0[i], this.vx[i], this.vy[i], this.vz[i], this.g[i], ahora, this._q)

      // **Primero los cuerpos y después la geometría**, y luego gana el más
      // cercano: son dos preguntas sobre el mismo segmento, así que
      // contestarlas por separado y quedarse con la primera sería matar a
      // través de una pared.
      const dx = q.x - px, dy = q.y - py, dz = q.z - pz
      const largo = Math.hypot(dx, dy, dz)
      let mejorT = Infinity
      let victima = null
      let zona = null
      let nx = 0, ny = 1, nz = 0
      let hx = q.x, hy = q.y, hz = q.z

      if (contraCuerpos && largo > 1e-9) {
        const golpe = contraCuerpos({
          x0: px, y0: py, z0: pz,
          dx: dx / largo, dy: dy / largo, dz: dz / largo,
          largo, dueno: this.dueno[i], tipo: this.tipo[i],
        })
        if (golpe && golpe.t <= largo) {
          mejorT = golpe.t / largo
          victima = golpe.victima
          zona = golpe.zona ?? null
          hx = px + dx * mejorT; hy = py + dy * mejorT; hz = pz + dz * mejorT
          // Contra un cuerpo la normal es contra el sentido de la marcha: lo
          // que la usa es la marca, y ahí no hay cara a la que pegarse.
          nx = -dx / largo; ny = -dy / largo; nz = -dz / largo
        }
      }

      const corte = largo > 1e-9 ? cortar(px, py, pz, q.x, q.y, q.z) : null
      if (corte && corte.t < mejorT) {
        mejorT = corte.t
        victima = null
        zona = null
        hx = corte.x; hy = corte.y; hz = corte.z
        nx = corte.nx; ny = corte.ny; nz = corte.nz
      }

      const choca = mejorT < Infinity
      const caduca = !choca && !porMecha && ahora * 1000 > PROJECTILES.vidaMaxMs

      if (!choca && !porMecha && !caduca) {
        this.t[i] = ahora
        this.x[i] = q.x; this.y[i] = q.y; this.z[i] = q.z
        continue
      }

      this.x[i] = hx; this.y[i] = hy; this.z[i] = hz
      this.t[i] = choca ? antes + (ahora - antes) * mejorT : ahora
      this.estado[i] = LIBRE
      this.vivos -= 1
      // Un proyectil que se pasa de tiempo se va sin decir nada: no ha pasado
      // nada en el mundo, y un impacto inventado sería una explosión de la nada.
      if (caduca) continue

      const out = this.impactos[this._cuantos++]
      out.i = i
      out.serie = this.serie[i]
      out.tipo = this.tipo[i]
      out.dueno = this.dueno[i]
      out.fuerza = this.fuerza[i]
      out.x = hx; out.y = hy; out.z = hz
      out.nx = nx; out.ny = ny; out.nz = nz
      out.victima = victima
      out.zona = zona
      // **Por mecha o por choque**, que no es lo mismo para quien lo recibe: una
      // granada que revienta en el aire no deja marca en ninguna pared.
      out.porMecha = porMecha && !choca
    }
    return this._cuantos
  }
}

/**
 * **Cuánto de un efecto de área le llega a un punto** (vuelta 85), entre 0 y 1.
 *
 * Es la caída que comparten el cohete y las tres granadas, y está escrita una
 * sola vez a propósito: tres copias de «más cerca, más fuerte» son tres formas
 * distintas de repartir el mismo daño, y la diferencia se notaría jugando sin
 * que nadie la hubiera decidido.
 *
 * **La caída es lineal y no cuadrática**, que es lo que parecería físico. La
 * razón es de juego: con el cuadrado, la mitad del radio ya vale sólo un cuarto
 * y el área útil se reduce a un punto — el radio declarado diría una cosa y la
 * explosión haría otra. Con la lineal, «a mitad de radio, mitad de efecto» es
 * exactamente lo que se lee.
 *
 * `nucleoU` es el trozo central donde el efecto vale **entero**: sin él, dar de
 * pleno y dar rozando se parecerían demasiado, y lo que el cohete promete es
 * que el impacto directo mata.
 */
export function caidaDeArea(distancia, radioU, nucleoU = 0) {
  if (!(radioU > 0)) return 0
  if (distancia <= nucleoU) return 1
  if (distancia >= radioU) return 0
  return 1 - (distancia - nucleoU) / (radioU - nucleoU)
}

/**
 * **De dónde sale y con qué velocidad lo que lanza un arma** (vuelta 85), y
 * **lo llaman los dos extremos**.
 *
 * Ésta es la pieza que hace que en red no tenga que viajar la trayectoria: el
 * cliente la evalúa para predecir su propia flecha y el servidor la evalúa para
 * lanzarla en su mundo, con los mismos cinco números —origen, rumbo, cabeceo,
 * carga y el arma— y sale la misma parábola. Escrita dos veces sería una flecha
 * que el tirador ve dar y el servidor ve fallar, y la diferencia no sería un
 * error: sería medio metro, que es el ancho de un cuerpo.
 *
 * Es la misma idea que `net/disparo.js` con el rayo (vuelta 46) y que
 * `net/codigo.js` con la normalización del código de sala (vuelta 47).
 *
 * @param {object} arma la entrada de `WEAPONS`, que trae su bloque `tiro`
 * @param {number} carga 0..1
 * @param {object} ojos `{x,y,z}` la posición del tirador
 * @param {number} yaw rumbo **del disparo**, no el del paso
 * @param {number} pitch
 * @param {object} out se reutiliza: esto puede ir en el bucle
 */
export function lanzamientoDeArma(arma, carga, ojos, yaw, pitch, out) {
  const tiro = arma?.tiro
  if (!tiro) return null
  const k = carga < 0 ? 0 : carga > 1 ? 1 : carga
  const v = tiro.vMin + (tiro.vMax - tiro.vMin) * k
  // La convención de la cámara del juego: mirar al frente es −Z y mirar arriba
  // es +Y. La misma que `direccionDeMira` en `net/disparo.js`, y escrita igual
  // a propósito — un proyectil que saliera hacia otro lado que el rayo sería el
  // error de 180° de la vuelta 60 con tiempo de vuelo.
  const cp = Math.cos(pitch)
  const fx = -Math.sin(yaw) * cp
  const fy = Math.sin(pitch)
  const fz = -Math.cos(yaw) * cp
  /**
   * **Y sale del ojo, no de donde estaría el arma.** Se probó lo contrario —lo
   * que hace el fogonazo de la vuelta 40— y lo tumbó una medida: con el
   * proyectil desplazado 22 cm, apuntar al centro de un cuerpo a doce unidades
   * **falla**, porque su cabeza mide 0.137 de radio. Lo que se mueve para poder
   * verse es **el dibujo de la curva**, que se salta su primer tramo
   * (`TRAJECTORY.desdeSegundos`), y no lo que vuela.
   */
  out.x = ojos.x
  out.y = ojos.y
  out.z = ojos.z
  out.vx = fx * v
  out.vy = fy * v
  out.vz = fz * v
  out.g = tiro.gravedad
  out.tipo = tiro.proyectil
  out.fuerza = tiro.danoMin + (tiro.danoMax - tiro.danoMin) * k
  out.intensidad = k
  return out
}
