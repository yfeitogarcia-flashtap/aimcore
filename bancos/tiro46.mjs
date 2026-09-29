/**
 * **Vuelta 46 — disparo con compensación de retraso.**
 *
 * Requiere el servidor levantado (`npm run net`).
 *
 * La medida es la misma idea que la del error de reconciliación: comparar lo
 * que el cliente decidió con lo que decidió el servidor. Aquí el cliente
 * resuelve el disparo contra el rival **tal como lo está dibujando** —lo que
 * había en pantalla— y el servidor contra el rival **rebobinado**. Si la
 * compensación funciona, los dos veredictos coinciden aunque haya ping.
 *
 * El control es el mismo disparo resuelto **sin** rebobinar, que el servidor
 * calcula y manda de propina: la diferencia entre las dos columnas es lo que
 * compra la compensación.
 */
import { chromium } from 'playwright-core'

/**
 * **Este banco corre contra un huésped sin rondas** (`VEKTOR_RONDAS=0`, vuelta
 * 62), que es el mundo de hasta la 61: no se reinicia, la reaparición va por el
 * reloj de las entradas y no hay fase de compra. Es lo que hace falta para medir
 * netcode —aquí se mata al mismo blanco una y otra vez— y por eso el interruptor
 * existe. Lo que sí se juega a rondas se mide en `rondas62` y `duelo62`.
 */

// **Un jugador por navegador** (vueltas 50 y 57): con las dos pestañas en el
// mismo, la de atrás la frena el contenedor.
const navegadores = []
const lanzar = async () => {
  const n = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=swiftshader','--enable-unsafe-swiftshader'] })
  navegadores.push(n)
  return n
}
let fail = 0
const ok = (c,m) => { console.log((c?'  PASS ':'  FAIL ')+m); if(!c) fail++ }
const espera = (ms) => new Promise(r => setTimeout(r, ms))

const BASE_URL = process.env.VEKTOR_URL || 'http://localhost:5192/net/prueba.html'
/**
 * **Y el segundo entra con el código del primero.** Desde la vuelta 47 una
 * partida es un código: dos pestañas abiertas a pelo son **dos salas**, cada
 * uno `p1` en la suya, y el síntoma no es un error sino una tabla vacía —cero
 * disparos, cero acuerdos, `NaN%`—. Es la premisa de la vuelta 46 por su
 * puerta: antes de medir un porcentaje hay que comprobar que hay denominador.
 */
const abrir = async (etiqueta, codigo = null) => {
  const p = await (await lanzar()).newPage({ viewport: { width: 900, height: 560 } })
  p.on('pageerror', e => console.log(`  !! ${etiqueta} PAGEERROR`, e.message))
  await p.goto(codigo ? `${BASE_URL}#${codigo}` : BASE_URL)
  await p.waitForFunction(() => !!window.vektorNet?.cliente?.id, null, { timeout: 20000 })
  return p
}
const A = await abrir('A')
const codigoDeLaSala = await A.evaluate(() => document.getElementById('codigo').textContent.trim())
const B = await abrir('B', codigoDeLaSala)

console.log(`sala ${codigoDeLaSala} · tirador ${await A.evaluate(()=>window.vektorNet.cliente.id)} · blanco ${await B.evaluate(()=>window.vektorNet.cliente.id)}`)
ok(await B.evaluate(()=>window.vektorNet.cliente.id) !== await A.evaluate(()=>window.vektorNet.cliente.id),
   'premisa: los dos están en la misma sala, con ranuras distintas')

const teclas = (p, set) => p.evaluate((o) => {
  const t = window.vektorNet.cliente.teclas
  for (const k of Object.keys(t)) t[k] = false
  Object.assign(t, o)
}, set)

/**
 * **Los dos puestos, elegidos desde los datos del escenario.**
 *
 * Un banco que escribe a mano «el tirador a x −2.5, el blanco a x 13» no prueba
 * el Plano A, prueba unos números, y se rompe en cuanto alguien mueve una caja.
 * Aquí se busca un par de puntos de ruta que **se vean entre sí**, a media
 * distancia, y con sitio para que el blanco se aparte de través sin perderse de
 * vista. El mismo `hasLineOfSight` del motor decide.
 */
const elegirPuestos = () => A.evaluate(async () => {
  const { escenario, camara, verDesde: hasLineOfSight } = window.vektorNet
  // El test de visibilidad viene del asa de la página (`verDesde`) y no de un
  // `import()` a `/src/game/sight.js`: esa ruta existe con Vite en desarrollo y
  // no existe en el sitio desplegado, y este banco tiene que pasar contra los
  // dos huéspedes. El constructor de Vector3 se saca de un objeto que ya existe.
  const Vector3 = camara.position.constructor
  // Un punto de ruta guarda su sitio en `position` (un Vector3), no en x/z
  // sueltos, y lleva una referencia de vuelta a su ruta: se aplana a números
  // antes de devolver nada, o `evaluate` no puede serializarlo.
  // **Y si el mapa no declara rutas, se barre el suelo** (vuelta 66). Las rutas
  // existen para que nazcan muñecos, y el mapa del duelo no tiene: sin esto,
  // este banco se quedaba sin candidatos y fallaba por su premisa, que es lo
  // correcto —pero lo que hace falta aquí no son rutas, son dos sitios con
  // suelo libre que se vean—. El barrido los da en cualquier mapa, y un banco
  // que no sabe dónde está la Espina es un banco que prueba el juego.
  let puntos = escenario.routes.flatMap((r) => r.points).map((p) => ({ x: p.position.x, z: p.position.z }))
  if (puntos.length === 0) {
    const limite = escenario.room.width / 2 - 2
    const radio = 0.6
    puntos = []
    for (let x = -limite; x <= limite; x += 1.5) {
      for (let z = -limite; z <= limite; z += 1.5) {
        if (Math.abs(escenario.groundHeightAt(x, z, 0)) > 0.01) continue
        const dentro = escenario.boxes.some((b) =>
          x > b.minX - radio && x < b.maxX + radio && z > b.minZ - radio && z < b.maxZ + radio && b.top > 0.3)
        if (!dentro) puntos.push({ x: +x.toFixed(2), z: +z.toFixed(2) })
      }
    }
  }
  const ve = (a, ya, b, yb) =>
    hasLineOfSight(new Vector3(a.x, ya, a.z), new Vector3(b.x, yb, b.z), escenario.occluders)

  let mejor = null
  for (const t of puntos) {
    for (const o of puntos) {
      const dx = o.x - t.x, dz = o.z - t.z
      const d = Math.hypot(dx, dz)
      if (d < 9 || d > 20) continue
      if (!ve(t, 1.7, o, 1.0)) continue
      // Perpendicular horizontal: el eje por el que se apartará el blanco.
      const px = -dz / d, pz = dx / d
      // Y tiene que seguir viéndose apartado a los dos lados, o la mitad de los
      // disparos fallarían por cobertura y no por la red.
      const lados = [-2.5, 2.5].every((k) => ve(t, 1.7, { x: o.x + px * k, z: o.z + pz * k }, 1.0))
      if (!lados) continue
      if (!mejor || d > mejor.d) mejor = { tirador: { x: t.x, z: t.z }, blanco: { x: o.x, z: o.z }, d, px, pz }
    }
  }
  return mejor
})

/**
 * **Colocar a un jugador en su puesto.** Por el mensaje de pruebas del servidor
 * (`MSG.COLOCAR`, sólo con `VEKTOR_DEBUG=1`) y no a base de teclas: llevarlos
 * andando depende de que sepan rodear una caja, y no saben — se atascan, la
 * tanda se mide sin línea de tiro y las dos columnas coinciden en el fallo.
 */
const irA = (p, destino) => p.evaluate((o) => {
  const { cliente, camara } = window.vektorNet
  for (const k of Object.keys(cliente.teclas)) cliente.teclas[k] = false
  camara.rotation.y = 0
  camara.rotation.x = 0
  cliente.transporte.send(JSON.stringify({ t: 'c', x: o.x, z: o.z }))
}, destino)

let PUESTOS = null
const colocar = async () => {
  await irA(A, PUESTOS.tirador)
  await irA(B, PUESTOS.blanco)
  // Que llegue el mensaje, se aplique, vuelva la corrección y se vacíe el
  // buffer de interpolación del rival con fotos del sitio nuevo. Con menos, lo
  // que se dibuja es el camino entre el sitio viejo y el nuevo.
  await espera(1200)
  return true
}

/**
 * **El vaivén del blanco, de través y conducido desde aquí.**
 *
 * De través porque moverse a lo largo de la línea de tiro no te saca del haz y
 * el control saldría plano por construcción. Y conducido desde el banco —un
 * empujón entre disparo y disparo— en vez de con un `setInterval` dentro de la
 * página: la primera versión llevaba la cuenta allí dentro y se descentraba
 * sola con las reapariciones y las colocaciones, y el blanco acababa a 9 u de
 * su puesto sin que nada lo dijera. Aquí el estado es del banco, y el banco lo
 * puede comprobar.
 */
let vaivenLado = true
const empujarBlanco = async () => {
  const fuera = await B.evaluate(({ px, pz, cx, cz, lado }) => {
    const { cliente, camara } = window.vektorNet
    camara.rotation.y = 0
    const t = cliente.teclas
    for (const k of Object.keys(t)) t[k] = false
    // Proyección del desvío sobre la perpendicular: es el único eje que importa.
    const s = (camara.position.x - cx) * px + (camara.position.z - cz) * pz
    // Con yaw 0: adelante es −Z y la derecha es +X.
    const enX = Math.abs(px) >= Math.abs(pz)
    const positiva = enX ? px > 0 : pz < 0
    const haciaMas = lado ? positiva : !positiva
    if (enX) t[haciaMas ? 'right' : 'left'] = true
    else t[haciaMas ? 'forward' : 'back'] = true
    return s
  }, { px: PUESTOS.px, pz: PUESTOS.pz, cx: PUESTOS.blanco.x, cz: PUESTOS.blanco.z, lado: vaivenLado })
  // El banco lleva la cuenta: fuera de la banda, se cambia de sentido.
  if ((vaivenLado && fuera > 2.5) || (!vaivenLado && fuera < -2.5)) vaivenLado = !vaivenLado
  return fuera
}
const pararBlanco = () => B.evaluate(() => {
  const t = window.vektorNet.cliente.teclas
  for (const k of Object.keys(t)) t[k] = false
})

/**
 * **Apuntar a lo que se ve y disparar.** Se coloca la mira en el centro del
 * torso del rival **tal como está dibujado** —en el pasado, interpolado— y se
 * dispara desde ahí. Es literalmente lo que hace una persona.
 */
const disparar = (p) => p.evaluate(async () => {
  const { cliente, camara, cuerpoDe } = window.vektorNet
  const pose = cliente.poseDelRival()
  if (!pose) return null
  const cuerpo = cuerpoDe(pose.x, pose.z, pose.feetY, pose.eyeHeight)
  const alto = (cuerpo.legsTop + cuerpo.torsoTop) / 2
  const dx = pose.x - camara.position.x
  const dz = pose.z - camara.position.z
  const dy = alto - camara.position.y
  const plano = Math.hypot(dx, dz)
  // Ver `direccionDeMira`: al frente es −Z, así que el rumbo sale así.
  const yaw = Math.atan2(-dx, -dz)
  const pitch = Math.atan2(dy, plano)
  camara.rotation.y = yaw
  camara.rotation.x = pitch
  cliente.disparar(performance.now(), yaw, pitch)
  return { distancia: plano }
})

const reiniciar = (p) => p.evaluate(() => {
  const m = window.vektorNet.cliente.medidas
  m.disparos = 0; m.acuerdos = 0; m.fantasmas = 0; m.sorpresas = 0
  m.acuerdosSinRebobinar = 0; m.retrocesoMax = 0; m.detalle.length = 0; m.danoTotal = 0
})
const red = (p, latenciaMs, jitterMs, perdida) => p.evaluate((o) => {
  Object.assign(window.vektorNet.enlace, o)
}, { latenciaMs, jitterMs, perdida })
const leer = (p) => p.evaluate(() => {
  const m = window.vektorNet.cliente.medidas
  const c = window.vektorNet.cliente
  return { ...m, detalle: m.detalle.map((d) => ({ ...d })), vida: c.vida, bajas: c.bajas ?? 0, muertes: c.muertes ?? 0 }
})
/**
 * **Lo que compra rebobinar, medido sólo donde podía importar.** Un disparo a un
 * blanco que apenas se ha movido lo acierta cualquiera de los dos métodos; el
 * corte es el radio del cuerpo, porque por debajo de eso el rival sigue estando
 * donde estaba.
 */
const RADIO = 0.4
const resumen = (detalle) => {
  const n = detalle.length
  // El corte es **lateral**: moverse hacia el tirador no te saca de la línea de
  // tiro, así que contar ese trozo del desplazamiento diluye la medida.
  const movidos = detalle.filter((d) => d.lateral > RADIO)
  const acierta = (xs, campo) => xs.filter((d) => d.yo === d[campo]).length
  return {
    n,
    con: n ? (100 * acierta(detalle, 'con')) / n : 0,
    sin: n ? (100 * acierta(detalle, 'sin')) / n : 0,
    movidos: movidos.length,
    conM: movidos.length ? (100 * acierta(movidos, 'con')) / movidos.length : NaN,
    sinM: movidos.length ? (100 * acierta(movidos, 'sin')) / movidos.length : NaN,
    // **Cuántos de tus disparos eran impacto.** Sin esta columna la tabla
    // engaña: si todo falla, los dos métodos «coinciden» al 100% y no se está
    // midiendo nada.
    tuyos: detalle.filter((d) => d.yo).length,
    serv: detalle.filter((d) => d.con).length,
    servSin: detalle.filter((d) => d.sin).length,
    retroMedio: n ? detalle.reduce((a, d) => a + d.retroceso, 0) / n : 0,
    latMedio: n ? detalle.reduce((a, d) => a + d.lateral, 0) / n : 0,
  }
}

/**
 * **Una tanda de disparos, manteniendo la premisa.** Si el blanco muere,
 * reaparece en su spawn —detrás del muro— y desde ahí no hay línea de tiro: el
 * resto de la tanda saldría «tapado» y las dos columnas coincidirían en el
 * fallo sin medir nada. Así que se le vuelve a colocar y se sigue.
 */
const tanda = async (n, pausaMs = 260, mover = true) => {
  let muertesPrevias = (await leer(B)).muertes
  let recolocadas = 0
  for (let i = 0; i < n; i++) {
    if (mover) await empujarBlanco()
    await disparar(A)
    await espera(pausaMs)
    const ahora = (await leer(B)).muertes
    if (ahora !== muertesPrevias) {
      muertesPrevias = ahora
      recolocadas += 1
      await pararBlanco()
      await colocar()
      vaivenLado = true
    }
  }
  // Que lleguen los últimos veredictos.
  await espera(1200)
  return recolocadas
}

PUESTOS = await elegirPuestos()
if (!PUESTOS) { console.log('  !! no hay par de puntos con línea de tiro'); process.exit(1) }
console.log(`puestos elegidos de los datos: tirador (${PUESTOS.tirador.x}, ${PUESTOS.tirador.z}) -> blanco (${PUESTOS.blanco.x}, ${PUESTOS.blanco.z}), ${PUESTOS.d.toFixed(1)} u`)
await colocar()

// **La premisa del banco, comprobada.** Si el tirador no tiene línea de tiro
// —el muro del spawn, una caja— todo falla, las dos columnas coinciden en el
// fallo y la tabla no mide nada. Eso ya pasó una vez.
await reiniciar(A)
await tanda(6, 220)
const premisa = resumen((await leer(A)).detalle)
console.log(`\ncomprobación previa: ${premisa.tuyos} de ${premisa.n} disparos de prueba entran`)
ok(premisa.tuyos >= 4, `hay línea de tiro de verdad antes de medir nada (${premisa.tuyos}/${premisa.n})`)

// ---------- 1. sin latencia ----------
console.log('\n[1] Sin latencia añadida: ¿ve el servidor lo mismo que tú?')
await red(A, 0, 0, 0); await red(B, 0, 0, 0)
await espera(800); await reiniciar(A)
await tanda(12)
let r = await leer(A)
console.log(`     ${r.disparos} disparos · acuerdo ${(100*r.acuerdos/r.disparos).toFixed(0)}% ` +
            `(fantasmas ${r.fantasmas}, sorpresas ${r.sorpresas}) · rebobinado ${r.rebobinadoMs} ms`)
ok(r.disparos >= 12, `llegaron los veredictos de ${r.disparos} de 16 disparos`)
ok(r.acuerdos === r.disparos, `sin latencia el acuerdo es total: ${r.acuerdos}/${r.disparos}`)

// ---------- 2. barrido de latencia: con y sin rebobinar ----------
console.log('\n[2] Con ping: lo que compra la compensación')
console.log('     ida(ms)  disparos  impactos: tú/serv/sin-reb.  acuerdo  sin reb.  pedía  concede  topados  lateral')
const filas = []
const donde = async (p) => p.evaluate(() => {
  const c = window.vektorNet.camara.position
  const r = window.vektorNet.cliente.poseDelRival()
  return `(${c.x.toFixed(1)}, ${c.z.toFixed(1)}) rival dibujado ${r ? `(${r.x.toFixed(1)}, ${r.z.toFixed(1)})` : 'ninguno'}`
})
for (const ida of [0, 25, 50, 80, 150]) {
  await red(A, ida, 0, 0)
  await espera(1200); await reiniciar(A)
  if (ida === 0) console.log(`     [sitio] A ${await donde(A)} · B ${await donde(B)}`)
  await tanda(16, 170)
  const x = await leer(A)
  const R = resumen(x.detalle)
  const pedido = R.n ? x.detalle.reduce((a, d) => a + d.pedidoMs, 0) / R.n : 0
  const topados = x.detalle.filter((d) => d.topado).length
  const f = { ida, ...R, reb: x.rebobinadoMs, retroMax: x.retrocesoMax, pedido, topados }
  filas.push(f)
  const pct = (v) => Number.isNaN(v) ? '  —  ' : (v.toFixed(0) + '%').padStart(5)
  console.log(`     ${String(ida).padStart(7)} ${String(R.n).padStart(9)} ` +
              `${String(`${R.tuyos}/${R.serv}/${R.servSin}`).padStart(26)} ${pct(R.con)}    ${pct(R.sin)} ` +
              `${(pedido.toFixed(0)+'ms').padStart(7)} ${(f.reb.toFixed(0)+'ms').padStart(8)} ${String(topados+'/'+R.n).padStart(8)}` +
              `   ${R.latMedio.toFixed(2)} u`)
}
const conMovimiento = filas.filter((f) => f.movidos >= 3)
// **El acuerdo se exige donde el tope no muerde.** Más allá, no compensar del
// todo es la decisión, no un fallo: lo que se mide entonces es cuánto cuesta.
const sinTope = filas.filter((f) => f.topados <= f.n * 0.2)
ok(filas.every((f) => f.tuyos >= f.n * 0.6),
   `y son disparos de verdad, no fallos que coinciden: acertaste ${filas.map(f=>f.tuyos+'/'+f.n).join(' ')}`)
if (!filas.every((f) => f.tuyos >= f.n * 0.6)) {
  const m = await leer(A)
  console.log('     primeros renglones:', JSON.stringify(m.detalle.slice(0, 4)))
}
ok(sinTope.length >= 2, `hay ${sinTope.length} escenarios en los que el tope no llega a morder`)
ok(sinTope.every((f) => f.con >= 95),
   `mientras el rebobinado cabe bajo el tope, el acuerdo es casi total: ${sinTope.map(f=>f.ida+'ms '+f.con.toFixed(0)+'%').join(' · ')}`)
const topados = filas.filter((f) => f.topados > f.n * 0.2)
if (topados.length) console.log(`     con el tope mordiendo (${topados.map(f=>f.ida+' ms').join(', ')} de ida) el acuerdo baja a ${topados.map(f=>f.con.toFixed(0)+'%').join(' / ')} — es el precio del tope, no un fallo`)
ok(conMovimiento.length >= 2, `hubo disparos con el blanco de verdad en movimiento en ${conMovimiento.length} escenarios`)
const conM = conMovimiento.reduce((a,f)=>a+f.conM,0) / conMovimiento.length
const sinM = conMovimiento.reduce((a,f)=>a+f.sinM,0) / conMovimiento.length
console.log(`     sólo donde el rival se había movido más de ${RADIO} u: con rebobinado ${conM.toFixed(0)}%, sin rebobinar ${sinM.toFixed(0)}%`)
ok(conM > sinM, `y ahí es donde se ve lo que compra: ${conM.toFixed(0)}% contra ${sinM.toFixed(0)}%`)
ok(filas[4].reb > filas[0].reb, `el rebobinado sigue al ping: ${filas[0].reb.toFixed(0)} -> ${filas[4].reb.toFixed(0)} ms`)

// ---------- 3. el tope ----------
console.log('\n[3] El tope de rebobinado, y lo que cuesta')
const { maxRewindMs } = await A.evaluate(() => window.vektorNet.NET)
for (const ida of [200, 300]) {
  await red(A, ida, 0, 0)
  await espera(1500); await reiniciar(A)
  await tanda(10)
  const x = await leer(A)
  console.log(`     ida ${ida} ms -> rebobinado ${x.rebobinadoMs} ms (tope ${maxRewindMs}) · acuerdo ${(100*x.acuerdos/Math.max(1,x.disparos)).toFixed(0)}% de ${x.disparos}`)
  ok(x.rebobinadoMs <= maxRewindMs + 0.01, `y nunca pasa del tope: ${x.rebobinadoMs} ms <= ${maxRewindMs}`)
}
await red(A, 0, 0, 0)

// ---------- 4. la cobertura sigue parando balas ----------
console.log('\n[4] Disparar a través de la Espina no cuenta')
await pararBlanco()
const tapado = await A.evaluate(async () => {
  const { cliente, camara, escenario } = window.vektorNet
  const { resolver: resolverDisparo, cuerpoDe: cuerpoDeJugador } = window.vektorNet
  // Dos puntos del Plano A con la Espina en medio, sacados de los datos y no a
  // mano: la pieza más larga del escenario que corta el mapa por la mitad.
  const cajas = escenario.boxes
  const espina = cajas.reduce((a, c) => (c.maxZ - c.minZ) > (a.maxZ - a.minZ) ? c : a)
  const cx = (espina.minX + espina.maxX) / 2
  const cz = (espina.minZ + espina.maxZ) / 2
  const origen = { x: cx - 6, y: 1.7, z: cz }
  const cuerpo = cuerpoDeJugador(cx + 6, cz, 0, 1.7)
  const yaw = Math.atan2(-(cuerpo.x - origen.x), -(cuerpo.z - origen.z))
  const conMuro = resolverDisparo(origen, yaw, 0, cuerpo, escenario.occluders)
  const sinMuro = resolverDisparo(origen, yaw, 0, cuerpo, [])
  return { espina: { alto: espina.top, largo: +(espina.maxZ - espina.minZ).toFixed(1) }, conMuro, sinMuro }
})
console.log(`     pieza de ${tapado.espina.largo} u de largo y ${tapado.espina.alto} de alto entre los dos`)
console.log(`     sin cobertura: ${tapado.sinMuro.impacto ? tapado.sinMuro.zona : 'fallo'} · con cobertura: ${tapado.conMuro.impacto ? tapado.conMuro.zona : (tapado.conMuro.tapado ? 'tapado' : 'fallo')}`)
ok(tapado.sinMuro.impacto, 'el disparo entra si no hay nada en medio')
ok(!tapado.conMuro.impacto && tapado.conMuro.tapado, 'y lo para la cobertura, con el mismo `hasLineOfSight` del motor')

// ---------- 5. daño y vida ----------
console.log('\n[5] El impacto quita vida, con el modelo de zonas de siempre')
await colocar()
await espera(500); await reiniciar(A)
const antes = await leer(B)
await tanda(6, 300)
const despues = await leer(B)
const ra = await leer(A)
console.log(`     ${ra.disparos} disparos · daño dado por bueno: ${ra.danoTotal} · vida del blanco ${antes.vida} -> ${despues.vida}` +
            (despues.muertes > antes.muertes ? ` (murió ${despues.muertes - antes.muertes} vez)` : ''))
// **No vale mirar sólo la vida final**: si el blanco muere, reaparece con 100 y
// parecería que no se le ha quitado nada. Lo que se mide es el daño dado.
ok(ra.danoTotal > 0, `los impactos quitan vida de verdad: ${ra.danoTotal} de daño`)
ok(despues.vida < antes.vida || despues.muertes > antes.muertes,
   `y se nota en el blanco (${antes.vida} -> ${despues.vida}, muertes ${antes.muertes} -> ${despues.muertes})`)
const zonasVistas = [...new Set(ra.detalle.filter((d) => d.con).map((d) => d.dano))].sort((a,b)=>a-b)
ok(zonasVistas.every((v) => [34, 50, 100].includes(v)),
   `y el daño sale del modelo de zonas de siempre, sin una segunda tabla: ${zonasVistas.join(' / ')}`)

// ---------- 6. coste ----------
console.log('\n[6] Lo que cuesta resolver un disparo')
const coste = await A.evaluate(async () => {
  const { resolver: resolverDisparo, cuerpoDe: cuerpoDeJugador } = window.vektorNet
  const { escenario, camara } = window.vektorNet
  const cuerpo = cuerpoDeJugador(camara.position.x, camara.position.z - 8, 0, 1.7)
  const origen = { x: camara.position.x, y: 1.7, z: camara.position.z }
  const medir = (fn) => {
    for (let i = 0; i < 300; i++) fn()
    const m = []
    for (let r = 0; r < 60; r++) {
      const t = performance.now()
      for (let i = 0; i < 300; i++) fn()
      m.push((performance.now() - t) / 300)
    }
    m.sort((a, b) => a - b)
    return { p50: m[30], p99: m[59] }
  }
  return {
    // Tres caminos, y se miden por separado porque cuestan cosas distintas.
    // yaw 0 mira a −Z, que es donde está puesto el cuerpo; π es darle la
    // espalda. No se comprueba el veredicto contra el mapa —depende de dónde
    // haya acabado el tirador—: lo que se mide aquí es el coste de cada camino.
    corte: medir(() => resolverDisparo(origen, 0, 0, cuerpo, [])),
    completo: medir(() => resolverDisparo(origen, 0, 0, cuerpo, escenario.occluders)),
    falla: medir(() => resolverDisparo(origen, Math.PI, 0, cuerpo, escenario.occluders)),
    entraSinMapa: resolverDisparo(origen, 0, 0, cuerpo, []).impacto,
    oclusores: escenario.occluders.length,
  }
})
const { NET } = await A.evaluate(() => ({ NET: window.vektorNet.NET }))
const memoria = NET.historyTicks * 8 * 8
console.log(`     corte analítico contra el cuerpo (sin mapa)        : p50 ${(coste.corte.p50*1000).toFixed(1)} µs`)
console.log(`     corte + rayo de cobertura contra ${coste.oclusores} oclusores      : p50 ${(coste.completo.p50*1000).toFixed(1)} µs · p99 ${(coste.completo.p99*1000).toFixed(1)} µs`)
console.log(`     disparo que ni roza el cuerpo (sale por el corte)   : p50 ${(coste.falla.p50*1000).toFixed(1)} µs`)
console.log(`     historial: ${NET.historyTicks} pasos × 8 números ≈ ${(memoria/1024).toFixed(1)} KB por jugador (${(NET.historyTicks*16.667/1000).toFixed(1)} s)`)
ok(coste.entraSinMapa, 'el caso medido entra de verdad en el cuerpo')
ok(coste.completo.p99 < 0.2, `resolver un disparo cabe de sobra en el presupuesto de la casa (${(coste.completo.p99*1000).toFixed(1)} µs p99)`)
ok(coste.falla.p50 < coste.completo.p50,
   `y el que ni roza cuesta menos, porque no llega a gastar rayo (${(coste.falla.p50*1000).toFixed(1)} contra ${(coste.completo.p50*1000).toFixed(1)} µs)`)

console.log(`\n=== tiro46: ${fail === 0 ? 'todo verde' : fail + ' FALLOS'} ===`)
for (const n of navegadores) await n.close()
process.exit(fail ? 1 : 0)
