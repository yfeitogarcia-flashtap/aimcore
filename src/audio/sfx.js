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
 *   golpe grave que cae— y la llevan las armas que todavía no tienen voz propia.
 * - `seca` es la de la Rift: tres capas que atacan a la vez, ninguna sostenida.
 *
 * **Un arma elige su voz por su clave**, igual que elige su silueta: `rift` y
 * `rift.s`. Lo que no tenga entrada cae a `normal` / `suppressed`, que es lo que
 * hace que añadir una voz nueva sea añadir una clave y no tocar `playShot`.
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
 * clásica de siempre, que es lo que llevan hoy la Pulse y la Volt.
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
