/**
 * duelomenu98 — el menú del duelo de la vuelta 98 (puntos 5, 6 y 7).
 *  [1] Solo en la sala: ni «Pausar» ni «Volver» (desde la vuelta 101 crear la
 *      sala es el lobby, y el menú de ESC es sólo de la partida).
 *  [2] El botón del teclado abre una tabla con las teclas de los binds.
 *  [3] Con el rival dentro: «Pausar» y «Salir de la partida».
 *  El «Volver» de la 98 y su punto [4] se fueron con la 101: lo que guardaba
 *  —poder volver al menú antes de jugar— lo hace ahora el lobby.
 * Contra `bash bancos/dev.sh` (5192) y el huésped (5199).
 */
import { chromium } from 'playwright-core'
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
let fallos = 0
const afirmar = (bien, texto) => { console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`); if (!bien) fallos++ }
const nav1 = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const nav2 = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const visibles = (p) => p.evaluate(() => Object.fromEntries(['volver', 'pausar', 'opciones', 'teclado', 'salir'].map((id) => {
  const b = document.getElementById(id); return [id, Boolean(b && !b.hidden && b.offsetParent !== null)]
})))
const a = await (await nav1.newContext({ viewport: { width: 1366, height: 768 } })).newPage()
const errores = []
a.on('pageerror', (e) => errores.push(String(e)))
await a.goto('http://127.0.0.1:5192/duelo/', { waitUntil: 'load' })
await a.waitForTimeout(3000)
console.log('[1] Solo, creando la sala')
const solo = await visibles(a)
afirmar(!solo.volver && !solo.pausar && solo.opciones && solo.teclado, `botones: ${JSON.stringify(solo)}`)
console.log('\n[2] La tabla de controles')
afirmar(await a.$eval('#tablaControles', (t) => t.hidden), 'cerrada de salida')
await a.click('#teclado')
await a.waitForTimeout(200)
const tabla = await a.$$eval('#tablaControles tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent)))
afirmar(tabla.length >= 14, `${tabla.length} filas`)
const agachar = tabla.find((f) => /Agachar/.test(f[0]))
afirmar(agachar?.[1] === 'C', `agacharse: ${agachar?.[1]}`)
afirmar(tabla.some((f) => f[1] === 'ESC') && tabla.some((f) => f[1] === 'F3'), 'con ESC y F3 escritas')
await a.screenshot({ path: 'scratchpad/duelomenu98.png' })
const enlace = await a.$eval('#enlace', (e) => e.value)
console.log('\n[3] Entra el rival')
const b = await (await nav2.newContext({ viewport: { width: 1366, height: 768 } })).newPage()
b.on('pageerror', (e) => errores.push(String(e)))
await b.goto(enlace.replace(/^https?:\/\/[^/]+/, 'http://127.0.0.1:5192'), { waitUntil: 'load' })
await a.waitForTimeout(3500)
const conRival = await visibles(a)
afirmar(!conRival.volver && conRival.pausar && conRival.salir, `botones con partida: ${JSON.stringify(conRival)}`)
afirmar(errores.length === 0, `sin errores de página (${errores.length}) ${errores.slice(0, 2)}`)
await nav1.close(); await nav2.close()
console.log(`\n${fallos === 0 ? 'TODO BIEN' : `${fallos} FALLOS`}`)
process.exit(fallos ? 1 : 0)
