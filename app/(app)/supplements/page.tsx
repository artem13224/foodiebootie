'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import SupplementAdd from '@/components/forms/SupplementAdd'
import HealthAssessment from '@/components/forms/HealthAssessment'

// ── Types (mirror API responses) ──
interface SupplementNutrient { amount: number; unit: string; nutrients: { key: string; display_name: string } | null }
interface Supplement {
  id: string; name: string; brand: string | null; serving_size: number; serving_unit: string
  form: string | null; is_shared: boolean; user_id: string | null
  supplement_nutrients: SupplementNutrient[]
}
interface Stack { id: string; name: string; supplement_stack_items: { supplement_id: string; servings: number }[] }
interface IntakeNutrient {
  key: string; display: string; category: string; canonicalUnit: string
  total: number; target: number | null; targetType: 'rda' | 'ai' | null; pctOfTarget: number | null
  hasUl: boolean; ul: number | null; ulPct: number | null; ulStatus: 'ok' | 'approaching' | 'exceeded' | null
  contributors: string[]
}
interface Intake { demographic: { age: number; sexActual: string }; nutrients: IntakeNutrient[]; warnings: IntakeNutrient[] }

const SKIP_KEY = 'supp_onboarding_skipped'

// ── token styles ──
const sectionLabel: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '13px',
  letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--color-text-dim)',
}
const microLabel: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px',
  letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-text-dim)',
}

function computeStreak(dates: string[]): number {
  const set = new Set(dates)
  const d = new Date()
  const iso = (x: Date) => x.toISOString().split('T')[0]
  if (!set.has(iso(d))) d.setDate(d.getDate() - 1) // today not logged yet → count from yesterday
  let streak = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (set.has(iso(d))) { streak++; d.setDate(d.getDate() - 1) } else break
  }
  return streak
}

export default function SupplementsPage() {
  const [loading, setLoading] = useState(true)
  const [supplements, setSupplements] = useState<Supplement[]>([])
  const [stacks, setStacks] = useState<Stack[]>([])
  const [todayIds, setTodayIds] = useState<string[]>([])
  const [loggedDates, setLoggedDates] = useState<string[]>([])
  const [intake, setIntake] = useState<Intake | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showAssessment, setShowAssessment] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [sRes, stRes, lRes, iRes] = await Promise.all([
      fetch('/api/supplements'),
      fetch('/api/supplements/stacks'),
      fetch('/api/supplements/log'),
      fetch('/api/supplements/intake'),
    ])
    const s = await sRes.json().catch(() => ({}))
    const st = await stRes.json().catch(() => ({}))
    const l = await lRes.json().catch(() => ({}))
    const i = await iRes.json().catch(() => ({}))
    setSupplements(s.supplements ?? [])
    setStacks(st.stacks ?? [])
    setTodayIds(l.todayIds ?? [])
    setLoggedDates(l.loggedDates ?? [])
    setIntake(i.nutrients ? i : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    setSkipped(localStorage.getItem(SKIP_KEY) === '1')
    load()
  }, [load])

  async function toggleTake(suppId: string) {
    setBusyId(suppId)
    const logged = todayIds.includes(suppId)
    // optimistic
    setTodayIds(ids => logged ? ids.filter(x => x !== suppId) : [...ids, suppId])
    try {
      if (logged) {
        await fetch(`/api/supplements/log?supplement_id=${suppId}`, { method: 'DELETE' })
      } else {
        await fetch('/api/supplements/log', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ supplement_id: suppId }),
        })
      }
      await load()
    } finally { setBusyId(null) }
  }

  async function logStack(stackId: string) {
    setBusyId(stackId)
    try {
      await fetch('/api/supplements/log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stack_id: stackId }),
      })
      await load()
    } finally { setBusyId(null) }
  }

  const isFirstTime = !loading && supplements.length === 0 && stacks.length === 0 && loggedDates.length === 0 && !skipped
  const streak = computeStreak(loggedDates)
  const warnings = intake?.warnings ?? []

  // ── Loading ──
  if (loading) {
    return (
      <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={microLabel}>LOADING…</span>
      </div>
    )
  }

  // ── First-time onboarding ──
  if (isFirstTime) {
    return (
      <>
        <div className="screen" style={{ paddingTop: 'var(--space-6)' }}>
          <span style={{ ...sectionLabel, fontSize: '24px', color: 'var(--color-text)' }}>SUPPLEMENTS</span>
          <div style={{ height: '2px', background: 'var(--color-accent)', width: '48px', margin: '14px 0 24px' }} />

          <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '14px', color: 'var(--color-text)', lineHeight: 1.6, marginBottom: '16px' }}>
            Track what you take each day and see how it stacks up against your personal nutrient targets — with clear warnings when an intake gets close to a safe upper limit.
          </p>

          {/* Confirm demographic */}
          <div style={{ border: '1px solid var(--color-border)', padding: '14px', marginBottom: '20px' }}>
            <span style={microLabel}>TARGETS ARE PERSONALIZED FOR</span>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '28px', color: 'var(--color-accent)', marginTop: '4px', letterSpacing: '0.04em' }}>
              {intake?.demographic.age ?? '—'} YRS · {(intake?.demographic.sexActual ?? '').toUpperCase() || '—'}
            </div>
            <Link href="/profile/edit" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-dim)', textDecoration: 'none' }}>
              NOT RIGHT? EDIT PROFILE ›
            </Link>
          </div>

          <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '13px', color: 'var(--color-text-dim)', lineHeight: 1.6, marginBottom: '20px' }}>
            Take a 2-minute assessment and get a research-graded shortlist tailored to your goals, diet and health — or add supplements yourself by scanning, searching the NIH database, or by hand.
          </p>

          <button onClick={() => setShowAssessment(true)} style={{
            width: '100%', background: 'var(--color-accent)', border: 'none', color: '#fff',
            fontFamily: "'Bebas Neue', sans-serif", fontSize: '22px', letterSpacing: '0.08em', padding: '15px', cursor: 'pointer',
          }}>
            GET MY RECOMMENDATIONS
          </button>
          <button onClick={() => setShowAdd(true)} style={{
            width: '100%', marginTop: '8px', background: 'var(--color-bg)', border: '1px solid var(--color-border)',
            color: 'var(--color-text)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '13px',
            letterSpacing: '0.12em', textTransform: 'uppercase', padding: '12px', cursor: 'pointer',
          }}>
            ADD A SUPPLEMENT MYSELF
          </button>
          <button onClick={() => { localStorage.setItem(SKIP_KEY, '1'); setSkipped(true) }} style={{
            width: '100%', marginTop: '8px', background: 'var(--color-bg)', border: '1px solid var(--color-border)',
            color: 'var(--color-text-dim)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '12px',
            letterSpacing: '0.15em', textTransform: 'uppercase', padding: '12px', cursor: 'pointer',
          }}>
            SKIP FOR NOW
          </button>
        </div>
        {showAdd && <SupplementAdd onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load() }} />}
        {showAssessment && <HealthAssessment onClose={() => setShowAssessment(false)} onComplete={() => { setShowAssessment(false); setSkipped(false); load() }} />}
      </>
    )
  }

  // ── Main tab ──
  return (
    <>
      <div className="screen" style={{ paddingTop: 'var(--space-6)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '4px' }}>
          <span style={{ ...sectionLabel, fontSize: '24px', color: 'var(--color-text)' }}>SUPPLEMENTS</span>
          <button onClick={() => setShowAdd(true)} style={{
            background: 'var(--color-accent)', border: 'none', color: '#fff', width: '30px', height: '30px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 22 22" fill="none"><path d="M11 5V17M5 11H17" stroke="currentColor" strokeWidth="2" /></svg>
          </button>
        </div>
        <div style={{ height: '2px', background: 'var(--color-accent)', width: '48px', margin: '12px 0 20px' }} />

        {/* Streak */}
        <div style={{ display: 'flex', gap: '1px', background: 'var(--color-border)', marginBottom: '24px' }}>
          <div style={{ flex: 1, background: 'var(--color-bg)', padding: '12px 14px' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '32px', color: 'var(--color-accent)', lineHeight: 1 }}>{streak}</div>
            <div style={microLabel}>DAY STREAK</div>
          </div>
          <div style={{ flex: 1, background: 'var(--color-bg)', padding: '12px 14px' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '32px', color: 'var(--color-text)', lineHeight: 1 }}>{todayIds.length}</div>
            <div style={microLabel}>TAKEN TODAY</div>
          </div>
        </div>

        {/* Health assessment entry */}
        <button onClick={() => setShowAssessment(true)} style={{
          display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderLeft: '3px solid var(--color-accent)',
          padding: '12px 14px', marginBottom: '24px', cursor: 'pointer', textAlign: 'left',
        }}>
          <span>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '14px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-text)' }}>HEALTH ASSESSMENT</span>
            <span style={{ display: 'block', fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text-dim)', marginTop: '1px' }}>Get a research-graded shortlist for your goals</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--color-accent)', flexShrink: 0 }}><path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>

        {/* ── UL SAFETY WARNINGS (the defining feature) ── */}
        {warnings.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            {warnings.map(w => {
              const exceeded = w.ulStatus === 'exceeded'
              return (
                <div key={w.key} style={{
                  border: `1px solid ${exceeded ? 'var(--color-danger)' : 'var(--color-warning)'}`,
                  borderLeft: `3px solid ${exceeded ? 'var(--color-danger)' : 'var(--color-warning)'}`,
                  padding: '12px 14px', marginBottom: '8px', background: 'var(--color-surface)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '14px', letterSpacing: '0.1em', textTransform: 'uppercase', color: exceeded ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                      {exceeded ? '⚠ OVER UPPER LIMIT' : 'NEAR UPPER LIMIT'} · {w.display}
                    </span>
                  </div>
                  <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-text)', marginTop: '4px', lineHeight: 1.5 }}>
                    {w.total} {w.canonicalUnit} from supplements — that’s {w.ulPct}% of the {w.ul} {w.canonicalUnit} tolerable upper limit (UL).
                  </div>
                  {w.contributors.length > 0 && (
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginTop: '4px' }}>
                      FROM: {w.contributors.join(', ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── LAYER A: Today's supplements ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={sectionLabel}>TODAY</span>
        </div>

        {/* Stacks (one-tap log) */}
        {stacks.map(st => (
          <div key={st.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--color-border)', padding: '10px 14px', marginBottom: '8px' }}>
            <div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '14px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text)' }}>{st.name}</div>
              <div style={microLabel}>{st.supplement_stack_items.length} ITEMS</div>
            </div>
            <button onClick={() => logStack(st.id)} disabled={busyId === st.id} style={{
              background: 'var(--color-accent)', border: 'none', color: '#fff', cursor: 'pointer',
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '11px', letterSpacing: '0.12em',
              textTransform: 'uppercase', padding: '8px 14px',
            }}>LOG STACK</button>
          </div>
        ))}

        {supplements.length === 0 && (
          <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '13px', color: 'var(--color-text-dim)', padding: '12px 0' }}>
            No supplements yet. Tap + to add one.
          </p>
        )}

        {supplements.map(s => {
          const taken = todayIds.includes(s.id)
          return (
            <button key={s.id} onClick={() => toggleTake(s.id)} disabled={busyId === s.id}
              style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '12px', textAlign: 'left',
                background: 'var(--color-bg)', border: 'none', borderTop: '1px solid var(--color-border-soft)',
                padding: '14px 2px', cursor: 'pointer' }}>
              {/* Check box */}
              <div style={{
                width: '24px', height: '24px', flexShrink: 0, border: `1.5px solid ${taken ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: taken ? 'var(--color-accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {taken && <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L6 11L12 3" stroke="#fff" strokeWidth="2" /></svg>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '14px', fontWeight: 600, color: taken ? 'var(--color-text)' : 'var(--color-text)' }}>{s.name}</div>
                <div style={microLabel}>
                  {(s.brand ? s.brand + ' · ' : '')}{s.serving_size} {s.serving_unit}{s.is_shared ? ' · SHARED' : ''}
                </div>
              </div>
            </button>
          )
        })}

        {/* ── LAYER B: Nutrient intake + safety ── */}
        {intake && intake.nutrients.length > 0 && (
          <div style={{ marginTop: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
              <span style={sectionLabel}>NUTRIENTS</span>
              <span style={microLabel}>FROM SUPPLEMENTS</span>
            </div>
            <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '11px', color: 'var(--color-text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
              % of your personal daily target ({intake.demographic.age} yrs · {intake.demographic.sexActual}). Does not include nutrients from food.
            </p>

            {intake.nutrients.map(n => <NutrientBar key={n.key} n={n} />)}
          </div>
        )}
      </div>

      {showAdd && <SupplementAdd onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load() }} />}
      {showAssessment && <HealthAssessment onClose={() => setShowAssessment(false)} onComplete={() => { setShowAssessment(false); load() }} />}
    </>
  )
}

// ── Flat nutrient % bar with UL coloring ──
function NutrientBar({ n }: { n: IntakeNutrient }) {
  const pct = n.pctOfTarget ?? 0
  const exceeded = n.ulStatus === 'exceeded'
  const approaching = n.ulStatus === 'approaching'
  const fillColor = exceeded ? 'var(--color-danger)' : approaching ? 'var(--color-warning)' : 'var(--color-accent)'
  const barPct = Math.min(pct, 100)

  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text)' }}>
          {n.display}
        </span>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: '11px', color: 'var(--color-text-dim)' }}>
          {n.total} / {n.target ?? '—'} {n.canonicalUnit}{n.targetType === 'ai' ? ' (AI)' : ''}
        </span>
      </div>
      <div style={{ position: 'relative', height: '6px', background: 'var(--color-border)' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barPct}%`, background: fillColor }} />
        {/* UL marker tick (where the upper limit sits relative to target) */}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px', letterSpacing: '0.08em', color: fillColor }}>
          {n.pctOfTarget != null ? `${n.pctOfTarget}% TARGET` : '—'}
        </span>
        {n.hasUl && n.ulPct != null && (
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px', letterSpacing: '0.08em', color: n.ulStatus === 'ok' ? 'var(--color-text-muted)' : fillColor }}>
            {n.ulPct}% OF UL
          </span>
        )}
      </div>
    </div>
  )
}
