// peanas106 — las reglas de partida y las peanas contra `Partida` y `Scenario`,
// sin navegador (vuelta 106, propuesta 08). Grupo A.
//
// Lo que mide: que un mapa sin reglas se juega igual y Los Pilares se lee como
// Equipadas; que el servidor valida cada recogida (alcance, pared, muerto, modo)
// y contesta siempre; que cinco a la vez se llevan cinco armas; que en Armería
// el catálogo y el arma de cada entrada se filtran; que morir cuesta lo
// recogido y no el equipo base; y lo que cuesta buscar la peana apuntada.
import * as THREE from 'three'
import { Partida } from '../net/partida.js'
import { MSG } from '../net/protocolo.js'
import { Scenario } from '../src/game/scenario.js'
import { ECONOMY, SCENARIOS, WEAPON_ORDER, definicionDeSala } from '../src/config.js'
import { sanearMapa } from '../src/maps/formato.js'

let fallos = 0
const ok = (c, t, d = '') => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}${d ? ` — ${d}` : ''}`); if (!c) fallos += 1 }

/** Un mapa de prueba: una sala, tres salidas de todos contra todos, un muro y tres peanas. */
function mapa(reglas, peanas) {
  return sanearMapa({
    clave: 'peanas106', label: 'peanas106', modos: ['todos'],
    room: { width: 40, depth: 40, height: 10 }, spawn: { x: 0, z: 10 },
    todos: { salidas: [{ x: -10, z: 10, yaw: 0 }, { x: 0, z: 10, yaw: 0 }, { x: 10, z: 10, yaw: 0 }] },
    // Un muro alto entre x 3 y 3.6: lo que hay detrás no se ve.
    boxes: [{ kind: 'alta', x: 3, z: -8, w: 0.6, d: 6 }],
    reglas, peanas,
  }).mapa
}
const escena = (def) => new Scenario(new THREE.Scene(), def)

function sala(def, { modo = 'todos', rondas = false } = {}) {
  const p = new Partida({ escenario: escena(def), modo, rondas, depurar: true })
  const js = []
  const entra = () => {
    const buzon = []
    const id = p.entra((t) => buzon.push(JSON.parse(t)))
    const j = { id, buzon, jug: p.jugadores.get(id) }
    j.ultimo = (t) => [...buzon].reverse().find((m) => m.t === t)
    j.manda = (o) => p.recibe(id, JSON.stringify(o))
    js.push(j)
    return j
  }
  return { p, js, entra }
}
const colocar = (j, x, z) => { j.jug.pose.position.set(x, 1.7, z) }

// ------------------------------------------------------------ [0] lo de hoy
console.log('\n[0] Un mapa sin reglas se juega igual, y Los Pilares se lee como Equipadas')
{
  const espejo = new Partida({ escenario: escena(definicionDeSala('duelo', 'duelo')), modo: 'duelo', rondas: true, depurar: true })
  ok(espejo.reglas.modo === 'armeria' && espejo.dotacion === null, `El Espejo: armería y sin reparto (${espejo.reglas.modo})`)
  const pilares = new Partida({ escenario: escena(SCENARIOS.pilares), modo: 'duelo', rondas: true, depurar: true })
  const d = pilares.dotacion
  ok(pilares.reglas.modo === 'equipadas' && d?.primaria === 'scout' && d.chaleco && !d.casco,
    `Los Pilares: Equipadas con Scout y chaleco, sin tocar su fichero (${JSON.stringify(d)})`)
  ok(pilares.compraSegundos === 0, 'y sin fase de compra, como desde la vuelta 72')
  // Los que ya las declaran —desde la vuelta 107 hay uno de Yago con peanas—
  // no cuentan: lo que se mide es que ninguno las **gane** al guardarse.
  let cambian = 0
  let sinReglas = 0
  for (const def of Object.values(SCENARIOS)) {
    if ('reglas' in def || 'peanas' in def) continue
    sinReglas += 1
    const a = sanearMapa(def).mapa
    if ('reglas' in a || 'peanas' in a) cambian += 1
  }
  ok(sinReglas > 5 && cambian === 0, `ningún mapa sin reglas gana «reglas» ni «peanas» al guardarse (${cambian} de ${sinReglas})`)
}

// ------------------------------------------------------------ [1] validar
console.log('\n[1] Todos contra todos en Peanas: el servidor valida cada recogida')
const REGLAS = { modo: 'peanas', armas: ['krakov', 'rift', 'pulse', 'reaper', 'core', 'fang'], equipo: { chaleco: true } }
const PEANAS = [{ x: 0, z: -5, arma: 'krakov' }, { x: 4.4, z: -5, arma: 'rift' }, { x: -6, z: -5, arma: 'core' }]
{
  const { p, entra } = sala(mapa(REGLAS, PEANAS))
  const [a, b, c] = [entra(), entra(), entra()]
  for (let i = 0; i < 3; i++) p.tick()
  ok(a.ultimo(MSG.BIENVENIDA)?.libres === 0, 'la bienvenida dice que las armas no son libres')
  const eco = a.ultimo(MSG.ECONOMIA)
  ok(eco && eco.inv.primaria === null && eco.inv.escudo === ECONOMY.escudoPorChaleco,
    `sale con el equipo base y sin principal (${JSON.stringify(eco?.inv && { p: eco.inv.primaria, e: eco.inv.escudo })})`)

  colocar(a, 0, -3)
  a.manda({ t: MSG.RECOGER, i: 0 })
  const r = a.ultimo(MSG.RECOGER)
  ok(r?.ok === 1 && r.a === 'krakov' && a.jug.inventario.primaria === 'krakov', `a dos pasos, la coge (${JSON.stringify(r)})`)
  ok(a.ultimo(MSG.ECONOMIA).inv.primaria === 'krakov', 'y el inventario llega por la economía de siempre')
  a.manda({ t: MSG.RECOGER, i: 0 })
  ok(a.ultimo(MSG.RECOGER).rc === 1, 'coger la que ya llevas recarga')

  colocar(b, 0, 5)
  b.manda({ t: MSG.RECOGER, i: 0 })
  ok(b.ultimo(MSG.RECOGER)?.ok === 0 && b.ultimo(MSG.RECOGER).m === 'lejos' && b.jug.inventario.primaria === null, 'a diez unidades, no, y lo dice')
  colocar(b, 2.2, -5)
  b.manda({ t: MSG.RECOGER, i: 1 })
  ok(b.ultimo(MSG.RECOGER)?.ok === 0 && b.ultimo(MSG.RECOGER).m === 'pared', 'con el muro en medio, no, aunque esté a dos pasos')
  b.manda({ t: MSG.RECOGER, i: 99 })
  ok(b.ultimo(MSG.RECOGER)?.ok === 0, 'una peana que no existe, no — y contesta igual')
  colocar(c, 0.5, -3.5)
  c.jug.vida = 0
  c.manda({ t: MSG.RECOGER, i: 0 })
  ok(c.ultimo(MSG.RECOGER)?.ok === 0, 'un muerto no coge nada')
  c.jug.vida = 100
  colocar(c, -6, -3.5)
  c.manda({ t: MSG.RECOGER, i: 2 })
  ok(c.ultimo(MSG.RECOGER)?.ok === 1 && c.jug.inventario.granadas.includes('core'), 'una granada entra en la lista de granadas')

  // No se gasta: los tres cogen la misma.
  for (const j of [a, b, c]) { colocar(j, 0, -3.2); j.manda({ t: MSG.RECOGER, i: 0 }) }
  ok([a, b, c].every((j) => j.jug.inventario.primaria === 'krakov'), 'la misma peana, tres armas: no se agota')

  console.log('\n[2] El arma de cada entrada tiene que ser una de las suyas')
  const entrada = (j, w) => {
    const n = j.jug.ack + 1
    j.manda({ t: MSG.ENTRADA, n, k: 0, yaw: 0, jt: -1, w: WEAPON_ORDER.indexOf(w) })
    p.tick(); p.tick()
  }
  entrada(a, 'rift')
  ok(a.jug.arma !== 'rift', `declarar un Rift que no lleva no se lo pone (${a.jug.arma})`)
  entrada(a, 'krakov')
  ok(a.jug.arma === 'krakov', `el Krakov que cogió, sí (${a.jug.arma})`)

  console.log('\n[3] Morir cuesta lo recogido, no el equipo base')
  a.jug.vida = 0
  a.jug.vivoEn = a.jug.ack + 1
  entrada(a, 'pulse')
  const tras = a.ultimo(MSG.ECONOMIA).inv
  ok(tras.primaria === null && tras.escudo === ECONOMY.escudoPorChaleco, `al reaparecer: sin el Krakov y con el chaleco (${JSON.stringify({ p: tras.primaria, e: tras.escudo })})`)
}

// ------------------------------------------------------------ [4] armería
console.log('\n[4] Armería con las armas marcadas: el catálogo y la entrada se filtran')
{
  const def = { ...definicionDeSala('duelo', 'duelo'), reglas: { modo: 'armeria', armas: ['rift', 'pulse', 'core'] } }
  const { p, entra } = sala(def, { modo: 'duelo', rondas: true })
  const [a, b] = [entra(), entra()]
  for (let i = 0; i < 3; i++) p.tick()
  p.rondas.n = 2
  a.jug.dinero = 9000
  a.manda({ t: MSG.COMPRAR, q: 'krakov' })
  ok(a.jug.inventario.primaria !== 'krakov' && a.jug.dinero === 9000, 'un Krakov que el mapa no admite no se vende, ni se cobra')
  a.manda({ t: MSG.COMPRAR, q: 'rift' })
  ok(a.jug.inventario.primaria === 'rift' && a.jug.dinero < 9000, `un Rift, sí (${a.jug.inventario.primaria}, $${a.jug.dinero})`)
  a.manda({ t: MSG.COMPRAR, q: 'chaleco' })
  ok(a.jug.escudo > 0, 'y el chaleco no es un arma: se vende siempre')
  ok(b.ultimo(MSG.BIENVENIDA)?.eco === 1, 'y sigue habiendo economía')
}

// ------------------------------------------------------------ [5] equipadas y peanas en rondas
console.log('\n[5] En rondas: Equipadas reparte cada ronda; Peanas conserva lo del que sobrevive')
{
  const def = { ...definicionDeSala('duelo', 'duelo'), reglas: { modo: 'equipadas', armas: ['krakov', 'pulse', 'reaper', 'core'], equipo: { principal: 'krakov', pistola: 'reaper', granadas: ['core'], casco: true } } }
  const { p, entra } = sala(def, { modo: 'duelo', rondas: true })
  const [a] = [entra(), entra()]
  for (let i = 0; i < 3; i++) p.tick()
  const inv = a.jug.inventario
  ok(inv.primaria === 'krakov' && inv.secundaria === 'reaper' && inv.granadas.includes('core') && a.jug.casco,
    `sale con el equipo entero (${inv.primaria}, ${inv.secundaria}, ${inv.granadas}, casco ${a.jug.casco})`)
  ok(a.ultimo(MSG.BIENVENIDA)?.eco === 0 && p.compraSegundos === 0, 'sin economía y sin fase de compra')
  a.jug.vida = 0
  p._terminarRonda(1, 'muerte')
  ok(a.jug.inventario.primaria === 'krakov', 'caer no le deja sin nada: la ronda siguiente reparte otra vez')
}
{
  const def = { ...definicionDeSala('duelo', 'duelo'), reglas: { modo: 'peanas', equipo: { chaleco: true } }, peanas: [{ x: 0, z: 0, arma: 'rift' }] }
  const { p, entra } = sala(def, { modo: 'duelo', rondas: true })
  const [a, b] = [entra(), entra()]
  for (let i = 0; i < 3; i++) p.tick()
  a.jug.inventario.primaria = 'rift'
  b.jug.inventario.primaria = 'rift'
  b.jug.vida = 0
  p._terminarRonda(0, 'muerte')
  ok(a.jug.inventario.primaria === 'rift', 'quien sobrevive la ronda conserva lo recogido')
  ok(b.jug.inventario.primaria === null && b.jug.escudo === ECONOMY.escudoPorChaleco, 'quien cae lo pierde, y conserva el chaleco base')
}

// ------------------------------------------------------------ [7] barreras
console.log('\n[7] Una barrera cuenta como pared para la mano (vuelta 107, F8)')
for (const acabado of ['cristal', 'invisible']) {
  const def = sanearMapa({
    clave: 'peanas107', label: 'peanas107', modos: ['todos'],
    room: { width: 40, depth: 40, height: 10 }, spawn: { x: 0, z: 10 },
    todos: { salidas: [{ x: -10, z: 10, yaw: 0 }, { x: 0, z: 10, yaw: 0 }, { x: 10, z: 10, yaw: 0 }] },
    // Una barrera baja y fina entre z −4.2 y −3.9; la peana al otro lado.
    boxes: [{ kind: 4, x: -3, z: -4.2, w: 6, d: 0.3, barrera: acabado }],
    reglas: { modo: 'peanas', armas: ['krakov'] }, peanas: [{ x: 0, z: -5, arma: 'krakov' }],
  }).mapa
  const esc = escena(def)
  ok(esc.boxes.some((b) => b.barrera === acabado), `premisa: la barrera de ${acabado} está montada`)
  // Lo que vuela sigue atravesándola (vuelta 96): la premisa de que es barrera.
  ok(esc.cortarSegmento(0, 1, -3, 0, 1, -6) === null, `${acabado}: un proyectil la sigue atravesando`)
  ok(!esc.peanaALaVista(0, 0, 1.7, -3), `${acabado}: la peana detrás no está «a la vista» de la mano`)
  ok(esc.peanaApuntadaDesde(0, 1.7, -3, 0, -0.4, -0.92) === -1, `${acabado}: apuntándole a través, el cliente no la ofrece`)
  const { p, entra } = sala(def)
  const [a] = [entra(), entra(), entra()]
  for (let i = 0; i < 3; i++) p.tick()
  colocar(a, 0, -3)
  a.manda({ t: MSG.RECOGER, i: 0 })
  ok(a.ultimo(MSG.RECOGER)?.ok === 0 && a.ultimo(MSG.RECOGER).m === 'pared' && a.jug.inventario.primaria === null, `${acabado}: el servidor dice «pared» y no la da`)
  colocar(a, 0, -6)
  a.manda({ t: MSG.RECOGER, i: 0 })
  ok(a.ultimo(MSG.RECOGER)?.ok === 1, `${acabado}: desde su lado, se coge`)
}

// ------------------------------------------------------------ [6] coste
console.log('\n[6] Lo que cuesta buscar la peana apuntada')
{
  const muchas = []
  for (let i = 0; i < 160; i++) muchas.push({ x: -18 + (i % 16) * 2.4, z: -18 + Math.floor(i / 16) * 3.6, arma: 'krakov' })
  const esc = escena(mapa({ modo: 'peanas' }, muchas))
  ok(esc.peanas.length === 160, 'premisa: 160 peanas montadas')
  const N = 20000
  let hallada = 0
  const t0 = performance.now()
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2
    if (esc.peanaApuntadaDesde(-18 + (k % 40), 1.7, -16, Math.sin(a), -0.3, -Math.cos(a)) >= 0) hallada += 1
  }
  const us = ((performance.now() - t0) / N) * 1000
  ok(us < 20, `${us.toFixed(2)} µs por búsqueda con 160 peanas, contra 200 µs de un paso`, `${hallada} de ${N} apuntaban a alguna`)
}

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
