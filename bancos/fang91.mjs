/**
 * Balance del Fang tras la vuelta 91: alcance plano a las dos cargas y cuántos
 * impactos al torso hacen falta con y sin chaleco. Sin navegador: la parábola
 * es forma cerrada y la escalera de armadura es `encajarImpacto`.
 */
import { MOVEMENT, WEAPONS } from '../src/config.js'
import { lanzamientoDeArma } from '../src/game/proyectiles.js'
import { encajarImpacto, zoneDamage } from '../src/game/player.js'

let fallos = 0
const afirmar = (n, c, d = '') => {
  console.log((c ? '  ok  ' : '  FALLO ') + n + (d ? ` — ${d}` : ''))
  if (!c) fallos += 1
}

const arma = WEAPONS.fang
const ojos = { x: 0, y: MOVEMENT.standHeight, z: 0 }
const fuera = {}

/** Alcance plano: se lanza a pitch 0 y se despeja cuándo cae a la altura del pecho. */
const alcancePlano = (carga, alturaObjetivo) => {
  const l = lanzamientoDeArma(arma, carga, ojos, 0, 0, fuera, null)
  const g = l.g
  const vy = l.vy
  const h = l.y - alturaObjetivo
  // y(t) = h + vy·t − ½g t² = 0
  const t = (vy + Math.sqrt(vy * vy + 2 * g * h)) / g
  return { d: Math.hypot(l.vx, l.vz) * t, t, v: Math.hypot(l.vx, l.vy, l.vz) }
}

for (const [nombre, carga] of [['sin cargar', 0], ['a tope', 1]]) {
  const suelo = alcancePlano(carga, 0)
  const pecho = alcancePlano(carga, 1.0)
  console.log(`  ${nombre}: ${pecho.d.toFixed(1)} u al pecho (${pecho.t.toFixed(2)} s) · ${suelo.d.toFixed(1)} u al suelo · ${pecho.v.toFixed(1)} u/s`)
}

console.log('\n  impactos al torso hasta matar')
const golpes = (carga, chaleco, casco = false) => {
  const l = lanzamientoDeArma(arma, carga, ojos, 0, 0, fuera, null)
  const estado = { health: 100, shield: chaleco ? 50 : 0, helmet: casco }
  let n = 0
  while (estado.health > 0 && n < 12) {
    n += 1
    const r = encajarImpacto(estado, {
      zone: 'torso', damage: zoneDamage('torso', 'fang', l.fuerza), weaponKey: 'fang',
    })
    estado.health = r.health
    estado.shield = r.shield
    estado.helmet = r.helmet
  }
  return n
}
const cabeza = (carga, casco) => {
  const estado = { health: 100, shield: 0, helmet: casco }
  let n = 0
  while (estado.health > 0 && n < 12) {
    n += 1
    const r = encajarImpacto(estado, {
      zone: 'head', damage: zoneDamage('head', 'fang', 0), weaponKey: 'fang',
    })
    estado.health = r.health
    estado.shield = r.shield
    estado.helmet = r.helmet
  }
  return n
}

const aTopeSinChaleco = golpes(1, false)
const aTopeConChaleco = golpes(1, true)
const flojoSinChaleco = golpes(0, false)
console.log(`  a tope: ${aTopeSinChaleco} sin chaleco · ${aTopeConChaleco} con chaleco`)
console.log(`  sin cargar: ${flojoSinChaleco} sin chaleco · ${golpes(0, true)} con chaleco`)
console.log(`  a la cabeza: ${cabeza(1, false)} sin casco · ${cabeza(1, true)} con casco`)

afirmar('a tope mata de uno al torso sin chaleco', aTopeSinChaleco === 1)
afirmar('con chaleco hacen falta dos', aTopeConChaleco === 2)
afirmar('sin cargar siguen haciendo falta tres', flojoSinChaleco === 3, `${flojoSinChaleco}`)
afirmar('una a la cabeza sin casco, dos con él', cabeza(1, false) === 1 && cabeza(1, true) === 2)
// El número comparable con lo escrito en CLAUDE.md es el del suelo (21.3 antes).
const p = alcancePlano(1, 0).d
afirmar('el alcance plano a tope baja a 18 u', p >= 17.5 && p <= 18.5, `${p.toFixed(1)} u`)
const q = alcancePlano(0, 0).d
afirmar('y sin cargar se queda como estaba', Math.abs(q - 11.7) < 0.2, `${q.toFixed(1)} u`)
afirmar('la carga llena cuesta 800 ms', arma.tiro.cargaMs === 800)

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
