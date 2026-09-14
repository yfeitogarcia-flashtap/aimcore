/**
 * Ajustes de partida: estado en memoria, validación y persistencia.
 *
 * Los valores por defecto y los rangos viven en `SETTINGS` (src/config.js);
 * aquí sólo se guardan, se validan y se avisa a quien escuche. Es un store
 * mínimo a propósito: no hay contexto de React de por medio porque el motor,
 * que no es React, también necesita leerlos.
 *
 * Todo lo que sale de `getSettings()` está ya acotado a su rango, así que
 * nadie más tiene que desconfiar de lo que hubiera en localStorage.
 */

import {
  DEATHMATCH_DURATIONS,
  ENEMY_DIFFICULTIES,
  LEGACY_WEAPON_KEYS,
  FRAME_LIMITS,
  SCENARIOS,
  PRIMARY_WEAPONS,
  SETTINGS,
  SIMULTANEOUS_TARGETS,
  TARGET_TYPES,
  WEAPONS,
} from './config.js'

const STORAGE_KEY = 'aimcore.settings.v1'

/** Nombres de los ajustes numéricos, los que tienen min/max/step. */
const NUMERIC_KEYS = Object.keys(SETTINGS).filter((key) => SETTINGS[key].min !== undefined)

/**
 * Ajustes que sólo aceptan una clave de un catálogo. El valor guardado se
 * comprueba contra él: cualquier otra cosa cae al valor por defecto.
 */
const CATALOGS = {
  scenario: SCENARIOS,
  deathmatchDuration: DEATHMATCH_DURATIONS,
  enemyDifficulty: ENEMY_DIFFICULTIES,
  targetType: TARGET_TYPES,
  // **El catálogo del arma es el de las principales, no el de todas.** La
  // pistola se lleva siempre y no se elige: un `weapon: 'pulse'` guardado de
  // antes de la vuelta 39 no es una opción válida y cae al valor de fábrica,
  // que es exactamente lo que hace el saneado con cualquier clave obsoleta.
  weapon: PRIMARY_WEAPONS,
  simultaneousTargets: SIMULTANEOUS_TARGETS,
  frameLimit: FRAME_LIMITS,
}

/** Nombres de los interruptores. Se deducen del tipo del valor por defecto. */
const BOOLEAN_KEYS = Object.keys(SETTINGS).filter(
  (key) => typeof SETTINGS[key].default === 'boolean',
)

/**
 * Ajustes que son **un booleano por arma** en vez de uno para el jugador. Lo
 * declara el propio ajuste (`perWeapon`), no se adivina por la forma del valor:
 * un mapa y un enumerado se parecen demasiado para distinguirlos a ojo.
 */
const PER_WEAPON_KEYS = Object.keys(SETTINGS).filter((key) => SETTINGS[key].perWeapon)

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value
}

/** Ajustes por defecto, recién salidos de config.js. */
export function defaultSettings() {
  const result = {}
  for (const key of Object.keys(SETTINGS)) {
    const value = SETTINGS[key].default
    // Los valores por defecto que son objetos se **copian**: si se entregara el
    // de `config.js` tal cual, todos los ajustes del juego compartirían el mismo
    // mapa y escribir en uno los cambiaría todos, incluido el de fábrica.
    result[key] = value !== null && typeof value === 'object' ? { ...value } : value
  }
  return result
}

/**
 * Devuelve una copia saneada: descarta claves desconocidas, tipos que no
 * cuadran y valores fuera de rango. localStorage es entrada no fiable —lo
 * edita cualquiera desde las devtools— y un NaN aquí rompería el muestreo de
 * posiciones en silencio.
 */
export function sanitizeSettings(raw) {
  const result = defaultSettings()
  if (!raw || typeof raw !== 'object') return result

  for (const key of NUMERIC_KEYS) {
    const value = Number(raw[key])
    if (Number.isFinite(value)) result[key] = clamp(value, SETTINGS[key].min, SETTINGS[key].max)
  }
  for (const key of BOOLEAN_KEYS) {
    if (typeof raw[key] === 'boolean') result[key] = raw[key]
  }
  for (const key of PER_WEAPON_KEYS) {
    const stored = raw[key]
    // **Lo guardado hasta la vuelta 42 era un solo booleano.** Un `true` de
    // entonces quería decir «llevo silenciador», así que se reparte entre las
    // armas que lo admiten en vez de tirarse: es la misma idea que
    // `LEGACY_WEAPON_KEYS` y `LEGACY_KEYBINDS`, un valor viejo que se traduce
    // en lugar de caer a fábrica sin explicación.
    if (typeof stored === 'boolean') {
      if (stored) {
        for (const weapon of Object.keys(result[key])) {
          result[key][weapon] = Boolean(WEAPONS[weapon]?.supportsSuppressor)
        }
      }
      continue
    }
    if (!stored || typeof stored !== 'object') continue
    for (const weapon of Object.keys(result[key])) {
      if (typeof stored[weapon] !== 'boolean') continue
      // Y un arma que no lo admite no puede tenerlo puesto por mucho que lo
      // diga localStorage: lo que manda es el dato del arma.
      result[key][weapon] = stored[weapon] && Boolean(WEAPONS[weapon]?.supportsSuppressor)
    }
  }
  for (const key of Object.keys(CATALOGS)) {
    // **Los renombrados se traducen antes de comprobar el catálogo.** Un ajuste
    // guardado con el nombre viejo de un arma no es un valor corrupto: es el
    // mismo arma con otro nombre, y tirarlo a fábrica sería cambiarle el arma a
    // quien ya la tenía elegida. Lo que no esté en la tabla sigue el camino de
    // siempre: si el catálogo no lo conoce, cae al valor por defecto.
    const value = key === 'weapon' ? LEGACY_WEAPON_KEYS[raw[key]] ?? raw[key] : raw[key]
    if (Object.prototype.hasOwnProperty.call(CATALOGS[key], value)) result[key] = value
  }
  return result
}

function load() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return sanitizeSettings(stored ? JSON.parse(stored) : null)
  } catch {
    // localStorage puede estar bloqueado (modo incógnito, cookies de terceros)
    // y el JSON guardado puede estar corrupto. En ambos casos, valores por
    // defecto: el prototipo tiene que arrancar igual.
    return defaultSettings()
  }
}

let current = load()
const listeners = new Set()

/** Los ajustes vigentes. Trátalo como inmutable: usa `updateSettings`. */
export function getSettings() {
  return current
}

/**
 * Aplica un parche y avisa a los suscriptores.
 * @param {Partial<ReturnType<typeof defaultSettings>>} patch
 */
export function updateSettings(patch) {
  const next = sanitizeSettings({ ...current, ...patch })

  // Cambiar de tipo de diana arrastra su distancia base: el hitbox tiene que
  // salir más lejos que la esfera. El slider sigue mandando después.
  if (patch.targetType !== undefined && patch.targetType !== current.targetType) {
    if (patch.spawnDistance === undefined) {
      next.spawnDistance = clamp(
        TARGET_TYPES[next.targetType].defaultDistance,
        SETTINGS.spawnDistance.min,
        SETTINGS.spawnDistance.max,
      )
    }
  }

  current = next
  save()
  for (const listener of listeners) listener(current)
  return current
}

/** Vuelve a los valores de config.js y borra lo guardado. */
export function resetSettings() {
  current = defaultSettings()
  save()
  for (const listener of listeners) listener(current)
  return current
}

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Sin persistencia se juega igual; sólo se pierde al recargar.
  }
}

/**
 * Escucha cambios. Devuelve la función para dejar de escuchar.
 * @param {(settings: ReturnType<typeof defaultSettings>) => void} listener
 */
export function subscribeSettings(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
