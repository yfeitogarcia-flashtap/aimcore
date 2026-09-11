import { SESSION_DURATION_S } from '../config.js'
import Stars from './Stars.jsx'

/**
 * Resumen de fin de sesión: precisión, dianas acertadas y dianas/segundo.
 *
 * Con explosivo aparecen además el desenlace y las estrellas. Que detone **no
 * es una estrella baja**: es un resultado de fallo aparte, y se enseña como tal.
 */

function eyebrow(summary) {
  if (summary.objectiveOutcome === 'defused') return 'explosivo desactivado'
  if (summary.objectiveOutcome === 'exploded') return 'el explosivo detonó'
  if (summary.endless) return `sesión completada · práctica libre ${summary.durationS.toFixed(0)}s`
  return `sesión completada · ${SESSION_DURATION_S}s`
}

export default function Summary({ summary, onRestart, onBackToStart }) {
  const defused = summary.objectiveOutcome === 'defused'
  const exploded = summary.objectiveOutcome === 'exploded'

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
          <span className="summary__label">dianas</span>
        </div>
        <div className="summary__cell">
          <span className="summary__value">
            {summary.objectiveOutcome ? `${summary.durationS.toFixed(1)}s` : summary.targetsPerSecond.toFixed(2)}
          </span>
          <span className="summary__label">
            {summary.objectiveOutcome ? 'tiempo' : 'dianas/s'}
          </span>
        </div>
      </div>

      <p className="summary__detail">
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
