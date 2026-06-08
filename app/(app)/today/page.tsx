'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTodayLog } from '@/hooks/useTodayLog'
import { useAdaptiveTDEE } from '@/hooks/useAdaptiveTDEE'
import CalorieHero from '@/components/ui/CalorieHero'
import MacroRing from '@/components/ui/MacroRing'
import MealRow from '@/components/ui/MealRow'
import WeightEntry from '@/components/forms/WeightEntry'
import type { MealType } from '@/types'

const MEALS: { type: MealType; label: string }[] = [
  { type: 'breakfast', label: 'BREAKFAST' },
  { type: 'lunch', label: 'LUNCH' },
  { type: 'dinner', label: 'DINNER' },
  { type: 'snacks', label: 'SNACKS' },
  { type: 'pre_workout', label: 'PRE WORKOUT' },
  { type: 'post_workout', label: 'POST WORKOUT' },
]

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD in local timezone (avoids UTC offset bugs). */
function localDateStr(d: Date = new Date()): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  )
}

/** Shifts a YYYY-MM-DD string by `delta` days and returns the new date string. */
function shiftDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + delta)
  return localDateStr(date)
}

/** Formats YYYY-MM-DD as "MON · 9 JUN" style. */
function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date
    .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase()
    .replace(',', ' ·')
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TodayPage() {
  const router = useRouter()
  const todayStr = localDateStr()

  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [animate, setAnimate] = useState(false)
  const [username, setUsername] = useState('')
  const [showWeightEntry, setShowWeightEntry] = useState(false)

  const isToday = selectedDate === todayStr
  const isPastDate = selectedDate < todayStr

  const { logs, totals, deleteLog } = useTodayLog(selectedDate)
  const tdee = useAdaptiveTDEE()

  // Re-trigger ring + number animations whenever date changes
  useEffect(() => {
    setAnimate(false)
    const t = setTimeout(() => setAnimate(true), 200)
    return () => clearTimeout(t)
  }, [selectedDate])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('username').maybeSingle().then(({ data }) => {
      if (data) setUsername((data as { username: string }).username)
    })
  }, [])

  const goDay = useCallback((delta: number) => {
    setSelectedDate(prev => {
      const next = shiftDate(prev, delta)
      // Never go past today
      return next > todayStr ? todayStr : next
    })
  }, [todayStr])

  const dateLabel = formatDateLabel(selectedDate)
  const eaten = Math.round(totals.kcal)
  const goal = Math.round(tdee.targetKcal)
  const remaining = goal - eaten

  return (
    <div
      className="screen"
      style={{
        paddingTop: 0,
        // Explicit inline style ensures content clears the fixed tab bar
        // regardless of CSS class loading order
        paddingBottom: 'max(84px, calc(66px + env(safe-area-inset-bottom)))',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-2)',
      }}>

        {/* Date navigator: ← [date] → */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>

          {/* Left arrow — go back one day */}
          <button
            onClick={() => goDay(-1)}
            aria-label="Previous day"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 4px',
              color: 'var(--color-text-dim)',
              display: 'flex',
              alignItems: 'center',
              lineHeight: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>

          {/* Date text — tapping opens native date picker */}
          <div style={{ position: 'relative', cursor: 'pointer' }}>
            {/* Visible label */}
            <div style={{ pointerEvents: 'none', lineHeight: 1 }}>
              <span style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: 'var(--text-label)',
                letterSpacing: 'var(--tracking-loose)',
                textTransform: 'uppercase',
                color: isPastDate ? 'var(--color-text-dim)' : 'var(--color-text)',
                display: 'block',
                lineHeight: 1,
              }}>
                {dateLabel}
              </span>
              {isPastDate && (
                <span style={{
                  fontFamily: "'Barlow', sans-serif",
                  fontWeight: 500,
                  fontSize: '8px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--color-accent)',
                  display: 'block',
                  marginTop: '3px',
                  lineHeight: 1,
                }}>
                  EDITING PAST DAY
                </span>
              )}
            </div>

            {/* Invisible native date picker — covers the label above */}
            <input
              type="date"
              max={todayStr}
              value={selectedDate}
              onChange={e => { if (e.target.value) setSelectedDate(e.target.value) }}
              aria-label="Pick a date"
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0,
                cursor: 'pointer',
                width: '100%',
                height: '100%',
                zIndex: 1,
                // Reset all browser default styling
                border: 'none',
                background: 'none',
                padding: 0,
              }}
            />
          </div>

          {/* Right arrow — go forward one day (disabled on today) */}
          <button
            onClick={() => !isToday && goDay(1)}
            aria-label="Next day"
            aria-disabled={isToday}
            style={{
              background: 'none',
              border: 'none',
              cursor: isToday ? 'default' : 'pointer',
              padding: '6px 4px',
              color: isToday ? 'var(--color-border)' : 'var(--color-text-dim)',
              display: 'flex',
              alignItems: 'center',
              lineHeight: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>

        </div>

        {/* Username + avatar — only rendered once profile has loaded */}
        {username ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: '13px',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
              color: 'var(--color-accent)',
            }}>
              {username}
            </span>
            <div style={{
              width: '28px',
              height: '28px',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '14px',
                color: 'var(--color-text)',
              }}>
                {username[0].toUpperCase()}
              </span>
            </div>
          </div>
        ) : (
          /* Placeholder keeps header height stable while profile loads */
          <div style={{ width: '28px', height: '28px' }} />
        )}

      </div>

      {/* ── Calorie hero ─────────────────────────────────────────────────── */}
      <CalorieHero
        remaining={remaining}
        goal={goal}
        eaten={eaten}
        burned={0}
        adaptiveDataPoints={tdee.dataPoints}
        adaptationDetected={tdee.adaptationDetected}
      />

      {/* ── Macro rings ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingTop: 'var(--space-8)',
        paddingBottom: 'var(--space-6)',
        borderBottom: '1px solid var(--color-border-soft)',
      }}>
        <MacroRing
          value={totals.protein_g}
          max={tdee.proteinG}
          color="var(--color-macro-protein)"
          label="PROTEIN"
          animate={animate}
        />
        <MacroRing
          value={totals.carbs_g}
          max={tdee.carbsG}
          color="var(--color-macro-carbs)"
          label="CARBS"
          animate={animate}
        />
        <MacroRing
          value={totals.fat_g}
          max={tdee.fatG}
          color="var(--color-macro-fat)"
          label="FAT"
          animate={animate}
        />
      </div>

      {/* ── Daily log ────────────────────────────────────────────────────── */}
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 'var(--space-5)',
          paddingBottom: 'var(--space-3)',
        }}>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 'var(--text-label)',
            letterSpacing: 'var(--tracking-loose)',
            textTransform: 'uppercase',
            color: 'var(--color-text)',
          }}>
            {isToday ? "TODAY'S LOG" : dateLabel + ' LOG'}
          </span>
          {eaten > 0 && (
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '20px',
              letterSpacing: 'var(--tracking-tight)',
              color: 'var(--color-text)',
            }}>
              {eaten} KCAL
            </span>
          )}
        </div>

        {MEALS.map(({ type, label }) => (
          <MealRow
            key={type}
            mealType={type}
            label={label}
            items={logs.filter(l => l.meal_type === type)}
            onAdd={mealType => {
              const params = new URLSearchParams({ meal: mealType })
              if (!isToday) params.set('date', selectedDate)
              router.push(`/log?${params.toString()}`)
            }}
            onDelete={deleteLog}
          />
        ))}
      </div>

      {/* ── Floating weight log button ────────────────────────────── */}
      <button
        onClick={() => setShowWeightEntry(true)}
        aria-label="Log weight"
        style={{
          position: 'fixed',
          bottom: 'calc(66px + env(safe-area-inset-bottom) + 14px)',
          right: '20px',
          width: '40px',
          height: '40px',
          backgroundColor: 'var(--color-accent)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          zIndex: 50,
        }}
      >
        {/* Scale / weight icon */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 16L5 8H15L17 16H3Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 8C7 6 8 4 10 4C12 4 13 6 13 8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 4V2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {/* Weight entry modal */}
      {showWeightEntry && (
        <WeightEntry
          onClose={() => setShowWeightEntry(false)}
          onSaved={async (shouldRecalculate) => {
            setShowWeightEntry(false)
            if (shouldRecalculate) {
              // Fire-and-forget TDEE recalculation
              fetch('/api/tdee/calculate', { method: 'POST' }).catch(() => {})
            }
          }}
          initialDate={selectedDate}
        />
      )}
    </div>
  )
}
