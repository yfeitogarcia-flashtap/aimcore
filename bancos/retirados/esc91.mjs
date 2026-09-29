// Banco: ESC reanuda también saliendo de la tienda del duelo (item 7).
// Mide la secuencia entera contra el producto: capturar, abrir la tienda con
// su tecla, cerrarla con ESC y volver a jugar con otro ESC.
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
await p.goto('http://localhost:5199/duelo/', { waitUntil: 'networkidle' })
await p.waitForTimeout(2500)

const capturado = () => p.evaluate(() => !!document.pointerLockElement)
const tiendaAbierta = () => p.evaluate(() => !document.getElementById('tienda').hidden)
const menuVisible = () => p.evaluate(() => !document.getElementById('aviso').hidden)
const conEco = () => p.evaluate(() => Boolean(window.vektorNet?.cliente?.conEconomia))

// **La premisa primero** (vuelta 46): sin economía no hay tienda que abrir y
// todo lo de abajo mediría otra cosa.
afirmar('la sala tiene economía', await conEco())

// Un clic en una esquina: el centro es un `.control` y ahí no captura (vuelta 61).
await p.mouse.click(40, 690)
await p.waitForTimeout(1200)
afirmar('empieza capturado', await capturado())

// La tecla de armería, la de verdad.
await p.keyboard.press('KeyB')
await p.waitForTimeout(900)
afirmar('la B abre la tienda', await tiendaAbierta())
afirmar('y suelta el ratón', !(await capturado()))

// Pasada la espera de Chrome, ESC cierra la tienda.
await p.waitForTimeout(1600)
await p.keyboard.press('Escape')
await p.waitForTimeout(700)
afirmar('ESC cierra la tienda', !(await tiendaAbierta()))
afirmar('y deja el menú delante', await menuVisible())
afirmar('y ese mismo ESC no reanuda', !(await capturado()))

// Y el siguiente ESC devuelve a la partida.
await p.waitForTimeout(1600)
await p.keyboard.press('Escape')
await p.waitForTimeout(900)
afirmar('el siguiente ESC reanuda', await capturado())
afirmar('y el menú se quita', !(await menuVisible()))

afirmar('ni un error de página', errores.length === 0, errores.slice(0, 2).join(' | '))
await nav.close()
console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
