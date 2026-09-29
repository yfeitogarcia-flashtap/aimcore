/**
 * krakov93nav — el patrón del Krakov **en el motor**, con el ratón apretado.
 *
 * `krakov93` mide el dato; esto mide lo que le hace a la mira, que es otra cosa
 * y es la que importa: el índice del patrón lo lleva el motor, la suma la aplica
 * `lookControls.applyRecoil` y la cola la repite `recoilLoopFrom`. Un patrón
 * correcto en `config.js` con un contador mal llevado da un arma distinta.
 *
 * Y con su premisa delante: antes de medir se comprueba que el arma en la mano
 * **es** el Krakov y que el cargador baja de verdad — sin eso, «la mira no se
 * ha movido» y «no ha disparado» son la misma fila (vuelta 57).
 */
import { chromium } from 'playwright-core'
import { WEAPONS } from '../src/config.js'

let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const p = await nav.newPage({ viewport: { width: 1280, height: 720 } })
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))
await p.addInitScript(() => {
  localStorage.setItem('aimcore.settings.v1', JSON.stringify({
    weapon: 'krakov', scenario: 'largoYPuerta', targetType: 'hitbox', sessionDuration: 'endless',
  }))
})
await p.goto('http://localhost:5192/', { waitUntil: 'load' })
await p.waitForTimeout(1200)

// ------------------------------------------------------------ la ficha primero
console.log('\n[1] La armería dice lo que hace')
await p.getByRole('button', { name: /Jugar ahora/i }).click()
await p.waitForTimeout(300)
// Desde Cabina (vuelta 99) la armería es una sección del raíl.
await p.click('.cab-rail__item:has-text("Armería")')
await p.waitForTimeout(700)
const fichas = await p.locator('.armoury__card').allInnerTexts()
const ficha = fichas.find((f) => f.includes('Krakov')) ?? ''
afirmar(Boolean(ficha), 'el Krakov tiene ficha en la armería')
afirmar(/casco/i.test(ficha), `y dice que atraviesa el casco: ${(/[^\n]*casco[^\n]*/i.exec(ficha) ?? [''])[0].trim()}`)
afirmar(/3400/.test(ficha), 'y su precio, el del catálogo de la tienda')
const silueta = await p.evaluate(() => {
  const card = [...document.querySelectorAll('.armoury__card')].find((n) => n.textContent.includes('Krakov'))
  const svg = card?.querySelector('svg')
  const caja = svg?.getBoundingClientRect()
  return caja ? { w: caja.width, h: caja.height } : null
})
afirmar(silueta && silueta.w > 40 && silueta.h > 10,
  `y su silueta se ve: ${silueta ? `${silueta.w.toFixed(0)}×${silueta.h.toFixed(0)} px` : 'nada'}`)
await p.keyboard.press('Escape')
await p.waitForTimeout(400)

// ------------------------------------------------------------ jugar y disparar
/**
 * **Y se dispara en el motor del editor**, que es el camino que ya usa
 * `fang90ent`: el editor **hospeda el motor entero** (vuelta 76) y publica su
 * asa, así que desde aquí se puede leer la cámara que el retroceso mueve. La
 * página del juego no publica ninguna, y montar una para un banco sería abrir
 * una puerta al motor en el producto.
 */
console.log('\n[2] La ráfaga, con el ratón apretado')
await p.goto('http://127.0.0.1:5192/editor/', { waitUntil: 'load' })
await p.waitForTimeout(2600)
await p.evaluate(() => { window.vektorEditor.probar() })
await p.waitForTimeout(1500)
// La captura: en una esquina, que el centro tiene controles (vuelta 61).
await p.mouse.click(40, 700)
await p.waitForTimeout(1200)

const motor = () => p.evaluate(() => {
  const m = window.vektorEditor.motor
  if (!m) return null
  return {
    arma: m.weaponKey ?? m.slots?.[m.slot] ?? null,
    ammo: m.ammo,
    cargador: m.weapon?.magazine ?? null,
    pitch: (m.camera.rotation.x * 180) / Math.PI,
    yaw: (m.camera.rotation.y * 180) / Math.PI,
  }
})

const inicio = await motor()
if (!inicio) {
  console.log('  SALTADO: el editor no tiene motor montado')
} else {
  afirmar(inicio.arma === 'krakov', `en la mano está el Krakov: «${inicio.arma}»`)
  afirmar(inicio.cargador === 30, `y su cargador es de 30: ${inicio.cargador}`)

  const msPorBala = 60_000 / WEAPONS.krakov.rpm

  // --- tramo 1: cinco balas, que es el palo vertical de la T.
  const cero = await motor()
  await p.mouse.down()
  await p.waitForTimeout(msPorBala * 5 + 40)
  await p.mouse.up()
  await p.waitForTimeout(250)
  const cinco = await motor()
  const gastadas = cero.ammo - cinco.ammo
  afirmar(gastadas >= 4, `la ráfaga corta gasta balas de verdad: ${gastadas} (la premisa)`)
  const dp5 = cinco.pitch - cero.pitch
  const dy5 = cinco.yaw - cero.yaw
  afirmar(dp5 > 3 && Math.abs(dy5) < 1.0,
    `y sube en recto: pitch ${dp5.toFixed(2)}°, yaw ${dy5.toFixed(2)}°`)

  // --- tramo 2: una ráfaga larga, para ver el travesaño y la cola.
  await p.waitForTimeout(800) // Soltar el gatillo reinicia el patrón.
  const antesLarga = await motor()
  await p.mouse.down()
  await p.waitForTimeout(msPorBala * 16)
  const aMitad = await motor()
  await p.waitForTimeout(msPorBala * 8)
  const alFinal = await motor()
  await p.mouse.up()
  await p.waitForTimeout(300)

  const subida = aMitad.pitch - antesLarga.pitch
  afirmar(subida > 6, `una ráfaga larga sube casi el techo entero: ${subida.toFixed(2)}° de pitch`)
  afirmar(Math.abs(alFinal.pitch - aMitad.pitch) < 0.8,
    `y al final la vertical está quieta: ${(alFinal.pitch - aMitad.pitch).toFixed(3)}° en ocho balas más`)
  afirmar(Math.abs(alFinal.yaw - aMitad.yaw) > 0.05,
    `pero el yaw sigue moviéndose: ${(alFinal.yaw - aMitad.yaw).toFixed(3)}° — no se autocontrola (vuelta 61)`)
  console.log(`  (cargador: ${antesLarga.ammo} → ${alFinal.ammo} de ${inicio.cargador})`)
}

afirmar(errores.length === 0, `errores de página: ${errores.length}${errores.length ? ' — ' + errores[0] : ''}`)
await nav.close()
console.log(`\n${fallos === 0 ? 'TODO VERDE' : `${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
