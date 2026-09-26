/**
 * **La escalera: una macro que se despliega en escalones** (vuelta 93).
 *
 * Es la segunda macro del formato, y funciona exactamente como el tubo de la
 * vuelta 81: **un** objeto en `src/maps/*.js` y N cajas alineadas a los ejes
 * cuando `Scenario` lo monta. El motor sigue recibiendo cajas y nada más, así
 * que de ahí hacia abajo la colisión, los oclusores, los disparos y el
 * presupuesto no saben que existe una escalera.
 *
 * Y es segura en red por lo mismo que la física de la vuelta 72: **no viaja
 * ningún número**. Los dos extremos montan el mismo mapa y despliegan los mismos
 * escalones con la misma función.
 *
 * **Por qué una macro y no una rampa.** Las dos existen y no son lo mismo: por
 * una rampa se sube sin tocar nada y por una escalera se sube pisando, así que
 * lo que las separa jugando es que un escalón **es cobertura** —te puedes
 * asomar por encima de uno sin exponer el cuerpo— y una rampa no. Se pidieron
 * las dos, y por eso están las dos.
 *
 * **Y lo que la hace subible no es un número, es una cuenta.** `COVER.stepHeight`
 * (0.25) es exactamente lo que el jugador sube sin saltar, así que una escalera
 * cuyo escalón mida más **no es una escalera**: es una pared con muescas, y se
 * sube saltando o no se sube. En vez de dejar que eso pase y avisar, el
 * despliegue **sube el número de escalones** hasta que cada uno quepa por debajo
 * de ese corte. Lo que el creador elige es cuántos quiere; lo que la macro
 * garantiza es que se puedan subir andando.
 *
 * Eso significa que el número de escalones de una escalera declarada puede no
 * ser el que pone el fichero, y el editor lo dice en su ficha: enterarse
 * probando el mapa es enterarse tarde (vuelta 67).
 */

/**
 * Cuántos escalones hacen falta como mínimo para que ninguno pase de
 * `stepHeight`. Lo llaman el despliegue y **el editor**, que es lo que evita que
 * la ficha prometa cinco escalones y el mundo monte trece.
 */
export function escalonesMinimos(alto, stepHeight) {
  if (!(alto > 0) || !(stepHeight > 0)) return 1
  return Math.max(1, Math.ceil(alto / stepHeight - 1e-9))
}

/**
 * Despliega una escalera en las cajas que la forman. Devuelve cajas en el mismo
 * formato que `boxes`: `kind` y `base` numéricos, que `coverHeight` acepta.
 *
 * El **rumbo** son cuatro posiciones y no un ángulo libre, por la razón de
 * siempre: los escalones son cajas y la colisión de una caja es AABB (vuelta
 * 74). `0` sube hacia +Z, y de ahí en sentido del reloj mirando desde arriba.
 *
 * Cada escalón es **una caja del suelo a su altura**, no una losa flotando: así
 * un escalón tapa lo que hay detrás —que es la mitad de para qué sirve una
 * escalera en un mapa— y no deja un hueco por el que se cuele un disparo.
 *
 * @param {{x:number, z:number, ancho:number, alto:number, escalones:number, huella:number, rumbo:number, base:number, tinte?:string}} escalera
 * @param {number} stepHeight `COVER.stepHeight`, que entra como argumento para
 *   que este módulo no dependa de `config.js` — lo monta también el servidor.
 */
export function cajasDeEscalera(escalera, stepHeight) {
  const cajas = []
  const base = escalera.base ?? 0
  const alto = escalera.alto
  if (!(alto > 0) || !(escalera.ancho > 0) || !(escalera.huella > 0)) return cajas

  const n = Math.max(Math.round(escalera.escalones), escalonesMinimos(alto, stepHeight))
  const subida = alto / n
  const rumbo = ((Math.round(escalera.rumbo ?? 0) % 4) + 4) % 4
  // Los dos ejes del rumbo: por dónde avanza la escalera y por dónde es ancha.
  const avanzaEnZ = rumbo === 0 || rumbo === 2
  const signo = rumbo === 0 || rumbo === 1 ? 1 : -1

  for (let i = 0; i < n; i++) {
    const techo = base + subida * (i + 1)
    // El escalón `i` empieza a `i · huella` de la esquina declarada, en el
    // sentido del rumbo. Con signo negativo se cuenta hacia atrás, así que la
    // esquina declarada sigue siendo **el pie de la escalera**: girarla no la
    // muda de sitio, que es la misma regla que el aro de una pieza (vuelta 79).
    const d0 = i * escalera.huella
    const largo = escalera.huella
    if (avanzaEnZ) {
      cajas.push({
        x: escalera.x,
        z: signo > 0 ? escalera.z + d0 : escalera.z - d0 - largo,
        w: escalera.ancho,
        d: largo,
        kind: techo,
        base,
        ...(escalera.tinte ? { tinte: escalera.tinte } : {}),
      })
    } else {
      cajas.push({
        x: signo > 0 ? escalera.x + d0 : escalera.x - d0 - largo,
        z: escalera.z,
        w: largo,
        d: escalera.ancho,
        kind: techo,
        base,
        ...(escalera.tinte ? { tinte: escalera.tinte } : {}),
      })
    }
  }
  return cajas
}

/** Todas las cajas de todas las escaleras de un mapa. Lo llaman `Scenario` y el editor. */
export function cajasDeEscaleras(escaleras, stepHeight) {
  const cajas = []
  for (const e of escaleras ?? []) cajas.push(...cajasDeEscalera(e, stepHeight))
  return cajas
}

/**
 * Lo que mide una escalera desplegada, para la ficha del editor y para el
 * presupuesto. Sale de la **misma** cuenta que el despliegue, que es lo que
 * evita que el panel diga una longitud y el mundo monte otra.
 */
export function medidasDeEscalera(escalera, stepHeight) {
  const pedidos = Math.max(1, Math.round(escalera.escalones ?? 1))
  const minimos = escalonesMinimos(escalera.alto, stepHeight)
  const n = Math.max(pedidos, minimos)
  return {
    escalones: n,
    subidos: pedidos < minimos,
    subida: escalera.alto / n,
    largo: n * escalera.huella,
  }
}
