/**
 * controles97 — **¿dice el juego la tecla que el jugador tiene puesta?**
 *
 * El punto 2 del encargo, la segunda mitad: «que todos los textos del juego que
 * muestran controles lean la tecla que el jugador tiene configurada, en vez de
 * tener "C" escrito a mano». Así que esto se mide **contra la página**, con el
 * bind cambiado de verdad, y en los dos sitios:
 *
 *  [0] La premisa, que es lo que hace legible todo lo demás: con los ajustes de
 *      fábrica la pantalla de inicio dice **C**.
 *  [1] Reasignando agacharse a la **Z**, los rótulos cambian — en la pantalla de
 *      inicio, en la armería y en el menú del duelo.
 *  [2] Con el agente de usuario de la app, sin tocar nada, agacharse sale en
 *      **CTRL IZQ** y el aviso naranja de «Ctrl cierra la pestaña» no aparece.
 *  [3] Y el interruptor de pantalla completa sale **sólo** en la app.
 *
 * Contra el servidor de desarrollo (`bash bancos/dev.sh`, puerto 5192).
 */
import { chromium } from 'playwright-core'

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const UA_APP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 VektorEscritorio/0.2'

let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}

const navegador = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})

/** Abre el juego con el agente de usuario que se le diga y los binds guardados. */
async function abrirJuego({ ua, binds }) {
  const ctx = await navegador.newContext({
    viewport: { width: 1600, height: 900 },
    ...(ua ? { userAgent: ua } : {}),
  })
  const p = await ctx.newPage()
  const errores = []
  p.on('pageerror', (e) => errores.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errores.push(`consola: ${m.text()}`) })
  if (binds) {
    await p.addInitScript((valor) => {
      window.localStorage.setItem('aimcore.keybinds.v1', valor)
    }, JSON.stringify(binds))
  }
  await p.goto('http://127.0.0.1:5192/', { waitUntil: 'load' })
  await p.waitForTimeout(1200)
  return { ctx, p, errores }
}

/** Los pares tecla/verbo del segundo paso de la pantalla de inicio. */
async function teclasDeInicio(p) {
  await p.click('text=Jugar ahora')
  await p.waitForTimeout(400)
  return p.evaluate(() =>
    [...document.querySelectorAll('.teclas__par')].map((li) => ({
      tecla: li.querySelector('.cab-tecla')?.textContent?.trim(),
      que: li.querySelector('.teclas__que')?.textContent?.trim(),
    })))
}

/**
 * Abre la captura de «Agacharse» y pulsa Ctrl de verdad. Devuelve si la captura
 * llegó a empezar —sin eso, las dos filas de después no miden nada—, la tecla
 * que quedó puesta y el aviso naranja si lo hubo.
 */
async function intentarPonerCtrl(p) {
  const fila = p.locator('.bind', { hasText: 'Agacharse' }).first()
  await fila.locator('.bind__key').click()
  await p.waitForTimeout(250)
  const capturando = (await fila.locator('.bind__key').textContent()).trim() === 'pulsa una tecla…'
  await p.keyboard.down('Control')
  await p.keyboard.up('Control')
  await p.waitForTimeout(300)
  const error = await fila.locator('.bind__error').count()
    ? (await fila.locator('.bind__error').textContent()).trim()
    : null
  return { capturando, tecla: (await fila.locator('.bind__key').textContent()).trim(), error }
}

const deAgacharse = (pares) => pares.find((t) => t.que === 'agacharte')?.tecla
const deMover = (pares) => pares.find((t) => t.que === 'moverte')?.tecla

console.log('\n[0] La premisa: de fábrica, en un navegador')
{
  const { ctx, p, errores } = await abrirJuego({})
  const pares = await teclasDeInicio(p)
  afirmar(deAgacharse(pares) === 'C', `agacharse sale en «${deAgacharse(pares)}»`)
  afirmar(deMover(pares) === 'WASD', `y moverse en «${deMover(pares)}» (las cuatro, compuestas)`)
  afirmar(errores.length === 0, `sin errores de página (${errores.length})`)
  await ctx.close()
}

console.log('\n[1] Con agacharse reasignada a la Z')
{
  const { ctx, p, errores } = await abrirJuego({
    binds: { crouch: 'KeyZ', armoury: 'KeyN', throwable: 'KeyH' },
  })
  const pares = await teclasDeInicio(p)
  afirmar(deAgacharse(pares) === 'Z', `la pantalla de inicio dice «${deAgacharse(pares)}»`)
  afirmar(pares.find((t) => t.que === 'armería')?.tecla === 'N',
    `y la armería dice «${pares.find((t) => t.que === 'armería')?.tecla}»`)

  // La armería: la tecla de cada ranura. La de arrojadizos es la G de fábrica,
  // así que se reasignó al abrir para que la fila signifique algo.
  await p.click('text=Armería')
  await p.waitForTimeout(500)
  const ranuras = await p.evaluate(() =>
    [...document.querySelectorAll('.armoury__ranura')].map((b) => ({
      nombre: b.querySelector('.armoury__ranura-nombre')?.textContent?.trim(),
      tecla: b.querySelector('.armoury__ranura-tecla')?.textContent?.trim(),
    })))
  const arrojadizas = ranuras.find((r) => r.nombre === 'Arrojadizas')
  afirmar(/(^|\s)H$/.test(arrojadizas?.tecla ?? ''), `la armería dice «${arrojadizas?.tecla}» para las arrojadizas (era una G escrita a mano)`)
  const primarias = ranuras.find((r) => r.nombre === 'Primarias')
  afirmar(/(^|\s)1$/.test(primarias?.tecla ?? ''), `y «${primarias?.tecla}» para las primarias, que no se tocó`)
  afirmar(errores.length === 0, `sin errores de página (${errores.length})`)
  await ctx.close()
}

console.log('\n[1b] Y el menú del duelo, que tenía la C escrita en el HTML')
{
  const ctx = await navegador.newContext({ viewport: { width: 1600, height: 900 } })
  const p = await ctx.newPage()
  await p.addInitScript(() => {
    window.localStorage.setItem('aimcore.keybinds.v1', JSON.stringify({ crouch: 'KeyZ' }))
  })
  await p.goto('http://127.0.0.1:5192/duelo/', { waitUntil: 'load' })
  await p.waitForTimeout(1500)
  // Desde la vuelta 98 es una tabla de dos columnas: se lee celda a celda.
  const linea = await p.evaluate(() => [...document.querySelectorAll('#controles tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()).join(' ')).join(' · '))
  afirmar(/Agacharse\s+Z\b/.test(linea), `la línea de controles dice «${linea}»`)
  afirmar(!/Agacharse\s+C\b/.test(linea), 'y ya no dice C')
  afirmar(/Números de red\s+F3/.test(linea), 'con la F3 de esta página, que no es un bind, escrita')
  await ctx.close()
}

console.log('\n[2] Con el agente de usuario de la app, sin tocar ningún bind')
{
  const { ctx, p, errores } = await abrirJuego({ ua: UA_APP })
  const pares = await teclasDeInicio(p)
  afirmar(deAgacharse(pares) === 'CTRL IZQ', `agacharse sale en «${deAgacharse(pares)}»`)

  // El aviso naranja: el que salía al intentar poner Ctrl. Se abre el panel de
  // controles y se pulsa Ctrl de verdad sobre el botón de agacharse.
  await p.click('text=Opciones')
  await p.waitForTimeout(600)
  const tras = await intentarPonerCtrl(p)
  afirmar(tras.capturando, 'el panel entra en captura')
  afirmar(tras.error === null, `y no sale el aviso naranja (${tras.error ?? 'ninguno'})`)
  afirmar(tras.tecla === 'CTRL IZQ', `y la tecla queda en «${tras.tecla}»`)

  const nota = await p.evaluate(() =>
    [...document.querySelectorAll('.field__hint')].map((s) => s.textContent).join(' '))
  afirmar(!/Ctrl\+W cierra la pestaña/.test(nota), 'y la nota de abajo no habla de cerrar pestañas')

  console.log('\n[2b] F11 y el ajuste son el mismo valor, y llegan a la ventana')
  // El puente de Tauri, de mentira: lo de verdad lo pone la ventana nativa, y lo
  // único que esta página puede medir es **que lo llama y con qué**. Que la
  // ventana obedezca es de Rust y se comprueba abriéndola.
  await p.keyboard.press('Escape')
  await p.waitForTimeout(400)
  const f11 = await p.evaluate(async () => {
    const llamadas = []
    window.__TAURI__ = { core: { invoke: (orden, args) => { llamadas.push({ orden, args }); return Promise.resolve() } } }
    const mod = await import('/src/escritorio.js')
    const ajustes = await import('/src/settings.js')
    const antes = ajustes.getSettings().pantallaCompleta
    mod.montarPantallaCompleta()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F11', bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    return { antes, despues: ajustes.getSettings().pantallaCompleta, llamadas }
  })
  afirmar(f11.antes === false, `el ajuste parte de ${f11.antes}`)
  afirmar(f11.despues === true, `F11 lo pone en ${f11.despues}`)
  const ultima = f11.llamadas[f11.llamadas.length - 1]
  afirmar(ultima?.orden === 'pantalla_completa' && ultima?.args?.activa === true,
    `y la ventana recibe ${JSON.stringify(ultima)}`)

  console.log('\n[3] El interruptor de pantalla completa')
  await p.click('text=Opciones')
  await p.waitForTimeout(600)
  const enLaApp = await p.evaluate(() =>
    [...document.querySelectorAll('.field__label')].some((s) => /pantalla completa/i.test(s.textContent)))
  afirmar(enLaApp, 'sale en la app')
  afirmar(errores.length === 0, `sin errores de página (${errores.length})`)
  await ctx.close()
}
{
  const { ctx, p, errores } = await abrirJuego({})
  await p.click('text=Jugar ahora')
  await p.waitForTimeout(300)
  await p.click('text=Opciones')
  await p.waitForTimeout(600)

  // **El denominador de [2]**: el mismo gesto en un navegador sí avisa y no
  // asigna nada. Sin esta fila, «no sale el aviso» lo cumpliría también un panel
  // en el que la captura no llegara a empezar.
  const enNavegadorCtrl = await intentarPonerCtrl(p)
  afirmar(enNavegadorCtrl.capturando, 'navegador: el panel entra en captura igual')
  afirmar(typeof enNavegadorCtrl.error === 'string' && /Ctrl\+W/.test(enNavegadorCtrl.error),
    `navegador: y aquí sí sale el aviso — «${enNavegadorCtrl.error}»`)
  afirmar(enNavegadorCtrl.tecla === 'pulsa una tecla…' || enNavegadorCtrl.tecla === 'C',
    `navegador: y no se asigna (${enNavegadorCtrl.tecla})`)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(200)

  const enNavegador = await p.evaluate(() =>
    [...document.querySelectorAll('.field__label')].some((s) => /pantalla completa/i.test(s.textContent)))
  afirmar(!enNavegador, 'y no sale en un navegador, donde no podría funcionar')
  afirmar(errores.length === 0, `sin errores de página (${errores.length})`)
  await ctx.close()
}

await navegador.close()
console.log(`\n${fallos === 0 ? 'TODO VERDE' : `${fallos} FALLOS`}`)
process.exit(fallos === 0 ? 0 : 1)
