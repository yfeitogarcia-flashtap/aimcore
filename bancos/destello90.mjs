/**
 * El destello de mira del Titan, visto desde el otro navegador.
 *
 * Es la medida que el arma necesita: su coste no es un número, es que el rival
 * **lo vea**. Y con su premisa delante (vuelta 46): antes de decir «se ve un
 * destello» hay que comprobar que se ve el cuerpo.
 */
import { chromium } from 'playwright-core'

// Un paso en rojo hace fallar el banco (auditoría de la vuelta 105).
let fallos = 0
const veredicto = (bien, si = 'OK', no = 'FALLO') => { if (!bien) fallos += 1; return bien ? si : no }

const BASE = 'http://localhost:5199'
const SALA = 'DESTEL'
const EJECUTABLE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

async function abrir(navegador, arma) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.addInitScript((a) => {
    localStorage.setItem('aimcore.settings.v1', JSON.stringify({ weapon: a, scenario: 'duelo' }))
  }, arma)
  await page.goto(`${BASE}/duelo/${SALA}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.vektorNet?.cliente?.conectado === true, { timeout: 20000 })
  // El clic que captura el ratón va **a una esquina**: el centro de esta
  // pantalla es un `.control` y ahí el clic no captura (vuelta 48).
  await page.mouse.click(40, 700)
  await esperar(500)
  return { page, errores }
}

/** Ancho en píxeles de una malla, proyectando su caja contra la cámara. */
const MEDIR = `(malla) => {
  const net = window.vektorNet
  if (!malla || !malla.visible) return { px: 0, alto: 0 }
  const THREE = malla.constructor
  malla.updateWorldMatrix(true, false)
  const geo = malla.geometry
  geo.computeBoundingBox()
  const bb = geo.boundingBox
  const cam = net.camara
  const lienzo = document.querySelector('canvas')
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (let i = 0; i < 8; i++) {
    const v = new (malla.position.constructor)(
      i & 1 ? bb.max.x : bb.min.x,
      i & 2 ? bb.max.y : bb.min.y,
      i & 4 ? bb.max.z : bb.min.z,
    )
    v.applyMatrix4(malla.matrixWorld).project(cam)
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x)
    y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
  }
  return {
    px: +(((x1 - x0) / 2) * lienzo.clientWidth).toFixed(1),
    alto: +(((y1 - y0) / 2) * lienzo.clientHeight).toFixed(1),
  }
}`

async function estado(page) {
  return page.evaluate(`(() => {
    const net = window.vektorNet
    const slot = net.motor.markers.slots[0]
    const medir = ${MEDIR}
    const cuerpo = net.rival
    let cuerpoPx = 0
    if (cuerpo?.group?.visible) {
      const cam = net.camara
      const p = cuerpo.group.position
      const lienzo = document.querySelector('canvas')
      const v = new (cam.position.constructor)(p.x, p.y + 1.8, p.z).project(cam)
      const w = new (cam.position.constructor)(p.x, p.y, p.z).project(cam)
      cuerpoPx = +(Math.abs(v.y - w.y) / 2 * lienzo.clientHeight).toFixed(1)
    }
    return {
      mirillaDelRival: net.cliente.rival.mirilla === true,
      armaDelRival: net.cliente.rival.arma,
      brilloVisible: Boolean(slot?.brillo?.visible),
      brillo: slot?.brillo ? medir(slot.brillo) : null,
      cuerpoAltoPx: cuerpoPx,
      miMirilla: net.cliente.mirilla === true,
      apuntando: net.motor._scopeOn === true,
      miArma: net.motor.weaponKey,
      brujula: Boolean(slot?.needle?.visible),
      grupo: Boolean(slot?.group?.visible),
      instanciaMirilla: net.motor._rivalInstancia?.mirilla === true,
      instanciaEstado: net.motor._rivalInstancia?.state,
      marcadores: net.motor.markers.enabled,
      ranuras: net.motor.markers.slots.length,
    }
  })()`)
}

const navegador = await chromium.launch({ executablePath: EJECUTABLE, args: ARGS })
const A = await abrir(navegador, 'titan')
const B = await abrir(navegador, 'rift')
await esperar(1500)

/**
 * **Cara a cara y viéndose de verdad**, y el sitio se busca en vez de
 * suponerse: El Espejo tiene el centro tapado a propósito (vuelta 66), así que
 * dos puntos enfrentados a doce unidades suelen tener una caja en medio — y
 * entonces los marcadores no salen, que es la regla de la vuelta 42 y no un
 * fallo. Es la misma premisa que costó tres intentos en `laser87`.
 */
const par = await B.page.evaluate(() => {
  const net = window.vektorNet
  const V = net.camara.position.constructor
  const a = new V(), b = new V()
  for (const x of [-17, -14, -11, 11, 14, 17, 0]) {
    for (const d of [12, 9, 6]) {
      a.set(x, 1.7, d / 2); b.set(x, 1.7, -d / 2)
      if (net.verDesde(a, b, net.escenario.occluders)) return { x, d }
    }
  }
  return null
})
console.log('puesto con línea de visión:', JSON.stringify(par))
if (!par) { console.log('sin par visible: no hay nada que medir'); process.exit(1) }
await A.page.evaluate((p) => window.vektorNet.cliente.transporte.send(JSON.stringify({ t: 'c', x: p.x, z: p.d / 2 })), par)
await B.page.evaluate((p) => window.vektorNet.cliente.transporte.send(JSON.stringify({ t: 'c', x: p.x, z: -p.d / 2 })), par)
await esperar(1200)
// B mira a A (A está en +Z desde B, así que yaw = π).
await B.page.evaluate(() => window.vektorNet.motor.controls.lookAt(Math.PI))
await A.page.evaluate(() => window.vektorNet.motor.controls.lookAt(0))
await esperar(1200)

console.log('--- premisa: ¿B ve a A? ---')
let e = await estado(B.page)
console.log(`cuerpo del rival en la pantalla de B: ${e.cuerpoAltoPx} px de alto · arma que le ve: ${e.armaDelRival ?? '(aún ninguna)'}`)
if (e.cuerpoAltoPx < 20) { console.log('  ¡PREMISA ROTA! sin cuerpo a la vista no se mide nada'); await navegador.close(); process.exit(1) }

console.log('\n--- sin mirilla ---')
console.log(`  A: mirilla=${(await estado(A.page)).miMirilla} · B: destello=${e.brilloVisible} (${e.brillo?.px ?? 0} px)`, veredicto(!e.brilloVisible))

console.log('\n--- A apunta con el Titan (clic derecho) ---')
await A.page.mouse.click(640, 360, { button: 'right' })
await esperar(1200)
const ea = await estado(A.page)
e = await estado(B.page)
console.log(`  A: mirilla=${ea.miMirilla}`)
console.log(`  B: rival.mirilla=${e.mirillaDelRival} · destello visible=${e.brilloVisible} · ${e.brillo?.px} × ${e.brillo?.alto} px`, veredicto(ea.miMirilla && e.brilloVisible))
console.log(`     diagnóstico: grupo=${e.grupo} brújula=${e.brujula} instancia.mirilla=${e.instanciaMirilla} estado=${e.instanciaEstado} marcadores=${e.marcadores} ranuras=${e.ranuras}`)

console.log('\n--- y A la baja ---')
await A.page.mouse.click(640, 360, { button: 'right' })
await esperar(1200)
e = await estado(B.page)
console.log(`  B: rival.mirilla=${e.mirillaDelRival} · destello visible=${e.brilloVisible} (${e.brillo?.px ?? 0} px)`, veredicto(!e.brilloVisible))

console.log('\n--- y la Scout apunta en silencio ---')
await A.page.evaluate(() => {
  const m = window.vektorNet.motor
  m.slots.primary = 'scout'
  m.weaponKey = 'scout'
  m._refillMagazine()
})
await esperar(600)
await A.page.mouse.click(640, 360, { button: 'right' })
await esperar(1200)
const es = await estado(A.page)
e = await estado(B.page)
console.log(`  A: arma=${es.miArma} · apuntando=${es.apuntando} · declara destello=${es.miMirilla} → B: destello=${e.brilloVisible} (${e.brillo?.px ?? 0} px)`, veredicto(es.apuntando && !e.brilloVisible))

console.log('\nerrores de página: A', A.errores.length, '· B', B.errores.length)
if (A.errores.length) console.log('  A:', A.errores.slice(0, 3))
if (B.errores.length) console.log('  B:', B.errores.slice(0, 3))
await navegador.close()
if (A.errores.length || B.errores.length) fallos += 1
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
