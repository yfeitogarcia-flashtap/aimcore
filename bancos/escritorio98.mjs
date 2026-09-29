/**
 * escritorio98 — **¿se entera la página de que está en la app, y le llega F11?**
 *
 * El bug 1 de la vuelta 98: en la app de verdad F11 no hacía nada y la fila de
 * pantalla completa no salía. La 97 colgaba las dos cosas de **una** señal (el
 * agente de usuario); ahora son dos, y F11 es de la ventana.
 *
 *  [0] Lo que está escrito a los dos lados de la línea Rust/JS coincide.
 *  [1] **Con un agente de usuario de navegador normal** y sólo la marca que
 *      inyecta la ventana —el script exacto que genera `main.rs`—, la página se
 *      sabe en la app: Ctrl, la fila y la versión en opciones.
 *  [2] El aviso que manda la ventana al pulsar F11 —el `eval` exacto de
 *      `main.rs`— cambia el ajuste **sin devolverle la orden a la ventana**.
 *  [3] El denominador: sin marca y sin agente de usuario, nada de eso.
 *
 * Contra el servidor de desarrollo (`bash bancos/dev.sh`, puerto 5192).
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { ESCRITORIO } from '../src/config.js'

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}
const leer = (r) => readFileSync(new URL(r, import.meta.url), 'utf8')

console.log('[0] Los dos lados de la línea')
const rust = leer('../escritorio/src-tauri/src/main.rs')
const conf = JSON.parse(leer('../escritorio/src-tauri/tauri.conf.json'))
const cargo = leer('../escritorio/src-tauri/Cargo.toml')
const ventana = conf.app.windows[0]
afirmar(rust.includes(`'${ESCRITORIO.marcaGlobal}'`), `main.rs inyecta «${ESCRITORIO.marcaGlobal}»`)
afirmar(rust.includes(`"${ESCRITORIO.avisoPantallaCompleta}"`), `main.rs avisa con «${ESCRITORIO.avisoPantallaCompleta}»`)
afirmar(ventana.label === 'main' && ventana.create === false,
  'la ventana se declara en tauri.conf.json y se construye en Rust (create: false)')
const verCargo = cargo.match(/^version = "([^"]+)"/m)?.[1]
afirmar(verCargo === conf.version, `Cargo.toml (${verCargo}) y tauri.conf.json (${conf.version}) dicen la misma versión`)
const [ma, mi] = conf.version.split('.')
afirmar(ventana.userAgent.endsWith(`${ESCRITORIO.marcaUA}/${ma}.${mi}`), `y el agente de usuario también (${ventana.userAgent.split(' ').pop()})`)
afirmar(/tauri-plugin-global-shortcut/.test(cargo), 'F11 va por el atajo de la ventana')

// Los dos scripts, sacados de main.rs tal cual y rellenados como lo hace format!.
const plantillaMarca = rust.match(/format!\(\s*"(Object\.defineProperty[^"]*)"/)?.[1]
const plantillaAviso = rust.match(/format!\(\s*"(window\.dispatchEvent[^"]*)"/)?.[1]
afirmar(Boolean(plantillaMarca && plantillaAviso), 'los dos scripts se encuentran en main.rs')
const rellenar = (t, vars) => t.replace(/\{(\w+)(:\?)?\}/g, (_, n, dbg) => (dbg ? JSON.stringify(vars[n]) : String(vars[n])))
  .replaceAll('{{', '{').replaceAll('}}', '}')
const scriptMarca = rellenar(plantillaMarca.replace(/\\"/g, '"'), { version: conf.version })
const aviso = (activa) => rellenar(plantillaAviso, { AVISO_A_LA_PAGINA: ESCRITORIO.avisoPantallaCompleta, activa })
console.log(`       ${scriptMarca}`)
console.log(`       ${aviso(true)}`)

const navegador = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})

async function abrir(conMarca) {
  const ctx = await navegador.newContext({ viewport: { width: 1600, height: 900 } })
  const p = await ctx.newPage()
  const errores = []
  p.on('pageerror', (e) => errores.push(String(e)))
  await p.addInitScript(() => {
    window.__llamadas = []
    window.__TAURI_INTERNALS__ = { invoke: (orden, args) => { window.__llamadas.push({ orden, args }); return Promise.resolve() } }
  })
  if (conMarca) await p.addInitScript({ content: scriptMarca })
  await p.goto('http://127.0.0.1:5192/', { waitUntil: 'load' })
  await p.waitForTimeout(1200)
  return { ctx, p, errores }
}

const estado = (p) => p.evaluate(async () => {
  const ajustes = await import('/src/settings.js')
  return { valor: ajustes.getSettings().pantallaCompleta, llamadas: window.__llamadas.length }
})

console.log('\n[1] Sólo la marca, con un agente de usuario de navegador')
{
  const { ctx, p, errores } = await abrir(true)
  const ua = await p.evaluate(() => navigator.userAgent)
  afirmar(!ua.includes(ESCRITORIO.marcaUA), `premisa: el agente de usuario no lleva la marca`)
  await p.click('text=Jugar ahora')
  await p.waitForTimeout(400)
  const agachar = await p.evaluate(() => [...document.querySelectorAll('.teclas__par')]
    .map((li) => li.textContent).find((t) => /agach/i.test(t)) ?? '')
  afirmar(/CTRL IZQ/.test(agachar), `agacharse sale en «${agachar.trim()}»`)
  await p.click('text=Opciones')
  await p.waitForTimeout(600)
  const fila = await p.evaluate(() =>
    [...document.querySelectorAll('.field__label')].some((s) => /pantalla completa/i.test(s.textContent)))
  afirmar(fila, 'la fila de pantalla completa sale')
  const pie = await p.evaluate(() => [...document.querySelectorAll('.panel__hint')].map((x) => x.textContent).join(' | '))
  afirmar(pie.includes(`Vektor de escritorio ${conf.version}`), `opciones dice «${pie.match(/Vektor de escritorio [^.]+\.\d+/)?.[0] ?? pie}»`)

  console.log('\n[2] El aviso de F11 que manda la ventana')
  const antes = await estado(p)
  afirmar(antes.valor === false, `premisa: el ajuste parte de ${antes.valor}`)
  await p.evaluate(aviso(true))
  await p.waitForTimeout(100)
  const tras = await estado(p)
  afirmar(tras.valor === true, `el ajuste pasa a ${tras.valor}`)
  afirmar(tras.llamadas === antes.llamadas, `y no se le devuelve la orden a la ventana (${antes.llamadas} → ${tras.llamadas} llamadas)`)
  const casilla = await p.evaluate(() => {
    const f = [...document.querySelectorAll('.field')].find((x) => /pantalla completa/i.test(x.textContent))
    const b = f?.querySelector('.toggle'); return b ? b.getAttribute('aria-pressed') === 'true' : null
  })
  afirmar(casilla === true, `la casilla del panel abierto lo enseña (${casilla})`)
  await p.evaluate(aviso(false))
  await p.waitForTimeout(100)
  const vuelta = await estado(p)
  afirmar(vuelta.valor === false && vuelta.llamadas === antes.llamadas, `y de vuelta: ${vuelta.valor}, ${vuelta.llamadas} llamadas`)
  // Denominador del «no rebota»: cambiarlo desde la página **sí** llama.
  await p.evaluate(async () => (await import('/src/settings.js')).updateSettings({ pantallaCompleta: true }))
  await p.waitForTimeout(100)
  const desdePagina = await p.evaluate(() => window.__llamadas.at(-1))
  afirmar(desdePagina?.orden === ESCRITORIO.ordenPantallaCompleta && desdePagina?.args?.activa === true,
    `denominador: desde la página sí llega la orden (${JSON.stringify(desdePagina)})`)
  afirmar(errores.length === 0, `sin errores de página (${errores.length})`)
  await ctx.close()
}

console.log('\n[3] Sin marca y sin agente de usuario')
{
  const { ctx, p, errores } = await abrir(false)
  await p.click('text=Jugar ahora')
  await p.waitForTimeout(300)
  await p.click('text=Opciones')
  await p.waitForTimeout(600)
  const fila = await p.evaluate(() =>
    [...document.querySelectorAll('.field__label')].some((s) => /pantalla completa/i.test(s.textContent)))
  afirmar(!fila, 'la fila no sale')
  const pie = await p.evaluate(() => [...document.querySelectorAll('.panel__hint')].map((x) => x.textContent).join(' | '))
  afirmar(pie.includes('este navegador') && !pie.includes('escritorio'), 'y el pie dice «este navegador»')
  await p.evaluate(aviso(true))
  await p.waitForTimeout(100)
  const e = await estado(p)
  afirmar(e.valor === false && e.llamadas === 0, `el aviso no toca nada (${e.valor}, ${e.llamadas} llamadas)`)
  afirmar(errores.length === 0, `sin errores de página (${errores.length})`)
  await ctx.close()
}

await navegador.close()
console.log(`\n${fallos === 0 ? 'TODO BIEN' : `${fallos} FALLOS`}`)
process.exit(fallos ? 1 : 0)
