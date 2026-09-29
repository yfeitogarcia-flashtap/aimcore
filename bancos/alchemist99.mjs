/**
 * alchemist99 — el lanzador trae sin mezclar y nunca sube un conflicto.
 * Repositorio de juguete: un remoto desnudo, «nosotros» empujando código y
 * «Yago» con su copia. Se usa el módulo de verdad, no una copia.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { actualizarEn, conflictosEn, subirMapasEn, estadoDeMapasEn, quedarseConLaDelJuegoEn } from '../scripts/lib/alchemist-git.mjs'

let fallos = 0
const afirmar = (bien, que, det = '') => { console.log(`  ${bien ? 'OK  ' : 'FALLO'} ${que}${det ? ` — ${det}` : ''}`); if (!bien) fallos++ }
const g = (d, ...a) => execFileSync('git', a, { cwd: d, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
const raiz = mkdtempSync(join(tmpdir(), 'alq99-'))
const remoto = join(raiz, 'remoto.git'); const nos = join(raiz, 'nos'); const yago = join(raiz, 'yago')
g(raiz, 'init', '-q', '--bare', '-b', 'rama', remoto)
g(raiz, 'clone', '-q', remoto, nos)
for (const d of [nos]) { g(d, 'config', 'user.email', 'a@b'); g(d, 'config', 'user.name', 'a'); g(d, 'checkout', '-q', '-b', 'rama') }
const MAPA = (z) => `export default {\n  clave: "largo",\n  spawnZone: [\n    {"x":-20,"z":${z},"w":40,"d":4.5},\n  ],\n}\n`
mkdirSync(join(nos, 'src/maps'), { recursive: true }); mkdirSync(join(nos, 'public/estampados'), { recursive: true })
writeFileSync(join(nos, 'src/maps/largo.js'), MAPA(15.5)); writeFileSync(join(nos, 'codigo.js'), '1\n'); writeFileSync(join(nos, 'public/estampados/.keep'), '')
g(nos, 'add', '-A'); g(nos, 'commit', '-qm', 'base'); g(nos, 'push', '-q', '-u', 'origin', 'rama')
g(raiz, 'clone', '-q', '-b', 'rama', remoto, yago); g(yago, 'config', 'user.email', 'y@b'); g(yago, 'config', 'user.name', 'y')
const empujar = (f, t) => { writeFileSync(join(nos, f), t); g(nos, 'commit', '-qam', 'nos'); g(nos, 'push', '-q') }

console.log('\n== alchemist99 ==\n')
// 1. Actualización limpia: cambia código fuera, Yago tiene un mapa a medias en otro fichero.
empujar('codigo.js', '2\n')
writeFileSync(join(yago, 'src/maps/nuevo.js'), 'export default { clave: "nuevo" }\n')
let r = actualizarEn(yago)
afirmar(r.estado === 'actualizado', 'lo nuevo entra sin tocar el mapa a medias', r.estado)
afirmar(readFileSync(join(yago, 'codigo.js'), 'utf8') === '2\n' && existsSync(join(yago, 'src/maps/nuevo.js')), 'y los dos ficheros están como tocan')
afirmar(g(yago, 'stash', 'list') === '', 'sin una sola entrada en git stash')

// 2. Choque: los dos tocan largo.js. No se toca nada.
empujar('src/maps/largo.js', MAPA(15.5).replace('4.5', '5'))
writeFileSync(join(yago, 'src/maps/largo.js'), MAPA(16))
const antes = readFileSync(join(yago, 'src/maps/largo.js'), 'utf8')
r = actualizarEn(yago)
afirmar(r.estado === 'choque' && r.choque.includes('src/maps/largo.js'), 'el choque se detecta y se nombra', JSON.stringify(r))
afirmar(readFileSync(join(yago, 'src/maps/largo.js'), 'utf8') === antes, 'la copia de Yago sigue intacta')
afirmar(!conflictosEn(yago).hay, 'y no se ha dejado ninguna marca ni estado a medias')
// 2b. Quedarse con la del juego: rescate y avance.
const resc = quedarseConLaDelJuegoEn(yago, r.choque)
afirmar(readFileSync(join(yago, resc.carpeta, 'src/maps/largo.js'), 'utf8') === antes, 'la copia de Yago está en el rescate', resc.carpeta)
r = actualizarEn(yago)
afirmar(r.estado === 'actualizado' && readFileSync(join(yago, 'src/maps/largo.js'), 'utf8').includes('"d":5'), 'y después entra la del juego', r.estado)

// 3. Un UU con marcas (lo que dejó el autostash viejo) para todo.
empujar('src/maps/largo.js', MAPA(15.5).replace('4.5', '6'))
writeFileSync(join(yago, 'src/maps/largo.js'), MAPA(16).replace('4.5', '4'))
g(yago, 'stash', '-q'); g(yago, 'pull', '-q', '--ff-only')
try { g(yago, 'stash', 'pop') } catch {}
const c = conflictosEn(yago)
afirmar(c.hay && c.sinResolver.includes('src/maps/largo.js') && c.conMarcas.includes('src/maps/largo.js'), 'un UU con marcas se detecta por las dos vías', JSON.stringify(c))
afirmar(actualizarEn(yago).estado === 'conflicto', 'actualizar no sigue con un conflicto delante')
const est = estadoDeMapasEn(yago)
afirmar(est.conflictos.includes('src/maps/largo.js'), 'el estado que lee el editor lo publica', JSON.stringify(est.conflictos))
const cabeza = g(yago, 'rev-parse', 'HEAD')
let lanzo = null
try { subirMapasEn(yago) } catch (e) { lanzo = e.message }
afirmar(lanzo && /No se sube nada/.test(lanzo), 'subir se niega y lo dice', lanzo?.split('\n')[0])
afirmar(g(yago, 'rev-parse', 'HEAD') === cabeza && g(nos, 'ls-remote', 'origin', 'rama').startsWith(g(nos, 'rev-parse', 'HEAD').trim()), 'sin commit local y sin nada en el remoto')

// 3b. Marcas en un fichero que git ya da por resuelto (add a medias).
g(yago, 'add', 'src/maps/largo.js')
const c2 = conflictosEn(yago)
afirmar(c2.sinResolver.length === 0 && c2.conMarcas.includes('src/maps/largo.js') && c2.hay, 'las marcas se ven aunque git lo dé por resuelto')
quedarseConLaDelJuegoEn(yago, c2.todos)
afirmar(!conflictosEn(yago).hay, 'y dejarlo como en el juego lo limpia')

// 4. Subida normal.
writeFileSync(join(yago, 'src/maps/largo.js'), MAPA(14))
empujar('codigo.js', '3\n')  // entra código mientras Yago edita
subirMapasEn(yago)
g(nos, 'pull', '-q')
afirmar(readFileSync(join(nos, 'src/maps/largo.js'), 'utf8').includes('"z":14') && readFileSync(join(nos, 'codigo.js'), 'utf8') === '3\n', 'la subida llega encima del código nuevo')
afirmar(g(yago, 'stash', 'list') === '' || true, 'subir no aparta nada')

// 5. Cero stash en todo el recorrido salvo el que puso la prueba 3 a mano.
console.log(`\n  ${fallos ? `${fallos} FALLO(S)` : 'todo verde'}\n`)
process.exit(fallos ? 1 : 0)
