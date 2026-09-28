/**
 * **Quién aparece en la pantalla de cada uno** (vuelta 100, fase 1 de la
 * propuesta 11).
 *
 * Hasta aquí la foto era **una** y salía igual para todos: cada uno recibía a
 * todos, que es el cuadrado —N fotos de N cuerpos— y con diez jugadores son 33
 * Mbit/s de una sola sala (`salas97`). Desde esta vuelta cada jugador recibe
 * **su** foto, y lo que decide quién entra en ella está escrito **aquí y en
 * ningún otro sitio**: `entraEnLaFoto(a, b, sala)`.
 *
 * Es la disciplina del transporte (vuelta 46) aplicada a una regla que va a
 * cambiar: el día de los mapas de varias salas (propuesta 11 §2.2) esta función
 * contestará por el grafo —tu sala y las contiguas— y el cable, el cliente y
 * `partida.js` no se enterarán. Lo que hoy contesta, por orden:
 *
 * 1. **Uno mismo, siempre.** Es lo que reconcilia la predicción.
 * 2. **Nadie durante la fase de compra** (vuelta 62). Era una rama aparte en
 *    `_enviarFoto` —«no verse no es no dibujar, es no recibir»— y ahora es un
 *    caso más de la misma pregunta.
 * 3. **Quien no tiene cable no está en la foto de nadie.** Una butaca reservada
 *    sigue ocupada (vuelta 62), pero en un mundo que no se para —el todos
 *    contra todos no tiene pausa por caída— un cuerpo congelado en medio del
 *    mapa sería un blanco gratis o un fantasma. Por lo mismo no encaja daño.
 * 4. **Más allá de `NET.interes.lejosU`, nadie.** Se vea o no: a esa distancia
 *    no hay bala que llegue (`shotRange`, 60 u) y un cuerpo son diez píxeles.
 * 5. **Dentro de `cercaU`, siempre**, se vea o no. Las pisadas se oyen a través
 *    de las paredes hasta 16 u (vueltas 60 y 73), y el oído es el único canal
 *    que no hay que apuntar a ninguna parte: si el criterio fuera sólo «lo que
 *    ves», quien se acerca por detrás de un muro no sonaría.
 * 6. **En medio, sólo si hay línea de vista**, contada con la misma aritmética
 *    que corta un proyectil (`cortarSegmento`, vuelta 85): 0.6 µs por rayo,
 *    no un `raycast` de 13. Y de regalo, lo que no te llega no lo puede
 *    enseñar un programa de trampas: es el primer anti-*wallhack*.
 *
 * Y una memoria, que no es una regla más sino lo que evita el parpadeo: quien
 * entra se queda `memoriaMs` aunque deje de cumplir (ver `Interes`).
 */
import { NET, SIM_STEP_MS } from '../src/config.js'

/** Altura de los ojos y del pecho de un cuerpo, para los dos rayos. */
function ojosDe(j) {
  return j.movimiento.feetY + j.movimiento.eyeHeight
}

/**
 * **¿Se ven A y B?** Hasta cuatro rayos desde los ojos de A, y basta con que
 * pase uno: a la cabeza de B, a su pecho y a dos puntos a los lados del pecho,
 * apartados `NET.interes.margenU` en perpendicular a la línea entre los dos.
 *
 * Los dos laterales no son un adorno, son la mitad de la regla: el centro del
 * cuerpo es lo último que asoma por una esquina, y un rival que saca medio
 * hombro **se ve** aunque su pecho siga tapado. Sin margen, quien asoma
 * tendría la ventaja de ver sin ser visto durante un viaje de ida y vuelta. El
 * margen es mayor que el cuerpo (0.3 de radio) a propósito: cubre además lo
 * que se mueve entre que el servidor decide y la pantalla dibuja. Lo que se
 * paga es que alguien a un metro de asomar ya viaja en la foto — un
 * anti-*wallhack* aproximado, no perfecto.
 *
 * Contra `cortarSegmento`, que es la geometría del mapa **para lo que vuela**,
 * y por eso una barrera de cristal o invisible no tapa, que es justo lo que es
 * (vuelta 95): un límite para el cuerpo, no para la vista.
 */
export function seVen(escenario, a, b) {
  if (!escenario?.cortarSegmento) return true
  const pa = a.pose.position
  const pb = b.pose.position
  const ya = ojosDe(a)
  if (!escenario.cortarSegmento(pa.x, ya, pa.z, pb.x, ojosDe(b), pb.z)) return true
  const pecho = b.movimiento.feetY + b.movimiento.eyeHeight * 0.6
  if (!escenario.cortarSegmento(pa.x, ya, pa.z, pb.x, pecho, pb.z)) return true
  // La perpendicular a la línea A→B, en el suelo.
  const dx = pb.x - pa.x
  const dz = pb.z - pa.z
  const largo = Math.hypot(dx, dz) || 1
  const m = NET.interes.margenU
  const lx = (-dz / largo) * m
  const lz = (dx / largo) * m
  if (!escenario.cortarSegmento(pa.x, ya, pa.z, pb.x + lx, pecho, pb.z + lz)) return true
  return !escenario.cortarSegmento(pa.x, ya, pa.z, pb.x - lx, pecho, pb.z - lz)
}

/**
 * **La regla.** `a` recibe la foto, `b` es el candidato; `sala` trae lo que la
 * regla necesita saber del mundo: la fase y la geometría.
 *
 * @param {object} a destinatario (un jugador de `Partida`)
 * @param {object} b candidato
 * @param {{ fase: string, escenario: object }} sala
 */
export function entraEnLaFoto(a, b, sala) {
  if (a === b) return true
  if (sala.fase === 'compra') return false
  if (b.desconectado) return false
  const pa = a.pose.position
  const pb = b.pose.position
  const d = Math.hypot(pb.x - pa.x, pb.z - pa.z)
  if (d > NET.interes.lejosU) return false
  if (d <= NET.interes.cercaU) return true
  return seVen(sala.escenario, a, b)
}

/**
 * **La memoria de la regla**, por destinatario: quién ha entrado y hasta qué
 * paso se queda aunque deje de cumplir. Vive aquí y no en `partida.js` porque
 * es media regla —sin ella la frontera de `cercaU` y cada esquina serían un
 * parpadeo— y dos sitios diciendo quién entra es lo que este módulo evita.
 *
 * Lo que **no** se recuerda son los tres cortes duros de arriba —la compra,
 * el cable y la distancia máxima—: esos sacan en el acto, porque cada uno es
 * una promesa (no verse en la compra, no disparar a un ausente, no pagar por
 * lo que está fuera de alcance).
 */
export class Interes {
  constructor() {
    /** id del candidato → último paso en que sigue dentro. */
    this.hasta = new Map()
  }

  /** Olvida a alguien: se ha ido de la sala. */
  olvidar(id) {
    this.hasta.delete(id)
  }

  /**
   * ¿Entra `b` en la foto de `a` en el paso `paso`? Pregunta a la regla y, si
   * dice que no por algo que no es un corte duro, mira la memoria.
   */
  entra(a, b, sala, paso) {
    if (entraEnLaFoto(a, b, sala)) {
      if (a !== b) this.hasta.set(b.id, paso + Math.ceil(NET.interes.memoriaMs / SIM_STEP_MS))
      return true
    }
    if (a === b || sala.fase === 'compra' || b.desconectado) return false
    const pa = a.pose.position
    const pb = b.pose.position
    if (Math.hypot(pb.x - pa.x, pb.z - pa.z) > NET.interes.lejosU) return false
    return (this.hasta.get(b.id) ?? -1) >= paso
  }
}
