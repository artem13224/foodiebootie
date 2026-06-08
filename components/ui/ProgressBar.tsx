'use client'

interface ProgressBarProps {
  /** Current value (0 to max). */
  value: number
  /** Maximum value. */
  max: number
  /** Fill color — defaults to var(--color-accent). */
  color?: string
}

/**
 * Flat horizontal progress bar. No border-radius, no animation, no shadows.
 * Background track: var(--color-border). Fill: accent (or custom color).
 */
export default function ProgressBar({ value, max, color = 'var(--color-accent)' }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) * 100 : 0

  return (
    <div
      style={{
        width: '100%',
        height: '4px',
        backgroundColor: 'var(--color-border)',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          backgroundColor: color,
        }}
      />
    </div>
  )
}
