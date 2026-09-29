// compra102nav — la compra sin límite con dos navegadores, contra el producto.
import { chromium } from 'playwright-core'
const OUT = '/home/user/aimcore/scratchpad'
let fallos = 0
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}`); if (!c) fallos += 1 }
const lanzar = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const BASE = 'http://localhost:5199'
const [na, nb] = await Promise.all([lanzar(), lanzar()])
const A = await na.newPage({ viewport: { width: 1366, height: 768 } })
const B = await nb.newPage({ viewport: { width: 1366, height: 768 } })
const err = []; for (const p of [A, B]) p.on('pageerror', (e) => err.push(String(e)))
await A.goto(`${BASE}/duelo/`, { waitUntil: 'networkidle' }); await A.waitForTimeout(2500)
const enlace = await A.evaluate(() => document.querySelector('#enlace')?.value)
await B.goto(enlace, { waitUntil: 'networkidle' }); await B.waitForTimeout(2500)
await A.getByRole('radio', { name: 'Sin límite' }).click(); await A.waitForTimeout(500)
ok(await B.evaluate(() => window.vektorNet.sala?.compra) === -1, 'B ve la compra sin límite en el lobby')
await A.screenshot({ path: `${OUT}/compra102-lobby.png` })
for (const p of [A, B]) { await p.click('#listo'); await p.waitForTimeout(300) }
await A.click('#lanzar'); await A.waitForTimeout(3000)
const fase = (p) => p.evaluate(() => window.vektorNet.cliente.rondas)
let rA = await fase(A)
ok(rA.fase === 'compra' && rA.sinLimite, `en compra sin límite (${rA.fase}, ${rA.sinLimite})`)
for (const p of [A, B]) { await p.mouse.click(30, 30); await p.waitForTimeout(600) }
ok(/LISTOS 0\/2/.test(await A.textContent('#rondaTiempo')), `el reloj dice los listos: «${await A.textContent('#rondaTiempo')}»`)
ok(/LISTO/.test(await A.textContent('#rondaFase')), `y el rótulo cómo se acaba: «${await A.textContent('#rondaFase')}»`)
await A.waitForTimeout(4000)
ok((await fase(A)).fase === 'compra', 'pasados unos segundos sigue en compra')
await A.keyboard.press('KeyB'); await A.waitForTimeout(700)
ok(await A.isVisible('#tiendaListo'), 'la tienda enseña el «Listo»')
await A.screenshot({ path: `${OUT}/compra102-tienda.png` })
await A.click('#tiendaListo'); await A.waitForTimeout(1500)
ok(await A.evaluate(() => document.getElementById('tienda').hidden), 'marcarlo cierra la tienda')
ok(await A.evaluate(() => window.vektorNet.cliente.listoEnCompra), 'y A cuenta como listo')
ok(/LISTOS 1\/2/.test(await B.textContent('#rondaTiempo')), `B lo ve: «${await B.textContent('#rondaTiempo')}»`)
await B.keyboard.press('KeyB'); await B.waitForTimeout(700)
await B.keyboard.press('Enter'); await B.waitForTimeout(1500)
const rB = await fase(B)
ok(rB.fase === 'ronda', `Intro en la tienda de B: empieza la ronda (${rB.fase})`)
ok(err.length === 0, `sin errores de página (${err.length}) ${err.slice(0, 2)}`)
await na.close(); await nb.close()
console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
