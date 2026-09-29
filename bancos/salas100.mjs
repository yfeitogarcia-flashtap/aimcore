/**
 * salas100 — **el protocolo nuevo, y dónde está el límite de verdad**.
 *
 * Tres preguntas del encargo de la vuelta 100, con su denominador delante:
 *
 *  1. Una sala de todos contra todos en La Rotonda, de 2 a 16: tráfico y CPU del
 *     servidor con la foto por destinatario (`net/interes.js`) a 20 Hz.
 *  2. **El caso extremo**: 50 jugadores en una sala abierta de 200×200, sin una
 *     pared que filtre. Con el filtro por distancia (`lejosU`) y sin él, y a
 *     varios ritmos de foto.
 *  3. Lo que le cuesta al **cliente** recibir y dibujar a 49: parsear una foto y
 *     interpolar 49 poses, en CPU (el dibujo en GPU lo mide `dibujo100`).
 *
 * Todo contra `Partida` de verdad: cada jugador entra con un `enviar` que
 * **cuenta bytes**, se dan pasos de mundo con una entrada por jugador y paso, y
 * los jugadores **andan** —girando y chocando— para que la foto tenga campos que
 * cambien y el filtro tenga distancias que medir.
 */
import * as THREE from 'three'
import { Partida } from '../net/partida.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG } from '../net/protocolo.js'
import { NET, SIM_STEP_MS, TODOS, definicionDeTodos } from '../src/config.js'
import { ClienteRed } from '../net/cliente.js'
import { MovementController } from '../src/game/movement.js'
import { crearPose } from '../net/pose.js'

const PASOS = 900 // 15 s de mundo
const segundos = (PASOS * SIM_STEP_MS) / 1000
let fallos = 0
const ok = (cond, texto) => {
  console.log(`  ${cond ? 'ok  ' : 'FALLO'} ${texto}`)
  if (!cond) fallos += 1
}

/** Una sala abierta de lado L, sin geometría, con N salidas en rejilla. */
function salaAbierta(lado, n) {
  const salidas = []
  const filas = Math.ceil(Math.sqrt(n))
  const paso = lado / filas
  for (let i = 0; i < n; i++) {
    const x = -lado / 2 + paso * ((i % filas) + 0.5)
    const z = -lado / 2 + paso * (Math.floor(i / filas) + 0.5)
    salidas.push({ x, z, yaw: Math.atan2(x, z) })
  }
  return {
    clave: `abierta${lado}`, label: 'abierta', modos: ['todos'],
    room: { width: lado, depth: lado, height: 10 }, spawn: { x: 0, z: 0 },
    todos: { salidas }, boxes: [], ramps: [], spawnZone: [], objectiveSites: [], pickups: [], routes: [],
  }
}

/**
 * Una sala de N, andando `PASOS` pasos. Devuelve bytes, CPU, cuántos rivales
 * lleva de media cada foto y —si se pide— los textos de unas cuantas fotos para
 * medir al cliente.
 */
function medir(definicion, n, { fotoCada = null, lejosU = null, guardar = false } = {}) {
  const topeAntes = TODOS.maxJugadores
  const lejosAntes = NET.interes.lejosU
  const fcAntes = NET.fotoCada.todos
  TODOS.maxJugadores = Math.max(topeAntes, n)
  if (lejosU !== null) NET.interes.lejosU = lejosU
  if (fotoCada !== null) NET.fotoCada.todos = fotoCada
  try {
    const escenario = new Scenario(new THREE.Scene(), definicion)
    const p = new Partida({ escenario, modo: 'todos', depurar: true })
    let bytes = 0
    let fotos = 0
    let cuerpos = 0
    const guardadas = []
    const jugadores = []
    for (let i = 0; i < n; i++) {
      const yo = i
      const id = p.entra((texto) => {
        bytes += Buffer.byteLength(texto, 'utf8')
        if (texto.startsWith(`{"t":"${MSG.FOTO}"`)) {
          fotos += 1
          // Cuántos cuerpos trae: cada entrada de `p` empieza por `"pN":{`.
          cuerpos += (texto.slice(texto.indexOf('"p":{')).match(/"p\d+":\{/g) ?? []).length
          if (guardar && yo === 0 && guardadas.length < 200) guardadas.push(texto)
        }
      })
      jugadores.push(p.jugadores.get(id))
    }
    for (let k = 0; k < 10; k++) {
      const q = p.paso + 1
      for (const j of jugadores) p.recibe(j.id, JSON.stringify({ t: MSG.ENTRADA, n: q, k: 0, yaw: 0, jt: -1, w: 0 }))
      p.tick()
    }
    bytes = 0; fotos = 0; cuerpos = 0
    // Cada uno anda hacia delante girando despacio y, cada dos segundos, elige
    // un rumbo nuevo al azar —con semilla, para que la tanda se repita—; si
    // está cerca de una pared, uno que le aleje de ella. Así la sala se queda
    // **repartida**: ir todos hacia el centro juntaría a los cincuenta y el
    // filtro por distancia no tendría nada que filtrar.
    let semilla = 12345
    const azar = () => ((semilla = (semilla * 1103515245 + 12345) >>> 0) / 4294967296)
    const rumbo = jugadores.map((j, i) => (i * 2.399) % (Math.PI * 2))
    const medio = definicion.room.width / 2
    const t0 = process.hrtime.bigint()
    for (let k = 0; k < PASOS; k++) {
      const q = p.paso + 1
      for (const [i, j] of jugadores.entries()) {
        rumbo[i] += 0.01 * ((i % 3) - 1 || 0.5)
        if (k % 120 === i % 120) {
          const pos = j.pose.position
          const cerca = Math.max(Math.abs(pos.x), Math.abs(pos.z)) > medio - 6
          // Mirar al origen es `atan2(x, z)` (convención de la cámara).
          rumbo[i] = cerca ? Math.atan2(pos.x, pos.z) + (azar() - 0.5) : azar() * Math.PI * 2
        }
        p.recibe(j.id, JSON.stringify({ t: MSG.ENTRADA, n: q, k: 1, yaw: rumbo[i], jt: -1, w: 0 }))
      }
      p.tick()
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6
    return {
      n,
      msPorPaso: ms / PASOS,
      kibPorSegundo: bytes / 1024 / segundos,
      porJugador: bytes / 1024 / segundos / n,
      rivalesPorFoto: fotos ? cuerpos / fotos - 1 : 0,
      guardadas,
    }
  } finally {
    TODOS.maxJugadores = topeAntes
    NET.interes.lejosU = lejosAntes
    NET.fotoCada.todos = fcAntes
  }
}

const fila = (etiqueta, r) => console.log(
  `  ${etiqueta.padEnd(34)}${r.msPorPaso.toFixed(3).padStart(8)} ms` +
  `${(r.msPorPaso / SIM_STEP_MS * 100).toFixed(1).padStart(7)} %` +
  `${r.kibPorSegundo.toFixed(0).padStart(9)} KiB/s` +
  `${r.porJugador.toFixed(1).padStart(8)} KiB/s` +
  `${r.rivalesPorFoto.toFixed(1).padStart(8)}`,
)
const cabecera = () => console.log(`  ${''.padEnd(34)}${'paso'.padStart(11)}${'% paso'.padStart(9)}${'sala'.padStart(15)}${'por jug.'.padStart(14)}${'rivales'.padStart(8)}`)

console.log('== salas100 ==\n')
console.log('[1] Todos contra todos en La Rotonda, 20 Hz y foto por destinatario')
cabecera()
const rotonda = definicionDeTodos('rotonda')
const filasRotonda = []
for (const n of [2, 4, 8]) {
  const r = medir(rotonda, n)
  filasRotonda.push(r)
  fila(`${n} jugadores`, r)
}
// La Rotonda tiene ocho salidas; para 10 y 16 se mide con salidas de más en la
// misma geometría, que es lo que haría un mapa de ese tamaño con más bolsillos.
for (const n of [10, 16]) {
  const def = { ...rotonda, todos: { salidas: [...rotonda.todos.salidas, ...salaAbierta(56, n).todos.salidas].slice(0, n) } }
  const r = medir(def, n)
  filasRotonda.push(r)
  fila(`${n} jugadores`, r)
}
const diez = filasRotonda.find((r) => r.n === 10)
ok(diez.kibPorSegundo < 700, `una sala de 10 por debajo del listón de la propuesta 11 (700 KiB/s): ${diez.kibPorSegundo.toFixed(0)}`)

console.log('\n[2] El caso extremo: 50 en una sala abierta de 200×200, sin paredes')
cabecera()
const abierta = salaAbierta(200, 50)
const extremo = {}
for (const [clave, opciones, etiqueta] of [
  ['todo60', { fotoCada: 1, lejosU: Infinity }, 'sin filtro, 60 Hz'],
  ['todo20', { fotoCada: 3, lejosU: Infinity }, 'sin filtro, 20 Hz'],
  ['filtro20', { fotoCada: 3 }, `filtro ${NET.interes.lejosU} u, 20 Hz`],
  ['filtro60x', { fotoCada: 3, lejosU: 60 }, 'filtro 60 u, 20 Hz'],
  ['filtro10', { fotoCada: 6 }, `filtro ${NET.interes.lejosU} u, 10 Hz`],
]) {
  extremo[clave] = medir(abierta, 50, { ...opciones, guardar: clave === 'todo20' })
  fila(etiqueta, extremo[clave])
}

console.log('\n[2b] Y 50 en salas abiertas de otros tamaños (filtro de serie, 20 Hz)')
cabecera()
for (const lado of [100, 140, 300, 400]) fila(`${lado} × ${lado}`, medir(salaAbierta(lado, 50), 50))

console.log('\n[3] El cliente: recibir una foto con 49 dentro e interpolar a los 49')
{
  const fotos = extremo.todo20.guardadas
  const camara = crearPose()
  const movimiento = new MovementController(camara)
  const cliente = new ClienteRed({ camara, movimiento, transporte: { send() {}, onMessage() {}, close() {} } })
  // La bienvenida: sólo lo que hace falta para leer fotos.
  cliente._recibir({ t: MSG.BIENVENIDA, id: 'p1', equipo: 0, n: 0, salida: { x: 0, z: 0, yaw: 0 }, fc: 3, plazas: 50, modo: 'todos' })
  let parse = 0
  let recibir = 0
  let bytesFoto = 0
  for (const texto of fotos) {
    bytesFoto += texto.length
    const a = performance.now()
    const m = JSON.parse(texto)
    const b = performance.now()
    cliente._recibir(m)
    const c = performance.now()
    parse += b - a
    recibir += c - b
  }
  // Y por frame: la pose de cada uno, que es lo que el motor pide al dibujar.
  const vueltas = 2000
  const t0 = performance.now()
  let vistos = 0
  for (let k = 0; k < vueltas; k++) {
    for (const r of cliente.rivales.values()) if (cliente.poseDe(r)) vistos += 1
  }
  const porFrame = (performance.now() - t0) / vueltas
  console.log(`  fotos medidas: ${fotos.length}, de ${(bytesFoto / fotos.length / 1024).toFixed(1)} KiB cada una`)
  console.log(`  JSON.parse: ${(parse / fotos.length).toFixed(3)} ms por foto · leerla: ${(recibir / fotos.length).toFixed(3)} ms`)
  console.log(`  a 20 Hz eso son ${((parse + recibir) / fotos.length * 20).toFixed(1)} ms de CPU por segundo`)
  console.log(`  interpolar a los ${cliente.rivales.size}: ${porFrame.toFixed(4)} ms por frame (${(vistos / vueltas).toFixed(0)} con pose)`)
  ok(cliente.rivales.size === 49, `el cliente tiene a los 49 (${cliente.rivales.size})`)
}

console.log('\n--- Qué significa ---')
const t60 = extremo.todo60
const f20 = extremo.filtro20
console.log(`  50 sin filtro a 60 Hz: ${(t60.kibPorSegundo / 1024).toFixed(1)} MiB/s de subida (${(t60.kibPorSegundo * 8 / 1024).toFixed(0)} Mbit/s) y ${(t60.msPorPaso / SIM_STEP_MS * 100).toFixed(0)} % de un paso de CPU`)
console.log(`  50 con filtro a 20 Hz: ${(f20.kibPorSegundo / 1024).toFixed(1)} MiB/s (${(f20.kibPorSegundo * 8 / 1024).toFixed(0)} Mbit/s), ${f20.rivalesPorFoto.toFixed(1)} rivales por foto, ${(f20.msPorPaso / SIM_STEP_MS * 100).toFixed(0)} % de un paso`)
console.log(`  por jugador: ${f20.porJugador.toFixed(0)} KiB/s de bajada (${(f20.porJugador * 8 / 1024).toFixed(2)} Mbit/s)`)
const horas = 300
console.log(`  una sala así 300 h al mes: ${(f20.kibPorSegundo * 3600 * horas / 1024 / 1024 / 1024).toFixed(2)} TiB → ~${(f20.kibPorSegundo * 3600 * horas / 1024 / 1024 * 1.073741824 * 0.02).toFixed(0)} $/mes a 0.02 $/GB`)

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
