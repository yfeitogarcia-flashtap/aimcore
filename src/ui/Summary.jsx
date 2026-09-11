import { SESSION_DURATION_S } from '../config.js'

/**
 * Resumen de fin de sesión: precisión, dianas acertadas y dianas/segundo.
 */
export default function Summary({ summary, onRestart, onBackToStart }) {
  return (
    <div className="panel panel--summary">
      <p className="panel__eyebrow">
        sesión completada · {summary.endless ? `práctica libre ${summary.durationS.toFixed(0)}s` : `${SESSION_DURATION_S}s`}
      </p>

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
          <span className="summary__value">{summary.targetsPerSecond.toFixed(2)}</span>
          <span className="summary__label">dianas/s</span>
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
