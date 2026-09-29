// vista104 — el arma en pantalla, v2: capturas de Pulse, Volt, Scout y Titan a
// 16:9, 21:9 y 4:3; que el cañón apunte al centro de la mira en los tres
// encuadres (medido proyectando la línea del cañón); y cuánto cuesta la segunda
// pasada. `ETIQUETA=antes|despues` decide el nombre de las capturas.
//
// Contra vite (5192): usa `window.aimcore`, el asa del motor en desarrollo.
import { chromium } from 'playwright-core'
const ETIQUETA = process.env.ETIQUETA || 'despues'
const MEDIR = ETIQUETA === 'despues'
let fallos = 0
const afirmar = (n, c, d = '') => {
  console.log((c ? '  ok  ' : '  FALLO ') + n + (d ? ` — ${d}` : ''))
  if (!c) fallos += 1
}
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const err = []
const ENCUADRES = [['16x9', 1280, 720], ['21x9', 1680, 720], ['4x3', 960, 720]]
const ARMAS = [['pulse', 'secondary'], ['volt', 'primary'], ['scout', 'primary'], ['titan', 'primary']]

for (const [nombre, w, h] of ENCUADRES) {
  const p = await nav.newPage({ viewport: { width: w, height: h } })
  p.on('pageerror', (e) => err.push(String(e)))
  await p.addInitScript(() => localStorage.setItem('aimcore.settings.v1', JSON.stringify({ armaEnPantalla: true, scenario: 'largoYPuerta', trainingMode: 'deathmatch' })))
  await p.goto('http://localhost:5192/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
  await p.mouse.click(40, h - 20); await p.waitForTimeout(1500)
  for (const [arma, ranura] of ARMAS) {
    await p.evaluate(({ arma, ranura }) => {
      const m = window.aimcore
      // Por el camino de siempre, para que el HUD diga el arma que se ve.
      m.slots[ranura] = arma
      m.slot = ranura === 'secondary' ? 'melee' : 'secondary'
      m._equipSlot(ranura)
      m.controls.lookAt(0.3); m.camera.rotation.x = -0.05
    }, { arma, ranura })
    await p.waitForTimeout(700)
    await p.screenshot({ path: `scratchpad/vista104-${ETIQUETA}-${arma}-${nombre}.png` })
    if (MEDIR) {
      // La línea del cañón, proyectada con la cámara del arma: ¿pasa por el centro?
      const r = await p.evaluate(() => {
        const vm = window.aimcore.armaEnMano
        const px = (v) => ({ x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight })
        const a = vm.puntoDelCanon(0).project(vm.camera)
        const b = vm.puntoDelCanon(vm.convergencia()).project(vm.camera)
        const A = px(a), B = px(b), C = { x: innerWidth / 2, y: innerHeight / 2 }
        // Distancia del centro a la recta AB, y del punto de convergencia al centro.
        const dist = Math.abs((B.x - A.x) * (A.y - C.y) - (A.x - C.x) * (B.y - A.y)) / Math.hypot(B.x - A.x, B.y - A.y)
        return { recta: dist, punta: Math.hypot(B.x - C.x, B.y - C.y), boca: A }
      })
      afirmar(`${arma} ${nombre}: el cañón apunta al centro`, r.recta < 1.5 && r.punta < 1.5,
        `recta a ${r.recta.toFixed(2)} px del centro · convergencia a ${r.punta.toFixed(2)} px · boca en (${r.boca.x.toFixed(0)}, ${r.boca.y.toFixed(0)})`)
    }
  }
  if (MEDIR && nombre === '16x9') {
    // Coste: tiempo del frame con y sin el arma, sobre el mismo encuadre.
    const coste = await p.evaluate(async () => {
      const m = window.aimcore
      const medir = (ms) => new Promise((ok) => {
        const t = []
        const loop = m._loop
        m._loop = (now) => { const t0 = performance.now(); loop(now); t.push(performance.now() - t0) }
        setTimeout(() => {
          m._loop = loop
          t.sort((x, y) => x - y)
          ok({ n: t.length, media: t.reduce((a, b) => a + b, 0) / t.length, p99: t[Math.floor(t.length * 0.99)] })
        }, ms)
      })
      m._conArmaEnMano = true
      const con = await medir(5000)
      m._conArmaEnMano = false
      const sin = await medir(5000)
      m._conArmaEnMano = true
      const vm = m.armaEnMano
      let tri = 0
      vm.scene.traverse((o) => { if (o.isMesh && o.visible && o.geometry) tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 })
      return { con, sin, tri }
    })
    console.log(`  coste: con arma ${coste.con.media.toFixed(2)} ms de media / ${coste.con.p99.toFixed(2)} p99 (${coste.con.n} frames) · sin arma ${coste.sin.media.toFixed(2)} / ${coste.sin.p99.toFixed(2)} (${coste.sin.n}) · ${Math.round(coste.tri)} triángulos en la escena del arma`)
  }
  if (MEDIR && nombre === '16x9') {
    // Con la mirilla puesta se esconde, y al disparar recula y vuelve.
    await p.evaluate(() => {
      const m = window.aimcore
      m.slots.primary = 'rift'; m.slot = 'secondary'; m._equipSlot('primary')
    })
    await p.waitForTimeout(400)
    await p.mouse.down(); await p.waitForTimeout(90)
    await p.screenshot({ path: `scratchpad/vista104-${ETIQUETA}-disparo.png` })
    await p.mouse.up()
  }
  await p.close()
}
afirmar('sin errores de página', err.length === 0, err.slice(0, 2).join(' | '))
console.log(fallos ? `${fallos} FALLOS` : 'TODO VERDE')
await nav.close()
process.exit(fallos ? 1 : 0)
