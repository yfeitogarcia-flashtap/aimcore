// todos100nav — el todos contra todos con navegadores de verdad: tres jugadores,
// un navegador cada uno (regla de la vuelta 50), contra el huésped de Node con
// VEKTOR_DEBUG=1 (para `COLOCAR`).
//
// Qué se afirma, con su premisa delante:
//  [1] Los tres entran en la misma sala de todos contra todos: modo, plazas y
//      ritmo de foto los dice la bienvenida, y el menú enseña el modo.
//  [2] Puestos cerca, cada uno dibuja a los otros dos (dos cuerpos visibles).
//  [3] Un disparo de verdad —clic con el ratón— mata a quien tienes delante,
//      y el marcador (TAB) lo cuenta con tres filas.
//  [4] Puestos tapados y lejos, el otro sale de tu foto y de tu pantalla.
//  [5] Cero errores de página en los tres.
import { chromium } from 'playwright-core'
import { SCENARIOS, capacidadDeTodos } from '../src/config.js'
const OUT = '/home/user/aimcore/scratchpad'
let fallos = 0
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}`); if (!c) fallos += 1 }
const lanzar = () => chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const nombres = ['A', 'B', 'C']
const navs = await Promise.all(nombres.map(lanzar))
const pags = await Promise.all(navs.map((n) => n.newPage({ viewport: { width: 1280, height: 800 } })))
const errores = nombres.map(() => [])
pags.forEach((p, i) => p.on('pageerror', (e) => errores[i].push(String(e))))

const [A, B, C] = pags
await A.goto('http://localhost:5199/duelo/?modo=todos', { waitUntil: 'networkidle' })
await A.waitForTimeout(2500)
const enlace = await A.evaluate(() => document.querySelector('#enlace').value)
console.log('enlace:', enlace)
for (const p of [B, C]) { await p.goto(enlace, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000) }

console.log('[1] La sala')
const estado = (p) => p.evaluate(() => {
  const c = window.vektorNet.cliente
  return {
    id: c.id, modo: c.modo, plazas: c.plazas, fc: c.fotoCada, ocupadas: c.ocupadas,
    escenario: window.vektorNet.motor.scenario.key, titulo: document.querySelector('#titulo')?.textContent,
    modoSel: document.querySelector('#modoSel')?.value, fase: c.todos.fase,
  }
})
const est = await Promise.all(pags.map(estado))
console.log('   ', JSON.stringify(est))
// Las plazas las dice el mapa (vuelta 105): tantas como salidas, hasta el tope.
const plazas = capacidadDeTodos(SCENARIOS.rotonda).max
ok(est.every((e) => e.modo === 'todos' && e.plazas === plazas && e.fc === 3 && e.escenario === 'rotonda'),
  `los tres en modo todos, ${plazas} plazas, foto cada 3 pasos y La Rotonda`)
ok(est.every((e) => e.ocupadas === 3), 'la sala cuenta tres butacas')
// El selector de modo del menú se fue con el lobby (vuelta 101); lo dice el título.
ok(est[0].titulo === 'Vektor · Todos contra todos', 'el título dice el modo')
ok(est.every((e) => e.fase === 'juego'), 'la partida está en marcha')

// A jugar: el clic a una esquina (el centro del menú es un `.control`).
for (const p of pags) { await p.mouse.click(30, 30); await p.waitForTimeout(600) }

const colocar = (p, x, z, yaw) => p.evaluate(({ x, z, yaw }) => {
  const c = window.vektorNet.cliente
  c.transporte.send(JSON.stringify({ t: 'c', x, z }))
  window.vektorNet.motor.controls.lookAt(yaw)
}, { x, z, yaw })

console.log('[2] Cerca, cada uno ve a los otros dos')
// En triángulo alrededor de (0, 16), a unas 5 u, mirando al centro del grupo.
const puestos = [[0, 20], [-4, 13], [4, 13]]
for (const [i, p] of pags.entries()) {
  const [x, z] = puestos[i]
  await colocar(p, x, z, Math.atan2(x - 0, z - 15.3))
}
await A.waitForTimeout(3000)
const visibles = (p) => p.evaluate(() => window.vektorNet.motor._rivales.filter((v) => v.avatar.group.visible).length)
const vis = await Promise.all(pags.map(visibles))
console.log('    cuerpos visibles:', vis.join(' / '))
ok(vis.every((v) => v === 2), 'dos cuerpos visibles en cada pantalla')

console.log('[3] Un disparo de verdad mata y el marcador lo cuenta')
// A mira a B y dispara hasta que caiga (con la pistola de serie).
const apuntar = async (desde, hacia) => {
  const pos = await hacia.evaluate(() => {
    const c = window.vektorNet.cliente
    return { x: c.camara.position.x, z: c.camara.position.z }
  })
  await desde.evaluate(({ x, z }) => {
    const cam = window.vektorNet.motor.camera
    const yaw = Math.atan2(-(x - cam.position.x), -(z - cam.position.z))
    window.vektorNet.motor.controls.lookAt(yaw)
    // Al pecho: bajar la mira un poco.
    cam.rotation.x = -0.05
  }, pos)
}
// Pasa la gracia de salida antes de disparar.
await A.waitForTimeout(2200)
let muertesB = 0
for (let i = 0; i < 25 && muertesB === 0; i++) {
  await apuntar(A, B)
  await A.mouse.down(); await A.waitForTimeout(40); await A.mouse.up()
  await A.waitForTimeout(260)
  muertesB = await B.evaluate(() => window.vektorNet.cliente.muertes ?? 0)
}
const bajasA = await A.evaluate(() => window.vektorNet.cliente.bajas)
ok(muertesB === 1 && bajasA === 1, `A mata a B con el ratón (bajas A ${bajasA}, muertes B ${muertesB})`)
await A.waitForTimeout(600)
await C.keyboard.down('Tab'); await C.waitForTimeout(400)
const tabla = await C.evaluate(() => ({
  abierta: !document.querySelector('#tablaTodos').hidden,
  filas: [...document.querySelectorAll('#tablaFilas tr')].map((tr) => tr.textContent.replace(/\s+/g, ' ').trim()),
}))
await C.screenshot({ path: `${OUT}/todos100-tab.png` })
await C.keyboard.up('Tab')
console.log('    TAB en C:', JSON.stringify(tabla))
ok(tabla.abierta && tabla.filas.length === 3, 'con TAB, el marcador con tres filas')
ok(/1\s*0/.test(tabla.filas[0] ?? ''), 'y arriba el que lleva una baja')
await A.screenshot({ path: `${OUT}/todos100-A.png` })

console.log('[4] Tapados y lejos, fuera de la foto y de la pantalla')
await colocar(A, 0, 28.5, 0)
await colocar(B, 0, -28.5, Math.PI)
await colocar(C, 28.5, 0, Math.PI / 2)
await A.waitForTimeout(3500)
const enFotoA = await A.evaluate(() => [...window.vektorNet.cliente.rivales.keys()])
const visA = await visibles(A)
console.log('    rivales en la foto de A:', JSON.stringify(enFotoA), '· visibles:', visA)
ok(enFotoA.length === 0 && visA === 0, 'A, en su bolsillo, no recibe ni dibuja a nadie')

console.log('[6] Andar a 20 Hz: la reconciliación sigue en cero')
// La medida de cierre de la propuesta 11: con fotos una de cada tres, el
// cliente sigue prediciendo su movimiento sin corregirse. Los tres andan y
// saltan cuatro segundos; antes se ponen los contadores a cero, porque los
// `COLOCAR` de arriba son teletransportes del servidor y cuentan como corrección.
for (const p of pags) {
  await p.evaluate(() => {
    const m = window.vektorNet.cliente.medidas
    m.correcciones = 0; m.errorMax = 0; m.fotos = 0
    window.__hambre0 = m.hambre
  })
}
await Promise.all(pags.map(async (p, i) => {
  await p.keyboard.down('KeyW')
  await p.keyboard.down(i % 2 ? 'KeyA' : 'KeyD')
  for (let k = 0; k < 6; k++) {
    await p.keyboard.press('Space')
    await p.mouse.move(640 + (k % 2 ? 60 : -60), 400)
    await p.waitForTimeout(650)
  }
  await p.keyboard.up('KeyW')
  await p.keyboard.up(i % 2 ? 'KeyA' : 'KeyD')
}))
const recon = await Promise.all(pags.map((p) => p.evaluate(() => {
  const m = window.vektorNet.cliente.medidas
  return { correcciones: m.correcciones, errorMax: +m.errorMax.toExponential(2), fotos: m.fotos, hambre: m.hambre - window.__hambre0, rtt: Math.round(m.rtt) }
})))
console.log('    ', JSON.stringify(recon))
ok(recon.every((r) => r.fotos > 50), `premisa: llegan fotos (${recon.map((r) => r.fotos).join(' / ')} en ~4 s, a 20 Hz)`)
ok(recon.every((r) => r.correcciones === 0), `cero correcciones (${recon.map((r) => r.correcciones).join(' / ')})`)

console.log('[5] Errores de página')
errores.forEach((e, i) => ok(e.length === 0, `${nombres[i]}: ${e.length} ${e.slice(0, 2).join(' | ')}`))
await Promise.all(navs.map((n) => n.close()))
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
