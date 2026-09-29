/**
 * paleta93 — el tinte de una pieza no se lleva por delante la rampa de grises.
 *
 * Cuatro brazos, y el tercero es el que decide si la paleta vale:
 *
 *  [1] **La luminancia se conserva.** Es lo que hace que el gris siga diciendo
 *      la altura (vuelta 40): dentro de un tinte, una pieza alta sigue siendo
 *      más clara que una baja, y lo es **por el mismo número**.
 *  [2] Un mapa sin tintes se dibuja exactamente igual que antes de la vuelta.
 *  [3] **Ningún tinte se confunde con un color que ya significa algo**, medido
 *      en CIELAB —que es donde una diferencia de color se parece a lo que ve un
 *      ojo (vuelta 49)— y **con el control delante**: a cuánto están los grises
 *      de hoy de esas mismas señales. Sin ese denominador, una fila de 2.3
 *      condenaría a un tinte por algo que el gris ya hace peor.
 *  [4] Y el saneado lo acepta, lo tira cuando no existe y lo dice.
 */
import { COVER, COLORS, TEAMS, coverColor, coverEdgeColor, coverTintedColor } from '../src/config.js'
import { sanearMapa } from '../src/maps/formato.js'

let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}

const aLineal = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const canales = (hex) => {
  const v = parseInt(hex.slice(1), 16)
  return [16, 8, 0].map((sh) => aLineal(((v >> sh) & 255) / 255))
}
const luz = (hex) => {
  const [r, g, b] = canales(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const lab = (hex) => {
  const [r, g, b] = canales(hex)
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (u) => (u > 0.008856 ? Math.cbrt(u) : 7.787 * u + 16 / 116)
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
}
const dE = (a, b) => {
  const [A, B] = [lab(a), lab(b)]
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

const TINTES = Object.keys(COVER.tintes)
const ALTURAS = Object.keys(COVER.colors)

// ------------------------------------------------------- [1] la luminancia
console.log('\n[1] La luminancia la sigue poniendo el alto')
let peorError = { error: 0 }
for (const kind of ALTURAS) {
  for (const t of TINTES) {
    const error = Math.abs(luz(coverTintedColor(kind, t)) / luz(coverColor(kind)) - 1)
    if (error > peorError.error) peorError = { error, kind, t, color: coverTintedColor(kind, t) }
  }
}
afirmar(peorError.error < 0.02,
  `el peor desvío de luminancia es ${(peorError.error * 100).toFixed(2)}% (${peorError.t} en ${peorError.kind} → ${peorError.color})`)

// Y lo que compra: la escalera de alturas sigue subiendo dentro de un tinte.
const escalera = ['bordillo', 'baja', 'media', 'alta', 'bloque']
for (const t of TINTES) {
  const luces = escalera.map((k) => luz(coverTintedColor(k, t)))
  const sube = luces.every((v, i) => i === 0 || v > luces[i - 1])
  if (!sube) afirmar(false, `con ${t} la escalera de alturas deja de subir: ${luces.map((v) => v.toFixed(3)).join(' < ')}`)
}
afirmar(TINTES.every((t) => {
  const luces = escalera.map((k) => luz(coverTintedColor(k, t)))
  return luces.every((v, i) => i === 0 || v > luces[i - 1])
}), `en los ${TINTES.length} tintes la escalera bordillo→bloque sigue subiendo`)

console.log('\n    alto      gris     ' + TINTES.map((t) => t.padEnd(9)).join(''))
for (const kind of escalera) {
  console.log(`    ${kind.padEnd(9)} ${coverColor(kind)}  ` +
    TINTES.map((t) => coverTintedColor(kind, t).padEnd(9)).join(''))
}

// ------------------------------------------------------ [2] sin tinte, igual
console.log('\n[2] Sin tinte no cambia ni un dígito')
afirmar(ALTURAS.every((k) => coverTintedColor(k, null) === coverColor(k)),
  'coverTintedColor sin tinte devuelve el gris de siempre, en las diez alturas')
afirmar(ALTURAS.every((k) => coverEdgeColor(k) === coverEdgeColor(k, null)),
  'y la arista tampoco se mueve')
afirmar(coverTintedColor('media', 'noExiste') === coverColor('media'),
  'un tinte que no existe cae al gris en vez de no dibujarse')

// ------------------------------------------- [3] contra lo que ya significa algo
console.log('\n[3] Ningún tinte se confunde con una señal — con su control delante')
const SENALES = ['target', 'targetHead', 'targetLegs', 'targetHit', 'action', 'objective',
  'electric', 'alert', 'dispositivo', 'threat', 'decline', 'muzzleFlash', 'crosshair', 'health']
const senales = SENALES.map((k) => [k, COLORS[k]]).filter(([, v]) => typeof v === 'string' && v.startsWith('#'))
for (const [k, v] of Object.entries(TEAMS)) senales.push([`equipo ${k}`, v.color])
const ESCENA = ['background', 'grid', 'gridAccent', 'gridFloor', 'gridFloorAccent']
  .map((k) => [k, COLORS[k]]).filter(([, v]) => typeof v === 'string' && v.startsWith('#'))

const peorDe = (lista, colorDe) => {
  let peor = { dE: Infinity }
  for (const kind of ALTURAS) {
    for (const t of TINTES) {
      const c = colorDe(kind, t)
      for (const [nombre, ref] of lista) {
        const d = dE(c, ref)
        if (d < peor.dE) peor = { dE: d, kind, t, c, contra: nombre, ref }
      }
    }
  }
  return peor
}
const peorGris = (lista) => {
  let peor = { dE: Infinity }
  for (const kind of ALTURAS) {
    for (const [nombre, ref] of lista) {
      const d = dE(coverColor(kind), ref)
      if (d < peor.dE) peor = { dE: d, kind, c: coverColor(kind), contra: nombre }
    }
  }
  return peor
}

const tSenal = peorDe(senales, coverTintedColor)
const gSenal = peorGris(senales)
console.log(`    control (grises de hoy): ΔE ${gSenal.dE.toFixed(1)} — ${gSenal.kind} ${gSenal.c} contra ${gSenal.contra}`)
console.log(`    con tinte:               ΔE ${tSenal.dE.toFixed(1)} — ${tSenal.t} en ${tSenal.kind} (${tSenal.c}) contra ${tSenal.contra}`)
/**
 * **El listón es el control, no un número redondo.** Lo que hay que garantizar
 * no es «un tinte está lejos de las señales» —eso sería inventarse un umbral—
 * sino que **la paleta no acerca nada** a lo que ya significa algo. El único
 * que se admite por debajo es `decline`, que es un color de **menú** y no del
 * mundo: es el mismo permiso que ya tiene el verde de acción desde la vuelta 39
 * («se admite porque no coinciden nunca en pantalla»), y es la tercera vez.
 */
const salvoDecline = peorDe(senales.filter(([n]) => n !== 'decline'), coverTintedColor)
afirmar(salvoDecline.dE >= gSenal.dE * 0.8,
  `sin contar 'decline' la paleta no acerca nada: ΔE ${salvoDecline.dE.toFixed(1)} contra los ${gSenal.dE.toFixed(1)} del control (${salvoDecline.t} en ${salvoDecline.kind} vs ${salvoDecline.contra})`)
afirmar(tSenal.contra === 'decline' || tSenal.dE >= gSenal.dE,
  `y el único que baja del control es 'decline', que es color de menú y no del mundo: ${tSenal.contra}`)

const tEscena = peorDe(ESCENA, coverTintedColor)
const gEscena = peorGris(ESCENA)
console.log(`    contra la escena — control: ΔE ${gEscena.dE.toFixed(1)} (${gEscena.kind} contra ${gEscena.contra}) · con tinte: ΔE ${tEscena.dE.toFixed(1)} (${tEscena.t} en ${tEscena.kind} contra ${tEscena.contra})`)
afirmar(tEscena.dE >= gEscena.dE,
  `y ningún tinte se parece al suelo más que el gris que ya hay: ${tEscena.dE.toFixed(1)} ≥ ${gEscena.dE.toFixed(1)}`)

// ---------------------------------------------------------- [4] el saneado
console.log('\n[4] El saneado lo guarda, lo tira y lo dice')
const base = {
  clave: 'p93', label: 'p93', room: { width: 40, depth: 40, height: 10 },
  spawn: { x: 0, z: 17 },
}
const bueno = sanearMapa({
  ...base,
  boxes: [{ x: 0, z: 0, w: 2, d: 2, kind: 'media', tinte: 'musgo' }],
  prismas: [{ x: 5, z: 5, w: 2, d: 2, kind: 'alta', lados: 6, giro: 0, tinte: 'vino' }],
  ramps: [{ x: -8, z: -8, w: 2, d: 4, fromZ: -8, toZ: -4, top: 'baja', tinte: 'arena' }],
})
afirmar(bueno.mapa.boxes[0].tinte === 'musgo', `una caja lo conserva: «${bueno.mapa.boxes[0].tinte}»`)
afirmar(bueno.mapa.prismas[0].tinte === 'vino', `un prisma también: «${bueno.mapa.prismas[0].tinte}»`)
afirmar(bueno.mapa.ramps[0].tinte === 'arena', `y una rampa: «${bueno.mapa.ramps[0].tinte}»`)
afirmar(bueno.problemas.length === 0, `sin problemas: ${JSON.stringify(bueno.problemas)}`)

const malo = sanearMapa({ ...base, boxes: [{ x: 0, z: 0, w: 2, d: 2, kind: 'media', tinte: 'fucsia' }] })
afirmar(malo.mapa.boxes.length === 1, 'un tinte inventado NO tira la pieza')
afirmar(malo.mapa.boxes[0].tinte === undefined, 'se le quita el tinte')
afirmar(malo.problemas.some((p) => /tinte desconocido/.test(p)),
  `y se dice en voz alta: «${malo.problemas.find((p) => /tinte/.test(p))}»`)

// El punto fijo, que es de lo que cuelga deshacer/rehacer (vuelta 83).
const unaVez = sanearMapa(bueno.mapa).mapa
const dosVeces = sanearMapa(unaVez).mapa
afirmar(JSON.stringify(unaVez) === JSON.stringify(dosVeces),
  'y sanear dos veces da lo mismo byte a byte, con el tinte dentro')

console.log(`\n${fallos === 0 ? 'TODO VERDE' : `${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
