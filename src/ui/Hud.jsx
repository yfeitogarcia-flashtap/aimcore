import { forwardRef, useImperativeHandle, useRef } from 'react'
import { VektorMark } from './Logo.jsx'
import WeaponSilhouette from './WeaponSilhouette.jsx'
import { STAR_PATH } from './Stars.jsx'
import { ICON_PATHS } from './iconPaths.js'
import { FEEDBACK, PLAYER, WEAPONS } from '../config.js'
import { ratio } from './Summary.jsx'

/**
 * Engranaje de la marca de opciones, en el mismo lienzo de 24×24 que la
 * estrella. Se calcula en vez de pegar un `d` de treinta y dos puntos escrito a
 * mano: así se lee de dónde sale cada número y cambiar el número de dientes no
 * obliga a redibujar nada. Es contorno puro, sin relleno, como el resto del HUD.
 */
const GEAR_PATH = (() => {
  const teeth = 8
  const cx = 12
  const cy = 12
  const outer = 10.1
  const root = 7.6
  // Media separación entre dientes. El diente ocupa la parte de arriba y el
  // valle la de abajo, con los flancos inclinados entre medias.
  const half = Math.PI / teeth
  const tip = half * 0.36
  const base = half * 0.66
  const points = []
  for (let i = 0; i < teeth; i++) {
    const a = (i * 2 * Math.PI) / teeth
    for (const [angle, radius] of [
      [a - base, root],
      [a - tip, outer],
      [a + tip, outer],
      [a + base, root],
    ]) {
      points.push(`${(cx + Math.cos(angle) * radius).toFixed(2)} ${(cy + Math.sin(angle) * radius).toFixed(2)}`)
    }
  }
  return `M${points.join(' L')} Z`
})()

/**
 * HUD de partida: cronómetro, aciertos, fallos, FPS, cargador y arma.
 *
 * Se actualiza escribiendo directamente en el DOM desde el bucle del motor, no
 * con estado de React: a 240 Hz un `setState` por frame sería el trabajo más
 * caro de todo el frame. Además sólo se toca el DOM cuando el valor cambia de
 * verdad — el cronómetro cambia ~10 veces por segundo, no 240.
 */
/**
 * La caja del escudo, sacada de su propio `viewBox`: los segmentos se colocan
 * dentro de ella. Escribirla a mano sería un segundo sitio del que sale el
 * tamaño del icono, y volvería a desincronizarse al retrazar la referencia.
 */
const SHIELD_BOX = (() => {
  const [x, y, width, height] = ICON_PATHS.shield.viewBox.split(' ').map(Number)
  return { x, y, width, height }
})()

/**
 * Cómo dispara, en una palabra. Un cuchillo no es «SEMI»: no dispara (vuelta
 * 71). Sale del modo del arma, que es el mismo campo que mira el motor.
 */
function modoDelArma(weaponKey) {
  const modo = WEAPONS[weaponKey]?.mode
  if (modo === 'melee') return 'CUERPO A CUERPO'
  return modo === 'auto' ? 'AUTO' : 'SEMI'
}

const Hud = forwardRef(function Hud({ weaponKey, suppressed, duelo = false }, ref) {
  const fpsRef = useRef(null)
  const timeRef = useRef(null)
  const timeLabelRef = useRef(null)
  const hitsRef = useRef(null)
  const missesRef = useRef(null)
  const ammoRef = useRef(null)
  const magazineRef = useRef(null)
  const ammoBlockRef = useRef(null)
  const reloadRef = useRef(null)
  const reloadBarRef = useRef(null)
  const helpRef = useRef(null)
  const helpTimer = useRef(0)
  /** Tinte direccional de daño: la cuña del borde hacia quien te ha disparado. */
  const damageArcRef = useRef(null)
  const starsRef = useRef(null)
  // Cinco nodos fijos: encender estrellas es cambiar clases, no crear elementos.
  const starRefs = useRef([])
  // Vida y escudo. Mismo trato que el resto del HUD: nodos fijos y clases.
  const vitalsRef = useRef(null)
  const healthBarRef = useRef(null)
  const healthValueRef = useRef(null)
  const shieldRefs = useRef([])
  const chargesRef = useRef(null)
  const helmetRef = useRef(null)
  const applyRef = useRef(null)
  const applyBarRef = useRef(null)
  const downedRef = useRef(null)
  const downedCountRef = useRef(null)
  const vignetteRef = useRef(null)
  const graceRef = useRef(null)
  const graceBarRef = useRef(null)
  /** Marcador: el bloque entero y las cuatro cifras de la fila del jugador. */
  const scoreboardRef = useRef(null)
  const scoreKillsRef = useRef(null)
  const scoreDeathsRef = useRef(null)
  const scoreAccuracyRef = useRef(null)
  const scoreRatioRef = useRef(null)

  // Últimos valores mostrados, como números: comparamos antes de formatear,
  // así que un frame que no cambia nada no genera ni un string.
  const lastValues = useRef({
    deciseconds: -1,
    endless: null,
    hits: -1,
    misses: -1,
    fps: -1,
    ammo: -1,
    magazine: -1,
    reloading: null,
    low: null,
    countUp: null,
    scoring: null,
    stars: -1,
    combat: null,
    health: -1,
    segments: -1,
    charges: -1,
    helmet: null,
    graceTenths: -1,
    applying: null,
    lowHealth: null,
    alive: null,
    grace: null,
    respawnTenths: -1,
    scoreboard: null,
    scoreKills: -1,
    scoreDeaths: -1,
    scoreAccuracy: -1,
  })

  useImperativeHandle(ref, () => ({
    update(stats) {
      const last = lastValues.current

      const fps = Math.round(stats.fps)
      if (fps !== last.fps && fpsRef.current) {
        fpsRef.current.textContent = String(fps)
        last.fps = fps
      }

      // Sin cronómetro el hueco lo ocupa el símbolo de infinito, y el rótulo
      // pasa de "tiempo restante" a decir sólo que la sesión no acaba sola.
      if (stats.endless !== last.endless || stats.countUp !== last.countUp) {
        if (timeRef.current) {
          timeRef.current.textContent = stats.endless ? '∞' : '0.0'
          timeRef.current.classList.toggle('hud__value--endless', stats.endless)
        }
        if (timeLabelRef.current) {
          timeLabelRef.current.textContent = stats.endless ? 'libre' : 'tiempo'
        }
        last.endless = stats.endless
        last.countUp = stats.countUp
        last.deciseconds = -1
      }

      // Con explosivo el reloj sube en vez de bajar: enseñar lo que queda sería
      // poner la cuenta atrás de la bomba en el HUD, y ésa sólo se oye.
      if (!stats.endless) {
        const deciseconds = stats.countUp
          ? Math.floor(stats.timeLeftMs / 100)
          : Math.ceil(stats.timeLeftMs / 100)
        if (deciseconds !== last.deciseconds && timeRef.current) {
          timeRef.current.textContent = (deciseconds / 10).toFixed(1)
          last.deciseconds = deciseconds
        }
      }

      // Estrellas en vivo: sólo aparecen donde hay puntuación, y se recalculan
      // con cada disparo y con el paso del tiempo, no sólo al terminar.
      if (stats.scoring !== last.scoring) {
        if (starsRef.current) starsRef.current.hidden = !stats.scoring
        last.scoring = stats.scoring
        last.stars = -1
      }
      if (stats.scoring && stats.stars !== last.stars) {
        for (let i = 0; i < starRefs.current.length; i++) {
          const star = starRefs.current[i]
          if (star) star.classList.toggle('star--on', i < stats.stars)
        }
        last.stars = stats.stars
      }
      if (stats.hits !== last.hits && hitsRef.current) {
        hitsRef.current.textContent = String(stats.hits)
        last.hits = stats.hits
      }
      if (stats.misses !== last.misses && missesRef.current) {
        missesRef.current.textContent = String(stats.misses)
        last.misses = stats.misses
      }
      /**
       * **Un cuchillo no tiene cargador, y eso se dice** (vuelta 71). Con
       * `magazine: 0` el contador pondría «0 / 0», que es exactamente lo que un
       * arma rota pone en pantalla. El infinito ocupa el mismo sitio y no
       * miente: no hay munición que contar.
       */
      const sinCargador = stats.magazine === 0
      const municion = sinCargador ? '∞' : String(stats.ammo)
      if (municion !== last.ammo && ammoRef.current) {
        ammoRef.current.textContent = municion
        last.ammo = municion
      }
      const tope = sinCargador ? '' : String(stats.magazine)
      if (tope !== last.magazine && magazineRef.current) {
        magazineRef.current.textContent = tope
        magazineRef.current.previousElementSibling?.classList.toggle('hud__ammo-sep--oculta', sinCargador)
        last.magazine = tope
      }

      // Parpadeo del contador: estado derivado, no un temporizador aparte.
      const low = !sinCargador && !stats.reloading && stats.ammo <= Math.max(1, Math.floor(stats.magazine * 0.2))
      if (low !== last.low && ammoBlockRef.current) {
        ammoBlockRef.current.classList.toggle('hud__ammo--low', low)
        last.low = low
      }

      if (stats.reloading !== last.reloading) {
        if (reloadRef.current) reloadRef.current.hidden = !stats.reloading
        last.reloading = stats.reloading
      }
      if (stats.reloading && reloadBarRef.current) {
        reloadBarRef.current.style.transform = `scaleX(${stats.reloadProgress.toFixed(3)})`
      }

      this.updateVitals(stats, last)
    },

    /**
     * Vida, escudo, casco y la cuenta de reaparición.
     *
     * Todo el bloque **sólo existe donde hay quien dispare** (`stats.combat`):
     * en la sala vacía o con dianas que no devuelven el fuego, una barra de vida
     * llena para siempre sería ruido en pantalla.
     */
    updateVitals(stats, last) {
      if (stats.combat !== last.combat) {
        if (vitalsRef.current) vitalsRef.current.hidden = !stats.combat
        last.combat = stats.combat
      }
      if (!stats.combat) return

      const health = Math.round(stats.health)
      if (health !== last.health) {
        if (healthBarRef.current) {
          healthBarRef.current.style.transform = `scaleX(${(health / stats.maxHealth).toFixed(3)})`
        }
        if (healthValueRef.current) healthValueRef.current.textContent = String(health)
        last.health = health
      }

      // Parpadeo de vida baja: el mismo mecanismo del cargador corto —una clase
      // que sale de un estado derivado—, no un temporizador propio.
      if (stats.lowHealth !== last.lowHealth) {
        if (vitalsRef.current) vitalsRef.current.classList.toggle('vitals--low', stats.lowHealth)
        last.lowHealth = stats.lowHealth
      }

      if (stats.shieldSegments !== last.segments) {
        for (let i = 0; i < shieldRefs.current.length; i++) {
          const segment = shieldRefs.current[i]
          if (segment) segment.classList.toggle('shield__segment--on', i < stats.shieldSegments)
        }
        last.segments = stats.shieldSegments
      }
      if (stats.charges !== last.charges && chargesRef.current) {
        chargesRef.current.textContent = `×${stats.charges}`
        chargesRef.current.classList.toggle('vitals__charges--empty', stats.charges === 0)
        last.charges = stats.charges
      }
      if (stats.helmet !== last.helmet && helmetRef.current) {
        helmetRef.current.classList.toggle('vitals__helmet--on', stats.helmet)
        last.helmet = stats.helmet
      }

      if (stats.applying !== last.applying) {
        if (applyRef.current) applyRef.current.hidden = !stats.applying
        last.applying = stats.applying
      }
      if (stats.applying && applyBarRef.current) {
        applyBarRef.current.style.transform = `scaleX(${stats.applyProgress.toFixed(3)})`
      }

      // Abatido: el rótulo, la cuenta y la viñeta. Décimas, como el resto del
      // HUD, y sólo se toca el DOM cuando cambia la décima.
      if (stats.alive !== last.alive) {
        if (downedRef.current) downedRef.current.hidden = stats.alive
        if (vignetteRef.current) vignetteRef.current.hidden = stats.alive
        last.alive = stats.alive
        last.respawnTenths = -1
      }
      if (!stats.alive) {
        const tenths = Math.ceil(stats.respawnLeftMs / 100)
        if (tenths !== last.respawnTenths && downedCountRef.current) {
          downedCountRef.current.textContent = `reapareces en ${(tenths / 10).toFixed(1)} s`
          last.respawnTenths = tenths
        }
        // La viñeta se aclara según se acerca la reaparición: el oscurecimiento
        // **es** la cuenta atrás, sin tener que leer el número.
        if (vignetteRef.current) {
          const left = stats.respawnMs > 0 ? stats.respawnLeftMs / stats.respawnMs : 0
          vignetteRef.current.style.opacity = (0.25 + 0.75 * left).toFixed(3)
        }
      }

      // Segundos de gracia tras reaparecer.
      const grace = stats.invulnerableLeftMs > 0
      if (grace !== last.grace) {
        if (graceRef.current) graceRef.current.hidden = !grace
        last.grace = grace
        last.graceTenths = -1
      }
      if (grace) {
        const tenths = Math.ceil(stats.invulnerableLeftMs / 100)
        if (tenths !== last.graceTenths && graceBarRef.current) {
          graceBarRef.current.style.transform = `scaleX(${(stats.invulnerableLeftMs / stats.invulnerableMs).toFixed(3)})`
          last.graceTenths = tenths
        }
      }

      // **El marcador.** Abierto o cerrado es un `hidden`, y sus cifras sólo se
      // escriben **mientras está abierto**: el resto del tiempo no hay nada que
      // mirar y escribirlas sería trabajo por frame a cambio de nada.
      if (stats.scoreboard !== last.scoreboard) {
        if (scoreboardRef.current) scoreboardRef.current.hidden = !stats.scoreboard
        last.scoreboard = stats.scoreboard
      }
      if (stats.scoreboard) {
        if (stats.kills !== last.scoreKills) {
          if (scoreKillsRef.current) scoreKillsRef.current.textContent = String(stats.kills)
          last.scoreKills = stats.kills
        }
        if (stats.deaths !== last.scoreDeaths) {
          if (scoreDeathsRef.current) scoreDeathsRef.current.textContent = String(stats.deaths)
          last.scoreDeaths = stats.deaths
        }
        // Bajas y muertes mueven el KD, así que se recalcula con cualquiera de
        // las dos y con la precisión, que cambia en cada disparo.
        const accuracy = Math.round(stats.accuracy * 10)
        if (accuracy !== last.scoreAccuracy || stats.kills !== last.scoreKills) {
          if (scoreAccuracyRef.current) {
            scoreAccuracyRef.current.textContent = `${(accuracy / 10).toFixed(1)}%`
          }
          last.scoreAccuracy = accuracy
        }
        if (scoreRatioRef.current) {
          scoreRatioRef.current.textContent = ratio(stats.kills, stats.deaths)
        }
      }
    },

    /**
     * **De qué lado te han disparado.** Una cuña en el borde de la pantalla
     * centrada en el ángulo que da el motor: 0 es justo delante y positivo a la
     * derecha, que es exactamente cómo cuenta los grados un `conic-gradient`
     * —desde arriba y en el sentido del reloj—, así que el ángulo se escribe tal
     * cual y no hay ninguna conversión que pueda salir espejada.
     *
     * Va por la Web Animations API como el anillo de la mira, no por estado de
     * React: recibir un disparo no puede repintar el HUD.
     */
    damageFrom(bearingRad, severity = 0.5) {
      const element = damageArcRef.current
      if (!element) return
      element.style.setProperty('--damage-angle', `${(bearingRad * 180) / Math.PI}deg`)
      const peak = FEEDBACK.damageArcOpacity * (0.5 + 0.5 * Math.min(1, Math.max(0, severity)))
      element.animate(
        [
          { opacity: 0 },
          { opacity: peak, offset: 0.16 },
          { opacity: 0 },
        ],
        { duration: FEEDBACK.damageArcMs, easing: 'ease-out' },
      )
    },

    /** Aviso temporal que se retira solo. */
    showHelp(text, durationMs) {
      const element = helpRef.current
      if (!element) return
      element.textContent = text
      element.hidden = false
      window.clearTimeout(helpTimer.current)
      helpTimer.current = window.setTimeout(() => {
        element.hidden = true
      }, durationMs)
    },
  }), [])

  return (
    // El bloque de FPS y el del arma van fuera de `.hud` a propósito: `.hud` se
    // centra con un `transform`, y un elemento posicionado dentro de un
    // ancestro transformado se ancla a ese ancestro, no a la ventana.
    <>
      {/* La marca, discreta y sin texto, en la esquina de enfrente del contador
          de FPS. Es firma, no información: mismo gris apagado y ni un rótulo. */}
      <VektorMark className="hud__mark" />

      {/* El tinte direccional de daño. Va el primero y a pantalla completa, pero
          con el centro recortado por su máscara: cuando te disparan, lo último
          que se puede tapar es el sitio al que hay que apuntar. */}
      <div className="hud__damage-arc" ref={damageArcRef} aria-hidden="true" />

      {/*
        **El marcador.** Una tabla de una fila: cabecera, la tuya, y nada más.
        El layout es una rejilla de cinco columnas con el nick a la izquierda y
        las cifras a la derecha, así que **una fila más es un div más** el día
        que haya con quién compararse. Hoy no lo hay —no hay cuentas ni
        multijugador—, y una lista de rivales vacía o inventada diría que sí.
      */}
      {/**
        * **Lo que el duelo no tiene no se esconde: no se monta** (vuelta 73).
        *
        * Tres bloques son del entrenamiento y sólo de él, y no por olvido: el
        * duelo **no tiene puntuación ni dianas** (vuelta 45), así que aciertos,
        * fallos, estrellas y el reloj de sesión no miden nada ahí — y el
        * marcador de TAB es de una sesión contra muñecos, que es otra cosa que
        * las rondas. El 1v1 lleva su propio marcador de ronda, que es de la
        * partida y vive en su página.
        *
        * Se decide con **una bandera y no con dos componentes**: es la
        * convención de la vuelta 63: una diferencia entre modos se declara y se
        * ve, o es un fallo de producto. Todo lo demás —la marca, los FPS, el
        * engranaje, la vida, el escudo, el casco, la viñeta de abatido, el
        * bloque de arma y la ayuda— sale igual en los dos sitios porque **es el
        * mismo componente**.
        */}
      {!duelo && (
      <div className="scoreboard" ref={scoreboardRef} hidden>
        <div className="scoreboard__panel">
          <div className="scoreboard__head">
            <span className="scoreboard__title">Marcador</span>
            <span className="scoreboard__mode">sesión en curso</span>
          </div>
          <div className="scoreboard__row scoreboard__row--head">
            <span>Jugador</span>
            <span>Bajas</span>
            <span>Muertes</span>
            <span>Precisión</span>
            <span>KD</span>
          </div>
          <div className="scoreboard__row scoreboard__row--you">
            <span className="scoreboard__nick">{PLAYER.nick}</span>
            <span ref={scoreKillsRef}>0</span>
            <span ref={scoreDeathsRef}>0</span>
            <span ref={scoreAccuracyRef}>0.0%</span>
            <span ref={scoreRatioRef}>0.00</span>
          </div>
        </div>
      </div>
      )}

      <div className="hud__fps">
        <span className="hud__fps-value" ref={fpsRef}>
          0
        </span>
        <span className="hud__fps-unit">fps</span>
      </div>

      {/* Sin tablero de acciones en la sala, las opciones sólo se alcanzan por
          teclado: el engranaje recuerda con qué tecla, sin ocupar más sitio que
          el contador que tiene encima. Es un rótulo, no un botón — con el ratón
          capturado no habría dónde pulsarlo. */}
      <div className="hud__options">
        <svg className="hud__gear" viewBox="0 0 24 24" role="presentation">
          <path d={GEAR_PATH} />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
        <span className="hud__options-key">ESC</span>
      </div>

      {!duelo && (
      <div className="hud__stars" ref={starsRef} hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <svg
            key={i}
            className="star"
            viewBox="0 0 24 24"
            role="presentation"
            ref={(node) => {
              starRefs.current[i] = node
            }}
          >
            <path d={STAR_PATH} />
          </svg>
        ))}
      </div>

      )}

      {!duelo && (
      <div className="hud">
        <div className="hud__stat hud__stat--timer">
          <span className="hud__value" ref={timeRef}>
            0.0
          </span>
          <span className="hud__label" ref={timeLabelRef}>
            tiempo
          </span>
        </div>
        <div className="hud__stat">
          <span className="hud__value" ref={hitsRef}>
            0
          </span>
          <span className="hud__label">aciertos</span>
        </div>
        <div className="hud__stat">
          <span className="hud__value hud__value--muted" ref={missesRef}>
            0
          </span>
          <span className="hud__label">fallos</span>
        </div>
      </div>
      )}

      {/* Vida y escudo, abajo a la izquierda: lejos de la mira y lejos del
          cargador, que es lo otro que se mira de reojo. La cruz y el escudo son
          CSS puro —no hay iconos que cargar, como no hay assets de nada—. */}
      <div className="vitals" ref={vitalsRef} hidden>
        <div className="vitals__row">
          <span className="vitals__cross" role="presentation" />
          <span className="vitals__track">
            <span className="vitals__bar" ref={healthBarRef} />
          </span>
          <span className="vitals__value" ref={healthValueRef}>
            {PLAYER.maxHealth}
          </span>
        </div>

        <div className="vitals__row vitals__row--gear">
          {/* El escudo son literalmente tres segmentos **recortados con la
              silueta trazada**: lo que se ve encendido es lo que queda. El
              recorte va dentro del SVG y no en CSS porque `clip-path: path()`
              no escala con el elemento y el trazado viene en las coordenadas
              de la referencia, no en píxeles de HUD. */}
          <svg
            className="shield"
            viewBox={ICON_PATHS.shield.viewBox}
            role="presentation"
            aria-hidden="true"
          >
            <defs>
              <clipPath id="hud-shield-clip">
                <path d={ICON_PATHS.shield.d} />
              </clipPath>
            </defs>
            <g clipPath="url(#hud-shield-clip)">
              {[0, 1, 2].map((i) => (
                <rect
                  key={i}
                  className="shield__segment"
                  x={SHIELD_BOX.x}
                  y={SHIELD_BOX.y + (SHIELD_BOX.height * (2 - i)) / 3}
                  width={SHIELD_BOX.width}
                  // Un pelo menos de un tercio: la rendija entre segmentos es lo
                  // que hace que se cuenten tres y no una barra.
                  height={(SHIELD_BOX.height / 3) * 0.9}
                  ref={(node) => {
                    shieldRefs.current[i] = node
                  }}
                />
              ))}
            </g>
          </svg>
          <span className="vitals__charges vitals__charges--empty" ref={chargesRef}>
            ×0
          </span>
          {/* El casco no tiene barra: o está o no está. Va trazado con potrace
              desde la referencia y pintado con `evenodd`, que es lo que deja la
              visera hueca; sin ella un casco es un pentágono cualquiera. */}
          <svg
            className="vitals__helmet"
            viewBox={ICON_PATHS.helmet.viewBox}
            role="presentation"
            aria-hidden="true"
            ref={helmetRef}
          >
            <path d={ICON_PATHS.helmet.d} fillRule="evenodd" />
          </svg>
        </div>

        <span className="vitals__apply" ref={applyRef} hidden>
          <span className="vitals__apply-bar" ref={applyBarRef} />
        </span>
      </div>

      {/* Viñeta de abatido: **no** un negro total. Lo que se oscurece son los
          bordes, y se va aclarando según se acerca la reaparición, así que el
          propio oscurecimiento es la cuenta atrás. Ver qué te ha matado sigue
          siendo información. */}
      <div className="vignette" ref={vignetteRef} hidden />

      <div className="downed" ref={downedRef} hidden>
        <strong className="downed__title">ABATIDO</strong>
        <span className="downed__count" ref={downedCountRef} />
      </div>

      {/* Los segundos de gracia: un marco encendido y lo que queda. Nunca es
          invisible para quien lo tiene, que es de lo que sirve. */}
      <div className="grace" ref={graceRef} hidden>
        <div className="grace__badge">
          <span className="grace__label">INVULNERABLE</span>
          <span className="grace__track">
            <span className="grace__bar" ref={graceBarRef} />
          </span>
        </div>
      </div>

      {/**
        * **El bloque de arma, abajo a la derecha y grande** (vuelta 67).
        *
        * Estaba centrado bajo la mira, que es donde más estorba —justo debajo de
        * lo único que hay que mirar— y a un tamaño en el que la silueta no se
        * leía. La esquina inferior derecha es donde la busca cualquiera que haya
        * jugado a otra cosa, y es la esquina que estaba vacía: el HUD tenía
        * arriba los contadores, arriba a la derecha los FPS y abajo a la
        * izquierda la vida, y ahí no había nada.
        *
        * La silueta manda —es lo que identifica el arma de un vistazo— y debajo
        * va una fila con lo que hay que saber sin abrir nada: **qué arma, cómo
        * dispara y si lleva supresor**, y la munición. Esa ficha corta es lo
        * único que se añade: con tres armas y un supresor que se conmuta con el
        * clic derecho, «cuál llevo y cómo va» era una pregunta sin respuesta en
        * pantalla.
        */}
      <div className="hud__weapon">
        <WeaponSilhouette weaponKey={weaponKey} suppressed={suppressed} />

        <div className="hud__weapon-row">
          <span className="hud__weapon-name">
            {WEAPONS[weaponKey]?.label}
            <span className="hud__weapon-tag">
              {modoDelArma(weaponKey)}
              {suppressed ? ' · SIL' : ''}
            </span>
          </span>

          <div className="hud__ammo" ref={ammoBlockRef}>
            <span className="hud__ammo-current" ref={ammoRef}>
              0
            </span>
            <span className="hud__ammo-sep">/</span>
            <span className="hud__ammo-max" ref={magazineRef}>
              0
            </span>
          </div>
        </div>

        <div className="hud__reload" ref={reloadRef} hidden>
          <span className="hud__reload-label">recargando</span>
          <span className="hud__reload-track">
            <span className="hud__reload-bar" ref={reloadBarRef} />
          </span>
        </div>
      </div>

      {/* **La ayuda se queda en el centro**, que es donde se lee una frase. Iba
          dentro del bloque de arma y se habría ido con él a la esquina. */}
      <p className="hud__help" ref={helpRef} hidden />
    </>
  )
})

export default Hud
