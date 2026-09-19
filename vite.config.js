import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NET } from './src/config.js'

/**
 * **`/duelo/` también en desarrollo** (vuelta 66). Los dos huéspedes sirven la
 * página del 1v1 en esa ruta —que no es un fichero: el código va dentro— y el
 * servidor de Vite no, así que en local había que escribir `/net/prueba.html`.
 * Es una diferencia entre desarrollo y despliegue que no decidió nadie, y desde
 * que hay un botón en el menú que apunta ahí, una que se nota.
 *
 * Se reescribe **la petición**, no la dirección del navegador: `location.pathname`
 * sigue diciendo `/duelo/ABC123`, que es de donde la página saca el código.
 */
const duelo = {
  name: 'vektor-duelo',
  configureServer(servidor) {
    servidor.middlewares.use((peticion, respuesta, siguiente) => {
      if (peticion.url && peticion.url.startsWith(NET.rutaDuelo.replace(/\/$/, ''))) {
        peticion.url = '/net/prueba.html'
      }
      siguiente()
    })
  },
}

/**
 * **El editor de mapas, y sólo mientras sirve Vite** (vuelta 74).
 *
 * No entra en `dist/` a propósito: es una herramienta de autor, no una pantalla
 * del juego, y el despliegue no tiene por qué llevar un editor que cualquiera
 * pueda abrir. Ponerlo ahí el día que haga falta es una línea más en `input`.
 *
 * Y por eso el guardado es un middleware y no una API: **existe sólo en
 * desarrollo**, que es donde está el repositorio en el que escribe.
 */
const CARPETA_MAPAS = resolve(import.meta.dirname, 'src/maps')
const NO_SON_MAPAS = new Set(['index.js', 'formato.js'])

/**
 * Reescribe el registro leyendo **la clave que declara cada fichero**, no su
 * nombre: el mapa dice cómo se llama y no hay una segunda fuente de verdad.
 */
function regenerarRegistro() {
  const ficheros = readdirSync(CARPETA_MAPAS)
    .filter((nombre) => nombre.endsWith('.js') && !NO_SON_MAPAS.has(nombre))
    .sort()

  const entradas = []
  for (const nombre of ficheros) {
    const texto = readFileSync(resolve(CARPETA_MAPAS, nombre), 'utf8')
    const clave = texto.match(/clave:\s*"([^"]+)"/)?.[1]
    if (!clave) continue
    entradas.push({ nombre, clave, alias: `mapa_${clave.replace(/[^a-zA-Z0-9_]/g, '_')}` })
  }

  const ruta = resolve(CARPETA_MAPAS, 'index.js')
  const actual = readFileSync(ruta, 'utf8')
  const cabecera = actual.split('\n/** @type')[0].split('\nimport ')[0]
  const imports = entradas.map((e) => `import ${e.alias} from './${e.nombre}'`).join('\n')
  const cuerpo = entradas.map((e) => `  '${e.clave}': ${e.alias},`).join('\n')
  const nuevo = `${cabecera}${imports ? `\n${imports}\n` : ''}\n/** @type {Record<string, object>} */\nexport const MAPAS_DE_FICHERO = {${cuerpo ? `\n${cuerpo}\n` : ''}}\n`

  /**
   * **Sólo se escribe si cambia, y eso no es una optimización: es lo que
   * corta un bucle infinito.** `vite.config.js` importa `src/config.js` —para
   * la ruta del duelo— y `config.js` importa este registro, así que el registro
   * está en el **grafo de la configuración**: tocarlo reinicia el servidor de
   * desarrollo. Y reiniciarlo vuelve a pasar por aquí.
   *
   * Con una escritura incondicional eso es un servidor que se reinicia para
   * siempre, y el síntoma no es un error: es que **ninguna página carga** y los
   * bancos salen con «0 pass», que es el falso negativo de la vuelta 45 por una
   * puerta nueva.
   */
  if (nuevo !== actual) writeFileSync(ruta, nuevo)
  return entradas.length
}

const editor = {
  name: 'vektor-editor',
  apply: 'serve',
  configureServer(servidor) {
    /**
     * **Al arrancar, el registro se regenera.** Un mapa borrado a mano dejaba
     * una importación apuntando a un fichero que no está, y eso no rompe el
     * editor: rompe `config.js`, o sea **el juego entero no carga**. Lo cazó el
     * banco de la fase 1 dejándose un mapa a medio limpiar.
     *
     * Aquí y no en el build a propósito: lo que se despliega lleva el registro
     * que se haya commiteado, y si ése no cuadra tiene que fallar al construir
     * —ruidosamente— en vez de servirse a medias.
     */
    regenerarRegistro()

    servidor.middlewares.use((peticion, respuesta, siguiente) => {
      if (peticion.url === '/editor' || peticion.url === '/editor/') {
        peticion.url = '/editor/index.html'
        return siguiente()
      }
      if (peticion.url !== '/__editor/guardar' || peticion.method !== 'POST') return siguiente()

      let cuerpo = ''
      peticion.on('data', (trozo) => { cuerpo += trozo })
      peticion.on('end', () => {
        respuesta.setHeader('content-type', 'application/json')
        try {
          const { clave, modulo } = JSON.parse(cuerpo)
          // Una clave es un nombre de fichero: lo que no sea una letra, un
          // número, un guion o un guion bajo no entra. Sin esto, una clave con
          // `../` escribiría fuera de `src/maps/`.
          if (!/^[a-zA-Z0-9_-]+$/.test(clave ?? '')) {
            respuesta.statusCode = 400
            respuesta.end(JSON.stringify({ error: 'clave no válida' }))
            return
          }
          const fichero = `src/maps/${clave}.js`
          writeFileSync(resolve(CARPETA_MAPAS, `${clave}.js`), modulo)
          const total = regenerarRegistro()
          respuesta.end(JSON.stringify({ fichero, total }))
        } catch (error) {
          respuesta.statusCode = 500
          respuesta.end(JSON.stringify({ error: error.message }))
        }
      })
    })
  },
}

export default defineConfig({
  plugins: [react(), duelo, editor],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      /**
       * **Dos páginas, no una** (vuelta 47). Hasta aquí Vite empaquetaba sólo
       * `index.html` y el banco del 1v1 se quedaba fuera del build a propósito:
       * era una herramienta para mirar dos pestañas en local.
       *
       * Desde que hay servidor en Cloudflare, el duelo es **lo que se le manda
       * a un amigo**, así que tiene que estar en lo que se despliega. Sigue sin
       * ser una pantalla del juego —no hay menú, ni armería, ni puntuación— y
       * por eso sigue siendo una página aparte y no una fase de `App.jsx`.
       *
       * Ojo con lo de siempre: las PNG de `Reference/` no entran aquí, que son
       * material de trazado y no assets.
       */
      input: {
        juego: resolve(import.meta.dirname, 'index.html'),
        duelo: resolve(import.meta.dirname, 'net/prueba.html'),
      },
    },
  },
})
