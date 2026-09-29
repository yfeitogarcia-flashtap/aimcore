/**
 * volumen96 — las tres geometrías de picado, comprobadas por rayo.
 *
 * No sirve de nada que el editor añada un volumen si ese volumen no está donde
 * está la pieza: un prisma extruido con la matriz mal sale espejado en Z y el
 * clic funciona **en el sitio contrario**, que es peor que no funcionar. Así que
 * se lanza un rayo desde arriba a puntos que se sabe que están dentro y a puntos
 * que se sabe que están fuera, y se compara con lo que dice la colisión del
 * motor — que es la respuesta correcta por definición.
 */
import * as THREE from 'three'
import { carasDePrisma, dentroDePrisma, puntosDePrisma } from '../src/maps/prisma.js'
import { cajasDeEscalera, medidasDeEscalera } from '../src/maps/escalera.js'
import { COVER, coverHeight } from '../src/config.js'

let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}

const rayo = new THREE.Raycaster()
const desdeArriba = (malla, x, z) => {
  rayo.set(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0))
  malla.updateMatrixWorld(true)
  return rayo.intersectObject(malla, false).length > 0
}

// ------------------------------------------------------------------ el prisma
console.log('\n[1] El prisma: extruido de puntosDePrisma')
const prisma = { x: 7, z: -4, w: 3, d: 5, lados: 7, giro: 0.6, kind: 'alta' }
const alto = coverHeight(prisma.kind)
const forma = new THREE.Shape(puntosDePrisma(prisma).map((p) => new THREE.Vector2(p.x, p.z)))
const geo = new THREE.ExtrudeGeometry(forma, { depth: alto, bevelEnabled: false })
geo.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1))
const mallaPrisma = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))

const caras = carasDePrisma(prisma)
let acuerdos = 0
let desacuerdos = 0
for (let k = 0; k < 4000; k++) {
  const x = prisma.x + (Math.random() - 0.5) * 12
  const z = prisma.z + (Math.random() - 0.5) * 12
  const dentro = dentroDePrisma(caras, x, z, 0)
  const toca = desdeArriba(mallaPrisma, x, z)
  if (dentro === toca) acuerdos += 1; else desacuerdos += 1
}
console.log(`    4000 puntos: ${acuerdos} de acuerdo con la colisión, ${desacuerdos} en desacuerdo`)
afirmar(desacuerdos === 0, 'el volumen coincide con el prisma que el motor choca')
// Y el denominador: que la comparación no sea trivialmente cierta.
let dentroCuantos = 0
for (let k = 0; k < 4000; k++) {
  const x = prisma.x + (Math.random() - 0.5) * 12
  const z = prisma.z + (Math.random() - 0.5) * 12
  if (dentroDePrisma(caras, x, z, 0)) dentroCuantos += 1
}
console.log(`    (de esos puntos, ~${dentroCuantos} caen dentro: la muestra no es toda fuera)`)
afirmar(dentroCuantos > 200, 'y hay puntos dentro de verdad, así que la fila mide algo')

// ------------------------------------------------------------------ la cuña
console.log('\n[2] La rampa: la cuña, no su caja envolvente')
const rampa = { x: -2, z: 3, w: 4, d: 8, fromZ: 3, toZ: 11 }
const altoRampa = coverHeight('plataforma')
// La misma geometría que escribe el editor, copiada aquí a propósito: si se
// separan, este banco deja de guardar nada — se compara abajo con el fichero.
function geometriaDeCuna(r, h) {
  const enX = r.fromX !== undefined
  const x0 = Math.min(r.x, r.x + r.w); const x1 = Math.max(r.x, r.x + r.w)
  const z0 = Math.min(r.z, r.z + r.d); const z1 = Math.max(r.z, r.z + r.d)
  const desde = enX ? r.fromX : r.fromZ
  const hasta = enX ? r.toX : r.toZ
  const sube = hasta >= desde
  const v = []
  if (enX) {
    const bajo = sube ? x0 : x1; const arriba = sube ? x1 : x0
    v.push(bajo, 0, z0, bajo, 0, z1, arriba, 0, z1, arriba, 0, z0, arriba, h, z1, arriba, h, z0)
  } else {
    const bajo = sube ? z0 : z1; const arriba = sube ? z1 : z0
    v.push(x0, 0, bajo, x1, 0, bajo, x1, 0, arriba, x0, 0, arriba, x1, h, arriba, x0, h, arriba)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  g.setIndex([0, 1, 2, 0, 2, 3, 0, 1, 4, 0, 4, 5, 3, 2, 4, 3, 4, 5, 0, 5, 3, 1, 2, 4])
  return g
}
const mallaCuna = new THREE.Mesh(geometriaDeCuna(rampa, altoRampa), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
// Dentro de la huella tiene que tocar en los cuatro rincones.
for (const [x, z, nombre] of [[-1.9, 3.1, 'pie'], [1.9, 10.9, 'cima'], [0, 7, 'centro'], [-1.9, 10.9, 'esquina alta']]) {
  afirmar(desdeArriba(mallaCuna, x, z), `dentro de la huella (${nombre}) el rayo toca`)
}
for (const [x, z, nombre] of [[-2.5, 7, 'fuera por −X'], [3, 7, 'fuera por +X'], [0, 2, 'antes del pie'], [0, 12, 'pasada la cima']]) {
  afirmar(!desdeArriba(mallaCuna, x, z), `fuera de la huella (${nombre}) no toca`)
}
// Y la altura que devuelve el rayo es la del plano inclinado, no la del techo.
const alturaEn = (z) => {
  rayo.set(new THREE.Vector3(0, 60, z), new THREE.Vector3(0, -1, 0))
  mallaCuna.updateMatrixWorld(true)
  const h = rayo.intersectObject(mallaCuna, false)
  return h.length ? h[0].point.y : null
}
const mitad = alturaEn(7)
const esperado = altoRampa * ((7 - 3) / 8)
console.log(`    a mitad de rampa el rayo cae en y ${mitad?.toFixed(4)}, la superficie está en ${esperado.toFixed(4)}`)
afirmar(mitad !== null && Math.abs(mitad - esperado) < 1e-4,
  'el volumen sigue el plano inclinado, así que el aire de encima no elige la rampa')

// --------------------------------------------------------------- la escalera
console.log('\n[3] La escalera: un volumen por escalón, de cajasDeEscalera')
const esc = { x: 0, z: 0, ancho: 2, huella: 0.5, alto: 2.6, escalones: 4, rumbo: 0 }
const cajas = cajasDeEscalera(esc, COVER.stepHeight)
const m = medidasDeEscalera(esc, COVER.stepHeight)
console.log(`    ${cajas.length} escalones, largo desplegado ${m.largo}`)
const grupo = new THREE.Group()
for (const c of cajas) {
  const h = coverHeight(c.kind) - (c.base ? coverHeight(c.base) : 0)
  const g = new THREE.BoxGeometry(c.w, h, c.d)
  g.translate(c.x + c.w / 2, ((c.base ? coverHeight(c.base) : 0) + coverHeight(c.kind)) / 2, c.z + c.d / 2)
  grupo.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })))
}
grupo.updateMatrixWorld(true)
const tocaGrupo = (x, z) => {
  rayo.set(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0))
  return rayo.intersectObjects(grupo.children, false).length > 0
}
afirmar(tocaGrupo(1, 0.1), 'el primer escalón se pincha')
afirmar(tocaGrupo(1, m.largo - 0.1), 'y el último también')
afirmar(!tocaGrupo(1, m.largo + 1), 'pasada la escalera no toca')
afirmar(!tocaGrupo(3.5, 1), 'y a un lado tampoco')

console.log(`\n${fallos === 0 ? 'VERDE' : `ROJO — ${fallos} fallo(s)`}`)
process.exit(fallos === 0 ? 0 : 1)
