/**
 * **red85 — el proyectil por dentro del servidor.**
 *
 * Conduce `Partida` directamente, sin navegador, que es lo que ya hace
 * `rondas62`: aquí no hay una línea de red que probar —el cable no decide
 * nada— y montar dos Chromium para medir una parábola sería medir el
 * contenedor.
 */
import * as THREE from 'three'
import { Partida } from '../net/partida.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG } from '../net/protocolo.js'
import { SCENARIOS, SIM_STEP_MS, WEAPON_ORDER } from '../src/config.js'

const fallos = []
const af = (cond, texto, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${texto}${extra ? ` — ${extra}` : ''}`)
  if (!cond) fallos.push(texto)
}

const escenario = new Scenario(new THREE.Scene(), 'elEspejo')
const recibidos = { p1: [], p2: [] }
const partida = new Partida({ escenario, rondas: false, depurar: true })
const enviar = (quien) => (texto) => recibidos[quien].push(JSON.parse(texto))
/** `entra` devuelve el id; lo que hace falta aquí es el jugador. */
const sentar = (p, quien) => p.jugadores.get(p.entra(enviar(quien)))
const a = sentar(partida, 'p1')
const b = sentar(partida, 'p2')
/** `recibe` toma texto, que es lo que llega por el cable. */
const mandar = (p, j, e) => p.recibe(j.id, JSON.stringify(e))

console.log('== red85 ==\n')
af(Boolean(a && b), 'entran los dos jugadores')

const iBow = WEAPON_ORDER.indexOf('bow')
af(iBow >= 0, 'el arco está en WEAPON_ORDER', `índice ${iBow}`)

/** Una entrada sin teclas, con el arco en la mano. */
function entrada(n, extra = {}) {
  return { t: MSG.ENTRADA, n, k: 0, yaw: 0, jt: -1, w: iBow, ...extra }
}

// Se colocan cara a cara: `a` en el origen mirando a −Z y `b` doce unidades
// por delante. Es lo que `MSG.COLOCAR` hace en los bancos con navegador.
a.pose.position.x = 0; a.pose.position.z = 6
b.pose.position.x = 0; b.pose.position.z = -6

let n = partida.paso + 1
// Unas cuantas entradas sin disparar, para cebar la cola.
for (let k = 0; k < 8; k++) {
  mandar(partida, a, entrada(n + k))
  mandar(partida, b, entrada(n + k))
}
for (let k = 0; k < 8; k++) partida.tick()

console.log('\n[1] el arco lanza un proyectil en vez de resolver un rayo')
{
  recibidos.p2.length = 0
  const paso = partida.paso + 1
  // Carga llena y apuntando justo al frente y un pelo arriba, que es donde
  // está el cuerpo del rival a doce unidades.
  mandar(partida, a, entrada(paso, {
    d: { f: 0, yaw: 0, pitch: 0.03, seq: 1, c: 1 },
  }))
  mandar(partida, b, entrada(paso))
  partida.tick()
  af(partida.proyectiles.vivos === 1, 'hay uno volando en el servidor',
    `${partida.proyectiles.vivos}`)
  const aviso = recibidos.p2.find((m) => m.t === MSG.PROYECTIL)
  af(Boolean(aviso), 'al rival se le avisa del lanzamiento',
    aviso ? `tipo ${aviso.k}, v ${Math.hypot(aviso.vx, aviso.vy, aviso.vz).toFixed(1)} u/s` : '')
  const propio = recibidos.p1.find((m) => m.t === MSG.PROYECTIL)
  af(!propio, 'a quien lo tiró no se le manda: ya lo predijo')
}

console.log('\n[2] vuela, tarda en llegar y hace daño')
{
  const vidaAntes = b.vida
  let pasos = 0
  let paso = partida.paso
  while (partida.proyectiles.vivos > 0 && pasos < 300) {
    paso += 1
    mandar(partida, a, entrada(paso))
    mandar(partida, b, entrada(paso))
    partida.tick()
    pasos += 1
  }
  const ms = pasos * SIM_STEP_MS
  af(pasos > 3, 'tarda varios pasos en llegar', `${pasos} pasos = ${ms.toFixed(0)} ms`)
  af(b.vida < vidaAntes, 'le ha quitado vida al rival', `${vidaAntes} → ${b.vida}`)
}

console.log('\n[3] una carga floja pega menos que una llena')
{
  const medir = (carga) => {
    const p2 = new Partida({ escenario, rondas: false, depurar: true })
    const x = p2.jugadores.get(p2.entra(() => {}))
    const y = p2.jugadores.get(p2.entra(() => {}))
    // **La x también**, que `entra` los coloca en las salidas del mapa y en El
    // Espejo no están en el mismo eje: sin esto la flecha pasa de largo y las
    // dos filas dan cero, que es una medida rota disfrazada de resultado.
    // Y a 6 u y apuntando al pecho (vuelta 106): con 12 u y la mira alta, la
    // flecha floja caía corta desde que el arco se recalibró en la 88.
    x.pose.position.x = 0; x.pose.position.z = 3
    y.pose.position.x = 0; y.pose.position.z = -3
    let m = p2.paso + 1
    for (let k = 0; k < 8; k++) { mandar(p2, x, entrada(m + k)); mandar(p2, y, entrada(m + k)); }
    for (let k = 0; k < 8; k++) p2.tick()
    const antes = y.vida
    m = p2.paso + 1
    mandar(p2, x, entrada(m, { d: { f: 0, yaw: 0, pitch: -0.08, seq: 1, c: carga } }))
    mandar(p2, y, entrada(m))
    p2.tick()
    let g = 0
    while (p2.proyectiles.vivos > 0 && g < 300) {
      const q = p2.paso + 1
      mandar(p2, x, entrada(q)); mandar(p2, y, entrada(q))
      p2.tick(); g += 1
    }
    return antes - y.vida
  }
  const flojo = medir(0)
  const lleno = medir(1)
  af(lleno > flojo && flojo > 0, 'a más carga, más daño', `carga 0 → ${flojo}, carga 1 → ${lleno}`)
}

console.log('\n[4] un cliente que miente con la carga se acota')
{
  const p3 = new Partida({ escenario, rondas: false, depurar: true })
  const x = p3.jugadores.get(p3.entra(() => {}))
  const y = p3.jugadores.get(p3.entra(() => {}))
  x.pose.position.x = 0; x.pose.position.z = 3
  y.pose.position.x = 0; y.pose.position.z = -3
  let m = p3.paso + 1
  for (let k = 0; k < 8; k++) { mandar(p3, x, entrada(m + k)); mandar(p3, y, entrada(m + k)); }
  for (let k = 0; k < 8; k++) p3.tick()
  m = p3.paso + 1
  mandar(p3, x, entrada(m, { d: { f: 0, yaw: 0, pitch: 0.03, seq: 1, c: 99 } }))
  p3.tick()
  const v = Math.hypot(p3.proyectiles.vx[0], p3.proyectiles.vy[0], p3.proyectiles.vz[0])
  af(v <= 52.001, 'la velocidad no pasa del máximo del arma', `${v.toFixed(3)} u/s contra 52`)
}

console.log(`\n${fallos.length === 0 ? 'TODO OK' : `${fallos.length} FALLOS: ${fallos.join('; ')}`}`)
process.exit(fallos.length === 0 ? 0 : 1)
