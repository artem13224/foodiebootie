'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWeightTrend } from '@/hooks/useWeightTrend'
import WeightChart from '@/components/ui/WeightChart'
import TDEEChart, { type TDEEHistoryPoint } from '@/components/ui/TDEEChart'
import { useUnitSystem } from '@/contexts/UnitSystemContext'

type TDEEConf = 'low' | 'medium' | 'high'

interface TDEEEstimate {
  id: string
  calculated_at: string
  tdee_kcal: number
  daily_kcal_target: number | null
  data_points: number
  confidence: TDEEConf | null
  adaptation_flag: boolean
  method: string | null
}

export default function TrendsPage() {
  const { displayWeight, toDisplayWeight, weightUnit } = useUnitSystem()
  const { logs, rollingPoints, loading: weightLoading, refetch: refetchWeight } = useWeightTrend()
  const [tdeeEstimate, setTdeeEstimate] = useState<TDEEEstimate | null>(null)
  const [tdeeHistory, setTdeeHistory] = useState<TDEEHistoryPoint[]>([])
  const [tdeeLoading, setTdeeLoading] = useState(true)
  const [recalculating, setRecalculating] = useState(false)

  const loadTDEE = useCallback(async () => {
    setTdeeLoading(true)
    const supabase = createClient()

    type LatestRow = { id: string; calculated_at: string; tdee_kcal: number; daily_kcal_target: number | null; data_points: number; confidence: TDEEConf | null; adaptation_flag: boolean; method: string | null }
    type HistoryRow = { calculated_at: string; tdee_kcal: number }

    const [{ data: latest }, { data: history }] = await Promise.all([
      supabase
        .from('tdee_estimates')
        .select('id, calculated_at, tdee_kcal, daily_kcal_target, data_points, confidence, adaptation_flag, method')
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as Promise<{ data: LatestRow | null; error: unknown }>,
      supabase
        .from('tdee_estimates')
        .select('calculated_at, tdee_kcal')
        .order('calculated_at', { ascending: true }) as unknown as Promise<{ data: HistoryRow[] | null; error: unknown }>,
    ])

    if (latest) {
      setTdeeEstimate({
        id: latest.id,
        calculated_at: latest.calculated_at as string,
        tdee_kcal: Number(latest.tdee_kcal),
        daily_kcal_target: latest.daily_kcal_target ? Number(latest.daily_kcal_target) : null,
        data_points: latest.data_points,
        confidence: latest.confidence as TDEEConf | null,
        adaptation_flag: latest.adaptation_flag,
        method: latest.method as string | null,
      })
    }

    setTdeeHistory(
      (history ?? []).map(r => ({
        date: r.calculated_at as string,
        tdee_kcal: Number(r.tdee_kcal),
      }))
    )
    setTdeeLoading(false)
  }, [])

  useEffect(() => {
    loadTDEE()
  }, [loadTDEE])

  async function handleRecalculate() {
    setRecalculating(true)
    try {
      await fetch('/api/tdee/calculate', { method: 'POST' })
      await Promise.all([loadTDEE(), refetchWeight()])
    } finally {
      setRecalculating(false)
    }
  }

  // Current weight and 7-day delta
  const latestWeight = logs.length > 0 ? logs[logs.length - 1].weight_kg : null
  const sevenDaysAgoWeight = (() => {
    if (logs.length < 2) return null
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString().split('T')[0]
    const older = [...logs].reverse().find(l => l.logged_at <= cutoffStr)
    return older?.weight_kg ?? null
  })()
  const delta = latestWeight != null && sevenDaysAgoWeight != null
    ? Math.round((latestWeight - sevenDaysAgoWeight) * 100) / 100
    : null

  // 7-day rate from rolling average
  const ratePerWeek = (() => {
    if (rollingPoints.length < 8) return null
    const recent = rollingPoints[rollingPoints.length - 1].rolling_avg
    const older = rollingPoints[rollingPoints.length - 8].rolling_avg
    return Math.round((recent - older) * 100) / 100
  })()

  return (
    <div className="screen" style={{ paddingTop: 0 }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-4)' }}>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: 'var(--text-label)',
          letterSpacing: 'var(--tracking-loose)',
          textTransform: 'uppercase',
          color: 'var(--color-text-dim)',
        }}>
          TRENDS
        </span>
      </div>

      {/* ── Current Weight hero ─────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-2)' }}>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: 'var(--text-label)',
          letterSpacing: 'var(--tracking-loose)',
          textTransform: 'uppercase',
          color: 'var(--color-text-dim)',
          display: 'block',
          marginBottom: '4px',
        }}>
          CURRENT WEIGHT
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'var(--text-display)',
            letterSpacing: 'var(--tracking-tight)',
            color: 'var(--color-text)',
            lineHeight: 1,
          }}>
            {weightLoading ? '—' : latestWeight != null ? toDisplayWeight(latestWeight) : '—'}
          </span>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '16px',
            color: 'var(--color-text-dim)',
          }}>
            {weightUnit.toUpperCase()}
          </span>
          {delta != null && (
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '20px',
              color: delta < 0 ? 'var(--color-success)' : delta > 0 ? 'var(--color-danger)' : 'var(--color-text-dim)',
            }}>
              {delta > 0 ? '+' : ''}{toDisplayWeight(Math.abs(delta))} / 7D
            </span>
          )}
        </div>
      </div>

      {/* ── Weight chart ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <WeightChart rollingPoints={rollingPoints} unit={weightUnit} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '6px' }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', backgroundColor: 'var(--color-text-dim)', borderRadius: '50%', display: 'inline-block', opacity: 0.4 }} />
            RAW
          </span>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '16px', height: '2px', backgroundColor: 'var(--color-accent)', display: 'inline-block' }} />
            7-DAY AVG
          </span>
        </div>
      </div>

      <div style={{ height: '1px', backgroundColor: 'var(--color-border-soft)', marginBottom: 'var(--space-6)' }} />

      {/* ── Adaptive TDEE section ────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 'var(--text-label)',
            letterSpacing: 'var(--tracking-loose)',
            textTransform: 'uppercase',
            color: 'var(--color-text-dim)',
          }}>
            ADAPTIVE TDEE
          </span>
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            style={{
              background: 'none',
              border: '1px solid var(--color-border)',
              color: recalculating ? 'var(--color-text-muted)' : 'var(--color-text-dim)',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: '9px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              padding: '4px 10px',
              cursor: recalculating ? 'default' : 'pointer',
            }}
          >
            {recalculating ? 'CALCULATING...' : 'RECALCULATE'}
          </button>
        </div>

        {/* TDEE hero */}
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'var(--text-display)',
            letterSpacing: 'var(--tracking-tight)',
            color: 'var(--color-text)',
            lineHeight: 1,
          }}>
            {tdeeLoading ? '—' : tdeeEstimate?.tdee_kcal ?? '—'}
          </span>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '16px',
            color: 'var(--color-text-dim)',
            marginLeft: '8px',
          }}>
            KCAL
          </span>
        </div>

        {/* 2×2 stat grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--color-border)' }}>
          {[
            { label: 'DATA POINTS', value: tdeeEstimate ? String(tdeeEstimate.data_points) : '0' },
            { label: 'CONFIDENCE', value: tdeeEstimate?.confidence?.toUpperCase() ?? '—' },
            {
              label: 'ADAPTATION',
              value: tdeeEstimate?.adaptation_flag ? 'DETECTED' : 'NONE',
              color: tdeeEstimate?.adaptation_flag ? 'var(--color-warning)' : undefined,
            },
            {
              label: 'RATE / WEEK',
              value: ratePerWeek != null
                ? `${ratePerWeek > 0 ? '+' : ratePerWeek < 0 ? '-' : ''}${toDisplayWeight(Math.abs(ratePerWeek))} ${weightUnit.toUpperCase()}`
                : '—'
            },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'var(--color-bg)', padding: '14px 12px' }}>
              <div style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: '9px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--color-text-dim)',
                marginBottom: '4px',
              }}>
                {stat.label}
              </div>
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '20px',
                letterSpacing: '-0.02em',
                color: stat.color ?? 'var(--color-text)',
                lineHeight: 1,
              }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TDEE history chart ──────────────────────────────────────── */}
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
          TDEE ESTIMATE HISTORY
        </span>
        <TDEEChart data={tdeeHistory} />
        <p style={{
          fontFamily: "'Barlow', sans-serif",
          fontSize: '11px',
          color: 'var(--color-text-muted)',
          marginTop: '8px',
          lineHeight: 1.5,
        }}>
          Each point is a recalculation. The estimate converges as more weight logs accumulate.
        </p>
      </div>

    </div>
  )
}
