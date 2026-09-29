// Hoja de siluetas con marcas cada 10 % del largo (desde la boca), para fijar
// dónde está la empuñadura y el guardamanos de cada foto.
import { chromium } from 'playwright-core'
import { WEAPON_PATHS } from '../src/ui/weaponPaths.js'
const armas = ['pulse', 'reaper', 'volt', 'rift', 'krakov', 'titan', 'scout', 'pump', 'vanta', 'fang', 'bow', 'u2', 'core']
const html = `<body style="margin:0;background:#fff;display:grid;grid-template-columns:repeat(3,420px);gap:6px;font:12px sans-serif">${armas.map((k) => `<div><b>${k}</b><svg id="${k}" width="416" height="180" viewBox="${WEAPON_PATHS[k].viewBox}"><path d="${WEAPON_PATHS[k].d}" fill="#888" fill-rule="evenodd"/></svg></div>`).join('')}</body>`
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const p = await nav.newPage({ viewport: { width: 1280, height: 1000 } })
await p.setContent(html)
await p.evaluate((armas) => {
  for (const k of armas) {
    const svg = document.getElementById(k)
    const b = svg.querySelector('path').getBBox()
    const ns = 'http://www.w3.org/2000/svg'
    const der = k === 'vanta' // la foto mira a la derecha
    for (let i = 0; i <= 10; i++) {
      const x = der ? b.x + b.width * i / 10 : b.x + b.width * (1 - i / 10)
      const l = document.createElementNS(ns, 'line')
      l.setAttribute('x1', x); l.setAttribute('x2', x); l.setAttribute('y1', b.y); l.setAttribute('y2', b.y + b.height)
      l.setAttribute('stroke', i % 5 ? '#f55' : '#00f'); l.setAttribute('stroke-width', 1.2)
      svg.appendChild(l)
      const t = document.createElementNS(ns, 'text'); t.setAttribute('x', x + 1); t.setAttribute('y', b.y + b.height + 12); t.setAttribute('font-size', 10); t.textContent = i
      svg.appendChild(t)
    }
  }
}, armas)
await p.screenshot({ path: 'scratchpad/siluetas105.png', fullPage: true })
await nav.close()
