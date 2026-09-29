// Banco: ¿se ve el dinero en el HUD de un duelo real, y cuándo?
// Se mira en cuatro momentos, porque «no se ve» puede ser «no se ve todavía».
import { chromium } from 'playwright-core'

// Un paso en rojo hace fallar el banco (auditoría de la vuelta 105).
let fallos = 0
const veredicto = (bien, si = 'OK', no = 'FALLO') => { if (!bien) fallos += 1; return bien ? si : no }

const lanzar = () => chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const navA = await lanzar(); const navB = await lanzar()
const errores = []
const A = await navA.newPage({ viewport: { width: 1600, height: 900 } })
A.on('pageerror', (e) => errores.push('A: ' + e))
await A.goto('http://localhost:5199/duelo/', { waitUntil: 'networkidle' })
await A.waitForTimeout(2000)
const codigo = (await A.locator('#codigo').innerText()).trim()
console.log('sala:', codigo)

const mirar = async (cuando) => {
  const r = await A.evaluate(() => {
    const el = document.querySelector('.hud__dinero')
    if (!el) return { hay: false }
    const caja = el.getBoundingClientRect()
    const centro = document.elementFromPoint(caja.left + caja.width / 2, caja.top + caja.height / 2)
    return {
      hay: true,
      texto: el.textContent.trim(),
      caja: `${Math.round(caja.left)},${Math.round(caja.top)} ${Math.round(caja.width)}x${Math.round(caja.height)}`,
      visible: caja.width > 0 && caja.height > 0,
      // ¿Llega el ojo hasta ahí, o hay algo encima? (vuelta 61: se le pregunta
      // al navegador, una caja no lo contesta.)
      encima: centro === el || el.contains(centro) ? 'nada' : (centro?.className || centro?.id || '?'),
      opacidad: getComputedStyle(el).opacity,
    }
  })
  console.log(`  ${cuando.padEnd(26)}`, r.hay ? `«${r.texto}» ${r.caja} · encima: ${r.encima} · op ${r.opacidad}` : 'NO HAY BLOQUE',
    veredicto(r.hay && r.visible && r.encima === 'nada' && Number(r.opacidad) === 1))
  return r
}

await mirar('antes del rival')

const B = await navB.newPage({ viewport: { width: 1280, height: 720 } })
B.on('pageerror', (e) => errores.push('B: ' + e))
await B.goto(`http://localhost:5199/duelo/${codigo}`, { waitUntil: 'networkidle' })
await B.waitForTimeout(2500)
await mirar('con rival, fase de compra')

// Jugar de verdad: capturar el ratón en una esquina (vuelta 61).
await A.mouse.click(40, 860)
await A.waitForTimeout(800)
await mirar('jugando (ratón capturado)')

// Comprar, que es lo que hacía el jugador.
await A.evaluate(() => document.getElementById('tienda')?.removeAttribute('hidden'))
await A.waitForTimeout(400)
await A.evaluate(() => {
  const b = [...document.querySelectorAll('#tienda button')].find((x) => x.textContent.includes('Chaleco') || x.textContent.toLowerCase().includes('chaleco'))
  b?.click()
})
await A.waitForTimeout(700)
await A.evaluate(() => document.getElementById('tienda')?.setAttribute('hidden', ''))
await A.waitForTimeout(400)
await mirar('tras comprar')

// Esperar a que empiece la ronda de verdad.
await A.waitForTimeout(16000)
await mirar('en ronda')
await A.screenshot({ path: '/tmp/dinero-ronda.png' })

console.log('errores de página:', errores.length, errores.slice(0, 2).join(' | '), veredicto(errores.length === 0))
await navA.close(); await navB.close()

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
