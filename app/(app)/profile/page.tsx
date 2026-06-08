'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ProgressBar from '@/components/ui/ProgressBar'
import { getGoalETA } from '@/lib/science/tdee'
import { getAgeFromDOB } from '@/lib/science/rmr'
import { clamp } from '@/lib/science/utils'
import type { GoalType, ActivityLevel } from '@/types'

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
  const [profile, setProfile] = useState<Profile | null>(null)
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([])
  const [tdee, setTDEE] = useState<TDEEEstimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      type PRow = { id: string; username: string; sex: string | null; date_of_birth: string | null; height_cm: number | null; activity_level: string | null; goal_type: string | null; goal_weight_kg: number | null; goal_rate_kg_per_week: number | null; goal_start_date: string | null; protein_g_per_kg_lbm: number | null }
      type WRow = { logged_at: string; weight_kg: number }
      type TRow = { adaptation_flag: boolean; data_points: number; daily_kcal_target: number | null }

      const [{ data: profileData }, { data: weightsData }, { data: tdeeData }] = await Promise.all([
        supabase.from('profiles').select('*').maybeSingle() as unknown as Promise<{ data: PRow | null; error: unknown }>,
        supabase.from('weight_logs').select('logged_at, weight_kg').order('logged_at', { ascending: true }) as unknown as Promise<{ data: WRow[] | null; error: unknown }>,
        supabase
          .from('tdee_estimates')
          .select('adaptation_flag, data_points, daily_kcal_target')
          .order('calculated_at', { ascending: false })
          .limit(1)
          .maybeSingle() as unknown as Promise<{ data: TRow | null; error: unknown }>,
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
              {startWeight?.toFixed(1)} KG
            </span>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '11px', color: 'var(--color-text-dim)' }}>
              {goalWeight.toFixed(1)} KG
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
            {weightToGo != null && <span>{weightToGo.toFixed(1)} KG TO GO</span>}
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
            { label: 'WEIGHT', value: currentWeight ? `${currentWeight.toFixed(1)} KG` : '—' },
            { label: 'HEIGHT', value: profile?.height_cm ? `${profile.height_cm} CM` : '—' },
            { label: 'AGE', value: age ? `${age} YRS` : '—' },
            { label: 'ACTIVITY', value: activityLabel },
            { label: 'GOAL', value: goalLabel },
            { label: 'PROTEIN PREF', value: profile?.protein_g_per_kg_lbm ? `${profile.protein_g_per_kg_lbm} G/KG` : '—' },
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
          onClick={() => router.push('/onboarding')}
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
