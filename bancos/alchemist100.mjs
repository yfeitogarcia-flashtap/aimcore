/**
 * alchemist100 — las salidas del todos contra todos en Alchemist (vuelta 100).
 *
 *  [1] Marcar «Todos contra todos» le pone sus salidas —ocho— y se dibujan
 *      como conos pinchables, en blanco.
 *  [2] El número de jugadores pone y quita salidas: 5 → cinco conos.
 *  [3] Salen en Capas con su fila, pinchar la fila las elige y Supr borra.
 *  [4] Arrastrar un cono mueve su salida (por la misma función que el ratón),
 *      y la punta de su flecha la gira.
 *  [5] «Medir» dice si alguna ve a otra, con su denominador (los pares).
 *  [6] El saneado lo guarda: `todos.salidas` con sus rumbos y el modo puesto.
 *  [7] Cero errores de página.
 */
import { chromium } from 'playwright-core'

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
let fallos = 0
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}`); if (!c) fallos += 1 }

const nav = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const p = await nav.newPage({ viewport: { width: 1600, height: 900 } })
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))
await p.goto('http://127.0.0.1:5192/editor/', { waitUntil: 'load' })
await p.waitForFunction(() => Boolean(window.vektorEditor), null, { timeout: 20000 })
await p.waitForTimeout(1200)
await p.evaluate(() => window.vektorEditor.cargar({
  clave: 'banco-todos100', label: 'Banco todos', modos: [],
  room: { width: 64, depth: 64, height: 10 }, spawn: { x: 0, z: 0 },
  boxes: [{ x: -3, z: -3, w: 6, d: 6, kind: 'alta' }], ramps: [], routes: [],
}))
await p.waitForTimeout(600)

const conos = () => p.evaluate(() => window.vektorEditor.pinchables.filter((o) => o.userData.marca?.que === 'todos').length)

console.log('[1] Publicar en todos contra todos pone sus salidas')
await p.evaluate(() => window.vektorEditor.abrirPanel(true, 'mapa'))
await p.waitForTimeout(300)
await p.click('#modo-todos')
await p.waitForTimeout(500)
const tras1 = await p.evaluate(() => ({ n: window.vektorEditor.mapa.todos?.salidas?.length ?? 0, modos: window.vektorEditor.mapa.modos }))
ok(tras1.n === 10 && tras1.modos.includes('todos'), `diez salidas (TODOS.maxJugadores, desde la 101) y el modo puesto (${tras1.n}, ${JSON.stringify(tras1.modos)})`)
await p.waitForTimeout(400)
ok((await conos()) === 10, `diez conos pinchables (${await conos()})`)

console.log('[2] El número de jugadores')
await p.evaluate(() => window.vektorEditor.abrirPanel(true, 'duelo'))
await p.waitForTimeout(300)
await p.fill('#todos-jugadores', '5')
await p.dispatchEvent('#todos-jugadores', 'change')
await p.waitForTimeout(500)
const n2 = await p.evaluate(() => window.vektorEditor.mapa.todos.salidas.length)
ok(n2 === 5 && (await conos()) === 5, `5 jugadores → ${n2} salidas y ${await conos()} conos`)
ok((await p.textContent('#cuenta-todos')).includes('3–5 jugadores'), `la cuenta lo dice: «${await p.textContent('#cuenta-todos')}»`)

console.log('[3] Capas y Supr')
await p.evaluate(() => window.vektorEditor.abrirPanel(true, 'capas'))
await p.waitForTimeout(300)
const filas = await p.evaluate(() => [...document.querySelectorAll('#capas-lista button[data-capa="salidasTodos"]')].length)
ok(filas === 5, `cinco filas en Capas (${filas})`)
await p.click('#capas-lista button[data-capa="salidasTodos"][data-i="2"]')
await p.waitForTimeout(300)
const elegida = await p.evaluate(() => window.vektorEditor.marcaElegida)
ok(elegida?.que === 'todos' && elegida.i === 2, `pinchar la fila la elige (${JSON.stringify(elegida)})`)
await p.evaluate(() => window.vektorEditor.abrirPanel(false))
await p.mouse.move(800, 450)
await p.keyboard.press('Delete')
await p.waitForTimeout(400)
const n3 = await p.evaluate(() => window.vektorEditor.mapa.todos.salidas.length)
ok(n3 === 4, `Supr la borra (${n3})`)

console.log('[4] Arrastrar el cono y girar su flecha')
const movida = await p.evaluate(() => {
  const ed = window.vektorEditor
  const s = ed.mapa.todos.salidas[0]
  const antes = { x: s.x, z: s.z }
  ed.moverMarca({ que: 'todos', i: 0, dx: 0, dz: 0 }, { x: 10, z: -12 })
  ed.moverMarca({ que: 'todos-rumbo', i: 0 }, { x: 10, z: -20 })
  return { antes, despues: { x: s.x, z: s.z, yaw: s.yaw } }
})
ok(movida.despues.x === 10 && movida.despues.z === -12, `el cono va donde se suelta (${JSON.stringify(movida.despues)})`)
ok(Math.abs(movida.despues.yaw) < 1e-6, 'y la punta hacia −Z le pone rumbo 0')

console.log('[5] Medir')
await p.evaluate(() => window.vektorEditor.abrirPanel(true, 'duelo'))
await p.waitForTimeout(300)
await p.click('#t-medir')
await p.waitForTimeout(300)
const medida = await p.textContent('#t-medida')
console.log('    ', medida)
ok(/de 6 pares|\(6 pares\)/.test(medida), 'la medida dice de cuántos pares')

console.log('[6] El saneado')
const saneado = await p.evaluate(() => window.vektorEditor.sanear())
ok(saneado.mapa.todos?.salidas?.length === 4 && saneado.mapa.modos.includes('todos'),
  `se guarda con sus 4 salidas y el modo (${saneado.problemas.join(' · ') || 'sin problemas'})`)

console.log('[7] Errores')
ok(errores.length === 0, `errores de página: ${errores.length} ${errores.slice(0, 2).join(' | ')}`)
await nav.close()
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
