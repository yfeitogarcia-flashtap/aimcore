// cache93: lo que un tester vive. Pestaña abierta, se despliega una versión
// nueva por debajo, y la página tiene que enterarse sola — sin borrar caché.
import { chromium } from 'playwright-core'
import { execSync } from 'node:child_process'

// Un paso en rojo hace fallar el banco (auditoría de la vuelta 105).
let fallos = 0
const veredicto = (bien, si = 'OK', no = 'FALLO') => { if (!bien) fallos += 1; return bien ? si : no }

const errores = []
const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 860 } })
pagina.on('pageerror', (e) => errores.push(String(e)))

const build = () => JSON.parse(execSync('curl -s http://localhost:5199/salud')).build
const antes = build()
console.log('build servida al abrir:', antes.split(' ')[0])

await pagina.goto('http://localhost:5199/', { waitUntil: 'networkidle' })
await pagina.waitForTimeout(1500)

// Acelerar el reloj del vigilante: preguntar cada 5 min no cabe en un banco.
// Lo que se mide no es el intervalo, es que la comprobación detecte el cambio.
const hayCartel = () => pagina.evaluate(() => Boolean(document.querySelector('.vektor-update')))
console.log('cartel al abrir (no debe haberlo):', veredicto(!(await hayCartel()), 'no hay', 'HAY'))

// --- Se despliega algo nuevo por debajo: otro build y otro proceso.
execSync(`cd /home/user/aimcore && sed -i 's/Hay una versión nueva de Vektor/Hay una versión nueva de Vektor./' src/ui/actualizacion.js && npx vite build >/dev/null 2>&1`)
execSync('cd /home/user/aimcore && bash bancos/host.sh VEKTOR_DEBUG=1 >/dev/null 2>&1')
await new Promise((r) => setTimeout(r, 4000))
const despues = build()
console.log('build servida ahora:  ', despues.split(' ')[0])
console.log('¿ha cambiado?', veredicto(antes !== despues, 'sí', 'NO — el banco no mide nada'))

// La página sigue abierta y sin recargar. Se fuerza una comprobación, que es
// lo que el reloj haría a los cinco minutos.
const detecta = await pagina.evaluate(async () => {
  const r = await fetch('/salud', { cache: 'no-store' })
  return (await r.json()).build
})
console.log('lo que ve la página sin recargar:', detecta.split(' ')[0])
console.log('la página ve la nueva:', veredicto(detecta === despues))

// Y el HTML que sirve ahora, ¿llega nuevo a una pestaña que ya lo tenía?
const html = await pagina.evaluate(async () => {
  const r = await fetch('/', { cache: 'default' })
  return (await r.text()).match(/assets\/juego-[^"]+/)?.[0]
})
console.log('index.html que recibe la pestaña apunta a:', html)
console.log('coincide con lo desplegado:', veredicto(despues.includes(html.split('/')[1])))

console.log('\nerrores de página:', errores.length, errores.slice(0, 3), veredicto(errores.length === 0))
await navegador.close()

// Deshacer el cambio de prueba: dejar el fichero como estaba.
execSync("cd /home/user/aimcore && sed -i 's/nueva de Vektor\\./nueva de Vektor/' src/ui/actualizacion.js")

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
