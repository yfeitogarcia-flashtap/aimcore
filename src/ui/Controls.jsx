import { useEffect, useState } from 'react'
import { KEYBINDS } from '../config.js'
import { captureConflict, eventCode, keyLabel, keysOf, resetKeybind, setKeybind } from '../keybinds.js'

/**
 * Sección de **Controles** del panel de opciones: qué tecla hace qué, y cómo
 * cambiarla.
 *
 * Reasignar es capturar la siguiente pulsación, sin campos de texto ni listas
 * desplegables: se pulsa el botón, se pulsa la tecla, ya está. Mientras se
 * captura, los eventos se atrapan **en fase de captura y con
 * `preventDefault`**, para que la tecla no dispare de paso lo que tuviera
 * asignado — reasignar «saltar» no debe hacer saltar.
 *
 * Lo que se rechaza lo decide `keybinds.js` (modificadores, teclas del
 * navegador, duplicados) y aquí sólo se enseña el motivo tal cual viene: dos
 * listas de reglas, una en el store y otra en la interfaz, se separan el día que
 * alguien toque una sola.
 */

/** Las acciones agrupadas como las declara `KEYBINDS`, en su orden. */
function groupActions() {
  const groups = new Map()
  for (const action of Object.keys(KEYBINDS)) {
    const group = KEYBINDS[action].group
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(action)
  }
  return [...groups.entries()]
}

const GROUPS = groupActions()

function KeybindRow({ action, binds, capturing, onCapture, onCancel, error }) {
  const spec = KEYBINDS[action]
  const code = binds[action]
  const extra = spec.extra ?? []
  const atDefault = code === spec.default

  return (
    <div className={`bind${capturing ? ' bind--capturing' : ''}`}>
      <span className="bind__label">
        {spec.label}
        {spec.reserved ? <span className="bind__tag">sin efecto todavía</span> : null}
        {spec.contextual ? <span className="bind__tag">contextual</span> : null}
      </span>

      <div className="bind__keys">
        {extra.length > 0 ? (
          <span className="bind__extra">o {extra.map(keyLabel).join(' · ')}</span>
        ) : null}
        <button
          type="button"
          className="bind__key"
          aria-pressed={capturing}
          onClick={() => (capturing ? onCancel() : onCapture(action))}
        >
          {capturing ? 'pulsa una tecla…' : keyLabel(code)}
        </button>
        <button
          type="button"
          className="field__default"
          disabled={atDefault}
          title={`Devuelve «${spec.label}» a ${keyLabel(spec.default)}`}
          onClick={() => resetKeybind(action)}
        >
          por defecto
        </button>
      </div>

      {error ? <span className="bind__error">{error}</span> : null}
    </div>
  )
}

export default function Controls({ binds }) {
  const [capturing, setCapturing] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!capturing) return undefined
    const finish = (event) => {
      // En captura, **todo** se para aquí: si el evento siguiera su camino, la
      // tecla haría además lo que tuviera asignado, y el click del ratón
      // reasignando «disparar» capturaría el puntero de paso.
      event.preventDefault()
      event.stopPropagation()
      const code = eventCode(event)
      if (code === 'Escape') {
        setCapturing(null)
        setError(null)
        return
      }
      const conflict = captureConflict(capturing, event, binds)
      if (conflict) {
        setError(conflict)
        return
      }
      setError(setKeybind(capturing, code))
      setCapturing(null)
    }
    // Fase de captura: llega antes que los manejadores del motor, que escuchan
    // en la ventana.
    window.addEventListener('keydown', finish, true)
    window.addEventListener('mousedown', finish, true)
    return () => {
      window.removeEventListener('keydown', finish, true)
      window.removeEventListener('mousedown', finish, true)
    }
  }, [capturing, binds])

  return (
    <div className="field">
      <span className="field__label">Controles</span>

      {GROUPS.map(([group, actions]) => (
        <div className="binds" key={group}>
          <span className="binds__group">{group}</span>
          {actions.map((action) => (
            <KeybindRow
              key={action}
              action={action}
              binds={binds}
              capturing={capturing === action}
              error={capturing === action ? error : null}
              onCapture={(next) => {
                setError(null)
                setCapturing(next)
              }}
              onCancel={() => {
                setCapturing(null)
                setError(null)
              }}
            />
          ))}
        </div>
      ))}

      <span className="field__hint">
        Dos acciones no pueden compartir tecla, y nada se puede asignar a Ctrl,
        Alt o Meta: <strong>Ctrl+W cierra la pestaña</strong> y el navegador no
        deja impedirlo. <strong>Escape</strong> pausa y no es reasignable.
      </span>
    </div>
  )
}

/** Lo usa el panel para saber si una acción se quedó sin tecla. */
export function unboundActions(binds) {
  return Object.keys(KEYBINDS).filter((action) => keysOf(action, binds).length === 0)
}
