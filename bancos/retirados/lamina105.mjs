// La lámina de la vuelta 105: cada tipo junto a su referencia de Counter-Strike
// (recortada del collage que mandó Yago) y la captura de Vektor a 16:9, con la
// mano de apoyo al lado en los que la llevan.
import { chromium } from 'playwright-core'
import { readFileSync, existsSync } from 'node:fs'
const COLLAGE = process.env.COLLAGE
const b64 = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`
// Recortes del collage (752×448): x, y, ancho, alto.
const CS = { pistola: [50, 31, 238, 129], escopeta: [297, 13, 239, 147], ak: [545, 2, 201, 158], m4: [10, 185, 240, 116], awp: [259, 170, 239, 132], cuchillo: [507, 184, 240, 100] }
const FILAS = [
  ['Pistola', 'pistola', ['pulse', 'reaper']],
  ['Rifle (AK)', 'ak', ['krakov', 'titan']],
  ['Rifle (M4)', 'm4', ['rift', 'volt']],
  ['Francotirador (AWP)', 'awp', ['scout']],
  ['Escopeta', 'escopeta', ['pump']],
  ['Cuchillo', 'cuchillo', ['vanta']],
]
const ALTO = 216, ANCHO = 384
const recorte = ([x, y, w, h]) => {
  const k = ALTO / h
  return `<div style="width:${Math.round(w * k)}px;height:${ALTO}px;background:url(${b64(COLLAGE)}) ${-x * k}px ${-y * k}px/${752 * k}px ${448 * k}px no-repeat;border-radius:4px"></div>`
}
const celda = (f, t) => existsSync(f) ? `<figure><img src="${b64(f)}" style="width:${ANCHO}px;height:${ALTO}px;display:block;border-radius:4px"><figcaption>${t}</figcaption></figure>` : ''
const html = `<body style="margin:0;padding:12px;background:#141414;color:#ddd;font:13px system-ui">
<h2 style="margin:0 0 8px;font-weight:600">Vektor · arma en pantalla, vuelta 105 — referencia de CS · Vektor 16:9 · con mano de apoyo</h2>
${FILAS.map(([nombre, cs, armas]) => `<section style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px">
<figure style="margin:0">${recorte(CS[cs])}<figcaption>CS · ${nombre}</figcaption></figure>
${armas.map((a) => celda(`scratchpad/vista105-${a}-16x9.png`, a) + celda(`scratchpad/vista105-${a}-16x9-apoyo.png`, `${a} · mano de apoyo`)).join('')}
</section>`).join('')}
<style>figure{margin:0}figcaption{padding:3px 0;color:#aaa}</style></body>`
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const p = await nav.newPage({ viewport: { width: 1900, height: 900 } })
await p.setContent(html); await p.waitForTimeout(400)
await p.screenshot({ path: 'scratchpad/lamina105.png', fullPage: true })
await nav.close()
