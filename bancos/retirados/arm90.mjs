/**
 * La armería con el arsenal entero (catorce fichas) y las tres nuevas dentro.
 * Es el banco de la vuelta 89 otra vez: lo que se mide es que **no se solapen**
 * —tres armas nuevas son tres juegos de filas específicas nuevas— y que el
 * Reaper tenga botón de equipar, que es lo que la 90 abre.
 */
import { chromium } from 'playwright-core'

const BASE = 'http://localhost:5192'
const EJECUTABLE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const navegador = await chromium.launch({ executablePath: EJECUTABLE, args: ARGS })
const page = await (await navegador.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
const errores = []
page.on('pageerror', (e) => errores.push(e.message))
await page.goto(BASE, { waitUntil: 'networkidle' })
await esperar(1500)
/**
 * **La pantalla de inicio va en tres pasos desde la vuelta 92**, así que
 * «Armería» ya no está en el primero: hay que pasar por «Jugar ahora». Este
 * banco llevaba rojo desde entonces por eso y no por el arsenal — rojo con el
 * código viejo y con el nuevo es otra cosa (§4 de `CLAUDE.md`), y esa otra cosa
 * era la navegación.
 */
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => /jugar ahora/i.test(x.textContent))?.click()
})
await esperar(400)
// El botón de armería, en el segundo paso.
const abrio = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /armer/i.test(x.textContent))
  if (!b) return false
  b.click()
  return true
})
if (!abrio) { console.log('no encontré el botón de la armería'); process.exit(1) }
await esperar(1200)

const medida = await page.evaluate(() => {
  const cartas = [...document.querySelectorAll('.armoury__card')]
  const filas = []
  for (const c of cartas) {
    const nombre = c.querySelector('.armoury__name')?.textContent
    const stats = [...c.querySelectorAll('.armoury__stats .stat, .armoury__stats > *')]
    const cajas = stats.map((s) => {
      const r = s.getBoundingClientRect()
      return { t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height), txt: (s.textContent || '').slice(0, 26) }
    }).filter((x) => x.h > 0)
    let solapes = 0
    for (let i = 0; i < cajas.length; i++) {
      for (let j = i + 1; j < cajas.length; j++) {
        if (cajas[i].t < cajas[j].b - 1 && cajas[j].t < cajas[i].b - 1) solapes += 1
      }
    }
    const escudo = [...c.querySelectorAll('*')].find((e) => /ESCUDO/i.test(e.textContent) && e.children.length === 0)
    const boton = c.querySelector('.armoury__action button')
    filas.push({
      nombre,
      bloques: cajas.length,
      solapes,
      escudoTop: escudo ? Math.round(escudo.getBoundingClientRect().top) : null,
      accion: boton ? boton.textContent.trim() : c.querySelector('.armoury__fixed')?.textContent.trim(),
    })
  }
  return filas
})

console.log('ficha        bloques  solapes  top de ESCUDO·PRECISIÓN   acción')
for (const f of medida) {
  console.log(`${(f.nombre ?? '?').padEnd(12)} ${String(f.bloques).padStart(7)}  ${String(f.solapes).padStart(7)}  ${String(f.escudoTop).padStart(22)}   ${f.accion ?? ''}`)
}
const tops = new Set(medida.map((f) => f.escudoTop))
console.log(`\nfichas: ${medida.length} · solapes totales: ${medida.reduce((a, f) => a + f.solapes, 0)}`)
console.log(`alturas distintas de la última fila: ${tops.size} (1 = todas alineadas)`)
console.log('errores de página:', errores.length, errores.slice(0, 3))
await navegador.close()
