/**
 * **Lo que una Blind y una KO le hacen a la pantalla** (vuelta 87).
 *
 * Las dos granadas que no hacen daño tienen un problema que el Core no tiene:
 * **lo que quitan no se ve en ninguna barra**. Una de fragmentación se explica
 * sola —la vida baja— y las otras dos sólo existen si la pantalla las cuenta.
 *
 * Vive en el motor, con su propia hoja de estilos, **como el tajo (vuelta 71) y
 * la mirilla (vuelta 70)**, y por la misma razón: las dos páginas tienen CSS
 * distinto y un bloque copiado en cada una es la misma ceguera escrita dos
 * veces. Así sale igual entrenando y en el duelo, que es la convención de la
 * vuelta 63.
 *
 * **Lo que distingue las dos es la forma, no la intensidad** (regla de la
 * vuelta 67):
 *
 * - **Blind**: blanco que **tapa desde el centro**, porque lo que quita es
 *   mirar. Entra en un fotograma —un destello no sube— y se va abriendo un
 *   agujero por el que se vuelve a ver, así que la recuperación se lee como
 *   recuperación y no como un telón que baja de golpe.
 * - **KO**: oscuro que **entra por los bordes** y se mueve. No tapa el centro
 *   —seguir pudiendo apuntar es justo lo que separa aturdir de cegar— y lo que
 *   dice es que el cuerpo no responde, que es lo que de verdad ha pasado: la
 *   marcha la ha bajado `movement.aturdir`.
 *
 * Y las dos se animan **por frame contra el reloj del mundo**, no con la API de
 * animaciones del navegador como el tajo: duran segundos y no milisegundos, así
 * que en pausa tienen que quedarse quietas. Cuesta dos escrituras de estilo por
 * frame y sólo mientras hay algo puesto.
 */

import { COLORS, GRENADES } from '../config.js'

const ESTILO_ID = 'vk-granadas-css'

function inyectarEstilos(doc) {
  if (doc.getElementById(ESTILO_ID)) return
  const style = doc.createElement('style')
  style.id = ESTILO_ID
  style.textContent = `
.vk-gren {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 6;
}
.vk-gren i {
  position: absolute;
  inset: 0;
  display: block;
  opacity: 0;
}
/* La ceguera: blanco macizo con un agujero que se abre desde el centro. El
   agujero es un degradado radial, así que "cuánto se ve" es un solo número. */
.vk-gren i.vk-gren--ciego {
  background: radial-gradient(
    circle at 50% 50%,
    transparent 0,
    transparent var(--vk-hueco, 0%),
    ${COLORS.health} calc(var(--vk-hueco, 0%) + 26%)
  );
}
/* El aturdimiento: oscuro por los bordes, centro libre. */
.vk-gren i.vk-gren--ko {
  background: radial-gradient(
    ellipse at 50% 50%,
    transparent 24%,
    rgba(10, 10, 10, 0.55) 62%,
    rgba(10, 10, 10, 0.92) 100%
  );
}
`
  doc.head.appendChild(style)
}

export class Granadas {
  constructor(contenedor) {
    const doc = contenedor.ownerDocument
    inyectarEstilos(doc)
    this.root = doc.createElement('div')
    this.root.className = 'vk-gren'
    this.root.setAttribute('aria-hidden', 'true')
    contenedor.appendChild(this.root)
    this.ciego = doc.createElement('i')
    this.ciego.className = 'vk-gren--ciego'
    this.ko = doc.createElement('i')
    this.ko.className = 'vk-gren--ko'
    this.root.appendChild(this.ko)
    this.root.appendChild(this.ciego)
    /** Cuánto queda de cada una y cuánto duraba, en el reloj del mundo. */
    this._cegueraHasta = -Infinity
    this._cegueraDur = 0
    this._cegueraFuerza = 0
    this._koHasta = -Infinity
    this._koDur = 0
    this._koFuerza = 0
    this._puestoCeguera = -1
    this._puestoKo = -1
  }

  /**
   * **Ciega.** `fuerza` entre 0 y 1, que es lo que ya trae calculado quien
   * llama: la caída del área **por cuánto la estabas mirando**.
   *
   * **Manda la más fuerte y no se suman**, como el aturdimiento del
   * movimiento: dos destellos seguidos no pueden dejar a nadie ciego el doble
   * de lo que dura el peor.
   */
  cegar(ahora, duracionMs, fuerza) {
    if (!(fuerza > 0)) return
    const hasta = ahora + duracionMs * fuerza
    if (fuerza > this._cegueraFuerza) {
      this._cegueraFuerza = fuerza
      this._cegueraDur = duracionMs * fuerza
    }
    if (hasta > this._cegueraHasta) this._cegueraHasta = hasta
  }

  /** Aturde la pantalla. El freno de la marcha lo pone `movement.aturdir`. */
  aturdir(ahora, duracionMs, fuerza) {
    if (!(fuerza > 0)) return
    const hasta = ahora + duracionMs
    if (fuerza > this._koFuerza) { this._koFuerza = fuerza; this._koDur = duracionMs }
    if (hasta > this._koHasta) this._koHasta = hasta
  }

  /** Lo apaga todo de golpe. Lo llama reaparecer y empezar una ronda. */
  limpiar() {
    this._cegueraHasta = -Infinity
    this._cegueraFuerza = 0
    this._koHasta = -Infinity
    this._koFuerza = 0
  }

  /** ¿Hay algo puesto? Lo pregunta el bucle para no escribir estilos de balde. */
  get activo() {
    return this._cegueraFuerza > 0 || this._koFuerza > 0
  }

  /**
   * **Un frame.** Va con el **reloj del mundo** (`engine.gameTime`), como las
   * marcas de bala desde la vuelta 64: en pausa una ceguera se queda quieta en
   * vez de gastarse mirando el menú.
   */
  update(ahora) {
    if (this._cegueraFuerza > 0) {
      const queda = this._cegueraHasta - ahora
      if (queda <= 0) {
        this._cegueraFuerza = 0
        this._pintarCeguera(0)
      } else {
        // Entra entera y se va abriendo: `k` es lo que queda de ceguera.
        const k = this._cegueraDur > 0 ? Math.min(1, queda / this._cegueraDur) : 1
        this._pintarCeguera(k)
      }
    }
    if (this._koFuerza > 0) {
      const queda = this._koHasta - ahora
      if (queda <= 0) {
        this._koFuerza = 0
        this._pintarKo(0, ahora)
      } else {
        const k = this._koDur > 0 ? Math.min(1, queda / this._koDur) : 1
        this._pintarKo(k * this._koFuerza, ahora)
      }
    }
  }

  _pintarCeguera(k) {
    // Se redondea a centésimas: escribir el mismo estilo sesenta veces por
    // segundo es sesenta recalculados de estilo que no cambian nada.
    const q = Math.round(k * 100)
    if (q === this._puestoCeguera) return
    this._puestoCeguera = q
    this.ciego.style.opacity = k > 0 ? String(Math.min(1, k * 1.6)) : '0'
    // El agujero por el que se vuelve a ver crece hasta tapar la pantalla.
    this.ciego.style.setProperty('--vk-hueco', `${Math.round((1 - k) * 78)}%`)
  }

  _pintarKo(k, ahora) {
    const q = Math.round(k * 100)
    const vaiven = GRENADES.pantalla.aturdimiento.vaivenGrados
    if (q === 0 && this._puestoKo === 0) return
    this._puestoKo = q
    this.ko.style.opacity = String(k)
    // Un vaivén lento: lo que dice «el cuerpo no responde». Va con el reloj del
    // mundo, así que en pausa se queda donde estaba.
    const a = Math.sin(ahora / 260) * vaiven * k
    this.ko.style.transform = k > 0 ? `rotate(${a.toFixed(2)}deg) scale(1.12)` : 'none'
  }

  dispose() {
    this.root.remove()
  }
}
