import { useState } from 'react'
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
 */

const FIRE_MODES = { semi: 'Semiautomática', auto: 'Automática' }
const ZONE_LABELS = { head: 'cabeza', torso: 'torso', legs: 'piernas' }

/** Formatea 0.904 como «−10%». Cero no se enseña como «−0%». */
function speedCost(weight) {
  const factor = weaponSpeedFactor(weight)
  const loss = Math.round((1 - factor) * 100)
  const speed = MOVEMENT.speed * factor
  if (loss === 0) return `no frena · ${speed.toFixed(2)} u/s`
  return `−${loss}% de marcha · ${speed.toFixed(2)} u/s`
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

function Stat({ label, value }) {
  return (
    <div className="armoury__stat">
      <span className="armoury__stat-label">{label}</span>
      <span className="armoury__stat-value">{value}</span>
    </div>
  )
}

function WeaponCard({ weaponKey, equipped, onEquip }) {
  const weapon = WEAPONS[weaponKey]
  const [open, setOpen] = useState(false)
  const fixed = weapon.slot === 'secondary'

  return (
    <div className={`armoury__card${equipped ? ' armoury__card--equipped' : ''}`}>
      <div className="armoury__art">
        <WeaponSilhouette weaponKey={weaponKey} />
      </div>
      <div className="armoury__name">{weapon.label}</div>
      <div className="armoury__character">
        {FIRE_MODES[weapon.mode]} · {weapon.character}
      </div>

      <div className="armoury__actions">
        {fixed ? (
          <span className="armoury__fixed">Siempre encima · tecla 2</span>
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
        <button
          type="button"
          className="button button--quiet"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Ocultar ficha' : 'Ficha'}
        </button>
      </div>

      {open && (
        <div className="armoury__stats">
          <Stat label="Daño" value={ZONE_DAMAGE} />
          <Stat label="Cadencia" value={`${weapon.rpm} RPM`} />
          <Stat label="Peso" value={`${weapon.weight.toFixed(1)} kg · ${speedCost(weapon.weight)}`} />
          <Stat label="Cargador" value={`${weapon.magazine} · recarga ${(weapon.reloadMs / 1000).toFixed(1)} s`} />
          <Stat label="Escudo" value={`absorbe el ${Math.round(weapon.shieldAbsorb * 100)}% en el cuerpo`} />
          <Stat label="Precisión objetivo" value={`${Math.round(weapon.precisionTarget * 100)}%`} />
        </div>
      )}
    </div>
  )
}

/**
 * @param {{ settings: object, onChange: (patch: object) => void, onClose: () => void }} props
 */
export default function Armoury({ settings, onChange, onClose }) {
  const order = [...Object.keys(PRIMARY_WEAPONS), SECONDARY_WEAPON]

  return (
    <div className="panel panel--armoury" onMouseDown={(event) => event.stopPropagation()}>
      <h2 className="panel__title panel__title--small">Armería</h2>
      <p className="panel__hint">
        La principal sale con la tecla 1 y la {WEAPONS[SECONDARY_WEAPON].label} con la 2.
        Lo que pesa se nota al andar.
      </p>

      <div className="armoury__grid">
        {order.map((key) => (
          <WeaponCard
            key={key}
            weaponKey={key}
            equipped={key === settings.weapon}
            onEquip={(next) => onChange({ weapon: next })}
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
