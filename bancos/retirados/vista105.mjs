// vista105 — el arma en pantalla calibrada por tipo (vuelta 105). Captura cada
// arma a 16:9 (y 21:9 y 4:3 con ENCUADRES=todos), con y sin mano de apoyo, mide
// dónde pasa la recta del cañón respecto a la mira, el giro hacia dentro, y
// cuánto cuesta la segunda pasada.  Contra vite (5192), por `window.aimcore`.
import { chromium } from 'playwright-core'
const TODOS = process.env.ENCUADRES === 'todos'
const COSTE = process.env.COSTE === '1'
const SOLO = process.env.ARMAS ? process.env.ARMAS.split(',') : null
let fallos = 0
const afirmar = (n, c, d = '') => { console.log((c ? '  ok  ' : '  FALLO ') + n + (d ? ` — ${d}` : '')); if (!c) fallos += 1 }
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const err = []
const ENCUADRES = TODOS ? [['16x9', 1280, 720], ['21x9', 1680, 720], ['4x3', 960, 720]] : [['16x9', 1280, 720]]
const ARMAS = [['pulse', 'secondary'], ['reaper', 'secondary'], ['volt', 'primary'], ['rift', 'primary'], ['krakov', 'primary'], ['titan', 'primary'], ['scout', 'primary'], ['pump', 'primary'], ['vanta', 'melee']]
  .filter(([a]) => !SOLO || SOLO.includes(a))
for (const [nombre, w, h] of ENCUADRES) {
  const p = await nav.newPage({ viewport: { width: w, height: h } })
  p.on('pageerror', (e) => err.push(String(e)))
  await p.addInitScript(() => localStorage.setItem('aimcore.settings.v1', JSON.stringify({ armaEnPantalla: true, scenario: 'largoYPuerta', trainingMode: 'deathmatch' })))
  await p.goto('http://localhost:5192/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
  await p.mouse.click(40, h - 20); await p.waitForTimeout(1500)
  for (const apoyo of [false, true]) {
    for (const [arma, ranura] of ARMAS) {
      const tieneApoyo = await p.evaluate(async ({ arma, ranura, apoyo }) => {
        const { VIEWMODEL } = await import('/src/config.js')
        VIEWMODEL.manoDeApoyo = apoyo
        const m = window.aimcore
        m.armaEnMano._clave = null
        if (ranura === 'melee') { m.slot = 'secondary'; m._equipSlot('melee') } else {
          m.slots[ranura] = arma
          m.slot = ranura === 'secondary' ? 'melee' : 'secondary'
          m._equipSlot(ranura)
        }
        m.armaEnMano._subir = 1
        m.controls.lookAt(0.3); m.camera.rotation.x = -0.05
        return VIEWMODEL.armas[arma]?.apoyo != null
      }, { arma, ranura, apoyo })
      if (apoyo && !tieneApoyo) continue
      await p.waitForTimeout(600)
      const sufijo = apoyo ? '-apoyo' : ''
      await p.screenshot({ path: `scratchpad/vista105-${arma}-${nombre}${sufijo}.png` })
      if (apoyo) continue
      const r = await p.evaluate(() => {
        const vm = window.aimcore.armaEnMano
        const px = (v) => ({ x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight })
        const conv = vm.convergencia()
        const giro = Math.atan2(-vm.puntoDelCanon(1).sub(vm.puntoDelCanon(0)).x, 1) * 180 / Math.PI
        if (conv == null) return { cuchillo: true }
        const A = px(vm.puntoDelCanon(0).project(vm.camera))
        const B = px(vm.puntoDelCanon(conv).project(vm.camera))
        const C = { x: innerWidth / 2, y: innerHeight / 2 }
        const dist = Math.abs((B.x - A.x) * (A.y - C.y) - (A.x - C.x) * (B.y - A.y)) / Math.hypot(B.x - A.x, B.y - A.y)
        const d = vm.puntoDelCanon(1).sub(vm.puntoDelCanon(0))
        return { recta: dist, conv, giro: Math.atan2(-d.x, -d.z) * 180 / Math.PI, cabeceo: Math.asin(d.y) * 180 / Math.PI, boca: A }
      })
      if (r.cuchillo) console.log(`  ${arma} ${nombre}: cuchillo (hoja arriba a la izquierda)`)
      else afirmar(`${arma} ${nombre}: apunta a la mira`, r.recta < 1.5,
        `recta a ${r.recta.toFixed(2)} px · giro ${r.giro.toFixed(1)}° · cabeceo ${r.cabeceo.toFixed(1)}° · corta el eje a ${r.conv.toFixed(2)} u · boca (${r.boca.x.toFixed(0)}, ${r.boca.y.toFixed(0)})`)
    }
  }
  if (COSTE && nombre === '16x9') {
    await p.evaluate(async () => { const { VIEWMODEL } = await import('/src/config.js'); VIEWMODEL.manoDeApoyo = true; const m = window.aimcore; m.slots.primary = 'krakov'; m.slot = 'secondary'; m._equipSlot('primary') })
    const coste = await p.evaluate(async () => {
      const m = window.aimcore
      const medir = (ms) => new Promise((ok) => {
        const t = []
        const loop = m._loop
        m._loop = (now) => { const t0 = performance.now(); loop(now); t.push(performance.now() - t0) }
        setTimeout(() => { m._loop = loop; t.sort((x, y) => x - y); ok({ n: t.length, media: t.reduce((a, b) => a + b, 0) / t.length, p99: t[Math.floor(t.length * 0.99)] }) }, ms)
      })
      m._conArmaEnMano = true; const con = await medir(6000)
      m._conArmaEnMano = false; const sin = await medir(6000)
      m._conArmaEnMano = true
      let tri = 0
      m.armaEnMano.scene.traverse((o) => { if (o.isMesh && o.visible && o.geometry) tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 })
      return { con, sin, tri }
    })
    console.log(`  coste (Krakov con mano de apoyo): con arma ${coste.con.media.toFixed(2)} ms de media / ${coste.con.p99.toFixed(2)} p99 (${coste.con.n} frames) · sin arma ${coste.sin.media.toFixed(2)} / ${coste.sin.p99.toFixed(2)} (${coste.sin.n}) · ${Math.round(coste.tri)} triángulos`)
  }
  await p.close()
}
afirmar('sin errores de página', err.length === 0, err.slice(0, 2).join(' | '))
console.log(fallos ? `${fallos} FALLOS` : 'TODO VERDE')
await nav.close()
process.exit(fallos ? 1 : 0)
