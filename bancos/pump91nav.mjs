// La Pump en el motor de verdad: se equipa, dispara, gasta un cartucho, deja
// ocho marcas de un golpe y recarga de uno en uno pudiendo cortarla.
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
await p.addInitScript(() => {
  localStorage.setItem('aimcore.settings.v1', JSON.stringify({
    weapon: 'pump', scenario: 'largoYPuerta', targetType: 'hitbox', sessionDuration: 'endless',
  }))
})
await p.goto('http://localhost:5192/', { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)

// Las fichas de la armería primero: que la escopeta diga lo suyo.
// Desde Cabina (vuelta 99): marca, y la armería es una sección del raíl.
await p.click('text=Jugar ahora')
await p.waitForTimeout(300)
await p.click('.cab-rail__item:has-text("Armería")')
await p.waitForTimeout(600)
const fichas = await p.locator('.armoury__card').allTextContents()
const ficha = fichas.find((f) => f.includes('Pump')) ?? ''
afirmar('la ficha dice los perdigones', /8 por disparo en un cono de 6/.test(ficha), ficha.slice(0, 80))
afirmar('y que se recarga cartucho a cartucho', /cartucho a cartucho/.test(ficha))
await p.click('.cab-rail__item:has-text("Entrenar")')
await p.waitForTimeout(400)

await p.locator('button', { hasText: /^Jugar/ }).last().click()
await p.waitForTimeout(900)
await p.mouse.click(60, 660)
await p.waitForTimeout(1200)

const leer = () => p.evaluate(() => {
  const t = document.querySelector('.hud__ammo')?.textContent ?? ''
  return t.trim()
})
/**
 * **Se miden diferencias y no números absolutos**, porque el clic con el que se
 * captura el ratón **es un disparo** —lo es jugando, así que el banco no puede
 * fingir que no—. Lo que se está comprobando es la mecánica: cuánto baja un
 * clic, cuánto sube un tramo de recarga y qué pasa al cortarla.
 */
const cartuchos = async () => Number((await leer()).split('/')[0])
const alEmpezar = await cartuchos()
console.log('  munición al empezar:', await leer(), '(el clic de capturar ya ha disparado)')
afirmar('el cargador es de ocho', (await leer()).endsWith('/8'), await leer())

await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up()
await p.waitForTimeout(400)
const trasUno = await cartuchos()
console.log('  tras un disparo:', await leer())
afirmar('un clic gasta un cartucho', alEmpezar - trasUno === 1, `${alEmpezar} → ${trasUno}`)

// La corredera: dos clics seguidos dentro de 500 ms sólo dan uno.
await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up()
await p.waitForTimeout(120)
await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up()
await p.waitForTimeout(300)
const trasDos = await cartuchos()
console.log('  tras dos clics en 160 ms:', await leer())
afirmar('la corredera no deja doblar el disparo', trasUno - trasDos === 1, `${trasUno} → ${trasDos}`)

// Recarga por cartuchos: pasado un cartucho se ve subir sin llegar al tope.
await p.keyboard.press('KeyR')
await p.waitForTimeout(700)
const unCartucho = await cartuchos()
console.log('  con 700 ms de recarga:', await leer())
afirmar('mete un cartucho y sigue', unCartucho - trasDos === 1, `${trasDos} → ${unCartucho}`)
afirmar('y no llena el cargador de golpe', unCartucho < 8, `${unCartucho}`)

// Y se corta disparando.
await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up()
await p.waitForTimeout(300)
const cortada = await cartuchos()
console.log('  tras cortarla disparando:', await leer())
afirmar('disparar la interrumpe y sale la bala', unCartucho - cortada === 1, `${unCartucho} → ${cortada}`)

afirmar('ni un error de página', errores.length === 0, errores.slice(0, 3).join(' | '))
await nav.close()
console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
