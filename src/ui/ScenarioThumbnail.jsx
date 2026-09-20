import { COVER, SCENARIOS, coverEdgeColor, coverHeight, scenarioRoom } from '../config.js'
import { puntosDePrisma } from '../maps/prisma.js'

/**
 * Plano cenital de un escenario, dibujado **desde los datos de `SCENARIOS`**.
 *
 * No hay capturas guardadas a propósito: una imagen se desincroniza de la
 * geometría en cuanto alguien mueve una caja y nadie se entera hasta que lo ve
 * en partida. Esto lee las mismas piezas que monta `scenario.js` y resuelve las
 * alturas con el mismo `coverHeight`, así que no puede mentir.
 *
 * Coordenadas: el mundo va de -sala/2 a +sala/2 y el SVG de 0 a sala, de modo
 * que basta sumar la mitad. -Z queda arriba, que es hacia donde mira el jugador.
 * La sala la trae el escenario, así que el plano del que mide 40 se dibuja a 40
 * y no reescalado dentro de uno de 80: la miniatura enseña la planta real.
 */

/** Piezas ordenadas de más baja a más alta: las altas se dibujan encima. */
function sortedBoxes(definition) {
  // `?? []` porque un mapa de fichero puede no traer geometría (vuelta 76), y
  // aquí eso sería una miniatura que tumba la pantalla de inicio entera.
  return [...(definition.boxes ?? [])].sort((a, b) => coverHeight(a.kind) - coverHeight(b.kind))
}

export default function ScenarioThumbnail({ scenarioKey, className = '' }) {
  const definition = SCENARIOS[scenarioKey]
  if (!definition) return null

  const room = scenarioRoom(scenarioKey)
  const { width, depth } = room
  const halfW = width / 2
  const halfD = depth / 2
  const gridStep = room.accentEvery * 2

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

      {/* **Y los prismas, con su forma de verdad** (vuelta 83). Un `<rect>` los
          dibujaría sin girar, que es exactamente la mentira que esta vuelta
          vino a quitar del motor: la miniatura no puede decir una cosa y el
          mapa otra. Los puntos salen de la misma función que monta la
          colisión. */}
      {(definition.prismas ?? []).map((prisma, i) => (
        <polygon
          key={`prisma-${i}`}
          points={puntosDePrisma(prisma)
            .map((p) => `${p.x + halfW},${p.z + halfD}`)
            .join(' ')}
          fill={COVER.colors[prisma.kind] ?? COVER.colors.media}
          stroke={coverEdgeColor(prisma.kind)}
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
