/**
 * arm95 — ningún texto de la armería se sale de su ficha.
 *
 * Mide **contra la caja de su propia ficha**, que es el denominador (vuelta 46):
 * «se sale» no es una impresión, es cuántos píxeles hay entre el borde del texto
 * y el borde de la tarjeta que lo contiene. Recorre las cinco categorías, porque
 * lo que desbordaba eran los valores largos y no todas las armas los tienen.
 */
import { chromium } from 'playwright-core'

const CATEGORIAS = ['Primarias', 'Pistolas', 'Especiales', 'Arrojadizas', 'Cuerpo a cuerpo']
let fallos = 0
const afirmar = (bien, que, detalle = '') => {
  console.log(`  ${bien ? 'OK  ' : 'FALLO'} ${que}${detalle ? ` — ${detalle}` : ''}`)
  if (!bien) fallos++
}

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const errores = []
try {
  console.log('\n== arm95: los textos, dentro de su ficha ==\n')
  const p = await nav.newPage({ viewport: { width: 1600, height: 900 } })
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto('http://127.0.0.1:5192/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1300)
  await p.click('text=Jugar ahora'); await p.waitForTimeout(250)
  await p.click('text=Armería'); await p.waitForTimeout(600)

  let totalFichas = 0
  for (const cat of CATEGORIAS) {
    // El raíl es `.armoury__ranuras` con `role="tablist"`. **Y se comprueba que
    // el clic ha cambiado de categoría**: un selector que no acierta y un
    // `catch` vacío miden cinco veces la misma pestaña, que es exactamente cómo
    // un banco sale verde sin haber mirado nada (vuelta 46).
    const cambiado = await p.evaluate((nombre) => {
      const b = [...document.querySelectorAll('.armoury__ranuras button')]
        .find((x) => x.textContent.toLowerCase().includes(nombre.toLowerCase()))
      if (!b) return false
      b.click()
      return true
    }, cat)
    afirmar(cambiado, `el raíl tiene la categoría «${cat}»`)
    if (!cambiado) continue
    await p.waitForTimeout(250)
    const medida = await p.evaluate(() => {
      const fuera = []
      const fichas = [...document.querySelectorAll('.armoury__card')]
      for (const ficha of fichas) {
        const r = ficha.getBoundingClientRect()
        for (const t of ficha.querySelectorAll('*')) {
          if (t.children.length) continue
          const tr = t.getBoundingClientRect()
          const px = Math.round(Math.max(tr.right - r.right, r.left - tr.left))
          if (px > 1) fuera.push(`${t.textContent.trim().slice(0, 22)} (+${px})`)
        }
      }
      return { fichas: fichas.length, fuera }
    })
    totalFichas += medida.fichas
    afirmar(medida.fuera.length === 0,
      `${cat}: ${medida.fichas} fichas, ningún texto fuera`,
      medida.fuera.slice(0, 3).join(' | '))
  }
  // El denominador: quince armas repartidas en cinco categorías. Si esto sale
  // corto es que el raíl no cambió y lo de arriba no midió lo que dice.
  afirmar(totalFichas >= 15, 'y se han mirado todas las armas del arsenal', `${totalFichas} fichas`)
  afirmar(errores.length === 0, 'ni un error de página', errores.slice(0, 2).join(' | '))
} finally {
  await nav.close()
}

console.log(`\n${fallos === 0 ? 'VERDE' : `ROJO (${fallos})`}\n`)
process.exit(fallos === 0 ? 0 : 1)
