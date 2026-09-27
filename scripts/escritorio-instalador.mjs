/**
 * **Las imágenes del instalador de Windows, generadas desde la marca**
 * (vuelta 97).
 *
 * Es la misma regla que el icono de la ventana y que las siluetas de las armas:
 * **material derivado, no asset**. Sale de `Reference/Logo/`, no entra en git
 * (`escritorio/src-tauri/instalador/` está en `.gitignore`) y lo regenera la
 * compilación, así que no hay dos versiones de la marca que puedan separarse.
 *
 * Tres cosas que no se adivinan y por las que este script existe en vez de dos
 * ficheros guardados:
 *
 * - **NSIS quiere BMP.** No admite PNG en la cabecera ni en el lateral, y tampoco
 *   canal alfa: hay que componer sobre un fondo opaco, que aquí es el negro de
 *   Vektor (`#0A0A0A`) — así el instalador se parece al juego en vez de a un
 *   instalador.
 * - **Y los tamaños son fijos**, los del asistente moderno de NSIS: 150×57 la
 *   cabecera y 164×314 el lateral. Una imagen de otro tamaño no se escala, se
 *   recorta.
 * - **Y la cabecera lleva la marca sola, no el logotipo.** El lockup de Vektor
 *   tiene «VEKTOR» *dentro* del símbolo, así que metido en una tira de 57 px de
 *   alto la palabra sale a cuatro píxeles: está en la imagen y no se lee, que es
 *   la distinción de la vuelta 89. La marca sola a 46 px sí se reconoce —es el
 *   tamaño al que ya funciona en la pestaña del navegador— y va apoyada a la
 *   izquierda, que es donde el asistente deja hueco. El lateral, que mide 314 px
 *   de alto y sólo sale en la bienvenida y en el final, sí lleva el logotipo
 *   entero.
 *
 * **Y si hay imágenes hechas a mano, mandan ellas** (vuelta 98). Se dejan en
 * `Reference/Instalador/` como `cabecera.png` y `lateral.png` (o `.bmp`/`.jpg`)
 * y este script las usa en vez de componer: las **pasa a BMP de 24 bits** y las
 * **aplana sobre el negro** si traen transparencia, que son las dos cosas que
 * NSIS no perdona. Si no miden exactamente 150×57 y 164×314, se ajustan
 * **cubriendo y recortando por el centro** —nunca estirando: un logo deformado es
 * otro logo (vuelta 95)— y se avisa, porque lo que se ve ya no es lo que se hizo.
 *
 * Uso: `npm run escritorio:instalador`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Jimp from 'jimp'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOGOTIPO = resolve(raiz, 'Reference/Logo/vektor-logo-white-orange.png')
/** La marca sola, en naranja: la misma que el icono de la ventana y el favicon. */
const MARCA = resolve(raiz, 'Reference/Logo/vektor-mark-orange.png')
const DESTINO = resolve(raiz, 'escritorio/src-tauri/instalador')
/** Donde se dejan las imágenes hechas a mano, si las hay. */
const A_MANO = resolve(raiz, 'Reference/Instalador')

/** La primera imagen a mano con ese nombre, en cualquiera de los formatos que se leen. */
function aMano(nombre) {
  for (const ext of ['png', 'bmp', 'jpg', 'jpeg']) {
    const ruta = resolve(A_MANO, `${nombre}.${ext}`)
    if (existsSync(ruta)) return ruta
  }
  return null
}

/** El negro de Vektor, el mismo de `COLORS.background`. */
const FONDO = 0x0a0a0aff

/**
 * Compone el logotipo sobre un lienzo del tamaño que pida NSIS.
 *
 * `margen` es la fracción del lienzo que queda libre alrededor; `arriba` dónde
 * cae el logo en vertical (0 pegado arriba, 0.5 centrado) y `izquierda` en
 * horizontal. El lateral lo quiere en el tercio de arriba porque el asistente
 * escribe su texto debajo.
 */
async function guardar(lienzo, fichero, ancho, alto) {
  const bmp = await lienzo.getBufferAsync(Jimp.MIME_BMP)
  mkdirSync(DESTINO, { recursive: true })
  const ruta = resolve(DESTINO, fichero)
  writeFileSync(ruta, bmp)
  // **Y se dice qué ha salido**, porque un paso que sólo dice «hecho» no
  // distingue un BMP de un fichero vacío (la regla del workflow de la vuelta 94).
  const bits = bmp.readUInt16LE(28)
  console.log(`${fichero}: ${ancho}×${alto}, ${bits} bits, ${(bmp.length / 1024).toFixed(1)} KB`)
  if (bits !== 24) {
    throw new Error(`${fichero} ha salido a ${bits} bits y NSIS quiere 24 sin alfa.`)
  }
  return ruta
}

/** Una imagen hecha a mano, llevada al tamaño exacto y aplanada sobre el negro. */
async function deMano({ ancho, alto, origen, fichero }) {
  const imagen = await Jimp.read(origen)
  const { width, height } = imagen.bitmap
  if (width !== ancho || height !== alto) {
    console.warn(`AVISO: ${origen} mide ${width}×${height} y NSIS quiere ${ancho}×${alto}; se ajusta cubriendo y se recorta por el centro.`)
    imagen.cover(ancho, alto)
  }
  const lienzo = await new Jimp(ancho, alto, FONDO)
  lienzo.composite(imagen, 0, 0)
  console.log(`${fichero}: desde ${origen}`)
  return guardar(lienzo, fichero, ancho, alto)
}

async function componer({ ancho, alto, margen, arriba, izquierda = 0.5, origen, fichero, nombreAMano }) {
  const propia = aMano(nombreAMano)
  if (propia) return deMano({ ancho, alto, origen: propia, fichero })
  const lienzo = await new Jimp(ancho, alto, FONDO)
  const logo = await Jimp.read(origen)

  const cajaAncho = Math.round(ancho * (1 - margen * 2))
  const cajaAlto = Math.round(alto * (1 - margen * 2))
  // `scaleToFit` y no `contain`: los dos conservan la proporción —que es la
  // única regla que un logotipo no admite negociar (vuelta 95: un logo estirado
  // es otro logo)— pero `contain` además **rellena hasta la caja**, así que la
  // imagen acaba midiendo la caja entera y apoyarla a un lado deja de significar
  // nada. Se vio mirándolo: la marca de la cabecera salía centrada con la
  // izquierda pedida.
  logo.scaleToFit(cajaAncho, cajaAlto)

  const x = Math.round((ancho - logo.bitmap.width) * izquierda)
  const y = Math.round((alto - logo.bitmap.height) * arriba)
  lienzo.composite(logo, x, y)
  return guardar(lienzo, fichero, ancho, alto)
}

await componer({
  ancho: 150,
  alto: 57,
  margen: 0.08,
  arriba: 0.5,
  izquierda: 0.08,
  origen: MARCA,
  fichero: 'cabecera.bmp',
  nombreAMano: 'cabecera',
})
await componer({
  ancho: 164,
  alto: 314,
  margen: 0.1,
  arriba: 0.22,
  origen: LOGOTIPO,
  fichero: 'lateral.bmp',
  nombreAMano: 'lateral',
})
