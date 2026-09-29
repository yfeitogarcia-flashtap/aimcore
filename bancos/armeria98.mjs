/**
 * armeria98 — **¿el código que enseña cada ficha es el que funciona, en los tres
 * sitios?** El bug 3 de la vuelta 98, arma a arma.
 *
 *  [0] La tabla: una combinación por artículo, la categoría es la ranura y las
 *      fichas van en el orden de su código.
 *  [1] La armería del menú: para cada ficha, se lee su combinación **de la
 *      pantalla**, se teclea, y se comprueba que el primer dígito abre su
 *      sección y el segundo equipa esa arma.
 *  [2] Lo mismo con la armería abierta con la B **en mitad de una partida**.
 *  [3] La tienda del duelo: para cada artículo, se teclea el código que lleva
 *      escrito y se lee qué artículo contesta.
 */
import { chromium } from 'playwright-core'
import { CATEGORIA_DE_RANURA, ECONOMY, WEAPONS, catalogoDeTienda } from '../src/config.js'

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}

console.log('[0] La tabla')
const cat = catalogoDeTienda()
const combos = cat.map((i) => `${i.categoria}${i.codigo}`)
afirmar(new Set(combos).size === combos.length, `${cat.length} artículos, ${new Set(combos).size} combinaciones distintas`)
for (const i of cat) {
  const w = WEAPONS[i.clave]
  if (w) afirmar(CATEGORIA_DE_RANURA[w.slot] === i.categoria, `${i.nombre}: ${i.categoria} ${i.codigo} · ${ECONOMY.categorias[i.categoria]} = su ranura (${w.slot})`)
  else afirmar(i.tipo === 'equipo' && ECONOMY.categorias[i.categoria] === 'Equipo', `${i.nombre}: ${i.categoria} ${i.codigo} · Equipo`)
}
for (const [slot, c] of Object.entries(CATEGORIA_DE_RANURA)) {
  const cods = cat.filter((i) => i.categoria === c).map((i) => i.codigo)
  afirmar(cods.every((v, k) => v === k + 1), `${ECONOMY.categorias[c]}: códigos seguidos desde 1 (${cods.join(', ') || 'nada que comprar'})`)
}

const navegador = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })

/** Recorre todas las fichas de la armería abierta en `p`. */
async function recorrerArmeria(p, donde) {
  const pestanas = await p.$$eval('.armoury__ranura', (bs) => bs.map((b) => b.querySelector('.armoury__ranura-cat')?.textContent))
  let probadas = 0
  for (let t = 0; t < pestanas.length; t++) {
    await p.click(`.armoury__ranura >> nth=${t}`)
    await p.waitForTimeout(150)
    const fichas = await p.$$eval('.armoury__card', (cs) => cs.map((c) => ({
      nombre: c.querySelector('.armoury__name')?.textContent?.replace('•', '').trim(),
      combo: c.querySelector('.armoury__combo')?.textContent?.trim() ?? null,
    })))
    // El orden de las fichas es el de su código.
    const codigos = fichas.filter((f) => f.combo).map((f) => Number(f.combo.split(' ')[1]))
    afirmar(codigos.every((v, k) => v === k + 1), `${donde} · pestaña ${pestanas[t]}: fichas en orden de código (${fichas.map((f) => `${f.nombre} ${f.combo ?? '—'}`).join(', ')})`)
    for (const f of fichas) {
      if (!f.combo) continue
      const [c, k] = f.combo.split(' ')
      // Se abre otra pestaña antes, para ver que el primer dígito la cambia.
      await p.click(`.armoury__ranura >> nth=${(t + 1) % pestanas.length}`)
      await p.waitForTimeout(100)
      await p.keyboard.press(`Digit${c}`)
      await p.waitForTimeout(120)
      const trasPrimero = await p.$eval('.armoury__ranura--activa .armoury__ranura-cat', (e) => e.textContent)
      await p.keyboard.press(`Digit${k}`)
      await p.waitForTimeout(200)
      // **De lo guardado, no importando el store** (vuelta 106): un `import()`
      // desde el banco puede dar otra instancia del módulo (vuelta 91) y leer
      // los ajustes de fábrica con la página equipando bien por delante.
      const r = await p.evaluate(async () => {
        const s = JSON.parse(localStorage.getItem('aimcore.settings.v1') ?? '{}')
        return {
          ajustes: { weapon: s.weapon, secondary: s.secondary, special: s.special, throwable: s.throwable },
          activa: document.querySelector('.armoury__ranura--activa .armoury__ranura-cat')?.textContent,
          aviso: document.querySelector('.armoury__tecleado')?.textContent ?? '',
          equipada: [...document.querySelectorAll('.armoury__card')].find((x) => x.classList.contains('armoury__card--equipped'))?.querySelector('.armoury__name')?.textContent?.replace('•', '').trim() ?? null,
        }
      })
      const clave = Object.keys(WEAPONS).find((w) => WEAPONS[w].label === f.nombre || w === f.nombre?.toLowerCase())
      const valores = Object.values(r.ajustes)
      const bien = trasPrimero === c && r.activa === c && valores.includes(clave) && r.aviso.includes(f.nombre)
      afirmar(bien, `${donde} · ${f.nombre} ${f.combo}: el 1.er dígito abre ${trasPrimero}, queda equipada (${JSON.stringify(r.ajustes)}), dice «${r.aviso}»`)
      probadas++
    }
  }
  return probadas
}

console.log('\n[1] La armería del menú')
{
  const ctx = await navegador.newContext({ viewport: { width: 1600, height: 1000 } })
  const p = await ctx.newPage()
  const errores = []
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto('http://127.0.0.1:5192/', { waitUntil: 'load' })
  await p.waitForTimeout(1200)
  await p.click('text=Jugar ahora')
  await p.waitForTimeout(300)
  await p.click('button:has-text("Armería")')
  await p.waitForTimeout(500)
  const n = await recorrerArmeria(p, 'menú')
  afirmar(n === cat.filter((i) => WEAPONS[i.clave]).length, `denominador: ${n} armas probadas de ${cat.filter((i) => WEAPONS[i.clave]).length} del catálogo`)
  await p.keyboard.press('Digit6')
  await p.keyboard.press('Digit1')
  await p.waitForTimeout(150)
  const chaleco = await p.$eval('.armoury__tecleado', (e) => e.textContent).catch(() => '')
  afirmar(/Chaleco se compra en el duelo/.test(chaleco), `6 1 dice «${chaleco}»`)
  afirmar(errores.length === 0, `sin errores de página (${errores.length}) ${errores.slice(0, 1)}`)
  await ctx.close()
}

console.log('\n[2] La armería con la B, en mitad de una partida')
{
  const ctx = await navegador.newContext({ viewport: { width: 1600, height: 1000 } })
  const p = await ctx.newPage()
  const errores = []
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto('http://127.0.0.1:5192/', { waitUntil: 'load' })
  await p.waitForTimeout(1200)
  await p.evaluate(() => window.aimcore.requestStart?.('timed'))
  await p.waitForTimeout(800)
  const fase = await p.evaluate(() => window.aimcore.phase)
  await p.keyboard.press('KeyB')
  await p.waitForTimeout(600)
  const abierta = await p.$('.panel--armoury')
  afirmar(Boolean(abierta), `premisa: con la partida en «${fase}», la B abre la armería`)
  if (abierta) {
    const n = await recorrerArmeria(p, 'partida')
    afirmar(n > 0, `${n} armas probadas`)
  }
  afirmar(errores.length === 0, `sin errores de página (${errores.length}) ${errores.slice(0, 1)}`)
  await ctx.close()
}

console.log('\n[3] La tienda del duelo')
{
  const ctx = await navegador.newContext({ viewport: { width: 1600, height: 1000 } })
  const p = await ctx.newPage()
  const errores = []
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto('http://127.0.0.1:5192/duelo/', { waitUntil: 'load' })
  await p.waitForTimeout(1500)
  await p.evaluate(() => { document.getElementById('tienda').hidden = false })
  const arts = await p.$$eval('#tienda .art', (bs) => bs.map((b) => ({ nombre: b.firstChild?.firstChild?.textContent?.trim(), codigo: b.querySelector('.codigo')?.textContent })))
  const titulos = await p.$$eval('#tienda .cat h2', (hs) => hs.map((h) => h.textContent))
  afirmar(titulos.join(' | ') === Object.entries(ECONOMY.categorias).filter(([c]) => cat.some((i) => String(i.categoria) === c)).map(([c, n]) => `${c} · ${n}`).join(' | '), `títulos: ${titulos.join(' | ')}`)
  for (const a of arts) {
    const [c, k] = a.codigo.split(' ')
    await p.keyboard.press(`Digit${c}`)
    await p.keyboard.press(`Digit${k}`)
    await p.waitForTimeout(80)
    const dice = await p.$eval('#tiendaTecleado', (e) => e.textContent)
    afirmar(dice === `${c} ${k} · ${a.nombre}`, `duelo · ${a.nombre} ${a.codigo}: «${dice}»`)
  }
  afirmar(arts.length === cat.length, `denominador: ${arts.length} artículos de ${cat.length}`)
  afirmar(errores.length === 0, `sin errores de página (${errores.length}) ${errores.slice(0, 1)}`)
  await ctx.close()
}

await navegador.close()
console.log(`\n${fallos === 0 ? 'TODO BIEN' : `${fallos} FALLOS`}`)
process.exit(fallos ? 1 : 0)
