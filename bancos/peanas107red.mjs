// peanas107red — un mapa con peanas en el multijugador de verdad (vuelta 107).
//
// F4: una sala **creada directamente** con un mapa que declara sus armas dejaba
// la pantalla en negro —el motor filtraba las ranuras antes de tenerlas— y sólo
// se salvaba creándola con otro mapa y cambiándolo después.
// F5: al revés, cambiando el mapa desde el lobby las peanas **no se dibujaban**:
// su montaje había caído en el constructor y no en `_buildScenario`, que es por
// donde el multijugador cambia siempre de mapa. La E sí cogía, porque eso es del
// servidor.
//
// Mide las dos puertas con el mapa de Yago (`el-espejo-peanas`), dos navegadores
// y el huésped de fábrica en el 5199: sin errores de página, los dos en la
// partida, cuatro zócalos y sus armas en la escena, y la ficha encima al mirar.
import { chromium } from 'playwright-core'
const OUT = '/home/user/aimcore/scratchpad'
const BASE = process.env.BASE || 'http://localhost:5199'
const MAPA = 'el-espejo-peanas'
let fallos = 0
const ok = (t, c, d = '') => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}${d ? ` — ${d}` : ''}`); if (!c) fallos += 1 }
const lanzar = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const navs = await Promise.all([lanzar(), lanzar()])
const errores = []

const peanas = (p) => p.evaluate(() => {
  const d = window.vektorNet.motor.dibujoPeanas
  return {
    mapa: window.vektorNet.motor.scenario.key,
    peanas: d.peanas.length,
    zocalos: d._zocalos?.count ?? 0,
    armas: d._mallas.reduce((n, m) => n + m.count, 0),
    enEscena: d.group.parent === window.vektorNet.motor.scene,
    fichas: d.fichasVisibles,
  }
})

async function partida(nombre, crear) {
  console.log(`\n${nombre}`)
  const [A, B] = await Promise.all(navs.map((n) => n.newPage({ viewport: { width: 1280, height: 720 } })))
  for (const p of [A, B]) p.on('pageerror', (e) => errores.push(`${nombre}: ${e.message}`))
  await A.goto(crear, { waitUntil: 'networkidle' })
  await A.waitForTimeout(2500)
  ok('el anfitrión carga la página sin reventar', await A.evaluate(() => Boolean(window.vektorNet)))
  if (!await A.evaluate(() => Boolean(window.vektorNet))) { await A.close(); await B.close(); return }
  if (await A.evaluate(() => window.vektorNet.sala?.mapa) !== MAPA) {
    await A.evaluate((mapa) => window.vektorNet.mandarALaSala({ t: 'lc', mapa }), MAPA)
    await A.waitForTimeout(800)
  }
  const enlace = await A.evaluate(() => document.getElementById('enlace')?.value)
  await B.goto(enlace, { waitUntil: 'networkidle' })
  await B.waitForTimeout(2500)
  ok('el invitado entra por el enlace sin reventar', await B.evaluate(() => Boolean(window.vektorNet)), enlace)
  for (const p of [A, B]) { await p.click('#listo'); await p.waitForTimeout(300) }
  await A.waitForTimeout(500)
  await A.click('#lanzar')
  await A.waitForTimeout(4000)
  for (const [n, p] of [['A', A], ['B', B]]) {
    const vista = await p.evaluate(() => window.vektorNet.vista)
    const e = await peanas(p)
    ok(`${n} juega en ${MAPA} con sus cuatro peanas dibujadas`, vista === 'juego' && e.mapa === MAPA && e.peanas === 4 && e.zocalos === 4 && e.armas === 4 && e.enEscena, JSON.stringify(e))
  }
  // La ficha: de espaldas al centro, mirando a las dos peanas de su lado.
  await A.mouse.click(30, 600)
  await A.waitForTimeout(800)
  const z = await A.evaluate(() => window.vektorNet.camara.position.z)
  await A.evaluate((z) => window.vektorNet.motor.controls.lookAt(z > 0 ? Math.PI : 0), z)
  await A.waitForTimeout(1500)
  const e = await peanas(A)
  ok('mirando a su lado, las fichas de encima salen', e.fichas >= 1, `${e.fichas} fichas`)
  await A.screenshot({ path: `${OUT}/peanas107red-${nombre.startsWith('Creada') ? 'directa' : 'cambio'}.png` })
  await A.close(); await B.close()
}

await partida('Creada directamente con el mapa (F4)', `${BASE}/duelo/?mapa=${MAPA}`)
await partida('Creada con El Espejo y cambiada en el lobby (F5)', `${BASE}/duelo/`)
ok('ni un error de página', errores.length === 0, errores.slice(0, 2).join(' | '))
await Promise.all(navs.map((n) => n.close()))
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
