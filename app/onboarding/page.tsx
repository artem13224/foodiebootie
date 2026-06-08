'use client'

import { useState } from 'react'
import type { ActivityLevel, GoalType } from '@/types'
import { ftInToCm, cmToFtIn, kgToLbs, lbsToKg } from '@/lib/science/utils'
import { getDailyTarget, getGoalETA } from '@/lib/science/tdee'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnboardingData {
  sex: 'male' | 'female' | 'other'
  date_of_birth: string
  height_cm: number
  current_weight_kg: number
  activity_level: ActivityLevel
  goal_type: GoalType
  goal_weight_kg: number
  goal_rate_kg_per_week: number
  protein_g_per_kg_lbm: number
}

const TOTAL_STEPS = 10

// ── Activity level options (Build Guide §9.2) ──────────────────────────────

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; description: string }[] = [
  { value: 'sedentary', label: 'SEDENTARY', description: 'Desk job, little or no exercise' },
  { value: 'lightly_active', label: 'LIGHTLY ACTIVE', description: 'Light exercise 1–3 days/week' },
  { value: 'moderately_active', label: 'MODERATELY ACTIVE', description: 'Moderate exercise 3–5 days/week' },
  { value: 'very_active', label: 'VERY ACTIVE', description: 'Hard exercise 6–7 days/week' },
  { value: 'extra_active', label: 'EXTRA ACTIVE', description: 'Physical job + hard daily training' },
]

// ── Goal type options ────────────────────────────────────────────────────────

const GOAL_OPTIONS: { value: GoalType; label: string; description: string }[] = [
  { value: 'cut', label: 'CUT', description: 'Lose body fat while preserving muscle' },
  { value: 'maintain', label: 'MAINTAIN', description: 'Hold current weight and composition' },
  { value: 'bulk', label: 'BULK', description: 'Build muscle mass in a calorie surplus' },
  { value: 'recomp', label: 'RECOMP', description: 'Simultaneously lose fat and gain muscle' },
  { value: 'performance', label: 'PERFORMANCE', description: 'Optimize for athletic performance' },
]

// ── Rate ranges by goal (§9.7) ─────────────────────────────────────────────

function getRateRange(goal: GoalType, weight_kg: number): { min: number; max: number; step: number; recommended: number } {
  switch (goal) {
    case 'cut':
      return {
        min: Math.round(weight_kg * 0.0025 * 100) / 100,
        max: Math.round(weight_kg * 0.0075 * 100) / 100,
        step: 0.05,
        recommended: Math.round(weight_kg * 0.005 * 100) / 100,
      }
    case 'bulk':
      return {
        min: Math.round(weight_kg * 0.001 * 100) / 100,
        max: Math.round(weight_kg * 0.005 * 100) / 100,
        step: 0.025,
        recommended: Math.round(weight_kg * 0.0025 * 100) / 100,
      }
    case 'maintain':
      return { min: 0, max: 0, step: 0, recommended: 0 }
    default:
      return { min: 0.05, max: 0.3, step: 0.05, recommended: 0.1 }
  }
}

// ── Shared style helpers ───────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 700,
  fontSize: '10px',
  letterSpacing: '0.25em',
  textTransform: 'uppercase',
  color: 'var(--color-text-dim)',
  marginBottom: '4px',
  display: 'block',
}

const questionStyle: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 'clamp(28px, 7vw, 36px)',
  letterSpacing: '-0.02em',
  color: 'var(--color-text)',
  lineHeight: 1.1,
  marginBottom: '28px',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: '36px',
  letterSpacing: '-0.02em',
  padding: '10px 14px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const unitToggleStyle = (active: boolean): React.CSSProperties => ({
  background: active ? 'var(--color-accent)' : 'var(--color-bg)',
  border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
  color: active ? '#fff' : 'var(--color-text-dim)',
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 700,
  fontSize: '11px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  padding: '6px 12px',
})

const cardStyle = (selected: boolean): React.CSSProperties => ({
  background: selected ? 'var(--color-surface)' : 'var(--color-bg)',
  border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
  padding: '14px 16px',
  cursor: 'pointer',
  marginBottom: '8px',
})

// ── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Collected data
  const [data, setData] = useState<Partial<OnboardingData>>({
    sex: undefined,
    date_of_birth: '',
    height_cm: 170,
    current_weight_kg: 70,
    activity_level: undefined,
    goal_type: undefined,
    goal_weight_kg: 65,
    goal_rate_kg_per_week: 0.5,
    protein_g_per_kg_lbm: 2.4,
  })

  // Display unit toggles
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ftIn'>('cm')
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg')
  const [ftInput, setFtInput] = useState('5')
  const [inInput, setInInput] = useState('7')
  const [heightCmInput, setHeightCmInput] = useState('170')
  const [weightInput, setWeightInput] = useState('70')
  const [goalWeightInput, setGoalWeightInput] = useState('65')

  // Completion screen TDEE estimate state
  const [completionTDEE, setCompletionTDEE] = useState<{
    tdee_kcal: number; daily_kcal_target: number; protein_g: number; fat_g: number; carbs_g: number
  } | null>(null)

  function goNext() {
    setError('')
    if (!validateStep()) return
    if (step === 9) {
      handleComplete()
      return
    }
    setStep(s => s + 1)

    // On reaching completion screen, pre-calculate TDEE
    if (step === 9) previewTDEE()
  }

  function goBack() {
    if (step === 0) return
    setStep(s => s - 1)
  }

  function validateStep(): boolean {
    switch (step) {
      case 1: if (!data.sex) { setError('Please select your biological sex.'); return false } break
      case 2: if (!data.date_of_birth) { setError('Please enter your date of birth.'); return false } break
      case 3: {
        const cm = heightUnit === 'cm'
          ? parseFloat(heightCmInput)
          : ftInToCm(parseFloat(ftInput || '0'), parseFloat(inInput || '0'))
        if (isNaN(cm) || cm < 100 || cm > 250) { setError('Enter a valid height (100–250 cm).'); return false }
        setData(d => ({ ...d, height_cm: cm }))
        break
      }
      case 4: {
        const kg = weightUnit === 'kg' ? parseFloat(weightInput) : lbsToKg(parseFloat(weightInput))
        if (isNaN(kg) || kg < 20 || kg > 500) { setError('Enter a valid weight.'); return false }
        setData(d => ({ ...d, current_weight_kg: kg }))
        break
      }
      case 5: if (!data.activity_level) { setError('Please select your activity level.'); return false } break
      case 6: if (!data.goal_type) { setError('Please select a goal.'); return false } break
      case 7: {
        const kg = weightUnit === 'kg' ? parseFloat(goalWeightInput) : lbsToKg(parseFloat(goalWeightInput))
        if (isNaN(kg) || kg < 20 || kg > 500) { setError('Enter a valid goal weight.'); return false }
        setData(d => ({ ...d, goal_weight_kg: kg }))
        break
      }
    }
    return true
  }

  async function previewTDEE() {
    const payload = buildPayload(false)
    try {
      const res = await fetch('/api/tdee/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const json = await res.json()
        setCompletionTDEE({
          tdee_kcal: json.tdee.tdee_kcal,
          daily_kcal_target: json.tdee.daily_kcal_target,
          protein_g: json.macros.protein_g,
          fat_g: json.macros.fat_g,
          carbs_g: json.macros.carbs_g,
        })
      }
    } catch { /* show defaults */ }
  }

  function buildPayload(saveProfile: boolean) {
    return {
      sex: data.sex,
      date_of_birth: data.date_of_birth,
      height_cm: data.height_cm,
      current_weight_kg: data.current_weight_kg,
      activity_level: data.activity_level,
      goal_type: data.goal_type,
      goal_weight_kg: data.goal_weight_kg,
      goal_rate_kg_per_week: data.goal_type === 'maintain' ? 0 : data.goal_rate_kg_per_week,
      protein_g_per_kg_lbm: data.protein_g_per_kg_lbm,
      save_profile: saveProfile,
    }
  }

  async function handleComplete() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/tdee/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(true)),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? `Error ${res.status} — please try again.`)
        setSaving(false)
        return
      }
      // Full reload — forces (app)/layout.tsx to re-read the profile from DB
      // instead of using Next.js's cached server component result which would
      // still see onboarding_complete=false and bounce us back here.
      window.location.href = '/today'
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`)
      setSaving(false)
    }
  }

  const progress = step / TOTAL_STEPS

  // ETA preview for step 7+
  const etaDate = (data.current_weight_kg && data.goal_weight_kg && data.goal_rate_kg_per_week && data.goal_rate_kg_per_week > 0)
    ? getGoalETA(data.current_weight_kg, data.goal_weight_kg, data.goal_rate_kg_per_week)
    : null

  const rateRange = (data.goal_type && data.current_weight_kg)
    ? getRateRange(data.goal_type, data.current_weight_kg)
    : null

  return (
    <div style={{
      maxWidth: '390px',
      margin: '0 auto',
      padding: '0 20px',
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* Progress bar */}
      <div style={{ height: '2px', background: 'var(--color-border-soft)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <div style={{
          height: '100%',
          width: `${progress * 100}%`,
          background: 'var(--color-accent)',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Back button */}
      {step > 0 && (
        <button
          onClick={goBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-dim)', padding: '20px 0 0 0',
            alignSelf: 'flex-start',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      )}

      {/* Main content */}
      <div style={{ flex: 1, paddingTop: step === 0 ? '80px' : '24px', paddingBottom: '100px' }}>

        {/* ── Step 0: Welcome ─────────────────────────────────────── */}
        {step === 0 && (
          <div>
            <span style={labelStyle}>FOODIEBOOTIE</span>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 'clamp(52px, 14vw, 72px)',
              letterSpacing: '-0.05em',
              color: 'var(--color-text)',
              lineHeight: 1,
              marginBottom: '16px',
            }}>
              SCIENCE-FORWARD NUTRITION
            </div>
            <p style={{
              fontFamily: "'Barlow', sans-serif",
              fontSize: '14px',
              color: 'var(--color-text-dim)',
              lineHeight: 1.6,
              marginBottom: '32px',
              maxWidth: '300px',
            }}>
              Every calorie target and macro split is calculated from peer-reviewed research and adapts to your actual logged data — not static guesswork.
            </p>
            <p style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: '12px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'var(--color-accent)',
            }}>
              Let's build your profile →
            </p>
          </div>
        )}

        {/* ── Step 1: Sex ──────────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <span style={labelStyle}>STEP 1 OF {TOTAL_STEPS}</span>
            <div style={questionStyle}>WHAT IS YOUR BIOLOGICAL SEX?</div>
            {(['male', 'female', 'other'] as const).map(s => (
              <div
                key={s}
                onClick={() => setData(d => ({ ...d, sex: s }))}
                style={cardStyle(data.sex === s)}
              >
                <span style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: '24px',
                  letterSpacing: '0.05em',
                  color: data.sex === s ? 'var(--color-accent)' : 'var(--color-text)',
                }}>
                  {s.toUpperCase()}
                </span>
              </div>
            ))}
            <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '12px', lineHeight: 1.5 }}>
              Used for RMR calculation. Does not affect how the app treats you.
            </p>
          </div>
        )}

        {/* ── Step 2: Date of Birth ────────────────────────────────── */}
        {step === 2 && (
          <div>
            <span style={labelStyle}>STEP 2 OF {TOTAL_STEPS}</span>
            <div style={questionStyle}>WHEN WERE YOU BORN?</div>
            <input
              type="date"
              max={new Date().toISOString().split('T')[0]}
              value={data.date_of_birth ?? ''}
              onChange={e => setData(d => ({ ...d, date_of_birth: e.target.value }))}
              style={{ ...inputStyle, fontSize: '20px', fontFamily: "'Barlow Condensed', sans-serif" }}
            />
            {data.date_of_birth && (() => {
              const dob = new Date(data.date_of_birth)
              const today = new Date()
              const age = today.getFullYear() - dob.getFullYear() -
                (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate()) ? 1 : 0)
              return (
                <div style={{ marginTop: '12px', fontFamily: "'Bebas Neue', sans-serif", fontSize: '24px', color: 'var(--color-accent)' }}>
                  {age} YEARS OLD
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Step 3: Height ───────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <span style={labelStyle}>STEP 3 OF {TOTAL_STEPS}</span>
            <div style={questionStyle}>HOW TALL ARE YOU?</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button onClick={() => setHeightUnit('cm')} style={unitToggleStyle(heightUnit === 'cm')}>CM</button>
              <button onClick={() => setHeightUnit('ftIn')} style={unitToggleStyle(heightUnit === 'ftIn')}>FT / IN</button>
            </div>
            {heightUnit === 'cm' ? (
              <input
                type="number"
                inputMode="decimal"
                value={heightCmInput}
                onChange={e => setHeightCmInput(e.target.value)}
                placeholder="170"
                style={inputStyle}
              />
            ) : (
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <span style={labelStyle}>FEET</span>
                  <input type="number" inputMode="numeric" value={ftInput} onChange={e => setFtInput(e.target.value)} placeholder="5" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={labelStyle}>INCHES</span>
                  <input type="number" inputMode="decimal" value={inInput} onChange={e => setInInput(e.target.value)} placeholder="7" style={inputStyle} />
                </div>
              </div>
            )}
            {/* Live cm preview */}
            {heightUnit === 'ftIn' && (
              <div style={{ marginTop: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', color: 'var(--color-text-dim)' }}>
                = {ftInToCm(parseFloat(ftInput || '0'), parseFloat(inInput || '0'))} CM
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Current Weight ───────────────────────────────── */}
        {step === 4 && (
          <div>
            <span style={labelStyle}>STEP 4 OF {TOTAL_STEPS}</span>
            <div style={questionStyle}>WHAT IS YOUR CURRENT WEIGHT?</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button onClick={() => setWeightUnit('kg')} style={unitToggleStyle(weightUnit === 'kg')}>KG</button>
              <button onClick={() => setWeightUnit('lbs')} style={unitToggleStyle(weightUnit === 'lbs')}>LBS</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
              <input
                type="number"
                inputMode="decimal"
                value={weightInput}
                onChange={e => setWeightInput(e.target.value)}
                placeholder={weightUnit === 'kg' ? '70.0' : '154.0'}
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '16px', color: 'var(--color-text-dim)', paddingBottom: '14px' }}>
                {weightUnit.toUpperCase()}
              </span>
            </div>
          </div>
        )}

        {/* ── Step 5: Activity Level ───────────────────────────────── */}
        {step === 5 && (
          <div>
            <span style={labelStyle}>STEP 5 OF {TOTAL_STEPS}</span>
            <div style={questionStyle}>HOW ACTIVE ARE YOU?</div>
            {ACTIVITY_OPTIONS.map(opt => (
              <div key={opt.value} onClick={() => setData(d => ({ ...d, activity_level: opt.value }))} style={cardStyle(data.activity_level === opt.value)}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '20px', color: data.activity_level === opt.value ? 'var(--color-accent)' : 'var(--color-text)', letterSpacing: '0.05em' }}>
                  {opt.label}
                </div>
                <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)', marginTop: '2px' }}>
                  {opt.description}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 6: Goal Type ────────────────────────────────────── */}
        {step === 6 && (
          <div>
            <span style={labelStyle}>STEP 6 OF {TOTAL_STEPS}</span>
            <div style={questionStyle}>WHAT IS YOUR GOAL?</div>
            {GOAL_OPTIONS.map(opt => (
              <div key={opt.value} onClick={() => setData(d => ({ ...d, goal_type: opt.value }))} style={cardStyle(data.goal_type === opt.value)}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '20px', color: data.goal_type === opt.value ? 'var(--color-accent)' : 'var(--color-text)', letterSpacing: '0.05em' }}>
                  {opt.label}
                </div>
                <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)', marginTop: '2px' }}>
                  {opt.description}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 7: Target Weight ────────────────────────────────── */}
        {step === 7 && (
          <div>
            <span style={labelStyle}>STEP 7 OF {TOTAL_STEPS}</span>
            <div style={questionStyle}>WHAT IS YOUR TARGET WEIGHT?</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button onClick={() => setWeightUnit('kg')} style={unitToggleStyle(weightUnit === 'kg')}>KG</button>
              <button onClick={() => setWeightUnit('lbs')} style={unitToggleStyle(weightUnit === 'lbs')}>LBS</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
              <input
                type="number"
                inputMode="decimal"
                value={goalWeightInput}
                onChange={e => setGoalWeightInput(e.target.value)}
                placeholder={weightUnit === 'kg' ? '65.0' : '143.0'}
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '16px', color: 'var(--color-text-dim)', paddingBottom: '14px' }}>
                {weightUnit.toUpperCase()}
              </span>
            </div>
            {/* Direction hint */}
            {data.current_weight_kg && goalWeightInput && (() => {
              const gw = weightUnit === 'kg' ? parseFloat(goalWeightInput) : lbsToKg(parseFloat(goalWeightInput))
              if (isNaN(gw)) return null
              const delta = Math.abs(data.current_weight_kg - gw)
              const direction = gw < (data.current_weight_kg ?? 0) ? 'LOSING' : 'GAINING'
              const deltaDisplay = weightUnit === 'kg' ? `${delta.toFixed(1)} KG` : `${kgToLbs(delta).toFixed(1)} LBS`
              return (
                <div style={{ marginTop: '12px', fontFamily: "'Bebas Neue', sans-serif", fontSize: '20px', color: 'var(--color-accent)' }}>
                  {direction} {deltaDisplay}
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Step 8: Rate of Change ───────────────────────────────── */}
        {step === 8 && (
          <div>
            <span style={labelStyle}>STEP 8 OF {TOTAL_STEPS}</span>
            <div style={questionStyle}>HOW FAST DO YOU WANT TO CHANGE?</div>
            {data.goal_type === 'maintain' ? (
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '16px', color: 'var(--color-text-dim)', marginBottom: '20px' }}>
                MAINTENANCE — NO RATE NEEDED
              </div>
            ) : rateRange && (
              <>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '36px', color: 'var(--color-accent)' }}>
                    {(data.goal_rate_kg_per_week ?? rateRange.recommended).toFixed(2)}
                  </span>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '14px', color: 'var(--color-text-dim)', marginLeft: '6px' }}>
                    KG/WEEK
                  </span>
                </div>
                <input
                  type="range"
                  min={rateRange.min}
                  max={rateRange.max}
                  step={rateRange.step}
                  value={data.goal_rate_kg_per_week ?? rateRange.recommended}
                  onChange={e => setData(d => ({ ...d, goal_rate_kg_per_week: parseFloat(e.target.value) }))}
                  style={{ width: '100%', accentColor: 'var(--color-accent)', marginBottom: '16px' }}
                />
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px',
                  color: 'var(--color-text-muted)', letterSpacing: '0.1em', marginBottom: '20px',
                }}>
                  <span>{rateRange.min.toFixed(2)} KG/WK MIN</span>
                  <span>{rateRange.max.toFixed(2)} KG/WK MAX</span>
                </div>
                {/* Kcal preview */}
                {(() => {
                  const rate = data.goal_rate_kg_per_week ?? rateRange.recommended
                  const weeklyKcal = rate * 7700
                  const dailyKcal = Math.round(weeklyKcal / 7)
                  const direction = data.goal_type === 'bulk' ? 'SURPLUS' : 'DEFICIT'
                  return (
                    <div style={{
                      border: '1px solid var(--color-border)',
                      padding: '12px 14px',
                      fontFamily: "'Barlow Condensed', sans-serif",
                    }}>
                      <div style={{ fontWeight: 700, fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                        DAILY {direction}
                      </div>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '28px', color: 'var(--color-accent)' }}>
                        {dailyKcal} KCAL
                      </div>
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        )}

        {/* ── Step 9: Protein Preference ───────────────────────────── */}
        {step === 9 && (
          <div>
            <span style={labelStyle}>STEP 9 OF {TOTAL_STEPS}</span>
            <div style={questionStyle}>SET YOUR PROTEIN TARGET</div>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '36px', color: 'var(--color-accent)' }}>
                {(data.protein_g_per_kg_lbm ?? 2.4).toFixed(1)}
              </span>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '14px', color: 'var(--color-text-dim)', marginLeft: '6px' }}>
                G/KG LBM
              </span>
            </div>
            <input
              type="range"
              min={1.8}
              max={3.1}
              step={0.1}
              value={data.protein_g_per_kg_lbm ?? 2.4}
              onChange={e => setData(d => ({ ...d, protein_g_per_kg_lbm: parseFloat(e.target.value) }))}
              style={{ width: '100%', accentColor: 'var(--color-accent)', marginBottom: '16px' }}
            />
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px',
              color: 'var(--color-text-muted)', letterSpacing: '0.1em', marginBottom: '20px',
            }}>
              <span>1.8 G/KG MIN</span>
              <span>3.1 G/KG MAX</span>
            </div>
            {/* Gram target preview using body weight as LBM proxy */}
            {data.current_weight_kg && (() => {
              const lbmProxy = data.current_weight_kg * 0.80  // rough 80% LBM proxy
              const totalG = Math.round(lbmProxy * (data.protein_g_per_kg_lbm ?? 2.4))
              return (
                <div style={{
                  border: '1px solid var(--color-border)',
                  padding: '12px 14px',
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}>
                  <div style={{ fontWeight: 700, fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                    ESTIMATED DAILY PROTEIN
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '28px', color: 'var(--color-accent)' }}>
                    ~{totalG}G
                  </div>
                </div>
              )
            })()}
            <p style={{
              marginTop: '16px',
              fontFamily: "'Barlow', sans-serif",
              fontSize: '11px',
              color: 'var(--color-text-muted)',
              lineHeight: 1.6,
            }}>
              Science default is 2.4 g/kg LBM. Range 1.8–3.1 based on Helms et al. (2014). Will be recalculated using real LBM once body measurements are entered.
            </p>
          </div>
        )}

        {/* ── Step 10: Completion ──────────────────────────────────── */}
        {step === 10 && (
          <div>
            <span style={labelStyle}>YOU'RE READY</span>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(36px, 9vw, 48px)', letterSpacing: '-0.02em', color: 'var(--color-text)', lineHeight: 1.1, marginBottom: '24px' }}>
              HERE'S YOUR STARTING PLAN
            </div>

            {/* Stats tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--color-border)', marginBottom: '20px' }}>
              {[
                { label: 'TDEE', value: completionTDEE ? `${completionTDEE.tdee_kcal}` : '—', suffix: 'KCAL' },
                { label: 'DAILY TARGET', value: completionTDEE ? `${completionTDEE.daily_kcal_target}` : '—', suffix: 'KCAL' },
                { label: 'PROTEIN', value: completionTDEE ? `${completionTDEE.protein_g}` : '—', suffix: 'G' },
                { label: 'FAT', value: completionTDEE ? `${completionTDEE.fat_g}` : '—', suffix: 'G' },
                { label: 'CARBS', value: completionTDEE ? `${completionTDEE.carbs_g}` : '—', suffix: 'G' },
                {
                  label: 'ETA',
                  value: (() => {
                    if (!data.goal_type || data.goal_type === 'maintain') return '—'
                    if (!data.current_weight_kg || !data.goal_weight_kg || !data.goal_rate_kg_per_week) return '—'
                    const eta = getGoalETA(data.current_weight_kg, data.goal_weight_kg, data.goal_rate_kg_per_week)
                    return eta.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                  })(),
                  suffix: '',
                },
              ].map(stat => (
                <div key={stat.label} style={{ background: 'var(--color-bg)', padding: '14px 12px' }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                    {stat.label}
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '24px', letterSpacing: '-0.02em', color: 'var(--color-text)', lineHeight: 1 }}>
                    {stat.value}
                    {stat.suffix && <span style={{ fontSize: '14px', color: 'var(--color-text-dim)', marginLeft: '3px' }}>{stat.suffix}</span>}
                  </div>
                </div>
              ))}
            </div>

            <p style={{
              fontFamily: "'Barlow', sans-serif",
              fontSize: '12px',
              color: 'var(--color-text-dim)',
              lineHeight: 1.6,
              marginBottom: '24px',
            }}>
              Your TDEE will adapt automatically as you log data. After 7 weigh-ins, the science engine switches from formula to your actual data.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            marginTop: '12px',
            fontFamily: "'Barlow', sans-serif",
            fontSize: '13px',
            color: 'var(--color-danger)',
          }}>
            {error}
          </div>
        )}

      </div>

      {/* ── CTA Button ─────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        padding: '16px 20px',
        background: 'var(--color-bg)',
        borderTop: '1px solid var(--color-border-soft)',
        maxWidth: '390px',
        margin: '0 auto',
      }}>
        <button
          onClick={step === 9 ? () => { previewTDEE(); setStep(10) } : step === 10 ? handleComplete : goNext}
          disabled={saving}
          style={{
            width: '100%',
            background: saving ? 'var(--color-border)' : 'var(--color-accent)',
            border: 'none',
            color: '#fff',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '22px',
            letterSpacing: '0.08em',
            padding: '16px',
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          {saving
            ? 'SETTING UP...'
            : step === 0
            ? 'GET STARTED'
            : step === 10
            ? 'START TRACKING'
            : 'CONTINUE'}
        </button>
      </div>

    </div>
  )
}
