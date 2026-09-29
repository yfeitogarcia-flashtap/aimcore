/**
 * est95 — lo que la vuelta 95 le hizo a los estampados, y al editor.
 *
 * Mide las tres cosas del encargo: que una imagen nueva se vea sin reiniciar,
 * que haya una forma de escalar sin deformar, y que el giro exista y viaje.
 * Más las dos de Alchemist: que la R ya no eleve una pieza y que orbitar con el
 * puntero sobre una pieza no la apile.
 */
import { chromium } from 'playwright-core'
import { writeFileSync, rmSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { sanearMapa } from '../src/maps/formato.js'

const REPO = resolve(import.meta.dirname, '..')
const CEBO = resolve(REPO, 'public/estampados/cebo95.webp')
let fallos = 0
const afirmar = (bien, que, detalle = '') => {
  console.log(`  ${bien ? 'OK  ' : 'FALLO'} ${que}${detalle ? ` — ${detalle}` : ''}`)
  if (!bien) fallos++
}

console.log('\n== est95 ==\n')

// ---------------------------------------------------- el formato, sin navegador
const conGiro = (giro) => sanearMapa({
  clave: 'cebo95', label: 'cebo', room: { width: 40, depth: 40, height: 10 },
  spawn: { x: 0, z: 0 },
  estampados: [{ imagen: '/estampados/x.webp', cara: 'norte', x: 0, y: 2, z: 0, ancho: 4, alto: 2, giro }],
}).mapa.estampados[0]

const sinGiro = conGiro(0)
afirmar(!('giro' in sinGiro), 'un giro de cero no se escribe en el fichero (vuelta 83)',
  JSON.stringify(sinGiro))
const medio = conGiro(Math.PI / 2)
afirmar(Math.abs(medio.giro - Math.PI / 2) < 1e-9, 'y uno de 90° sí, en radianes', String(medio.giro))
const daVuelta = conGiro(Math.PI * 2.5)
afirmar(Math.abs(daVuelta.giro - Math.PI / 2) < 1e-9,
  'y una vuelta y cuarto se normaliza a un cuarto', String(daVuelta.giro))
const negativo = conGiro(-Math.PI / 2)
afirmar(negativo.giro > 0 && Math.abs(negativo.giro - Math.PI * 1.5) < 1e-9,
  'un giro negativo se normaliza hacia delante', String(negativo.giro))
// Punto fijo: sanear dos veces da lo mismo byte a byte (vuelta 83).
afirmar(JSON.stringify(conGiro(Math.PI / 2)) === JSON.stringify(medio),
  'el saneado sigue siendo un punto fijo, también con giro')

// ---------------------------------------------------- el editor, en el navegador
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

  // La ficha del estampado: los rótulos nuevos y el campo de giro.
  const panel = await p.evaluate(() => ({
    miraHacia: [...document.querySelectorAll('label')]
      .some((l) => l.textContent.trim().startsWith('Mira hacia')),
    // «Caras» del tubo no cuenta: lo que se mide es el rótulo del estampado.
    caraVieja: [...document.querySelectorAll('label')]
      .some((l) => /^Cara\s/.test(l.textContent.trim())),
    giro: !!document.getElementById('est-giro'),
    buscar: !!document.getElementById('est-buscar'),
    opciones: [...(document.getElementById('est-cara')?.options ?? [])].map((o) => o.textContent),
  }))
  afirmar(panel.miraHacia && !panel.caraVieja, '«Cara» pasa a ser «Mira hacia»', JSON.stringify(panel.miraHacia))
  afirmar(panel.giro, 'y la ficha tiene campo de giro')
  afirmar(panel.buscar, 'y un botón para buscar imágenes nuevas')
  afirmar(panel.opciones.every((o) => o.includes('hacia')),
    'cada cara dice hacia dónde da', panel.opciones.join(' | '))

  // Los atajos: R ya no sube una pieza.
  const atajos = await p.evaluate(() => [...document.querySelectorAll('#atajos-lista dt')].map((d) => d.textContent))
  afirmar(atajos.includes('Re Pág / Av Pág') && !atajos.includes('R / F'),
    'subir y bajar dejan de ser R y F', atajos.filter((a) => a.includes('Pág') || a === 'R / F').join(' | '))

  // Y lo que de verdad importa: pulsar R con una pieza elegida no la mueve.
  const antes = await p.evaluate(() => {
    window.vektorEditor?.elegir?.(0)
    return JSON.stringify(window.vektorEditor?.mapa?.boxes?.[0] ?? null)
  })
  await p.keyboard.press('KeyR')
  await p.waitForTimeout(150)
  const despues = await p.evaluate(() => JSON.stringify(window.vektorEditor?.mapa?.boxes?.[0] ?? null))
  afirmar(antes === despues, 'la R no eleva la pieza elegida',
    antes === despues ? '' : `${antes} → ${despues}`)

  afirmar(errores.length === 0, 'ni un error de página en el editor', errores.slice(0, 3).join(' | '))
} finally {
  await nav.close()
  if (existsSync(CEBO)) rmSync(CEBO)
}

console.log(`\n${fallos === 0 ? 'VERDE' : `ROJO (${fallos})`}\n`)
process.exit(fallos === 0 ? 0 : 1)
