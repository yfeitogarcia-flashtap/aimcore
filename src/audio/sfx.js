/**
 * Sonido sintetizado con la Web Audio API. Cero assets externos.
 *
 * Dos sonidos:
 *  - `playShot()`  click seco y corto en cada disparo, acierte o falle.
 *  - `playHit()`   tono más alto y brillante al acertar.
 * No hay sonido de fallo a propósito: no queremos penalizar de más.
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
export function playShot(suppressed = false) {
  if (!ctx || !master || !noiseBuffer) return
  const t = ctx.currentTime
  const level = AUDIO.shotVolume
  const profile = suppressed ? SHOT_PROFILES.suppressed : SHOT_PROFILES.normal

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
  noise.connect(band).connect(noiseGain).connect(master)
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
  body.connect(bodyGain).connect(master)
  body.start(t)
  body.stop(t + profile.bodyDecay + 0.02)
  body.onended = () => {
    body.disconnect()
    bodyGain.disconnect()
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
 * @param {number} volume  0..1, cerca del explosivo suena fuerte y lejos flojo
 */
export function playObjectiveBeep(urgency, volume) {
  initAudio()
  if (!ctx || !master) return
  const level = Math.max(0, Math.min(1, volume))
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
  osc.connect(gain).connect(master)
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
