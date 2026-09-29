// lamina105b — antes/después del piloto de silueta (Krakov y Pulse), junto a su
// foto de Reference/Weapons. Lee las capturas que deja piloto105.mjs.
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const raiz = '/home/user/aimcore'
const img = (f, clase = '') => `<img class="${clase}" src="file://${raiz}/${f}">`
const fila = (arma, et, nombre) => `
  <div class="et">${nombre}</div>
  <div class="c juego">${img(`scratchpad/piloto105-${arma}-${et}-juego.png`)}</div>
  <div class="c est">${img(`scratchpad/piloto105-${arma}-${et}-tresCuartos.png`)}</div>
  <div class="c est">${img(`scratchpad/piloto105-${arma}-${et}-perfil.png`)}</div>
  <div class="c est">${img(`scratchpad/piloto105-${arma}-${et}-arriba.png`)}</div>`
const bloque = (arma, titulo) => `
  <h2>${titulo}</h2>
  <div class="rej">
    <div class="ref">${img(`Reference/Weapons/${arma}.png`)}<span>Reference/Weapons/${arma}.png</span></div>
    <div class="cols"><div></div><div>En juego · 16:9</div><div>Tres cuartos</div><div>De lado</div><div>Desde arriba</div>
    ${fila(arma, 'v3', 'Antes · v3<br><small>extrusión de grosor único</small>')}
    ${fila(arma, 'piloto', 'Después · piloto<br><small>grosor por zonas</small>')}</div>
  </div>`
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#0a0a0a;color:#ddd;font:13px/1.35 system-ui,sans-serif;width:1880px}
h1{margin:0 0 4px;font-size:22px;color:#fff} p.sub{margin:0 0 18px;color:#999}
h2{margin:22px 0 8px;font-size:17px;color:#E4462B}
.rej{display:grid;grid-template-columns:260px 1fr;gap:12px;align-items:start}
.ref{background:#f2f2f2;border-radius:4px;padding:8px;text-align:center}.ref img{width:100%}.ref span{display:block;color:#555;font-size:11px}
.cols{display:grid;grid-template-columns:120px repeat(4,1fr);gap:6px;align-items:center}
.cols>div:nth-child(-n+5){color:#999;font-size:12px;text-align:center}
.et{font-weight:600;color:#fff}.et small{font-weight:400;color:#999}
.c{overflow:hidden;border-radius:3px;background:#222}
.juego img{width:100%;display:block;object-fit:cover;object-position:62% 100%;height:190px;transform:scale(1.15);transform-origin:62% 100%}
.est img{width:100%;display:block;object-fit:cover;height:190px;transform:scale(1.35)}
</style><h1>Arma en pantalla · piloto de silueta con grosor por zonas (vuelta 105)</h1>
<p class="sub">Misma silueta de la foto, sin piezas añadidas. Antes: una extrusión del mismo grosor en toda el arma. Después: cada zona con su grosor, huecos de verdad (el guardamonte, el alza, las ranuras) y canto redondeado corto. Encuadre v3 sin tocar; mano de apoyo apagada.</p>
${bloque('krakov', 'Krakov')}${bloque('pulse', 'Pulse')}`
writeFileSync('/tmp/claude-0/lamina105b.html', html)
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--allow-file-access-from-files'] })
const p = await nav.newPage({ viewport: { width: 1928, height: 900 } })
await p.goto('file:///tmp/claude-0/lamina105b.html'); await p.waitForTimeout(800)
await p.screenshot({ path: `${raiz}/scratchpad/lamina105b.png`, fullPage: true })
await nav.close()
console.log('lámina en scratchpad/lamina105b.png')
