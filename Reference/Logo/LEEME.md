# Logotipos

## Vektor

`vektor-marca.png` y `vektor-completo.png` (o los nombres que use
`npm run trace:logo`) son las referencias del logotipo del juego. Se vectorizan
con potrace y salen a `src/ui/logoPaths.js` y `public/favicon.svg`: **las PNG no
entran nunca en `dist/`**, son material de trazado.

## Vektor Alchemist (el editor)

**Aquí va el personaje sin texto**, para la marca de agua translúcida de la
esquina del editor:

    Reference/Logo/alchemist.png

Lo que hace falta que cumpla, y es lo mismo que el logotipo de Vektor porque lo
trata el mismo pipeline:

- **PNG con fondo transparente**, alrededor de 2000 px de lado. Se reduce a 600
  antes de trazar (`TRACE_SIZE`): a tamaño completo potrace persigue el temblor
  del rotulador y salen 18 KB de trazado que a 120 px no se distinguen de 6.
- **Sin texto.** La marca de agua es el personaje; «VEKTOR ALCHEMIST» escrito
  ahí dentro no se leería a esa opacidad y ensuciaría la silueta.
- **Que se lea como silueta.** En el editor sale al 16% de opacidad sobre la
  rejilla, así que lo que la identifica es su contorno, no su detalle interior.
  Misma regla que la visera del casco: un contorno plano no es un objeto.

Una vez dejado el fichero:

    npm run trace:logo

emite el trazado en `src/ui/logoPaths.js` y el editor lo enseña solo. **Si el
fichero no está, el editor no falla**: la esquina se queda vacía, que es lo que
tiene que hacer una firma que todavía no existe.
