// lag103b — cerca y quieto, quitando piezas del dibujo una a una para ver
// cuál se come los frames.
import { chromium } from 'playwright-core'
const lanzar = () => chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const BASE = 'http://localhost:5199'
const [na, nb] = await Promise.all([lanzar(), lanzar()])
const A = await na.newPage({ viewport: { width: 960, height: 600 } })
const B = await nb.newPage({ viewport: { width: 960, height: 600 } })
await A.goto(`${BASE}/duelo/`, { waitUntil: 'networkidle' }); await A.waitForTimeout(2500)
const enlace = await A.evaluate(() => document.querySelector('#enlace').value)
await B.goto(enlace, { waitUntil: 'networkidle' }); await B.waitForTimeout(2500)
for (const p of [A, B]) { await p.mouse.click(30, 30); await p.waitForTimeout(400) }
const colocar = (p, x, z, yaw) => p.evaluate(({ x, z, yaw }) => {
  window.vektorNet.cliente.transporte.send(JSON.stringify({ t: 'c', x, z }))
  window.vektorNet.motor.controls.lookAt(yaw)
}, { x, z, yaw })
const fps = async (et) => {
  const r = await A.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now(); let max = 0; let ult = t0
    const f = (t) => { n++; max = Math.max(max, t - ult); ult = t; if (t - t0 < 4000) requestAnimationFrame(f); else res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), max: +max.toFixed(0), info: { ...window.vektorNet.motor.renderer.info.render } }) }
    requestAnimationFrame(f)
  }))
  console.log(et.padEnd(34), JSON.stringify(r))
}
await colocar(A, 0, 4, 0); await colocar(B, 0, -2, Math.PI); await A.waitForTimeout(2000)
await fps('A fija, B delante a 6 u')
await colocar(B, 15, -15, Math.PI); await A.waitForTimeout(2000)
await fps('A fija, B lejos (fuera)')
await colocar(B, 0, -2, Math.PI); await A.waitForTimeout(2000)
await fps('A fija, B delante otra vez')
await A.evaluate(() => { const m = window.vektorNet.motor; for (const v of m._rivales) { v.avatar.group.scale.set(0.0001,0.0001,0.0001) } })
await fps('B delante, cuerpo a escala 0')
await A.evaluate(() => { const m = window.vektorNet.motor; m.markers.group && (m.markers.group.visible = false); for (const k of Object.keys(m)) if (/marker/i.test(k)) console.log(k) })
await fps('B delante, + marcadores ocultos')
await na.close(); await nb.close()
