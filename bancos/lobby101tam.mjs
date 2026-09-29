// lobby101tam — en el lobby, LISTO, Lanzar y Copiar se ven y se pinchan a cuatro tamaños.
import { chromium } from 'playwright-core'
let fallos = 0
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}`); if (!c) fallos += 1 }
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 860], [700, 460]]) {
  const p = await nav.newPage({ viewport: { width: w, height: h } })
  await p.goto('http://localhost:5192/duelo/', { waitUntil: 'networkidle' })
  await p.waitForSelector('#listo')
  const r = await p.evaluate(() => ['listo', 'lanzar', 'copiar'].map((id) => {
    const el = document.getElementById(id)
    el.scrollIntoView({ block: 'nearest' })
    const b = el.getBoundingClientRect()
    const x = b.x + b.width / 2, y = b.y + b.height / 2
    const dentro = y >= 0 && y <= innerHeight && x >= 0 && x <= innerWidth
    const pincha = dentro && (document.elementFromPoint(x, y) === el || el.contains(document.elementFromPoint(x, y)))
    return { id, dentro, pincha }
  }))
  const scroll = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  ok(r.every((x) => x.pincha) && !scroll, `${w}×${h}: ${r.map((x) => `${x.id} ${x.pincha ? 'sí' : 'NO'}`).join(' · ')}${scroll ? ' · SCROLL HORIZONTAL' : ''}`)
  if (w === 700) await p.screenshot({ path: 'scratchpad/lobby101-700.png' })
  await p.close()
}
await nav.close()
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
