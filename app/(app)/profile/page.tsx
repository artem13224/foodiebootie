'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ProgressBar from '@/components/ui/ProgressBar'
import { getGoalETA, getRollingAverage } from '@/lib/science/tdee'
import type { WeightLogEntry } from '@/lib/science/tdee'
import { getAgeFromDOB } from '@/lib/science/rmr'
import { clamp, localDateStr } from '@/lib/science/utils'
import { computeWeeklyInsights } from '@/lib/science/weeklyInsights'
import { useUnitSystem } from '@/contexts/UnitSystemContext'
import type { GoalType, ActivityLevel } from '@/types'

// ── Week helpers ──────────────────────────────────────────────────────────────

/** Returns the Monday of the current week as YYYY-MM-DD. */
function currentWeekMonday(): string {
  const today = new Date()
  const dow = (today.getDay() + 6) % 7 // 0=Mon
  const mon = new Date(today)
  mon.setDate(today.getDate() - dow)
  return localDateStr(mon)
}

/** Returns the Sunday of the current week as YYYY-MM-DD. */
function currentWeekSunday(): string {
  const mon = currentWeekMonday()
  const [y, m, d] = mon.split('-').map(Number)
  const sun = new Date(y, m - 1, d + 6)
  return localDateStr(sun)
}

interface Profile {
  id: string
  username: string
  sex: string | null
  date_of_birth: string | null
  height_cm: number | null
  activity_level: ActivityLevel | null
  goal_type: GoalType | null
  goal_weight_kg: number | null
  goal_rate_kg_per_week: number | null
  goal_start_date: string | null
  protein_g_per_kg_lbm: number | null
  unit_system: 'metric' | 'imperial'
}

interface WeightLog {
  logged_at: string
  weight_kg: number
}

interface TDEEEstimate {
  adaptation_flag: boolean
  data_points: number
  daily_kcal_target: number | null
}

const GOAL_LABELS: Record<GoalType, string> = {
  cut: 'CUT',
  maintain: 'MAINTAIN',
  bulk: 'BULK',
  recomp: 'RECOMP',
  performance: 'PERFORMANCE',
}

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'SEDENTARY',
  lightly_active: 'LIGHTLY ACTIVE',
  moderately_active: 'MODERATELY ACTIVE',
  very_active: 'VERY ACTIVE',
  extra_active: 'EXTRA ACTIVE',
}

export default function ProfilePage() {
  const router = useRouter()
  const { displayWeight, displayHeight, unitSystem } = useUnitSystem()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([])
  const [tdee, setTDEE] = useState<TDEEEstimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const [weeklyExpanded, setWeeklyExpanded] = useState(false)

  // Weekly data
  const [weekFoodDays, setWeekFoodDays] = useState(0)   // days with ≥1 food log entry
  const [weekWeightLogs, setWeekWeightLogs] = useState<WeightLog[]>([])
  const [weekProteinDays, setWeekProteinDays] = useState<number | null>(null) // null = no target

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      type PRow = { id: string; username: string; sex: string | null; date_of_birth: string | null; height_cm: number | null; activity_level: string | null; goal_type: string | null; goal_weight_kg: number | null; goal_rate_kg_per_week: number | null; goal_start_date: string | null; protein_g_per_kg_lbm: number | null; unit_system: string | null }
      type WRow = { logged_at: string; weight_kg: number }
      type TRow = { adaptation_flag: boolean; data_points: number; daily_kcal_target: number | null }
      type FRow = { logged_date: string; protein_g: number }

      const weekMon = currentWeekMonday()
      const weekSun = currentWeekSunday()

      const [{ data: profileData }, { data: weightsData }, { data: tdeeData }, { data: weekFoodData }] = await Promise.all([
        supabase.from('profiles').select('*').maybeSingle() as unknown as Promise<{ data: PRow | null; error: unknown }>,
        supabase.from('weight_logs').select('logged_at, weight_kg').order('logged_at', { ascending: true }) as unknown as Promise<{ data: WRow[] | null; error: unknown }>,
        supabase
          .from('tdee_estimates')
          .select('adaptation_flag, data_points, daily_kcal_target')
          .order('calculated_at', { ascending: false })
          .limit(1)
          .maybeSingle() as unknown as Promise<{ data: TRow | null; error: unknown }>,
        supabase
          .from('food_logs')
          .select('logged_date, protein_g')
          .gte('logged_date', weekMon)
          .lte('logged_date', weekSun) as unknown as Promise<{ data: FRow[] | null; error: unknown }>,
      ])

      if (profileData) {
        setProfile({
          id: profileData.id,
          username: profileData.username,
          sex: profileData.sex ?? null,
          date_of_birth: profileData.date_of_birth ?? null,
          height_cm: profileData.height_cm ? Number(profileData.height_cm) : null,
          activity_level: profileData.activity_level as ActivityLevel | null,
          goal_type: profileData.goal_type as GoalType | null,
          goal_weight_kg: profileData.goal_weight_kg ? Number(profileData.goal_weight_kg) : null,
          goal_rate_kg_per_week: profileData.goal_rate_kg_per_week ? Number(profileData.goal_rate_kg_per_week) : null,
          goal_start_date: profileData.goal_start_date ?? null,
          protein_g_per_kg_lbm: profileData.protein_g_per_kg_lbm ? Number(profileData.protein_g_per_kg_lbm) : null,
          unit_system: (profileData.unit_system as 'metric' | 'imperial') ?? 'metric',
        })
      }

      setWeightLogs(
        (weightsData ?? []).map(r => ({
          logged_at: r.logged_at as string,
          weight_kg: Number(r.weight_kg),
        }))
      )

      if (tdeeData) {
        setTDEE({
          adaptation_flag: tdeeData.adaptation_flag,
          data_points: tdeeData.data_points,
          daily_kcal_target: tdeeData.daily_kcal_target ? Number(tdeeData.daily_kcal_target) : null,
        })
      }

      // ── Weekly data processing ──────────────────────────────────────────
      const allWeights = (weightsData ?? []).map(r => ({
        logged_at: r.logged_at as string,
        weight_kg: Number(r.weight_kg),
      }))
      const thisWeekWeights = allWeights.filter(
        w => w.logged_at >= weekMon && w.logged_at <= weekSun
      )
      setWeekWeightLogs(thisWeekWeights)

      const foodRows = weekFoodData ?? []
      const daysWithFood = new Set(foodRows.map(r => r.logged_date)).size
      setWeekFoodDays(daysWithFood)

      // Protein adherence — only if profile has a protein target AND we have body weight
      const pTarget = profileData?.protein_g_per_kg_lbm
        ? Number(profileData.protein_g_per_kg_lbm)
        : null
      const bwKg = allWeights.length > 0
        ? allWeights[allWeights.length - 1].weight_kg
        : null

      if (pTarget && bwKg) {
        // Rough protein target in grams (using body weight as proxy for LBM)
        const dailyTargetG = pTarget * bwKg * 0.85 // ~85% of BW as proxy for LBM
        // Group food_logs by day, sum protein
        const proteinByDay = new Map<string, number>()
        for (const row of foodRows) {
          proteinByDay.set(row.logged_date, (proteinByDay.get(row.logged_date) ?? 0) + Number(row.protein_g))
        }
        const daysOnTarget = Array.from(proteinByDay.values()).filter(g => g >= dailyTargetG).length
        setWeekProteinDays(daysOnTarget)
      } else {
        setWeekProteinDays(null)
      }

      setLoading(false)
    }
    load()
  }, [])

  async function handleLogout() {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="screen" style={{ paddingTop: 'var(--space-6)' }}>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', color: 'var(--color-text-muted)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          LOADING...
        </span>
      </div>
    )
  }

  // ── Goal progress calculations ──────────────────────────────────────────

  const currentWeight = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight_kg : null

  // Start weight = earliest log >= goal_start_date, else current weight
  const startWeight = (() => {
    if (!profile?.goal_start_date || weightLogs.length === 0) return currentWeight
    const afterStart = weightLogs.find(l => l.logged_at >= (profile.goal_start_date ?? ''))
    return afterStart?.weight_kg ?? currentWeight
  })()

  const goalWeight = profile?.goal_weight_kg ?? null
  const goalRate = profile?.goal_rate_kg_per_week ?? 0

  const progressPct = (() => {
    if (startWeight == null || currentWeight == null || goalWeight == null) return 0
    if (profile?.goal_type === 'bulk') {
      return clamp((currentWeight - startWeight) / (goalWeight - startWeight), 0, 1)
    }
    return clamp((startWeight - currentWeight) / (startWeight - goalWeight), 0, 1)
  })()

  // ETA
  const etaDate = (currentWeight != null && goalWeight != null && goalRate > 0)
    ? getGoalETA(currentWeight, goalWeight, goalRate)
    : null

  // Pace: compare actual rate vs. goal rate
  const actualRate = (() => {
    if (!profile?.goal_start_date || startWeight == null || currentWeight == null) return null
    const start = new Date(profile.goal_start_date + 'T12:00:00')
    const weeksSinceStart = (Date.now() - start.getTime()) / (7 * 24 * 3600 * 1000)
    if (weeksSinceStart < 1) return null
    return Math.abs(startWeight - currentWeight) / weeksSinceStart
  })()

  const etaColor = (() => {
    if (!actualRate || !goalRate) return 'var(--color-text)'
    if (actualRate < goalRate * 0.70) return 'var(--color-warning)'
    if (actualRate > goalRate * 1.15) return 'var(--color-success)'
    return 'var(--color-text)'
  })()

  // Week number since goal start
  const weekNumber = (() => {
    if (!profile?.goal_start_date) return null
    const start = new Date(profile.goal_start_date + 'T12:00:00')
    return Math.max(1, Math.ceil((Date.now() - start.getTime()) / (7 * 24 * 3600 * 1000)))
  })()

  const weightToGo = (currentWeight != null && goalWeight != null)
    ? Math.abs(currentWeight - goalWeight)
    : null

  // Age
  const age = profile?.date_of_birth
    ? getAgeFromDOB(new Date(profile.date_of_birth + 'T12:00:00'))
    : null

  const goalLabel = profile?.goal_type ? GOAL_LABELS[profile.goal_type] : '—'
  const activityLabel = profile?.activity_level ? ACTIVITY_LABELS[profile.activity_level] : '—'

  // ── Weekly computations ───────────────────────────────────────────────────

  // Net weight trend this week (start vs end rolling avg)
  const weeklyWeightTrend = (() => {
    if (weekWeightLogs.length < 2) return null
    // Use all-time rolling avg for accuracy
    const allRolling = getRollingAverage(weightLogs as WeightLogEntry[])
    const rollingByDate = new Map(allRolling.map(p => [p.date, p.rolling_avg]))
    const sorted = [...weekWeightLogs].sort((a, b) => a.logged_at.localeCompare(b.logged_at))
    const startAvg = rollingByDate.get(sorted[0].logged_at) ?? sorted[0].weight_kg
    const endAvg = rollingByDate.get(sorted[sorted.length - 1].logged_at) ?? sorted[sorted.length - 1].weight_kg
    return endAvg - startAvg // positive = gained, negative = lost
  })()

  // ── Weekly reflection strings (shared module) ─────────────────────────────

  const { loggingInsight, weightInsight, proteinInsight } = computeWeeklyInsights({
    weekFoodDays,
    weekWeightLogs,
    weeklyWeightTrendKg: weeklyWeightTrend,
    weekProteinDays,
    unitSystem,
  })

  return (
    <div className="screen" style={{ paddingTop: 0 }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-4)',
      }}>
        <div>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '28px',
            letterSpacing: '-0.02em',
            color: 'var(--color-text)',
          }}>
            {profile?.username?.toUpperCase() ?? 'USER'}
          </span>
          {profile?.goal_type && weekNumber && (
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: '10px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--color-accent)',
              marginTop: '2px',
            }}>
              {goalLabel} · WEEK {weekNumber}
            </div>
          )}
        </div>
        {/* Avatar */}
        <div style={{
          width: '36px', height: '36px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '18px',
            color: 'var(--color-text)',
          }}>
            {profile?.username?.[0]?.toUpperCase() ?? 'U'}
          </span>
        </div>
      </div>

      {/* Accent line */}
      <div style={{ height: '2px', backgroundColor: 'var(--color-accent)', marginBottom: 'var(--space-5)' }} />

      {/* ── Current Goal card ────────────────────────────────────────── */}
      {profile?.goal_type && profile.goal_type !== 'maintain' && goalWeight != null && currentWeight != null && (
        <div style={{
          border: '1px solid var(--color-border)',
          padding: '16px',
          marginBottom: 'var(--space-5)',
        }}>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '10px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--color-text-dim)',
            display: 'block',
            marginBottom: '12px',
          }}>
            CURRENT GOAL
          </span>

          <ProgressBar value={progressPct} max={1} />

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', marginBottom: '10px' }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '11px', color: 'var(--color-text-dim)' }}>
              {startWeight != null ? displayWeight(startWeight) : '—'}
            </span>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '11px', color: 'var(--color-text-dim)' }}>
              {displayWeight(goalWeight)}
            </span>
          </div>

          {/* Stats row */}
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '16px',
            letterSpacing: '0.02em',
            color: 'var(--color-text)',
            lineHeight: 1.3,
          }}>
            {weightToGo != null && <span>{displayWeight(weightToGo)} TO GO</span>}
            {etaDate && (
              <>
                <span style={{ color: 'var(--color-text-dim)', margin: '0 6px' }}>·</span>
                <span style={{ color: etaColor }}>
                  ETA {etaDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()}
                </span>
              </>
            )}
            {weekNumber && (
              <>
                <span style={{ color: 'var(--color-text-dim)', margin: '0 6px' }}>·</span>
                <span>WEEK {weekNumber}</span>
              </>
            )}
          </div>

          <div style={{ marginTop: '6px' }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px', color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>
              {Math.round(progressPct * 100)}% COMPLETE
            </span>
          </div>
        </div>
      )}

      {/* ── Goal setup state (no goal data yet) ─────────────────────── */}
      {!profile?.goal_type && (
        <div style={{
          border: '1px solid var(--color-border)',
          padding: '16px',
          marginBottom: 'var(--space-5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '12px',
            letterSpacing: '0.1em',
            color: 'var(--color-text-dim)',
          }}>
            Set your goal to unlock progress tracking.
          </span>
          <button
            onClick={() => router.push('/profile/edit')}
            style={{
              background: 'var(--color-accent)',
              border: 'none',
              color: '#fff',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: '10px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              padding: '6px 12px',
              cursor: 'pointer',
              flexShrink: 0,
              marginLeft: '12px',
            }}
          >
            SET GOAL
          </button>
        </div>
      )}

      {/* ── Adaptation warning ───────────────────────────────────────── */}
      {tdee?.adaptation_flag && (
        <div style={{
          borderLeft: '2px solid var(--color-warning)',
          paddingLeft: '14px',
          marginBottom: 'var(--space-5)',
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '11px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--color-warning)',
            marginBottom: '6px',
          }}>
            METABOLIC ADAPTATION DETECTED
          </div>
          <p style={{
            fontFamily: "'Barlow', sans-serif",
            fontSize: '12px',
            color: 'var(--color-text-dim)',
            lineHeight: 1.6,
            margin: 0,
          }}>
            You&apos;ve been in a prolonged deficit and your metabolism has adapted. Consider a diet break or refeed week to reset metabolic rate before continuing.
          </p>
        </div>
      )}

      {/* ── Weekly Check-In entry ───────────────────────────────────── */}
      <button
        onClick={() => router.push('/weekly-checkin')}
        style={{
          width: '100%',
          background: 'none',
          border: '1px solid var(--color-border)',
          cursor: 'pointer',
          padding: '14px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-3)',
          textAlign: 'left',
        }}
      >
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: '11px',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--color-text)',
        }}>
          WEEKLY CHECK-IN
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: 'var(--color-text-dim)', flexShrink: 0 }}>
          <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {/* ── Weekly Check-In Panel ────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-5)', border: '1px solid var(--color-border)' }}>
        {/* Collapse toggle header */}
        <button
          onClick={() => setWeeklyExpanded(e => !e)}
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '14px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            textAlign: 'left',
          }}
        >
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '11px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--color-text)',
          }}>
            THIS WEEK
          </span>
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ color: 'var(--color-text-dim)', transform: weeklyExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
          >
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>

        {weeklyExpanded && (
          <div style={{ borderTop: '1px solid var(--color-border)', padding: '14px 16px' }}>
            {/* 3b — Summary tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'var(--color-border)', marginBottom: '16px' }}>
              {[
                { label: 'DAYS LOGGED', value: `${weekFoodDays}/7` },
                { label: 'WEIGH-INS', value: `${weekWeightLogs.length}/7` },
                {
                  label: 'WT TREND',
                  value: weeklyWeightTrend == null
                    ? '—'
                    : weeklyWeightTrend === 0 || Math.abs(weeklyWeightTrend) < 0.05
                    ? '—'
                    : `${weeklyWeightTrend > 0 ? '+' : ''}${unitSystem === 'imperial'
                        ? Math.round(weeklyWeightTrend * 2.20462 * 10) / 10
                        : Math.round(weeklyWeightTrend * 10) / 10} ${unitSystem === 'imperial' ? 'LBS' : 'KG'}`,
                },
              ].map(stat => (
                <div key={stat.label} style={{ background: 'var(--color-bg)', padding: '10px 8px' }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: '3px' }}>
                    {stat.label}
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '18px', color: 'var(--color-text)', lineHeight: 1 }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* 3c — Weekly Reflection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[loggingInsight, weightInsight, proteinInsight]
                .filter((s): s is string => s != null)
                .map((insight, i) => (
                  <div key={i} style={{
                    fontFamily: "'Barlow', sans-serif",
                    fontSize: '12px',
                    lineHeight: 1.6,
                    color: 'var(--color-text-dim)',
                    paddingLeft: '10px',
                    borderLeft: '2px solid var(--color-border)',
                  }}>
                    {insight}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Vitals ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
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
          VITALS
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--color-border)' }}>
          {[
            { label: 'WEIGHT', value: currentWeight ? displayWeight(currentWeight) : '—' },
            { label: 'HEIGHT', value: profile?.height_cm ? displayHeight(profile.height_cm) : '—' },
            { label: 'AGE', value: age ? `${age} YRS` : '—' },
            { label: 'ACTIVITY', value: activityLabel },
            { label: 'GOAL', value: goalLabel },
            {
              label: 'PROTEIN PREF',
              value: profile?.protein_g_per_kg_lbm
                ? unitSystem === 'imperial'
                  ? `${(profile.protein_g_per_kg_lbm / 2.205).toFixed(2)} G/LB`
                  : `${profile.protein_g_per_kg_lbm} G/KG`
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
                fontSize: '18px',
                letterSpacing: '-0.02em',
                color: 'var(--color-text)',
                lineHeight: 1,
              }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Action buttons ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: 'var(--space-8)' }}>
        <button
          onClick={() => router.push('/profile/edit')}
          style={{
            background: 'none',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '18px',
            letterSpacing: '0.05em',
            padding: '14px',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          EDIT PROFILE
        </button>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            background: 'none',
            border: '1px solid var(--color-border)',
            color: loggingOut ? 'var(--color-text-muted)' : 'var(--color-danger)',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '18px',
            letterSpacing: '0.05em',
            padding: '14px',
            cursor: loggingOut ? 'default' : 'pointer',
            width: '100%',
          }}
        >
          {loggingOut ? 'LOGGING OUT...' : 'LOG OUT'}
        </button>
      </div>

    </div>
  )
}
