/**
 * combo93 — la combinación de la armería funciona igual en los dos modos.
 *
 * Lo reportado: «en modo entrenamiento los atajos numéricos de la armería no
 * funcionan: hay que comprar todo con el ratón». Se mide **con teclado de
 * verdad contra la página**, no llamando a nada (la regla de la vuelta 48): un
 * atajo es justo lo que una persona tiene que poder hacer.
 *
 * Y con su premisa delante: se comprueba **antes** que el arma de partida no es
 * la que se va a pedir, porque si lo fuera la fila diría «funciona» con el atajo
 * roto (vuelta 46).
 */
import { chromium } from 'playwright-core'

const BASE = 'http://127.0.0.1:5192'
let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}

const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const pagina = await navegador.newPage({ viewport: { width: 1600, height: 1000 } })
const errores = []
pagina.on('pageerror', (e) => errores.push(e.message))

// Se parte de un estado conocido: la Rift en la principal y nada raro guardado.
await pagina.addInitScript(() => {
  localStorage.setItem('aimcore.settings.v1', JSON.stringify({ weapon: 'rift' }))
})
await pagina.goto(BASE, { waitUntil: 'load' })
await pagina.waitForTimeout(1200)

const ajuste = () => pagina.evaluate(() =>
  JSON.parse(localStorage.getItem('aimcore.settings.v1') ?? '{}'))

// ------------------------------------------------------- abrir la armería
console.log('\n[1] La armería se abre desde el menú y enseña la combinación')

// Paso 1 → paso 2 → Armería (vuelta 92: el menú va en tres pasos).
await pagina.getByRole('button', { name: /Jugar ahora/i }).click()
await pagina.waitForTimeout(300)
await pagina.getByRole('button', { name: /^Armería/i }).click()
await pagina.waitForTimeout(500)

const abierta = await pagina.evaluate(() => Boolean(document.querySelector('.panel--armoury')))
afirmar(abierta, 'el panel está montado')

const combos = await pagina.evaluate(() =>
  [...document.querySelectorAll('.armoury__combo')].map((n) => ({
    texto: n.textContent.trim(),
    ancho: n.getBoundingClientRect().width,
  })))
afirmar(combos.length > 0 && combos.every((c) => c.ancho > 0),
  `cada ficha enseña su combinación, y se ve: ${combos.length} fichas, p. ej. «${combos[0]?.texto}» a ${combos[0]?.ancho.toFixed(0)} px`)

// ------------------------------------------------------- teclear y equipar
console.log('\n[2] Teclear categoría + código equipa, sin ratón')

const teclear = async (a, b) => {
  await pagina.keyboard.press(`Digit${a}`)
  await pagina.keyboard.press(`Digit${b}`)
  await pagina.waitForTimeout(350)
}

// Premisa: la principal de partida NO es la que se va a pedir.
const antes = await ajuste()
afirmar(antes.weapon !== 'scout', `de partida lleva «${antes.weapon}», que no es la que se pide`)

// 5 1 es la Scout (Francotirador, código 1), del mismo catálogo que la tienda.
await teclear(5, 1)
const trasScout = await ajuste()
afirmar(trasScout.weapon === 'scout', `5 1 equipa la Scout: weapon = «${trasScout.weapon}»`)

const pestana = await pagina.evaluate(() =>
  document.querySelector('.armoury__ranura--activa .armoury__ranura-nombre')?.textContent)
afirmar(pestana === 'Primarias', `y abre su categoría para que se vea: «${pestana}»`)

const dicho = await pagina.evaluate(() => document.querySelector('.armoury__tecleado')?.textContent)
afirmar(/Scout/.test(dicho ?? ''), `y dice qué ha salido: «${dicho}»`)

// 8 1 es el arco, que desde la vuelta 92 vive en la ranura especial.
await teclear(8, 1)
const trasArco = await ajuste()
afirmar(trasArco.special === 'bow', `8 1 equipa el arco en su ranura: special = «${trasArco.special}»`)
afirmar(trasArco.weapon === 'scout', 'y no toca la principal: sigue la Scout')

// 7 1 es el Core, que es arrojadiza.
await teclear(7, 1)
const trasCore = await ajuste()
afirmar(trasCore.throwable === 'core', `7 1 equipa el Core: throwable = «${trasCore.throwable}»`)

// ------------------------------------------- lo que no se equipa, y lo que no existe
console.log('\n[3] Lo que este modo no puede dar, lo dice')

await teclear(6, 1) // Chaleco: equipo, no arma.
const chaleco = await pagina.evaluate(() => document.querySelector('.armoury__tecleado')?.textContent)
afirmar(/duelo/i.test(chaleco ?? ''), `el chaleco no se equipa aquí y lo dice: «${chaleco}»`)

await teclear(9, 9)
const nada = await pagina.evaluate(() => document.querySelector('.armoury__tecleado')?.textContent)
afirmar(/no hay nada/i.test(nada ?? ''), `y una combinación que no existe también: «${nada}»`)

const trasTodo = await ajuste()
afirmar(trasTodo.weapon === 'scout' && trasTodo.special === 'bow',
  'y ninguna de las dos cambia nada del equipo')

// -------------------------------------------------------- el dígito no se cuela
console.log('\n[4] El dígito no se cuela al motor')

/**
 * La premisa de este brazo: el motor mira las teclas de arma en un `keydown` de
 * `window` en burbujeo, y se registra antes que el panel. Con la armería abierta
 * el `1` de una combinación no puede además sacar la principal, así que se
 * comprueba **con una sesión en marcha**: se cierra el panel, se empieza, se
 * abre con B y se teclea.
 */
await pagina.keyboard.press('Escape')
await pagina.waitForTimeout(300)
const cerrada = await pagina.evaluate(() => !document.querySelector('.panel--armoury'))
afirmar(cerrada, 'Escape cierra el panel')

// El botón vuelve al paso 2; se entra a entrenamiento y se empieza.
await pagina.getByRole('button', { name: /^Entrenamiento/i }).click()
await pagina.waitForTimeout(400)
const empezar = await pagina.evaluate(() => {
  const b = [...document.querySelectorAll('button')]
    .find((n) => /^Ronda|^Deathmatch|^Práctica/i.test(n.textContent.trim()))
  if (!b) return null
  b.click()
  return b.textContent.trim().split('\n')[0].slice(0, 40)
})
if (!empezar) {
  console.log('  SALTADO: no encuentro con qué empezar')
} else {
  console.log(`  (empezando con «${empezar}»)`)
  await pagina.waitForTimeout(1500)
  /**
   * **La premisa: la pistola en la mano.** Si el arma empuñada ya fuera la
   * principal, «el 1 no la saca» saldría verde con el atajo roto — es el techo
   * sin suelo de la vuelta 57. Se saca con la tecla 2 **jugando**, o sea con el
   * panel cerrado, que es cuando esa tecla es del motor.
   */
  await pagina.keyboard.press('Digit2')
  await pagina.waitForTimeout(350)
  // La armería se abre con su bind (B de fábrica) y eso pausa (vuelta 42).
  await pagina.keyboard.press('KeyB')
  await pagina.waitForTimeout(500)
  const abiertaB = await pagina.evaluate(() => Boolean(document.querySelector('.panel--armoury')))
  afirmar(abiertaB, 'B abre la armería jugando')
  if (abiertaB) {
    const enPantalla = () => pagina.evaluate(() =>
      document.querySelector('.hud__weapon-name')?.textContent?.trim() ?? null)
    /**
     * **El 1 suelto no puede sacar la principal.** Es la premisa entera de
     * escuchar en captura: el motor tiene su propio `keydown` en `window` y se
     * registra antes. Se deja la combinación **a medias** a propósito —una sola
     * cifra— y se mira el HUD, que es quien dice lo que hay en la mano.
     */
    const antesDelUno = await enPantalla()
    await pagina.keyboard.press('Digit1')
    await pagina.waitForTimeout(350)
    const trasElUno = await enPantalla()
    afirmar(/Pulse|Reaper/.test(antesDelUno ?? ''),
      `y lo que hay en la mano es la pistola, no la principal: «${antesDelUno}»`)
    afirmar(trasElUno === antesDelUno,
      `un 1 a medias no saca la principal: «${antesDelUno}» → «${trasElUno}»`)

    // Y la combinación entera sí equipa: 1 3 es el Reaper (pistola, código 3).
    await pagina.keyboard.press('Digit3')
    await pagina.waitForTimeout(350)
    const conReaper = await ajuste()
    afirmar(conReaper.secondary === 'reaper',
      `1 3 equipa el Reaper: secondary = «${conReaper.secondary}»`)
  }
}

afirmar(errores.length === 0, `errores de página: ${errores.length}${errores.length ? ' — ' + errores[0] : ''}`)
await navegador.close()
console.log(`\n${fallos === 0 ? 'TODO VERDE' : `${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
