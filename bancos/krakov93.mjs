/**
 * krakov93 — el rifle de retroceso difícil, sin navegador.
 *
 * Mide las cuatro cosas que el arma promete, y cada una contra su vecina, que
 * es lo que hace legible una cifra (vuelta 46):
 *
 *  [1] La escalera de daño, con el Rift al lado como control: mismo cuerpo, y
 *      la cabeza **a través del casco**.
 *  [2] El patrón, fase por fase, con lo que dice la ficha. Es una T invertida y
 *      eso se comprueba en grados, no mirándolo.
 *  [3] La cola no se detiene nunca (la regla de la vuelta 61).
 *  [4] Y está en las listas derivadas, en la tienda y con voz propia.
 */
import { PLAYER, WEAPONS, PRIMARY_WEAPONS, WEAPON_ORDER, MOVEMENT, catalogoDeTienda, weaponSpeedFactor, WEAPON_MODES } from '../src/config.js'
import { encajarImpacto, zoneDamage } from '../src/game/player.js'
import { SHOT_PROFILES } from '../src/audio/sfx.js'
import { WEAPON_PATHS } from '../src/ui/weaponPaths.js'

let fallos = 0
const afirmar = (bien, texto) => {
  console.log(`  ${bien ? 'OK  ' : 'MAL '} ${texto}`)
  if (!bien) fallos++
}

const SEG = PLAYER.shield.segment
function cuantos(arma, zona, { chaleco = 0, casco = false } = {}) {
  const e = { health: PLAYER.maxHealth, shield: chaleco * SEG, helmet: casco }
  const dano = zoneDamage(zona, arma)
  for (let n = 1; n <= 20; n++) {
    const t = encajarImpacto(e, { zone: zona, damage: dano, weaponKey: arma })
    e.health = t.health; e.shield = t.shield; e.helmet = t.helmet
    if (t.killed) return n
  }
  return '>20'
}

// --------------------------------------------------------------- [1] daño
console.log('\n[1] La escalera de daño, con la Rift de control')
console.log('    arma     zona   daño | pelado  chaleco  chaleco+casco')
for (const a of ['krakov', 'rift']) {
  for (const z of ['head', 'torso', 'legs']) {
    console.log(
      `    ${a.padEnd(8)} ${z.padEnd(6)} ${zoneDamage(z, a).toFixed(1).padStart(5)} | ` +
      `${String(cuantos(a, z)).padStart(6)}  ` +
      `${String(cuantos(a, z, { chaleco: 1 })).padStart(7)}  ` +
      `${String(cuantos(a, z, { chaleco: 1, casco: true })).padStart(13)}`)
  }
}

afirmar(zoneDamage('torso', 'krakov') === zoneDamage('torso', 'rift'),
  `al cuerpo pega lo mismo que la Rift: ${zoneDamage('torso', 'krakov')} y ${zoneDamage('torso', 'rift')}`)
afirmar(cuantos('krakov', 'head', { chaleco: 1, casco: true }) === 1,
  'y una a la cabeza mata con casco puesto: atraviesa la armadura')
afirmar(cuantos('rift', 'head', { chaleco: 1, casco: true }) === 2,
  'la Rift, que no perfora, necesita dos: el casco es lo que separa a las dos')

// **Y lo que no para, no se gasta** (vuelta 90).
const conCasco = { health: PLAYER.maxHealth, shield: SEG, helmet: true }
const tras = encajarImpacto(conCasco, { zone: 'head', damage: zoneDamage('head', 'krakov'), weaponKey: 'krakov' })
afirmar(tras.helmet === true, 'el casco no se rompe al atravesarlo: lo que no para no se gasta')

afirmar(cuantos('krakov', 'torso', { chaleco: 1 }) === cuantos('rift', 'torso', { chaleco: 1 }),
  `con chaleco hacen falta las mismas al torso: ${cuantos('krakov', 'torso', { chaleco: 1 })}`)
afirmar(cuantos('krakov', 'legs', { chaleco: 1 }) <= cuantos('rift', 'legs', { chaleco: 1 }),
  `y a las piernas nunca más: ${cuantos('krakov', 'legs', { chaleco: 1 })} contra ${cuantos('rift', 'legs', { chaleco: 1 })}`)

// -------------------------------------------------------------- [2] patrón
console.log('\n[2] El patrón: una T invertida en grados, no de vista')
const r = WEAPONS.krakov.recoil
const acumulado = []
let p = 0, y = 0
for (const [dp, dy] of r) { p += dp; y += dy; acumulado.push([p, y]) }
const en = (bala) => acumulado[bala - 1]

const [p5, y5] = en(5)
afirmar(p5 > 5.5 && Math.abs(y5) < 0.25,
  `1–5 suben en recto: ${p5.toFixed(2)}° de pitch con ${y5.toFixed(2)}° de yaw`)

const [p10, y10] = en(10)
afirmar(p10 > p5 && y10 > 1.5,
  `6–10 siguen subiendo y se van a la izquierda: pitch ${p5.toFixed(2)} → ${p10.toFixed(2)}, yaw ${y5.toFixed(2)} → ${y10.toFixed(2)}`)
const subidaTramo2 = p10 - p5
afirmar(subidaTramo2 < p5,
  `y la subida se apaga en ese tramo: ${subidaTramo2.toFixed(2)}° contra los ${p5.toFixed(2)}° del primero`)

const [p15, y15] = en(15)
afirmar(p15 - p10 < 0.5 && y15 < y10 - 1.5,
  `pasada la 10 la vertical se estabiliza y el tiro se va a la derecha: +${(p15 - p10).toFixed(2)}° de pitch y ${(y15 - y10).toFixed(2)}° de yaw`)

const techo = p
afirmar(techo > 9 && techo > sumaPitch('rift') && techo > sumaPitch('volt'),
  `y su techo vertical es el más alto del arsenal: ${techo.toFixed(2)}° contra ${sumaPitch('rift').toFixed(2)} de la Rift y ${sumaPitch('volt').toFixed(2)} de la Volt`)
function sumaPitch(k) { return (WEAPONS[k].recoil ?? []).reduce((a, [dp]) => a + dp, 0) }

// -------------------------------------------------------------- [3] la cola
console.log('\n[3] La cola alterna y no se detiene nunca')
const desde = WEAPONS.krakov.recoilLoopFrom
const cola = r.slice(desde)
afirmar(cola.length >= 2, `la cola son ${cola.length} pasos desde el índice ${desde}`)
afirmar(cola.every(([dp, dy]) => dp !== 0 || dy !== 0),
  'y ninguno de ellos es cero: el arma nunca se autocontrola (vuelta 61)')
const signos = cola.map(([, dy]) => Math.sign(dy))
afirmar(new Set(signos).size === 2,
  `y alterna izquierda/derecha: signos ${JSON.stringify(signos)}`)
const pitchCola = cola.reduce((a, [dp]) => a + dp, 0)
afirmar(pitchCola < 0.1,
  `con la vertical apagada: ${pitchCola.toFixed(3)}° por vuelta de cola`)

// --------------------------------------------------- [4] listas, tienda y voz
console.log('\n[4] Está donde tiene que estar, y todo se deriva')
afirmar('krakov' in PRIMARY_WEAPONS, 'sale en las principales, derivado de su slot')
afirmar(WEAPON_ORDER.at(-1) === 'krakov',
  `y va al final de WEAPON_ORDER (índice ${WEAPON_ORDER.indexOf('krakov')}), así que no mueve los índices de red de nadie`)

const catalogo = catalogoDeTienda()
const item = catalogo.find((i) => i.clave === 'krakov')
afirmar(Boolean(item), 'está en el catálogo de la tienda')
afirmar(item?.tipo === 'arma', `es tipo «${item?.tipo}», así que la ronda 1 lo rechaza`)
const claves = catalogo.map((i) => `${i.categoria}-${i.codigo}`)
afirmar(new Set(claves).size === claves.length,
  `y su combinación no choca con ninguna: ${item?.categoria} ${item?.codigo} entre ${claves.length} artículos`)
const rift = catalogo.find((i) => i.clave === 'rift')
afirmar(item.categoria === rift.categoria,
  `comparte categoría con la Rift (${item.categoria}), que es con lo que compite`)
afirmar(item.precio > rift.precio && item.precio < catalogo.find((i) => i.clave === 'titan').precio,
  `y su precio cae entre las dos: $${rift.precio} < $${item.precio} < $${catalogo.find((i) => i.clave === 'titan').precio}`)

afirmar(Boolean(SHOT_PROFILES.krakov), 'tiene voz propia y no cae a la clásica')
const ratios = Object.entries(SHOT_PROFILES)
  .filter(([, v]) => v.metalRatio)
  .map(([k, v]) => [k, v.metalRatio])
const mios = ratios.filter(([k]) => k === 'krakov').map(([, v]) => v)
afirmar(ratios.filter(([, v]) => v === mios[0]).length === 1,
  `y su relación de metal no la tiene nadie más: ${mios[0]} entre ${JSON.stringify(ratios.map(([, v]) => v))}`)
afirmar(SHOT_PROFILES.krakov.bodyGain > SHOT_PROFILES.rift.bodyGain
  && SHOT_PROFILES.krakov.crackGain < SHOT_PROFILES.rift.crackGain,
  `y manda otra capa que la Rift: cuerpo ${SHOT_PROFILES.krakov.bodyGain} contra ${SHOT_PROFILES.rift.bodyGain}, crack ${SHOT_PROFILES.krakov.crackGain} contra ${SHOT_PROFILES.rift.crackGain}`)
afirmar(SHOT_PROFILES.krakov.mecaDelay * 1000 < 60_000 / WEAPONS.krakov.rpm,
  `y su cerrojo cae dentro de la ráfaga: ${(SHOT_PROFILES.krakov.mecaDelay * 1000).toFixed(0)} ms de los ${(60_000 / WEAPONS.krakov.rpm).toFixed(0)} que hay entre balas`)

afirmar(Boolean(WEAPON_PATHS.krakov), 'tiene silueta trazada')
afirmar(!WEAPONS.krakov.supportsSuppressor && !WEAPON_PATHS['ghost-krakov'],
  'y no admite silenciador, que es lo coherente con no tener variante ghost')
const altoRift = WEAPON_PATHS.rift ? 1 : 0
afirmar(altoRift === 1, 'y la Rift sigue trazada (el reencuadre no se llevó nada)')

afirmar(Boolean(WEAPON_MODES[WEAPONS.krakov.mode]),
  `su modo está en el vocabulario: «${WEAPON_MODES[WEAPONS.krakov.mode]?.corto}»`)
const vel = (MOVEMENT.speed * weaponSpeedFactor(WEAPONS.krakov.weight)).toFixed(2)
const velRift = (MOVEMENT.speed * weaponSpeedFactor(WEAPONS.rift.weight)).toFixed(2)
afirmar(Number(vel) < Number(velRift),
  `y pesa más que la Rift: ${vel} u/s contra ${velRift}`)

console.log(`\n${fallos === 0 ? 'TODO VERDE' : `${fallos} FALLO(S)`}\n`)
process.exit(fallos === 0 ? 0 : 1)
