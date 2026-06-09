'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import WeightEntry from '@/components/forms/WeightEntry'
import { useUnitSystem } from '@/contexts/UnitSystemContext'
import { getRollingAverage } from '@/lib/science/tdee'
import type { WeightLogEntry } from '@/lib/science/tdee'
import { localDateStr } from '@/lib/science/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Monday-indexed day of week (0=Mon … 6=Sun) for a local Date. */
function monDow(d: Date): number {
  return (d.getDay() + 6) % 7
}

/** YYYY-MM-DD for a given year/month/day (1-indexed month, 1-indexed day). */
function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Number of days in a month. */
function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeightLog {
  id: string
  logged_at: string
  weight_kg: number
  note: string | null
  created_at: string
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({
  active, payload, label, toDisplay, unit,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  toDisplay: (kg: number) => number
  unit: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      padding: '8px 12px',
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: '11px',
      letterSpacing: '0.1em',
    }}>
      <div style={{ color: 'var(--color-text-dim)', marginBottom: '4px' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name === 'avg' ? 'EWMA' : 'SCALE'}: {toDisplay(p.value)} {unit.toUpperCase()}
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WeightCalendarPage() {
  const router = useRouter()
  const { weightUnit, toDisplayWeight } = useUnitSystem()
  const today = localDateStr()
  const todayDate = new Date()

  const [logs, setLogs] = useState<WeightLog[]>([])
  const [loading, setLoading] = useState(true)

  // Calendar navigation
  const [calYear, setCalYear] = useState(todayDate.getFullYear())
  const [calMonth, setCalMonth] = useState(todayDate.getMonth() + 1) // 1-indexed

  // Modal
  const [modalDate, setModalDate] = useState<string | null>(null)

  // ── Fetch all logs ──────────────────────────────────────────────────────────

  const fetchLogs = useCallback(async () => {
    const supabase = createClient()
    type Row = { id: string; logged_at: string; weight_kg: number; note: string | null; created_at: string }
    const { data } = await (supabase
      .from('weight_logs')
      .select('id, logged_at, weight_kg, note, created_at')
      .order('logged_at', { ascending: true }) as unknown as Promise<{ data: Row[] | null }>)
    setLogs(
      (data ?? []).map(r => ({
        id: r.id,
        logged_at: r.logged_at,
        weight_kg: Number(r.weight_kg),
        note: r.note,
        created_at: r.created_at,
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // ── Derived data ────────────────────────────────────────────────────────────

  const logsByDate = new Map(logs.map(l => [l.logged_at, l]))

  const rollingPoints = getRollingAverage(
    logs.map(l => ({ logged_at: l.logged_at, weight_kg: l.weight_kg })) as WeightLogEntry[]
  )
  const rollingByDate = new Map(rollingPoints.map(p => [p.date, p.rolling_avg]))

  // Chart: last 60 days of logs + rolling avg
  const chartData = logs
    .slice(-60)
    .map(l => ({
      date: l.logged_at.slice(5), // MM-DD
      scale: l.weight_kg,
      avg: rollingByDate.get(l.logged_at) ?? l.weight_kg,
    }))

  // Selected date info
  const selectedLog = modalDate ? logsByDate.get(modalDate) ?? null : null
  const selectedRolling = modalDate ? (rollingByDate.get(modalDate) ?? null) : null

  // ── Calendar grid ───────────────────────────────────────────────────────────

  const totalDays = daysInMonth(calYear, calMonth)
  const firstDow = monDow(new Date(calYear, calMonth - 1, 1)) // 0=Mon
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() {
    if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12) }
    else setCalMonth(m => m - 1)
  }
  function nextMonth() {
    const isCurrentMonth = calYear === todayDate.getFullYear() && calMonth === todayDate.getMonth() + 1
    if (isCurrentMonth) return
    if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1) }
    else setCalMonth(m => m + 1)
  }

  const isCurrentMonth = calYear === todayDate.getFullYear() && calMonth === todayDate.getMonth() + 1

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="screen"
      style={{
        paddingTop: 0,
        paddingBottom: 'max(84px, calc(66px + env(safe-area-inset-bottom)))',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-4)',
        borderBottom: '1px solid var(--color-border)',
        marginBottom: 'var(--space-5)',
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', padding: '4px', display: 'flex', alignItems: 'center' }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 2L4 8L10 14" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: 'var(--text-label)',
          letterSpacing: 'var(--tracking-loose)',
          textTransform: 'uppercase',
          color: 'var(--color-text)',
        }}>
          WEIGHT
        </span>
      </div>

      {/* Month nav */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-4)',
      }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', padding: '6px' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <span style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '22px',
          letterSpacing: '0.04em',
          color: 'var(--color-text)',
        }}>
          {MONTH_NAMES[calMonth - 1]} {calYear}
        </span>
        <button
          onClick={nextMonth}
          style={{ background: 'none', border: 'none', cursor: isCurrentMonth ? 'default' : 'pointer', color: isCurrentMonth ? 'var(--color-border)' : 'var(--color-text-dim)', padding: '6px' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '4px' }}>
        {DAYS.map((d, i) => (
          <div key={i} style={{
            textAlign: 'center',
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '10px',
            letterSpacing: '0.15em',
            color: 'var(--color-text-dim)',
            paddingBottom: '6px',
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: 'var(--space-6)' }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />

          const dateStr = ymd(calYear, calMonth, day)
          const hasLog = logsByDate.has(dateStr)
          const isToday = dateStr === today
          const isFuture = dateStr > today

          return (
            <button
              key={i}
              onClick={() => !isFuture && setModalDate(dateStr)}
              disabled={isFuture}
              style={{
                background: isToday ? 'var(--color-surface)' : 'none',
                border: isToday ? '1px solid var(--color-accent)' : '1px solid transparent',
                cursor: isFuture ? 'default' : 'pointer',
                padding: '6px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '3px',
                opacity: isFuture ? 0.25 : 1,
              }}
            >
              <span style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: '13px',
                letterSpacing: '0.02em',
                color: isToday ? 'var(--color-accent)' : 'var(--color-text)',
                lineHeight: 1,
              }}>
                {day}
              </span>
              {/* Log indicator dot */}
              <div style={{
                width: '4px',
                height: '4px',
                background: hasLog ? 'var(--color-accent)' : 'transparent',
              }} />
            </button>
          )
        })}
      </div>

      {/* ── Trend chart ──────────────────────────────────────────────────────── */}
      {chartData.length >= 2 && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 'var(--text-label)',
            letterSpacing: 'var(--tracking-loose)',
            textTransform: 'uppercase',
            color: 'var(--color-text-dim)',
            display: 'block',
            marginBottom: 'var(--space-3)',
          }}>
            TREND
          </span>
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fill: 'var(--color-text-dim)', letterSpacing: '0.05em' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, fill: 'var(--color-text-dim)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => String(toDisplayWeight(v))}
                />
                <Tooltip
                  content={
                    <ChartTooltip toDisplay={toDisplayWeight} unit={weightUnit} />
                  }
                />
                {/* Scale weight — faint dots, no line */}
                <Line
                  type="monotone"
                  dataKey="scale"
                  name="scale"
                  stroke="var(--color-text-dim)"
                  strokeOpacity={0}
                  dot={{ r: 3, fill: 'var(--color-text-dim)', opacity: 0.4, strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={true}
                  animationDuration={600}
                />
                {/* Rolling average line */}
                <Line
                  type="monotone"
                  dataKey="avg"
                  name="avg"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--color-accent)' }}
                  isAnimationActive={true}
                  animationDuration={600}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
            {[
              { color: 'var(--color-text-dim)', label: 'SCALE WEIGHT' },
              { color: 'var(--color-accent)', label: 'EWMA TREND' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '2px', background: color }} />
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '9px', letterSpacing: '0.15em', color: 'var(--color-text-dim)' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && logs.length === 0 && (
        <div style={{
          padding: 'var(--space-6) 0',
          textAlign: 'center',
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: '12px',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--color-text-dim)',
        }}>
          No weigh-ins yet — tap any date to log one.
        </div>
      )}

      {/* WeightEntry modal */}
      {modalDate && (
        <WeightEntry
          initialDate={modalDate}
          onClose={() => setModalDate(null)}
          onSaved={(_shouldRecalculate) => {
            setModalDate(null)
            fetchLogs()
          }}
        />
      )}
    </div>
  )
}
