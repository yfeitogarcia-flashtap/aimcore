// ficha107 — la ficha de lo elegido en Alchemist (vuelta 107, A1), contra la
// página del editor en el servidor de desarrollo (5192).
//  [1] Sin nada elegido no hay ficha.
//  [2] Una peana: «Peana · entrega Reaper», qué hace y sus datos; «Editar» abre
//      la hoja de Reglas.
//  [3] Una pieza y una salida: cada una dice lo suyo; la salida, su suelo.
import { chromium } from 'playwright-core'

const BASE = process.env.BASE || 'http://localhost:5192'
let fallos = 0
const ok = (t, c, d = '') => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}${d ? ` — ${d}` : ''}`); if (!c) fallos += 1 }
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const p = await nav.newPage({ viewport: { width: 1600, height: 900 } })
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))
await p.goto(`${BASE}/editor/#el-espejo-peanas`, { waitUntil: 'networkidle' })
await p.waitForTimeout(2500)
const ficha = () => p.evaluate(() => ({
  visible: !document.getElementById('ficha-elegido').hidden,
  que: document.getElementById('ficha-elegido-que').textContent,
  hace: document.getElementById('ficha-elegido-hace').textContent,
  datos: [...document.querySelectorAll('#ficha-elegido-datos li')].map((li) => li.textContent),
}))

console.log('\n[1] Sin nada elegido')
await p.evaluate(() => window.vektorEditor.elegir(-1))
await p.waitForTimeout(400)
ok('no hay ficha', !(await ficha()).visible)

console.log('\n[2] Una peana')
ok('premisa: el mapa de Yago está abierto con sus peanas', await p.evaluate(() => window.vektorEditor.mapa.clave === 'el-espejo-peanas' && window.vektorEditor.mapa.peanas.length === 4))
await p.evaluate(() => window.vektorEditor.elegirMarca({ que: 'peana', i: 0 }))
await p.waitForTimeout(400)
let f = await ficha()
ok('dice qué es y qué entrega', f.visible && f.que === 'Peana · entrega Reaper', f.que)
ok('qué hace, y sus datos', /apuntándole/.test(f.hace) && f.datos.some((d) => /Posición.*5, -19/.test(d)), f.datos.join(' | '))
await p.click('#ficha-elegido-editar')
await p.waitForTimeout(400)
ok('«Editar» abre su hoja', await p.evaluate(() => window.vektorEditor.panelAbierto && window.vektorEditor.pestana === 'reglas'))
await p.evaluate(() => window.vektorEditor.abrirPanel(false))

console.log('\n[3] Una pieza y una salida')
await p.evaluate(() => window.vektorEditor.elegir(0))
await p.waitForTimeout(400)
f = await ficha()
ok('una pieza dice su tipo y que choca', f.visible && /^Pieza · media/.test(f.que) && /choca/.test(f.hace), `${f.que} · ${f.hace}`)
await p.evaluate(() => window.vektorEditor.elegirMarca({ que: 'salida', i: 1 }))
await p.waitForTimeout(400)
f = await ficha()
ok('una salida dice su suelo y su rumbo', f.visible && f.que === 'Salida de duelo 2' && f.datos.some((d) => /Suelo0 u/.test(d)) && f.datos.some((d) => /Rumbo180°/.test(d)), f.datos.join(' | '))

ok('ni un error de página', errores.length === 0, errores.slice(0, 2).join(' | '))
await nav.close()
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
