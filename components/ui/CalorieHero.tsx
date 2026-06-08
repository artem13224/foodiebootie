'use client'

import { useEffect, useState } from 'react'
import { useCountUp } from '@/hooks/useCountUp'
import AdaptiveBadge from './AdaptiveBadge'

interface CalorieHeroProps {
  remaining: number
  goal: number
  eaten: number
  burned: number
  adaptiveDataPoints: number
  adaptationDetected?: boolean
}

export default function CalorieHero({
  remaining,
  goal,
  eaten,
  burned,
  adaptiveDataPoints,
  adaptationDetected,
}: CalorieHeroProps) {
  const [animate, setAnimate] = useState(false)
  const displayVal = useCountUp(Math.abs(remaining))

  useEffect(() => {
    const t = setTimeout(() => setAnimate(true), 100)
    return () => clearTimeout(t)
  }, [])

  const isOver = remaining < 0

  return (
    <div style={{ paddingTop: 'var(--space-6)' }}>
      <div style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        fontSize: 'var(--text-label)',
        letterSpacing: 'var(--tracking-loose)',
        textTransform: 'uppercase',
        color: 'var(--color-text-dim)',
        marginBottom: 'var(--space-2)',
      }}>
        {isOver ? 'KCAL OVER' : 'KCAL REMAINING'}
      </div>

      <div
        className={`hero-number ${animate ? 'animate' : ''}`}
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 'var(--text-hero)',
          letterSpacing: 'var(--tracking-tight)',
          lineHeight: 0.88,
          color: isOver ? 'var(--color-danger)' : 'var(--color-text)',
        }}
      >
        {isOver && <span style={{ fontSize: '72px' }}>-</span>}
        {displayVal.toLocaleString()}
      </div>

      <div
        className={`accent-line ${animate ? 'animate' : ''}`}
        style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-4)' }}
      />

      <div style={{ display: 'flex' }}>
        {([
          { label: 'GOAL', value: goal, align: 'left' },
          { label: 'EATEN', value: eaten, align: 'center' },
          { label: 'BURNED', value: burned, align: 'right' },
        ] as const).map(({ label, value, align }) => (
          <div key={label} style={{ flex: 1, textAlign: align }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '28px',
              letterSpacing: 'var(--tracking-tight)',
              color: 'var(--color-text)',
              lineHeight: 1,
            }}>
              {value.toLocaleString()}
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: 'var(--text-label)',
              letterSpacing: 'var(--tracking-loose)',
              textTransform: 'uppercase',
              color: 'var(--color-text-dim)',
              marginTop: '2px',
            }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <AdaptiveBadge dataPoints={adaptiveDataPoints} adaptationDetected={adaptationDetected} />
      </div>
    </div>
  )
}
