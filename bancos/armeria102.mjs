// armeria102 — pinchar dentro de la armería no la cierra: pestañas de categoría
// y «Equipar», en el entrenamiento y en el multijugador (todos contra todos,
// donde la armería equipa, y la ficha del duelo). Con ratón de verdad.
import { chromium } from 'playwright-core'
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
let fallos = 0; const ok = (c, t) => { console.log((c ? '  ok  ' : '  FALLO ') + t); if (!c) fallos++ }
const err = []
async function probar(p, et) {
  const abierta = () => p.locator('.panel--armoury').count()
  ok(await abierta() > 0, `${et}: la armería está abierta`)
  const tabs = p.locator('.armoury__ranura')
  const n = await tabs.count()
  for (let i = n - 1; i >= 0; i--) { await tabs.nth(i).click(); await p.waitForTimeout(250) }
  ok(await abierta() > 0, `${et}: tras pinchar las ${n} pestañas sigue abierta`)
  const equipar = p.getByRole('button', { name: /^Equipar$/ })
  if (await equipar.count()) {
    await equipar.first().click(); await p.waitForTimeout(400)
    ok(await abierta() > 0, `${et}: tras pinchar «Equipar» sigue abierta`)
  }
  const ficha = p.locator('.armoury__card, .armoury__ficha').first()
  if (await ficha.count()) { await ficha.click({ position: { x: 20, y: 20 } }); await p.waitForTimeout(400); ok(await abierta() > 0, `${et}: pinchar una ficha no la cierra`) }
  ok(!(await p.evaluate(() => !!document.pointerLockElement)), `${et}: y no ha capturado el ratón`)
}
// Entrenamiento
{
  const p = await nav.newPage({ viewport: { width: 1366, height: 820 } }); p.on('pageerror', (e) => err.push(String(e)))
  await p.goto('http://localhost:5192/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
  await p.mouse.click(40, 800); await p.waitForTimeout(800)
  await p.keyboard.press('KeyB'); await p.waitForTimeout(600)
  await probar(p, 'entrenamiento')
  await p.close()
}
// Multijugador: todos contra todos (equipa) — huésped con VEKTOR_LOBBY=0.
{
  const p = await nav.newPage({ viewport: { width: 1366, height: 820 } }); p.on('pageerror', (e) => err.push(String(e)))
  await p.goto('http://localhost:5192/duelo/?modo=todos', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500)
  await p.mouse.click(30, 30); await p.waitForTimeout(600)
  await p.keyboard.press('KeyB'); await p.waitForTimeout(800)
  await probar(p, 'todos contra todos')
  await p.close()
}
ok(err.length === 0, `sin errores de página ${err.slice(0, 1)}`)
await nav.close(); console.log(fallos ? `${fallos} FALLOS` : 'TODO OK'); process.exit(fallos ? 1 : 0)
