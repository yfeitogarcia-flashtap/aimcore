# Muestras de disparo

Aquí van los sonidos de disparo reales, uno por arma. **No se sirven desde esta
carpeta**: `npm run audio:weapons` los copia a `public/audio/weapons/` y genera
`src/audio/weaponSamples.js`, que es lo que lee el juego. Igual que los tres
scripts de trazado, es un paso manual y lo que se versiona es la salida.

## Convención

```
<clave-del-arma>.mp3             disparo normal
<clave-del-arma>-suppressed.mp3  con silenciador (opcional)
```

`<clave-del-arma>` es la clave de `WEAPONS` en `src/config.js`, no la etiqueta:

| Arma | Fichero normal | Fichero silenciado |
|---|---|---|
| Scalar-2 | `scalar-2.mp3` | `scalar-2-suppressed.mp3` |
| Axis-7 | `axis-7.mp3` | — (no admite silenciador) |
| Vertex-9 | `vertex-9.mp3` | `vertex-9-suppressed.mp3` |

## Lo que pasa si un fichero no está

Suena el disparo **sintetizado** de siempre, que es el que hay hoy. No es un
caso de error: es el estado normal mientras la carpeta esté vacía, y el juego se
juega entero sin un solo fichero aquí. Lo mismo si el fichero está pero el
navegador no consigue decodificarlo, o si todavía no ha terminado de
descargarse: un disparo nunca espera a que llegue su muestra.

Que falte la variante silenciada **no** hace que suene la normal: soltar el
disparo sin supresor de un arma que lo lleva puesto sería información falsa.
Cae al perfil silenciado sintetizado.

## Qué conviene que sea el fichero

- **Corto**: el disparo, sin cola de reverberación. Lo que se oye de una ráfaga
  de 800 RPM son 75 ms por disparo; una muestra de un segundo se pisa a sí misma.
- **Mono**: la posición la pone el motor (`spatial.js`), no el fichero. Un
  estéreo ya panoramizado pelearía con el panner.
- **Sin silencio al principio**: el primer byte es el instante del disparo. Un
  arranque tardío se oye como retraso de gatillo.
- **mp3**, que es lo que dice la convención, y a un bitrate razonable (128-192
  kbps): con 100 ms de audio la diferencia con un WAV es de kilobytes.
