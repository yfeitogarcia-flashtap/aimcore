/**
 * gizmo93 — los cuatro arreglos de Alchemist de la vuelta 93.
 *
 *  [1] Un tirador no tapa la pieza que agarra. Se mide **en píxeles de
 *      pantalla**, contra el ancho de la pieza en la misma captura: «es más
 *      pequeño» no es la medida, «cabe dentro de lo que agarra» sí.
 *  [2] El tirador de escala uniforme escala los tres lados conservando la
 *      proporción, con la esquina mínima clavada.
 *  [3] Ctrl+C / Ctrl+V, y una copia nunca sale dentro de otra pieza.
 *  [4] «Probar» en un mapa de duelo sale en una salida, y alterna de lado.
 */
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:5192'

/**
 * **El banco se trae su propia imagen.** El brazo [7] necesita algo en
 * `public/estampados/`, y depender de que alguien haya dejado un logo ahí es un
 * brazo que se salta en silencio — que es exactamente lo que la vuelta 57 dice
 * que no vale. Es un PNG de 8×8 transparente, y se borra al terminar: lo que no
 * se va a jugar no se queda en el repositorio.
 */
const CARPETA = 'public/estampados'
const CEBO = `${CARPETA}/banco93.png`
const nuestro = !existsSync(CEBO)
if (nuestro) {
  mkdirSync(CARPETA, { recursive: true })
  writeFileSync(CEBO, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJUlEQVR42mP8z8DAwMDAwMDAwMDAwM'
    + 'DAwMDAwMDAwMDAwMDAwAAAJ0wD/wJ0WjAAAAAASUVORK5CYII=', 'base64'))
}
const limpiarCebo = () => { if (nuestro) rmSync(CEBO, { force: true }) }
let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}

const navegador = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 820 } })
const errores = []
pagina.on('pageerror', (e) => errores.push(e.message))
await pagina.goto(`${BASE}/editor/`, { waitUntil: 'load' })
await pagina.waitForTimeout(2500)

// El asa de la página, que es como se toca el estado vivo sin importar el
// módulo por tu cuenta (vuelta 91).
const hayAsa = await pagina.evaluate(() => Boolean(window.vektorEditor))
if (!hayAsa) { console.log('  SIN ASA: window.vektorEditor no existe'); await navegador.close(); process.exit(1) }

// ------------------------------------------------------------------ [1] tamaño
console.log('\n[1] Un tirador no tapa la pieza que agarra')

/**
 * Mide en píxeles proyectando con la cámara del editor: es la misma matriz que
 * dibuja, así que lo que sale es lo que se ve. Se compara el lado del tirador
 * contra el ancho de la pieza en la MISMA captura, que es el denominador
 * (vuelta 46) — un tirador de veinte píxeles es enorme sobre una pieza de
 * treinta y diminuto sobre una de trescientos.
 */
const medir = async (w, d, kind) => {
  await pagina.evaluate(({ w, d, kind }) => {
    window.vektorEditor.cargar({
      clave: 'banco', label: 'banco',
      room: { width: 40, depth: 40, height: 10 },
      spawn: { x: 0, z: 17 },
      boxes: [{ x: -w / 2, z: -d / 2, w, d, kind }],
    }, 'banco')
    window.vektorEditor.elegir(0)
  }, { w, d, kind })
  // Un frame: la escala del gizmo se aplica en el bucle, no al repintar.
  await pagina.waitForTimeout(150)
  return pagina.evaluate(() => {
    const e = window.vektorEditor
    const pieza = e.mapa.boxes[0]
    const px = e.proyectar
    // Ancho aparente de la pieza: sus dos esquinas de la diagonal en planta.
    const a = px(pieza.x, 0, pieza.z)
    const b = px(pieza.x + pieza.w, 0, pieza.z + pieza.d)
    const anchoPieza = Math.hypot(b.x - a.x, b.y - a.y)
    // Lado aparente de un tirador de esquina: su escala por su geometría.
    const t = e.tiradoresDePieza[0]
    const lado = e.TIRADOR * t.scale.x
    const c = px(t.position.x - lado / 2, t.position.y, t.position.z)
    const c2 = px(t.position.x + lado / 2, t.position.y, t.position.z)
    const anchoTirador = Math.hypot(c2.x - c.x, c2.y - c.y)
    return { anchoPieza, anchoTirador, escala: t.scale.x, alto: e.coverHeight(pieza.kind) }
  })
}

for (const [w, d, kind, etiqueta] of [
  [1, 1, 'bordillo', 'plataforma de dispositivo 1×1 bordillo'],
  [1.2, 1.2, 'media', 'pieza pequeña 1.2×1.2 media'],
  [8, 8, 'alta', 'pieza grande 8×8 alta'],
]) {
  const m = await medir(w, d, kind)
  const fraccion = m.anchoTirador / m.anchoPieza
  afirmar(fraccion <= 0.4,
    `${etiqueta}: tirador ${m.anchoTirador.toFixed(1)} px de ${m.anchoPieza.toFixed(1)} px de pieza = ${(fraccion * 100).toFixed(0)}% (escala ${m.escala.toFixed(2)})`)
}

// ------------------------------------------------------------- [2] uniforme
console.log('\n[2] La escala uniforme conserva la proporción y clava la esquina mínima')

const uniforme = await pagina.evaluate(() => {
  const e = window.vektorEditor
  e.cargar({
    clave: 'banco', label: 'banco',
    room: { width: 40, depth: 40, height: 10 },
    spawn: { x: 0, z: 17 },
    boxes: [{ x: 0, z: 0, w: 2, d: 4, kind: 'baja' }],
  }, 'banco')
  e.elegir(0)
  const antes = { ...e.mapa.boxes[0] }
  const altoAntes = e.coverHeight(antes.kind)
  // Se arrastra la bola: se agarra y se lleva al doble de la diagonal.
  e.arrastrarTirador('pieza-uniforme', { x: antes.w * 2, z: antes.d * 2 })
  const ahora = { ...e.mapa.boxes[0] }
  return { antes, ahora, altoAntes, altoAhora: e.coverHeight(ahora.kind) }
})
const { antes, ahora, altoAntes, altoAhora } = uniforme
afirmar(ahora.x === antes.x && ahora.z === antes.z,
  `la esquina mínima no se mueve: (${ahora.x}, ${ahora.z})`)
const razonAntes = antes.w / antes.d
const razonAhora = ahora.w / ahora.d
afirmar(Math.abs(razonAhora - razonAntes) < 0.02,
  `la proporción se conserva: ${razonAntes.toFixed(3)} → ${razonAhora.toFixed(3)} (${antes.w}×${antes.d} → ${ahora.w}×${ahora.d})`)
afirmar(ahora.w > antes.w * 1.5 && ahora.d > antes.d * 1.5,
  `y crece de verdad: ×${(ahora.w / antes.w).toFixed(2)} de ancho`)
afirmar(altoAhora > altoAntes,
  `y el alto sube de escalón: ${antes.kind} (${altoAntes}) → ${ahora.kind} (${altoAhora})`)

// -------------------------------------------------------------- [3] duplicar
console.log('\n[3] Una copia nunca sale dentro de otra pieza')

const copia = await pagina.evaluate(async () => {
  const e = window.vektorEditor
  // El caso que se reportó: una pieza pequeña pegada a una grande. Al lado de
  // la pequeña —x + w + paso— está DENTRO de la grande.
  e.cargar({
    clave: 'banco', label: 'banco',
    room: { width: 40, depth: 40, height: 10 },
    spawn: { x: 0, z: 17 },
    boxes: [
      { x: -10, z: -10, w: 20, d: 20, kind: 'alta' },
      { x: -11, z: 0, w: 1, d: 1, kind: 'bordillo' },
    ],
  }, 'banco')
  e.elegir(1)
  const pequena = { ...e.mapa.boxes[1] }
  document.getElementById('duplicar').click()
  const nueva = { ...e.mapa.boxes[e.mapa.boxes.length - 1] }
  const grande = e.mapa.boxes[0]
  const dentro = nueva.x < grande.x + grande.w && nueva.x + nueva.w > grande.x
    && nueva.z < grande.z + grande.d && nueva.z + nueva.d > grande.z
  const distancia = Math.hypot(nueva.x - pequena.x, nueva.z - pequena.z)
  // Y con teclado de verdad: Ctrl+C y Ctrl+V.
  const cuantasAntes = e.mapa.boxes.length
  return { pequena, nueva, dentro, distancia, grande: { ...grande }, cuantasAntes }
})
afirmar(!copia.dentro,
  `la copia sale fuera de la grande: (${copia.nueva.x}, ${copia.nueva.z}) contra la caja [${copia.grande.x}..${copia.grande.x + copia.grande.w}]`)
afirmar(copia.distancia <= 4,
  `y cerca de la original: ${copia.distancia.toFixed(2)} u`)

// Teclado de verdad, no una llamada: el atajo es lo que se pidió.
await pagina.evaluate(() => { window.vektorEditor.elegir(1) })
await pagina.keyboard.down('Control')
await pagina.keyboard.press('KeyC')
await pagina.keyboard.press('KeyV')
await pagina.keyboard.press('KeyV')
await pagina.keyboard.up('Control')
await pagina.waitForTimeout(200)
const trasTeclado = await pagina.evaluate(() => {
  const e = window.vektorEditor
  const grande = e.mapa.boxes[0]
  const nuevas = e.mapa.boxes.slice(3)
  return {
    cuantas: e.mapa.boxes.length,
    dentro: nuevas.filter((n) =>
      n.x < grande.x + grande.w && n.x + n.w > grande.x
      && n.z < grande.z + grande.d && n.z + n.d > grande.z).length,
    solapadas: nuevas.filter((a, i) => nuevas.some((b, j) =>
      i !== j && a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z)).length,
  }
})
afirmar(trasTeclado.cuantas === copia.cuantasAntes + 2,
  `Ctrl+C y dos Ctrl+V pegan dos piezas: ${copia.cuantasAntes} → ${trasTeclado.cuantas}`)
afirmar(trasTeclado.dentro === 0, `ninguna de las dos cae dentro de la grande`)
afirmar(trasTeclado.solapadas === 0, `ni una sobre la otra`)

// ----------------------------------------------------------------- [4] probar
console.log('\n[4] Probar un mapa de duelo sale en una salida, y alterna')

const salidas = [{ x: -14, z: -14, yaw: 0.6 }, { x: 14, z: 14, yaw: -2.5 }]
const dondeSale = async () => pagina.evaluate(async (salidas) => {
  const e = window.vektorEditor
  e.cargar({
    clave: 'banco-duelo', label: 'banco duelo', soloDuelo: true,
    room: { width: 40, depth: 40, height: 10 },
    spawn: { x: 0, z: 0 },
    boxes: [{ x: -2, z: -2, w: 4, d: 4, kind: 'alta' }],
    duelo: { salidas },
  }, 'banco-duelo')
  e.probar()
  await new Promise((r) => setTimeout(r, 700))
  const m = e.motor
  const p = { x: m.camera.position.x, z: m.camera.position.z, yaw: m.camera.rotation.y }
  const spawn = { x: m.movement.spawnX, z: m.movement.spawnZ }
  e.dejarDeProbar()
  await new Promise((r) => setTimeout(r, 400))
  return { p, spawn }
}, salidas)

for (const esperada of [0, 1, 0]) {
  const { p, spawn } = await dondeSale()
  const s = salidas[esperada]
  const cerca = Math.hypot(p.x - s.x, p.z - s.z)
  afirmar(cerca < 0.5,
    `sale en la salida ${esperada + 1}: (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) contra (${s.x}, ${s.z}) — ${cerca.toFixed(3)} u`)
  afirmar(Math.abs(spawn.x - s.x) < 1e-6 && Math.abs(spawn.z - s.z) < 1e-6,
    `y el spawn también, así que reaparecer vuelve ahí`)
  afirmar(Math.abs(p.yaw - s.yaw) < 0.02,
    `mirando a su rumbo: ${p.yaw.toFixed(3)} contra ${s.yaw}`)
}

// Y un mapa que no es de duelo no cambia de comportamiento.
const normal = await pagina.evaluate(async () => {
  const e = window.vektorEditor
  e.cargar({
    clave: 'banco', label: 'banco',
    room: { width: 40, depth: 40, height: 10 },
    spawn: { x: 3, z: 17 },
    boxes: [{ x: -2, z: -2, w: 4, d: 4, kind: 'alta' }],
  }, 'banco')
  e.probar()
  await new Promise((r) => setTimeout(r, 700))
  const p = { x: e.motor.camera.position.x, z: e.motor.camera.position.z }
  e.dejarDeProbar()
  return p
})
afirmar(Math.hypot(normal.x - 3, normal.z - 17) < 0.5,
  `un mapa de entrenamiento sigue saliendo en su spawn: (${normal.x.toFixed(2)}, ${normal.z.toFixed(2)}) contra (3, 17)`)

// -------------------------------------------------------------- [5] el tinte
console.log('\n[5] El tinte se elige viendo el color, y llega al mundo')

const tinte = await pagina.evaluate(async () => {
  const e = window.vektorEditor
  e.cargar({
    clave: 'banco', label: 'banco',
    room: { width: 40, depth: 40, height: 10 },
    spawn: { x: 0, z: 17 },
    boxes: [{ x: 0, z: 0, w: 4, d: 4, kind: 'alta' }],
  }, 'banco')
  e.elegir(0)
  e.abrirPanel(true, 'construir')
  await new Promise((r) => setTimeout(r, 300))

  const muestras = [...document.querySelectorAll('#p-tintes .tinte')].map((n) => ({
    tinte: n.dataset.tinte,
    // El color se lee del estilo en línea, que es el que pinta el ::before.
    color: n.style.getPropertyValue('--tinte').trim(),
    caja: (({ width, height }) => ({ width, height }))(n.getBoundingClientRect()),
  }))
  return { muestras }
})
afirmar(tinte.muestras.length >= 8,
  `hay una muestra por tinte más la del gris: ${tinte.muestras.length}`)
afirmar(tinte.muestras.every((m) => m.caja.width > 20 && m.caja.height > 20),
  `y todas se ven: la más pequeña mide ${Math.min(...tinte.muestras.map((m) => m.caja.width)).toFixed(0)}×${Math.min(...tinte.muestras.map((m) => m.caja.height)).toFixed(0)} px`)
afirmar(tinte.muestras[0].tinte === '',
  'la primera es «sin tinte», que es la de fábrica')
afirmar(new Set(tinte.muestras.map((m) => m.color)).size === tinte.muestras.length,
  `y ninguna repite color: ${tinte.muestras.map((m) => m.color).join(' ')}`)

const aplicado = await pagina.evaluate(async () => {
  const e = window.vektorEditor
  const antes = e.escenario?.occluders?.length ?? 0
  document.querySelector('#p-tintes .tinte[data-tinte="musgo"]').click()
  await new Promise((r) => setTimeout(r, 400))
  // El color del material que la escena ha montado para esa pieza.
  const colores = (e.escenario?.occluders ?? []).map((m) => `#${m.material.color.getHexString()}`)
  return { tinte: e.mapa.boxes[0].tinte, antes, colores, puesto: document.querySelector('#p-tintes .tinte--puesto')?.dataset.tinte }
})
afirmar(aplicado.tinte === 'musgo', `un clic escribe el tinte en el mapa: «${aplicado.tinte}»`)
afirmar(aplicado.puesto === 'musgo', 'y la muestra queda marcada')
afirmar(aplicado.colores.includes('89a181'.replace(/^/, '#')),
  `y la malla del mundo sale con ese color: ${JSON.stringify(aplicado.colores)}`)

const quitado = await pagina.evaluate(async () => {
  const e = window.vektorEditor
  document.querySelector('#p-tintes .tinte[data-tinte=""]').click()
  await new Promise((r) => setTimeout(r, 400))
  return {
    tinte: e.mapa.boxes[0].tinte,
    enElFichero: 'tinte' in e.mapa.boxes[0],
    colores: (e.escenario?.occluders ?? []).map((m) => `#${m.material.color.getHexString()}`),
  }
})
afirmar(quitado.tinte === undefined && !quitado.enElFichero,
  'volver al gris **borra el campo**: lo de fábrica no se guarda (vuelta 83)')
afirmar(quitado.colores.includes('#9a9a9a'),
  `y la pieza vuelve a su gris de altura: ${JSON.stringify(quitado.colores)}`)

// ------------------------------------------------ [6] rampa y escalera en Alchemist
console.log('\n[6] La rampa y la escalera se colocan y se giran')

const colocar = async (forma) => pagina.evaluate(async (forma) => {
  const e = window.vektorEditor
  e.cargar({
    clave: 'banco', label: 'banco',
    room: { width: 40, depth: 40, height: 10 },
    spawn: { x: 0, z: 17 },
  }, 'banco')
  e.abrirPanel(true, 'construir')
  await new Promise((r) => setTimeout(r, 250))
  document.querySelector(`#formas button[data-forma="${forma}"]`).click()
  await new Promise((r) => setTimeout(r, 400))
  return {
    ramps: e.mapa.ramps ?? [],
    escaleras: e.mapa.escaleras ?? [],
    fichaRampa: !document.getElementById('rampa').hidden,
    fichaEscalera: !document.getElementById('escalera').hidden,
    notaRampa: document.getElementById('r-nota').textContent,
    notaEscalera: document.getElementById('e-nota').textContent,
    aviso: document.getElementById('e-aviso').hidden ? '' : document.getElementById('e-aviso').textContent,
  }
}, forma)

const r = await colocar('rampa')
afirmar(r.ramps.length === 1, `un clic pone una rampa: ${r.ramps.length}`)
afirmar(r.fichaRampa, 'y abre su ficha')
afirmar(/inclinación/.test(r.notaRampa), `que dice lo que se va a notar: «${r.notaRampa}»`)
afirmar(r.ramps[0].fromZ !== undefined, 'nace subiendo en Z, hacia donde mira quien la coloca')

// Girarla cambia el eje, no la huella.
const girada = await pagina.evaluate(async () => {
  const e = window.vektorEditor
  const antes = { ...e.mapa.ramps[0] }
  document.getElementById('r-rumbo').value = '1'
  document.getElementById('r-rumbo').dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise((res) => setTimeout(res, 300))
  const ahora = { ...e.mapa.ramps[0] }
  return { antes, ahora }
})
afirmar(girada.ahora.fromX !== undefined && girada.ahora.fromZ === undefined,
  `girarla la pasa al eje X: ${JSON.stringify(girada.ahora)}`)
afirmar(girada.ahora.x === girada.antes.x && girada.ahora.z === girada.antes.z
  && girada.ahora.w === girada.antes.w && girada.ahora.d === girada.antes.d,
  'y no le mueve la huella: girar no la muda de sitio')

const esc = await colocar('escalera')
afirmar(esc.escaleras.length === 1, `un clic pone una escalera: ${esc.escaleras.length}`)
afirmar(esc.fichaEscalera, 'y abre su ficha')
afirmar(/escalón\(es\) de/.test(esc.notaEscalera), `que dice cuántos monta: «${esc.notaEscalera}»`)
afirmar(/no se sube andando/.test(esc.aviso),
  `y avisa de que ha subido el número: «${esc.aviso}»`)

// Y probar la monta de verdad, con el motor.
const probada = await pagina.evaluate(async () => {
  const e = window.vektorEditor
  e.probar()
  await new Promise((r) => setTimeout(r, 900))
  const esc = e.motor.scenario
  const cajas = esc.boxes.length
  e.dejarDeProbar()
  await new Promise((r) => setTimeout(r, 300))
  return { cajas }
})
afirmar(probada.cajas >= 11,
  `y al probar el motor monta sus escalones: ${probada.cajas} cajas`)

// ------------------------------------------------------- [7] estampados
console.log('\n[7] Un estampado se coloca, se ve y llega al mundo')

const est = await pagina.evaluate(async () => {
  const e = window.vektorEditor
  e.cargar({
    clave: 'banco', label: 'banco',
    room: { width: 40, depth: 40, height: 10 },
    spawn: { x: 0, z: 17 },
    boxes: [{ x: -4, z: -19, w: 8, d: 1, kind: 'alta' }],
  }, 'banco')
  e.abrirPanel(true, 'mapa')
  await new Promise((r) => setTimeout(r, 300))
  const imagenes = [...document.querySelectorAll('#est-imagen option')].map((o) => o.value)
  if (imagenes.length === 0) return { imagenes }
  document.getElementById('est-poner').click()
  await new Promise((r) => setTimeout(r, 500))
  return {
    imagenes,
    estampados: e.mapa.estampados ?? [],
    ficha: !document.getElementById('est-ficha').hidden,
    lista: [...document.querySelectorAll('#est-lista button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
    cuenta: document.getElementById('cuenta-estampados').textContent,
    // Y el marcador: se coloca **viendo la imagen**, así que hay una malla.
    marcadores: e.marcas.children.flatMap((g) => g.children)
      .filter((m) => m.userData?.marca?.que === 'est').length,
  }
})

if (!est.imagenes?.length) {
  console.log('  SALTADO: no hay ninguna imagen en public/estampados/')
} else {
  afirmar(est.estampados.length === 1, `un clic coloca un estampado: ${est.estampados.length}`)
  afirmar(est.ficha, 'y abre su ficha')
  afirmar(/de 4/.test(est.cuenta), `la barra de la sección cuenta cuántos caben: «${est.cuenta}»`)
  afirmar(est.lista.length === 1, `y lo lista para poder volver a encontrarlo: ${JSON.stringify(est.lista)}`)
  afirmar(est.marcadores === 1, `y su marcador es una malla pinchable: ${est.marcadores}`)

  // El tope: pasado el cuarto, el botón se apaga.
  const tope = await pagina.evaluate(async () => {
    for (let i = 0; i < 5; i++) {
      document.getElementById('est-poner').click()
      await new Promise((r) => setTimeout(r, 120))
    }
    return {
      cuantos: window.vektorEditor.mapa.estampados.length,
      apagado: document.getElementById('est-poner').disabled,
    }
  })
  afirmar(tope.cuantos === 4, `no se pueden colocar más de cuatro: ${tope.cuantos}`)
  afirmar(tope.apagado, 'y el botón se apaga en vez de rechazar en silencio')

  // Y al probar, el motor lo monta: en su grupo, y no en los oclusores.
  const enElMundo = await pagina.evaluate(async () => {
    const e = window.vektorEditor
    e.probar()
    await new Promise((r) => setTimeout(r, 1400))
    const esc = e.motor.scenario
    const grupo = esc.estampados?.grupo
    const mallas = grupo?.children ?? []
    const out = {
      montados: mallas.length,
      conTextura: mallas.filter((m) => Boolean(m.material.map)).length,
      opacos: mallas.filter((m) => m.material.opacity > 0).length,
      enOcluders: esc.occluders.filter((m) => grupo?.children.includes(m)).length,
      // Su grupo cuelga de la escena y no del grupo de geometría, que es lo que
      // lo deja fuera del presupuesto por construcción.
      fueraDelGrupo: grupo?.parent !== esc.group,
    }
    e.dejarDeProbar()
    await new Promise((r) => setTimeout(r, 300))
    return out
  })
  afirmar(enElMundo.montados === 4, `el motor monta los cuatro: ${enElMundo.montados}`)
  afirmar(enElMundo.conTextura === 4,
    `y los cuatro reciben su imagen: ${enElMundo.conTextura}`)
  afirmar(enElMundo.opacos === 4, `y se ven: ${enElMundo.opacos} con opacidad > 0`)
  afirmar(enElMundo.enOcluders === 0, 'ninguno entra en los oclusores: no para balas')
  afirmar(enElMundo.fueraDelGrupo, 'y su grupo no es el de la geometría: fuera del presupuesto')
}

afirmar(errores.length === 0, `errores de página: ${errores.length}${errores.length ? ' — ' + errores[0] : ''}`)
await navegador.close()
limpiarCebo()
console.log(`\n${fallos === 0 ? 'TODO VERDE' : `${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
