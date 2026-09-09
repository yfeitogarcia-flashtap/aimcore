import { SESSION_DURATION_S } from '../config.js'

/**
 * Resumen de fin de sesión: precisión, dianas acertadas y dianas/segundo.
 */
export default function Summary({ summary, onRestart }) {
  return (
    <div className="panel panel--summary">
      <p className="panel__eyebrow">sesión completada · {SESSION_DURATION_S}s</p>

      <div className="summary__grid">
        <div className="summary__cell summary__cell--primary">
          <span className="summary__value">{summary.accuracy.toFixed(1)}%</span>
          <span className="summary__label">precisión</span>
        </div>
        <div className="summary__cell">
          <span className="summary__value">{summary.hits}</span>
          <span className="summary__label">dianas</span>
        </div>
        <div className="summary__cell">
          <span className="summary__value">{summary.targetsPerSecond.toFixed(2)}</span>
          <span className="summary__label">dianas/s</span>
        </div>
      </div>

      <p className="summary__detail">
        {summary.shots} disparos · {summary.misses} fallos
      </p>

      <button type="button" className="button" onClick={onRestart} autoFocus>
        Reiniciar sesión
      </button>
      <p className="panel__hint">El ratón se captura al reiniciar. Escape para pausar.</p>
    </div>
  )
}
