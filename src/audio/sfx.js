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

/** Disparo: transitorio de ruido filtrado + un golpe grave que cae rápido. */
export function playShot() {
  if (!ctx || !master || !noiseBuffer) return
  const t = ctx.currentTime
  const level = AUDIO.shotVolume

  // Transitorio: ruido pasado por un pasa-banda agudo -> "clic".
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 2100
  band.Q.value = 1.1
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.0001, t)
  noiseGain.gain.exponentialRampToValueAtTime(0.32 * level, t + 0.002)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045)
  noise.connect(band).connect(noiseGain).connect(master)
  noise.start(t)
  noise.stop(t + 0.06)
  noise.onended = () => {
    noise.disconnect()
    band.disconnect()
    noiseGain.disconnect()
  }

  // Cuerpo: onda triangular con caída de tono, aporta peso sin retumbar.
  const body = ctx.createOscillator()
  body.type = 'triangle'
  body.frequency.setValueAtTime(210, t)
  body.frequency.exponentialRampToValueAtTime(80, t + 0.05)
  const bodyGain = ctx.createGain()
  bodyGain.gain.setValueAtTime(0.0001, t)
  bodyGain.gain.exponentialRampToValueAtTime(0.2 * level, t + 0.003)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055)
  body.connect(bodyGain).connect(master)
  body.start(t)
  body.stop(t + 0.07)
  body.onended = () => {
    body.disconnect()
    bodyGain.disconnect()
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
