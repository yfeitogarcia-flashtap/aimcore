// pump102red — en el multijugador, un disparo de Pump deja una marca por
// perdigón (y ninguna el de un rifle más de una). Huésped VEKTOR_RONDAS=0.
import { chromium } from 'playwright-core'
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const A = await nav.newPage({ viewport: { width: 800, height: 500 } })
const errores = []; A.on('pageerror', (e) => errores.push(String(e)))
let fallos = 0; const ok = (c, t) => { console.log((c ? '  ok  ' : '  FALLO ') + t); if (!c) fallos++ }
await A.goto('http://localhost:5192/duelo/', { waitUntil: 'networkidle' }); await A.waitForTimeout(2500)
await A.mouse.click(30, 30); await A.waitForTimeout(500)
const disparo = async (arma) => {
  await A.evaluate((arma) => {
    const m = window.vektorNet.motor
    m.slots.primary = arma; m.slot = 'primary'; m.weaponKey = arma; m._cancelReload?.(); m._refillMagazine?.()
    window.vektorNet.cliente.arma = arma
    window.__marcas = 0
    const f = m.impacts.spawn.bind(m.impacts)
    if (!m.impacts.__envuelto) { m.impacts.__envuelto = true; m.impacts.spawn = (...a) => { window.__marcas++; return f(...a) } }
    m.controls.lookAt(0); m.camera.rotation.x = -0.15
  }, arma)
  await A.waitForTimeout(700)
  await A.mouse.down(); await A.waitForTimeout(60); await A.mouse.up()
  await A.waitForTimeout(600)
  return A.evaluate(() => ({ marcas: window.__marcas, arma: window.vektorNet.motor.weaponKey }))
}
const p = await disparo('pump')
ok(p.arma === 'pump' && p.marcas >= 6, `Pump: ${p.marcas} marcas de un disparo (8 perdigones)`)
await A.waitForTimeout(1200)
const r = await disparo('rift')
ok(r.arma === 'rift' && r.marcas === 1, `Rift: ${r.marcas} marca`)
ok(errores.length === 0, `sin errores de página ${errores.slice(0, 1)}`)
await nav.close()
console.log(fallos ? `${fallos} FALLOS` : 'TODO OK'); process.exit(fallos ? 1 : 0)
