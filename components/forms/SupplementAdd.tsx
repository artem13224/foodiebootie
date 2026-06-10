'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { NUTRIENT_CATALOG } from '@/lib/science/nutrients'

const BarcodeScanner = dynamic(() => import('@/components/ui/BarcodeScanner'), { ssr: false })

// ── DSLD parse shapes (mirror lib/dsld.ts) ──
interface ParsedNutrient {
  key: string
  displayName: string
  amountLabel: number
  unitLabel: string
  canonicalAmount: number
  canonicalUnit: string
}
interface ParsedSupplement {
  name: string
  brand: string | null
  upc: string | null
  servingSize: number
  servingUnit: string
  nutrients: ParsedNutrient[]
  unmatched: { name: string; amount: number | null; unit: string | null }[]
}
interface SearchHit { dsldId: string; name: string; brand: string | null }

interface ManualRow { key: string; amount: string; unit: string }

interface Props {
  onClose: () => void
  onAdded: () => void
  defaultBarcode?: string
}

// ── shared token styles ──
const label: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px',
  letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--color-text-dim)',
  marginBottom: '6px', display: 'block',
}
const input: React.CSSProperties = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)',
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: '16px',
  padding: '11px 13px', outline: 'none', width: '100%', boxSizing: 'border-box', borderRadius: 0,
}
const primaryBtn: React.CSSProperties = {
  width: '100%', background: 'var(--color-accent)', border: 'none', color: '#fff',
  fontFamily: "'Bebas Neue', sans-serif", fontSize: '20px', letterSpacing: '0.08em',
  padding: '14px', cursor: 'pointer', borderRadius: 0,
}
const ghostBtn: React.CSSProperties = {
  background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)',
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '13px',
  letterSpacing: '0.1em', textTransform: 'uppercase', padding: '12px', cursor: 'pointer', borderRadius: 0,
}
const heading: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '22px',
  letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-text)',
}

// IU is offered for the fat-soluble vitamins that labels commonly print in IU.
function unitOptions(key: string): string[] {
  const def = NUTRIENT_CATALOG.find(n => n.key === key)
  const base = def ? [def.canonicalUnit] : ['mg']
  if (['vitamin_a', 'vitamin_d', 'vitamin_e'].includes(key)) return [...base, 'IU']
  // allow mcg/mg/g flexibility for mass nutrients
  const masses = ['mcg', 'mg', 'g']
  return Array.from(new Set([...base, ...masses]))
}

export default function SupplementAdd({ onClose, onAdded, defaultBarcode }: Props) {
  const [mode, setMode] = useState<'menu' | 'search' | 'scan' | 'manual' | 'confirm'>('menu')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // search
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searched, setSearched] = useState(false)

  // confirm (DSLD parsed)
  const [parsed, setParsed] = useState<ParsedSupplement | null>(null)

  // manual
  const [mName, setMName] = useState('')
  const [mBrand, setMBrand] = useState('')
  const [mForm, setMForm] = useState('')
  const [mServSize, setMServSize] = useState('1')
  const [mServUnit, setMServUnit] = useState('serving')
  const [mShare, setMShare] = useState(false)
  const [rows, setRows] = useState<ManualRow[]>([{ key: 'vitamin_d', amount: '', unit: 'mcg' }])

  // ── DSLD search ──
  async function runSearch() {
    if (query.trim().length < 2) return
    setBusy(true); setError(''); setSearched(false)
    try {
      const res = await fetch(`/api/supplements/dsld/search?q=${encodeURIComponent(query.trim())}`)
      const json = await res.json()
      setHits(json.results ?? [])
      setSearched(true)
    } catch { setError('Search failed. Try manual entry.') }
    setBusy(false)
  }

  async function pickLabel(dsldId: string) {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/supplements/dsld/label/${dsldId}`)
      const json = await res.json()
      if (!res.ok || !json.supplement) { setError('Could not load label. Try manual entry.'); setBusy(false); return }
      setParsed(json.supplement)
      setMode('confirm')
    } catch { setError('Could not load label.') }
    setBusy(false)
  }

  // ── barcode ──
  async function onBarcode(code: string) {
    setMode('menu'); setBusy(true); setError('')
    try {
      const res = await fetch(`/api/supplements/dsld/barcode?code=${encodeURIComponent(code)}`)
      const json = await res.json()
      if (json.found && json.supplement) {
        setParsed(json.supplement)
        setMode('confirm')
      } else {
        // Not in DSLD (common for CA products) → manual entry, barcode kept.
        setMName(''); setMBrand('')
        setError('Not found in the label database — add it manually.')
        setMode('manual')
        ;(window as any).__suppBarcode = code
      }
    } catch {
      setError('Lookup failed — add it manually.')
      setMode('manual')
    }
    setBusy(false)
  }

  // ── save DSLD-parsed ──
  async function saveParsed() {
    if (!parsed) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/supplements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: parsed.name, brand: parsed.brand, serving_size: parsed.servingSize,
          serving_unit: parsed.servingUnit, barcode: parsed.upc, source: 'dsld',
          nutrients: parsed.nutrients.map(n => ({ key: n.key, amount: n.canonicalAmount, unit: n.canonicalUnit })),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Save failed'); setBusy(false); return }
      onAdded()
    } catch { setError('Save failed'); setBusy(false) }
  }

  // ── save manual ──
  async function saveManual() {
    setError('')
    if (!mName.trim()) { setError('Enter a name.'); return }
    const nutrients = rows
      .filter(r => r.key && r.amount.trim() !== '' && !isNaN(parseFloat(r.amount)))
      .map(r => ({ key: r.key, amount: parseFloat(r.amount), unit: r.unit }))
    setBusy(true)
    try {
      const barcode = (window as any).__suppBarcode || defaultBarcode || null
      const res = await fetch('/api/supplements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: mName, brand: mBrand || null, form: mForm || null,
          serving_size: parseFloat(mServSize) || 1, serving_unit: mServUnit || 'serving',
          barcode, source: 'manual', is_shared: mShare, nutrients,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Save failed'); setBusy(false); return }
      ;(window as any).__suppBarcode = undefined
      onAdded()
    } catch { setError('Save failed'); setBusy(false) }
  }

  function updateRow(i: number, patch: Partial<ManualRow>) {
    setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r))
  }

  // ── scan view ──
  if (mode === 'scan') {
    return <BarcodeScanner onDetect={onBarcode} onClose={() => setMode('menu')} />
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg)', zIndex: 300, overflowY: 'auto' }}>
    <div style={{
      maxWidth: '390px', margin: '0 auto',
      padding: 'max(24px, env(safe-area-inset-top)) 20px max(40px, calc(40px + env(safe-area-inset-bottom)))',
    }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <span style={heading}>ADD SUPPLEMENT</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', padding: '4px' }}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </div>

      {error && (
        <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '13px', color: 'var(--color-accent)', marginBottom: '16px', lineHeight: 1.4 }}>
          {error}
        </div>
      )}

      {/* ── MENU ── */}
      {mode === 'menu' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button style={ghostBtn} onClick={() => setMode('scan')} disabled={busy}>SCAN BARCODE</button>
          <button style={ghostBtn} onClick={() => setMode('search')} disabled={busy}>SEARCH DATABASE</button>
          <button style={{ ...primaryBtn, marginTop: '6px' }} onClick={() => { (window as any).__suppBarcode = undefined; setMode('manual') }} disabled={busy}>ENTER MANUALLY</button>
          {busy && <span style={{ ...label, marginTop: '12px' }}>WORKING…</span>}
        </div>
      )}

      {/* ── SEARCH ── */}
      {mode === 'search' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input style={input} placeholder="e.g. Centrum, Vitamin D"
              value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()} autoFocus />
            <button style={{ ...ghostBtn, width: 'auto', padding: '0 16px' }} onClick={runSearch} disabled={busy}>GO</button>
          </div>
          {busy && <span style={label}>SEARCHING…</span>}
          {searched && hits.length === 0 && !busy && (
            <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '13px', color: 'var(--color-text-dim)' }}>
              No matches. <button onClick={() => setMode('manual')} style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: '13px', padding: 0 }}>Add manually →</button>
            </div>
          )}
          {hits.map(h => (
            <button key={h.dsldId} onClick={() => pickLabel(h.dsldId)} disabled={busy}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'var(--color-bg)', border: '1px solid var(--color-border)', padding: '12px 14px', marginBottom: '6px', cursor: 'pointer' }}>
              <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '13px', color: 'var(--color-text)', fontWeight: 600 }}>{h.name}</div>
              {h.brand && <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '11px', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px' }}>{h.brand}</div>}
            </button>
          ))}
          <button style={{ ...ghostBtn, marginTop: '12px' }} onClick={() => setMode('menu')}>← BACK</button>
        </div>
      )}

      {/* ── CONFIRM DSLD ── */}
      {mode === 'confirm' && parsed && (
        <div>
          <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '15px', color: 'var(--color-text)', fontWeight: 600 }}>{parsed.name}</div>
          {parsed.brand && <div style={{ ...label, marginTop: '2px' }}>{parsed.brand}</div>}
          <div style={{ ...label, marginTop: '10px' }}>PER {parsed.servingSize} {parsed.servingUnit}</div>

          <div style={{ marginTop: '12px', border: '1px solid var(--color-border)' }}>
            {parsed.nutrients.map((n, i) => (
              <div key={n.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', borderTop: i ? '1px solid var(--color-border-soft)' : 'none' }}>
                <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: '13px', color: 'var(--color-text)' }}>{n.displayName}</span>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '16px', color: 'var(--color-accent)' }}>{n.canonicalAmount} {n.canonicalUnit}</span>
              </div>
            ))}
            {parsed.nutrients.length === 0 && (
              <div style={{ padding: '12px', fontFamily: "'Barlow', sans-serif", fontSize: '13px', color: 'var(--color-text-dim)' }}>
                No tracked micronutrients matched — you can still add it, or enter manually.
              </div>
            )}
          </div>

          {parsed.unmatched.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <span style={label}>NOT TRACKED ({parsed.unmatched.length})</span>
              <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                {parsed.unmatched.map(u => u.name).join(', ')}
              </div>
            </div>
          )}

          <button style={{ ...primaryBtn, marginTop: '20px' }} onClick={saveParsed} disabled={busy}>
            {busy ? 'SAVING…' : 'ADD TO MY SUPPLEMENTS'}
          </button>
          <button style={{ ...ghostBtn, marginTop: '8px' }} onClick={() => setMode('search')}>← BACK</button>
        </div>
      )}

      {/* ── MANUAL ── */}
      {mode === 'manual' && (
        <div>
          <div style={{ marginBottom: '14px' }}>
            <span style={label}>NAME</span>
            <input style={input} value={mName} onChange={e => setMName(e.target.value)} placeholder="e.g. Vitamin D3 2000 IU" autoFocus />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
            <div style={{ flex: 1 }}>
              <span style={label}>BRAND</span>
              <input style={input} value={mBrand} onChange={e => setMBrand(e.target.value)} placeholder="optional" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={label}>FORM</span>
              <input style={input} value={mForm} onChange={e => setMForm(e.target.value)} placeholder="capsule" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
            <div style={{ width: '90px' }}>
              <span style={label}>SERVING</span>
              <input style={input} inputMode="decimal" value={mServSize} onChange={e => setMServSize(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={label}>UNIT</span>
              <input style={input} value={mServUnit} onChange={e => setMServUnit(e.target.value)} placeholder="capsule(s)" />
            </div>
          </div>

          <span style={label}>NUTRIENTS PER SERVING</span>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
              <select value={r.key} onChange={e => updateRow(i, { key: e.target.value, unit: unitOptions(e.target.value)[0] })}
                style={{ ...input, flex: 1.4, padding: '10px' }}>
                {NUTRIENT_CATALOG.map(n => <option key={n.key} value={n.key}>{n.display}</option>)}
              </select>
              <input style={{ ...input, width: '70px', padding: '10px' }} inputMode="decimal" placeholder="amt"
                value={r.amount} onChange={e => updateRow(i, { amount: e.target.value })} />
              <select value={r.unit} onChange={e => updateRow(i, { unit: e.target.value })} style={{ ...input, width: '64px', padding: '10px' }}>
                {unitOptions(r.key).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <button onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}
                style={{ background: 'none', border: '1px solid var(--color-border)', color: 'var(--color-text-dim)', cursor: 'pointer', padding: '8px 10px' }}>×</button>
            </div>
          ))}
          <button style={{ ...ghostBtn, marginTop: '4px' }} onClick={() => setRows(rs => [...rs, { key: 'vitamin_c', amount: '', unit: 'mg' }])}>+ ADD NUTRIENT</button>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '18px', cursor: 'pointer' }}>
            <input type="checkbox" checked={mShare} onChange={e => setMShare(e.target.checked)} style={{ accentColor: 'var(--color-accent)', width: '16px', height: '16px' }} />
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-dim)' }}>SHARE WITH EVERYONE</span>
          </label>

          <button style={{ ...primaryBtn, marginTop: '18px' }} onClick={saveManual} disabled={busy}>{busy ? 'SAVING…' : 'SAVE SUPPLEMENT'}</button>
          <button style={{ ...ghostBtn, marginTop: '8px' }} onClick={() => setMode('menu')}>← BACK</button>
        </div>
      )}
    </div>
    </div>
  )
}
