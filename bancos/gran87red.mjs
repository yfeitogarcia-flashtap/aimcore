/**
 * **gran87red — las tres granadas por dentro del servidor.**
 *
 * Lo que hay que demostrar: que la mecha la deriva el servidor y no se la cree
 * al cliente, que el Core reparte por área, que la KO frena de verdad y que el
 * freno viaja en `snapshot()` —que es lo que impide una corrección por paso—.
 */
import * as THREE from 'three'
import { Partida } from '../net/partida.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG } from '../net/protocolo.js'
import { GRENADES, WEAPONS, WEAPON_ORDER } from '../src/config.js'
import { mechaDeGranada } from '../src/game/proyectiles.js'

const fallos = []
const af = (cond, texto, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${texto}${extra ? ` — ${extra}` : ''}`)
  if (!cond) fallos.push(texto)
}

const escenario = new Scenario(new THREE.Scene(), 'elEspejo')
const mandar = (p, j, e) => p.recibe(j.id, JSON.stringify(e))

function montar(clave, sep = 3) {
  const i = WEAPON_ORDER.indexOf(clave)
  const p = new Partida({ escenario, rondas: false, depurar: true })
  const a = p.jugadores.get(p.entra(() => {}))
  const b = p.jugadores.get(p.entra(() => {}))
  a.pose.position.x = 0; a.pose.position.z = sep
  b.pose.position.x = 0; b.pose.position.z = -sep
  a.inventario.granada = clave
  a.inventario.reserva = { [clave]: 1 }
  const entrada = (n, extra = {}) => ({ t: MSG.ENTRADA, n, k: 0, yaw: 0, jt: -1, w: i, ...extra })
  let n = p.paso + 1
  for (let k = 0; k < 8; k++) { mandar(p, a, entrada(n + k)); mandar(p, b, entrada(n + k)) }
  for (let k = 0; k < 8; k++) p.tick()
  return { p, a, b, entrada }
}

/** Tira y deja correr hasta que el mundo se queda sin proyectiles. */
function tirar({ p, a, b, entrada }, d = {}) {
  const n = p.paso + 1
  mandar(p, a, entrada(n, { d: { f: 0, yaw: 0, pitch: -0.35, seq: Math.floor(Math.random() * 1e6), ...d } }))
  mandar(p, b, entrada(n))
  p.tick()
  let pasos = 0
  while (p.proyectiles.vivos > 0 && pasos < 600) {
    const q = p.paso + 1
    mandar(p, a, entrada(q)); mandar(p, b, entrada(q))
    p.tick(); pasos += 1
  }
  return pasos
}

console.log('== gran87red ==\n')

console.log('[1] la mecha la deriva el servidor, y el suelo es suyo')
{
  const m = montar('core')
  const pasos = tirar(m, { h: 0 })
  af(Math.abs(pasos * 16.6667 - GRENADES.mecha.totalS * 1000) < 60,
    'sin cocinar, revienta a los 4 s', `${(pasos * 16.6667 / 1000).toFixed(2)} s`)
}
{
  const m = montar('core')
  const pasos = tirar(m, { h: 3 })
  af(Math.abs(pasos * 16.6667 - 1000) < 60, 'cocinada 3 s, revienta al segundo',
    `${(pasos * 16.6667 / 1000).toFixed(2)} s`)
}
{
  // **Un cliente que miente pidiendo cero se lleva el suelo igual.**
  const m = montar('core')
  const pasos = tirar(m, { h: 9999 })
  af(Math.abs(pasos * 16.6667 - GRENADES.mecha.minimoS * 1000) < 60,
    'pidiendo mecha cero, el servidor da el mínimo', `${(pasos * 16.6667 / 1000).toFixed(2)} s`)
  af(mechaDeGranada(9999) === GRENADES.mecha.minimoS, 'y la fórmula es la misma en los dos extremos')
}

console.log('\n[2] el Core reparte por área y el dueño no está exento')
{
  const m = montar('core', 2.2)
  const vidaB = m.b.vida
  tirar(m, { h: 3 })
  af(m.b.vida < vidaB, 'al rival le llega', `${vidaB} → ${m.b.vida}`)
  af(m.a.vida < 100, 'y al que la tiró también', `${m.a.vida}`)
  af(m.a.vida > m.b.vida, 'pero menos (propio 0.8)', `${m.a.vida} contra ${m.b.vida}`)
}
{
  // Lejos no llega nada: el radio es un radio.
  const m = montar('core', 30)
  tirar(m, { h: 3 })
  af(m.b.vida === 100, 'a 30 u no le llega nada', String(m.b.vida))
}

console.log('\n[3] la KO frena, y el freno viaja en la foto')
{
  const m = montar('ko', 2.2)
  const antes = m.b.movimiento.currentSpeed
  tirar(m, { h: 3 })
  m.b.movimiento._frenoAhora = m.b.movimiento.frenoDeAturdimiento(
    (m.p.paso) * 16.666666666666668,
  )
  const durante = m.b.movimiento.currentSpeed
  af(durante < antes * 0.75, 'al rival se le cae la marcha', `${antes.toFixed(3)} → ${durante.toFixed(3)} u/s`)
  const foto = m.b.movimiento.snapshot()
  af(Number.isFinite(foto.aturdidoHasta) && foto.aturdidoFreno > 0,
    'y los tres campos viajan en snapshot()',
    `hasta ${foto.aturdidoHasta} · freno ${foto.aturdidoFreno.toFixed(3)} · ${foto.aturdidoDuracion} ms`)
  // Y se recupera entero.
  for (let k = 0; k < 200; k++) {
    const q = m.p.paso + 1
    mandar(m.p, m.a, m.entrada(q)); mandar(m.p, m.b, m.entrada(q))
    m.p.tick()
  }
  m.b.movimiento._frenoAhora = m.b.movimiento.frenoDeAturdimiento(m.p.paso * 16.666666666666668)
  af(Math.abs(m.b.movimiento.currentSpeed - antes) < 1e-9, 'y vuelve entera',
    m.b.movimiento.currentSpeed.toFixed(6))
}
{
  // **Sin KO, la foto no engorda** (vuelta 83): lo que vale su valor de fábrica
  // no viaja.
  const m = montar('core')
  const foto = m.b.movimiento.snapshot()
  const claves = Object.keys(JSON.parse(JSON.stringify(foto)))
  af(!claves.some((k) => k.startsWith('aturdido')), 'sin aturdimiento no viaja ni un campo',
    `${JSON.stringify(foto).length} B`)
}

console.log('\n[4] la Blind no toca el servidor: es cosa de una pantalla')
{
  const m = montar('blind', 2.2)
  tirar(m, { h: 3 })
  af(m.b.vida === 100 && m.a.vida === 100, 'no quita ni un punto de vida',
    `${m.a.vida} / ${m.b.vida}`)
  af(m.b.movimiento.frenoDeAturdimiento(m.p.paso * 16.6667) === 1, 'ni frena a nadie')
}

console.log(`\n${fallos.length === 0 ? 'TODO OK' : `${fallos.length} FALLOS: ${fallos.join('; ')}`}`)
process.exit(fallos.length === 0 ? 0 : 1)
