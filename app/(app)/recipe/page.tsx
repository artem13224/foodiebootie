'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { FoodResult } from '@/types/food'

interface Ingredient {
  food: FoodResult
  grams: number
}

function macro(per100g: number, g: number) {
  return Math.round((per100g / 100) * g * 10) / 10
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  backgroundColor: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
  fontFamily: "'Barlow', sans-serif",
  fontWeight: 500,
  fontSize: '13px',
  outline: 'none',
  borderRadius: 0,
}

export default function RecipePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [servings, setServings] = useState('1')
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodResult[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pendingFood, setPendingFood] = useState<FoodResult | null>(null)
  const [pendingGrams, setPendingGrams] = useState('100')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/food/search?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setResults(json.results ?? [])
    } catch { setResults([]) }
    setSearching(false)
  }, [])

  function handleQuery(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  function selectFood(food: FoodResult) {
    setPendingFood(food)
    setPendingGrams(String(food.servingG))
    setQuery('')
    setResults([])
  }

  function addIngredient() {
    if (!pendingFood) return
    const g = parseFloat(pendingGrams)
    if (!g || g <= 0) return
    setIngredients(prev => [...prev, { food: pendingFood, grams: g }])
    setPendingFood(null)
    setPendingGrams('100')
  }

  function removeIngredient(i: number) {
    setIngredients(prev => prev.filter((_, idx) => idx !== i))
  }

  const numServings = Math.max(1, parseFloat(servings) || 1)
  const totalWeight = ingredients.reduce((sum, i) => sum + i.grams, 0)
  const totalKcal = ingredients.reduce((sum, i) => sum + macro(i.food.kcalPer100g, i.grams), 0)
  const totalProtein = ingredients.reduce((sum, i) => sum + macro(i.food.proteinPer100g, i.grams), 0)
  const totalCarbs = ingredients.reduce((sum, i) => sum + macro(i.food.carbsPer100g, i.grams), 0)
  const totalFat = ingredients.reduce((sum, i) => sum + macro(i.food.fatPer100g, i.grams), 0)
  const totalFiber = ingredients.reduce((sum, i) => sum + macro(i.food.fiberPer100g, i.grams), 0)

  const perServingKcal = Math.round(totalKcal / numServings)
  const perServingProtein = Math.round(totalProtein / numServings * 10) / 10
  const perServingCarbs = Math.round(totalCarbs / numServings * 10) / 10
  const perServingFat = Math.round(totalFat / numServings * 10) / 10
  const servingWeightG = Math.round(totalWeight / numServings)

  async function handleSave() {
    if (!name.trim() || ingredients.length === 0 || saving) return
    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    // Store nutrition per 100g of recipe
    const p100 = (total: number) =>
      totalWeight > 0 ? Math.round((total / totalWeight) * 1000) / 10 : 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('custom_foods') as any).insert({
      created_by: user.id,
      name: name.trim(),
      brand: `${numServings} serving${numServings !== 1 ? 's' : ''} · recipe`,
      serving_g: servingWeightG > 0 ? servingWeightG : 100,
      kcal_per_100g: p100(totalKcal),
      protein_per_100g: p100(totalProtein),
      carbs_per_100g: p100(totalCarbs),
      fat_per_100g: p100(totalFat),
      fiber_per_100g: p100(totalFiber),
      is_shared: true,
    })

    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => router.back(), 1200)
    }
  }

  return (
    <div className="screen" style={{ paddingTop: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-5)',
      }}>
        <button
          onClick={() => router.back()}
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
          RECIPE MAKER
        </span>
      </div>

      {/* Name + servings */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        <input
          placeholder="RECIPE NAME"
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
          autoFocus
        />
        <div style={{ flexShrink: 0, width: '80px' }}>
          <input
            type="number"
            min="1"
            placeholder="SERVS"
            value={servings}
            onChange={e => setServings(e.target.value)}
            style={{ ...inputStyle, textAlign: 'center' }}
          />
        </div>
      </div>

      {/* Ingredient search */}
      <div style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        fontSize: '9px',
        letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase',
        color: 'var(--color-text-dim)',
        marginBottom: 'var(--space-2)',
      }}>
        ADD INGREDIENT
      </div>

      {pendingFood ? (
        /* Pending food — set grams then confirm */
        <div style={{
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'center',
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-accent)',
          marginBottom: 'var(--space-3)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Barlow', sans-serif",
              fontWeight: 500,
              fontSize: '12px',
              color: 'var(--color-text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {pendingFood.name}
            </div>
            <div style={{
              fontFamily: "'Barlow', sans-serif",
              fontSize: '9px',
              color: 'var(--color-text-dim)',
              marginTop: '1px',
            }}>
              {Math.round(macro(pendingFood.kcalPer100g, parseFloat(pendingGrams) || 0))} kcal
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
            <input
              type="number"
              value={pendingGrams}
              onChange={e => setPendingGrams(e.target.value)}
              style={{ ...inputStyle, width: '64px', padding: '8px', textAlign: 'center' }}
              min="1"
            />
            <span style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: '11px',
              color: 'var(--color-text-dim)',
            }}>G</span>
          </div>
          <button
            onClick={addIngredient}
            style={{
              background: 'var(--color-accent)',
              border: 'none',
              cursor: 'pointer',
              padding: '8px 14px',
              color: '#fff',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: '12px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            ADD
          </button>
          <button
            onClick={() => setPendingFood(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', padding: '4px' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      ) : (
        <div style={{ position: 'relative', marginBottom: 'var(--space-3)' }}>
          <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </div>
          <input
            type="search"
            placeholder="Search ingredient..."
            value={query}
            onChange={e => handleQuery(e.target.value)}
            style={{ ...inputStyle, paddingLeft: '36px' }}
          />
          {searching && (
            <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)' }}>
              <div style={{ width: '13px', height: '13px', border: '1.5px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
          )}
        </div>
      )}

      {/* Search results */}
      {results.length > 0 && !pendingFood && (
        <div style={{ border: '1px solid var(--color-border)', marginBottom: 'var(--space-4)' }}>
          {results.slice(0, 8).map(food => (
            <button
              key={food.id}
              onClick={() => selectFood(food)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', padding: '10px 12px',
                background: 'none', border: 'none', borderBottom: '1px solid var(--color-border-soft)',
                cursor: 'pointer', textAlign: 'left', gap: 'var(--space-3)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 500, fontSize: '12px', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {food.name}
                </div>
                {food.brand && (
                  <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '9px', color: 'var(--color-text-dim)', marginTop: '1px' }}>
                    {food.brand}
                  </div>
                )}
              </div>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '18px', color: 'var(--color-text)', flexShrink: 0 }}>
                {Math.round(food.kcalPer100g)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Ingredient list */}
      {ingredients.length > 0 && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '9px',
            letterSpacing: 'var(--tracking-wide)',
            textTransform: 'uppercase',
            color: 'var(--color-text-dim)',
            marginBottom: 'var(--space-2)',
          }}>
            INGREDIENTS ({ingredients.length})
          </div>
          <div style={{ border: '1px solid var(--color-border)' }}>
            {ingredients.map((ing, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                borderBottom: i < ingredients.length - 1 ? '1px solid var(--color-border-soft)' : undefined,
                gap: 'var(--space-3)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 500, fontSize: '12px', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ing.food.name}
                  </div>
                  <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '9px', color: 'var(--color-text-dim)', marginTop: '1px' }}>
                    {ing.grams}g · {Math.round(macro(ing.food.kcalPer100g, ing.grams))} kcal · P {Math.round(macro(ing.food.proteinPer100g, ing.grams))}g
                  </div>
                </div>
                <button
                  onClick={() => removeIngredient(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', padding: '4px', flexShrink: 0 }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Macro totals */}
      {ingredients.length > 0 && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '9px',
            letterSpacing: 'var(--tracking-wide)',
            textTransform: 'uppercase',
            color: 'var(--color-text-dim)',
            marginBottom: 'var(--space-2)',
          }}>
            PER SERVING ({servingWeightG}G)
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1px',
            background: 'var(--color-border)',
          }}>
            {[
              { label: 'KCAL', value: perServingKcal, color: 'var(--color-text)' },
              { label: 'PROTEIN', value: perServingProtein, color: 'var(--color-macro-protein)' },
              { label: 'CARBS', value: perServingCarbs, color: 'var(--color-macro-carbs)' },
              { label: 'FAT', value: perServingFat, color: 'var(--color-macro-fat)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--color-bg)', padding: '10px 8px' }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '22px', color, lineHeight: 1 }}>
                  {value}
                </div>
                <div style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: '8px',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-dim)',
                  marginTop: '2px',
                }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
          <div style={{
            fontFamily: "'Barlow', sans-serif",
            fontSize: '9px',
            color: 'var(--color-text-dim)',
            marginTop: 'var(--space-2)',
          }}>
            Total: {Math.round(totalKcal)} kcal · {numServings} serving{numServings !== 1 ? 's' : ''} · {Math.round(totalWeight)}g total
          </div>
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || !name.trim() || ingredients.length === 0}
        style={{
          width: '100%',
          padding: 'var(--space-4)',
          backgroundColor: saved
            ? 'var(--color-success)'
            : (saving || !name.trim() || ingredients.length === 0)
              ? 'var(--color-border)'
              : 'var(--color-accent)',
          color: '#fff',
          border: 'none',
          cursor: (saving || !name.trim() || ingredients.length === 0) ? 'not-allowed' : 'pointer',
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 800,
          fontSize: '18px',
          letterSpacing: 'var(--tracking-loose)',
          textTransform: 'uppercase',
          borderRadius: 0,
          transition: 'background-color 0.15s ease',
        }}
      >
        {saved ? 'SAVED TO MY FOODS ✓' : saving ? 'SAVING...' : 'SAVE RECIPE'}
      </button>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus { outline: none; border-color: var(--color-accent) !important; }
        input[type=search]::-webkit-search-cancel-button { display: none; }
      `}</style>
    </div>
  )
}
