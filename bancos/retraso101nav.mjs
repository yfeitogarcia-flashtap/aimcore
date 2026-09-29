// retraso101nav — cuánto tarda en llegar una baja en el todos contra todos (vuelta 101).
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
// La sonda, dentro de la página de A (regla de la vuelta 49): cuándo sale cada
// disparo, cuándo llega su veredicto por cada camino, cuándo llega la baja y
// cuándo la dibujarían las fotos solas.
await A.evaluate(() => {
  const c = window.vektorNet.cliente
  const M = window.__m = { disparos: new Map(), inmediato: new Map(), enFoto: new Map(), baja: [], poseVieja: [] }
  const disparar = c.disparar.bind(c)
  c.disparar = (...a) => { M.disparos.set(M.disparos.size, performance.now()); return disparar(...a) }
  const recibir = c._recibir.bind(c)
  c._recibir = (m) => {
    const t = performance.now()
    if (m.t === 'v' && m.d?.baja) M.inmediato.set(m.d.seq, t)
    if (m.t === 'k') M.baja.push({ t, v: m.v })
    if (m.p) {
      const mio = m.p[c.id]
      for (const d of mio?.disparos ?? []) if (d.baja && !M.enFoto.has(d.seq)) M.enFoto.set(d.seq, t)
    }
    return recibir(m)
  }
  // Lo que dibujarían las fotos solas: el lado viejo de la interpolación.
  const mirar = () => {
    for (const [id, r] of c.rivales) {
      const b = r.buffer
      if (!b || b.length < 2) continue
      const obj = c.instanteDeDibujo()
      let a = b[0]
      for (let i = b.length - 2; i >= 0; i--) if (b[i].n <= obj) { a = b[i]; break }
      const muerto = a.vivo === false
      if (muerto && !r.__muerto) M.poseVieja.push({ t: performance.now(), id })
      r.__muerto = muerto
    }
    requestAnimationFrame(mirar)
  }
  requestAnimationFrame(mirar)
})
const filas = []
for (let vuelta = 0; vuelta < Number(process.env.VUELTAS || 4); vuelta++) {
  await colocar(A, 0, 20, 0)
  await colocar(B, -4, 13, Math.PI)
  await colocar(C, 20, 0, Math.PI / 2)
  await A.waitForTimeout(2600)
  const antes = await A.evaluate(() => window.vektorNet.cliente.bajas)
  let clicks = []
  for (let i = 0; i < 30; i++) {
    await apuntar(A, B)
    const t0 = await A.evaluate(() => performance.now())
    clicks.push(t0)
    await A.mouse.down(); await A.waitForTimeout(40); await A.mouse.up()
    await A.waitForTimeout(350)
    if ((await A.evaluate(() => window.vektorNet.cliente.bajas)) > antes) break
  }
  await A.waitForTimeout(800)
  /**
   * **Sólo cuenta una vuelta con baja** (vuelta 106). El huésped de este grupo
   * juega a dos bajas (`VEKTOR_BAJAS=2`), así que la partida se acaba en la
   * segunda y la tercera y la cuarta vuelta no tienen a quién matar: sus filas
   * salían en blanco y la mediana en `NaN`, con las dos bajas de verdad
   * diciendo exactamente lo que se mide. Se para ahí y se enseña de cuántas.
   */
  if ((await A.evaluate(() => window.vektorNet.cliente.bajas)) <= antes) break
  const m = await A.evaluate(() => ({ inm: [...window.__m.inmediato.values()], foto: [...window.__m.enFoto.values()], baja: window.__m.baja.map((b) => b.t), pose: window.__m.poseVieja.map((p) => p.t), fc: window.vektorNet.cliente.fotoCada, rtt: window.vektorNet.cliente.medidas.rtt }))
  const tBaja = m.baja.at(-1)
  const click = clicks.filter((c) => c < tBaja).at(-1)
  const fila = {
    rtt: Math.round(m.rtt),
    veredictoInmediato: Math.round(m.inm.at(-1) - click),
    veredictoEnFoto: Math.round(m.foto.at(-1) - click),
    baja: Math.round(tBaja - click),
    cuerpoPorFotos: Math.round(m.pose.at(-1) - click),
  }
  console.log('   ', JSON.stringify(fila))
  filas.push(fila)
}
const med = (k) => { const v = filas.map((f) => f[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] }
console.log(`\n  mediana de ${filas.length} bajas, ms desde el clic (fotos cada ${await A.evaluate(() => window.vektorNet.cliente.fotoCada)} pasos):`)
for (const k of ['rtt', 'veredictoInmediato', 'veredictoEnFoto', 'baja', 'cuerpoPorFotos']) console.log(`    ${k.padEnd(20)} ${med(k)}`)
ok(filas.length >= 2, `premisa: al menos dos bajas medidas (${filas.length})`)
ok(filas.length > 0 && filas.every((f) => f.baja <= f.veredictoEnFoto && f.veredictoInmediato <= f.veredictoEnFoto), 'el aviso inmediato llega antes (o a la vez) que la foto')
ok(filas.every((f) => f.baja < f.cuerpoPorFotos), 'y el cuerpo cae con la baja, antes que por las fotos')
errores.forEach((e, i) => ok(e.length === 0, `${nombres[i]}: ${e.length} ${e.slice(0, 2).join(' | ')}`))
await Promise.all(navs.map((n) => n.close()))
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
