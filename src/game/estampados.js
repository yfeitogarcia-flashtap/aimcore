/**
 * **Los estampados: los logos que un mapa pega en una superficie** (vuelta 93).
 *
 * Un plano con una textura, y nada más. Lo que lo hace seguro está en tres
 * decisiones, y las tres son las mismas que las del fondo fotográfico de la
 * vuelta 78 — que es el precedente entero de esto:
 *
 * - **No es geometría del mapa.** Va en su propio grupo, **fuera de
 *   `occluders`**, sin colisión y sin recibir un rayo. Montarlo como una pieza
 *   más sería un logo que para balas y tapa apariciones, que es exactamente lo
 *   que un adorno no puede hacer.
 * - **El mundo no lo espera.** La textura se pide y se pone cuando llega; si no
 *   llega, ahí no hay nada y el mapa se juega igual. Una partida no puede tardar
 *   en empezar por un logo.
 * - **Y la ruta la acota `esImagenDeEstampado`**, no este módulo: aquí ya llega
 *   saneada. Un mapa capaz de pedir cualquier URL es un mapa capaz de hacer que
 *   el juego pida lo que sea con sólo abrirlo.
 *
 * Vive en el motor, así que **sale igual entrenando, en el duelo y en el
 * editor** (la convención de la vuelta 63).
 */
import * as THREE from 'three'
import { ESTAMPADOS } from '../config.js'

/**
 * Hacia dónde mira cada cara, y cuánto girar el plano para encararla. Un
 * `PlaneGeometry` nace mirando a +Z, así que lo que hay aquí son las cuatro
 * vueltas de yaw y las dos de pitch.
 *
 * **Y el desplazamiento va con la normal**, no con un signo escrito a mano: es
 * lo que hace que `separacion` signifique «un centímetro por delante de la
 * superficie» en las seis y no en cuatro.
 */
const CARAS = {
  norte: { normal: [0, 0, -1], rotacion: [0, Math.PI, 0] },
  sur: { normal: [0, 0, 1], rotacion: [0, 0, 0] },
  este: { normal: [1, 0, 0], rotacion: [0, Math.PI / 2, 0] },
  oeste: { normal: [-1, 0, 0], rotacion: [0, -Math.PI / 2, 0] },
  suelo: { normal: [0, 1, 0], rotacion: [-Math.PI / 2, 0, 0] },
  techo: { normal: [0, -1, 0], rotacion: [Math.PI / 2, 0, 0] },
}

export class Estampados {
  /**
   * @param {THREE.Group} grupo Dónde colgarse. Lo da el escenario, y **no es**
   *   el grupo de la geometría: así un estampado no puede colarse en los
   *   oclusores por descuido.
   * @param {object[]} lista Lo que declara el mapa, ya saneado.
   */
  constructor(grupo, lista) {
    this.grupo = new THREE.Group()
    grupo.add(this.grupo)
    this.materiales = []
    this.geometrias = []
    this.texturas = []
    this.cargador = null

    /**
     * **Sin pantalla no hay estampado, y eso no es una guarda defensiva: es una
     * decisión que ya está tomada tres veces.**
     *
     * `Scenario` lo monta también **el servidor** (`net/partida.js` importa el
     * escenario tal cual para la colisión), y ahí no hay ni escena ni altavoces —
     * es la misma razón por la que la Blind no existe en el servidor (vuelta 87)
     * y por la que `usoDeDispositivo` no le hace falta (vuelta 82). Lo que pasa
     * si no se dice es peor que un adorno de menos: `THREE.TextureLoader` pide un
     * `document` para crear su `<img>`, así que **un mapa con un logo tiraba el
     * huésped de Node al montarse**. Lo cazó `estampado93` antes de que nadie lo
     * jugara.
     */
    if (typeof document === 'undefined') return

    for (const e of lista ?? []) {
      const cara = CARAS[e.cara] ?? CARAS.norte
      const geometria = new THREE.PlaneGeometry(e.ancho, e.alto)
      /**
       * **Nace invisible y se enciende al llegar la textura.** Un plano blanco
       * esperando su imagen es un rectángulo blanco en medio del mapa, y con
       * una imagen que no llegue se queda para siempre: se ve peor que no ver
       * nada, que es lo que la regla de «el mundo no lo espera» quiere decir.
       */
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const malla = new THREE.Mesh(geometria, material)
      malla.position.set(
        e.x + cara.normal[0] * ESTAMPADOS.separacion,
        e.y + cara.normal[1] * ESTAMPADOS.separacion,
        e.z + cara.normal[2] * ESTAMPADOS.separacion,
      )
      malla.rotation.set(...cara.rotacion)
      /**
       * **Y el giro, dentro de su propio plano** (vuelta 95). Un
       * `PlaneGeometry` vive en su XY local, así que girar sobre **su** Z es
       * exactamente «girar el logo sin moverlo de la pared». Va después de
       * encarar la cara y en local (`rotateZ`), no como un tercer ángulo de la
       * Euler: ahí dependería del orden y un logo del techo saldría girado por
       * otro eje.
       */
      if (e.giro) malla.rotateZ(e.giro)
      // Que ningún rayo le pregunte nada: ni el disparo, ni la visibilidad, ni
      // el tirador del editor. Es lo que lo deja fuera del presupuesto.
      malla.raycast = () => {}
      this.grupo.add(malla)
      this.materiales.push(material)
      this.geometrias.push(geometria)

      this.cargador ??= new THREE.TextureLoader()
      this.cargador.load(
        e.imagen,
        (textura) => {
          textura.colorSpace = THREE.SRGBColorSpace
          material.map = textura
          material.opacity = 1
          material.needsUpdate = true
          this.texturas.push(textura)
        },
        undefined,
        // Sin la imagen, ahí no hay nada. No se dibuja un hueco ni se avisa en
        // pantalla: lo que falta es un adorno, no una pieza del mapa.
        () => {},
      )
    }
  }

  dispose() {
    for (const m of this.materiales) m.dispose()
    for (const g of this.geometrias) g.dispose()
    for (const t of this.texturas) t.dispose()
    this.grupo.parent?.remove(this.grupo)
    this.materiales.length = 0
    this.geometrias.length = 0
    this.texturas.length = 0
  }
}
