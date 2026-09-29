// Banco: ESC es un «atrás» forzado y la B cierra la tienda volviendo a jugar
// (vuelta 101). Contra el producto, con teclas de verdad. Pide el huésped con
// VEKTOR_LOBBY=0 (quien llega juega) en el 5199 y vite en el 5192.
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

/** Espera hasta `ms` a que la página quede capturada; devuelve cuánto tardó. */
async function esperaCaptura(p, ms = 2500) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(() => !!document.pointerLockElement)) return Date.now() - t0
    await p.waitForTimeout(50)
  }
  return null
}

// ---------------------------------------------------------------- Entrenamiento
{
  console.log('\nEntrenamiento')
  const p = await nav.newPage({ viewport: { width: 1280, height: 720 } })
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto('http://localhost:5192/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  await p.mouse.click(40, 690)
  afirmar('empieza capturado', (await esperaCaptura(p)) !== null)

  // Soltar y aporrear ESC enseguida: la vuelta se anota y se cumple sola.
  await p.evaluate(() => document.exitPointerLock())
  await p.waitForTimeout(400)
  for (let i = 0; i < 3; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(120) }
  const t1 = await esperaCaptura(p)
  afirmar('tres ESC seguidos en la espera devuelven a la partida', t1 !== null, `tras ${t1} ms`)

  // Opciones abiertas en la pausa: un ESC cierra y vuelve.
  await p.evaluate(() => document.exitPointerLock())
  await p.waitForTimeout(600)
  await p.getByRole('button', { name: /Opciones/i }).first().click()
  await p.waitForTimeout(400)
  afirmar('opciones abiertas', (await p.locator('.panel--options').count()) === 1)
  await p.keyboard.press('Escape')
  const t2 = await esperaCaptura(p)
  afirmar('ESC con opciones las cierra y vuelve a jugar', t2 !== null && (await p.locator('.panel--options').count()) === 0, `tras ${t2} ms`)

  // La armería con su tecla, y ESC pegado a la apertura.
  await p.waitForTimeout(300)
  await p.keyboard.press('KeyB')
  await p.waitForTimeout(150)
  afirmar('B abre la armería', (await p.locator('.panel--armoury').count()) > 0)
  await p.keyboard.press('Escape')
  const t3 = await esperaCaptura(p)
  afirmar('ESC pegado a abrir la armería la cierra y vuelve', t3 !== null && (await p.locator('.panel--armoury').count()) === 0, `tras ${t3} ms`)
  await p.close()
}

// ---------------------------------------------------------------- Multijugador
{
  console.log('\nMultijugador')
  const p = await nav.newPage({ viewport: { width: 1280, height: 720 } })
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto('http://localhost:5192/duelo/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)
  const tiendaAbierta = () => p.evaluate(() => !document.getElementById('tienda').hidden)
  const menuVisible = () => p.evaluate(() => !document.getElementById('aviso').hidden)
  const codigoVisible = () => p.evaluate(() => {
    const el = document.getElementById('codigoMenu')
    return !!el && el.offsetParent !== null && !document.getElementById('aviso').hidden
  })
  afirmar('la sala tiene economía', await p.evaluate(() => Boolean(window.vektorNet?.cliente?.conEconomia)))

  // El menú de antes de jugar ya esconde el código: se pide con «Invitar».
  afirmar('con el menú puesto, el código no se ve de entrada', !(await codigoVisible()))
  await p.click('#invitar')
  await p.waitForTimeout(200)
  afirmar('«Invitar» lo enseña', await codigoVisible())

  await p.mouse.click(40, 690)
  afirmar('empieza capturado', (await esperaCaptura(p)) !== null)

  // Vigilar el menú todo el rato: no puede asomar ni un frame.
  await p.evaluate(() => {
    window.__menuVisto = 0
    const mira = () => {
      if (!document.getElementById('aviso').hidden) window.__menuVisto++
      requestAnimationFrame(mira)
    }
    mira()
  })

  // B abre, B cierra y vuelve.
  await p.keyboard.press('KeyB')
  await p.waitForTimeout(500)
  afirmar('B abre la tienda', await tiendaAbierta())
  await p.keyboard.press('KeyB')
  const t1 = await esperaCaptura(p)
  afirmar('la segunda B cierra la tienda', !(await tiendaAbierta()))
  afirmar('y vuelve a la partida', t1 !== null, `tras ${t1} ms`)

  // B abre, ESC pegado cierra y vuelve.
  await p.waitForTimeout(300)
  await p.keyboard.press('KeyB')
  await p.waitForTimeout(150)
  afirmar('B abre la tienda otra vez', await tiendaAbierta())
  await p.keyboard.press('Escape')
  const t2 = await esperaCaptura(p)
  afirmar('ESC pegado a la apertura la cierra y vuelve', !(await tiendaAbierta()) && t2 !== null, `tras ${t2} ms`)
  afirmar('el menú del código no ha asomado ni un frame', (await p.evaluate(() => window.__menuVisto)) === 0,
    `${await p.evaluate(() => window.__menuVisto)} frames`)

  // Soltar (como ESC jugando), aporrear ESC: vuelve.
  await p.evaluate(() => document.exitPointerLock())
  await p.waitForTimeout(500)
  afirmar('soltar enseña el menú', await menuVisible())
  afirmar('sin el código a la vista', !(await codigoVisible()))
  for (let i = 0; i < 4; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(100) }
  const t3 = await esperaCaptura(p)
  afirmar('cuatro ESC seguidos devuelven a la partida', t3 !== null, `tras ${t3} ms`)

  // Con opciones abiertas desde el menú: un ESC cierra y vuelve.
  await p.evaluate(() => document.exitPointerLock())
  await p.waitForTimeout(600)
  await p.click('#opciones')
  await p.waitForTimeout(400)
  afirmar('opciones abiertas', (await p.locator('.panel--options').count()) === 1)
  await p.keyboard.press('Escape')
  const t4 = await esperaCaptura(p)
  afirmar('ESC con opciones las cierra y vuelve', t4 !== null && (await p.locator('.panel--options').count()) === 0, `tras ${t4} ms`)
  await p.close()
}

afirmar('ni un error de página', errores.length === 0, errores.slice(0, 2).join(' | '))
await nav.close()
console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
