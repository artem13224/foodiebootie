'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ftInToCm, cmToFtIn, kgToLbs, lbsToKg } from '@/lib/science/utils'
import { useUnitSystem } from '@/contexts/UnitSystemContext'
import type { ActivityLevel } from '@/types'

// ── Activity options ──────────────────────────────────────────────────────────

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; description: string }[] = [
  { value: 'sedentary', label: 'SEDENTARY', description: 'Desk job, little or no exercise' },
  { value: 'lightly_active', label: 'LIGHTLY ACTIVE', description: 'Light exercise 1–3 days/week' },
  { value: 'moderately_active', label: 'MODERATELY ACTIVE', description: 'Moderate exercise 3–5 days/week' },
  { value: 'very_active', label: 'VERY ACTIVE', description: 'Hard exercise 6–7 days/week' },
  { value: 'extra_active', label: 'EXTRA ACTIVE', description: 'Physical job + hard daily training' },
]

// ── Shared styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 700,
  fontSize: '10px',
  letterSpacing: '0.25em',
  textTransform: 'uppercase',
  color: 'var(--color-text-dim)',
  marginBottom: '6px',
  display: 'block',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 600,
  fontSize: '18px',
  padding: '12px 14px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 0,
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
  padding: '7px 16px',
  borderRadius: 0,
})

const cardStyle = (selected: boolean): React.CSSProperties => ({
  background: selected ? 'var(--color-surface)' : 'var(--color-bg)',
  border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
  padding: '12px 16px',
  cursor: 'pointer',
  marginBottom: '6px',
  width: '100%',
  textAlign: 'left',
})

const sectionStyle: React.CSSProperties = {
  marginBottom: '28px',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EditProfilePage() {
  const { unitSystem: contextUnit } = useUnitSystem()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Profile fields
  const [username, setUsername] = useState('')
  const [sex, setSex] = useState<'male' | 'female' | 'other' | null>(null)
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(null)
  const [proteinPref, setProteinPref] = useState(2.4)
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>(contextUnit)

  // Height inputs
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ftIn'>('cm')
  const [heightCmInput, setHeightCmInput] = useState('')
  const [ftInput, setFtInput] = useState('5')
  const [inInput, setInInput] = useState('7')

  // Weight inputs
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg')
  const [weightInput, setWeightInput] = useState('')
  const [originalWeightKg, setOriginalWeightKg] = useState<number | null>(null)

  // ── Load profile on mount ────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const { data: profileRaw } = await (supabase
        .from('profiles')
        .select('username, sex, date_of_birth, height_cm, activity_level, protein_g_per_kg_lbm')
        .maybeSingle() as unknown as Promise<{
          data: {
            username: string
            sex: string | null
            date_of_birth: string | null
            height_cm: number | null
            activity_level: string | null
            protein_g_per_kg_lbm: number | null
          } | null
          error: unknown
        }>)

      // Latest weight log
      const { data: latestWeight } = await (supabase
        .from('weight_logs')
        .select('weight_kg')
        .order('logged_at', { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as Promise<{
          data: { weight_kg: number } | null
          error: unknown
        }>)

      if (profileRaw) {
        setUsername(profileRaw.username ?? '')
        setSex((profileRaw.sex as 'male' | 'female' | 'other' | null) ?? null)
        setDateOfBirth(profileRaw.date_of_birth ?? '')
        setActivityLevel((profileRaw.activity_level as ActivityLevel | null) ?? null)
        setProteinPref(Number(profileRaw.protein_g_per_kg_lbm ?? 2.4))

        // Height — display in the context unit (already set from contextUnit)
        if (profileRaw.height_cm) {
          const cm = Number(profileRaw.height_cm)
          if (contextUnit === 'imperial') {
            setHeightUnit('ftIn')
            const { feet, inches } = cmToFtIn(cm)
            setFtInput(String(feet))
            setInInput(String(inches))
          } else {
            setHeightUnit('cm')
            setHeightCmInput(String(Math.round(cm)))
          }
        }
      }

      // Weight — display in the context unit
      if (latestWeight?.weight_kg) {
        const kg = Number(latestWeight.weight_kg)
        setOriginalWeightKg(kg)
        if (contextUnit === 'imperial') {
          setWeightUnit('lbs')
          setWeightInput(String(kgToLbs(kg)))
        } else {
          setWeightUnit('kg')
          setWeightInput(String(Math.round(kg * 10) / 10))
        }
      }

      setLoading(false)
    }
    load()
  }, [])

  // ── Unit system toggle — convert displayed values live ───────────────────

  function handleUnitSystemChange(sys: 'metric' | 'imperial') {
    if (sys === unitSystem) return
    setUnitSystem(sys)

    // Convert height
    const currentCm = heightUnit === 'cm'
      ? parseFloat(heightCmInput)
      : ftInToCm(parseFloat(ftInput || '0'), parseFloat(inInput || '0'))

    if (!isNaN(currentCm) && currentCm > 0) {
      if (sys === 'imperial') {
        setHeightUnit('ftIn')
        const { feet, inches } = cmToFtIn(currentCm)
        setFtInput(String(feet))
        setInInput(String(inches))
      } else {
        setHeightUnit('cm')
        setHeightCmInput(String(Math.round(currentCm)))
      }
    } else {
      setHeightUnit(sys === 'imperial' ? 'ftIn' : 'cm')
    }

    // Convert weight
    const currentKg = weightUnit === 'kg'
      ? parseFloat(weightInput)
      : lbsToKg(parseFloat(weightInput))

    if (!isNaN(currentKg) && currentKg > 0) {
      if (sys === 'imperial') {
        setWeightUnit('lbs')
        setWeightInput(String(kgToLbs(currentKg)))
      } else {
        setWeightUnit('kg')
        setWeightInput(String(Math.round(currentKg * 10) / 10))
      }
    } else {
      setWeightUnit(sys === 'imperial' ? 'lbs' : 'kg')
    }
  }

  // ── Validate + save ──────────────────────────────────────────────────────

  async function handleSave() {
    setError('')

    // Parse height
    let height_cm: number | null = null
    if (heightCmInput || (ftInput && inInput)) {
      const cm = heightUnit === 'cm'
        ? parseFloat(heightCmInput)
        : ftInToCm(parseFloat(ftInput || '0'), parseFloat(inInput || '0'))
      if (isNaN(cm) || cm < 100 || cm > 250) {
        setError('Enter a valid height (100–250 cm / 3\'3"–8\'2").')
        return
      }
      height_cm = cm
    }

    // Parse weight
    let weight_kg: number | null = null
    if (weightInput) {
      const kg = weightUnit === 'kg' ? parseFloat(weightInput) : lbsToKg(parseFloat(weightInput))
      if (isNaN(kg) || kg < 20 || kg > 500) {
        setError('Enter a valid weight (20–500 kg / 44–1100 lbs).')
        return
      }
      weight_kg = kg
    }

    setSaving(true)

    // 1. Update profile
    const res = await fetch('/api/profile/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.trim() || undefined,
        sex,
        date_of_birth: dateOfBirth || null,
        height_cm,
        activity_level: activityLevel,
        protein_g_per_kg_lbm: proteinPref,
        unit_system: unitSystem,
      }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error ?? `Error ${res.status}`)
      setSaving(false)
      return
    }

    // 2. Log new weight entry if changed
    if (weight_kg !== null && weight_kg !== originalWeightKg) {
      const today = new Date().toISOString().split('T')[0]
      await fetch('/api/weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight_kg, logged_at: today }),
      })
    }

    // 3. Recalculate TDEE so macro/kcal targets reflect the updated profile
    await fetch('/api/tdee/calculate', { method: 'POST' })

    window.location.href = '/profile'
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '12px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-text-dim)' }}>
          LOADING...
        </span>
      </div>
    )
  }

  return (
    <div className="screen" style={{ paddingTop: 0, paddingBottom: '120px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-5)' }}>
        <button
          onClick={() => { window.location.href = '/profile' }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text-dim)', display: 'flex' }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 800,
          fontSize: '22px',
          letterSpacing: 'var(--tracking-loose)',
          textTransform: 'uppercase',
          color: 'var(--color-text)',
        }}>
          EDIT PROFILE
        </span>
      </div>

      {/* ── Unit system toggle ── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>UNIT SYSTEM</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => handleUnitSystemChange('metric')} style={unitToggleStyle(unitSystem === 'metric')}>
            METRIC
          </button>
          <button onClick={() => handleUnitSystemChange('imperial')} style={unitToggleStyle(unitSystem === 'imperial')}>
            IMPERIAL
          </button>
        </div>
      </div>

      {/* ── Username ── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>USERNAME</span>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="username"
          maxLength={50}
          style={inputStyle}
        />
      </div>

      {/* ── Sex ── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>BIOLOGICAL SEX</span>
        {(['male', 'female', 'other'] as const).map(s => (
          <button key={s} onClick={() => setSex(s)} style={cardStyle(sex === s)}>
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '20px',
              letterSpacing: '0.05em',
              color: sex === s ? 'var(--color-accent)' : 'var(--color-text)',
            }}>
              {s.toUpperCase()}
            </span>
          </button>
        ))}
      </div>

      {/* ── Date of birth ── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>DATE OF BIRTH</span>
        <input
          type="date"
          value={dateOfBirth}
          onChange={e => setDateOfBirth(e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          style={{ ...inputStyle, fontSize: '16px' }}
        />
        {dateOfBirth && (() => {
          const dob = new Date(dateOfBirth)
          const today = new Date()
          const age = today.getFullYear() - dob.getFullYear() -
            (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate()) ? 1 : 0)
          return (
            <div style={{ marginTop: '6px', fontFamily: "'Bebas Neue', sans-serif", fontSize: '18px', color: 'var(--color-accent)' }}>
              {age} YEARS OLD
            </div>
          )
        })()}
      </div>

      {/* ── Height ── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>HEIGHT</span>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <button onClick={() => {
            if (heightUnit === 'ftIn') {
              const cm = ftInToCm(parseFloat(ftInput || '0'), parseFloat(inInput || '0'))
              setHeightCmInput(isNaN(cm) ? '' : String(Math.round(cm)))
            }
            setHeightUnit('cm')
          }} style={unitToggleStyle(heightUnit === 'cm')}>CM</button>
          <button onClick={() => {
            if (heightUnit === 'cm') {
              const cm = parseFloat(heightCmInput)
              if (!isNaN(cm) && cm > 0) {
                const { feet, inches } = cmToFtIn(cm)
                setFtInput(String(feet))
                setInInput(String(inches))
              }
            }
            setHeightUnit('ftIn')
          }} style={unitToggleStyle(heightUnit === 'ftIn')}>FT / IN</button>
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
        {heightUnit === 'ftIn' && ftInput && inInput && (
          <div style={{ marginTop: '6px', fontFamily: "'Barlow Condensed', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)' }}>
            = {ftInToCm(parseFloat(ftInput || '0'), parseFloat(inInput || '0'))} CM
          </div>
        )}
      </div>

      {/* ── Current weight ── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>CURRENT WEIGHT</span>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <button onClick={() => {
            if (weightUnit === 'lbs') {
              const kg = lbsToKg(parseFloat(weightInput))
              setWeightInput(isNaN(kg) ? '' : String(Math.round(kg * 10) / 10))
            }
            setWeightUnit('kg')
          }} style={unitToggleStyle(weightUnit === 'kg')}>KG</button>
          <button onClick={() => {
            if (weightUnit === 'kg') {
              const lbs = kgToLbs(parseFloat(weightInput))
              setWeightInput(isNaN(lbs) ? '' : String(lbs))
            }
            setWeightUnit('lbs')
          }} style={unitToggleStyle(weightUnit === 'lbs')}>LBS</button>
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
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '14px', color: 'var(--color-text-dim)', paddingBottom: '14px' }}>
            {weightUnit.toUpperCase()}
          </span>
        </div>
        <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
          Saves a new weight log entry for today.
        </p>
      </div>

      {/* ── Activity level ── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>ACTIVITY LEVEL</span>
        {ACTIVITY_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => setActivityLevel(opt.value)} style={cardStyle(activityLevel === opt.value)}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '18px', color: activityLevel === opt.value ? 'var(--color-accent)' : 'var(--color-text)', letterSpacing: '0.05em' }}>
              {opt.label}
            </div>
            <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)', marginTop: '2px' }}>
              {opt.description}
            </div>
          </button>
        ))}
      </div>

      {/* ── Protein preference ── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>PROTEIN TARGET</span>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '32px', color: 'var(--color-accent)' }}>
            {proteinPref.toFixed(1)}
          </span>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--color-text-dim)', marginLeft: '6px' }}>
            G/KG LBM
          </span>
        </div>
        <input
          type="range"
          min={1.8}
          max={3.1}
          step={0.1}
          value={proteinPref}
          onChange={e => setProteinPref(parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--color-accent)', marginBottom: '6px' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px', color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>
          <span>1.8 MIN</span>
          <span>3.1 MAX</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '13px', color: 'var(--color-danger)', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* ── Save button ── */}
      <div style={{ marginTop: '8px' }}>
        <button
          onClick={handleSave}
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
            borderRadius: 0,
          }}
        >
          {saving ? 'SAVING...' : 'SAVE'}
        </button>
      </div>

    </div>
  )
}
