// Banco: el cambio del aire de la vuelta 88 no produce ni una corrección.
// Va en `_readWish`, que la corren los dos extremos con las mismas máscaras,
// así que lo que hay que medir es justo eso: saltar con W+estrafe mientras se
// gira, y que el servidor no corrija nada.
import { chromium } from 'playwright-core'

let fallos = 0
const afirmar = (n, c, d = '') => {
  console.log((c ? '  ok  ' : '  FALLO ') + n + (d ? ` — ${d}` : ''))
  if (!c) fallos += 1
}

const lanzar = () => chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const nav = await lanzar(); const nav2 = await lanzar()
const errores = []
const A = await nav.newPage({ viewport: { width: 1280, height: 720 } })
A.on('pageerror', (e) => errores.push(String(e)))
await A.goto('http://localhost:5199/duelo/', { waitUntil: 'networkidle' })
await A.waitForTimeout(2000)
const codigo = (await A.locator('#codigo').innerText()).trim()
const B = await nav2.newPage({ viewport: { width: 1280, height: 720 } })
B.on('pageerror', (e) => errores.push(String(e)))
await B.goto(`http://localhost:5199/duelo/${codigo}`, { waitUntil: 'networkidle' })
await B.waitForTimeout(2500)

// Jugar de verdad: clic en una esquina, que el centro es un `.control`
// (vuelta 61).
await A.mouse.click(40, 700)
await A.waitForTimeout(600)
await A.keyboard.press('F3')
await A.waitForTimeout(400)

// Ocho saltos con W+D mientras se gira el ratón, que es el gesto que la
// vuelta 88 acaba de abrir.
await A.keyboard.down('KeyW')
await A.keyboard.down('KeyD')
for (let salto = 0; salto < 8; salto++) {
  await A.keyboard.down('Space')
  await A.waitForTimeout(40)
  await A.keyboard.up('Space')
  for (let i = 0; i < 24; i++) {
    await A.mouse.move(-14, 0)
    await A.waitForTimeout(25)
  }
}
await A.keyboard.up('KeyW')
await A.keyboard.up('KeyD')
await A.waitForTimeout(800)

const linea = (await A.locator('#correcciones').innerText()).trim()
const error = (await A.locator('#error').innerText().catch(() => '—')).trim()
console.log('  correcciones:', linea, '| error de reconciliación:', error)
const [corr, fotos] = linea.match(/(\d+) de (\d+)/)?.slice(1).map(Number) ?? [NaN, NaN]
afirmar('hubo fotos de verdad (denominador a la vista)', fotos > 100, `${fotos} fotos`)
afirmar('cero correcciones saltando con W+estrafe', corr === 0, `${corr} de ${fotos}`)
afirmar('ni un error de página', errores.length === 0, errores.slice(0, 2).join(' | '))

await nav.close(); await nav2.close()
console.log(fallos === 0 ? '\nTODO VERDE' : `\n${fallos} FALLOS`)
process.exit(fallos === 0 ? 0 : 1)
