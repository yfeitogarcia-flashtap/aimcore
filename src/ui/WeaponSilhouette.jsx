import { WEAPONS } from '../config.js'

/**
 * Silueta del arma para el HUD: perfil lateral, sólo contorno, sin relleno.
 *
 * Trazadas a mano sobre las referencias de `Reference/Weapons/`, en un
 * `viewBox` común y con el cañón a la izquierda como en ellas, para que las
 * tres se lean a la misma escala y con el mismo peso de línea que el resto del
 * HUD. Las imágenes son sólo guía: no se importan ni se envían al navegador. No hay imágenes de por medio: el color y el
 * grosor los hereda del CSS, así que la silueta acompaña a cualquier cambio de
 * paleta sin tocar este archivo.
 *
 * Cada entrada mezcla el contorno principal y un par de subtrazos de detalle
 * —guardamonte, carcasa— en un solo `d`. A tamaño de HUD, más detalle sólo
 * emborrona.
 */
const SILHOUETTES = {
  // Perfil de fusil de asalto: bocacha, alza de torreta, tubo de gas sobre el
  // guardamanos, cargador curvo hacia el cañón, empuñadura inclinada y culata
  // fija descendente.
  'axis-7': [
    'M 4 19 L 16 19 L 16 21 L 26 21 L 26 12 L 31 12 L 31 21 L 43 21',
    'L 43 16 L 52 16 L 52 18 L 72 18 L 72 15 L 80 15 L 80 13 L 118 13',
    'L 157 25 L 157 35 L 133 35 L 128 48 L 118 48 L 122 31 L 107 31',
    // Cargador curvo hacia delante: el rasgo más reconocible del arquetipo.
    'Q 104 44 96 55 L 84 55 Q 85 42 88 31 L 80 31 L 80 29 L 52 29 L 52 27 L 43 27',
    'L 43 25 L 16 25 L 16 27 L 4 27 Z',
    // Guardamonte.
    'M 107 31 Q 109 39 116 37',
  ].join(' '),

  // Subfusil de polímero: riel corrido, empuñadura vertical delantera,
  // cargador recto y culata plegable de esqueleto.
  'vertex-9': [
    'M 6 23 L 18 23 L 18 19 L 30 19 L 30 13 L 88 13 L 88 19 L 100 19',
    'L 100 34 L 92 34 L 86 51 L 75 51 L 79 34 L 68 34 L 66 57 L 50 57',
    'L 52 34 L 18 34 L 18 27 L 6 27 Z',
    // Empuñadura vertical delantera.
    'M 26 34 L 39 34 L 39 51 L 26 51 Z',
    // Culata plegable: marco abierto, no una pieza maciza.
    'M 100 21 L 146 21 L 152 27 L 152 33 L 146 39 L 100 39 L 100 36 L 144 36',
    'L 148 32 L 148 28 L 144 24 L 100 24 Z',
    // Guardamonte.
    'M 79 34 Q 81 42 88 40',
  ].join(' '),

  // Pistola con silenciador: el cilindro es mucho más grueso que la corredera
  // y sale muy por delante de ella.
  'scalar-2-suppressed': [
    'M 78 16 L 126 15 L 126 12 L 138 12 L 138 22 L 132 22 L 143 54 L 127 57',
    'L 119 34 L 116 34 L 116 39 Q 110 41 106 34 L 103 34 L 103 30 L 78 30 Z',
    // Cilindro del silenciador y su junta.
    'M 6 13 L 77 13 L 77 33 L 6 33 Z',
    'M 71 13 L 71 33',
  ].join(' '),

  // Sin silenciador: misma pistola, cañón al ras de la corredera.
  'scalar-2': [
    'M 78 16 L 126 15 L 126 12 L 138 12 L 138 22 L 132 22 L 143 54 L 127 57',
    'L 119 34 L 116 34 L 116 39 Q 110 41 106 34 L 103 34 L 103 30 L 78 30 Z',
    // Boca del cañón, asomando apenas de la corredera.
    'M 74 19 L 78 19 M 74 27 L 78 27 M 74 19 L 74 27',
  ].join(' '),
}

/**
 * @param {{ weaponKey: string, suppressed?: boolean }} props
 */
export default function WeaponSilhouette({ weaponKey, suppressed = false }) {
  // Sólo Scalar-2 tiene variante con silenciador dibujada; el resto reutiliza
  // su única silueta aunque el arma admita silenciador.
  const withSuppressor = `${weaponKey}-suppressed`
  const key = suppressed && SILHOUETTES[withSuppressor] ? withSuppressor : weaponKey
  const path = SILHOUETTES[key]
  if (!path) return null

  return (
    <div className="weapon" aria-label={WEAPONS[weaponKey]?.label}>
      <svg className="weapon__svg" viewBox="0 0 160 62" role="presentation">
        <path d={path} />
      </svg>
      <span className="weapon__label">{WEAPONS[weaponKey]?.label}</span>
    </div>
  )
}
