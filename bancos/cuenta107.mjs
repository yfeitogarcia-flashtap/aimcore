// cuenta107 — la cuenta atrás del LISTO en la sala (vuelta 107, D2), contra
// `Lobby` y `Partida` sin navegador y con el reloj de la sala adelantado a mano.
//  [1] Con uno solo no hay cuenta; con gente para jugar, sí, y se ve en la sala.
//  [2] A los 15 s pasa a aviso y a los 30 a urgente.
//  [3] A los 45 s sale quien no marcó, con su motivo; en un duelo con uno solo
//      listo no se lanza, y la cuenta se para.
//  [4] Todos listos: se lanza a los 3 s, sin esperar a los 45.
//  [5] Cambiar el mapa desmarca a todos y vuelve a empezar la cuenta.
//  [6] «Sacar de la sala»: el anfitrión puede, los demás no, y no en juego.
//  [7] Todos contra todos: con tres listos y dos sin marcar, se lanza con tres.
import * as THREE from 'three'
import { Lobby } from '../net/lobby.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG } from '../net/protocolo.js'
import { CUENTA_DE_SALA, definicionDeSala } from '../src/config.js'

let fallos = 0
const ok = (c, t, d = '') => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}${d ? ` — ${d}` : ''}`); if (!c) fallos += 1 }
const crear = (modo, clave) => new Scenario(new THREE.Scene(), definicionDeSala(modo, clave))

function sala(modo = 'duelo', mapa = 'duelo') {
  const lobby = new Lobby({ crearEscenario: crear, modo, mapa, rondas: true })
  let reloj = 1_000_000
  lobby.ahora = () => reloj
  const pasar = (s) => { reloj += s * 1000; lobby.tick() }
  const jugador = () => {
    const buzon = []
    const j = { buzon }
    j.id = lobby.entra((t) => buzon.push(JSON.parse(t)))
    j.ultimo = (t) => [...buzon].reverse().find((m) => m.t === t)
    j.manda = (o) => lobby.recibe(j.id, JSON.stringify(o))
    return j
  }
  return { lobby, pasar, jugador }
}
const cta = (j) => j.ultimo(MSG.LOBBY)?.cta ?? null

console.log('\n[1] Se arma sola cuando hay gente para jugar')
{
  const { lobby, pasar, jugador } = sala()
  const A = jugador()
  pasar(1)
  ok(lobby.cuenta === null && cta(A) === null, 'con uno solo en un duelo, no hay cuenta')
  const B = jugador()
  pasar(0)
  ok(lobby.cuenta !== null && cta(B)?.s === CUENTA_DE_SALA.totalSegundos, 'entra el segundo: empieza, y la sala lo dice', JSON.stringify(cta(B)))

  console.log('\n[2] Aviso a los 15 s y urgente a los 30')
  pasar(14.9)
  ok(cta(A)?.f === 0, 'a los 14.9 s, todavía sin aviso', JSON.stringify(cta(A)))
  pasar(0.2)
  ok(cta(A)?.f === 1, 'a los 15 s, aviso', JSON.stringify(cta(A)))
  pasar(15)
  ok(cta(A)?.f === 2 && cta(A).s === 15, 'a los 30 s, urgente, y quedan 15', JSON.stringify(cta(A)))

  console.log('\n[3] A los 45 s: fuera quien no marcó')
  A.manda({ t: MSG.LISTO, v: true })
  pasar(15.1)
  const adios = B.ultimo(MSG.ADIOS)
  ok(adios?.razon === CUENTA_DE_SALA.motivoNoListo && !lobby.miembros.has(B.id), 'B sale, y sabe por qué', JSON.stringify(adios))
  ok(!A.ultimo(MSG.ADIOS) && lobby.miembros.has(A.id), 'A, que estaba listo, se queda')
  ok(!lobby.partida && lobby.cuenta === null && cta(A) === null, 'con uno solo no se lanza, y la cuenta se para')
}

console.log('\n[4] Todos listos: a los 3 s, sin esperar')
{
  const { lobby, pasar, jugador } = sala()
  const A = jugador()
  const B = jugador()
  pasar(2)
  A.manda({ t: MSG.LISTO, v: true })
  B.manda({ t: MSG.LISTO, v: true })
  pasar(0)
  ok(cta(A)?.t === 1 && cta(A).s === CUENTA_DE_SALA.todosListosSegundos, 'la sala dice «todos listos» y 3', JSON.stringify(cta(A)))
  pasar(2.9)
  ok(!lobby.partida, 'a los 2.9 s todavía no')
  pasar(0.2)
  ok(lobby.partida && lobby.partida.jugadores.size === 2, 'a los 3 s, la partida con los dos')
  ok(lobby.cuenta === null, 'y con la partida en juego no hay cuenta')
}

console.log('\n[5] Cambiar el mapa desmarca y vuelve a empezar')
{
  const { lobby, pasar, jugador } = sala()
  const A = jugador()
  const B = jugador()
  pasar(20)
  B.manda({ t: MSG.LISTO, v: true })
  const desde = lobby.cuenta.desde
  pasar(1)
  A.manda({ t: MSG.CONFIG, mapa: 'pilares' })
  pasar(0)
  ok(lobby.cuenta && lobby.cuenta.desde > desde && cta(A)?.s === CUENTA_DE_SALA.totalSegundos, 'la cuenta empieza otra vez', JSON.stringify(cta(A)))
  ok([...lobby.miembros.values()].every((m) => !m.listo), 'y nadie está listo')
}

console.log('\n[6] Sacar de la sala')
{
  const { lobby, pasar, jugador } = sala('todos', 'rotonda')
  const [A, B, C] = [jugador(), jugador(), jugador()]
  pasar(0)
  B.manda({ t: MSG.SACAR, id: C.id })
  ok(lobby.miembros.has(C.id), 'quien no es anfitrión no puede')
  A.manda({ t: MSG.SACAR, id: A.id })
  ok(lobby.miembros.has(A.id), 'el anfitrión no se saca a sí mismo')
  A.manda({ t: MSG.SACAR, id: C.id })
  ok(!lobby.miembros.has(C.id) && C.ultimo(MSG.ADIOS)?.razon === CUENTA_DE_SALA.motivoSacado, 'el anfitrión saca a C, y C sabe por qué')
  pasar(0)
  ok(lobby.cuenta === null, 'con dos en un todos contra todos, la cuenta se para')
}

console.log('\n[7] Todos contra todos: se lanza con los listos si bastan')
{
  const { lobby, pasar, jugador } = sala('todos', 'rotonda')
  const js = [jugador(), jugador(), jugador(), jugador(), jugador()]
  pasar(0)
  ok(lobby.cuenta !== null, 'cinco en la sala: hay cuenta')
  for (const j of js.slice(0, 3)) j.manda({ t: MSG.LISTO, v: true })
  pasar(45.1)
  ok(js.slice(3).every((j) => j.ultimo(MSG.ADIOS)?.razon === CUENTA_DE_SALA.motivoNoListo), 'los dos sin marcar salen')
  ok(lobby.partida && lobby.partida.jugadores.size === 3, 'y se juega con los tres', String(lobby.partida?.jugadores.size))
}

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
