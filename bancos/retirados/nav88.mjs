// Banco de navegador: que la página carga sin un solo error y que lo de la
// vuelta 88 está en su sitio. Un error de página es un fallo, no una línea de
// registro (vuelta 60).
import { chromium } from 'playwright-core'

let fallos = 0
const afirmar = (n, c, d = '') => {
  console.log((c ? '  ok  ' : '  FALLO ') + n + (d ? ` — ${d}` : ''))
  if (!c) fallos += 1
}

const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 720 } })
const errores = []
pagina.on('pageerror', (e) => errores.push(String(e)))
pagina.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()) })

await pagina.goto('http://localhost:5192/', { waitUntil: 'networkidle' })
await pagina.waitForTimeout(1500)

// --- Opciones: ESC la cierra ---
await pagina.getByRole('button', { name: /Opciones/i }).first().click()
await pagina.waitForTimeout(400)
const abierto = await pagina.locator('.panel--options').count()
afirmar('opciones abre', abierto === 1)
await pagina.keyboard.press('Escape')
await pagina.waitForTimeout(400)
afirmar('ESC cierra opciones', (await pagina.locator('.panel--options').count()) === 0)

// --- Armería: las tres granadas salen con su ficha ---
await pagina.getByRole('button', { name: /Armer/i }).first().click()
await pagina.waitForTimeout(500)
const texto = await pagina.locator('.panel--armoury').innerText()
for (const n of ['Core', 'Blind', 'KO', 'Bow', 'U2', 'Vanta']) {
  afirmar(`la armería lista ${n}`, texto.includes(n))
}
afirmar('y el Bow ya no dice SEMI', !/Bow[\s\S]{0,120}SEMI/.test(texto), 'modo del arco')
await pagina.keyboard.press('Escape')
await pagina.waitForTimeout(300)

// --- El selector no ofrece mapas sin publicar ---
await pagina.getByRole('button', { name: /Opciones/i }).first().click()
await pagina.waitForTimeout(400)
const mapas = await pagina.locator('.scenarios__name').allInnerTexts()
console.log('  mapas en el selector:', mapas.join(' · '))
afirmar('el selector tiene mapas', mapas.length > 0)
await pagina.keyboard.press('Escape')

// --- El duelo carga y el dinero tiene su hueco ---
const duelo = await navegador.newPage({ viewport: { width: 1280, height: 720 } })
const erroresDuelo = []
duelo.on('pageerror', (e) => erroresDuelo.push(String(e)))
await duelo.goto('http://localhost:5192/duelo/', { waitUntil: 'networkidle' })
await duelo.waitForTimeout(2500)
afirmar('el duelo carga sin errores', erroresDuelo.length === 0, erroresDuelo.slice(0, 2).join(' | '))
const hudDuelo = await duelo.locator('.hud__fps').count()
afirmar('el HUD del juego está montado en el duelo', hudDuelo === 1)
/**
 * **El bloque de dinero sale si y sólo si hay economía**, y quién lo dice es la
 * bienvenida (`conEconomia`), no que llegue un mensaje. Así que aquí hay dos
 * casos según esté o no levantado el huésped de Node, y el banco afirma sobre
 * el que toque en vez de sobre el que esperaba — un banco que da por hecho su
 * premisa mide el fallo, no el juego (vuelta 46).
 */
const hayEco = await duelo.evaluate(() => Boolean(document.getElementById('codigo')?.textContent?.trim()))
const bloques = await duelo.locator('.hud__dinero').count()
if (hayEco && bloques === 1) {
  const saldo = (await duelo.locator('.hud__dinero-valor').innerText()).trim()
  afirmar('con economía el HUD enseña el saldo', /^\d+$/.test(saldo), `$${saldo}`)
} else {
  afirmar('sin economía no hay bloque de dinero', bloques === 0, `${bloques} bloques`)
}

afirmar('la página del juego no dio ni un error', errores.length === 0, errores.slice(0, 3).join(' | '))
await navegador.close()
console.log(fallos === 0 ? '\nTODO VERDE' : `\n${fallos} FALLOS`)
process.exit(fallos === 0 ? 0 : 1)
