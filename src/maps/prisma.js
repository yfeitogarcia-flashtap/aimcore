/**
 * **El prisma convexo** (vuelta 83), que es lo que la colisión de Vektor no
 * sabía chocar y lo que cierra el último renglón del triaje de la 79.
 *
 * Hasta aquí todo lo sólido era AABB: `resolveAxis` acota contra `minX/maxX` y
 * `minZ/maxZ` y no hay orientación en ningún sitio, así que **una caja girada
 * se dibujaba girada, paraba las balas bien y se chocaba sin girar** — y por eso
 * el editor no podía ofrecer rotación libre (la regla de la 74: no se puede
 * poder construir algo contra lo que el motor no sepa chocar).
 *
 * `CLAUDE.md` decía además cómo había que hacerlo: **entera**. «No es una cosa
 * sino tres —giro de 90° (ya está), OBB, y convexa de N lados, que es lo que de
 * verdad hace falta—; un OBB suelto resuelve el 20% de los casos y paga el 90%
 * del precio». Así que la primitiva es **una sola** y las dos formas que se
 * pueden dibujar salen de ella:
 *
 * - **`lados: 4` es una caja girada.** No es un caso especial escondido: es lo
 *   que «cuatro lados» significa. Con `giro` a cero da exactamente el mismo
 *   volumen que la caja de siempre, con sus cuatro esquinas en su sitio.
 * - **De cinco en adelante es el polígono regular inscrito** en esa misma caja
 *   de `w × d`: un hexágono, un octógono, o los que hagan falta para que un
 *   pilar se lea como redondo. Es lo mismo que hace el tubo de la vuelta 81 —
 *   aproximar una curva con lo que el motor sabe chocar— pero **por dentro**:
 *   allí el pozo son veintidós cajas y aquí la columna es una pieza de N caras.
 *
 * **Y lo que el motor recibe no son puntos, son caras.** Un polígono convexo
 * **es** la intersección de sus semiplanos, y con esa forma la colisión sale
 * siendo la que ya había: la banda `[lo, hi]` que `clampAgainstBand` acota en
 * un eje se despeja de los semiplanos exactamente igual que se despejaba de
 * `minX − radio` y `maxX + radio`. Por eso `resolveAxis` **no se reescribe**:
 * los prismas son una pasada más que acaba llamando a la misma función.
 *
 * Lo que se paga, y va escrito porque no se adivina: **las esquinas se cortan a
 * inglete y no en redondo**. Engordar un polígono convexo un radio de verdad
 * deja las esquinas redondeadas, y lo que se hace aquí —desplazar cada cara y
 * cruzar los semiplanos— sobra un poco justo en los vértices. Es el mismo
 * defecto que la colisión de cajas tiene desde el primer día (una caja se
 * engorda por sus cuatro caras y su esquina queda en pico), así que un prisma se
 * comporta **como una caja** y no como una cosa nueva que hay que aprender.
 */

/**
 * Los vértices del prisma en planta, en orden y ya girados y trasladados.
 *
 * Aloca, y eso está bien: esto se llama **al montar el mapa**, no por paso. Lo
 * que el bucle caliente usa son las caras, que salen de aquí una sola vez.
 */
export function puntosDePrisma(prisma) {
  const a = prisma.w / 2
  const b = prisma.d / 2
  const n = Math.max(3, Math.round(prisma.lados))
  const locales = []
  if (n === 4) {
    // **Cuatro lados es la caja**, con sus esquinas donde el ancho y el fondo
    // dicen. Sacarla del polígono regular la dejaría en un rombo inscrito, o
    // sea con la mitad de área y sin parecerse a lo que se declaró.
    locales.push([-a, -b], [a, -b], [a, b], [-a, b])
  } else {
    for (let k = 0; k < n; k++) {
      // Sin fase: el primer vértice mira a **+X**, así que un número par de
      // lados deja **caras planas enfrentadas a ±Z** y el pilar se apoya en
      // una cara en vez de en una arista. Girarlo es `giro`, que para eso
      // está — lo que no puede ser es que la orientación de partida dependa de
      // cuántos lados se pidan.
      const t = (2 * Math.PI * k) / n
      locales.push([a * Math.cos(t), b * Math.sin(t)])
    }
  }
  const giro = prisma.giro ?? 0
  const cos = Math.cos(giro)
  const sen = Math.sin(giro)
  const puntos = []
  for (const [px, pz] of locales) {
    puntos.push({
      x: prisma.x + px * cos - pz * sen,
      z: prisma.z + px * sen + pz * cos,
    })
  }
  return puntos
}

/**
 * Las caras del prisma como semiplanos `{ nx, nz, c }`, con la normal **hacia
 * fuera** y unitaria: un punto está dentro si `nx·x + nz·z <= c` en todas.
 *
 * La orientación se decide contra el centro declarado y no contra el sentido de
 * giro de la lista: el sentido depende de cómo se generaron los puntos, y una
 * lista al revés dejaría un prisma que **contiene todo el mapa menos a sí
 * mismo**. El centro es un dato del prisma, así que no puede mentir.
 */
export function carasDePrisma(prisma) {
  const puntos = puntosDePrisma(prisma)
  const caras = []
  for (let i = 0; i < puntos.length; i++) {
    const p = puntos[i]
    const q = puntos[(i + 1) % puntos.length]
    const dx = q.x - p.x
    const dz = q.z - p.z
    const largo = Math.hypot(dx, dz)
    // Dos vértices pegados no son una cara: con largo cero la normal sale
    // `NaN` y un `NaN` en la colisión viaja hasta la matriz de la cámara.
    if (largo < 1e-9) continue
    let nx = dz / largo
    let nz = -dx / largo
    if (nx * (p.x - prisma.x) + nz * (p.z - prisma.z) < 0) { nx = -nx; nz = -nz }
    caras.push({ nx, nz, c: nx * p.x + nz * p.z })
  }
  return caras
}

/** La caja que lo envuelve, para descartar barato antes de mirar las caras. */
export function envolventeDePrisma(prisma) {
  const puntos = puntosDePrisma(prisma)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of puntos) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  return { minX, maxX, minZ, maxZ }
}

/**
 * **¿Está el punto dentro, engordado el polígono en `radio`?**
 *
 * Es la versión de un punto de lo que `bandaDePrisma` hace para un eje entero,
 * y las dos contestan lo mismo con la misma aritmética — que es justo lo que
 * hace falta para que el suelo y la horizontal admitan **los mismos sitios**
 * (la regla que ya gobierna cajas y rampas).
 */
export function dentroDePrisma(caras, x, z, radio = 0) {
  for (let i = 0; i < caras.length; i++) {
    const cara = caras[i]
    if (cara.nx * x + cara.nz * z > cara.c + radio) return false
  }
  return true
}

/**
 * **La banda de un eje**: entre qué dos valores de `a` el prisma engordado en
 * `radio` corta la recta en la que el otro eje vale `b`.
 *
 * Es exactamente lo que una caja da con `minX − radio` y `maxX + radio`, y por
 * eso el resultado se le entrega a la misma `clampAgainstBand` de siempre. Sale
 * de que el volumen engordado es **convexo**: su corte con una recta es un solo
 * intervalo, así que basta con cruzar los semiplanos.
 *
 * Devuelve `false` si la recta no lo toca. Escribe en `salida` en vez de
 * devolver un objeto: esto **sí** es bucle caliente —dos veces por paso y por
 * jugador, por cada prisma— y el bucle caliente no asigna.
 *
 * @param {'x'|'z'} eje cuál es el que se mueve
 */
export function bandaDePrisma(caras, eje, b, radio, salida) {
  let lo = -Infinity
  let hi = Infinity
  for (let i = 0; i < caras.length; i++) {
    const cara = caras[i]
    const na = eje === 'x' ? cara.nx : cara.nz
    const nb = eje === 'x' ? cara.nz : cara.nx
    const resto = cara.c + radio - nb * b
    if (na > 1e-9) {
      const v = resto / na
      if (v < hi) hi = v
    } else if (na < -1e-9) {
      const v = resto / na
      if (v > lo) lo = v
    } else if (resto < 0) {
      // Cara paralela al eje que se mueve y la recta cae fuera de ella: no hay
      // corte, y decirlo aquí evita una banda infinita que bloquearía el eje.
      return false
    }
  }
  if (!(lo < hi)) return false
  salida.lo = lo
  salida.hi = hi
  return true
}
