/** Banco de la vuelta 87: rebote, reposo, mecha y tiro corto. Sin navegador. */
import { GRENADES, WEAPONS } from '../src/config.js'
import { Proyectiles, lanzamientoDeArma, mechaDeGranada, caidaDeArea } from '../src/game/proyectiles.js'

const DT = 1 / 60
/** Un suelo en y=0 y cuatro paredes a ±20. Aritmética, como la sala de verdad. */
function suelo(x0, y0, z0, x1, y1, z1) {
  let mejor = null
  const prueba = (t, nx, ny, nz) => {
    if (!(t >= 0 && t <= 1)) return
    if (mejor && mejor.t <= t) return
    mejor = { t, x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, z: z0 + (z1 - z0) * t, nx, ny, nz }
  }
  if (y1 < 0 && y0 >= 0) prueba((0 - y0) / (y1 - y0), 0, 1, 0)
  if (x1 > 60 && x0 <= 60) prueba((60 - x0) / (x1 - x0), -1, 0, 0)
  if (x1 < -60 && x0 >= -60) prueba((-60 - x0) / (x1 - x0), 1, 0, 0)
  if (z1 > 60 && z0 <= 60) prueba((60 - z0) / (z1 - z0), 0, 0, -1)
  if (z1 < -60 && z0 >= -60) prueba((-60 - z0) / (z1 - z0), 0, 0, 1)
  return mejor
}

function tirar({ arma = WEAPONS.core, carga = 1, pitch = 0, corto = false, sostenidoS = 0, hz = 60 }) {
  const dt = 1 / hz
  const pr = new Proyectiles(4)
  const l = lanzamientoDeArma(arma, carga, { x: 0, y: 1.7, z: 0 }, 0, pitch, {}, { corto, sostenidoS })
  pr.lanzar({ ...l, dueno: 'yo' })
  let botes = 0, pasos = 0, quietaEn = -1, primerBote = null
  let ex = null
  while (pr.vivos > 0 && pasos < hz * 12) {
    const n = pr.paso(dt, suelo, null)
    if (!primerBote && pr.cuantosBotes > 0) primerBote = { x: pr.botes[0].x, z: pr.botes[0].z }
    botes += pr.cuantosBotes
    if (quietaEn < 0 && pr.quieta[0] === 1) quietaEn = pasos * dt
    if (n > 0) { const im = pr.impactos[0]; ex = { x: im.x, y: im.y, z: im.z, porMecha: im.porMecha } }
    pasos += 1
  }
  return { botes, quietaEn, ex, primerBote, tiempo: pasos * dt }
}

const filas = []
const push = (k, v) => filas.push([k, v])

// [1] Tiro largo plano y a 45°, y a dónde llega.
const plano0 = tirar({ carga: 0, sostenidoS: 0 })
const plano1 = tirar({ carga: 1, sostenidoS: 0 })
const alto1 = tirar({ carga: 1, pitch: Math.PI / 4, sostenidoS: 0 })
push('largo carga 0, plano · toca en z / para en z', `${(-plano0.primerBote.z).toFixed(2)} / ${(-plano0.ex.z).toFixed(2)}`)
push('largo carga 1, plano · toca en z / para en z', `${(-plano1.primerBote.z).toFixed(2)} / ${(-plano1.ex.z).toFixed(2)}`)
push('largo carga 1, a 45° · toca en z / para en z', `${(-alto1.primerBote.z).toFixed(2)} / ${(-alto1.ex.z).toFixed(2)}`)

// [2] Tiro corto.
const corto0 = tirar({ carga: 0, corto: true })
const corto1 = tirar({ carga: 1, corto: true })
push('corto carga 0 · toca en z / para en z', `${(-corto0.primerBote.z).toFixed(2)} / ${(-corto0.ex.z).toFixed(2)}`)
push('corto carga 1 · toca en z / para en z', `${(-corto1.primerBote.z).toFixed(2)} / ${(-corto1.ex.z).toFixed(2)}`)

// [3] Rebote y reposo: cuántos botes y cuándo se para.
push('botes antes de pararse (largo, plano)', String(plano1.botes))
push('se para a los (s)', plano1.quietaEn.toFixed(3))
push('revienta por mecha', String(plano1.ex.porMecha))
push('revienta a los (s)', plano1.tiempo.toFixed(3))

// [4] Independencia del refresco: el sitio donde revienta.
for (const hz of [60, 144, 240]) {
  const r = tirar({ carga: 1, pitch: 0.2, sostenidoS: 0, hz })
  push(`a ${hz} Hz · revienta en`, `${r.ex.x.toFixed(4)}, ${r.ex.y.toFixed(4)}, ${r.ex.z.toFixed(4)}`)
}

// [5] Cocinado.
for (const s of [0, 1, 2, 3, 3.5, 10]) push(`sostenida ${s}s · mecha`, `${mechaDeGranada(s)}s`)

// [6] Nada de esto toca a una flecha: el mismo tiro, antes y después.
const flecha = tirar({ arma: WEAPONS.bow, carga: 1, pitch: 0.2 })
push('flecha · rebota', String(flecha.botes > 0))
push('flecha · revienta en', `${flecha.ex.x.toFixed(4)}, ${flecha.ex.y.toFixed(4)}, ${flecha.ex.z.toFixed(4)}`)

// [7] La caída de área de cada granada.
for (const k of ['core', 'blind', 'ko']) {
  const t = WEAPONS[k].tiro
  const e = t.explosion ?? t.ceguera ?? t.aturdimiento
  const mitad = caidaDeArea(e.radioU / 2, e.radioU, e.nucleoU)
  push(`${k} · radio ${e.radioU} · a mitad de radio`, `${(mitad * 100).toFixed(0)}%`)
}

const ancho = Math.max(...filas.map(([k]) => k.length))
for (const [k, v] of filas) console.log(`  ${k.padEnd(ancho)}  ${v}`)
