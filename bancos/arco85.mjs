/**
 * **arco85 — el arco, conducido como lo conduce una persona.**
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
pagina.on('pageerror', (e) => errores.push(String(e)))
pagina.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()) })

// El arco puesto y el escenario con cobertura: es donde hay contra qué chocar.
await pagina.addInitScript(() => {
  localStorage.setItem('aimcore.settings.v1', JSON.stringify({
    // **El arco vive en la ranura especial desde la vuelta 92**, no en la
    // principal: con `weapon: 'bow'` el saneado lo traduce —la principal cae a
    // fábrica y la especial hereda— y el jugador sale con el Rift en la mano, así
    // que este banco llevaba cuatro vueltas midiendo otra arma. Hay que sacarlo
    // con la 5 (ver más abajo).
    special: 'bow', scenario: 'largoYPuerta', targetType: 'hitbox',
    simultaneousTargets: 3, sessionDuration: 'endless',
  }))
})
await pagina.goto(URL, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(1200)

console.log('== arco85 ==\n')

// Arrancar la sesión: el botón de jugar, y luego el clic que captura el ratón
// va **a una esquina** (vuelta 61: el centro puede ser un control).
/**
 * **La pantalla de inicio va en tres pasos desde la vuelta 92**, así que coger
 * «el primer botón que diga JUGAR» dejaba el banco parado en la marca: no entraba
 * en la sesión, y de ahí salían **los cinco fallos a la vez** —sin HUD, sin curva
 * y con el carcaj en «?»—. Hay que pasar por los tres: marca → modos →
 * configurar.
 */
await pagina.click('text=Jugar ahora')
await pagina.waitForTimeout(400)
await pagina.click('text=Entrenamiento')
await pagina.waitForTimeout(400)
const jugar = pagina.locator('button', { hasText: /^Jugar/ }).last()
await jugar.click({ timeout: 5000 })
await pagina.waitForTimeout(800)
await pagina.mouse.click(60, 560)
await pagina.waitForTimeout(600)
// Y se saca con la **5**, que es la tecla de la ranura especial desde la vuelta
// 92: el ajuste dice qué llevas en esa ranura, no qué tienes en la mano.
await pagina.keyboard.press('Digit5')
await pagina.waitForTimeout(400)

const hud = async () => pagina.evaluate(() => {
  const txt = document.body.innerText
  return txt
})

console.log('[1] el arco está en la mano')
{
  const t = await hud()
  af(/Bow/i.test(t), 'el HUD dice Bow', t.split('\n').filter((l) => /Bow|\d+\s*\/\s*\d+/.test(l)).slice(0, 3).join(' | '))
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

console.log('\n[2] tensar dibuja la curva, y soltar la quita')
{
  const antes = await amarillos()
  // Un poco hacia arriba: con la vista al ras la curva cae a veinte unidades y
  // lo que se ve es un trazo de diez píxeles contra el suelo.
  await pagina.mouse.move(500, 260)
  await pagina.waitForTimeout(200)
  await pagina.mouse.down()
  await pagina.waitForTimeout(300)
  const aMedias = await amarillos()
  await pagina.waitForTimeout(700)
  const lleno = await amarillos()
  await pagina.mouse.up()
  await pagina.waitForTimeout(400)
  const despues = await amarillos()
  af(aMedias > antes + 50, 'la curva aparece al tensar', `${antes} → ${aMedias} px`)
  af(lleno >= aMedias - 40, 'sigue puesta con la carga llena', `${lleno} px`)
  af(despues < aMedias / 2, 'se quita al soltar', `${aMedias} → ${despues} px`)
}

console.log('\n[3] soltar gasta una flecha')
{
  const antes = await hud()
  const m0 = antes.match(/(\d+)\s*\/\s*(\d+)/)
  await pagina.waitForTimeout(1200)
  await pagina.mouse.down()
  await pagina.waitForTimeout(800)
  await pagina.mouse.up()
  await pagina.waitForTimeout(500)
  const m1 = (await hud()).match(/(\d+)\s*\/\s*(\d+)/)
  af(m0 && m1 && Number(m1[1]) === Number(m0[1]) - 1,
    'el carcaj baja en uno', `${m0 ? m0[0] : '?'} → ${m1 ? m1[0] : '?'}`)
}

console.log('\n[4] tensar y abortar (soltar el ratón con ESC) no gasta flecha')
{
  await pagina.waitForTimeout(1300)
  const m0 = (await hud()).match(/(\d+)\s*\/\s*(\d+)/)
  await pagina.mouse.down()
  await pagina.waitForTimeout(400)
  await pagina.evaluate(() => document.exitPointerLock())
  await pagina.waitForTimeout(400)
  await pagina.mouse.up()
  await pagina.waitForTimeout(300)
  const m1 = (await hud()).match(/(\d+)\s*\/\s*(\d+)/)
  af(m0 && m1 && m1[1] === m0[1], 'el carcaj no se mueve', `${m0 ? m0[0] : '?'} → ${m1 ? m1[0] : '?'}`)
}

console.log(`\n[5] errores de página: ${errores.length}`)
if (errores.length) console.log('    ' + errores.slice(0, 6).join('\n    '))
af(errores.length === 0, 'sin errores de página')

// Y una mirada de verdad, que es lo que una aserción no comprueba (vuelta 48).
await pagina.waitForTimeout(1400)
await pagina.mouse.click(60, 560)
await pagina.waitForTimeout(400)
await pagina.mouse.move(500, 260)
await pagina.mouse.down()
await pagina.waitForTimeout(800)
await pagina.screenshot({ path: 'scratchpad/arco85-cargando.png' })
await pagina.mouse.up()
await pagina.waitForTimeout(120)
await pagina.screenshot({ path: 'scratchpad/arco85-volando.png' })
await navegador.close()
console.log(`\n${fallos.length === 0 ? 'TODO OK' : `${fallos.length} FALLOS: ${fallos.join('; ')}`}`)
process.exit(fallos.length === 0 ? 0 : 1)
