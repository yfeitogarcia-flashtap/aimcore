// salidas101ed — Alchemist avisa de un mapa publicado con menos salidas de las
// que su modo necesita (vuelta 101). Contra el editor de verdad.
import { chromium } from 'playwright-core'
let fallos = 0
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}`); if (!c) fallos += 1 }
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const p = await nav.newPage({ viewport: { width: 1600, height: 900 } })
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))
const leer = () => p.evaluate(() => ({
  barra: document.getElementById('barra-salidas').hidden ? '' : document.getElementById('barra-salidas').textContent,
  cuenta: document.getElementById('cuenta-todos').textContent,
}))
const abrir = async (clave) => { await p.goto('about:blank'); await p.goto(`http://localhost:5192/editor/#${clave}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500) }
await abrir('rotonda')
let l = await leer()
console.log('   rotonda:', JSON.stringify(l))
ok(l.barra === '', 'La Rotonda (12 salidas, todos) no avisa de nada')
await abrir('duelo')
console.log('   abierto:', await p.evaluate(() => [window.vektorEditor.mapa.clave, Object.keys(window.vektorEditor.mapa).join(',')]))
l = await leer()
console.log('   duelo:', JSON.stringify(l))
ok(l.barra === '', 'El Espejo: los compañeros del 5v5 caben todos')
// Un mapa de todos contra todos con 8 salidas: quitar dos de La Rotonda.
await abrir('rotonda')
await p.evaluate(() => { const i = document.getElementById('todos-jugadores'); i.value = 8; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) })
await p.waitForTimeout(800)
l = await leer()
console.log('   rotonda con 8:', JSON.stringify(l))
// Desde la vuelta 105 un mapa de 8 salidas es un mapa de 3 a 8, no uno al que le
// faltan dos: la barra calla (las 8 de La Rotonda no se ven entre sí) y la hoja
// dice el rango. Lo que va en rojo es bajar de tres (`todos105ed`).
ok(!/todos contra todos/.test(l.barra), `con 8 salidas la barra no avisa de nada del todos contra todos («${l.barra}»)`)
ok(/8 salidas · 3–8 jugadores/.test(l.cuenta), `y la hoja dice el rango: «${l.cuenta}»`)
// Una salida de duelo pegada a una esquina: sus compañeros no caben.
await abrir('duelo')
await p.evaluate(() => {
  const m = window.vektorEditor.mapa
  console.log(m.clave, Object.keys(m))
  m.duelo.salidas[0] = { x: -19.4, z: 19.4, yaw: 0 }
  window.vektorEditor.marcarSucio()
})
await p.waitForTimeout(800)
l = await leer()
console.log('   espejo en la esquina:', JSON.stringify(l))
ok(/5v5: \d+ compañeros? sin sitio/.test(l.barra), 'una salida en la esquina: la barra dice que faltan sitios')
ok(errores.length === 0, `sin errores de página (${errores.length}) ${errores.slice(0, 2).join(' | ')}`)
await nav.close()
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
