/**
 * barrera95ed — la barrera en Alchemist, contra la página de verdad.
 *
 * Lo que mide es la convención de la 78 aplicada a esta pieza: que se ponga con
 * un botón, que se encuentre en la lista (que es lo único que hay cuando es
 * invisible), que su ficha diga **si con ese alto se salta por encima** y que
 * elegir barrera le quite el tinte en el mismo clic.
 */
import { chromium } from 'playwright-core'

let fallos = 0
const afirmar = (bien, que, detalle = '') => {
  console.log(`  ${bien ? 'OK  ' : 'FALLO'} ${que}${detalle ? ` — ${detalle}` : ''}`)
  if (!bien) fallos++
}

console.log('\n== barrera95ed ==\n')

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const errores = []
try {
  const p = await nav.newPage({ viewport: { width: 1600, height: 900 } })
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.goto('http://127.0.0.1:5192/editor/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)

  // La hoja de dispositivos, que es donde quien construye va a buscarla.
  await p.evaluate(() => {
    document.querySelector('button[data-pestana="dispositivos"]')?.click()
  })
  const puesta = await p.evaluate(() => {
    const boton = document.querySelector('button[data-dispositivo="barrera"]')
    if (!boton) return { boton: false }
    const antes = window.vektorEditor.mapa.boxes.length
    boton.click()
    const cajas = window.vektorEditor.mapa.boxes
    return { boton: true, antes, ahora: cajas.length, ultima: cajas[cajas.length - 1] }
  })
  afirmar(puesta.boton, 'hay un botón de Barrera en la hoja de Dispositivos')
  afirmar(puesta.ahora === puesta.antes + 1, 'y pone una pieza', `${puesta.antes} → ${puesta.ahora}`)
  afirmar(puesta.ultima?.barrera === 'cristal',
    'que nace de cristal, no invisible', JSON.stringify(puesta.ultima))
  // **Fina y alta**, que es lo que la hace un límite y no una losa.
  afirmar(puesta.ultima?.d < 1 && puesta.ultima?.kind >= 4,
    'fina y alta', `grosor ${puesta.ultima?.d}, alto ${puesta.ultima?.kind}`)

  // La ficha: el desplegable y el número que decide si delimita.
  const ficha = await p.evaluate(() => ({
    valor: document.getElementById('p-barrera')?.value,
    nota: document.getElementById('p-barrera-nota')?.hidden === false,
    aviso: document.getElementById('p-barrera-aviso')?.textContent ?? '',
    clase: document.getElementById('p-barrera-aviso')?.className ?? '',
  }))
  afirmar(ficha.valor === 'cristal', 'la ficha de la pieza la da por elegida', ficha.valor)
  afirmar(ficha.nota, 'y dice que sólo para el cuerpo')
  afirmar(/salto sube 1\.25 u/.test(ficha.aviso) && ficha.clase === 'nota',
    'y con el alto de fábrica dice que NO se salta por encima', ficha.aviso)

  // Bajándola por debajo del ápice, el mismo sitio pasa a ser un aviso.
  const baja = await p.evaluate(() => {
    const cajas = window.vektorEditor.mapa.boxes
    cajas[cajas.length - 1].kind = 1
    window.vektorEditor.elegir(cajas.length - 1)
    const a = document.getElementById('p-barrera-aviso')
    return { texto: a.textContent, clase: a.className }
  })
  afirmar(baja.clase === 'aviso' && /se salta por encima/.test(baja.texto),
    'y a 1 u avisa de que se salta', baja.texto)

  // La lista: es lo único que encuentra una barrera invisible.
  const lista = await p.evaluate(() => {
    const cajas = window.vektorEditor.mapa.boxes
    cajas[cajas.length - 1].barrera = 'invisible'
    window.vektorEditor.elegir(cajas.length - 1)
    return [...document.querySelectorAll('#lista-disp li')].map((l) => l.textContent)
  })
  afirmar(lista.some((f) => f.startsWith('Barrera') && f.includes('invisible')),
    'la lista de dispositivos encuentra una barrera invisible',
    lista.filter((f) => f.startsWith('Barrera')).join(' | '))

  // Y elegir barrera limpia el tinte en el mismo clic, que es lo que el saneado
  // haría al guardar: enseñar un campo que el fichero va a tirar es el fallo de
  // la vuelta 67 por la puerta del panel.
  const limpia = await p.evaluate(() => {
    const cajas = window.vektorEditor.mapa.boxes
    const pieza = cajas[cajas.length - 1]
    delete pieza.barrera
    pieza.tinte = 'musgo'
    window.vektorEditor.elegir(cajas.length - 1)
    const select = document.getElementById('p-barrera')
    select.value = 'cristal'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return { tinte: pieza.tinte, barrera: pieza.barrera }
  })
  afirmar(limpia.barrera === 'cristal' && limpia.tinte === undefined,
    'poner barrera le quita el tinte', JSON.stringify(limpia))

  afirmar(errores.length === 0, 'ni un error de página', errores.slice(0, 3).join(' | '))
} finally {
  await nav.close()
}

console.log(`\n${fallos === 0 ? 'VERDE' : `ROJO (${fallos})`}\n`)
process.exit(fallos === 0 ? 0 : 1)
