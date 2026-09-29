// lag103 — ¿qué cuesta tener a un rival cerca? Dos navegadores en la misma sala
// (huésped con VEKTOR_LOBBY=0 VEKTOR_RONDAS=0 VEKTOR_DEBUG=1 en el 5199). Se
// mide en A el tiempo de JS por frame, repartido por piezas, con B lejos y
// tapado y con B delante corriendo y disparando.
import { chromium } from 'playwright-core'
const lanzar = () => chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--js-flags=--expose-gc'],
})
const BASE = process.env.BASE || 'http://localhost:5199'
const [na, nb] = await Promise.all([lanzar(), lanzar()])
const A = await na.newPage({ viewport: { width: 960, height: 600 } })
const B = await nb.newPage({ viewport: { width: 960, height: 600 } })
const errores = []
for (const p of [A, B]) p.on('pageerror', (e) => errores.push(String(e)))
await A.goto(`${BASE}/duelo/`, { waitUntil: 'networkidle' })
await A.waitForTimeout(2500)
const enlace = await A.evaluate(() => document.querySelector('#enlace').value)
await B.goto(enlace, { waitUntil: 'networkidle' })
await B.waitForTimeout(2500)
for (const p of [A, B]) { await p.mouse.click(30, 30); await p.waitForTimeout(400) }

const colocar = (p, x, z, yaw) => p.evaluate(({ x, z, yaw }) => {
  window.vektorNet.cliente.transporte.send(JSON.stringify({ t: 'c', x, z }))
  window.vektorNet.motor.controls.lookAt(yaw)
}, { x, z, yaw })

// Sonda en A: tiempo por pieza, por frame.
await A.evaluate(() => {
  const m = window.vektorNet.motor
  const c = window.vektorNet.cliente
  const S = window.__s = { piezas: {}, frames: [], gaps: [], ultimo: 0 }
  const envolver = (obj, nombre, etiqueta) => {
    const f = obj[nombre].bind(obj)
    obj[nombre] = (...a) => {
      const t0 = performance.now()
      const r = f(...a)
      S.piezas[etiqueta] = (S.piezas[etiqueta] ?? 0) + performance.now() - t0
      return r
    }
  }
  envolver(m, '_simStep', 'paso')
  envolver(m.renderer, 'render', 'webgl')
  envolver(m.cssRenderer, 'render', 'css3d')
  envolver(m, '_publishStats', 'stats')
  const onm = c.transporte
  // mensajes entrantes: envolver el manejador del cliente
  const orig = c._alMensaje?.bind(c)
  if (orig) c._alMensaje = (...a) => { const t0 = performance.now(); const r = orig(...a); S.piezas.mensajes = (S.piezas.mensajes ?? 0) + performance.now() - t0; return r }
  for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(m))) {
    if (/^_(rival|pisadas|asignar|dibujarRiv|marcadores|actualizarRiv|moverRiv)/i.test(k) && typeof m[k] === 'function') envolver(m, k, k)
  }
  if (m.markers?.update) envolver(m.markers, 'update', 'markers')
  const loop = m._loop
  m._loop = (now) => {
    const t0 = performance.now()
    loop(now)
    const dt = performance.now() - t0
    if (S.midiendo) { S.frames.push(dt); if (S.ultimo) S.gaps.push(now - S.ultimo) }
    S.ultimo = now
  }
})

const medir = async (etiqueta, ms, durante) => {
  await A.evaluate(() => { const S = window.__s; S.piezas = {}; S.frames = []; S.gaps = []; S.midiendo = true; S.heap0 = performance.memory.usedJSHeapSize; S.t0 = performance.now() })
  if (durante) await durante()
  else await A.waitForTimeout(ms)
  const r = await A.evaluate(() => {
    const S = window.__s; S.midiendo = false
    const dur = (performance.now() - S.t0) / 1000
    const ord = (a) => [...a].sort((x, y) => x - y)
    const f = ord(S.frames), g = ord(S.gaps)
    const q = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0
    const piezas = Object.fromEntries(Object.entries(S.piezas).map(([k, v]) => [k, +(v / S.frames.length).toFixed(3)]))
    return {
      frames: f.length, fps: +(f.length / dur).toFixed(1),
      jsMedia: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(2), jsP99: +q(f, 0.99).toFixed(2), jsMax: +f[f.length - 1].toFixed(1),
      gapP99: +q(g, 0.99).toFixed(1), gapMax: +g[g.length - 1].toFixed(1),
      heapKBs: +((performance.memory.usedJSHeapSize - S.heap0) / 1024 / dur).toFixed(0),
      piezas, rivalVisible: window.vektorNet.motor._rivales?.filter((v) => v.avatar.group.visible).length,
    }
  })
  console.log(`\n${etiqueta}`)
  console.log(JSON.stringify(r))
  return r
}

// Lejos y tapados: esquinas opuestas.
await colocar(A, -15, 15, 0)
await colocar(B, 15, -15, Math.PI)
await A.waitForTimeout(2000)
await medir('LEJOS (B fuera de la foto)', 6000)

// Cerca, cara a cara, B corriendo y disparando.
await colocar(A, 0, 4, 0)
await colocar(B, 0, -2, Math.PI)
await A.waitForTimeout(1500)
await medir('CERCA, quieto', 6000)
await medir('CERCA, B corre y dispara', 0, async () => {
  await B.keyboard.down('KeyD')
  for (let i = 0; i < 12; i++) {
    await B.mouse.down(); await B.waitForTimeout(90); await B.mouse.up(); await B.waitForTimeout(300)
    if (i === 6) { await B.keyboard.up('KeyD'); await B.keyboard.down('KeyA') }
  }
  await B.keyboard.up('KeyA')
})
console.log('\nerrores:', errores.length, errores.slice(0, 2))
await na.close(); await nb.close()
