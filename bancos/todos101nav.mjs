// todos101nav (de todos100nav) — el todos contra todos con navegadores de verdad: tres jugadores,
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
const BASE = process.env.BASE || 'http://localhost:5192'
await A.goto(`${BASE}/duelo/?modo=todos`, { waitUntil: 'networkidle' })
await A.waitForTimeout(2500)
const enlace = await A.evaluate(() => document.querySelector('#enlace').value)
console.log('enlace:', enlace)
for (const p of [B, C]) { await p.goto(enlace, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000) }
// El lobby (vuelta 101): los tres, LISTO con el ratón, y el anfitrión lanza.
for (const p of pags) { await p.click('#listo'); await p.waitForTimeout(300) }
await A.waitForTimeout(500)
await A.click('#lanzar')
await A.waitForTimeout(3000)

console.log('[1] La sala')
const estado = (p) => p.evaluate(() => {
  const c = window.vektorNet.cliente
  return {
    id: c.id, modo: c.modo, plazas: c.plazas, fc: c.fotoCada, ocupadas: c.ocupadas,
    escenario: window.vektorNet.motor.scenario.key, titulo: document.querySelector('#titulo')?.textContent,
    fase: c.todos.fase, reloj: document.querySelector('#rondaMarcador')?.textContent ?? '',
  }
})
const est = await Promise.all(pags.map(estado))
console.log('   ', JSON.stringify(est))
ok(est.every((e) => e.modo === 'todos' && e.plazas === 10 && e.fc === 3 && e.escenario === 'rotonda'),
  'los tres en modo todos, 10 plazas, foto cada 3 pasos y La Rotonda')
ok(est.every((e) => e.ocupadas === 3), 'la sala cuenta tres butacas')
ok(est[0].titulo === 'Vektor · Todos contra todos', 'el menú dice el modo')
ok(est.every((e) => !/líder/.test(e.reloj)), 'bajo el reloj no está «1 · líder 1 / 20»')
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
  objetivo: document.querySelector('#tablaObjetivo')?.textContent ?? '',
  filas: [...document.querySelectorAll('#tablaFilas tr')].map((tr) => tr.textContent.replace(/\s+/g, ' ').trim()),
}))
await C.screenshot({ path: `${OUT}/todos100-tab.png` })
await C.keyboard.up('Tab')
console.log('    TAB en C:', JSON.stringify(tabla))
ok(tabla.abierta && tabla.filas.length === 3, 'con TAB, el marcador con tres filas')
ok(/Gana el primero en llegar a \d+ bajas/.test(tabla.objetivo), `y dice cuántas bajas ganan: «${tabla.objetivo}»`)
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

console.log('[7] Final de partida: Volver a jugar')
// Con VEKTOR_BAJAS=2 en el huésped: A mata a B otra vez y gana.
await colocar(A, 0, 20, 0)
await colocar(B, -4, 13, Math.PI)
await colocar(C, 20, 0, Math.PI / 2)
await A.waitForTimeout(2600)
for (const p of pags) { await p.mouse.click(30, 30); await p.waitForTimeout(300) }
let bajas = await A.evaluate(() => window.vektorNet.cliente.bajas)
for (const [n, p] of [['A', A], ['B', B]]) console.log('   ', n, JSON.stringify(await p.evaluate(() => { const c = window.vektorNet.cliente, m = window.vektorNet.motor; return { x: +c.camara.position.x.toFixed(2), z: +c.camara.position.z.toFixed(2), lock: document.pointerLockElement?.id ?? null, ammo: m.ammo, vivo: c.vida, arma: m.weaponKey, rivales: [...c.rivales.keys()] } })))
for (let i = 0; i < 40 && bajas < 2; i++) {
  await apuntar(A, B)
  await A.mouse.down(); await A.waitForTimeout(40); await A.mouse.up()
  await A.waitForTimeout(260)
  bajas = await A.evaluate(() => window.vektorNet.cliente.bajas)
}
for (const [n, p] of [['A', A], ['B', B]]) console.log('   tras', n, JSON.stringify(await p.evaluate(() => { const c = window.vektorNet.cliente, m = window.vektorNet.motor; return { ammo: m.ammo, vida: c.vida, med: { d: c.medidas.disparos, a: c.medidas.acuerdos, f: c.medidas.fantasmas, s: c.medidas.sorpresas, r: c.medidas.rechazados } } })))
console.log('    bajas de A:', bajas, '· fase', await A.evaluate(() => window.vektorNet.cliente.todos.fase), '· vista', await A.evaluate(() => window.vektorNet.vista))
await A.waitForTimeout(1200)
const fin = await Promise.all(pags.map((p) => p.evaluate(() => ({
  puesto: document.querySelector('#fin').classList.contains('puesto'),
  otra: getComputedStyle(document.querySelector('#finOtra')).display !== 'none' && document.querySelector('#finOtra').textContent.trim(),
  salir: document.querySelector('#finSalir').textContent.trim(),
  quien: document.querySelector('#finQuien').textContent,
}))))
console.log('    ', JSON.stringify(fin))
await B.screenshot({ path: `${OUT}/todos101-fin.png` })
ok(fin.every((f) => f.puesto && /Volver a jugar/i.test(f.otra) && /Salir al men/i.test(f.salir)), 'los tres ven el final con «Volver a jugar» y «Salir al menú»')
const avisoTapado = await B.evaluate(() => getComputedStyle(document.querySelector('#aviso')).display === 'none')
ok(avisoTapado, 'y el menú de ESC no asoma por detrás del final')
ok(/HAS GANADO/.test(fin[0].quien), `A ha ganado («${fin[0].quien}»)`)
for (const p of pags) { await p.click('#finOtra'); await p.waitForTimeout(400) }
await A.waitForTimeout(800)
const tras = await Promise.all(pags.map((p) => p.evaluate(() => window.vektorNet.vista)))
const salaA = await A.evaluate(() => window.vektorNet.sala)
ok(tras.every((v) => v === 'lobby'), `volver a jugar lleva al lobby de la misma sala (${tras})`)
ok(salaA.m.filter((m) => m.l).length === 3 && salaA.modo === 'todos' && salaA.mapa === 'rotonda', `los tres listos, mismo modo y mapa (${salaA.req.listos} listos)`)
await A.screenshot({ path: `${OUT}/todos101-revancha.png` })
await A.click('#lanzar')
await A.waitForTimeout(3000)
const otra = await Promise.all(pags.map((p) => p.evaluate(() => ({ v: window.vektorNet.vista, n: window.vektorNet.cliente.numeroPartida, b: window.vektorNet.cliente.bajas, fase: window.vektorNet.cliente.todos.fase }))))
console.log('    ', JSON.stringify(otra))
ok(otra.every((o) => o.v === 'juego' && o.n === 2 && !o.b && o.fase === 'juego'), 'la revancha: partida 2, bajas a cero y en juego')

console.log('[5] Errores de página')
errores.forEach((e, i) => ok(e.length === 0, `${nombres[i]}: ${e.length} ${e.slice(0, 2).join(' | ')}`))
await Promise.all(navs.map((n) => n.close()))
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
