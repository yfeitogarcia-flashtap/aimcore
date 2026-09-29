// lobby101nav — el lobby con navegadores de verdad (vuelta 101).
import { chromium } from 'playwright-core'
const OUT = '/home/user/aimcore/scratchpad'
let fallos = 0
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}`); if (!c) fallos += 1 }
const lanzar = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const N = Number(process.env.N || 2)
const navs = await Promise.all(Array.from({ length: N }, lanzar))
const pags = await Promise.all(navs.map((n) => n.newPage({ viewport: { width: 1600, height: 900 } })))
const errores = pags.map(() => [])
pags.forEach((p, i) => p.on('pageerror', (e) => errores[i].push(String(e))))
const [A, ...otros] = pags
const BASE = process.env.BASE || 'http://localhost:5192'
await A.goto(`${BASE}/duelo/`, { waitUntil: 'networkidle' })
await A.waitForTimeout(2500)
const sala = () => A.evaluate(() => window.vektorNet.sala)
let e = await sala()
ok(e && e.tu && e.anf === e.tu, `A crea la sala y es el anfitrión (${e?.tu})`)
const vista = (p) => p.evaluate(() => window.vektorNet.vista)
ok((await vista(A)) === 'lobby', 'A ve el lobby')
const lienzoOculto = await A.evaluate(() => getComputedStyle(document.getElementById('lienzo')).display === 'none')
ok(lienzoOculto, 'el mapa no se ve detrás del lobby')
const codigo = await A.evaluate(() => document.getElementById('codigo')?.textContent?.trim())
const enlace = await A.evaluate(() => document.getElementById('enlace')?.value)
console.log('   código', codigo, '· enlace', enlace)
for (const p of otros) { await p.goto(enlace, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500) }
await A.waitForTimeout(800)
e = await sala()
ok(e.m.length === N, `la sala cuenta ${e.m.length} de ${N}`)
await A.screenshot({ path: `${OUT}/lobby101-A.png` })
if (otros[0]) await otros[0].screenshot({ path: `${OUT}/lobby101-B.png` })
const MODO = process.env.MODO || 'duelo'
if (MODO !== 'duelo') {
  await A.evaluate((modo) => window.vektorNet.mandarALaSala({ t: 'lc', modo }), MODO)
  await A.waitForTimeout(600)
}
// Todos pulsan LISTO con el ratón.
for (const p of pags) { await p.click('#listo'); await p.waitForTimeout(250) }
await A.waitForTimeout(600)
e = await sala()
ok(e.req.puede, `con todos listos se puede lanzar (${e.req.listos} listos · «${e.req.motivo}»)`)
await A.screenshot({ path: `${OUT}/lobby101-listos.png` })
await A.click('#lanzar')
await A.waitForTimeout(3000)
const vistas = await Promise.all(pags.map(vista))
ok(vistas.every((v) => v === 'juego'), `todos pasan al juego (${vistas})`)
const est = await Promise.all(pags.map((p) => p.evaluate(() => ({ modo: window.vektorNet.cliente.modo, id: window.vektorNet.cliente.id, bando: window.vektorNet.cliente.bando, mapa: window.vektorNet.motor.scenario.key }))))
console.log('   ', JSON.stringify(est))
ok(est.every((x) => x.modo === MODO && x.id), `bienvenida en modo ${MODO}`)
await pags[0].mouse.click(30, 600)
await pags[0].waitForTimeout(1500)
await A.screenshot({ path: `${OUT}/lobby101-juego.png` })
errores.forEach((er, i) => ok(er.length === 0, `errores de página ${i}: ${er.length} ${er.slice(0, 2).join(' | ')}`))
await Promise.all(navs.map((n) => n.close()))
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
