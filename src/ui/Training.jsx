import { useEffect, useRef } from 'react'
import ScenarioThumbnail from './ScenarioThumbnail.jsx'
import { FieldHead, SegmentedRow, SliderRow, ToggleRow } from './fields.jsx'
import {
  CAMERA,
  ENEMY_DIFFICULTIES,
  MOVEMENT,
  SESSION_DURATIONS,
  SESSION_DURATION_S,
  SESSION_MODES,
  SIMULTANEOUS_TARGETS,
  TARGET_TYPES,
  TRAINER_SCENARIOS,
  scenarioHasCover,
} from '../config.js'

/**
 * **Configurar la partida de entrenamiento** (vuelta 92).
 *
 * Todo lo de aquí vivía dentro del panel de opciones, entre la sensibilidad y
 * el límite de FPS, y eso era un fallo de producto con nombre: **nadie entra
 * en opciones a ver a qué se puede jugar**. Quien abría Vektor por primera vez
 * pulsaba «Jugar ahora» y se encontraba una sola cosa —la que hubiera
 * configurada— sin ninguna pista de que hay cuatro escenarios, tres tipos de
 * diana, modo dinámico y cinco niveles de dianas simultáneas.
 *
 * El corte es el de siempre y no es estético: **lo que decide esta partida va
 * aquí; lo que es del jugador o de su máquina se queda en opciones.** La
 * sensibilidad es la misma juegues a lo que juegues; el escenario no.
 *
 * Y las filas son **las mismas** (`fields.jsx`), no una segunda versión: un
 * slider que acotara distinto según el panel sería la vuelta 63 aplicada a la
 * interfaz.
 */

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
 * texto.
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
    return `Cada modo trae la suya: ${SESSION_DURATION_S} s en la ronda corta y sin límite en ${
      scenarioHasCover(settings.scenario)
        ? SESSION_MODES.deathmatch.label
        : SESSION_MODES.deathmatch.plainLabel
    }. ${bomba}`
  }
  return elegida.seconds > 0
    ? `Los dos modos acaban a los ${elegida.label}. ${bomba}`
    : 'Ningún modo acaba solo; lo cierras tú. Y no sale el explosivo: su cuenta atrás es el reloj de la sesión.'
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

export default function Training({ settings, onChange, onStartTimed, onStartDeathmatch, onBack }) {
  /**
   * **Abre por arriba**, que es la lección de la vuelta 78: el panel *es* el
   * contenedor con scroll, así que un hijo autoenfocado se trae la lista
   * entera con él y el primer ajuste no se ve nunca. El foco va al panel.
   */
  const panelRef = useRef(null)
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    panel.scrollTop = 0
    panel.focus({ preventScroll: true })
  }, [])

  // Escape vuelve, como en cualquier panel del juego.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const conCobertura = scenarioHasCover(settings.scenario)
  const elegida = SESSION_DURATIONS[settings.sessionDuration]
  const segundos = elegida.seconds ?? 0
  const deathmatchLabel = conCobertura
    ? `${SESSION_MODES.deathmatch.label}${segundos > 0 ? ` · ${elegida.label}` : ' ∞'}`
    : SESSION_MODES.deathmatch.plainLabel

  return (
    <div
      className="panel panel--training"
      ref={panelRef}
      tabIndex={-1}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <h2 className="panel__title panel__title--small">Entrenamiento</h2>

      {/**
        * **Los dos botones de empezar, arriba y no al final** (vuelta 92).
        *
        * Son la acción de esta pantalla, y al final de una lista de once
        * ajustes hay que buscarlos con la rueda. Arriba dicen además lo que
        * hace falta saber antes de tocar nada: que hay **dos** formas de jugar
        * lo que se está configurando, que es justo lo que estaba escondido.
        */}
      <div className="training__modos">
        <button
          type="button"
          className="button button--primary button--grande"
          onClick={onStartTimed}
          autoFocus
        >
          {conCobertura ? 'Ronda con explosivo' : 'Ronda cronometrada'}
          <span className="button__sub">
            {conCobertura
              ? 'Encuentra la bomba y desactívala antes de que reviente.'
              : `Dianas contrarreloj · ${segundos > 0 ? elegida.label : `${SESSION_DURATION_S} s`}`}
          </span>
        </button>
        {/* **El segundo modo tiene nombre propio donde lo tiene.** Con
            cobertura y muñecos que disparan es un Deathmatch y se llama así; en
            la sala vacía no hay contra quién, así que sigue siendo la práctica
            libre de siempre. El rótulo sale del escenario elegido, no de un
            interruptor aparte. */}
        <button
          type="button"
          className="button button--primary button--grande"
          onClick={onStartDeathmatch}
        >
          {deathmatchLabel}
          <span className="button__sub">
            {conCobertura
              ? 'Sin bomba: los muñecos disparan y tú aguantas.'
              : 'Sin reloj y sin objetivo: dianas y nada más.'}
          </span>
        </button>
      </div>

      <ScenarioRow value={settings.scenario} onChange={onChange} />

      <SegmentedRow
        setting="targetType"
        catalog={TARGET_TYPES}
        value={settings.targetType}
        onChange={onChange}
        hint={
          settings.targetType === 'hitbox'
            ? 'Muñecos con tres zonas: cabeza, torso y piernas. Son los únicos que disparan y los únicos que patrullan.'
            : 'Esferas con una sola zona: cae de un impacto, venga de donde venga.'
        }
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
        id="tr-patrol-speed"
        setting="patrolSpeed"
        value={settings.patrolSpeed}
        onChange={onChange}
        suffix=" u/s"
        hint={patrolSpeedHint(settings)}
      />

      <SegmentedRow
        setting="enemyDifficulty"
        catalog={ENEMY_DIFFICULTIES}
        value={settings.enemyDifficulty}
        onChange={onChange}
        hint={difficultyHint(settings)}
      />

      {/* **La duración es de la sesión, no de un modo** (vuelta 78). «La del
          modo» es el valor de fábrica y devuelve lo de siempre; cualquier otro
          se aplica a los dos botones de arriba. La ronda con explosivo la sigue
          midiendo la bomba. */}
      <SegmentedRow
        setting="sessionDuration"
        catalog={SESSION_DURATIONS}
        value={settings.sessionDuration}
        onChange={onChange}
        hint={durationHint(settings)}
      />

      <SliderRow
        id="tr-radius"
        setting="targetRadius"
        value={settings.targetRadius}
        onChange={onChange}
      />

      <SliderRow
        id="tr-cadence"
        setting="spawnIntervalMs"
        value={settings.spawnIntervalMs}
        onChange={onChange}
        suffix=" ms"
      />

      <SliderRow
        id="tr-distance"
        setting="spawnDistance"
        value={settings.spawnDistance}
        onChange={onChange}
      />

      {/* **Y con el panel abierto se ve** (vuelta 78): el motor dibuja el
          abanico delante de la cámara mientras estas opciones están puestas,
          así que mover el slider enseña el efecto en vez de describirlo. */}
      <SliderRow
        id="tr-cone"
        setting="spawnConeDeg"
        value={settings.spawnConeDeg}
        onChange={onChange}
        suffix="°"
        hint={coneHint(settings)}
      />

      <div className="panel__actions">
        <button type="button" className="button button--quiet" onClick={onBack}>
          Volver
        </button>
      </div>
    </div>
  )
}
