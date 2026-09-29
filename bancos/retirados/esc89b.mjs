// Banco: ESC reanuda. Se sale de la captura como se sale de verdad
// (`exitPointerLock`, vuelta 48: una tecla sintética no la suelta) y se
// comprueba que un ESC posterior devuelve el ratón, y que el ESC que llega
// demasiado pronto NO lo hace.
import { chromium } from 'playwright-core'

let fallos = 0
const afirmar = (n, c, d = '') => {
  console.log((c ? '  ok  ' : '  FALLO ') + n + (d ? ` — ${d}` : ''))
  if (!c) fallos += 1
}
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const errores = []
const p = await nav.newPage({ viewport: { width: 1280, height: 720 } })
p.on('pageerror', (e) => errores.push(String(e)))
await p.goto('http://localhost:5192/', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)

const capturado = () => p.evaluate(() => !!document.pointerLockElement)
const panel = () => p.evaluate(() => document.querySelector('.panel__title')?.textContent ?? '(ninguno)')

await p.mouse.click(40, 690)
await p.waitForTimeout(1200)
afirmar('empieza capturado', await capturado())

// Salir como sale un jugador.
await p.evaluate(() => document.exitPointerLock())
await p.waitForTimeout(600)
afirmar('en pausa tras soltar', (await panel()).includes('Pausa'), await panel())

// **Demasiado pronto**: el ESC que pausa no puede reanudar.
await p.keyboard.press('Escape')
await p.waitForTimeout(300)
afirmar('un ESC dentro de la espera NO reanuda', !(await capturado()))

// Y pasada la espera, sí.
await p.waitForTimeout(1500)
await p.keyboard.press('Escape')
await p.waitForTimeout(900)
afirmar('pasada la espera, ESC reanuda', await capturado())

// Con el panel de opciones abierto, ESC lo cierra y NO reanuda.
await p.evaluate(() => document.exitPointerLock())
await p.waitForTimeout(2200)
await p.getByRole('button', { name: /Opciones/i }).first().click()
await p.waitForTimeout(500)
afirmar('opciones abiertas', (await p.locator('.panel--options').count()) === 1)
await p.keyboard.press('Escape')
await p.waitForTimeout(500)
afirmar('ESC cierra opciones', (await p.locator('.panel--options').count()) === 0)
afirmar('y ese mismo ESC no reanuda', !(await capturado()))
await p.waitForTimeout(1500)
await p.keyboard.press('Escape')
await p.waitForTimeout(900)
afirmar('el siguiente ESC sí reanuda', await capturado())

afirmar('ni un error de página', errores.length === 0, errores.slice(0, 2).join(' | '))
await nav.close()
console.log(fallos === 0 ? '\nTODO VERDE' : `\n${fallos} FALLOS`)
process.exit(fallos === 0 ? 0 : 1)
