/**
 * El Fang de punta a punta, contra `Partida` de verdad y sin navegador:
 * se compra, se lanza, se clava, se recoge y se limpia al empezar la ronda.
 */
import { CLAVADAS, ECONOMY, NET, SIM_STEP_MS, WEAPONS, WEAPON_ORDER } from '../src/config.js'
import { MSG, empaquetarTeclas } from '../net/protocolo.js'
import { Partida } from '../net/partida.js'
import * as THREE from 'three'
import { Scenario } from '../src/game/scenario.js'

let fallos = 0
/** Un veredicto impreso también cuenta: un paso en rojo hace fallar el banco (auditoría de la vuelta 105). */
const veredicto = (bien, si = 'sí', no = 'NO') => { if (!bien) fallos += 1; return bien ? si : no }


const escenario = new Scenario(new THREE.Scene(), NET.escenario)
const partida = new Partida({ escenario, rondas: true, compraSegundos: 0, depurar: true })

const buzon = { p1: [], p2: [] }
const ids = []
for (const quien of ['p1', 'p2']) {
  const id = partida.entra((texto) => buzon[quien].push(JSON.parse(texto)))
  ids.push(id)
}
const [A, B] = ids
const mio = (quien) => buzon[quien]
const ultimaEco = (quien) => [...mio(quien)].reverse().find((m) => m.t === MSG.ECONOMIA)
const clavadas = (quien) => mio(quien).filter((m) => m.t === MSG.CLAVADA)

let paso = 1
function entrada(id, extra = {}) {
  partida.recibe(id, JSON.stringify({
    t: MSG.ENTRADA, n: paso, k: empaquetarTeclas({}), yaw: 0, jt: -1,
    w: WEAPON_ORDER.indexOf(extra.arma ?? 'fang'),
    ...(extra.d ? { d: extra.d } : null),
  }))
}
function avanzar(n = 1, cb = null) {
  for (let i = 0; i < n; i++) {
    for (const id of ids) entrada(id)
    if (cb) cb()
    partida.tick()
    paso += 1
  }
}

// Arrancar: dos dentro, y hay que dejar pasar la fase de espera.
avanzar(5)
console.log('fase:', partida.rondas.fase, '· ronda', partida.rondas.n)

// --- comprar el Fang ---
partida.recibe(A, JSON.stringify({ t: MSG.COMPRAR, q: 'fang' }))
avanzar(1)
let eco = ultimaEco('p1')
const precio = ECONOMY.catalogo.find((i) => i.clave === 'fang').precio
console.log(`compra: $${ECONOMY.dineroInicial ?? 800} → $${eco.dinero} (precio ${precio}) · lleva`, eco.inv.granadas, '· reserva', eco.inv.reserva,
  veredicto(eco.dinero === (ECONOMY.dineroInicial ?? 800) - precio && eco.inv.granadas.includes('fang'), 'OK', 'FALLO'))

// --- colocar al tirador mirando a una pared y lanzar ---
partida.recibe(A, JSON.stringify({ t: MSG.COLOCAR, x: 0, z: 0 }))
partida.recibe(B, JSON.stringify({ t: MSG.COLOCAR, x: 0, z: 25 }))
avanzar(2)

const jugadorA = partida.jugadores.get(A)
const antesClavadas = partida.clavadas.vivas
// Al suelo, plano hacia −Z y con carga mínima: cae cerca.
partida.recibe(A, JSON.stringify({
  t: MSG.ENTRADA, n: paso, k: empaquetarTeclas({}), yaw: 0, jt: -1,
  w: WEAPON_ORDER.indexOf('fang'),
  d: { seq: 1, yaw: 0, pitch: -0.35, tf: 0, c: 0 },
}))
entrada(B)
partida.tick(); paso += 1
avanzar(90)

const plantadas = clavadas('p2').filter((m) => m.i && !m.q && !m.l)
console.log(`clavadas en el servidor: ${antesClavadas} → ${partida.clavadas.vivas}`)
console.log('avisos de plantar recibidos por el rival:', plantadas.length,
  plantadas[0] ? `en (${plantadas[0].x}, ${plantadas[0].y}, ${plantadas[0].z})` : '')
console.log('reserva en el servidor tras lanzar:', JSON.stringify(partida.jugadores.get(A).inventario.reserva), '(no se manda economía por un lanzamiento, a propósito)')

// --- ir a recogerlo ---
if (partida.clavadas.vivas > 0) {
  const i = partida.clavadas.id.findIndex((v) => v !== 0)
  const cx = partida.clavadas.x[i], cy = partida.clavadas.y[i], cz = partida.clavadas.z[i]
  const dist = Math.hypot(cx - jugadorA.pose.position.x, cz - jugadorA.pose.position.z)
  console.log(`el cuchillo está a ${dist.toFixed(2)} u del tirador, a altura ${cy.toFixed(2)}`)
  // Bajarle la reserva a mano para que haya hueco (lanzar una ya la bajó).
  const antesReserva = partida.jugadores.get(A).inventario.reserva.fang
  partida.recibe(A, JSON.stringify({ t: MSG.COLOCAR, x: cx, z: cz }))
  avanzar(3)
  const desp = partida.jugadores.get(A).inventario.reserva.fang
  const quitadas = clavadas('p1').filter((m) => m.q)
  console.log(`recogida: reserva ${antesReserva} → ${desp} · quedan ${partida.clavadas.vivas} en el suelo · avisos de quitar: ${quitadas.length}`)
  console.log('tope respetado:', veredicto(desp <= WEAPONS.fang.tiro.reserva.maxima, 'sí', `NO (${desp})`))

  // --- y el rival, que no lleva Fang, pasa por encima y no pasa nada ---
  partida.clavadas.plantar({ id: 999, x: 0, y: 0.3, z: 0, dueno: A })
  partida.recibe(B, JSON.stringify({ t: MSG.COLOCAR, x: 0, z: 0 }))
  avanzar(3)
  console.log('sin Fang no se recoge:', veredicto(partida.clavadas.vivas > 0, 'sí', 'NO — se la ha llevado'))
}

// --- y una que acierta NO se clava ---
// Se lanza directamente al pool del servidor, apuntada al cuerpo del rival
// donde esté: así el veredicto no depende de encontrar suelo llano, de la
// cadencia ni de la fase — lo que se está midiendo es la regla del impacto.
partida.clavadas.limpiar()
{
  const jb = partida.jugadores.get(B)
  const q = jb.pose.position
  const t = WEAPONS.fang.tiro
  const origen = { x: q.x, y: jb.movimiento.feetY + 1.0, z: q.z + 3 }
  partida.proyectiles.lanzar({
    tipo: 'fang', dueno: A,
    x: origen.x, y: origen.y, z: origen.z,
    vx: 0, vy: 0, vz: -t.vMax, g: 0,
    fuerza: t.danoMax, intensidad: 1,
  })
  const vidaAntes = jb.vida
  // El golpe se lee en el aviso que recibe el rival, no en su vida al final: un
  // Fang cargado mata (100 al torso) y, sin fase de compra, la baja cierra la
  // ronda y la siguiente le devuelve la vida en el mismo paso.
  const golpesAntes = mio('p2').filter((m) => m.t === MSG.GOLPE).length
  for (let k = 0; k < 20; k++) partida.tick()
  const golpes = mio('p2').filter((m) => m.t === MSG.GOLPE).slice(golpesAntes)
  const vidaMin = Math.min(vidaAntes, ...golpes.map((m) => m.vida))
  console.log(`acertar la gasta: vida del rival ${vidaAntes} → ${vidaMin} (aviso de golpe) · clavadas en el suelo: ${partida.clavadas.vivas} (0 = se la ha llevado puesta)`,
    veredicto(vidaMin < vidaAntes && partida.clavadas.vivas === 0, 'OK', 'FALLO'))
}

// --- y una que falla sí se clava ---
partida.clavadas.limpiar()
{
  const jb = partida.jugadores.get(B)
  const q = jb.pose.position
  const t = WEAPONS.fang.tiro
  partida.proyectiles.lanzar({
    tipo: 'fang', dueno: A,
    x: q.x + 6, y: jb.movimiento.feetY + 1.0, z: q.z + 3,
    vx: 0, vy: 0, vz: -t.vMax, g: 0,
    fuerza: t.danoMax, intensidad: 1,
  })
  for (let k = 0; k < 60; k++) partida.tick()
  console.log(`fallar la deja: clavadas en el suelo: ${partida.clavadas.vivas}`, veredicto(partida.clavadas.vivas === 1, 'OK', 'FALLO'))
}

// --- una ronda que empieza limpia el suelo ---
const antesLimpiar = partida.clavadas.vivas
partida._empezarRonda()
const limpiezas = clavadas('p1').filter((m) => m.l)
console.log(`ronda nueva: ${antesLimpiar} → ${partida.clavadas.vivas} clavadas · avisos de limpiar: ${limpiezas.length}`,
  veredicto(antesLimpiar > 0 && partida.clavadas.vivas === 0 && limpiezas.length > 0, 'OK', 'FALLO'))

// --- y el pool no crece ---
for (let i = 1; i <= CLAVADAS.pool + 4; i++) partida.clavadas.plantar({ id: 1000 + i, x: i, y: 1, z: 0 })
console.log(`pool: cabe ${CLAVADAS.pool}, metidas ${CLAVADAS.pool + 4}, vivas ${partida.clavadas.vivas}`, veredicto(partida.clavadas.vivas === CLAVADAS.pool, 'OK', 'FALLO'))

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
