# Sonidos comunes

Lo que **no es de ningún arma en concreto**. Por eso no está en `weapons/`: el
cargador vacío suena igual lleves lo que lleves.

Como los de armas, no se sirven desde aquí: `npm run audio:weapons` los copia a
`public/audio/comunes/` y los declara en `src/audio/weaponSamples.js`
(`COMMON_SAMPLES`).

## Convención

| Sonido | Fichero | Si no está |
|---|---|---|
| Cargador vacío (gatillo en seco) | `gatillo-seco.wav` | Suena el clic **sintetizado** de siempre |

Un nombre que no esté en esa tabla se avisa y se ignora: casi siempre es una
falta de ortografía, y colarlo dejaría una muestra que no suena nunca.

Valen `.mp3`, `.ogg` y `.wav`, con esa preferencia; si un sonido está en dos
formatos gana el comprimido y el script lo dice.

Si algún día el gatillo en seco es distinto por arma, su sitio es
`weapons/<arma>-seco.<ext>` y este carril se queda como respaldo.
