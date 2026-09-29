// Junta capturas en un mosaico para mirarlas de una vez: node mosaico105.mjs salida.png a.png b.png ...
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const [salida, ...fotos] = process.argv.slice(2)
const cols = Number(process.env.COLS || 3), ancho = Number(process.env.ANCHO || 420)
const html = `<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},${ancho}px);gap:4px;font:12px sans-serif;color:#ddd">${fotos.map((f) => `<div><img style="width:${ancho}px;display:block" src="data:image/png;base64,${readFileSync(f).toString('base64')}"><div>${f.split('/').pop()}</div></div>`).join('')}</body>`
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const p = await nav.newPage({ viewport: { width: cols * (ancho + 4), height: 400 } })
await p.setContent(html); await p.waitForTimeout(300)
await p.screenshot({ path: salida, fullPage: true })
await nav.close()
