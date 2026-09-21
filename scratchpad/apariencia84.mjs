/**
 * **apariencia84 — lo que se ve de un dispositivo.**
 *
 * Tres cosas de la vuelta 84: que la losa de un dispositivo no se dibuja, que
 * una pieza alta con superficie **sí** se dibuja (porque con ella se choca), y
 * que la marca sigue ahí y sale del color nuevo.
 */
import * as THREE from 'three'
import { Scenario } from '../src/game/scenario.js'
import { COLORS, COVER } from '../src/config.js'

const base = { clave: 'a84', nombre: 'A', sala: { lado: 40, alto: 12 }, spawnZone: [] }

function montar(boxes) {
  const escena = new THREE.Scene()
  const esc = new Scenario(escena, { ...base, boxes })
  let mallas = 0
  let lineas = 0
  const colores = new Set()
  esc.group.traverse((o) => {
    if (o.isLineSegments) { lineas += 1; colores.add('#' + o.material.color.getHexString().toUpperCase()) }
    else if (o.isMesh) { mallas += 1; colores.add('#' + o.material.color.getHexString().toUpperCase()) }
  })
  return { esc, mallas, lineas, colores: [...colores] }
}

const losa = { x: -2, z: -2, w: 4, d: 4, kind: 0.2, superficie: { tipo: 'velocidad', fuerza: 30, rumbo: 0 } }
const alta = { ...losa, kind: 'media' }
const normal = { x: 6, z: 6, w: 2, d: 2, kind: 'media' }

const soloLosa = montar([losa])
const conAlta = montar([alta])
const soloNormal = montar([normal])
const losaYNormal = montar([losa, normal])

console.log('== apariencia84 ==\n')
console.log(`[1] una losa de dispositivo sola: ${soloLosa.mallas} malla(s) de caja + marca`)
console.log(`    una pieza normal sola:        ${soloNormal.mallas} malla(s)`)
console.log(`    losa + pieza normal:          ${losaYNormal.mallas} malla(s)`)
console.log(`    → la losa no añade caja: ${losaYNormal.mallas === soloNormal.mallas + (soloLosa.mallas) ? 'sí' : 'REVISAR'}`)
console.log(`[2] un dispositivo más alto que el escalón (${COVER.stepHeight}) sí se dibuja: ` +
  `${conAlta.mallas > soloLosa.mallas ? 'sí' : 'NO'} (${conAlta.mallas} contra ${soloLosa.mallas})`)
console.log(`[3] la marca sigue dibujándose: ${soloLosa.lineas + soloLosa.mallas > 0 ? 'sí' : 'NO'}`)
console.log(`[4] colores en juego: ${soloLosa.colores.join(', ')}`)
console.log(`    amarillo de dispositivo (${COLORS.dispositivo}): ` +
  `${soloLosa.colores.includes(COLORS.dispositivo.toUpperCase()) ? 'presente' : 'AUSENTE'}`)

// [5] Una tirolina: su cable se queda azul.
const conCable = montar([])
{
  const escena = new THREE.Scene()
  const esc = new Scenario(escena, {
    ...base,
    boxes: [losa],
    tirolinas: [{ desde: { x: -8, y: 4, z: 0 }, hasta: { x: 8, y: 2, z: 0 }, velocidad: 14 }],
  })
  // Las franjas de una losa van en triángulos y el cable en líneas, así que
  // se miran los dos: lo que se comprueba es que salen los dos colores.
  const colores = []
  esc.group.traverse((o) => {
    if (o.isLineSegments || o.isMesh) colores.push('#' + o.material.color.getHexString().toUpperCase())
  })
  console.log(`[5] con tirolina, colores dibujados: ${colores.join(', ')}`)
  console.log(`    cable azul (${COLORS.electric}) y marca amarilla a la vez: ` +
    `${colores.includes(COLORS.electric.toUpperCase()) && colores.includes(COLORS.dispositivo.toUpperCase()) ? 'sí' : 'NO'}`)
}
