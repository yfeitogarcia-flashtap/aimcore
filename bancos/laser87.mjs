/**
 * **laser87 — ¿el rival ve la curva de carga?**
 *
 * La pregunta es de equilibrio y no de código, así que se contesta **mirando
 * las dos pantallas a la vez** (la regla de la vuelta 60: un error de 180° en
 * la brújula sólo se veía comparando las dos). Dos navegadores en la misma
 * sala, cara a cara, uno carga y se cuentan los píxeles del láser en los dos.
 *
 * Y con su denominador (vuelta 46): **el banco comprueba primero que B ve a A**.
 * Sin esa premisa, «cero píxeles de láser» lo cumple igual de bien una pantalla
 * mirando a una pared.
 */
import { chromium } from 'playwright-core'

const VITE = 'http://localhost:5192'
const fallos = []
const af = (cond, texto, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${texto}${extra ? ` — ${extra}` : ''}`)
  if (!cond) fallos.push(texto)
}

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})

/** Un jugador por navegador (vuelta 50): contextos separados, no pestañas. */
async function abrir(arma, granada) {
  const ctx = await nav.newContext({ viewport: { width: 900, height: 560 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log('  ERR', String(e).slice(0, 120)))
  await p.addInitScript(([w, g]) => {
    localStorage.setItem('aimcore.settings.v1', JSON.stringify({ special: w, throwable: g }))
  }, [arma, granada])
  return p
}

// **La granada de prueba es la Blind**, y no por capricho: el Core es rojo y
// **el rojo también es un píxel cálido**, así que una Core tirada en el suelo
// contaminaba la cuenta del láser. La Blind es blanca y además no hace daño,
// que es lo que deja a los dos vivos para seguir midiendo.
const A = await abrir('bow', 'blind')
const B = await abrir('bow', 'blind')

console.log('== laser87 ==\n')

await A.goto(`${VITE}/duelo/`, { waitUntil: 'networkidle' })
await A.waitForTimeout(2500)
// El código lo escribe la propia página en `#codigo` (vuelta 47): leerlo de
// la barra no vale, porque `direccionDeLaBarra` conserva la consulta y la
// primera carga puede llegar antes del `replaceState`.
const codigo = await A.evaluate(() => document.getElementById('codigo')?.textContent?.trim())
af(Boolean(codigo) && /^[A-Z0-9]{4,8}$/.test(codigo), 'A crea una sala', codigo)
await B.goto(`${VITE}/duelo/${codigo}`, { waitUntil: 'networkidle' })
await B.waitForTimeout(2500)
// **Y que de verdad estén los dos en la misma sala**, que es la premisa de
// todo lo demás: sin esto «B no ve nada» lo cumple una pantalla en otra
// partida (vuelta 46).
const dentro = await B.evaluate(() => document.getElementById('codigo')?.textContent?.trim())
af(dentro === codigo, 'B entra en la misma sala', `${codigo} / ${dentro}`)
const dos = await A.evaluate(() => window.vektorNet.cliente.rondas?.ocupadas ?? window.vektorNet.cliente.ocupadas ?? null)
console.log(`       butacas ocupadas según A: ${dos}`)

// El clic que captura el ratón va **a una esquina** (vuelta 61: el centro es
// un `.control`).
for (const p of [A, B]) { await p.mouse.click(40, 520); await p.waitForTimeout(400) }
// **El arco vive en la quinta ranura desde la vuelta 92**: el ajuste se llama
// `special` y se saca con su tecla. Este banco lo escribía en `weapon` —la
// principal, que ya no lo admite— y desde entonces A cargaba… un rifle.
for (const p of [A, B]) { await p.keyboard.press('Digit5'); await p.waitForTimeout(500) }
const enMano = await A.evaluate(() => window.vektorNet.motor.weaponKey ?? window.vektorNet.motor._weaponKey)
af(enMano === 'bow', 'premisa: A lleva el arco en la mano', String(enMano))

/** Cara a cara con `MSG.COLOCAR`, que es para lo que existe `VEKTOR_DEBUG`. */
const colocar = (p, x, z) => p.evaluate(([x, z]) =>
  window.vektorNet.cliente.transporte.send(JSON.stringify({ t: 'c', x, z })), [x, z])
/**
 * **Cerca y en el mismo extremo, no uno en cada punta.** El Espejo está hecho
 * justo para que las dos salidas **no se vean** (vuelta 66), así que ponerlos
 * a ±7 del origen es ponerlos con el centro tapado por medio — y entonces «B
 * no ve el láser» lo cumpliría también «B no ve nada».
 */
/**
 * **Y dónde se ponen no se elige a ojo: se busca con el mismo test que decide
 * si algo se ve** (`hasLineOfSight`, vuelta 42). El Espejo está hecho para que
 * las dos salidas **no** se vean (vuelta 66), así que cualquier par puesto a
 * mano puede acabar con una caja por medio — y entonces «B no ve el láser» lo
 * cumpliría también «B no ve nada», que es el test vacío de la vuelta 46.
 */
const sitio = await A.evaluate(() => {
  const { verDesde, escenario, camara } = window.vektorNet
  const p = camara.position.clone()
  const q = camara.position.clone()
  // **Y con los dos pies en el suelo**: `COLOCAR` deja el x y el z, y el suelo
  // sube al jugador a lo que haya debajo — el primer par que salió se veía a
  // 1.4 y puso a A encima de una caja de 3.6, con la caja por medio.
  const llano = (x, z) => Math.abs(escenario.groundHeightAt(x, z)) < 0.01
  for (let x = -16; x <= 16; x += 2) {
    for (let z = -16; z <= 16; z += 2) {
      for (const d of [5, 7]) {
        if (!llano(x, z) || !llano(x, z - d)) continue
        p.set(x, 1.4, z); q.set(x, 1.4, z - d)
        if (verDesde(p, q, escenario.occluders)) return { x, z, d }
      }
    }
  }
  return null
})
af(Boolean(sitio), 'hay un sitio donde los dos se ven', JSON.stringify(sitio))
// A detrás y B delante, los dos sobre el eje Z: A mira a −Z y B a +Z.
await colocar(A, sitio.x, sitio.z)
await colocar(B, sitio.x, sitio.z - sitio.d)
await A.waitForTimeout(1500)

/** Los dos mirando al otro: A mira a −Z (yaw 0) y B a +Z (yaw π). */
await B.evaluate(() => window.vektorNet.motor.controls.lookAt(Math.PI))
await A.evaluate(() => window.vektorNet.motor.controls.lookAt(0))
await A.waitForTimeout(1200)

const { default: Jimp } = await import('jimp')
/**
 * Píxeles del **mundo** que son cálidos, que es de lo que está pintado el
 * láser (`COLORS.dispositivo`, a 0.45 sobre un mapa gris). Fuera el HUD:
 * arriba los contadores, abajo las dos esquinas.
 */
async function calidos(p, guardar = null) {
  const buf = await p.screenshot({ type: 'png' })
  const img = await Jimp.read(buf)
  if (guardar) await img.writeAsync(guardar)
  let n = 0
  img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
    if (y < 130 || y > 470 || (x < 230 && y > 400) || (x > 640 && y > 380)) return
    const r = this.bitmap.data[idx], g = this.bitmap.data[idx + 1], b = this.bitmap.data[idx + 2]
    if (r - b > 40 && r > 90 && g > b) n += 1
  })
  return n
}
/** Píxeles del avatar del rival: es la **premisa** de todo lo demás. */
async function rival(p) {
  const buf = await p.screenshot({ type: 'png' })
  const img = await Jimp.read(buf)
  let n = 0
  img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
    if (y < 130 || y > 470) return
    const r = this.bitmap.data[idx], g = this.bitmap.data[idx + 1], b = this.bitmap.data[idx + 2]
    // Azul de equipo (#2F6BF0) o magenta (#D94BD9): en los dos, el azul manda
    // sobre el verde con mucho margen, que es lo que el mapa gris no hace.
    if (b - g > 45 && b > 110) n += 1
  })
  return n
}

console.log('[1] la premisa: B ve a A de verdad')
await B.screenshot({ path: 'scratchpad/laser87-premisa-B.png' })
await A.screenshot({ path: 'scratchpad/laser87-premisa-A.png' })
console.log('       pose A/B: ' + JSON.stringify(await A.evaluate(() => {
  const c = window.vektorNet.camara, r = window.vektorNet.cliente.poseDelRival?.()
  return { yo: [+c.position.x.toFixed(1), +c.position.z.toFixed(1)], yaw: +c.rotation.y.toFixed(2), rival: r ? [+r.x.toFixed(1), +r.z.toFixed(1), r.vivo] : null }
})))
console.log('       pose B/A: ' + JSON.stringify(await B.evaluate(() => {
  const c = window.vektorNet.camara, r = window.vektorNet.cliente.poseDelRival?.()
  return { yo: [+c.position.x.toFixed(1), +c.position.z.toFixed(1)], yaw: +c.rotation.y.toFixed(2), rival: r ? [+r.x.toFixed(1), +r.z.toFixed(1), r.vivo] : null }
})))
console.log('       avatar del rival en B: ' + JSON.stringify(await B.evaluate(() => {
  const a = window.vektorNet.rival
  if (!a) return null
  const p = a.group?.position ?? a.position
  return { visible: a.group?.visible ?? a.visible, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) }
})))
const premisa = await rival(B)
af(premisa > 40, 'el cuerpo de A ocupa píxeles en la pantalla de B', `${premisa} px de equipo`)

console.log('\n[2] el Arco: A carga y se mira en las dos pantallas')
{
  const baseA = await calidos(A)
  const baseB = await calidos(B)
  await A.mouse.down()
  await A.waitForTimeout(1400)
  const conA = await calidos(A, 'scratchpad/laser87-A.png')
  const conB = await calidos(B, 'scratchpad/laser87-B.png')
  await A.mouse.up()
  await A.waitForTimeout(600)
  af(conA - baseA > 100, 'A SÍ ve su curva', `${baseA} → ${conA} px`)
  af(conB - baseB === 0, 'B NO ve absolutamente nada', `${baseB} → ${conB} px`)
}

console.log('\n[3] la granada, con los dos lanzamientos')
{
  await A.keyboard.press('KeyG')
  await A.waitForTimeout(600)
  /**
   * **Y se espera a que el arma esté lista antes de medir.** Tensar con el
   * cargador vacío no hace nada a propósito (vuelta 85), así que medir «cero
   * píxeles de láser» ahí sería medir la recarga y no el láser. Se espera en
   * tiempo de pared con margen, porque con WebGL por software el mundo corre a
   * una fracción del tiempo real (vuelta 75).
   */
  const lista = async () => {
    for (let i = 0; i < 40; i++) {
      const m = (await A.evaluate(() => document.body.innerText)).match(/(\d+)\s*\/\s*(\d+)/)
      if (m && Number(m[1]) > 0) return true
      await A.waitForTimeout(400)
    }
    return false
  }
  for (const [nombre, abajo, arriba] of [
    ['corto (clic derecho)', () => A.mouse.down({ button: 'right' }), () => A.mouse.up({ button: 'right' })],
    ['largo (clic izquierdo)', () => A.mouse.down(), () => A.mouse.up()],
  ]) {
    af(await lista(), `la granada está lista antes de medir el ${nombre}`)
    // La premisa, otra vez y antes de cada medida: B tiene que seguir viendo a A.
    af((await rival(B)) > 40, `B sigue viendo a A antes del ${nombre}`, `${await rival(B)} px`)
    const baseA = await calidos(A)
    const baseB = await calidos(B)
    await abajo()
    await A.waitForTimeout(1200)
    const conA = await calidos(A, `scratchpad/laser87-gran-${nombre.split(' ')[0]}-A.png`)
    const conB = await calidos(B, `scratchpad/laser87-gran-${nombre.split(' ')[0]}-B.png`)
    await arriba()
    await A.waitForTimeout(1200)
    af(conA - baseA > 10, `A sí ve la curva del ${nombre}`, `${baseA} → ${conA} px`)
    af(conB - baseB === 0, `B no ve nada del ${nombre}`, `${baseB} → ${conB} px`)
  }
}

console.log('\n[4] y la premisa sigue en pie al final')
const alFinal = await rival(B)
af(alFinal > 40, 'B sigue viendo a A al acabar', `${alFinal} px`)

await nav.close()
console.log(`\n${fallos.length === 0 ? 'TODO OK' : `${fallos.length} FALLOS: ${fallos.join('; ')}`}`)
process.exit(fallos.length === 0 ? 0 : 1)
