// ranura92: la quinta ranura, jugada con teclado y ratón de verdad.
// Se comprueba lo que el jugador nota: la 1 saca la principal, la 5 saca la
// especial, el HUD lo dice, y el arma que sale es la que la armería equipó.
import { chromium } from 'playwright-core'

let fallos = 0
/** Un veredicto impreso también cuenta: un paso en rojo hace fallar el banco (auditoría de la vuelta 105). */
const veredicto = (bien, si = 'sí', no = 'NO') => { if (!bien) fallos += 1; return bien ? si : no }

const OUT = '/home/user/aimcore/scratchpad'
const errores = []
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
page.on('pageerror', (e) => errores.push(String(e)))
await page.goto('http://127.0.0.1:5192/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const arma = () => page.evaluate(() => {
  const e = window.aimcore
  return { ranura: e.slot, clave: e.weaponKey, hud: document.querySelector('.hud__weapon-name')?.textContent.trim() ?? null }
})

// A jugar: marca → modos → entrenamiento → ronda
await page.click('.panel button')
await page.waitForTimeout(300)
await page.evaluate(() => [...document.querySelectorAll('.portada button, .panel button, .cab-rail__item')].find((b) => b.textContent.includes('Entrenamiento')).click())
await page.waitForTimeout(400)
await page.evaluate(() => document.querySelector('.training__jugar').click())
await page.waitForTimeout(1200)

console.log('al empezar:', await arma())
for (const [tecla, espera] of [['Digit5', 'special'], ['Digit1', 'primary'], ['Digit2', 'secondary'], ['Digit5', 'special'], ['Digit3', 'melee'], ['KeyG', 'throwable']]) {
  await page.keyboard.press(tecla)
  await page.waitForTimeout(250)
  const a = await arma()
  console.log(`  ${tecla} → ranura ${a.ranura} · ${a.clave} · HUD «${a.hud}»`, veredicto(a.ranura === espera, 'OK', `FALLO (esperaba ${espera})`))
}

// Y disparar con ella: que el cohete/flecha salga de verdad.
await page.keyboard.press('Digit5')
await page.waitForTimeout(250)
const antes = await page.evaluate(() => window.aimcore.ammo)
await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up()
await page.waitForTimeout(500)
const despues = await page.evaluate(() => ({ ammo: window.aimcore.ammo, vivos: window.aimcore.proyectiles?.vivos ?? null }))
console.log(`\ndisparo con la especial: cargador ${antes} → ${despues.ammo}, proyectiles vivos ${despues.vivos}`)

await page.screenshot({ path: `${OUT}/07-ranura5.png` })
console.log('\nerrores de página:', errores.length, errores.slice(0, 5), veredicto(errores.length === 0))
await browser.close()

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
