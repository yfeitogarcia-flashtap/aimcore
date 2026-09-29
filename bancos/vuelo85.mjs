/**
 * **vuelo85 — la parábola de un proyectil, a tres refrescos.**
 *
 * Lo que hay que demostrar de una mecánica nueva en este proyecto: que da lo
 * mismo a 60, 144 y 240 Hz, que no atraviesa paredes, y que lo que se dibuja
 * antes de disparar es lo que luego pasa.
 */
import * as THREE from 'three'
import { Scenario } from '../src/game/scenario.js'
import { Proyectiles, puntoDeVuelo, caidaDeArea } from '../src/game/proyectiles.js'
import { SIM } from '../src/config.js'

const mapa = {
  clave: 'v85', nombre: 'V', sala: { lado: 80, alto: 20 }, spawnZone: [],
  boxes: [{ x: -3, z: -20, w: 6, d: 0.6, kind: 'alta' }],
}
const esc = new Scenario(new THREE.Scene(), mapa)
const cortar = (a, b, c, d, e, f) => esc.cortarSegmento(a, b, c, d, e, f)

/** Lanza una flecha y devuelve dónde acaba, con el paso del mundo a `hz`. */
function tirar(hz, vx, vy, vz, g, x0 = 0, y0 = 1.7, z0 = 20) {
  const pr = new Proyectiles()
  pr.lanzar({ tipo: 'flecha', dueno: 'yo', x: x0, y: y0, z: z0, vx, vy, vz, g, fuerza: 1 })
  const dt = 1 / hz
  for (let n = 0; n < hz * 10; n++) {
    const cuantos = pr.paso(dt, cortar)
    if (cuantos > 0) {
      const im = pr.impactos[0]
      return { x: im.x, y: im.y, z: im.z, t: pr.t[im.i], pasos: n + 1 }
    }
  }
  return null
}

console.log('== vuelo85 ==\n')

// **[1] El mundo va a 60 Hz fijos**, pero el modelo tiene que aguantar
// cualquier paso: es lo que permitirá que un día el servidor simule a otro
// ritmo (la nota de la vuelta 27 sobre la forma cerrada).
console.log('[1] la misma flecha con pasos de 60, 144 y 240 Hz')
const filas = []
for (const hz of [60, 144, 240]) {
  const r = tirar(hz, 0, 6, -40, 10)
  filas.push(r)
  console.log(`    ${String(hz).padStart(3)} Hz → x ${r.x.toFixed(6)}  y ${r.y.toFixed(6)}  z ${r.z.toFixed(6)}  (${r.t.toFixed(4)} s)`)
}
const ys = filas.map((f) => f.y)
const disp = (Math.max(...ys) - Math.min(...ys)) / Math.abs(ys[0])
console.log(`    dispersión en la altura del impacto: ${(disp * 100).toFixed(4)}%`)

// **[2] Y para en el muro**, que está a z −20 y mide 3.6 de alto.
{
  // Sin gravedad, para que lo que se mida sea la pared y no la caída.
  const r = tirar(60, 0, 0, -60, 0)
  console.log(`\n[2] recta contra un muro en z −20: para en z ${r.z.toFixed(4)}, y ${r.y.toFixed(4)}`)
  console.log(`    (el muro ocupa de z −20.0 a −19.4 y sube a 3.6: la cara que da es la de −19.4)`)
  // Y con caída, cae al suelo antes de llegar: 1.7 u de altura con g 10 son
  // 0.583 s, o sea 35 u a 60 u/s.
  const c = tirar(60, 0, 0, -60, 10)
  console.log(`    con g 10 cae antes: z ${c.z.toFixed(4)}, y ${c.y.toFixed(4)} (el suelo)`)
}

// **[3] Un proyectil rápido no atraviesa una pared fina.** Es la razón de que
// el paso sea un segmento y no un punto: a 200 u/s se avanzan 3.3 u por paso.
{
  let colados = 0
  for (let v = 20; v <= 300; v += 5) {
    const r = tirar(60, 0, 0, -v, 0, 0, 1.7, 20)
    if (!r || r.z < -20.7) colados += 1
  }
  console.log(`\n[3] de 20 a 300 u/s contra un muro de 0.6: ${colados} se cuelan`)
}

// **[4] Lo que dibuja el láser es lo que pasa**: la misma fórmula.
{
  const g = 10, vx = 0, vy = 6, vz = -40
  const r = tirar(60, vx, vy, vz, g)
  const p = puntoDeVuelo(0, 1.7, 20, vx, vy, vz, g, r.t, { x: 0, y: 0, z: 0 })
  const err = Math.hypot(p.x - r.x, p.y - r.y, p.z - r.z)
  console.log(`\n[4] la curva dibujada contra donde acaba de verdad: ${err.toFixed(9)} u`)
}

// **[5] La caída de un área**, que comparten el cohete y las tres granadas.
{
  const R = 5, N = 1.2
  const fila = [0, 1.2, 2, 3.1, 4, 5, 6].map((d) => `${d}→${caidaDeArea(d, R, N).toFixed(2)}`)
  console.log(`\n[5] caída con radio ${R} y núcleo ${N}: ${fila.join('  ')}`)
}

// **[6] Lo que cuesta un paso con ocho volando**, contra 0.2 ms de presupuesto.
{
  const pr = new Proyectiles()
  const N = 40000
  const dt = 1 / SIM.hz
  let t0 = process.hrtime.bigint()
  for (let n = 0; n < N; n++) {
    if (pr.vivos < 8) {
      pr.lanzar({ tipo: 'f', dueno: 'a', x: 0, y: 1.7, z: 20, vx: 0, vy: 4, vz: -18, g: 10, fuerza: 1 })
    }
    pr.paso(dt, cortar)
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N
  console.log(`\n[6] un paso con ocho proyectiles volando: ${ms.toFixed(5)} ms (presupuesto 0.2)`)
}
