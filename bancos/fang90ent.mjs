/**
 * El Fang en el **entrenamiento**, contra el producto: se lanza con el ratón,
 * se clava y se recoge andando por encima.
 *
 * Se mide en `/editor/` porque es la única página que hospeda el motor completo
 * y tiene asa para bancos (vuelta 74); el modo es el de siempre —no hay red, así
 * que quien planta y quien recoge es el motor y no el servidor—, que es
 * justamente el camino que el banco del duelo **no** recorre.
 */
import { chromium } from 'playwright-core'

// Un paso en rojo hace fallar el banco (auditoría de la vuelta 105).
let fallos = 0
const veredicto = (bien, si = 'OK', no = 'FALLO') => { if (!bien) fallos += 1; return bien ? si : no }

const BASE = 'http://localhost:5192'
const EJECUTABLE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const navegador = await chromium.launch({ executablePath: EJECUTABLE, args: ARGS })
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 720 } })
const page = await ctx.newPage()
const errores = []
page.on('pageerror', (e) => errores.push(e.message))
await page.addInitScript(() => {
  localStorage.setItem('aimcore.settings.v1', JSON.stringify({ throwable: 'fang', weapon: 'rift' }))
})
await page.goto(`${BASE}/editor/`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.vektorEditor !== undefined, { timeout: 20000 })
await page.click('#probar')
await page.waitForFunction(() => window.vektorEditor.motor !== null, { timeout: 20000 })
await esperar(1200)
// El clic que captura, en una esquina libre.
await page.mouse.click(1240, 690)
await esperar(800)

const leer = () => page.evaluate(() => {
  const m = window.vektorEditor.motor
  const c = m.clavadas
  const i = c.id.findIndex((v) => v !== 0)
  return {
    arma: m.weaponKey,
    ranura: m.slot,
    ammo: m.ammo,
    reserva: m.reservaDe('fang'),
    clavadas: c.vivas,
    donde: i >= 0 ? { x: +c.x[i].toFixed(2), y: +c.y[i].toFixed(2), z: +c.z[i].toFixed(2) } : null,
    yo: { x: +m.camera.position.x.toFixed(2), z: +m.camera.position.z.toFixed(2) },
    capturado: m.isLocked,
  }
})

console.log('al entrar:', JSON.stringify(await leer()))

// Sacar la granada con su tecla (G de fábrica) y lanzar a tope.
await page.keyboard.press('KeyG')
await esperar(400)
console.log('con la G:', JSON.stringify(await leer()))

// Mirar un poco abajo para que caiga cerca, y lanzar.
await page.evaluate(() => { window.vektorEditor.motor.camera.rotation.x = -0.45 })
await page.mouse.down()
await esperar(700)
await page.mouse.up()
await esperar(2000)
const traslanzar = await leer()
console.log('tras lanzar:', JSON.stringify(traslanzar))

// Andar hacia ella: el cuchillo cae en la dirección en que se mira.
let recogido = null
for (let i = 0; i < 40 && !recogido; i++) {
  await page.keyboard.down('KeyW')
  await esperar(150)
  await page.keyboard.up('KeyW')
  await esperar(60)
  const e = await leer()
  if (e.clavadas === 0) recogido = e
}
console.log('tras andar por encima:', JSON.stringify(recogido ?? await leer()))

const fin = recogido ?? await leer()
console.log('')
console.log(`clavadas: ${traslanzar.clavadas} → ${fin.clavadas}`, veredicto(traslanzar.clavadas >= 1 && fin.clavadas === 0))
console.log(`reserva : ${traslanzar.reserva} → ${fin.reserva}`, veredicto(fin.reserva === traslanzar.reserva + 1))
console.log('errores de página:', errores.length, errores.slice(0, 3), veredicto(errores.length === 0))
await navegador.close()

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
