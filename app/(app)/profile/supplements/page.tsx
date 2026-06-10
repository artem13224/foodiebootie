'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import SupplementAdd from '@/components/forms/SupplementAdd'

interface Supplement {
  id: string; name: string; brand: string | null; serving_size: number; serving_unit: string
  form: string | null; is_shared: boolean; user_id: string | null
  supplement_nutrients: { amount: number }[]
}
interface StackItem { supplement_id: string; servings: number; supplements?: { name: string; brand: string | null } }
interface Stack { id: string; name: string; supplement_stack_items: StackItem[] }

const label: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px',
  letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: '6px', display: 'block',
}
const sectionLabel: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '13px',
  letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--color-text-dim)',
}
const input: React.CSSProperties = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)',
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: '15px',
  padding: '9px 11px', outline: 'none', width: '100%', boxSizing: 'border-box', borderRadius: 0,
}
const ghost: React.CSSProperties = {
  background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)',
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '12px',
  letterSpacing: '0.1em', textTransform: 'uppercase', padding: '9px 12px', cursor: 'pointer', borderRadius: 0,
}
const accent: React.CSSProperties = { ...ghost, background: 'var(--color-accent)', border: 'none', color: '#fff' }

export default function ManageSupplementsPage() {
  const [loading, setLoading] = useState(true)
  const [uid, setUid] = useState<string | null>(null)
  const [supplements, setSupplements] = useState<Supplement[]>([])
  const [stacks, setStacks] = useState<Stack[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<{ name: string; brand: string; serving_size: string; serving_unit: string; is_shared: boolean }>({ name: '', brand: '', serving_size: '1', serving_unit: 'serving', is_shared: false })
  const [err, setErr] = useState('')

  // stack builder
  const [buildingStack, setBuildingStack] = useState(false)
  const [stackName, setStackName] = useState('')
  const [stackPick, setStackPick] = useState<Set<string>>(new Set())
  const [editStackId, setEditStackId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [sRes, stRes] = await Promise.all([fetch('/api/supplements'), fetch('/api/supplements/stacks')])
    const s = await sRes.json().catch(() => ({}))
    const st = await stRes.json().catch(() => ({}))
    setSupplements(s.supplements ?? [])
    setStacks(st.stacks ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUid(data.user?.id ?? null))
    load()
  }, [load])

  // Deep-link: /profile/supplements?stack=<id> opens that stack's editor.
  const stackDeepLinked = useRef(false)
  useEffect(() => {
    if (loading || stackDeepLinked.current) return
    const sid = new URLSearchParams(window.location.search).get('stack')
    if (!sid) return
    const st = stacks.find(s => s.id === sid)
    if (st) { stackDeepLinked.current = true; openStackBuilder(st) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, stacks])

  function startEdit(s: Supplement) {
    setEditId(s.id)
    setEditFields({ name: s.name, brand: s.brand ?? '', serving_size: String(s.serving_size), serving_unit: s.serving_unit, is_shared: s.is_shared })
    setErr('')
  }

  async function saveEdit(id: string) {
    setErr('')
    const res = await fetch(`/api/supplements/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editFields.name.trim(), brand: editFields.brand.trim() || null,
        serving_size: parseFloat(editFields.serving_size) || 1, serving_unit: editFields.serving_unit || 'serving',
        is_shared: editFields.is_shared,
      }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? 'Save failed'); return }
    setEditId(null); load()
  }

  async function removeSupp(id: string) {
    setErr('')
    const res = await fetch(`/api/supplements/${id}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? 'Could not remove'); return }
    load()
  }

  function openStackBuilder(stack?: Stack) {
    if (stack) {
      setEditStackId(stack.id)
      setStackName(stack.name)
      setStackPick(new Set(stack.supplement_stack_items.map(i => i.supplement_id)))
    } else {
      setEditStackId(null); setStackName(''); setStackPick(new Set())
    }
    setBuildingStack(true); setErr('')
  }

  async function saveStack() {
    setErr('')
    if (!stackName.trim()) { setErr('Name your stack.'); return }
    const items = Array.from(stackPick).map(supplement_id => ({ supplement_id, servings: 1 }))
    const url = editStackId ? `/api/supplements/stacks/${editStackId}` : '/api/supplements/stacks'
    const method = editStackId ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: stackName.trim(), items }) })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? 'Save failed'); return }
    setBuildingStack(false); load()
  }

  async function deleteStack(id: string) {
    await fetch(`/api/supplements/stacks/${id}`, { method: 'DELETE' })
    load()
  }

  if (loading) {
    return <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={label}>LOADING…</span></div>
  }

  return (
    <>
      <div className="screen" style={{ paddingTop: 0, paddingBottom: '120px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-5)' }}>
          <button onClick={() => { window.location.href = '/profile/edit' }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text-dim)', display: 'flex' }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '22px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-text)' }}>
            SUPPLEMENT INPUTS
          </span>
        </div>

        {err && <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '13px', color: 'var(--color-accent)', marginBottom: '14px' }}>{err}</div>}

        <button style={{ ...accent, width: '100%', fontSize: '14px', padding: '13px' }} onClick={() => setShowAdd(true)}>+ ADD SUPPLEMENT</button>

        {/* Supplements list */}
        <div style={{ marginTop: '26px' }}>
          <span style={sectionLabel}>MY SUPPLEMENTS</span>
          {supplements.length === 0 && <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '13px', color: 'var(--color-text-dim)', marginTop: '10px' }}>None yet.</p>}
          <div style={{ marginTop: '12px' }}>
            {supplements.map(s => {
              const own = !s.user_id || s.user_id === uid
              const editing = editId === s.id
              return (
                <div key={s.id} style={{ borderTop: '1px solid var(--color-border-soft)', padding: '12px 0' }}>
                  {!editing ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>{s.name}</div>
                        <div style={label}>{(s.brand ? s.brand + ' · ' : '')}{s.serving_size} {s.serving_unit} · {s.supplement_nutrients?.length ?? 0} NUTRIENTS{s.is_shared ? ' · SHARED' : ''}</div>
                      </div>
                      {own && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button style={ghost} onClick={() => startEdit(s)}>EDIT</button>
                          <button style={{ ...ghost, color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }} onClick={() => removeSupp(s.id)}>REMOVE</button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input style={input} value={editFields.name} onChange={e => setEditFields(f => ({ ...f, name: e.target.value }))} placeholder="name" />
                      <input style={input} value={editFields.brand} onChange={e => setEditFields(f => ({ ...f, brand: e.target.value }))} placeholder="brand" />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input style={{ ...input, width: '90px' }} inputMode="decimal" value={editFields.serving_size} onChange={e => setEditFields(f => ({ ...f, serving_size: e.target.value }))} />
                        <input style={input} value={editFields.serving_unit} onChange={e => setEditFields(f => ({ ...f, serving_unit: e.target.value }))} placeholder="serving unit" />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={editFields.is_shared} onChange={e => setEditFields(f => ({ ...f, is_shared: e.target.checked }))} style={{ accentColor: 'var(--color-accent)', width: '16px', height: '16px' }} />
                        <span style={{ ...label, marginBottom: 0 }}>SHARE WITH EVERYONE</span>
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button style={accent} onClick={() => saveEdit(s.id)}>SAVE</button>
                        <button style={ghost} onClick={() => setEditId(null)}>CANCEL</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Stacks */}
        <div style={{ marginTop: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={sectionLabel}>STACKS</span>
            <button style={ghost} onClick={() => openStackBuilder()} disabled={supplements.length === 0}>+ NEW</button>
          </div>
          <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: '11px', color: 'var(--color-text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
            Optional — group supplements for one-tap logging.
          </p>

          {buildingStack && (
            <div style={{ border: '1px solid var(--color-border)', padding: '14px', marginTop: '12px' }}>
              <span style={label}>STACK NAME</span>
              <input style={input} value={stackName} onChange={e => setStackName(e.target.value)} placeholder="e.g. Morning" autoFocus />
              <span style={{ ...label, marginTop: '12px' }}>INCLUDE</span>
              <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                {supplements.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={stackPick.has(s.id)} onChange={e => {
                      setStackPick(prev => { const n = new Set(prev); e.target.checked ? n.add(s.id) : n.delete(s.id); return n })
                    }} style={{ accentColor: 'var(--color-accent)', width: '16px', height: '16px' }} />
                    <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: '13px', color: 'var(--color-text)' }}>{s.name}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button style={accent} onClick={saveStack}>{editStackId ? 'SAVE STACK' : 'CREATE STACK'}</button>
                <button style={ghost} onClick={() => setBuildingStack(false)}>CANCEL</button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '12px' }}>
            {stacks.map(st => (
              <div key={st.id} style={{ borderTop: '1px solid var(--color-border-soft)', padding: '12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '14px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text)' }}>{st.name}</div>
                  <div style={label}>{st.supplement_stack_items.map(i => i.supplements?.name).filter(Boolean).join(', ') || `${st.supplement_stack_items.length} items`}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button style={ghost} onClick={() => openStackBuilder(st)}>EDIT</button>
                  <button style={{ ...ghost, color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }} onClick={() => deleteStack(st.id)}>DELETE</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showAdd && <SupplementAdd onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load() }} />}
    </>
  )
}
