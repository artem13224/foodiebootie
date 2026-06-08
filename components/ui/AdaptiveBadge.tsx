interface AdaptiveBadgeProps {
  dataPoints: number
  adaptationDetected?: boolean
}

export default function AdaptiveBadge({ dataPoints, adaptationDetected = false }: AdaptiveBadgeProps) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      border: '1px solid var(--color-border)',
      backgroundColor: 'var(--color-bg)',
      padding: '5px 10px',
    }}>
      <div style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: adaptationDetected ? 'var(--color-warning)' : 'var(--color-accent)',
        flexShrink: 0,
      }} />
      <span style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        fontSize: '9px',
        letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase',
        color: 'var(--color-text)',
      }}>
        {adaptationDetected
          ? `ADAPTATION DETECTED · ${dataPoints} DATA POINTS`
          : `ADAPTIVE TDEE ACTIVE · ${dataPoints} DATA POINTS`
        }
      </span>
    </div>
  )
}
