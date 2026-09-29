/** duelo87 — la tienda del 1v1: las tres granadas dejan de estar precintadas. */
import { chromium } from 'playwright-core'
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const fallos = []
const af = (c, t, e = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${t}${e ? ` — ${e}` : ''}`); if (!c) fallos.push(t) }
const p = await nav.newPage({ viewport: { width: 1100, height: 700 } })
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()) })
await p.goto('http://localhost:5192/duelo/', { waitUntil: 'networkidle' })
await p.waitForTimeout(3000)
console.log('== duelo87 ==\n')
// La tienda se abre con la tecla de armería, ya dentro de la partida.
await p.mouse.click(60, 660)
await p.waitForTimeout(1200)
await p.keyboard.press('KeyB')
await p.waitForTimeout(1200)
const txt = await p.evaluate(() => document.body.innerText)
af(/Core/.test(txt) && /Blind/.test(txt) && /KO/.test(txt), 'las tres salen en la tienda',
  txt.split('\n').filter((l) => /Core|Blind|KO|Próxima/.test(l)).slice(0, 8).join(' | '))
const precintadas = await p.evaluate(() =>
  [...document.querySelectorAll('.art')].filter((a) => a.classList.contains('proximamente'))
    .map((a) => a.innerText.split('\n')[0]))
af(!precintadas.some((n) => /Core|Blind|KO/i.test(n)), 'y ninguna lleva precinto',
  `precintadas: ${precintadas.join(', ') || 'ninguna'}`)
console.log(`\nerrores de página: ${errores.length}`)
if (errores.length) console.log('    ' + errores.slice(0, 5).join('\n    '))
af(errores.length === 0, 'sin errores de página')
await nav.close()
console.log(`\n${fallos.length === 0 ? 'TODO OK' : `${fallos.length} FALLOS`}`)
process.exit(fallos.length ? 1 : 0)
