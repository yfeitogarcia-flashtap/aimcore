/**
 * **Vuelta 45 — dos pestañas, un servidor local.**
 *
 * Requiere el servidor levantado (`npm run net`), así que no está en `todas.sh`:
 * esa batería prueba el juego y ésta necesita un proceso aparte.
 *
 * Mide lo que hay que decidir antes de tocar Cloudflare: si la reconciliación es
 * exacta, qué se ve del rival, cuánto cuesta y qué pasa cuando se pierden
 * paquetes.
 */
import { chromium } from 'playwright-core'

/**
 * **Este banco corre contra un huésped sin rondas** (`VEKTOR_RONDAS=0`, vuelta
 * 62), que es el mundo de hasta la 61: no se reinicia, la reaparición va por el
 * reloj de las entradas y no hay fase de compra. Es lo que hace falta para medir
 * netcode —aquí se mata al mismo blanco una y otra vez— y por eso el interruptor
 * existe. Lo que sí se juega a rondas se mide en `rondas62` y `duelo62`.
 */

/**
 * **Un jugador por navegador** (vueltas 50 y 57). Con las dos pestañas en el
 * mismo, la de atrás la frena el contenedor, y la premisa de «saltando de
 * verdad» se quedaba en 29 muestras en el aire: una pestaña frenada casi no
 * despega. Cada uno con el suyo.
 */
const navegadores = []
const lanzar = async () => {
  const n = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=swiftshader','--enable-unsafe-swiftshader'] })
  navegadores.push(n)
  return n
}
let fail = 0
const ok = (c,m) => { console.log((c?'  PASS ':'  FAIL ')+m); if(!c) fail++ }

/**
 * **Las dos pestañas tienen que entrar en la MISMA sala** (vuelta 58: el
 * huésped de Node encamina por código, como el Durable Object). Abrir dos veces
 * la página sin código da dos salas y dos jugadores que no se ven — y no da
 * ningún error: se lee en la línea de abajo como `p1 vs p1`, que es un contador
 * que en una sala de dos no puede repetirse. B entra por el código de A.
 */
const abrir = async (etiqueta, codigo = null) => {
  const p = await (await lanzar()).newPage({ viewport: { width: 960, height: 600 } })
  p.on('pageerror', e => console.log(`  !! ${etiqueta} PAGEERROR`, e.message))
  const base = process.env.VEKTOR_URL || 'http://localhost:5192/net/prueba.html'
  await p.goto(codigo ? `${base}#${codigo}` : base)
  await p.waitForFunction(() => !!window.vektorNet?.cliente?.id, null, { timeout: 20000 })
  return p
}
const A = await abrir('A')
const codigoDeLaSala = await A.evaluate(() => document.getElementById('codigo').textContent.trim())
const B = await abrir('B', codigoDeLaSala)

// Contador de fps propio: en este contenedor el navegador dibuja por software y
// dos pestañas se quitan frames entre ellas. Sin este número, lo que cuesta el
// contenedor se confundiría con lo que cuesta el diseño.
for (const p of [A, B]) await p.evaluate(() => {
  window.__frames = 0
  const contar = () => { window.__frames++; requestAnimationFrame(contar) }
  requestAnimationFrame(contar)
})
const ids = await Promise.all([A, B].map(p => p.evaluate(() => window.vektorNet.cliente.id)))
console.log(`dos pestañas conectadas en la sala ${codigoDeLaSala}: ${ids.join(' vs ')}`)
ok(ids[0] !== ids[1], `y son dos jugadores distintos de la misma partida (${ids.join(' / ')})`)

/**
 * Los dos andan, giran **y saltan**, que es lo que hace interesante la
 * predicción: el salto es la mecánica con estado —parábola, fatiga, ventana de
 * encadenado— y si algo no viaja bien por la red, sale aquí.
 */
const mover = (p, giro) => p.evaluate((g) => {
  const { cliente, camara, movimiento } = window.vektorNet
  cliente.teclas.forward = true
  window.__aire = 0
  window.__ticks = 0
  window.__despegues = 0
  window.__enElAire = movimiento.airborne
  clearInterval(window.__giro)
  clearInterval(window.__salto)
  window.__giro = setInterval(() => {
    camara.rotation.y += g
    window.__ticks++
    if (movimiento.airborne) window.__aire++
    if (movimiento.airborne && !window.__enElAire) window.__despegues++
    window.__enElAire = movimiento.airborne
  }, 16)
  // Saltar de verdad: pulsación con su instante, y se suelta al poco.
  window.__salto = setInterval(() => {
    cliente.teclas.jump = true
    cliente.pulsarSalto(performance.now())
    setTimeout(() => { cliente.teclas.jump = false }, 60)
  }, 700)
  /**
   * **Y deslizarse** (vuelta 69), que es la otra mecánica con estado guardado:
   * siete campos en `snapshot()` que la reconciliación tiene que devolver tal
   * cual. Si alguno se queda fuera, esto es lo que lo caza — el cliente
   * reejecuta con un deslizamiento a medias y cada foto trae una corrección.
   * Se toca la tecla y se suelta, que es lo que arranca un flanco.
   */
  clearInterval(window.__slide)
  window.__slide = setInterval(() => {
    cliente.teclas.crouch = true
    setTimeout(() => { cliente.teclas.crouch = false }, 80)
  }, 2300)
}, giro)
const parar = (p) => p.evaluate(() => {
  clearInterval(window.__giro)
  clearInterval(window.__salto)
  clearInterval(window.__slide)
  for (const k of Object.keys(window.vektorNet.cliente.teclas)) window.vektorNet.cliente.teclas[k] = false
})
const reiniciarMedidas = (p) => p.evaluate(() => {
  const m = window.vektorNet.cliente.medidas
  m.errorMax = 0; m.correcciones = 0; m.fotos = 0; m.enviados = 0; m.perdidos = 0
  m.hambreBase = m.hambre
  const e = window.vektorNet.enlace
  e.tirados = 0; e.tiradosEntrada = 0
  window.__frames = 0
  window.__desde = performance.now()
  window.vektorNet.costes.length = 0
})
// La red simulada vive en el transporte desde la vuelta 46: el cliente no sabe
// que existe, así que se toca el enlace y no el cliente.
const red = (p, latenciaMs, jitterMs, perdida) => p.evaluate((o) => {
  Object.assign(window.vektorNet.enlace, o)
}, { latenciaMs, jitterMs, perdida })
const leer = (p) => p.evaluate(() => {
  const { cliente, camara, movimiento, costes, paso } = window.vektorNet
  const orden = [...costes].sort((a,b)=>a-b)
  return {
    id: cliente.id, paso,
    medidas: { ...cliente.medidas },
    pos: { x: camara.position.x, y: camara.position.y, z: camara.position.z },
    autoritativo: cliente.autoritativo,
    rival: cliente.poseDelRival(),
    rec: movimiento.recoveries,
    tirados: (window.vektorNet.enlace.tirados ?? 0) + (window.vektorNet.enlace.tiradosEntrada ?? 0),
    aire: window.__aire ?? 0,
    ticks: window.__ticks ?? 0,
    despegues: window.__despegues ?? 0,
    airborne: movimiento.airborne,
    fps: window.__desde ? window.__frames / ((performance.now() - window.__desde) / 1000) : 0,
    coste: orden.length > 30 ? { p50: orden[Math.floor(orden.length*0.5)], p99: orden[Math.floor(orden.length*0.99)] } : null,
  }
})

// ---------- 1. sin latencia añadida: la reconciliación es exacta ----------
console.log('\n[1] Sin latencia añadida ni pérdida: ¿cuánto corrige el servidor?')
await red(A, 0, 0, 0); await red(B, 0, 0, 0)
await mover(A, 0.03); await mover(B, -0.02)
await A.waitForTimeout(1200)
await reiniciarMedidas(A); await reiniciarMedidas(B)
await A.waitForTimeout(4000)
let a = await leer(A), bb = await leer(B)
console.log(`     A paso ${a.paso} · servidor ${a.medidas.pasoServidor} · ack ${a.medidas.ack} · pendientes ${a.medidas.pendientes}`)
console.log(`     error de reconciliación — último ${a.medidas.errorUltimo.toExponential(2)} u · máximo ${a.medidas.errorMax.toExponential(2)} u`)
console.log(`     correcciones visibles (>0.01 u): ${a.medidas.correcciones} de ${a.medidas.fotos} fotos · perdidos ${a.medidas.perdidos}/${a.medidas.enviados}`)
console.log(`     B error máximo ${bb.medidas.errorMax.toExponential(2)} u · ${bb.medidas.correcciones} correcciones de ${bb.medidas.fotos}`)
const ULP = 1e-9
ok(a.medidas.errorMax < ULP && bb.medidas.errorMax < ULP,
   `sin pérdida, la reejecución devuelve el mismo estado que el servidor: error máximo ${a.medidas.errorMax.toExponential(2)} u (un ULP de coma flotante, no una divergencia)`)
ok(a.medidas.correcciones === 0 && bb.medidas.correcciones === 0, 'cero correcciones visibles')
ok(a.rec === 0 && bb.rec === 0, 'y ningún paso necesitó la red de seguridad del movimiento')
/**
 * **Saltando de verdad se mide en despegues, no en muestras** (vuelta 106).
 * Pedía más de 50 muestras en el aire y salía rojo con 29-43: el `setInterval`
 * de 16 ms que las cuenta dispara ~12 veces por segundo con WebGL por software,
 * no 60, así que el número medía el contenedor. Medido con una sonda: 7
 * despegues de 7 pulsaciones, a la altura entera (1.25 u) y sin fatiga. Lo que
 * se exige es eso —que despegue casi cada pulsación— y que pase buena parte
 * del tiempo en el aire.
 */
const vuela = (m) => m.despegues >= 4 && m.aire / Math.max(1, m.ticks) > 0.3
ok(vuela(a) && vuela(bb),
   `y esto se ha medido saltando de verdad, que es la mecánica con estado: ${a.despegues} despegues de A (${Math.round(100 * a.aire / Math.max(1, a.ticks))}% en el aire), ${bb.despegues} de B (${Math.round(100 * bb.aire / Math.max(1, bb.ticks))}%)`)
ok(a.medidas.pendientes >= 1 && a.medidas.pendientes <= 8,
   `la cola de entradas sin confirmar se queda corta: ${a.medidas.pendientes} (${(a.medidas.pendientes*16.667).toFixed(0)} ms de reejecución)`)

// ---------- 2. barrido de latencia ----------
console.log('\n[2] Latencia simulada: qué cambia y qué no')
console.log('     ida(ms)  RTT medido   pendientes   reejecución   error máx   pasos sin entrada   fps cliente')
const filas = []
for (const ida of [0, 25, 50, 80, 150]) {
  await red(A, ida, 0, 0)
  await A.waitForTimeout(1200)
  await reiniciarMedidas(A)
  await A.waitForTimeout(2500)
  const r = await leer(A)
  const f = { ida, rtt: r.medidas.rtt, pend: r.medidas.pendientes, errMax: r.medidas.errorMax,
              hambre: r.medidas.hambre - (r.medidas.hambreBase ?? 0), fotos: r.medidas.fotos, fps: r.fps }
  filas.push(f)
  console.log(`     ${String(ida).padStart(7)} ${f.rtt.toFixed(1).padStart(11)} ${String(f.pend).padStart(12)} ` +
              `${(f.pend*16.667).toFixed(0).padStart(11)} ms ${f.errMax.toExponential(1).padStart(11)} ` +
              `${String(f.hambre + ' de ' + f.fotos).padStart(18)} ${f.fps.toFixed(1).padStart(13)}`)
}
const base = filas[0].rtt
ok(filas.every(f => f.errMax < 1e-9), `la latencia no mete error de predicción: máximo ${Math.max(...filas.map(f=>f.errMax)).toExponential(1)} u con 300 ms de RTT`)
ok(filas[4].pend > filas[0].pend, `lo que crece es la cola a reejecutar: ${filas[0].pend} -> ${filas[4].pend} entradas`)
const sobrecoste = (filas[4].rtt - base) - 300
console.log(`     base de la tubería sin red: ${base.toFixed(0)} ms · sobrecoste sobre los 300 inyectados: ${sobrecoste.toFixed(0)} ms`)
ok(filas[4].rtt > filas[0].rtt + 250,
   `el RTT medido crece con la latencia inyectada: ${filas[0].rtt.toFixed(0)} -> ${filas[4].rtt.toFixed(0)} ms`)
/**
 * **El margen va en frames, no en milisegundos** (vuelta 106). La cola del
 * servidor son entradas que esperan a que el cliente dibuje, así que se mide en
 * frames del cliente: +81 ms a 29 fps y +199 a 23 son los dos ~2-5 frames. Con
 * 150 ms fijos el banco medía cuánto va de lento el contenedor esa tarde. Lo
 * que guarda es que el RTT no se cuente dos veces —que sería +300 encima de los
 * 300 inyectados—, y eso sigue muy por fuera de cinco frames.
 */
const margenCola = Math.max(150, 5 * 1000 / Math.max(1, filas[4].fps))
ok(sobrecoste < margenCola,
   `y no la infla de más: +${(filas[4].rtt-base).toFixed(0)} ms para 300 inyectados (${sobrecoste.toFixed(0)} ms de cola en el servidor, que es lo que cuesta ir a ${filas[4].fps.toFixed(0)} fps; margen ${margenCola.toFixed(0)} ms, cinco frames)`)
console.log(`     (los pasos sin entrada son del contenedor, no del diseño: con una sola pestaña a 60 fps salen 0 de 240;`)
console.log(`      aquí dos pestañas de WebGL por software se quitan frames entre ellas — ver colchon45.mjs)`)
ok(filas.every(f => f.errMax < 1e-9),
   'y quedarse sin entrada no rompe nada: el error de predicción sigue en cero en toda la tabla')

// ---------- 3. pérdida de paquetes: aquí sí corrige ----------
console.log('\n[3] Pérdida de paquetes: la reconciliación entra en acción')
console.log('     pérdida   error último   error máx   correcciones/fotos')
const perdidas = []
for (const pct of [0, 2, 10, 25]) {
  await red(A, 50, 0, pct / 100)
  await A.waitForTimeout(1000)
  await reiniciarMedidas(A)
  await A.waitForTimeout(3000)
  const r = await leer(A)
  perdidas.push({ pct, ult: r.medidas.errorUltimo, max: r.medidas.errorMax, corr: r.medidas.correcciones, fotos: r.medidas.fotos, perd: r.tirados, env: r.medidas.enviados })
  console.log(`     ${String(pct+'%').padStart(7)} ${r.medidas.errorUltimo.toExponential(2).padStart(14)} ${r.medidas.errorMax.toExponential(2).padStart(11)} ` +
              `${String(r.medidas.correcciones+'/'+r.medidas.fotos).padStart(20)}  (${r.tirados} paquetes tirados de ${r.medidas.enviados})`)
}
await red(A, 0, 0, 0)
ok(perdidas[0].max < 1e-9, `con 0% de pérdida sigue sin corregir nada (${perdidas[0].max.toExponential(1)} u)`)
ok(perdidas[2].max > 0, `con 10% de pérdida el servidor sí corrige: hasta ${perdidas[2].max.toFixed(4)} u`)
ok(perdidas[3].max > perdidas[1].max, `y la corrección crece con la pérdida (${perdidas[1].max.toFixed(4)} u al 2% contra ${perdidas[3].max.toFixed(4)} al 25%)`)
// El peor caso no es andar: es **perder la pulsación de saltar**. El servidor no
// despega, el cliente sí, y hasta la foto siguiente divergen lo que dura un
// vuelo — 578 ms, o sea unas 3.8 u a marcha de carrera. Ése es el techo, y por
// eso el listón se pone ahí y no en un metro.
const VUELO = 6.5 * 0.578
ok(perdidas[3].max < VUELO * 1.2,
   `y ni al 25% pasa de lo que desplaza un vuelo entero, que es el peor caso —perder la pulsación de saltar— (${perdidas[3].max.toFixed(2)} u contra ${VUELO.toFixed(2)})`)

// ---------- 4. qué ve una pestaña de la otra ----------
console.log('\n[4] Qué ve B de A: el rival se dibuja en el pasado')
await red(A, 50, 0, 0); await red(B, 50, 0, 0)
await A.waitForTimeout(1500)
const muestras = []
for (let i = 0; i < 10; i++) {
  const [ra, rb] = await Promise.all([leer(A), leer(B)])
  if (ra.autoritativo && rb.rival) {
    muestras.push({
      dist: Math.hypot(rb.rival.x - ra.autoritativo.x, rb.rival.z - ra.autoritativo.z),
      retraso: rb.rival.retraso,
    })
  }
  await A.waitForTimeout(250)
}
const med = (xs) => xs.reduce((s,x)=>s+x,0) / xs.length
const dist = med(muestras.map(m=>m.dist)), retr = med(muestras.map(m=>m.retraso))
console.log(`     B dibuja a A a ${dist.toFixed(3)} u de donde el servidor dice que está A`)
console.log(`     retraso de interpolación: ${retr.toFixed(1)} pasos = ${(retr*16.667).toFixed(0)} ms`)
const rttB = (await leer(B)).medidas.rtt
console.log(`     retraso visual total estimado: ${(retr*16.667 + rttB/2).toFixed(0)} ms (interpolación + medio viaje de ${rttB.toFixed(0)} ms de RTT)`)
console.log(`     a marcha de carrera (6.5 u/s) eso son ${(6.5*(retr*16.667 + rttB/2)/1000).toFixed(2)} u de diferencia esperada`)
ok(muestras.length >= 8, `se pudieron comparar ${muestras.length} muestras`)
ok(dist < 2.5, `lo que ve B de A está dentro de lo que explica el retraso (${dist.toFixed(3)} u)`)
ok(retr >= 1 && retr <= 6, `el retraso contra la última foto recibida es el de diseño (${retr.toFixed(1)} pasos, config ${3})`)
ok(Math.max(...muestras.map(m=>m.retraso)) - Math.min(...muestras.map(m=>m.retraso)) < 8,
   `y se mantiene estable entre muestras (${Math.min(...muestras.map(m=>m.retraso)).toFixed(1)}-${Math.max(...muestras.map(m=>m.retraso)).toFixed(1)} pasos)`)

// ---------- 5. coste y caudal ----------
console.log('\n[5] Coste y caudal')
const coste = await A.evaluate(() => {
  // Bucle cerrado, como en el resto del proyecto: `performance.now()` en el
  // navegador va cuantizado y un paso suelto mide el jitter, no el código.
  const { cliente } = window.vektorNet
  const entrada = { t: 'e', n: cliente.paso, k: 0b0001, yaw: 0.3, jt: -1 }
  // 500 repeticiones por muestra: `performance.now()` en el navegador va
  // cuantizado a ~100 µs, y un paso cuesta microsegundos. Con lotes cortos lo
  // que se mide es el reloj.
  const medir = (fn) => {
    for (let i = 0; i < 500; i++) fn()
    const m = []
    for (let r = 0; r < 60; r++) {
      const t = performance.now()
      for (let i = 0; i < 500; i++) fn()
      m.push((performance.now() - t) / 500)
    }
    m.sort((a, b) => a - b)
    return { p50: m[30], p99: m[59] }
  }
  return {
    predecir: medir(() => cliente._aplicar(entrada)),
    empaquetar: medir(() => JSON.stringify(entrada)),
    reconciliar: medir(() => { for (const e of cliente.pendientes) cliente._aplicar(e) }),
    pendientes: cliente.pendientes.length,
  }
})
const caudal = await A.evaluate(() => new Promise((r) => {
  const m = window.vektorNet.cliente.medidas
  const s0 = m.totalSalida, e0 = m.totalEntrada, t0 = performance.now()
  setTimeout(() => r({ sube: m.totalSalida - s0, baja: m.totalEntrada - e0, ms: performance.now() - t0 }), 3000)
}))
console.log(`     predecir un paso        : p50 ${coste.predecir.p50.toFixed(4)} ms · p99 ${coste.predecir.p99.toFixed(4)} ms`)
console.log(`     empaquetar la entrada   : p50 ${coste.empaquetar.p50.toFixed(4)} ms`)
console.log(`     reejecutar ${String(coste.pendientes).padStart(2)} entradas  : p50 ${coste.reconciliar.p50.toFixed(4)} ms · p99 ${coste.reconciliar.p99.toFixed(4)} ms`)
const seg = caudal.ms / 1000
console.log(`     caudal medido en JSON   : ↑ ${(caudal.sube/seg/1024).toFixed(2)} KB/s · ↓ ${(caudal.baja/seg/1024).toFixed(2)} KB/s (${(caudal.baja/seg/60).toFixed(0)} B por foto)`)
ok(coste.predecir.p99 < 0.2, `predecir un paso cabe de sobra en el presupuesto de la casa (p50 ${coste.predecir.p50.toFixed(4)} ms, p99 ${coste.predecir.p99.toFixed(4)} ms)`)
const porPaso = coste.reconciliar.p50 / Math.max(1, coste.pendientes)
console.log(`     o sea ${(porPaso*1000).toFixed(1)} µs por entrada reejecutada -> el presupuesto de 0.2 ms da para ${Math.floor(0.2/porPaso)} entradas (${(Math.floor(0.2/porPaso)*16.667).toFixed(0)} ms de RTT)`)
ok(coste.reconciliar.p99 < 0.2, `y reejecutar la cola entera cabe en el presupuesto de la casa (${coste.reconciliar.p99.toFixed(4)} ms p99 con ${coste.pendientes} entradas)`)
ok(caudal.sube/seg/1024 < 10, `la subida es ridícula incluso en JSON: ${(caudal.sube/seg/1024).toFixed(2)} KB/s`)
// La bajada varía con lo que estén haciendo los jugadores: en el aire los campos
// llevan decimales largos y JSON los escribe enteros. El listón se pone en lo
// que costaría el peor caso razonable a 60 fotos por segundo.
ok(caudal.baja/seg/1024 < 120,
   `y la bajada, sin comprimir ni recortar nada, ${(caudal.baja/seg/1024).toFixed(1)} KB/s (${(caudal.baja/seg/60).toFixed(0)} B por foto de dos jugadores)`)

await parar(A); await parar(B)
await A.screenshot({ path: 'r45-A.png' })
await B.screenshot({ path: 'r45-B.png' })
console.log(`\n=== red45: ${fail === 0 ? 'todo verde' : fail + ' FALLOS'} ===`)
for (const n of navegadores) await n.close()
process.exit(fail ? 1 : 0)
