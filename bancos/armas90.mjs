/** Las tres armas nuevas: alcance del Fang, peso y marcha, y lo que cuesta cada una. */
import { CAMERA, ECONOMY, MOVEMENT, WEAPONS, weaponSpeedFactor } from '../src/config.js'
import { lanzamientoDeArma, puntoDeVuelo } from '../src/game/proyectiles.js'

const OJOS = { x: 0, y: MOVEMENT.standHeight, z: 0 }
const _l = {}
const _p = { x: 0, y: 0, z: 0 }

/** Dónde toca el suelo un lanzamiento, en unidades desde el tirador. */
function alcance(arma, carga, gradosArriba) {
  const l = lanzamientoDeArma(WEAPONS[arma], carga, OJOS, 0, (gradosArriba * Math.PI) / 180, _l)
  let t = 0
  for (let i = 0; i < 60000; i++) {
    t += 1 / 600
    puntoDeVuelo(l.x, l.y, l.z, l.vx, l.vy, l.vz, l.g, t, _p)
    if (_p.y <= 0) break
  }
  return { u: Math.hypot(_p.x, _p.z), s: t }
}

console.log('=== Fang: dónde cae, desde la altura de ojos ===')
for (const [nombre, grados] of [['plano', 0], ['a 20°', 20], ['a 45°', 45]]) {
  const flojo = alcance('fang', 0, grados)
  const lleno = alcance('fang', 1, grados)
  console.log(`  ${nombre.padEnd(6)}  sin cargar ${flojo.u.toFixed(1)} u (${flojo.s.toFixed(2)} s)  ·  cargado ${lleno.u.toFixed(1)} u (${lleno.s.toFixed(2)} s)`)
}

console.log('\n=== peso, marcha y cadencia ===')
console.log('arma     kg    factor   u/s     RPM    ms/tiro  cargador  recarga  precio')
const precio = (k) => ECONOMY.catalogo.find((i) => i.clave === k)?.precio
for (const k of ['pulse', 'reaper', 'volt', 'rift', 'scout', 'titan', 'bow', 'u2', 'fang']) {
  const w = WEAPONS[k]
  const f = weaponSpeedFactor(w.weight)
  const suelo = f <= MOVEMENT.load.minFactor + 1e-9 ? ' (suelo)' : ''
  console.log(
    `${k.padEnd(8)} ${String(w.weight).padStart(4)}  ${f.toFixed(3)}  ${(MOVEMENT.speed * f).toFixed(2)}${suelo.padEnd(8)}` +
    `${String(w.rpm).padStart(4)}  ${String(Math.round(60000 / w.rpm)).padStart(7)}  ${String(w.magazine).padStart(8)}  ${String(w.reloadMs).padStart(7)}  ${String(precio(k) ?? '—').padStart(6)}`,
  )
}

console.log('\n=== mirilla ===')
for (const k of ['scout', 'titan']) {
  const s = WEAPONS[k].scope
  console.log(`  ${k.padEnd(6)} ${s.fov}° = ${(CAMERA.fov / s.fov).toFixed(1)}×  ·  destello: ${s.destello ? 'sí' : 'no'}`)
}
