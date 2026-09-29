/**
 * coloca96 — **un solo sistema para todo lo colocable** (vuelta 96, punto 1).
 *
 * Se reportaron cuatro cosas juntas de la escalera, la rampa y el estampado:
 * aparecen fuera de la sala, no se arrastran pinchándolas, la escalera sigue
 * elegida al pinchar otra pieza y no se borra con Supr. Aquí se miden las cuatro
 * para **los siete tipos** —caja de control, rampa, escalera, tubo, prisma,
 * estampado y barrera invisible—, con clics de ratón de verdad contra la página
 * (la disciplina de la vuelta 48: si lo hace una persona con el ratón, el banco
 * también).
 *
 * [0] La premisa: el centro de órbita se lleva **fuera de la sala**, que es la
 *     situación real —se construye volando— y sin ella «nace dentro» lo cumple
 *     cualquier cosa.
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

// Un mapa de 50×50 vacío, como el que se reportó.
await p.evaluate(() => {
  window.vektorEditor.cargar({
    clave: 'banco-coloca96', label: 'Banco 96',
    room: { width: 50, depth: 50, height: 16 },
    spawn: { x: 0, z: 20 },
    boxes: [], ramps: [], prismas: [], tubos: [], escaleras: [], estampados: [], routes: [],
  })
})
await p.waitForTimeout(600)
const sala = await p.evaluate(() => window.vektorEditor.escenario.room)
console.log(`\n[0] Sala de ${sala.width}×${sala.depth}. Centro de órbita empujado a (40, 40) — fuera.`)
await p.evaluate(() => {
  const o = window.vektorEditor.orbita
  o.centro.x = 40
  o.centro.z = 40
})
const centro = await p.evaluate(() => ({ x: window.vektorEditor.orbita.centro.x, z: window.vektorEditor.orbita.centro.z }))
afirmar(Math.abs(centro.x) > sala.width / 2, `el centro está fuera de verdad (x ${centro.x} contra media sala ${sala.width / 2})`)

// ------------------------------------------------- [1] nace dentro de la sala
console.log('\n[1] Nace dentro de la sala')
const poner = async (selector) => {
  await p.evaluate((sel) => document.querySelector(sel)?.click(), selector)
  await p.waitForTimeout(350)
}
await p.evaluate(() => window.vektorEditor.abrirPanel(true, 'construir'))
await p.waitForTimeout(250)
const FORMAS = [
  ['cubo', 'button[data-forma="cubo"]', 'boxes'],
  ['rampa', 'button[data-forma="rampa"]', 'ramps'],
  ['escalera', 'button[data-forma="escalera"]', 'escaleras'],
  ['tubo', 'button[data-forma="tubo"]', 'tubos'],
  ['muro girado', 'button[data-forma="muro-girado"]', 'prismas'],
]
const dentro = (v, mitad) => Math.abs(v) <= mitad
for (const [nombre, sel, lista] of FORMAS) {
  const hay = await p.evaluate((s) => Boolean(document.querySelector(s)), sel)
  if (!hay) {
    const ids = await p.evaluate(() => [...document.querySelectorAll('button[data-forma]')].map((b) => b.dataset.forma))
    console.log(`    (sin botón "${sel}"; los que hay: ${JSON.stringify(ids)})`)
    afirmar(false, `${nombre}: existe su botón`)
    continue
  }
  await poner(sel)
  const puesto = await p.evaluate((l) => {
    const arr = window.vektorEditor.mapa[l] ?? []
    const u = arr[arr.length - 1]
    return u ? { x: u.x, z: u.z } : null
  }, lista)
  const ok = puesto && dentro(puesto.x, sala.width / 2) && dentro(puesto.z, sala.depth / 2)
  afirmar(ok, `${nombre}: nace en (${puesto?.x}, ${puesto?.z}), dentro de ±${sala.width / 2}`)
}

// El estampado va por su propia hoja.
await p.evaluate(() => window.vektorEditor.abrirPanel(true, 'mapa'))
await p.waitForTimeout(250)
await poner('#est-poner')
const est = await p.evaluate(() => {
  const arr = window.vektorEditor.mapa.estampados ?? []
  const u = arr[arr.length - 1]
  return u ? { x: u.x, z: u.z } : null
})
afirmar(est && dentro(est.x, sala.width / 2) && dentro(est.z, sala.depth / 2),
  `estampado: nace en (${est?.x}, ${est?.z}), dentro de ±${sala.width / 2}`)

// La barrera, desde la hoja de dispositivos.
await p.evaluate(() => window.vektorEditor.abrirPanel(true, 'dispositivos'))
await p.waitForTimeout(250)
await poner('button[data-dispositivo="barrera"]')
const bar = await p.evaluate(() => {
  const arr = window.vektorEditor.mapa.boxes ?? []
  const u = arr[arr.length - 1]
  return u ? { x: u.x, z: u.z, barrera: u.barrera } : null
})
afirmar(bar?.barrera && dentro(bar.x, sala.width / 2) && dentro(bar.z, sala.depth / 2),
  `barrera: nace en (${bar?.x}, ${bar?.z}) y es «${bar?.barrera}»`)

// ------------------------------------- [2] se pincha por su cuerpo y se arrastra
console.log('\n[2] Se elige pinchando la pieza, y arrastrándola se mueve')
/** Devuelve el punto de pantalla de una coordenada de mundo. */
const enPantalla = (x, y, z) => p.evaluate(([a, b, c]) => window.vektorEditor.proyectar(a, b, c), [x, y, z])

const pinchar = async (x, y, z) => {
  const pt = await enPantalla(x, y, z)
  await p.mouse.click(pt.x, pt.y)
  await p.waitForTimeout(200)
  return pt
}
const arrastrar = async (desde, hasta) => {
  await p.mouse.move(desde.x, desde.y)
  await p.mouse.down()
  await p.mouse.move(hasta.x, hasta.y, { steps: 8 })
  await p.mouse.up()
  await p.waitForTimeout(220)
}

// Se deja sólo una rampa, una escalera y un prisma para que no se tapen.
await p.evaluate(() => {
  const m = window.vektorEditor.mapa
  m.boxes = []
  m.tubos = []
  m.estampados = []
  m.ramps = [{ x: -14, z: -4, w: 4, d: 8, fromZ: -4, toZ: 4, top: 'plataforma' }]
  m.escaleras = [{ x: 4, z: -6, ancho: 3, huella: 0.6, alto: 2.6, escalones: 6, rumbo: 0 }]
  m.prismas = [{ x: 14, z: 10, w: 3, d: 3, lados: 6, giro: 0.3, kind: 'alta' }]
  window.vektorEditor.cargar(JSON.parse(JSON.stringify(m)))
})
await p.waitForTimeout(700)
await p.evaluate(() => { window.vektorEditor.orbita.centro.x = 0; window.vektorEditor.orbita.centro.z = 0 })

const CASOS = [
  ['rampa', 'ramps', 0, () => ({ x: -12, y: 0.65, z: 0 })],
  ['escalera', 'escaleras', 0, () => ({ x: 5.5, y: 1.3, z: -4.2 })],
  ['prisma', 'prismas', 0, () => ({ x: 14, y: 1.8, z: 10 })],
]
for (const [nombre, lista, i, donde] of CASOS) {
  await p.evaluate(() => window.vektorEditor.elegir(-1))
  const d = donde()
  const pt = await pinchar(d.x, d.y, d.z)
  const elegido = await p.evaluate(() => window.vektorEditor.marcaElegida)
  afirmar(elegido?.que === nombre && elegido.i === i,
    `${nombre}: pinchando su cuerpo queda elegida (marca: ${JSON.stringify(elegido)})`)
  // Y se arrastra: se mira que la coordenada cambie de verdad.
  const antes = await p.evaluate(([l, k]) => ({ ...window.vektorEditor.mapa[l][k] }), [lista, i])
  const destino = { x: pt.x + 70, y: pt.y + 40 }
  await arrastrar(pt, destino)
  const luego = await p.evaluate(([l, k]) => ({ ...window.vektorEditor.mapa[l][k] }), [lista, i])
  const movido = Math.abs(luego.x - antes.x) > 0.05 || Math.abs(luego.z - antes.z) > 0.05
  if (!movido) {
    // Y si no se movió, se dice **qué se agarró**: «no se mueve» y «se agarró
    // otra cosa» son diagnósticos distintos y sólo uno es un fallo del arrastre.
    const tras = await p.evaluate(() => window.vektorEditor.marcaElegida)
    console.log(`    (lo que quedó agarrado: ${JSON.stringify(tras)})`)
  }
  afirmar(movido, `${nombre}: arrastrándola se mueve (${antes.x},${antes.z} → ${luego.x},${luego.z})`)
}

// -------------------------------- [3] pinchar otra cosa deselecciona la anterior
console.log('\n[3] Pinchar otra pieza deselecciona la anterior')
await p.evaluate(() => {
  const m = window.vektorEditor.mapa
  m.boxes = [{ x: 8, z: 8, w: 2, d: 2, kind: 'media' }]
  window.vektorEditor.cargar(JSON.parse(JSON.stringify(m)))
})
await p.waitForTimeout(600)
await p.evaluate(() => window.vektorEditor.elegirMarca({ que: 'escalera', i: 0 }))
const antesDe = await p.evaluate(() => window.vektorEditor.marcaElegida?.que)
await pinchar(9, 1.85, 9)
const trasClic = await p.evaluate(() => ({
  marca: window.vektorEditor.marcaElegida, sel: window.vektorEditor.seleccion,
}))
afirmar(antesDe === 'escalera', 'la premisa: la escalera estaba elegida')
afirmar(trasClic.marca === null && trasClic.sel === 0,
  `pinchando la caja se elige la caja y la escalera se suelta (${JSON.stringify(trasClic)})`)

// ------------------------------------------------------------ [4] Supr borra
console.log('\n[4] Supr borra lo elegido, sea lo que sea')
for (const [nombre, lista] of [['rampa', 'ramps'], ['escalera', 'escaleras'], ['prisma', 'prismas']]) {
  const cuantos = await p.evaluate((l) => (window.vektorEditor.mapa[l] ?? []).length, lista)
  await p.evaluate((n) => window.vektorEditor.elegirMarca({ que: n, i: 0 }), nombre)
  await p.keyboard.press('Delete')
  await p.waitForTimeout(250)
  const luego = await p.evaluate((l) => (window.vektorEditor.mapa[l] ?? []).length, lista)
  afirmar(luego === cuantos - 1, `${nombre}: Supr la borra (${cuantos} → ${luego})`)
}

// ------------------------------------ [5] la barrera invisible se ve siempre
console.log('\n[5] La barrera invisible se ve en el editor aunque no esté elegida')
await p.evaluate(() => {
  const m = window.vektorEditor.mapa
  m.boxes = [
    { x: -3, z: 0, w: 6, d: 0.4, kind: 'alta', barrera: 'invisible' },
    { x: -3, z: 6, w: 6, d: 0.4, kind: 'alta', barrera: 'cristal' },
    { x: -3, z: 12, w: 6, d: 0.4, kind: 'alta' },
  ]
  window.vektorEditor.cargar(JSON.parse(JSON.stringify(m)))
})
await p.waitForTimeout(700)
await p.evaluate(() => window.vektorEditor.elegir(-1))
const fantasmas = await p.evaluate(() => window.vektorEditor.fantasmas.children.length)
console.log(`    contornos dibujados: ${fantasmas}`)
afirmar(fantasmas === 1, 'hay exactamente un contorno: el de la invisible, y no uno por pieza')
// Y sin elegir nada: que no dependa de la selección es justo lo reportado.
const sel = await p.evaluate(() => ({ s: window.vektorEditor.seleccion, m: window.vektorEditor.marcaElegida }))
afirmar(sel.s === -1 && sel.m === null, `y con nada elegido (${JSON.stringify(sel)})`)

// ------------------------------------ [6] y el aro sigue girando lo que giraba
/**
 * La otra mitad del [2]: bajar el aro al suelo y hacer que gane por distancia no
 * puede haberle quitado lo que hace. Se agarra **su banda** —el radio que el
 * editor dibuja— y se comprueba que el dato gira.
 */
console.log('\n[6] El aro sigue girando')
await p.evaluate(() => {
  const m = window.vektorEditor.mapa
  m.boxes = []
  m.ramps = [{ x: -14, z: -4, w: 4, d: 8, fromZ: -4, toZ: 4, top: 'plataforma' }]
  m.escaleras = [{ x: 4, z: -6, ancho: 3, huella: 0.6, alto: 2.6, escalones: 6, rumbo: 0 }]
  m.prismas = [{ x: 14, z: 10, w: 3, d: 3, lados: 6, giro: 0, kind: 'alta' }]
  window.vektorEditor.cargar(JSON.parse(JSON.stringify(m)))
})
await p.waitForTimeout(700)
/**
 * El punto del aro **sale del propio editor**, no de repetir su fórmula aquí: se
 * busca el picker por su marca en `pinchables` y se lee su posición y el radio
 * medio de su anillo. Un banco que sabe que el aro de una escalera mide 4.2 no
 * prueba el aro, prueba un número (vuelta 43).
 */
const puntoDelAro = (que) => p.evaluate((q) => {
  const m = window.vektorEditor.pinchables.find((x) => x.userData.marca?.que === q)
  if (!m) return null
  const par = m.geometry.parameters ?? {}
  const r = ((par.innerRadius ?? 0) + (par.outerRadius ?? 0)) / 2
  m.updateMatrixWorld(true)
  const c = new (Object.getPrototypeOf(m.position).constructor)()
  c.setFromMatrixPosition(m.matrixWorld)
  return { x: c.x, y: c.y, z: c.z, r }
}, que)

for (const [nombre, lista] of [['prisma', 'prismas'], ['rampa', 'ramps'], ['escalera', 'escaleras']]) {
  await p.evaluate((n) => window.vektorEditor.elegirMarca({ que: n, i: 0 }), nombre)
  await p.waitForTimeout(250)
  const aro = await puntoDelAro(`${nombre}-giro`)
  if (!aro) { afirmar(false, `${nombre}: su aro existe en pinchables`); continue }
  const antes = await p.evaluate((l) => JSON.stringify(window.vektorEditor.mapa[l][0]), lista)
  const a = await enPantalla(aro.x + aro.r, aro.y, aro.z)
  const b = await enPantalla(aro.x, aro.y, aro.z + aro.r)
  await arrastrar(a, b)
  const agarrado = await p.evaluate(() => window.vektorEditor.marcaElegida?.que)
  const luego = await p.evaluate((l) => JSON.stringify(window.vektorEditor.mapa[l][0]), lista)
  afirmar(agarrado === `${nombre}-giro`, `${nombre}: la banda del aro se agarra (agarrado: ${agarrado})`)
  afirmar(antes !== luego, `${nombre}: y girarlo cambia el dato`)
  if (antes === luego) console.log(`      antes ${antes}\n      luego ${luego}`)
}

console.log(`\nErrores de página: ${errores.length}`)
for (const e of errores.slice(0, 8)) console.log(`    ${e}`)
afirmar(errores.length === 0, 'cero errores de página')

await navegador.close()
console.log(`\n${fallos === 0 ? 'VERDE' : `ROJO — ${fallos} fallo(s)`}`)
process.exit(fallos === 0 ? 0 : 1)
