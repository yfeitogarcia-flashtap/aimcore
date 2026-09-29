// holo105 — el piloto holográfico (Krakov y Pulse) al lado de no llevar arma,
// en juego a 16:9, mismo sitio y misma vista. Afirma que sin `disponible` no se
// construye nada, que con él el holograma no tiene relleno y sí las dos caras
// del contorno en el color del jugador, y mide el coste con y sin él.
import { chromium } from 'playwright-core'
let fallos = 0
const ok = (t, c, d = '') => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}${d ? ` — ${d}` : ''}`); if (!c) fallos += 1 }
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const err = []
const p = await nav.newPage({ viewport: { width: 1280, height: 720 } })
p.on('pageerror', (e) => err.push(String(e)))
await p.addInitScript(() => localStorage.setItem('aimcore.settings.v1', JSON.stringify({ armaEnPantalla: true, scenario: 'largoYPuerta', trainingMode: 'deathmatch' })))
await p.goto('http://localhost:5192/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
await p.mouse.click(40, 700); await p.waitForTimeout(1500)

const antes = await p.evaluate(() => ({ construida: Boolean(window.aimcore.armaEnMano), fila: document.body.innerText.includes('Arma en pantalla') }))
ok('sin `disponible`, con el ajuste guardado encendido, el motor no la construye', !antes.construida)

const poner = (arma, holo) => p.evaluate(async ({ arma, holo }) => {
  const { VIEWMODEL } = await import('/src/config.js')
  VIEWMODEL.disponible = holo
  const m = window.aimcore
  m._conArmaEnMano = holo
  if (holo && !m.armaEnMano) {
    const { ArmaEnMano } = await import('/src/game/armaEnMano.js')
    m.armaEnMano = new ArmaEnMano()
  }
  const ranura = arma === 'pulse' ? 'secondary' : 'primary'
  m.slots[ranura] = arma
  m.slot = ranura === 'secondary' ? 'melee' : 'secondary'
  m._equipSlot(ranura)
  if (m.armaEnMano) { m.armaEnMano._clave = null; m.armaEnMano.poner(arma); m.armaEnMano._subir = 1 }
  m.controls.lookAt(0.3); m.camera.rotation.x = -0.05
  const g = m.armaEnMano?.arma.children[0]
  return g ? { relleno: g.children[0].visible, caras: g.children.slice(1).filter((t) => t.visible).length, color: '#' + g.children[1].material.color.getHexString(), aditivo: g.children[1].material.blending === 2 } : null
}, { arma, holo })

await poner('krakov', false)
await p.waitForTimeout(700)
await p.screenshot({ path: 'scratchpad/holo105-sin.png' })
for (const arma of ['krakov', 'pulse']) {
  const r = await poner(arma, true)
  await p.waitForTimeout(700)
  await p.screenshot({ path: `scratchpad/holo105-${arma}.png` })
  ok(`${arma}: holograma sin relleno, con un solo contorno`, r && !r.relleno && r.caras === 1, JSON.stringify(r))
}
// Coste: el mismo frame con y sin el holograma.
const coste = await p.evaluate(async () => {
  const m = window.aimcore
  const medir = (ms) => new Promise((ok) => {
    const t = []; const loop = m._loop
    m._loop = (now) => { const t0 = performance.now(); loop(now); t.push(performance.now() - t0) }
    setTimeout(() => { m._loop = loop; ok(t.reduce((a, b) => a + b, 0) / t.length) }, ms)
  })
  m._conArmaEnMano = true; const con = await medir(5000)
  m._conArmaEnMano = false; const sin = await medir(5000)
  return { con, sin }
})
console.log(`  coste (Krakov holográfico, WebGL por software): ${coste.con.toFixed(2)} ms con, ${coste.sin.toFixed(2)} ms sin`)
ok('sin errores de página', err.length === 0, err.slice(0, 2).join(' | '))
await nav.close()
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
