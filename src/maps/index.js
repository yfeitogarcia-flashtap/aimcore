/**
 * **Registro de mapas de fichero. Generado — no se edita a mano.**
 *
 * Lo reescribe el editor al guardar (`/editor/`, sólo en desarrollo), igual
 * que `weaponPaths.js` lo reescribe `npm run trace:weapons`.
 *
 * Es un módulo con importaciones estáticas y no un barrido del directorio a
 * propósito: `import.meta.glob` es de Vite y **el huésped de Node importa
 * `src/config.js` directamente** (vuelta 72), así que un mapa tiene que poder
 * leerlo cualquiera de los tres montajes sin ponerse de acuerdo.
 *
 * La clave de cada mapa la declara **el propio fichero** (`clave`), no su
 * nombre: una segunda fuente de verdad para el mismo nombre es cómo un mapa
 * acaba llamándose de dos maneras.
 */

import mapa_Aim_camp_1 from './Aim-camp-1.js'
import mapa_empty from './empty.js'
import mapa_largoYPuerta from './largoYPuerta.js'
import mapa_mapa_nuevo from './mapa-nuevo.js'
import mapa_test_map_190926 from './test-map-190926.js'

/** @type {Record<string, object>} */
export const MAPAS_DE_FICHERO = {
  'Aim-camp-1': mapa_Aim_camp_1,
  'empty': mapa_empty,
  'largoYPuerta': mapa_largoYPuerta,
  'mapa-nuevo': mapa_mapa_nuevo,
  'test-map-190926': mapa_test_map_190926,
}
