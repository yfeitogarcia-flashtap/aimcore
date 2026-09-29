/**
 * subir93 — que subir un mapa al juego no dependa de cómo cierres Alchemist.
 *
 * Mide tres cosas, en este orden, porque cada una es la premisa de la
 * siguiente:
 *
 *  [1] El estado que publica el servidor es el de git de verdad: un mapa nuevo
 *      en `src/maps` aparece, y borrado desaparece. Sin esto el botón podría
 *      estar diciendo cualquier cosa.
 *  [2] La página lo enseña **sin abrir el panel** —el aviso de la barra— y lo
 *      lista dentro, que es lo que la vuelta 91 no tenía de ninguna forma.
 *  [3] El camino de subir de verdad —add, commit, pull, push— funciona. Se mide
 *      contra un **clon de pega con su propio remoto**, nunca contra este
 *      repositorio: un banco no empuja los mapas de nadie.
 *
 * Y lo que la vuelta 91 hacía mal no se puede medir con un navegador, porque
 * era del `.bat`: queda leído y escrito en `docs/decisions.md` §93.
 */
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RAIZ = '/home/user/aimcore'
const BASE = 'http://127.0.0.1:5192'
const CEBO = join(RAIZ, 'src/maps/banco93-cebo.js')

const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf-8' }).trim()

let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}

const pedir = async (ruta, opciones) => {
  const r = await fetch(BASE + ruta, opciones)
  return { ok: r.ok, cuerpo: await r.json() }
}

// ---------------------------------------------------------------- [1] estado
console.log('\n[1] El estado que publica el servidor es el de git')

/**
 * **Se mide una diferencia, no un absoluto.** Esta carpeta lleva código además
 * de mapas —`formato.js`, `tubo.js`, `escalera.js`— así que exigir que esté
 * limpia es un banco que se salta en cuanto alguien toca el formato, y saltarse
 * un brazo es lo que la vuelta 57 dice que no vale. Lo que se afirma es que el
 * mapa que pone este banco **aparece** y **desaparece**: el resto de la lista es
 * el denominador y se imprime al lado (vuelta 46).
 */
const { cuerpo: antes } = await pedir('/__editor/mapas-sin-subir')
console.log(`    de partida: ${antes.mapas.length} mapa(s) y ${antes.otros} otro(s) — ${JSON.stringify(antes.mapas)}`)
afirmar(typeof antes.rama === 'string' && antes.rama.length > 0, `dice la rama: ${antes.rama}`)
afirmar(!antes.mapas.includes('banco93-cebo.js'), 'y el cebo de este banco no está todavía')
afirmar(!antes.mapas.includes('formato.js') && !antes.mapas.includes('escalera.js'),
  'y el código de esta carpeta no cuenta como mapa: sólo lo que declara su clave')

writeFileSync(CEBO, 'export default { clave: "banco93-cebo" }\n')
let { cuerpo: conCebo } = await pedir('/__editor/mapas-sin-subir')
afirmar(conCebo.mapas.includes('banco93-cebo.js'),
  `un mapa nuevo aparece: ${JSON.stringify(conCebo.mapas)}`)
afirmar(conCebo.mapas.length === antes.mapas.length + 1,
  `y sube exactamente uno la cuenta: ${antes.mapas.length} → ${conCebo.mapas.length}`)

// ---------------------------------------------------------------- [2] página
console.log('\n[2] La página lo dice en la barra y lo lista en Archivo')

const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const pagina = await navegador.newPage()
const errores = []
pagina.on('pageerror', (e) => errores.push(e.message))
await pagina.goto(`${BASE}/editor/`, { waitUntil: 'load' })
await pagina.waitForTimeout(2500)

const barra = await pagina.evaluate(() => {
  const n = document.getElementById('sin-subir')
  const caja = n.getBoundingClientRect()
  return { texto: n.textContent, oculto: n.hidden, alto: caja.height, ancho: caja.width }
})
afirmar(!barra.oculto && barra.ancho > 0 && barra.alto > 0,
  `el aviso de la barra se ve: ${barra.ancho.toFixed(0)}×${barra.alto.toFixed(0)} px`)
// Un mapa nuevo cambia también el registro, y el registro no es un mapa: el
// número de la barra es el de mapas, que es el que alguien mira.
afirmar(new RegExp(`^${conCebo.mapas.length} mapa`).test(barra.texto)
  || /^1 mapa sin subir/.test(barra.texto), `y dice cuántos: «${barra.texto}»`)
const { cuerpo: yaRegenerado } = await pedir('/__editor/mapas-sin-subir')
afirmar(yaRegenerado.otros >= 1,
  `y el registro se cuenta aparte: ${yaRegenerado.mapas.length} mapa(s) + ${yaRegenerado.otros} otro(s)`)

// La hoja de Archivo, que es donde vive el botón.
await pagina.evaluate(() => {
  document.querySelector('#rail [data-pestana="archivo"]').click()
})
await pagina.waitForTimeout(400)
const hoja = await pagina.evaluate(() => {
  const boton = document.getElementById('subir')
  const caja = boton.getBoundingClientRect()
  return {
    pendientes: [...document.querySelectorAll('#pendientes li')].map((l) => l.textContent),
    nada: document.getElementById('nada-pendiente').hidden,
    activo: !boton.disabled,
    ancho: caja.width,
    alto: caja.height,
  }
})
afirmar(hoja.pendientes.includes('banco93-cebo.js'),
  `lo lista: ${JSON.stringify(hoja.pendientes)}`)
afirmar(hoja.nada, 'y esconde el «nada que subir»')
afirmar(hoja.activo && hoja.ancho > 40 && hoja.alto > 10,
  `el botón está pulsable: ${hoja.ancho.toFixed(0)}×${hoja.alto.toFixed(0)} px`)

rmSync(CEBO)
await pagina.evaluate(() => fetch('/__editor/mapas-sin-subir'))
await pagina.waitForTimeout(600)
// Repintar es volver a leer el disco: se comprueba recargando, que es lo que
// hace guardar de verdad (vuelta 75).
await pagina.reload({ waitUntil: 'load' })
await pagina.waitForTimeout(2500)
const tras = await pagina.evaluate(() => ({
  oculto: document.getElementById('sin-subir').hidden,
  activo: !document.getElementById('subir').disabled,
}))
const { cuerpo: sinCebo } = await pedir('/__editor/mapas-sin-subir')
afirmar(!sinCebo.mapas.includes('banco93-cebo.js'),
  `quitado el fichero, el mapa desaparece de la lista: ${JSON.stringify(sinCebo.mapas)}`)
afirmar(tras.oculto === (sinCebo.mapas.length === 0 && sinCebo.otros === 0),
  `y el aviso de la barra dice lo que hay: ${tras.oculto ? 'oculto' : 'puesto'} con ${sinCebo.mapas.length} mapa(s)`)

afirmar(errores.length === 0, `errores de página: ${errores.length}${errores.length ? ' — ' + errores[0] : ''}`)
await navegador.close()

// ---------------------------------------------------------------- [3] empujar
console.log('\n[3] El camino de subir de verdad, contra un clon de pega')

const patio = mkdtempSync(join(tmpdir(), 'subir93-'))
const remoto = join(patio, 'remoto.git')
const clon = join(patio, 'clon')
sh('git', ['init', '--bare', '-b', 'trabajo', remoto], patio)
sh('git', ['init', '-b', 'trabajo', clon], patio)
sh('git', ['config', 'user.email', 'banco@vektor'], clon)
sh('git', ['config', 'user.name', 'banco'], clon)
sh('mkdir', ['-p', join(clon, 'src/maps')], clon)
writeFileSync(join(clon, 'src/maps/uno.js'), 'export default { clave: "uno" }\n')
writeFileSync(join(clon, 'otro.txt'), 'algo a medias\n')
sh('git', ['add', '--', 'src/maps'], clon)
sh('git', ['commit', '-q', '-m', 'base'], clon)
sh('git', ['remote', 'add', 'origin', remoto], clon)
sh('git', ['push', '-q', '-u', 'origin', 'trabajo'], clon)

// El mismo código que el servidor: se importa, no se copia.
const { subirMapasEn, estadoDeMapasEn } = await import(`${RAIZ}/vite.config.js`)

writeFileSync(join(clon, 'src/maps/dos.js'), 'export default { clave: "dos" }\n')
writeFileSync(join(clon, 'otro.txt'), 'sigue a medias\n')

const estado = estadoDeMapasEn(clon)
afirmar(estado.mapas.length === 1 && estado.mapas[0] === 'dos.js',
  `sólo mira src/maps: ${JSON.stringify(estado.mapas)}`)

const resultado = subirMapasEn(clon)
afirmar(resultado.subidos.includes('dos.js'), `sube el mapa: ${JSON.stringify(resultado.subidos)}`)

const enElRemoto = sh('git', ['ls-tree', '-r', '--name-only', 'trabajo'], remoto).split('\n')
afirmar(enElRemoto.includes('src/maps/dos.js'), 'el mapa llega al remoto')
afirmar(!enElRemoto.includes('otro.txt'), 'y lo que no es un mapa se queda aquí')
afirmar(sh('git', ['status', '--porcelain', '--', 'otro.txt'], clon) !== '',
  'sin perderlo: sigue cambiado en el disco')
afirmar(sh('git', ['status', '--porcelain', '--', 'src/maps'], clon) === '',
  'y src/maps queda limpio tras subir')

// Un nombre con una comilla es un nombre, no un comando.
const travieso = 'ma"pa\'; touch $HOME-subir93-colado.js'
writeFileSync(join(clon, 'src/maps', travieso), 'export default { clave: "travieso" }\n')
const r2 = subirMapasEn(clon)
afirmar(r2.subidos.length === 1, `un nombre con comillas se sube igual: ${JSON.stringify(r2.subidos)}`)
let colado = true
try { sh('sh', ['-c', 'ls ~-subir93-colado.js'], patio) } catch { colado = false }
afirmar(!colado, 'y no ejecuta nada: no hay shell por medio')

rmSync(patio, { recursive: true, force: true })

console.log(`\n${fallos === 0 ? 'TODO VERDE' : `${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
