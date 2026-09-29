/**
 * borrador99 — el borrador de Alchemist no resucita una versión vieja.
 *  [0] Abrir un mapa sin tocarlo no escribe borrador.
 *  [1] Editarlo sí, y con su base (lo que hay en el disco).
 *  [2] Un borrador cuya base es el disco de hoy se recupera, como siempre.
 *  [3] Uno de antes de la 99 (sin base) o con base vieja NO se abre: se aparta,
 *      se abre el disco, y la hoja Archivo lo ofrece.
 *  [4] Abrirlo apartado lo pone delante y cuenta como cambio; tirarlo lo borra.
 */
import { chromium } from 'playwright-core'
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
let fallos = 0
const afirmar = (bien, t, d = '') => { console.log(`  ${bien ? 'OK  ' : 'MAL '} ${t}${d ? ` — ${d}` : ''}`); if (!bien) fallos++ }
const nav = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const p = await nav.newPage({ viewport: { width: 1600, height: 900 } })
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))
const B = 'vektor.editor.borrador.v1', A = 'vektor.editor.borrador-apartado.v1'
const abrir = async (hash = '') => {
  await p.goto('about:blank')
  await p.goto(`http://127.0.0.1:5192/editor/${hash}`, { waitUntil: 'load' })
  await p.waitForFunction(() => Boolean(window.vektorEditor), null, { timeout: 30000 })
  await p.waitForTimeout(1200)
}
const ls = (k) => p.evaluate((k) => localStorage.getItem(k), k)
const zona = () => p.evaluate(() => JSON.stringify(window.vektorEditor.mapa.spawnZone))

console.log('\n== borrador99 ==\n')
await abrir('#largoYPuerta')
await p.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await abrir('#largoYPuerta')
const disco = await zona()
console.log(`  disco: spawnZone ${disco}`)
afirmar(await ls(B) === null, '[0] abrir Largo y Puerta sin tocarlo no escribe borrador')

await p.evaluate(() => { window.vektorEditor.mapa.spawn.x = 3; window.vektorEditor.marcarSucio() })
await p.waitForTimeout(900)
const escrito = JSON.parse(await ls(B) ?? 'null')
afirmar(escrito?.v === 2 && escrito.mapa.spawn.x === 3 && typeof escrito.base === 'string' && escrito.base.length > 10, '[1] editar escribe el borrador con su base')

await abrir('')
afirmar(await p.evaluate(() => window.vektorEditor.mapa.spawn.x) === 3 && await ls(A) === null, '[2] con la base igual al disco se recupera como siempre')

// [3] El borrador que había en el PC de Yago: de antes de la 99, con la zona vieja.
await p.evaluate(({ B, disco }) => {
  const viejo = JSON.parse(JSON.stringify(window.vektorEditor.mapa))
  viejo.spawn.x = 0
  viejo.spawnZone = [{ x: -20, z: 16, w: 40, d: 4 }]
  localStorage.setItem(B, JSON.stringify(viejo))
  localStorage.removeItem('vektor.editor.borrador-apartado.v1')
}, { B, disco })
await abrir('')
afirmar(await zona() === disco, '[3] un borrador sin base no se abre: delante está el disco', await zona())
afirmar(await ls(B) === null && JSON.parse(await ls(A) ?? 'null')?.mapa?.spawnZone?.[0]?.z === 16, '    y queda apartado, no borrado')
afirmar(await p.evaluate(() => !document.getElementById('apartado').hidden), '    y la hoja Archivo lo ofrece')
afirmar(/apartado/.test(await p.evaluate(() => document.getElementById('estado').textContent)), '    y la barra lo dice', await p.evaluate(() => document.getElementById('estado').textContent))
await p.waitForTimeout(800)
afirmar(await ls(B) === null, '    y abrir el disco no vuelve a escribir borrador')

// [3b] Con base vieja (no la de hoy).
await p.evaluate(({ B }) => {
  const m = JSON.parse(JSON.stringify(window.vektorEditor.mapa)); m.spawn.x = 5
  localStorage.setItem(B, JSON.stringify({ v: 2, mapa: m, base: '{"viejo":true}' }))
}, { B })
await abrir('#largoYPuerta')
afirmar(await p.evaluate(() => window.vektorEditor.mapa.spawn.x) !== 5 && JSON.parse(await ls(A) ?? 'null')?.mapa?.spawn?.x === 5, '[3b] con base vieja, también por la dirección, se aparta')

// [4] Abrir el apartado y tirarlo.
await p.evaluate(() => document.getElementById('abrir-apartado').click())
await p.waitForTimeout(900)
afirmar(await p.evaluate(() => window.vektorEditor.mapa.spawn.x) === 5 && await ls(A) === null, '[4] abrir el apartado lo pone delante')
afirmar(JSON.parse(await ls(B) ?? 'null')?.mapa?.spawn?.x === 5, '    y cuenta como cambio sin guardar (borrador escrito)')
await p.evaluate(({ A }) => localStorage.setItem(A, JSON.stringify({ v: 2, mapa: { clave: 'x' }, base: null })), { A })
await p.evaluate(() => document.getElementById('tirar-apartado').click())
afirmar(await ls(A) === null, '    tirarlo lo borra')

await p.evaluate(() => { localStorage.clear() })
afirmar(errores.length === 0, 'cero errores de página', errores.join(' | '))
await nav.close()
console.log(`\n  ${fallos ? `${fallos} MAL` : 'todo verde'}\n`)
process.exit(fallos ? 1 : 0)
