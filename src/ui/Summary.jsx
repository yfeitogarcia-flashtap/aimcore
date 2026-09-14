import { SESSION_MODES } from '../config.js'
import Stars from './Stars.jsx'

/**
 * Resumen de fin de sesión: precisión, dianas acertadas y dianas/segundo.
 *
 * Con explosivo aparecen además el desenlace y las estrellas. Que detone **no
 * es una estrella baja**: es un resultado de fallo aparte, y se enseña como tal.
 *
 * **Y en Deathmatch no hay estrellas, a propósito.** Las estrellas puntúan
 * *cumplir un objetivo* —la mitad de la nota es el tiempo que tardaste en
 * desactivar— y en un modo sin objetivo no hay contra qué medir: lo que cuenta
 * es lo que pasó, o sea bajas, muertes y precisión. Ver `docs/decisions.md` §41.
 */

function eyebrow(summary) {
  if (summary.objectiveOutcome === 'defused') return 'explosivo desactivado'
  if (summary.objectiveOutcome === 'exploded') return 'el explosivo detonó'
  if (summary.mode === 'deathmatch') {
    const nombre = SESSION_MODES.deathmatch.label.toLowerCase()
    return summary.endless
      ? `${nombre} · ${summary.durationS.toFixed(0)}s`
      : `${nombre} completado · ${(summary.durationS / 60).toFixed(0)} min`
  }
  return `sesión completada · ${summary.durationS.toFixed(0)}s`
}

/**
 * **KD con cero muertes es el número de bajas, no infinito.** Es la convención
 * de todos los marcadores del género y además es lo que se puede leer de un
 * vistazo: dividir entre cero daría `∞` y habría que explicarlo.
 */
export function ratio(kills, deaths) {
  return (deaths > 0 ? kills / deaths : kills).toFixed(2)
}

export default function Summary({ summary, onRestart, onBackToStart }) {
  const defused = summary.objectiveOutcome === 'defused'
  const exploded = summary.objectiveOutcome === 'exploded'
  const deathmatch = summary.mode === 'deathmatch'

  return (
    <div className="panel panel--summary">
      <p className={`panel__eyebrow${exploded ? ' panel__eyebrow--fail' : ''}`}>{eyebrow(summary)}</p>

      {defused ? (
        <div className="summary__result">
          <Stars count={summary.stars} className="stars--large" />
          <span className="summary__result-label">
            {summary.stars} de 5 · nota {(summary.scoreValue * 100).toFixed(0)}
          </span>
        </div>
      ) : null}

      {exploded ? (
        <div className="summary__result">
          <span className="summary__failed">Fallido</span>
          <span className="summary__result-label">
            sin puntuación: no llegaste a desactivarlo
          </span>
        </div>
      ) : null}

      <div className="summary__grid">
        <div className="summary__cell summary__cell--primary">
          <span className="summary__value">{summary.accuracy.toFixed(1)}%</span>
          <span className="summary__label">precisión</span>
        </div>
        <div className="summary__cell">
          <span className="summary__value">{summary.kills}</span>
          <span className="summary__label">{deathmatch ? 'bajas' : 'dianas'}</span>
        </div>
        {/* En Deathmatch la tercera casilla es el KD, que es la cifra de ese
            modo; fuera de él sigue siendo el ritmo o el tiempo, como siempre. */}
        <div className="summary__cell">
          <span className="summary__value">
            {deathmatch
              ? ratio(summary.kills, summary.deaths)
              : summary.objectiveOutcome
                ? `${summary.durationS.toFixed(1)}s`
                : summary.targetsPerSecond.toFixed(2)}
          </span>
          <span className="summary__label">
            {deathmatch ? 'KD' : summary.objectiveOutcome ? 'tiempo' : 'dianas/s'}
          </span>
        </div>
      </div>

      <p className="summary__detail">
        {deathmatch && `${summary.deaths} muertes · `}
        {summary.shots} disparos · {summary.misses} fallos
        {/* Con el hitbox hacen falta varios impactos por diana, así que el dato
            deja de ser redundante y merece salir. */}
        {summary.hits !== summary.kills && ` · ${summary.hits} impactos`}
      </p>

      <div className="panel__actions">
        <button type="button" className="button button--primary" onClick={onRestart} autoFocus>
          Reiniciar sesión
        </button>
        <button type="button" className="button button--quiet" onClick={onBackToStart}>
          Volver al inicio
        </button>
      </div>
      <p className="panel__hint">Reiniciar conserva el modo. Escape para pausar.</p>
    </div>
  )
}
