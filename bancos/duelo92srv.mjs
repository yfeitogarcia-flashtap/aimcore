// duelo92srv: la quinta ranura contra `Partida`, sin navegador.
// Lo que hay que demostrar: que el arco y el U2 se compran en SU ranura —o sea
// **además** de un arma principal y no en vez de ella—, que morir los cuesta,
// y que la reserva del U2 se sigue recargando cada ronda ahora que no vive en
// `primaria`.
import * as THREE from 'three'
import { Partida } from '../net/partida.js'
import { Scenario } from '../src/game/scenario.js'
import { ECONOMY, NET, WEAPONS } from '../src/config.js'
import { MSG } from '../net/protocolo.js'

// Cada renglón que imprime FALLO cuenta: un paso en rojo hace fallar el banco
// (auditoría de la vuelta 105; hasta aquí salía con 0 dijera lo que dijera).
let fallos = 0
const _log = console.log
console.log = (...a) => { if (a.some((x) => typeof x === 'string' && /\bFALLO\b/.test(x))) fallos += 1; _log(...a) }

const enviados = { p1: [], p2: [] }
const escenario = new Scenario(new THREE.Scene(), NET.escenario)
const partida = new Partida({ escenario, rondas: true, compraSegundos: 15 })
const p1 = partida.entra((t) => enviados.p1.push(JSON.parse(t)))
const p2 = partida.entra((t) => enviados.p2.push(JSON.parse(t)))
const inv = (id) => partida.jugadores.get(id).inventario
const dinero = (id) => partida.jugadores.get(id).dinero

const comprar = (id, clave) => partida.recibe(id, JSON.stringify({ t: MSG.COMPRAR, q: clave }))

// Saltamos a la ronda 2 (en la 1 no se venden armas) y damos saldo.
partida.rondas.n = 2
partida.rondas.fase = 'compra'
partida.jugadores.get(p1).dinero = 9000

console.log('ranura del bow:', WEAPONS.bow.slot, '· del u2:', WEAPONS.u2.slot)
console.log('precio del bow:', ECONOMY.catalogo.find((i) => i.clave === 'bow').precio)

console.log('\n-- comprar rifle Y arco, que ahora son dos ranuras --')
comprar(p1, 'rift')
comprar(p1, 'bow')
console.log('primaria:', inv(p1).primaria, '· especial:', inv(p1).especial, '· saldo:', dinero(p1))
console.log(inv(p1).primaria === 'rift' && inv(p1).especial === 'bow' ? 'OK: se llevan las dos' : 'FALLO')

console.log('\n-- comprar el U2 sustituye al arco en su ranura, no al rifle --')
comprar(p1, 'u2')
console.log('primaria:', inv(p1).primaria, '· especial:', inv(p1).especial,
  '· reserva:', JSON.stringify(inv(p1).reserva), '· saldo:', dinero(p1))
console.log(inv(p1).primaria === 'rift' && inv(p1).especial === 'u2' ? 'OK' : 'FALLO')
console.log(inv(p1).reserva.u2 === WEAPONS.u2.tiro.reserva.inicial ? 'OK: llega con su reserva llena' : 'FALLO: reserva ' + inv(p1).reserva.u2)

console.log('\n-- la reserva se repone al empezar la ronda, con el U2 en la especial --')
inv(p1).reserva.u2 = 0
partida._empezarRonda()
console.log('reserva tras empezar ronda:', inv(p1).reserva.u2,
  inv(p1).reserva.u2 === WEAPONS.u2.tiro.reserva.inicial ? 'OK' : 'FALLO')

console.log('\n-- morir cuesta la especial, como todo el equipo --')
partida._perderEquipo(partida.jugadores.get(p1))
console.log('primaria:', inv(p1).primaria, '· especial:', inv(p1).especial,
  inv(p1).especial === null ? 'OK' : 'FALLO')

console.log('\n-- y en la ronda 1 no se compra un arma especial --')
partida.rondas.n = 1
partida.rondas.fase = 'compra'
partida.jugadores.get(p2).dinero = 9000
comprar(p2, 'bow')
console.log('especial de p2:', inv(p2).especial, '· saldo:', dinero(p2),
  inv(p2).especial === null && dinero(p2) === 9000 ? 'OK: rechazada y sin cobrar' : 'FALLO')

console.log('\n-- y el Reaper se paga, que no se pagaba desde la vuelta 90 --')
partida.rondas.n = 2
const j = partida.jugadores.get(p2)
j.dinero = 5000
j.inventario.secundaria = null
comprar(p2, 'reaper')
const precioReaper = ECONOMY.catalogo.find((i) => i.clave === 'reaper').precio
console.log('pistola:', j.inventario.secundaria, '· saldo:', j.dinero, `(esperado ${5000 - precioReaper})`,
  j.inventario.secundaria === 'reaper' && j.dinero === 5000 - precioReaper ? 'OK' : 'FALLO')
comprar(p2, 'reaper')
console.log('y comprarlo otra vez no vuelve a cobrar · saldo:', j.dinero,
  j.dinero === 5000 - precioReaper ? 'OK' : 'FALLO')

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
