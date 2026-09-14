/**
 * Sonido sintetizado con la Web Audio API. Cero assets externos.
 *
 * Dos sonidos:
 *  - `playShot()`  click seco y corto en cada disparo, acierte o falle.
 *  - `playHit()`   tono más alto y brillante al acertar.
 *  - `playBulletWhizz()` el chasquido de una bala que pasa cerca, que es otra
 *    cosa que un disparo: dice que esa iba a por ti.
 * No hay sonido de fallo a propósito: no queremos penalizar de más.
 *
 * **Este módulo decide cómo suena algo, no desde dónde.** Las voces que pueden
 * ir posicionadas aceptan un emisor (ver `spatial.js`) y se conectan a él si lo
 * hay; si no, van al máster con el volumen que les pasen. No importa `spatial.js`
 * a propósito: la dependencia va en el otro sentido y así no hay ciclo.
 *
 * El AudioContext se crea perezosamente dentro de un gesto del usuario
 * (el click que activa el Pointer Lock), que es lo que exigen los navegadores.
 */

import { AUDIO, LANDING, OBJECTIVE } from '../config.js'

/** @type {AudioContext | null} */
let ctx = null
/** @type {GainNode | null} */
let master = null
/** @type {AudioBuffer | null} */
let noiseBuffer = null

/** Ruido blanco pregenerado una sola vez; da el "cuerpo" del click. */
function buildNoiseBuffer(audioCtx) {
  const length = Math.floor(audioCtx.sampleRate * 0.06)
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/**
 * Crea (o reanuda) el contexto de audio. Debe llamarse desde un gesto del
 * usuario. Es idempotente y seguro de llamar en cada click.
 */
export function initAudio() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx({ latencyHint: 'interactive' })
    master = ctx.createGain()
    master.gain.value = AUDIO.masterVolume
    master.connect(ctx.destination)
    noiseBuffer = buildNoiseBuffer(ctx)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

/** Libera el contexto (al desmontar el juego). */
export function disposeAudio() {
  if (ctx) {
    ctx.close()
    ctx = null
    master = null
    noiseBuffer = null
  }
}

/**
 * El nodo al que va todo lo que no está posicionado. Lo necesita `samples.js`
 * para colgar de ahí las muestras grabadas; la dependencia va en ese sentido
 * —de `samples` a `sfx`, como la de `spatial`— y por eso se expone aquí en vez
 * de que este módulo sepa que existen las muestras.
 *
 * @returns {GainNode | null}
 */
export function masterGain() {
  return master
}

/** Ajuste de volumen global, 0..1. Lo usará el menú de opciones más adelante. */
export function setMasterVolume(value) {
  if (master) master.gain.value = Math.max(0, Math.min(1, value))
}

/**
 * Perfiles del disparo. El silenciado no cambia daño, retroceso ni cadencia:
 * sólo suena. Se consigue bajando el pasa-banda del transitorio —menos
 * chasquido agudo—, acortando su caída y hundiendo el cuerpo en grave.
 */
const SHOT_PROFILES = {
  normal: {
    bandHz: 2100,
    bandQ: 1.1,
    noiseGain: 0.32,
    noiseDecay: 0.045,
    bodyFrom: 210,
    bodyTo: 80,
    bodyGain: 0.2,
    bodyDecay: 0.055,
  },
  suppressed: {
    bandHz: 700,
    bandQ: 2.2,
    noiseGain: 0.16,
    noiseDecay: 0.028,
    bodyFrom: 130,
    bodyTo: 52,
    bodyGain: 0.13,
    bodyDecay: 0.07,
  },
}

/**
 * Disparo: transitorio de ruido filtrado + un golpe grave que cae rápido.
 * @param {boolean} [suppressed] usa el perfil apagado del silenciador
 */
/**
 * @param {boolean} [suppressed] perfil silenciado
 * @param {{input: AudioNode|null}} [emitter] emisor posicionado, si lo hay. Es
 *   por donde suena el disparo de un muñeco: mismo sonido, otro sitio.
 * @param {number} [volume] volumen base; por defecto, el del jugador
 */
export function playShot(suppressed = false, emitter = null, volume = AUDIO.shotVolume) {
  if (!ctx || !master || !noiseBuffer) return
  const t = ctx.currentTime
  const level = volume
  const profile = suppressed ? SHOT_PROFILES.suppressed : SHOT_PROFILES.normal
  // Con emisor la distancia la aplica el panner; sin él, al máster y ya.
  const out = emitter?.input ?? master

  // Transitorio: ruido pasado por un pasa-banda -> "clic".
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = profile.bandHz
  band.Q.value = profile.bandQ
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.0001, t)
  noiseGain.gain.exponentialRampToValueAtTime(profile.noiseGain * level, t + 0.002)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + profile.noiseDecay)
  noise.connect(band).connect(noiseGain).connect(out)
  noise.start(t)
  noise.stop(t + profile.noiseDecay + 0.02)
  noise.onended = () => {
    noise.disconnect()
    band.disconnect()
    noiseGain.disconnect()
  }

  // Cuerpo: onda triangular con caída de tono, aporta peso sin retumbar.
  const body = ctx.createOscillator()
  body.type = 'triangle'
  body.frequency.setValueAtTime(profile.bodyFrom, t)
  body.frequency.exponentialRampToValueAtTime(profile.bodyTo, t + 0.05)
  const bodyGain = ctx.createGain()
  bodyGain.gain.setValueAtTime(0.0001, t)
  bodyGain.gain.exponentialRampToValueAtTime(profile.bodyGain * level, t + 0.003)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + profile.bodyDecay)
  body.connect(bodyGain).connect(out)
  body.start(t)
  body.stop(t + profile.bodyDecay + 0.02)
  body.onended = () => {
    body.disconnect()
    bodyGain.disconnect()
  }
}

/**
 * **La bala que pasa cerca**: un chasquido fino que baja de tono, con el silbido
 * detrás. Es una voz aparte del disparo a propósito —no el disparo con otro
 * volumen—, porque dice otra cosa: no «alguien ha disparado» sino «esa venía a
 * por ti».
 *
 * Cómo se distingue del disparo, que es lo único que importa aquí: el disparo
 * lleva **cuerpo grave** (un triángulo cayendo de tono) y esto no lleva nada por
 * debajo de mil hercios. Es ruido pasado por un pasa-banda estrecho que **cae**
 * de agudo a medio en menos de cien milisegundos, que es lo que hace que se
 * oiga como algo que pasa de largo y no como algo que ocurre donde estás.
 *
 * Va con emisor como el disparo: la gracia del silbido es **por qué lado** pasó,
 * y quien lo coloca es `enemyFire.js`, en el punto de máxima aproximación.
 *
 * @param {{input: AudioNode|null}} [emitter] emisor posicionado, si lo hay
 * @param {number} [volume] volumen base
 */
export function playBulletWhizz(emitter = null, volume = AUDIO.whizzVolume) {
  if (!ctx || !master || !noiseBuffer) return
  const t = ctx.currentTime
  const out = emitter?.input ?? master

  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer
  // El pasa-banda barre hacia abajo: el efecto Doppler de una bala que se aleja,
  // que es lo que el oído lee como «ha pasado» y no como «ha sonado ahí».
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.setValueAtTime(4200, t)
  band.frequency.exponentialRampToValueAtTime(1250, t + 0.09)
  band.Q.value = 5.5
  // Y por debajo no queda nada: el cuerpo grave es del disparo, y dejarlo aquí
  // sería el mismo sonido dos veces.
  const high = ctx.createBiquadFilter()
  high.type = 'highpass'
  high.frequency.value = 900
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.9 * volume, t + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
  noise.connect(band).connect(high).connect(gain).connect(out)
  noise.start(t)
  noise.stop(t + 0.12)
  noise.onended = () => {
    noise.disconnect()
    band.disconnect()
    high.disconnect()
    gain.disconnect()
  }
}

/**
 * Clic seco del cargador vacío. Deliberadamente flaco y sin cuerpo: es el
 * ruido del mecanismo, no un disparo, y tiene que distinguirse al instante.
 */
export function playDryFire() {
  if (!ctx || !master || !noiseBuffer) return
  const t = ctx.currentTime

  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer
  const high = ctx.createBiquadFilter()
  high.type = 'highpass'
  high.frequency.value = 3200
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.22 * AUDIO.shotVolume, t + 0.001)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02)
  noise.connect(high).connect(gain).connect(master)
  noise.start(t)
  noise.stop(t + 0.04)
  noise.onended = () => {
    noise.disconnect()
    high.disconnect()
    gain.disconnect()
  }
}

/**
 * Confirmación de una acción del panel. Un bip corto y limpio, sin ruido ni
 * cuerpo grave: tiene que oírse como interfaz y no confundirse ni con el
 * disparo ni con el acierto.
 */
export function playUiConfirm() {
  if (!ctx || !master) return
  const t = ctx.currentTime

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1460, t)
  osc.frequency.setValueAtTime(1950, t + 0.035)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.2 * AUDIO.hitVolume, t + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075)
  osc.connect(gain).connect(master)
  osc.start(t)
  osc.stop(t + 0.09)
  osc.onended = () => {
    osc.disconnect()
    gain.disconnect()
  }
}

/** Acierto: dos parciales senoidales con subida rápida de tono. Brillante. */
export function playHit() {
  if (!ctx || !master) return
  const t = ctx.currentTime
  const level = AUDIO.hitVolume

  // (frecuencia base, frecuencia final, ganancia, duración)
  const partials = [
    [880, 1180, 0.3, 0.17],
    [1760, 2360, 0.14, 0.13],
    [2640, 3400, 0.06, 0.09],
  ]

  for (let i = 0; i < partials.length; i++) {
    const [from, to, gain, dur] = partials[i]
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(from, t)
    osc.frequency.exponentialRampToValueAtTime(to, t + 0.05)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain * level, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(master)
    osc.start(t)
    osc.stop(t + dur + 0.02)
    osc.onended = () => {
      osc.disconnect()
      g.disconnect()
    }
  }
}

/**
 * Aterrizaje: un golpe sordo al tocar el suelo tras una caída.
 *
 * El perfil vive en `LANDING.sound` y está elegido para **no parecerse al
 * disparo silenciado**, con el que se confundía en partida: onda triangular en
 * lugar de seno, mucho más grave, ataque largo en vez de instantáneo y una cola
 * cuatro veces mayor. Nada de esto toca la física: escala con la fuerza del
 * impacto y ya está.
 *
 * @param {number} strength 0..1, lo fuerte que fue la caída
 */
export function playLanding(strength = 1) {
  initAudio()
  if (!ctx || !master || !noiseBuffer) return
  const level = Math.max(0, Math.min(1, strength))
  if (level <= 0) return

  const profile = LANDING.sound
  const t = ctx.currentTime
  const gain = AUDIO.landingVolume * (0.45 + 0.55 * level)

  // Suela: ruido filtrado muy abajo. Es roce, no percutor.
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.setValueAtTime(profile.scuffHz, t)
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.0001, t)
  noiseGain.gain.exponentialRampToValueAtTime(gain * profile.scuffGain, t + 0.008)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + profile.scuffDecay)
  noise.connect(lowpass).connect(noiseGain).connect(master)
  noise.start(t)
  noise.stop(t + profile.scuffDecay + 0.02)
  noise.onended = () => {
    noise.disconnect()
    lowpass.disconnect()
    noiseGain.disconnect()
  }

  // Cuerpo: triangular grave con ataque largo y cola larga. El ataque de 12 ms
  // es lo que separa esto de un disparo: un percutor ataca en 2 ms y suena a
  // clic por mucho que se le baje el tono.
  const body = ctx.createOscillator()
  body.type = profile.bodyType
  body.frequency.setValueAtTime(profile.bodyFrom, t)
  body.frequency.exponentialRampToValueAtTime(profile.bodyTo, t + profile.bodyDecay * 0.7)
  const bodyGain = ctx.createGain()
  bodyGain.gain.setValueAtTime(0.0001, t)
  bodyGain.gain.exponentialRampToValueAtTime(gain * profile.bodyGain, t + profile.bodyAttack)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + profile.bodyDecay)
  body.connect(bodyGain).connect(master)
  body.start(t)
  body.stop(t + profile.bodyDecay + 0.03)
  body.onended = () => {
    body.disconnect()
    bodyGain.disconnect()
  }
}

/**
 * Pitido del explosivo.
 *
 * Onda cuadrada: la cuarta identidad sonora del juego y la más estridente a
 * propósito, para que no se confunda ni con el disparo (ruido filtrado + seno)
 * ni con el aterrizaje (triangular grave de ataque largo) ni con la
 * confirmación del panel.
 *
 * @param {number} urgency 0..1, cuánto se ha consumido la cuenta atrás
 * @param {number} volume  0..1, la caída por distancia **sin** audio espacial
 * @param {{input: AudioNode|null}} [emitter] emisor posicionado, si lo hay
 */
export function playObjectiveBeep(urgency, volume, emitter = null) {
  initAudio()
  if (!ctx || !master) return

  // Con emisor, la distancia la aplica el panner y el volumen que llega aquí
  // sobra: aplicarlo además sería atenuar dos veces.
  const destination = emitter ? emitter.input : null
  const target = destination ?? master
  const level = destination ? 1 : Math.max(0, Math.min(1, volume))
  if (level <= 0) return

  const beep = OBJECTIVE.beep
  const u = Math.max(0, Math.min(1, urgency))
  const t = ctx.currentTime
  const hz = beep.lowHz + (beep.highHz - beep.lowHz) * u

  const osc = ctx.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(hz, t)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(AUDIO.objectiveVolume * level, t + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + beep.durationS)
  osc.connect(gain).connect(target)
  osc.start(t)
  osc.stop(t + beep.durationS + 0.02)
  osc.onended = () => {
    osc.disconnect()
    gain.disconnect()
  }
}

/** Desactivado: dos tonos que bajan, tranquilos. Lo contrario del pitido. */
export function playObjectiveDefused() {
  initAudio()
  if (!ctx || !master) return
  const t = ctx.currentTime
  for (const [i, hz] of [880, 587].entries()) {
    const at = t + i * 0.11
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(hz, at)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(AUDIO.objectiveVolume * 0.7, at + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22)
    osc.connect(gain).connect(master)
    osc.start(at)
    osc.stop(at + 0.26)
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
    }
  }
}

/** Detonación: ruido grave largo con un golpe que se desploma por debajo. */
export function playObjectiveExplosion() {
  initAudio()
  if (!ctx || !master || !noiseBuffer) return
  const t = ctx.currentTime
  const level = AUDIO.objectiveVolume

  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer
  noise.loop = true
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.setValueAtTime(900, t)
  lowpass.frequency.exponentialRampToValueAtTime(90, t + 0.75)
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.0001, t)
  noiseGain.gain.exponentialRampToValueAtTime(level, t + 0.015)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
  noise.connect(lowpass).connect(noiseGain).connect(master)
  noise.start(t)
  noise.stop(t + 0.95)
  noise.onended = () => {
    noise.disconnect()
    lowpass.disconnect()
    noiseGain.disconnect()
  }

  const body = ctx.createOscillator()
  body.type = 'sine'
  body.frequency.setValueAtTime(110, t)
  body.frequency.exponentialRampToValueAtTime(26, t + 0.5)
  const bodyGain = ctx.createGain()
  bodyGain.gain.setValueAtTime(0.0001, t)
  bodyGain.gain.exponentialRampToValueAtTime(level * 1.1, t + 0.02)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
  body.connect(bodyGain).connect(master)
  body.start(t)
  body.stop(t + 0.75)
  body.onended = () => {
    body.disconnect()
    bodyGain.disconnect()
  }
}

/**
 * **Daño recibido.** Golpe corto y sucio: un ruido pasado por un pasa-banda
 * medio-grave con un cuerpo que se desploma, más un roce agudo muy breve.
 *
 * Tiene que separarse de tres cosas que ya suenan y son graves: el aterrizaje
 * (triangular con ataque largo), la detonación (larga) y el disparo silenciado
 * (chasquido). Lo consigue el pasa-banda con Q alta —suena a metal, no a
 * suela— y el ataque instantáneo con caída de 180 ms, que es demasiado largo
 * para un clic y demasiado corto para un golpe de caída.
 *
 * @param {number} severity 0..1, cuánto se ha comido de la vida
 */
export function playDamage(severity = 0.5) {
  initAudio()
  if (!ctx || !master || !noiseBuffer) return
  const t = ctx.currentTime
  const level = AUDIO.damageVolume * (0.55 + 0.45 * Math.max(0, Math.min(1, severity)))

  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.setValueAtTime(520, t)
  band.frequency.exponentialRampToValueAtTime(180, t + 0.14)
  band.Q.value = 3.2
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.0001, t)
  noiseGain.gain.exponentialRampToValueAtTime(level, t + 0.003)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
  noise.connect(band).connect(noiseGain).connect(master)
  noise.start(t)
  noise.stop(t + 0.2)
  noise.onended = () => {
    noise.disconnect()
    band.disconnect()
    noiseGain.disconnect()
  }

  const body = ctx.createOscillator()
  body.type = 'sawtooth'
  body.frequency.setValueAtTime(240, t)
  body.frequency.exponentialRampToValueAtTime(62, t + 0.16)
  const bodyGain = ctx.createGain()
  bodyGain.gain.setValueAtTime(0.0001, t)
  bodyGain.gain.exponentialRampToValueAtTime(level * 0.7, t + 0.004)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17)
  body.connect(bodyGain).connect(master)
  body.start(t)
  body.stop(t + 0.19)
  body.onended = () => {
    body.disconnect()
    bodyGain.disconnect()
  }
}

/**
 * **Curación.** Lo contrario del daño en todo: dos tonos senoidales que
 * **suben**, sin ruido y con ataque suave. Que suba es lo que lo hace legible
 * sin mirar el HUD — el daño baja, la vida sube.
 */
export function playHeal() {
  initAudio()
  if (!ctx || !master) return
  const t = ctx.currentTime
  for (const [i, hz] of [523, 784].entries()) {
    const at = t + i * 0.09
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(hz, at)
    osc.frequency.exponentialRampToValueAtTime(hz * 1.5, at + 0.16)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(AUDIO.healVolume * 0.6, at + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3)
    osc.connect(gain).connect(master)
    osc.start(at)
    osc.stop(at + 0.34)
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
    }
  }
}

/**
 * **Casco roto.** Un crujido: ruido muy agudo, ataque instantáneo y cola de
 * 90 ms. Seco y brillante a propósito — es la única pista de que la cabeza se
 * ha quedado descubierta, y tiene que oírse por encima de un tiroteo.
 */
export function playHelmetCrack() {
  initAudio()
  if (!ctx || !master || !noiseBuffer) return
  const t = ctx.currentTime

  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer
  const high = ctx.createBiquadFilter()
  high.type = 'highpass'
  high.frequency.value = 2600
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(AUDIO.damageVolume, t + 0.001)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
  noise.connect(high).connect(gain).connect(master)
  noise.start(t)
  noise.stop(t + 0.11)
  noise.onended = () => {
    noise.disconnect()
    high.disconnect()
    gain.disconnect()
  }

  // Un parcial metálico encima, para que suene a placa y no a estática.
  const ring = ctx.createOscillator()
  ring.type = 'square'
  ring.frequency.setValueAtTime(2100, t)
  ring.frequency.exponentialRampToValueAtTime(1400, t + 0.08)
  const ringGain = ctx.createGain()
  ringGain.gain.setValueAtTime(0.0001, t)
  ringGain.gain.exponentialRampToValueAtTime(AUDIO.damageVolume * 0.35, t + 0.002)
  ringGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.085)
  ring.connect(ringGain).connect(master)
  ring.start(t)
  ring.stop(t + 0.1)
  ring.onended = () => {
    ring.disconnect()
    ringGain.disconnect()
  }
}

/**
 * **Carga del escudo.** Suena mientras dura la animación de aplicar una carga,
 * no después: es un zumbido que **sube** durante los dos segundos y se corta de
 * golpe al terminar, con un trémolo rápido encima que es lo que lo hace
 * eléctrico y no un simple tono.
 *
 * Devuelve un mando para cortarlo, porque morir a mitad de carga tiene que
 * callarlo: un zumbido que sigue sonando sobre el cadáver es de las cosas que
 * delatan que el sonido y el estado van por caminos distintos.
 *
 * @param {number} durationS lo que dura la aplicación
 * @returns {{ stop: (fadeS?: number) => void }}
 */
export function playShieldCharge(durationS) {
  initAudio()
  if (!ctx || !master) return { stop() {} }
  const t = ctx.currentTime
  const end = t + durationS

  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(110, t)
  osc.frequency.exponentialRampToValueAtTime(430, end)

  // Trémolo: un LFO sobre la ganancia. Sin él es un zumbido de nevera.
  const lfo = ctx.createOscillator()
  lfo.type = 'square'
  lfo.frequency.setValueAtTime(14, t)
  lfo.frequency.linearRampToValueAtTime(34, end)
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 0.35

  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.setValueAtTime(420, t)
  band.frequency.exponentialRampToValueAtTime(1500, end)
  band.Q.value = 1.4

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(AUDIO.shieldVolume, t + 0.08)
  lfo.connect(lfoDepth).connect(gain.gain)

  osc.connect(band).connect(gain).connect(master)
  osc.start(t)
  lfo.start(t)

  let stopped = false
  const stop = (fadeS = 0.04) => {
    if (stopped) return
    stopped = true
    const at = ctx.currentTime
    gain.gain.cancelScheduledValues(at)
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + fadeS)
    osc.stop(at + fadeS + 0.02)
    lfo.stop(at + fadeS + 0.02)
  }
  osc.onended = () => {
    osc.disconnect()
    lfo.disconnect()
    lfoDepth.disconnect()
    band.disconnect()
    gain.disconnect()
  }
  // Si nadie lo corta, se apaga solo al acabar la animación.
  osc.stop(end + 0.05)
  lfo.stop(end + 0.05)
  gain.gain.setValueAtTime(AUDIO.shieldVolume, end - 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.04)
  return { stop }
}
