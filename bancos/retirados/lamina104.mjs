import { chromium } from 'playwright-core'
import { resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
const armas = ['pulse', 'volt', 'scout', 'titan']
const enc = [['16x9', '16:9'], ['21x9', '21:9'], ['4x3', '4:3']]
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
for (const et of ['antes', 'despues']) {
  const celdas = armas.map((a) => `<tr><th>${a[0].toUpperCase() + a.slice(1)}</th>` + enc.map(([e]) =>
    `<td><img src="file://${resolve('scratchpad/vista104-' + et + '-' + a + '-' + e + '.png')}"></td>`).join('') + '</tr>').join('')
  const html = `<html><body style="margin:0;background:#0a0a0a;color:#e8e8e8;font:600 18px sans-serif">
  <div style="padding:10px 14px;font-size:22px">Arma en pantalla — ${et === 'antes' ? 'ANTES (vuelta 103)' : 'DESPUÉS (vuelta 104)'}</div>
  <table style="border-spacing:8px"><tr><th></th>${enc.map(([, n]) => `<th>${n}</th>`).join('')}</tr>${celdas}</table>
  <style>img{height:230px;display:block} th{padding:4px 8px}</style></body></html>`
  const p = await nav.newPage({ viewport: { width: 1600, height: 1100 } })
  const f = resolve(`scratchpad/lamina104-${et}.html`)
  writeFileSync(f, html)
  await p.goto('file://' + f); await p.waitForTimeout(800)
  await p.screenshot({ path: `scratchpad/lamina104-${et}.png`, fullPage: true })
  await p.close()
}
await nav.close()
