import { useEffect, useRef, useState } from 'react'
import Controls from './Controls.jsx'
import { keyLabel, keysOf } from '../keybinds.js'
import { persistenciaDisponible } from '../settings.js'
import ScenarioThumbnail from './ScenarioThumbnail.jsx'
import {
  CAMERA,
  ENEMY_DIFFICULTIES,
  SESSION_DURATION_S,
  SESSION_MODES,
  FRAME_LIMITS,
  MOVEMENT,
  TRAINER_SCENARIOS,
  SETTINGS,
  scenarioHasCover,
  SIMULTANEOUS_TARGETS,
  TARGET_TYPES,
  SESSION_DURATIONS,
  SECONDARY_WEAPON,
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

/**
 * Qué va a durar la sesión con lo que haya elegido.
 *
 * **Se resuelve igual que en el motor**, incluido el «la del modo»: una pista
 * que dijera otra cosa que el reloj sería un control que promete lo que el
 * juego ignora, que es justo lo que se arregló en la vuelta 78.
 */
function durationHint(settings) {
  const elegida = SESSION_DURATIONS[settings.sessionDuration]
  const bomba = 'La ronda con explosivo no usa esto: la mide la bomba.'
  if (elegida.seconds === null) {
    return `Cada modo trae la suya: ${SESSION_DURATION_S} s jugando ahora y sin límite en ${
      scenarioHasCover(settings.scenario)
        ? SESSION_MODES.deathmatch.label
        : SESSION_MODES.deathmatch.plainLabel
    }. ${bomba}`
  }
  return elegida.seconds > 0
    ? `Los dos modos acaban a los ${elegida.label}. ${bomba}`
    : `Ningún modo acaba solo; lo cierras tú. ${bomba}`
}

/** Qué se ve del abanico de aparición, y dónde deja de significar algo. */
function coneHint(settings) {
  if (scenarioHasCover(settings.scenario)) {
    return 'Con escenario no se aplica: las dianas salen en puntos de ruta, no dentro del cono.'
  }
  const encuadre = Math.round(
    2 * Math.atan(Math.tan((CAMERA.fov * Math.PI) / 360) * (16 / 9)) * (180 / Math.PI),
  )
  return settings.spawnConeDeg > encuadre
    ? `Más ancho que el encuadre (~${encuadre}°): alguna diana nace fuera del cuadro y hay que buscarla.`
    : `Dentro del encuadre (~${encuadre}°): todo lo que salga cabe en pantalla sin girar.`
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
  const card = TRAINER_SCENARIOS[value]?.card

  return (
    <div className="field">
      <FieldHead setting="scenario" value={value} onChange={onChange} />

      <div className="scenarios">
        {Object.keys(TRAINER_SCENARIOS).map((key) => (
          <button
            key={key}
            type="button"
            className="scenarios__option"
            aria-pressed={value === key}
            onClick={() => onChange({ scenario: key })}
          >
            <ScenarioThumbnail scenarioKey={key} />
            <span className="scenarios__name">{TRAINER_SCENARIOS[key].label}</span>
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
  // La tecla de la armería sale del store de binds, no escrita a mano: es
  // reasignable y una «B» en duro se quedaría mintiendo al primer cambio.
  const armouryKey = keyLabel(keysOf('armoury', binds)[0])

  /**
   * **El panel abre por arriba** (vuelta 78).
   *
   * Abría por el final, y no porque recordara nada: el `autoFocus` estaba en
   * «Volver», que es el **último** elemento de un panel que además *es* el
   * contenedor con scroll, así que el navegador lo traía a la vista al montar y
   * con él arrastraba la lista entera. El primer ajuste no se veía nunca.
   *
   * El foco tiene que ir a alguna parte —Escape y el tabulador lo necesitan—,
   * así que va **al panel**, que está arriba del todo. Y el `scrollTop` se pone
   * a cero explícitamente además de eso: si algún día vuelve a haber un hijo
   * autoenfocado, esta línea sigue mandando.
   */
  const panelRef = useRef(null)
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    panel.scrollTop = 0
    panel.focus({ preventScroll: true })
  }, [])

  return (
    <div
      className="panel panel--options"
      ref={panelRef}
      tabIndex={-1}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <h2 className="panel__title panel__title--small">Opciones</h2>

      <SliderRow
        id="opt-sensitivity"
        setting="sensitivity"
        value={settings.sensitivity}
        onChange={onChange}
        editable
      />

      {/*
        **La sensibilidad con mirilla es suya, no un múltiplo de la otra**
        (vuelta 70). Apuntar por un visor es un gesto distinto y el jugador
        querrá ir más fino sin tocar la de siempre; derivarla de los aumentos le
        quitaría esa decisión. De fábrica valen lo mismo, así que quien no la
        toque no nota nada nuevo.
      */}
      <SliderRow
        id="opt-scope-sensitivity"
        setting="scopeSensitivity"
        value={settings.scopeSensitivity}
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

      {/*
        **El arma principal ya no se elige aquí.** Desde la vuelta 42 vive en la
        armería, que es donde se ve su silueta y lo que cuesta llevarla. Queda la
        fila diciendo cuál llevas y por dónde se cambia: quitarla del todo dejaba
        perdido a quien llevaba vueltas buscándola en este panel.
      */}
      <div className="field">
        <FieldHead setting="weapon" value={settings.weapon} onChange={onChange} />
        <div className="field__control">
          <span className="field__hint">
            {WEAPONS[settings.weapon].label} · {weaponHint(settings.weapon)}
          </span>
          <span className="field__hint">
            Se equipa en la <strong>armería</strong> (tecla {armouryKey}), con la{' '}
            {WEAPONS[SECONDARY_WEAPON].label} siempre encima en la tecla 2.
          </span>
          {/* El silenciador dejó de ser un interruptor del jugador en la vuelta
              43: hay uno por arma y viven en su ficha de la armería, donde
              además se ve la silueta que te vas a llevar. */}
          <span className="field__hint">
            El <strong>silenciador</strong> también: uno por arma, en su ficha.
          </span>
        </div>
      </div>

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

      {/* **Y con el panel abierto se ve** (vuelta 78): el motor dibuja el
          abanico delante de la cámara mientras estas opciones están puestas,
          así que mover el slider enseña el efecto en vez de describirlo. Un
          número de grados no se sabe leer hasta haber jugado una ronda con él. */}
      <SliderRow
        id="opt-cone"
        setting="spawnConeDeg"
        value={settings.spawnConeDeg}
        onChange={onChange}
        suffix="°"
        hint={coneHint(settings)}
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

      {/* **La duración es de la sesión, no de un modo** (vuelta 78). «La del
          modo» es el valor de fábrica y devuelve lo de siempre; cualquier otro
          se aplica también a «Jugar ahora», que es lo que hasta aquí ignoraba
          el ajuste con el cronómetro contando igual. La ronda con explosivo la
          sigue midiendo la bomba. */}
      <SegmentedRow
        setting="sessionDuration"
        catalog={SESSION_DURATIONS}
        value={settings.sessionDuration}
        onChange={onChange}
        hint={durationHint(settings)}
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

      <Controls binds={binds} />

      <div className="panel__actions">
        <button type="button" className="button button--primary" onClick={onClose}>
          Volver
        </button>
        <button type="button" className="button button--quiet" onClick={onReset}>
          Restablecer
        </button>
      </div>
      {/* **Y si no se guardan, se dice.** Hasta la vuelta 60 el fallo de
          `localStorage` se tragaba en silencio, así que un navegador que borra
          los datos al cerrarse o una ventana privada se veían como un juego que
          pierde los ajustes solo. Ahora la frase cambia. */}
      {persistenciaDisponible() ? (
        <p className="panel__hint">Los ajustes se guardan en este navegador.</p>
      ) : (
        <p className="panel__hint panel__hint--alerta">
          Este navegador no deja guardar ajustes, así que se perderán al cerrar.
          Suele ser una ventana privada, las cookies de terceros bloqueadas o el
          navegador configurado para borrar los datos del sitio al salir.
        </p>
      )}
    </div>
  )
}
