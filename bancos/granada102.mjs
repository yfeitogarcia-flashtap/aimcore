// granada102 — captura de las tres granadas de neón (Core, Blind, KO) delante
// de la cámara, en el entrenamiento, y cero errores de página.
import { chromium } from 'playwright-core'
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const p = await nav.newPage({ viewport: { width: 1000, height: 600 } })
const err = []; p.on('pageerror', (e) => err.push(String(e)))
await p.goto('http://localhost:5192/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
await p.mouse.click(40, 580); await p.waitForTimeout(1000)
const lanzar = (mecha) => p.evaluate((mecha) => {
  const m = window.aimcore
  const cam = m.camera
  const f = { x: -Math.sin(cam.rotation.y), z: -Math.cos(cam.rotation.y) }
  const r = { x: Math.cos(cam.rotation.y), z: -Math.sin(cam.rotation.y) }
  ;['core', 'blind', 'ko'].forEach((tipo, k) => {
    const lado = (k - 1) * 0.55
    m.proyectiles.lanzar({ tipo, dueno: 'yo', x: cam.position.x + f.x * 1.6 + r.x * lado, y: cam.position.y - 0.1, z: cam.position.z + f.z * 1.6 + r.z * lado,
      vx: 0, vy: 0, vz: 0, g: 0, fuerza: 0, intensidad: 1, rebote: 0, roce: 0, reposoU: 0, mechaS: mecha })
  })
}, mecha)
console.log('asa:', await p.evaluate(() => Object.keys(window).filter((k) => /vektor/i.test(k))))
await lanzar(3.6)
await p.waitForTimeout(250)
await p.screenshot({ path: 'scratchpad/granada102-a.png' })
await p.waitForTimeout(3000)
await p.screenshot({ path: 'scratchpad/granada102-b.png' })
console.log('errores:', err.length, err.slice(0, 2))
await nav.close()
