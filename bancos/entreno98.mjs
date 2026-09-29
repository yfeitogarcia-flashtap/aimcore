/**
 * entreno98 — la pantalla de Entrenamiento de la vuelta 98 (punto 4).
 *  [1] Los grupos van en el orden pedido.
 *  [2] Pulsar un modo **no arranca** la partida, lo marca; sólo el marcado va en verde.
 *  [3] «Jugar» dice sólo «Jugar», se ve con la lista abajo del todo y arranca el modo marcado.
 * A 1920×1080, 1366×768 y 1280×860.
 */
import { chromium } from 'playwright-core'
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
let fallos = 0
const afirmar = (bien, texto) => { console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`); if (!bien) fallos++ }
const navegador = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const ORDEN = ['Modo', 'Dónde se juega', 'Contra qué disparas', 'Dificultad', 'Dianas simultáneas y movimiento', 'El resto']
for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 860]]) {
  console.log(`\n--- ${w}×${h}`)
  const ctx = await navegador.newContext({ viewport: { width: w, height: h } })
  const p = await ctx.newPage()
  const errores = []
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto('http://127.0.0.1:5192/', { waitUntil: 'load' })
  await p.waitForTimeout(1200)
  await p.click('text=Jugar ahora')
  await p.waitForTimeout(300)
  await p.click('button:has-text("Entrenamiento")')
  await p.waitForTimeout(500)
  const titulos = await p.$$eval('.training__grupo-titulo', (t) => t.map((x) => x.textContent))
  afirmar(JSON.stringify(titulos) === JSON.stringify(ORDEN), `grupos: ${titulos.join(' → ')}`)
  const estado = () => p.evaluate(() => ({
    fase: window.aimcore.phase,
    opciones: [...document.querySelectorAll('.interruptor__opcion')].map((b) => ({
      n: b.querySelector('.interruptor__nombre').textContent,
      marcado: b.getAttribute('aria-checked') === 'true',
      fondo: getComputedStyle(b).backgroundColor,
      color: getComputedStyle(b).color,
    })),
  }))
  const a = await estado()
  afirmar(a.opciones.length === 2 && a.opciones.filter((o) => o.marcado).length === 1, `dos modos y uno marcado (${a.opciones.map((o) => `${o.n}${o.marcado ? ' ●' : ''}`).join(' / ')})`)
  await p.click('.interruptor__opcion >> nth=1')
  await p.waitForTimeout(300)
  const b = await estado()
  afirmar(b.fase === a.fase, `pulsar el segundo modo no arranca nada (fase ${b.fase})`)
  afirmar(b.opciones[1].marcado && !b.opciones[0].marcado, 'y queda marcado él')
  // Desde la 99 (Cabina) lo verde es el fondo del marcado, no su letra.
  afirmar(b.opciones[1].fondo === 'rgb(47, 203, 130)' && b.opciones[0].fondo !== 'rgb(47, 203, 130)',
    `sólo el marcado va en verde (${b.opciones.map((o) => o.fondo).join(' / ')})`)
  const guardado = await p.evaluate(async () => (await import('/src/settings.js')).getSettings().trainingMode)
  afirmar(guardado === 'deathmatch', `el ajuste dice ${guardado}`)
  // Hasta abajo, y el botón sigue ahí.
  await p.evaluate(() => { const x = document.querySelector('.cab-main'); x.scrollTop = x.scrollHeight })
  await p.waitForTimeout(200)
  const jugar = await p.evaluate(() => {
    const bt = document.querySelector('.training__jugar'); const r = bt.getBoundingClientRect()
    const panel = document.querySelector('.cab-main').getBoundingClientRect()
    return { texto: bt.textContent.trim(), dentro: r.top >= panel.top && r.bottom <= panel.bottom && r.bottom <= innerHeight, pinchable: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.training__jugar') === bt }
  })
  afirmar(jugar.texto === 'Jugar', `el botón dice «${jugar.texto}»`)
  afirmar(jugar.dentro && jugar.pinchable, 'con la lista abajo del todo está dentro y se puede pinchar')
  await p.evaluate(() => { const x = document.querySelector('.cab-main'); x.scrollTop = 0 })
  await p.waitForTimeout(150)
  const arriba = await p.evaluate(() => {
    const bt = document.querySelector('.training__jugar'); const r = bt.getBoundingClientRect()
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.training__jugar') === bt && r.bottom <= innerHeight
  })
  afirmar(arriba, 'y arriba del todo también (pegado abajo)')
  if (w === 1366) await p.screenshot({ path: 'scratchpad/entreno98.png' })
  await p.click('.training__jugar')
  await p.waitForTimeout(800)
  const tras = await p.evaluate(() => ({ fase: window.aimcore.phase, modo: window.aimcore.sessionMode ?? window.aimcore.mode ?? null }))
  afirmar(tras.fase !== 'idle', `«Jugar» arranca (fase ${tras.fase}, modo ${tras.modo})`)
  afirmar(errores.length === 0, `sin errores de página (${errores.length}) ${errores.slice(0, 1)}`)
  await ctx.close()
}
await navegador.close()
console.log(`\n${fallos === 0 ? 'TODO BIEN' : `${fallos} FALLOS`}`)
process.exit(fallos ? 1 : 0)
