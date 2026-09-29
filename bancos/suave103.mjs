// suave103 — ¿se mueve el rival con suavidad cuando las fotos llegan a
// tirones? Y ¿se mueve uno mismo con suavidad cuando el ping da un salto?
//
// Dos navegadores, un jugador cada uno (vuelta 50), contra el huésped con
// VEKTOR_LOBBY=0 VEKTOR_RONDAS=0 VEKTOR_DEBUG=1 en el 5199 y la página en vite
// (5192). B corre en línea recta a velocidad constante; A mira y anota, frame a
// frame, dónde dibuja a B. Con la red de A en orden (TCP) y con retraso
// variable, que es el wifi.
//
// Qué se mide, con su premisa delante:
//  - La velocidad real de B (lo que corre de verdad, en su pantalla): el
//    denominador. Si B no corre, lo demás no significa nada.
//  - En A, la velocidad a la que se dibuja a B frame a frame: cuántos frames
//    sale **congelado** (< 25 % de su marcha), cuántos **salta** (> 175 %), y la
//    desviación típica.
//  - En A corriendo él: frames con **tirón propio** (el paso de un frame mueve
//    más de 1.75 veces lo que tocaría por su duración).
import { chromium } from 'playwright-core'
const lanzar = () => chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const BASE = process.env.BASE || 'http://localhost:5192'
const [na, nb] = await Promise.all([lanzar(), lanzar()])
const A = await na.newPage({ viewport: { width: 800, height: 500 } })
const B = await nb.newPage({ viewport: { width: 800, height: 500 } })
const errores = []
for (const p of [A, B]) p.on('pageerror', (e) => errores.push(String(e)))
await A.goto(`${BASE}/duelo/`, { waitUntil: 'networkidle' }); await A.waitForTimeout(2500)
const enlace = await A.evaluate(() => document.querySelector('#enlace').value)
await B.goto(enlace.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle' }); await B.waitForTimeout(2500)
for (const p of [A, B]) { await p.mouse.click(30, 30); await p.waitForTimeout(400) }
const colocar = (p, x, z, yaw) => p.evaluate(({ x, z, yaw }) => {
  window.vektorNet.cliente.transporte.send(JSON.stringify({ t: 'c', x, z }))
  window.vektorNet.motor.controls.lookAt(yaw)
}, { x, z, yaw })
const red = (p, lat, jit) => p.evaluate(({ lat, jit }) => {
  const e = window.vektorNet.enlace
  e.latenciaMs = lat; e.jitterMs = jit; e.enOrden = true
}, { lat, jit })

// La sonda de A: la pose dibujada del rival y la cámara propia, una por frame.
await A.evaluate(() => {
  const m = window.vektorNet.motor
  const S = window.__s = { on: false, riv: [], yo: [] }
  const loop = m._loop
  m._loop = (now) => {
    loop(now)
    if (!S.on) return
    const v = m._rivales?.find((r) => r.avatar.group.visible)
    if (v) S.riv.push([now, v.avatar.group.position.x, v.avatar.group.position.z])
    S.yo.push([now, m.camera.position.x, m.camera.position.z])
  }
})
const velocidades = (pts) => {
  const out = []
  for (let i = 1; i < pts.length; i++) {
    const dt = (pts[i][0] - pts[i - 1][0]) / 1000
    if (dt <= 0) continue
    out.push({ v: Math.hypot(pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]) / dt, dt })
  }
  return out
}
const resumen = (vs, ref) => {
  // Se descartan los extremos del tramo (arrancar y frenar).
  const x = vs.slice(Math.floor(vs.length * 0.1), Math.floor(vs.length * 0.9))
  const media = x.reduce((a, b) => a + b.v, 0) / x.length
  const dt = Math.sqrt(x.reduce((a, b) => a + (b.v - ref) ** 2, 0) / x.length)
  return {
    frames: x.length,
    media: +media.toFixed(2),
    congelado: x.filter((s) => s.v < ref * 0.25).length,
    salto: x.filter((s) => s.v > ref * 1.75).length,
    desvio: +dt.toFixed(2),
  }
}

async function tramoRival(etiqueta) {
  await colocar(A, 0, pasillo.az, pasillo.az > pasillo.z ? 0 : Math.PI)
  await colocar(B, -10, pasillo.z, -Math.PI / 2)
  await A.waitForTimeout(1500)
  // B mira hacia +x y corre con W.
  await B.evaluate(() => window.vektorNet.motor.controls.lookAt(-Math.PI / 2))
  const bx0 = await B.evaluate(() => window.vektorNet.camara.position.x)
  await A.evaluate(() => { window.__s.riv = []; window.__s.on = true })
  const t0 = Date.now()
  await B.keyboard.down('KeyW'); await B.waitForTimeout(3200); await B.keyboard.up('KeyW')
  const segs = (Date.now() - t0) / 1000
  await A.waitForTimeout(400)
  const pts = await A.evaluate(() => { window.__s.on = false; return window.__s.riv })
  const bx1 = await B.evaluate(() => window.vektorNet.camara.position.x)
  const real = Math.abs(bx1 - bx0) / segs
  const r = resumen(velocidades(pts), real)
  console.log(etiqueta.padEnd(40), `B corre ${real.toFixed(2)} u/s (premisa) ·`, JSON.stringify(r))
  return r
}

async function tramoPropio(etiqueta) {
  await colocar(A, -10, pasillo.z, -Math.PI / 2)
  await A.waitForTimeout(1200)
  await A.evaluate(() => { window.vektorNet.motor.controls.lookAt(-Math.PI / 2); window.__s.yo = []; window.__s.on = true })
  await A.keyboard.down('KeyW'); await A.waitForTimeout(3200); await A.keyboard.up('KeyW')
  const pts = await A.evaluate(() => { window.__s.on = false; return window.__s.yo })
  const extra = await A.evaluate(() => window.vektorNet.cliente.medidas.correcciones)
  const x = pts.slice(Math.floor(pts.length * 0.1), Math.floor(pts.length * 0.9))
  const real = Math.hypot(x.at(-1)[1] - x[0][1], x.at(-1)[2] - x[0][2]) / ((x.at(-1)[0] - x[0][0]) / 1000)
  const r = resumen(velocidades(pts), real)
  console.log(etiqueta.padEnd(40), JSON.stringify(r), `correcciones acumuladas ${extra}`)
  return r
}

// Un pasillo recto de 20 u sin nada en medio, y un sitio a 8 u con vista.
const pasillo = await A.evaluate(() => {
  const e = window.vektorNet.escenario
  const libre = (x0, z0, x1, z1) => !e.cortarSegmento(x0, 0.4, z0, x1, 0.4, z1) && !e.cortarSegmento(x0, 1.6, z0, x1, 1.6, z1)
    && !e.cortarSegmento(x0 + 0.5, 0.4, z0 + 0.5, x1 + 0.5, 0.4, z1 + 0.5) && !e.cortarSegmento(x0 - 0.5, 0.4, z0 - 0.5, x1 - 0.5, 0.4, z1 - 0.5)
  for (let z = -16; z <= 16; z += 1) {
    let llano = true
    for (let x = -10; x <= 10; x += 1) if (Math.abs(e.groundHeightAt(x, z)) > 0.01) llano = false
    if (!llano || !libre(-10, z, 10, z)) continue
    for (const dz of [8, -8, 6, -6]) {
      if (Math.abs(e.groundHeightAt(0, z + dz)) > 0.01) continue
      if (libre(0, z + dz, -8, z) && libre(0, z + dz, 8, z) && libre(0, z + dz, 0, z)) return { z, az: z + dz }
    }
  }
  return null
})
console.log('pasillo:', JSON.stringify(pasillo))
if (!pasillo) process.exit(1)
await red(A, 0, 0); await red(B, 0, 0)
await tramoRival('rival · red limpia')
await red(A, 20, 40)
await tramoRival('rival · A con 20±40 ms en orden')
await red(A, 20, 80)
await tramoRival('rival · A con 20±80 ms en orden')
await red(A, 0, 0)
await tramoPropio('propio · red limpia')
await red(A, 20, 40)
await tramoPropio('propio · A con 20±40 ms en orden')
await red(A, 20, 80)
await tramoPropio('propio · A con 20±80 ms en orden')
console.log('errores de página:', errores.length, errores.slice(0, 2))
await na.close(); await nb.close()
