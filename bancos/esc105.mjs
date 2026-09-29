// esc105 — volver desde la pausa, **con las reglas de Chrome puestas** (F2).
//
// Un navegador sin interfaz no aplica las dos reglas con las que Chrome decide
// si deja volver a capturar el ratón, y por eso `esc101` salía verde con el
// fallo delante. Este banco las imita con un envoltorio de `requestPointerLock`
// que se instala antes que ningún script de la página:
//
//  - **Tras una salida del usuario** (ESC con el ratón capturado, que aquí suelta
//    el propio envoltorio como haría el navegador, comiéndose la tecla), Chrome
//    rechaza la petición durante 1.3 s y, pasado eso, **si no hay gesto**. El
//    gesto lo dice `navigator.userActivation.isActive`, que es el de verdad de
//    este Chromium (clics y teclas, y ESC no cuenta: se comprueba abajo).
//  - **Tras una salida de la página** (`exitPointerLock`), la deja siempre.
//
// Y un segundo modo, **la app de escritorio**: la marca `__VEKTOR_ESCRITORIO__`
// puesta y ESC llegando como lo manda `main.rs`, con `vektor:escape`.
//
// Pide vite en el 5192 y el huésped con VEKTOR_LOBBY=0 en el 5199.
import { chromium } from 'playwright-core'

const BASE = process.env.BASE || 'http://localhost:5192'
let fallos = 0
const ok = (t, c, d = '') => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}${d ? ` — ${d}` : ''}`); if (!c) fallos += 1 }
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const errores = []

const CHROME = ({ app }) => {
  if (app) Object.defineProperty(window, '__VEKTOR_ESCRITORIO__', { value: Object.freeze({ version: 'banco' }) })
  // **El gesto, modelado aquí y no leído de Chrome**: `page.evaluate` de
  // Playwright corre con gesto de usuario, así que cada comprobación del banco
  // le devolvería la activación a la página. Cuentan clics y teclas de verdad
  // (`isTrusted`), menos ESC, durante los 5 s que Chrome la guarda.
  let gesto = -1e9
  const anotar = (e) => { if (e.isTrusted && e.key !== 'Escape') gesto = performance.now() }
  for (const tipo of ['pointerdown', 'mousedown', 'keydown']) window.addEventListener(tipo, anotar, true)
  const activa = () => performance.now() - gesto < 5000
  Object.defineProperty(navigator, 'userActivation', { value: { get isActive() { return activa() }, get hasBeenActive() { return true } } })
  const pedir = Element.prototype.requestPointerLock
  const soltar = Document.prototype.exitPointerLock
  let salida = { t: -1e9, usuario: false }
  window.__chrome = { rechazos: 0, concedidas: 0, salidasDeUsuario: 0 }
  Document.prototype.exitPointerLock = function () {
    salida = { t: performance.now(), usuario: false }
    return soltar.call(this)
  }
  window.__salirComoUsuario = () => {
    salida = { t: performance.now(), usuario: true }
    window.__chrome.salidasDeUsuario += 1
    soltar.call(document)
  }
  // En un navegador, ESC con el ratón capturado es del navegador: lo suelta y
  // la página no recibe la tecla. En la app la ventana se queda la tecla antes.
  if (!app) {
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !document.pointerLockElement) return
      e.stopImmediatePropagation()
      e.preventDefault()
      window.__salirComoUsuario()
    }, true)
  }
  Element.prototype.requestPointerLock = function (opciones) {
    const desde = performance.now() - salida.t
    if (salida.usuario && (desde < 1300 || !activa())) {
      window.__chrome.rechazos += 1
      setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0)
      return Promise.reject(new DOMException('The user has exited the lock before this request was completed.', 'SecurityError'))
    }
    window.__chrome.concedidas += 1
    const r = pedir.call(this, opciones)
    salida = { t: -1e9, usuario: false }
    return r
  }
}

const capturado = (p) => p.evaluate(() => Boolean(document.pointerLockElement))
const aviso = (p) => p.evaluate(() => Boolean(document.querySelector('.vk-captura--on')))
const activo = (p) => p.evaluate(() => navigator.userActivation.isActive)
async function esperaCaptura(p, ms = 2500) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await capturado(p)) return Date.now() - t0
    await p.waitForTimeout(40)
  }
  return null
}
async function esperaAviso(p, ms = 2500) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await aviso(p)) return Date.now() - t0
    await p.waitForTimeout(40)
  }
  return null
}
/** Sin tocar nada el tiempo que Chrome guarda un gesto (5 s): el caso que fallaba. */
const sinGesto = (p) => p.waitForTimeout(5600)
const escApp = (p) => p.evaluate(() => window.dispatchEvent(new CustomEvent('vektor:escape')))

async function pagina(url, app) {
  const p = await nav.newPage({ viewport: { width: 1280, height: 720 } })
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.addInitScript(CHROME, { app })
  await p.goto(url, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2000)
  await p.mouse.click(40, 690)
  return p
}

// ---------------------------------------------------------------- navegador
for (const [nombre, url, reanudar] of [
  ['Entrenamiento', `${BASE}/`, (p) => p.getByRole('button', { name: /^Reanudar$/ }).click()],
  ['Multijugador', `${BASE}/duelo/`, null],
]) {
  console.log(`\n${nombre} · Chrome en un navegador`)
  const p = await pagina(url, false)
  ok('empieza capturado', (await esperaCaptura(p)) !== null)

  console.log(' [1] ESC sin gesto reciente: no puede volver, y lo dice')
  await sinGesto(p)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
  ok('ESC jugando suelta el ratón como usuario', !(await capturado(p)) && (await p.evaluate(() => window.__chrome.salidasDeUsuario)) === 1)
  ok('premisa: sin gesto guardado (Chrome no dejaría volver)', !(await activo(p)))
  await p.waitForTimeout(1500)
  await p.keyboard.press('Escape')
  ok('premisa: ESC no cuenta como gesto', !(await activo(p)))
  const tAviso = await esperaAviso(p, 1500)
  ok('un ESC que no puede volver enseña el aviso', tAviso !== null, `tras ${tAviso} ms`)
  for (let i = 0; i < 4; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(120) }
  ok('aporrear ESC no lo deja mudo: el aviso sigue', await aviso(p))
  await p.keyboard.press('KeyK')
  const tTecla = await esperaCaptura(p)
  ok('cualquier tecla vuelve a la primera', tTecla !== null, `tras ${tTecla} ms`)
  ok('y el aviso se va', !(await aviso(p)))

  console.log(' [2] ESC con un clic reciente: vuelve, también dentro de la espera')
  await p.mouse.click(640, 360)
  await p.waitForTimeout(300)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(200)
  for (let i = 0; i < 3; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(120) }
  const tEsc = await esperaCaptura(p)
  ok('tres ESC dentro de la espera, con gesto guardado, vuelven', tEsc !== null, `tras ${tEsc} ms`)

  console.log(' [3] Un clic dentro de la espera: se reintenta al acabarla')
  await sinGesto(p)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(350)
  if (reanudar) {
    await reanudar(p)
    const tRe = await esperaCaptura(p)
    ok('REANUDAR a los 0.35 s vuelve', tRe !== null, `tras ${tRe} ms (rechazos ${await p.evaluate(() => window.__chrome.rechazos)})`)
    await sinGesto(p)
    await p.keyboard.press('Escape')
    await p.waitForTimeout(350)
  }
  await p.mouse.click(20, 400)
  const tClic = await esperaCaptura(p)
  ok('un clic en cualquier sitio a los 0.35 s vuelve', tClic !== null, `tras ${tClic} ms`)
  await p.close()
}

// ---------------------------------------------------------------- app
for (const [nombre, url] of [['Entrenamiento', `${BASE}/`], ['Multijugador', `${BASE}/duelo/`]]) {
  console.log(`\n${nombre} · la app de escritorio (ESC de la ventana)`)
  const p = await pagina(url, true)
  ok('empieza capturado', (await esperaCaptura(p)) !== null)
  await sinGesto(p)
  let bien = 0
  const tiempos = []
  for (let i = 0; i < 3; i++) {
    await escApp(p)
    await p.waitForTimeout(350)
    const suelto = !(await capturado(p))
    await escApp(p)
    const t = await esperaCaptura(p, 1500)
    tiempos.push(t)
    if (suelto && t !== null) bien += 1
    await p.waitForTimeout(350)
  }
  ok('ESC pausa y ESC vuelve, tres veces seguidas y sin gesto', bien === 3, `vueltas en ${tiempos.join(', ')} ms`)
  ok('ni un rechazo de Chrome ni un aviso', (await p.evaluate(() => window.__chrome.rechazos)) === 0 && !(await aviso(p)))
  // **La misma tecla por dos puertas** (vuelta 107, F3): en la app de verdad el
  // WebView entrega también el ESC a la página, así que cada pulsación llega como
  // tecla **y** como aviso de la ventana, en los dos órdenes. Tiene que contar una.
  const doble = async (primero) => {
    if (primero === 'tecla') { await p.keyboard.press('Escape'); await p.waitForTimeout(30); await escApp(p) }
    else { await escApp(p); await p.waitForTimeout(30); await p.keyboard.press('Escape') }
    await p.waitForTimeout(700)
    return capturado(p)
  }
  for (const primero of ['tecla', 'ventana']) {
    const pausa = !(await doble(primero))
    const vuelta = await doble(primero)
    ok(`ESC doble (${primero} primero): pausa y se queda en pausa; vuelve y se queda jugando`, pausa && vuelta)
  }
  // Y con un panel abierto encima: ESC cierra lo que haya y vuelve, como en el navegador.
  await escApp(p)
  await p.waitForTimeout(400)
  if (await capturado(p)) {
    ok('ESC de la ventana pausa para abrir opciones', false)
    await p.close()
    continue
  }
  if (nombre === 'Entrenamiento') await p.getByRole('button', { name: /Opciones/i }).first().click()
  else await p.click('#opciones')
  await p.waitForTimeout(400)
  ok('opciones abiertas', (await p.locator('.panel--options').count()) === 1)
  await p.waitForTimeout(6000)
  await escApp(p)
  const tOp = await esperaCaptura(p)
  ok('ESC con opciones las cierra y vuelve, sin gesto', tOp !== null && (await p.locator('.panel--options').count()) === 0, `tras ${tOp} ms`)
  await p.close()
}

ok('ni un error de página', errores.length === 0, errores.slice(0, 2).join(' | '))
await nav.close()
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
