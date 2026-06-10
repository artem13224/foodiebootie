'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Recommendation {
  key: string; name: string; category: string
  doseLow: number | null; doseHigh: number | null; doseUnit: string | null
  grade: 'strong' | 'moderate' | 'limited'
  summary: string | null; citation: string | null; reason: string
  mapsToNutrientKey: string | null; caution: string | null; doseCappedByUl: boolean
}
interface SafetyFlag { name: string; reason: string }

interface Props { onClose: () => void; onComplete: () => void }

// ── token styles ──
const heading: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '22px',
  letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-text)',
}
const stepLabel: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '11px',
  letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: '8px', display: 'block',
}
const q: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif", fontSize: '28px', letterSpacing: '0.04em',
  color: 'var(--color-text)', lineHeight: 1.05, marginBottom: '18px',
}
const primary: React.CSSProperties = {
  width: '100%', background: 'var(--color-accent)', border: 'none', color: '#fff',
  fontFamily: "'Bebas Neue', sans-serif", fontSize: '22px', letterSpacing: '0.08em', padding: '15px', cursor: 'pointer',
}
const ghost: React.CSSProperties = {
  width: '100%', background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-dim)',
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '12px',
  letterSpacing: '0.15em', textTransform: 'uppercase', padding: '12px', cursor: 'pointer',
}
function chip(active: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--color-accent)' : 'var(--color-bg)',
    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
    color: active ? '#fff' : 'var(--color-text)',
    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '13px',
    letterSpacing: '0.08em', textTransform: 'uppercase', padding: '11px 14px', cursor: 'pointer', textAlign: 'left',
  }
}

const GOALS: [string, string][] = [
  ['energy', 'Energy & fatigue'], ['sleep', 'Sleep'], ['stress', 'Stress & mood'],
  ['immunity', 'Immunity'], ['performance', 'Performance'], ['recovery', 'Recovery'],
  ['bone_joint', 'Bone & joint'], ['gut', 'Gut & digestion'], ['cognition', 'Focus & memory'],
  ['skin_hair', 'Skin, hair & nails'],
]
const GRADE_COLOR = { strong: 'var(--color-success)', moderate: 'var(--color-accent)', limited: 'var(--color-text-dim)' } as const

export default function HealthAssessment({ onClose, onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [sex, setSex] = useState<'male' | 'female' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // responses
  const [goals, setGoals] = useState<Set<string>>(new Set())
  const [diet, setDiet] = useState<'omnivore' | 'vegetarian' | 'vegan' | 'pescatarian'>('omnivore')
  const [sun, setSun] = useState<'low' | 'moderate' | 'high'>('moderate')
  const [training, setTraining] = useState<'none' | 'light' | 'regular' | 'intense'>('light')
  const [meds, setMeds] = useState<Set<string>>(new Set())
  const [conditions, setConditions] = useState<Set<string>>(new Set())
  const [pregnant, setPregnant] = useState(false)
  const [lactating, setLactating] = useState(false)

  // results
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [flags, setFlags] = useState<SafetyFlag[]>([])
  const [priorities, setPriorities] = useState<string[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    createClient().auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: p } = await createClient().from('profiles').select('sex').maybeSingle() as any
      setSex(p?.sex === 'female' ? 'female' : p?.sex === 'male' ? 'male' : null)
    })
  }, [])

  function toggle(set: Set<string>, setFn: (s: Set<string>) => void, val: string) {
    const n = new Set(set); n.has(val) ? n.delete(val) : n.add(val); setFn(n)
  }

  async function submit() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/supplements/assessment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goals: Array.from(goals), diet, sunExposure: sun, training,
          meds: Array.from(meds), conditions: Array.from(conditions),
          pregnant: sex === 'female' ? pregnant : false,
          lactating: sex === 'female' ? lactating : false,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Assessment failed'); setBusy(false); return }
      setRecs(json.recommendations ?? [])
      setFlags(json.safetyFlags ?? [])
      setPriorities(json.priorities ?? [])
      setPicked(new Set((json.recommendations ?? []).map((r: Recommendation) => r.key)))
      setStep(99) // results
    } catch { setError('Assessment failed') }
    setBusy(false)
  }

  async function acceptStack() {
    setBusy(true); setError('')
    try {
      const chosen = recs.filter(r => picked.has(r.key))
      const ids: string[] = []
      for (const r of chosen) {
        const convUnit = r.doseUnit && ['IU', 'mg', 'mcg', 'g'].includes(r.doseUnit)
        const nutrients = r.mapsToNutrientKey && convUnit && r.doseHigh != null
          ? [{ key: r.mapsToNutrientKey, amount: r.doseHigh, unit: r.doseUnit as string }]
          : []
        const res = await fetch('/api/supplements', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: r.doseHigh ? `${r.name} (${r.doseHigh}${r.doseUnit ? ' ' + r.doseUnit : ''})` : r.name,
            serving_size: 1, serving_unit: 'serving', source: 'manual', nutrients,
          }),
        })
        const j = await res.json()
        if (res.ok && j.id) ids.push(j.id)
      }
      if (ids.length > 0) {
        await fetch('/api/supplements/stacks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'My Stack', items: ids.map(id => ({ supplement_id: id })) }),
        })
      }
      onComplete()
    } catch { setError('Could not create stack'); setBusy(false) }
  }

  // Step flow indices: 0 intro, 1 goals, 2 diet, 3 lifestyle, 4 safety, 99 results
  const steps = [1, 2, 3, 4]
  const totalSteps = steps.length

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg)', zIndex: 300, overflowY: 'auto' }}>
    <div style={{
      maxWidth: '390px', margin: '0 auto',
      padding: 'max(24px, env(safe-area-inset-top)) 20px max(40px, calc(40px + env(safe-area-inset-bottom)))',
    }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <span style={heading}>ASSESSMENT</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', padding: '4px' }}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </div>

      {/* progress */}
      {step >= 1 && step <= 4 && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '22px' }}>
          {steps.map(s => (
            <div key={s} style={{ flex: 1, height: '3px', background: s <= step ? 'var(--color-accent)' : 'var(--color-border)' }} />
          ))}
        </div>
      )}

      {error && <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '13px', color: 'var(--color-danger)', marginBottom: '14px' }}>{error}</div>}

      {/* ── 0 INTRO ── */}
      {step === 0 && (
        <div>
          <div style={q}>FIND WHAT’S WORTH TAKING — BACKED BY EVIDENCE.</div>
          <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '14px', color: 'var(--color-text)', lineHeight: 1.6, marginBottom: '16px' }}>
            A few questions about your goals, diet and health build a personalized, research-graded supplement shortlist — with safety checks against your medications and conditions, and doses kept under safe upper limits.
          </p>
          <div style={{ border: '1px solid var(--color-border)', borderLeft: '3px solid var(--color-warning)', padding: '12px 14px', marginBottom: '20px' }}>
            <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)', lineHeight: 1.5, margin: 0 }}>
              This is educational decision-support, <strong>not medical advice</strong>. Talk to a healthcare professional before starting any supplement — especially if you’re pregnant, nursing, or on medication.
            </p>
          </div>
          <button style={primary} onClick={() => setStep(1)}>START</button>
        </div>
      )}

      {/* ── 1 GOALS ── */}
      {step === 1 && (
        <div>
          <span style={stepLabel}>STEP 1 / {totalSteps}</span>
          <div style={q}>WHAT DO YOU WANT TO IMPROVE?</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {GOALS.map(([v, l]) => (
              <button key={v} style={chip(goals.has(v))} onClick={() => toggle(goals, setGoals, v)}>{l}</button>
            ))}
          </div>
          <button style={{ ...primary, marginTop: '22px' }} onClick={() => setStep(2)}>NEXT</button>
        </div>
      )}

      {/* ── 2 DIET ── */}
      {step === 2 && (
        <div>
          <span style={stepLabel}>STEP 2 / {totalSteps}</span>
          <div style={q}>HOW DO YOU EAT?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(['omnivore', 'pescatarian', 'vegetarian', 'vegan'] as const).map(d => (
              <button key={d} style={chip(diet === d)} onClick={() => setDiet(d)}>{d}</button>
            ))}
          </div>
          <button style={{ ...primary, marginTop: '22px' }} onClick={() => setStep(3)}>NEXT</button>
          <button style={{ ...ghost, marginTop: '8px' }} onClick={() => setStep(1)}>← BACK</button>
        </div>
      )}

      {/* ── 3 LIFESTYLE ── */}
      {step === 3 && (
        <div>
          <span style={stepLabel}>STEP 3 / {totalSteps}</span>
          <div style={q}>SUN & TRAINING</div>
          <span style={{ ...stepLabel, marginTop: '4px' }}>DAILY SUN EXPOSURE</span>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
            {(['low', 'moderate', 'high'] as const).map(s => (
              <button key={s} style={{ ...chip(sun === s), flex: 1, textAlign: 'center' }} onClick={() => setSun(s)}>{s}</button>
            ))}
          </div>
          <span style={stepLabel}>TRAINING</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['none', 'light', 'regular', 'intense'] as const).map(t => (
              <button key={t} style={{ ...chip(training === t), flex: 1, textAlign: 'center', padding: '11px 4px', fontSize: '11px' }} onClick={() => setTraining(t)}>{t}</button>
            ))}
          </div>
          <button style={{ ...primary, marginTop: '22px' }} onClick={() => setStep(4)}>NEXT</button>
          <button style={{ ...ghost, marginTop: '8px' }} onClick={() => setStep(2)}>← BACK</button>
        </div>
      )}

      {/* ── 4 SAFETY ── */}
      {step === 4 && (
        <div>
          <span style={stepLabel}>STEP 4 / {totalSteps} · SAFETY</span>
          <div style={q}>ANYTHING WE SHOULD SCREEN FOR?</div>
          <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)', marginBottom: '14px', lineHeight: 1.5 }}>
            We use this only to flag interactions and exclude unsafe suggestions.
          </p>

          <span style={stepLabel}>MEDICATIONS</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            <button style={chip(meds.has('warfarin'))} onClick={() => toggle(meds, setMeds, 'warfarin')}>Blood thinner / anticoagulant</button>
            <button style={chip(meds.has('thyroid_med'))} onClick={() => toggle(meds, setMeds, 'thyroid_med')}>Thyroid medication</button>
          </div>

          <span style={stepLabel}>CONDITIONS</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: sex === 'female' ? '16px' : '0' }}>
            <button style={chip(conditions.has('kidney_disease'))} onClick={() => toggle(conditions, setConditions, 'kidney_disease')}>Kidney disease</button>
            <button style={chip(conditions.has('autoimmune'))} onClick={() => toggle(conditions, setConditions, 'autoimmune')}>Autoimmune condition</button>
            <button style={chip(conditions.has('hemochromatosis'))} onClick={() => toggle(conditions, setConditions, 'hemochromatosis')}>Iron overload (hemochromatosis)</button>
          </div>

          {sex === 'female' && (
            <>
              <span style={stepLabel}>LIFE STAGE</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button style={chip(pregnant)} onClick={() => setPregnant(p => !p)}>Pregnant</button>
                <button style={chip(lactating)} onClick={() => setLactating(p => !p)}>Breastfeeding</button>
              </div>
            </>
          )}

          <button style={{ ...primary, marginTop: '24px' }} onClick={submit} disabled={busy}>{busy ? 'ANALYZING…' : 'SEE MY RESULTS'}</button>
          <button style={{ ...ghost, marginTop: '8px' }} onClick={() => setStep(3)}>← BACK</button>
        </div>
      )}

      {/* ── 99 RESULTS ── */}
      {step === 99 && (
        <div>
          <div style={q}>YOUR SUPPLEMENT SHORTLIST</div>

          {priorities.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <span style={stepLabel}>BASED ON</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {priorities.map((p, i) => (
                  <span key={i} style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent)', border: '1px solid var(--color-border)', padding: '4px 8px' }}>{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* safety flags */}
          {flags.map((f, i) => (
            <div key={i} style={{ border: '1px solid var(--color-warning)', borderLeft: '3px solid var(--color-warning)', padding: '10px 12px', marginBottom: '8px', background: 'var(--color-surface)' }}>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-warning)' }}>⚠ {f.name}</span>
              <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text)', marginTop: '2px' }}>{f.reason}</div>
            </div>
          ))}

          {recs.length === 0 && (
            <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '14px', color: 'var(--color-text-dim)', lineHeight: 1.6 }}>
              No strong matches for what you entered — a balanced diet may already cover your needs. You can still add supplements manually anytime.
            </p>
          )}

          {/* recommendations */}
          {recs.map(r => {
            const on = picked.has(r.key)
            const open = expanded.has(r.key)
            return (
              <div key={r.key} style={{ border: '1px solid var(--color-border)', marginBottom: '8px' }}>
                <div style={{ display: 'flex', gap: '10px', padding: '12px', cursor: 'pointer' }} onClick={() => toggle(picked, setPicked, r.key)}>
                  <div style={{ width: '22px', height: '22px', flexShrink: 0, border: `1.5px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`, background: on ? 'var(--color-accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {on && <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7L6 11L12 3" stroke="#fff" strokeWidth="2" /></svg>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>{r.name}</span>
                      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: GRADE_COLOR[r.grade], whiteSpace: 'nowrap' }}>{r.grade}</span>
                    </div>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '17px', color: 'var(--color-accent)', letterSpacing: '0.03em', marginTop: '1px' }}>
                      {r.doseLow != null && r.doseHigh != null ? (r.doseLow === r.doseHigh ? `${r.doseHigh}` : `${r.doseLow}–${r.doseHigh}`) : '—'} {r.doseUnit ?? ''}
                      {r.doseCappedByUl && <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '9px', color: 'var(--color-text-dim)', marginLeft: '6px', letterSpacing: '0.1em' }}>UL-CAPPED</span>}
                    </div>
                    <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)', marginTop: '2px' }}>{r.reason}</div>
                    <button onClick={e => { e.stopPropagation(); toggle(expanded, setExpanded, r.key) }} style={{ background: 'none', border: 'none', padding: '4px 0 0', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-dim)' }}>
                      {open ? '− WHY' : '+ WHY / EVIDENCE'}
                    </button>
                    {open && (
                      <div style={{ marginTop: '6px', borderTop: '1px solid var(--color-border-soft)', paddingTop: '6px' }}>
                        {r.summary && <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text)', lineHeight: 1.5, margin: '0 0 4px' }}>{r.summary}</p>}
                        {r.citation && <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '10px', color: 'var(--color-text-muted)', lineHeight: 1.4, margin: 0 }}>{r.citation}</p>}
                        {r.caution && <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '11px', color: 'var(--color-warning)', lineHeight: 1.4, margin: '4px 0 0' }}>⚠ {r.caution}</p>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {recs.length > 0 && (
            <button style={{ ...primary, marginTop: '14px' }} onClick={acceptStack} disabled={busy || picked.size === 0}>
              {busy ? 'CREATING…' : `ADD ${picked.size} AS A STACK`}
            </button>
          )}
          <button style={{ ...ghost, marginTop: '8px' }} onClick={() => setStep(1)}>RETAKE</button>
          <button style={{ ...ghost, marginTop: '8px' }} onClick={onClose}>DONE</button>

          <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '10px', color: 'var(--color-text-muted)', lineHeight: 1.5, marginTop: '18px' }}>
            Educational only — not medical advice. Doses are general adult ranges kept under tolerable upper limits; confirm with a healthcare professional.
          </p>
        </div>
      )}
    </div>
    </div>
  )
}
