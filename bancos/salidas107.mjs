// salidas107 — una salida pone los pies en **su** suelo (vuelta 107, F6).
//
// En un duelo en Aim Camp se nacía en el aire y se caía: la salida sólo dice x,
// z y rumbo, y el servidor ponía al jugador en el spawn de entrenamiento
// —(0, 0), encima de un muro de 20 u que parte el mapa— y le cambiaba después
// x y z. Los pies se quedaban a la altura del suelo del spawn. Se mide contra
// `Partida` y contra el cliente de movimiento, sin navegador:
//  [1] Aim Camp: las dos butacas nacen con los pies en 0 y en el suelo, al
//      entrar y al reaparecer, y la premisa: el spawn del mapa está a 20 u.
//  [2] Una salida encima de una plataforma baja se apoya en ella, y una que no
//      tiene nada debajo, en el suelo: la altura sale de la salida.
import * as THREE from 'three'
import { Partida } from '../net/partida.js'
import { Scenario } from '../src/game/scenario.js'
import { MovementController } from '../src/game/movement.js'
import { MOVEMENT, SCENARIOS } from '../src/config.js'
import { sanearMapa } from '../src/maps/formato.js'

let fallos = 0
const ok = (c, t, d = '') => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}${d ? ` — ${d}` : ''}`); if (!c) fallos += 1 }
const escena = (def) => new Scenario(new THREE.Scene(), def)
const f = (n) => n.toFixed(3)

function butacas(def) {
  const p = new Partida({ escenario: escena(def), modo: 'duelo', rondas: false, depurar: true })
  const js = [0, 1].map(() => { const id = p.entra(() => {}); return p.jugadores.get(id) })
  return { p, js }
}

console.log('\n[1] Aim Camp: se nace en el suelo de la salida')
{
  const def = SCENARIOS['Aim-camp-1']
  const e = escena(def)
  const sueloSpawn = e.groundHeightAt(def.spawn.x, def.spawn.z, 0)
  ok(sueloSpawn > 10, 'premisa: el spawn de entrenamiento cae encima del muro', `suelo ${f(sueloSpawn)} u`)
  const { p, js } = butacas(def)
  for (const j of js) {
    const s = p.salidas[j.ranura]
    ok(Math.abs(j.movimiento.feetY) < 1e-9 && !j.movimiento.airborne && Math.abs(j.pose.position.y - MOVEMENT.standHeight) < 1e-9,
      `butaca ${j.ranura} en (${s.x}, ${s.z}): pies en el suelo al entrar`, `pies ${f(j.movimiento.feetY)} · ojos ${f(j.pose.position.y)}`)
  }
  for (let i = 0; i < 20; i++) p.tick()
  const j = js[0]
  p._reaparecer(j)
  ok(Math.abs(j.movimiento.feetY) < 1e-9 && !j.movimiento.airborne, 'y al reaparecer', `pies ${f(j.movimiento.feetY)}`)
}

console.log('\n[2] La altura sale de la salida, no del spawn')
{
  const def = sanearMapa({
    clave: 'salidas107', label: 'salidas107', soloDuelo: true, modos: ['duelo'],
    room: { width: 40, depth: 40, height: 10 }, spawn: { x: 0, z: 0 },
    duelo: { salidas: [{ x: -10, z: 10, yaw: 0 }, { x: 10, z: -10, yaw: Math.PI }] },
    boxes: [
      { kind: 'bordillo', x: -12, z: 8, w: 4, d: 4 },   // la salida 0 cae encima
      { kind: 'alta', x: -2, z: -2, w: 4, d: 4 },       // el spawn, dentro de un bloque
    ],
  }).mapa
  const { js } = butacas(def)
  const bordillo = escena(def).groundHeightAt(-10, 10, 0)
  ok(Math.abs(js[0].movimiento.feetY - bordillo) < 1e-9 && bordillo > 0.5, 'la salida encima de un bordillo se apoya en él', `pies ${f(js[0].movimiento.feetY)} · bordillo ${f(bordillo)}`)
  ok(Math.abs(js[1].movimiento.feetY) < 1e-9, 'la que no tiene nada debajo, en el suelo', `pies ${f(js[1].movimiento.feetY)}`)
  // Y el cliente: `reset(x, z)` hace la misma pregunta que el servidor.
  const pose = new THREE.PerspectiveCamera()
  const m = new MovementController(pose)
  m.setScenario(escena(def))
  m.reset(-10, 10)
  ok(Math.abs(m.feetY - bordillo) < 1e-9 && pose.position.x === -10 && pose.position.z === 10, 'el cliente pone los pies en el mismo sitio', `pies ${f(m.feetY)}`)
  m.reset()
  ok(m.feetY > 3, 'y sin argumentos sigue siendo el spawn de siempre', `pies ${f(m.feetY)}`)
}

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
