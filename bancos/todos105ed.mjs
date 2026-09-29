// todos105ed — Alchemist y el todos contra todos de 3 a 10 (vuelta 105):
// la cuenta dice el rango, por debajo de tres sale en rojo en la hoja y en la
// barra de arriba, y dos salidas que se ven se avisan en rojo sin pulsar Medir
// (con la misma cuenta que Medir).
import { chromium } from 'playwright-core'
let fallos = 0
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}`); if (!c) fallos += 1 }
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const p = await nav.newPage({ viewport: { width: 1600, height: 900 } })
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))
await p.goto('http://127.0.0.1:5192/editor/', { waitUntil: 'load' })
await p.waitForFunction(() => Boolean(window.vektorEditor), null, { timeout: 20000 })
await p.waitForTimeout(1200)
// Una sala con un pilar alto en medio y tres salidas a sus lados: con un
// pilar de 24×24 en medio, ninguna de las tres ve a otra (comprobado abajo).
await p.evaluate(() => window.vektorEditor.cargar({
  clave: 'banco-todos105', label: 'Banco todos 105', modos: ['todos'],
  room: { width: 40, depth: 40, height: 10 }, spawn: { x: 0, z: 0 },
  boxes: [{ x: -12, z: -12, w: 24, d: 24, kind: 'alta' }], ramps: [], routes: [],
  todos: { salidas: [{ x: -16, z: 0, yaw: 0 }, { x: 16, z: 0, yaw: 0 }, { x: 0, z: -16, yaw: 0 }] },
}))
await p.waitForTimeout(800)
await p.evaluate(() => window.vektorEditor.abrirPanel(true, 'duelo'))
await p.waitForTimeout(400)
const leer = () => p.evaluate(() => ({
  cuenta: document.querySelector('#cuenta-todos').textContent,
  claseCuenta: document.querySelector('#cuenta-todos').className,
  barra: document.querySelector('#barra-salidas').hidden ? '' : document.querySelector('#barra-salidas').textContent,
  claseBarra: document.querySelector('#barra-salidas').className,
  color: getComputedStyle(document.querySelector('#cuenta-todos')).color,
  colorBarra: getComputedStyle(document.querySelector('#barra-salidas')).color,
}))
const ROJO = 'rgb(255, 45, 31)'

console.log('[1] Tres salidas, ninguna se ve (el pilar tapa las tres)')
let r = await leer()
ok(r.cuenta.includes('3 jugadores') && r.claseCuenta.includes('cabe'), `«${r.cuenta}» (${r.claseCuenta})`)
ok(r.barra === '', `sin aviso en la barra («${r.barra}»)`)

console.log('[2] Con dos salidas, rojo en la hoja y en la barra')
await p.fill('#todos-jugadores', '2')
await p.dispatchEvent('#todos-jugadores', 'change')
await p.waitForTimeout(800)
r = await leer()
ok(r.cuenta.includes('hacen falta 3') && r.color === ROJO, `«${r.cuenta}» en ${r.color}`)
ok(/hacen falta 3/.test(r.barra) && r.colorBarra === ROJO, `barra: «${r.barra}» en ${r.colorBarra}`)

console.log('[3] Con cinco: el rango, y las que se ven se avisan solas en rojo')
await p.fill('#todos-jugadores', '5')
await p.dispatchEvent('#todos-jugadores', 'change')
await p.waitForTimeout(900)
r = await leer()
ok(r.cuenta.includes('3–5 jugadores'), `«${r.cuenta}»`)
const pares = await p.evaluate(() => window.vektorEditor.mapa.todos.salidas.map((s) => `${s.x},${s.z}`))
ok(/se ven \d+ pareja/.test(r.barra) && r.colorBarra === ROJO, `barra sin pulsar Medir: «${r.barra}» (salidas ${pares.join(' ')})`)
await p.click('#t-medir')
await p.waitForTimeout(300)
const medida = await p.evaluate(() => ({ t: document.querySelector('#t-medida').textContent, c: getComputedStyle(document.querySelector('#t-medida')).color }))
const nBarra = Number(/se ven (\d+)/.exec(r.barra)?.[1])
const nMedir = Number(/SE VEN (\d+)/.exec(medida.t)?.[1])
ok(nBarra === nMedir && medida.c === ROJO, `Medir dice lo mismo que la barra (${nMedir} y ${nBarra}) y en rojo: «${medida.t}»`)

console.log('[4] Volver a tres tapadas quita el aviso')
// Bajar a dos quitó la de (0, −16) y las que se añadieron después caen en otro
// sitio: se deja en tres y la tercera se vuelve a llevar detrás del pilar, con
// el mismo gesto que el ratón.
await p.fill('#todos-jugadores', '3')
await p.dispatchEvent('#todos-jugadores', 'change')
await p.waitForTimeout(300)
await p.evaluate(() => window.vektorEditor.moverMarca({ que: 'todos', i: 2, dx: 0, dz: 0 }, { x: 0, z: -16 }))
await p.waitForTimeout(900)
r = await leer()
ok(r.barra === '', `el aviso se va («${r.barra}»)`)

ok(errores.length === 0, `errores de página: ${errores.length} ${errores.slice(0, 2).join(' | ')}`)
await nav.close()
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
