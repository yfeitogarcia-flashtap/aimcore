// compra102 — la compra sin límite contra `Lobby` y `Partida`, sin navegador.
import * as THREE from 'three'
import { Lobby } from '../net/lobby.js'
import { Scenario } from '../src/game/scenario.js'
import { MSG, compraAbierta } from '../net/protocolo.js'
import { ROUNDS, definicionDeSala } from '../src/config.js'

let fallos = 0
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}`); if (!c) fallos += 1 }
const crear = (modo, clave) => new Scenario(new THREE.Scene(), definicionDeSala(modo, clave))
function jugador(lobby) {
  const buzon = []
  const j = { buzon, id: null }
  j.id = lobby.entra((t) => buzon.push(JSON.parse(t)))
  j.ultimo = (t) => [...buzon].reverse().find((m) => m.t === t)
  j.manda = (o) => lobby.recibe(j.id, JSON.stringify(o))
  return j
}
const pasos = (L, n) => { for (let i = 0; i < n; i++) L.tick() }

console.log('[1] El lobby la ofrece y la acepta')
ok(ROUNDS.compraOpciones.includes(ROUNDS.compraSinLimite), `está entre las opciones (${ROUNDS.compraOpciones})`)
const L = new Lobby({ crearEscenario: crear, modo: '2v2', mapa: 'duelo', rondas: true })
const js = [jugador(L), jugador(L), jugador(L), jugador(L)]
js[0].manda({ t: MSG.CONFIG, compra: ROUNDS.compraSinLimite })
ok(js[1].ultimo(MSG.LOBBY).compra === -1, 'el anfitrión la elige y la ven todos')
for (const j of js) j.manda({ t: MSG.LISTO, v: true })
js[0].manda({ t: MSG.LANZAR })
const p = L.partida
ok(p && p.compraSinLimite && p.rondas.fase === 'compra', `la partida arranca en compra sin límite (${p?.rondas.fase})`)
ok(js[0].ultimo(MSG.BIENVENIDA) && js[2].ultimo(MSG.ECONOMIA)?.compra === -1, 'la economía lo dice (compra −1)')

console.log('[2] No la cierra el reloj')
pasos(L, 60 * 90)
ok(p.rondas.fase === 'compra', `90 s después sigue en compra (${p.rondas.fase})`)
const foto = [...js[1].buzon].reverse().find((m) => m.t === MSG.FOTO)
ok(foto?.rd?.resta === -1 && foto.rd.nl === 4 && foto.rd.li.length === 0, `la foto: sin cuenta, 0 listos, faltan 4 (${JSON.stringify(foto?.rd)})`)
ok(compraAbierta('compra', -1) && !compraAbierta('ronda', -1) && compraAbierta('ronda', 0), 'la tienda: abierta en la fase, cerrada en la ronda (y «sin fase» sigue igual)')

console.log('[3] La cierran los «listo» de todos')
for (const j of js.slice(0, 3)) j.manda({ t: MSG.LISTO_COMPRA, v: 1 })
pasos(L, 5)
ok(p.rondas.fase === 'compra', `con 3 de 4, sigue (${p.rondas.fase})`)
js[1].manda({ t: MSG.LISTO_COMPRA, v: 0 })
js[3].manda({ t: MSG.LISTO_COMPRA, v: 1 })
pasos(L, 5)
const f2 = [...js[0].buzon].reverse().find((m) => m.t === MSG.FOTO)
ok(p.rondas.fase === 'compra' && f2.rd.nl === 1, `uno se desmarca: sigue, falta 1 (${f2.rd.nl})`)
js[1].manda({ t: MSG.LISTO_COMPRA, v: 1 })
pasos(L, 2)
ok(p.rondas.fase === 'ronda', `el último «listo» empieza la ronda (${p.rondas.fase})`)
js[2].manda({ t: MSG.LISTO_COMPRA, v: 1 })
ok(p.rondas.listos.size === 0, 'un «listo» fuera de la compra no se apunta')

console.log('[4] Quien se cae no la bloquea, y en la siguiente compra se empieza de cero')
p._terminarRonda(0, 'muerte')
ok(p.rondas.fase === 'compra' && p.rondas.listos.size === 0, `nueva compra, sin listos (${p.rondas.fase})`)
L.sedesconecta(js[3].id)
pasos(L, 2)
for (const j of js.slice(0, 3)) j.manda({ t: MSG.LISTO_COMPRA, v: 1 })
pasos(L, 3)
ok(p.rondas.fase === 'ronda' || p.pausa, `con uno caído, los tres conectados bastan (${p.rondas.fase}${p.pausa ? ', en pausa por caída' : ''})`)

console.log('[5] Con reloj no se puede acortar')
const M = new Lobby({ crearEscenario: crear, modo: 'duelo', mapa: 'duelo', rondas: true, compra: 15 })
const ks = [jugador(M), jugador(M)]
for (const j of ks) j.manda({ t: MSG.LISTO, v: true })
ks[0].manda({ t: MSG.LANZAR })
for (const j of ks) j.manda({ t: MSG.LISTO_COMPRA, v: 1 })
pasos(M, 30)
ok(M.partida.rondas.fase === 'compra' && M.partida.rondas.listos.size === 0, 'en una compra de 15 s el «listo» no hace nada')
pasos(M, 60 * 15)
ok(M.partida.rondas.fase === 'ronda', 'y a los 15 s empieza, como siempre')

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
