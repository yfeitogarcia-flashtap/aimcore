import { useEffect } from 'react'
import {
  MOVEMENT,
  PRIMARY_WEAPONS,
  SECONDARY_WEAPON,
  TARGET_TYPES,
  WEAPONS,
  weaponSpeedFactor,
} from '../config.js'
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

const FIRE_MODES = { semi: 'Semiautomática', auto: 'Automática' }
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
 * **El daño no es del arma, es de la zona**, y eso hay que decirlo donde se
 * miran las estadísticas: hoy las tres armas quitan lo mismo y lo que cambia el
 * resultado es dónde aciertes. Enseñar un número de daño por arma sería
 * inventarse un dato que el juego no tiene.
 */
const ZONE_DAMAGE = TARGET_TYPES.hitbox.parts
  .map((part) => `${ZONE_LABELS[part.zone] ?? part.zone} ${part.damage}`)
  .join(' · ')

/**
 * **Los topes de cada barra salen del arsenal, no de un número redondo.** Una
 * barra contra un máximo inventado no compara nada: lo que se quiere leer de un
 * vistazo es «ésta es la que más carga de las que hay», y eso cambia solo el día
 * que entre un arma nueva.
 */
const SCALES = ['rpm', 'magazine', 'weight'].reduce((scales, field) => {
  const values = Object.values(WEAPONS).map((weapon) => weapon[field])
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

function WeaponCard({ weaponKey, equipped, inHand, suppressed, slotKey, onEquip, onSuppressor }) {
  const weapon = WEAPONS[weaponKey]
  const fixed = weapon.slot === 'secondary'

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
        {FIRE_MODES[weapon.mode]} · {weapon.character}
      </div>

      {/* Las tres zonas de abajo llevan hueco reservado aunque estén vacías: si
          una ficha es más corta que la de al lado, las estadísticas dejan de
          estar a la misma altura y comparar vuelve a ser leer, no mirar. */}
      <div className="armoury__state">
        {inHand && <span className="armoury__inhand">En la mano</span>}
      </div>

      <div className="armoury__action">
        {fixed ? (
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
        {weapon.supportsSuppressor && (
          <SuppressorToggle on={suppressed} onToggle={() => onSuppressor(weaponKey)} />
        )}
      </div>

      <div className="armoury__stats">
        <Stat label="Cadencia" value={`${weapon.rpm} RPM`} field="rpm" amount={weapon.rpm} />
        <Stat
          label="Cargador"
          value={`${weapon.magazine} · ${(weapon.reloadMs / 1000).toFixed(1)} s`}
          field="magazine"
          amount={weapon.magazine}
        />
        <Stat
          label="Peso"
          value={`${weapon.weight.toFixed(1)} kg · ${speedCost(weapon.weight)}`}
          field="weight"
          amount={weapon.weight}
        />
        <Stat label="Daño" value={ZONE_DAMAGE} />
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
export default function Armoury({ settings, equipped, onChange, onClose }) {
  const order = [...Object.keys(PRIMARY_WEAPONS), SECONDARY_WEAPON]

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
      <h2 className="panel__title panel__title--small">Armería</h2>
      <p className="panel__hint">
        La principal sale con la <strong>1</strong> y la {WEAPONS[SECONDARY_WEAPON].label} con la{' '}
        <strong>2</strong>. Lo que pesa se nota al andar, y el silenciador es de cada arma.
      </p>

      <div className="armoury__grid">
        {order.map((key) => (
          <WeaponCard
            key={key}
            weaponKey={key}
            equipped={key === settings.weapon}
            inHand={key === equipped?.weaponKey}
            suppressed={Boolean(settings.suppressor[key])}
            slotKey={WEAPONS[key].slot === 'secondary' ? '2' : '1'}
            onEquip={(next) => onChange({ weapon: next })}
            onSuppressor={toggleSuppressor}
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
