// piloto105 — la silueta inflada con grosor por zonas (Krakov y Pulse) contra la
// extrusión de la v3: en juego a 16:9 y en tres vistas de estudio del arma sola.
// Afirma que las dos piezas se construyen, que el perfil (vista de lado) no se
// mueve, que el grosor varía por zonas, y mide triángulos y coste.
import { chromium } from 'playwright-core'
let fallos = 0
const afirmar = (n, c, d = '') => { console.log((c ? '  ok  ' : '  FALLO ') + n + (d ? ` — ${d}` : '')); if (!c) fallos += 1 }
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const err = []
const p = await nav.newPage({ viewport: { width: 1280, height: 720 } })
p.on('pageerror', (e) => err.push(String(e)))
await p.addInitScript(() => localStorage.setItem('aimcore.settings.v1', JSON.stringify({ armaEnPantalla: true, scenario: 'largoYPuerta', trainingMode: 'deathmatch' })))
await p.goto('http://localhost:5192/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
await p.mouse.click(40, 700); await p.waitForTimeout(1500)

const poner = (arma, piloto) => p.evaluate(async ({ arma, piloto }) => {
  const { VIEWMODEL } = await import('/src/config.js')
  VIEWMODEL.silueta.piloto = piloto
  const m = window.aimcore
  m.armaEnMano._cache.clear(); m.armaEnMano._clave = null
  const ranura = arma === 'pulse' ? 'secondary' : 'primary'
  m.slots[ranura] = arma
  m.slot = ranura === 'secondary' ? 'melee' : 'secondary'
  m._equipSlot(ranura)
  m.armaEnMano._clave = null
  const t0 = performance.now(); m.armaEnMano.poner(arma); const msConstruir = performance.now() - t0
  m.armaEnMano._subir = 1
  m.controls.lookAt(0.3); m.camera.rotation.x = -0.05
  const malla = m.armaEnMano.arma.children[0].children[0]
  const g = malla.geometry
  g.computeBoundingBox()
  const b = g.boundingBox
  // Grosor (x local) medido en franjas a lo largo del arma (z local, boca en −z).
  const pos = g.attributes.position
  const franjas = 10
  const grosor = new Array(franjas).fill(0)
  for (let i = 0; i < pos.count; i++) {
    const f = Math.min(franjas - 1, Math.floor(((b.max.z - pos.getZ(i)) / (b.max.z - b.min.z)) * franjas))
    grosor[f] = Math.max(grosor[f], 2 * Math.abs(pos.getX(i)))
  }
  // Y en una rejilla largo × alto (5 × 4), porque una zona fina puede quedar
  // bajo una gruesa en la misma franja de largo (la empuñadura bajo la corredera).
  const celdas = new Array(20).fill(0)
  for (let i = 0; i < pos.count; i++) {
    const cu = Math.min(4, Math.floor(((b.max.z - pos.getZ(i)) / (b.max.z - b.min.z)) * 5))
    const cv = Math.min(3, Math.floor(((pos.getY(i) - b.min.y) / (b.max.y - b.min.y)) * 4))
    celdas[cv * 5 + cu] = Math.max(celdas[cv * 5 + cu], 2 * Math.abs(pos.getX(i)))
  }
  return {
    msConstruir,
    celdas: celdas.map((x) => +x.toFixed(4)),
    tri: (g.index ? g.index.count : pos.count) / 3,
    largo: b.max.z - b.min.z, alto: b.max.y - b.min.y,
    grosorDeAtrasAlante: grosor.map((x) => +x.toFixed(4)),
  }
}, { arma, piloto })

// Estudio: se para el bucle y se dibuja sólo la escena del arma con otra cámara.
const estudio = (vista) => p.evaluate(async (vista) => {
  const m = window.aimcore
  const vm = m.armaEnMano
  if (!m.__bucle) { m.__bucle = m._loop; m._loop = () => {} }
  // El frame ya pedido todavía corre el bucle de verdad: se espera a que muera.
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))
  const malla = vm.arma.children[0].children[0]
  malla.geometry.computeBoundingSphere()
  vm.raiz.updateMatrixWorld(true)
  const centro = malla.localToWorld(malla.geometry.boundingSphere.center.clone())
  const r = malla.geometry.boundingSphere.radius
  // Direcciones en el marco del arma: x es el grosor, y arriba, −z la boca.
  const dirs = { tresCuartos: [-0.9, 0.55, 1.1], arriba: [-0.05, 1, 0.08], perfil: [-1, 0.02, 0.02] }
  const d = centro.clone().set(...dirs[vista]).normalize().applyQuaternion(vm.arma.getWorldQuaternion(vm.arma.quaternion.clone()))
  const cam = vm.camera.clone()
  cam.fov = 30; cam.aspect = innerWidth / innerHeight; cam.near = 0.001; cam.far = 20
  cam.position.copy(centro).addScaledVector(d, r / Math.tan((15 * Math.PI) / 180) * 1.05)
  const arriba = centro.clone().set(0, 1, 0)
  if (vista === 'arriba') arriba.set(0, 0, -1).applyQuaternion(vm.arma.getWorldQuaternion(vm.arma.quaternion.clone()))
  cam.up.copy(arriba)
  cam.lookAt(centro)
  cam.updateProjectionMatrix()
  vm.mano.visible = false
  const rd = m.renderer
  rd.setRenderTarget(null)
  rd.setClearColor(0x2a2d33, 1)
  rd.autoClear = true
  rd.clear()
  rd.render(vm.scene, cam)
  vm.mano.visible = true
}, vista)
const seguir = () => p.evaluate(() => { const m = window.aimcore; if (m.__bucle) { m._loop = m.__bucle; m.__bucle = null; m._rafId = requestAnimationFrame(m._loop) } })

const BISEL = await p.evaluate(async () => (await import('/src/config.js')).VIEWMODEL.bisel.anchoU)
const medidas = {}
for (const arma of ['krakov', 'pulse']) {
  for (const piloto of [false, true]) {
    const et = piloto ? 'piloto' : 'v3'
    const r = await poner(arma, piloto)
    medidas[`${arma}-${et}`] = r
    await p.waitForTimeout(700)
    await p.screenshot({ path: `scratchpad/piloto105-${arma}-${et}-juego.png` })
    for (const vista of ['tresCuartos', 'arriba', 'perfil']) {
      await estudio(vista)
      await p.screenshot({ path: `scratchpad/piloto105-${arma}-${et}-${vista}.png` })
    }
    await seguir()
    console.log(`${arma} ${et}: ${r.tri} triángulos (${r.msConstruir.toFixed(0)} ms en construirse) · largo ${r.largo.toFixed(3)} · alto ${r.alto.toFixed(3)} · grosor de atrás a la boca ${r.grosorDeAtrasAlante.join(' ')}`)
  }
  const a = medidas[`${arma}-v3`]; const b = medidas[`${arma}-piloto`]
  // La v3 lleva un bisel que ensancha el perfil `bisel.anchoU` por cada lado; el
  // piloto no tiene bisel (el contorno está en z = 0), así que lo esperado es eso.
  const b2 = 2 * BISEL
  afirmar(`${arma}: el perfil no se mueve (largo y alto, descontado el bisel de la v3)`, Math.abs(a.largo - b.largo - b2) < 0.001 && Math.abs(a.alto - b.alto - b2) < 0.001, `largo ${a.largo.toFixed(4)} → ${b.largo.toFixed(4)} · alto ${a.alto.toFixed(4)} → ${b.alto.toFixed(4)}`)
  const g = b.celdas.filter((x) => x > 0.004)
  afirmar(`${arma}: el grosor varía por zonas`, Math.max(...g) / Math.min(...g) > 1.6, `de ${Math.min(...g)} a ${Math.max(...g)}`)
}

// Coste: con el piloto puesto, un frame con y sin el arma.
await poner('krakov', true)
const coste = await p.evaluate(async () => {
  const m = window.aimcore
  const medir = (ms) => new Promise((ok) => {
    const t = []; const loop = m._loop
    m._loop = (now) => { const t0 = performance.now(); loop(now); t.push(performance.now() - t0) }
    setTimeout(() => { m._loop = loop; t.sort((x, y) => x - y); ok({ n: t.length, media: t.reduce((a, b) => a + b, 0) / t.length }) }, ms)
  })
  m._conArmaEnMano = true; const con = await medir(6000)
  m._conArmaEnMano = false; const sin = await medir(6000)
  m._conArmaEnMano = true
  return { con, sin }
})
console.log(`coste (Krakov piloto): con ${coste.con.media.toFixed(2)} ms (${coste.con.n}) · sin ${coste.sin.media.toFixed(2)} ms (${coste.sin.n})`)
afirmar('sin errores de página', err.length === 0, err.slice(0, 2).join(' | '))
console.log(fallos ? `${fallos} FALLOS` : 'TODO VERDE')
await nav.close()
process.exit(fallos ? 1 : 0)
