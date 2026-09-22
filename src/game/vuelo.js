/**
 * **Lo que se ve de un proyectil en el aire** (vuelta 85).
 *
 * Sólo dibuja: el modelo está en `proyectiles.js` y no sabe que esto existe,
 * que es lo que deja que el servidor lo corra en Node sin escena. Es el mismo
 * reparto que `dispositivos.js` con el movimiento.
 *
 * **Un `InstancedMesh` y nada más**, que es el patrón de `impacts.js` desde la
 * vuelta 64: una geometría, un material y una malla para todo el pool. Cero
 * alocaciones por frame y una sola llamada de dibujo aunque vuelen ocho.
 *
 * Y lo que se dibuja **es una estela, no una bola**. Vektor no tiene luces, así
 * que lo único que distingue una cosa de otra es la silueta: una esfera de dos
 * centímetros a veinte unidades son dos píxeles que no dicen ni hacia dónde va.
 * Un huso alargado y **orientado a la velocidad** dice las dos cosas —dónde
 * está y a dónde apunta— y de paso es lo que hace que se pueda **ver venir**,
 * que es la mitad de que un arma con tiempo de vuelo sea justa.
 */

import * as THREE from 'three'
import { CLAVADAS, COLORS, GRENADES, PROJECTILES, WEAPONS } from '../config.js'

const _dummy = new THREE.Object3D()
const _dir = new THREE.Vector3()
/** El eje al que mira la geometría ya girada. Constante, como `SCREEN_CENTER`. */
const _adelante = new THREE.Vector3(0, 0, 1)
const _euler = new THREE.Euler()

/** Los colores de cada clase de proyectil. Lo que no esté aquí sale en blanco. */
const TINTES = {
  // Blanco roto, no gris de equipo: el mapa **es** gris, y una flecha del color
  // del mapa no se ve venir. Es el mismo argumento que el fogonazo de la
  // vuelta 40 — sin luces, lo único que separa una cosa del fondo es el tono.
  flecha: COLORS.health,
  // El cohete en ámbar: es lo único del juego que **hay que ver venir para
  // apartarse**, y el ámbar ya significa «hay algo que va a estallar» desde que
  // existe el explosivo (vuelta 27). Aquí no compite con él — una bomba está
  // quieta en el suelo y esto cruza el aire a treinta y cuatro unidades.
  cohete: COLORS.objective,
  /**
   * **Y las tres granadas, cada una con el suyo** (vuelta 87). Lo que hay que
   * poder contestar de un vistazo es *qué va a estallar ahí*, porque de eso
   * depende lo que hay que hacer: del Core se corre, de la Blind se aparta la
   * vista y de la KO se sale del sitio. Un solo tono para las tres dejaría esa
   * decisión sin información, y es justo la que el encargo pedía poder tomar.
   *
   * De todo lo demás las separa **la forma** —son octaedros que giran y no
   * husos orientados a la velocidad (regla de la vuelta 67)—, así que el color
   * sólo tiene que distinguirlas **entre sí**, y para eso los tres que ya hay
   * en la paleta son los más separados que se puede: rojo, blanco y azul.
   *
   * Que cada uno signifique ya otra cosa se admite por lo de siempre: no
   * coinciden. El rojo de `threat` es un icono flotando sobre un muñeco y una
   * cuña en el borde de la pantalla; el `electric` es el escudo y el cable de
   * una tirolina, a la altura de la cintura o cruzando el aire. Esto es un
   * objeto pequeño que cae al suelo y que dura cuatro segundos.
   */
  core: COLORS.threat,
  blind: COLORS.health,
  ko: COLORS.electric,
  /**
   * **El Fang en blanco roto, como la flecha** (vuelta 90), y por la misma
   * razón: el mapa es gris y una hoja del color del mapa no se ve venir. Que
   * repita el tinte de la flecha no es una colisión de significados — es que
   * dice lo mismo, «esto viene a clavarse», y lo que las separa es la forma
   * (una es un huso largo y ésta una hoja corta) y el sitio (una pasa y la otra
   * se queda en el suelo).
   */
  fang: COLORS.health,
}

/**
 * **Qué clases se dibujan como granada.** Sale del catálogo y no de una lista
 * escrita a mano: el día que haya una cuarta, se dibuja sola.
 */
const GRANADAS = new Set(
  Object.values(WEAPONS).filter((a) => a.tiro?.granada).map((a) => a.tiro.proyectil),
)

export class VueloDeProyectiles {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene
    const pool = PROJECTILES.pool
    const { largo, radio } = PROJECTILES.estela
    // Un huso: dos conos pegados por la base, que es un cilindro de tres lados
    // con las puntas cerradas. Barato y con silueta.
    const geom = new THREE.CylinderGeometry(0, radio, largo, 6, 1, false)
    // El cilindro nace mirando a +Y y se quiere mirando a +Z, que es el eje al
    // que se le aplica la rotación de la velocidad.
    geom.rotateX(Math.PI / 2)
    geom.translate(0, 0, -largo * 0.25)
    this.geom = geom
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
    this._color = new THREE.Color()
    this.mesh = this._malla(geom, pool)
    /**
     * **Y una segunda malla para las granadas** (vuelta 87), porque un
     * `InstancedMesh` tiene **una** geometría y una granada no es un huso: es
     * un cuerpo facetado que gira mientras vuela, se para y **se queda a la
     * vista en el suelo** hasta que le llega la hora. Sin luces en la escena la
     * silueta es lo único que dice qué es una cosa (vuelta 38), así que la
     * forma es la que separa «esto viene a clavarse» de «esto se va a quedar
     * ahí y va a estallar».
     *
     * Son dos llamadas de dibujo en total aunque vuelen ocho, que es
     * exactamente una más que antes.
     */
    this.geomG = new THREE.OctahedronGeometry(GRENADES.dibujo.radioU, 0)
    this.meshG = this._malla(this.geomG, pool)
    /**
     * **Y una tercera para lo que ya no vuela** (vuelta 90): los cuchillos
     * clavados. Comparte **la misma geometría** que el huso, porque es la misma
     * cosa — una hoja — sólo que parada; lo que no puede compartir es la malla,
     * porque las ranuras de un `InstancedMesh` son las del pool de vuelo y un
     * cuchillo clavado ya no ocupa ninguna.
     *
     * Con esto son tres llamadas de dibujo en total, una más que antes y
     * ninguna por cuchillo.
     */
    this.meshC = this._malla(geom, CLAVADAS.pool)
  }

  /** Una malla instanciada con su color por instancia y todo apagado. */
  _malla(geom, pool) {
    const mesh = new THREE.InstancedMesh(geom, this.mat, pool)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.count = pool
    mesh.frustumCulled = false
    mesh.castShadow = false
    this.scene.add(mesh)
    // Un color por instancia: una flecha y un cohete no son lo mismo.
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(pool * 3), 3)
    // Todas apagadas de salida. Apagarse es **bajar la escala a cero**: con un
    // material compartido no se puede bajar la opacidad de una sola.
    for (let i = 0; i < pool; i++) this._apagarEn(mesh, i)
    return mesh
  }

  _apagarEn(mesh, i) {
    _dummy.position.set(0, -1000, 0)
    _dummy.scale.set(0, 0, 0)
    _dummy.quaternion.identity()
    _dummy.updateMatrix()
    mesh.setMatrixAt(i, _dummy.matrix)
  }

  /**
   * **Pone cada instancia donde esté su proyectil.** Se llama una vez por
   * frame con el modelo delante: no guarda copia de nada, que es lo que hace
   * imposible que el dibujo y el mundo se despeguen.
   *
   * @param {import('./proyectiles.js').Proyectiles} pr
   * @param {number} alpha interpolación del frame, como la pose de la cámara
   */
  update(pr, alpha = 1) {
    for (let i = 0; i < pr.pool; i++) {
      const granada = GRANADAS.has(pr.tipo[i])
      // Cada proyectil va en **una** de las dos mallas, así que la otra tiene
      // que quedarse apagada en esa ranura o se dibujaría un huso dentro de una
      // granada.
      this._apagarEn(granada ? this.mesh : this.meshG, i)
      const mesh = granada ? this.meshG : this.mesh
      if (pr.estado[i] === 0) { this._apagarEn(mesh, i); continue }
      // La velocidad de ahora: la de salida más lo que le han hecho la gravedad
      // y el roce. Sale de derivar la misma parábola, no de restar posiciones.
      const t = pr.t[i]
      _dir.set(
        pr.vx[i] + pr.ax[i] * t,
        pr.vy[i] - pr.g[i] * t,
        pr.vz[i] + pr.az[i] * t,
      )
      const largo = _dir.length()
      if (largo > 1e-6) _dir.divideScalar(largo)
      else _dir.set(0, 0, -1)
      _dummy.position.set(pr.x[i], pr.y[i], pr.z[i])
      if (granada) {
        /**
         * **Una granada gira mientras se mueve y se queda quieta al pararse**
         * (vuelta 87), y eso no es adorno: es la mitad de que «ya está» se lea
         * de un vistazo. El ángulo sale de **su reloj de vuelo**, que es un
         * campo que ya existe, así que no hay nada nuevo que guardar y los dos
         * extremos de una partida la dibujan igual sin haberlo hablado.
         */
        if (pr.quieta[i]) {
          _dummy.quaternion.identity()
        } else {
          // El desfase por número de serie es lo que evita que dos granadas
          // en el aire a la vez giren exactamente igual, que se lee como una
          // sola cosa duplicada.
          const a = pr.serie[i] * 0.7
          const giro = pr.vida[i] * GRENADES.dibujo.giroPorSegundo * Math.PI * 2
          _euler.set(giro + a, giro * 0.63 + a, 0)
          _dummy.quaternion.setFromEuler(_euler)
        }
        _dummy.scale.set(1, 1, 1)
      } else {
        // El huso ya nace girado a +Z, así que lo que hay que resolver es la
        // rotación que lleva ese eje al de la velocidad.
        _dummy.quaternion.setFromUnitVectors(_adelante, _dir)
        // **Y lo larga que es dice con cuánta fuerza salió** (`intensidad`), que
        // es lo que deja distinguir a veinte unidades una flecha floja de una que
        // mata. La sección no crece: lo que se lee de lejos es el largo.
        const k = 1 + PROJECTILES.estela.porFuerza * (pr.intensidad[i] ?? 1)
        _dummy.scale.set(1, 1, k)
      }
      _dummy.updateMatrix()
      mesh.setMatrixAt(i, _dummy.matrix)
      this._color.set(TINTES[pr.tipo[i]] ?? 0xffffff)
      mesh.setColorAt(i, this._color)
    }
    for (const mesh of [this.mesh, this.meshG]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }

  /**
   * **Y los cuchillos clavados** (vuelta 90), que se dibujan con el mismo huso
   * orientado a la dirección con la que llegaron: una hoja metida en una pared
   * apunta hacia donde iba.
   *
   * **Se balancean despacio**, como un recogible: sin luces en la escena, lo
   * que dice que algo es un objeto y no una arista de la geometría es que se
   * mueva (vuelta 33). Y el balanceo va con el **reloj del mundo** —el mismo
   * `now` que las marcas de impacto— así que en pausa se queda quieto.
   *
   * @param {import('./clavadas.js').Clavadas} cl
   * @param {number} now reloj del mundo, en ms
   */
  updateClavadas(cl, now = 0) {
    const d = CLAVADAS.dibujo
    for (let i = 0; i < this.meshC.count; i++) {
      if (i >= cl.pool || cl.id[i] === 0) { this._apagarEn(this.meshC, i); continue }
      _dir.set(cl.dx[i], cl.dy[i], cl.dz[i])
      // El desfase por identificador es lo que evita que dos cuchillos en el
      // suelo se balanceen a la vez, que se lee como una sola cosa duplicada.
      const fase = (now / 1000) * d.vaivenPorSegundo * Math.PI * 2 + cl.id[i] * 1.3
      _dummy.position.set(cl.x[i], cl.y[i] + Math.sin(fase) * d.vaivenU, cl.z[i])
      _dummy.quaternion.setFromUnitVectors(_adelante, _dir)
      _dummy.scale.set(d.escala, d.escala, d.escala)
      _dummy.updateMatrix()
      this.meshC.setMatrixAt(i, _dummy.matrix)
      this._color.set(TINTES.fang ?? 0xffffff)
      this.meshC.setColorAt(i, this._color)
    }
    this.meshC.instanceMatrix.needsUpdate = true
    if (this.meshC.instanceColor) this.meshC.instanceColor.needsUpdate = true
  }

  dispose() {
    this.scene.remove(this.mesh)
    this.scene.remove(this.meshG)
    this.scene.remove(this.meshC)
    this.geom.dispose()
    this.geomG.dispose()
    this.mat.dispose()
  }
}
