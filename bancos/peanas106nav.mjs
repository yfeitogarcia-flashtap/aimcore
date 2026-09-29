// peanas106nav — las peanas contra la página (vuelta 106, propuesta 08 fase 1):
// recoger apuntando y con la E de verdad, el aviso bajo la mira, que pisarla no
// la coge, que la ficha no se anuncia a través de una pared, lo que cuesta con
// 0 / 40 / 160 peanas, y la hoja «Reglas» de Alchemist.
//
// Contra el editor (`vektorEditor`), que prueba el mapa con el motor de verdad
// y es el único sitio donde un banco puede poner un mapa delante sin tocar el
// disco. `peanas106` mide lo mismo sin navegador, contra `Partida`.
//
// Pide el servidor de desarrollo en el 5192 (grupo E).
import { chromium } from 'playwright-core'
import { PEANAS, WEAPONS } from '../src/config.js'

const BASE = process.env.BASE || 'http://localhost:5192'
let fallos = 0
const ok = (t, c, d = '') => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}${d ? ` — ${d}` : ''}`); if (!c) fallos += 1 }
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const errores = []

/**
 * La sala: el jugador en el origen mirando a −Z. Delante, a 2 u, un Krakov; un
 * Rift a la vista, lejos y a un lado; un Titan detrás de un muro alto; y una
 * Pump **justo detrás del jugador**, para pisarla.
 */
const sala = (extra = []) => ({
  clave: 'banco-peanas',
  label: 'Banco peanas',
  room: { width: 40, depth: 40, height: 10 },
  spawn: { x: 0, z: 0 },
  reglas: { modo: 'peanas', equipo: { chaleco: true } },
  boxes: [{ x: -4, z: -9, w: 8, d: 1, kind: 'alta' }],
  peanas: [
    { x: 0, z: -2, arma: 'krakov' },
    { x: 8, z: -12, arma: 'rift' },
    { x: 0, z: -14, arma: 'titan' },
    { x: 0, z: 2, arma: 'pump' },
    ...extra,
  ],
})

const p = await nav.newPage({ viewport: { width: 1280, height: 720 } })
p.on('pageerror', (e) => errores.push(String(e)))
await p.addInitScript(() => { localStorage.setItem('aimcore.settings.v1', JSON.stringify({ weapon: 'rift' })) })
await p.goto(`${BASE}/editor/`, { waitUntil: 'load' })
await p.waitForTimeout(2600)

async function probarCon(definicion) {
  await p.evaluate((d) => {
    const ed = window.vektorEditor
    if (ed.motor) ed.dejarDeProbar()
    ed.cargar(d, d.clave)
    ed.probar()
  }, definicion)
  await p.waitForTimeout(1500)
  await p.mouse.click(40, 700)
  await p.waitForTimeout(800)
  // Plantado en el origen mirando al frente, a la altura de los ojos.
  await p.evaluate(() => {
    const m = window.vektorEditor.motor
    m.camera.position.set(0, m.camera.position.y, 0)
    m.controls.lookAt?.(0)
    m.camera.rotation.x = 0
  })
  await p.waitForTimeout(500)
}
const leer = () => p.evaluate(() => {
  const m = window.vektorEditor.motor
  return {
    bloqueado: m.isLocked,
    arma: m.weaponKey, ammo: m.ammo, principal: m.slots.primary,
    apuntada: m._peanaApuntada,
    aviso: document.querySelector('.hud__peana')?.textContent ?? null,
    avisoVisible: Boolean(document.querySelector('.hud__peana')?.offsetParent),
    fichas: m.dibujoPeanas._fichas.filter((f) => f.sprite.visible).map((f) => f.arma).sort(),
  }
})

// ---------------------------------------------------------- [1] recoger
console.log('\n[1] Recoger: apuntando y con la E, y el aviso dice lo que va a pasar')
await probarCon(sala())
{
  const a = await leer()
  ok('premisa: el ratón capturado y el mapa en modo peanas, sin arma principal', a.bloqueado && a.principal == null && a.arma === 'pulse', JSON.stringify({ arma: a.arma, principal: a.principal, bloqueado: a.bloqueado }))
  ok('apuntando al Krakov, el aviso lo ofrece', a.apuntada === 0 && /Recoger Krakov/i.test(a.aviso ?? '') && a.avisoVisible, a.aviso)
  await p.keyboard.press('KeyE')
  await p.waitForTimeout(400)
  const b = await leer()
  ok('la E lo pone en la mano, lleno', b.arma === 'krakov' && b.principal === 'krakov' && b.ammo === WEAPONS.krakov.magazine, `${b.arma} ${b.ammo}/${WEAPONS.krakov.magazine}`)
  ok('y con el cargador lleno el aviso dice «lleno»', /lleno/i.test(b.aviso ?? ''), b.aviso)
  // Gastar y volver a cogerla: recarga.
  await p.mouse.down()
  await p.waitForTimeout((60_000 / WEAPONS.krakov.rpm) * 4 + 30)
  await p.mouse.up()
  await p.evaluate(() => { const m = window.vektorEditor.motor; m.controls.lookAt?.(0); m.camera.rotation.x = 0 })
  await p.waitForTimeout(400)
  const c = await leer()
  ok('con balas gastadas, el aviso ofrece recargar', c.ammo < WEAPONS.krakov.magazine && /Recargar Krakov/i.test(c.aviso ?? ''), `${c.ammo} · ${c.aviso}`)
  await p.keyboard.press('KeyE')
  await p.waitForTimeout(400)
  const d = await leer()
  ok('y la E la recarga, sin gastar la peana', d.ammo === WEAPONS.krakov.magazine && d.arma === 'krakov', `${d.ammo}`)
  const quedan = await p.evaluate(() => window.vektorEditor.motor.scenario.peanas.length)
  ok('la peana sigue ahí: no se agotan', quedan === 4, `${quedan} peanas`)
  // Mirar a otro lado apaga el aviso.
  await p.evaluate(() => { window.vektorEditor.motor.controls.lookAt?.(Math.PI / 2) })
  await p.waitForTimeout(400)
  const e = await leer()
  ok('mirando a otro lado no hay aviso', e.apuntada === -1 && !e.avisoVisible, String(e.aviso))
}

// ---------------------------------------------------------- [2] pisarla
console.log('\n[2] Pisarla no la coge: hace falta apuntar')
{
  await p.evaluate(() => {
    const m = window.vektorEditor.motor
    m.camera.position.set(0, m.camera.position.y, 2)
    m.controls.lookAt?.(0)
  })
  await p.waitForTimeout(900)
  const a = await leer()
  ok('encima de la Pump, sin apuntarla, sigue con el Krakov', a.principal === 'krakov', a.principal)
  await p.keyboard.press('KeyE')
  await p.waitForTimeout(400)
  const b = await leer()
  ok('y la E no la coge si no la apunta', b.principal === 'krakov', b.principal)
  // Mirándola a los pies, sí: estar encima no quita poder cogerla.
  await p.evaluate(() => { window.vektorEditor.motor.camera.rotation.x = -1.4 })
  await p.waitForTimeout(400)
  const c = await leer()
  ok('mirándola a los pies, el aviso la ofrece', /Recoger Pump/i.test(c.aviso ?? '') && c.avisoVisible, c.aviso)
  await p.keyboard.press('KeyE')
  await p.waitForTimeout(400)
  const d = await leer()
  ok('y la E la coge', d.principal === 'pump', d.principal)
}

// ---------------------------------------------------------- [3] fichas
console.log('\n[3] La ficha: con línea de visión, nunca a través de una pared')
{
  await p.evaluate(() => {
    const m = window.vektorEditor.motor
    m.camera.position.set(0, m.camera.position.y, 3)
    m.controls.lookAt?.(0)
    m.camera.rotation.x = 0
  })
  await p.waitForTimeout(1200)
  const a = await leer()
  ok('se anuncian el Krakov y el Rift, que se ven', a.fichas.includes('krakov') && a.fichas.includes('rift'), a.fichas.join(', '))
  ok('y el Titan detrás del muro, no', !a.fichas.includes('titan'), a.fichas.join(', '))
  ok(`ni la Pump, a 1 u: de más cerca de ${PEANAS.fichaMinU} u lo dice el aviso`, !a.fichas.includes('pump'), a.fichas.join(', '))
  // De lado, rodeando el muro, el Titan sí.
  await p.evaluate(() => {
    const m = window.vektorEditor.motor
    m.camera.position.set(-7, m.camera.position.y, -12)
    m.controls.lookAt?.(-Math.PI / 2)
    m.camera.rotation.x = 0
  })
  await p.waitForTimeout(1200)
  const b = await leer()
  ok('rodeando el muro, el Titan sí se anuncia', b.fichas.includes('titan'), b.fichas.join(', '))
}

// ---------------------------------------------------------- [4] coste
console.log('\n[4] Lo que cuesta: 0, 40 y 160 peanas')
const costes = {}
const fpsDe = {}
for (const n of [0, 40, 160]) {
  const extra = []
  const armas = ['krakov', 'rift', 'volt', 'scout', 'pump', 'titan', 'bow', 'reaper']
  for (let i = extra.length; i < Math.max(0, n - 4); i++) {
    extra.push({ x: -18 + (i % 18) * 2, z: -18 + Math.floor(i / 18) * 2.5, arma: armas[i % armas.length] })
  }
  const def = sala(extra)
  if (n === 0) def.peanas = []
  await probarCon(def)
  const r = await p.evaluate(() => {
    const m = window.vektorEditor.motor
    const N = 2000
    const t0 = performance.now()
    for (let k = 0; k < N; k++) {
      m.dibujoPeanas.update(m.camera, t0 + k * 16.7)
      m._actualizarAvisoDePeana()
    }
    const t1 = performance.now()
    return { us: ((t1 - t0) / N) * 1000, peanas: m.scenario.peanas.length }
  })
  costes[n] = r.us
  fpsDe[n] = await p.evaluate(async () => {
    let frames = 0
    const t0 = performance.now()
    await new Promise((res) => { const f = () => { frames += 1; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res() }; requestAnimationFrame(f) })
    return frames / ((performance.now() - t0) / 1000)
  })
  ok(`${r.peanas} peanas: por frame, muy por debajo de 0.2 ms`, r.peanas === n && r.us < 100, `${r.us.toFixed(2)} µs`)
}
console.log(`  (informe) fps con 0 / 40 / 160 peanas: ${fpsDe[0].toFixed(1)} / ${fpsDe[40].toFixed(1)} / ${fpsDe[160].toFixed(1)} (WebGL por software)`)

// ---------------------------------------------------------- [5] Alchemist
console.log('\n[5] La hoja «Reglas» de Alchemist')
{
  await p.evaluate(() => { const ed = window.vektorEditor; if (ed.motor) ed.dejarDeProbar() })
  await p.waitForTimeout(600)
  await p.evaluate(() => {
    const ed = window.vektorEditor
    ed.cargar({ clave: 'banco-reglas', label: 'Banco reglas', room: { width: 40, depth: 40, height: 10 }, spawn: { x: 0, z: 0 } }, 'banco-reglas')
  })
  await p.waitForTimeout(300)
  await p.click('[data-pestana="reglas"]')
  await p.waitForTimeout(400)
  const hoja = await p.locator('[data-hoja="reglas"]').isVisible()
  ok('el raíl abre la hoja', hoja)
  const antes = await p.evaluate(() => window.vektorEditor.mapa.reglas ?? null)
  ok('un mapa nuevo no declara reglas: es la armería con todo', antes === null, JSON.stringify(antes))
  await p.click('[data-hoja="reglas"] [data-modo="peanas"]')
  await p.waitForTimeout(300)
  const modo = await p.evaluate(() => window.vektorEditor.mapa.reglas?.modo)
  ok('pinchar «Peanas» lo escribe en el mapa', modo === 'peanas', modo)
  await p.click('#peana-anadir')
  await p.waitForTimeout(300)
  await p.click('#peana-duplicar')
  await p.waitForTimeout(300)
  const lista = await p.evaluate(() => window.vektorEditor.mapa.peanas ?? [])
  ok('«+ Peana» y «Duplicar» dejan dos, con la misma arma', lista.length === 2 && lista[0].arma === lista[1].arma, JSON.stringify(lista))
  const cuenta = await p.textContent('#cuenta-peanas')
  ok('y la cuenta lo dice', /2/.test(cuenta ?? ''), cuenta)
  const sano = await p.evaluate(() => window.vektorEditor.sanear().problemas)
  ok('y el mapa sale del saneado sin un problema', sano.length === 0, sano.join(' · '))
}

ok('ni un error de página', errores.length === 0, errores.slice(0, 3).join(' | '))
await nav.close()
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
