/**
 * GENERADO por scripts/import-weapon-audio.mjs — no editar a mano.
 *
 * Qué muestras hay servidas. Lo que no esté aquí suena como siempre: el
 * respaldo **no es un caso de error**, es el estado normal de este fichero
 * mientras esté vacío. Para las armas, la síntesis; para la recarga, que hoy no
 * tiene síntesis, silencio — como hasta ahora.
 *
 * `bytes` es informativo —lo que ocupa cada muestra en el build— y no lo usa el
 * juego: está para poder decir el coste sin ir a mirar la carpeta.
 */

export const WEAPON_SAMPLES = {
  'pulse': {
    reload: { url: '/audio/weapons/pulse-reload.wav', bytes: 197810 },
    suppressed: { url: '/audio/weapons/pulse-suppressed.wav', bytes: 101810 },
    normal: { url: '/audio/weapons/pulse.wav', bytes: 197810 },
  },
  'rift': {
    reload: { url: '/audio/weapons/rift-reload.wav', bytes: 197810 },
    suppressed: { url: '/audio/weapons/rift-suppressed.wav', bytes: 101810 },
    normal: { url: '/audio/weapons/rift.wav', bytes: 293810 },
  },
  'volt': {
    reload: { url: '/audio/weapons/volt-reload.wav', bytes: 197810 },
    suppressed: { url: '/audio/weapons/volt-suppressed.wav', bytes: 101810 },
    normal: { url: '/audio/weapons/volt.wav', bytes: 101810 },
  },
}

/** Sonidos que no son de un arma en concreto. Hoy: `dry`, el cargador vacío. */
export const COMMON_SAMPLES = {
  dry: { url: '/audio/comunes/gatillo-seco.wav', bytes: 101810 },
}
