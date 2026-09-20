import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
/**
 * **La configuración de Vite no importa nada de `src/`, y eso resuelve tres
 * cosas a la vez** (vuelta 75).
 *
 * Importaba `src/config.js` —para la ruta del duelo— y `config.js` importa el
 * registro de mapas, así que **cada mapa era una dependencia de la
 * configuración**. De ahí salían tres problemas que parecían distintos:
 *
 * 1. **Guardar reiniciaba el servidor entero**, no sólo recargaba la página.
 * 2. **Regenerar el registro también**, y por eso hubo que escribir sólo si
 *    cambia para no entrar en bucle (vuelta 74).
 * 3. Y el peor: con el registro apuntando a un mapa borrado, **el servidor no
 *    podía ni arrancar** — y lo que lo cura (`regenerarRegistro`) vive dentro
 *    del servidor que no arranca. Un mapa borrado a mano dejaba el proyecto sin
 *    forma de levantarse salvo editando el registro a mano.
 *
 * Se cargan al atender, no al configurar, y con el especificador construido en
 * tiempo de ejecución para que el empaquetador de la configuración no lo siga.
 * El precio, que es el de siempre y ya está escrito en CLAUDE.md §4: tocar
 * `config.js` o `formato.js` pide reiniciar el servidor de desarrollo.
 */
const cacheDeModulos = new Map()
function modulo(relativa) {
  if (!cacheDeModulos.has(relativa)) {
    cacheDeModulos.set(relativa, import(/* @vite-ignore */ new URL(relativa, import.meta.url).href))
  }
  return cacheDeModulos.get(relativa)
}

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
  /**
   * **La ruta se resuelve al arrancar; el middleware es síncrono.**
   *
   * Con el `await` dentro, *todas* las peticiones del servidor de desarrollo
   * pasaban por una promesa antes de seguir, y en desarrollo eso son cientos
   * de módulos por carga. No dio ningún error: dio una página que tarda más en
   * estar lista, y **diecinueve suites en rojo** con síntomas que no se
   * parecían entre sí —binds que no responden, audio a cero, una desactivación
   * que no llega a término—. Todas eran esperas que se agotaban.
   */
  async configureServer(servidor) {
    const { NET } = await modulo('./src/config.js')
    const raiz = NET.rutaDuelo.replace(/\/$/, '')
    servidor.middlewares.use((peticion, respuesta, siguiente) => {
      if (peticion.url && peticion.url.startsWith(raiz)) peticion.url = '/net/prueba.html'
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
 * **El historial de un mapa, y por qué no es git** (vuelta 75).
 *
 * Guardar con un comentario, listar por fecha y volver atrás *es* git, y aun
 * así no se usa: la historia de este repositorio está curada —sus mensajes son
 * el porqué de cada vuelta— y cuarenta commits de «he movido una caja» la
 * degradarían. Son dos cosas con lectores distintos: **la historia del repo es
 * un artefacto; la de un mapa mientras se construye es material de trabajo.**
 *
 * Así que el historial es un fichero al lado del mapa, y git lo hace duradero
 * **al ritmo de quien commitea**, no al de cada guardado.
 *
 * Y es JSON, no un módulo, por una asimetría que conviene ver: **el mapa lo
 * tienen que leer los tres montajes** (Vite, Node y el navegador) y su
 * historial **sólo este servidor de desarrollo**. Lo que no entra en el juego
 * no tiene por qué pagar el formato del juego.
 */
const CARPETA_HISTORIAL = resolve(CARPETA_MAPAS, 'historial')

/**
 * **Las fotos panorámicas que haya dejadas** (vuelta 78).
 *
 * El editor las ofrece en el desplegable de fondo junto a los cuatro dibujados,
 * así que dejar un `.jpg` en `public/fondos/` y abrir el editor es todo lo que
 * hay que hacer para verlo puesto. Es de desarrollo y sólo de desarrollo: lo
 * que se despliega lleva las fotos que alguien haya decidido commitear, y
 * **listar un directorio no es algo que un servidor de producción deba hacer**.
 */
const CARPETA_FONDOS = resolve(import.meta.dirname, 'public/fondos')
const EXTENSIONES_FONDO = ['.jpg', '.jpeg', '.png', '.webp', '.avif']

function fondosDisponibles() {
  if (!existsSync(CARPETA_FONDOS)) return []
  return readdirSync(CARPETA_FONDOS)
    .filter((nombre) => EXTENSIONES_FONDO.some((ext) => nombre.toLowerCase().endsWith(ext)))
    .sort()
    .map((nombre) => ({ nombre, url: `/fondos/${nombre}` }))
}

/** Por encima de esto el panel avisa. **No se trunca**: ver `anotarEnHistorial`. */
const HISTORIAL_AVISO = 100

function rutaHistorial(clave) {
  return resolve(CARPETA_HISTORIAL, `${clave}.json`)
}

function leerHistorial(clave) {
  const ruta = rutaHistorial(clave)
  if (!existsSync(ruta)) return []
  try {
    const leido = JSON.parse(readFileSync(ruta, 'utf8'))
    return Array.isArray(leido?.versiones) ? leido.versiones : []
  } catch {
    // Un historial ilegible no puede impedir guardar: lo que no se puede
    // perder es el mapa, y el historial es la red que va debajo.
    return []
  }
}

/**
 * Añade una versión, **salvo que no haya cambiado nada**.
 *
 * Es la misma regla que corta el bucle de reinicios del registro (vuelta 74):
 * escribir sin cambio es ruido, y aquí además sería un historial lleno de
 * versiones idénticas en el que no se encuentra la que importa.
 *
 * **Y no se trunca por antigüedad.** Lo que se le pide a un historial es
 * exactamente lo viejo —«vuelve a como estaba la semana pasada»—, así que
 * tirar las primeras entradas es tirar lo único que no se puede reconstruir.
 * Un mapa ocupa unos pocos kilobytes; cuando la lista se hace larga, el panel
 * lo dice en vez de decidir por su cuenta.
 */
function anotarEnHistorial(clave, mapa, comentario) {
  const versiones = leerHistorial(clave)
  const serializado = JSON.stringify(mapa)
  if (versiones.at(-1) && JSON.stringify(versiones.at(-1).mapa) === serializado) {
    return { versiones: versiones.length, anotada: false }
  }
  versiones.push({
    instante: new Date().toISOString(),
    comentario: (comentario ?? '').trim() || '(sin comentario)',
    mapa,
  })
  mkdirSync(CARPETA_HISTORIAL, { recursive: true })
  // Una versión por línea: el fichero se lee en un `git diff`, y un JSON de
  // una sola línea con cincuenta versiones dentro no se lee.
  const texto = `{\n  "clave": ${JSON.stringify(clave)},\n  "versiones": [\n${versiones.map((v) => `    ${JSON.stringify(v)}`).join(',\n')}\n  ]\n}\n`
  writeFileSync(rutaHistorial(clave), texto)
  return { versiones: versiones.length, anotada: true }
}

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
  // La cabecera se recorta por detrás: sin esto cada regeneración le dejaba
  // una línea en blanco de más y el fichero crecía por abajo sin decir nada.
  const cabecera = actual.split('\n/** @type')[0].split('\nimport ')[0].replace(/\s+$/, '')
  const imports = entradas.map((e) => `import ${e.alias} from './${e.nombre}'`).join('\n')
  const cuerpo = entradas.map((e) => `  '${e.clave}': ${e.alias},`).join('\n')
  // La misma forma con mapas y sin ellos: una línea en blanco tras la cabecera
  // y otra tras los imports. Si no, el fichero baila de una línea entre
  // guardar el primer mapa y borrarlo, que es ruido en cada `git diff`.
  const nuevo = `${cabecera}\n\n${imports ? `${imports}\n\n` : ''}/** @type {Record<string, object>} */\nexport const MAPAS_DE_FICHERO = {${cuerpo ? `\n${cuerpo}\n` : ''}}\n`

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
  const cambiado = nuevo !== actual
  if (cambiado) writeFileSync(ruta, nuevo)
  return { total: entradas.length, cambiado }
}

/** ¿Este fichero es un mapa de `src/maps/`? Lo que decide si hay que regenerar. */
function alCambiarLosMapas(ruta) {
  const normalizada = ruta.split('\\').join('/')
  if (!normalizada.includes('/src/maps/') || !normalizada.endsWith('.js')) return
  if (NO_SON_MAPAS.has(normalizada.split('/').pop())) return
  regenerarRegistro()
}

const editor = {
  name: 'vektor-editor',

  /**
   * **El registro también se regenera al construir** (vuelta 76).
   *
   * Es un fichero generado y versionado, como `weaponPaths.js`, así que lo
   * normal es que el commiteado cuadre. Pero un clon limpio con mapas nuevos
   * —o un `dist/` hecho sin haber levantado nunca `npm run dev`— construía con
   * el registro que hubiera, no con los mapas que hay. Aquí no hay nada que
   * curar en caliente: o cuadra, o el build falla ruidosamente, que es lo
   * correcto para lo que se despliega.
   */
  buildStart() {
    regenerarRegistro()
  },

  // Sin `apply: 'serve'`: eso apagaría el plugin entero al construir y con él
  // el `buildStart` de arriba. Lo de desarrollo ya se queda en desarrollo solo,
  // porque `configureServer` no corre al construir.
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

    /**
     * **Y también cuando aparece o desaparece un mapa**, no sólo al arrancar.
     * Borrar un mapa a mano con el servidor levantado dejaba el registro
     * apuntando a un fichero que no está, y eso no rompe el editor: rompe
     * `config.js`, o sea **todas las páginas a la vez**, con un recuadro de
     * error de Vite encima. Curarlo pedía reiniciar, y nadie relaciona una cosa
     * con la otra.
     *
     * No hay bucle: `regenerarRegistro` escribe **sólo si cambia**, así que el
     * reinicio que provoca su primera escritura encuentra el registro ya bueno.
     */
    servidor.watcher.on('unlink', alCambiarLosMapas)
    servidor.watcher.on('add', alCambiarLosMapas)

    servidor.middlewares.use((peticion, respuesta, siguiente) => {
      // **Salida temprana antes de construir nada.** Esto corre en cada
      // petición del servidor de desarrollo —cientos por carga de página— y
      // `new URL` por cada una es trabajo por nada. La lección de esta vuelta
      // es justo esa: lo que está en el camino de todas las peticiones se paga
      // en todas, y se paga en forma de suites que se quedan sin tiempo.
      const url = peticion.url ?? '/'
      if (!url.startsWith('/editor') && !url.startsWith('/__editor/')) return siguiente()

      const { pathname, searchParams } = new URL(url, 'http://editor')

      // Las fotos que haya en `public/fondos/`, para el desplegable del editor.
      if (pathname === '/__editor/fondos' && peticion.method === 'GET') {
        respuesta.setHeader('content-type', 'application/json')
        return respuesta.end(JSON.stringify({ fotos: fondosDisponibles() }))
      }

      if (pathname === '/editor' || pathname === '/editor/') {
        peticion.url = '/editor/index.html'
        return siguiente()
      }
      if (!pathname.startsWith('/__editor/')) return siguiente()

      respuesta.setHeader('content-type', 'application/json')
      const fallar = (codigo, error) => {
        respuesta.statusCode = codigo
        respuesta.end(JSON.stringify({ error }))
      }
      // Una clave es un nombre de fichero: lo que no sea una letra, un número,
      // un guion o un guion bajo no entra. Sin esto, una clave con `../`
      // escribiría fuera de `src/maps/`.
      const claveValida = (v) => /^[a-zA-Z0-9_-]+$/.test(v ?? '')

      // --- las versiones de un mapa, o una de ellas entera
      if (pathname === '/__editor/historial' && peticion.method === 'GET') {
        const clave = searchParams.get('clave')
        if (!claveValida(clave)) return fallar(400, 'clave no válida')
        const versiones = leerHistorial(clave)
        const i = searchParams.get('i')
        if (i !== null) {
          const version = versiones[Number(i)]
          if (!version) return fallar(404, 'esa versión no está')
          return respuesta.end(JSON.stringify(version))
        }
        // Sin los mapas dentro: la lista se pide para pintarla, y la versión
        // entera sólo cuando se restaura una. Con cincuenta versiones de un
        // mapa grande, mandarlas todas para escribir cinco fechas es tonto.
        return respuesta.end(JSON.stringify({
          aviso: versiones.length >= HISTORIAL_AVISO ? HISTORIAL_AVISO : 0,
          versiones: versiones.map((v, indice) => ({
            indice,
            instante: v.instante,
            comentario: v.comentario,
            piezas: v.mapa?.boxes?.length ?? 0,
          })),
        }))
      }

      if (pathname !== '/__editor/guardar' || peticion.method !== 'POST') return siguiente()

      let cuerpo = ''
      peticion.on('data', (trozo) => { cuerpo += trozo })
      peticion.on('end', async () => {
        try {
          const pedido = JSON.parse(cuerpo)
          if (!claveValida(pedido.clave)) return fallar(400, 'clave no válida')

          /**
           * **El módulo lo escribe el servidor, no llega escrito** (vuelta 75).
           * Hasta aquí la página mandaba el texto del fichero y esto lo volcaba
           * tal cual: un punto de escritura arbitraria —aunque sea de
           * desarrollo— y, peor, una segunda idea de cómo se serializa un mapa.
           * Ahora llega **el dato**, se sanea con la misma función que usa el
           * editor y el fichero sale de `mapaComoModulo`.
           */
          const { mapaComoModulo, sanearMapa } = await modulo('./src/maps/formato.js')
          const { mapa, problemas } = sanearMapa({ ...pedido.mapa, clave: pedido.clave })
          writeFileSync(resolve(CARPETA_MAPAS, `${mapa.clave}.js`), mapaComoModulo(mapa))
          const registro = regenerarRegistro()
          const historial = anotarEnHistorial(mapa.clave, mapa, pedido.comentario)
          respuesta.end(JSON.stringify({
            fichero: `src/maps/${mapa.clave}.js`,
            ...registro,
            problemas,
            ...historial,
          }))
        } catch (error) {
          fallar(500, error.message)
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
