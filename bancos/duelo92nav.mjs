// duelo92nav: la ranura especial en un duelo de verdad, dos navegadores.
// Un jugador por navegador (regla de la vuelta 50).
import { chromium } from 'playwright-core'
const OUT = '/home/user/aimcore/scratchpad'
const errores = { A: [], B: [] }
const lanzar = () => chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const nA = await lanzar(); const nB = await lanzar()
const A = await nA.newPage({ viewport: { width: 1280, height: 860 } })
const B = await nB.newPage({ viewport: { width: 1280, height: 860 } })
A.on('pageerror', (e) => errores.A.push(String(e)))
B.on('pageerror', (e) => errores.B.push(String(e)))

await A.goto('http://localhost:5199/duelo/?compra=15', { waitUntil: 'networkidle' })
await A.waitForTimeout(2500)
const enlace = await A.evaluate(() => document.querySelector('#enlace').value)
console.log('enlace:', enlace)
await B.goto(enlace, { waitUntil: 'networkidle' })
await B.waitForTimeout(2500)

const jugar = async (p) => { await p.mouse.click(30, 30); await p.waitForTimeout(900) }
await jugar(A); await jugar(B)
await A.waitForTimeout(1500)

const eco = (p) => p.evaluate(() => ({
  dinero: window.vektorNet?.cliente?.economia?.dinero ?? null,
  inv: window.vektorNet?.cliente?.economia?.inv ?? null,
  fase: window.vektorNet?.cliente?.rondas?.fase ?? null,
  ronda: window.vektorNet?.cliente?.rondas?.n ?? null,
}))
console.log('A al empezar:', JSON.stringify(await eco(A)))

// Abrir la tienda y mirar la categoría Especiales
await A.keyboard.press('KeyB'); await A.waitForTimeout(700)
console.log('tienda abierta:', await A.evaluate(() => !document.querySelector('#tienda')?.hidden))
console.log('artículos de Especiales:', await A.evaluate(() =>
  [...document.querySelectorAll('.art')].map((a) => a.textContent.replace(/\s+/g, ' ').trim())
    .filter((t) => /Bow|U2/.test(t))))
await A.screenshot({ path: `${OUT}/08-tienda.png` })

console.log('\nerrores A:', errores.A.length, errores.A.slice(0, 3))
console.log('errores B:', errores.B.length, errores.B.slice(0, 3))
await nA.close(); await nB.close()
