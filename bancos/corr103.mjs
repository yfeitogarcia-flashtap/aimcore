// corr103 — ¿de dónde salen las correcciones propias con la red a tirones?
import { chromium } from 'playwright-core'
const lanzar = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const BASE = 'http://localhost:5192'
const na = await lanzar()
const A = await na.newPage({ viewport: { width: 640, height: 400 } })
await A.goto(`${BASE}/duelo/`, { waitUntil: 'networkidle' }); await A.waitForTimeout(2500)
await A.mouse.click(30, 30); await A.waitForTimeout(400)
await A.evaluate(() => {
  const c = window.vektorNet.cliente
  window.__log = []
  window.__pred = new Map()
  const ap = c._aplicar.bind(c)
  let enReplay = false
  c._aplicar = (e) => { ap(e); if (!enReplay) window.__pred.set(e.n, [c.camara.position.x, c.camara.position.z]) }
  const r0 = c._reconciliar.bind(c)
  const r = (foto) => {
    const mio = foto.p?.[c.id]
    if (mio) {
      const pr = window.__pred.get(mio.ack)
      if (pr) { const d = Math.hypot(pr[0] - mio.s.x, pr[1] - mio.s.z); if (d > 0.01) window.__log.push({ ack: mio.ack, predVsServ: +d.toFixed(3), pend: c.pendientes.length }) }
    }
    enReplay = true
    try { return r0(foto) } finally { enReplay = false }
  }
  c._reconciliar = (...a) => {
    const antes = c.medidas.correcciones
    const hambre0 = c.medidas.hambre
    const res = r(...a)
    if (c.medidas.correcciones !== antes) window.__log.push({ err: +c.medidas.errorUltimo.toFixed(3), pend: c.pendientes.length, rtt: Math.round(c.medidas.rtt), hambre: c.medidas.hambre, dh: c.medidas.hambre - hambre0 })
    return res
  }
  const e = window.vektorNet.enlace; e.latenciaMs = 20; e.jitterMs = 80; e.enOrden = true
})
await A.evaluate(() => window.vektorNet.cliente.transporte.send(JSON.stringify({ t: 'c', x: -10, z: -16 })))
await A.waitForTimeout(1000)
await A.evaluate(() => window.vektorNet.motor.controls.lookAt(-Math.PI / 2))
await A.keyboard.down('KeyW'); await A.waitForTimeout(3000); await A.keyboard.up('KeyW')
await A.waitForTimeout(500)
const log = await A.evaluate(() => window.__log)
console.log('correcciones:', log.length)
console.log(log.slice(0, 15).map((l) => JSON.stringify(l)).join('\n'))
await na.close()
