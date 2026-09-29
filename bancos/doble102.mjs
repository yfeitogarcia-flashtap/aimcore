// doble102 — un clic con la Pulse es un disparo: cuántas veces pasa cada cosa.
import { chromium } from 'playwright-core'
const lanzar = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
const BASE = process.env.BASE || 'http://localhost:5199'
const [na, nb] = await Promise.all([lanzar(), lanzar()])
const A = await na.newPage({ viewport: { width: 1280, height: 800 } })
const B = await nb.newPage({ viewport: { width: 1280, height: 800 } })
const err = []; for (const p of [A, B]) p.on('pageerror', (e) => err.push(String(e)))
const sonda = () => {
  const P = window.__p = { osc: 0, buf: 0 }
  const C = (window.AudioContext || window.webkitAudioContext).prototype
  const o = C.createOscillator, b = C.createBufferSource
  C.createOscillator = function (...a) { P.osc++; return o.apply(this, a) }
  C.createBufferSource = function (...a) { P.buf++; return b.apply(this, a) }
}
await A.addInitScript(sonda); await B.addInitScript(sonda)
await A.goto(`${BASE}/duelo/?compra=0`, { waitUntil: 'networkidle' }); await A.waitForTimeout(2500)
const enlace = await A.evaluate(() => document.querySelector('#enlace')?.value || document.querySelector('#enlaceMenu')?.value || location.href)
console.log('enlace', enlace)
await B.goto(enlace.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle' }); await B.waitForTimeout(2500)
if (process.env.LOBBY) {
  await A.getByRole('radio', { name: /sin fase|^0/i }).first().click().catch(() => console.log('sin botón de compra 0'))
  await A.waitForTimeout(400)
  for (const p of [A, B]) { await p.click('#listo'); await p.waitForTimeout(300) }
  await A.click('#lanzar'); await A.waitForTimeout(3000)
}
for (const p of [A, B]) { await p.mouse.click(30, 30); await p.waitForTimeout(600) }
const envolver = (p) => p.evaluate(() => {
  const m = window.vektorNet.motor
  const P = window.__p
  for (const n of ['_shoot', '_tryShoot', '_impactoDeRed', '_tiroDeRival', '_onVerdict', '_destellarRival']) {
    P[n] = 0
    const f = m[n].bind(m); m[n] = (...a) => { P[n]++; return f(...a) }
  }
  P.flash = 0; const ff = m.muzzleFlash.flash.bind(m.muzzleFlash); m.muzzleFlash.flash = (...a) => { P.flash++; return ff(...a) }
  const c = window.vektorNet.cliente
  P.envios = 0; const s = c.transporte.send.bind(c.transporte)
  c.transporte.send = (t) => { if (t.includes('"d":')) P.envios++; return s(t) }
})
await envolver(A); await envolver(B)
const leer = (p) => p.evaluate(() => ({ ...window.__p, ammo: window.vektorNet.motor.ammo, arma: window.vektorNet.motor.weaponKey }))
const a0 = await leer(A), b0 = await leer(B)
console.log('antes A', a0, '\nantes B', b0)
// Un clic, mirando al suelo delante.
await A.evaluate(() => { window.vektorNet.motor.camera.rotation.x = -0.4 })
await A.mouse.down(); await A.waitForTimeout(60); await A.mouse.up()
await A.waitForTimeout(1500)
const a1 = await leer(A), b1 = await leer(B)
const dif = (x, y) => Object.fromEntries(Object.keys(y).filter((k) => typeof y[k] === 'number').map((k) => [k, y[k] - (x[k] ?? 0)]))
console.log('A tras 1 clic', dif(a0, a1), a1.arma)
console.log('B tras 1 clic de A', dif(b0, b1))
console.log('errores', err.length, err.slice(0, 2))
await na.close(); await nb.close()
