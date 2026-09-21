/**
 * **hielo84 — entrar en una pista de hielo desde 360°.**
 *
 * Lo que el jugador cuenta: «a veces se siente como un escalón que bloquea la
 * entrada desde ciertos ángulos». La losa mide 0.2 y `COVER.stepHeight` es
 * 0.25, así que la colisión no puede ser: lo que sí puede es **con qué
 * velocidad se siembra el hielo al entrar**.
 *
 * El banco camina hacia el centro de la pista desde 36 rumbos y mide si el
 * jugador acaba dentro. Y lo hace dos veces: recién aparecido, y **después de
 * un salto** que deja `_landingVel` escrita apuntando a otro sitio.
 */
import { MovementController } from '../src/game/movement.js'
import * as THREE from 'three'
import { Scenario } from '../src/game/scenario.js'
import { crearPose } from '../net/pose.js'
import { SIM } from '../src/config.js'

const DT = 1 / SIM.hz
const NOW_STEP = 1000 / SIM.hz

const mapa = {
  clave: 'hielo84',
  nombre: 'Pista',
  sala: { lado: 60, alto: 16 },
  spawnZone: [],
  boxes: [
    { x: -6, z: -6, w: 12, d: 12, kind: 0.2, superficie: { tipo: 'hielo', fuerza: 1.6 } },
  ],
}

function nuevo() {
  const pose = crearPose()
  const escenario = new Scenario(new THREE.Scene(), mapa)
  const mov = new MovementController(pose)
  mov.setScenario(escenario)
  mov.reset()
  mov.setEnabled(true)
  return { pose, mov }
}

/**
 * Anda `ms` milisegundos hacia `yaw` y devuelve **lo más cerca del centro que
 * llegó a estar**. Lo que se mide no es dónde acaba —cruzando la pista se sale
 * por el otro lado— sino si el borde le deja pasar.
 */
function acercarse(mov, pose, yaw, ms, now) {
  pose.rotation.y = yaw
  mov.input.forward = true
  let cerca = Infinity
  for (let t = 0; t < ms; t += NOW_STEP) {
    now += NOW_STEP
    mov.update(DT, now)
    const d = Math.hypot(pose.position.x, pose.position.z)
    if (d < cerca) cerca = d
  }
  mov.input.forward = false
  return cerca
}

console.log('== hielo84: entrar en la pista desde 36 rumbos ==\n')

for (const conSalto of [false, true]) {
  let fallos = 0
  const detalle = []
  for (let i = 0; i < 36; i++) {
    // Se arranca fuera de la pista, mirando al centro.
    const rumbo = (i * 10 * Math.PI) / 180
    const r = 9
    const { pose, mov } = nuevo()
    // Una cámara mira a −Z con yaw 0, así que para mirar al centro desde el
    // punto (r·sin, r·cos) el yaw es el propio rumbo.
    pose.position.x = r * Math.sin(rumbo)
    pose.position.z = r * Math.cos(rumbo)
    let now = 1000

    if (conSalto) {
      // Un salto cualquiera, en una dirección que no es la de la entrada: es
      // lo que deja `_landingVel` escrita y vieja.
      pose.rotation.y = rumbo + Math.PI / 2
      mov.input.forward = true
      mov.pressJump(now)
      for (let t = 0; t < 1500; t += NOW_STEP) { now += NOW_STEP; mov.update(DT, now) }
      mov.input.forward = false
      // Se vuelve al sitio de partida, ya con la velocidad de aterrizaje puesta.
      pose.position.x = r * Math.sin(rumbo)
      pose.position.z = r * Math.cos(rumbo)
      for (let t = 0; t < 200; t += NOW_STEP) { now += NOW_STEP; mov.update(DT, now) }
    }

    const cerca = acercarse(mov, pose, rumbo, 2500, now)
    // Entrar de verdad es pasar del borde (6 u) con holgura.
    const ok = cerca < 4
    if (!ok) { fallos += 1; detalle.push(`${i * 10}° (${cerca.toFixed(2)} u)`) }
  }
  const etiqueta = conSalto ? 'tras un salto en otra dirección' : 'recién aparecido'
  console.log(`[${conSalto ? 2 : 1}] ${etiqueta}: ${36 - fallos}/36 entran`)
  if (fallos) console.log(`    no entran: ${detalle.join(', ')}`)
}

/**
 * **[3] Y lo que la siembra de vuelo existía para dar sigue estando**: caer
 * dentro de la pista con marcha te mete deslizando, no te para en el sitio.
 */
{
  const { pose, mov } = nuevo()
  pose.position.x = 0
  pose.position.z = 11
  pose.rotation.y = 0                       // mirando a −Z, o sea hacia la pista
  let now = 1000
  mov.input.forward = true
  for (let t = 0; t < 300; t += NOW_STEP) { now += NOW_STEP; mov.update(DT, now) }
  mov.pressJump(now)
  for (let t = 0; t < 600; t += NOW_STEP) { now += NOW_STEP; mov.update(DT, now) }
  const zAlEntrar = pose.position.z
  mov.input.forward = false                 // se sueltan las teclas en el aire
  for (let t = 0; t < 2000; t += NOW_STEP) { now += NOW_STEP; mov.update(DT, now) }
  const deriva = zAlEntrar - pose.position.z
  console.log(`\n[3] cae en la pista y sigue deslizando sin teclas: ${deriva.toFixed(3)} u`)
}

/** **[4] El hielo sigue siendo hielo**: soltar la tecla no te para en el paso. */
{
  // Pista grande, para que la deriva quepa entera dentro de ella: medida en la
  // pequeña, lo que se mide es el rozamiento de fuera (vuelta 46).
  const grande = {
    ...mapa,
    clave: 'hielo84g',
    boxes: [{ x: -25, z: -25, w: 50, d: 50, kind: 0.2, superficie: { tipo: 'hielo', fuerza: 1.6 } }],
  }
  const pose = crearPose()
  const mov = new MovementController(pose)
  mov.setScenario(new Scenario(new THREE.Scene(), grande))
  mov.reset()
  mov.setEnabled(true)
  pose.position.x = 0
  pose.position.z = 20
  pose.rotation.y = 0
  let now = 1000
  mov.input.forward = true
  for (let t = 0; t < 1500; t += NOW_STEP) { now += NOW_STEP; mov.update(DT, now) }
  mov.input.forward = false
  const z0 = pose.position.z
  for (let t = 0; t < 4000; t += NOW_STEP) { now += NOW_STEP; mov.update(DT, now) }
  console.log(`[4] deriva al soltar la tecla en hielo: ${(z0 - pose.position.z).toFixed(3)} u`)
}

/** **[5] Y un mapa sin hielo acaba donde acababa**, dígito a dígito. */
{
  const llano = { ...mapa, clave: 'llano84', boxes: [] }
  const pose = crearPose()
  const mov = new MovementController(pose)
  mov.setScenario(new Scenario(new THREE.Scene(), llano))
  mov.reset()
  mov.setEnabled(true)
  let now = 1000
  pose.rotation.y = 0.7
  mov.input.forward = true
  mov.input.right = true
  for (let t = 0; t < 1000; t += NOW_STEP) { now += NOW_STEP; mov.update(DT, now) }
  mov.pressJump(now)
  for (let t = 0; t < 2000; t += NOW_STEP) { now += NOW_STEP; mov.update(DT, now) }
  const p = pose.position
  console.log(`[5] paseo por un mapa sin hielo: ${p.x.toFixed(9)}, ${p.z.toFixed(9)}, ${mov.feetY.toFixed(9)}`)
}
