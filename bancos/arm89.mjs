// Captura de la armería: ¿se solapan las filas de estadística?
import { chromium } from 'playwright-core'
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } })
await p.goto('http://localhost:5192/', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
// Desde la 92 la armería no está en la pantalla del logo, y desde la 99 se abre
// por el raíl de la cabina.
await p.click('text=Jugar ahora')
await p.click('.cab-rail__item:has-text("Armería")')
await p.waitForTimeout(800)

// Medir: por cada ficha, las cajas de sus filas de estadística y si se pisan.
const filas = await p.evaluate(() => {
  const fichas = [...document.querySelectorAll('.armoury__card')]
  return fichas.map((c) => {
    const nombre = c.querySelector('.armoury__name')?.textContent ?? '?'
    const stats = [...c.querySelectorAll('.armoury__stat')].map((s) => {
      const r = s.getBoundingClientRect()
      return { etiqueta: s.querySelector('.armoury__stat-label')?.textContent ?? '?', top: Math.round(r.top), bottom: Math.round(r.bottom) }
    })
    let solapes = 0
    for (let i = 1; i < stats.length; i++) if (stats[i].top < stats[i - 1].bottom - 1) solapes += 1
    return { nombre, n: stats.length, solapes, ultimas: stats.slice(-3) }
  })
})
for (const f of filas) {
  console.log(`${f.nombre.padEnd(7)} ${String(f.n).padStart(2)} filas · solapes: ${f.solapes}`,
    f.solapes ? '  ' + f.ultimas.map((u) => `${u.etiqueta}@${u.top}`).join(' | ') : '')
}
await p.screenshot({ path: '/tmp/arm-antes.png' })
await nav.close()
