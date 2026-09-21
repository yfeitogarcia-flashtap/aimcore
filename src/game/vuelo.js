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
import { COLORS, PROJECTILES } from '../config.js'

const _dummy = new THREE.Object3D()
const _dir = new THREE.Vector3()
/** El eje al que mira la geometría ya girada. Constante, como `SCREEN_CENTER`. */
const _adelante = new THREE.Vector3(0, 0, 1)

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
}

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
    this.mesh = new THREE.InstancedMesh(geom, this.mat, pool)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.count = pool
    this.mesh.frustumCulled = false
    this.mesh.castShadow = false
    scene.add(this.mesh)
    // Un color por instancia: una flecha y un cohete no son lo mismo.
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(pool * 3), 3)
    this._color = new THREE.Color()
    // Todas apagadas de salida. Apagarse es **bajar la escala a cero**: con un
    // material compartido no se puede bajar la opacidad de una sola.
    for (let i = 0; i < pool; i++) this._apagar(i)
  }

  _apagar(i) {
    _dummy.position.set(0, -1000, 0)
    _dummy.scale.set(0, 0, 0)
    _dummy.quaternion.identity()
    _dummy.updateMatrix()
    this.mesh.setMatrixAt(i, _dummy.matrix)
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
      if (pr.estado[i] === 0) { this._apagar(i); continue }
      // La velocidad de ahora: la de salida más lo que le ha quitado la
      // gravedad. Sale de derivar la misma parábola, no de restar posiciones.
      _dir.set(pr.vx[i], pr.vy[i] - pr.g[i] * pr.t[i], pr.vz[i])
      const largo = _dir.length()
      if (largo > 1e-6) _dir.divideScalar(largo)
      else _dir.set(0, 0, -1)
      _dummy.position.set(pr.x[i], pr.y[i], pr.z[i])
      // El huso ya nace girado a +Z, así que lo que hay que resolver es la
      // rotación que lleva ese eje al de la velocidad.
      _dummy.quaternion.setFromUnitVectors(_adelante, _dir)
      // **Y lo larga que es dice con cuánta fuerza salió** (`intensidad`), que
      // es lo que deja distinguir a veinte unidades una flecha floja de una que
      // mata. La sección no crece: lo que se lee de lejos es el largo.
      const k = 1 + PROJECTILES.estela.porFuerza * (pr.intensidad[i] ?? 1)
      _dummy.scale.set(1, 1, k)
      _dummy.updateMatrix()
      this.mesh.setMatrixAt(i, _dummy.matrix)
      this._color.set(TINTES[pr.tipo[i]] ?? 0xffffff)
      this.mesh.setColorAt(i, this._color)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  dispose() {
    this.scene.remove(this.mesh)
    this.geom.dispose()
    this.mat.dispose()
  }
}
