// todos105 — el todos contra todos admite de 3 a 10 según las salidas del mapa,
// contra `Lobby` y `Partida` de verdad y sin navegador. Mide: el rango que
// publica cada mapa, que los huecos se limiten a él, que no se lance con más
// gente de la que cabe (y que se lance en cuanto cabe), que La Rotonda siga
// igual, y que el saneado quite el modo por debajo de tres salidas.
import * as THREE from 'three'
import { Lobby } from '../net/lobby.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG } from '../net/protocolo.js'
import { TODOS, TODOS_SCENARIOS, capacidadDeTodos, definicionDeSala, rangoDeJugadores } from '../src/config.js'
import { sanearMapa } from '../src/maps/formato.js'

let fallos = 0
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}`); if (!c) fallos += 1 }
const crear = (modo, clave) => new Scenario(new THREE.Scene(), definicionDeSala(modo, clave))

// Dos mapas de prueba sacados de La Rotonda: la misma sala con cinco y con tres
// salidas. Se meten en la lista del modo, que es de donde la sala los saca.
const rotonda = TODOS_SCENARIOS.rotonda
TODOS_SCENARIOS.prueba5 = { ...rotonda, clave: 'prueba5', label: 'Prueba 5', todos: { salidas: rotonda.todos.salidas.slice(0, 5) } }
TODOS_SCENARIOS.prueba3 = { ...rotonda, clave: 'prueba3', label: 'Prueba 3', todos: { salidas: rotonda.todos.salidas.slice(0, 3) } }

function jugador(lobby) {
  const buzon = []
  const j = { buzon, id: null }
  j.id = lobby.entra((t) => buzon.push(JSON.parse(t)))
  j.ultimo = (t) => [...buzon].reverse().find((m) => m.t === t)
  j.manda = (o) => lobby.recibe(j.id, JSON.stringify(o))
  return j
}

console.log('[1] El rango sale de las salidas, con suelo y techo')
ok(rotonda.todos.salidas.length === 12 && rangoDeJugadores(capacidadDeTodos(rotonda)) === '3–10 jugadores',
  `La Rotonda sigue igual: ${rotonda.todos.salidas.length} salidas, ${rangoDeJugadores(capacidadDeTodos(rotonda))}`)
ok(rangoDeJugadores(capacidadDeTodos(TODOS_SCENARIOS.prueba5)) === '3–5 jugadores', `5 salidas: ${rangoDeJugadores(capacidadDeTodos(TODOS_SCENARIOS.prueba5))}`)
ok(rangoDeJugadores(capacidadDeTodos(TODOS_SCENARIOS.prueba3)) === '3 jugadores', `3 salidas: ${rangoDeJugadores(capacidadDeTodos(TODOS_SCENARIOS.prueba3))}`)

console.log('[2] Los huecos del lobby son los del mapa')
const lobby = new Lobby({ crearEscenario: crear, modo: 'todos', mapa: 'rotonda', rondas: true })
const gente = []
for (let i = 0; i < 7; i++) gente.push(jugador(lobby))
const A = gente[0]
let e = A.ultimo(MSG.LOBBY)
ok(e.huecos === 10 && e.m.every((m) => m.h !== null), `La Rotonda: 10 huecos y los 7 sentados (${e.huecos})`)
for (const j of gente) j.manda({ t: MSG.LISTO, v: true })
e = A.ultimo(MSG.LOBBY)
ok(e.req.puede === true, `siete listos en La Rotonda: se puede lanzar («${e.req.motivo || 'listo'}»)`)

console.log('[3] Cambiar a un mapa de cinco con siete dentro no deja lanzar')
A.manda({ t: MSG.CONFIG, mapa: 'prueba5' })
e = A.ultimo(MSG.LOBBY)
const sentados = e.m.filter((m) => m.h !== null).length
ok(e.mapa === 'prueba5' && e.huecos === 5 && sentados === 5, `Prueba 5: ${e.huecos} huecos y ${sentados} sentados de ${e.m.length}`)
for (const j of gente) j.manda({ t: MSG.LISTO, v: true })
e = A.ultimo(MSG.LOBBY)
ok(e.req.puede === false && /Sois 7.*caben 5/.test(e.req.motivo), `con 7 en la sala no se lanza: «${e.req.motivo}»`)
A.manda({ t: MSG.LANZAR })
ok(lobby.partida === null, 'y pedirlo igual no lanza nada (lo decide la misma función)')

console.log('[4] En cuanto cabe, se lanza, y la partida tiene esas butacas')
gente[6].manda({ t: MSG.ADIOS })
lobby.abandona(gente[6].id)
e = A.ultimo(MSG.LOBBY)
ok(e.req.puede === false && /Sois 6/.test(e.req.motivo), `con 6: sigue sin caber («${e.req.motivo}»)`)
lobby.abandona(gente[5].id)
for (const j of gente.slice(0, 5)) j.manda({ t: MSG.LISTO, v: true })
e = A.ultimo(MSG.LOBBY)
ok(e.req.puede === true, `con 5 listos en 5 huecos se puede lanzar (${e.req.listos} listos)`)
A.manda({ t: MSG.LANZAR })
ok(lobby.partida && lobby.partida.plazas === 5 && lobby.partida.jugadores.size === 5,
  `partida lanzada con ${lobby.partida?.plazas} butacas y ${lobby.partida?.jugadores.size} jugadores`)

console.log('[5] Un mapa de tres: tres huecos, y con dos listos no se lanza')
const chico = new Lobby({ crearEscenario: crear, modo: 'todos', mapa: 'prueba3', rondas: true })
const tres = [jugador(chico), jugador(chico)]
tres.forEach((j) => j.manda({ t: MSG.LISTO, v: true }))
e = tres[0].ultimo(MSG.LOBBY)
ok(e.huecos === 3 && e.req.puede === false && /Falta 1/.test(e.req.motivo), `dos listos de 3: «${e.req.motivo}»`)
tres.push(jugador(chico))
tres[2].manda({ t: MSG.LISTO, v: true })
e = tres[0].ultimo(MSG.LOBBY)
ok(e.req.puede === true, 'con tres listos, sí')

console.log('[6] El saneado quita el modo por debajo de tres salidas')
const dos = sanearMapa({ clave: 'dos', label: 'Dos', modos: ['todos'], room: { width: 40, depth: 40, height: 10 }, spawn: { x: 0, z: 0 }, boxes: [], todos: { salidas: [{ x: 5, z: 5, yaw: 0 }, { x: -5, z: -5, yaw: 0 }] } })
ok(!(dos.mapa.modos ?? []).includes('todos') && dos.problemas.some((p) => /al menos 3/.test(p)), `dos salidas: sin modo y dicho («${dos.problemas.find((p) => /todos/.test(p))}»)`)
ok(TODOS.minJugadores === 3 && TODOS.maxJugadores === 10, `los topes siguen en ${TODOS.minJugadores} y ${TODOS.maxJugadores}`)

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
