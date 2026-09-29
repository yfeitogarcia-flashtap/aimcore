// retraso101 — cuánto tarda en llegarle una baja al tirador, en pasos, por cada
// camino (vuelta 101). Contra `Partida` sin navegador: el navegador de este
// contenedor dibuja a pocos fps y junta los mensajes en un mismo turno, así que
// no distingue 16 ms de 50. Aquí se cuenta el paso exacto en que sale cada cosa.
//
//  - la foto: el veredicto viaja en la siguiente foto del tirador (lo de la 100)
//  - el aviso: `MSG.VEREDICTO` y `MSG.BAJA`, en el mismo paso (lo de la 101)
//  - el cuerpo: con fotos, cae cuando el reloj de dibujo llega a la foto que lo
//    trae muerto (retrasoDeDibujo pasos detrás de ella); con la baja, al llegar.
import * as THREE from 'three'
import { Partida } from '../net/partida.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG } from '../net/protocolo.js'
import { NET, SIM_STEP_MS, definicionDeSala } from '../src/config.js'

let fallos = 0
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}`); if (!c) fallos += 1 }
const ms = (pasos) => (pasos * SIM_STEP_MS).toFixed(1)

for (const modo of ['duelo', 'todos']) {
  const clave = modo === 'todos' ? 'rotonda' : 'duelo'
  const escenario = new Scenario(new THREE.Scene(), definicionDeSala(modo, clave))
  const partida = new Partida({ escenario, modo, rondas: modo !== 'todos' ? false : true })
  const buzones = []
  const ids = []
  for (let i = 0; i < 3; i++) {
    const buzon = []
    buzones.push(buzon)
    ids.push(partida.entra((t) => { const m = JSON.parse(t); m.__paso = partida.paso; buzon.push(m) }))
  }
  partida.arrancar?.()
  const fc = partida.fotoCada
  const retraso = Math.max(NET.interpDelayTicks, fc * NET.interpolarFotos)
  const filas = []
  for (let fase = 0; fase < 3 * fc + 3; fase++) {
    for (let i = 0; i < 5 + fase; i++) partida.tick()
    const [a, b] = [...partida.jugadores.values()]
    b.vida = 100
    b.invulnerableHasta = 0
    // Cerca, para que B esté en la foto de A (`net/interes.js`).
    b.pose.position.set(a.pose.position.x + 2, a.pose.position.y, a.pose.position.z)
    for (const bz of buzones) bz.length = 0
    const pasoBaja = partida.paso
    const seq = 1000 + fase
    partida._aplicarDano(b, 150, a, 'torso')
    partida._anotarVeredicto(a, { seq, impacto: true, baja: true, zona: 'torso', dano: 150 })
    for (let i = 0; i < 12; i++) partida.tick()
    const buzonA = buzones[ids.indexOf(a.id)]
    const pasoDe = (f) => buzonA.find(f)?.__paso
    const aviso = pasoDe((m) => m.t === MSG.VEREDICTO && m.d?.seq === seq)
    const baja = pasoDe((m) => m.t === MSG.BAJA && m.v === b.id)
    const foto = pasoDe((m) => m.t === MSG.FOTO && m.p?.[a.id]?.disparos?.some((d) => d.seq === seq))
    const muerta = buzonA.find((m) => m.t === MSG.FOTO && m.p?.[b.id] && m.p[b.id].vida === 0)
    const fotoMuerta = muerta?.n
    // La baja se ha provocado **entre** dos `tick()`, y en la sala de verdad
    // ocurre dentro del paso que resuelve el disparo, antes de su foto: por eso
    // al camino de la foto se le quita un paso. Los avisos salen en el acto.
    filas.push({ aviso: aviso - pasoBaja, baja: baja - pasoBaja, foto: foto - pasoBaja - 1, cuerpoPorFotos: fotoMuerta - pasoBaja - 1 + retraso })
    b.vida = 100
    b.vivoEn = 0
  }
  const media = (k) => filas.reduce((s, f) => s + f[k], 0) / filas.length
  const peor = (k) => Math.max(...filas.map((f) => f[k]))
  console.log(`\n${modo}: fotos cada ${fc} paso(s), rival dibujado ${retraso} pasos detrás · ${filas.length} bajas en todas las fases`)
  for (const k of ['aviso', 'baja', 'foto', 'cuerpoPorFotos']) {
    console.log(`  ${k.padEnd(16)} media ${ms(media(k)).padStart(6)} ms · peor ${ms(peor(k)).padStart(6)} ms`)
  }
  ok(filas.every((f) => f.aviso === 0 && f.baja === 0), `${modo}: el aviso y la baja salen en el mismo paso que la baja`)
  ok(filas.every((f) => Number.isFinite(f.foto) && Number.isFinite(f.cuerpoPorFotos)), `${modo}: premisa — la foto y el cuerpo caído llegan`)
}
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
