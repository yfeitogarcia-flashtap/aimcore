// lobby101 — el lobby y los equipos contra `Lobby` y `Partida`, sin navegador.
import * as THREE from 'three'
import { Lobby } from '../net/lobby.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG } from '../net/protocolo.js'
import { definicionDeSala, SIM_STEP_MS } from '../src/config.js'

let fallos = 0
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}`); if (!c) fallos += 1 }
const crear = (modo, clave) => new Scenario(new THREE.Scene(), definicionDeSala(modo, clave))

function jugador(lobby) {
  const buzon = []
  const j = { buzon, id: null }
  j.id = lobby.entra((t) => buzon.push(JSON.parse(t)))
  j.ultimo = (t) => [...buzon].reverse().find((m) => m.t === t)
  j.manda = (o) => lobby.recibe(j.id, JSON.stringify(o))
  return j
}

console.log('[1] Entrar, huecos y anfitrión')
const lobby = new Lobby({ crearEscenario: crear, modo: 'duelo', mapa: 'duelo', rondas: true })
const A = jugador(lobby)
const B = jugador(lobby)
let e = A.ultimo(MSG.LOBBY)
ok(e.anf === A.id && e.tu === A.id, `A es el anfitrión (${e.anf})`)
ok(e.huecos === 2 && e.m.map((m) => m.h).join(',') === '0,1', `duelo: 2 huecos, A en 0 y B en 1 (${e.m.map((m) => m.h)})`)
ok(e.req.puede === false && /cada equipo/.test(e.req.motivo), `sin listos no se lanza: «${e.req.motivo}»`)

console.log('[2] Cambiar a 2v2 lo configura el anfitrión, y sólo él')
B.manda({ t: MSG.CONFIG, modo: '2v2' })
ok(B.ultimo(MSG.LOBBY).modo === 'duelo', 'B no puede cambiar el modo')
A.manda({ t: MSG.CONFIG, modo: '2v2' })
const C = jugador(lobby)
const D = jugador(lobby)
e = D.ultimo(MSG.LOBBY)
ok(e.modo === '2v2' && e.huecos === 4, `2v2 con 4 huecos (${e.modo}, ${e.huecos})`)
const bandos = e.m.map((m) => m.h % 2)
ok(bandos.filter((b) => b === 0).length === 2 && bandos.filter((b) => b === 1).length === 2, `equilibrados al entrar (${e.m.map((m) => m.h)})`)

console.log('[3] LISTO y lanzar')
A.manda({ t: MSG.LISTO, v: true })
e = A.ultimo(MSG.LOBBY)
ok(!e.req.puede && /magenta/.test(e.req.motivo), `un listo azul: «${e.req.motivo}»`)
B.manda({ t: MSG.LISTO, v: true })
e = A.ultimo(MSG.LOBBY)
ok(e.req.puede, `uno listo en cada bando: se puede (${e.req.listos} listos)`)
B.manda({ t: MSG.LANZAR })
ok(!lobby.partida, 'B no lanza: no es el anfitrión')
A.manda({ t: MSG.LANZAR })
ok(lobby.partida && lobby.partida.jugadores.size === 2, `A lanza: una partida con los 2 listos (${lobby.partida?.jugadores.size})`)
const bA = A.ultimo(MSG.BIENVENIDA)
const bB = B.ultimo(MSG.BIENVENIDA)
ok(bA && bB && !C.ultimo(MSG.BIENVENIDA), 'bienvenida a A y B, no a C (no estaba listo)')
ok(bA.bando === 0 && bB.bando === 1 && bA.por === 2, `bandos 0 y 1, 2 por equipo (${bA.bando}, ${bB.bando}, ${bA.por})`)
e = C.ultimo(MSG.LOBBY)
ok(e.pt.e === 'juego' && e.m.find((m) => m.id === A.id).p === 1 && !e.m.find((m) => m.id === C.id).p, 'el lobby dice partida en juego, A dentro, C fuera')
ok(lobby.partida.rondas.fase === 'compra', `arranca en compra (${lobby.partida.rondas.fase})`)

console.log('[4] Sin fuego amigo, y la ronda la cierra quedarse sin nadie')
// Un 2v2 completo: nueva sala.
const L = new Lobby({ crearEscenario: crear, modo: '2v2', mapa: 'duelo', rondas: true, compra: 0 })
const js = [jugador(L), jugador(L), jugador(L), jugador(L)]
for (const j of js) j.manda({ t: MSG.LISTO, v: true })
js[0].manda({ t: MSG.LANZAR })
const p = L.partida
ok(p.jugadores.size === 4 && p.rondas.fase === 'ronda', `4 dentro y sin compra: en ronda (${p.rondas.fase})`)
const [p0, p1, p2, p3] = [...p.jugadores.values()].sort((a, b) => a.ranura - b.ranura)
ok(p0.bando === 0 && p2.bando === 0 && p1.bando === 1 && p3.bando === 1, 'ranura par azul, impar magenta')
p0.arma = 'rift'
ok(p._aplicarDano(p2, 50, p0, 'torso') === false && p2.vida === 100, 'un compañero no encaja daño')
ok(p._aplicarDano(p1, 150, p0, 'torso') === true, 'un rival sí, y muere')
const gp = js.find((j) => j.ultimo(MSG.BIENVENIDA)?.id === p1.id)
ok(gp.ultimo(MSG.GOLPE)?.vida === 0, 'el golpe llega a la víctima sin esperar a la foto')
ok(js.every((j) => j.ultimo(MSG.BAJA)?.v === p1.id), 'la baja llega a los cuatro')
p.tick()
ok(p.rondas.fase === 'ronda', 'con uno de magenta en pie, la ronda sigue')
p._aplicarDano(p3, 150, p0, 'torso')
p.tick()
ok(p.rondas.marcador[0] === 1, `sin magentas en pie, ronda para el azul (${p.rondas.marcador})`)

console.log('[5] Todos contra todos: diez butacas y un color por ranura')
const T = new Lobby({ crearEscenario: crear, modo: 'todos', mapa: 'rotonda', rondas: false })
const ts = []
for (let i = 0; i < 11; i++) ts.push(jugador(T))
e = ts[0].ultimo(MSG.LOBBY)
ok(e.huecos === 10, `La Rotonda en todos: 10 huecos (${e.huecos})`)
ok(e.m.filter((m) => m.h !== null).length === 10 && e.m[10].h === null, 'el undécimo espera sin hueco')
for (const j of ts.slice(0, 2)) j.manda({ t: MSG.LISTO, v: true })
e = ts[0].ultimo(MSG.LOBBY)
ok(!e.req.puede && e.req.faltan === 1, `con 2 listos: «${e.req.motivo}»`)
ts[2].manda({ t: MSG.LISTO, v: true })
// Desde la vuelta 105 no se lanza con más gente en la sala de la que cabe: el
// undécimo que espera sin hueco lo impide, y al irse, se lanza.
ts[0].manda({ t: MSG.LANZAR })
ok(!T.partida && /Sois 11/.test(ts[0].ultimo(MSG.LOBBY).req.motivo), `con 11 en la sala no se lanza: «${ts[0].ultimo(MSG.LOBBY).req.motivo}»`)
T.abandona(ts[10].id)
ts[0].manda({ t: MSG.LANZAR })
ok(T.partida?.jugadores.size === 3 && T.partida.todos.fase === 'juego', `con 3 se lanza (${T.partida?.jugadores.size})`)
ts[3].manda({ t: MSG.ENTRAR })
ok(T.partida.jugadores.size === 4, 'y en el todos contra todos se entra con la partida en marcha')

console.log('[6] El final y la revancha')
const pt = T.partida
const primero = [...pt.jugadores.values()][0]
primero.bajas = 20
pt.tick()
ok(pt.todos.fase === 'fin', 'a las 20 bajas, fin')
for (let i = 0; i < 700; i++) T.tick()
ok(T.partida === pt && pt.todos.fase === 'fin', 'y se queda en fin: no vuelve a empezar sola')
e = ts[0].ultimo(MSG.LOBBY)
ok(e.pt.e === 'fin', 'el lobby lo dice (pt.e fin)')
const pasoAntes = T.paso
for (const j of ts.slice(0, 3)) j.manda({ t: MSG.VOLVER })
e = ts[0].ultimo(MSG.LOBBY)
ok(e.m.slice(0, 3).every((m) => m.v === 1 && m.l === 1), 'Volver a jugar: vuelto y listo')
ts[0].manda({ t: MSG.LANZAR })
ok(T.partida !== pt && T.partida.numero === 2 && T.partida.paso === pasoAntes, `otra partida, número 2, mismo paso (${T.partida.paso} / ${pasoAntes})`)
const bienv = ts[0].ultimo(MSG.BIENVENIDA)
ok(bienv.partida === 2, 'la bienvenida nueva dice qué partida es')

console.log('[7] Dos cables con el mismo pase: el lobby devuelve el mismo sitio')
const X = new Lobby({ crearEscenario: crear, modo: 'todos', mapa: 'rotonda', rondas: false })
const x1 = jugador(X)
const pase = x1.ultimo(MSG.LOBBY) && [...X.miembros.values()][0].pase
const buzon2 = []
const id2 = X.entra((t) => buzon2.push(JSON.parse(t)), pase)
ok(id2 === x1.id && X.miembros.size === 1, 'el mismo sitio, no uno más (el huésped cierra el cable viejo)')

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
