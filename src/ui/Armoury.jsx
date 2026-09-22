import { useEffect, useRef, useState } from 'react'
import {
  CAMERA,
  GRENADES,
  MOVEMENT,
  TARGET_TYPES,
  WEAPONS,
  WEAPON_MODES,
  catalogoDeTienda,
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

/**
 * **Las ranuras, en el orden en que se llevan, y con todo lo suyo junto**
 * (vuelta 92).
 *
 * Eran **dos mapas sueltos** —`SLOT_KEYS` con la tecla y `SLOT_SETTING` con el
 * ajuste— y ahora hacen falta dos cosas más: cómo se llama la ranura en el
 * raíl de categorías y qué frase la explica. Cuatro mapas paralelos con las
 * mismas claves son cuatro sitios donde una ranura nueva se puede quedar a
 * medias, y eso ya pasó una vez en este fichero (vuelta 89, con las filas del
 * `subgrid` escritas en tres sitios). Aquí hay **una sola lista de ranuras**.
 *
 * Lo que **no** se escribe aquí es qué armas tiene cada una: eso se filtra del
 * catálogo por su `slot`, como `PRIMARY_WEAPONS` y sus hermanas. Una lista de
 * miembros a mano es una lista donde un día falta un arma.
 */
const RANURAS = [
  {
    slot: 'primary',
    label: 'Primarias',
    tecla: '1',
    nota: 'Con lo que sales a la ronda. Es la decisión que más pesa, literalmente: lo que carga se nota al andar.',
  },
  {
    slot: 'secondary',
    label: 'Pistolas',
    tecla: '2',
    nota: 'Siempre llevas una. La Pulse es la de serie y no cuesta nada; el Reaper se compra y se paga al morir.',
  },
  {
    slot: 'special',
    label: 'Especiales',
    tecla: '5',
    nota: 'Se llevan ADEMÁS de un arma principal, no en vez de ella. Lo que las acota es el precio: un cohete y un rifle son dos rondas buenas.',
  },
  {
    slot: 'throwable',
    label: 'Arrojadizas',
    tecla: 'G',
    nota: 'La tecla cicla entre las que lleves. Clic izquierdo lanza lejos; clic derecho, corto y a ras de suelo.',
  },
  {
    slot: 'melee',
    label: 'Cuerpo a cuerpo',
    tecla: '3',
    nota: 'Se lleva siempre y no se elige. Clic izquierdo flojo, clic derecho fuerte, y por la espalda mata.',
  },
]

/** La ranura de un arma, por su clave de `slot`. */
const RANURA = Object.fromEntries(RANURAS.map((r) => [r.slot, r]))

/**
 * **Qué ajuste escribe cada ranura.** La de cuerpo a cuerpo no tiene: el
 * cuchillo se lleva y no se elige, así que no hay nada que guardar.
 */
const SLOT_SETTING = {
  primary: 'weapon',
  secondary: 'secondary',
  special: 'special',
  throwable: 'throwable',
}

/**
 * **El precio de cada arma, aunque en el entrenamiento no se pague** (vuelta
 * 92). Sale del **mismo catálogo que cobra el servidor** (`catalogoDeTienda`),
 * no de una tabla al lado: una armería que prometiera un precio distinto del
 * que la tienda cobra sería la versión de escaparate del fallo de la vuelta 67.
 *
 * Y se enseña en los dos modos a propósito: la economía del duelo se decide
 * durante la ronda anterior, así que el sitio donde se aprenden los precios es
 * el panel que se abre sin prisa.
 */
const PRECIOS = Object.fromEntries(catalogoDeTienda().map((item) => [item.clave, item]))

function lineaDePrecio(weaponKey) {
  const item = PRECIOS[weaponKey]
  // Lo que no está en el catálogo es lo que no se compra, y hoy eso es el
  // cuchillo — fuera por construcción, no por olvido (vuelta 73).
  if (!item) return { texto: 'Siempre contigo', gratis: true }
  if (item.deSerie || item.precio === 0) return { texto: 'De serie', gratis: true }
  return { texto: `$${item.precio}`, gratis: false }
}

/**
 * **Cuántas armas hay en cada ranura**, derivado del catálogo (vuelta 90).
 *
 * De aquí sale qué ficha lleva botón de equipar, y **por eso se deriva**: hasta
 * la 89 la condición estaba escrita a mano —«la pistola y el cuchillo se
 * llevan, no se equipan»— y era cierta mientras esas dos ranuras tuvieran un
 * arma sola. En cuanto el Reaper entró en la de pistola, esa frase pasó a ser
 * un panel que se niega a equipar un arma que el jugador acaba de comprar.
 * Lo que de verdad significaba es **«una ranura sin elección no tiene botón»**,
 * y eso se cuenta.
 */
const ARMAS_POR_RANURA = {}
for (const arma of Object.values(WEAPONS)) {
  ARMAS_POR_RANURA[arma.slot] = (ARMAS_POR_RANURA[arma.slot] ?? 0) + 1
}

function WeaponCard({ weaponKey, equipped, inHand, suppressed, slotKey, onEquip, onSuppressor, soloFicha }) {
  const weapon = WEAPONS[weaponKey]
  const precio = lineaDePrecio(weaponKey)
  // **Una ranura con un arma sola no ofrece ninguna decisión**, así que su
  // ficha no lleva botón: hoy es el cuchillo y nada más. Ver `ARMAS_POR_RANURA`.
  const fixed = (ARMAS_POR_RANURA[weapon.slot] ?? 1) <= 1

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
        {/**
          * **«En la mano» va aquí desde la vuelta 92**, y no en una fila
          * propia. La tenía —vacía en trece de las catorce fichas— porque con
          * `subgrid` una fila reservada es lo que impide que la ficha de al
          * lado baile. Al lado del nombre no hay nada que reservar: es un
          * punto que se enciende, y la fila que sobraba se fue con él.
          */}
        {inHand && <span className="armoury__inhand" title="La llevas empuñada">•</span>}
      </div>
      <div className="armoury__character">
        {WEAPON_MODES[weapon.mode]?.largo} · {weapon.character}
      </div>

      {/**
        * **El precio, aunque aquí no se pague** (vuelta 92). Se pidió
        * explícitamente —«así la gente se aprende los precios»— y encaja con
        * lo que este panel ya hace: es el único sitio donde se comparan las
        * armas sin nadie disparando. Sale del catálogo de la tienda, así que
        * no puede decir un número distinto del que el servidor cobra.
        */}
      <div className={`armoury__precio${precio.gratis ? ' armoury__precio--gratis' : ''}`}>
        {precio.texto}
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
          <span className="armoury__hint">Clic derecho = silenciador</span>
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
                : weapon.tiro.clavable
                  // **El Fang no tiene tiro corto, y eso se dice** (vuelta 90).
                  // El clic derecho de una granada existe porque a veces hay
                  // que dejarla caer a tus pies; un cuchillo a tus pies no
                  // sirve para nada, así que ese botón se queda vacío a
                  // propósito — y un botón vacío hay que declararlo, o se lee
                  // como que el arma está a medias.
                  ? `${(weapon.tiro.cargaMs / 1000).toFixed(2)} s al máximo · mantén para armar el brazo, suelta para lanzar · sólo clic izquierdo`
                  : `${(weapon.tiro.cargaMs / 1000).toFixed(2)} s al máximo · mantén para tensar, suelta para tirar`}
            />
          ) : null}
          {/**
            * **Lo que atraviesa** (vuelta 90). Va en las específicas y no en
            * una fila de la rejilla porque sólo dos armas lo tienen, y lo que
            * dice no es un número que se compare: es qué deja de valer contra
            * ellas. Sale del mismo campo que `encajarImpacto`, así que la
            * ficha no puede prometer una perforación que el disparo no haga.
            */}
          {weapon.perforaArmadura ? (
            <Stat
              label="Armadura"
              value={weapon.perforaArmadura === 'todo'
                ? 'atraviesa chaleco y casco · una bala en cualquier zona mata'
                : 'atraviesa el casco · a la cabeza mata siempre, el chaleco sí la para'}
            />
          ) : null}
          {/**
            * **Y la mirilla dice lo que cuesta** (vuelta 90). Los aumentos son
            * lo que compra; el destello es lo que paga, y es la única línea de
            * una ficha que habla de lo que **el rival** ve. Escribirlo aquí es
            * la regla de «lo que ves es lo que te llevas» (vuelta 43): un arma
            * que te delata al apuntar no puede enterarte jugando.
            */}
          {weapon.scope ? (
            <Stat
              label="Mirilla"
              value={`${(CAMERA.fov / weapon.scope.fov).toFixed(1)}× con el clic derecho` +
                (weapon.scope.destello ? ' · el rival ve un destello mientras apuntas' : ' · sin destello')}
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
          {/* **Una escopeta dice cuántos perdigones y cuánto abre** (vuelta
              91), porque su daño real no se lee en la fila de arriba: ahí pone
              lo que vale **un** perdigón, y lo que llega a un cuerpo depende de
              cuántos caben en él. Es lo mismo que el `perforaArmadura` del
              Reaper — lo único que un arma hace y no está en sus números. */}
          {weapon.perdigones ? (
            <Stat
              label="Perdigones"
              value={`${weapon.perdigones.n} por disparo en un cono de ${weapon.perdigones.conoGrados}° · de cerca entran todos y matan; de lejos entra uno`}
            />
          ) : null}
          {/* Y una recarga por cartuchos se dice, porque cambia cómo se juega:
              se puede cortar. La fila «Cargador» sólo dice cuánto tarda uno. */}
          {weapon.recargaPorCartucho ? (
            <Stat
              label="Recarga"
              value={`cartucho a cartucho, ${weapon.reloadMs} ms cada uno · se interrumpe disparando`}
            />
          ) : null}
          {weapon.tiro?.reserva ? (
            <Stat
              label={weapon.slot === 'throwable' ? 'Cuántas llevas' : 'Cohetes'}
              value={weapon.slot === 'throwable'
                ? `${weapon.tiro.reserva.inicial + weapon.magazine} por vida · ` +
                  // **Y el Fang se recupera, que es lo suyo** (vuelta 90).
                  // Antes esta rama miraba `granada`, y con un arrojadizo que
                  // no es una granada habría contado los cohetes del U2.
                  (weapon.tiro.clavable
                    ? 'acertar la gasta, fallar la deja clavada · se recoge pasando por encima'
                    : 'no se reponen')
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
   * **Por categorías, y una cada vez** (vuelta 92). Eran las catorce fichas
   * seguidas en una rejilla, y con el arsenal cerrado eso son tres filas y
   * medio panel de rueda: el sitio donde se **comparan** armas obligaba a
   * recorrerlo, que es justo lo contrario de lo que la vuelta 43 le pidió a
   * esta pantalla («comparar es mirar, no restar»).
   *
   * Las categorías **son las ranuras** y no una clasificación aparte, y eso no
   * es comodidad: lo que se compara de verdad es lo que compite por la misma
   * tecla. Comparar el cuchillo con un rifle no decide nada, porque se llevan
   * los dos.
   *
   * De ahí sale el resto de la forma: dentro de una categoría caben todas sus
   * fichas en una fila, así que `subgrid` vuelve a alinearlas —con dos filas de
   * fichas cada fila cuadra por su cuenta, y CADENCIA dejaba de estar a la
   * misma altura en las catorce—.
   */
  const porRanura = RANURAS.map((ranura) => ({
    ...ranura,
    armas: Object.keys(WEAPONS).filter((key) => WEAPONS[key].slot === ranura.slot),
  })).filter((ranura) => ranura.armas.length > 0)

  /**
   * **Se abre por la categoría del arma que llevas en la mano.** Abrir siempre
   * por la primera obliga a buscar lo que se estaba mirando; la que tienes
   * empuñada es la única que el panel sabe que te interesa ahora mismo.
   */
  const ranuraEnMano = equipped?.weaponKey ? WEAPONS[equipped.weaponKey]?.slot : null
  const [abierta, setAbierta] = useState(
    porRanura.some((r) => r.slot === ranuraEnMano) ? ranuraEnMano : porRanura[0].slot,
  )
  const activa = porRanura.find((r) => r.slot === abierta) ?? porRanura[0]

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

  /**
   * **Y el foco va al panel, no al botón de cerrar** (vuelta 92, con la lección
   * de la 78). «Cerrar» es el **último** hijo de un panel que además es el
   * contenedor con scroll, así que el navegador lo traía a la vista al montar
   * y con él arrastraba la lista entera: la armería abría por el final, con el
   * raíl de categorías —que es lo primero que hay que ver— fuera de la
   * pantalla. Es literalmente el mismo fallo que opciones tuvo hasta la 78, y
   * aquí llevaba desde la vuelta 42.
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
      className="panel panel--armoury"
      ref={panelRef}
      tabIndex={-1}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <h2 className="panel__title panel__title--small">
        {soloFicha ? 'Fichas de las armas' : 'Armería'}
      </h2>

      {/**
        * **El raíl dice qué ranuras hay, esté abierta la que esté.** Es la
        * misma regla que el raíl del editor (vuelta 78): la lista de lo que se
        * puede configurar tiene que verse sin abrir nada, o no se sabe que
        * está. Y cada pestaña lleva **su tecla**, porque la armería es también
        * donde se aprende el mapa de controles del equipo.
        */}
      <div className="armoury__ranuras" role="tablist" aria-label="Ranuras">
        {porRanura.map((ranura) => (
          <button
            key={ranura.slot}
            type="button"
            role="tab"
            aria-selected={ranura.slot === activa.slot}
            className={`armoury__ranura${ranura.slot === activa.slot ? ' armoury__ranura--activa' : ''}`}
            onClick={() => setAbierta(ranura.slot)}
          >
            <span className="armoury__ranura-nombre">{ranura.label}</span>
            <span className="armoury__ranura-tecla">{ranura.tecla}</span>
          </button>
        ))}
      </div>

      <p className="panel__hint">
        {activa.nota}
        {soloFicha && (
          <> Aquí lo que llevas lo decide el servidor: se compra, o lo reparte el mapa.</>
        )}
      </p>

      <div
        className="armoury__grid"
        style={{ '--armoury-filas': FILAS_DE_FICHA, '--armoury-stats': FILAS_DE_STATS }}
      >
        {activa.armas.map((key) => (
          <WeaponCard
            key={key}
            weaponKey={key}
            // En el modo de consulta **nada está «equipado»**: lo que llevas
            // no sale de este ajuste, sale del servidor. Marcar la que tienes
            // guardada en el juego sería señalar un arma que no llevas.
            equipped={!soloFicha && key === settings[SLOT_SETTING[WEAPONS[key].slot]]}
            inHand={key === equipped?.weaponKey}
            suppressed={Boolean(settings.suppressor[key])}
            slotKey={RANURA[WEAPONS[key].slot]?.tecla ?? '1'}
            onEquip={(next) => onChange({ [SLOT_SETTING[WEAPONS[next].slot]]: next })}
            onSuppressor={toggleSuppressor}
            soloFicha={soloFicha}
          />
        ))}
      </div>

      <div className="panel__actions">
        <button type="button" className="button button--primary" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  )
}
