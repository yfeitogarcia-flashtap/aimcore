// Banco: Opciones abierto sobre la partida (pausa del entrenamiento y menú de
// ESC del multijugador) cabe en la ventana, se desplaza por dentro, enseña las
// dos sensibilidades arriba y Volver abajo, y mover la sensibilidad se aplica al
// momento y se guarda (vuelta 104).
//
// Pide el huésped con VEKTOR_LOBBY=0 VEKTOR_RONDAS=0 en el 5199 (sirve dist/).
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
const BASE = process.env.BASE || 'http://localhost:5199'
const TAMANOS = [[1280, 720], [1920, 1080], [2560, 1080], [1366, 768]]

/** Lo que se puede afirmar del panel, preguntándole al navegador. */
async function medirPanel(p, alto) {
  return p.evaluate((alto) => {
    const panel = document.querySelector('.overlay > .panel--options')
    if (!panel) return null
    const r = panel.getBoundingClientRect()
    const visible = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return false
      const b = el.getBoundingClientRect()
      const x = b.left + b.width / 2
      const y = b.top + b.height / 2
      if (y < 0 || y > alto) return false
      const arriba = document.elementFromPoint(x, y)
      return !!arriba && (arriba === el || el.contains(arriba) || arriba.contains(el))
    }
    return {
      top: r.top, bottom: r.bottom, alto: r.height,
      scrollH: panel.scrollHeight, clientH: panel.clientHeight,
      overflow: getComputedStyle(panel).overflowY,
      sensVisible: visible('#opt-sensitivity'),
      mirillaVisible: visible('#opt-scope-sensitivity'),
      volverVisible: visible('.overlay > .panel--options .panel__actions .button--primary'),
    }
  }, alto)
}

async function comprobarPanel(p, etiqueta, alto) {
  const m = await medirPanel(p, alto)
  if (!m) { afirmar(`${etiqueta}: el panel está abierto`, false); return }
  afirmar(`${etiqueta}: cabe en la ventana`, m.top >= 0 && m.bottom <= alto + 0.5,
    `de ${m.top.toFixed(0)} a ${m.bottom.toFixed(0)} px con ${alto} de alto`)
  afirmar(`${etiqueta}: sensibilidad y mirilla a la vista al abrir`, m.sensVisible && m.mirillaVisible)
  afirmar(`${etiqueta}: Volver a la vista al abrir`, m.volverVisible)
  const conScroll = m.scrollH > m.clientH + 1
  console.log(`      contenido ${m.scrollH} px en ${m.clientH} px de caja · overflow ${m.overflow}`)
  if (conScroll) {
    await p.mouse.move(p.viewportSize().width / 2, alto / 2)
    await p.mouse.wheel(0, 4000)
    await p.waitForTimeout(250)
    const fin = await p.evaluate(() => {
      const panel = document.querySelector('.overlay > .panel--options')
      return { top: panel.scrollTop, max: panel.scrollHeight - panel.clientHeight }
    })
    afirmar(`${etiqueta}: la rueda llega al final`, fin.top >= fin.max - 2, `${fin.top}/${fin.max}`)
    const m2 = await medirPanel(p, alto)
    afirmar(`${etiqueta}: Volver sigue a la vista abajo del todo`, m2.volverVisible)
    await p.mouse.wheel(0, -4000)
    await p.waitForTimeout(250)
  }
}

/** Pulsa la flecha derecha sobre el slider de sensibilidad y lee el ajuste guardado. */
async function subirSensibilidad(p) {
  const antes = await p.evaluate(() => JSON.parse(localStorage.getItem('aimcore.settings.v1') || '{}').sensitivity)
  await p.focus('#opt-sensitivity')
  for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowRight')
  await p.waitForTimeout(200)
  const despues = await p.evaluate(() => JSON.parse(localStorage.getItem('aimcore.settings.v1') || '{}').sensitivity)
  const campo = await p.evaluate(() => Number(document.querySelector('#opt-sensitivity').value))
  return { antes, despues, campo }
}

// ---------------------------------------------------------------- Entrenamiento
for (const [w, h] of TAMANOS) {
  console.log(`\nEntrenamiento ${w}×${h}`)
  const p = await nav.newPage({ viewport: { width: w, height: h } })
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1200)
  await p.mouse.click(40, h - 30)
  await p.waitForTimeout(800)
  await p.evaluate(() => document.exitPointerLock())
  await p.waitForTimeout(600)
  const boton = p.locator('.overlay .panel button', { hasText: /^Opciones$/ })
  if (await boton.count() === 0) {
    afirmar('la pausa enseña Opciones', false)
    await p.screenshot({ path: `scratchpad/opc104-ent-${w}x${h}-fallo.png` })
    await p.close()
    continue
  }
  await boton.first().click()
  await p.waitForTimeout(400)
  await comprobarPanel(p, 'pausa', h)
  await p.screenshot({ path: `scratchpad/opc104-ent-${w}x${h}.png` })
  if (w === 1280) {
    const s = await subirSensibilidad(p)
    afirmar('la sensibilidad se guarda al moverla', s.despues !== undefined && s.despues !== s.antes && Math.abs(s.despues - s.campo) < 1e-9,
      `${s.antes} → ${s.despues} (campo ${s.campo})`)
  }
  await p.close()
}

// ---------------------------------------------------------------- Multijugador
for (const [w, h] of TAMANOS) {
  console.log(`\nMultijugador ${w}×${h}`)
  const p = await nav.newPage({ viewport: { width: w, height: h } })
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto(`${BASE}/duelo/`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)
  // A jugar y soltar: el menú de ESC con su botón de Opciones.
  await p.mouse.click(30, 30)
  await p.waitForTimeout(700)
  await p.evaluate(() => document.exitPointerLock())
  await p.waitForTimeout(700)
  const visible = await p.evaluate(() => {
    const b = document.getElementById('opciones')
    return !!b && b.offsetParent !== null
  })
  afirmar('el menú de ESC enseña Opciones', visible)
  await p.click('#opciones')
  await p.waitForTimeout(500)
  await comprobarPanel(p, 'menú de ESC', h)
  await p.screenshot({ path: `scratchpad/opc104-mul-${w}x${h}.png` })
  if (w === 1280) {
    const antes = await p.evaluate(() => window.vektorNet.motor.controls.radiansPerCount)
    const s = await subirSensibilidad(p)
    const despues = await p.evaluate(() => window.vektorNet.motor.controls.radiansPerCount)
    afirmar('la sensibilidad se guarda al moverla', s.despues !== s.antes, `${s.antes} → ${s.despues}`)
    afirmar('y el motor la aplica al momento', despues > antes, `${antes.toExponential(4)} → ${despues.toExponential(4)} rad/cuenta`)
    // La de la mirilla, igual.
    const m0 = await p.evaluate(() => window.vektorNet.motor._sensMirilla)
    await p.focus('#opt-scope-sensitivity')
    for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowRight')
    await p.waitForTimeout(200)
    const m1 = await p.evaluate(() => window.vektorNet.motor._sensMirilla)
    const g1 = await p.evaluate(() => JSON.parse(localStorage.getItem('aimcore.settings.v1') || '{}').scopeSensitivity)
    afirmar('la sensibilidad con mirilla llega al motor y se guarda', m1 > m0 && Math.abs(g1 - m1) < 1e-9, `${m0} → ${m1} (guardada ${g1})`)
    // Volver cierra.
    await p.click('.overlay > .panel--options .panel__actions .button--primary')
    await p.waitForTimeout(300)
    afirmar('Volver cierra el panel', (await p.locator('.panel--options').count()) === 0)
  }
  await p.close()
}

afirmar('sin errores de página', errores.length === 0, errores.slice(0, 2).join(' | '))
console.log(`\n${fallos === 0 ? 'TODO VERDE' : `${fallos} FALLOS`}`)
await nav.close()
process.exit(fallos ? 1 : 0)
