/**
 * **El tubo: un objeto que el motor ve como cajas** (vuelta 81).
 *
 * La colisión de Vektor es **AABB** —`resolveAxis` resuelve un eje cada vez
 * contra `minX/maxX/minZ/maxZ/bottom/top`, sin orientación en ningún sitio— y
 * la regla del editor desde la vuelta 74 es que no se pueda construir algo
 * contra lo que el motor no sepa chocar. Un cilindro sólido cae por eso en el
 * mismo cajón que la rotación libre.
 *
 * Lo que **sí** se puede es lo que ya se podía a mano: un pozo compuesto de
 * cajas en anillo, que desde dentro no se distingue de un cilindro. Lo que
 * añade esta vuelta no es una primitiva nueva: es que ese anillo sea **un solo
 * objeto** en el fichero del mapa —`tubos`— y que sea `Scenario` quien lo
 * despliegue al montar. El motor sigue recibiendo cajas y nada más; el editor
 * edita **una** cosa con **un** gizmo en vez de veintidós.
 *
 * Y es seguro en red por lo mismo que la física de la vuelta 72: **no viaja
 * ningún número**. Los dos extremos montan el mismo mapa y despliegan el mismo
 * anillo con la misma función. Un tubo desplegado en el fichero —las cajas
 * escritas una a una— sería un tubo que no se puede volver a estirar.
 *
 * **Por qué por filas y no por sectores.** El anillo obvio es dividir el
 * círculo en N sectores y meter cada trozo de pared en su caja; el problema es
 * que la caja de un arco diagonal **muerde hacia dentro**. Medido: con 8
 * sectores el hueco libre baja a 0.707·R —un **29%** comido justo en las
 * diagonales—, con 16 a 0.804·R (19.6%) y con 32 todavía a 0.899·R (10.1%), y
 * eso son ya 32 cajas. O sea: un pozo que por dentro no es redondo, es un
 * octógono con los lados hundidos, y no mejora pagando más piezas.
 *
 * Por filas no hay mordisco ninguno: cada fila pone su cara interior en el
 * punto **más ancho** de su tramo, así que el hueco libre **nunca baja de
 * `radio`** en ninguna dirección. Medido con el de fábrica —radio 3, 12
 * caras, 22 cajas—: el hueco más estrecho de las 720 direcciones sale **3.005**
 * contra el 3 declarado. Lo que se paga es que el escalón de la escalera se ve;
 * lo que se compra es que el radio que pone el editor sea el radio que el
 * jugador tiene.
 */

/**
 * Despliega un tubo en las cajas que lo forman. Devuelve cajas en el mismo
 * formato que `boxes`: `kind` y `base` numéricos, que `coverHeight` acepta.
 *
 * @param {{x:number, z:number, radio:number, grosor:number, caras:number, alto:number, base:number}} tubo
 * @returns {{x:number, z:number, w:number, d:number, kind:number, base:number}[]}
 */
export function cajasDeTubo(tubo) {
  const cajas = []
  const dentroR = tubo.radio
  const fueraR = tubo.radio + tubo.grosor
  const filas = Math.max(4, Math.round(tubo.caras))
  const alto = (2 * fueraR) / filas
  const base = tubo.base
  const techo = tubo.base + tubo.alto
  if (techo <= base) return cajas

  for (let i = 0; i < filas; i++) {
    const z0 = -fueraR + i * alto
    const z1 = z0 + alto

    // **El extremo de la fila más cerca del ecuador**, que es donde el anillo
    // es más ancho. Una fila a caballo del centro tiene ahí su punto más ancho,
    // y no en ninguno de sus dos extremos: por eso el cero va aparte.
    const cerca = z0 <= 0 && z1 >= 0 ? 0 : Math.min(Math.abs(z0), Math.abs(z1))

    const fuera = Math.sqrt(Math.max(0, fueraR * fueraR - cerca * cerca))
    const dentro = cerca >= dentroR ? 0 : Math.sqrt(Math.max(0, dentroR * dentroR - cerca * cerca))
    if (fuera <= dentro + 1e-6) continue

    const poner = (x0, x1) => {
      if (x1 - x0 < 1e-6) return
      cajas.push({ x: tubo.x + x0, z: tubo.z + z0, w: x1 - x0, d: alto, kind: techo, base })
    }

    // Las dos filas de los extremos caen enteras fuera del círculo libre: son
    // las tapas del anillo, y van de una pieza.
    if (dentro <= 1e-6) poner(-fuera, fuera)
    else { poner(-fuera, -dentro); poner(dentro, fuera) }
  }

  return cajas
}

/** Todas las cajas de todos los tubos de un mapa. Lo llaman `Scenario` y el editor. */
export function cajasDeTubos(tubos) {
  const cajas = []
  for (const tubo of tubos ?? []) cajas.push(...cajasDeTubo(tubo))
  return cajas
}
