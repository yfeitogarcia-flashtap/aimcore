/**
 * Air-strafe: **¿de qué depende lo que se nota?**
 *
 * El síntoma reportado es «se siente inconsistente, en según qué sesión parece
 * funcionar mejor que en otra», y eso no se arregla subiendo la ganancia a
 * ciegas: lo que hay que encontrar primero es **qué cambia entre sesiones**.
 * Lo único que cambia de una sesión a otra en el aire es el arma que llevas —el
 * peso decide la marcha con la que despegas— y el mapa.
 */
import { MovementController } from '../src/game/movement.js'
import { MOVEMENT, WEAPONS, fisicaDeEscenario } from '../src/config.js'

const DEG = Math.PI / 180

function camaraFalsa() {
  const pos = {
    x: 0, y: 0, z: 0,
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this },
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this },
  }
  return { position: pos, rotation: { x: 0, y: 0, z: 0 } }
}

/** Seis saltos encadenados girando al óptimo, con un arma y una física. */
function cadena({ arma, fisica = null, gradosPorSeg = -40, saltos = 6, hz = 60 }) {
  const cam = camaraFalsa()
  const m = new MovementController(cam)
  m.setEnabled(true)
  m.reset?.()
  if (fisica) m.fisica = fisica
  m.setWeaponWeight(WEAPONS[arma].weight)
  const dt = 1 / hz
  const paso = 1000 / hz
  let now = 0
  m.keys.forward = true
  for (let t = 0; t < 1500; t += paso) { m.update(dt, now); now += paso }
  const v0 = m.horizontalSpeed
  m.keys.forward = true
  m.keys.right = true
  let pico = v0
  for (let s = 0; s < saltos; s++) {
    m.pressJump(now)
    m.keys.jump = true
    m.update(dt, now); now += paso
    m.keys.jump = false
    let n = 0
    while (m.airborne && n < 2000) {
      cam.rotation.y += gradosPorSeg * DEG * dt
      m.update(dt, now); now += paso; n += 1
      const v = Math.hypot(m._airVelX, m._airVelZ)
      if (v > pico) pico = v
    }
    // Encadenar: la siguiente pulsación cae dentro de la ventana.
  }
  return { v0, pico, techo: (m.fisica ?? MOVEMENT).airStrafeMaxSpeed ?? MOVEMENT.airStrafeMaxSpeed }
}

let fallos = 0
const afirmar = (n, c, d = '') => {
  console.log((c ? '  ok  ' : '  FALLO ') + n + (d ? ` — ${d}` : ''))
  if (!c) fallos += 1
}

console.log(`  techo del aire ${MOVEMENT.airStrafeMaxSpeed} · carrera base ${MOVEMENT.speed}\n`)
console.log('  arma      despega a   pico tras 6 saltos   gana')
const filas = []
for (const arma of ['pulse', 'reaper', 'volt', 'bow', 'scout', 'rift', 'pump', 'u2', 'titan']) {
  const r = cadena({ arma })
  const gana = ((r.pico / r.v0) - 1) * 100
  filas.push({ arma, ...r, gana })
  console.log(`  ${arma.padEnd(9)} ${r.v0.toFixed(3).padStart(7)}  ${r.pico.toFixed(3).padStart(14)}  ${(gana >= 0 ? '+' : '') + gana.toFixed(1).padStart(6)}%`)
}

const mejor = filas.reduce((a, b) => (b.gana > a.gana ? b : a))
const peor = filas.reduce((a, b) => (b.gana < a.gana ? b : a))
console.log(`\n  lo que más gana: ${mejor.arma} (+${mejor.gana.toFixed(1)}%) · lo que menos: ${peor.arma} (+${peor.gana.toFixed(1)}%)`)
console.log(`  todas llegan al techo: ${filas.every((f) => Math.abs(f.pico - MOVEMENT.airStrafeMaxSpeed) < 0.05) ? 'sí' : 'no'}`)

// Y con la física de Los Pilares, que sube el techo a 12.
const pilares = fisicaDeEscenario('pilares')
console.log(`\n  Los Pilares: gravedad ${pilares.gravity} · techo del aire ${pilares.airStrafeMaxSpeed}`)
const conPulse = cadena({ arma: 'pulse', fisica: pilares })
console.log(`  con Pulse: despega a ${conPulse.v0.toFixed(3)} y llega a ${conPulse.pico.toFixed(3)}`)

/**
 * **Y lo que de verdad decide es cuántos saltos hacen falta.** El techo son
 * 9.5 y con la ganancia de hoy un jugador con la pistola llega a 7.75 en seis
 * saltos perfectos: el 82%. En un mapa de 40×40 no hay sitio para seis saltos
 * seguidos, así que lo que se nota depende de cuántos te dejó encadenar el
 * mapa — que es exactamente «en según qué sesión parece funcionar mejor».
 */
console.log('\n  cuántos saltos hacen falta para llegar al techo (Pulse, 40°/s)')
for (const n of [1, 2, 3, 4, 6, 10, 16, 24]) {
  const r = cadena({ arma: 'pulse', saltos: n })
  const pct = (r.pico / MOVEMENT.airStrafeMaxSpeed) * 100
  console.log(`  ${String(n).padStart(2)} saltos → ${r.pico.toFixed(3)} u/s (${pct.toFixed(0)}% del techo)`)
}

/**
 * **Y cuál de los dos números manda.** El encargo preguntaba por
 * `airAccel`/`airWishFactor`, y no son intercambiables: la aceleración de un
 * paso es `min(airAccel · wishSpeed · dt, wishSpeed − proyección)`, y en el
 * aire la proyección ya está pegada a `wishSpeed` — así que **lo que acota es
 * siempre el segundo término** y subir `airAccel` no cambia ni un decimal.
 */
console.log('\n  subir airAccel (hoy 10) no hace nada, y se ve:')
for (const accel of [10, 14, 24, 60]) {
  const antes = MOVEMENT.airAccel
  MOVEMENT.airAccel = accel
  const seis = cadena({ arma: 'pulse', saltos: 6 })
  MOVEMENT.airAccel = antes
  console.log(`  airAccel ${String(accel).padStart(2)} → 6 saltos ${seis.pico.toFixed(4)} u/s`)
}
console.log('\n  el que manda es airWishFactor (hoy 0.12)')
for (const wish of [0.12, 0.16, 0.20, 0.26, 0.34]) {
  const antes = MOVEMENT.airWishFactor
  MOVEMENT.airWishFactor = wish
  const uno = cadena({ arma: 'pulse', saltos: 1 })
  const tres = cadena({ arma: 'pulse', saltos: 3 })
  const seis = cadena({ arma: 'pulse', saltos: 6 })
  MOVEMENT.airWishFactor = antes
  console.log(`  wish ${wish.toFixed(2)} → 1 salto ${uno.pico.toFixed(2)} · 3 ${tres.pico.toFixed(2)} · 6 ${seis.pico.toFixed(2)} (techo ${MOVEMENT.airStrafeMaxSpeed})`)
}

afirmar('el techo NO se alcanza en seis saltos con ninguna arma',
  filas.every((f) => f.pico < MOVEMENT.airStrafeMaxSpeed - 1), `mejor pico ${mejor.pico.toFixed(2)} de ${MOVEMENT.airStrafeMaxSpeed}`)
afirmar('y el arma no explica la inconsistencia: todas ganan lo mismo',
  mejor.gana - peor.gana < 10, `${(mejor.gana - peor.gana).toFixed(1)} puntos entre la mejor y la peor`)

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
