// ¿Llega a la página el keydown del ESC con el que el navegador suelta el
// ratón? No se supone: se pulsa de verdad y se mira (regla de la vuelta 41.5).
import { chromium } from 'playwright-core'
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const p = await nav.newPage({ viewport: { width: 1280, height: 720 } })
await p.goto('http://localhost:5192/', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)

await p.evaluate(() => {
  window.__esc = []
  window.__lock = []
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.__esc.push({ t: Math.round(performance.now()), bloqueado: !!document.pointerLockElement })
  }, true)
  document.addEventListener('pointerlockchange', () => {
    window.__lock.push({ t: Math.round(performance.now()), bloqueado: !!document.pointerLockElement })
  })
})

// Empezar: clic en una esquina para capturar el ratón.
await p.mouse.click(40, 690)
await p.waitForTimeout(1200)
console.log('¿capturado tras el clic?', await p.evaluate(() => !!document.pointerLockElement))

// El ESC de verdad.
await p.keyboard.press('Escape')
await p.waitForTimeout(1200)
const r = await p.evaluate(() => ({
  esc: window.__esc, lock: window.__lock,
  bloqueado: !!document.pointerLockElement,
  fase: document.querySelector('.panel__title')?.textContent ?? '(sin panel)',
}))
console.log('keydown de ESC que llegaron a la página:', JSON.stringify(r.esc))
console.log('cambios de pointerlock:', JSON.stringify(r.lock))
console.log('¿sigue capturado?', r.bloqueado, '| panel:', r.fase)

// Y un segundo ESC, ya en pausa: ¿llega?
await p.keyboard.press('Escape')
await p.waitForTimeout(800)
const r2 = await p.evaluate(() => ({ esc: window.__esc.length, bloqueado: !!document.pointerLockElement }))
console.log('tras el segundo ESC: keydowns totales', r2.esc, '| capturado:', r2.bloqueado)
await nav.close()
