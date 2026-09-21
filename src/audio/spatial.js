/**
 * Audio espacial: listener en la cámara y emisores posicionados en el mundo.
 *
 * **Es genérico a propósito.** No sabe nada del explosivo: sólo coloca un punto
 * en el mundo y devuelve el nodo al que hay que conectar una voz. Los pasos de
 * los dummies o un rival futuro se enganchan igual, sin tocar este fichero.
 *
 * El reparto es: `sfx.js` decide **cómo suena** algo y este módulo **desde
 * dónde**. Por eso la dependencia va en un solo sentido —de aquí a `sfx.js`, por
 * el contexto de audio— y las funciones de síntesis aceptan un destino sin
 * necesitar saber qué es.
 *
 * Dos detalles de `THREE.PositionalAudio` que no son evidentes:
 *
 * 1. El listener crea su propio `AudioContext` si no se le dice otra cosa, y
 *    nodos de dos contextos distintos no se pueden conectar. Por eso se le pasa
 *    el nuestro con `AudioContext.setContext()` **antes** de construirlo.
 * 2. `updateMatrixWorld` sale por la puerta de atrás si `hasPlaybackControl` es
 *    true y no se está reproduciendo — y aquí nunca se llama a `play()`, porque
 *    la fuente es síntesis en vivo, no un buffer. Sin poner `hasPlaybackControl`
 *    a false, **el panner se queda clavado en el origen** y no hay dirección
 *    ninguna.
 */

import * as THREE from 'three'
import { AUDIO, SPATIAL } from '../config.js'
import { initAudio } from './sfx.js'

/** @type {THREE.AudioListener | null} */
let listener = null
let enabled = true

/**
 * Engancha el listener a la cámara. Idempotente y perezosa: el contexto de audio
 * no existe hasta el primer gesto del usuario, así que llamarla antes no hace
 * nada y no pasa nada.
 *
 * @returns {boolean} si el listener quedó montado
 */
export function attachListener(camera) {
  if (listener) return true
  const context = initAudio()
  if (!context) return false

  THREE.AudioContext.setContext(context)
  listener = new THREE.AudioListener()
  listener.setMasterVolume(AUDIO.masterVolume)
  // Como hijo de la cámara, su posición y orientación se actualizan solas con
  // el recorrido de matrices que ya hace el render.
  camera.add(listener)
  return true
}

/** Suelta el listener. El contexto no se toca: es de `sfx.js`. */
export function detachListener() {
  if (!listener) return
  listener.parent?.remove(listener)
  listener = null
}

export function setSpatialEnabled(value) {
  enabled = Boolean(value)
}

export function isSpatialEnabled() {
  return enabled
}

/**
 * Un punto del mundo desde el que suena algo.
 *
 * Se crea barato y **no monta nada de audio hasta que hace falta**: se puede
 * construir en el constructor de cualquier sistema, mucho antes de que exista
 * el contexto.
 */
export class Emitter {
  /**
   * @param {THREE.Object3D} parent dónde colgarlo; normalmente la escena
   * @param {{refDistance?: number, maxDistance?: number, rolloffFactor?: number}} [curva]
   *   **La curva de distancia de este emisor**, si la suya no es la de la sala
   *   (vuelta 63). `SPATIAL` está calibrado para que un sonido del mundo se oiga
   *   de punta a punta del mapa, y hay voces que **no** quieren eso: una pisada
   *   dice «hay alguien cerca», así que la suya se apaga entera dentro del
   *   radio en el que esa frase significa algo. Sigue sin saberse aquí de qué
   *   voz se trata: se recibe una curva, no un nombre.
   */
  constructor(parent, curva = null) {
    this.parent = parent
    this.curva = curva
    this.position = new THREE.Vector3()
    /** @type {THREE.PositionalAudio | null} */
    this._audio = null
  }

  setPosition(x, y, z) {
    /**
     * **Un número roto no llega a una matriz** (vuelta 86). Es la misma regla
     * que `_guardState` en el movimiento, y por el mismo motivo: de aquí el
     * valor va a `panner.positionX`, que lo rechaza con una excepción **por
     * frame** — o sea un bucle que degrada en silencio con la consola llena
     * (vuelta 60). Se queda donde estaba, que es lo único sensato: un emisor
     * que no sabe dónde está suena donde sonaba.
     */
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
    this.position.set(x, y, z)
    if (this._audio) this._audio.position.copy(this.position)
  }

  /**
   * Nodo al que conectar una voz, o **null** si no hay audio espacial —porque
   * está apagado en opciones o porque todavía no hay listener—. Quien lo use
   * debe caer a su propio camino sin dirección cuando reciba null.
   */
  get input() {
    if (!enabled || !listener) return null
    if (!this._audio) this._create()
    return this._audio.panner
  }

  _create() {
    const audio = new THREE.PositionalAudio(listener)
    // Ver el punto 2 de la cabecera: sin esto el panner no se mueve nunca.
    audio.hasPlaybackControl = false
    audio.panner.panningModel = SPATIAL.panningModel
    audio.panner.distanceModel = SPATIAL.distanceModel
    audio.panner.refDistance = this.curva?.refDistance ?? SPATIAL.refDistance
    audio.panner.maxDistance = this.curva?.maxDistance ?? SPATIAL.maxDistance
    audio.panner.rolloffFactor = this.curva?.rolloffFactor ?? SPATIAL.rolloffFactor
    audio.position.copy(this.position)
    this.parent.add(audio)
    this._audio = audio
  }

  dispose() {
    if (!this._audio) return
    this._audio.parent?.remove(this._audio)
    this._audio.panner.disconnect()
    this._audio.gain.disconnect()
    this._audio = null
  }
}

/** Atajo legible para quien sólo quiere un emisor y no piensa en clases. */
export function createEmitter(parent, curva = null) {
  return new Emitter(parent, curva)
}
