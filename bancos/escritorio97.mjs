/**
 * escritorio97 — **¿sabe la página dónde está, y se comporta distinto ahí?**
 *
 * Los puntos 1, 2 y 4 de la vuelta 97 cuelgan todos de la misma pregunta —«¿soy
 * la app?»— y de que la respuesta sea **verdad**: si se equivoca hacia el lado
 * malo, `Ctrl` pasa a ser agacharse en un navegador y `Ctrl+W` cierra la pestaña
 * en mitad de una ronda, que es el fallo de la vuelta 27 servido a mano.
 *
 * Sin navegador. Tres partes:
 *
 *  1. **Las premisas de los dos ficheros que no se pueden importar el uno al
 *     otro**: `tauri.conf.json` es JSON y no puede leer `config.js`, así que la
 *     marca del agente de usuario está escrita dos veces y aquí se comparan. Lo
 *     mismo con el nombre de la orden nativa y con el origen de la capacidad.
 *  2. **Los binds en los dos sitios**, cada uno en su propio proceso —un módulo
 *     se evalúa una vez, así que dos contextos piden dos procesos— con un
 *     `localStorage` de mentira para poder mirar lo que se guarda.
 *  3. **La redirección al dominio bueno**, contra el huésped de verdad.
 */
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { setTimeout as esperar } from 'node:timers/promises'
import { ESCRITORIO } from '../src/config.js'

let fallos = 0
const afirmar = (ok, que) => {
  if (!ok) fallos++
  console.log(`${ok ? '  ok  ' : ' FALLA'}  ${que}`)
}

const leerJSON = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'))

// ---------------------------------------------------------------------------
console.log('--- [1] Lo que está escrito dos veces ---')

const conf = leerJSON('../escritorio/src-tauri/tauri.conf.json')
const cap = leerJSON('../escritorio/src-tauri/capabilities/principal.json')
const ventana = conf.app.windows[0]

afirmar(
  typeof ventana.userAgent === 'string' && ventana.userAgent.includes(ESCRITORIO.marcaUA),
  `el agente de usuario de la ventana lleva «${ESCRITORIO.marcaUA}»`,
)
// Y el denominador: que **un navegador de verdad no lo lleve**. Sin esto, una
// marca como «Mozilla» pasaría la fila de arriba y haría de cualquier pestaña
// una app.
const UA_NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
afirmar(!UA_NAVEGADOR.includes(ESCRITORIO.marcaUA), 'y un agente de usuario normal no la lleva')

const rust = readFileSync(new URL('../escritorio/src-tauri/src/main.rs', import.meta.url), 'utf8')
afirmar(
  rust.includes(`fn ${ESCRITORIO.ordenPantallaCompleta}(`),
  `la orden «${ESCRITORIO.ordenPantallaCompleta}» existe en main.rs`,
)
afirmar(conf.app.withGlobalTauri === true, 'la ventana publica el puente de Tauri en la página')
afirmar(ventana.visible === false, 'la ventana nace invisible (se muestra tras decidir la pantalla completa)')

// **El IPC está atado al origen**, así que la URL que abre la ventana tiene que
// estar en la lista de la capacidad. Si se separan, la app abre y la pantalla
// completa no hace nada — sin un error en ninguna pantalla.
const origen = new URL(ventana.url).origin
afirmar(
  (cap.remote?.urls ?? []).some((u) => u.replace(/\/$/, '') === origen),
  `la capacidad permite el origen que abre la ventana (${origen})`,
)

// La versión del instalador está en el rótulo de abajo, que es el que decía
// «Nullsoft Install System». Escrita a mano en el mismo fichero: que no se
// separe de la versión lo guarda esta fila.
afirmar(
  typeof conf.bundle.copyright === 'string' && conf.bundle.copyright.includes(conf.version),
  `el rótulo del instalador lleva la versión (${conf.bundle.copyright})`,
)
afirmar(
  !/nullsoft/i.test(conf.bundle.copyright),
  'y no es el de Nullsoft',
)

// ---------------------------------------------------------------------------
console.log('\n--- [2] Los binds, en un navegador y en la app ---')

/**
 * Corre un trozo de script con el agente de usuario que se le diga y un
 * `localStorage` de mentira, en **su propio proceso**: los módulos se evalúan una
 * vez por proceso, así que dos contextos no caben en uno.
 */
function enContexto(ua, guardado, cuerpo) {
  const preludio = `
    const almacen = new Map(${JSON.stringify(guardado === null ? [] : [['aimcore.keybinds.v1', JSON.stringify(guardado)]])})
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: ${JSON.stringify(ua)} }, configurable: true, writable: true,
    })
    globalThis.window = {
      localStorage: {
        getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
        setItem: (k, v) => almacen.set(k, v),
      },
    }
    const kb = await import('${new URL('../src/keybinds.js', import.meta.url).href}')
    const salida = await (async () => { ${cuerpo} })()
    console.log('<<<' + JSON.stringify({ salida, guardado: almacen.get('aimcore.keybinds.v1') ?? null }) + '>>>')
  `
  const crudo = execFileSync(process.execPath, ['--input-type=module', '-e', preludio], { encoding: 'utf8' })
  return JSON.parse(crudo.match(/<<<([\s\S]*)>>>/)[1])
}

const UA_APP = ventana.userAgent
const eventoCtrl = { ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, code: 'ControlLeft', type: 'keydown' }

const nav = enContexto(UA_NAVEGADOR, null, `
  return {
    esApp: false,
    crouch: kb.getKeybinds().crouch,
    asignable: kb.isAssignable('ControlLeft'),
    conflicto: kb.captureConflict('crouch', ${JSON.stringify(eventoCtrl)}, kb.getKeybinds()),
  }
`)
afirmar(nav.salida.crouch === 'KeyC', `navegador: agacharse sale en ${nav.salida.crouch}`)
afirmar(nav.salida.asignable === false, 'navegador: Ctrl no se puede asignar')
afirmar(typeof nav.salida.conflicto === 'string' && /Ctrl\+W/.test(nav.salida.conflicto),
  `navegador: y el panel dice por qué — «${nav.salida.conflicto}»`)

const app = enContexto(UA_APP, null, `
  return {
    crouch: kb.getKeybinds().crouch,
    asignable: kb.isAssignable('ControlLeft'),
    conflicto: kb.captureConflict('crouch', ${JSON.stringify(eventoCtrl)}, kb.getKeybinds()),
    combinacion: kb.captureConflict('crouch', { ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, code: 'KeyZ', type: 'keydown' }, kb.getKeybinds()),
  }
`)
afirmar(app.salida.crouch === 'ControlLeft', `app: agacharse sale en ${app.salida.crouch}`)
afirmar(app.salida.asignable === true, 'app: Ctrl se puede asignar')
afirmar(app.salida.conflicto === null, 'app: y el panel no pone ningún aviso al pulsarla')
// Lo que **sigue** prohibido ahí: la combinación. `Ctrl+Z` manda `KeyZ`, y quien
// lo pulsó no quería asignar la Z.
afirmar(typeof app.salida.combinacion === 'string', `app: pero Ctrl+Z sigue rechazado — «${app.salida.combinacion}»`)

console.log('\n--- [2b] Lo guardado es la elección; lo vigente, lo que este sitio admite ---')

// La app elige Ctrl y lo guarda.
const appGuarda = enContexto(UA_APP, null, `
  kb.setKeybind('crouch', 'ControlLeft')
  return { crouch: kb.getKeybinds().crouch }
`)
afirmar(appGuarda.salida.crouch === 'ControlLeft', 'app: se asigna Ctrl a agacharse')
const guardado = JSON.parse(appGuarda.guardado)
afirmar(guardado.crouch === 'ControlLeft', `y lo guardado dice ControlLeft (${appGuarda.guardado})`)

// Abrir el juego en un navegador con eso guardado: se juega con la C **y no se
// pisa lo guardado**, ni siquiera reasignando otra cosa. Sin esto, abrir el
// navegador una vez le borraría el Ctrl a la app.
const navLee = enContexto(UA_NAVEGADOR, guardado, `
  const antes = kb.getKeybinds().crouch
  kb.setKeybind('reload', 'KeyT')
  return { antes, despues: kb.getKeybinds().crouch, reload: kb.getKeybinds().reload }
`)
afirmar(navLee.salida.antes === 'KeyC', `navegador: con eso guardado se juega con ${navLee.salida.antes}`)
afirmar(navLee.salida.reload === 'KeyT', 'navegador: y se puede reasignar otra tecla')
const trasElNavegador = JSON.parse(navLee.guardado)
afirmar(trasElNavegador.crouch === 'ControlLeft',
  `y lo guardado sigue diciendo ControlLeft (${navLee.guardado})`)

// Y la app lo recupera entero.
const appVuelve = enContexto(UA_APP, trasElNavegador, `return { crouch: kb.getKeybinds().crouch, reload: kb.getKeybinds().reload }`)
afirmar(appVuelve.salida.crouch === 'ControlLeft', 'app: y al volver sigue teniendo su Ctrl')
afirmar(appVuelve.salida.reload === 'KeyT', 'app: con la reasignación hecha en el navegador puesta')

// Restablecer todo en un navegador tampoco se lo quita: lo que se borra es la
// elección, y lo de fábrica es distinto en cada sitio.
const navReset = enContexto(UA_NAVEGADOR, trasElNavegador, `kb.resetKeybinds(); return { crouch: kb.getKeybinds().crouch }`)
afirmar(navReset.salida.crouch === 'KeyC', 'navegador: restablecer deja la C')
const trasReset = JSON.parse(navReset.guardado)
const appTrasReset = enContexto(UA_APP, trasReset, `return { crouch: kb.getKeybinds().crouch }`)
afirmar(appTrasReset.salida.crouch === 'ControlLeft',
  'y la app vuelve a su Ctrl de fábrica, no a la C del navegador')

// ---------------------------------------------------------------------------
console.log('\n--- [3] El nombre bueno: a quién se redirige y a quién no ---')

const PUERTO = 5251
const DOMINIO = 'vektor.example'
const huesped = spawn(process.execPath, ['net/servidor.mjs'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PUERTO), VEKTOR_DOMINIO: DOMINIO, VEKTOR_RONDAS: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let arrancado = false
for (let i = 0; i < 60 && !arrancado; i++) {
  await esperar(250)
  try {
    execFileSync('curl', ['-sf', '-o', '/dev/null', `http://127.0.0.1:${PUERTO}/salud`])
    arrancado = true
  } catch { /* todavía no */ }
}
afirmar(arrancado, `el huésped contesta en el ${PUERTO}`)

/** Cabeceras de la respuesta, con el Host y el agente de usuario que se digan. */
function pedir(ruta, host, ua) {
  const args = ['-s', '-o', '/dev/null', '-D', '-', '-H', `Host: ${host}`]
  if (ua) args.push('-A', ua)
  return execFileSync('curl', [...args, `http://127.0.0.1:${PUERTO}${ruta}`], { encoding: 'utf8' })
}
const codigoDe = (cab) => Number(cab.match(/^HTTP\/[\d.]+ (\d+)/)[1])
const destinoDe = (cab) => (cab.match(/^location:\s*(.+)$/im) || [])[1]?.trim() ?? null

if (arrancado) {
  const salud = JSON.parse(execFileSync('curl', ['-s', `http://127.0.0.1:${PUERTO}/salud`], { encoding: 'utf8' }))
  afirmar(salud.dominio === DOMINIO, `/salud dice a qué nombre manda (${salud.dominio})`)

  const viejo = pedir('/', 'ancient-violet-678.fly.dev', UA_NAVEGADOR)
  afirmar(codigoDe(viejo) === 302, `un navegador en la dirección vieja recibe ${codigoDe(viejo)}`)
  afirmar(destinoDe(viejo) === `https://${DOMINIO}/`, `y se le manda a ${destinoDe(viejo)}`)

  const conRuta = pedir('/duelo/ABCDEF?mapa=espejo', 'ancient-violet-678.fly.dev', UA_NAVEGADOR)
  afirmar(destinoDe(conRuta) === `https://${DOMINIO}/duelo/ABCDEF?mapa=espejo`,
    `con su ruta y su consulta enteras (${destinoDe(conRuta)})`)

  const bueno = pedir('/', DOMINIO, UA_NAVEGADOR)
  afirmar(codigoDe(bueno) === 200, `y el nombre bueno se sirve (${codigoDe(bueno)}), o sea que no hay bucle`)

  // **La app no se redirige**, que es lo que hace que cambiar de dominio no
  // obligue a reinstalar: su canal con la ventana está atado al origen.
  const laApp = pedir('/', 'ancient-violet-678.fly.dev', UA_APP)
  afirmar(codigoDe(laApp) === 200, `la app de escritorio en la dirección vieja recibe ${codigoDe(laApp)}`)

  // Y las dos excepciones que sostienen el despliegue y el juego en casa.
  const saludCab = pedir('/salud', 'ancient-violet-678.fly.dev', UA_NAVEGADOR)
  afirmar(codigoDe(saludCab) === 200, '/salud no se redirige (lo comprueba el despliegue)')
  const local = pedir('/', 'localhost', UA_NAVEGADOR)
  afirmar(codigoDe(local) === 200, 'localhost no se redirige')
  const lan = pedir('/', '192.168.1.40', UA_NAVEGADOR)
  afirmar(codigoDe(lan) === 200, 'y una IP de red tampoco (npm run host)')
}

huesped.kill()

console.log(`\n${fallos === 0 ? 'TODO VERDE' : `${fallos} FALLOS`}`)
process.exit(fallos === 0 ? 0 : 1)
