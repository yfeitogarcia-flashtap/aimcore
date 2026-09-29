// Banco: se llevan varias clases de granada, se ciclan, y el tope se respeta.
// Conduce `Partida` directamente, como `rondas62`: aquí no hay una línea de red.
import { Partida } from '../net/partida.js'
import { MSG } from '../net/protocolo.js'
import { Scenario } from '../src/game/scenario.js'
import { ECONOMY, WEAPONS, catalogoDeTienda } from '../src/config.js'
import * as THREE from 'three'

let fallos = 0
function afirmar(nombre, cond, detalle = '') {
  console.log((cond ? '  ok  ' : '  FALLO ') + nombre + (detalle ? ` — ${detalle}` : ''))
  if (!cond) fallos += 1
}

const escenario = new Scenario(new THREE.Scene(), 'espejo')
const partida = new Partida({ escenario, rondas: true, compraSegundos: 15 })

const buzon = { p1: [], p2: [] }
const ids = []
for (const quien of ['p1', 'p2']) {
  ids.push(partida.entra((texto) => buzon[quien].push(JSON.parse(texto))))
}
const [a, b] = ids
const jugA = partida.jugadores.get(a)

function comprar(id, clave) {
  const item = catalogoDeTienda().find((i) => i.clave === clave)
  partida.recibe(id, JSON.stringify({ t: MSG.COMPRAR, q: item.clave }))
}

console.log('fase:', partida.rondas.fase, '| ronda', partida.rondas.n)
const cat = catalogoDeTienda().filter((i) => i.ranura === 'throwable')
console.log('granadas en el catálogo:', cat.map((i) => `${i.clave} $${i.precio}`).join(', '))
console.log('tope de clases:', ECONOMY.granadasMax, '| dinero inicial:', jugA.dinero)

// Ronda 1: el techo es equipo+utilidad, así que las granadas caben.
comprar(a, 'ko')
afirmar('la KO entra', jugA.inventario.granadas.join(',') === 'ko', jugA.inventario.granadas.join(','))
comprar(a, 'blind')
afirmar(
  'la Blind se suma, no sustituye',
  jugA.inventario.granadas.join(',') === 'ko,blind',
  jugA.inventario.granadas.join(','),
)
const dineroAntes = jugA.dinero
comprar(a, 'core')
afirmar(
  'la tercera clase se rechaza',
  jugA.inventario.granadas.join(',') === 'ko,blind',
  jugA.inventario.granadas.join(','),
)
afirmar('y no se cobra', jugA.dinero === dineroAntes, `$${dineroAntes} → $${jugA.dinero}`)

// Comprar una que ya llevas rellena su reserva.
jugA.inventario.reserva.ko = 0
const antesDinero = jugA.dinero
comprar(a, 'ko')
afirmar(
  'comprar la que ya llevas la rellena',
  jugA.inventario.reserva.ko === WEAPONS.ko.tiro.reserva.inicial,
  `reserva ko = ${jugA.inventario.reserva.ko}`,
)
afirmar('y esa sí se cobra', jugA.dinero < antesDinero, `$${antesDinero} → $${jugA.dinero}`)

// Lo que viaja.
const eco = [...buzon.p1].reverse().find((m) => m.t === MSG.ECONOMIA)
afirmar(
  'el inventario que viaja lleva la lista',
  Array.isArray(eco.inv.granadas) && eco.inv.granadas.join(',') === 'ko,blind',
  JSON.stringify(eco.inv.granadas),
)
afirmar('y ya no lleva el campo viejo', eco.inv.granada === undefined)

// Morir cuesta las granadas.
partida._perderEquipo(jugA)
afirmar('morir las quita todas', jugA.inventario.granadas.length === 0)

console.log(fallos === 0 ? '\nTODO VERDE' : `\n${fallos} FALLOS`)
process.exit(fallos === 0 ? 0 : 1)
