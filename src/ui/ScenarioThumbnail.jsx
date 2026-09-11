import { COVER, ROOM, SCENARIOS, coverEdgeColor, coverHeight } from '../config.js'

/**
 * Plano cenital de un escenario, dibujado **desde los datos de `SCENARIOS`**.
 *
 * No hay capturas guardadas a propósito: una imagen se desincroniza de la
 * geometría en cuanto alguien mueve una caja y nadie se entera hasta que lo ve
 * en partida. Esto lee las mismas piezas que monta `scenario.js` y resuelve las
 * alturas con el mismo `coverHeight`, así que no puede mentir.
 *
 * Coordenadas: el mundo va de -ROOM/2 a +ROOM/2 y el SVG de 0 a ROOM, de modo
 * que basta sumar la mitad. -Z queda arriba, que es hacia donde mira el jugador.
 */

/** Piezas ordenadas de más baja a más alta: las altas se dibujan encima. */
function sortedBoxes(definition) {
  return [...definition.boxes].sort((a, b) => coverHeight(a.kind) - coverHeight(b.kind))
}

export default function ScenarioThumbnail({ scenarioKey, className = '' }) {
  const definition = SCENARIOS[scenarioKey]
  if (!definition) return null

  const { width, depth } = ROOM
  const halfW = width / 2
  const halfD = depth / 2
  const gridStep = ROOM.accentEvery * 2

  return (
    <svg
      className={`scenario-thumb ${className}`.trim()}
      viewBox={`0 0 ${width} ${depth}`}
      role="img"
      aria-label={`Plano de ${definition.label}`}
    >
      <defs>
        <pattern id={`thumb-grid-${scenarioKey}`} width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
          <path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none" stroke="#1a1a1a" strokeWidth="0.35" />
        </pattern>
      </defs>

      <rect x="0" y="0" width={width} height={depth} fill="#0c0c0c" />
      <rect x="0" y="0" width={width} height={depth} fill={`url(#thumb-grid-${scenarioKey})`} />

      {/* Rampas primero: siempre quedan por debajo de lo que conectan. */}
      {definition.ramps.map((ramp, i) => (
        <rect
          key={`ramp-${i}`}
          x={ramp.x + halfW}
          y={Math.min(ramp.z, ramp.z + ramp.d) + halfD}
          width={ramp.w}
          height={Math.abs(ramp.d)}
          fill={COVER.colors.rampa}
          stroke={coverEdgeColor('rampa')}
          strokeWidth="0.4"
          opacity="0.75"
        />
      ))}

      {sortedBoxes(definition).map((box, i) => (
        <rect
          key={`box-${i}`}
          x={box.x + halfW}
          y={box.z + halfD}
          width={box.w}
          height={box.d}
          fill={COVER.colors[box.kind] ?? COVER.colors.media}
          /* Mismo borde que llevan los bloques en partida. Sin él, las piezas
             bajas —bordillo sobre fondo negro— desaparecen a este tamaño. */
          stroke={coverEdgeColor(box.kind)}
          strokeWidth="0.4"
          strokeOpacity={COVER.edgeOpacity}
        />
      ))}

      {/* Punto de aparición: orienta el plano sin necesidad de leyenda. */}
      <circle
        cx={definition.spawn.x + halfW}
        cy={definition.spawn.z + halfD}
        r="2.4"
        fill="none"
        stroke="var(--action-color)"
        strokeWidth="1"
        opacity="0.7"
      />
      <circle
        cx={definition.spawn.x + halfW}
        cy={definition.spawn.z + halfD}
        r="1"
        fill="var(--action-color)"
      />

      <rect
        x="0.6"
        y="0.6"
        width={width - 1.2}
        height={depth - 1.2}
        fill="none"
        stroke="#3a3a3a"
        strokeWidth="1.2"
      />
    </svg>
  )
}
