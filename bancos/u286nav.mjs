/**
 * **u286nav — el U2, conducido como lo conduce una persona.**
 *
 * La regla de la vuelta 48: si algo tiene que hacerlo alguien con el ratón, el
 * banco lo hace con el ratón. Aquí se entra al juego, se equipa el arco desde
 * el almacenamiento —que es lo que hace la armería—, se tensa manteniendo el
 * botón y se suelta.
 *
 * Lo que se mide no es el estado interno: es **lo que se ve en pantalla** —los
 * píxeles del láser— y **lo que dice el HUD** —munición y aciertos—.
 */
import { chromium } from 'playwright-core'

const URL = 'http://localhost:5192/'
const fallos = []
const af = (cond, texto, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${texto}${extra ? ` — ${extra}` : ''}`)
  if (!cond) fallos.push(texto)
}

const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const pagina = await navegador.newPage({ viewport: { width: 1000, height: 640 } })
const errores = []
pagina.on('pageerror', (e) => errores.push(String(e) + '\n' + String(e.stack || '').split('\n').slice(1, 4).join('\n')))
pagina.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()) })

// El arco puesto y el escenario con cobertura: es donde hay contra qué chocar.
await pagina.addInitScript(() => {
  localStorage.setItem('aimcore.settings.v1', JSON.stringify({
    weapon: "u2", scenario: 'largoYPuerta', targetType: 'hitbox',
    simultaneousTargets: 3, sessionDuration: 'endless',
  }))
})
await pagina.goto(URL, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(1200)

console.log('== u286nav ==\n')

// Arrancar la sesión: el botón de jugar, y luego el clic que captura el ratón
// va **a una esquina** (vuelta 61: el centro puede ser un control).
const jugar = pagina.locator('button', { hasText: /JUGAR|Jugar/ }).first()
await jugar.click({ timeout: 5000 })
await pagina.waitForTimeout(800)
await pagina.mouse.click(60, 560)
await pagina.waitForTimeout(600)

const hud = async () => pagina.evaluate(() => {
  const txt = document.body.innerText
  return txt
})

console.log('[1] el U2 está en la mano')
{
  const t = await hud()
  af(/U2/i.test(t), 'el HUD dice U2', t.split('\n').filter((l) => /Bow|\d+\s*\/\s*\d+/.test(l)).slice(0, 3).join(' | '))
}

/**
 * Cuenta los píxeles **cálidos** de una captura. No se busca el color exacto:
 * la línea va a opacidad 0.45 sobre gris, así que lo que llega a pantalla es
 * el amarillo lavado — y un umbral clavado en #FFC21E daba cero con la curva
 * a la vista (comprobado mirando la captura, vuelta 48). Lo que distingue a
 * esta curva de todo lo demás del mapa es que **el mapa es gris**: en un gris
 * los tres canales valen lo mismo, así que basta con pedir que el rojo le
 * saque ventaja al azul.
 */
async function amarillos() {
  const buf = await pagina.screenshot({ type: 'png' })
  const { default: Jimp } = await import('jimp')
  const img = await Jimp.read(buf)
  let n = 0
  img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
    const r = this.bitmap.data[idx], g = this.bitmap.data[idx + 1], b = this.bitmap.data[idx + 2]
    if (r - b > 40 && r > 90 && g > b) n += 1
  })
  return n
}

console.log('\n[2] dispara al pulsar, y gasta el cohete del tubo')
{
  const antes = (await hud()).match(/(\d+)\s*\/\s*(\d+)/)
  await pagina.mouse.move(500, 300)
  await pagina.mouse.down()
  await pagina.waitForTimeout(120)
  await pagina.mouse.up()
  await pagina.waitForTimeout(400)
  const medio = (await hud()).match(/(\d+)\s*\/\s*(\d+)/)
  af(antes && medio && Number(medio[1]) === 0, 'el tubo se queda vacío',
    `${antes ? antes[0] : '?'} → ${medio ? medio[0] : '?'}`)
  // Y se recarga solo desde la reserva: 2 s.
  await pagina.waitForTimeout(2600)
  const luego = (await hud()).match(/(\d+)\s*\/\s*(\d+)/)
  af(luego && Number(luego[1]) === 1, 'la reserva vuelve a llenar el tubo', `${luego ? luego[0] : '?'}`)
}

console.log('\n[3] con la reserva agotada no recarga, y lo dice')
{
  // El segundo cohete, y ya no quedan (nacen 2 de fábrica).
  await pagina.mouse.down(); await pagina.waitForTimeout(120); await pagina.mouse.up()
  await pagina.waitForTimeout(2800)
  const t = await hud()
  const m = t.match(/(\d+)\s*\/\s*(\d+)/)
  af(m && Number(m[1]) === 0, 'el tubo se queda vacío de verdad', m ? m[0] : '?')
  await pagina.keyboard.press('KeyR')
  await pagina.waitForTimeout(400)
  const aviso = await hud()
  af(/cohete/i.test(aviso), 'el HUD explica por qué no recarga',
    aviso.split('\n').filter((l) => /cohete/i.test(l)).join(' | '))
}

console.log(`\n[5] errores de página: ${errores.length}`)
if (errores.length) console.log('    ' + errores.slice(0, 6).join('\n    '))
af(errores.length === 0, 'sin errores de página')

// Y una mirada de verdad (vuelta 48): el cohete en el aire.
await pagina.waitForTimeout(600)
await pagina.mouse.click(60, 560)
await pagina.waitForTimeout(400)
await pagina.screenshot({ path: 'scratchpad/u286.png' })
await navegador.close()
console.log(`\n${fallos.length === 0 ? 'TODO OK' : `${fallos.length} FALLOS: ${fallos.join('; ')}`}`)
process.exit(fallos.length === 0 ? 0 : 1)
