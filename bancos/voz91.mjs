/**
 * Banco: las siete voces del arsenal, medidas desde la página de voces.
 *
 * Con la receta de la vuelta 62: bloque de 4096 —el de 256 **pierde bloques**
 * y el pico salta de tanda a tanda—, cinco disparos por arma y **la mediana**,
 * con la cuenta de capturas completas al lado para que el número tenga su
 * denominador (vuelta 46).
 */
import { chromium } from 'playwright-core'

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})
const errores = []
const p = await nav.newPage({ viewport: { width: 1100, height: 900 } })
p.on('pageerror', (e) => errores.push(String(e)))
await p.goto('http://localhost:5192/editor/sonidos.html', { waitUntil: 'networkidle' })
await p.mouse.click(10, 10)
await p.waitForTimeout(600)

const filas = await p.evaluate(async () => {
  // **Por el asa de la página y no importando el módulo otra vez**: un
  // `import()` desde aquí puede devolver otra instancia, y entonces el `ctx`
  // que se mide no es el que suena. Pasó, y daba «sin contexto» con el audio
  // funcionando delante.
  const v = window.vektorVoces
  if (!v) return { error: 'sin asa vektorVoces' }
  const claves = v.armas
  const ctx = v.ctx()
  if (!ctx) return { error: 'el contexto no ha arrancado' }

  const proc = ctx.createScriptProcessor(4096, 1, 1)
  let capturando = false
  let muestras = []
  proc.onaudioprocess = (e) => {
    if (!capturando) return
    muestras.push(new Float32Array(e.inputBuffer.getChannelData(0)))
  }
  v.master().connect(proc)
  proc.connect(ctx.destination)

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
  const mediana = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1] }

  const salida = []
  for (const clave of claves) {
    const picos = []
    const colas = []
    const centroides = []
    let completas = 0
    for (let i = 0; i < 5; i++) {
      muestras = []
      capturando = true
      v.tocar(clave, false)
      await esperar(420)
      capturando = false
      const total = muestras.reduce((n, m) => n + m.length, 0)
      if (total < 4096 * 3) continue
      completas += 1
      const todo = new Float32Array(total)
      let o = 0
      for (const m of muestras) { todo.set(m, o); o += m.length }
      let pico = 0
      let iPico = 0
      for (let k = 0; k < todo.length; k++) {
        const v = Math.abs(todo[k])
        if (v > pico) { pico = v; iPico = k }
      }
      picos.push(pico)
      // Cola: cuánto tarda en caer 40 dB por debajo del pico.
      const umbral = pico * 0.01
      let fin = iPico
      for (let k = iPico; k < todo.length; k++) if (Math.abs(todo[k]) > umbral) fin = k
      colas.push(((fin - iPico) / ctx.sampleRate) * 1000)
      // Centroide del ataque: primeros 20 ms desde el pico, por cruces por cero.
      const n = Math.min(Math.round(ctx.sampleRate * 0.02), todo.length - iPico)
      let cruces = 0
      for (let k = iPico + 1; k < iPico + n; k++) {
        if ((todo[k - 1] < 0) !== (todo[k] < 0)) cruces += 1
      }
      centroides.push((cruces / 2) / (n / ctx.sampleRate))
    }
    salida.push({
      clave,
      pico: +mediana(picos).toFixed(4),
      colaMs: +mediana(colas).toFixed(1),
      centroideHz: Math.round(mediana(centroides)),
      completas,
    })
  }
  return { salida }
})

if (filas.error) {
  console.log('  FALLO —', filas.error)
  await nav.close()
  process.exit(1)
}

console.log('  arma      pico     cola     centroide   capturas')
for (const f of filas.salida) {
  console.log(`  ${f.clave.padEnd(9)} ${String(f.pico).padEnd(8)} ${String(f.colaMs + ' ms').padEnd(8)} ${String(f.centroideHz + ' Hz').padEnd(11)} ${f.completas}/5`)
}

let fallos = 0
const afirmar = (n, c, d = '') => {
  console.log((c ? '  ok  ' : '  FALLO ') + n + (d ? ` — ${d}` : ''))
  if (!c) fallos += 1
}
afirmar('las siete se capturan enteras', filas.salida.every((f) => f.completas === 5))
// Lo que se está midiendo es que **no se parezcan**: dos armas con el mismo
// centroide y la misma cola suenan igual por mucho que el volumen difiera.
const huella = (f) => `${Math.round(f.centroideHz / 250)}·${Math.round(f.colaMs / 15)}`
const huellas = filas.salida.map(huella)
afirmar('ninguna comparte huella con otra', new Set(huellas).size === huellas.length, huellas.join(' '))
afirmar('ni un error de página', errores.length === 0, errores.slice(0, 2).join(' | '))

await nav.close()
console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
