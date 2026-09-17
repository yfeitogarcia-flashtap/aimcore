import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
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

export default defineConfig({
  plugins: [react(), duelo],
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
