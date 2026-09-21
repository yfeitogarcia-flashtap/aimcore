import { useEffect } from 'react'
import {
  GRENADES,
  MOVEMENT,
  MELEE_WEAPON,
  PRIMARY_WEAPONS,
  THROWABLE_WEAPONS,
  SECONDARY_WEAPON,
  TARGET_TYPES,
  WEAPONS,
  WEAPON_MODES,
  weaponSpeedFactor,
} from '../config.js'
import { zoneDamage } from '../game/player.js'
import WeaponSilhouette from './WeaponSilhouette.jsx'

/**
 * **La armería**: el sitio donde se elige con qué se sale.
 *
 * Hasta la vuelta 42 el arma principal era una fila más del panel de opciones,
 * un desplegable entre la sensibilidad y el tamaño de diana. Elegir arma no es
 * un ajuste: es la decisión de la partida, y con `weight` cuesta además
 * velocidad. Así que tiene su sitio, se ve la silueta de cada una y se ve lo que
 * cada una cuesta antes de elegirla.
 *
 * **Sin economía.** Ni precios ni botón de comprar: eso depende de rondas y de
 * dinero, que no existen. Lo que hay es equipar.
 *
 * **La pistola no se equipa aquí**, y por la misma razón por la que desapareció
 * del desplegable en la vuelta 39: se lleva siempre. Su ficha sí está —es parte
 * del arsenal y sus números importan— pero con un rótulo en vez de un botón.
 *
 * ---
 *
 * **Tres reglas de forma, de la vuelta 43, que son lo que hace el panel usable:**
 *
 *  1. **Un solo botón grande por ficha, y es la acción**: equipar. Todo lo demás
 *     que se pueda tocar es pequeño y dice su estado con la forma —la casilla
 *     del silenciador—, porque cinco botones del mismo tamaño en una ficha
 *     obligan a leerlos todos para saber cuál es el que hace algo.
 *  2. **Los números no se esconden detrás de un clic.** Antes había un botón
 *     «Ficha» que desplegaba las estadísticas: comparar tres armas costaba tres
 *     clics y, peor, se comparaba de memoria. Ahora están puestas y además
 *     llevan **barra**, que es lo que deja leer la diferencia sin restar.
 *  3. **Lo que ves es lo que te llevas.** Poner el silenciador cambia la
 *     silueta a la variante `ghost-`, que es otra foto del arma de verdad. El
 *     interruptor no dice «activado», enseña el arma con el tubo puesto.
 */

const ZONE_LABELS = { head: 'cabeza', torso: 'torso', legs: 'piernas' }

/** Formatea 0.904 como «−10%». Cero no se enseña como «−0%». */
function speedCost(weight) {
  const factor = weaponSpeedFactor(weight)
  const loss = Math.round((1 - factor) * 100)
  const speed = MOVEMENT.speed * factor
  if (loss === 0) return `no frena · ${speed.toFixed(2)} u/s`
  return `−${loss}% marcha · ${speed.toFixed(2)} u/s`
}

/**
 * **El daño es de la zona y del arma** (vuelta 70). Hasta la Scout las tres
 * pegaban igual y aquí se decía justo eso: que lo que cambia el resultado es
 * dónde aciertes, y que enseñar un número por arma sería inventarse un dato.
 * Ahora el dato existe —un fusil de francotirador mata de un tiro al cuerpo— y
 * el que no lo declara sigue valiendo lo de siempre, así que esta fila sale de
 * `zoneDamage`, que es **la misma función que resuelve el disparo**. Un segundo
 * cálculo aquí es un panel que promete un número y unas balas que quitan otro.
 */
function damageLine(weaponKey, danoDeTorso = 0) {
  return TARGET_TYPES.hitbox.parts
    .map((part) => {
      const d = zoneDamage(part.zone, weaponKey, danoDeTorso)
      // Sin decimales cuando son redondos: «torso 110», no «torso 110.0».
      const n = Math.round(d * 10) / 10
      return `${ZONE_LABELS[part.zone] ?? part.zone} ${n}`
    })
    .join(' · ')
}

/**
 * **Los topes de cada barra salen del arsenal, no de un número redondo.** Una
 * barra contra un máximo inventado no compara nada: lo que se quiere leer de un
 * vistazo es «ésta es la que más carga de las que hay», y eso cambia solo el día
 * que entre un arma nueva.
 */
const SCALES = ['rpm', 'magazine', 'weight'].reduce((scales, field) => {
  /**
   * **Y sólo de las que tienen ese número** (vuelta 71). Un cuchillo no tiene
   * RPM —sus dos golpes tienen el suyo, en su bloque— así que el campo no
   * existe, y un `undefined` en esta lista convertía el máximo en NaN y dejaba
   * **todas** las barras sin dibujar. El tope de una comparación sale de lo que
   * se puede comparar.
   */
  const values = Object.values(WEAPONS)
    .map((weapon) => weapon[field])
    .filter((v) => Number.isFinite(v))
  scales[field] = { min: Math.min(...values), max: Math.max(...values) }
  return scales
}, {})

/** Una fila de estadística: rótulo, valor y —si compara— su barra. */
function Stat({ label, value, field, amount }) {
  const scale = field ? SCALES[field] : null
  // El suelo de la barra es el 12%: una barra vacía se lee como «no tiene»,
  // y el arma más ligera del arsenal sí pesa.
  const fill = scale
    ? 12 + 88 * ((amount - scale.min) / Math.max(scale.max - scale.min, 1e-9))
    : null
  return (
    <div className="armoury__stat">
      <div className="armoury__stat-head">
        <span className="armoury__stat-label">{label}</span>
        <span className="armoury__stat-value">{value}</span>
      </div>
      {fill !== null && (
        <div className="armoury__bar" role="presentation">
          <div className="armoury__bar-fill" style={{ width: `${fill}%` }} />
        </div>
      )}
    </div>
  )
}

/**
 * **El interruptor del silenciador: una casilla, no un botón.**
 *
 * Es un estado binario de un arma, no una acción del panel, y por eso no se
 * parece al botón de equipar: marcada y verde es «lo lleva puesto». Ocupa una
 * línea y se lee de reojo desde la ficha de al lado, que es lo que hace falta
 * para comparar tres armas.
 */
function SuppressorToggle({ on, onToggle }) {
  return (
    <button
      type="button"
      className={`checkline${on ? ' checkline--on' : ''}`}
      role="switch"
      aria-checked={on}
      onClick={onToggle}
    >
      <span className="checkline__box" aria-hidden="true">
        {on && (
          <svg viewBox="0 0 12 12" className="checkline__tick">
            <path d="M2.5 6.2 L4.8 8.6 L9.5 3.4" />
          </svg>
        )}
      </span>
      <span className="checkline__label">Silenciador</span>
    </button>
  )
}

/**
 * **Cuántas filas de la rejilla ocupa una ficha**, y viven aquí porque aquí es
 * donde se emiten (vuelta 89).
 *
 * Estaban escritos a mano en tres reglas de `styles.css`, y cuando el arco
 * estrenó filas propias en la vuelta 85 no se tocó ninguna: un `subgrid` no
 * crece cuando le sobran hijos, los amontona en la última pista, así que el
 * arco, el U2 y las tres granadas llevaban desde entonces dibujando hasta
 * cuatro filas **una encima de otra**. Un número que hay que acordarse de subir
 * en otro fichero es un número que no se sube.
 */
const BLOQUES_DE_FICHA = 6
/** Cadencia, cargador, peso, daño, la fila de las específicas, y escudo · precisión. */
const FILAS_DE_STATS = 6
const FILAS_DE_FICHA = BLOQUES_DE_FICHA + FILAS_DE_STATS

/** Con qué tecla sale cada ranura. La lista de teclas de equipo, en un sitio. */
const SLOT_KEYS = { primary: '1', secondary: '2', melee: '3', throwable: 'G' }

function WeaponCard({ weaponKey, equipped, inHand, suppressed, slotKey, onEquip, onSuppressor, soloFicha }) {
  const weapon = WEAPONS[weaponKey]
  // **Ni la pistola ni el cuchillo se equipan: se llevan.** Lo que decide que
  // una ficha no tenga botón es que su ranura no se elige, y eso hoy son dos.
  const fixed = weapon.slot === 'secondary' || weapon.slot === 'melee'

  return (
    <div className={`armoury__card${equipped ? ' armoury__card--equipped' : ''}`}>
      <div className="armoury__art">
        {/* Con el silenciador puesto se dibuja la otra foto del arma, no la
            misma con un adorno: es lo que vas a llevar. */}
        <WeaponSilhouette weaponKey={weaponKey} suppressed={suppressed} />
      </div>

      <div className="armoury__ident">
        <span className="armoury__name">{weapon.label}</span>
        {/* La tecla con la que sale, en la propia ficha: la armería es también
            donde se aprende el mapa de controles del equipo. */}
        <span className="armoury__slot" title={`Sale con la tecla ${slotKey}`}>{slotKey}</span>
      </div>
      <div className="armoury__character">
        {WEAPON_MODES[weapon.mode]?.largo} · {weapon.character}
      </div>

      {/* Las tres zonas de abajo llevan hueco reservado aunque estén vacías: si
          una ficha es más corta que la de al lado, las estadísticas dejan de
          estar a la misma altura y comparar vuelve a ser leer, no mirar. */}
      <div className="armoury__state">
        {inHand && <span className="armoury__inhand">En la mano</span>}
      </div>

      <div className="armoury__action">
        {/**
          * **De consulta no se equipa** (vuelta 73). En el duelo lo que llevas
          * lo decide el servidor —se compra, o lo reparte el mapa—, así que un
          * botón «Equipar» aquí prometería algo que el servidor va a ignorar.
          * Es la regla del selector de la vuelta 67 en otra pantalla.
          */}
        {soloFicha ? (
          <span className="armoury__fixed">{inHand ? 'En la mano' : 'Ficha'}</span>
        ) : fixed ? (
          // La pistola no se equipa: se lleva. Ocupa el hueco del botón con la
          // razón por la que no lo tiene, que es lo que alguien va a buscar ahí.
          <span className="armoury__fixed">Siempre encima</span>
        ) : (
          <button
            type="button"
            className={`button ${equipped ? 'button--quiet' : 'button--primary'}`}
            disabled={equipped}
            onClick={() => onEquip(weaponKey)}
          >
            {equipped ? 'Equipada' : 'Equipar'}
          </button>
        )}
      </div>

      <div className="armoury__switches">
        {/**
          * **El silenciador no se compra: es del arma** (vuelta 73). Hasta aquí
          * la tienda del duelo lo vendía por 250 como si fuera un accesorio, y
          * no lo es — se conmuta con el clic derecho, en los dos modos, en
          * cualquier fase y sin coste (esa regla es de la vuelta 64). Un precio
          * en el panel decía lo contrario que el juego.
          *
          * Lo que hacía falta no era un artículo: era **decir con qué se pone**,
          * y el sitio donde alguien lo busca es la ficha del arma. Va en los dos
          * modos, porque el clic derecho vale en los dos; en el de consulta es
          * lo único que queda, porque ahí la casilla no mandaría nada.
          */}
        {weapon.supportsSuppressor && !soloFicha && (
          <SuppressorToggle on={suppressed} onToggle={() => onSuppressor(weaponKey)} />
        )}
        {weapon.supportsSuppressor && (
          <span className="armoury__hint">Clic derecho del ratón = Silenciador</span>
        )}
      </div>

      <div className="armoury__stats">
        {/**
          * **Las cuatro que tienen todas van en su fila de la rejilla**, que es
          * lo que las alinea entre fichas por mucho que una ocupe dos líneas
          * (vueltas 43 y 71). Comparar armas es mirar la misma fila en todas.
          */}
        <Stat
          label={weapon.melee ? 'Golpes' : 'Cadencia'}
          value={weapon.melee
            ? `flojo ${Math.round(60000 / weapon.melee.luz.rpm)} ms · fuerte ${Math.round(60000 / weapon.melee.fuerte.rpm)} ms`
            : `${weapon.rpm} RPM`}
          field={weapon.melee ? undefined : 'rpm'}
          amount={weapon.melee ? undefined : weapon.rpm}
        />
        {/* Un cuchillo no tiene cargador ni recarga, y el hueco se ocupa con
            lo que sí decide sus intercambios: hasta dónde llega. */}
        <Stat
          label={weapon.melee ? 'Alcance' : 'Cargador'}
          value={weapon.melee
            ? `${weapon.melee.rangeU.toFixed(1)} u · hay que llegar`
            : `${weapon.magazine} · ${(weapon.reloadMs / 1000).toFixed(1)} s`}
          field={weapon.melee ? undefined : 'magazine'}
          amount={weapon.melee ? undefined : weapon.magazine}
        />
        <Stat
          label="Peso"
          value={`${weapon.weight.toFixed(1)} kg · ${speedCost(weapon.weight)}`}
          field="weight"
          amount={weapon.weight}
        />
        {/* **El daño de un cuchillo no es por zonas**: una puñalada no elige
            dónde clava, y lo que cambia el resultado es flojo o fuerte. Lo que
            sí hay que decir es lo que de verdad decide una pelea a cuchillo:
            que por la espalda mata, lleve lo que lleve el otro. */}
        <Stat
          label="Daño"
          value={weapon.melee
            ? `flojo ${weapon.melee.luz.dano} · fuerte ${weapon.melee.fuerte.dano} · espalda: mata`
            : weapon.tiro?.granada
              ? 'al estallar, no al tocar'
              : weapon.tiro
                ? `sin cargar · ${damageLine(weaponKey, weapon.tiro.danoMin)}`
                : damageLine(weaponKey)}
        />

        {/**
          * **Y lo que sólo tienen algunas va en UNA fila, en flujo normal**
          * (vuelta 89), no en una fila de la rejilla cada una.
          *
          * Esto era un fallo de verdad y llevaba desde la vuelta 85 en pantalla:
          * `.armoury__stats` declaraba `grid-row: span 5` —las cinco de cuando
          * todas las armas tenían cinco— y el arco emite 7, el U2 8 y cada
          * granada 9. Lo que sobra de un `subgrid` no crece: se amontona en la
          * última pista, así que **cuatro filas se dibujaban una encima de
          * otra** justo donde acaba la ficha. Medido antes de tocar nada
          * (`arm89`): Bow 2 solapes, U2 3, Core/Blind/KO 4, las tres con
          * «Explosión», «Cuántas llevas» y «Escudo · precisión» compartiendo el
          * mismo `top`.
          *
          * Meterlas en flujo normal lo cierra **por construcción** y no por un
          * número mayor: aquí no hay pistas que agotar, así que añadir mañana
          * una fila a un arma no puede volver a pisar nada. Y no se pierde la
          * alineación que importa — las cuatro de arriba y la de abajo siguen
          * siendo filas de la rejilla, así que CADENCIA, PESO y ESCUDO caen a la
          * misma altura en las once fichas; lo que no se alinea es justo lo que
          * no se puede comparar, porque una pistola no tiene mecha.
          */}
        <div className="armoury__extras">
          {/* **Un arma de carga dice las dos puntas** (vuelta 85). Una sola
              fila diría el daño de un arma que no existe: el arco no pega un
              número, pega entre dos según cuánto lo tenses. */}
          {weapon.tiro && !weapon.tiro.granada ? (
            <Stat label="Cargado" value={damageLine(weaponKey, weapon.tiro.danoMax)} />
          ) : null}
          {weapon.tiro?.cargaMs ? (
            <Stat
              label={weapon.tiro.granada ? 'Lanzamiento' : 'Carga'}
              value={weapon.tiro.granada
                ? `${(weapon.tiro.cargaMs / 1000).toFixed(2)} s al máximo · clic izquierdo lejos, clic derecho corto y a ras de suelo`
                : `${(weapon.tiro.cargaMs / 1000).toFixed(2)} s al máximo · mantén para tensar, suelta para tirar`}
            />
          ) : null}
          {/* **Y una granada dice su mecha** (vuelta 87), que es lo único suyo
              que hay que entender antes de tirar la primera: el reloj arranca
              al empezar a cargar, no al soltar. */}
          {weapon.tiro?.granada ? (
            <Stat
              label="Mecha"
              value={`${GRENADES.mecha.totalS} s desde que empiezas a cargar · nunca menos de ${GRENADES.mecha.minimoS} s tras soltarla`}
            />
          ) : null}
          {weapon.tiro?.ceguera ? (
            <Stat
              label="Ceguera"
              value={`${(weapon.tiro.ceguera.duracionMs / 1000).toFixed(1)} s en ${weapon.tiro.ceguera.nucleoU} u · nada pasadas ${weapon.tiro.ceguera.radioU} u · apartar la vista la reduce, y una pared la corta`}
            />
          ) : null}
          {weapon.tiro?.aturdimiento ? (
            <Stat
              label="Aturdimiento"
              value={`−${Math.round(weapon.tiro.aturdimiento.frenoMax * 100)}% de marcha durante ${(weapon.tiro.aturdimiento.duracionMs / 1000).toFixed(1)} s en ${weapon.tiro.aturdimiento.nucleoU} u · nada pasadas ${weapon.tiro.aturdimiento.radioU} u`}
            />
          ) : null}
          {/* **Y un arma de área dice hasta dónde llega** (vuelta 86). El radio
              es el número que decide cómo se usa —si cubre un pasillo o una
              esquina— y no se puede deducir del daño. El chaleco va aquí y no
              en su fila porque aquí es donde significa algo: una onda no la
              para. */}
          {weapon.tiro?.explosion ? (
            <Stat
              label="Explosión"
              value={`${weapon.tiro.explosion.dano} en ${weapon.tiro.explosion.nucleoU} u · nada pasadas ${weapon.tiro.explosion.radioU} u · el chaleco no la para`}
            />
          ) : null}
          {weapon.tiro?.reserva ? (
            <Stat
              label={weapon.tiro.granada ? 'Cuántas llevas' : 'Cohetes'}
              value={weapon.tiro.granada
                ? `${weapon.tiro.reserva.inicial + weapon.magazine} por vida · no se reponen`
                : `${weapon.tiro.reserva.inicial} al comprar · hasta ${weapon.tiro.reserva.maxima} · cada cohete que mata repone uno`}
            />
          ) : null}
        </div>

        <Stat
          label="Escudo · precisión"
          value={`absorbe ${Math.round(weapon.shieldAbsorb * 100)}% · objetivo ${Math.round(weapon.precisionTarget * 100)}%`}
        />
      </div>
    </div>
  )
}

/**
 * @param {{
 *   settings: object,
 *   equipped: { weaponKey: string },
 *   binds: object,
 *   onChange: (patch: object) => void,
 *   onClose: () => void,
 * }} props
 */
export default function Armoury({ settings, equipped, onChange, onClose, soloFicha = false }) {
  /**
   * **Y el cuchillo el último** (vuelta 71), que es el orden en que se llevan:
   * principal, pistola, cuerpo a cuerpo. Sale de `MELEE_WEAPON`, derivado de la
   * ranura como los otros dos — aquí no hay ninguna lista escrita a mano.
   */
  const order = [
    ...Object.keys(PRIMARY_WEAPONS),
    SECONDARY_WEAPON,
    MELEE_WEAPON,
    // **Y las granadas al final** (vuelta 87), que es el orden en que se llevan
    // y el mismo en que están las teclas. Sale de la ranura, como las otras
    // tres: aquí no hay ninguna lista escrita a mano.
    ...Object.keys(THROWABLE_WEAPONS),
  ].filter(Boolean)

  // Escape cierra, como en cualquier panel del juego. La tecla de la armería ya
  // la conmuta el motor; ésta es la que espera quien no se sabe el bind.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggleSuppressor = (key) =>
    onChange({ suppressor: { ...settings.suppressor, [key]: !settings.suppressor[key] } })

  return (
    <div className="panel panel--armoury" onMouseDown={(event) => event.stopPropagation()}>
      <h2 className="panel__title panel__title--small">
        {soloFicha ? 'Fichas de las armas' : 'Armería'}
      </h2>
      <p className="panel__hint">
        {soloFicha
          ? <>Lo que llevas en una partida lo decide el servidor: se compra, o lo reparte el mapa.
              Esto son los números — la principal sale con la <strong>1</strong>, la{' '}
              {WEAPONS[SECONDARY_WEAPON].label} con la <strong>2</strong> y el{' '}
              {WEAPONS[MELEE_WEAPON].label} con la <strong>3</strong>.</>
          : <>La principal sale con la <strong>1</strong> y la {WEAPONS[SECONDARY_WEAPON].label} con la{' '}
              <strong>2</strong>. Lo que pesa se nota al andar, y el silenciador es de cada arma. La granada
              sale con la <strong>G</strong>: clic izquierdo la lanza lejos y clic derecho, corto
              y a ras de suelo.</>}
      </p>

      <div
        className="armoury__grid"
        style={{ '--armoury-filas': FILAS_DE_FICHA, '--armoury-stats': FILAS_DE_STATS }}
      >
        {order.map((key) => (
          <WeaponCard
            key={key}
            weaponKey={key}
            // En el modo de consulta **nada está «equipado»**: lo que llevas
            // no sale de este ajuste, sale del servidor. Marcar la que tienes
            // guardada en el juego sería señalar un arma que no llevas.
            equipped={!soloFicha && key === (
              WEAPONS[key].slot === 'throwable' ? settings.throwable : settings.weapon
            )}
            inHand={key === equipped?.weaponKey}
            suppressed={Boolean(settings.suppressor[key])}
            slotKey={SLOT_KEYS[WEAPONS[key].slot] ?? '1'}
            onEquip={(next) => onChange(
              WEAPONS[next].slot === 'throwable' ? { throwable: next } : { weapon: next },
            )}
            onSuppressor={toggleSuppressor}
            soloFicha={soloFicha}
          />
        ))}
      </div>

      <div className="panel__actions">
        <button type="button" className="button button--primary" onClick={onClose} autoFocus>
          Cerrar
        </button>
      </div>
    </div>
  )
}
