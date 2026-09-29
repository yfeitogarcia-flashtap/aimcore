// todos105nav — la pantalla del lobby del todos contra todos dice el rango
// («3–10 jugadores») en la tarjeta del mapa, en su pista y en el resumen.
import { chromium } from 'playwright-core'
let fallos = 0
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}`); if (!c) fallos += 1 }
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const A = await nav.newPage({ viewport: { width: 1600, height: 900 } })
const errores = []
A.on('pageerror', (e) => errores.push(String(e)))
await A.goto(`${process.env.BASE || 'http://localhost:5199'}/duelo/`, { waitUntil: 'networkidle' })
await A.waitForTimeout(2500)
await A.evaluate(() => window.vektorNet.mandarALaSala({ t: 'lc', modo: 'todos' }))
await A.waitForTimeout(900)
const t = await A.evaluate(() => ({
  tarjetas: [...document.querySelectorAll('.lobby-carrusel__plazas')].map((e) => e.textContent),
  texto: document.body.innerText,
  huecos: document.querySelectorAll('.lobby-hueco').length,
}))
ok(t.tarjetas.length > 0 && t.tarjetas.every((x) => x === '3–10 jugadores'), `tarjetas del carrusel: ${JSON.stringify(t.tarjetas)}`)
ok(/La Rotonda: 3–10 jugadores/.test(t.texto), 'la pista del mapa dice el rango')
ok(/Jugadores\s*3–10 jugadores/.test(t.texto), 'y el resumen de la derecha también')
ok(/de 3 a 10, según las salidas del mapa/.test(t.texto), 'la pista del modo lo explica')
ok(t.huecos === 10, `10 huecos en La Rotonda (${t.huecos})`)
await A.screenshot({ path: '/home/user/aimcore/scratchpad/todos105-lobby.png' })
ok(errores.length === 0, `errores de página: ${errores.length}`)
await nav.close()
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
