# Muestras de arma

> **Apagadas desde la vuelta 63.** Los ficheros de aquí **no se usan**:
> `AUDIO.samplesEnabled` está en `false` en `src/config.js`, así que el juego
> suena entero sintetizado y este script no copia nada a `public/`. Se probaron
> las diez muestras en juego y se descartaron —sonar a sintetizado es parte de lo
> que es Vektor, y no tener nada que descargar ni decodificar es parte de que
> corra en cualquier PC—. Se quedan aquí por si algún día se reconsidera: para
> eso, ese booleano a `true` y `npm run audio:weapons`.

Aquí van los sonidos reales de cada arma: **disparo**, **disparo con
silenciador** y **recarga**. **No se sirven desde esta carpeta**:
`npm run audio:weapons` los copia a `public/audio/weapons/` y genera
`src/audio/weaponSamples.js`, que es lo que lee el juego. Igual que los tres
scripts de trazado, es un paso manual y lo que se versiona es la salida.

## Convención

```
<clave-del-arma>.<ext>             disparo
<clave-del-arma>-suppressed.<ext>  disparo con silenciador
<clave-del-arma>-reload.<ext>      recarga
```

`<clave-del-arma>` es la clave de `WEAPONS` en `src/config.js`, no la etiqueta.
**Las tres armas admiten silenciador** desde la vuelta 41:

| Arma | Disparo | Silenciado | Recarga |
|---|---|---|---|
| Pulse (pistola) | `pulse.wav` | `pulse-suppressed.wav` | `pulse-reload.wav` |
| Rift | `rift.wav` | `rift-suppressed.wav` | `rift-reload.wav` |
| Volt | `volt.wav` | `volt-suppressed.wav` | `volt-reload.wav` |

Se llamaban `scalar-2`, `axis-7` y `vertex-9` hasta la vuelta 41: esos nombres
**ya no valen aquí**. Lo que se traduce es un ajuste guardado del jugador
(`LEGACY_WEAPON_KEYS`), no un fichero de esta carpeta — una clave que no esté en
`WEAPONS` se avisa y se ignora.

## Tres formatos, con preferencia

`.mp3`, `.ogg` y `.wav`, en ese orden. El WAV vale —el navegador lo decodifica
igual— pero pesa del orden de diez veces más y lo que se sirve va en el build.
Si un mismo sonido está en dos formatos gana el comprimido y el script avisa,
para que nadie acabe sirviendo el pesado sin enterarse.

## Lo que pasa si un fichero no está

- **Disparo**: suena el **sintetizado** de siempre. No es un caso de error: es el
  estado normal mientras la carpeta esté vacía, y el juego se juega entero sin un
  solo fichero aquí. Lo mismo si el fichero está pero el navegador no lo
  decodifica, o si todavía no ha terminado de descargarse: un disparo **nunca**
  espera a que llegue su muestra.
- **Recarga**: **silencio**, que es lo que hacía hasta la vuelta 63. Aquí no hay
  síntesis debajo a propósito: un chasquido de emergencia diría «tu arma ha hecho
  algo» sin decir qué.

Que falte la variante silenciada **no** hace que suene la normal: soltar el
disparo sin supresor de un arma que lo lleva puesto sería información falsa.
Cae al perfil silenciado sintetizado.

## Cómo volver atrás

- **Un sonido**: se saca su fichero de aquí y se vuelve a pasar
  `npm run audio:weapons`. El manifiesto es la lista de lo que hay.
- **Todos**: `AUDIO.samplesEnabled: false` en `src/config.js`. Ni se piden ni se
  decodifican, y todo vuelve a sonar sintetizado.

La síntesis **no se toca nunca** al añadir muestras: vive en `src/audio/sfx.js`
y sigue siendo el suelo.

## Qué conviene que sea el fichero

- **Corto**: el disparo, sin cola de reverberación. Lo que se oye de una ráfaga
  de 800 RPM son 75 ms por disparo; una muestra de un segundo se pisa a sí misma.
  La recarga es la excepción: dura lo que dura el gesto (`reloadMs`: 1200-2300 ms).
- **Mono**: la posición la pone el motor (`spatial.js`), no el fichero. Un
  estéreo ya panoramizado pelearía con el panner.
- **Sin silencio al principio**: el primer byte es el instante del disparo. Un
  arranque tardío se oye como retraso de gatillo.
