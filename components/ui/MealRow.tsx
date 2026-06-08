'use client'

import type { Database } from '@/lib/supabase/types'
import type { MealType } from '@/types'

type FoodLog = Database['public']['Tables']['food_logs']['Row']

interface MealRowProps {
  mealType: MealType
  label: string
  items: FoodLog[]
  onAdd: (mealType: MealType) => void
  onDelete: (id: string) => void
}

export default function MealRow({ mealType, label, items, onAdd, onDelete }: MealRowProps) {
  const totalKcal = items.reduce((sum, item) => sum + item.kcal, 0)
  const hasItems = items.length > 0

  return (
    <div style={{ borderTop: '1px solid var(--color-border-soft)' }}>
      <div style={{
        padding: '14px 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 'var(--text-label)',
            letterSpacing: 'var(--tracking-loose)',
            textTransform: 'uppercase',
            color: hasItems ? 'var(--color-text)' : 'var(--color-text-dim)',
          }}>
            {label}
          </span>
          {hasItems && (
            <span style={{
              fontFamily: "'Barlow', sans-serif",
              fontSize: 'var(--text-micro)',
              color: 'var(--color-text-dim)',
            }}>
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {hasItems && (
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '18px',
              letterSpacing: 'var(--tracking-tight)',
              color: 'var(--color-text)',
            }}>
              {Math.round(totalKcal)}
            </span>
          )}
          <button
            onClick={() => onAdd(mealType)}
            style={{
              width: '26px',
              height: '26px',
              border: '1px solid var(--color-border)',
              backgroundColor: 'transparent',
              color: 'var(--color-text-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderRadius: 0,
              fontSize: '18px',
              fontFamily: "'Barlow', sans-serif",
              fontWeight: 300,
              lineHeight: 1,
            }}
          >
            +
          </button>
        </div>
      </div>

      {items.map(item => (
        <div
          key={item.id}
          style={{
            paddingBottom: '10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 'var(--space-3)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Barlow', sans-serif",
              fontSize: 'var(--text-body)',
              fontWeight: 500,
              color: 'var(--color-text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {item.food_name}
            </div>
            <div style={{
              fontFamily: "'Barlow', sans-serif",
              fontSize: 'var(--text-micro)',
              color: 'var(--color-text-dim)',
              marginTop: '2px',
            }}>
              {item.serving_g}g · P {Math.round(item.protein_g)}g · C {Math.round(item.carbs_g)}g · F {Math.round(item.fat_g)}g
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
            <span style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: '12px',
              color: 'var(--color-text)',
              whiteSpace: 'nowrap',
            }}>
              {Math.round(item.kcal)} kcal
            </span>
            <button
              onClick={() => onDelete(item.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-dim)',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
