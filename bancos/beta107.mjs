// beta107 — lo imprescindible de la beta (vuelta 107): «Cómo se juega», el
// buzón de feedback y el contador, contra el huésped (5199) lanzado con
// `VEKTOR_FEEDBACK_CLAVE=banco107`.
//  [1] El buzón: acepta un mensaje, rechaza uno vacío y frena al sexto seguido;
//      la página de leer sólo existe con la clave.
//  [2] El contador: un entrenamiento se suma, sin cookies.
//  [3] En el juego: «Cómo se juega» sale la primera vez tras «Jugar ahora», con
//      las teclas del bind, y no vuelve a salir; se abre desde la portada.
//  [4] Opciones → «Enviar feedback» lo manda con el mapa, y se lee con la clave.
import { chromium } from 'playwright-core'

const BASE = process.env.BASE || 'http://localhost:5199'
let fallos = 0
const ok = (t, c, d = '') => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}${d ? ` — ${d}` : ''}`); if (!c) fallos += 1 }
const post = (ruta, cuerpo) => fetch(`${BASE}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
const salud = await (await fetch(`${BASE}/salud`)).json()
ok('premisa: contesta el huésped', salud.ok === true)

console.log('\n[1] El buzón')
const marca = `banco107 ${Date.now()}`
let r = await post('/feedback', { texto: marca, donde: 'banco', modo: 'duelo', mapa: 'duelo', version: 'x' })
ok('un mensaje se acepta', r.status === 200, String(r.status))
r = await post('/feedback', { texto: '   ' })
ok('uno vacío, no', r.status === 400, String(r.status))
ok('sin clave, la página de leer no existe', (await fetch(`${BASE}/feedback/leer`)).status === 404 && (await fetch(`${BASE}/feedback/leer?clave=otra`)).status === 404)
const pagina = await (await fetch(`${BASE}/feedback/leer?clave=banco107`)).text()
ok('con la clave, se lee, con su mapa', pagina.includes(marca) && pagina.includes('duelo'))

console.log('\n[2] El contador')
const antes = await (await fetch(`${BASE}/contador`)).text()
const entrenos = (t) => Number((t.match(/<tr><td>\d{4}-\d\d-\d\d<\/td><td>\d+<\/td><td>\d+<\/td><td>\d+<\/td><td>(\d+)<\/td>/) ?? [])[1] ?? 0)
const e0 = entrenos(antes)
r = await fetch(`${BASE}/contador/entreno`, { method: 'POST' })
const e1 = entrenos(await (await fetch(`${BASE}/contador`)).text())
ok('un entrenamiento suma uno', r.status === 204 && e1 === e0 + 1, `${e0} → ${e1}`)
ok('y la página no pone cookies', !r.headers.get('set-cookie'))

console.log('\n[3] Cómo se juega')
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const p = await nav.newPage({ viewport: { width: 1366, height: 768 } })
// Un navegador automatizado no ve «Cómo se juega» salvo que lo pida (src/beta.js).
await p.addInitScript(() => { window.__vkComoSeJuega = true })
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))
await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await p.click('text=Jugar ahora')
await p.waitForTimeout(400)
const como = p.locator('.panel--como')
ok('sale la primera vez', (await como.count()) === 1)
const texto = await como.innerText()
ok('con las teclas del bind', /\bC\b/.test(texto) && /\bB\b/.test(texto) && /\bR\b/.test(texto), texto.slice(0, 80).replace(/\n/g, ' '))
await p.click('.panel--como >> text=Entendido')
await p.waitForTimeout(300)
ok('«Entendido» lo cierra', (await como.count()) === 0)
await p.reload({ waitUntil: 'networkidle' })
await p.click('text=Jugar ahora')
await p.waitForTimeout(400)
ok('y no vuelve a salir', (await p.locator('.panel--como').count()) === 0)
await p.click('.portada__como')
await p.waitForTimeout(300)
ok('se abre desde la portada', (await p.locator('.panel--como').count()) === 1)
await p.keyboard.press('Escape')
await p.waitForTimeout(300)

console.log('\n[4] Enviar feedback desde Opciones')
await p.click('.cab-rail__item:has-text("Opciones")')
await p.waitForTimeout(400)
await p.click('#enviar-feedback')
await p.waitForTimeout(300)
const marca2 = `desde el juego ${Date.now()}`
await p.fill('.feedback__texto', marca2)
ok('dice lo que viaja', /Se envía tu texto con entrenamiento/.test(await p.locator('.panel--feedback').innerText()))
await p.click('.panel--feedback button.button--primary')
await p.waitForTimeout(800)
ok('«Enviado»', (await p.locator('.feedback__ok').count()) === 1)
const leido = await (await fetch(`${BASE}/feedback/leer?clave=banco107`)).text()
ok('y se lee, con la pantalla y el mapa', leido.includes(marca2) && /entrenamiento/.test(leido))
await p.keyboard.press('Escape')
await p.waitForTimeout(300)
ok('ESC vuelve a Opciones, no las cierra', (await p.locator('.panel--options').count()) === 1)

console.log('\n[5] El freno')
for (let i = 0; i < 3; i++) await post('/feedback', { texto: `relleno ${i}` })
r = await post('/feedback', { texto: 'uno de más' })
ok('el sexto seguido desde el mismo sitio espera', r.status === 429, String(r.status))

ok('ni un error de página', errores.length === 0, errores.slice(0, 2).join(' | '))
await nav.close()
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
