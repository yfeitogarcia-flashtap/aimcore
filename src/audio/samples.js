/**
 * **Disparos grabados, con la síntesis siempre detrás.**
 *
 * El audio de este prototipo es sintetizado y no hay un solo fichero de sonido
 * en el repositorio. Esto abre una puerta, y sólo una: el **disparo** de cada
 * arma puede venir de una muestra de verdad, porque un disparo es lo único del
 * juego que no se puede sintetizar de forma convincente con cuatro osciladores.
 * Todo lo demás —el impacto, el aterrizaje, el pitido, el escudo— se queda como
 * está.
 *
 * **La regla que sostiene el módulo: la muestra es el extra, la síntesis es el
 * suelo.** Si no hay fichero, si todavía no ha llegado, si el navegador no supo
 * decodificarlo o si el contexto de audio se ha cerrado y vuelto a abrir, suena
 * el disparo sintetizado de siempre. Nunca hay silencio, y **nunca hay espera**:
 * un disparo no aguarda a que termine una descarga.
 *
 * **Qué hay grabado lo dice el manifiesto** (`weaponSamples.js`, que genera
 * `npm run audio:weapons`), no una petición al servidor. Preguntar por un
 * fichero que no existe cuesta un 404 por arma y por variante en cada arranque,
 * y con la carpeta vacía —que es el estado de hoy— serían seis.
 *
 * **La variante silenciada es opcional, y su ausencia no cae a la normal.**
 * Soltar el disparo sin supresor de un arma que lo lleva puesto es información
 * falsa —y en este juego el sonido es información—, así que cae al perfil
 * silenciado sintetizado, que al menos suena a silenciador.
 *
 * **Dos trampas del contexto de audio**, las dos ya conocidas de `music.js`:
 *
 *  - El contexto no existe hasta el primer gesto del usuario, así que la carga
 *    tampoco puede empezar antes: `loadWeaponSamples()` se llama desde donde se
 *    llama a `initAudio()`.
 *  - **`disposeAudio()` cierra el contexto y el siguiente `initAudio()` crea
 *    otro.** Un `AudioBuffer` decodificado con el viejo no se puede reproducir
 *    en el nuevo, así que se guarda **sobre qué contexto** se decodificó y con
 *    otro se vuelve a empezar. Pasa de verdad: React en modo estricto monta,
 *    desmonta y vuelve a montar.
 */

import { AUDIO } from '../config.js'
import { initAudio, masterGain, playShot } from './sfx.js'
import { WEAPON_SAMPLES } from './weaponSamples.js'

/** Sobre qué contexto están decodificados los buffers de `decoded`. */
let decodedFor = null
/** `<arma>|<variante>` -> AudioBuffer ya decodificado y listo. */
const decoded = new Map()
/** Lo mismo, mientras está de camino: sirve para no pedir dos veces. */
const pending = new Set()

const slotOf = (weaponKey, suppressed) => `${weaponKey}|${suppressed ? 'suppressed' : 'normal'}`

/**
 * Pide y decodifica todas las muestras declaradas. Idempotente y sin espera:
 * devuelve enseguida y las voces siguen sonando sintetizadas hasta que cada una
 * esté lista.
 *
 * Con el manifiesto vacío —hoy— no hace absolutamente nada: ni una petición.
 */
export function loadWeaponSamples() {
  const ctx = initAudio()
  if (!ctx) return
  if (decodedFor !== ctx) {
    // Contexto nuevo: lo decodificado con el anterior no vale para nada.
    decoded.clear()
    pending.clear()
    decodedFor = ctx
  }
  for (const [weaponKey, variants] of Object.entries(WEAPON_SAMPLES)) {
    for (const variant of Object.keys(variants)) {
      const slot = `${weaponKey}|${variant}`
      if (decoded.has(slot) || pending.has(slot)) continue
      pending.add(slot)
      fetch(variants[variant].url)
        .then((response) => {
          if (!response.ok) throw new Error(`${response.status} ${variants[variant].url}`)
          return response.arrayBuffer()
        })
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          // Mientras se descargaba pueden haber cerrado el contexto: el buffer
          // decodificado con el viejo no sirve, y meterlo sería un disparo mudo.
          if (decodedFor === ctx) decoded.set(slot, buffer)
        })
        .catch((error) => {
          // Un fichero que no está o que no se decodifica **no es un fallo del
          // juego**: es un arma que suena sintetizada. Se avisa una vez y no se
          // vuelve a pedir.
          console.warn(`[audio] muestra no disponible (${slot}):`, error.message)
        })
        .finally(() => pending.delete(slot))
    }
  }
}

/** ¿Hay muestra lista para este disparo, ahora mismo? */
export function hasWeaponSample(weaponKey, suppressed = false) {
  return decodedFor === initAudio() && decoded.has(slotOf(weaponKey, suppressed))
}

/**
 * **El disparo de un arma.** Con muestra lista suena la muestra; si no —no hay
 * fichero, no ha llegado todavía o no se pudo decodificar— suena la síntesis de
 * siempre. Es el único camino de audio de un disparo, del jugador y de los
 * muñecos: quien llama no decide cuál de los dos suena, ni tiene que saberlo.
 *
 * @param {string} weaponKey clave de `WEAPONS`
 * @param {boolean} [suppressed] con silenciador
 * @param {{input: AudioNode|null}} [emitter] emisor posicionado, si lo hay
 * @param {number} [volume] volumen base; por defecto, el del jugador
 */
export function playWeaponShot(weaponKey, suppressed = false, emitter = null, volume = AUDIO.shotVolume) {
  const buffer = decoded.get(slotOf(weaponKey, suppressed))
  const ctx = initAudio()
  const master = masterGain()
  if (!buffer || !ctx || !master || decodedFor !== ctx) {
    playShot(suppressed, emitter, volume)
    return false
  }
  // Con emisor la distancia la aplica el panner; sin él, al máster y ya. Es la
  // misma regla que en `sfx.js`, y por el mismo motivo: atenuar además a mano
  // sería atenuar dos veces.
  const out = emitter?.input ?? master
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const gain = ctx.createGain()
  gain.gain.value = volume * AUDIO.sampleVolume
  source.connect(gain).connect(out)
  source.start(ctx.currentTime)
  source.onended = () => {
    source.disconnect()
    gain.disconnect()
  }
  return true
}

/** Qué hay cargado y qué no. Para las pruebas y para la consola. */
export function weaponSampleReport() {
  const report = {}
  for (const [weaponKey, variants] of Object.entries(WEAPON_SAMPLES)) {
    report[weaponKey] = {}
    for (const variant of Object.keys(variants)) {
      report[weaponKey][variant] = decoded.has(`${weaponKey}|${variant}`) ? 'lista' : 'pendiente'
    }
  }
  return { declaradas: Object.keys(WEAPON_SAMPLES).length, muestras: report }
}
