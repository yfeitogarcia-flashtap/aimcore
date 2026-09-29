// doble103 — un clic que acierta es UN golpe de sonido y UNA marca, en el
// instante del clic, no dos separados por el ping. Dos navegadores, huésped
// VEKTOR_RONDAS=0 VEKTOR_DEBUG=1; A con 60 ms de ida para que se vea el hueco.
import { chromium } from 'playwright-core'
const lanzar = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
const BASE = 'http://localhost:5192'
let fallos = 0; const ok = (c, t) => { console.log((c ? '  ok  ' : '  FALLO ') + t); if (!c) fallos++ }
const [na, nb] = await Promise.all([lanzar(), lanzar()])
const A = await na.newPage({ viewport: { width: 900, height: 560 } })
const B = await nb.newPage({ viewport: { width: 900, height: 560 } })
const err = []; for (const p of [A, B]) p.on('pageerror', (e) => err.push(String(e)))
await A.addInitScript(() => {
  const T = window.__fuentes = []
  const C = window.AudioContext.prototype
  const o = C.createOscillator, b = C.createBufferSource
  C.createOscillator = function (...a) { T.push(performance.now()); return o.apply(this, a) }
  C.createBufferSource = function (...a) { T.push(performance.now()); return b.apply(this, a) }
})
await A.goto(`${BASE}/duelo/`, { waitUntil: 'networkidle' }); await A.waitForTimeout(2500)
const enlace = await A.evaluate(() => document.querySelector('#enlace').value)
await B.goto(enlace.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle' }); await B.waitForTimeout(2500)
for (const p of [A, B]) { await p.mouse.click(30, 30); await p.waitForTimeout(500) }
const colocar = (p, x, z, yaw) => p.evaluate(({ x, z, yaw }) => { window.vektorNet.cliente.transporte.send(JSON.stringify({ t: 'c', x, z })); window.vektorNet.motor.controls.lookAt(yaw) }, { x, z, yaw })
/**
 * **El sitio se busca, no se escribe** (vuelta 106). Estaba clavado en
 * (±3, −16) y el mapa de duelo de fábrica ha cambiado desde entonces: ahí ya no
 * había línea de visión y los cuatro clics salían al aire — «0 aciertos», que es
 * la premisa diciendo que la tabla estaba vacía. Es la búsqueda de `ficha101`:
 * suelo llano en los dos sitios y nada en medio.
 */
const sitio = await A.evaluate(() => {
  const { verDesde, escenario, camara } = window.vektorNet
  const p = camara.position.clone(), q = camara.position.clone()
  const llano = (x, z) => Math.abs(escenario.groundHeightAt(x, z)) < 0.01
  for (let x = -16; x <= 16; x += 2) for (let z = -16; z <= 16; z += 2) {
    if (!llano(x, z) || !llano(x, z - 6)) continue
    p.set(x, 1.4, z); q.set(x, 1.4, z - 6)
    if (verDesde(p, q, escenario.occluders)) return { x, z }
  }
  return null
})
await colocar(A, sitio.x, sitio.z, 0)
await colocar(B, sitio.x, sitio.z - 6, Math.PI)
await A.waitForTimeout(1500)
await A.evaluate(() => {
  const e = window.vektorNet.enlace; e.latenciaMs = 60; e.enOrden = true
  const m = window.vektorNet.motor
  m.controls.lookAt(0); m.camera.rotation.x = -0.12
  window.__marcas = []
  const f = m.callbacks.onVerdict
  m.callbacks.onVerdict = (v) => { window.__marcas.push(performance.now()); return f?.(v) }
})
await A.waitForTimeout(1500)
const clics = []
for (let i = 0; i < 4; i++) {
  const t0 = await A.evaluate(() => { window.__fuentes.length = 0; window.__marcas.length = 0; return performance.now() })
  await A.mouse.down(); await A.waitForTimeout(40); await A.mouse.up()
  await A.waitForTimeout(700)
  const r = await A.evaluate((t0) => ({
    fuentes: window.__fuentes.map((t) => Math.round(t - t0)),
    marcas: window.__marcas.map((t) => Math.round(t - t0)),
    vida: window.vektorNet.cliente.rivales.values().next().value?.vida,
  }), t0)
  console.log(`  clic ${i + 1}: sonidos a ${JSON.stringify(r.fuentes)} ms · marcas a ${JSON.stringify(r.marcas)} · vida del rival ${r.vida}`)
  clics.push(r)
  await A.waitForTimeout(600)
}
const acertados = clics.filter((c) => c.marcas.length > 0 && c.vida > 0)
const bajas = clics.filter((c) => c.marcas.length > 0 && c.vida === 0)
ok(acertados.length >= 1 && bajas.length >= 1, `premisa: ${acertados.length} aciertos sin baja y ${bajas.length} con baja`)
ok(acertados.every((c) => c.marcas.length === 1 && c.marcas[0] < 60), 'un acierto: una sola marca, en el clic')
ok(acertados.every((c) => c.fuentes.every((t) => t < 60)), 'y todo lo que suena, antes de que vuelva el servidor (< 60 ms del clic)')
ok(bajas.every((c) => c.marcas[0] < 60 && c.marcas.length === 2), 'una baja: el acierto en el clic y la baja cuando la confirma el servidor')
ok(err.length === 0, `sin errores de página ${err.slice(0, 1)}`)
await na.close(); await nb.close()
console.log(fallos ? `${fallos} FALLOS` : 'TODO OK'); process.exit(fallos ? 1 : 0)
