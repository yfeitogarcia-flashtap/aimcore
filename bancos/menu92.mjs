// menu92: lo que hacía `menu62` — que TODOS los botones del menú del duelo se
// puedan pulsar de verdad a cuatro tamaños de ventana. No se pregunta por una
// caja: se le pregunta al navegador con `elementFromPoint` si el clic llega
// (vuelta 61: un vano no es un área).
import { chromium } from 'playwright-core'
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
let fallos = 0
for (const vp of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1024, height: 600 }, { width: 700, height: 460 }]) {
  const page = await browser.newPage({ viewport: vp })
  await page.goto('http://127.0.0.1:5192/duelo/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const r = await page.evaluate(() => {
    const aviso = document.querySelector('#aviso')
    const out = []
    for (const b of aviso.querySelectorAll('button, select')) {
      if (b.hidden || b.offsetParent === null) continue
      const rect = b.getBoundingClientRect()
      const cx = Math.round(rect.x + rect.width / 2)
      const cy = Math.round(rect.y + rect.height / 2)
      const hit = document.elementFromPoint(cx, cy)
      out.push({
        id: b.id || b.textContent.trim().slice(0, 14),
        llega: Boolean(hit && (hit === b || b.contains(hit))),
        dentro: cy > 0 && cy < window.innerHeight && cx > 0 && cx < window.innerWidth,
      })
    }
    return { alto: Math.round(aviso.querySelector('div').getBoundingClientRect().height), botones: out }
  })
  const malos = r.botones.filter((b) => !b.llega || !b.dentro)
  fallos += malos.length
  console.log(`${vp.width}x${vp.height}: menú ${r.alto} px · ${r.botones.length} controles · ${malos.length} inalcanzables`,
    malos.length ? JSON.stringify(malos) : '')
  await page.close()
}
console.log(fallos === 0 ? '\nOK: todos los controles del menú se pueden pulsar' : `\nFALLO: ${fallos} controles inalcanzables`)
await browser.close()
process.exit(fallos === 0 ? 0 : 1)
