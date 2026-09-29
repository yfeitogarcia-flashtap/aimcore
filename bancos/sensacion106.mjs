// sensacion106 — que disparar se sienta sin un arma en pantalla (vuelta 106,
// propuesta 13): el fogonazo, la sacudida de la vista y la silueta del HUD.
//
// Contra el motor del editor (`vektorEditor.motor`), que monta el HUD del juego
// (vuelta 73) y es el único sitio donde un banco puede leer la cámara sin abrir
// una puerta al motor en el producto (lo mismo que `krakov93nav`). Y contra la
// página del juego para la fila de Opciones y para que el fogonazo no tape el
// bloque de arma en las cuatro resoluciones de siempre.
//
// Pide el servidor de desarrollo en el 5192 (grupo E).
import { chromium } from 'playwright-core'
import { SENSACION, WEAPONS } from '../src/config.js'

const BASE = process.env.BASE || 'http://localhost:5192'
let fallos = 0
const ok = (t, c, d = '') => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}${d ? ` — ${d}` : ''}`); if (!c) fallos += 1 }
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const errores = []

async function editor(ajustes) {
  const p = await nav.newPage({ viewport: { width: 1280, height: 720 } })
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.addInitScript((a) => {
    localStorage.setItem('aimcore.settings.v1', JSON.stringify(a))
  }, ajustes)
  await p.goto(`${BASE}/editor/`, { waitUntil: 'load' })
  await p.waitForTimeout(2600)
  await p.evaluate(() => { window.vektorEditor.probar() })
  await p.waitForTimeout(1500)
  await p.mouse.click(40, 700)
  await p.waitForTimeout(1000)
  return p
}
const leer = (p) => p.evaluate(() => {
  const m = window.vektorEditor.motor
  return {
    arma: m.weaponKey, ammo: m.ammo, recargando: m.reloading,
    fogonazos: m.fogonazo?.encendidos ?? -1,
    silueta: document.querySelector('.hud__silueta')?.getAnimations().length ?? -1,
    clase: document.querySelector('.hud__silueta')?.className ?? '',
    recorte: document.querySelector('.hud__silueta-llena')?.style.clipPath ?? '',
  }
})

// ------------------------------------------------------------ [1] el fogonazo
console.log('\n[1] El fogonazo: sale con cada bala, y sólo con pólvora')
{
  const p = await editor({ weapon: 'rift', sacudidaCamara: true })
  // El clic que captura el ratón ya dispara (en el editor, como en el juego):
  // lo que se exige es una luz por cada bala que falte en el cargador.
  const a = await leer(p)
  ok('premisa: la Rift en la mano y el fogonazo montado', a.arma === 'rift' && a.fogonazos === WEAPONS.rift.magazine - a.ammo && (await p.locator('.vk-fogonazo').count()) === 1, JSON.stringify(a))
  await p.mouse.down()
  await p.waitForTimeout((60_000 / WEAPONS.rift.rpm) * 5 + 30)
  await p.mouse.up()
  await p.waitForTimeout(150)
  const b = await leer(p)
  const balas = a.ammo - b.ammo
  ok('una luz por bala', balas >= 4 && b.fogonazos - a.fogonazos === balas, `${balas} balas, ${b.fogonazos - a.fogonazos} fogonazos`)
  const pico = await p.evaluate(() => {
    // La opacidad de la luz en su pico, leída de la animación que se puso.
    const m = window.vektorEditor.motor
    m.fogonazo.show('rift')
    const k = m.fogonazo._anim.effect.getKeyframes()
    return Number(k[0].opacity)
  })
  ok('y su pico es el del arma, por debajo del techo', Math.abs(pico - SENSACION.fogonazo.opacidad * SENSACION.fogonazo.porArma.rift) < 1e-6 && pico <= SENSACION.fogonazo.opacidadMax, pico.toFixed(3))
  // El cuchillo no quema pólvora.
  await p.keyboard.press('Digit3')
  await p.waitForTimeout(500)
  const c = await leer(p)
  await p.mouse.click(640, 360)
  await p.waitForTimeout(600)
  const d = await leer(p)
  ok('el cuchillo no lo enciende', c.arma === 'vanta' && d.fogonazos === c.fogonazos, `${c.arma}: ${c.fogonazos} → ${d.fogonazos}`)

  // ---------------------------------------------------------- [2] sacudida
  console.log('\n[2] La sacudida: la vista da un golpe y la mira no se entera')
  await p.keyboard.press('Digit1')
  await p.waitForTimeout(600)
  await p.evaluate(() => {
    const m = window.vektorEditor.motor
    window.__sac = { golpes: 0, fovMin: Infinity, fuera: 0, antes: null }
    const aplicar = m._aplicarSacudida.bind(m)
    const quitar = m._quitarSacudida.bind(m)
    m._aplicarSacudida = (now) => {
      const c = m.camera
      window.__sac.antes = { x: c.position.x, y: c.position.y, z: c.position.z, rx: c.rotation.x, ry: c.rotation.y, fov: c.fov }
      const r = aplicar(now)
      if (r) { window.__sac.golpes += 1; window.__sac.fovMin = Math.min(window.__sac.fovMin, c.fov / window.__sac.antes.fov) }
      return r
    }
    m._quitarSacudida = () => {
      quitar()
      const c = m.camera
      const a = window.__sac.antes
      // **Exactamente** como estaba: se guardan los valores, no se resta.
      if (c.position.x !== a.x || c.position.y !== a.y || c.position.z !== a.z || c.rotation.x !== a.rx || c.rotation.y !== a.ry || c.fov !== a.fov) window.__sac.fuera += 1
    }
  })
  await p.mouse.down()
  await p.waitForTimeout((60_000 / WEAPONS.rift.rpm) * 4 + 30)
  await p.mouse.up()
  await p.waitForTimeout(300)
  const s = await p.evaluate(() => window.__sac)
  ok('hay golpe mientras se dispara', s.golpes >= 2, `${s.golpes} frames con golpe`)
  ok('con el pellizco de campo de visión', s.fovMin < 1 && s.fovMin >= 1 - SENSACION.sacudida.fov * SENSACION.sacudida.escalaMax - 1e-9, s.fovMin.toFixed(4))
  ok('y la cámara vuelve exactamente a donde estaba después de cada dibujo', s.fuera === 0, `${s.fuera} frames distintos`)
  // Apagada, no hay golpe: lo que el ajuste escribe es `_conSacudida`.
  await p.evaluate(() => { window.vektorEditor.motor._conSacudida = false; window.__sac.golpes = 0 })
  await p.mouse.down()
  await p.waitForTimeout((60_000 / WEAPONS.rift.rpm) * 3 + 30)
  await p.mouse.up()
  await p.waitForTimeout(300)
  ok('con el interruptor apagado, ninguno', (await p.evaluate(() => window.__sac.golpes)) === 0)
  await p.evaluate(() => { window.vektorEditor.motor._conSacudida = true })

  // ---------------------------------------------------------- [3] silueta
  console.log('\n[3] La silueta del HUD: dispara, recarga y en seco')
  await p.mouse.click(640, 360)
  await p.waitForTimeout(20)
  ok('al disparar, recula', (await leer(p)).silueta >= 1)
  // Vaciar el cargador: la última bala arranca la recarga sola.
  await p.mouse.down()
  for (let i = 0; i < 60 && !(await leer(p)).recargando; i++) await p.waitForTimeout(100)
  await p.mouse.up()
  const r1 = await leer(p)
  ok('recargando, la silueta se apaga', r1.recargando && /hud__silueta--recargando/.test(r1.clase), r1.clase)
  await p.waitForTimeout(40)
  const seco0 = (await leer(p)).silueta
  await p.mouse.click(640, 360)
  await p.waitForTimeout(20)
  ok('en seco, tiembla', (await leer(p)).silueta > seco0 || (await leer(p)).silueta >= 1)
  await p.waitForTimeout(500)
  const r2 = await leer(p)
  await p.waitForTimeout(700)
  const r3 = await leer(p)
  const pct = (t) => Number(/inset\(0(?:px)? 0(?:px)? 0(?:px)? ([\d.]+)%\)/.exec(t)?.[1] ?? NaN)
  ok('y se llena de atrás adelante', pct(r2.recorte) > pct(r3.recorte), `${r2.recorte} → ${r3.recorte}`)
  await p.waitForTimeout(WEAPONS.rift.reloadMs)
  const r4 = await leer(p)
  ok('al acabar vuelve a estar entera', !r4.recargando && !/recargando/.test(r4.clase), r4.clase)

  // ---------------------------------------------------------- [5] coste
  console.log('\n[5] Lo que cuesta')
  const coste = await p.evaluate(() => {
    const m = window.vektorEditor.motor
    const N = 20000
    m._sacudidaDesde = performance.now(); m._sacudidaEscala = 1
    let t0 = performance.now()
    for (let i = 0; i < N; i++) { if (m._aplicarSacudida(m._sacudidaDesde + 40)) m._quitarSacudida() }
    const porFrame = (performance.now() - t0) / N
    const M = 400
    t0 = performance.now()
    for (let i = 0; i < M; i++) m._sentirDisparo()
    const porDisparo = (performance.now() - t0) / M
    return { porFrame, porDisparo }
  })
  ok('la sacudida por frame, muy por debajo de 0.05 ms', coste.porFrame < 0.05, `${(coste.porFrame * 1000).toFixed(2)} µs`)
  ok('y encender las tres cosas en un disparo, por debajo de 0.2 ms', coste.porDisparo < 0.2, `${(coste.porDisparo * 1000).toFixed(1)} µs por disparo`)
  // Un informe, no una afirmación: con WebGL por software el frame lo pone el
  // dibujo, y la diferencia se pierde en el ruido.
  const fps = async (con) => {
    await p.evaluate((c) => { const m = window.vektorEditor.motor; m._conSacudida = c; window.__fogOn = c; if (!c) { m.__show = m.fogonazo.show; m.fogonazo.show = () => false } else if (m.__show) m.fogonazo.show = m.__show }, con)
    await p.keyboard.press('KeyR'); await p.waitForTimeout(WEAPONS.rift.reloadMs + 200)
    const f0 = await p.evaluate(() => window.vektorEditor.motor.stats?.fps ?? 0)
    await p.mouse.down(); await p.waitForTimeout(1500)
    const f1 = await p.evaluate(() => window.vektorEditor.motor.stats?.fps ?? 0)
    await p.mouse.up()
    return { f0, f1 }
  }
  const sin = await fps(false)
  const con = await fps(true)
  console.log(`  (informe) FPS disparando: sin nada ${sin.f1.toFixed(1)} · con las tres ${con.f1.toFixed(1)}`)
  await p.close()
}

// ------------------------------------------- [4] no tapa, y la fila de Opciones
console.log('\n[4] El fogonazo no cae sobre el bloque de arma, y la sacudida tiene fila')
for (const [w, h] of [[1920, 1080], [1600, 900], [1366, 768], [1280, 860]]) {
  const p = await editor({ weapon: 'rift' })
  await p.setViewportSize({ width: w, height: h })
  await p.waitForTimeout(400)
  const caja = await p.evaluate(() => {
    const r = document.querySelector('.hud__weapon')?.getBoundingClientRect()
    return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null
  })
  const f = SENSACION.fogonazo
  const cx = f.x * w
  const cy = f.y * h
  const radio = f.radio * Math.min(w, h)
  const dx = Math.max(caja.l - cx, 0, cx - caja.r)
  const dy = Math.max(caja.t - cy, 0, cy - caja.b)
  const dist = Math.hypot(dx, dy)
  ok(`${w}×${h}: la luz no llega al bloque de arma`, caja && dist > radio, `a ${dist.toFixed(0)} px, radio ${radio.toFixed(0)}`)
  await p.close()
}
{
  const p = await nav.newPage({ viewport: { width: 1366, height: 768 } })
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await p.click('text=Jugar ahora')
  await p.click('.cab-rail__item:has-text("Opciones")')
  await p.waitForTimeout(400)
  const fila = p.locator('.field', { hasText: 'Sacudida de cámara' })
  ok('Opciones tiene la fila, encendida de fábrica', (await fila.count()) === 1 && (await fila.locator('.toggle').getAttribute('aria-pressed')) === 'true')
  await fila.locator('.toggle').click()
  await p.waitForTimeout(200)
  const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem('aimcore.settings.v1') ?? '{}').sacudidaCamara)
  ok('y apagarla se guarda', guardado === false, String(guardado))
  await p.close()
}

ok('ni un error de página', errores.length === 0, errores.slice(0, 2).join(' | '))
await nav.close()
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
