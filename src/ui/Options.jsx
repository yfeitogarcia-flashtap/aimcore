import { useState } from 'react'
import Controls from './Controls.jsx'
import ScenarioThumbnail from './ScenarioThumbnail.jsx'
import {
  ENEMY_DIFFICULTIES,
  FRAME_LIMITS,
  MOVEMENT,
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
 *
 * Cada fila se identifica por la **clave del ajuste**, no por su descriptor: de
 * la clave salen la etiqueta, el rango, el valor de fábrica y el parche que se
 * escribe en el store. Con el descriptor suelto había que repetir el nombre del
 * ajuste en cada llamada —una vez en `spec` y otra en el `onChange`—, que es
 * justo la duplicación por la que un botón de restablecer podía apuntar a un
 * ajuste distinto del que enseña la fila.
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

/**
 * Devuelve un solo ajuste a su valor de fábrica.
 *
 * Va en todas las filas porque el botón general del final es todo o nada:
 * trastear con la sensibilidad y querer volver atrás no debería costar también
 * el escenario, el arma y la cadencia. El valor sale de `SETTINGS[clave].default`,
 * el mismo del que parte `sanitizeSettings`, así que no hay una segunda lista de
 * valores por defecto que se pueda quedar vieja.
 *
 * Se queda **deshabilitado, no oculto**, cuando el ajuste ya está en fábrica: un
 * botón que aparece y desaparece mueve la fila entera de sitio cada vez que se
 * roza un slider.
 */
function DefaultButton({ setting, value, onChange }) {
  const spec = SETTINGS[setting]
  const fallback = spec.default
  // Los numéricos pasan por el slider y por el campo de texto, así que se
  // comparan con holgura: 4 y 4.000000000000001 son el mismo ajuste.
  const atDefault =
    typeof fallback === 'number' ? Math.abs(value - fallback) < 1e-9 : value === fallback

  return (
    <button
      type="button"
      className="field__default"
      disabled={atDefault}
      title={`Restablece sólo «${spec.label}»`}
      onClick={() => onChange({ [setting]: fallback })}
    >
      por defecto
    </button>
  )
}

/**
 * Cabecera de una fila: su etiqueta y su botón de restablecer.
 *
 * El botón va arriba y no pegado al control porque los controles no tienen la
 * misma forma —un slider deja hueco, una fila de segmentos ocupa el ancho
 * entero— y colgarlo de cada uno lo dejaría en un sitio distinto por fila.
 */
function FieldHead({ setting, value, onChange, htmlFor = null }) {
  const label = SETTINGS[setting].label
  return (
    <div className="field__head">
      {htmlFor ? (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="field__label">{label}</span>
      )}
      <DefaultButton setting={setting} value={value} onChange={onChange} />
    </div>
  )
}

/** Fila con etiqueta, slider y lectura del valor (o campo editable). */
function SliderRow({ id, setting, value, onChange, suffix = '', editable = false, hint = null }) {
  const spec = SETTINGS[setting]
  const commit = (next) => onChange({ [setting]: next })

  return (
    <div className="field">
      <FieldHead setting={setting} value={value} onChange={onChange} htmlFor={id} />
      <div className="field__control">
        <input
          id={id}
          type="range"
          className="field__range"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          onChange={(event) => commit(Number(event.target.value))}
        />
        {editable ? (
          <NumberField spec={spec} value={value} onCommit={commit} />
        ) : (
          <span className="field__value">
            {value.toFixed(spec.decimals)}
            {suffix}
          </span>
        )}
      </div>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  )
}

const FIRE_MODES = { semi: 'Semiautomática', auto: 'Automática' }

/** Ficha corta del arma: modo, cadencia y carácter del retroceso. */
function weaponHint(weaponKey) {
  const weapon = WEAPONS[weaponKey]
  return `${FIRE_MODES[weapon.mode]} · ${weapon.rpm} RPM · ${weapon.character}`
}

/** Explica de dónde salen las dianas en el escenario elegido. */
function scenarioHint(scenario) {
  return scenario === 'empty'
    ? 'Las dianas salen por muestreo dentro del cono de siempre.'
    : 'Las dianas salen en puntos de ruta y sólo si los ves. La distancia de aparición no se aplica aquí.'
}

/**
 * Selector de escenario: un plano cenital por opción y, debajo, la ficha del
 * que esté elegido.
 *
 * La ficha se muestra sólo del seleccionado en lugar de una por tarjeta: con
 * cuatro escenarios, cuatro fichas a la vez convierten el panel en un muro de
 * texto, y el panel ya iba justo de alto.
 */
function ScenarioRow({ value, onChange }) {
  const card = SCENARIOS[value]?.card

  return (
    <div className="field">
      <FieldHead setting="scenario" value={value} onChange={onChange} />

      <div className="scenarios">
        {Object.keys(SCENARIOS).map((key) => (
          <button
            key={key}
            type="button"
            className="scenarios__option"
            aria-pressed={value === key}
            onClick={() => onChange({ scenario: key })}
          >
            <ScenarioThumbnail scenarioKey={key} />
            <span className="scenarios__name">{SCENARIOS[key].label}</span>
          </button>
        ))}
      </div>

      {card ? (
        <dl className="scenario-card">
          <dt>Entrena</dt>
          <dd>{card.trains}</dd>
          <dt>Riesgo</dt>
          <dd>{card.risk}</dd>
          <dt>Rejugable</dt>
          <dd>{card.replay}</dd>
        </dl>
      ) : null}

      <span className="field__hint">{scenarioHint(value)}</span>
    </div>
  )
}

/**
 * La velocidad sólo se nota con el modo dinámico puesto, y la referencia útil no
 * es el número sino la carrera del jugador: por encima de ella los muñecos
 * dejan de poder seguirse andando.
 */
function patrolSpeedHint(settings) {
  if (!settings.dynamic) return 'Sólo se aplica con el modo dinámico activado.'
  const mia = MOVEMENT.speed
  if (settings.patrolSpeed < mia * 0.55) return `Paseo: muy por debajo de tu carrera (${mia} u/s).`
  if (settings.patrolSpeed < mia) return `Por debajo de tu carrera (${mia} u/s): los alcanzas.`
  if (settings.patrolSpeed < mia * 1.05) return `A la par de tu carrera (${mia} u/s).`
  return `Más rápidos que tú (${mia} u/s): no los alcanzas corriendo.`
}

/**
 * La dificultad sólo existe donde hay quien dispare, y lo que dice el nivel son
 * sus dos números: enseñarlos evita que «Difícil» sea una palabra sin contenido.
 */
function difficultyHint(settings) {
  const level = ENEMY_DIFFICULTIES[settings.enemyDifficulty]
  const donde =
    settings.scenario === 'empty' || settings.targetType !== 'hitbox'
      ? 'Sólo se aplica con escenario y hitbox completo: en la sala vacía nadie dispara. '
      : ''
  return `${donde}Cono de ${level.spreadDeg}° y ${level.reactionMs} ms de reacción.`
}

function dynamicHint(targetType) {
  return TARGET_TYPES[targetType].anchor === 'feet'
    ? 'Las dianas se desplazan por el suelo, sin cambiar de altura.'
    : 'Las dianas se desplazan por todo su volumen de aparición.'
}

/** Fila de opciones excluyentes, con la etiqueta de cada una del catálogo. */
function SegmentedRow({ setting, catalog, value, onChange, hint = null }) {
  return (
    <div className="field">
      <FieldHead setting={setting} value={value} onChange={onChange} />
      <div className="segmented">
        {Object.keys(catalog).map((key) => (
          <button
            key={key}
            type="button"
            className="segmented__option"
            aria-pressed={value === key}
            onClick={() => onChange({ [setting]: key })}
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
function ToggleRow({ setting, value, onChange, hint }) {
  return (
    <div className="field">
      <FieldHead setting={setting} value={value} onChange={onChange} />
      <div className="field__control">
        <button
          type="button"
          className="toggle"
          aria-pressed={value}
          onClick={() => onChange({ [setting]: !value })}
        >
          {value ? 'Activado' : 'Desactivado'}
        </button>
        <span className="field__hint">{hint}</span>
      </div>
    </div>
  )
}

export default function Options({ settings, binds, onChange, onReset, onClose }) {
  return (
    <div className="panel panel--options" onMouseDown={(event) => event.stopPropagation()}>
      <h2 className="panel__title panel__title--small">Opciones</h2>

      <SliderRow
        id="opt-sensitivity"
        setting="sensitivity"
        value={settings.sensitivity}
        onChange={onChange}
        editable
      />

      <ScenarioRow value={settings.scenario} onChange={onChange} />

      <SegmentedRow
        setting="targetType"
        catalog={TARGET_TYPES}
        value={settings.targetType}
        onChange={onChange}
      />

      <div className="field">
        <FieldHead
          setting="weapon"
          value={settings.weapon}
          onChange={onChange}
          htmlFor="opt-weapon"
        />
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
          setting="suppressor"
          value={settings.suppressor}
          onChange={onChange}
          hint={
            settings.suppressor
              ? 'Disparo más apagado. No cambia daño, retroceso ni cadencia.'
              : 'Sonido de disparo normal.'
          }
        />
      ) : (
        // Sin botón de restablecer: con un arma que no lo admite, el ajuste no
        // se aplica, y un botón que no cambia nada visible confunde más que ayuda.
        <div className="field">
          <span className="field__label">{SETTINGS.suppressor.label}</span>
          <span className="field__hint">
            {WEAPONS[settings.weapon].label} no admite silenciador.
          </span>
        </div>
      )}

      <SliderRow
        id="opt-radius"
        setting="targetRadius"
        value={settings.targetRadius}
        onChange={onChange}
      />

      <SliderRow
        id="opt-distance"
        setting="spawnDistance"
        value={settings.spawnDistance}
        onChange={onChange}
      />

      <SliderRow
        id="opt-cadence"
        setting="spawnIntervalMs"
        value={settings.spawnIntervalMs}
        onChange={onChange}
        suffix=" ms"
      />

      <SegmentedRow
        setting="simultaneousTargets"
        catalog={SIMULTANEOUS_TARGETS}
        value={settings.simultaneousTargets}
        onChange={onChange}
        hint={
          settings.simultaneousTargets === 'x1'
            ? 'Una sola diana viva: la siguiente espera a que caiga la actual.'
            : `Hasta ${SIMULTANEOUS_TARGETS[settings.simultaneousTargets].count} dianas a la vez, saliendo al ritmo de la cadencia.`
        }
      />

      <SegmentedRow
        setting="enemyDifficulty"
        catalog={ENEMY_DIFFICULTIES}
        value={settings.enemyDifficulty}
        onChange={onChange}
        hint={difficultyHint(settings)}
      />

      <ToggleRow
        setting="dynamic"
        value={settings.dynamic}
        onChange={onChange}
        hint={
          settings.dynamic
            ? dynamicHint(settings.targetType)
            : 'Las dianas se quedan quietas donde aparecen.'
        }
      />

      <SliderRow
        id="opt-patrol-speed"
        setting="patrolSpeed"
        value={settings.patrolSpeed}
        onChange={onChange}
        suffix=" u/s"
        hint={patrolSpeedHint(settings)}
      />

      <SegmentedRow
        setting="frameLimit"
        catalog={FRAME_LIMITS}
        value={settings.frameLimit}
        onChange={onChange}
        hint={
          FRAME_LIMITS[settings.frameLimit].fps > 0
            ? 'El juego se actualiza a ese ritmo aunque el monitor vaya más rápido.'
            : 'Al ritmo del monitor, sin limitar.'
        }
      />

      <ToggleRow
        setting="spatialAudio"
        value={settings.spatialAudio}
        onChange={onChange}
        hint={
          settings.spatialAudio
            ? 'Los sonidos del mundo suenan con dirección, no sólo más o menos fuerte.'
            : 'Sólo volumen por proximidad: sabrás si estás cerca, no hacia dónde.'
        }
      />

      <ToggleRow
        setting="helpMessages"
        value={settings.helpMessages}
        onChange={onChange}
        hint={
          settings.helpMessages
            ? 'Avisos breves en el HUD, como el de recargar al quedarte corto.'
            : 'Sin avisos: el HUD sólo muestra los contadores.'
        }
      />

      <SliderRow
        id="opt-music"
        setting="musicVolume"
        value={settings.musicVolume}
        onChange={onChange}
        hint={
          settings.musicVolume === 0
            ? 'Sin música en los menús.'
            : 'Suena en inicio, opciones y pausa; se calla al empezar a jugar.'
        }
      />

      <Controls binds={binds} />

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
