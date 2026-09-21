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

import { AUDIO, FOOTSTEPS, LANDING, OBJECTIVE } from '../config.js'

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
 * **Perfiles del disparo, y hay dos voces** (vuelta 62). El silenciado no cambia
 * daño, retroceso ni cadencia: sólo suena.
 *
 * - `clasica` es la de siempre —transitorio de ruido por un pasa-banda más un
 *   golpe grave que cae— y es el **respaldo**: lo que suena un arma que todavía
 *   no tiene voz propia. Desde la vuelta 63 no la lleva ninguna de las tres.
 * - `seca` es la de la Rift (vuelta 62) y desde la 63 también la de la **Pulse**
 *   y la **Volt**: tres capas que atacan en medio milisegundo, ninguna
 *   sostenida. El carácter agresivo y metálico es del juego, no de un arma.
 *
 * **Un arma elige su voz por su clave**, igual que elige su silueta: `rift` y
 * `rift.s`. Lo que no tenga entrada cae a `normal` / `suppressed`, que es lo que
 * hace que añadir una voz nueva sea añadir una clave y no tocar `playShot`.
 *
 * **Lo que cambia de un arma a otra dentro de la voz seca es su ficha**, no el
 * gusto: la Volt dispara a 800 RPM, o sea cada 75 ms, así que ninguna de sus
 * capas pasa de 50 ms; la Pulse es corta y sube el crack; la Rift es la que
 * conserva cuerpo grave.
 */
const SHOT_PROFILES = {
  normal: {
    voz: 'clasica',
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
    voz: 'clasica',
    bandHz: 700,
    bandQ: 2.2,
    noiseGain: 0.16,
    noiseDecay: 0.028,
    bodyFrom: 130,
    bodyTo: 52,
    bodyGain: 0.13,
    bodyDecay: 0.07,
  },

  /**
   * **La Rift.** Lo que tenía de malo el perfil clásico no era el volumen: era
   * que el transitorio y el cuerpo **atacaban en rampa** (2 y 3 ms) y el cuerpo
   * duraba 55 ms cayendo de tono, que es exactamente la receta de una gota de
   * agua. Aquí las tres capas entran en medio milisegundo y ninguna se sostiene.
   *
   * - **`crack`**: ruido por un pasa-**altos**, no un pasa-banda. Un pasa-banda
   *   deja una nota; lo que hace «crack» es la banda ancha de arriba.
   * - **`metal`**: dos dientes de sierra en relación **inarmónica** (1.48, que no
   *   es ni la octava ni la quinta) por un saturador y un pasa-banda. Dos
   *   parciales que no son múltiplos es lo que el oído lee como metal; con una
   *   relación armónica saldría un tono musical, que es justo lo que no es un
   *   disparo.
   * - **`body`**: el golpe grave, **más corto que el clásico** (32 ms contra 55).
   *   Da peso sin dejar cola: la sequedad se pierde por abajo, no por arriba.
   */
  rift: {
    voz: 'seca',
    crackTipo: 'highpass',
    crackHz: 2600,
    crackQ: 0.7,
    crackGain: 0.9,
    crackDecay: 0.024,
    metalHz: 1680,
    metalTo: 860,
    metalRatio: 1.48,
    metalDrive: 3.4,
    metalBandHz: 2700,
    metalBandQ: 0.9,
    metalGain: 0.46,
    metalDecay: 0.07,
    bodyFrom: 98,
    bodyTo: 44,
    bodyGain: 0.55,
    bodyDecay: 0.032,
  },

  /**
   * **La Rift con silenciador.** No es la misma con el volumen bajado: se le
   * quitan las dos capas que delatan un disparo a distancia —el grave casi
   * entero y el crack de banda ancha— y se le deja lo que suena **en la mano**,
   * el cerrojo. Por eso aparece una capa que la normal no tiene (`meca`) y va
   * **retrasada**: el mecanismo se mueve después de la detonación, y ese hueco
   * de doce milisegundos es lo que se oye como una máquina en vez de un golpe.
   */
  'rift.s': {
    voz: 'seca',
    crackTipo: 'bandpass',
    crackHz: 1900,
    crackQ: 1.5,
    crackGain: 0.3,
    crackDecay: 0.012,
    metalHz: 1420,
    metalTo: 760,
    metalRatio: 1.48,
    metalDrive: 1.7,
    metalBandHz: 1900,
    metalBandQ: 1.3,
    metalGain: 0.54,
    metalDecay: 0.05,
    bodyFrom: 84,
    bodyTo: 46,
    bodyGain: 0.07,
    bodyDecay: 0.022,
    mecaHz: 2900,
    mecaQ: 1.1,
    mecaGain: 0.4,
    mecaDecay: 0.03,
    mecaDelay: 0.012,
  },

  /**
   * **La Pulse**, que es una pistola: el mismo tratamiento de la Rift con lo que
   * cambia entre un rifle y un arma corta. Menos cuerpo y más arriba —el crack
   * sube a 3200 Hz y el grave pierde la mitad de peso—, y todo **más corto**:
   * lo que se oye de una pistola es el chasquido, no el empujón.
   */
  pulse: {
    voz: 'seca',
    crackTipo: 'highpass',
    crackHz: 3200,
    crackQ: 0.7,
    crackGain: 0.86,
    crackDecay: 0.018,
    metalHz: 2050,
    metalTo: 1020,
    metalRatio: 1.48,
    metalDrive: 2.8,
    metalBandHz: 3200,
    metalBandQ: 0.9,
    metalGain: 0.4,
    metalDecay: 0.05,
    bodyFrom: 120,
    bodyTo: 58,
    bodyGain: 0.34,
    bodyDecay: 0.022,
  },

  /** La Pulse con silenciador: corredera por delante y sin nada que viaje. */
  'pulse.s': {
    voz: 'seca',
    crackTipo: 'bandpass',
    crackHz: 2100,
    crackQ: 1.5,
    crackGain: 0.26,
    crackDecay: 0.01,
    metalHz: 1600,
    metalTo: 820,
    metalRatio: 1.48,
    metalDrive: 1.5,
    metalBandHz: 2100,
    metalBandQ: 1.3,
    metalGain: 0.46,
    metalDecay: 0.04,
    bodyFrom: 92,
    bodyTo: 50,
    bodyGain: 0.05,
    bodyDecay: 0.018,
    mecaHz: 3300,
    mecaQ: 1.1,
    mecaGain: 0.36,
    mecaDecay: 0.026,
    mecaDelay: 0.01,
  },

  /**
   * **La Volt**, que dispara a 800 RPM: entre disparo y disparo hay **75 ms**,
   * así que aquí lo que manda no es el color sino la duración. Ninguna capa
   * pasa de 50 ms —la más corta de las tres armas— porque una cola de 70 ms a
   * esa cadencia se pisa a sí misma y la ráfaga se oye como un zumbido en vez
   * de como disparos contados.
   */
  volt: {
    voz: 'seca',
    crackTipo: 'highpass',
    crackHz: 2950,
    crackQ: 0.7,
    crackGain: 0.88,
    crackDecay: 0.015,
    metalHz: 1880,
    metalTo: 940,
    metalRatio: 1.48,
    metalDrive: 3,
    metalBandHz: 2950,
    metalBandQ: 0.95,
    metalGain: 0.44,
    metalDecay: 0.042,
    bodyFrom: 108,
    bodyTo: 48,
    bodyGain: 0.42,
    bodyDecay: 0.022,
  },

  /** La Volt con silenciador. */
  'volt.s': {
    voz: 'seca',
    crackTipo: 'bandpass',
    crackHz: 1950,
    crackQ: 1.5,
    crackGain: 0.28,
    crackDecay: 0.011,
    metalHz: 1500,
    metalTo: 800,
    metalRatio: 1.48,
    metalDrive: 1.6,
    metalBandHz: 2000,
    metalBandQ: 1.3,
    metalGain: 0.48,
    metalDecay: 0.038,
    bodyFrom: 88,
    bodyTo: 48,
    bodyGain: 0.06,
    bodyDecay: 0.02,
    mecaHz: 3050,
    mecaQ: 1.1,
    mecaGain: 0.38,
    mecaDecay: 0.024,
    mecaDelay: 0.009,
  },
}

/**
 * **La curva del saturador, una sola vez.** Un `WaveShaper` necesita una tabla
 * de 2048 puntos y el fuego automático llama a esto diez veces por segundo: una
 * tabla por disparo sería basura para el recolector en el sitio donde menos
 * cabe. Se cachea por `drive`, que son dos valores en todo el juego.
 *
 * La curva es la tangente hiperbólica: satura suave y **no tiene esquinas**, así
 * que añade armónicos sin el zumbido de un recorte duro.
 */
const curvasDeSaturacion = new Map()
function curvaDeSaturacion(drive) {
  let curva = curvasDeSaturacion.get(drive)
  if (curva) return curva
  const n = 2048
  curva = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curva[i] = Math.tanh(x * drive)
  }
  curvasDeSaturacion.set(drive, curva)
  return curva
}

/**
 * **El disparo, y hay un solo camino.** Quien llama no elige síntesis ni
 * muestra —eso lo decide `samples.js`— y tampoco elige voz: la elige el arma,
 * por su clave. Sin clave, o con una que no tiene perfil propio, suena la voz
 * clásica de siempre — que desde la vuelta 63 no la lleva ninguna de las tres:
 * es el respaldo del arma que todavía no tenga la suya.
 *
 * @param {boolean} [suppressed] perfil silenciado
 * @param {{input: AudioNode|null}} [emitter] emisor posicionado, si lo hay. Es
 *   por donde suena el disparo de un muñeco: mismo sonido, otro sitio.
 * @param {number} [volume] volumen base; por defecto, el del jugador
 * @param {string|null} [weaponKey] clave de `WEAPONS`, para elegir la voz
 */
export function playShot(suppressed = false, emitter = null, volume = AUDIO.shotVolume, weaponKey = null) {
  if (!ctx || !master || !noiseBuffer) return
  const t = ctx.currentTime
  const perfil = perfilDeDisparo(weaponKey, suppressed)
  // Con emisor la distancia la aplica el panner; sin él, al máster y ya.
  const out = emitter?.input ?? master
  if (perfil.voz === 'seca') _disparoSeco(perfil, t, volume, out)
  else _disparoClasico(perfil, t, volume, out)
}

/**
 * La voz del arma, o la de siempre. La clave silenciada es `<arma>.s`, la misma
 * idea que `ghost-<arma>` en las siluetas: **otra foto del arma**, no la misma
 * con un filtro.
 */
function perfilDeDisparo(weaponKey, suppressed) {
  const propio = weaponKey ? SHOT_PROFILES[suppressed ? `${weaponKey}.s` : weaponKey] : null
  return propio ?? (suppressed ? SHOT_PROFILES.suppressed : SHOT_PROFILES.normal)
}

/**
 * **El ataque de un disparo es un escalón, no una rampa.** Medio milisegundo:
 * suficiente para que no sea un salto de continua —que se oye como un «pop» de
 * altavoz— y lo bastante corto para que el oído lo lea como instantáneo. Era
 * de 2 a 3 ms en la voz clásica, y esa es la mitad de por qué sonaba a gota.
 */
const ATAQUE_SECO = 0.0006

/** Envolvente de percusión: entra de golpe y cae, sin sostener nada. */
function _golpe(pico, t, decaimiento) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(Math.max(0.0002, pico), t + ATAQUE_SECO)
  g.gain.exponentialRampToValueAtTime(0.0001, t + decaimiento)
  return g
}

/** Una ráfaga de ruido filtrado: el `crack` y, en la silenciada, el cerrojo. */
function _ruido(tipo, hz, q, pico, t, decaimiento, out) {
  const fuente = ctx.createBufferSource()
  fuente.buffer = noiseBuffer
  const filtro = ctx.createBiquadFilter()
  filtro.type = tipo
  filtro.frequency.value = hz
  filtro.Q.value = q
  const g = _golpe(pico, t, decaimiento)
  fuente.connect(filtro).connect(g).connect(out)
  fuente.start(t)
  fuente.stop(t + decaimiento + 0.02)
  fuente.onended = () => {
    fuente.disconnect()
    filtro.disconnect()
    g.disconnect()
  }
}

/**
 * **La voz seca.** Tres capas que atacan a la vez y una cuarta, retrasada, sólo
 * en la silenciada. Ninguna dura más de setenta milisegundos, que es la
 * diferencia entre un disparo y una nota.
 */
function _disparoSeco(p, t, level, out) {
  // 1. El crack: banda ancha de arriba, lo primero que llega.
  _ruido(p.crackTipo, p.crackHz, p.crackQ, p.crackGain * level, t, p.crackDecay, out)

  // 2. El metal: dos parciales inarmónicos, saturados y filtrados.
  const shaper = ctx.createWaveShaper()
  shaper.curve = curvaDeSaturacion(p.metalDrive)
  shaper.oversample = '2x'
  const banda = ctx.createBiquadFilter()
  banda.type = 'bandpass'
  banda.frequency.value = p.metalBandHz
  banda.Q.value = p.metalBandQ
  const metalGain = _golpe(p.metalGain * level, t, p.metalDecay)
  shaper.connect(banda).connect(metalGain).connect(out)
  const osciladores = []
  for (const ratio of [1, p.metalRatio]) {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(p.metalHz * ratio, t)
    osc.frequency.exponentialRampToValueAtTime(p.metalTo * ratio, t + p.metalDecay)
    osc.connect(shaper)
    osc.start(t)
    osc.stop(t + p.metalDecay + 0.02)
    osciladores.push(osc)
  }
  osciladores[0].onended = () => {
    for (const osc of osciladores) osc.disconnect()
    shaper.disconnect()
    banda.disconnect()
    metalGain.disconnect()
  }

  // 3. El cuerpo: el golpe grave, corto. Da peso y no deja cola.
  const body = ctx.createOscillator()
  body.type = 'triangle'
  body.frequency.setValueAtTime(p.bodyFrom, t)
  body.frequency.exponentialRampToValueAtTime(p.bodyTo, t + p.bodyDecay)
  const bodyGain = _golpe(p.bodyGain * level, t, p.bodyDecay)
  body.connect(bodyGain).connect(out)
  body.start(t)
  body.stop(t + p.bodyDecay + 0.02)
  body.onended = () => {
    body.disconnect()
    bodyGain.disconnect()
  }

  // 4. El cerrojo, sólo donde se oye: con supresor y **después** del disparo.
  if (p.mecaGain) {
    _ruido('bandpass', p.mecaHz, p.mecaQ, p.mecaGain * level, t + p.mecaDelay, p.mecaDecay, out)
  }
}

/** La voz de siempre: transitorio de ruido filtrado + un grave que cae. */
function _disparoClasico(profile, t, level, out) {
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

/**
 * **Lo que has comprado, al ponértelo** (vuelta 73).
 *
 * Suena **cuando el servidor lo da por tuyo**, no al pinchar: el clic sólo pide,
 * y un sonido al pedir diría «ya lo tienes» a quien no llegue de saldo. Es la
 * misma regla que la marca de impacto de la vuelta 46 —lo que confirma es el
 * veredicto, no la intención—, y de paso la condición del encargo («sólo si hay
 * dinero suficiente») sale gratis: si no se cobra, no hay inventario nuevo y no
 * suena nada.
 *
 * Cuatro voces y **ninguna es un bip con otro volumen**: lo que distingue a
 * cada una es de qué está hecha, que es la regla de la casa desde la 40.
 *
 * - **Chaleco**: una cremallera. Ruido por un pasa-banda que **sube** de 700 a
 *   4.2 kHz en 180 ms, que es lo que se oye como un diente detrás de otro. La
 *   única de las cuatro que dura más de una décima, porque abrocharse tarda.
 * - **Casco**: un golpe sordo sobre algo hueco. Dos parciales graves y muy
 *   amortiguados, sin nada agudo: lo que dice «esto es un casco» es que no
 *   resuena.
 * - **Arma**: el cerrojo. Dos chasquidos metálicos separados 55 ms —correr y
 *   soltar—, con la misma saturación inarmónica que los disparos, porque es la
 *   misma pieza de metal.
 * - **Utilidad**: un mosquetón al cinturón. Un golpe corto y **un anillo agudo
 *   que sigue sonando** 200 ms: el muelle. Es lo único de las cuatro que tiene
 *   cola, y es lo que lo hace reconocible.
 *
 * @param {'chaleco'|'casco'|'arma'|'utilidad'} tipo
 */
export function playEquip(tipo) {
  if (!ctx || !master || !noiseBuffer) return
  const t = ctx.currentTime
  const vol = AUDIO.equipVolume
  const fin = []

  if (tipo === 'chaleco') {
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    const banda = ctx.createBiquadFilter()
    banda.type = 'bandpass'
    banda.Q.value = 4.5
    banda.frequency.setValueAtTime(700, t)
    banda.frequency.exponentialRampToValueAtTime(4200, t + 0.18)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    noise.connect(banda).connect(gain).connect(master)
    noise.start(t)
    noise.stop(t + 0.22)
    fin.push([noise, banda, gain])
  } else if (tipo === 'casco') {
    for (const [hz, amp, largo] of [[190, 0.55, 0.14], [268, 0.3, 0.1]]) {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(hz, t)
      osc.frequency.exponentialRampToValueAtTime(hz * 0.72, t + largo)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(amp * vol, t + 0.003)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + largo)
      osc.connect(gain).connect(master)
      osc.start(t)
      osc.stop(t + largo + 0.02)
      fin.push([osc, gain])
    }
  } else if (tipo === 'arma') {
    for (const retraso of [0, 0.055]) {
      const noise = ctx.createBufferSource()
      noise.buffer = noiseBuffer
      const banda = ctx.createBiquadFilter()
      banda.type = 'bandpass'
      banda.Q.value = 7
      banda.frequency.value = retraso ? 2400 : 3100
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, t + retraso)
      gain.gain.exponentialRampToValueAtTime(0.45 * vol, t + retraso + 0.0015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + retraso + 0.035)
      noise.connect(banda).connect(gain).connect(master)
      noise.start(t + retraso)
      noise.stop(t + retraso + 0.05)
      fin.push([noise, banda, gain])
    }
  } else {
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    const alto = ctx.createBiquadFilter()
    alto.type = 'highpass'
    alto.frequency.value = 2600
    const golpe = ctx.createGain()
    golpe.gain.setValueAtTime(0.0001, t)
    golpe.gain.exponentialRampToValueAtTime(0.4 * vol, t + 0.0015)
    golpe.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
    noise.connect(alto).connect(golpe).connect(master)
    noise.start(t)
    noise.stop(t + 0.04)
    fin.push([noise, alto, golpe])

    // El muelle: lo que hace que un mosquetón suene a mosquetón y no a clic.
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(3150, t)
    const anillo = ctx.createGain()
    anillo.gain.setValueAtTime(0.0001, t)
    anillo.gain.exponentialRampToValueAtTime(0.22 * vol, t + 0.004)
    anillo.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    osc.connect(anillo).connect(master)
    osc.start(t)
    osc.stop(t + 0.22)
    fin.push([osc, anillo])
  }

  for (const nodos of fin) {
    nodos[0].onended = () => {
      for (const nodo of nodos) nodo.disconnect()
    }
  }
}

/**
 * **La ronda se acaba** (vuelta 73). Un pitido por segundo en los últimos
 * `ROUNDS.avisoFinalSegundos`, y **suave a propósito**: es un recordatorio, no
 * una alarma — el jugador está en mitad de un intercambio y lo que no puede
 * hacer es sobresaltarle.
 *
 * Es senoidal puro y sin ruido, como `playUiConfirm`, porque **no es del
 * mundo**: es información de la partida, como el marcador de ronda. Y el último
 * segundo sube de tono, que es lo que separa «queda poco» de «se acabó» sin
 * necesidad de mirar el reloj.
 *
 * @param {boolean} ultimo si es el segundo final.
 */
export function playRoundTick(ultimo = false) {
  if (!ctx || !master) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(ultimo ? 1180 : 880, t)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime((ultimo ? 0.34 : 0.22) * AUDIO.roundTickVolume, t + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + (ultimo ? 0.16 : 0.09))
  osc.connect(gain).connect(master)
  osc.start(t)
  osc.stop(t + 0.2)
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
 * **Baja: dos notas que bajan, con cuerpo** (vuelta 52).
 *
 * No es el acierto más fuerte, y eso no es capricho: el acierto es un chirrido
 * **que sube**, brillante y corto, y significa «has conectado». Una baja
 * significa lo contrario —eso se ha acabado— así que **baja de tono** y lleva un
 * grave debajo que el acierto no tiene. Es la misma regla del silbido de la
 * vuelta 40: una voz propia, no la de al lado con otro volumen. Si sonaran
 * parecidas, en medio de una ráfaga no habría forma de saber si el rival ha
 * caído o sólo le has rozado.
 */
/**
 * **El cuchillo** (vuelta 71): tres voces y ninguna es la del disparo bajada de
 * volumen, que es la regla del silbido de la vuelta 40.
 *
 * Lo que hay que poder distinguir con los ojos en otra parte son **tres** cosas,
 * y cada una cambia algo distinto:
 *
 * - **El filo al aire** es ruido por un pasa-banda que **sube** de tono (1.4 →
 *   4.5 kHz en 70 ms). Que suba es lo que se oye como algo que pasa rápido por
 *   delante; el silbido de una bala hace justo lo contrario, y por eso no se
 *   confunden.
 * - **Que ha entrado** añade un golpe corto y grave: el cuerpo. Sin él, acertar
 *   y fallar suenan igual, que es el problema entero de un arma que no se ve.
 * - **El fuerte** es el mismo filo más lento y más abajo (0.9 → 2.8 kHz en 110
 *   ms) con el doble de cuerpo. No es más volumen: es más peso.
 * - **Y por la espalda** lleva además un metal inarmónico —la misma relación
 *   1.48 de la voz seca del disparo— que no lleva ningún otro golpe. Es lo que
 *   dice «esto ha sido lo otro» sin mirar la pantalla.
 *
 * @param {'luz'|'fuerte'} tipo
 * @param {boolean} conecta si el golpe ha entrado en un cuerpo
 * @param {boolean} espalda si además ha sido por detrás
 */
export function playMelee(tipo, conecta = false, espalda = false) {
  if (!ctx || !master || !noiseBuffer) return
  const t = ctx.currentTime
  const fuerte = tipo === 'fuerte'
  const level = AUDIO.shotVolume

  // 1. El filo.
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 1.6
  const dur = fuerte ? 0.11 : 0.07
  band.frequency.setValueAtTime(fuerte ? 900 : 1400, t)
  band.frequency.exponentialRampToValueAtTime(fuerte ? 2800 : 4500, t + dur)
  const gFilo = ctx.createGain()
  gFilo.gain.setValueAtTime(0.0001, t)
  gFilo.gain.exponentialRampToValueAtTime((fuerte ? 0.30 : 0.20) * level, t + 0.004)
  gFilo.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03)
  noise.connect(band).connect(gFilo).connect(master)
  noise.start(t)
  noise.stop(t + dur + 0.06)
  noise.onended = () => {
    noise.disconnect()
    band.disconnect()
    gFilo.disconnect()
  }

  if (!conecta) return

  // 2. El cuerpo: el golpe grave que dice que ha entrado.
  const golpe = ctx.createOscillator()
  golpe.type = 'triangle'
  golpe.frequency.setValueAtTime(fuerte ? 165 : 230, t + 0.012)
  golpe.frequency.exponentialRampToValueAtTime(fuerte ? 70 : 120, t + 0.012 + (fuerte ? 0.14 : 0.08))
  const gCuerpo = ctx.createGain()
  gCuerpo.gain.setValueAtTime(0.0001, t + 0.012)
  gCuerpo.gain.exponentialRampToValueAtTime((fuerte ? 0.40 : 0.22) * level, t + 0.018)
  gCuerpo.gain.exponentialRampToValueAtTime(0.0001, t + 0.012 + (fuerte ? 0.18 : 0.10))
  golpe.connect(gCuerpo).connect(master)
  golpe.start(t + 0.012)
  golpe.stop(t + 0.22)
  golpe.onended = () => {
    golpe.disconnect()
    gCuerpo.disconnect()
  }

  if (!espalda) return

  // 3. El metal de la puñalada por la espalda. Inarmónico (×1.48), como la voz
  // seca del disparo: un tono musical aquí sonaría a premio de máquina
  // recreativa y esto no es un premio, es una ejecución.
  for (const [hz, retardo] of [[880, 0.02], [880 * 1.48, 0.026]]) {
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(hz, t + retardo)
    osc.frequency.exponentialRampToValueAtTime(hz * 0.55, t + retardo + 0.2)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t + retardo)
    g.gain.exponentialRampToValueAtTime(0.16 * level, t + retardo + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + retardo + 0.24)
    osc.connect(g).connect(master)
    osc.start(t + retardo)
    osc.stop(t + retardo + 0.28)
    osc.onended = () => {
      osc.disconnect()
      g.disconnect()
    }
  }
}

/**
 * **El arco** (vuelta 85). Tres voces distintas para tres cosas distintas, y
 * ninguna es otra con el volumen cambiado — que es la regla desde la vuelta 40.
 *
 * - `tensar`: el crujido de la cuerda mientras se carga. Suena **una vez, al
 *   empezar**, y no en bucle: un sonido continuo mientras se apunta tapa
 *   exactamente lo que el oído está haciendo, que es escuchar pasos.
 * - `soltar`: el *twang*. Es lo más parecido a un arco real que se puede
 *   sintetizar sin una muestra, y eso son **tres capas y ningún oscilador
 *   grave**: el chasquido seco de la cuerda liberada, la cuerda vibrando —dos
 *   parciales **inarmónicos** en relación 1.61, porque una cuerda con una
 *   flecha encima no da una nota— y el roce de la flecha saliendo. Un arco
 *   suena **a madera y a cuerda**, no a disparo: por eso aquí no hay ni crack
 *   de banda ancha ni golpe grave, que son las dos capas que hacen que un arma
 *   de fuego suene a arma de fuego.
 * - `clavar`: el *thock* de la punta entrando. Corto, medio grave y sin cola.
 *
 * `carga` va de 0 a 1 y **no cambia el volumen: cambia el tono**. Una cuerda
 * más tensa suena más aguda, así que soltar a tope sube los parciales un tercio
 * — que es lo que hace que se oiga desde fuera si el que dispara iba cargado.
 */
export function playBow(tipo, carga = 1) {
  if (!ctx || !master || !noiseBuffer) return
  const t = ctx.currentTime
  const level = AUDIO.shotVolume

  /** Ruido por un filtro, que es el ladrillo de las tres. */
  const roce = (tipoFiltro, hz0, hz1, q, pico, dur, retardo = 0) => {
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    const f = ctx.createBiquadFilter()
    f.type = tipoFiltro
    f.Q.value = q
    f.frequency.setValueAtTime(hz0, t + retardo)
    f.frequency.exponentialRampToValueAtTime(hz1, t + retardo + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t + retardo)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pico * level), t + retardo + 0.0015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + retardo + dur)
    noise.connect(f).connect(g).connect(master)
    noise.start(t + retardo)
    noise.stop(t + retardo + dur + 0.02)
    noise.onended = () => { noise.disconnect(); f.disconnect(); g.disconnect() }
  }

  /** Un parcial de cuerda: triangular, cayendo de tono. */
  const cuerda = (hz, pico, dur, retardo = 0) => {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(hz, t + retardo)
    osc.frequency.exponentialRampToValueAtTime(hz * 0.72, t + retardo + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t + retardo)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pico * level), t + retardo + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t + retardo + dur)
    osc.connect(g).connect(master)
    osc.start(t + retardo)
    osc.stop(t + retardo + dur + 0.02)
    osc.onended = () => { osc.disconnect(); g.disconnect() }
  }

  if (tipo === 'tensar') {
    // Madera que trabaja: ruido estrecho subiendo, flojo y corto. Es un aviso
    // de que has empezado, no un acompañamiento.
    roce('bandpass', 380, 760, 7, 0.11, 0.16)
    return
  }

  if (tipo === 'clavar') {
    roce('bandpass', 1500, 420, 2.2, 0.26, 0.055)
    cuerda(190, 0.20, 0.09)
    return
  }

  // `soltar`. El tono sube con la tensión: 1.0 sin cargar, 1.33 a tope.
  const k = 1 + 0.33 * Math.max(0, Math.min(1, carga))
  // 1. El chasquido de la cuerda al liberarse. Ataque de 1.5 ms, como la voz
  // seca del disparo: medio milisegundo es lo que separa un golpe de un «pop».
  roce('highpass', 1700 * k, 900 * k, 0.8, 0.30, 0.05)
  // 2. La cuerda vibrando. Relación 1.61 —ni octava ni quinta— porque lo que
  // suena no es una nota: es una cuerda cargada y amortiguada por una mano.
  cuerda(300 * k, 0.26, 0.13)
  cuerda(300 * k * 1.61, 0.15, 0.10, 0.004)
  // 3. La flecha rozando el arco al salir, un pelo después.
  roce('bandpass', 2600 * k, 5200 * k, 3, 0.13, 0.07, 0.012)
}

/**
 * **El U2** (vuelta 86). Tres voces, y la primera es la que no existía en
 * Vektor: **un sonido que dura mientras algo vuela**.
 *
 * - `salida`: el disparo. Lo que suena de un tubo no es un crack —eso es una
 *   bala en un cañón— sino **la deflagración**: ruido grave de banda ancha que
 *   se abre, sin metal y sin cerrojo.
 * - `silbido`: **el trayecto**, y es la única voz del juego que se devuelve
 *   para poder pararla. Se mantiene mientras el cohete vuela y se corta al
 *   estallar — y por eso `playRocket('silbido')` devuelve un asa con `parar()`.
 *   Va por un pasa-banda estrecho que **sube** despacio, que es lo que se lee
 *   como «se acerca» aunque el panner ya diga de dónde viene.
 * - `explosion`: lo que se pidió, y lo que la separa de todo lo demás es el
 *   **grave largo**. Un disparo tiene cuerpo de 30 ms; esto tiene 700, y ésa es
 *   toda la diferencia entre «ha pasado algo» y «ha pasado algo grande».
 *
 * `distancia` (0..1) sube con lo lejos que estés y **apaga los agudos, no el
 * volumen**: una explosión lejana se oye igual de fuerte y mucho más sorda, que
 * es lo que hace el aire de verdad. El volumen lo pone el panner, como siempre.
 */
export function playRocket(tipo, emitter = null, distancia = 0) {
  if (!ctx || !master || !noiseBuffer) return null
  const t = ctx.currentTime
  // `input` devuelve null con el audio espacial apagado: se cae al máster sin
  // dirección, que es lo que hacen todas las voces posicionadas del juego.
  const destino = emitter?.input ?? master
  const level = AUDIO.shotVolume
  const lejos = Math.max(0, Math.min(1, distancia))

  if (tipo === 'silbido') {
    /**
     * **El único sonido del juego que se sostiene**, así que es el único que
     * hay que poder parar: se devuelve un asa y quien lo encendió lo apaga.
     * Sin eso, un cohete que revienta seguiría silbando desde el sitio en el
     * que estalló hasta que se le acabara la envolvente.
     */
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    noise.loop = true
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 5
    band.frequency.setValueAtTime(700, t)
    band.frequency.exponentialRampToValueAtTime(1500, t + 2.5)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16 * level, t + 0.06)
    noise.connect(band).connect(g).connect(destino)
    noise.start(t)
    let vivo = true
    return {
      parar() {
        if (!vivo) return
        vivo = false
        const ahora = ctx.currentTime
        g.gain.cancelScheduledValues(ahora)
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), ahora)
        g.gain.exponentialRampToValueAtTime(0.0001, ahora + 0.04)
        noise.stop(ahora + 0.06)
        noise.onended = () => { noise.disconnect(); band.disconnect(); g.disconnect() }
      },
    }
  }

  /** Ruido por un filtro, el ladrillo de las dos que quedan. */
  const capa = (tipoF, hz0, hz1, q, pico, dur, retardo = 0) => {
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    const f = ctx.createBiquadFilter()
    f.type = tipoF
    f.Q.value = q
    f.frequency.setValueAtTime(hz0, t + retardo)
    f.frequency.exponentialRampToValueAtTime(hz1, t + retardo + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t + retardo)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pico * level), t + retardo + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + retardo + dur)
    noise.connect(f).connect(g).connect(destino)
    noise.start(t + retardo)
    noise.stop(t + retardo + dur + 0.05)
    noise.onended = () => { noise.disconnect(); f.disconnect(); g.disconnect() }
  }

  if (tipo === 'salida') {
    capa('lowpass', 1800, 420, 0.7, 0.42, 0.28)
    capa('bandpass', 260, 120, 1.2, 0.30, 0.22, 0.008)
    return null
  }

  if (tipo === 'recarga') {
    // El tubo: un golpe hueco y un cierre metálico. Sin cola.
    capa('bandpass', 320, 180, 3, 0.20, 0.12)
    capa('highpass', 2600, 1800, 0.9, 0.10, 0.06, 0.16)
    return null
  }

  // `explosion`. Lo que la separa de un disparo es el grave largo.
  // Lo lejano pierde agudos, no volumen: eso lo hace el aire, no el altavoz.
  const techo = 9000 - 7200 * lejos
  capa('lowpass', techo, 160, 0.6, 0.62, 0.7)
  capa('bandpass', 90, 45, 1.1, 0.55, 0.72, 0.006)
  if (lejos < 0.7) capa('highpass', 5200, 2400, 0.8, 0.30 * (1 - lejos), 0.12)
  // Y la cola: lo que queda retumbando, que es lo que dice «grande».
  capa('lowpass', 700, 200, 0.5, 0.18, 1.1, 0.10)
  return null
}

/**
 * **Las tres granadas, y las tres tienen voz propia** (vuelta 87).
 *
 * Ninguna es otra con el volumen cambiado, que es la regla desde el silbido de
 * la vuelta 40: lo que separa dos sonidos es **hacia dónde va el tono**.
 *
 * - **Core**: un crujido de banda ancha y un grave corto. Es la explosión del
 *   cohete **partida y acelerada** —sin la cola que retumba— porque una granada
 *   es una carga pequeña: lo que se oye es el reventón, no el eco.
 * - **Blind**: el tono **sube** y no lleva ni un grave. Un destello no golpea,
 *   deslumbra, y lo que se oye de él es el chasquido del fogonazo y un pitido
 *   que se queda arriba — que es además lo que uno esperaría oír justo antes de
 *   no ver nada.
 * - **KO**: un cañón de aire comprimido, que es lo que se pidió. Ruido por un
 *   pasa-banda que **cae** de 900 a 120 Hz con un clic neumático delante. Cae,
 *   al revés que la Blind, y sin el crujido del Core: no revienta, descarga.
 * - **Bote**: el aviso de que hay una en el suelo, y es información y no
 *   adorno — **el oído no hay que apuntarlo a ninguna parte** (vuelta 73), así
 *   que una granada que cae detrás de ti es la única forma de enterarte. Su
 *   volumen sale de lo fuerte que pegó, no de un número fijo.
 *
 * @param {'core'|'blind'|'ko'|'bote'|'lanzar'} tipo
 * @param {number} distancia 0..1, sólo para las explosiones: lo lejano pierde
 *   agudos y no volumen, que es lo que hace el aire (vuelta 86).
 */
export function playGrenade(tipo, emitter = null, distancia = 0, fuerza = 1) {
  if (!ctx || !master || !noiseBuffer) return null
  const t = ctx.currentTime
  const destino = emitter?.input ?? master
  const level = AUDIO.shotVolume
  const lejos = Math.max(0, Math.min(1, distancia))
  const k = Math.max(0, Math.min(1, fuerza))

  /** Ruido por un filtro que barre. El ladrillo de las cuatro voces. */
  const capa = (tipoF, hz0, hz1, q, pico, dur, retardo = 0) => {
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    const f = ctx.createBiquadFilter()
    f.type = tipoF
    f.Q.value = q
    f.frequency.setValueAtTime(hz0, t + retardo)
    f.frequency.exponentialRampToValueAtTime(hz1, t + retardo + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t + retardo)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pico * level), t + retardo + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + retardo + dur)
    noise.connect(f).connect(g).connect(destino)
    noise.start(t + retardo)
    noise.stop(t + retardo + dur + 0.05)
    noise.onended = () => { noise.disconnect(); f.disconnect(); g.disconnect() }
  }

  /** Un parcial. Lo que pone tono donde el ruido sólo pone textura. */
  const tono = (forma, hz0, hz1, pico, dur, retardo = 0) => {
    const osc = ctx.createOscillator()
    osc.type = forma
    osc.frequency.setValueAtTime(hz0, t + retardo)
    osc.frequency.exponentialRampToValueAtTime(hz1, t + retardo + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t + retardo)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pico * level), t + retardo + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t + retardo + dur)
    osc.connect(g).connect(destino)
    osc.start(t + retardo)
    osc.stop(t + retardo + dur + 0.05)
    osc.onended = () => { osc.disconnect(); g.disconnect() }
  }

  if (tipo === 'lanzar') {
    // Tirar algo: una tela que roza y nada más. Corto, y por debajo del disparo.
    capa('bandpass', 2600, 900, 1.4, 0.10, 0.09)
    return null
  }

  if (tipo === 'bote') {
    /**
     * **Metal contra hormigón.** Dos parciales **inarmónicos** en relación
     * 1.83, que es lo mismo que hace la puerta de un teletransporte (vuelta 82)
     * y por lo mismo: una relación armónica suena a nota musical, y una
     * granada golpeando el suelo no es una nota.
     */
    const v = 0.05 + 0.22 * k
    tono('triangle', 1450, 900, v, 0.055)
    tono('triangle', 1450 * 1.83, 1600, v * 0.5, 0.04)
    capa('highpass', 4200, 2600, 0.8, v * 0.5, 0.03)
    return null
  }

  if (tipo === 'blind') {
    // Sube y se queda arriba, sin nada por debajo de 1.2 kHz.
    capa('highpass', 1800, 6500, 0.7, 0.55, 0.16)
    tono('sawtooth', 1200, 3400, 0.22, 0.20, 0.004)
    // Y el pitido que queda en el oído, que es lo que dice «te ha pillado».
    tono('sine', 3900, 3600, 0.10, 0.85, 0.05)
    return null
  }

  if (tipo === 'ko') {
    // Descarga de aire: cae, y el clic neumático va delante.
    capa('highpass', 5200, 3800, 0.9, 0.16, 0.02)
    capa('bandpass', 900, 120, 1.1, 0.58, 0.34, 0.012)
    capa('lowpass', 500, 90, 0.6, 0.30, 0.42, 0.02)
    return null
  }

  // `core`. Lo que la separa del cohete es que no tiene cola.
  const techo = 8000 - 6400 * lejos
  capa('lowpass', techo, 220, 0.6, 0.60, 0.34)
  capa('bandpass', 120, 55, 1.1, 0.50, 0.30, 0.005)
  if (lejos < 0.7) capa('highpass', 5600, 2600, 0.8, 0.34 * (1 - lejos), 0.09)
  return null
}

export function playKill() {
  if (!ctx || !master) return
  const t = ctx.currentTime
  const level = AUDIO.killVolume

  // (tipo, frecuencia inicial, final, ganancia, retardo, duración)
  const voces = [
    ['sine', 1320, 990, 0.30, 0.000, 0.16],
    ['sine', 990, 660, 0.26, 0.085, 0.24],
    // El cuerpo grave, que es lo que la separa del acierto de un vistazo.
    ['triangle', 220, 150, 0.22, 0.085, 0.30],
  ]

  for (const [tipo, desde, hasta, ganancia, retardo, dur] of voces) {
    const inicio = t + retardo
    const osc = ctx.createOscillator()
    osc.type = tipo
    osc.frequency.setValueAtTime(desde, inicio)
    osc.frequency.exponentialRampToValueAtTime(hasta, inicio + dur * 0.8)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, inicio)
    g.gain.exponentialRampToValueAtTime(ganancia * level, inicio + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, inicio + dur)
    osc.connect(g).connect(master)
    osc.start(inicio)
    osc.stop(inicio + dur + 0.02)
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
/**
 * **La pisada de otro** (vuelta 60). Siempre con emisor: una pisada sin sitio no
 * es información, es ruido — el sentido entero de esto es enterarse de que hay
 * alguien **por ahí** sin verlo. Por eso, si no hay emisor, no suena.
 *
 * El perfil es el del aterrizaje en pequeño: roce de suela y un cuerpo grave y
 * corto. Lo que lo separa de aquél es la duración —una décima contra media— y
 * que el tono se mueve un poco en cada paso, para que seis pisadas seguidas no
 * suenen a la misma muestra repetida.
 *
 * @param {number} strength 0-1: la marcha del que pisa, ya con lo de agacharse
 * @param {{input: AudioNode|null}} emitter emisor posicionado. Sin él no suena.
 */
export function playFootstep(strength = 1, emitter = null) {
  if (!ctx || !master || !noiseBuffer) return
  const out = emitter?.input
  if (!out) return
  const level = Math.max(0, Math.min(1, strength))
  if (level <= 0) return

  const profile = FOOTSTEPS.sound
  const t = ctx.currentTime
  const gain = AUDIO.footstepVolume * (0.45 + 0.55 * level)
  // Un paso nunca es idéntico al anterior. Va sobre el tono y no sobre el
  // volumen: variar el volumen se lee como distancia, y la distancia ya la está
  // diciendo el panner.
  const tono = 1 + (Math.random() * 2 - 1) * FOOTSTEPS.pitchJitter

  // Suela: ruido por un pasa-banda. Es roce contra el suelo, no un golpe.
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = profile.scuffHz * tono
  band.Q.value = 0.8
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.0001, t)
  noiseGain.gain.exponentialRampToValueAtTime(gain * profile.scuffGain, t + 0.006)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + profile.scuffDecay)
  noise.connect(band).connect(noiseGain).connect(out)
  noise.start(t)
  noise.stop(t + profile.scuffDecay + 0.02)
  noise.onended = () => {
    noise.disconnect()
    band.disconnect()
    noiseGain.disconnect()
  }

  // Cuerpo: el peso del pie. Grave, corto y con ataque suave, que es lo que lo
  // separa de un clic.
  const body = ctx.createOscillator()
  body.type = profile.bodyType
  body.frequency.setValueAtTime(profile.bodyFrom * tono, t)
  body.frequency.exponentialRampToValueAtTime(profile.bodyTo * tono, t + profile.bodyDecay * 0.7)
  const bodyGain = ctx.createGain()
  bodyGain.gain.setValueAtTime(0.0001, t)
  bodyGain.gain.exponentialRampToValueAtTime(gain * profile.bodyGain, t + profile.bodyAttack)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + profile.bodyDecay)
  body.connect(bodyGain).connect(out)
  body.start(t)
  body.stop(t + profile.bodyDecay + 0.02)
  body.onended = () => {
    body.disconnect()
    bodyGain.disconnect()
  }
}

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

/**
 * **La voz de un dispositivo** (vuelta 82).
 *
 * Desde esta vuelta es norma permanente: un dispositivo nace con su sonido y
 * su destello, decididos al construirlo. El porqué es el de siempre en este
 * juego — el oído no hay que apuntarlo a ninguna parte (vuelta 73), así que es
 * el único canal que dice que algo ha pasado **a tu espalda**, o a doce
 * unidades, o mientras miras otra cosa.
 *
 * Tres voces, y ninguna es otra con el volumen cambiado, que es la regla del
 * silbido de la vuelta 40:
 *
 * - **rebote**: un muelle. Lo que lo define es que el tono **sube**, al revés
 *   que el aterrizaje —que cae y ataca en 12 ms—, y que lleva una cola que se
 *   bambolea. Un golpe que sube se lee como impulso.
 * - **velocidad**: un soplo. Ruido por un pasa-banda que **sube** de 420 a
 *   2600 Hz en 190 ms, o sea justo al revés que el silbido de una bala (que
 *   cae de 4.2 kHz a 1.25), más un golpe grave que le da el empujón.
 * - **ventilador**: una corriente. Ruido ancho que sube y baja sin ataque de
 *   golpe y sin grave — lo contrario del soplo de una plataforma, que es un
 *   empujón. Y más bajo, porque suena cada pocas décimas mientras estés dentro.
 * - **hielo**: un raspado. Ruido estrecho **sin barrido de tono**, que es lo
 *   que lo separa de las otras tres — todas barren, y un derrape se arrastra.
 * - **puerta**: dos parciales **inarmónicos** cayendo. La relación es 2.37 —ni
 *   octava ni quinta, como el metal del disparo va en 1.48— porque una
 *   relación armónica suena a nota musical, y una puerta no es una nota.
 *
 * @param {'rebote'|'velocidad'|'ventilador'|'hielo'|'puerta'} tipo
 * @param {{input: AudioNode|null}} [emitter] emisor posicionado, si lo hay.
 *   Sin él suena en el máster, que es lo que vale en el entrenamiento.
 */
export function playDevice(tipo, emitter = null) {
  initAudio()
  if (!ctx || !master || !noiseBuffer) return
  const out = emitter?.input ?? master
  if (!out) return
  const t = ctx.currentTime
  const g = AUDIO.deviceVolume

  /** Cierra un nodo cuando acaba, que es lo que evita fugas por uso. */
  const soltar = (fuente, ...nodos) => {
    fuente.onended = () => {
      fuente.disconnect()
      for (const n of nodos) n.disconnect()
    }
  }

  if (tipo === 'rebote') {
    // El muelle: el tono **sube**, que es lo que lo separa del aterrizaje.
    const body = ctx.createOscillator()
    body.type = 'triangle'
    body.frequency.setValueAtTime(170, t)
    body.frequency.exponentialRampToValueAtTime(560, t + 0.09)
    body.frequency.exponentialRampToValueAtTime(380, t + 0.22)
    const bodyGain = ctx.createGain()
    bodyGain.gain.setValueAtTime(0.0001, t)
    bodyGain.gain.exponentialRampToValueAtTime(g * 0.9, t + 0.008)
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26)
    body.connect(bodyGain).connect(out)
    body.start(t)
    body.stop(t + 0.28)
    soltar(body, bodyGain)

    // Y el bamboleo de la cola: un segundo parcial desafinado a propósito.
    const wob = ctx.createOscillator()
    wob.type = 'sine'
    wob.frequency.setValueAtTime(840, t)
    wob.frequency.exponentialRampToValueAtTime(520, t + 0.2)
    const wobGain = ctx.createGain()
    wobGain.gain.setValueAtTime(0.0001, t)
    wobGain.gain.exponentialRampToValueAtTime(g * 0.3, t + 0.012)
    wobGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    wob.connect(wobGain).connect(out)
    wob.start(t)
    wob.stop(t + 0.22)
    soltar(wob, wobGain)
    return
  }

  if (tipo === 'velocidad') {
    // El soplo: ruido por un pasa-banda que **sube**, al revés que el silbido.
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.setValueAtTime(420, t)
    band.frequency.exponentialRampToValueAtTime(2600, t + 0.19)
    band.Q.value = 1.4
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.0001, t)
    noiseGain.gain.exponentialRampToValueAtTime(g * 0.85, t + 0.03)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24)
    noise.connect(band).connect(noiseGain).connect(out)
    noise.start(t)
    noise.stop(t + 0.26)
    soltar(noise, band, noiseGain)

    // El empujón: un grave corto, que es lo que se siente en el pecho.
    const thump = ctx.createOscillator()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(120, t)
    thump.frequency.exponentialRampToValueAtTime(58, t + 0.12)
    const thumpGain = ctx.createGain()
    thumpGain.gain.setValueAtTime(0.0001, t)
    thumpGain.gain.exponentialRampToValueAtTime(g * 0.7, t + 0.006)
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
    thump.connect(thumpGain).connect(out)
    thump.start(t)
    thump.stop(t + 0.16)
    soltar(thump, thumpGain)
    return
  }

  if (tipo === 'ventilador') {
    // La ráfaga: ruido ancho que **sube y baja**, sin ataque de golpe y sin
    // grave. Lo que la separa del soplo de una plataforma de velocidad es que
    // aquélla es un empujón —ataca en 30 ms y se va— y ésta es una corriente:
    // entra despacio, se queda y se va despacio. Y va más baja, porque suena
    // cada pocas décimas mientras estés dentro.
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.setValueAtTime(700, t)
    band.frequency.linearRampToValueAtTime(1500, t + 0.16)
    band.frequency.linearRampToValueAtTime(760, t + 0.34)
    band.Q.value = 0.9
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.0001, t)
    noiseGain.gain.exponentialRampToValueAtTime(g * 0.42, t + 0.12)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36)
    noise.connect(band).connect(noiseGain).connect(out)
    noise.start(t)
    noise.stop(t + 0.38)
    soltar(noise, band, noiseGain)
    return
  }

  if (tipo === 'hielo') {
    // El raspado: ruido estrecho y **sin subida ni bajada de tono**, que es lo
    // que lo separa de las otras tres voces —todas barren—. Un derrape no va a
    // ninguna parte, se arrastra. Y bajo, porque suena cada tres décimas.
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 2100
    band.Q.value = 2.4
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.0001, t)
    noiseGain.gain.exponentialRampToValueAtTime(g * 0.3, t + 0.05)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    noise.connect(band).connect(noiseGain).connect(out)
    noise.start(t)
    noise.stop(t + 0.32)
    soltar(noise, band, noiseGain)
    return
  }

  if (tipo === 'tirolina' || tipo === 'tirolina-viaje') {
    /**
     * **La polea**, y son dos sonidos con el mismo material (vuelta 83).
     *
     * Lo que suena es **metal rodando sobre metal**: dos parciales inarmónicos
     * —relación 1.48, la misma que la voz seca de un disparo usa para no sonar
     * a nota— más un siseo estrecho y agudo, que es el cable pasando. Ni sube
     * ni baja de tono: una polea no barre, traquetea.
     *
     * El **enganche** es el golpe seco de agarrarse, con su grave; el
     * **traqueteo** de ir viajando es el mismo sin grave, más corto y a un
     * tercio del volumen, porque suena cinco veces por segundo. Que sean la
     * misma voz con dos sobres es lo que hace que se oigan como la misma cosa.
     */
    const viaje = tipo === 'tirolina-viaje'
    const nivel = viaje ? 0.32 : 1
    const dur = viaje ? 0.1 : 0.26

    for (const [ratio, parte] of [[1, 0.5], [1.48, 0.3]]) {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = 1450 * ratio
      const oscGain = ctx.createGain()
      oscGain.gain.setValueAtTime(0.0001, t)
      oscGain.gain.exponentialRampToValueAtTime(g * parte * nivel, t + 0.004)
      oscGain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      osc.connect(oscGain).connect(out)
      osc.start(t)
      osc.stop(t + dur + 0.02)
      soltar(osc, oscGain)
    }

    // El cable pasando: ruido estrecho y arriba, sin barrido.
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 3400
    band.Q.value = 3
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.0001, t)
    noiseGain.gain.exponentialRampToValueAtTime(g * 0.35 * nivel, t + 0.006)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    noise.connect(band).connect(noiseGain).connect(out)
    noise.start(t)
    noise.stop(t + dur + 0.02)
    soltar(noise, band, noiseGain)

    // Y el grave del enganche, que el traqueteo no lleva: es lo que hace que
    // agarrarse se oiga como un suceso y viajar como un fondo.
    if (!viaje) {
      const thump = ctx.createOscillator()
      thump.type = 'sine'
      thump.frequency.setValueAtTime(190, t)
      thump.frequency.exponentialRampToValueAtTime(90, t + 0.1)
      const thumpGain = ctx.createGain()
      thumpGain.gain.setValueAtTime(0.0001, t)
      thumpGain.gain.exponentialRampToValueAtTime(g * 0.55, t + 0.005)
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
      thump.connect(thumpGain).connect(out)
      thump.start(t)
      thump.stop(t + 0.14)
      soltar(thump, thumpGain)
    }
    return
  }

  if (tipo === 'puerta') {
    // Dos parciales inarmónicos que caen: energía, no nota.
    for (const [ratio, nivel] of [[1, 0.6], [2.37, 0.34]]) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1180 * ratio, t)
      osc.frequency.exponentialRampToValueAtTime(300 * ratio, t + 0.3)
      const oscGain = ctx.createGain()
      oscGain.gain.setValueAtTime(0.0001, t)
      oscGain.gain.exponentialRampToValueAtTime(g * nivel, t + 0.01)
      oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
      osc.connect(oscGain).connect(out)
      osc.start(t)
      osc.stop(t + 0.34)
      soltar(osc, oscGain)
    }
    // Y el chispazo de la entrada, corto y arriba.
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 2200
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.0001, t)
    noiseGain.gain.exponentialRampToValueAtTime(g * 0.4, t + 0.005)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    noise.connect(hp).connect(noiseGain).connect(out)
    noise.start(t)
    noise.stop(t + 0.12)
    soltar(noise, hp, noiseGain)
  }
}
