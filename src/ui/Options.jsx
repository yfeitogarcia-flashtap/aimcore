import { useState } from 'react'
import {
  FRAME_LIMITS,
  SCENARIOS,
  SETTINGS,
  SIMULTANEOUS_TARGETS,
  TARGET_TYPES,
  WEAPONS,
} from '../config.js'

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

const FIRE_MODES = { semi: 'Semiautomática', auto: 'Automática' }

/** Ficha corta del arma: modo, cadencia y carácter del retroceso. */
function weaponHint(weaponKey) {
  const weapon = WEAPONS[weaponKey]
  return `${FIRE_MODES[weapon.mode]} · ${weapon.rpm} RPM · ${weapon.character}`
}

/** Explica en qué ejes se mueve el tipo de diana elegido. */
function scenarioHint(scenario) {
  return scenario === 'empty'
    ? 'Sala vacía: las dianas salen por muestreo dentro del cono de siempre.'
    : 'Con cobertura: las dianas salen en anclajes fijos y sólo si los ves. El modo dinámico y la distancia de aparición no se aplican aquí.'
}

function dynamicHint(targetType) {
  return TARGET_TYPES[targetType].anchor === 'feet'
    ? 'Las dianas se desplazan por el suelo, sin cambiar de altura.'
    : 'Las dianas se desplazan por todo su volumen de aparición.'
}

/** Fila de opciones excluyentes, con la etiqueta de cada una del catálogo. */
function SegmentedRow({ spec, catalog, value, onChange, hint }) {
  return (
    <div className="field">
      <span className="field__label">{spec.label}</span>
      <div className="segmented">
        {Object.keys(catalog).map((key) => (
          <button
            key={key}
            type="button"
            className="segmented__option"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            {catalog[key].label}
          </button>
        ))}
      </div>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  )
}

/** Fila de interruptor on/off con su explicación al lado. */
function ToggleRow({ spec, value, onChange, hint }) {
  return (
    <div className="field">
      <span className="field__label">{spec.label}</span>
      <div className="field__control">
        <button type="button" className="toggle" aria-pressed={value} onClick={() => onChange(!value)}>
          {value ? 'Activado' : 'Desactivado'}
        </button>
        <span className="field__hint">{hint}</span>
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

      <SegmentedRow
        spec={SETTINGS.scenario}
        catalog={SCENARIOS}
        value={settings.scenario}
        onChange={(scenario) => onChange({ scenario })}
        hint={scenarioHint(settings.scenario)}
      />

      <SegmentedRow
        spec={SETTINGS.targetType}
        catalog={TARGET_TYPES}
        value={settings.targetType}
        onChange={(targetType) => onChange({ targetType })}
      />

      <div className="field">
        <label className="field__label" htmlFor="opt-weapon">
          {SETTINGS.weapon.label}
        </label>
        <div className="field__control">
          <select
            id="opt-weapon"
            className="field__select"
            value={settings.weapon}
            onChange={(event) => onChange({ weapon: event.target.value })}
          >
            {Object.keys(WEAPONS).map((key) => (
              <option key={key} value={key}>
                {WEAPONS[key].label}
              </option>
            ))}
          </select>
          <span className="field__hint">{weaponHint(settings.weapon)}</span>
        </div>
      </div>

      {WEAPONS[settings.weapon].supportsSuppressor ? (
        <ToggleRow
          spec={SETTINGS.suppressor}
          value={settings.suppressor}
          onChange={(suppressor) => onChange({ suppressor })}
          hint={
            settings.suppressor
              ? 'Disparo más apagado. No cambia daño, retroceso ni cadencia.'
              : 'Sonido de disparo normal.'
          }
        />
      ) : (
        <div className="field">
          <span className="field__label">{SETTINGS.suppressor.label}</span>
          <span className="field__hint">
            {WEAPONS[settings.weapon].label} no admite silenciador.
          </span>
        </div>
      )}

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

      <SegmentedRow
        spec={SETTINGS.simultaneousTargets}
        catalog={SIMULTANEOUS_TARGETS}
        value={settings.simultaneousTargets}
        onChange={(simultaneousTargets) => onChange({ simultaneousTargets })}
        hint={
          settings.simultaneousTargets === 'x1'
            ? 'Una sola diana viva: la siguiente espera a que caiga la actual.'
            : `Hasta ${SIMULTANEOUS_TARGETS[settings.simultaneousTargets].count} dianas a la vez, saliendo al ritmo de la cadencia.`
        }
      />

      <ToggleRow
        spec={SETTINGS.dynamic}
        value={settings.dynamic}
        onChange={(dynamic) => onChange({ dynamic })}
        hint={
          settings.dynamic
            ? dynamicHint(settings.targetType)
            : 'Las dianas se quedan quietas donde aparecen.'
        }
      />

      <SegmentedRow
        spec={SETTINGS.frameLimit}
        catalog={FRAME_LIMITS}
        value={settings.frameLimit}
        onChange={(frameLimit) => onChange({ frameLimit })}
        hint={
          FRAME_LIMITS[settings.frameLimit].fps > 0
            ? 'El juego se actualiza a ese ritmo aunque el monitor vaya más rápido.'
            : 'Al ritmo del monitor, sin limitar.'
        }
      />

      <ToggleRow
        spec={SETTINGS.helpMessages}
        value={settings.helpMessages}
        onChange={(helpMessages) => onChange({ helpMessages })}
        hint={
          settings.helpMessages
            ? 'Avisos breves en el HUD, como el de recargar al quedarte corto.'
            : 'Sin avisos: el HUD sólo muestra los contadores.'
        }
      />

      <div className="panel__actions">
        <button type="button" className="button button--primary" onClick={onClose} autoFocus>
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
