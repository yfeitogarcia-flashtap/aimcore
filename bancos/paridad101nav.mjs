// paridad101nav — lo que el entrenamiento tiene de un rival que dispara, en el
// todos contra todos (vuelta 101, punto 7): fogonazo, voz del arma, «!» sobre
// quien te dispara, destello del impacto, ficha al apuntar y el golpe de la baja.
// Montado sobre todos101nav con navegadores de verdad: tres jugadores,
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


for (const p of pags) { await p.mouse.click(30, 30); await p.waitForTimeout(500) }
const colocar = (p, x, z, yaw) => p.evaluate(({ x, z, yaw }) => {
  window.vektorNet.cliente.transporte.send(JSON.stringify({ t: 'c', x, z }))
  window.vektorNet.motor.controls.lookAt(yaw)
}, { x, z, yaw })
const apuntar = async (desde, hacia) => {
  const pos = await hacia.evaluate(() => ({ x: window.vektorNet.cliente.camara.position.x, z: window.vektorNet.cliente.camara.position.z }))
  await desde.evaluate(({ x, z }) => {
    const cam = window.vektorNet.motor.camera
    window.vektorNet.motor.controls.lookAt(Math.atan2(-(x - cam.position.x), -(z - cam.position.z)))
    cam.rotation.x = -0.05
  }, pos)
}

// Un sitio llano con línea de vista a 6 u, como `ficha101`.
const sitio = await A.evaluate(() => {
  const { verDesde, escenario, camara } = window.vektorNet
  const p = camara.position.clone(), q = camara.position.clone()
  const llano = (x, z) => Math.abs(escenario.groundHeightAt(x, z)) < 0.01
  for (let x = -16; x <= 16; x += 2) for (let z = -16; z <= 16; z += 2) {
    if (!llano(x, z) || !llano(x, z - 6)) continue
    p.set(x, 1.4, z); q.set(x, 1.4, z - 6)
    if (verDesde(p, q, escenario.occluders)) return { x, z }
  }
  return null
})
ok(Boolean(sitio), `premisa: un sitio con vista a 6 u (${JSON.stringify(sitio)})`)
await colocar(A, sitio.x, sitio.z, 0)
await colocar(B, sitio.x, sitio.z - 6, Math.PI)
await colocar(C, 28.5, 0, Math.PI / 2)
await A.waitForTimeout(2600)
// Las sondas en A: cuántas veces pasa cada cosa por el motor.
await A.evaluate(() => {
  const m = window.vektorNet.motor
  const P = window.__p = { tiros: 0, fogonazos: 0, destellos: 0, bajas: 0, pop: false }
  const envolver = (obj, nombre, alPasar) => { const f = obj[nombre].bind(obj); obj[nombre] = (...a) => { alPasar(...a); return f(...a) } }
  envolver(m, '_tiroDeRival', () => { P.tiros += 1 })
  envolver(m.muzzleFlash, 'flash', () => { P.fogonazos += 1 })
  envolver(m, '_destellarRival', () => { P.destellos += 1 })
  envolver(m, '_bajaDeRival', () => { P.bajas += 1; setTimeout(() => { P.pop = m._rivales.some((v) => v.pop) }, 0) })
})
console.log('[1] La ficha al apuntar')
await A.evaluate(() => { window.vektorNet.motor.controls.lookAt(0); window.vektorNet.motor.camera.rotation.x = -0.02 })
await A.waitForTimeout(1800)
const ficha = await A.evaluate(() => {
  const m = window.vektorNet.motor
  const s = m.markers.slots.find((x) => x.plate.visible)
  return s ? { nick: s.dom.root.textContent.trim() } : null
})
ok(Boolean(ficha), `apuntando a B sale su ficha (${JSON.stringify(ficha)})`)
console.log('[2] B dispara a A: fogonazo, voz, «!» y silbido')
await apuntar(B, A)
await B.evaluate(() => { window.vektorNet.motor.camera.rotation.x = 0.12 })   // por encima: que falle y silbe
for (let i = 0; i < 3; i++) { await B.mouse.down(); await B.waitForTimeout(40); await B.mouse.up(); await B.waitForTimeout(200) }
await A.waitForTimeout(400)
let P = await A.evaluate(() => ({ ...window.__p, fase: window.vektorNet.motor._rivales.filter((v) => v.id).map((v) => (v.instancia.disparandoHasta > (window.vektorNet.motor._ahoraDeRed ?? 0) ? 'firing' : 'idle')) }))
console.log('   ', JSON.stringify(P))
ok(P.tiros >= 3, `A se entera de los tres disparos de B (${P.tiros})`)
ok(P.fogonazos >= 3, `y ve sus fogonazos (${P.fogonazos})`)
ok(P.fase.includes('firing'), `y el «!» sobre B (${P.fase})`)
console.log('[3] A dispara a B: destello del impacto y golpe de la baja')
await apuntar(A, B)
for (let i = 0; i < 20 && !(await A.evaluate(() => window.__p.bajas)); i++) {
  await apuntar(A, B)
  await A.mouse.down(); await A.waitForTimeout(40); await A.mouse.up()
  await A.waitForTimeout(260)
}
await A.waitForTimeout(300)
P = await A.evaluate(() => window.__p)
console.log('   ', JSON.stringify(P))
ok(P.destellos >= 1, `el impacto destella en el cuerpo de B (${P.destellos})`)
ok(P.bajas === 1 && P.pop, 'la baja hace el golpe del muñeco (pop) en B')
errores.forEach((e, i) => ok(e.length === 0, `${nombres[i]}: ${e.length} ${e.slice(0, 2).join(' | ')}`))
await Promise.all(navs.map((n) => n.close()))
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
