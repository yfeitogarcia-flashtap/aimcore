/**
 * **El arsenal del mapa: con qué se juega en él** (vuelta 106, propuesta 08).
 *
 * Un mapa puede declarar `reglas` —las armas que admite y **cómo se consiguen**—
 * y `peanas`, armas puestas en el suelo que se cogen apuntando y con la tecla
 * contextual. Todo lo que decide qué puede tener un jugador sale de aquí, y lo
 * llaman **los tres**: el servidor (`net/partida.js`), el motor —que en el
 * entrenamiento hace de servidor de sí mismo— y Alchemist. Escrito dos veces
 * sería una peana que el cliente enseña cogible y el servidor rechaza sin decir
 * por qué, que es el fallo de la vuelta 65 por la puerta del suelo.
 *
 * **Sin `three`**, como `proyectiles.js` y `clavadas.js`: lo monta Node.
 *
 * Tres modos, excluyentes:
 *
 * - **Armería**: se compra (con rondas) o se equipa (todos contra todos), como
 *   siempre, con el catálogo filtrado a las armas marcadas. **Un mapa sin
 *   reglas es Armería con todo**, que es exactamente lo que se jugaba antes.
 * - **Equipadas**: todos salen con el mismo equipo, sin tienda.
 * - **Peanas**: se sale con el equipo base (chaleco y casco, si los da el mapa)
 *   y las armas se cogen del suelo. Sin tienda y sin dinero.
 */

import { ECONOMY, SECONDARY_WEAPON, WEAPONS, catalogoDeTienda } from '../config.js'

export const MODOS_DE_ARMAS = ['armeria', 'equipadas', 'peanas']

/** Cómo se dice cada modo, en el lobby y en Alchemist. */
export const NOMBRE_DE_MODO = { armeria: 'armería', equipadas: 'equipadas', peanas: 'peanas' }

/**
 * **En qué campo del inventario cae un arma**, por su ranura. Es la tabla de
 * `_comprar` (vuelta 92) sacada de allí para que la use también la peana: una
 * segunda forma de escribir un arma en una ranura serían dos.
 */
export const CAMPO_DE_RANURA = { primary: 'primaria', secondary: 'secundaria', special: 'especial', throwable: 'granadas' }

/**
 * **Las armas que un mapa puede marcar**: las del catálogo de la tienda que son
 * un arma, en el orden de sus fichas. El cuchillo no está —se lleva siempre,
 * vuelta 73— y el chaleco y el casco tampoco: son equipo, no armas del mapa.
 */
export function armasMarcables() {
  return catalogoDeTienda().filter((i) => WEAPONS[i.clave] && CAMPO_DE_RANURA[WEAPONS[i.clave].slot])
}

/**
 * **Las reglas de un mapa, normalizadas**: `{ modo, armas, equipo }`, donde
 * `armas` es `null` para «todas».
 *
 * Un mapa sin `reglas` es Armería con todo. Y **Los Pilares no se reescribe**:
 * su `duelo.sinEconomia` con su `dotacion` (vuelta 72) **se lee como**
 * Equipadas, igual que `modosDeMapa` deduce los modos de un mapa viejo sin
 * tocar el fichero (vuelta 98).
 */
export function reglasDeMapa(definicion) {
  const r = definicion?.reglas
  if (r && MODOS_DE_ARMAS.includes(r.modo)) {
    return {
      modo: r.modo,
      armas: Array.isArray(r.armas) ? r.armas : null,
      equipo: r.equipo ?? {},
    }
  }
  const duelo = definicion?.duelo
  if (duelo?.sinEconomia) {
    const d = duelo.dotacion ?? {}
    return {
      modo: 'equipadas',
      armas: null,
      equipo: { principal: d.arma ?? null, chaleco: Boolean(d.chaleco), casco: Boolean(d.casco) },
    }
  }
  return { modo: 'armeria', armas: null, equipo: {} }
}

/**
 * **¿Admite el mapa esta arma?** La pistola de serie y el cuchillo, siempre: una
 * ranura no se puede quedar sin pistola (vuelta 89) y el cuchillo se lleva en
 * cualquier mapa (vuelta 73). Lo que no es un arma (chaleco, casco), también:
 * las reglas son del arsenal, no del equipo.
 */
export function armaPermitida(reglas, clave) {
  if (!reglas?.armas) return true
  const arma = WEAPONS[clave]
  if (!arma) return true
  if (clave === SECONDARY_WEAPON || arma.slot === 'melee') return true
  return reglas.armas.includes(clave)
}

/** El catálogo de la tienda, filtrado a lo que el mapa admite. Lo miran el panel y el servidor. */
export function catalogoDelMapa(reglas) {
  return catalogoDeTienda().filter((i) => armaPermitida(reglas, i.clave))
}

/**
 * **Con qué sale cada uno**, en los modos sin tienda: `{ primaria, secundaria,
 * especial, granadas, chaleco, casco }`, o `null` en Armería.
 *
 * En Equipadas es el equipo entero; en Peanas, sólo el base —chaleco y casco—,
 * porque las armas se cogen del suelo. Un arma del equipo que el mapa no admite
 * no se da: el equipo no puede ser una puerta trasera a lo que las reglas
 * quitan.
 */
export function equipoDeSalida(reglas) {
  if (!reglas || reglas.modo === 'armeria') return null
  const e = reglas.equipo ?? {}
  const base = { primaria: null, secundaria: null, especial: null, granadas: [], chaleco: Boolean(e.chaleco), casco: Boolean(e.casco) }
  if (reglas.modo === 'peanas') return base
  const vale = (clave, ranura) => (clave && WEAPONS[clave]?.slot === ranura && armaPermitida(reglas, clave) ? clave : null)
  base.primaria = vale(e.principal, 'primary')
  base.secundaria = vale(e.pistola, 'secondary')
  base.especial = vale(e.especial, 'special')
  base.granadas = (Array.isArray(e.granadas) ? e.granadas : [])
    .filter((g) => vale(g, 'throwable'))
    .slice(0, ECONOMY.granadasMax)
  return base
}

/**
 * **Coger un arma de una peana**, sobre un inventario con la forma del del
 * servidor (`{ primaria, secundaria, especial, granadas, reserva }`). Lo hacen
 * igual el servidor y el motor del entrenamiento, que es lo que evita dos ideas
 * de qué pasa al recogerla. Devuelve `{ ok, recarga, campo, motivo }`:
 *
 * - **Sustituye su ranura**: lo que hubiera ahí desaparece (propuesta 08 §3).
 * - **Coger la que ya llevas recarga** (la regla del Fang, vuelta 90): cargador
 *   lleno y reserva hasta lo que traería recién cogida. `recarga` lo dice.
 * - **Llega con la munición de comprarla**: reserva inicial (`r.inicial`).
 * - **Una granada respeta `ECONOMY.granadasMax`** (vuelta 88): si no cabe, se
 *   dice en vez de cobrarla en silencio.
 */
export function recogerEnInventario(inv, clave) {
  const arma = WEAPONS[clave]
  const campo = CAMPO_DE_RANURA[arma?.slot]
  if (!campo) return { ok: false, motivo: 'no es un arma' }
  let recarga = false
  if (campo === 'granadas') {
    const llevo = inv.granadas ?? (inv.granadas = [])
    if (llevo.includes(clave)) recarga = true
    else if (llevo.length >= ECONOMY.granadasMax) return { ok: false, motivo: `sólo ${ECONOMY.granadasMax} clases` }
    else llevo.push(clave)
  } else {
    recarga = inv[campo] === clave
    inv[campo] = clave
  }
  const r = arma.tiro?.reserva
  if (r) {
    if (!inv.reserva) inv.reserva = {}
    inv.reserva[clave] = r.inicial
  }
  return { ok: true, recarga, campo }
}

/**
 * **La peana que se apunta**, o -1: el rayo de la mira contra el cilindro de
 * agarre de cada una, con aritmética (como el hitbox, vuelta 65), la más
 * cercana dentro del alcance. **No mira paredes**: eso lo decide quien llama
 * con `cortarSegmento`, que es la pregunta cara y se hace una vez y a la
 * ganadora (propuesta 08 §6: 0.27 µs las 160, 1.48 µs el corte).
 *
 * `peanas` son las del escenario, con su `y` de suelo ya resuelta.
 */
export function peanaApuntada(peanas, ox, oy, oz, dx, dy, dz, { alcance, radio, alto, alturaArma }) {
  let mejor = -1
  let mejorT = alcance
  const a = dx * dx + dz * dz
  for (let i = 0; i < peanas.length; i++) {
    const p = peanas[i]
    const px = ox - p.x
    const pz = oz - p.z
    let t
    const dentro = px * px + pz * pz <= radio * radio
    if (dentro || a < 1e-9) {
      // **Con los ojos dentro del cilindro —encima de la peana— no basta con
      // estar ahí**: hay que mirar el arma. Se corta el rayo con el plano a la
      // altura del arma y el punto tiene que caer en el círculo. Pisarla no la
      // coge, igual que en ningún otro sitio (propuesta 08 §6: se coge
      // apuntando).
      if (dy >= -1e-9) continue
      t = (p.y + alturaArma - oy) / dy
      if (t < 0) continue
      const hx = ox + dx * t - p.x
      const hz = oz + dz * t - p.z
      if (hx * hx + hz * hz > radio * radio) continue
      if (t > mejorT) continue
      mejor = i
      mejorT = t
      continue
    }
    const b = px * dx + pz * dz
    const c = px * px + pz * pz - radio * radio
    const disc = b * b - a * c
    if (disc < 0) continue
    t = (-b - Math.sqrt(disc)) / a
    if (t < 0) continue
    if (t > mejorT) continue
    // El rayo entra en el cilindro a la altura `y`: tiene que caer en su banda.
    const y = oy + dy * t
    const suelo = p.y + alturaArma - alto / 2
    if (y < suelo || y > suelo + alto) {
      // Puede entrar por la tapa de arriba o de abajo si mira en picado.
      if (Math.abs(dy) < 1e-9) continue
      const tapa = y > suelo + alto ? suelo + alto : suelo
      const tt = (tapa - oy) / dy
      if (tt < 0 || tt > mejorT) continue
      const hx = ox + dx * tt - p.x
      const hz = oz + dz * tt - p.z
      if (hx * hx + hz * hz > radio * radio) continue
      t = tt
    }
    mejor = i
    mejorT = t
  }
  return mejor
}

/** El centro del arma de una peana, que es a donde se mide la distancia y la pared. */
export function centroDePeana(p, alturaArma) {
  return { x: p.x, y: p.y + alturaArma, z: p.z }
}
