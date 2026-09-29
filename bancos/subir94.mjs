/**
 * subir94 — «Subir al juego» lleva también las imágenes de estampado.
 *
 * Mide una **diferencia** y no un estado, que es la lección de `subir93`: este
 * árbol tiene código a medias mientras se trabaja, así que exigir `src/maps`
 * limpio es exigir algo imposible. Lo que se mide es que un cebo **aparece** en
 * la lista de imágenes y **desaparece** al borrarlo, con la línea base delante
 * como denominador (vuelta 46).
 *
 * Y la prueba de que se sube de verdad es `git add --dry-run` con **la lista que
 * usa el editor**, importada y no copiada: una segunda lista aquí mediría esta
 * prueba y no el producto (vuelta 63).
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, rmSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { estadoDeMapasEn, CARPETAS_QUE_SUBEN } from '../vite.config.js'

const REPO = resolve(import.meta.dirname, '..')
const CEBO_IMG = resolve(REPO, 'public/estampados/cebo94.webp')
const CEBO_TXT = resolve(REPO, 'public/estampados/cebo94.txt')

let fallos = 0
const afirmar = (bien, que, detalle = '') => {
  console.log(`  ${bien ? 'OK  ' : 'FALLO'} ${que}${detalle ? ` — ${detalle}` : ''}`)
  if (!bien) fallos++
}

const seAnadiria = () => {
  const carpetas = CARPETAS_QUE_SUBEN.filter((c) => existsSync(resolve(REPO, c)))
  return execFileSync('git', ['add', '--dry-run', '--', ...carpetas],
    { cwd: REPO, encoding: 'utf-8' })
}

try {
  console.log('\n== subir94: los estampados suben con los mapas ==\n')

  const base = estadoDeMapasEn(REPO)
  console.log(`  línea base: ${base.mapas.length} mapa(s), `
    + `${base.imagenes.length} imagen(es), ${base.otros} otro(s) · rama ${base.rama}`)
  afirmar(base.rama !== null, 'hay repositorio de git', base.error ?? '')
  afirmar(Array.isArray(base.imagenes), 'el estado publica una lista de imágenes')

  // 1. Una imagen de estampado se cuenta como imagen, no como «otros».
  writeFileSync(CEBO_IMG, Buffer.from('RIFF....WEBPVP8 cebo94', 'utf-8'))
  const conImagen = estadoDeMapasEn(REPO)
  afirmar(conImagen.imagenes.includes('cebo94.webp'),
    'la imagen nueva aparece en la lista de imágenes',
    JSON.stringify(conImagen.imagenes))
  afirmar(conImagen.imagenes.length === base.imagenes.length + 1,
    'y sube la cuenta de imágenes en exactamente una',
    `${base.imagenes.length} → ${conImagen.imagenes.length}`)
  afirmar(conImagen.otros === base.otros,
    'sin contarla además en el registro y el historial',
    `otros ${base.otros} → ${conImagen.otros}`)
  afirmar(conImagen.mapas.length === base.mapas.length,
    'y sin tocar la cuenta de mapas, que es el número que se mira',
    `${base.mapas.length} → ${conImagen.mapas.length}`)

  // 2. Y es lo que `git add` de la subida recogería. Ésta es la prueba de que
  //    sube de verdad: hasta la vuelta 94 el pathspec era `src/maps` solo.
  const seco = seAnadiria()
  afirmar(/public\/estampados\/cebo94\.webp/.test(seco),
    'el `git add` de la subida la recogería',
    seco.split('\n').filter((l) => l.includes('cebo94')).join(' | ') || '(no la menciona)')

  // 3. Lo que no es una imagen no se cuenta como una. La regla es la misma
  //    lista de extensiones con la que el panel la ofrece.
  writeFileSync(CEBO_TXT, 'esto no es un estampado\n')
  const conTexto = estadoDeMapasEn(REPO)
  afirmar(!conTexto.imagenes.includes('cebo94.txt'),
    'un .txt en esa carpeta no se cuenta como estampado',
    JSON.stringify(conTexto.imagenes))
  afirmar(conTexto.otros === base.otros + 1,
    'se cuenta con el registro y el historial',
    `otros ${base.otros} → ${conTexto.otros}`)

  // 4. Y borrarlos devuelve la línea base, dígito a dígito.
  rmSync(CEBO_IMG); rmSync(CEBO_TXT)
  const vuelta = estadoDeMapasEn(REPO)
  afirmar(vuelta.imagenes.length === base.imagenes.length
    && vuelta.mapas.length === base.mapas.length
    && vuelta.otros === base.otros,
    'quitando los cebos se vuelve a la línea base',
    `${vuelta.mapas.length}/${vuelta.imagenes.length}/${vuelta.otros}`)
} finally {
  // Un banco no puede dejar basura en el árbol de nadie.
  for (const f of [CEBO_IMG, CEBO_TXT]) if (existsSync(f)) rmSync(f)
}

console.log(`\n${fallos === 0 ? 'VERDE' : `ROJO (${fallos})`}\n`)
process.exit(fallos === 0 ? 0 : 1)
