/**
 * cabina99b — el sistema Cabina, medido (vuelta 99). Sustituye a `menu94`,
 * que medía la cabecera y los botones de la 94 (ya no existen desde la 98).
 *  [1] Las dos puertas de la portada miden lo mismo y llevan su acción del
 *      mismo color: ninguna designa un ganador (regla de la 94).
 *  [2] En Entrenamiento, con la lista hasta abajo, «Jugar» sigue a la vista y se
 *      puede pinchar, a cuatro tamaños.
 *  [3] Las filas inertes no admiten entrada; 0 «por defecto» encendidos.
 *  [4] El raíl lleva a cada sección y marca la puesta.
 *  [5] La letra y el color de un botón salen de los tokens: el mismo
 *      `font-family` en el juego y en el duelo.
 *  [6] SALIR: no existe en un navegador; en la app sale abajo a la izquierda y
 *      pide `salir` a la ventana.
 */
import { chromium } from 'playwright-core'
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
let fallos = 0
const afirmar = (bien, t, d = '') => { console.log(`  ${bien ? 'OK  ' : 'MAL '} ${t}${d ? ` — ${d}` : ''}`); if (!bien) fallos++ }
const nav = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const errores = []
const TAMANOS = [[1920, 1080], [1600, 900], [1366, 768], [1280, 860]]
let fuenteJuego = ''
for (const [w, h] of TAMANOS) {
  const p = await nav.newPage({ viewport: { width: w, height: h } })
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto('http://127.0.0.1:5192/', { waitUntil: 'load' })
  await p.waitForSelector('.panel__logo', { timeout: 30000 })
  await p.evaluate(() => { try { localStorage.clear() } catch {} })
  await p.reload({ waitUntil: 'load' }); await p.waitForSelector('.panel__logo')
  console.log(`\n== ${w}x${h}`)
  if (w === 1920) {
    afirmar(await p.$('.salir') === null, '[6] en un navegador no hay botón Salir')
  }
  await p.click('text=Jugar ahora'); await p.waitForSelector('.portada')
  const puertas = await p.evaluate(() => [...document.querySelectorAll('.portada__modo')].map((b) => {
    const r = b.getBoundingClientRect(); const cta = getComputedStyle(b.querySelector('.portada__cta'))
    return { w: Math.round(r.width), h: Math.round(r.height), cta: cta.backgroundColor }
  }))
  afirmar(puertas.length === 2 && puertas[0].w === puertas[1].w && puertas[0].h === puertas[1].h && puertas[0].cta === puertas[1].cta,
    '[1] las dos puertas miden y se tiñen igual', JSON.stringify(puertas))
  fuenteJuego = await p.evaluate(() => getComputedStyle(document.querySelector('.portada__cta')).fontFamily)

  await p.click('.cab-rail__item:has-text("Entrenar")'); await p.waitForSelector('.training')
  afirmar(await p.evaluate(() => document.querySelector('.cab-rail__item--activo')?.textContent.trim()) === 'Entrenar', '[4] el raíl marca Entrenar')
  await p.evaluate(() => { const m = document.querySelector('.cab-main'); m.scrollTop = m.scrollHeight })
  await p.waitForTimeout(250)
  const jugar = await p.evaluate(() => {
    const b = document.querySelector('.training__jugar'); const r = b.getBoundingClientRect()
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    const e = document.elementFromPoint(x, y)
    return { dentro: r.top >= 0 && r.bottom <= innerHeight, pinchable: b.contains(e), y: Math.round(r.top) }
  })
  afirmar(jugar.dentro && jugar.pinchable, '[2] con la lista hasta abajo, Jugar se ve y se pincha', JSON.stringify(jugar))
  // Lo que no admite entrada es el control; el «por defecto» de la cabecera se
  // queda deshabilitado aparte (vuelta 94), así que no cuenta aquí.
  const inertes = await p.evaluate(() => [...document.querySelectorAll('.field--inerte')].map((f) =>
    [...f.querySelectorAll('.field__control button, .field__control input, .segmented button, .scenarios button')]
      .every((c) => getComputedStyle(c).pointerEvents === 'none')))
  afirmar(inertes.length > 0 && inertes.every(Boolean), `[3] ${inertes.length} filas inertes sin admitir entrada`)
  const encendidos = await p.evaluate(() => [...document.querySelectorAll('.training .field__default')].filter((b) => !b.disabled).length)
  afirmar(encendidos === 0, '[3] ningún «por defecto» encendido de fábrica', String(encendidos))

  for (const [nombre, sel] of [['Armería', '.panel--armoury'], ['Opciones', '.panel--options'], ['Inicio', '.portada']]) {
    await p.click(`.cab-rail__item:has-text("${nombre}")`)
    const ok = await p.waitForSelector(sel, { timeout: 3000 }).then(() => true).catch(() => false)
    afirmar(ok && (await p.evaluate(() => document.querySelector('.cab-rail__item--activo')?.textContent.trim())) === nombre, `[4] el raíl lleva a ${nombre}`)
  }
  await p.close()
}

// [5] La misma letra de botón en la página del duelo.
{
  const p = await nav.newPage({ viewport: { width: 1366, height: 768 } })
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto('http://127.0.0.1:5192/duelo/', { waitUntil: 'load' })
  // Desde la 101 la página abre en el lobby: el botón que se mide es LISTO.
  // Basta con que esté en la página: la letra se lee igual oculto, y con un
  // huésped sin lobby (`VEKTOR_LOBBY=0`, el grupo B) el lobby no se enseña.
  await p.waitForSelector('#listo', { state: 'attached', timeout: 30000 })
  const f = await p.evaluate(() => getComputedStyle(document.getElementById('listo')).fontFamily)
  afirmar(f === fuenteJuego, '[5] el botón del lobby usa la letra de los botones del juego', f)
  const cuerpo = await p.evaluate(() => getComputedStyle(document.body).fontFamily)
  afirmar(/Bahnschrift/.test(cuerpo), '[5] y la página del duelo ya no es monoespaciada', cuerpo)
  await p.close()
}

// [6] En la app: sale, abajo a la izquierda, y pide `salir`.
{
  const p = await nav.newPage({ viewport: { width: 1600, height: 900 } })
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.addInitScript(() => {
    window.__llamadas = []
    window.__TAURI_INTERNALS__ = { invoke: (orden, args) => { window.__llamadas.push({ orden, args }); return Promise.resolve() } }
    window.__VEKTOR_ESCRITORIO__ = { version: '0.4.0' }
  })
  await p.goto('http://127.0.0.1:5192/', { waitUntil: 'load' })
  await p.waitForSelector('.panel__logo', { timeout: 30000 })
  const r = await p.evaluate(() => { const b = document.querySelector('.salir'); if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.left, y: q.bottom, h: innerHeight, texto: b.textContent.trim(), icono: !!b.querySelector('svg') } })
  afirmar(r && r.x < 80 && r.h - r.y < 80 && r.icono && /Salir/.test(r.texto), '[6] en la app, Salir abajo a la izquierda con su pictograma', JSON.stringify(r))
  await p.click('.salir')
  await p.waitForTimeout(200)
  const llamadas = await p.evaluate(() => window.__llamadas.map((l) => l.orden))
  afirmar(llamadas.includes('salir'), '[6] y pide `salir` a la ventana', JSON.stringify(llamadas))
  afirmar(await p.evaluate(() => document.querySelector('.panel__logo') !== null), '[6] clicar Salir no captura el ratón ni arranca nada')
  await p.close()
}

afirmar(errores.length === 0, 'cero errores de página', errores.slice(0, 3).join(' | '))
await nav.close()
console.log(`\n  ${fallos ? `${fallos} MAL` : 'todo verde'}\n`)
process.exit(fallos ? 1 : 0)
