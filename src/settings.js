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

import { SETTINGS, TARGET_TYPES } from './config.js'

const STORAGE_KEY = 'aimcore.settings.v1'

/** Nombres de los ajustes numéricos, los que tienen min/max/step. */
const NUMERIC_KEYS = Object.keys(SETTINGS).filter((key) => SETTINGS[key].min !== undefined)

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value
}

/** Ajustes por defecto, recién salidos de config.js. */
export function defaultSettings() {
  const result = {}
  for (const key of Object.keys(SETTINGS)) result[key] = SETTINGS[key].default
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
  if (typeof raw.accumulative === 'boolean') result.accumulative = raw.accumulative
  if (Object.prototype.hasOwnProperty.call(TARGET_TYPES, raw.targetType)) {
    result.targetType = raw.targetType
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
