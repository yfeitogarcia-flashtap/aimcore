import { useState } from 'react'
import { SETTINGS } from '../config.js'

/**
 * **El vocabulario de filas de ajuste, en un sitio** (vuelta 92).
 *
 * Estaba entero dentro de `Options.jsx`, que era exacto mientras opciones
 * fuese el único panel que toca ajustes. Con la pantalla de configurar
 * entrenamiento son dos, y copiar estas seis funciones habría sido la vuelta
 * 63 por la puerta de la interfaz: dos paneles que escriben en el mismo store
 * y se comportan distinto —un slider que acota de otra manera, un botón de
 * «por defecto» que no está en uno de los dos— es una diferencia que nadie
 * decidió.
 *
 * La regla que hace que esto funcione sigue siendo la de la vuelta 78: **cada
 * fila se identifica por la clave del ajuste**, no por su descriptor. De la
 * clave salen la etiqueta, el rango, el valor de fábrica y el parche que se
 * escribe, así que un panel nuevo no puede enseñar un ajuste y restablecer
 * otro.
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
export function FieldHead({ setting, value, onChange, htmlFor = null }) {
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
export function SliderRow({ id, setting, value, onChange, suffix = '', editable = false, hint = null }) {
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

/** Fila de opciones excluyentes, con la etiqueta de cada una del catálogo. */
export function SegmentedRow({ setting, catalog, value, onChange, hint = null }) {
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
export function ToggleRow({ setting, value, onChange, hint }) {
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
