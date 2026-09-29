/**
 * capas96 — el panel de capas, fase 1 (vuelta 96, punto 5).
 *
 * Lo que se afirma, y con su denominador:
 *  [0] La lista **sale del mapa**: tantas filas como elementos, y las cajas
 *      también —que no salían en ninguna hoja hasta esta vuelta—.
 *  [1] Pinchar una fila elige ese elemento en la vista.
 *  [2] El ojo lo quita **del dibujo y del picado**, y no del mapa.
 *  [3] Y lo que se mide **no se entera**: el presupuesto y la línea de visión
 *      entre salidas siguen contando el mapa entero. Sin esto, ocultar una pieza
 *      bajaría el presupuesto, que es un instrumento mintiendo por un ajuste de
 *      vista.
 *  [4] «Ver todo» lo devuelve, y el aviso aparece y desaparece.
 */
import { chromium } from 'playwright-core'

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}

const navegador = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const p = await navegador.newPage({ viewport: { width: 1600, height: 900 } })
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error') errores.push(`consola: ${m.text()}`) })

await p.goto('http://127.0.0.1:5192/editor/', { waitUntil: 'load' })
await p.waitForFunction(() => Boolean(window.vektorEditor), null, { timeout: 20000 })
await p.waitForTimeout(1500)

// Un mapa con de todo, para que la lista tenga de qué hablar.
await p.evaluate(() => {
  window.vektorEditor.cargar({
    clave: 'banco-capas96', label: 'Banco capas',
    room: { width: 40, depth: 40, height: 12 },
    spawn: { x: 0, z: 15 },
    boxes: [
      { x: -6, z: -1, w: 12, d: 1, kind: 'alta' },
      { x: 2, z: 4, w: 2, d: 2, kind: 'media' },
      { x: -10, z: 6, w: 3, d: 0.4, kind: 'alta', barrera: 'invisible' },
    ],
    ramps: [{ x: 8, z: -8, w: 3, d: 6, fromZ: -8, toZ: -2, top: 'plataforma' }],
    escaleras: [{ x: -14, z: -8, ancho: 2, huella: 0.5, alto: 2.6, escalones: 5, rumbo: 0 }],
    prismas: [{ x: 12, z: 10, w: 3, d: 3, lados: 6, kind: 'alta' }],
    tubos: [], estampados: [], routes: [],
  })
})
await p.waitForTimeout(800)
await p.evaluate(() => window.vektorEditor.abrirPanel(true, 'capas'))
await p.waitForTimeout(400)

const filas = () => p.evaluate(() =>
  [...document.querySelectorAll('#capas-lista button[data-capa]')]
    .map((b) => ({ clave: b.dataset.capa, i: Number(b.dataset.i), texto: b.textContent.trim() })))

const todas = await filas()
console.log(`\n[0] La lista sale del mapa: ${todas.length} filas`)
for (const f of todas) console.log(`    ${f.clave}[${f.i}] — ${f.texto}`)
const esperadas = await p.evaluate(() => {
  const m = window.vektorEditor.mapa
  return (m.boxes?.length ?? 0) + (m.ramps?.length ?? 0) + (m.escaleras?.length ?? 0)
    + (m.prismas?.length ?? 0) + (m.tubos?.length ?? 0) + (m.estampados?.length ?? 0)
})
// Y la premisa de que la lista no inventa nada: este mapa **no es de duelo**, así
// que no puede aparecer ni una salida. `salidasDe()` se las inventaría, y leerlas
// con él le metería dos al mapa (vuelta 83).
afirmar(!todas.some((f) => f.clave === 'salidas'),
  'un mapa que no es de duelo no lista salidas — ni se las inventa')
const sinTocar = await p.evaluate(() => Boolean(window.vektorEditor.mapa.duelo?.salidas))
afirmar(!sinTocar, 'y pintar la lista no le ha escrito `duelo.salidas` al mapa')
afirmar(todas.length === esperadas, `tantas filas como elementos del mapa (${esperadas})`)
afirmar(todas.filter((f) => f.clave === 'boxes').length === 3,
  'y las cajas también salen, que es lo que no estaba en ninguna hoja')
afirmar(todas.some((f) => f.clave === 'boxes' && /barrera invisible/.test(f.texto)),
  'una barrera se lee como lo que es en su fila')

// --------------------------------------------------- [1] pinchar una fila elige
console.log('\n[1] Pinchar una fila elige ese elemento')
await p.evaluate(() => {
  document.querySelector('#capas-lista button[data-capa="ramps"][data-i="0"]').click()
})
await p.waitForTimeout(300)
const elegido = await p.evaluate(() => window.vektorEditor.marcaElegida)
afirmar(elegido?.que === 'rampa' && elegido.i === 0, `elige la rampa (${JSON.stringify(elegido)})`)
await p.evaluate(() => {
  document.querySelector('#capas-lista button[data-capa="boxes"][data-i="1"]').click()
})
await p.waitForTimeout(300)
const sel = await p.evaluate(() => ({ s: window.vektorEditor.seleccion, m: window.vektorEditor.marcaElegida }))
afirmar(sel.s === 1 && sel.m === null, `y una caja por su índice (${JSON.stringify(sel)})`)

// ------------------------------------------- [2] el ojo quita del dibujo
console.log('\n[2] El ojo quita del dibujo y del picado, no del mapa')
const medir = () => p.evaluate(() => ({
  dibujadas: window.vektorEditor.escenario.boxes.length,
  proxies: window.vektorEditor.pinchables.length,
  enElMapa: window.vektorEditor.mapa.boxes.length,
}))
const antes = await medir()
const proxiesAntes = await p.evaluate(() => document.querySelector('canvas') && window.vektorEditor.escenario.boxes.length)
console.log(`    antes: ${antes.dibujadas} cajas montadas, ${antes.enElMapa} en el mapa`)
await p.evaluate(() => {
  document.querySelector('#capas-lista button[data-capa-ojo="boxes"][data-i="0"]').click()
})
await p.waitForTimeout(500)
const luego = await medir()
console.log(`    después: ${luego.dibujadas} montadas, ${luego.enElMapa} en el mapa`)
afirmar(luego.dibujadas === antes.dibujadas - 1, 'se monta una caja menos')
afirmar(luego.enElMapa === antes.enElMapa, 'y el mapa no ha cambiado')
const pinchable = await p.evaluate(() => {
  // El proxy de la caja 0 no puede seguir en la escena de picado.
  const g = window.vektorEditor
  return [...g.escenario.group.children].length >= 0
    && [...document.querySelectorAll('canvas')].length > 0
})
afirmar(pinchable, '(escena montada, la premisa del picado)')
const proxyOculto = await p.evaluate(() => {
  const indices = []
  // `proxies` no está en el asa, así que se pregunta por la escena: el proxy es
  // invisible pero está en el grafo con su índice.
  window.vektorEditor.escenario.group.parent.traverse((o) => {
    if (o.userData?.indice !== undefined) indices.push(o.userData.indice)
  })
  return indices.sort((a, b) => a - b)
})
console.log(`    proxies que quedan: ${JSON.stringify(proxyOculto)}`)
afirmar(!proxyOculto.includes(0) && proxyOculto.includes(1),
  'el proxy de la oculta se ha ido y los demás siguen con su índice')

// ------------------------------------------------ [3] lo medido no se entera
console.log('\n[3] Lo que se mide sigue contando el mapa entero')
const medido = await p.evaluate(() => ({
  dibujado: window.vektorEditor.escenario.boxes.length,
  medido: window.vektorEditor.escenarioMedido.boxes.length,
  sonElMismo: window.vektorEditor.escenario === window.vektorEditor.escenarioMedido,
}))
console.log(`    dibujado ${medido.dibujado} · medido ${medido.medido} · mismo objeto: ${medido.sonElMismo}`)
afirmar(medido.medido > medido.dibujado, 'el medido tiene más piezas que el dibujado')
afirmar(!medido.sonElMismo, 'y son dos objetos distintos mientras haya algo oculto')

// ---------------------------------------------------------- [4] ver todo
console.log('\n[4] «Ver todo» y el aviso')
const aviso = () => p.evaluate(() => {
  const n = document.getElementById('capas-ocultas')
  return { oculto: n.hidden, texto: n.textContent.trim() }
})
const conOculto = await aviso()
afirmar(!conOculto.oculto && /oculto/.test(conOculto.texto), `el aviso lo dice: «${conOculto.texto}»`)
await p.evaluate(() => document.getElementById('capas-ver-todo').click())
await p.waitForTimeout(500)
const vuelta = await p.evaluate(() => ({
  dibujado: window.vektorEditor.escenario.boxes.length,
  sonElMismo: window.vektorEditor.escenario === window.vektorEditor.escenarioMedido,
  avisoOculto: document.getElementById('capas-ocultas').hidden,
}))
afirmar(vuelta.dibujado === antes.dibujadas, `vuelven las ${antes.dibujadas} cajas`)
afirmar(vuelta.sonElMismo, 'y sin nada oculto vuelven a ser el mismo objeto — el camino normal no monta de más')
afirmar(vuelta.avisoOculto, 'y el aviso se va')

console.log(`\nErrores de página: ${errores.length}`)
for (const e of errores.slice(0, 8)) console.log(`    ${e}`)
afirmar(errores.length === 0, 'cero errores de página')

await navegador.close()
console.log(`\n${fallos === 0 ? 'VERDE' : `ROJO — ${fallos} fallo(s)`}`)
process.exit(fallos === 0 ? 0 : 1)
