'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getRollingAverage } from '@/lib/science/tdee'
import type { WeightLogEntry } from '@/lib/science/tdee'
import { getGoalETA } from '@/lib/science/tdee'
import { clamp, localDateStr } from '@/lib/science/utils'
import { computeWeeklyInsights } from '@/lib/science/weeklyInsights'
import { parseAdaptationDetail, buildDietBreakRecommendation } from '@/lib/science/dietBreak'
import { scoreAdherence, aggregateDailyTotals, adherenceInsight } from '@/lib/science/adherence'
import { checkWhatIfEligibility, projectWhatIf } from '@/lib/science/whatif'
import DietBreakCard from '@/components/ui/DietBreakCard'
import { useUnitSystem } from '@/contexts/UnitSystemContext'
import ProgressBar from '@/components/ui/ProgressBar'
import { CHECKIN_STORAGE_KEY } from '@/lib/weeklyCheckin'
import type { GoalType } from '@/types'

const WHATIF_TARGET_ADHERENCE = 90

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentWeekMonday(): string {
  const today = new Date()
  const dow = (today.getDay() + 6) % 7 // 0=Mon
  const mon = new Date(today)
  mon.setDate(today.getDate() - dow)
  return localDateStr(mon)
}

function currentWeekSunday(): string {
  const mon = currentWeekMonday()
  const [y, m, d] = mon.split('-').map(Number)
  const sun = new Date(y, m - 1, d + 6)
  return localDateStr(sun)
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Profile {
  goal_type: GoalType | null
  goal_weight_kg: number | null
  goal_rate_kg_per_week: number | null
  goal_start_date: string | null
  protein_g_per_kg_lbm: number | null
}

interface TDEEEstimate {
  id: string
  tdee_kcal: number
  method: string | null
  confidence: 'low' | 'medium' | 'high' | null
  data_points: number
  daily_kcal_target: number | null
  protein_g: number | null
  fat_g: number | null
  carbs_g: number | null
  adaptation_flag: boolean
  suppression_pct: number
  deficit_weeks: number
  severity: 'mild' | 'moderate' | null
}

interface WeightLog {
  logged_at: string
  weight_kg: number
}

interface WeekFoodRow {
  logged_date: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

// ── Styled section card ───────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid var(--color-border)',
      marginBottom: 'var(--space-4)',
    }}>
      <div style={{
        borderBottom: '1px solid var(--color-border)',
        padding: '10px 16px',
      }}>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: '10px',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: 'var(--color-text-dim)',
        }}>
          {title}
        </span>
      </div>
      <div style={{ padding: '16px' }}>{children}</div>
    </div>
  )
}

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
      <span style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        fontSize: '11px',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        color: 'var(--color-text-dim)',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: '20px',
        letterSpacing: '-0.01em',
        color: valueColor ?? 'var(--color-text)',
        lineHeight: 1,
      }}>
        {value}
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WeeklyCheckinPage() {
  const router = useRouter()
  const { displayWeight, toDisplayWeight, weightUnit, unitSystem } = useUnitSystem()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [allWeightLogs, setAllWeightLogs] = useState<WeightLog[]>([])
  const [weekWeightLogs, setWeekWeightLogs] = useState<WeightLog[]>([])
  const [tdee, setTDEE] = useState<TDEEEstimate | null>(null)
  const [weekFoodDays, setWeekFoodDays] = useState(0)
  const [weekProteinDays, setWeekProteinDays] = useState<number | null>(null)
  const [weekFoodRows, setWeekFoodRows] = useState<WeekFoodRow[]>([])
  const [weeksOfData, setWeeksOfData] = useState(0)

  const load = useCallback(async () => {
    const supabase = createClient()
    const weekMon = currentWeekMonday()
    const weekSun = currentWeekSunday()

    type PRow = { goal_type: string | null; goal_weight_kg: number | null; goal_rate_kg_per_week: number | null; goal_start_date: string | null; protein_g_per_kg_lbm: number | null }
    type WRow = { logged_at: string; weight_kg: number }
    type TRow = { id: string; tdee_kcal: number; method: string | null; confidence: 'low' | 'medium' | 'high' | null; data_points: number; daily_kcal_target: number | null; protein_g: number | null; fat_g: number | null; carbs_g: number | null; adaptation_flag: boolean; notes: string | null }
    type FRow = { logged_date: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }

    const [{ data: pData }, { data: wData }, { data: tData }, { data: fData }] = await Promise.all([
      supabase.from('profiles').select('goal_type, goal_weight_kg, goal_rate_kg_per_week, goal_start_date, protein_g_per_kg_lbm').maybeSingle() as unknown as Promise<{ data: PRow | null }>,
      supabase.from('weight_logs').select('logged_at, weight_kg').order('logged_at', { ascending: true }) as unknown as Promise<{ data: WRow[] | null }>,
      supabase.from('tdee_estimates').select('id, tdee_kcal, method, confidence, data_points, daily_kcal_target, protein_g, fat_g, carbs_g, adaptation_flag, notes').order('calculated_at', { ascending: false }).limit(1).maybeSingle() as unknown as Promise<{ data: TRow | null }>,
      supabase.from('food_logs').select('logged_date, kcal, protein_g, carbs_g, fat_g').gte('logged_date', weekMon).lte('logged_date', weekSun) as unknown as Promise<{ data: FRow[] | null }>,
    ])

    if (pData) {
      setProfile({
        goal_type: pData.goal_type as GoalType | null,
        goal_weight_kg: pData.goal_weight_kg ? Number(pData.goal_weight_kg) : null,
        goal_rate_kg_per_week: pData.goal_rate_kg_per_week ? Number(pData.goal_rate_kg_per_week) : null,
        goal_start_date: pData.goal_start_date ?? null,
        protein_g_per_kg_lbm: pData.protein_g_per_kg_lbm ? Number(pData.protein_g_per_kg_lbm) : null,
      })
    }

    const allLogs: WeightLog[] = (wData ?? []).map(r => ({
      logged_at: r.logged_at,
      weight_kg: Number(r.weight_kg),
    }))
    setAllWeightLogs(allLogs)
    setWeekWeightLogs(allLogs.filter(l => l.logged_at >= weekMon && l.logged_at <= weekSun))

    // Weeks of data = calendar span of weight logs (drives what-if guardrail).
    if (allLogs.length >= 2) {
      const first = new Date(allLogs[0].logged_at + 'T12:00:00').getTime()
      const last = new Date(allLogs[allLogs.length - 1].logged_at + 'T12:00:00').getTime()
      setWeeksOfData(Math.floor((last - first) / (7 * 24 * 3600 * 1000)))
    } else {
      setWeeksOfData(0)
    }

    if (tData) {
      const detail = parseAdaptationDetail(tData.notes)
      setTDEE({
        id: tData.id,
        tdee_kcal: Number(tData.tdee_kcal),
        method: tData.method,
        confidence: tData.confidence,
        data_points: tData.data_points,
        daily_kcal_target: tData.daily_kcal_target ? Number(tData.daily_kcal_target) : null,
        protein_g: tData.protein_g ? Number(tData.protein_g) : null,
        fat_g: tData.fat_g ? Number(tData.fat_g) : null,
        carbs_g: tData.carbs_g ? Number(tData.carbs_g) : null,
        adaptation_flag: tData.adaptation_flag,
        suppression_pct: detail?.suppression_pct ?? 0,
        deficit_weeks: detail?.deficit_weeks ?? 0,
        severity: detail?.adaptation_severity ?? null,
      })
    }

    // Week food rows (full macros) for adherence + day count + protein adherence.
    const foodRows: WeekFoodRow[] = (fData ?? []).map(r => ({
      logged_date: r.logged_date,
      kcal: Number(r.kcal),
      protein_g: Number(r.protein_g),
      carbs_g: Number(r.carbs_g),
      fat_g: Number(r.fat_g),
    }))
    setWeekFoodRows(foodRows)
    setWeekFoodDays(new Set(foodRows.map(r => r.logged_date)).size)

    const pTarget = pData?.protein_g_per_kg_lbm ? Number(pData.protein_g_per_kg_lbm) : null
    const bwKg = allLogs.length > 0 ? allLogs[allLogs.length - 1].weight_kg : null
    if (pTarget && bwKg) {
      const dailyTargetG = pTarget * bwKg * 0.85
      const proteinByDay = new Map<string, number>()
      for (const row of foodRows) {
        proteinByDay.set(row.logged_date, (proteinByDay.get(row.logged_date) ?? 0) + row.protein_g)
      }
      setWeekProteinDays(Array.from(proteinByDay.values()).filter(g => g >= dailyTargetG).length)
    } else {
      setWeekProteinDays(null)
    }

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Derived values ─────────────────────────────────────────────────────────

  const ewmaPoints = getRollingAverage(allWeightLogs as WeightLogEntry[])
  const ewmaByDate = new Map(ewmaPoints.map(p => [p.date, p.rolling_avg]))

  const weeklyWeightTrendKg = (() => {
    if (weekWeightLogs.length < 2) return null
    const sorted = [...weekWeightLogs].sort((a, b) => a.logged_at.localeCompare(b.logged_at))
    const startEwma = ewmaByDate.get(sorted[0].logged_at) ?? sorted[0].weight_kg
    const endEwma = ewmaByDate.get(sorted[sorted.length - 1].logged_at) ?? sorted[sorted.length - 1].weight_kg
    return endEwma - startEwma
  })()

  const currentWeight = allWeightLogs.length > 0
    ? allWeightLogs[allWeightLogs.length - 1].weight_kg
    : null

  const currentEwma = ewmaPoints.length > 0
    ? ewmaPoints[ewmaPoints.length - 1].rolling_avg
    : null

  // Goal progress
  const goalWeight = profile?.goal_weight_kg ?? null
  const goalRate = profile?.goal_rate_kg_per_week ?? 0

  const startWeight = (() => {
    if (!profile?.goal_start_date || allWeightLogs.length === 0) return currentWeight
    return allWeightLogs.find(l => l.logged_at >= (profile.goal_start_date ?? ''))?.weight_kg ?? currentWeight
  })()

  const progressPct = (() => {
    if (startWeight == null || currentWeight == null || goalWeight == null) return 0
    if (profile?.goal_type === 'bulk') {
      return clamp((currentWeight - startWeight) / (goalWeight - startWeight), 0, 1)
    }
    return clamp((startWeight - currentWeight) / (startWeight - goalWeight), 0, 1)
  })()

  const etaDate = (currentWeight != null && goalWeight != null && goalRate > 0)
    ? getGoalETA(currentWeight, goalWeight, goalRate)
    : null

  const actualRate = (() => {
    if (!profile?.goal_start_date || startWeight == null || currentWeight == null) return null
    const start = new Date(profile.goal_start_date + 'T12:00:00')
    const weeksSinceStart = (Date.now() - start.getTime()) / (7 * 24 * 3600 * 1000)
    if (weeksSinceStart < 1) return null
    return Math.abs(startWeight - currentWeight) / weeksSinceStart
  })()

  const paceColor = (() => {
    if (!actualRate || !goalRate) return 'var(--color-text)'
    if (actualRate < goalRate * 0.70) return 'var(--color-warning)'
    if (actualRate > goalRate * 1.15) return 'var(--color-success)'
    return 'var(--color-success)'
  })()

  const paceLabel = (() => {
    if (!actualRate || !goalRate) return '—'
    if (actualRate < goalRate * 0.70) return 'BEHIND PACE'
    if (actualRate > goalRate * 1.15) return 'AHEAD OF PACE'
    return 'ON PACE'
  })()

  const { loggingInsight, weightInsight, proteinInsight } = computeWeeklyInsights({
    weekFoodDays,
    weekWeightLogs,
    weeklyWeightTrendKg,
    weekProteinDays,
    unitSystem,
  })

  // ── Adherence scoring ──────────────────────────────────────────────────────
  const adherence = (() => {
    if (!tdee?.daily_kcal_target || tdee.protein_g == null || tdee.carbs_g == null || tdee.fat_g == null) {
      return null
    }
    const dailyTotals = aggregateDailyTotals(weekFoodRows)
    return scoreAdherence(dailyTotals, {
      daily_kcal_target: tdee.daily_kcal_target,
      protein_g: tdee.protein_g,
      carbs_g: tdee.carbs_g,
      fat_g: tdee.fat_g,
    })
  })()

  const adherenceInsightStr = adherence ? adherenceInsight(adherence) : null

  // Append adherence insight to the reflection list (reuses insight-string pattern).
  const insights = [loggingInsight, weightInsight, proteinInsight, adherenceInsightStr]
    .filter((s): s is string => s != null)

  // ── What-if modeling (guardrailed) ─────────────────────────────────────────
  const whatIfEligibility = checkWhatIfEligibility({
    confidence: tdee?.confidence ?? null,
    weeksOfData,
  })

  const whatIf = (() => {
    if (!whatIfEligibility.eligible) return null
    if (!tdee?.daily_kcal_target || currentWeight == null || goalWeight == null) return null
    if (profile?.goal_type === 'maintain') return null
    return projectWhatIf({
      adaptiveTDEE: tdee.tdee_kcal,
      dailyKcalTarget: tdee.daily_kcal_target,
      currentWeightKg: currentWeight,
      goalWeightKg: goalWeight,
      observedRateKgPerWeek: actualRate,
      targetAdherencePct: WHATIF_TARGET_ADHERENCE,
    })
  })()

  function handleGotIt() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CHECKIN_STORAGE_KEY, currentWeekMonday())
    }
    router.back()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="screen"
      style={{
        paddingTop: 0,
        paddingBottom: 'max(100px, calc(66px + env(safe-area-inset-bottom) + 24px))',
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
          WEEKLY CHECK-IN
        </span>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: '10px',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--color-text-dim)',
          marginLeft: 'auto',
        }}>
          {currentWeekMonday().slice(5).replace('-', '/')} — {currentWeekSunday().slice(5).replace('-', '/')}
        </span>
      </div>

      {loading ? (
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', color: 'var(--color-text-muted)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          LOADING...
        </div>
      ) : (
        <>
          {/* ── Diet-break recommendation (adaptation action layer) ─────── */}
          {tdee?.adaptation_flag && (
            <DietBreakCard
              dedupeKey={`checkin:${tdee.id}`}
              rec={buildDietBreakRecommendation({
                adaptiveTDEE: tdee.tdee_kcal,
                suppressionPct: tdee.suppression_pct,
                deficitWeeks: tdee.deficit_weeks,
                severity: tdee.severity,
              })}
            />
          )}

          {/* ── 1. Weight trend ─────────────────────────────────────────── */}
          <SectionCard title="Weight Trend">
            {weekWeightLogs.length < 2 ? (
              <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)' }}>
                Log at least 2 weigh-ins this week to see a trend.
              </span>
            ) : (
              <>
                <StatRow
                  label="EWMA TREND"
                  value={weeklyWeightTrendKg == null
                    ? '—'
                    : `${weeklyWeightTrendKg > 0 ? '+' : ''}${toDisplayWeight(Math.abs(weeklyWeightTrendKg))} ${weightUnit.toUpperCase()}`}
                  valueColor={weeklyWeightTrendKg == null ? undefined
                    : Math.abs(weeklyWeightTrendKg) < 0.1 ? 'var(--color-text)'
                    : weeklyWeightTrendKg < 0 ? 'var(--color-success)' : 'var(--color-danger)'}
                />
                {currentEwma != null && (
                  <StatRow label="CURRENT EWMA" value={displayWeight(currentEwma)} />
                )}
                <StatRow label="WEIGH-INS" value={`${weekWeightLogs.length} / 7`} />
              </>
            )}
          </SectionCard>

          {/* ── 2. TDEE ──────────────────────────────────────────────────── */}
          <SectionCard title="Adaptive TDEE">
            {!tdee ? (
              <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)' }}>
                No estimate yet. Trigger a recalculation from the Trends screen.
              </span>
            ) : (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <span style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: '40px',
                    letterSpacing: '-0.01em',
                    color: 'var(--color-text)',
                    lineHeight: 1,
                  }}>
                    {tdee.tdee_kcal}
                  </span>
                  <span style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: '14px',
                    color: 'var(--color-text-dim)',
                    marginLeft: '6px',
                  }}>
                    KCAL
                  </span>
                </div>
                <StatRow label="METHOD" value={tdee.method === 'adaptive_regression' ? 'ADAPTIVE' : 'FORMULA'} />
                <StatRow label="CONFIDENCE" value={tdee.confidence?.toUpperCase() ?? '—'} />
                <StatRow label="DATA POINTS" value={String(tdee.data_points)} />
                {tdee.method === 'formula' && tdee.data_points < 7 && (
                  <div style={{
                    marginTop: '8px',
                    padding: '8px 10px',
                    borderLeft: '2px solid var(--color-text-dim)',
                    fontFamily: "'Barlow', sans-serif",
                    fontSize: '11px',
                    color: 'var(--color-text-dim)',
                    lineHeight: 1.5,
                  }}>
                    Using formula estimate — {7 - tdee.data_points} more weigh-in{7 - tdee.data_points !== 1 ? 's' : ''} needed to switch to adaptive regression.
                  </div>
                )}
              </>
            )}
          </SectionCard>

          {/* ── 3. Targets ───────────────────────────────────────────────── */}
          <SectionCard title="Current Targets">
            {!tdee?.daily_kcal_target ? (
              <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)' }}>
                No targets set yet.
              </span>
            ) : (
              <>
                <StatRow label="CALORIES" value={`${tdee.daily_kcal_target} KCAL`} />
                {tdee.protein_g != null && <StatRow label="PROTEIN" value={`${Math.round(tdee.protein_g)} G`} />}
                {tdee.carbs_g != null && <StatRow label="CARBS" value={`${Math.round(tdee.carbs_g)} G`} />}
                {tdee.fat_g != null && <StatRow label="FAT" value={`${Math.round(tdee.fat_g)} G`} />}
              </>
            )}
          </SectionCard>

          {/* ── 4. Goal progress ─────────────────────────────────────────── */}
          <SectionCard title="Goal Progress">
            {!profile?.goal_type || goalWeight == null || currentWeight == null ? (
              <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)' }}>
                Set your goal in Edit Profile to track progress here.
              </span>
            ) : (
              <>
                <ProgressBar value={progressPct} max={1} />
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0 12px' }}>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px', color: 'var(--color-text-dim)' }}>
                    {startWeight != null ? displayWeight(startWeight) : '—'}
                  </span>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px', color: 'var(--color-text-dim)' }}>
                    {displayWeight(goalWeight)}
                  </span>
                </div>
                <StatRow label="CURRENT" value={displayWeight(currentWeight)} />
                <StatRow label="PROGRESS" value={`${Math.round(progressPct * 100)}%`} />
                {etaDate && (
                  <StatRow
                    label="ETA"
                    value={etaDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()}
                  />
                )}
                <StatRow label="PACE" value={paceLabel} valueColor={paceColor} />
              </>
            )}
          </SectionCard>

          {/* ── 4b. Adherence ────────────────────────────────────────────── */}
          <SectionCard title="Macro Adherence">
            {!adherence ? (
              <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)' }}>
                Set targets and log food to score adherence.
              </span>
            ) : adherence.daysLogged === 0 ? (
              <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)' }}>
                No food logged this week yet.
              </span>
            ) : (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <span style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: '40px',
                    letterSpacing: '-0.01em',
                    color: 'var(--color-text)',
                    lineHeight: 1,
                  }}>
                    {adherence.overallPct}%
                  </span>
                  <span style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: '12px',
                    color: 'var(--color-text-dim)',
                    marginLeft: '8px',
                  }}>
                    OVERALL · {adherence.daysLogged} DAY{adherence.daysLogged === 1 ? '' : 'S'} LOGGED
                  </span>
                </div>
                <StatRow label="CALORIES" value={`${adherence.caloriesHits}/${adherence.daysLogged}`} />
                <StatRow label="PROTEIN" value={`${adherence.proteinHits}/${adherence.daysLogged}`} />
                <StatRow label="CARBS" value={`${adherence.carbsHits}/${adherence.daysLogged}`} />
                <StatRow label="FAT" value={`${adherence.fatHits}/${adherence.daysLogged}`} />
              </>
            )}
          </SectionCard>

          {/* ── 4c. What-if projection ───────────────────────────────────── */}
          <SectionCard title="What-If Projection">
            {!whatIf ? (
              <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)' }}>
                {whatIfEligibility.reason ?? 'Need more data for projections'}
              </span>
            ) : (
              <>
                {whatIf.baselineETA && whatIf.baselineRateKgPerWeek != null ? (
                  <StatRow
                    label="CURRENT PACE ETA"
                    value={whatIf.baselineETA.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()}
                  />
                ) : (
                  <StatRow label="CURRENT PACE" value="NO MOVEMENT YET" />
                )}
                <StatRow
                  label={`AT ${whatIf.targetAdherencePct}% ADHERENCE`}
                  value={whatIf.scenarioETA.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()}
                  valueColor="var(--color-accent)"
                />
                {whatIf.weeksDelta != null && whatIf.weeksDelta !== 0 && (
                  <StatRow
                    label="DIFFERENCE"
                    value={`${Math.abs(whatIf.weeksDelta)} WK ${whatIf.weeksDelta > 0 ? 'SOONER' : 'LATER'}`}
                    valueColor={whatIf.weeksDelta > 0 ? 'var(--color-success)' : 'var(--color-warning)'}
                  />
                )}
                <p style={{
                  fontFamily: "'Barlow', sans-serif",
                  fontSize: '11px',
                  color: 'var(--color-text-muted)',
                  lineHeight: 1.5,
                  margin: '8px 0 0',
                }}>
                  Estimates based on your adaptive TDEE and logged pace — not guarantees.
                </p>
              </>
            )}
          </SectionCard>

          {/* ── 5. Reflection ────────────────────────────────────────────── */}
          <SectionCard title="Weekly Reflection">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {insights.map((insight, i) => (
                <div key={i} style={{
                  fontFamily: "'Barlow', sans-serif",
                  fontSize: '13px',
                  lineHeight: 1.6,
                  color: 'var(--color-text)',
                  paddingLeft: '12px',
                  borderLeft: '2px solid var(--color-accent)',
                }}>
                  {insight}
                </div>
              ))}
            </div>
          </SectionCard>

          {/* ── 6. Got It ────────────────────────────────────────────────── */}
          <button
            onClick={handleGotIt}
            style={{
              width: '100%',
              background: 'var(--color-accent)',
              border: 'none',
              color: '#fff',
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '24px',
              letterSpacing: '0.08em',
              padding: '16px',
              cursor: 'pointer',
              marginTop: 'var(--space-2)',
            }}
          >
            GOT IT
          </button>
        </>
      )}
    </div>
  )
}
