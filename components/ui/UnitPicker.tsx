'use client'

// ── Unit types & conversion ───────────────────────────────────────────────────

export type Unit = 'g' | 'oz' | 'ml' | 'serving' | 'cup' | 'tbsp' | 'tsp'

interface UnitDef {
  key: Unit
  label: string   // short label for pill
  full: string    // full name for tooltip / aria
}

export const ALL_UNITS: UnitDef[] = [
  { key: 'g',       label: 'g',    full: 'Grams' },
  { key: 'oz',      label: 'oz',   full: 'Ounces' },
  { key: 'ml',      label: 'ml',   full: 'Millilitres' },
  { key: 'serving', label: 'srv',  full: 'Serving' },
  { key: 'cup',     label: 'cup',  full: 'Cup (240ml)' },
  { key: 'tbsp',    label: 'tbsp', full: 'Tablespoon (15ml)' },
  { key: 'tsp',     label: 'tsp',  full: 'Teaspoon (5ml)' },
]

/**
 * Convert a user-entered quantity + unit to grams.
 * Volume units use 1 ml = 1 g (water density).
 * @param qty      The numeric quantity the user typed
 * @param unit     Selected unit
 * @param servingG The food's default serving size in grams (used for 'serving' unit)
 */
export function toGrams(qty: number, unit: Unit, servingG = 100): number {
  if (isNaN(qty) || qty <= 0) return 0
  switch (unit) {
    case 'g':       return qty
    case 'oz':      return qty * 28.35
    case 'ml':      return qty           // 1 ml ≈ 1 g
    case 'serving': return qty * servingG
    case 'cup':     return qty * 240
    case 'tbsp':    return qty * 15
    case 'tsp':     return qty * 5
  }
}

/** Human-readable gram equivalent hint, e.g. "= 240 g" */
export function gramsHint(qty: number, unit: Unit, servingG = 100): string | null {
  if (unit === 'g') return null  // no hint needed — already in grams
  const g = toGrams(qty, unit, servingG)
  if (!g || g <= 0) return null
  return `= ${Math.round(g * 10) / 10} g`
}

// ── UnitPicker component ──────────────────────────────────────────────────────

interface UnitPickerProps {
  qty: string
  unit: Unit
  onQtyChange: (v: string) => void
  onUnitChange: (u: Unit) => void
  /** When false the "serving" unit is hidden (use in Quick Add where there is no reference food) */
  showServing?: boolean
  /** The food's default serving size in grams — shown as the hint for the "srv" pill */
  servingG?: number
}

export default function UnitPicker({
  qty,
  unit,
  onQtyChange,
  onUnitChange,
  showServing = true,
  servingG = 100,
}: UnitPickerProps) {
  const units = showServing ? ALL_UNITS : ALL_UNITS.filter(u => u.key !== 'serving')
  const hint = gramsHint(parseFloat(qty) || 0, unit, servingG)

  return (
    <div>
      {/* Quantity input */}
      <div style={{ position: 'relative' }}>
        <input
          type="number"
          value={qty}
          onChange={e => onQtyChange(e.target.value)}
          min="0.01"
          step="any"
          style={{
            width: '100%',
            padding: '12px 14px',
            paddingRight: hint ? '80px' : '14px',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 0,
            color: 'var(--color-text)',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '28px',
            letterSpacing: '0.03em',
            outline: 'none',
          }}
        />
        {/* Gram equivalent hint */}
        {hint && (
          <span style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '11px',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: 'var(--color-text-dim)',
            pointerEvents: 'none',
          }}>
            {hint}
          </span>
        )}
      </div>

      {/* Unit pills */}
      <div style={{
        display: 'flex',
        gap: '4px',
        flexWrap: 'wrap',
        marginTop: '8px',
      }}>
        {units.map(u => {
          const active = unit === u.key
          return (
            <button
              key={u.key}
              onClick={() => onUnitChange(u.key)}
              title={u.full + (u.key === 'serving' && servingG ? ` (${servingG}g)` : '')}
              style={{
                padding: '5px 11px',
                border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                color: active ? '#fff' : 'var(--color-text-dim)',
                cursor: 'pointer',
                borderRadius: 0,
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: '10px',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                transition: 'background-color 0.1s ease, color 0.1s ease',
              }}
            >
              {u.label}
              {/* Show serving size in parens on the srv pill */}
              {u.key === 'serving' && servingG ? (
                <span style={{ opacity: 0.7, marginLeft: '3px', fontWeight: 400 }}>
                  ({servingG}g)
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
