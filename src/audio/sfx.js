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

import { AUDIO } from '../config.js'

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
