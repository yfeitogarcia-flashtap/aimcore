/** Cuántos impactos hacen falta con cada arma, por zona y por armadura. */
import { PLAYER, WEAPONS } from '../src/config.js'
import { encajarImpacto, zoneDamage } from '../src/game/player.js'

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

const armas = ['pulse', 'reaper', 'scout', 'titan', 'rift']
console.log('arma     zona   dano | pelado  chaleco  chaleco+casco')
for (const a of armas) {
  for (const z of ['head', 'torso', 'legs']) {
    const d = zoneDamage(z, a).toFixed(1).padStart(5)
    console.log(
      `${a.padEnd(8)} ${z.padEnd(6)} ${d} | ` +
      `${String(cuantos(a, z)).padStart(6)}  ` +
      `${String(cuantos(a, z, { chaleco: 1 })).padStart(7)}  ` +
      `${String(cuantos(a, z, { chaleco: 1, casco: true })).padStart(13)}`,
    )
  }
}
console.log('\nFang (por carga, al torso y a la cabeza):')
const t = WEAPONS.fang.tiro
for (const k of [0, 0.5, 1]) {
  const f = t.danoMin + (t.danoMax - t.danoMin) * k
  const torso = zoneDamage('torso', 'fang', f)
  const cabeza = zoneDamage('head', 'fang', f)
  console.log(`  carga ${k.toFixed(2)}  torso ${torso.toFixed(1)}  cabeza ${cabeza.toFixed(1)}`)
}
