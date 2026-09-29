// afk107 — la inactividad en una partida (vuelta 107, D3), contra `Lobby` y
// `Partida` sin navegador y con el reloj de pared adelantado a mano.
//  [1] A los 45 s sin tocar nada, «¿sigues ahí?»; una tecla lo quita.
//  [2] Al minuto, fuera como una caída: la butaca se guarda y el duelo espera.
//  [3] «Estoy aquí» devuelve la butaca y levanta la pausa.
//  [4] A los dos minutos, fuera de la sala con su motivo, y el rival gana.
//  [5] Sin lobby (los bancos de netcode) no se vigila.
import * as THREE from 'three'
import { Lobby } from '../net/lobby.js'
import { Partida } from '../net/partida.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG } from '../net/protocolo.js'
import { AFK, definicionDeSala } from '../src/config.js'

let fallos = 0
const ok = (c, t, d = '') => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}${d ? ` — ${d}` : ''}`); if (!c) fallos += 1 }
const crear = (modo, clave) => new Scenario(new THREE.Scene(), definicionDeSala(modo, clave))
let T = 1_000_000_000
Date.now = () => T

const lobby = new Lobby({ crearEscenario: crear, modo: 'duelo', mapa: 'duelo', compra: 0, rondas: true })
lobby.ahora = () => T
const jugador = () => {
  const buzon = []
  const j = { buzon }
  j.id = lobby.entra((t) => buzon.push(JSON.parse(t)))
  j.ultimo = (t) => [...buzon].reverse().find((m) => m.t === t)
  j.manda = (o) => lobby.recibe(j.id, JSON.stringify(o))
  return j
}
const A = jugador()
const B = jugador()
A.manda({ t: MSG.LISTO, v: true })
B.manda({ t: MSG.LISTO, v: true })
A.manda({ t: MSG.LANZAR })
const p = lobby.partida
ok(p && p.afk === true, 'premisa: la partida del lobby vigila la inactividad')
let n = 0
/** Un segundo de mundo: A toca una tecla en cada paso; B, sólo si se le pide. */
function segundo(bTambien = false) {
  for (let i = 0; i < 60; i++) {
    n += 1
    T += 1000 / 60
    for (const j of [A, ...(bTambien ? [B] : [])]) j.manda({ t: MSG.ENTRADA, n, k: 1, yaw: 0, w: 0 })
    lobby.tick()
  }
}
const jb = () => p.jugadores.get(lobby.miembros.get(B.id)?.pid)
for (let s = 0; s < 3; s++) segundo(true)
ok(p.enJuego, 'premisa: la ronda está en marcha', p.rondas.fase)

console.log('\n[1] El aviso')
for (let s = 0; s < AFK.avisoSegundos - 1; s++) segundo()
ok(!B.ultimo(MSG.AFK), `a los ${AFK.avisoSegundos - 1} s, nada`)
segundo(); segundo()
ok(B.ultimo(MSG.AFK)?.e === 1 && !A.ultimo(MSG.AFK), `a los ${AFK.avisoSegundos} s, «¿sigues ahí?» a B y a A nada`, JSON.stringify(B.ultimo(MSG.AFK)))
segundo(true)
ok(B.ultimo(MSG.AFK)?.e === 0, 'B toca una tecla: se quita')

console.log('\n[2] Fuera al minuto, como una caída')
for (let s = 0; s < AFK.fueraSegundos + 1; s++) segundo()
ok(B.ultimo(MSG.AFK)?.e === 2 && jb()?.desconectado && jb()?.afk, 'B está fuera, con la butaca guardada', JSON.stringify(B.ultimo(MSG.AFK)))
ok(p.pausa?.motivo === 'caida', 'y el duelo espera, como con una caída', p.pausa?.motivo)

console.log('\n[3] Volver')
const bienvenidas = B.buzon.filter((m) => m.t === MSG.BIENVENIDA).length
B.manda({ t: MSG.AFK })
ok(!jb()?.desconectado && !jb()?.afk && B.ultimo(MSG.AFK)?.e === 0, 'B pulsa una tecla: vuelve a su butaca')
ok(B.buzon.filter((m) => m.t === MSG.BIENVENIDA).length === bienvenidas + 1 && !p.pausa, 'con su bienvenida, y la pausa se levanta')

console.log('\n[4] A los dos minutos, fuera de la sala')
for (let s = 0; s < AFK.fueraSegundos + 1; s++) segundo()
ok(jb()?.afk, 'premisa: otra vez fuera')
for (let s = 0; s < AFK.expulsionSegundos - AFK.fueraSegundos + 1; s++) segundo()
ok(B.ultimo(MSG.ADIOS)?.razon === AFK.motivo && !lobby.miembros.has(B.id), 'B sale de la sala, y sabe por qué', JSON.stringify(B.ultimo(MSG.ADIOS)))
ok(lobby.miembros.has(A.id) && (p.terminada || p.rondas.fase === 'fin'), 'A se queda, y la partida acaba', p.rondas.fase)

console.log('\n[5] Sin lobby no se vigila')
{
  const q = new Partida({ escenario: crear('duelo', 'duelo'), rondas: false })
  const buzon = []
  q.entra((t) => buzon.push(JSON.parse(t)))
  q.entra(() => {})
  for (let i = 0; i < 60 * (AFK.fueraSegundos + 5); i++) { T += 1000 / 60; q.tick() }
  ok(!buzon.some((m) => m.t === MSG.AFK) && ![...q.jugadores.values()].some((j) => j.afk), 'nadie sale por quieto')
}

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
