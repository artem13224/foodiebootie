'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTodayLog } from '@/hooks/useTodayLog'
import { useAdaptiveTDEE } from '@/hooks/useAdaptiveTDEE'
import { useUnitSystem } from '@/contexts/UnitSystemContext'
import CalorieHero from '@/components/ui/CalorieHero'
import MacroRing from '@/components/ui/MacroRing'
import MealRow from '@/components/ui/MealRow'
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
  const { displayWeight, weightUnit } = useUnitSystem()

  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [animate, setAnimate] = useState(false)
  const [username, setUsername] = useState('')
  const [todayWeightKg, setTodayWeightKg] = useState<number | null>(null)
  const [todayWeightTime, setTodayWeightTime] = useState<string | null>(null)
  // Missed-day estimate prompt: holds yesterday's date when it looks incomplete
  const [gapPromptDate, setGapPromptDate] = useState<string | null>(null)
  const [gapSaving, setGapSaving] = useState(false)

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

  // Fetch today's weight log
  useEffect(() => {
    const supabase = createClient()
    type WRow = { weight_kg: number; created_at: string }
    ;(supabase
      .from('weight_logs')
      .select('weight_kg, created_at')
      .eq('logged_at', todayStr)
      .maybeSingle() as unknown as Promise<{ data: WRow | null }>)
      .then(({ data }) => {
        if (data) {
          setTodayWeightKg(Number(data.weight_kg))
          const d = new Date(data.created_at)
          setTodayWeightTime(
            d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          )
        } else {
          setTodayWeightKg(null)
          setTodayWeightTime(null)
        }
      })
  }, [todayStr])

  // ── Missed-day estimate detection (runs once per day on rollover) ──────────
  // If yesterday looks incomplete (logged kcal < 50% target OR < 2 meal types),
  // prompt once for a rough self-estimate. Gated to active, onboarded users.
  useEffect(() => {
    if (tdee.loading || tdee.dataPoints <= 0) return
    const yesterday = shiftDate(todayStr, -1)
    const lsKey = `gapPrompt:${yesterday}`
    if (typeof window !== 'undefined' && localStorage.getItem(lsKey)) return

    let cancelled = false
    ;(async () => {
      const supabase = createClient()

      // Skip if the day is already marked estimated. Tolerant: if the table
      // doesn't exist yet (pre-migration 006), error is set and data is null.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (supabase as any)
        .from('estimated_days')
        .select('date')
        .eq('date', yesterday)
        .maybeSingle() as { data: { date: string } | null; error: unknown }
      if (cancelled || existing) return

      const { data: rows } = await supabase
        .from('food_logs')
        .select('meal_type, kcal')
        .eq('logged_date', yesterday) as { data: { meal_type: string; kcal: number }[] | null; error: unknown }
      if (cancelled) return

      const list = rows ?? []
      const sumKcal = list.reduce((s, r) => s + Number(r.kcal), 0)
      const distinctMeals = new Set(list.map(r => r.meal_type)).size
      const incomplete = sumKcal < tdee.targetKcal * 0.5 || distinctMeals < 2
      if (incomplete) setGapPromptDate(yesterday)
    })()

    return () => { cancelled = true }
  }, [tdee.loading, tdee.dataPoints, tdee.targetKcal, todayStr])

  async function recordGapEstimate(estimate: 'under' | 'on_target' | 'over') {
    if (!gapPromptDate || gapSaving) return
    setGapSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('estimated_days') as any)
        .upsert({ user_id: user.id, date: gapPromptDate, estimate }, { onConflict: 'user_id,date' })
    }
    if (typeof window !== 'undefined') localStorage.setItem(`gapPrompt:${gapPromptDate}`, 'done')
    setGapSaving(false)
    setGapPromptDate(null)
  }

  function dismissGapPrompt() {
    if (gapPromptDate && typeof window !== 'undefined') {
      localStorage.setItem(`gapPrompt:${gapPromptDate}`, 'dismissed')
    }
    setGapPromptDate(null)
  }

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

      {/* ── Missed-day estimate prompt ───────────────────────────────────── */}
      {gapPromptDate && (
        <div style={{
          border: '1px solid var(--color-border)',
          borderLeft: '2px solid var(--color-accent)',
          padding: 'var(--space-4)',
          marginTop: 'var(--space-3)',
          marginBottom: 'var(--space-2)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
            <span style={{
              fontFamily: "'Barlow', sans-serif",
              fontSize: '13px',
              lineHeight: 1.5,
              color: 'var(--color-text)',
            }}>
              {formatDateLabel(gapPromptDate)} looks incomplete — roughly how did you do?
            </span>
            <button
              onClick={dismissGapPrompt}
              aria-label="Dismiss"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', padding: '2px', flexShrink: 0, lineHeight: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
          <div style={{ display: 'flex', gap: '1px', background: 'var(--color-border)' }}>
            {([
              { key: 'under', label: 'UNDER' },
              { key: 'on_target', label: 'ON TARGET' },
              { key: 'over', label: 'OVER' },
            ] as const).map(opt => (
              <button
                key={opt.key}
                onClick={() => recordGapEstimate(opt.key)}
                disabled={gapSaving}
                style={{
                  flex: 1,
                  padding: '9px 4px',
                  background: 'var(--color-surface)',
                  border: 'none',
                  cursor: gapSaving ? 'default' : 'pointer',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{
            fontFamily: "'Barlow', sans-serif",
            fontSize: '10px',
            color: 'var(--color-text-muted)',
            marginTop: '8px',
            lineHeight: 1.4,
          }}>
            This is just for your own tracking — estimated days are kept out of your TDEE math.
          </div>
        </div>
      )}

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

      {/* ── Weight widget ────────────────────────────────────────────────── */}
      <button
        onClick={() => router.push('/weight')}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          borderBottom: '1px solid var(--color-border-soft)',
          cursor: 'pointer',
          padding: 'var(--space-4) 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          {todayWeightKg != null ? (
            <>
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '26px',
                letterSpacing: '-0.01em',
                color: 'var(--color-text)',
                lineHeight: 1,
              }}>
                {weightUnit === 'lbs'
                  ? Math.round(todayWeightKg * 2.20462 * 10) / 10
                  : todayWeightKg.toFixed(1)}
              </span>
              <span style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: '11px',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'var(--color-text-dim)',
              }}>
                {weightUnit.toUpperCase()} · LOGGED {todayWeightTime}
              </span>
            </>
          ) : (
            <span style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: '13px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--color-text-dim)',
            }}>
              Log today&apos;s weight
            </span>
          )}
        </div>
        {/* Scale icon */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ color: 'var(--color-text-dim)', flexShrink: 0 }}>
          <rect x="2" y="3" width="14" height="12" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5 9H13M5 12H10" stroke="currentColor" strokeWidth="1.2" />
          <path d="M7 3V6M11 3V6" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>

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

    </div>
  )
}
