/**
 * menu94 — el retrabajo de los menús, medido.
 *
 * Cinco cosas, y las cinco salen de mirar una captura antes de tocar nada
 * (vuelta 89: «está en pantalla» y «se ve» son dos medidas distintas):
 *
 *  1. Los dos modos de la pantalla de inicio se dibujan **igual**. Con el
 *     relleno de `:focus-visible`, el que traía `autoFocus` salía macizo y el
 *     otro hueco: un menú que designa un ganador que nadie decidió.
 *  2. Los dos botones de empezar de Entrenamiento **siguen dentro del panel con
 *     la lista hasta abajo**, que es donde acaba quien configura.
 *  3. Una fila inerte **no admite entrada**, no sólo lo dice en gris.
 *  4. Con los ajustes de fábrica, **ningún «por defecto» está encendido**.
 *  5. Y ningún control del menú es inalcanzable, a cuatro tamaños (`menu92`).
 */
import { chromium } from 'playwright-core'

const URL = 'http://127.0.0.1:5192/'
const TAMANOS = [
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 860 },
]

let fallos = 0
const afirmar = (bien, que, detalle = '') => {
  console.log(`  ${bien ? 'OK  ' : 'FALLO'} ${que}${detalle ? ` — ${detalle}` : ''}`)
  if (!bien) fallos++
}

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const errores = []

try {
  for (const viewport of TAMANOS) {
    const p = await nav.newPage({ viewport })
    p.on('pageerror', (e) => errores.push(`${viewport.width}x${viewport.height}: ${e}`))
    await p.goto(URL, { waitUntil: 'networkidle' })
    await p.waitForTimeout(1200)
    console.log(`\n== ${viewport.width}x${viewport.height} ==`)

    await p.click('text=Jugar ahora')
    await p.waitForTimeout(350)

    // 1. Los dos modos, iguales aunque uno tenga el foco.
    const modos = await p.evaluate(() => {
      const bs = [...document.querySelectorAll('.panel__actions--duo .button--grande')]
      const enfocado = document.activeElement
      return bs.map((b) => {
        const e = getComputedStyle(b)
        const r = b.getBoundingClientRect()
        return {
          texto: b.textContent.slice(0, 14),
          fondo: e.backgroundColor,
          color: e.color,
          w: Math.round(r.width),
          h: Math.round(r.height),
          foco: b === enfocado,
        }
      })
    })
    const [a, b] = modos
    afirmar(a && b && a.fondo === b.fondo && a.color === b.color,
      'los dos modos se dibujan con el mismo fondo y el mismo color',
      `${a?.fondo}/${a?.color} vs ${b?.fondo}/${b?.color} · foco en «${modos.find((m) => m.foco)?.texto.trim()}»`)
    afirmar(a && b && a.w === b.w && a.h === b.h,
      'y miden lo mismo, píxel a píxel', `${a?.w}x${a?.h} vs ${b?.w}x${b?.h}`)

    // 5. Ningún control inalcanzable, que es la regla de `menu92`.
    const tapados = await p.evaluate(() => {
      const fuera = []
      for (const c of document.querySelectorAll('.panel button, .panel a')) {
        const r = c.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) { fuera.push(`${c.textContent.trim().slice(0,20)}: 0x0`); continue }
        const x = r.left + r.width / 2
        const y = r.top + r.height / 2
        if (y < 0 || y > innerHeight) { fuera.push(`${c.textContent.trim().slice(0,20)}: fuera de la ventana`); continue }
        const encima = document.elementFromPoint(x, y)
        if (!c.contains(encima) && encima !== c) fuera.push(`${c.textContent.trim().slice(0,20)}: tapado`)
      }
      return fuera
    })
    afirmar(tapados.length === 0, 'ningún control del paso 2 es inalcanzable', tapados.join(' | '))

    // 2, 3 y 4, en la pantalla de entrenamiento.
    await p.click('text=Entrenamiento')
    await p.waitForTimeout(500)
    await p.evaluate(() => { document.querySelector('.panel--training').scrollTop = 99999 })
    await p.waitForTimeout(250)

    const abajo = await p.evaluate(() => {
      const panel = document.querySelector('.panel--training')
      const pr = panel.getBoundingClientRect()
      const bs = [...panel.querySelectorAll('.training__modos .button')]
      return {
        scroll: Math.round(panel.scrollTop),
        contenido: panel.scrollHeight,
        alto: panel.clientHeight,
        modos: bs.map((x) => {
          const r = x.getBoundingClientRect()
          const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return { dentro: r.top >= pr.top - 1 && r.bottom <= pr.bottom + 1, pinchable: x.contains(encima) }
        }),
      }
    })
    afirmar(abajo.contenido > abajo.alto,
      'la lista de ajustes no cabe entera, que es la premisa de esta medida',
      `${abajo.contenido} px de contenido en ${abajo.alto}`)
    afirmar(abajo.modos.length === 2 && abajo.modos.every((m) => m.dentro && m.pinchable),
      'con la lista hasta abajo, los dos botones de empezar siguen a la vista y se pueden pinchar',
      JSON.stringify(abajo.modos))

    // 3. Una fila inerte no admite entrada. Con «Largo y Puerta» (escenario con
    //    cobertura) la dificultad está apagada porque la diana es la clásica.
    const inerte = await p.evaluate(() => {
      const filas = [...document.querySelectorAll('.field--inerte')]
      const botones = filas.flatMap((f) => [...f.querySelectorAll('button, input')])
      return {
        filas: filas.length,
        etiquetas: filas.map((f) => f.querySelector('.field__label')?.textContent),
        todosApagados: botones.length > 0 && botones.every((x) => x.disabled),
      }
    })
    afirmar(inerte.filas > 0, 'hay filas apagadas con la configuración de fábrica',
      inerte.etiquetas.join(' · '))
    afirmar(inerte.todosApagados,
      'y sus controles no admiten entrada, no sólo lo dicen en gris')

    // 4. Con los valores de fábrica, ningún «por defecto» encendido.
    const defectos = await p.evaluate(() => {
      const bs = [...document.querySelectorAll('.panel--training .field__default')]
      return { total: bs.length, encendidos: bs.filter((x) => !x.disabled).length }
    })
    afirmar(defectos.encendidos === 0,
      'ningún «por defecto» encendido con los ajustes de fábrica',
      `${defectos.encendidos} de ${defectos.total}`)

    await p.close()
  }

  console.log('')
  afirmar(errores.length === 0, 'ni un error de página en las cuatro pasadas', errores.slice(0, 3).join(' | '))
} finally {
  await nav.close()
}

console.log(`\n${fallos === 0 ? 'VERDE' : `ROJO (${fallos})`}\n`)
process.exit(fallos === 0 ? 0 : 1)
