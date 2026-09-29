import { chromium } from 'playwright-core'
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const A = await nav.newPage({ viewport: { width: 1280, height: 720 } })
await A.goto('http://localhost:5199/duelo/', { waitUntil: 'networkidle' })
await A.waitForTimeout(2000)
const codigo = (await A.locator('#codigo').innerText()).trim()
const nav2 = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const B = await nav2.newPage({ viewport: { width: 1280, height: 720 } })
await B.goto(`http://localhost:5199/duelo/${codigo}`, { waitUntil: 'networkidle' })
await B.waitForTimeout(2500)
await A.mouse.click(40, 700)
await A.waitForTimeout(800)
await A.keyboard.press('KeyG')
await A.waitForTimeout(600)
await A.screenshot({ path: '/tmp/hud88.png' })
// La esquina del dinero, ampliada.
await A.screenshot({ path: '/tmp/dinero88.png', clip: { x: 1060, y: 0, width: 220, height: 140 } })
await nav.close(); await nav2.close()
