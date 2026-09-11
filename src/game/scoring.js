/**
 * Puntuación por estrellas de un escenario.
 *
 * La nota es una media ponderada de varias variables normalizadas a 0..1. Dos
 * están activas y dos **reservadas**: ya tienen su hueco en la fórmula, con peso
 * 0, para que implementarlas más adelante sea darles peso y nada más.
 *
 * La media se normaliza **por la suma de los pesos**, no por el número de
 * variables. Es lo que hace que un peso 0 sea de verdad inerte: sin normalizar,
 * dos variables a 0.5 y dos a 0 darían como mucho media nota.
 *
 * Que el explosivo detone **no se puntúa**. Es un resultado de fallo aparte, no
 * una estrella baja: quien no llega a desactivar no ha hecho una mala partida,
 * ha hecho otra cosa.
 */

import { OBJECTIVE, SCORING } from '../config.js'

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value)

/**
 * Normaliza cada variable a 0..1, donde 1 siempre es "lo mejor posible".
 *
 * @param {object} input
 * @param {number} input.shots disparos efectuados
 * @param {number} input.hits impactos
 * @param {number} input.elapsedMs tiempo transcurrido desde que apareció el explosivo
 * @param {number} [input.damageTaken] RESERVADO
 * @param {number} [input.deaths] RESERVADO
 */
export function scoreParts({ shots, hits, elapsedMs, damageTaken = 0, deaths = 0 }) {
  return {
    // Sin disparos no hay precisión que medir. Se parte de 1 para que el
    // indicador no arranque la sesión en cero y baje: arranca lleno y se gana.
    accuracy: shots > 0 ? clamp01(hits / shots) : 1,
    // Cuanto antes se desactive dentro de la cuenta atrás, mejor.
    time: clamp01(1 - elapsedMs / OBJECTIVE.timerMs),
    // RESERVADAS: con peso 0 no entran en la media, pero se calculan igual para
    // que el día que se les dé peso no haya que tocar nada más.
    damage: clamp01(1 - damageTaken / SCORING.damageReference),
    deaths: clamp01(1 - deaths / SCORING.deathsReference),
  }
}

/**
 * Nota global 0..1 a partir de las partes ya normalizadas.
 * Si todos los pesos fueran 0, devuelve 0 en vez de dividir por cero.
 */
export function scoreValue(parts) {
  const weights = SCORING.weights
  let total = 0
  let sum = 0
  for (const key of Object.keys(weights)) {
    const weight = weights[key]
    if (weight <= 0) continue
    total += weight * (parts[key] ?? 0)
    sum += weight
  }
  return sum > 0 ? total / sum : 0
}

/** Estrellas 1..5 a partir de la nota. Los cortes viven en `SCORING`. */
export function starsFor(value) {
  const cuts = SCORING.starThresholds
  for (let i = 0; i < cuts.length; i++) {
    if (value >= cuts[i]) return 5 - i
  }
  return 1
}

/**
 * Atajo para el HUD y el resumen: partes, nota y estrellas de una tacada.
 * @returns {{ parts: object, value: number, stars: number }}
 */
export function computeScore(input) {
  const parts = scoreParts(input)
  const value = scoreValue(parts)
  return { parts, value, stars: starsFor(value) }
}
