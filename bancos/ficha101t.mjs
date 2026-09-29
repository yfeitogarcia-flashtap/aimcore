// ficha101 — ¿sale la ficha del rival al apuntarle? (auditoría del punto 7)
import { chromium } from 'playwright-core'
const lanzar = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const [na, nb] = await Promise.all([lanzar(), lanzar()])
const A = await na.newPage({ viewport: { width: 1000, height: 640 } })
const B = await nb.newPage({ viewport: { width: 1000, height: 640 } })
for (const p of [A, B]) p.on('pageerror', (e) => console.log('ERR', String(e).slice(0, 200)))
await A.goto('http://localhost:5192/duelo/?modo=todos', { waitUntil: 'networkidle' })
await A.waitForTimeout(2500)
const codigo = await A.evaluate(() => document.getElementById('codigo')?.textContent?.trim())
await B.goto(`http://localhost:5192/duelo/${codigo}?modo=todos`, { waitUntil: 'networkidle' })
await B.waitForTimeout(2500)
for (const p of [A, B]) { await p.mouse.click(30, 600); await p.waitForTimeout(400) }
const colocar = (p, x, z) => p.evaluate(([x, z]) => window.vektorNet.cliente.transporte.send(JSON.stringify({ t: 'c', x, z })), [x, z])
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
await colocar(A, sitio.x, sitio.z); await colocar(B, sitio.x, sitio.z - 6)
await A.waitForTimeout(1500)
await A.evaluate(() => { window.vektorNet.motor.controls.lookAt(0); window.vektorNet.motor.camera.rotation.x = -0.02 })
await A.waitForTimeout(1500)
const r = await A.evaluate(() => {
  const m = window.vektorNet.motor.markers
  const s = m.slots[0]
  const el = s.dom.root
  const bb = el.getBoundingClientRect()
  const css = window.vektorNet.motor.cssRenderer.domElement
  const cb = css.getBoundingClientRect()
  return { slots: m.slots.length, enabled: m.enabled, plateVisible: s.plate.visible, dwell: s.dwellMs, sight: s.sightClear, needle: s.needle.visible,
    bb: [bb.x, bb.y, bb.width, bb.height].map(Math.round), display: getComputedStyle(el).display, css: [cb.x, cb.y, cb.width, cb.height].map(Math.round), cssZ: getComputedStyle(css).zIndex, cssPos: getComputedStyle(css).position,
    inst: window.vektorNet.motor._rivalInstancias?.[0] && { state: window.vektorNet.motor._rivalInstancias[0].state, nick: window.vektorNet.motor._rivalInstancias[0].nick } }
})
console.log(JSON.stringify(r))
await A.screenshot({ path: 'scratchpad/ficha101-todos.png' })
await na.close(); await nb.close()
