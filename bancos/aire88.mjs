// Banco: air-strafe del modelo vectorial. Sin navegador.
import { MovementController } from '../src/game/movement.js'
import { MOVEMENT, SIM } from '../src/config.js'

const STEP = 1000 / SIM.hz
const DEG = Math.PI / 180

function camaraFalsa() {
  const pos = {
    x: 0, y: 0, z: 0,
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this },
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this },
  }
  return { position: pos, rotation: { x: 0, y: 0, z: 0 } }
}

function nuevo() {
  const cam = camaraFalsa()
  const m = new MovementController(cam)
  m.setEnabled(true)
  m.reset?.()
  cam.position.x = 0; cam.position.z = 0
  return { m, cam }
}

/**
 * Un vuelo: corre de frente, salta, y en el aire mantiene las teclas dadas
 * mientras gira el ratón a `gradosPorSeg`.
 */
function vuelo({ teclas, gradosPorSeg, hz = 60, correrAntesMs = 1500 }) {
  const { m, cam } = nuevo()
  const dt = 1 / hz
  const paso = 1000 / hz
  let now = 0
  // Carrera de frente hasta velocidad sostenida.
  m.keys.forward = true
  for (let t = 0; t < correrAntesMs; t += paso) { m.update(dt, now); now += paso }
  const v0 = m.horizontalSpeed
  // Salto.
  m.pressJump(now)
  m.keys.jump = true
  m.update(dt, now); now += paso
  m.keys.jump = false
  // En el aire: teclas pedidas y giro.
  m.keys.forward = !!teclas.forward
  m.keys.back = !!teclas.back
  m.keys.left = !!teclas.left
  m.keys.right = !!teclas.right
  const x0 = cam.position.x, z0 = cam.position.z
  let pasos = 0
  let rumbo0 = null
  let rumbo1 = 0
  let vUlt = 0
  while (m.airborne && pasos < 2000) {
    cam.rotation.y += gradosPorSeg * DEG * dt
    m.update(dt, now); now += paso; pasos += 1
    if (m._airVelX || m._airVelZ) {
      if (rumbo0 === null) rumbo0 = Math.atan2(m._airVelX, m._airVelZ)
      rumbo1 = Math.atan2(m._airVelX, m._airVelZ)
      vUlt = Math.hypot(m._airVelX, m._airVelZ)
    }
  }
  const dx = cam.position.x - x0, dz = cam.position.z - z0
  return {
    v0,
    vFinal: vUlt,
    giroRumbo: rumbo0 === null ? 0 : ((rumbo1 - rumbo0 + Math.PI * 3) % (Math.PI * 2) - Math.PI) / DEG,
    desvio: Math.hypot(dx, dz),
    msVuelo: pasos * paso,
  }
}

function fila(nombre, r) {
  console.log(
    nombre.padEnd(34),
    'v0', r.v0.toFixed(3).padStart(6),
    'vfin', r.vFinal.toFixed(3).padStart(6),
    'giro', (r.giroRumbo >= 0 ? '+' : '') + r.giroRumbo.toFixed(1).padStart(6),
    'ms', String(Math.round(r.msVuelo)).padStart(4),
  )
}

console.log('airVector =', MOVEMENT.airVector, '| techo', MOVEMENT.airStrafeMaxSpeed, '| carrera', MOVEMENT.speed)
console.log('--- estrafe puro (D, sin W) girando a la derecha (yaw baja) ---')
for (const g of [-20, -40, -80, -140]) {
  fila(`D  ${g}°/s`, vuelo({ teclas: { right: true }, gradosPorSeg: g }))
}
console.log('--- estrafe puro (A, sin W) girando a la izquierda (yaw sube) ---')
for (const g of [20, 40, 80, 140]) {
  fila(`A  ${g}°/s`, vuelo({ teclas: { left: true }, gradosPorSeg: g }))
}
console.log('--- W+D (lo que describe el jugador) ---')
for (const g of [-40, -80]) {
  fila(`W+D ${g}°/s`, vuelo({ teclas: { forward: true, right: true }, gradosPorSeg: g }))
}
console.log('--- control: sin teclas, sin giro ---')
fila('nada', vuelo({ teclas: {}, gradosPorSeg: 0 }))

// --- Encadenado: seis saltos girando, como el banco de la vuelta 32 ---
function cadena({ teclas, gradosPorSeg, saltos = 6, hz = 60 }) {
  const { m, cam } = nuevo()
  const dt = 1 / hz, paso = 1000 / hz
  let now = 0
  m.keys.forward = true
  for (let t = 0; t < 1500; t += paso) { m.update(dt, now); now += paso }
  m.keys.forward = !!teclas.forward
  m.keys.back = !!teclas.back
  m.keys.left = !!teclas.left
  m.keys.right = !!teclas.right
  const picos = []
  for (let s = 0; s < saltos; s++) {
    m.pressJump(now)
    m.keys.jump = true
    m.update(dt, now); now += paso
    m.keys.jump = false
    let pico = 0, guard = 0
    while (m.airborne && guard++ < 2000) {
      cam.rotation.y += gradosPorSeg * DEG * dt
      m.update(dt, now); now += paso
      const v = Math.hypot(m._airVelX, m._airVelZ)
      if (v > pico) pico = v
    }
    picos.push(pico)
    // Un paso en el suelo, dentro de la ventana de encadenado.
    cam.rotation.y += gradosPorSeg * DEG * dt
    m.update(dt, now); now += paso
  }
  return picos
}

console.log('--- encadenado de 6 saltos (pico de cada vuelo) ---')
for (const [nombre, teclas, g] of [
  ['D puro  40°/s', { right: true }, -40],
  ['D puro 140°/s', { right: true }, -140],
  ['W+D     40°/s', { forward: true, right: true }, -40],
  ['sólo W        ', { forward: true }, 0],
]) {
  console.log(nombre.padEnd(16), cadena({ teclas, gradosPorSeg: g }).map((v) => v.toFixed(3)).join('  '))
}

// --- La puerta: qué cambia y qué no ---
function paseo({ conEstrafeEnElAire }) {
  const { m, cam } = nuevo()
  const dt = 1 / 60, paso = 1000 / 60
  let now = 0
  const guion = conEstrafeEnElAire
    ? [['forward+right', 1200], ['forward', 600], ['forward+left', 900]]
    : [['forward', 1200], ['right', 600], ['back', 400], ['left', 900]]
  let saltoEn = 200
  for (const [teclas, ms] of guion) {
    m.keys.forward = teclas.includes('forward')
    m.keys.back = teclas.includes('back')
    m.keys.left = teclas.includes('left')
    m.keys.right = teclas.includes('right')
    for (let t = 0; t < ms; t += paso) {
      cam.rotation.y += 35 * DEG * dt
      if (now > saltoEn && !m.airborne) {
        m.pressJump(now); m.keys.jump = true; saltoEn = now + 700
      } else m.keys.jump = false
      m.update(dt, now); now += paso
    }
  }
  return [cam.position.x, cam.position.z, m.feetY]
}

console.log('--- la puerta: apagado vs encendido ---')
for (const conEstrafeEnElAire of [false, true]) {
  MOVEMENT.airStrafeIgnoraFrente = false
  const a = paseo({ conEstrafeEnElAire })
  MOVEMENT.airStrafeIgnoraFrente = true
  const b = paseo({ conEstrafeEnElAire })
  const igual = a.every((v, i) => v === b[i])
  console.log(
    (conEstrafeEnElAire ? 'con W+estrafe en el aire ' : 'sin W+estrafe en el aire').padEnd(26),
    a.map((v) => v.toFixed(9)).join(', '), '|', igual ? 'IDÉNTICO' : 'cambia',
  )
}

console.log('--- comprobación de que el interruptor manda ---')
MOVEMENT.airStrafeIgnoraFrente = false
fila('W+D 40°/s apagado ', vuelo({ teclas: { forward: true, right: true }, gradosPorSeg: -40 }))
MOVEMENT.airStrafeIgnoraFrente = true
fila('W+D 40°/s encendido', vuelo({ teclas: { forward: true, right: true }, gradosPorSeg: -40 }))
