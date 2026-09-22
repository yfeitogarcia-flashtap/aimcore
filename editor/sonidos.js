/**
 * **El banco de voces** (vuelta 91): oír cada arma y sus alternativas antes de
 * decidir.
 *
 * Nació de un encargo concreto: «queremos poder escuchar variantes de los
 * sonidos de disparo de cada arma antes de decidir si sustituimos los
 * actuales», con el objetivo de que cada una tenga **relación temática con lo
 * que representa** y no sólo «más agresiva».
 *
 * Tres cosas que son el diseño y conviene no perder:
 *
 * - **Vive en `editor/`, así que no entra en `dist/`.** Es una herramienta, no
 *   una pantalla del juego: la misma regla que el editor de mapas desde la
 *   vuelta 74. Se llega por `/editor/sonidos.html` con `npm run dev`.
 * - **Las alternativas viven aquí y no en el catálogo.** `SHOT_PROFILES` es lo
 *   que suena en el juego; una variante que se está valorando no puede estar
 *   ahí, porque entonces ya se habría decidido. Cuando una gane, se copia su
 *   caja de texto a `src/audio/sfx.js` y esta entrada se borra.
 * - **Y la caja de texto toca lo que pone**, no una aproximación: es el mismo
 *   objeto que `playPerfil` recibe. Así afinar un número es cambiarlo y volver
 *   a pulsar, sin recargar y sin tocar el juego.
 */
import { WEAPONS } from '../src/config.js'
import { SHOT_PROFILES, audioContextDePrueba, initAudio, masterDePrueba, playPerfil } from '../src/audio/sfx.js'
// **El disparo del juego entra por `samples.js`**, no por `sfx.js`, y aquí se
// llama por ese camino a propósito: «Actual» tiene que sonar exactamente como
// suena jugando, decida lo que decida el carril de muestras (vuelta 63).
import { playWeaponShot } from '../src/audio/samples.js'

/** Las que disparan un rayo: las de proyectil tienen su propia voz aparte. */
const CON_VOZ = Object.keys(WEAPONS).filter((k) => !WEAPONS[k].tiro && !WEAPONS[k].melee)

/**
 * **Las variantes que hay sobre la mesa**, por arma. Dos por arma como mucho:
 * con tres ya no se compara, se hojea.
 *
 * Cada una parte del perfil actual y **cambia una idea**, no un puñado de
 * números sueltos — así lo que se elige es una dirección y no una mezcla.
 */
const VARIANTES = {
  pulse: {
    'más seca': { crackDecay: 0.012, bodyGain: 0.24, bodyDecay: 0.016, metalDecay: 0.035 },
    'con cuerpo': { crackHz: 2700, crackGain: 0.7, bodyGain: 0.6, bodyDecay: 0.03 },
  },
  reaper: {
    'más grave': { bodyFrom: 120, bodyTo: 42, bodyDecay: 0.08, metalHz: 760, metalTo: 340 },
    'más seco': { bodyDecay: 0.04, metalDecay: 0.04, crackGain: 0.5, crackDecay: 0.015 },
  },
  volt: {
    'aún más corta': { crackDecay: 0.01, metalDecay: 0.03, bodyDecay: 0.014 },
    'con más metal': { metalGain: 0.62, metalDrive: 4.4, metalRatio: 1.62 },
  },
  rift: {
    'más peso': { bodyFrom: 84, bodyGain: 0.75, bodyDecay: 0.045 },
    'más metálica': { metalGain: 0.66, metalDrive: 4.8, metalBandHz: 3100 },
  },
  scout: {
    'sin cola': { crackDecay: 0.022, metalDecay: 0.04 },
    'cerrojo antes': { mecaDelay: 0.028, mecaGain: 0.4 },
  },
  titan: {
    'más largo': { bodyDecay: 0.12, metalDecay: 0.12, mecaDelay: 0.1 },
    'más agudo': { crackHz: 3000, metalHz: 820, metalTo: 380, bodyFrom: 96 },
  },
  pump: {
    'más ancha': { crackQ: 0.25, crackHz: 750, crackDecay: 0.06 },
    'corredera tarde': { mecaDelay: 0.3, mecaGain: 0.5 },
  },
}

/**
 * **El contexto de audio no arranca sin un gesto** (vuelta 60), y `resume()`
 * es asíncrono: se espera al gesto y ya, porque aquí no hay nada que se pierda
 * por sonar un pelo tarde.
 */
let arrancado = false
const arrancar = () => {
  if (arrancado) return
  arrancado = true
  initAudio()
  document.getElementById('aviso').textContent =
    'Audio en marcha. «Actual» toca lo que suena hoy en el juego; «Editada» toca lo que ponga la caja.'
}
addEventListener('pointerdown', arrancar, { once: true })
addEventListener('keydown', arrancar, { once: true })

/**
 * **El asa del banco**, como `window.vektorNet` en el duelo y
 * `window.vektorEditor` en el editor. Un banco que importa los módulos por su
 * cuenta puede acabar con **otra instancia** del módulo —pasó midiendo esto: el
 * `import()` desde `evaluate` devolvía un `ctx` en `null` mientras la página
 * tenía el suyo en marcha— y entonces lo que mide no es lo que suena.
 */
window.vektorVoces = {
  perfiles: SHOT_PROFILES,
  armas: CON_VOZ,
  ctx: audioContextDePrueba,
  master: masterDePrueba,
  tocar: (clave, sil = false) => playWeaponShot(clave, sil),
  tocarPerfil: playPerfil,
}

const lista = document.getElementById('lista')

for (const clave of CON_VOZ) {
  const arma = WEAPONS[clave]
  const perfil = SHOT_PROFILES[clave] ?? SHOT_PROFILES.normal
  const propia = Boolean(SHOT_PROFILES[clave])

  const caja = document.createElement('section')
  caja.className = 'arma'

  const cab = document.createElement('header')
  const h2 = document.createElement('h2')
  h2.textContent = arma.label ?? clave
  const meta = document.createElement('span')
  meta.className = 'meta'
  meta.textContent = `${arma.character ?? '—'} · ${arma.rpm} RPM · voz ${propia ? `propia (${perfil.voz})` : 'heredada (clásica)'}`
  cab.append(h2, meta)

  const fila = document.createElement('div')
  fila.className = 'fila'

  const editable = document.createElement('textarea')
  editable.value = JSON.stringify(perfil, null, 2)
  editable.spellcheck = false

  /** Toca el arma tal cual la toca el juego, por su clave y no por su perfil. */
  const boton = (texto, alPulsar, actual = false) => {
    const b = document.createElement('button')
    b.textContent = texto
    if (actual) b.className = 'actual'
    b.addEventListener('click', () => { arrancar(); alPulsar() })
    fila.append(b)
    return b
  }

  boton('Actual', () => playWeaponShot(clave, false), true)
  if (arma.supportsSuppressor) boton('Actual · silenciada', () => playWeaponShot(clave, true))

  for (const [nombre, cambios] of Object.entries(VARIANTES[clave] ?? {})) {
    boton(nombre, () => playPerfil({ ...perfil, ...cambios }))
  }

  boton('Editada', () => {
    try {
      const p = JSON.parse(editable.value)
      editable.classList.remove('malo')
      playPerfil(p)
    } catch {
      // **Un JSON roto se dice, no se traga.** Es la regla de la vuelta 60 en
      // pequeño: un botón que no hace nada es indistinguible de un sonido
      // mudo, y aquí lo que se está juzgando es precisamente si se oye algo.
      editable.classList.add('malo')
    }
  })

  boton('Volver al actual', () => {
    editable.value = JSON.stringify(perfil, null, 2)
    editable.classList.remove('malo')
  })

  caja.append(cab, fila, editable)
  lista.append(caja)
}
