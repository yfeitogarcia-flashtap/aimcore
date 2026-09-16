# **La imagen del huésped de Vektor** (vuelta 58).
#
# Dos etapas para que lo que se sube no lleve dentro las herramientas de
# construir: la primera compila el juego con Vite, la segunda se queda con el
# resultado y con lo justo para servirlo.
#
# Ojo con lo de siempre: las PNG de `Reference/` no entran aquí. No están en la
# imagen porque no están en `dist/` — son material de trazado, no assets— y el
# `.dockerignore` lo asegura por si alguien cambia el build.

# --- 1. Construir el juego -------------------------------------------------
FROM node:22-slim AS construir
WORKDIR /app

# Primero las dependencias y solas: mientras `package*.json` no cambie, Docker
# se salta esta capa entera y el despliegue tarda segundos en vez de minutos.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- 2. Servirlo -----------------------------------------------------------
FROM node:22-slim AS servir
WORKDIR /app
ENV NODE_ENV=production

# Sólo lo de producción: aquí no hay Vite, ni potrace, ni wrangler.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# El servidor importa `src/` y `net/` tal cual —la partida es el mismo fichero
# que corre en local— y sirve lo que Vite dejó en `dist/`.
COPY --from=construir /app/dist ./dist
COPY net ./net
COPY src ./src

# El puerto lo dice la plataforma; en local vale el de `NET.port`.
ENV PORT=8080
EXPOSE 8080

# Sin gestor de procesos ni `npm` por medio: el proceso de Node **es** el
# proceso del contenedor, así que si se cae, se cae el contenedor y la
# plataforma lo levanta. Un `npm start` por delante se traga la señal y deja
# zombis.
CMD ["node", "net/servidor.mjs"]
