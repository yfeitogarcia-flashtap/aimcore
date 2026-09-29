/**
 * dibujo100 — **lo que le cuesta al cliente dibujar a 49** (vuelta 100).
 *
 * La otra mitad del caso extremo: el servidor y el cable se miden en `salas100`;
 * esto mide la pantalla. Se monta el motor del entrenamiento en la sala vacía,
 * se le ponen delante 0, 10, 25 y 49 cuerpos de jugador —el mismo `Avatar` que
 * dibuja a un rival— y se mide **cuánto tarda `render()`** y cuántas llamadas de
 * dibujo hace, con los cuerpos repartidos por la vista.
 *
 * Con su límite escrito: aquí se dibuja con **SwiftShader**, o sea la CPU
 * haciendo de tarjeta gráfica. Los milisegundos absolutos no son los de un PC
 * con gráfica; lo que sí vale es **la pendiente** —cuánto añade cada cuerpo— y
 * las llamadas de dibujo, que son las mismas en cualquier máquina.
 */
import { chromium } from 'playwright-core'

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const p = await nav.newPage({ viewport: { width: 1280, height: 720 } })
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))
await p.goto('http://127.0.0.1:5192/', { waitUntil: 'load' })
await p.waitForFunction(() => Boolean(window.aimcore), null, { timeout: 20000 })
await p.waitForTimeout(1500)

const filas = await p.evaluate(async () => {
  const motor = window.aimcore
  const { Avatar } = await import('/src/game/avatar.js')
  const { TARGET, TEAMS } = await import('/src/config.js')
  const renderer = motor.renderer
  const cuerpos = []
  const poner = (n) => {
    while (cuerpos.length < n) {
      const a = new Avatar(TARGET.radius, TEAMS.magenta.color)
      motor.scene.add(a.group)
      cuerpos.push(a)
    }
    // Repartidos por un abanico delante de la cámara, de 5 a 60 u.
    cuerpos.forEach((a, i) => {
      a.group.visible = i < n
      const d = 5 + (i % 7) * 8
      const ang = ((Math.floor(i / 7) - 3) / 7) * 1.2
      a.group.position.set(Math.sin(ang) * d, 0, -Math.cos(ang) * d)
    })
  }
  const medir = async (n) => {
    poner(n)
    await new Promise((r) => setTimeout(r, 300))
    const cam = motor.camera
    cam.position.set(0, 1.7, 0)
    cam.rotation.set(0, 0, 0)
    const muestras = []
    let llamadas = 0
    for (let k = 0; k < 60; k++) {
      const t0 = performance.now()
      renderer.render(motor.scene, cam)
      renderer.getContext().finish()
      muestras.push(performance.now() - t0)
      llamadas = renderer.info.render.calls
      await new Promise((r) => requestAnimationFrame(r))
    }
    muestras.sort((a, b) => a - b)
    return { n, mediana: muestras[30], p90: muestras[54], llamadas }
  }
  // Se para el bucle del motor para medir sólo el render de la escena.
  motor.stop?.()
  const res = []
  for (const n of [0, 10, 25, 49]) res.push(await medir(n))
  return res
})

console.log('== dibujo100 ==\n')
console.log('  cuerpos   render (mediana)   p90        llamadas de dibujo')
for (const f of filas) {
  console.log(`  ${String(f.n).padStart(6)}   ${f.mediana.toFixed(2).padStart(8)} ms      ${f.p90.toFixed(2).padStart(6)} ms   ${String(f.llamadas).padStart(6)}`)
}
const base = filas[0]
const tope = filas[filas.length - 1]
console.log(`\n  cada cuerpo añade ~${((tope.mediana - base.mediana) / 49).toFixed(3)} ms y ${((tope.llamadas - base.llamadas) / 49).toFixed(1)} llamadas (SwiftShader)`)
console.log(`  errores de página: ${errores.length}`)
await nav.close()
