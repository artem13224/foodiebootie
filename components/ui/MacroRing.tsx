'use client'

import { useEffect, useState } from 'react'

interface MacroRingProps {
  value: number
  max: number
  color: string
  label: string
  animate: boolean
}

const r = 33
const circumference = 2 * Math.PI * r

export default function MacroRing({ value, max, color, label, animate }: MacroRingProps) {
  const [offset, setOffset] = useState(circumference)

  useEffect(() => {
    if (animate) {
      const pct = max > 0 ? Math.min(value / max, 1) : 0
      setOffset(circumference * (1 - pct))
    }
  }, [animate, value, max])

  const over = max > 0 && value > max
  const displayColor = over ? 'var(--color-danger)' : color

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <svg width="82" height="82" viewBox="0 0 82 82">
        <circle cx="41" cy="41" r={r} fill="none" stroke="var(--ring-track)" strokeWidth="5" />
        <circle
          cx="41" cy="41" r={r}
          fill="none"
          stroke={displayColor}
          strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="square"
          transform="rotate(-90 41 41)"
          style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
        <text x="41" y="38" textAnchor="middle" fill="var(--color-text)"
          fontFamily="'Bebas Neue', sans-serif" fontSize="19">
          {Math.round(value)}
        </text>
        <text x="41" y="48" textAnchor="middle" fill="var(--color-text-dim)"
          fontFamily="'Barlow Condensed', sans-serif" fontWeight="700" fontSize="8" letterSpacing="1">
          G
        </text>
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: 'var(--text-label)',
          letterSpacing: 'var(--tracking-loose)',
          textTransform: 'uppercase',
          color: 'var(--color-text)',
          lineHeight: 1,
        }}>
          {label}
        </div>
        <div style={{
          fontFamily: "'Barlow', sans-serif",
          fontSize: '9px',
          color: 'var(--color-text-dim)',
          marginTop: '2px',
        }}>
          /{Math.round(max)}g
        </div>
      </div>
    </div>
  )
}
