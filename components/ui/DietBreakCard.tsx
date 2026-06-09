'use client'

import { useState, useEffect } from 'react'
import type { DietBreakRecommendation } from '@/lib/science/dietBreak'

/**
 * Dismissible diet-break recommendation card.
 *
 * Dismissal is persisted to localStorage keyed by the estimate id, so dismissing
 * one recommendation doesn't suppress a fresh one from a later recalculation.
 */

const DISMISS_PREFIX = 'dietBreakDismissed:'

interface DietBreakCardProps {
  rec: DietBreakRecommendation
  /** Unique key for this recommendation (e.g. latest tdee_estimate id). */
  dedupeKey: string
}

export default function DietBreakCard({ rec, dedupeKey }: DietBreakCardProps) {
  const [dismissed, setDismissed] = useState(true) // start hidden until we read storage

  useEffect(() => {
    const stored = localStorage.getItem(DISMISS_PREFIX + dedupeKey)
    setDismissed(stored === '1')
  }, [dedupeKey])

  if (dismissed) return null

  function handleDismiss() {
    localStorage.setItem(DISMISS_PREFIX + dedupeKey, '1')
    setDismissed(true)
  }

  return (
    <div style={{
      border: '1px solid var(--color-warning)',
      borderLeft: '3px solid var(--color-warning)',
      padding: '14px 16px',
      marginBottom: 'var(--space-5)',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: '11px',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--color-warning)',
          marginBottom: '8px',
        }}>
          {rec.headline}
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', padding: '2px', flexShrink: 0, lineHeight: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      <p style={{
        fontFamily: "'Barlow', sans-serif",
        fontSize: '13px',
        color: 'var(--color-text)',
        lineHeight: 1.6,
        margin: 0,
      }}>
        {rec.body}
      </p>
    </div>
  )
}
