/**
 * cabina99 — capturas del sistema Cabina en el juego (vuelta 99).
 * Recorre marca → portada → entrenamiento → armería → opciones con clics de
 * verdad por el raíl, y cuenta errores de página.
 */
import { chromium } from 'playwright-core'
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const ANCHO = Number(process.env.ANCHO ?? 1600), ALTO = Number(process.env.ALTO ?? 900)
const nav = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const p = await nav.newPage({ viewport: { width: ANCHO, height: ALTO } })
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))
await p.goto('http://127.0.0.1:5192/', { waitUntil: 'load' })
await p.waitForSelector('.panel__logo', { timeout: 30000 })
await p.waitForTimeout(800)
const dir = 'scratchpad/cab99'
await import('node:fs').then((fs) => fs.mkdirSync(dir, { recursive: true }))
await p.screenshot({ path: `${dir}/1-marca.png` })
await p.click('text=Jugar ahora')
await p.waitForSelector('.cab'); await p.waitForTimeout(300)
await p.screenshot({ path: `${dir}/2-portada.png` })
await p.click('.cab-rail__item:has-text("Entrenar")'); await p.waitForTimeout(500)
await p.screenshot({ path: `${dir}/3-entrenamiento.png` })
await p.click('.cab-rail__item:has-text("Armería")'); await p.waitForTimeout(500)
await p.screenshot({ path: `${dir}/4-armeria.png` })
await p.click('.cab-rail__item:has-text("Opciones")'); await p.waitForTimeout(500)
await p.screenshot({ path: `${dir}/5-opciones.png` })
console.log('errores de página:', errores.length, errores.slice(0, 3))
await nav.close()
