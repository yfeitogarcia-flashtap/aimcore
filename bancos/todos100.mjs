/**
 * todos100 — **el todos contra todos y la foto por destinatario, contra
 * `Partida` y sin navegador**.
 *
 * Lo que se afirma, cada cosa con su denominador:
 *  [1] La Rotonda: ocho salidas, **ninguna ve a otra** (ojos a ojos, con la
 *      misma aritmética que la regla de interés).
 *  [2] Butacas: caben tantas como salidas; el noveno no entra. El duelo sigue
 *      en dos.
 *  [3] La regla de interés: cerca entra siempre, detrás de una pared a media
 *      distancia no, a la vista sí, lejos nunca; la memoria lo sostiene un
 *      segundo; quien no tiene cable no sale en ninguna foto.
 *  [4] Una baja: quien cae vuelve por la salida más lejos de los vivos, lo
 *      dice su foto (`sal`), y reaparece con gracia.
 *  [5] El final: llegar a las bajas cierra la partida, no se dispara con el
 *      resultado puesto, y a los diez segundos empieza otra con todo a cero.
 *  [6] La foto del duelo: el rival llega **ligero** y en la compra no llega.
 */
import * as THREE from 'three'
import { Partida } from '../net/partida.js'
import { entraEnLaFoto, seVen } from '../net/interes.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG } from '../net/protocolo.js'
import { NET, SIM_STEP_MS, TODOS, definicionDeDuelo, definicionDeTodos } from '../src/config.js'

let fallos = 0
const ok = (cond, texto) => {
  console.log(`  ${cond ? 'ok  ' : 'FALLO'} ${texto}`)
  if (!cond) fallos += 1
}

const rotonda = new Scenario(new THREE.Scene(), definicionDeTodos('rotonda'))

console.log('[1] La Rotonda: ninguna salida ve a otra')
{
  const salidas = rotonda.salidasDeTodos
  let pares = 0
  let seVenPares = 0
  const ojos = 1.7
  for (let i = 0; i < salidas.length; i++) {
    for (let j = i + 1; j < salidas.length; j++) {
      pares += 1
      const a = salidas[i]
      const b = salidas[j]
      if (!rotonda.cortarSegmento(a.x, ojos, a.z, b.x, ojos, b.z)) seVenPares += 1
    }
  }
  ok(salidas.length === 12, `doce salidas desde la 101 (${salidas.length})`)
  ok(seVenPares === 0, `pares que se ven: ${seVenPares} de ${pares}`)
  // Y cada una mira al centro: su rumbo apunta al origen.
  const miran = salidas.every((s) => {
    const fx = -Math.sin(s.yaw)
    const fz = -Math.cos(s.yaw)
    return (fx * -s.x + fz * -s.z) / Math.hypot(s.x, s.z) > 0.99
  })
  ok(miran, 'todas miran al centro')
}

/** Una partida con N dentro que ya han entrado y dado unos pasos. */
function sala(modo, n, escenario) {
  const p = new Partida({ escenario, modo, depurar: true, rondas: modo === 'duelo' ? false : undefined })
  const fotos = new Map()
  const ids = []
  for (let i = 0; i < n; i++) {
    const id = p.entra((texto) => {
      if (texto.startsWith(`{"t":"${MSG.FOTO}"`)) fotos.set(id, JSON.parse(texto))
    })
    if (id) ids.push(id)
  }
  const pasar = (k = 1, entrada = {}) => {
    for (let i = 0; i < k; i++) {
      const q = p.paso + 1
      for (const id of ids) {
        if (!p.jugadores.get(id) || p.jugadores.get(id).desconectado) continue
        p.recibe(id, JSON.stringify({ t: MSG.ENTRADA, n: q, k: 0, yaw: 0, jt: -1, w: 0, ...(entrada[id] ?? {}) }))
      }
      p.tick()
    }
  }
  pasar(5)
  return { p, ids, fotos, pasar }
}

console.log('\n[2] Butacas')
{
  const p = new Partida({ escenario: rotonda, modo: 'todos' })
  let dentro = 0
  for (let i = 0; i < 11; i++) if (p.entra(() => {})) dentro += 1
  ok(p.plazas === 10 && dentro === 10, `caben ${p.plazas} y entran ${dentro} de 11`)
  const espejo = new Scenario(new THREE.Scene(), definicionDeDuelo('duelo'))
  const d = new Partida({ escenario: espejo })
  let enDuelo = 0
  for (let i = 0; i < 3; i++) if (d.entra(() => {})) enDuelo += 1
  ok(d.plazas === 2 && enDuelo === 2, `el duelo sigue en dos (${enDuelo} de 3)`)
}

console.log('\n[3] Quién entra en la foto de quién')
{
  const { p, ids, fotos, pasar } = sala('todos', 4, rotonda)
  const [a, b, c, d] = ids.map((id) => p.jugadores.get(id))
  const poner = (j, x, z) => {
    p.recibe(j.id, JSON.stringify({ t: MSG.COLOCAR, x, z }))
  }
  const salaInfo = { fase: 'espera', escenario: rotonda }
  // Cerca, detrás del bloque central: entra aunque no se vea.
  poner(a, 0, -8); poner(b, 0, 8)
  pasar(2)
  ok(!seVen(rotonda, a, b) && entraEnLaFoto(a, b, salaInfo), `a 16 u y tapados por el bloque central: entra (cerca manda)`)
  // A media distancia y tapados: no entra.
  poner(a, 0, -20); poner(b, 0, 20)
  pasar(2)
  const tapados = !seVen(rotonda, a, b)
  ok(tapados && !entraEnLaFoto(a, b, salaInfo), `a 40 u y tapados: no entra (${tapados ? 'tapados' : 'se ven'})`)
  // Y la memoria le sostiene un segundo, luego se va.
  const antes = a.interes.entra(a, b, salaInfo, p.paso)
  pasar(Math.ceil(NET.interes.memoriaMs / SIM_STEP_MS) + 2)
  const foto = fotos.get(a.id)
  ok(antes && !(b.id in foto.p), `recién escondido sigue un rato (${antes}) y pasado el segundo sale de la foto (${!(b.id in foto.p)})`)
  // A media distancia y a la vista: entra.
  poner(c, 20, 20); poner(d, 20, -12)
  pasar(2)
  ok(seVen(rotonda, c, d) && entraEnLaFoto(c, d, salaInfo), 'a 32 u y a la vista: entra')
  // Más allá de lejosU, nunca: se prueba con una sala abierta.
  const abierta = new Scenario(new THREE.Scene(), {
    clave: 'x', room: { width: 200, depth: 200, height: 10 }, spawn: { x: 0, z: 0 },
    todos: { salidas: [{ x: -90, z: 0, yaw: 0 }, { x: 90, z: 0, yaw: 0 }, { x: 0, z: 0, yaw: 0 }] }, boxes: [], ramps: [],
  })
  const s2 = sala('todos', 3, abierta)
  const [e, f] = s2.ids.map((id) => s2.p.jugadores.get(id))
  s2.pasar(3)
  ok(!(f.id in s2.fotos.get(e.id).p), `a 180 u y sin nada en medio: fuera (lejosU ${NET.interes.lejosU})`)
  // **Asomar medio hombro se ve** (el margen de `seVen`): un muro de 0 a 10 en
  // x, A a 40 u de frente y B con el centro 0.3 u detrás del canto.
  {
    const muro = new Scenario(new THREE.Scene(), {
      // El spawn lejos del muro: `COLOCAR` resetea el movimiento en él, y uno
      // encima de la caja deja al jugador con los pies en su techo.
      clave: 'm', room: { width: 120, depth: 120, height: 10 }, spawn: { x: 30, z: 30 },
      todos: { salidas: [{ x: 0, z: 40, yaw: 0 }, { x: 0, z: -40, yaw: 0 }, { x: 50, z: 50, yaw: 0 }] },
      boxes: [{ x: 0, z: 0, w: 10, d: 1, kind: 'alta' }], ramps: [],
    })
    const s3 = sala('todos', 3, muro)
    const [g, h] = s3.ids.map((id) => s3.p.jugadores.get(id))
    s3.p.recibe(g.id, JSON.stringify({ t: MSG.COLOCAR, x: 5, z: 40 }))
    s3.p.recibe(h.id, JSON.stringify({ t: MSG.COLOCAR, x: 0.3, z: -3 }))
    s3.pasar(30)
    const centroTapado = Boolean(muro.cortarSegmento(5, 1.7, 40, 0.3, 1.0, -3))
    ok(centroTapado && seVen(muro, g, h), `con el pecho tapado (${centroTapado}) y medio hombro fuera, se ve`)
    s3.p.recibe(h.id, JSON.stringify({ t: MSG.COLOCAR, x: 3, z: -3 }))
    s3.pasar(30)
    ok(!seVen(muro, g, h), `y metido tres unidades detrás, no (${h.pose.position.x.toFixed(2)}, ${h.pose.position.z.toFixed(2)} · ${g.pose.position.x.toFixed(2)}, ${g.pose.position.z.toFixed(2)})`)
  }
  // La entrada del otro es ligera: no trae ack ni el movimiento entero.
  const suya = fotos.get(c.id).p[d.id]
  ok(suya && suya.ack === undefined && Object.keys(suya.s).length === 5, `la entrada del otro es ligera: ${JSON.stringify(Object.keys(suya ?? {}))}`)
  const mia = fotos.get(c.id).p[c.id]
  ok(mia && mia.ack !== undefined && Object.keys(mia.s).length > 5, 'la propia va entera')
  // Sin cable no sale en ninguna foto, y no encaja daño.
  poner(a, 20, 18)
  pasar(1)
  p.sedesconecta(c.id)
  pasar(2)
  ok(!(c.id in fotos.get(a.id).p) && !(c.id in fotos.get(d.id).p), 'quien se cae no sale en la foto de nadie')
  ok(p.jugadores.has(c.id), 'pero su butaca se guarda (partida en marcha)')
}

console.log('\n[4] Una baja y por dónde se vuelve')
{
  const { p, ids, fotos, pasar } = sala('todos', 3, rotonda)
  const [a, b, c] = ids.map((id) => p.jugadores.get(id))
  ok(p.todos.fase === 'juego', `con tres dentro la partida está en marcha (${p.todos.fase})`)
  // Pasa la gracia de salida antes de hacer daño.
  pasar(Math.ceil(2100 / SIM_STEP_MS))
  const baja = p._aplicarDano(b, 200, a, 'torso')
  const mcs = []
  const suyo = p.jugadores.get(c.id).enviar
  p.jugadores.get(c.id).enviar = (t) => { suyo(t); if (t.includes('"mc":')) mcs.push(JSON.parse(t).mc) }
  pasar(1)
  pasar(3)
  ok(mcs.length === 1 && mcs[0].find((f) => f.id === a.id)?.b === 1, `el marcador sale una vez, al cambiar (${mcs.length} en 4 fotos)`)
  ok(baja && a.bajas === 1 && b.muertes === 1, `a mata a b (${a.bajas} / ${b.muertes})`)
  const sal = fotos.get(b.id).p[b.id].sal
  const s = p.salidas[sal]
  const cerca = Math.min(...[a, c].map((j) => Math.hypot(j.pose.position.x - s.x, j.pose.position.z - s.z)))
  const mejor = Math.max(...p.salidas.map((q) => Math.min(...[a, c].map((j) => Math.hypot(j.pose.position.x - q.x, j.pose.position.z - q.z)))))
  ok(Number.isInteger(sal) && Math.abs(cerca - mejor) < 1e-9, `vuelve por la salida ${sal}, a ${cerca.toFixed(1)} u del vivo más cercano (la mejor: ${mejor.toFixed(1)})`)
  pasar(Math.ceil(NET.respawnMs / SIM_STEP_MS) + 4)
  ok(b.vida === 100 && Math.hypot(b.pose.position.x - s.x, b.pose.position.z - s.z) < 0.01, `reaparece en esa salida con la vida entera (${b.vida})`)
  ok(b.invulnerableHasta > p.paso, `y con gracia (${((b.invulnerableHasta - p.paso) * SIM_STEP_MS).toFixed(0)} ms)`)
  // La cuña: quien le dio.
  ok(fotos.get(b.id).p[b.id].gp === a.id, 'su foto dice quién le dio (gp)')
}

console.log('\n[5] El final de una partida')
{
  const { p, ids, fotos, pasar } = sala('todos', 3, rotonda)
  const [a, b] = ids.map((id) => p.jugadores.get(id))
  a.bajas = TODOS.bajasParaGanar
  pasar(1)
  ok(p.todos.fase === 'fin' && p.todos.ganador === a.ranura, `llegar a ${TODOS.bajasParaGanar} cierra la partida y gana su ranura (${p.todos.ganador})`)
  ok(fotos.get(b.id).td?.f === 'fin', 'la foto lo dice (td.f)')
  pasar(Math.ceil(2100 / SIM_STEP_MS))
  ok(!p._aplicarDano(b, 200, a, 'torso') && b.vida === 100, 'con el resultado puesto no se hace daño')
  const n = p.todos.n
  // Desde la 101 no empieza otra sola: la revancha es del lobby (`lobby101`).
  pasar(Math.ceil(12000 / SIM_STEP_MS))
  ok(p.todos.fase === 'fin' && p.todos.n === n, `y se queda en fin: la siguiente la lanza el lobby (n ${n} → ${p.todos.n})`)
}

console.log('\n[6] La foto del duelo')
{
  const espejo = new Scenario(new THREE.Scene(), definicionDeDuelo('duelo'))
  const p = new Partida({ escenario: espejo, depurar: true })
  const fotos = new Map()
  const ids = [0, 1].map(() => {
    const id = p.entra((t) => { if (t.startsWith(`{"t":"${MSG.FOTO}"`)) fotos.set(id, JSON.parse(t)) })
    return id
  })
  const pasar = (k) => {
    for (let i = 0; i < k; i++) {
      const q = p.paso + 1
      for (const id of ids) p.recibe(id, JSON.stringify({ t: MSG.ENTRADA, n: q, k: 0, yaw: 0, jt: -1, w: 0 }))
      p.tick()
    }
  }
  pasar(5)
  ok(p.rondas.fase === 'compra', `con dos, empieza la compra (${p.rondas.fase})`)
  ok(!(ids[1] in fotos.get(ids[0]).p), 'en la compra no llega el rival')
  pasar(Math.ceil(p.compraSegundos * 1000 / SIM_STEP_MS) + 2)
  ok(p.rondas.fase === 'ronda', 'empieza la ronda')
  const foto = fotos.get(ids[0])
  // Las salidas de El Espejo están a 32 u y tapadas: con la regla nueva el rival
  // no llega hasta que se ve o se acerca — y eso es lo que tiene que pasar.
  ok(!(ids[1] in foto.p), 'en la salida, tapado a 32 u: el rival no está en tu foto')
  p.recibe(ids[1], JSON.stringify({ t: MSG.COLOCAR, x: 0, z: 10 }))
  p.recibe(ids[0], JSON.stringify({ t: MSG.COLOCAR, x: 0, z: 16 }))
  pasar(2)
  ok(ids[1] in fotos.get(ids[0]).p, 'a 6 u: llega')
  ok(p.fotoCada === 1, 'el duelo sigue a 60 Hz')
}

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
