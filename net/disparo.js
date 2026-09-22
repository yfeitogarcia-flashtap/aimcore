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
import { NET, WEAPONS } from '../src/config.js'
import { esPorLaEspalda, hitPlayer, zoneDamage } from '../src/game/player.js'
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


/**
 * **El patrón de perdigones, derivado y no sorteado** (vuelta 91).
 *
 * La Pump es la primera arma del juego que suelta **más de un rayo por
 * disparo**, y eso choca de frente con cómo viaja un tiro desde la vuelta 88:
 * lo que sale al cable es **el rumbo con el que salió la bala, uno solo**, y
 * el desvío lo sortea el cliente. Con ocho perdigones hay dos caminos, y sólo
 * uno es barato:
 *
 * - Mandar los ocho rumbos. Es multiplicar por ocho el campo más gordo de la
 *   entrada, y un protocolo distinto según el arma.
 * - **Mandar una semilla y que los dos extremos deriven el mismo cono.** Es el
 *   patrón de la física de la vuelta 72 con un número en vez de ninguno: viaja
 *   lo mínimo y el resto **se calcula igual a los dos lados**, así que no hay
 *   una segunda idea de por dónde fue cada perdigón.
 *
 * Y no regala nada que no estuviera ya regalado: desde la 88 **el desvío lo
 * sortea el cliente**, así que quién decide dónde va una bala no cambia. Lo
 * que cambia es que ahora hay ocho, y el servidor las reproduce exactamente.
 *
 * El generador es un LCG de 32 bits escrito aquí a mano **a propósito**:
 * `Math.random()` no se puede sembrar, y el día que el servidor corra en otro
 * runtime lo único que tiene que coincidir es esta aritmética entera.
 */
function siguienteAleatorio(estado) {
  // Numerical Recipes. Entero de 32 bits sin signo, con `>>> 0` para que el
  // desbordamiento con signo de JavaScript no meta negativos.
  return (Math.imul(estado, 1664525) + 1013904223) >>> 0
}

const _u = { x: 0, y: 0, z: 0 }
const _v = { x: 0, y: 0, z: 0 }

/**
 * **Hacia dónde va el perdigón `i` de un disparo sembrado con `semilla`.**
 *
 * La misma construcción que `applySpread` del motor —base ortonormal
 * perpendicular al rayo y un desvío polar dentro del cono— pero con los dos
 * números **derivados** en vez de sorteados. Se escribe una vez y la llaman el
 * motor entrenando, el cliente prediciendo y el servidor resolviendo.
 *
 * El ángulo va con `sqrt` para que el patrón salga **repartido por el área del
 * círculo** y no apelotonado en el centro, que es lo que da un sorteo lineal
 * del radio — un perdigonazo con todo el plomo en el eje no es un perdigonazo.
 *
 * @param {number} conoGrados la apertura **total** del cono
 */
export function perdigonDeSemilla(semilla, i, conoGrados, yaw, pitch, out = _dir) {
  direccionDeMira(yaw, pitch, out)
  /**
   * **Un solo chorro, y el perdigón `i` son sus valores `2i` y `2i+1`.**
   *
   * Lo primero que se probó fue sembrar cada perdigón por separado
   * (`semilla ^ i·dorado`) y salió mal dos veces seguidas, las dos medibles a
   * la primera: un LCG arrancado desde semillas vecinas da **valores
   * correlacionados**, así que los ocho ángulos salían 2.37°, 2.42°, 2.46°…
   * —un anillo en vez de un patrón— y arreglando eso con calentamiento
   * quedaba lo mismo en el azimut: −62°, −83°, −105°, −126°, o sea los ocho
   * perdigones **repartidos en abanico regular**.
   *
   * Avanzando un chorro único desaparecen las dos cosas y no hace falta
   * ninguna maña: es O(n²) con n = 8, o sea setenta y dos multiplicaciones
   * por disparo, y un disparo no es el bucle caliente.
   */
  let r = (semilla >>> 0) || 1
  for (let k = 0; k < 2 * i + 3; k++) r = siguienteAleatorio(r)
  const a = (r >>> 8) / 16777216
  r = siguienteAleatorio(r)
  const b = (r >>> 8) / 16777216
  const theta = Math.sqrt(a) * (conoGrados * Math.PI) / 360
  if (!(theta > 0)) return out
  const phi = b * Math.PI * 2

  // Base ortonormal perpendicular al rayo. La referencia es (0,1,0) salvo
  // mirando casi en vertical, que es donde ese producto vectorial degenera:
  // ahí se usa (0,0,1). Es la misma guarda que `applySpread` del motor.
  if (Math.abs(out.y) > 0.99) {
    // r = (0,0,1) → u = r × d
    _u.x = -out.y; _u.y = out.x; _u.z = 0
  } else {
    // r = (0,1,0) → u = r × d
    _u.x = out.z; _u.y = 0; _u.z = -out.x
  }
  let n = Math.hypot(_u.x, _u.y, _u.z) || 1
  _u.x /= n; _u.y /= n; _u.z /= n
  _v.x = out.y * _u.z - out.z * _u.y
  _v.y = out.z * _u.x - out.x * _u.z
  _v.z = out.x * _u.y - out.y * _u.x
  n = Math.hypot(_v.x, _v.y, _v.z) || 1
  _v.x /= n; _v.y /= n; _v.z /= n

  const sin = Math.sin(theta)
  const cos = Math.cos(theta)
  const cf = Math.cos(phi) * sin
  const sf = Math.sin(phi) * sin
  out.x = out.x * cos + _u.x * cf + _v.x * sf
  out.y = out.y * cos + _u.y * cf + _v.y * sf
  out.z = out.z * cos + _u.z * cf + _v.z * sf
  n = Math.hypot(out.x, out.y, out.z) || 1
  out.x /= n; out.y /= n; out.z /= n
  return out
}

/**
 * **Un perdigonazo, con el mismo código en los dos extremos** (vuelta 91).
 *
 * Es `resolverDisparo` repetido `n` veces con el cono de arriba, y **el
 * veredicto sale sumado**: un disparo de escopeta es *un* disparo. De ahí
 * cuelgan las dos propiedades que hacen que esto sea una escopeta y no un
 * arma con más balas:
 *
 * - **La caída con la distancia no se escribe: sale del cono.** A dos unidades
 *   el patrón es más estrecho que un cuerpo y entran los ocho; a quince es más
 *   ancho y entran uno o dos. No hay ninguna curva de daño por distancia —que
 *   el juego no tiene para nada más (vuelta 70)— y aun así el arma se apaga de
 *   lejos exactamente como se espera.
 * - **Y la zona que se devuelve es la del perdigón más caro**, que es lo que
 *   hace que el aviso y las estadísticas digan algo: un disparo que ha metido
 *   seis al torso y dos a la cabeza es, para quien lo cuenta, un disparo a la
 *   cabeza.
 *
 * Ojo con lo que **no** hace: no decide si eso mata. La escalera de armadura
 * es `encajarImpacto` y sigue siendo de quien aplica el daño, así que un
 * chaleco sigue contando una sola vez sobre el total — que es lo correcto,
 * porque lo que para el plomo es el chaleco entero y no ocho chalecos.
 */
export function resolverEscopeta(origen, yaw, pitch, semilla, cuerpo, oclusores, arma) {
  const p = WEAPONS[arma]?.perdigones
  const fallo = { impacto: false, zona: null, distancia: 0, dano: 0, tapado: false, tocados: 0 }
  if (!p) return resolverDisparo(origen, yaw, pitch, cuerpo, oclusores, arma)
  if (!cuerpo) return fallo

  let dano = 0
  let tocados = 0
  let tapados = 0
  let zona = null
  let mejor = -1
  let distancia = 0
  for (let i = 0; i < p.n; i++) {
    const dir = perdigonDeSemilla(semilla, i, p.conoGrados, yaw, pitch)
    const golpe = hitPlayer(origen, dir, cuerpo, NET.shotRange)
    if (!golpe) continue
    if (oclusores && oclusores.length > 0) {
      _origen.set(origen.x, origen.y, origen.z)
      _impacto.set(
        origen.x + dir.x * golpe.distance,
        origen.y + dir.y * golpe.distance,
        origen.z + dir.z * golpe.distance,
      )
      if (!hasLineOfSight(_origen, _impacto, oclusores)) { tapados += 1; continue }
    }
    const d = zoneDamage(golpe.zone, arma)
    dano += d
    tocados += 1
    if (d > mejor) { mejor = d; zona = golpe.zone; distancia = golpe.distance }
  }
  // **Tapado sólo si no entró ninguno**, que es lo que ese campo significa
  // para quien lo lee: «te lo comió la cobertura». Con uno dentro y siete
  // fuera, el disparo entró.
  if (tocados === 0) {
    return { impacto: false, zona: null, distancia: 0, dano: 0, tapado: tapados > 0, tocados: 0 }
  }
  return { impacto: true, zona, distancia, dano, tapado: false, tocados }
}


/**
 * **Una cuchillada, con el mismo código en los dos extremos** (vuelta 71).
 *
 * Es `resolverDisparo` con tres diferencias, y las tres son el cuchillo:
 *
 * 1. **El alcance es el del arma** (`melee.rangeU`, 1.6 u) y no el de una bala.
 *    Eso es lo que convierte al cuchillo en un arma de llegar.
 * 2. **El daño lo pone el tipo de golpe**, no la zona. Un cuchillo no elige
 *    dónde clava: lo que cambia el resultado es flojo o fuerte, y los dos restan
 *    de la misma vida —25 y 55 contra 100—, así que un flojo más un fuerte
 *    suman solos y no hace falta una tabla de combinaciones.
 * 3. **Y dice si vino por la espalda.** Quien decide qué se hace con eso es el
 *    que aplica el daño: aquí sólo se mide, contra el rumbo **rebobinado** de
 *    la víctima, que es hacia dónde miraba cuando le dieron.
 *
 * La zona que devuelve es siempre `torso`: es lo que hace que el chaleco cuente
 * —la cabeza no la cubre— y es honesto, porque una puñalada no es un disparo a
 * la cabeza aunque el cursor esté ahí.
 *
 * @param {'luz'|'fuerte'} tipo
 */
export function resolverCuchillada(origen, yaw, pitch, cuerpo, oclusores, arma, tipo) {
  const fallo = { impacto: false, zona: null, distancia: 0, dano: 0, tapado: false, espalda: false }
  const datos = WEAPONS[arma]?.melee
  if (!cuerpo || !datos) return fallo
  const golpe = datos[tipo] ?? datos.luz

  const dir = direccionDeMira(yaw, pitch)
  const corte = hitPlayer(origen, dir, cuerpo, datos.rangeU)
  if (!corte) return fallo

  // Mismo reparto que el disparo: el rayo de cobertura sólo a lo que entra. A
  // metro y medio casi nunca habrá nada en medio, y «casi nunca» no es nunca:
  // asomando la cabeza por encima de una caja se puede estar a tiro de cuchillo
  // de alguien que está al otro lado.
  if (oclusores && oclusores.length > 0) {
    _origen.set(origen.x, origen.y, origen.z)
    _impacto.set(
      origen.x + dir.x * corte.distance,
      origen.y + dir.y * corte.distance,
      origen.z + dir.z * corte.distance,
    )
    if (!hasLineOfSight(_origen, _impacto, oclusores)) {
      return { impacto: false, zona: null, distancia: corte.distance, dano: 0, tapado: true, espalda: false }
    }
  }

  // **La cámara mira a −Z**, así que ése es el vector de hacia dónde mira la
  // víctima. La conversión va aquí, donde está la convención, y no dentro de
  // `esPorLaEspalda`, que la llaman también los muñecos con la contraria.
  const fx = -Math.sin(cuerpo.yaw ?? 0)
  const fz = -Math.cos(cuerpo.yaw ?? 0)
  const espalda = esPorLaEspalda(origen.x, origen.z, cuerpo.x, cuerpo.z, fx, fz, datos.backArcDeg)

  return { impacto: true, zona: 'torso', distancia: corte.distance, dano: golpe.dano, tapado: false, espalda }
}
