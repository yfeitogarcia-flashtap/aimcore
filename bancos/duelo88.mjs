// Banco: dos navegadores en la misma sala contra el huésped de Node.
// Mide lo de la vuelta 88 que sólo existe en el duelo: el dinero en el HUD,
// llevar dos clases de granada y que la G cicle entre ellas.
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
const nav2 = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})

const erroresA = []
const A = await nav.newPage({ viewport: { width: 1280, height: 720 } })
A.on('pageerror', (e) => erroresA.push(String(e)))
await A.goto('http://localhost:5199/duelo/', { waitUntil: 'networkidle' })
await A.waitForTimeout(2000)

// El código de la sala se lee de `#codigo`, no de la ruta (lección de laser87).
const codigo = (await A.locator('#codigo').innerText()).trim()
console.log('sala:', codigo)

const erroresB = []
const B = await nav2.newPage({ viewport: { width: 1280, height: 720 } })
B.on('pageerror', (e) => erroresB.push(String(e)))
await B.goto(`http://localhost:5199/duelo/${codigo}`, { waitUntil: 'networkidle' })
await B.waitForTimeout(2500)

afirmar('los dos entran sin errores', erroresA.length === 0 && erroresB.length === 0,
  [...erroresA, ...erroresB].slice(0, 2).join(' | '))

// --- El dinero sale en el HUD, sin abrir la tienda ---
await A.waitForTimeout(800)
const hayDinero = await A.locator('.hud__dinero').count()
const dinero = hayDinero ? (await A.locator('.hud__dinero-valor').innerText()).trim() : '(no hay)'
afirmar('el dinero está en el HUD sin abrir nada', hayDinero === 1, `$${dinero}`)

// --- La tienda: dos clases entran, la tercera se rechaza ---
await A.evaluate(() => document.getElementById('tienda')?.removeAttribute('hidden'))
await A.waitForTimeout(400)
const comprar = async (clave) => {
  await A.evaluate((c) => {
    const b = [...document.querySelectorAll('#tienda button')]
      .find((x) => x.dataset?.clave === c || (x.firstChild?.firstChild?.textContent ?? '').trim().toLowerCase() === c)
    b?.click()
  }, clave)
  await A.waitForTimeout(500)
}
await comprar('ko')
await comprar('blind')
const dinero2 = (await A.locator('.hud__dinero-valor').innerText()).trim()
afirmar('comprar baja el dinero del HUD', dinero2 !== dinero, `$${dinero} → $${dinero2}`)

// **Se mide lo que se ve, no un global que el producto no tiene.** Que lleva
// las dos clases lo dice la tienda marcándolas «Equipado», y el ciclo de la G
// de más abajo lo confirma desde el otro lado.
const equipadas = await A.evaluate(() => [...document.querySelectorAll('#tienda .art')]
  .filter((x) => x.textContent.includes('Equipado'))
  .map((x) => x.querySelector('.art-nombre')?.textContent ?? x.textContent.slice(0, 12)))
console.log('  marcadas como equipadas:', equipadas.join(' · '))
afirmar('la tienda marca las dos granadas', equipadas.length >= 2, equipadas.join(','))

await comprar('core')
const dinero3 = (await A.locator('.hud__dinero-valor').innerText()).trim()
afirmar('la tercera no se cobra', dinero3 === dinero2, `$${dinero2} → $${dinero3}`)
const nota = await A.evaluate(() => {
  const el = [...document.querySelectorAll('#tienda .art')]
    .find((x) => x.textContent.includes('Core'))
  return el?.textContent ?? ''
})
afirmar('y el panel dice por qué', /clases/.test(nota), nota.replace(/\s+/g, ' ').slice(0, 90))

// --- La G cicla ---
await A.evaluate(() => document.getElementById('tienda')?.setAttribute('hidden', ''))
await A.mouse.click(40, 700)
await A.waitForTimeout(600)
const mano = async () => (await A.locator('.hud__weapon-name').innerText()).split('\n')[0].trim()
const m0 = await mano()
await A.keyboard.press('KeyG'); await A.waitForTimeout(350)
const m1 = await mano()
await A.keyboard.press('KeyG'); await A.waitForTimeout(350)
const m2 = await mano()
await A.keyboard.press('KeyG'); await A.waitForTimeout(350)
const m3 = await mano()
console.log(`  mano: ${m0} → ${m1} → ${m2} → ${m3}`)
afirmar('la primera G saca una granada', m1 !== m0 && m1 !== '')
afirmar('la segunda G pasa a la otra', m2 !== m1)
afirmar('y la tercera vuelve a la primera', m3 === m1)

afirmar('ni un error de página en toda la tanda', erroresA.length === 0 && erroresB.length === 0,
  [...erroresA, ...erroresB].slice(0, 3).join(' | '))

await nav.close(); await nav2.close()
console.log(fallos === 0 ? '\nTODO VERDE' : `\n${fallos} FALLOS`)
process.exit(fallos === 0 ? 0 : 1)
