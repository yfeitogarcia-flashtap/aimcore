import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
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
