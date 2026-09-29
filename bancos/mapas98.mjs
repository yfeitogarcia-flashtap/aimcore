/**
 * mapas98 — **¿ofrece cada modo sólo lo que se publica para él?**
 *
 * El bug 2 de la vuelta 98: entrando a entrenar salía Aim Camp a medias. La
 * causa era `src/maps/empty.js` —media sala de duelo guardada con la clave de la
 * Sala vacía—, que pisaba al integrado **en todo el juego**, y la Sala vacía es
 * el escenario de fábrica del entrenamiento.
 *
 *  [0] Sin navegador: las dos listas, con su premisa delante (hay un fichero
 *      `empty` de duelo) y el mapa que monta cada modo.
 *  [1] El saneado: `modos`, lo que tira y que sigue siendo un punto fijo.
 *  [2] Contra la página del juego: el selector y lo que monta el motor.
 *  [3] Contra Alchemist: las casillas y «Duplicar este mapa».
 */
import { chromium } from 'playwright-core'
import { CLAVES_INTEGRADAS, DUEL_SCENARIOS, SCENARIOS, TRAINER_SCENARIOS, definicionDeDuelo, definicionDeEntrenamiento, modosDeMapa } from '../src/config.js'
import { MAPAS_DE_FICHERO } from '../src/maps/index.js'
import { sanearMapa } from '../src/maps/formato.js'

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}

console.log('[0] Las listas')
const fichero = MAPAS_DE_FICHERO.empty
afirmar(Boolean(fichero) && modosDeMapa(fichero).join() === 'duelo',
  `premisa: hay un empty de fichero y es de duelo («${fichero?.label}», ${fichero?.boxes?.length} piezas)`)
afirmar(SCENARIOS.empty === fichero, 'y en SCENARIOS gana el fichero, que es lo que existe (vuelta 94)')
afirmar(TRAINER_SCENARIOS.empty && TRAINER_SCENARIOS.empty !== fichero && (TRAINER_SCENARIOS.empty.boxes?.length ?? 0) === 0,
  'en el entrenamiento, empty es la Sala vacía de siempre (0 piezas)')
afirmar(DUEL_SCENARIOS.empty === fichero, 'y en el duelo, el de fichero, que es donde se publicó')
afirmar(definicionDeEntrenamiento('empty') === TRAINER_SCENARIOS.empty, 'el entrenamiento monta la de su lista')
afirmar(!TRAINER_SCENARIOS['Aim-camp-1'] && Boolean(DUEL_SCENARIOS['Aim-camp-1']), 'Aim Camp sólo en el duelo')
for (const [k, d] of Object.entries(TRAINER_SCENARIOS)) {
  afirmar(modosDeMapa(d).includes('entrenamiento'), `entrenamiento: ${k} se publica ahí`)
}
for (const [k, d] of Object.entries(DUEL_SCENARIOS)) {
  afirmar(modosDeMapa(d).includes('duelo') && d.soloDuelo, `duelo: ${k} se publica ahí y es de duelo`)
}
afirmar(!Object.values(SCENARIOS).some((d) => modosDeMapa(d).length === 0 && (TRAINER_SCENARIOS[d.clave] === d || DUEL_SCENARIOS[d.clave] === d)),
  'ningún borrador sale en ninguna lista')
afirmar(CLAVES_INTEGRADAS.every((k) => SCENARIOS[k].clave === k || MAPAS_DE_FICHERO[k]), 'cada integrado dice su clave')
afirmar(definicionDeDuelo('no-existe').clave === 'duelo', 'una clave de duelo desconocida cae a El Espejo')
afirmar(definicionDeEntrenamiento('Aim-camp-1') === TRAINER_SCENARIOS.empty, 'y una de otro modo, en el entrenamiento, a la Sala vacía')

console.log('\n[1] El saneado')
const ambos = sanearMapa({ clave: 'x', label: 'X', modos: ['duelo', 'entrenamiento', 'raro'], publicado: false, soloDuelo: true, spawn: { x: 0, z: 0 } })
afirmar(ambos.mapa.modos.join() === 'entrenamiento,duelo', `modos en su orden: ${ambos.mapa.modos}`)
afirmar(ambos.mapa.publicado === undefined, 'publicado se tira cuando hay modos')
afirmar(ambos.problemas.some((p) => /raro/.test(p)) && ambos.problemas.some((p) => /publicado/.test(p)), `y se dice: ${ambos.problemas.join(' · ')}`)
const sinSalidas = sanearMapa({ clave: 'y', label: 'Y', modos: ['duelo'], spawn: { x: 0, z: 0 } })
afirmar(sinSalidas.mapa.modos.length === 0 && sinSalidas.problemas.some((p) => /duelo necesita/.test(p)),
  'publicar en el duelo un mapa que no es de duelo no cuela, y se dice')
const dos = sanearMapa(ambos.mapa)
afirmar(JSON.stringify(dos.mapa) === JSON.stringify(ambos.mapa), 'y sanear dos veces da lo mismo, byte a byte')
for (const [k, m] of Object.entries(MAPAS_DE_FICHERO)) {
  const a = sanearMapa(m).mapa
  afirmar(a.modos === undefined, `${k}: abrirlo no le escribe modos`)
}

const navegador = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })

console.log('\n[2] La página del juego')
{
  const ctx = await navegador.newContext({ viewport: { width: 1600, height: 900 } })
  const p = await ctx.newPage()
  const errores = []
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto('http://127.0.0.1:5192/', { waitUntil: 'load' })
  await p.waitForTimeout(1500)
  await p.click('text=Jugar ahora')
  await p.waitForTimeout(300)
  await p.click('text=Entrenamiento')
  await p.waitForTimeout(600)
  const nombres = await p.evaluate(() => [...document.querySelectorAll('.scenarios__name')].map((n) => n.textContent))
  afirmar(nombres.length === Object.keys(TRAINER_SCENARIOS).length, `el selector enseña: ${nombres.join(' · ')}`)
  afirmar(!nombres.some((n) => /Aim Camp|Zona de entrenamiento 1/.test(n)), 'y ninguno de duelo')
  afirmar(nombres.includes('Sala vacía') || nombres.some((n) => /vac/i.test(n)), 'y la Sala vacía vuelve a estar')
  const montado = await p.evaluate(() => {
    const m = window.aimcore
    return m ? { clave: m.scenario.key, piezas: m.scenario.definition.boxes?.length ?? 0 } : null
  })
  if (montado) afirmar(montado.clave === 'empty' && montado.piezas === 0, `el motor monta ${montado.clave} con ${montado.piezas} piezas`)
  else console.log('       (el motor no tiene asa en esta página: se mide por el selector)')
  afirmar(errores.length === 0, `sin errores de página (${errores.length})`)
  await ctx.close()
}

console.log('\n[3] Alchemist')
{
  const ctx = await navegador.newContext({ viewport: { width: 1600, height: 900 } })
  const p = await ctx.newPage()
  const errores = []
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto('http://127.0.0.1:5192/editor/#Aim-camp-1', { waitUntil: 'load' })
  await p.waitForTimeout(2500)
  const casillas = () => p.evaluate(() => ({
    e: document.getElementById('modo-entrenamiento').checked,
    d: document.getElementById('modo-duelo').checked,
    nota: document.getElementById('publicado-nota').textContent,
    barra: document.getElementById('barra-mapa').textContent,
  }))
  const aim = await casillas()
  afirmar(!aim.e && aim.d, `Aim Camp: entrenamiento ${aim.e}, duelo ${aim.d} — «${aim.nota}»`)
  // Duplicar.
  await p.evaluate(() => document.querySelector('[data-pestana="archivo"]')?.click())
  await p.waitForTimeout(200)
  await p.click('#duplicar-mapa')
  await p.waitForTimeout(400)
  const copia = await p.evaluate(() => {
    const ed = window.vektorEditor
    const m = ed?.mapa ?? null
    return { clave: document.getElementById('clave').value, label: document.getElementById('label').value, nota: document.getElementById('duplicar-nota').textContent, piezas: m?.boxes?.length ?? null }
  })
  afirmar(copia.clave === 'Aim-camp-1-copia', `la copia se llama ${copia.clave} («${copia.label}»)`)
  const trasCopia = await casillas()
  afirmar(!trasCopia.e && !trasCopia.d && /borrador/.test(trasCopia.barra), `y nace en borrador — barra «${trasCopia.barra}»`)
  if (copia.piezas !== null) afirmar(copia.piezas === 63, `con las 63 piezas del original (${copia.piezas})`)
  // Publicarla en el entrenamiento.
  await p.evaluate(() => document.querySelector('[data-pestana="mapa"]')?.click())
  await p.waitForTimeout(200)
  await p.check('#modo-entrenamiento')
  await p.waitForTimeout(200)
  const pub = await casillas()
  afirmar(pub.e && !pub.d && /entrenamiento/.test(pub.nota), `marcar Entrenamiento: «${pub.nota}»`)
  await p.check('#modo-duelo')
  await p.waitForTimeout(200)
  const dosModos = await casillas()
  afirmar(dosModos.e && dosModos.d && /entrenamiento.*duelo/.test(dosModos.nota), `y los dos: «${dosModos.nota}»`)
  afirmar(errores.length === 0, `sin errores de página (${errores.length}) ${errores.slice(0, 2).join(' | ')}`)
  await ctx.close()
}

await navegador.close()
console.log(`\n${fallos === 0 ? 'TODO BIEN' : `${fallos} FALLOS`}`)
process.exit(fallos ? 1 : 0)
