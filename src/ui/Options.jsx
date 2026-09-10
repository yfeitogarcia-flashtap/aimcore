import { useState } from 'react'
import { SETTINGS, TARGET_TYPES } from '../config.js'

/**
 * Panel de opciones. Se abre antes de empezar y también desde la pausa.
 *
 * No guarda estado propio: escribe en el store de ajustes (src/settings.js) y
 * lo que se ve viene de vuelta desde ahí, así que el slider, el campo numérico
 * y lo que aplica el motor no pueden desincronizarse. La única excepción es el
 * borrador del campo numérico, que necesita dejar escribir valores a medias.
 */

/** Campo numérico enlazado al mismo valor que su slider. */
function NumberField({ spec, value, onCommit }) {
  // Mientras se escribe mandamos el borrador; `null` significa "muestra el
  // valor real". Sin esto, teclear "0." en un campo con mínimo 0.1 se acotaría
  // a mitad de pulsación y sería imposible escribir.
  const [draft, setDraft] = useState(null)

  return (
    <input
      type="number"
      className="field__number"
      min={spec.min}
      max={spec.max}
      step={spec.step}
      value={draft ?? value.toFixed(spec.decimals)}
      onChange={(event) => {
        setDraft(event.target.value)
        const parsed = Number(event.target.value)
        if (Number.isFinite(parsed) && parsed >= spec.min && parsed <= spec.max) onCommit(parsed)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

/** Fila con etiqueta, slider y lectura del valor (o campo editable). */
function SliderRow({ id, spec, value, onChange, suffix = '', editable = false }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {spec.label}
      </label>
      <div className="field__control">
        <input
          id={id}
          type="range"
          className="field__range"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {editable ? (
          <NumberField spec={spec} value={value} onCommit={onChange} />
        ) : (
          <span className="field__value">
            {value.toFixed(spec.decimals)}
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

export default function Options({ settings, onChange, onReset, onClose }) {
  return (
    <div className="panel panel--options" onMouseDown={(event) => event.stopPropagation()}>
      <h2 className="panel__title panel__title--small">Opciones</h2>

      <SliderRow
        id="opt-sensitivity"
        spec={SETTINGS.sensitivity}
        value={settings.sensitivity}
        onChange={(sensitivity) => onChange({ sensitivity })}
        editable
      />

      <div className="field">
        <span className="field__label">{SETTINGS.targetType.label}</span>
        <div className="segmented">
          {Object.keys(TARGET_TYPES).map((key) => (
            <button
              key={key}
              type="button"
              className="segmented__option"
              aria-pressed={settings.targetType === key}
              onClick={() => onChange({ targetType: key })}
            >
              {TARGET_TYPES[key].label}
            </button>
          ))}
        </div>
      </div>

      <SliderRow
        id="opt-radius"
        spec={SETTINGS.targetRadius}
        value={settings.targetRadius}
        onChange={(targetRadius) => onChange({ targetRadius })}
      />

      <SliderRow
        id="opt-distance"
        spec={SETTINGS.spawnDistance}
        value={settings.spawnDistance}
        onChange={(spawnDistance) => onChange({ spawnDistance })}
      />

      <SliderRow
        id="opt-cadence"
        spec={SETTINGS.spawnIntervalMs}
        value={settings.spawnIntervalMs}
        onChange={(spawnIntervalMs) => onChange({ spawnIntervalMs })}
        suffix=" ms"
      />

      <div className="field">
        <span className="field__label">{SETTINGS.accumulative.label}</span>
        <div className="field__control">
          <button
            type="button"
            className="toggle"
            aria-pressed={settings.accumulative}
            onClick={() => onChange({ accumulative: !settings.accumulative })}
          >
            {settings.accumulative ? 'Activado' : 'Desactivado'}
          </button>
          <span className="field__hint">
            {settings.accumulative
              ? 'Sale una diana nueva cada intervalo aunque las anteriores sigan en pie.'
              : 'Una sola diana viva: la siguiente espera a que caiga la actual.'}
          </span>
        </div>
      </div>

      <div className="panel__actions">
        <button type="button" className="button" onClick={onClose} autoFocus>
          Volver
        </button>
        <button type="button" className="button button--quiet" onClick={onReset}>
          Restablecer
        </button>
      </div>
      <p className="panel__hint">Los ajustes se guardan en este navegador.</p>
    </div>
  )
}
