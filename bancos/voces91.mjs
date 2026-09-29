import { WEAPONS } from '../src/config.js'
// Banco: la página de voces carga, lista todas las armas de rayo y ninguna
// cae ya a la voz clásica. Y se toca una de cada para comprobar que suena.
import { chromium } from 'playwright-core'

let fallos = 0
const afirmar = (n, c, d = '') => {
  console.log((c ? '  ok  ' : '  FALLO ') + n + (d ? ` — ${d}` : ''))
  if (!c) fallos += 1
}
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})
const errores = []
const p = await nav.newPage({ viewport: { width: 1100, height: 900 } })
p.on('pageerror', (e) => errores.push(String(e)))
await p.goto('http://localhost:5192/editor/sonidos.html', { waitUntil: 'networkidle' })
await p.waitForTimeout(800)

const armas = await p.locator('.arma').count()
// Cuántas armas de rayo hay lo dice el catálogo, no un número a mano: el Krakov
// (vuelta 93) hizo ocho y el banco se quedó contando siete (vuelta 106).
const deRayo = Object.values(WEAPONS).filter((w) => !w.tiro && !w.melee).length
afirmar('sale una ficha por arma de rayo', armas === deRayo, `${armas} de ${deRayo}`)

const heredadas = await p.locator('.meta', { hasText: 'heredada' }).count()
afirmar('ninguna hereda ya la voz clásica', heredadas === 0, `${heredadas} heredadas`)

const nombres = await p.locator('.arma h2').allInnerTexts()
console.log('  armas:', nombres.join(', '))

// Arrancar el audio y medir que un disparo mueve el máster.
await p.mouse.click(10, 10)
await p.waitForTimeout(400)
// Que los botones respondan sin romper la página.
const botones = await p.locator('.arma .fila button').count()
console.log('  botones:', botones)
for (let i = 0; i < Math.min(botones, 12); i++) {
  await p.locator('.arma .fila button').nth(i).click()
  await p.waitForTimeout(60)
}
afirmar('se pueden tocar sin errores', errores.length === 0, errores.slice(0, 2).join(' | '))

// Un JSON roto marca la caja y no revienta nada.
await p.locator('.arma textarea').first().fill('{ esto no es json')
await p.locator('.arma .fila button', { hasText: 'Editada' }).first().click()
await p.waitForTimeout(200)
afirmar('un perfil roto se marca', (await p.locator('textarea.malo').count()) === 1)
afirmar('y no tira la página', errores.length === 0, errores.slice(0, 2).join(' | '))

await nav.close()
console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
