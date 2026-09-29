// Banco: bajo el logo no hay ningún rótulo destacado.
import { chromium } from 'playwright-core'
let fallos = 0
const afirmar = (n, c, d = '') => { console.log((c ? '  ok  ' : '  FALLO ') + n + (d ? ` — ${d}` : '')); if (!c) fallos += 1 }
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const errores = []
const p = await nav.newPage({ viewport: { width: 1280, height: 800 } })
p.on('pageerror', (e) => errores.push(String(e)))
await p.goto('http://localhost:5192/', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)

const texto = (await p.locator('.panel').first().innerText())
console.log('  panel de inicio:\n' + texto.split('\n').map((l) => '    | ' + l).join('\n'))
afirmar('no hay eyebrow bajo el logo', (await p.locator('.panel__eyebrow').count()) === 0)
afirmar('no aparece «explosivo» en el menú', !/explosivo/i.test(texto), texto.match(/.*explosivo.*/i)?.[0] ?? '')
afirmar('sí están las instrucciones de clic', /capturar el rat/i.test(texto))
afirmar('y los controles', /WASD/.test(texto))
// Y el escenario con cobertura sigue teniendo su botón con nombre y duración.
afirmar('el segundo botón conserva su nombre', /Deathmatch|Práctica libre/i.test(texto), texto.split('\n').slice(-3).join(' · '))
afirmar('ni un error de página', errores.length === 0, errores.slice(0, 2).join(' | '))
await p.screenshot({ path: '/tmp/menu-89.png' })
await nav.close()
console.log(fallos === 0 ? '\nTODO VERDE' : `\n${fallos} FALLOS`)
process.exit(fallos === 0 ? 0 : 1)
