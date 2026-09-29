import { reglasDeMapa } from './game/arsenal.js'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  COLORS,
  CROSSHAIR,
  FEEDBACK,
  MOVEMENT,
  NET,
  definicionDeEntrenamiento,
} from './config.js'
import { Engine, PHASE } from './game/engine.js'
import { disposeAudio } from './audio/sfx.js'
import { getKeybinds, keyLabel, keysOf, subscribeKeybinds } from './keybinds.js'
import { esEscritorio, montarPantallaCompleta, salirDeLaApp, versionDeEscritorio } from './escritorio.js'
import { getSettings, resetSettings, subscribeSettings, updateSettings } from './settings.js'
import Crosshair from './ui/Crosshair.jsx'
import { VektorLogo } from './ui/Logo.jsx'
import Hud from './ui/Hud.jsx'
import Armoury from './ui/Armoury.jsx'
import Options from './ui/Options.jsx'
import Training from './ui/Training.jsx'
import Cabina, { Icono } from './ui/Cabina.jsx'
import { vigilarActualizaciones } from './ui/actualizacion.js'
import { crearVueltaConEscape } from './ui/volverConEscape.js'
import { cancelarCaptura } from './game/captura.js'
import Summary from './ui/Summary.jsx'
import { ComoSeJuega } from './ui/Beta.jsx'
import { contarEntreno, registrarContextoDeFeedback, tocaComoSeJuega } from './beta.js'

/**
 * Une el motor (three.js, imperativo) con el HUD (React, declarativo).
 *
 * React sólo se entera de dos cosas: en qué fase estamos y cuál fue el
 * resultado final. Los contadores y el cronómetro llegan al DOM por refs desde
 * el bucle de render, así que una partida entera provoca un puñado de renders
 * de React, no miles.
 */
/**
 * **Los controles, como pares de tecla y verbo** (vuelta 94), **y la tecla la
 * dice el bind** (vuelta 97).
 *
 * `siempre` marca los que existen aunque el movimiento esté apagado
 * (`MOVEMENT.enabled`), que es la misma condición que ya gateaba el renglón de
 * antes — no una segunda idea de qué teclas hay.
 *
 * La vuelta 94 las escribió aquí a mano con este argumento: «este paso es el
 * primer contacto con el juego y se lee antes de que nadie haya reasignado
 * nada». Era verdad **de la primera partida de alguien** y falso de todas las
 * demás: quien se pone agacharse en la Z vuelve a esta pantalla cien veces y lee
 * la C. Y desde esta vuelta es falso incluso sin reasignar nada, porque **el
 * valor de fábrica ya no es uno**: en la app de escritorio agacharse nace en
 * `Ctrl`. Un rótulo que no puede acertar ni con los ajustes de fábrica es un
 * rótulo que hay que borrar.
 *
 * Cómo se cumple, y es lo que hay que respetar al añadir un renglón: **la fila
 * declara la acción, no la tecla** (`accion`), y quien pinta la saca de
 * `keysOf`, que es la misma función de la que sale la lista de controles del
 * panel. Los dos casos que no son una acción se declaran con su `tecla` escrita
 * y su motivo al lado.
 */
/** El rótulo de la barra de la cabina para cada sección. */
/**
 * **Por qué sección se entra** (vuelta 101): el raíl de la cabina también está
 * en el lobby del multijugador, que es otra página, y desde allí «Entrenar» es
 * volver aquí **a esa sección** y no a la portada. Lo dice el ancla de la
 * dirección (`/#entrenamiento`), que se lee una vez al cargar y se borra: es
 * una forma de llegar, no un estado que haya que mantener.
 */
const SECCION_DE_ENTRADA = (() => {
  if (typeof window === 'undefined') return null
  const ancla = window.location.hash.replace('#', '')
  if (!['entrenamiento', 'armeria', 'opciones', 'inicio'].includes(ancla)) return null
  history.replaceState(null, '', window.location.pathname + window.location.search)
  return ancla
})()

const SECCION_TITULO = {
  entrenamiento: 'Entrenamiento',
  armeria: 'Armería',
  opciones: 'Opciones',
}

const TECLAS_DE_ENTRADA = [
  // WASD no es un bind: son cuatro, y las cuatro juntas son el rótulo. Se
  // compone de sus cuatro acciones más abajo, así que reasignarlas se ve.
  { direcciones: true, que: 'moverte', siempre: false },
  { accion: 'walk', que: 'andar', siempre: false },
  { accion: 'crouch', que: 'agacharte', siempre: false },
  { accion: 'jump', que: 'saltar', siempre: false },
  { accion: 'reload', que: 'recargar', siempre: true },
  { accion: 'armoury', que: 'armería', siempre: true },
  // Escape es lo único de esta lista que no es un bind y no puede serlo: está en
  // `FORBIDDEN_KEYS` porque es la salida del pointer lock (vuelta 27).
  { tecla: 'ESC', que: 'pausa', siempre: true },
]

/** El rótulo de una fila de controles, con la tecla que hay puesta ahora. */
function teclaDeFila(fila, binds) {
  if (fila.tecla) return fila.tecla
  if (fila.direcciones) {
    return ['forward', 'left', 'back', 'right']
      .map((accion) => keyLabel(keysOf(accion, binds)[0]))
      .join('')
  }
  return keyLabel(keysOf(fila.accion, binds)[0])
}

export default function App() {
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const hudRef = useRef(null)
  const crosshairRef = useRef(null)

  const [phase, setPhase] = useState(PHASE.IDLE)
  const [summary, setSummary] = useState(null)
  const [engineError, setEngineError] = useState(null)
  const [optionsOpen, setOptionsOpen] = useState(() => SECCION_DE_ENTRADA === 'opciones')
  /**
   * **La armería.** Se abre con su tecla o con su botón, y jugando pausa: el
   * motor suelta el ratón antes de avisar, así que aquí sólo hay que enseñarla.
   */
  const [armouryOpen, setArmouryOpen] = useState(() => SECCION_DE_ENTRADA === 'armeria')
  /**
   * **Por dónde va el menú de inicio** (vuelta 92): `marca`, `modos` o
   * `entrenamiento`.
   *
   * Hasta aquí la pantalla de inicio era **una sola** con cinco botones en
   * fila —dos modos, el duelo, la armería y las opciones— más tres párrafos de
   * instrucciones encima. Lo que eso produce es lo que se reportó del panel de
   * opciones por otra puerta: el primer contacto con el juego es una lista, y
   * en una lista de cinco cosas iguales no hay ninguna que sea *la* que hay que
   * pulsar.
   *
   * Tres pasos, y cada uno hace **una** pregunta: ¿juegas? → ¿a qué? → ¿cómo?
   * El logotipo se queda solo con su botón, que es lo que se pidió; las
   * instrucciones bajan al segundo paso, donde ya hay sitio y donde todavía no
   * estorban a nadie.
   *
   * Y es estado y no ruta a propósito: `App.jsx` no tiene router, y meterlo
   * para tres pantallas de menú sería una dependencia para un `useState`.
   */
  const [menu, setMenu] = useState(() => (SECCION_DE_ENTRADA === 'entrenamiento' ? 'entrenamiento' : SECCION_DE_ENTRADA ? 'modos' : 'marca'))
  /** Vista del avatar: mientras está abierta, los paneles se apartan. */
  const [avatarDebug, setAvatarDebug] = useState(false)
  /**
   * **El arma que se lleva en la mano**, que desde la vuelta 39 ya no es la del
   * ajuste: se llevan dos y la tecla decide cuál. Lo publica el motor cuando
   * cambia —una pulsación—, no en cada frame, así que puede ser estado de React
   * sin saltarse la regla de no repintar por frame.
   */
  const [equipped, setEquipped] = useState({ weaponKey: getSettings().weapon, suppressed: false })
  const [apuntando, setApuntando] = useState(false)
  const [aCuchillo, setACuchillo] = useState(false)
  const [porLaEspalda, setPorLaEspalda] = useState(false)

  // El store de ajustes vive fuera de React porque el motor también lo lee.
  const settings = useSyncExternalStore(subscribeSettings, getSettings)
  // Y el de teclas, por lo mismo: lo escribe el panel y lo lee el motor.
  const binds = useSyncExternalStore(subscribeKeybinds, getKeybinds)
  /**
   * **Cómo se juega** (vuelta 107): la primera vez que se pulsa «Jugar ahora», y
   * después cuando se pida desde la portada.
   */
  const [como, setComo] = useState(false)
  // **Lo que viaja con un feedback desde esta página** (vuelta 107): el modo de
  // entrenamiento y su escenario, leídos de los ajustes al enviarlo.
  useEffect(() => {
    registrarContextoDeFeedback(() => {
      const s = getSettings()
      return { donde: 'entrenamiento', modo: s.trainingMode, mapa: s.scenario }
    })
  }, [])

  // La paleta vive en config.js; aquí sólo la publicamos como variables CSS
  // para que las hojas de estilo no repitan ningún color a mano.
  useLayoutEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--crosshair-color', COLORS.crosshair)
    // **Y su forma, que desde la vuelta 67 es la misma en los dos modos.** Los
    // tres números viven en `CROSSHAIR` y los publican las dos páginas: el CSS
    // sigue teniendo un valor de partida por si esto no llega a correr.
    root.setProperty('--crosshair-gap', `${CROSSHAIR.gapPx}px`)
    root.setProperty('--crosshair-length', `${CROSSHAIR.lengthPx}px`)
    root.setProperty('--crosshair-thickness', `${CROSSHAIR.thicknessPx}px`)
    root.setProperty('--background-color', COLORS.background)
    root.setProperty('--accent-color', COLORS.target)
    root.setProperty('--action-color', COLORS.action)
    root.setProperty('--electric-color', COLORS.electric)
    root.setProperty('--health-color', COLORS.health)
    // El rojo de «te disparan» y las medidas de la cuña direccional: el tuning
    // sigue viviendo en config.js aunque quien lo dibuje sea una hoja de estilos.
    root.setProperty('--threat-color', COLORS.threat)
    root.setProperty('--damage-spread', `${FEEDBACK.damageArcSpreadDeg}deg`)
    root.setProperty('--damage-inner', `${FEEDBACK.damageArcInner * 100}%`)
  }, [])

  useEffect(() => {
    let engine
    try {
      engine = new Engine(canvasRef.current, {
        onPhaseChange: (next) => {
          setPhase(next)
          // El resumen se retira sólo cuando la sesión nueva arranca de verdad.
          if (next === PHASE.RUNNING) setSummary(null)
        },
        onFrame: (stats) => hudRef.current?.update(stats),
        // La silueta del arma reacciona al disparo y en seco (vuelta 106).
        onArma: (evento) => hudRef.current?.reaccionArma(evento),
        // Lo que va a hacer la E con la peana que apuntas (vuelta 106).
        onPeana: (texto) => hudRef.current?.avisoDePeana(texto),
        onDamage: (severity, bearing) => {
          // Dos avisos y no uno: el anillo dice **cuánto** te han dado y la cuña
          // del borde **de dónde**. El primero está en la mira porque hay que
          // seguir mirando ahí; el segundo, justo en el borde contrario.
          crosshairRef.current?.damage(severity)
          hudRef.current?.damageFrom(bearing ?? 0, severity)
        },
        onHelp: (text, durationMs) => hudRef.current?.showHelp(text, durationMs),
        onOpenOptions: () => setOptionsOpen(true),
        // La tecla es un interruptor: abre si está cerrada y cierra si no. Al
        // cerrarla no se vuelve a capturar el ratón —queda la pausa de siempre,
        // con su click para continuar—, que es lo mismo que hacen las opciones.
        onArmoury: () => setArmouryOpen((open) => !open),
        onAvatarDebug: setAvatarDebug,
        onWeapon: setEquipped,
        /**
         * **Apuntando con mirilla, la mira de la página se quita** (vuelta 70).
         * La lente trae la suya —cruceta fina y punto rojo— y dos miras a la
         * vez es una encima de otra. El aviso es una pulsación, no un valor por
         * frame, así que puede ser estado de React: llega al cambiar de idea,
         * no sesenta veces por segundo.
         */
        onScope: setApuntando,
        /**
         * **Y si hay alguien a distancia de cuchillo** (vuelta 71): la mira se
         * abre y se tiñe. Es lo único que un arma sin modelo en la mano puede
         * decir antes de golpear. Pulsación, no valor por frame.
         */
        onMeleeRange: (dentro, espalda) => {
          setACuchillo(dentro)
          setPorLaEspalda(Boolean(espalda))
        },
        onFinish: setSummary,
      })
      engine.start()
    } catch (error) {
      // Sin WebGL no hay prototipo: mejor decirlo que dejar un canvas en negro.
      setEngineError(error?.message ?? 'No se pudo inicializar WebGL.')
      return undefined
    }
    engineRef.current = engine

    // Acceso al motor desde la consola para trastear con el tuning en
    // caliente. Sólo en desarrollo: Vite lo elimina del build de producción.
    if (import.meta.env.DEV) window.aimcore = engine

    return () => {
      engine.dispose()
      engineRef.current = null
      disposeAudio()
      if (import.meta.env.DEV) delete window.aimcore
    }
  }, [])

  /**
   * **Y si se despliega una versión nueva, se entera sola** (vuelta 93). Lo que
   * decide **cuándo** se recarga es esta línea y no el módulo: aquí, no estar
   * jugando. Recargar en mitad de una ronda cuesta la ronda, así que el cartel
   * espera a la pantalla de inicio, a la pausa o al resumen.
   */
  const faseRef = useRef(phase)
  faseRef.current = phase
  useEffect(() => vigilarActualizaciones({
    puedeRecargar: () => faseRef.current !== PHASE.RUNNING,
  }), [])

  /**
   * **Y la pantalla completa de la app** (vuelta 97). Se monta aquí por lo mismo
   * que el vigilante de arriba: es de la ventana, no de un modo, así que la
   * montan las dos páginas llamando a la misma función. En un navegador no hace
   * nada y no se entera nadie — F11 ya es del navegador.
   */
  useEffect(() => montarPantallaCompleta(), [])

  /** Captura el ratón: reanuda una pausada o arranca donde toque. */
  const lock = useCallback(() => {
    engineRef.current?.requestLock()
  }, [])

  /**
   * **Jugar arranca el modo elegido** (vuelta 98), que es un ajuste y no un
   * botón. Se lee del store en el momento de pulsar, no de un cierre: un
   * `useCallback` sin la dependencia se quedaría con el modo de cuando se montó.
   */
  const startTraining = useCallback(() => {
    // Un entrenamiento más en el contador de la beta: una suma, sin nada de quién.
    contarEntreno()
    engineRef.current?.requestStart(getSettings().trainingMode)
  }, [])
  const finishSession = useCallback(() => engineRef.current?.finishSession(), [])
  const backToStart = useCallback(() => {
    setSummary(null)
    // **Y se vuelve al primer paso, no al último que se vio** (vuelta 92).
    // Terminar una sesión es terminar, así que la pantalla que toca es la de
    // la marca: volver a la lista de ajustes de la partida que acaba de
    // acabar es ofrecer retocarla en vez de decidir qué se hace ahora.
    setMenu('marca')
    engineRef.current?.goToStart()
  }, [])

  // Seguimos dentro del gesto del usuario (el click del botón), así que el
  // navegador acepta la captura sin exigir un segundo click.
  const restart = useCallback(() => {
    engineRef.current?.restart()
  }, [])

  // Los overlays de inicio y pausa capturan el ratón con un click en cualquier
  // sitio; los botones tienen que quedarse ese click para ellos.
  const swallowClick = useCallback((event) => event.stopPropagation(), [])
  const openOptions = useCallback(() => setOptionsOpen(true), [])
  const closeOptions = useCallback(() => setOptionsOpen(false), [])

  /**
   * **Con el panel abierto se ve el abanico de aparición** (vuelta 78). Es lo
   * único que hace falta por este lado: el cono es geometría del mundo y lo
   * dibuja el motor, que además es el único que sabe si en este escenario el
   * cono decide algo.
   */
  const enEntrenamiento = menu === 'entrenamiento'
  useEffect(() => {
    // **Y se dibuja donde vive el slider** (vuelta 92): el cono se movió a la
    // pantalla de entrenamiento, así que el dibujo se va con él. Colgarlo de
    // `optionsOpen` habría dejado el ajuste en un panel y su efecto en otro,
    // que es exactamente lo que la convención de la vuelta 78 prohíbe.
    engineRef.current?.mostrarConoDeAparicion(enEntrenamiento)
  }, [enEntrenamiento])
  const openArmoury = useCallback(() => setArmouryOpen(true), [])
  const closeArmoury = useCallback(() => setArmouryOpen(false), [])

  const showHud = phase === PHASE.RUNNING || phase === PHASE.PAUSED

  /**
   * **Los dos rótulos de modo se fueron con sus botones** (vuelta 92). El
   * nombre del segundo modo y la duración que lleva detrás se resuelven ahora
   * en `Training.jsx`, que es donde están los botones que los llevan — y se
   * resuelven **igual que en el motor**, que es lo que la vuelta 78 pidió.
   */
  const optionsPanel = (
    <Options
      settings={settings}
      binds={binds}
      onChange={updateSettings}
      onReset={resetSettings}
      onClose={closeOptions}
    />
  )

  /**
   * **Las reglas del mapa que se va a jugar** (vuelta 106): la armería no equipa
   * lo que el mapa no admite, y en un mapa que reparte (Equipadas o Peanas) sólo
   * enseña, como la del duelo: ahí lo que llevas lo decide el mapa.
   */
  const reglasDelMapa = reglasDeMapa(definicionDeEntrenamiento(settings.scenario))
  const armouryPanel = (
    <Armoury
      settings={settings}
      equipped={equipped}
      onChange={updateSettings}
      onClose={closeArmoury}
      reglas={reglasDelMapa}
      soloFicha={reglasDelMapa.modo !== 'armeria'}
    />
  )

  const optionsButton = (
    <button type="button" className="button" onMouseDown={swallowClick} onClick={openOptions}>
      Opciones
    </button>
  )

  const armouryButton = (
    <button type="button" className="button" onMouseDown={swallowClick} onClick={openArmoury}>
      Armería
    </button>
  )

  /**
   * **El botón del duelo es un enlace, y eso es todo lo que sabe de la red**
   * (vuelta 66). `App.jsx` no monta una fase de duelo ni habla con ningún
   * socket: el 1v1 sigue siendo una página aparte (vuelta 45) con su menú, su
   * código de partida y su botón de reconectar. Lo único que faltaba era la
   * puerta — hasta aquí había que escribir `/duelo/` a mano en la barra.
   *
   * La ruta sale de `NET.rutaDuelo`, que es la misma que sirven los dos
   * huéspedes y el servidor de desarrollo, así que es una sola en los tres
   * sitios. Y va con `assign` y no como un `<a>` para que el `onMouseDown` que
   * se traga el clic —el que evita que capture el ratón— siga valiendo aquí.
   * Lo pinta el segundo paso del menú, junto al entrenamiento.
   */

  /** Con cualquier panel abierto el overlay deja de capturar el ratón. */
  const panelOpen = optionsOpen || armouryOpen

  /**
   * **En qué sección de la cabina se está, y cómo se va a otra** (vuelta 99).
   * El raíl es la única navegación de los menús: cada icono cierra lo que haya
   * abierto y abre lo suyo, así que no hay dos caminos a la misma pantalla que
   * puedan dejarla a medias. El duelo es un enlace, como su botón (vuelta 66).
   */
  const seccion = armouryOpen
    ? 'armeria'
    : optionsOpen
      ? 'opciones'
      : menu === 'entrenamiento'
        ? 'entrenamiento'
        : 'inicio'
  const irA = useCallback((destino) => {
    if (destino === 'multijugador') {
      window.location.assign(NET.rutaDuelo)
      return
    }
    setArmouryOpen(destino === 'armeria')
    setOptionsOpen(destino === 'opciones')
    if (destino === 'entrenamiento') setMenu('entrenamiento')
    else if (destino === 'inicio') setMenu('modos')
    else setMenu((m) => (m === 'marca' ? 'modos' : m))
  }, [])

  /**
   * **Desde la vuelta 101 ESC es un «atrás» forzado**: con el juego en pausa,
   * cualquier ESC cierra lo que haya abierto —opciones, armería— y vuelve a la
   * partida, y una pulsación dentro de la espera del navegador **no se tira**:
   * se anota y se cumple en cuanto se puede. Es la misma pieza que usa la página
   * del multijugador (`crearVueltaConEscape`). Lo que sigue siendo de otro es la
   * captura de una tecla en Controles: esa escucha en captura y para el evento
   * antes de que llegue aquí, que es lo que deja cancelar un bind con ESC.
   */
  const panelAbierto = useRef(false)
  panelAbierto.current = panelOpen
  const vuelta = useMemo(() => crearVueltaConEscape(() => engineRef.current?.requestLock()), [])
  useEffect(() => {
    if (phase === PHASE.PAUSED) vuelta.soltado()
    else {
      vuelta.cancelar()
      // Fuera de la pausa no hay a qué volver: ni reintento ni aviso (vuelta 105).
      cancelarCaptura()
    }
  }, [phase, vuelta])

  useEffect(() => {
    if (phase !== PHASE.PAUSED) return undefined
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      if (!vuelta.pedir(performance.now(), panelAbierto.current)) return
      event.preventDefault()
      setOptionsOpen(false)
      setArmouryOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, vuelta])

  return (
    <div className="app">
      <canvas ref={canvasRef} className="app__canvas" />

      {showHud && (
        <Hud ref={hudRef} weaponKey={equipped.weaponKey} suppressed={equipped.suppressed} />
      )}
      {phase === PHASE.RUNNING && <Crosshair ref={crosshairRef} hidden={apuntando} melee={aCuchillo} backstab={porLaEspalda} />}

      {engineError && (
        <div className="overlay">
          <div className="panel">
            <h2 className="panel__title panel__title--small">WebGL no disponible</h2>
            <p className="panel__body">{engineError}</p>
            <p className="panel__hint">Comprueba la aceleración por hardware del navegador.</p>
          </div>
        </div>
      )}

      {avatarDebug && (
        <div className="overlay overlay--bare">
          <p className="panel__hint">Vista del avatar · F3 para salir</p>
        </div>
      )}

      {!engineError && !avatarDebug && phase === PHASE.IDLE && menu === 'marca' && !panelOpen && (
        // **El primer paso se queda fuera de la cabina** (vuelta 99): es el
        // logotipo y un botón, la pantalla que se ve antes de haber decidido
        // nada. Un clic en cualquier sitio sigue capturando el ratón.
        <div className="overlay" onMouseDown={lock}>
          <div className="panel panel--marca">
            {/* El logotipo **es** el título: lleva «VEKTOR» dentro, así que
                repetirlo debajo en texto sería decirlo dos veces. El rótulo
                sigue siendo un h1 y el SVG lleva su `aria-label`. */}
            <h1 className="panel__logo">
              <VektorLogo />
            </h1>
            <p className="panel__byline">by FlickLAB</p>
            <div className="panel__actions panel__actions--solo">
              <button
                type="button"
                className="button button--primary button--grande"
                onMouseDown={swallowClick}
                onClick={() => { setMenu('modos'); if (tocaComoSeJuega()) setComo(true) }}
                autoFocus
              >
                Jugar ahora
              </button>
            </div>
          </div>

          {/**
            * **Salir, abajo a la izquierda y sólo donde puede cumplirse**
            * (vuelta 99). En la app de escritorio cierra la aplicación: lo pide
            * a la ventana, que es quien puede. En un navegador **no se enseña**:
            * una página no puede cerrar una pestaña que no abrió ella —el
            * navegador ignora `window.close()`—, así que un botón «Salir» ahí
            * sería un botón que no hace nada, el fallo de la vuelta 67. Lo que
            * sí hace un navegador para salir es su propia pestaña, y eso ya lo
            * sabe todo el mundo.
            */}
          {esEscritorio() && (
            <button
              type="button"
              className="button button--quiet salir"
              onMouseDown={swallowClick}
              onClick={salirDeLaApp}
            >
              <Icono nombre="salir" className="salir__icono" />
              Salir
            </button>
          )}
        </div>
      )}

      {!engineError && !avatarDebug && phase === PHASE.IDLE && (menu !== 'marca' || panelOpen) && (
        <Cabina
          seccion={seccion}
          titulo={seccion === 'inicio'
            ? <>Vektor<small>by FlickLAB</small></>
            : SECCION_TITULO[seccion]}
          estado={esEscritorio() ? <span>Vektor de escritorio {versionDeEscritorio() ?? ''}</span> : null}
          onIr={irA}
          onMarca={() => { setArmouryOpen(false); setOptionsOpen(false); setMenu('marca') }}
        >
          {armouryOpen ? (
            armouryPanel
          ) : optionsOpen ? (
            optionsPanel
          ) : menu === 'entrenamiento' ? (
            <Training
              settings={settings}
              onChange={updateSettings}
              onStart={startTraining}
              onBack={() => setMenu('modos')}
            />
          ) : (
            <div className="portada">
              {/**
                * **Los dos modos, como dos puertas del mismo tamaño** (vuelta
                * 92, con la forma de la cabina desde la 99). Son tarjetas enteras
                * y no botones sueltos: se pincha donde sea. Las dos llevan su
                * acción en verde y ninguna destaca sobre la otra (la regla de la
                * 94: el color no designa un ganador que nadie ha elegido).
                */}
              <button
                type="button"
                className="portada__modo portada__modo--solo"
                onClick={() => setMenu('entrenamiento')}
              >
                <span className="portada__cuando">01 · Solo</span>
                <Icono nombre="entrenamiento" className="portada__dibujo" />
                <span className="portada__nombre">Entrenamiento</span>
                <span className="portada__sub">Dianas, muñecos que disparan y ronda con explosivo.</span>
                <span className="portada__cta">Configurar ▸</span>
              </button>
              {/* **Multijugador, la segunda puerta** (vuelta 101; era «Duelo
                  1v1» desde la 66). El todos contra todos de la 100 vivía dentro
                  del duelo, y no va a ser el único modo: detrás de esta puerta
                  está el lobby, donde se elige a qué se juega. */}
              <button
                type="button"
                className="portada__modo portada__modo--alguien"
                onClick={() => window.location.assign(NET.rutaDuelo)}
              >
                <span className="portada__cuando">02 · Con alguien</span>
                <Icono nombre="multijugador" className="portada__dibujo" />
                <span className="portada__nombre">Multijugador</span>
                <span className="portada__sub">Duelo, equipos de 2 a 5 o todos contra todos. Crea una sala y manda el enlace.</span>
                <span className="portada__cta">Crear sala ▸</span>
              </button>

              {/* **Los controles se miran, no se leen** (vuelta 94), y la tecla
                  la dice el bind (vuelta 97). Desde la 99 van en la franja de
                  abajo de la portada, como en la maqueta. */}
              <div className="portada__controles">
                <span className="cab-rotulo">Controles</span>
                <button type="button" className="button button--quiet button--pequeno portada__como" onClick={() => setComo(true)}>
                  Cómo se juega
                </button>
                <ul className="teclas">
                  <li className="teclas__par">
                    <kbd className="cab-tecla">{keyLabel(keysOf('shoot', binds)[0])}</kbd>
                    <span className="teclas__que">disparar</span>
                  </li>
                  {TECLAS_DE_ENTRADA.filter((t) => t.siempre || MOVEMENT.enabled).map((t) => (
                    <li key={t.que} className="teclas__par">
                      <kbd className="cab-tecla">{teclaDeFila(t, binds)}</kbd>
                      <span className="teclas__que">{t.que}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Cabina>
      )}

      {como && phase === PHASE.IDLE && (
        <div className="overlay overlay--encima" onMouseDown={(e) => e.stopPropagation()}>
          <ComoSeJuega binds={binds} onCerrar={() => setComo(false)} />
        </div>
      )}

      {!avatarDebug && phase === PHASE.PAUSED && (
        <div className="overlay" onMouseDown={panelOpen ? undefined : lock}>
          {armouryOpen ? (
            armouryPanel
          ) : optionsOpen ? (
            optionsPanel
          ) : (
            <div className="panel">
              <h2 className="panel__title panel__title--small">Pausa</h2>
              <p className="panel__body">Click en cualquier sitio para continuar.</p>
              <div className="panel__actions">
                <button
                  type="button"
                  className="button button--primary"
                  onMouseDown={swallowClick}
                  onClick={lock}
                  autoFocus
                >
                  Reanudar
                </button>
                {armouryButton}
                {optionsButton}
                <button
                  type="button"
                  className="button button--quiet"
                  onMouseDown={swallowClick}
                  onClick={finishSession}
                >
                  Finalizar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!avatarDebug && phase === PHASE.FINISHED && summary && (
        <div className="overlay">
          <Summary summary={summary} onRestart={restart} onBackToStart={backToStart} />
        </div>
      )}
    </div>
  )
}
