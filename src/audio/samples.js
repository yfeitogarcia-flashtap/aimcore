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
 * **Dos trampas del contexto de audio**, las dos con cicatriz propia:
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
import { initAudio, masterGain, playDryFire, playShot } from './sfx.js'
import { COMMON_SAMPLES, WEAPON_SAMPLES } from './weaponSamples.js'

/** Sobre qué contexto están decodificados los buffers de `decoded`. */
let decodedFor = null
/** `<arma>|<variante>` -> AudioBuffer ya decodificado y listo. */
const decoded = new Map()
/** Lo mismo, mientras está de camino: sirve para no pedir dos veces. */
const pending = new Set()

const slotOf = (weaponKey, variante) => `${weaponKey}|${variante}`
const slotDeDisparo = (weaponKey, suppressed) => slotOf(weaponKey, suppressed ? 'suppressed' : 'normal')
/** Los comunes van en su propio espacio de nombres: no son de ningún arma. */
const slotComun = (nombre) => `comun|${nombre}`

/**
 * **El interruptor de vuelta atrás** (vuelta 63). Con `AUDIO.samplesEnabled` a
 * `false` no se pide ni se decodifica nada y **todo suena como antes de que
 * hubiera un solo fichero**: la síntesis no se ha ido a ninguna parte, sigue
 * siendo el suelo. Es un booleano en `config.js` y no un ajuste del panel a
 * propósito — esto es para decidir si las muestras se quedan, no algo que el
 * jugador tenga que elegir cada vez.
 *
 * Y para volver atrás **sólo una**: se saca su fichero de `Reference/Audio/` y
 * se vuelve a pasar `npm run audio:weapons`. El manifiesto es la lista de lo
 * que hay, así que quitar el fichero es quitar la muestra.
 */
const conMuestras = () => AUDIO.samplesEnabled !== false

/**
 * Pide y decodifica todas las muestras declaradas. Idempotente y sin espera:
 * devuelve enseguida y las voces siguen sonando sintetizadas hasta que cada una
 * esté lista.
 *
 * Con el manifiesto vacío —hoy— no hace absolutamente nada: ni una petición.
 */
export function loadWeaponSamples() {
  if (!conMuestras()) return
  const ctx = initAudio()
  if (!ctx) return
  if (decodedFor !== ctx) {
    // Contexto nuevo: lo decodificado con el anterior no vale para nada.
    decoded.clear()
    pending.clear()
    decodedFor = ctx
  }
  const pedir = (slot, url) => {
    if (decoded.has(slot) || pending.has(slot)) return
    pending.add(slot)
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${url}`)
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
        // juego**: es un sonido que suena como sonaba antes. Se avisa una vez y
        // no se vuelve a pedir.
        console.warn(`[audio] muestra no disponible (${slot}):`, error.message)
      })
      .finally(() => pending.delete(slot))
  }
  for (const [weaponKey, variants] of Object.entries(WEAPON_SAMPLES)) {
    for (const [variant, { url }] of Object.entries(variants)) pedir(slotOf(weaponKey, variant), url)
  }
  for (const [nombre, { url }] of Object.entries(COMMON_SAMPLES)) pedir(slotComun(nombre), url)
}

/** ¿Hay muestra lista para este disparo, ahora mismo? */
export function hasWeaponSample(weaponKey, suppressed = false) {
  return decodedFor === initAudio() && decoded.has(slotDeDisparo(weaponKey, suppressed))
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
  const buffer = conMuestras() ? decoded.get(slotDeDisparo(weaponKey, suppressed)) : null
  const ctx = initAudio()
  const master = masterGain()
  if (!buffer || !ctx || !master || decodedFor !== ctx) {
    // La clave viaja: la síntesis también tiene voz por arma (vuelta 62).
    playShot(suppressed, emitter, volume, weaponKey)
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

/**
 * **Reproduce una muestra ya decodificada, o no hace nada.** Es el trozo que
 * comparten las voces que **no tienen síntesis debajo**: sin fichero, silencio,
 * que es exactamente lo que había antes de que existiera el fichero.
 */
function _tocar(slot, volume, emitter = null) {
  if (!conMuestras()) return false
  const buffer = decoded.get(slot)
  const ctx = initAudio()
  const master = masterGain()
  if (!buffer || !ctx || !master || decodedFor !== ctx) return false
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

/**
 * **La recarga de un arma** (vuelta 63). A diferencia del disparo, aquí **no
 * hay síntesis debajo**: hasta ahora recargar no sonaba de ninguna manera, así
 * que sin fichero se queda como estaba. No es un respaldo peor, es el estado
 * anterior — y por eso no se inventa un ruido de emergencia: un chasquido
 * cualquiera diría «tu arma ha hecho algo» sin decir qué.
 *
 * Suena **una vez, al empezar**, y no se corta si la recarga se cancela: lo que
 * se grabó es un gesto completo, y cortarlo a la mitad suena a fallo del juego.
 *
 * @param {string} weaponKey clave de `WEAPONS`
 * @param {{input: AudioNode|null}} [emitter] emisor posicionado, si lo hay
 * @param {number} [volume] volumen base
 */
export function playWeaponReload(weaponKey, emitter = null, volume = AUDIO.reloadVolume) {
  return _tocar(slotOf(weaponKey, 'reload'), volume, emitter)
}

/**
 * **El gatillo en seco.** Aquí sí hay síntesis debajo —el clic de siempre— así
 * que esto es la misma regla que el disparo: con muestra, la muestra; sin ella,
 * lo que ya sonaba. Quien llama no elige.
 */
export function playDrySound(volume = AUDIO.dryVolume) {
  if (_tocar(slotComun('dry'), volume)) return true
  playDryFire()
  return false
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
