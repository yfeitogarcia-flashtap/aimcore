// lamina105c — el piloto holográfico al lado de no llevar arma (lee las capturas de holo105).
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const r = '/home/user/aimcore'
const im = (f) => `file://${r}/${f}`
const col = (titulo, cap, ref) => `<div class="col"><h3>${titulo}</h3>
  <div class="entero"><img src="${im(cap)}"></div>
  <div class="zoom"><img src="${im(cap)}"></div>
  ${ref ? `<div class="ref"><img src="${im(ref)}"><span>${ref}</span></div>` : '<div class="ref vacia">sin arma: lo que se ve del arma es la silueta del HUD</div>'}</div>`
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:22px;background:#0a0a0a;color:#ddd;font:13px/1.4 system-ui,sans-serif;width:1880px}
h1{margin:0 0 4px;font-size:21px;color:#fff}p{margin:0 0 16px;color:#999}
.fila{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
h3{margin:0 0 6px;color:#E4462B;font-size:15px}
.entero img{width:100%;display:block}
.zoom{margin-top:6px;height:250px;overflow:hidden;position:relative}
.zoom img{position:absolute;width:200%;left:-95%;top:-150%}
.ref{margin-top:6px;background:#f2f2f2;padding:6px;text-align:center;height:150px}.ref img{height:125px}.ref span{display:block;color:#555;font-size:10px}
.vacia{background:#1a1a1a;color:#888;display:flex;align-items:center;justify-content:center}
</style><h1>Arma en pantalla · piloto holográfico (vuelta 105)</h1>
<p>Sólo el contorno de la silueta, uno y en el plano medio, en líneas finas del color del jugador aclarado y semitransparente. Esfera de la mano y encuadre v3. Arriba la pantalla entera a 16:9; debajo, ampliado el cuarto de abajo a la derecha.</p>
<div class="fila">${col('Sin arma', 'scratchpad/holo105-sin.png')}${col('Krakov holográfico', 'scratchpad/holo105-krakov.png', 'Reference/Weapons/krakov.png')}${col('Pulse holográfica', 'scratchpad/holo105-pulse.png', 'Reference/Weapons/pulse.png')}</div>`
writeFileSync('/tmp/lamina105c.html', html)
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--allow-file-access-from-files'] })
const p = await nav.newPage({ viewport: { width: 1924, height: 900 } })
await p.goto('file:///tmp/lamina105c.html'); await p.waitForTimeout(800)
await p.screenshot({ path: `${r}/scratchpad/lamina105c.png`, fullPage: true })
await nav.close()
