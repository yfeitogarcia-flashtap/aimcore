import { useEffect, useRef } from 'react'
import Controls from './Controls.jsx'
import { keyLabel, keysOf } from '../keybinds.js'
import { persistenciaDisponible } from '../settings.js'
import { FieldHead, SegmentedRow, SliderRow, ToggleRow } from './fields.jsx'
import {
  FRAME_LIMITS,
  SECONDARY_WEAPON,
  WEAPONS,
  WEAPON_MODES,
} from '../config.js'

/**
 * Panel de opciones. Se abre desde el menú y también desde la pausa.
 *
 * No guarda estado propio: escribe en el store de ajustes (src/settings.js) y
 * lo que se ve viene de vuelta desde ahí, así que el slider, el campo numérico
 * y lo que aplica el motor no pueden desincronizarse.
 *
 * ---
 *
 * **Aquí sólo está lo que es del jugador y de su máquina** (vuelta 92).
 *
 * Hasta aquí este panel llevaba además el escenario, el tipo de diana, su
 * tamaño, la distancia, el cono, la cadencia, cuántas a la vez, la duración, la
 * dificultad, el modo dinámico y la velocidad de patrulla — o sea **la partida
 * entera escondida detrás de un botón que se llama «Opciones»**. Lo que pasaba
 * es lo que se reportó: nadie entra en opciones a ver a qué modos se puede
 * jugar, así que quien abría Vektor jugaba siempre a lo mismo sin saber que
 * había otra cosa. Todo eso vive ahora en la pantalla de entrenamiento
 * (`Training.jsx`), que es donde se decide una partida.
 *
 * El corte se puede decir en una frase: **si cambia de una partida a otra, no
 * es una opción; es la partida.** Lo que queda:
 *
 * - **Sensibilidad y sensibilidad con mirilla.** Son de la mano de quien juega,
 *   no de lo que juega.
 * - **Los controles.** Lo mismo.
 * - **Mensajes de ayuda y audio espacial.** Son cómo prefieres que el juego te
 *   hable, y valen igual entrenando y en un duelo.
 * - **Y el límite de FPS**, que no estaba en la lista de lo que se pidió dejar
 *   aquí y se queda a propósito: no configura una partida, configura **esta
 *   máquina** —un portátil que se calienta lo baja y no quiere volver a bajarlo
 *   cada vez que elige mapa—. Es la misma clase de ajuste que el audio
 *   espacial, y ponerlo en la pantalla de entrenamiento lo habría dejado fuera
 *   del duelo, que es donde más falta hace.
 *
 * La fila informativa del arma se queda por lo que ya decía en la vuelta 42:
 * quitarla del todo deja perdido a quien lleva tiempo buscándola aquí.
 */

/** Ficha corta del arma: modo, cadencia y carácter del retroceso. */
function weaponHint(weaponKey) {
  const weapon = WEAPONS[weaponKey]
  return `${WEAPON_MODES[weapon.mode]?.largo} · ${weapon.rpm} RPM · ${weapon.character}`
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

  /**
   * **Y Escape lo cierra** (vuelta 88).
   *
   * No lo cerraba nadie: la armería tiene este mismo manejador desde que
   * existe y este panel no, así que la única salida era encontrar «Volver» al
   * final de una lista de veinte ajustes — y en el duelo, donde se llega a
   * opciones desde el menú de ESC, la tecla con la que se acababa de entrar no
   * servía para salir.
   *
   * Va en **burbuja** y no en captura a propósito: reasignando una tecla,
   * `Controls` escucha en captura y para el evento ahí, que es lo que deja que
   * Escape cancele la captura sin cerrar el panel de debajo. El orden de las
   * dos fases **es** la regla; invertirlo deja sin forma de abortar un bind.
   */
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="panel panel--options"
      ref={panelRef}
      tabIndex={-1}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <h2 className="panel__title panel__title--small">Opciones</h2>
      <p className="panel__hint">
        Lo que configura una partida —mapa, dianas, dificultad— se elige en{' '}
        <strong>Entrenamiento</strong>. Aquí está lo que es tuyo y vale para todos
        los modos.
      </p>

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

      {/*
        **El arma no se elige aquí.** Desde la vuelta 42 vive en la armería, que
        es donde se ve su silueta y lo que cuesta llevarla. Queda la fila
        diciendo cuál llevas y por dónde se cambia: quitarla del todo dejaba
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
            {WEAPONS[settings.secondary]?.label ?? WEAPONS[SECONDARY_WEAPON].label} en la tecla 2
            y, desde la vuelta 92, el arma especial en la <strong>5</strong>.
          </span>
          {/* El silenciador dejó de ser un interruptor del jugador en la vuelta
              43: hay uno por arma y viven en su ficha de la armería, donde
              además se ve la silueta que te vas a llevar. */}
          <span className="field__hint">
            El <strong>silenciador</strong> también: uno por arma, en su ficha.
          </span>
        </div>
      </div>

      {/* **El límite de FPS es de la máquina, no de la partida**, así que se
          queda aquí cuando todo lo de la partida se fue a Entrenamiento: quien
          lo baja porque su portátil se calienta no quiere volver a bajarlo cada
          vez que elige mapa, y en el duelo no habría dónde ponerlo. */}
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
