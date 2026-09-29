// publicar107 — lo que le falta a un mapa para subirse al juego (vuelta 107,
// A2), contra `faltasParaPublicar`, la función con la que el servidor de
// desarrollo se niega a subir y Alchemist lo dice antes de pulsar.
import { faltasParaPublicar } from '../src/maps/formato.js'
import { SCENARIOS, TODOS } from '../src/config.js'

let fallos = 0
const ok = (c, t, d = '') => { console.log(`  ${c ? 'ok  ' : 'FALLO'} ${t}${d ? ` — ${d}` : ''}`); if (!c) fallos += 1 }
const base = {
  clave: 'p107', label: 'p107', room: { width: 40, depth: 40, height: 10 }, spawn: { x: 0, z: 0 },
  boxes: [], modos: ['entrenamiento'],
}
const con = (cambios) => ({ ...base, ...cambios })
const hay = (def, re, o) => faltasParaPublicar(def, o).some((f) => re.test(f))

console.log('\n[1] Lo de hoy')
ok(faltasParaPublicar(base).length === 0, 'un mapa de entrenamiento completo se sube')
ok(faltasParaPublicar(SCENARIOS.duelo).length === 0 && faltasParaPublicar(SCENARIOS.pilares).length === 0, 'El Espejo y Los Pilares, también')
ok(faltasParaPublicar(SCENARIOS['el-espejo-peanas']).length === 0, 'y el de peanas de Yago')

console.log('\n[2] Lo que bloquea')
ok(hay(con({ modos: [] }), /ningún modo/), 'publicado en ningún modo')
ok(hay(con({ modos: ['duelo'], soloDuelo: true, duelo: { salidas: [{ x: 0, z: 5, yaw: 0 }] } }), /hacen falta 2/), 'duelo con una salida')
ok(hay(con({ modos: ['todos'], todos: { salidas: [{ x: 0, z: 5 }, { x: 5, z: 5 }] } }), new RegExp(`al menos ${TODOS.minJugadores}`)), 'todos contra todos con dos salidas')
ok(hay(con({ modos: ['duelo'], soloDuelo: true, duelo: { salidas: [{ x: 0, z: 5, yaw: 0 }, { x: 0, z: 30, yaw: 0 }] } }), /fuera de la sala/), 'una salida fuera de la sala')
ok(hay(con({ reglas: { modo: 'peanas', armas: ['krakov'] }, peanas: [] }), /sin ninguna peana/), 'modo Peanas sin peanas')
ok(hay(con({ reglas: { modo: 'peanas', armas: ['krakov'] }, peanas: [{ x: 0, z: 0, arma: 'rift' }] }), /no admite/), 'una peana de un arma que el mapa no admite')
ok(hay(con({ modos: ['duelo'], soloDuelo: true, duelo: { salidas: [{ x: 0, z: 5, yaw: 0 }, { x: 0, z: -5, yaw: 0 }], invulnerabilidadMs: 3 } }), /3 ms/), 'una gracia de 3 ms (Aim Camp)')
ok(!hay(con({ modos: ['duelo'], soloDuelo: true, duelo: { salidas: [{ x: 0, z: 5, yaw: 0 }, { x: 0, z: -5, yaw: 0 }], invulnerabilidadMs: 3000 } }), /ms/), 'y una de 3 s no')
const logo = con({ estampados: [{ imagen: '/estampados/no-esta.webp', cara: 'norte', x: 0, y: 2, z: 0, ancho: 4, alto: 2 }] })
ok(hay(logo, /Falta la imagen/, { existeImagen: () => false }) && !hay(logo, /Falta la imagen/, { existeImagen: () => true }), 'un estampado sin su imagen en el disco')

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO VERDE')
process.exit(fallos ? 1 : 0)
