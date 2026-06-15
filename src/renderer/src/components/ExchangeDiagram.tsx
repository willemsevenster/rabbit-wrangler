import type { BindingInfo } from '@shared/types'

/** Max destinations to draw before truncating (keeps the SVG sane). */
const MAX = 12

/** A simple exchange → destinations binding diagram. */
export function ExchangeDiagram({
  exchangeName,
  bindings
}: {
  exchangeName: string
  bindings: BindingInfo[]
}) {
  if (bindings.length === 0) {
    return <div className="placeholder" style={{ padding: 0 }}>No bindings to diagram.</div>
  }

  const shown = bindings.slice(0, MAX)
  const rowH = 52
  const top = 12
  const height = Math.max(shown.length * rowH + top, 120)
  const exY = height / 2
  const destX = 360
  const exLabel = exchangeName === '' ? '(default)' : exchangeName

  return (
    <svg viewBox={`0 0 600 ${height}`} width="100%" style={{ maxWidth: 620 }} role="img">
      {shown.map((_b, i) => {
        const dy = top + i * rowH + 18
        return (
          <path
            key={`e${i}`}
            d={`M170 ${exY} C 270 ${exY}, 270 ${dy}, ${destX} ${dy}`}
            fill="none"
            stroke="var(--panel-border)"
            strokeWidth="1.5"
          />
        )
      })}
      {shown.map((b, i) => {
        const dy = top + i * rowH + 18
        return (
          <text
            key={`l${i}`}
            x={262}
            y={(exY + dy) / 2 - 4}
            textAnchor="middle"
            className="diagram__edge-label"
          >
            {b.routingKey || '(*)'}
          </text>
        )
      })}

      <rect x="10" y={exY - 20} width="160" height="40" rx="6" className="diagram__exchange" />
      <text x="90" y={exY - 2} textAnchor="middle" className="diagram__node-title">
        {exLabel}
      </text>
      <text x="90" y={exY + 13} textAnchor="middle" className="diagram__node-sub">
        exchange
      </text>

      {shown.map((b, i) => {
        const dy = top + i * rowH
        return (
          <g key={`d${i}`}>
            <rect
              x={destX}
              y={dy}
              width="230"
              height="36"
              rx="6"
              className={b.destinationType === 'exchange' ? 'diagram__exchange' : 'diagram__queue'}
            />
            <text x={destX + 12} y={dy + 16} className="diagram__node-title">
              {b.destination}
            </text>
            <text x={destX + 12} y={dy + 29} className="diagram__node-sub">
              {b.destinationType}
            </text>
          </g>
        )
      })}

      {bindings.length > MAX && (
        <text x="300" y={height - 2} textAnchor="middle" className="diagram__edge-label">
          + {bindings.length - MAX} more binding(s)
        </text>
      )}
    </svg>
  )
}
