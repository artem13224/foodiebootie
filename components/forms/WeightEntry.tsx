'use client'

import { useState, useEffect } from 'react'
import { localDateStr } from '@/lib/science/utils'
import { useUnitSystem } from '@/contexts/UnitSystemContext'

interface WeightEntryProps {
  onClose: () => void
  onSaved: (shouldRecalculate: boolean) => void
  /** Pre-fill date (YYYY-MM-DD), defaults to today. */
  initialDate?: string
}

export default function WeightEntry({ onClose, onSaved, initialDate }: WeightEntryProps) {
  const today = localDateStr()
  const { weightUnit } = useUnitSystem()
  const [date, setDate] = useState(initialDate ?? today)
  const [weightInput, setWeightInput] = useState('')
  const [unit, setUnit] = useState<'kg' | 'lbs'>(weightUnit)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [existingEntry, setExistingEntry] = useState(false)

  // Check if an entry already exists for the selected date
  useEffect(() => {
    async function checkExisting() {
      const res = await fetch('/api/weight')
      if (!res.ok) return
      const { logs } = await res.json()
      const found = logs.find((l: { logged_at: string; weight_kg: number }) => l.logged_at === date)
      if (found) {
        setExistingEntry(true)
        const displayWeight = unit === 'lbs'
          ? String(Math.round(found.weight_kg * 2.20462 * 10) / 10)
          : String(found.weight_kg)
        setWeightInput(displayWeight)
      } else {
        setExistingEntry(false)
      }
    }
    checkExisting()
  }, [date, unit])

  async function handleSave() {
    const raw = parseFloat(weightInput)
    if (!weightInput || isNaN(raw) || raw <= 0) {
      setError('Enter a valid weight.')
      return
    }
    const weight_kg = unit === 'lbs' ? raw / 2.20462 : raw

    setSaving(true)
    setError('')

    const res = await fetch('/api/weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight_kg: Math.round(weight_kg * 100) / 100, logged_at: date, note: note || undefined }),
    })

    setSaving(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to save weight.')
      return
    }

    const { shouldRecalculate } = await res.json()
    onSaved(shouldRecalculate)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 200,
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(340px, calc(100vw - 40px))',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        padding: '24px 20px',
        zIndex: 201,
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '13px',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: 'var(--color-text)',
          }}>
            LOG WEIGHT
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', padding: '4px' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        {existingEntry && (
          <div style={{
            marginBottom: '14px',
            padding: '8px 10px',
            border: '1px solid var(--color-warning)',
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '10px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--color-warning)',
          }}>
            UPDATE EXISTING ENTRY
          </div>
        )}

        {/* Weight input with unit toggle */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '10px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--color-text-dim)',
            marginBottom: '6px',
          }}>
            WEIGHT
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="number"
              inputMode="decimal"
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              placeholder={unit === 'kg' ? '70.0' : '154.0'}
              style={{
                flex: 1,
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '28px',
                padding: '8px 12px',
                outline: 'none',
              }}
            />
            {/* Unit toggle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {(['kg', 'lbs'] as const).map(u => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  style={{
                    background: unit === u ? 'var(--color-accent)' : 'var(--color-bg)',
                    border: `1px solid ${unit === u ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    color: unit === u ? '#fff' : 'var(--color-text-dim)',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: '10px',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    padding: '4px 8px',
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '10px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--color-text-dim)',
            marginBottom: '6px',
          }}>
            DATE
          </div>
          <input
            type="date"
            max={today}
            value={date}
            onChange={e => { if (e.target.value) setDate(e.target.value) }}
            style={{
              width: '100%',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: '13px',
              padding: '8px 12px',
              outline: 'none',
            }}
          />
        </div>

        {/* Note */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '10px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--color-text-dim)',
            marginBottom: '6px',
          }}>
            NOTE (OPTIONAL)
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="e.g. morning, post-workout..."
            style={{
              width: '100%',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              fontFamily: "'Barlow', sans-serif",
              fontSize: '12px',
              padding: '8px 12px',
              outline: 'none',
              resize: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <div style={{
            marginBottom: '12px',
            fontFamily: "'Barlow', sans-serif",
            fontSize: '12px',
            color: 'var(--color-danger)',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            background: saving ? 'var(--color-border)' : 'var(--color-accent)',
            border: 'none',
            color: '#fff',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '20px',
            letterSpacing: '0.1em',
            padding: '14px',
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          {saving ? 'SAVING...' : existingEntry ? 'UPDATE WEIGHT' : 'SAVE WEIGHT'}
        </button>
      </div>
    </>
  )
}
