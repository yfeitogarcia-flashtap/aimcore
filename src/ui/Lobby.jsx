import { NOMBRE_DE_MODO, reglasDeMapa } from '../game/arsenal.js'
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import Cabina from './Cabina.jsx'
import ScenarioThumbnail from './ScenarioThumbnail.jsx'
import {
  BANDOS,
  MODOS_MULTIJUGADOR,
  ROUNDS,
  TODOS,
  bandoDeRanura,
  capacidadDeTodos,
  colorDeJugador,
  escenariosDeSala,
  esModoDeEquipos,
  modoMultijugador,
  rangoDeJugadores,
} from '../config.js'

import '../styles.css'

/**
 * **El lobby del multijugador** (vuelta 101).
 *
 * Es la pantalla de Entrenamiento para jugar con gente, **con las mismas
 * piezas**: tarjetas de la cabina a la izquierda, botones en vez de
 * desplegables, y a la derecha la columna pegada con lo que se va a jugar y la
 * acción. Hasta la 100 esto era el menú de la página del duelo —desplegables
 * sobre el mapa en movimiento— y no tenía nada que ver con el resto del juego,
 * que es justo lo que la cabina (vuelta 99) vino a quitar.
 *
 * **Aquí no se decide nada**: se pinta el estado de la sala tal como lo manda
 * el servidor (`MSG.LOBBY`) y se piden cosas. Quién puede cambiar la
 * configuración, cuándo se puede lanzar y cuántos faltan lo dice el servidor,
 * con la misma función que decide si lanzar hace algo (`Lobby.requisitos`): un
 * botón encendido que el servidor ignora sería el fallo de la vuelta 67.
 */

function Grupo({ titulo, ancho = false, inerte = false, children }) {
  return (
    <section className={`training__grupo cab-superficie${ancho ? ' training__grupo--ancho' : ''}${inerte ? ' field--inerte' : ''}`}>
      <h3 className="training__grupo-titulo">{titulo}</h3>
      {children}
    </section>
  )
}

/**
 * **El mapa se elige en un carrusel**, con el plano de cada uno dibujado desde
 * sus datos (vuelta 39: lo que se dibuja de unos datos no se guarda como
 * imagen). Sólo salen los mapas publicados para ese modo.
 */
function Carrusel({ modo, mapa, puede, onElegir }) {
  const pista = useRef(null)
  const mapas = escenariosDeSala(modo)
  const claves = Object.keys(mapas)
  const mover = (lado) => pista.current?.scrollBy({ left: lado * 220, behavior: 'smooth' })
  return (
    <div className="lobby-carrusel">
      <button type="button" className="lobby-carrusel__flecha" aria-label="Mapas anteriores" onClick={() => mover(-1)}>‹</button>
      <div className="lobby-carrusel__pista" ref={pista}>
        {claves.map((clave) => (
          <button
            key={clave}
            type="button"
            className="scenarios__option lobby-carrusel__mapa"
            aria-pressed={clave === mapa}
            disabled={!puede}
            onClick={() => onElegir(clave)}
          >
            <ScenarioThumbnail scenarioKey={clave} definicion={mapas[clave]} />
            <span className="scenarios__name">{mapas[clave].label}</span>
            {/* En el todos contra todos cada mapa admite los que quepan por sus
                salidas (vuelta 105): se elige sabiéndolo, no al lanzar. */}
            {!esModoDeEquipos(modo) && (
              <span className="lobby-carrusel__plazas">{rangoDeJugadores(capacidadDeTodos(mapas[clave]))}</span>
            )}
          </button>
        ))}
      </div>
      <button type="button" className="lobby-carrusel__flecha" aria-label="Mapas siguientes" onClick={() => mover(1)}>›</button>
    </div>
  )
}

/** Un hueco: quién lo ocupa y si está listo, o el botón para sentarse. */
function Hueco({ hueco, miembro, tu, anfitrion, color, etiqueta, onSentarse }) {
  if (!miembro) {
    // Un hueco libre dice **de qué color es** en el todos contra todos, que es
    // lo que se elige al pinchar; en equipos, sólo que está libre.
    return (
      <button type="button" className="lobby-hueco lobby-hueco--libre" title="Sentarse aquí" onClick={() => onSentarse(hueco)}>
        <span className="lobby-hueco__color" style={{ background: color }} aria-hidden="true" />
        <span className="lobby-hueco__nick">{etiqueta ?? 'Hueco libre'}</span>
        <span className="lobby-hueco__estado">libre</span>
      </button>
    )
  }
  const soyYo = miembro.id === tu
  return (
    <div className={`lobby-hueco${miembro.l ? ' lobby-hueco--listo' : ''}${soyYo ? ' lobby-hueco--yo' : ''}${miembro.c ? ' lobby-hueco--caido' : ''}`}>
      <span className="lobby-hueco__color" style={{ background: color }} aria-hidden="true" />
      <span className="lobby-hueco__nick">
        {miembro.n}{soyYo ? ' · tú' : ''}{miembro.id === anfitrion ? ' · anfitrión' : ''}
      </span>
      <span className="lobby-hueco__estado">
        {miembro.c ? 'sin conexión' : miembro.p ? 'jugando' : miembro.l ? 'LISTO' : 'esperando'}
      </span>
    </div>
  )
}

/**
 * **Cómo se llama cada opción de compra** (vuelta 102), en el selector y en el
 * resumen: cero es «sin fase» y `compraSinLimite` es la que cierra un «listo»
 * de todos. Una sola función para que las dos columnas digan lo mismo.
 */
function nombreDeCompra(segundos, largo = false) {
  if (segundos === 0) return largo ? 'sin fase (rápida)' : 'Sin fase'
  if (segundos === ROUNDS.compraSinLimite) return largo ? 'sin límite · hasta que todos estén listos' : 'Sin límite'
  return `${segundos} s`
}

function Lobby({ estado, codigo, enlace, reconectar, api }) {
  const [copiado, setCopiado] = useState(null)
  useEffect(() => {
    if (!copiado) return undefined
    const t = setTimeout(() => setCopiado(null), 1600)
    return () => clearTimeout(t)
  }, [copiado])

  if (!estado) {
    return (
      <Cabina seccion="multijugador" titulo="Multijugador" onIr={api.ir} onMarca={() => api.ir('inicio')}>
        <div className="lobby-cargando">Conectando con la sala…</div>
      </Cabina>
    )
  }

  const tu = estado.tu
  const yo = estado.m.find((m) => m.id === tu) ?? null
  const anfitrion = estado.anf
  const soyAnfitrion = tu === anfitrion
  const ficha = modoMultijugador(estado.modo)
  const equipos = esModoDeEquipos(estado.modo)
  const partida = estado.pt
  const enJuego = partida.e === 'juego'
  const puedeConfigurar = soyAnfitrion && !enJuego
  const mapas = escenariosDeSala(estado.modo)
  const mapa = mapas[estado.mapa]
  /**
   * **Con qué armas se juega lo dice el mapa, y el lobby lo enseña** (vuelta
   * 106): Armería, Equipadas o Peanas. No es un control del anfitrión —el modo
   * de armas es del mapa, como su física (vuelta 72)—, es una fila más.
   */
  const reglas = reglasDeMapa(mapa)
  const reparte = reglas.modo !== 'armeria'
  const porHueco = new Map(estado.m.filter((m) => m.h !== null).map((m) => [m.h, m]))
  const esperando = estado.m.filter((m) => m.h === null)
  const nombreAnfitrion = estado.m.find((m) => m.id === anfitrion)?.n ?? '—'
  const req = estado.req

  const copiar = async (texto, que) => {
    const bien = await api.copiar(texto)
    setCopiado(bien ? que : 'selecciona y copia')
  }

  /**
   * **Los huecos**: dos columnas en un modo por equipos —la ranura par es el
   * bando azul y la impar el magenta, como en el duelo de siempre— y una
   * rejilla con el color de cada butaca en el todos contra todos.
   */
  const huecos = []
  for (let h = 0; h < estado.huecos; h++) huecos.push(h)
  const columnas = equipos
    ? [0, 1].map((bando) => ({ bando, huecos: huecos.filter((h) => bandoDeRanura(h) === bando) }))
    : [{ bando: null, huecos }]
  const colorDe = (h) => (equipos ? BANDOS[bandoDeRanura(h)].color : colorDeJugador(h).color)
  const listosPorBando = [0, 1].map((b) => estado.m.filter((m) => m.l && m.h !== null && bandoDeRanura(m.h) === b).length)

  const resumen = [
    ['Modo', ficha.label],
    ['Mapa', mapa?.label ?? '—'],
    ['Compra', !equipos ? 'no hay' : reparte ? 'el mapa reparte' : nombreDeCompra(estado.compra, true)],
    ['Armas', reglas.armas ? `${NOMBRE_DE_MODO[reglas.modo]} · ${reglas.armas.length} del mapa` : NOMBRE_DE_MODO[reglas.modo]],
    ...(equipos ? [] : [['Jugadores', rangoDeJugadores(capacidadDeTodos(mapa))]]),
    ['Listos', equipos
      ? `${listosPorBando[0]} azul · ${listosPorBando[1]} magenta`
      : `${req.listos} de ${estado.huecos} (mín. ${req.minimo})`],
    ['Para ganar', equipos
      ? `${Math.floor(ROUNDS.maxRondas / 2) + 1} rondas de ${ROUNDS.maxRondas}`
      : `${TODOS.bajasParaGanar} bajas o ${TODOS.minutos} min`],
  ]

  return (
    <Cabina
      seccion="multijugador"
      titulo={<>Multijugador<small>sala {codigo}</small></>}
      estado={<span>{soyAnfitrion ? 'eres el anfitrión' : `anfitrión: ${nombreAnfitrion}`}</span>}
      onIr={api.ir}
      onMarca={() => api.ir('inicio')}
    >
      <div className="training lobby" onMouseDown={(event) => event.stopPropagation()}>
        <div className="training__grupos">
          {enJuego && (
            <section className="training__grupo training__grupo--ancho cab-superficie lobby-encurso">
              <h3 className="training__grupo-titulo">Partida en curso</h3>
              <p className="field__hint">
                Se está jugando {modoMultijugador(partida.modo).label.toLowerCase()} en {escenariosDeSala(partida.modo)[partida.mapa]?.label ?? partida.mapa}.
                {partida.modo === 'todos' && yo?.h !== null
                  ? ' Puedes entrar ahora mismo.'
                  : ' Cuando acabe, el anfitrión puede lanzar la siguiente con los que estéis listos.'}
              </p>
              {partida.modo === 'todos' && yo?.h !== null && !yo?.p && (
                <button type="button" className="button button--primary" onClick={api.entrar}>Entrar a la partida</button>
              )}
            </section>
          )}

          <Grupo titulo="Modo" ancho inerte={!puedeConfigurar}>
            <div className="segmented lobby-modos" role="radiogroup" aria-label="Modo">
              {MODOS_MULTIJUGADOR.map((m) => (
                <button
                  key={m.clave}
                  type="button"
                  role="radio"
                  aria-checked={m.clave === estado.modo}
                  aria-pressed={m.clave === estado.modo}
                  className="segmented__option"
                  disabled={!puedeConfigurar}
                  onClick={() => api.config({ modo: m.clave })}
                >
                  {m.porEquipo === 1 ? 'Duelo 1v1' : m.porEquipo > 1 ? m.corto : 'Todos contra todos'}
                </button>
              ))}
            </div>
            <span className="field__hint">
              {!puedeConfigurar
                ? enJuego ? 'Con una partida en juego no se cambia nada.' : `Lo elige el anfitrión (${nombreAnfitrion}).`
                : equipos
                  ? ficha.porEquipo === 1
                    ? `Uno contra uno, a ${ROUNDS.maxRondas} rondas: gana quien se lleve ${Math.floor(ROUNDS.maxRondas / 2) + 1}.`
                    : `Dos equipos de hasta ${ficha.porEquipo}, a ${ROUNDS.maxRondas} rondas. Se puede empezar desequilibrado si queréis: basta un listo en cada equipo.`
                  : `Cada uno a lo suyo: de ${TODOS.minJugadores} a ${TODOS.maxJugadores}, según las salidas del mapa. Hacen falta ${TODOS.minJugadores} listos para empezar.`}
            </span>
          </Grupo>

          <Grupo titulo="Mapa" ancho inerte={!puedeConfigurar}>
            <Carrusel modo={estado.modo} mapa={estado.mapa} puede={puedeConfigurar} onElegir={(clave) => api.config({ mapa: clave })} />
            <span className="field__hint">
              {equipos
                ? 'Los mapas de duelo: cada equipo sale de una punta y los compañeros aparecen a su lado.'
                : `Los mapas con salidas para el todos contra todos. ${mapa?.label ?? 'Éste'}: ${rangoDeJugadores(capacidadDeTodos(mapa))}.`}
            </span>
          </Grupo>

          <Grupo titulo="Fase de compra" inerte={!puedeConfigurar || !equipos || reparte}>
            <div className="segmented" role="radiogroup" aria-label="Fase de compra">
              {ROUNDS.compraOpciones.map((segundos) => (
                <button
                  key={segundos}
                  type="button"
                  role="radio"
                  aria-checked={segundos === estado.compra}
                  aria-pressed={segundos === estado.compra}
                  className="segmented__option"
                  disabled={!puedeConfigurar || !equipos || reparte}
                  onClick={() => api.config({ compra: segundos })}
                >
                  {nombreDeCompra(segundos)}
                </button>
              ))}
            </div>
            <span className="field__hint">
              {!equipos
                ? 'El todos contra todos no tiene rondas ni tienda: cada uno sale con lo que elija en la armería.'
                : reparte
                  ? 'Este mapa reparte el equipo: no hay tienda ni fase de compra.'
                  : estado.compra === ROUNDS.compraSinLimite
                    ? 'Sin límite: la ronda empieza cuando todos pulsan «Listo» en la tienda. Para jugar entre amigos; las opciones con reloj son las de competición.'
                    : 'Lo que dura la compra entre rondas. Sin fase, la tienda está abierta toda la ronda; sin límite, empieza cuando todos están listos.'}
            </span>
          </Grupo>

          {/* Los huecos llevan su propia cabecera, con la ayuda y «Mezclar» al
              lado: eran una tarjeta aparte casi vacía encima de la lista. */}
          <section className="training__grupo training__grupo--ancho cab-superficie">
            <div className="lobby-cabecera">
              <h3 className="training__grupo-titulo">{equipos ? 'Equipos' : 'Jugadores'}</h3>
              <span className="field__hint">
                {equipos
                  ? 'Pincha un hueco libre para cambiarte.' + (soyAnfitrion ? ' Puedes mezclar los equipos.' : '')
                  : 'Pincha un hueco libre para cambiarte de color.'}
              </span>
              {soyAnfitrion && equipos && !enJuego && (
                <button type="button" className="button button--quiet button--pequeno lobby-mezclar" onClick={api.mezclar}>
                  Mezclar equipos
                </button>
              )}
            </div>
            <div className={`lobby-columnas${equipos ? ' lobby-columnas--equipos' : ''}`}>
              {columnas.map((col) => (
                <div key={col.bando ?? 'todos'} className="lobby-columna">
                  {col.bando !== null && (
                    <h3 className="training__grupo-titulo" style={{ color: BANDOS[col.bando].color }}>
                      Equipo {BANDOS[col.bando].label.toLowerCase()}
                    </h3>
                  )}
                  <div className={equipos ? 'lobby-lista' : 'lobby-rejilla'}>
                    {col.huecos.map((h) => (
                      <Hueco
                        key={h}
                        hueco={h}
                        miembro={porHueco.get(h)}
                        tu={tu}
                        anfitrion={anfitrion}
                        color={colorDe(h)}
                        etiqueta={equipos ? null : colorDeJugador(h).label}
                        onSentarse={api.hueco}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {esperando.length > 0 && (
              <p className="field__hint">
                Esperando sitio: {esperando.map((m) => m.n + (m.id === tu ? ' (tú)' : '')).join(', ')}.
              </p>
            )}
          </section>
        </div>

        <aside className="training__resumen">
          <div className="training__vas cab-superficie">
            <h3 className="cab-rotulo">Sala</h3>
            <p className="training__vas-modo lobby-codigo" id="codigo">{codigo}</p>
            <div className="lobby-copiar">
              <button type="button" className="button button--pequeno" id="copiar" onClick={() => copiar(enlace, 'enlace copiado')}>
                Copiar enlace
              </button>
              <button type="button" className="button button--pequeno" onClick={() => copiar(codigo, 'código copiado')}>
                Copiar código
              </button>
            </div>
            <input className="lobby-enlace" id="enlace" readOnly value={enlace} onFocus={(e) => e.target.select()} />
            {copiado && <span className="field__hint">{copiado}</span>}
            <dl className="training__vas-lista">
              {resumen.map(([que, valor]) => (
                <div key={que} className="training__vas-fila">
                  <dt>{que}</dt>
                  <dd>{valor}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className={`lobby-faltan${req.puede ? ' lobby-faltan--listo' : ''}`} id="faltan">
            {req.puede ? 'Todo listo para empezar' : req.motivo || ' '}
          </p>

          {/**
            * **LISTO, bien visible, uno por jugador** (vuelta 101): como en el
            * CS. Pulsado se queda en verde con la marca, y pulsarlo otra vez lo
            * quita — un interruptor, no un botón que se gasta.
            */}
          <button
            type="button"
            id="listo"
            className={`button button--grande lobby-listo${yo?.l ? ' lobby-listo--puesto' : ' button--primary'}`}
            disabled={!yo || yo.h === null || Boolean(yo.p && enJuego)}
            onClick={() => api.listo(!yo?.l)}
          >
            {yo?.l ? '✓ Listo' : 'Listo'}
          </button>

          {soyAnfitrion && (
            <button
              type="button"
              id="lanzar"
              className="button button--primary button--grande training__jugar"
              disabled={!req.puede}
              onClick={api.lanzar}
            >
              Lanzar partida
            </button>
          )}
          {!soyAnfitrion && (
            <p className="field__hint lobby-quien-lanza">La lanza el anfitrión ({nombreAnfitrion}) cuando haya bastantes listos.</p>
          )}

          {reconectar && (
            <button type="button" className="button" onClick={reconectar.ir}>Reconectar a {reconectar.codigo}</button>
          )}
          <button type="button" className="button training__volver" onClick={api.salir}>
            Salir al menú
          </button>
        </aside>
      </div>
    </Cabina>
  )
}

/**
 * **Monta el lobby** en la página del multijugador y devuelve cómo repintarlo.
 * Se repinta con cada estado de la sala, que cambia cada varios segundos: no
 * es un valor por frame y puede ser estado de React sin romper la regla del HUD.
 */
export function montarLobby(contenedor, props) {
  const raiz = createRoot(contenedor)
  let ultimo = { ...props, estado: null }
  const pintar = () => raiz.render(<StrictMode><Lobby {...ultimo} /></StrictMode>)
  pintar()
  return {
    pintar(cambios) {
      ultimo = { ...ultimo, ...cambios }
      pintar()
    },
  }
}
