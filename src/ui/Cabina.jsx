import { VektorMark } from './Logo.jsx'

/**
 * **La carcasa de la cabina** (vuelta 99): raíl de secciones a la izquierda,
 * barra de estado arriba y el contenido debajo. Es la dirección B de las
 * maquetas de la 98, y se escribe **una vez** para todas las pantallas de menú
 * del juego —inicio, entrenamiento, armería y opciones—: lo que cambia de una a
 * otra es lo de dentro, no el marco.
 *
 * El raíl lleva **la palabra debajo de cada icono**, que es la regla del raíl
 * de Alchemist (vuelta 78): un raíl de pictogramas es un examen.
 *
 * No sabe qué hace cada sección: recibe cuál está puesta y a quién avisar. El
 * duelo sale de aquí como un enlace, igual que el botón de la vuelta 66: esta
 * página sigue sin saber que existe la red.
 */

/** Los iconos del raíl, a trazo, en una caja de 24. Sin imágenes: son SVG. */
const ICONOS = {
  inicio: 'M3 11l9-7 9 7v9h-6v-6H9v6H3z',
  entrenamiento: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M12 1v4M12 19v4M1 12h4M19 12h4',
  duelo: 'M4 20L14 10M14 10l3-7 4 4-7 3M20 20L10 10M10 10L7 3 3 7l7 3',
  armeria: 'M2 9h16l4 3v3H2zM6 15v4h4v-4',
  opciones: 'M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  salir: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h11',
}

export function Icono({ nombre, className = 'cab-rail__icono' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONOS[nombre]} />
    </svg>
  )
}

/** Las secciones, en el orden del raíl. Jugar arriba, prepararse debajo. */
export const SECCIONES = [
  { clave: 'inicio', nombre: 'Inicio' },
  { clave: 'entrenamiento', nombre: 'Entrenar' },
  { clave: 'duelo', nombre: 'Duelo' },
  { clave: 'armeria', nombre: 'Armería' },
  { clave: 'opciones', nombre: 'Opciones' },
]

export default function Cabina({ seccion, titulo, estado = null, onIr, onMarca, children }) {
  // Un clic dentro de la cabina no es el clic que captura el ratón: ahí hay
  // botones que pulsar (la regla de los overlays del juego, vuelta 48).
  const tragar = (event) => event.stopPropagation()
  return (
    <div className="cab" onMouseDown={tragar}>
      <nav className="cab-rail" aria-label="Secciones">
        <button type="button" className="cab-rail__marca" onClick={onMarca} title="Vektor">
          <VektorMark className="cab-rail__logo" />
        </button>
        {SECCIONES.map((s) => (
          <button
            key={s.clave}
            type="button"
            className={`cab-rail__item${s.clave === seccion ? ' cab-rail__item--activo' : ''}`}
            aria-current={s.clave === seccion ? 'page' : undefined}
            onClick={() => onIr(s.clave)}
          >
            <Icono nombre={s.clave} />
            {s.nombre}
          </button>
        ))}
      </nav>
      <header className="cab-barra">
        <h1 className="cab-barra__titulo">{titulo}</h1>
        {estado && <span className="cab-barra__estado">{estado}</span>}
      </header>
      <main className="cab-main">{children}</main>
    </div>
  )
}
