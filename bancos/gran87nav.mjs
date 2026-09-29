/**
 * **gran87nav — las tres granadas, conducidas como las conduce una persona.**
 *
 * La regla de la vuelta 48: si algo tiene que hacerlo alguien con el ratón, el
 * banco lo hace con el ratón. Aquí se entra al juego, se saca la granada con su
 * tecla, se tira con los dos botones y se mira la pantalla.
 */
import { chromium } from 'playwright-core'

const URL = 'http://localhost:5192/'
const fallos = []
const af = (cond, texto, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${texto}${extra ? ` — ${extra}` : ''}`)
  if (!cond) fallos.push(texto)
}

const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const pagina = await navegador.newPage({ viewport: { width: 1000, height: 640 } })
const errores = []
pagina.on('pageerror', (e) => errores.push(String(e) + '\n' + String(e.stack || '').split('\n').slice(1, 4).join('\n')))
pagina.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()) })

const arrancar = async (granada) => {
  await pagina.addInitScript((g) => {
    localStorage.setItem('aimcore.settings.v1', JSON.stringify({
      weapon: 'rift', throwable: g, scenario: 'largoYPuerta', targetType: 'hitbox',
      simultaneousTargets: 3, sessionDuration: 'endless',
    }))
  }, granada)
  await pagina.goto(URL, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1200)
  const jugar = pagina.locator('button', { hasText: /JUGAR|Jugar/ }).first()
  await jugar.click({ timeout: 5000 })
  await pagina.waitForTimeout(800)
  await pagina.mouse.click(60, 560)
  await pagina.waitForTimeout(600)
}

const hud = () => pagina.evaluate(() => document.body.innerText)
/** El cargador que enseña el HUD, que es lo que ve quien juega. */
const municion = async () => {
  const m = (await hud()).match(/(\d+)\s*\/\s*(\d+)/)
  return m ? Number(m[1]) : null
}

console.log('== gran87nav ==\n')
await arrancar('core')

console.log('[1] la G saca la granada, y el HUD lo dice')
await pagina.keyboard.press('KeyG')
await pagina.waitForTimeout(400)
{
  const t = await hud()
  af(/Core/i.test(t), 'el HUD dice Core', t.split('\n').filter((l) => /Core|Rift/.test(l)).join(' | '))
  af((await municion()) === 1, 'y lleva una en la mano', String(await municion()))
}

console.log('\n[2] clic izquierdo: lanza, gasta y recarga de la reserva')
{
  await pagina.mouse.move(500, 300)
  await pagina.mouse.down()
  await pagina.waitForTimeout(200)
  await pagina.mouse.up()
  await pagina.waitForTimeout(400)
  af((await municion()) === 0, 'la mano se queda vacía', String(await municion()))
  for (let i = 0; i < 30 && (await municion()) !== 1; i++) await pagina.waitForTimeout(300)
  af((await municion()) === 1, 'la reserva pone la segunda', String(await municion()))
}

console.log('\n[3] clic derecho: el tiro corto también lanza')
{
  await pagina.waitForTimeout(600)
  await pagina.mouse.down({ button: 'right' })
  await pagina.waitForTimeout(200)
  await pagina.mouse.up({ button: 'right' })
  await pagina.waitForTimeout(400)
  af((await municion()) === 0, 'gasta la segunda', String(await municion()))
  for (let i = 0; i < 30 && (await municion()) !== 0; i++) await pagina.waitForTimeout(300)
  af((await municion()) === 0, 'y ya no quedan', String(await municion()))
  await pagina.keyboard.press('KeyR')
  await pagina.waitForTimeout(400)
  const t = await hud()
  af(/granada/i.test(t), 'el HUD explica por qué no recarga',
    t.split('\n').filter((l) => /granada/i.test(l)).join(' | '))
}

console.log('\n[4] la Blind ciega, y la pared la corta')
await arrancar('blind')
await pagina.keyboard.press('KeyG')
await pagina.waitForTimeout(300)
{
  // A los pies, con el tiro corto: se ve el destello sí o sí.
  await pagina.mouse.move(500, 300)
  await pagina.mouse.down({ button: 'right' })
  await pagina.waitForTimeout(120)
  await pagina.mouse.up({ button: 'right' })
  // Esperar a que estalle: 4 s de mecha menos lo sostenido.
  /**
   * **Y se espera en tiempo de mundo, no de pared** (vuelta 75). Con WebGL por
   * software el mundo corre a una fracción del tiempo real —eso es lo que
   * `SIM.maxFrameDeltaMs` promete— así que «4 s de mecha» pueden ser veinte
   * segundos de reloj de pared. Lo que se hace es mirar muchas veces y
   * quedarse con el pico, que es lo que la aserción de verdad quiere saber.
   */
  let pico = 0
  let visto = null
  for (let i = 0; i < 90; i++) {
    await pagina.waitForTimeout(300)
    const v = await pagina.evaluate(() => {
      const el = document.querySelector('.vk-gren--ciego')
      return el ? { op: Number(el.style.opacity || 0), hueco: el.style.getPropertyValue('--vk-hueco') } : null
    })
    if (v && v.op > pico) { pico = v.op; visto = v }
    if (pico > 0.2 && v && v.op === 0) break
  }
  af(pico > 0.2, 'la pantalla se pone blanca', JSON.stringify(visto))
  const luego = await pagina.evaluate(() => Number(document.querySelector('.vk-gren--ciego')?.style.opacity || 0))
  af(luego === 0, 'y se pasa sola', String(luego))
}

console.log(`\n[5] errores de página: ${errores.length}`)
if (errores.length) console.log('    ' + errores.slice(0, 8).join('\n    '))
af(errores.length === 0, 'sin errores de página')

await pagina.screenshot({ path: 'scratchpad/gran87.png' })
await navegador.close()
console.log(`\n${fallos.length === 0 ? 'TODO OK' : `${fallos.length} FALLOS: ${fallos.join('; ')}`}`)
process.exit(fallos.length === 0 ? 0 : 1)
