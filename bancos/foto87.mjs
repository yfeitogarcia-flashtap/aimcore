/** Una mirada de verdad (vuelta 48): ¿se ve la granada en el suelo? */
import { chromium } from 'playwright-core'
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const p = await nav.newPage({ viewport: { width: 1000, height: 640 } })
p.on('pageerror', (e) => console.log('ERR', String(e)))
await p.addInitScript(() => {
  localStorage.setItem('aimcore.settings.v1', JSON.stringify({
    weapon: 'rift', throwable: 'core', scenario: 'empty', targetType: 'hitbox',
    simultaneousTargets: 1, sessionDuration: 'endless',
  }))
})
await p.goto('http://localhost:5192/', { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)
await p.locator('button', { hasText: /JUGAR|Jugar/ }).first().click()
await p.waitForTimeout(800)
await p.mouse.click(60, 560)
await p.waitForTimeout(600)
await p.keyboard.press('KeyG')
await p.waitForTimeout(400)
// Mirar un poco hacia abajo: el suelo de delante es donde va a caer.
for (let i = 0; i < 10; i++) { await p.mouse.move(500, 320 + i * 12); await p.waitForTimeout(40) }
await p.waitForTimeout(400)
await p.mouse.down()
await p.waitForTimeout(500)
await p.mouse.up()
const { default: Jimp } = await import('jimp')
let mejor = { n: 0, i: -1 }
for (let i = 0; i < 26; i++) {
  await p.waitForTimeout(250)
  const buf = await p.screenshot({ type: 'png' })
  const img = await Jimp.read(buf)
  let n = 0
  img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
    // Sólo el mundo: fuera el HUD de arriba y las dos esquinas de abajo.
    if (y < 150 || y > 540 || (x > 820 && y > 440)) return
    const r = this.bitmap.data[idx], g = this.bitmap.data[idx + 1], b = this.bitmap.data[idx + 2]
    if (r > 120 && r - g > 50 && r - b > 50) n += 1
  })
  if (n > mejor.n) { mejor = { n, i }; await p.screenshot({ path: 'scratchpad/gran87-suelo.png' }) }
  process.stdout.write(`${n} `)
}
console.log(`\npico ${mejor.n} px rojos en la captura ${mejor.i}`)
await nav.close()
