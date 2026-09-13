/**
 * Asignación de teclas: estado en memoria, saneado y persistencia.
 *
 * Hermano de `settings.js` y con la misma filosofía —lo que sale de aquí ya está
 * validado, así que nadie más tiene que desconfiar de localStorage— pero con su
 * propio almacén: los ajustes son escalares sueltos y esto es un mapa de acción
 * a tecla con **una invariante que mantener**, y mezclarlos habría convertido
 * `sanitizeSettings` en dos funciones dentro de una.
 *
 * La invariante: **dos acciones nunca comparten tecla.** No se garantiza
 * comprobándolo al asignar —eso deja la puerta abierta a que llegue por
 * localStorage— sino saneando: lo guardado se recorre en orden y lo que choca
 * cae a su valor por defecto; si el valor por defecto también está cogido, la
 * acción se queda **sin asignar** antes que duplicada. El panel lo enseña y el
 * botón de restablecer lo arregla.
 *
 * Y lo que no entra jamás, venga de donde venga: Escape y las teclas del
 * navegador (`FORBIDDEN_KEYS`), los modificadores y cualquier cosa que no tenga
 * pinta de código de tecla. **Ctrl no es una preferencia**: Ctrl+W cierra la
 * pestaña y el navegador lo resuelve antes que la página (`docs/decisions.md`
 * §27), así que ninguna acción puede acabar ahí ni editando el almacenamiento a
 * mano.
 */

import { FORBIDDEN_KEYS, KEYBINDS } from './config.js'

const STORAGE_KEY = 'aimcore.keybinds.v1'

const ACTIONS = Object.keys(KEYBINDS)
const FORBIDDEN = new Set(FORBIDDEN_KEYS)

/**
 * Formas de código que se aceptan. `KeyboardEvent.code` es un catálogo cerrado y
 * esto es lo que se usa de él; cualquier otra cosa en localStorage es basura o
 * un intento de colar algo raro.
 */
const CODE_PATTERN = /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|F[1-9]|F1[0-2]|Arrow(Up|Down|Left|Right)|Space|Enter|Backspace|Minus|Equal|BracketLeft|BracketRight|Semicolon|Quote|Backquote|Comma|Period|Slash|Backslash|Shift(Left|Right)|Mouse[0-4])$/

/** Un modificador no puede ser una acción, ni suelto ni acompañado. */
export function isModifierCode(code) {
  return typeof code === 'string' && /^(Control|Alt|Meta|OS)/.test(code)
}

/** ¿Este código se puede asignar a algo? */
export function isAssignable(code) {
  if (typeof code !== 'string') return false
  if (FORBIDDEN.has(code) || isModifierCode(code)) return false
  return CODE_PATTERN.test(code)
}

/** Binds por defecto, recién salidos de config.js. */
export function defaultKeybinds() {
  const result = {}
  for (const action of ACTIONS) result[action] = KEYBINDS[action].default
  return result
}

/** Todas las teclas que ocupa una acción: la asignada y sus alternativas fijas. */
export function keysOf(action, binds) {
  const extra = KEYBINDS[action].extra ?? []
  const bound = binds[action]
  return bound ? [bound, ...extra] : [...extra]
}

/**
 * Copia saneada: sólo códigos asignables, sin duplicados y sin pisar las
 * alternativas fijas de otra acción. Lo que no cuadra cae al valor por defecto;
 * si ése también está ocupado, la acción se queda sin asignar (`null`).
 */
export function sanitizeKeybinds(raw) {
  const result = {}
  const taken = new Set()
  // Las alternativas fijas se reservan antes que nada: son del juego, no del
  // jugador, y no se pueden perder por lo que haya guardado.
  for (const action of ACTIONS) {
    for (const code of KEYBINDS[action].extra ?? []) taken.add(code)
  }

  const source = raw && typeof raw === 'object' ? raw : {}
  for (const action of ACTIONS) {
    const stored = source[action]
    const fallback = KEYBINDS[action].default
    const candidate = isAssignable(stored) && !taken.has(stored) ? stored : null
    if (candidate) {
      result[action] = candidate
      taken.add(candidate)
      continue
    }
    // El valor por defecto sólo se puede usar si nadie se le ha adelantado.
    if (!taken.has(fallback)) {
      result[action] = fallback
      taken.add(fallback)
    } else {
      result[action] = null
    }
  }
  return result
}

/**
 * Qué impide asignar esta tecla a esta acción, o `null` si se puede.
 * Devuelve el motivo ya redactado: lo enseña el panel tal cual.
 */
export function bindConflict(action, code, binds) {
  if (isModifierCode(code)) {
    return 'Ninguna acción puede ir en Ctrl, Alt o Meta.'
  }
  if (FORBIDDEN.has(code)) {
    return code === 'Escape'
      ? 'Escape es la pausa y no se puede reasignar.'
      : 'Esa tecla se la queda el navegador.'
  }
  if (!isAssignable(code)) return 'Esa tecla no se puede asignar.'
  for (const other of ACTIONS) {
    if (other === action) continue
    if (keysOf(other, binds).includes(code)) {
      return `Ya la usa «${KEYBINDS[other].label}».`
    }
  }
  // Las alternativas fijas de la propia acción tampoco valen como principal:
  // se quedaría con la misma tecla dos veces y el panel enseñaría un duplicado
  // que no lo es.
  if ((KEYBINDS[action].extra ?? []).includes(code)) {
    return 'Esa tecla ya vale para esta acción.'
  }
  return null
}

/**
 * Lo mismo, pero sobre el **evento** en vez de sobre el código: además de lo que
 * mira `bindConflict`, rechaza cualquier **combinación**.
 *
 * Hace falta como regla aparte porque el código de tecla no la delata: pulsar
 * Ctrl+Z manda `KeyZ`, que es perfectamente asignable, y quien lo pulsó no
 * quería asignar Z. Y porque el caso que importa es el que ya cerró una pestaña:
 * con el bind en Z, agacharse mientras se pulsa Ctrl sería Ctrl+Z; con W, Ctrl+W.
 *
 * Shift se deja pasar cuando **es** la tecla —`walk` vive ahí de fábrica—, pero
 * no como acompañante: Shift+W manda `KeyW` y se quedaría con la W a secas.
 */
export function captureConflict(action, event, binds) {
  const code = eventCode(event)
  if (event.ctrlKey || event.metaKey) {
    return 'Nada de combinaciones con Ctrl: Ctrl+W cierra la pestaña y el navegador no deja impedirlo.'
  }
  if (event.altKey) return 'Nada de combinaciones con Alt.'
  if (event.shiftKey && !code.startsWith('Shift')) return 'Nada de combinaciones con Mayús.'
  return bindConflict(action, code, binds)
}

function load() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return sanitizeKeybinds(stored ? JSON.parse(stored) : null)
  } catch {
    // localStorage bloqueado o JSON corrupto: se juega con los de fábrica.
    return defaultKeybinds()
  }
}

let current = load()
const listeners = new Set()

/** Los binds vigentes. Inmutable: usa `setKeybind` o `resetKeybinds`. */
export function getKeybinds() {
  return current
}

/**
 * Asigna una tecla a una acción. Devuelve el motivo del rechazo, o `null` si se
 * aplicó — el panel lo enseña sin traducir nada.
 */
export function setKeybind(action, code) {
  if (!Object.prototype.hasOwnProperty.call(KEYBINDS, action)) return 'Acción desconocida.'
  const conflict = bindConflict(action, code, current)
  if (conflict) return conflict
  current = sanitizeKeybinds({ ...current, [action]: code })
  save()
  publish()
  return null
}

/** Devuelve una acción a su tecla de fábrica. */
export function resetKeybind(action) {
  const fallback = KEYBINDS[action]?.default
  if (!fallback) return
  // Si la de fábrica la tiene otra acción, esa otra se queda sin asignar: el
  // que pide restablecer gana, y el panel enseña el hueco.
  const next = { ...current }
  for (const other of ACTIONS) {
    if (other !== action && next[other] === fallback) next[other] = null
  }
  next[action] = fallback
  current = sanitizeKeybinds(next)
  save()
  publish()
}

/** Todas las acciones a sus teclas de fábrica. */
export function resetKeybinds() {
  current = defaultKeybinds()
  save()
  publish()
  return current
}

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Sin persistencia se juega igual; sólo se pierde al recargar.
  }
}

function publish() {
  for (const listener of listeners) listener(current)
}

/** Escucha cambios. Devuelve la función para dejar de escuchar. */
export function subscribeKeybinds(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Nombres de tecla para enseñar, no para comparar. */
const LABELS = {
  Space: 'ESPACIO',
  ShiftLeft: 'MAYÚS IZQ',
  ShiftRight: 'MAYÚS DER',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: 'INTRO',
  Backspace: 'RETROCESO',
  Minus: '−',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Mouse0: 'CLIC IZQ',
  Mouse1: 'CLIC RUEDA',
  Mouse2: 'CLIC DER',
  Mouse3: 'RATÓN 4',
  Mouse4: 'RATÓN 5',
}

/** @returns {string} el nombre legible de un código de tecla. */
export function keyLabel(code) {
  if (!code) return 'sin asignar'
  if (LABELS[code]) return LABELS[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return `NUM ${code.slice(6)}`
  return code
}

/**
 * El código de un evento, sea de teclado o de ratón, en el mismo vocabulario
 * que los binds. Un solo sitio que traduzca eventos a códigos: si el ratón se
 * tradujera en el panel y en el motor por separado, un día dejarían de coincidir.
 */
export function eventCode(event) {
  return typeof event.button === 'number' && event.type.startsWith('mouse')
    ? `Mouse${event.button}`
    : event.code
}
