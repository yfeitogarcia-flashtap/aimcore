/**
 * **u286 — el cohete por dentro del servidor.**
 *
 * Lo que hay que demostrar: que explota en área con caída, que el dueño se
 * lleva su parte, que un cohete con baja repone uno y sólo uno, y que la
 * reserva vuelve a lo de fábrica al empezar una ronda.
 */
import * as THREE from 'three'
import { Partida } from '../net/partida.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG } from '../net/protocolo.js'
import { WEAPONS, WEAPON_ORDER } from '../src/config.js'
import { caidaDeArea } from '../src/game/proyectiles.js'

const fallos = []
const af = (cond, texto, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${texto}${extra ? ` — ${extra}` : ''}`)
  if (!cond) fallos.push(texto)
}

const escenario = new Scenario(new THREE.Scene(), 'elEspejo')

/**
 * **Y una sala pelada, que es lo que arregló la revisión de la vuelta 97.**
 *
 * El renglón [2] —«reventar más cerca hace más daño»— llevaba en rojo desde la
 * 92 dando `0` y `0`, y no era el arma: **era el mapa**. El Espejo tiene el
 * centro tapado a propósito (vuelta 66), así que un cohete plano de un extremo
 * al otro **choca con una pieza** y revienta a media sala. Las dos filas medían
 * la cobertura de El Espejo y no la caída del área, y al dar las dos cero, la
 * comparación salía falsa sin decir por qué.
 *
 * Es la regla de la vuelta 46 otra vez: **una comparación necesita que se vea su
 * denominador**. Aquí el denominador es *dónde revienta*, y por eso esta sala no
 * tiene nada dentro y el banco lo imprime.
 */
const PELADA = new Scenario(new THREE.Scene(), {
  clave: 'banco-u286',
  label: 'Banco u286',
  room: { width: 60, depth: 60, height: 16 },
  spawn: { x: 0, z: 20 },
  boxes: [],
  ramps: [],
  prismas: [],
  routes: [],
})
const iU2 = WEAPON_ORDER.indexOf('u2')
const ex = WEAPONS.u2.tiro.explosion

const entrada = (n, extra = {}) => ({ t: MSG.ENTRADA, n, k: 0, yaw: 0, jt: -1, w: iU2, ...extra })
const mandar = (p, j, e) => p.recibe(j.id, JSON.stringify(e))

/** Una partida con los dos cara a cara y el U2 en la mano. */
function montar(sep = 6, mapa = escenario) {
  const p = new Partida({ escenario: mapa, rondas: false, depurar: true })
  const a = p.jugadores.get(p.entra(() => {}))
  const b = p.jugadores.get(p.entra(() => {}))
  a.pose.position.x = 0; a.pose.position.z = sep
  b.pose.position.x = 0; b.pose.position.z = -sep
  // **El U2 está en la ranura especial desde la vuelta 92**, no en la principal:
  // escribirlo en `primaria` dejaba al jugador sin cohete y este banco medía otra
  // cosa desde entonces.
  a.inventario.especial = 'u2'
  a.inventario.reserva = { u2: WEAPONS.u2.tiro.reserva.inicial }
  let n = p.paso + 1
  for (let k = 0; k < 8; k++) { mandar(p, a, entrada(n + k)); mandar(p, b, entrada(n + k)) }
  for (let k = 0; k < 8; k++) p.tick()
  return { p, a, b }
}

/** Dispara y deja volar hasta que revienta. Devuelve los pasos que tardó. */
function tirar(p, a, b, pitch = 0) {
  const n = p.paso + 1
  mandar(p, a, entrada(n, { d: { f: 0, yaw: 0, pitch, seq: Math.floor(Math.random() * 1e6) } }))
  mandar(p, b, entrada(n))
  p.tick()
  let pasos = 0
  while (p.proyectiles.vivos > 0 && pasos < 400) {
    const q = p.paso + 1
    mandar(p, a, entrada(q)); mandar(p, b, entrada(q))
    p.tick(); pasos += 1
  }
  return pasos
}

console.log('== u286 ==\n')

console.log('[1] un cohete de pleno mata, lleve lo que lleve')
{
  const { p, a, b } = montar(6)
  b.escudo = 50
  b.casco = true
  const vida = b.vida
  tirar(p, a, b)
  af(b.vida <= 0, 'el rival cae', `vida ${vida} (+chaleco +casco) → ${b.vida}`)
}

console.log('\n[2] la onda alcanza sin dar de pleno, y cae con la distancia')
{
  /**
   * A 24 u de distancia (12 a cada lado del centro) **en una sala pelada**, y
   * apuntando cada vez más abajo para que el cohete muera cada vez más lejos del
   * rival. Se anota **dónde revienta** envolviendo `_explotar`: sin eso, dos
   * ceros seguidos no distinguen «la onda no llega» de «el cohete no llegó».
   */
  const medir = (pitch) => {
    const { p, a, b } = montar(12, PELADA)
    let donde = null
    const original = p._explotar.bind(p)
    p._explotar = (im, explosion, tirador) => { donde = { ...im }; return original(im, explosion, tirador) }
    const antes = b.vida
    tirar(p, a, b, pitch)
    const cy = b.movimiento.feetY + b.movimiento.eyeHeight * 0.5
    const d = donde
      ? Math.hypot(b.pose.position.x - donde.x, cy - donde.y, b.pose.position.z - donde.z)
      : null
    return { dano: antes - b.vida, d }
  }

  const filas = [-0.30, -0.20, -0.12, -0.05, 0.02].map((pitch) => ({ pitch, ...medir(pitch) }))
  for (const f of filas) {
    console.log(`    pitch ${f.pitch.toFixed(2)} → revienta a ${f.d === null ? 'ningún sitio' : `${f.d.toFixed(1)} u`} del rival, ${f.dano.toFixed(0)} de daño`)
  }

  // **Las dos premisas, delante.** Sin la primera, «cae con la distancia» lo
  // cumplirían cinco ceros; sin la segunda, lo cumpliría un cohete que revienta
  // siempre en el mismo sitio.
  af(filas.every((f) => f.d !== null), 'los cinco cohetes revientan en algún sitio')
  const distancias = filas.map((f) => f.d)
  af(Math.max(...distancias) - Math.min(...distancias) > ex.radioU,
    'y en sitios bien distintos', `de ${Math.min(...distancias).toFixed(1)} a ${Math.max(...distancias).toFixed(1)} u`)

  // Y lo que se venía a medir: más cerca, más daño, sin un solo escalón al revés.
  const ordenadas = [...filas].sort((x, y) => x.d - y.d)
  const monotona = ordenadas.every((f, i) => i === 0 || f.dano <= ordenadas[i - 1].dano + 1e-9)
  af(monotona, 'el daño no sube al alejarse en ningún escalón',
    ordenadas.map((f) => `${f.d.toFixed(1)}u→${f.dano.toFixed(0)}`).join(' '))
  af(ordenadas[0].dano > ordenadas[ordenadas.length - 1].dano,
    'reventar más cerca hace más daño',
    `cerca ${ordenadas[0].dano.toFixed(0)} (${ordenadas[0].d.toFixed(1)} u), lejos ${ordenadas[ordenadas.length - 1].dano.toFixed(0)} (${ordenadas[ordenadas.length - 1].d.toFixed(1)} u)`)
  const fuera = ordenadas.find((f) => f.d > ex.radioU)
  af(fuera ? fuera.dano === 0 : false, 'y pasado el radio no hace nada',
    fuera ? `${fuera.d.toFixed(1)} u → ${fuera.dano.toFixed(0)}` : 'ninguno cayó fuera del radio')
}

console.log('\n[3] el dueño se lleva su parte, rebajada')
{
  const { p, a, b } = montar(20)
  const antes = a.vida
  // A los pies: mirando muy abajo, revienta delante de uno mismo.
  tirar(p, a, b, -1.2)
  af(a.vida < antes, 'quien lo tira también lo encaja', `${antes} → ${a.vida}`)
  af(a.vida > 0 || ex.propio >= 1, 'pero no es un suicidio automático',
    `propio ${ex.propio}, vida ${a.vida}`)
}

console.log('\n[4] un cohete que mata repone uno, y sólo uno')
{
  const { p, a, b } = montar(6)
  a.inventario.reserva = { u2: 0 }
  tirar(p, a, b)
  af(b.vida <= 0, 'ha matado')
  af(a.inventario.reserva.u2 === 1, 'la reserva sube en uno', `${a.inventario.reserva.u2}`)
}

console.log('\n[5] y no pasa del tope')
{
  const { p, a, b } = montar(6)
  const max = WEAPONS.u2.tiro.reserva.maxima
  a.inventario.reserva = { u2: max }
  tirar(p, a, b)
  af(a.inventario.reserva.u2 === max, 'se queda en el máximo', `${a.inventario.reserva.u2} de ${max}`)
}

console.log('\n[6] lanzar gasta una, y sin baja no vuelve')
{
  /**
   * **Este renglón estaba caducado, no roto** (revisado en la vuelta 97). Decía
   * «la reserva no se mueve» y se escribió en la 86, cuando el servidor **sólo
   * subía** la reserva. La vuelta 90 arregló justo eso —`inv.reserva` medía lo
   * que te dieron y no lo que te queda, así que un cohete que mataba repartía de
   * más— y desde entonces lanzar **gasta una**. O sea que el 1 → 0 que salía en
   * rojo era el arreglo de la 90 funcionando.
   *
   * Lo que el renglón venía a guardar sigue en pie y se mide con su control al
   * lado: **sin baja no vuelve**, y con baja sí.
   */
  const sinBaja = montar(20)
  sinBaja.a.inventario.reserva = { u2: 1 }
  tirar(sinBaja.p, sinBaja.a, sinBaja.b, -1.4)
  af(sinBaja.b.vida > 0, 'el cohete a los pies no mata al rival', `vida ${sinBaja.b.vida}`)
  af(sinBaja.a.inventario.reserva.u2 === 0, 'lanzar gasta una de la reserva',
    `1 → ${sinBaja.a.inventario.reserva.u2}`)

  const conBaja = montar(6)
  conBaja.a.inventario.reserva = { u2: 1 }
  tirar(conBaja.p, conBaja.a, conBaja.b)
  af(conBaja.b.vida <= 0, 'y el control mata')
  af(conBaja.a.inventario.reserva.u2 === 1, 'ahí la gastada vuelve, y sólo una',
    `1 → ${conBaja.a.inventario.reserva.u2}`)

  // Y el suelo: sin reserva, lanzar no la deja en negativo.
  const vacia = montar(20)
  vacia.a.inventario.reserva = { u2: 0 }
  tirar(vacia.p, vacia.a, vacia.b, -1.4)
  af(vacia.a.inventario.reserva.u2 === 0, 'con la reserva a cero se queda en cero',
    `${vacia.a.inventario.reserva.u2}`)
}

console.log('\n[7] la caída del área, que comparten cohete y granadas')
{
  const fila = [0, ex.nucleoU, ex.radioU / 2, ex.radioU, ex.radioU + 1]
    .map((d) => `${d.toFixed(1)}u→${(caidaDeArea(d, ex.radioU, ex.nucleoU) * ex.dano).toFixed(0)}`)
  console.log(`    ${fila.join('  ')}`)
  af(caidaDeArea(0, ex.radioU, ex.nucleoU) * ex.dano >= 100, 'el núcleo mata a vida llena')
  af(caidaDeArea(ex.radioU, ex.radioU, ex.nucleoU) === 0, 'el borde no hace nada')
}

console.log(`\n${fallos.length === 0 ? 'TODO OK' : `${fallos.length} FALLOS: ${fallos.join('; ')}`}`)
process.exit(fallos.length === 0 ? 0 : 1)
