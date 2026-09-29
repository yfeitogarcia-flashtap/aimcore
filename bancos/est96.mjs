/**
 * est96 — **¿se rehace la lista de imágenes de estampado sin reiniciar?**
 *
 * El punto 4 de la vuelta 96, y lo primero es medir el fallo: la vuelta 95 puso
 * el `focus` y el botón, se dio por arreglado y no funciona. Así que esto mide
 * las tres puertas por separado, con su denominador delante —cuántas opciones
 * hay antes de copiar el fichero— para que «no aparece» no pueda confundirse con
 * «no había ninguna».
 */
import { chromium } from 'playwright-core'
import { copyFileSync, rmSync } from 'node:fs'

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const NUEVA = 'public/estampados/prueba96.webp'

let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}

const navegador = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const p = await navegador.newPage()
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error') errores.push(`consola: ${m.text()}`) })

await p.goto('http://127.0.0.1:5192/editor/', { waitUntil: 'load' })
await p.waitForFunction(() => Boolean(window.vektorEditor), null, { timeout: 20000 })
await p.waitForTimeout(1200)

// Abrir la hoja de Mapa, donde vive la lista de estampados.
await p.evaluate(() => document.querySelector('button[data-pestana="mapa"]')?.click())
await p.waitForTimeout(300)

const opciones = () => p.evaluate(() =>
  [...document.querySelectorAll('#est-imagen option')].map((o) => o.value))

const antes = await opciones()
console.log(`\n[0] La premisa: ${antes.length} imagen(es) en el desplegable al arrancar`)
console.log(`    ${JSON.stringify(antes)}`)
afirmar(antes.length >= 1, 'hay al menos una, así que el desplegable se rellena de verdad')
afirmar(!antes.some((u) => u.includes('prueba96')), 'y la de prueba todavía no está')

// **Un centinela antes de copiar**: si la página se recargara, se lo llevaría.
// Sin él, «la lista se rehace sola» lo cumpliría igual una recarga entera de
// Vite, y entonces lo que está midiendo el [2] no es el aviso que se ha escrito.
await p.evaluate(() => { window.__centinela96 = 'vivo' })

// ---------------------------------------------------- se copia el fichero nuevo
// Cualquier WebP vale: se copia uno de los que ya están, con otro nombre.
copyFileSync('public/estampados/ojoFlicklab.webp', NUEVA)
console.log('\n[1] Copiado public/estampados/prueba96.webp con la página ya abierta')

// **El endpoint la ve, y se comprueba desde fuera de la página**: un `fetch`
// desde dentro dejaría la respuesta en la caché del navegador, y entonces el
// botón de abajo la releería de ahí y saldría verde sin haber pedido nada. Es
// el confundido de orden de la vuelta 46 aplicado a una caché.
const { execFileSync } = await import('node:child_process')
const delServidor = JSON.parse(execFileSync('curl', ['-s', 'http://127.0.0.1:5192/__editor/estampados'], { encoding: 'utf8' })).imagenes.map((i) => i.nombre)
console.log(`    el endpoint devuelve ${JSON.stringify(delServidor)}`)
afirmar(delServidor.includes('prueba96.webp'), 'el servidor la ve al instante')

// -------------------------------------------- [2] el aviso del servidor (96)
/**
 * **La puerta buena**: el fichero ya está copiado y **no se ha tocado nada**.
 * Si la lista se rehace sola es porque el vigilante de Vite lo ha visto y lo ha
 * dicho por el canal de HMR. Sin foco, sin botón y sin temporizador.
 */
console.log('\n[2] El aviso del servidor, sin tocar nada')
await p.waitForTimeout(1500)
const solo = await opciones()
console.log(`    ${JSON.stringify(solo)}`)
afirmar(solo.some((u) => u.includes('prueba96')), 'la lista se rehace sola al aparecer el fichero')
const centinela = await p.evaluate(() => window.__centinela96 ?? 'perdido')
afirmar(centinela === 'vivo', `y sin recargar la página (centinela: ${centinela})`)

// ------------------------------------------------------------ [3] el botón
console.log('\n[3] El botón «buscar imágenes nuevas», y lo que dice')
const hayBoton = await p.evaluate(() => Boolean(document.getElementById('est-buscar')))
afirmar(hayBoton, 'el botón existe en la página')
await p.evaluate(() => { document.getElementById('est-buscar').click() })
await p.waitForTimeout(700)
const dice = await p.evaluate(() => {
  const n = document.getElementById('est-buscados')
  return { texto: n?.textContent ?? '', oculto: n?.hidden ?? true }
})
console.log(`    dice: ${JSON.stringify(dice)}`)
afirmar(!dice.oculto && /imágenes?|imagen/.test(dice.texto),
  'y dice cuántas ha encontrado — un botón que repinta en silencio es un botón roto')
const tras = await opciones()
afirmar(tras.some((u) => u.includes('prueba96')), 'el botón deja la lista con la nueva')

// ------------------------------------------------------- [4] y también al irse
console.log('\n[4] Y borrarla también se entera')
rmSync(NUEVA, { force: true })
await p.waitForTimeout(1500)
const sinElla = await opciones()
console.log(`    ${JSON.stringify(sinElla)}`)
afirmar(!sinElla.some((u) => u.includes('prueba96')), 'quitar el fichero la saca de la lista')

rmSync(NUEVA, { force: true })
rmSync('public/estampados/prueba96b.webp', { force: true })

console.log(`\nErrores de página: ${errores.length}`)
for (const e of errores.slice(0, 6)) console.log(`    ${e}`)
afirmar(errores.length === 0, 'cero errores de página')

await navegador.close()
console.log(`\n${fallos === 0 ? 'VERDE' : `ROJO — ${fallos} fallo(s)`}`)
process.exit(fallos === 0 ? 0 : 1)
