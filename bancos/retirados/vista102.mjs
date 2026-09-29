// vista102 — maqueta del arma en pantalla: capturas con varias armas, y cuánto
// cuesta la segunda pasada (frames con y sin).
import { chromium } from 'playwright-core'
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const p = await nav.newPage({ viewport: { width: 1280, height: 720 } })
const err = []; p.on('pageerror', (e) => err.push(String(e)))
await p.addInitScript(() => localStorage.setItem('aimcore.settings.v1', JSON.stringify({ armaEnPantalla: true, scenario: 'largoYPuerta', trainingMode: 'deathmatch' })))
await p.goto('http://localhost:5192/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
await p.mouse.click(40, 700); await p.waitForTimeout(1500)
const poner = (arma, ranura = 'primary') => p.evaluate(({ arma, ranura }) => {
  const m = window.aimcore
  m.slots[ranura] = arma; m.slot = ranura; m.weaponKey = arma; m._refillMagazine?.(); m._emitWeapon?.()
  m.armaEnMano?.poner(arma, false)
  m.controls.lookAt(0.3); m.camera.rotation.x = -0.05
}, { arma, ranura })
console.log('hay arma en mano:', await p.evaluate(() => Boolean(window.aimcore.armaEnMano)))
for (const [arma, ranura] of [['rift', 'primary'], ['pulse', 'secondary'], ['scout', 'primary'], ['vanta', 'melee']]) {
  await poner(arma, ranura); await p.waitForTimeout(500)
  await p.screenshot({ path: `scratchpad/vista102-${arma}.png` })
}
// Disparo: el retroceso.
await poner('rift'); await p.waitForTimeout(400)
await p.mouse.down(); await p.waitForTimeout(90); await p.screenshot({ path: 'scratchpad/vista102-disparo.png' }); await p.mouse.up()
console.log('errores:', err.length, err.slice(0, 2))
await nav.close()
