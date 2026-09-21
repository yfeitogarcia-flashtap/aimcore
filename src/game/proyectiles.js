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

import { GRENADES, PROJECTILES } from '../config.js'

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
export function puntoDeVuelo(x0, y0, z0, vx, vy, vz, g, t, out, ax = 0, az = 0) {
  const mt = 0.5 * t * t
  out.x = x0 + vx * t + ax * mt
  out.y = y0 + vy * t - g * mt
  out.z = z0 + vz * t + az * mt
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
    /**
     * **La aceleración horizontal** (vuelta 87), y es lo que hace que rodar sea
     * forma cerrada y no una integración. Vale cero en todo lo que vuela: una
     * flecha y un cohete no rozan con nada. La usa una granada que ya no bota y
     * se está frenando contra el suelo.
     */
    this.ax = new Float64Array(pool)
    this.az = new Float64Array(pool)
    /** Rodando por el suelo: ni volando del todo ni parada del todo. */
    this.rodando = new Uint8Array(pool)
    /**
     * **Cuánto lleva vivo en total**, que no es lo mismo que `t` desde que
     * `t` se puede volver a poner a cero: un rebote re-ancla la parábola. Lo
     * leen el tope de vida —que si no, una granada que bota no caducaría
     * nunca— y quien la dibuja girando, para que el giro no dé un tirón en
     * cada bote.
     */
    this.vida = new Float64Array(pool)
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
    /**
     * **Cuánto rebota** (vuelta 87), de 0 a 1, y **cero es no rebotar**: una
     * flecha y un cohete recorren exactamente el camino de antes, sin una rama
     * nueva que puedan discrepar los dos extremos de una partida.
     *
     * `roce` es lo que pierde de la componente que resbala —lo que la hace
     * rodar y pararse— y `reposo`, la marcha por debajo de la cual se queda
     * quieta. Van por proyectil y no leídos de `GRENADES` aquí dentro porque
     * este módulo **no sabe de armas**: se los da quien lanza, igual que la
     * gravedad.
     */
    this.rebote = new Float64Array(pool)
    this.roce = new Float64Array(pool)
    this.reposo = new Float64Array(pool)
    /** Ya parada en el suelo: lo lee quien dibuja, para no hacerla girar. */
    this.quieta = new Uint8Array(pool)
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
    /**
     * **Los botes de este paso** (vuelta 87). Van aparte de los impactos
     * porque dicen otra cosa: un impacto es «esto se ha acabado» y un bote es
     * «sigue ahí y acaba de pegar contra algo». Quien lo escucha es el único
     * que se entera de una granada que le ha caído detrás, que es para lo que
     * sirve el oído (vuelta 73).
     */
    this.botes = []
    for (let i = 0; i < pool * GRENADES.rebote.maxRebotesPorPaso; i++) {
      this.botes.push({ serie: 0, tipo: null, dueno: null, x: 0, y: 0, z: 0, fuerza: 0 })
    }
    this._cuantosBotes = 0
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
    this.vida[i] = 0
    this.tipo[i] = p.tipo ?? null
    this.dueno[i] = p.dueno ?? null
    this.fuerza[i] = p.fuerza ?? 0
    this.intensidad[i] = p.intensidad ?? 1
    this.mecha[i] = Number.isFinite(p.mechaS) ? p.mechaS : Infinity
    this.ax[i] = 0
    this.az[i] = 0
    this.rodando[i] = 0
    this.rebote[i] = p.rebote ?? 0
    this.roce[i] = p.roce ?? 0
    this.reposo[i] = p.reposoU ?? 0
    this.quieta[i] = 0
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
      const p = puntoDeVuelo(this.x0[i], this.y0[i], this.z0[i], this.vx[i], this.vy[i], this.vz[i], this.g[i], this.t[i], this._p, this.ax[i], this.az[i])
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
    this._cuantosBotes = 0
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
    this._cuantosBotes = 0
    if (this.vivos === 0) return 0

    for (let i = 0; i < this.pool; i++) {
      if (this.estado[i] !== VOLANDO) continue
      /**
       * **Un paso puede tener varios choques** (vuelta 87), y por eso esto es
       * un bucle y ya no una línea recta. Una granada que llega al suelo a
       * mitad de paso **sigue moviéndose** el resto del paso ya rebotada: si el
       * choque se comiera el paso entero, un bote costaría 16.7 ms de mundo y
       * rebotar contra una esquina se vería como quedarse pegado a ella.
       *
       * Es la misma idea que el paso que cruza el final de un deslizamiento
       * (vuelta 69) o la frontera de un ventilador (vuelta 83): **lo que queda
       * del paso se gasta en el estado nuevo**, no se tira.
       */
      let restante = dt
      let botes = 0
      let libre = false
      while (restante > 1e-9 && !libre) {
        const antes = this.t[i]
        let ahora = antes + restante
        let porMecha = false
        /**
         * **La mecha corta el paso, no lo salta.** Una granada que revienta a
         * mitad de paso tiene que reventar **donde estaba en ese instante**, no
         * donde habría acabado: con pasos de 16.7 ms eso son hasta 90 cm de
         * diferencia en el centro de una explosión, que es la mitad de su radio.
         */
        if (ahora >= this.mecha[i]) { ahora = this.mecha[i]; porMecha = true }
        const usado = ahora - antes

        const p = puntoDeVuelo(this.x0[i], this.y0[i], this.z0[i], this.vx[i], this.vy[i], this.vz[i], this.g[i], antes, this._p, this.ax[i], this.az[i])
        const px = p.x, py = p.y, pz = p.z
        const q = puntoDeVuelo(this.x0[i], this.y0[i], this.z0[i], this.vx[i], this.vy[i], this.vz[i], this.g[i], ahora, this._q, this.ax[i], this.az[i])

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

        /**
         * **Lo que rebota no pregunta por los cuerpos** (vuelta 87). No es una
         * optimización: una granada **no hace daño por tocarte**, lo hace al
         * estallar, así que un impacto contra un cuerpo sería una segunda forma
         * de repartir daño que nadie ha decidido — y el arma dice lo mismo con
         * su `danoMin`/`danoMax` en cero. Lo que hace es atravesar a quien se
         * cruce y seguir su camino, que es lo que hace también el único aviso
         * que da: que se la oye botar.
         */
        if (contraCuerpos && largo > 1e-9 && this.rebote[i] === 0) {
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
        const caduca = !choca && !porMecha
          && (this.vida[i] + usado) * 1000 > PROJECTILES.vidaMaxMs

        if (!choca && !porMecha && !caduca) {
          this.t[i] = ahora
          this.vida[i] += usado
          this.x[i] = q.x; this.y[i] = q.y; this.z[i] = q.z
          restante = 0
          break
        }

        const tImpacto = choca ? antes + usado * mejorT : ahora
        this.x[i] = hx; this.y[i] = hy; this.z[i] = hz
        this.vida[i] += tImpacto - antes
        this.t[i] = tImpacto

        /**
         * **Y si rebota, no se acaba: empieza otra parábola.**
         *
         * Es la técnica del ventilador de la vuelta 83 aplicada a un choque:
         * la trayectoria sigue **en forma cerrada** y lo que cambia es dónde se
         * ancla. Se vuelve a anclar en el punto del golpe con la velocidad ya
         * reflejada y el reloj a cero, así que un bote **no introduce ni una
         * integración**: rebota igual a 60 que a 240 Hz sin hacer nada, que es
         * lo mismo que compra el salto desde la vuelta 27.
         */
        if (choca && !porMecha && this.rebote[i] > 0) {
          botes += 1
          const vxa = this.vx[i] + this.ax[i] * tImpacto
          const vya = this.vy[i] - this.g[i] * tImpacto
          const vza = this.vz[i] + this.az[i] * tImpacto
          // La normal tiene que apuntar **contra** la marcha: `cortarSegmento`
          // la da hacia fuera de la cara, pero una granada que sale de dentro
          // de una pieza por un pelo llegaría con el signo cambiado y rebotaría
          // hacia dentro.
          let sx = nx, sy = ny, sz = nz
          if (vxa * sx + vya * sy + vza * sz > 0) { sx = -sx; sy = -sy; sz = -sz }
          const vn = vxa * sx + vya * sy + vza * sz
          const golpe = Math.abs(vn)
          const suelo = sy > 0.3
          /**
           * **Dejar de botar y ponerse a rodar es un estado, no un número más
           * bajo**, y ésa es la pieza que hace que esto sea honesto.
           *
           * Se probó lo obvio —seguir botando con rozamiento en cada contacto—
           * y **se cayó midiéndolo**: en cuanto los botes se hacen más cortos
           * que un paso, el número de contactos por segundo lo pone el
           * refresco, no el mundo. Medido, 0.27% de dispersión entre 60 y 240
           * Hz en dónde acaba, y creciendo con lo que ruede. Eso es
           * exactamente lo que el paso fijo de la vuelta 44 vino a cerrar.
           *
           * Rodando, lo que frena es una **aceleración constante contra la
           * marcha**, o sea `p(t) = p0 + v0·t + ½·a·t²` con la `a` en
           * horizontal: la misma fórmula cerrada de siempre, que no depende del
           * tamaño del paso ni de en cuántos trozos se parta —lo que un tramo
           * quita de velocidad se lo encuentra el siguiente, y la suma de los
           * trozos es exactamente la curva entera—.
           *
           * Y la gravedad **sigue puesta** mientras rueda, que no es un detalle:
           * es lo que hace que una granada que llega al borde de una caja se
           * caiga por él en vez de seguir rodando por el aire. Cada contacto con
           * el suelo le quita la caída del paso y le deja la marcha horizontal,
           * que es la que decide dónde para.
           */
          if (suelo && golpe <= this.reposo[i]) {
            const vh = Math.hypot(vxa, vza)
            this.x0[i] = hx; this.y0[i] = hy + GRENADES.rebote.apoyoU; this.z0[i] = hz
            this.t[i] = 0
            this.mecha[i] = Math.max(0, this.mecha[i] - tImpacto)
            if (vh <= this.reposo[i] * 0.35) {
              /**
               * **Parada es una parábola con todo a cero**, no un estado
               * nuevo: el paso siguiente la evalúa igual, sale siempre en el
               * mismo sitio, no pregunta por ninguna geometría porque su
               * segmento mide cero — y **la mecha sigue corriendo**, que es lo
               * único que le queda por hacer.
               */
              this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0
              this.ax[i] = 0; this.az[i] = 0
              this.g[i] = 0
              this.quieta[i] = 1
              this.rodando[i] = 0
            } else {
              this.vx[i] = vxa; this.vy[i] = 0; this.vz[i] = vza
              const d = GRENADES.rebote.desaceleracionU
              this.ax[i] = (-vxa / vh) * d
              this.az[i] = (-vza / vh) * d
              this.rodando[i] = 1
            }
            restante -= usado * mejorT
            continue
          }

          /**
           * **El roce va con la fuerza del golpe.** Con un roce fijo, un bote
           * de refilón pierde lo mismo que un botazo; escalado por la
           * componente normal, lo que se ve es un bote fuerte que se lleva la
           * mitad de la marcha y uno suave que casi no la toca.
           */
          const kn = Math.min(1, golpe / Math.max(1e-6, this.reposo[i]))
          const roza = 1 - this.roce[i] * (0.2 + 0.8 * kn)
          const e = this.rebote[i]
          // Tangencial amortiguada y normal invertida con su restitución.
          const nvx = (vxa - vn * sx) * roza - e * vn * sx
          const nvy = (vya - vn * sy) * roza - e * vn * sy
          const nvz = (vza - vn * sz) * roza - e * vn * sz

          /**
           * **Y lo que se oye es un bote, no rodar.** Sólo se anota aquí, que
           * es la rama del golpe de verdad: un contacto de los que mantienen
           * pegada al suelo a una que rueda no suena, o sonaría sesenta veces
           * por segundo.
           */
          const bote = this.botes[this._cuantosBotes++]
          bote.serie = this.serie[i]
          bote.tipo = this.tipo[i]
          bote.dueno = this.dueno[i]
          bote.x = hx; bote.y = hy; bote.z = hz
          // Lo que se oye de un bote es **cuánto pegó**, no lo que le quedaba.
          bote.fuerza = golpe

          this.x0[i] = hx + sx * 1e-3
          this.y0[i] = hy + sy * 1e-3
          this.z0[i] = hz + sz * 1e-3
          this.t[i] = 0
          this.vx[i] = nvx; this.vy[i] = nvy; this.vz[i] = nvz
          this.ax[i] = 0; this.az[i] = 0
          this.rodando[i] = 0
          this.mecha[i] = Math.max(0, this.mecha[i] - tImpacto)
          /**
           * **Y hay un tope de choques por paso**, que no es un recorte: una
           * granada que choca cuatro veces en 16.7 ms está atrapada en una
           * esquina, y lo que hace falta ahí es que el bucle termine. Se para,
           * que es lo que habría acabado pasando.
           */
          if (botes >= GRENADES.rebote.maxRebotesPorPaso) {
            this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0
            this.ax[i] = 0; this.az[i] = 0
            this.g[i] = 0
            this.quieta[i] = 1
            this.rodando[i] = 0
            restante = 0
            break
          }
          restante -= usado * mejorT
          continue
        }

        this.estado[i] = LIBRE
        this.vivos -= 1
        libre = true
        // Un proyectil que se pasa de tiempo se va sin decir nada: no ha pasado
        // nada en el mundo, y un impacto inventado sería una explosión de la nada.
        if (caduca) break

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
    }
    return this._cuantos
  }

  /** Cuántos botes ha habido en el último paso, en `this.botes`. */
  get cuantosBotes() {
    return this._cuantosBotes
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
export function lanzamientoDeArma(arma, carga, ojos, yaw, pitch, out, opciones = null) {
  const tiro = arma?.tiro
  if (!tiro) return null
  const k = carga < 0 ? 0 : carga > 1 ? 1 : carga
  /**
   * **El tiro corto, con el clic derecho** (vuelta 87), y lo que resuelve está
   * dicho en el encargo con todas las letras: para dejar caer una granada a tus
   * pies hay que mirar al suelo, **y mirar al suelo es perder el horizonte**
   * justo cuando hay alguien doblando la esquina.
   *
   * Así que no se apunta hacia abajo: se apunta a donde se estaba mirando y
   * **sale ya con el ángulo bajado** (`GRENADES.corto.cabeceoGrados`) y con una
   * velocidad mucho menor. Es la misma función, los mismos dos gestos de carga
   * y la misma parábola — lo único que cambia son dos números, que es lo que
   * hace que el láser siga sin poder mentir sobre dónde va a caer.
   */
  const corto = Boolean(opciones?.corto) && Boolean(tiro.granada)
  const vMin = corto ? GRENADES.corto.vMin : tiro.vMin
  const vMax = corto ? GRENADES.corto.vMax : tiro.vMax
  const v = vMin + (vMax - vMin) * k
  const cabeceo = corto ? pitch - GRENADES.corto.cabeceoGrados * (Math.PI / 180) : pitch
  // La convención de la cámara del juego: mirar al frente es −Z y mirar arriba
  // es +Y. La misma que `direccionDeMira` en `net/disparo.js`, y escrita igual
  // a propósito — un proyectil que saliera hacia otro lado que el rayo sería el
  // error de 180° de la vuelta 60 con tiempo de vuelo.
  const cp = Math.cos(cabeceo)
  const fx = -Math.sin(yaw) * cp
  const fy = Math.sin(cabeceo)
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
  /**
   * **Lo que hace que una granada sea una granada**, y los cuatro números salen
   * de `GRENADES` y no de cada arma: tres granadas que rebotaran distinto
   * serían tres físicas que aprender, y lo que hay que aprender es el efecto.
   */
  if (tiro.granada) {
    out.rebote = GRENADES.rebote.restitucion
    out.roce = GRENADES.rebote.roce
    out.reposoU = GRENADES.rebote.reposoU
    out.mechaS = mechaDeGranada(opciones?.sostenidoS)
  } else {
    out.rebote = 0
    out.roce = 0
    out.reposoU = 0
    out.mechaS = Infinity
  }
  return out
}

/**
 * **Cuánto le queda de mecha a una granada que se suelta ahora** (vuelta 87),
 * en segundos, y **la llaman los dos extremos** por lo mismo que
 * `lanzamientoDeArma`: escrita dos veces sería una granada que revienta en dos
 * instantes distintos en las dos pantallas.
 *
 * La regla es la que se pidió: cuatro segundos desde que se activa —que es
 * desde que se empieza a cargar— menos lo que se haya tenido en la mano, **con
 * suelo en un segundo**. Ese suelo es lo que impide que cocinar se convierta en
 * suicidarse, que en un 1v1 donde las tres se hacen daño a uno mismo sería un
 * arma que castiga justo al que la está usando bien.
 *
 * Y por eso lo que viaja por la red es **cuánto se ha sostenido** y no la
 * mecha: un cliente que mintiera pidiendo cero se lleva el suelo igual, porque
 * el número no se acepta, se **deriva**.
 */
export function mechaDeGranada(sostenidoS) {
  const { totalS, minimoS } = GRENADES.mecha
  const s = Number.isFinite(sostenidoS) && sostenidoS > 0 ? sostenidoS : 0
  const queda = totalS - s
  return queda < minimoS ? minimoS : queda
}
