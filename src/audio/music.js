/**
 * Música de menús: colchón grave y notas sueltas, generadas en tiempo real.
 *
 * **Cero assets**, como el resto del audio del proyecto (ver `sfx.js`). No hay
 * bucle grabado: la pieza se genera mientras suena, así que no tiene costura ni
 * se reconoce el punto de empalme por mucho rato que se pase en el menú.
 *
 * Va por **su propio nodo de volumen**, no por el máster de los efectos: el
 * jugador la regula aparte en el panel, y bajarla no puede tocar el pitido del
 * explosivo. Comparte el `AudioContext` con `sfx.js` —lo pide con `initAudio()`—
 * porque dos contextos en la misma pestaña es la forma clásica de acabar con
 * nodos que no se conectan entre sí.
 *
 * Y como cualquier audio en un navegador, **no puede sonar antes de que el
 * jugador toque algo**: si el contexto está suspendido, esto se queda esperando
 * al primer gesto y arranca solo.
 */

import { MUSIC } from '../config.js'
import { initAudio } from './sfx.js'

/** @type {AudioContext | null} */
let ctx = null
/** @type {GainNode | null} */
let out = null
let pad = null
let timer = 0
/** Instante del audio hasta el que ya hay notas programadas. */
let nextNoteAt = 0
let playing = false
let volume = 0.4
/** ¿Se quiere música ahora mismo? No es lo mismo que estar sonando. */
let wanted = false
/**
 * Sobre qué contexto se está esperando, o null. **No es un booleano a
 * propósito**: `disposeAudio()` cierra el contexto y el siguiente `initAudio()`
 * crea otro, así que una espera armada sobre el viejo no se entera nunca de
 * nada. Pasa de verdad —React en modo estricto monta, desmonta y vuelve a
 * montar— y el síntoma era música que no arrancaba hasta el segundo click.
 */
let waitingOn = null

/** Nodos del colchón: dos osciladores desafinados bajo un filtro que pasea. */
function buildPad() {
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = MUSIC.padCutoffHz
  filter.Q.value = 0.7

  // El LFO pasea el corte muy despacio: es lo que hace que un acorde plano
  // parezca que respira en vez de quedarse clavado.
  const lfo = ctx.createOscillator()
  lfo.frequency.value = MUSIC.padLfoHz
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = MUSIC.padLfoDepth
  lfo.connect(lfoGain).connect(filter.frequency)
  lfo.start()

  const gain = ctx.createGain()
  gain.gain.value = MUSIC.padGain
  filter.connect(gain).connect(out)

  // Raíz, quinta y octava, desafinadas unos céntimos entre sí: el batido lento
  // que sale de ahí es todo el «ambiente» que necesita esto.
  const voices = [
    { hz: MUSIC.rootHz, detune: -6 },
    { hz: MUSIC.rootHz * 1.5, detune: 5 },
    { hz: MUSIC.rootHz * 2, detune: -3 },
  ].map(({ hz, detune }) => {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = hz
    osc.detune.value = detune
    osc.connect(filter)
    osc.start()
    return osc
  })

  return { voices, lfo, filter, gain }
}

/** Una nota: seno con caída larga, sin ataque duro. */
function playNote(at) {
  const semitones = MUSIC.scale[(Math.random() * MUSIC.scale.length) | 0]
  // Sesgo a las graves: dos sorteos y se queda el más bajo. Sin esto la melodía
  // se va arriba y deja de ser fondo.
  const other = MUSIC.scale[(Math.random() * MUSIC.scale.length) | 0]
  const chosen = Math.min(semitones, other)
  const hz = MUSIC.rootHz * 4 * Math.pow(2, chosen / 12)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = hz
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(MUSIC.noteGain, at + 0.06)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + MUSIC.noteDecay)
  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + MUSIC.noteDecay + 0.1)
  osc.onended = () => {
    osc.disconnect()
    gain.disconnect()
  }
}

/**
 * Programa lo que entre en la ventana de anticipación. Se llama desde un
 * temporizador normal, pero **las horas son del reloj del audio**: si el
 * temporizador llega tarde, la nota ya tenía su sitio.
 */
function schedule() {
  if (!playing || !ctx) return
  const until = ctx.currentTime + MUSIC.lookaheadSeconds
  while (nextNoteAt < until) {
    if (Math.random() < MUSIC.noteChance) playNote(nextNoteAt)
    nextNoteAt += MUSIC.stepSeconds
  }
}

/** Volumen de la música, 0..1. Se puede llamar esté sonando o no. */
export function setMusicVolume(value) {
  volume = Math.max(0, Math.min(1, Number(value) || 0))
  if (out && playing) {
    out.gain.cancelScheduledValues(ctx.currentTime)
    out.gain.setTargetAtTime(volume, ctx.currentTime, 0.08)
  }
}

/**
 * Queda a la espera de que el contexto pueda sonar.
 *
 * Dos esperas, porque hacen falta las dos: el **gesto** —sin él el navegador ni
 * siquiera intenta arrancar— y el **cambio de estado**, porque `resume()` es
 * asíncrono y preguntar por `ctx.state` justo después devuelve todavía
 * `suspended`. Mirando sólo lo primero, la música se quedaba callada hasta el
 * segundo click de la sesión.
 */
function waitForContext() {
  if (waitingOn === ctx) return
  const target = ctx
  waitingOn = target

  const onState = () => {
    if (target.state !== 'running') return
    stopWaiting()
    if (wanted && !playing) startMusic()
  }
  const onGesture = () => initAudio()
  function stopWaiting() {
    target.removeEventListener('statechange', onState)
    window.removeEventListener('pointerdown', onGesture)
    window.removeEventListener('keydown', onGesture)
    if (waitingOn === target) waitingOn = null
  }

  target.addEventListener('statechange', onState)
  window.addEventListener('pointerdown', onGesture)
  window.addEventListener('keydown', onGesture)
}

/** Arranca la música. Idempotente: llamarla dos veces no la duplica. */
export function startMusic() {
  wanted = true
  if (playing) return
  ctx = initAudio()
  if (!ctx) return

  if (ctx.state !== 'running') {
    waitForContext()
    return
  }

  playing = true
  out = ctx.createGain()
  out.gain.setValueAtTime(0.0001, ctx.currentTime)
  out.gain.linearRampToValueAtTime(volume, ctx.currentTime + MUSIC.fadeSeconds)
  out.connect(ctx.destination)

  pad = buildPad()
  nextNoteAt = ctx.currentTime + 0.4
  schedule()
  timer = window.setInterval(schedule, MUSIC.scheduleEverySeconds * 1000)
}

/** Para la música con una salida suave. Idempotente. */
export function stopMusic() {
  wanted = false
  if (!playing || !ctx) return
  playing = false
  window.clearInterval(timer)
  timer = 0

  const end = ctx.currentTime + MUSIC.fadeSeconds
  out.gain.cancelScheduledValues(ctx.currentTime)
  out.gain.setValueAtTime(out.gain.value, ctx.currentTime)
  out.gain.linearRampToValueAtTime(0.0001, end)

  // Se apaga primero y se desmonta después: parar los osciladores en seco
  // mientras suenan es un chasquido.
  const dying = { ...pad, out }
  pad = null
  out = null
  window.setTimeout(() => {
    for (const voice of dying.voices) voice.stop()
    dying.lfo.stop()
    dying.filter.disconnect()
    dying.gain.disconnect()
    dying.out.disconnect()
  }, MUSIC.fadeSeconds * 1000 + 120)
}

/** ¿Está sonando ahora mismo? Lo usan las pruebas. */
export function isMusicPlaying() {
  return playing
}

/**
 * Radiografía del módulo, para las pruebas y para depurar. `wanted` y `playing`
 * son cosas distintas: se quiere música desde que se entra en un menú, pero no
 * suena hasta que el navegador deja arrancar el audio.
 */
export function musicState() {
  return {
    playing,
    wanted,
    waiting: waitingOn !== null,
    ctx: ctx ? ctx.state : null,
    sameCtx: ctx !== null && waitingOn === ctx,
  }
}
