// flujo92: el recorrido entero, con ratón y teclado de verdad, contando los
// errores de página (vuelta 60: un error de página es un fallo, no un registro).
import { chromium } from 'playwright-core'
const errores = []
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
page.on('pageerror', (e) => errores.push('pageerror: ' + e))
page.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()) })
await page.goto('http://127.0.0.1:5192/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const visible = (sel) => page.evaluate((s) => Boolean(document.querySelector(s)), sel)
let fallos = 0
const paso = async (etiqueta, ok) => { if (!ok) fallos += 1; console.log(`  ${ok ? 'OK ' : 'FALLO'} ${etiqueta}`) }

console.log('== el recorrido ==')
await paso('paso 1: sólo un botón', (await page.$$('.panel button')).length === 1)
await page.click('.panel button'); await page.waitForTimeout(300)
await paso('paso 2 (cabina, vuelta 99): dos puertas y el raíl de cinco', (await page.$$('.portada__modo')).length === 2 && (await page.$$('.cab-rail__item')).length === 5)

// Armería desde el menú, y vuelta
await page.evaluate(() => [...document.querySelectorAll('.portada button, .panel button, .cab-rail__item')].find((b) => b.textContent.trim() === 'Armería').click())
await page.waitForTimeout(400)
await paso('armería abre por arriba (se ve el raíl)', await page.evaluate(() => {
  const r = document.querySelector('.armoury__ranuras')
  return r && r.getBoundingClientRect().top >= 0
}))
await page.keyboard.press('Escape'); await page.waitForTimeout(300)
await paso('Escape cierra la armería', !(await visible('.panel--armoury')))

// Opciones, y vuelta
await page.evaluate(() => [...document.querySelectorAll('.portada button, .panel button, .cab-rail__item')].find((b) => b.textContent.trim() === 'Opciones').click())
await page.waitForTimeout(400)
await paso('opciones sin los ajustes de partida', await page.evaluate(() => {
  const l = [...document.querySelectorAll('.panel--options .field__label')].map((x) => x.textContent.trim())
  return !l.includes('Escenario') && !l.includes('Tipo de diana') && l.includes('Sensibilidad')
}))
await page.keyboard.press('Escape'); await page.waitForTimeout(300)

// A jugar, y la pausa
await page.evaluate(() => [...document.querySelectorAll('.portada button, .panel button, .cab-rail__item')].find((b) => b.textContent.includes('Entrenamiento')).click())
await page.waitForTimeout(400)
await page.evaluate(() => document.querySelector('.training__jugar').click())
await page.waitForTimeout(1200)
await paso('jugando (hay HUD y mira)', (await visible('.hud')) && (await visible('.crosshair')))

await page.evaluate(() => document.exitPointerLock())
await page.waitForTimeout(600)
await paso('pausa', await page.evaluate(() => Boolean([...document.querySelectorAll('.panel__title')].find((t) => t.textContent.includes('Pausa')))))

// Armería en pausa, y el ESC que vuelve a la partida (vuelta 101: ESC es un
// «atrás» forzado y acaba siempre jugando; la 89 lo dejaba en la pausa).
await page.keyboard.press('KeyB'); await page.waitForTimeout(400)
await paso('B abre la armería en pausa', await visible('.panel--armoury'))
await page.keyboard.press('Escape')
// La vuelta se pide en cuanto el navegador deja (RESUME_KEY_DELAY_MS, 1300 ms).
let jugando = false
for (let i = 0; i < 30 && !jugando; i++) {
  await page.waitForTimeout(100)
  jugando = await page.evaluate(() => !!document.pointerLockElement)
}
await paso('Escape la cierra y vuelve a la partida (vuelta 101)', !(await visible('.panel--armoury')) && jugando &&
  !(await page.evaluate(() => Boolean([...document.querySelectorAll('.panel__title')].find((t) => t.textContent.includes('Pausa'))))))

console.log('\nerrores de página:', errores.length)
for (const e of errores.slice(0, 10)) console.log('  ', e)
await browser.close()
console.log(fallos ? `${fallos} FALLOS` : 'TODO VERDE')
process.exit(errores.length === 0 && fallos === 0 ? 0 : 1)
