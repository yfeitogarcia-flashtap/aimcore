/**
 * **El cuerpo simple**, y el único sitio donde se construye.
 *
 * Desde la vuelta 38 hay **una sola forma** de figura humana en todo el juego:
 * una cápsula con la cabeza ovalada, medida sobre
 * `Reference/Avatar/avatar-simple-body.png`. La usan los dos que la necesitan y
 * **sólo cambia el color**:
 *
 *  - Las dianas de *Hitbox completo* (`targets.js`), en el naranja de siempre.
 *  - El avatar del jugador (`avatar.js`), entero del color de su equipo.
 *
 * Que sea un módulo aparte y no una función dentro de uno de los dos es la
 * regla de siempre: en cuanto dos sistemas construyen la misma forma por su
 * cuenta, se separan. Aquí, además, se separarían **la silueta que ves y la que
 * recibe los disparos**, que es peor que feo.
 *
 * **La figura se corta en bandas, no se modela por piezas.** El modelo de zonas
 * —cabeza 100, torso 50, piernas 34— ya dice a qué altura empieza y acaba cada
 * una; una banda es el trozo de perfil entre esas dos alturas. Así el cuerpo se
 * dibuja de una pieza aunque sean tres mallas, y la malla que se ve es
 * exactamente la que se raycastea.
 */

import * as THREE from 'three'
import { AVATAR, MOVEMENT, TARGET, TARGET_TYPES } from '../config.js'

/** El perfil, ya ordenado de pies a coronilla. */
const PROFILE = AVATAR.body.profile

/** Las tres zonas del hitbox, indexadas por nombre. */
const ZONES = {}
for (const part of TARGET_TYPES.hitbox.parts) ZONES[part.zone] = part

/** Altura total de la figura en unidades de radio: de los pies a la coronilla. */
export const BODY_TOP = ZONES.head.offsetY + ZONES.head.radius

/**
 * **La banda que ocupa cada zona**, en fracciones de la altura total. Sale de
 * las piezas del hitbox y no de tres números escritos a mano: la cabeza empieza
 * exactamente donde acaba el torso, así que no hay ni junta visible ni franja
 * en la que un disparo no dé en ninguna zona.
 *
 * **Vive aquí y no en quien dibuja** (vuelta 65): las usan el avatar —para
 * cortar las tres mallas— y el hitbox del jugador —para decidir en qué zona
 * entra un disparo—. Dos copias de este corte son la silueta y el volumen de
 * impacto separándose, que es justo el fallo que la vuelta 65 vino a cerrar.
 */
export const ZONE_BANDS = {}
for (const part of TARGET_TYPES.hitbox.parts) {
  const half = (part.height ?? part.radius * 2) / 2
  ZONE_BANDS[part.zone] = [
    (part.offsetY - half) / BODY_TOP,
    (part.offsetY + half) / BODY_TOP,
  ]
}

/** Altura a la que se dibuja la figura, que es la de una diana de serie. */
export const BODY_HEIGHT = BODY_TOP * TARGET.radius

/**
 * **Dónde caen los ojos dentro de la figura**, en fracción de su altura. No es
 * un número elegido: es el que hace que un jugador de pie —ojos a
 * `MOVEMENT.standHeight`— mida exactamente lo que mide el cuerpo que se dibuja.
 *
 * De aquí sale `bodyHeightFor`, y de ahí el hitbox. Hasta la vuelta 65 el
 * hitbox escalaba por su cuenta poniendo los ojos en **el centro de la cabeza**
 * (la convención de un muñeco, `head.offsetY`) y salía un cuerpo de 1.827
 * contra los 1.800 que se dibujaban: 2.7 cm de hitbox por encima de la
 * coronilla, o sea disparos al aire que mataban de un tiro.
 */
export const EYE_LEVEL = MOVEMENT.standHeight / BODY_HEIGHT

/** Altura total de un cuerpo cuyos ojos están a `eyeHeight` del suelo. */
export function bodyHeightFor(eyeHeight) {
  return eyeHeight / EYE_LEVEL
}

/**
 * **Lo que la figura encoge para que el volumen de impacto quepa dentro de la
 * silueta.** La malla es un prisma de `AVATAR.body.sides` caras, así que su
 * ancho aparente va del radio entero —mirándola de vértice— a su apotema
 * —mirándola de cara—. Un sólido de revolución del radio entero asomaría hasta
 * un 4.9% por fuera de lo que se ve; con el apotema queda contenido **desde
 * cualquier ángulo**, que es la única forma de garantizar que ningún disparo
 * que visualmente no toque cuente como impacto.
 *
 * Lo que se paga está medido y es el mismo orden por el otro lado: 1.4 cm en la
 * cintura, 7 mm en la cabeza.
 */
export const HIT_INSET = Math.cos(Math.PI / AVATAR.body.sides)

/** El radio mayor del perfil, en fracciones de la altura. Acota, no decide. */
export const MAX_RADIUS = PROFILE.reduce((m, [, r]) => Math.max(m, r), 0)

/**
 * Radio del cuerpo a una altura dada, interpolando entre los dos puntos del
 * perfil que la rodean. Fuera del rango, el extremo más cercano.
 */
export function bodyRadiusAt(level) {
  if (level <= PROFILE[0][0]) return PROFILE[0][1]
  const last = PROFILE[PROFILE.length - 1]
  if (level >= last[0]) return last[1]
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [y0, r0] = PROFILE[i]
    const [y1, r1] = PROFILE[i + 1]
    if (level > y1) continue
    const t = y1 - y0 < 1e-9 ? 0 : (level - y0) / (y1 - y0)
    return r0 + (r1 - r0) * t
  }
  return last[1]
}

/**
 * **El radio que recibe disparos a una altura dada**, en fracciones de la
 * altura total: el del perfil metido hacia dentro por `HIT_INSET`. Es el único
 * sitio del que sale el ancho del hitbox, y sale del mismo perfil que dibuja la
 * silueta.
 */
export function hitRadiusAt(level) {
  return bodyRadiusAt(level) * HIT_INSET
}

/**
 * **Una banda del cuerpo**, como prisma de revolución facetado.
 *
 * Se muestrea el perfil en los puntos que caen dentro de la banda **más sus dos
 * extremos**, de modo que dos bandas contiguas comparten exactamente el mismo
 * anillo y la junta no se ve. La geometría sale **centrada en la banda**, que es
 * como la coloca el pool de dianas (`mesh.position.y = offsetY * radius`).
 *
 * @param {number} from nivel inferior, en fracciones de la altura total
 * @param {number} to nivel superior
 * @param {number} height altura total de la figura, en unidades de mundo
 * @param {number} [sides] caras de la sección
 */
export function bodySection(from, to, height, sides = AVATAR.body.sides) {
  const levels = [from]
  for (const [level] of PROFILE) {
    if (level > from + 1e-6 && level < to - 1e-6) levels.push(level)
  }
  levels.push(to)

  const center = ((from + to) / 2) * height
  const step = (Math.PI * 2) / sides
  // Los vértices a medio paso, como en el resto del proyecto: así hay una cara
  // mirando al frente con un número par de lados y no una arista.
  const angles = []
  for (let k = 0; k < sides; k++) angles.push((k + 0.5) * step)

  const positions = []
  for (const level of levels) {
    const r = bodyRadiusAt(level) * height
    const y = level * height - center
    for (const a of angles) positions.push(Math.cos(a) * r, y, Math.sin(a) * r)
  }

  const index = []
  for (let ring = 0; ring < levels.length - 1; ring++) {
    const base = ring * sides
    const next = base + sides
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides
      index.push(base + k, next + k, next + k2)
      index.push(base + k, next + k2, base + k2)
    }
  }
  // Tapas: un abanico desde el primer vértice de cada anillo extremo. El de
  // abajo mira hacia abajo, así que su orden de vértices va al revés.
  const lastRing = (levels.length - 1) * sides
  for (let k = 1; k < sides - 1; k++) {
    index.push(0, k + 1, k)
    index.push(lastRing, lastRing + k, lastRing + k + 1)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * Aclara un color hacia el blanco. Es lo que hace la cabeza de una diana sobre
 * el naranja del torso, y lo que hace la del avatar sobre el color de equipo.
 */
export function lighten(color, amount) {
  return new THREE.Color(color).lerp(new THREE.Color(0xffffff), amount)
}

/** Oscurece multiplicando: las piernas de una diana son el torso × 0.72. */
export function shade(color, factor) {
  return new THREE.Color(color).multiplyScalar(factor)
}

/**
 * Los tres tonos de un cuerpo a partir de un color base. Un solo sitio: las
 * dianas los traen escritos en `TARGET_TYPES` porque son los de siempre, y el
 * avatar los deriva de aquí para cualquier color de equipo.
 */
export function zoneColors(base) {
  return {
    head: lighten(base, AVATAR.zone.headLighten),
    torso: new THREE.Color(base),
    legs: shade(base, AVATAR.zone.legsShade),
  }
}
