/**
 * **El fondo panorámico de un mapa** (vuelta 77).
 *
 * Una esfera vista **por dentro**, con una textura equirectangular que se
 * **dibuja en un canvas al montar el escenario**. Es la misma disciplina que el
 * resto de Vektor —el audio se sintetiza, la geometría es procedural, las
 * siluetas se trazan de una referencia y no viajan como imagen—: al navegador
 * no le llega ni un byte de asset.
 *
 * Cuatro reglas, y ninguna es de estilo:
 *
 * - **No es geometría del mapa.** No entra en `occluders`, así que ningún rayo
 *   le pregunta nada: ni el disparo, ni la visibilidad de una aparición, ni el
 *   marcador. Un fondo que parase una bala sería una pared invisible a treinta
 *   unidades de la sala.
 * - **Y no cuesta presupuesto.** Una malla, un material, una textura generada
 *   **una vez**. El bucle caliente no la toca: no se anima, no se recalcula y
 *   no se le pasa el reloj del mundo. Lo que sí hace es seguir a la cámara en
 *   posición —no en rotación—, que es lo que impide llegar a su borde andando.
 * - **El tono se queda oscuro a propósito.** La rampa de grises de `COVER` dice
 *   la altura de una pieza (vuelta 40); un fondo claro detrás de una silueta se
 *   comería esa lectura, que es información de juego y no decoración.
 * - **Y el catálogo está en `config.js`**, como todo el tuning. Aquí sólo está
 *   cómo se pinta cada tipo.
 */

import * as THREE from 'three'

/** Lo ancho que se dibuja el panorama. 2048×1024 es lo que deja un horizonte sin escalones. */
const ANCHO = 2048
const ALTO = 1024

/**
 * **El radio sale de la sala, no es un número suelto.** Tiene que quedar por
 * fuera de las paredes en cualquier mapa —Los Pilares mide 56— y por dentro del
 * plano lejano de la cámara.
 */
const FACTOR_RADIO = 4

/**
 * Un degradado vertical del cenit al horizonte y del horizonte abajo otra vez.
 * Es el suelo común de los tres tipos: lo que cambia es lo que se pinta encima.
 */
function degradado(ctx, fondo) {
  const grad = ctx.createLinearGradient(0, 0, 0, ALTO)
  grad.addColorStop(0, fondo.cenit)
  grad.addColorStop(0.5, fondo.horizonte)
  // Por debajo del horizonte se ve el suelo de la sala, así que se apaga: un
  // degradado simétrico dibujaría un cielo debajo de los pies.
  grad.addColorStop(1, fondo.cenit)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, ANCHO, ALTO)
}

/**
 * **Las estrellas son ruido con sesgo, no un patrón.** Se reparten por toda la
 * mitad de arriba con el tamaño cayendo hacia el horizonte, que es como se ve
 * un cielo de verdad — y de paso evita la cuadrícula que delata a un generador.
 */
function estrellas(ctx, fondo) {
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < fondo.estrellas; i++) {
    const x = Math.random() * ANCHO
    // Sólo la mitad de arriba: por debajo del horizonte no hay cielo.
    const y = Math.random() ** 1.6 * (ALTO * 0.5)
    const brillo = 0.25 + Math.random() * 0.75
    ctx.globalAlpha = brillo
    ctx.fillRect(x, y, brillo > 0.85 ? 2 : 1, brillo > 0.85 ? 2 : 1)
  }
  ctx.globalAlpha = 1
}

/**
 * **Un horizonte recortado**: torres para una ciudad, crestas para un volcán.
 * La misma función con otros números, que es la misma idea que las seis formas
 * del editor — lo que distingue una ciudad de un volcán aquí es su perfil, no
 * un segundo dibujante.
 */
function horizonte(ctx, fondo) {
  const base = ALTO * 0.52

  // El halo primero: la luz está **detrás** de la silueta, no encima.
  // El resplandor sube bastante más que la silueta —es luz difusa, no un
  // objeto— pero flojo: teñir el cielo entero se comería la rampa de grises
  // con la que se lee la altura de una pieza (vuelta 40).
  const alto = ALTO * fondo.alturaMax
  const difuso = alto * 4
  const halo = ctx.createLinearGradient(0, base - difuso, 0, base)
  halo.addColorStop(0, 'rgba(0,0,0,0)')
  halo.addColorStop(1, fondo.halo)
  ctx.globalAlpha = 0.2
  ctx.fillStyle = halo
  ctx.fillRect(0, base - difuso, ANCHO, difuso)
  ctx.globalAlpha = 1

  ctx.fillStyle = fondo.silueta
  ctx.beginPath()
  ctx.moveTo(0, ALTO)
  ctx.lineTo(0, base)
  const paso = ANCHO / fondo.torres
  for (let i = 0; i < fondo.torres; i++) {
    const x = i * paso
    const altoTorre = ALTO * fondo.alturaMax * (0.18 + Math.random() ** 2 * 0.82)
    if (fondo.tipo === 'horizonte' && fondo.torres > 80) {
      // Ciudad: cajas de techo plano, que es lo que se lee como edificio.
      ctx.lineTo(x, base - altoTorre)
      ctx.lineTo(x + paso * 0.82, base - altoTorre)
      ctx.lineTo(x + paso * 0.82, base)
      ctx.lineTo(x + paso, base)
    } else {
      // Volcán: crestas, o sea picos sin techo.
      ctx.lineTo(x + paso / 2, base - altoTorre)
      ctx.lineTo(x + paso, base)
    }
  }
  ctx.lineTo(ANCHO, ALTO)
  ctx.closePath()
  ctx.fill()

  // Ventanas encendidas, sólo donde hay edificio. Son lo que dice «ciudad» de
  // un vistazo, y cuestan un bucle de una sola pasada.
  if (fondo.torres > 80) {
    ctx.fillStyle = fondo.halo
    for (let i = 0; i < 1400; i++) {
      ctx.globalAlpha = 0.15 + Math.random() * 0.45
      ctx.fillRect(Math.random() * ANCHO, base - Math.random() * ALTO * fondo.alturaMax * 0.9, 1, 2)
    }
    ctx.globalAlpha = 1
  }
}

/**
 * **Una nave industrial es lo contrario de un cielo**: lo que la lee como
 * interior son las verticales regulares. Sin ellas, un degradado gris es
 * niebla.
 */
function nave(ctx, fondo) {
  ctx.strokeStyle = fondo.costilla
  ctx.lineWidth = 6
  const paso = ANCHO / fondo.costillas
  for (let i = 0; i < fondo.costillas; i++) {
    const x = i * paso + paso / 2
    ctx.beginPath()
    ctx.moveTo(x, ALTO * 0.06)
    ctx.lineTo(x, ALTO * 0.62)
    ctx.stroke()
  }
  // Y una línea de techo, que es lo que cierra el volumen por arriba.
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.moveTo(0, ALTO * 0.08)
  ctx.lineTo(ANCHO, ALTO * 0.08)
  ctx.stroke()
}

const DIBUJANTES = { estrellas, horizonte, nave }

/**
 * Monta el fondo de un escenario en su escena. Devuelve un objeto con `dispose`
 * y `seguir(camara)`, o `null` si el mapa no declara ninguno — que es el caso
 * de todos los mapas de hoy y por tanto el que no cambia nada.
 */
export function crearFondo(scene, fondo, room) {
  if (!fondo || !DIBUJANTES[fondo.tipo]) return null

  const lienzo = document.createElement('canvas')
  lienzo.width = ANCHO
  lienzo.height = ALTO
  const ctx = lienzo.getContext('2d')
  degradado(ctx, fondo)
  DIBUJANTES[fondo.tipo](ctx, fondo)

  const textura = new THREE.CanvasTexture(lienzo)
  textura.colorSpace = THREE.SRGBColorSpace
  // Sin `wrapS` repetido no hace falta: la esfera da la vuelta entera una vez.
  const radio = Math.max(room?.width ?? 40, room?.depth ?? 40) * FACTOR_RADIO
  const malla = new THREE.Mesh(
    new THREE.SphereGeometry(radio, 48, 24),
    // `BackSide` porque se ve **por dentro**, y sin niebla ni profundidad: un
    // fondo no puede ocultar nada del mundo ni escribir en el z-buffer.
    new THREE.MeshBasicMaterial({ map: textura, side: THREE.BackSide, depthWrite: false }),
  )
  malla.renderOrder = -1
  // **No es un oclusor y no debe parecerlo**: si algún día alguien barre la
  // escena buscando mallas, esto lo dice.
  malla.userData.fondo = true
  scene.add(malla)

  return {
    malla,
    /**
     * **Sigue a la cámara en posición y no en rotación.** Sin esto se llega
     * andando a su borde en un mapa grande y se ve el interior de una esfera;
     * con esto, el horizonte se queda quieto y el fondo está siempre igual de
     * lejos. No gira con la cámara a propósito: girar sería un fondo pintado en
     * la pantalla, no un sitio alrededor del mapa.
     */
    seguir(camara) {
      malla.position.set(camara.position.x, 0, camara.position.z)
    },
    dispose() {
      scene.remove(malla)
      malla.geometry.dispose()
      malla.material.map?.dispose()
      malla.material.dispose()
    },
  }
}
