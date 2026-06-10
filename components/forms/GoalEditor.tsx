'use client'

import { useState } from 'react'
import { kgToLbs, lbsToKg, localDateStr } from '@/lib/science/utils'
import type { GoalType } from '@/types'

interface GoalEditorProps {
  onClose: () => void
  onSaved: () => void
  /** Current goal values (may be null if no goal set yet). */
  current: {
    goal_type: GoalType | null
    goal_weight_kg: number | null
    goal_rate_kg_per_week: number | null
  }
  /** Latest body weight in kg — drives the aggressive-rate (1%/week) warning. */
  currentWeightKg: number | null
  /** Display unit preference for prefilled inputs. */
  unitSystem: 'metric' | 'imperial'
}

const GOAL_OPTIONS: { value: GoalType; label: string; hint: string }[] = [
  { value: 'cut', label: 'CUT', hint: 'Lose fat in a deficit' },
  { value: 'maintain', label: 'MAINTAIN', hint: 'Hold current weight' },
  { value: 'bulk', label: 'BULK', hint: 'Gain weight in a surplus' },
  { value: 'recomp', label: 'RECOMP', hint: 'Body recomposition at maintenance' },
  { value: 'performance', label: 'PERFORMANCE', hint: 'Fuel training, weight neutral' },
]

/** Goal types that involve directional weight change + a rate. */
const DIRECTIONAL: GoalType[] = ['cut', 'bulk']

export default function GoalEditor({ onClose, onSaved, current, currentWeightKg, unitSystem }: GoalEditorProps) {
  const [goalType, setGoalType] = useState<GoalType>(current.goal_type ?? 'cut')
  const [unit, setUnit] = useState<'kg' | 'lbs'>(unitSystem === 'imperial' ? 'lbs' : 'kg')

  // Target weight input, in the chosen display unit
  const initialTargetKg = current.goal_weight_kg ?? currentWeightKg ?? null
  const [targetInput, setTargetInput] = useState(
    initialTargetKg != null
      ? String(unitSystem === 'imperial' ? kgToLbs(initialTargetKg) : Math.round(initialTargetKg * 10) / 10)
      : ''
  )

  // Rate input, in the chosen display unit per week
  const initialRateKg = current.goal_rate_kg_per_week ?? 0.5
  const [rateInput, setRateInput] = useState(
    String(unitSystem === 'imperial' ? Math.round(kgToLbs(initialRateKg) * 100) / 100 : initialRateKg)
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isDirectional = DIRECTIONAL.includes(goalType)

  // ── Derived: rate in kg/week + aggressive-rate check ──────────────────────
  const rateKg = (() => {
    const raw = parseFloat(rateInput)
    if (isNaN(raw) || raw < 0) return 0
    return unit === 'lbs' ? lbsToKg(raw) : raw
  })()

  // Aggressive if rate exceeds 1% of bodyweight per week
  const aggressive = isDirectional && currentWeightKg != null && rateKg > currentWeightKg * 0.01

  function toggleUnit(next: 'kg' | 'lbs') {
    if (next === unit) return
    // Convert both inputs live
    const t = parseFloat(targetInput)
    if (!isNaN(t)) {
      setTargetInput(String(next === 'lbs' ? kgToLbs(lbsOrKgToKg(t, unit)) : Math.round(lbsOrKgToKg(t, unit) * 10) / 10))
    }
    const r = parseFloat(rateInput)
    if (!isNaN(r)) {
      const rKg = unit === 'lbs' ? lbsToKg(r) : r
      setRateInput(String(next === 'lbs' ? Math.round(kgToLbs(rKg) * 100) / 100 : Math.round(rKg * 1000) / 1000))
    }
    setUnit(next)
  }

  function lbsOrKgToKg(v: number, u: 'kg' | 'lbs'): number {
    return u === 'lbs' ? lbsToKg(v) : v
  }

  async function handleConfirm() {
    setError('')

    let goalWeightKg: number | null = null
    if (isDirectional || goalType === 'recomp') {
      const t = parseFloat(targetInput)
      if (isNaN(t) || t <= 0) {
        setError('Enter a valid target weight.')
        return
      }
      goalWeightKg = unit === 'lbs' ? lbsToKg(t) : t
      if (goalWeightKg < 20 || goalWeightKg > 500) {
        setError('Target weight out of range.')
        return
      }
    }

    const goalRateKg = isDirectional ? rateKg : 0

    setSaving(true)
    const res = await fetch('/api/profile/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_type: goalType,
        goal_weight_kg: goalWeightKg != null ? Math.round(goalWeightKg * 100) / 100 : null,
        goal_rate_kg_per_week: goalRateKg ? Math.round(goalRateKg * 1000) / 1000 : null,
        // Anchor progress tracking to now. This does NOT touch weight_logs or
        // tdee_estimates — only the goal anchor date.
        goal_start_date: localDateStr(),
      }),
    })

    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Failed to save goal.')
      setSaving(false)
      return
    }

    // Recompute macro/calorie targets via the existing engine (inserts a new
    // tdee_estimates row; preserves all history).
    await fetch('/api/tdee/calculate', { method: 'POST' }).catch(() => {})

    setSaving(false)
    onSaved()
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200 }} />

      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(360px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
        backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
        padding: '24px 20px', zIndex: 201,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '13px',
            letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--color-text)',
          }}>
            CHANGE GOAL
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', padding: '4px' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        {/* Goal type */}
        <div style={{ marginBottom: '18px' }}>
          <div style={labelStyle}>GOAL TYPE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {GOAL_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setGoalType(opt.value)}
                title={opt.hint}
                style={{
                  padding: '7px 12px',
                  border: `1px solid ${goalType === opt.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: goalType === opt.value ? 'var(--color-accent)' : 'transparent',
                  color: goalType === opt.value ? '#fff' : 'var(--color-text-dim)',
                  cursor: 'pointer',
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                  fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase',
                }}>
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px', lineHeight: 1.4 }}>
            {GOAL_OPTIONS.find(o => o.value === goalType)?.hint}
          </div>
        </div>

        {/* Unit toggle */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          {(['kg', 'lbs'] as const).map(u => (
            <button key={u} onClick={() => toggleUnit(u)} style={{
              background: unit === u ? 'var(--color-accent)' : 'var(--color-bg)',
              border: `1px solid ${unit === u ? 'var(--color-accent)' : 'var(--color-border)'}`,
              color: unit === u ? '#fff' : 'var(--color-text-dim)',
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px',
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', padding: '5px 14px',
            }}>
              {u}
            </button>
          ))}
        </div>

        {/* Target weight (hidden for maintain/performance) */}
        {(isDirectional || goalType === 'recomp') && (
          <div style={{ marginBottom: '16px' }}>
            <div style={labelStyle}>TARGET WEIGHT ({unit.toUpperCase()})</div>
            <input
              type="number" inputMode="decimal" value={targetInput}
              onChange={e => setTargetInput(e.target.value)}
              placeholder={unit === 'kg' ? '70.0' : '154.0'}
              style={boxInputStyle}
            />
          </div>
        )}

        {/* Rate (only cut/bulk) */}
        {isDirectional && (
          <div style={{ marginBottom: '16px' }}>
            <div style={labelStyle}>RATE ({unit.toUpperCase()} / WEEK)</div>
            <input
              type="number" inputMode="decimal" value={rateInput} step="0.05"
              onChange={e => setRateInput(e.target.value)}
              placeholder={unit === 'kg' ? '0.5' : '1.0'}
              style={boxInputStyle}
            />
          </div>
        )}

        {/* Aggressive-rate warning */}
        {aggressive && (
          <div style={{
            border: '1px solid var(--color-warning)', padding: '10px 12px', marginBottom: '14px',
            fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-warning)', lineHeight: 1.5,
          }}>
            That rate is over 1% of your body weight per week — aggressive and harder to sustain. Consider a slower rate to protect muscle and adherence.
          </div>
        )}

        {/* Always-on recalculation note */}
        <div style={{
          fontFamily: "'Barlow', sans-serif", fontSize: '11px', color: 'var(--color-text-muted)',
          marginBottom: '16px', lineHeight: 1.5,
        }}>
          Your calorie and macro targets will be recalculated. Your weight history and adaptive TDEE data are kept.
        </div>

        {error && (
          <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-danger)', marginBottom: '12px' }}>
            {error}
          </div>
        )}

        <button onClick={handleConfirm} disabled={saving} style={{
          width: '100%', background: saving ? 'var(--color-border)' : 'var(--color-accent)',
          border: 'none', color: '#fff', fontFamily: "'Bebas Neue', sans-serif", fontSize: '20px',
          letterSpacing: '0.1em', padding: '14px', cursor: saving ? 'default' : 'pointer',
        }}>
          {saving ? 'SAVING...' : 'CONFIRM GOAL'}
        </button>
      </div>
    </>
  )
}

const labelStyle: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px',
  letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: '6px',
}

const boxInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--color-bg)',
  border: '1px solid var(--color-border)', color: 'var(--color-text)',
  fontFamily: "'Bebas Neue', sans-serif", fontSize: '26px', padding: '8px 12px', outline: 'none',
}
