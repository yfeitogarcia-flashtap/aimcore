# Panoramas de fondo

Aquí van las **fotos panorámicas** que un mapa puede usar como fondo 360°.

Lo que hay que saber antes de dejar una:

- **Es el primer asset externo de Vektor.** Todo lo demás —el audio, la
  geometría, las texturas, las siluetas— se genera o se traza en tiempo de
  compilación, y eso es parte de lo que el proyecto dice de sí mismo: corre en
  cualquier PC sin descargar nada. Una foto aquí cruza esa línea **para el mapa
  que la use**, no para el juego entero: los cuatro fondos dibujados en un
  canvas siguen ahí y siguen siendo lo que trae un mapa por defecto.
- **Proyección equirectangular** (2:1). Una foto normal se estira: lo que hace
  falta es un panorama 360×180, o al menos uno 360° recortado en vertical.
  2048×1024 es de sobra; más resolución es peso que no se nota dentro de una
  esfera a ciento sesenta unidades.
- **Que sea oscura.** La rampa de grises de `COVER` dice la altura de una pieza
  (vuelta 40), y un fondo claro detrás de una silueta se come esa lectura, que
  es información de juego y no decoración.
- **El nombre del archivo es lo que se ve en el editor.** Déjalo aquí, abre
  `/editor/`, y sale en el desplegable de «Fondo panorámico» junto a los cuatro
  dibujados. Al guardar, el mapa escribe `fondo: { tipo: 'imagen', url: '...' }`
  — o sea que **en el fichero del mapa se ve que depende de un archivo**.

Formatos: `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`.
