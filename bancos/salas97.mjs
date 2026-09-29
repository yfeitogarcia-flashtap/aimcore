/**
 * salas97 — **¿qué cuesta una sala de N jugadores?**
 *
 * La pregunta literal del punto 7 del encargo: «cuántas salas de 10 jugadores
 * aguanta la máquina única de Fly.io, y qué implica para el protocolo pasar de 2
 * a 10». Esto no construye nada: **mide el coste de hoy con N butacas**, que es
 * lo único que puede decir si la propuesta 11 es una vuelta o un proyecto.
 *
 * Cómo, y con su denominador:
 *
 *  - `Partida` corta en dos butacas (`get llena`). Se le sube el tope **sólo
 *    aquí**, en el prototipo y desde el banco: lo que se mide es el coste del
 *    bucle y del protocolo, no un modo nuevo.
 *  - Cada jugador entra con un `enviar` que **cuenta bytes**, así que el tráfico
 *    sale de lo que el servidor manda de verdad y no de una estimación.
 *  - Se gastan pasos de mundo de verdad (`tick`), con una entrada por jugador y
 *    paso, que es lo que hace el cliente.
 *  - Y se imprime **el coste por paso y el tráfico por segundo de mundo**, que
 *    son las dos unidades en las que hay un techo: 16.67 ms de paso y lo que
 *    cabe por el cable.
 */
import * as THREE from 'three'
import { Partida } from '../net/partida.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG } from '../net/protocolo.js'
import { SIM_STEP_MS } from '../src/config.js'

const escenario = new Scenario(new THREE.Scene(), 'elEspejo')
const PASOS = 900 // 15 s de mundo

/**
 * **Y las salidas, que hoy son dos.** `Partida` reparte `salidas[equipo]`, y El
 * Espejo declara exactamente dos porque es un mapa de duelo (vuelta 66): con
 * tres butacas el tercero entra y revienta leyendo `undefined.x`. Es el primer
 * hallazgo de esta medida y está anotado en la propuesta 11 — un mapa de N
 * jugadores tiene que **declarar N salidas**, y eso es formato, no protocolo.
 */
function conSalidas(n, base) {
  const salidas = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    salidas.push({ x: Math.cos(a) * 16, z: Math.sin(a) * 16, yaw: a })
  }
  return new Proxy(base, {
    // Desde la 101 la partida pide `salidasDeEquipos(porEquipo)` (el duelo es
    // un modo de equipos de uno); `salidasDeDuelo` se deja por si otro la lee.
    get: (obj, clave) => {
      if (clave === 'salidasDeDuelo') return salidas
      if (clave === 'salidasDeEquipos') return () => salidas
      return Reflect.get(obj, clave)
    },
  })
}

/** El tope de butacas, que hoy es 2. Se sube para poder medir. */
function conButacas(n, fn) {
  const original = Object.getOwnPropertyDescriptor(Partida.prototype, 'llena')
  Object.defineProperty(Partida.prototype, 'llena', {
    configurable: true,
    get() { return this.jugadores.size >= n },
  })
  try { return fn() } finally { Object.defineProperty(Partida.prototype, 'llena', original) }
}

/**
 * **El desglose por tipo de mensaje se mide aparte, y no es un capricho.**
 * Saber de qué son los bytes pide un `JSON.parse` por mensaje, o sea seiscientos
 * por paso en una sala de 10 — y eso **es** el cronómetro midiendo el banco. La
 * primera versión daba 0.14 ms/paso para dos jugadores contra los 0.09 de la
 * misma tanda sin desglose: es la regla de la vuelta 76, el instrumento se mide
 * antes de creérselo.
 */
function medir(n, { desglosar = false } = {}) {
  return conButacas(n, () => {
    let bytes = 0
    /** Y de qué es cada byte: sin esto no se sabe qué palanca sirve de algo. */
    const porTipo = new Map()
    const p = new Partida({ escenario: conSalidas(n, escenario), rondas: false, depurar: true })
    const jugadores = []
    for (let i = 0; i < n; i++) {
      const id = p.entra(desglosar
        ? (texto) => {
            const b = Buffer.byteLength(texto, 'utf8')
            bytes += b
            let t = '?'
            try { t = JSON.parse(texto).t ?? '?' } catch { /* da igual */ }
            porTipo.set(t, (porTipo.get(t) ?? 0) + b)
          }
        : (texto) => { bytes += Buffer.byteLength(texto, 'utf8') })
      const j = p.jugadores.get(id)
      // Repartidos por la sala, que es lo que hace que el rebobinado y la
      // visión tengan a quién mirar.
      j.pose.position.x = Math.cos((i / n) * Math.PI * 2) * 14
      j.pose.position.z = Math.sin((i / n) * Math.PI * 2) * 14
      jugadores.push(j)
    }
    // Se deja entrar a todos antes de contar: la bienvenida y el inventario no
    // son tráfico de partida.
    for (let k = 0; k < 10; k++) {
      const q = p.paso + 1
      for (const j of jugadores) p.recibe(j.id, JSON.stringify({ t: MSG.ENTRADA, n: q, k: 0, yaw: 0, jt: -1, w: 0 }))
      p.tick()
    }
    bytes = 0
    porTipo.clear()
    const t0 = process.hrtime.bigint()
    for (let k = 0; k < PASOS; k++) {
      const q = p.paso + 1
      for (const [i, j] of jugadores.entries()) {
        // Andando y girando: una entrada quieta no mueve a nadie y la foto se
        // quedaría sin campos que cambien.
        p.recibe(j.id, JSON.stringify({ t: MSG.ENTRADA, n: q, k: 1, yaw: (k * 0.01 + i) % 6.28, jt: -1, w: 0 }))
      }
      p.tick()
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6
    const segundos = (PASOS * SIM_STEP_MS) / 1000
    return {
      n,
      msPorPaso: ms / PASOS,
      kbPorSegundo: bytes / 1024 / segundos,
      bytesPorFoto: bytes / PASOS / n,
      porTipo: [...porTipo.entries()].sort((a, b) => b[1] - a[1]),
      total: bytes,
    }
  })
}

console.log('== salas97 ==\n')
console.log('  jug.   ms/paso   % de un paso   bajada total   bytes por foto')
const filas = [2, 4, 6, 8, 10].map(medir)
for (const f of filas) {
  console.log(
    `  ${String(f.n).padStart(4)}   ${f.msPorPaso.toFixed(4)}    ${((f.msPorPaso / SIM_STEP_MS) * 100).toFixed(2)}%`.padEnd(38) +
    `${f.kbPorSegundo.toFixed(1)} KB/s`.padStart(14) +
    `${f.bytesPorFoto.toFixed(0)} B`.padStart(17),
  )
}

console.log('\n--- De qué son los bytes, en la sala de 10 (tanda aparte) ---')
const desglose = medir(10, { desglosar: true })
for (const [t, b] of desglose.porTipo) {
  console.log(`  mensaje «${t}»: ${((b / desglose.total) * 100).toFixed(1)}%`)
}

const dos = filas[0]
const diez = filas[filas.length - 1]
console.log('\n--- Qué significa ---')
console.log(`  Una sala de 10 cuesta ${(diez.msPorPaso / dos.msPorPaso).toFixed(1)}× lo que una de 2 en CPU`)
console.log(`  y ${(diez.kbPorSegundo / dos.kbPorSegundo).toFixed(1)}× en bajada (el cuadrado: N fotos de N jugadores).`)
console.log(`  A 16.67 ms por paso caben ~${Math.floor(SIM_STEP_MS / diez.msPorPaso)} salas de 10 **por CPU**,`)
console.log(`  y en 40 Mbit/s de subida de la máquina caben ~${Math.floor((40 * 1024 / 8) / diez.kbPorSegundo)} **por tráfico**.`)
console.log('  El techo es el tráfico, como decía fly.toml para el 1v1.')

console.log('\n--- Las dos palancas, sobre la sala de 10 ---')
// La foto va a 60 Hz porque el paso va a 60 Hz. Bajarla no toca la simulación:
// el cliente ya interpola entre dos fotos desde la vuelta 45.
for (const hz of [60, 30, 20]) {
  console.log(`  fotos a ${String(hz).padStart(2)} Hz: ${(diez.kbPorSegundo * (hz / 60)).toFixed(0)} KB/s por sala`)
}
// Y mandar sólo a quien se ve rompe el cuadrado: con k rivales visibles de
// media, la foto pasa de N a k+1 cuerpos.
for (const k of [9, 4, 2]) {
  console.log(`  y con ${k} rivales visibles de media: ${(diez.kbPorSegundo * ((k + 1) / 10)).toFixed(0)} KB/s`)
}
console.log(`  las dos juntas (20 Hz, 4 visibles): ${(diez.kbPorSegundo * (20 / 60) * (5 / 10)).toFixed(0)} KB/s por sala`)
