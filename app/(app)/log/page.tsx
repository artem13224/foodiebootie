'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { FoodResult } from '@/types/food'
import type { MealType } from '@/types'

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'BREAKFAST',
  lunch: 'LUNCH',
  dinner: 'DINNER',
  snacks: 'SNACKS',
  pre_workout: 'PRE WORKOUT',
  post_workout: 'POST WORKOUT',
}
const MEAL_TYPES = Object.keys(MEAL_LABELS) as MealType[]

function macro(per100g: number, servingG: number) {
  return Math.round((per100g / 100) * servingG * 10) / 10
}

function LogPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialMeal = (searchParams.get('meal') as MealType) ?? 'breakfast'

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null)
  const [servingG, setServingG] = useState('100')
  const [selectedMeal, setSelectedMeal] = useState<MealType>(initialMeal)
  const [logging, setLogging] = useState(false)
  const [sheetVisible, setSheetVisible] = useState(false)
  const [view, setView] = useState<'search' | 'quickAdd'>('search')
  const [quickAdd, setQuickAdd] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' })
  const [recentLogs, setRecentLogs] = useState<FoodResult[]>([])
  const [showRecent, setShowRecent] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus search on mount
  useEffect(() => {
    inputRef.current?.focus()
    loadRecent()
  }, [])

  async function loadRecent() {
    const supabase = createClient()
    const { data: rawData } = await supabase
      .from('food_logs')
      .select('food_name, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_g, usda_food_id')
      .order('created_at', { ascending: false })
      .limit(30)

    type RecentRow = { food_name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number | null; serving_g: number; usda_food_id: string | null }
    const data = rawData as RecentRow[] | null
    if (!data) return

    // Deduplicate by food_name, keep most recent
    const seen = new Set<string>()
    const unique: FoodResult[] = []
    for (const log of data) {
      if (seen.has(log.food_name)) continue
      seen.add(log.food_name)
      const servingG = Number(log.serving_g)
      unique.push({
        id: log.usda_food_id ?? `recent-${log.food_name}`,
        source: 'usda',
        name: log.food_name,
        kcalPer100g: servingG > 0 ? (Number(log.kcal) / servingG) * 100 : Number(log.kcal),
        proteinPer100g: servingG > 0 ? (Number(log.protein_g) / servingG) * 100 : Number(log.protein_g),
        carbsPer100g: servingG > 0 ? (Number(log.carbs_g) / servingG) * 100 : Number(log.carbs_g),
        fatPer100g: servingG > 0 ? (Number(log.fat_g) / servingG) * 100 : Number(log.fat_g),
        fiberPer100g: 0,
        servingG,
      })
      if (unique.length >= 10) break
    }
    setRecentLogs(unique)
  }

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/food/search?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setResults(json.results ?? [])
    } catch {
      setResults([])
    }
    setSearching(false)
  }, [])

  function handleQueryChange(val: string) {
    setQuery(val)
    setShowRecent(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  function openSheet(food: FoodResult) {
    setSelectedFood(food)
    setServingG(String(food.servingG))
    setSheetVisible(false)
    requestAnimationFrame(() => setSheetVisible(true))
  }

  function closeSheet() {
    setSheetVisible(false)
    setTimeout(() => setSelectedFood(null), 300)
  }

  async function handleLog() {
    if (!selectedFood || logging) return
    const g = parseFloat(servingG)
    if (!g || g <= 0) return

    setLogging(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLogging(false); return }

    const today = new Date().toISOString().split('T')[0]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('food_logs') as any).insert({
      user_id: user.id,
      logged_date: today,
      meal_type: selectedMeal,
      food_name: selectedFood.name,
      serving_g: g,
      kcal: macro(selectedFood.kcalPer100g, g),
      protein_g: macro(selectedFood.proteinPer100g, g),
      carbs_g: macro(selectedFood.carbsPer100g, g),
      fat_g: macro(selectedFood.fatPer100g, g),
      fiber_g: macro(selectedFood.fiberPer100g, g),
      usda_food_id: selectedFood.source === 'usda' ? selectedFood.id : null,
      off_food_id: selectedFood.source === 'off' ? selectedFood.id : null,
    })

    router.push('/today')
  }

  async function handleQuickAdd() {
    const kcal = parseFloat(quickAdd.kcal)
    if (!quickAdd.name || !kcal) return
    setLogging(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLogging(false); return }

    const today = new Date().toISOString().split('T')[0]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('food_logs') as any).insert({
      user_id: user.id,
      logged_date: today,
      meal_type: selectedMeal,
      food_name: quickAdd.name,
      serving_g: 100,
      kcal,
      protein_g: parseFloat(quickAdd.protein) || 0,
      carbs_g: parseFloat(quickAdd.carbs) || 0,
      fat_g: parseFloat(quickAdd.fat) || 0,
    })

    router.push('/today')
  }

  const g = parseFloat(servingG) || 0
  const previewKcal = selectedFood ? macro(selectedFood.kcalPer100g, g) : 0
  const previewProtein = selectedFood ? macro(selectedFood.proteinPer100g, g) : 0
  const previewCarbs = selectedFood ? macro(selectedFood.carbsPer100g, g) : 0
  const previewFat = selectedFood ? macro(selectedFood.fatPer100g, g) : 0

  const displayList = showRecent ? recentLogs : results

  return (
    <div className="screen" style={{ paddingTop: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-4)',
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
          {view === 'quickAdd' ? 'QUICK ADD' : 'LOG FOOD'}
        </span>
        {view === 'quickAdd' && (
          <button
            onClick={() => setView('search')}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--color-text-dim)',
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
              fontSize: '11px', letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
            }}
          >
            CANCEL
          </button>
        )}
      </div>

      {view === 'quickAdd' ? (
        /* ── Quick Add form ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <input
            placeholder="FOOD NAME"
            value={quickAdd.name}
            onChange={e => setQuickAdd(q => ({ ...q, name: e.target.value }))}
            style={inputStyle}
            autoFocus
          />
          <input
            type="number"
            placeholder="CALORIES (KCAL)"
            value={quickAdd.kcal}
            onChange={e => setQuickAdd(q => ({ ...q, kcal: e.target.value }))}
            style={inputStyle}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' }}>
            {(['protein', 'carbs', 'fat'] as const).map(macro => (
              <input
                key={macro}
                type="number"
                placeholder={macro.toUpperCase() + ' G'}
                value={quickAdd[macro]}
                onChange={e => setQuickAdd(q => ({ ...q, [macro]: e.target.value }))}
                style={inputStyle}
              />
            ))}
          </div>
          {/* Meal selector */}
          <MealSelector selected={selectedMeal} onChange={setSelectedMeal} />
          <button
            onClick={handleQuickAdd}
            disabled={logging || !quickAdd.name || !quickAdd.kcal}
            style={logBtnStyle(logging)}
          >
            {logging ? 'LOGGING...' : 'LOG'}
          </button>
        </div>
      ) : (
        /* ── Search view ── */
        <>
          {/* Search bar */}
          <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
            <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </div>
            <input
              ref={inputRef}
              type="search"
              placeholder="Search foods..."
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              style={{ ...inputStyle, paddingLeft: '38px' }}
            />
            {searching && (
              <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)' }}>
                <div style={{
                  width: '14px', height: '14px',
                  border: '1.5px solid var(--color-border)',
                  borderTopColor: 'var(--color-accent)',
                  borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                }} />
              </div>
            )}
          </div>

          {/* Quick actions (shown when not searching) */}
          {!query && !showRecent && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1px',
              background: 'var(--color-border)',
              marginBottom: 'var(--space-5)',
            }}>
              {[
                { label: 'SCAN BARCODE', icon: barcodeIcon, action: () => {} },
                { label: 'QUICK ADD', icon: plusIcon, action: () => setView('quickAdd') },
                { label: 'MY FOODS', icon: listIcon, action: () => {} },
                { label: 'RECENT', icon: clockIcon, action: () => setShowRecent(true) },
              ].map(({ label, icon, action }) => (
                <button
                  key={label}
                  onClick={action}
                  style={{
                    background: 'var(--color-surface)',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 'var(--space-5) var(--space-4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                    alignItems: 'flex-start',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ color: 'var(--color-text-dim)' }}>{icon}</div>
                  <span style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: 'var(--text-label)',
                    letterSpacing: 'var(--tracking-wide)',
                    textTransform: 'uppercase',
                    color: 'var(--color-text)',
                  }}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Recent header */}
          {showRecent && !query && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <span style={{
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                fontSize: 'var(--text-label)', letterSpacing: 'var(--tracking-loose)',
                textTransform: 'uppercase', color: 'var(--color-text)',
              }}>RECENT</span>
              <button onClick={() => setShowRecent(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-dim)', fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700, fontSize: '10px', letterSpacing: 'var(--tracking-wide)',
                textTransform: 'uppercase',
              }}>BACK</button>
            </div>
          )}

          {/* Results / Recent list */}
          {displayList.length > 0 && (
            <div style={{ borderTop: '1px solid var(--color-border-soft)' }}>
              {displayList.map(food => (
                <button
                  key={food.id}
                  onClick={() => openSheet(food)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    padding: '12px 0',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid var(--color-border-soft)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'Barlow', sans-serif",
                      fontWeight: 500,
                      fontSize: 'var(--text-body)',
                      color: 'var(--color-text)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {food.name}
                    </div>
                    {food.brand && (
                      <div style={{
                        fontFamily: "'Barlow', sans-serif",
                        fontSize: 'var(--text-micro)',
                        color: 'var(--color-text-dim)',
                        marginTop: '1px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {food.brand}
                      </div>
                    )}
                    <div style={{
                      fontFamily: "'Barlow', sans-serif",
                      fontSize: 'var(--text-micro)',
                      color: 'var(--color-text-dim)',
                      marginTop: '2px',
                    }}>
                      per 100g · P {Math.round(food.proteinPer100g)}g · C {Math.round(food.carbsPer100g)}g · F {Math.round(food.fatPer100g)}g
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <span style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: '22px',
                      letterSpacing: 'var(--tracking-tight)',
                      color: 'var(--color-text)',
                      lineHeight: 1,
                    }}>
                      {Math.round(food.kcalPer100g)}
                    </span>
                    <div style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 700,
                      fontSize: '8px',
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-dim)',
                    }}>
                      kcal
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Empty search state */}
          {query.length >= 2 && !searching && results.length === 0 && (
            <div style={{ paddingTop: 'var(--space-8)', textAlign: 'center' }}>
              <p style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: 'var(--text-label)',
                letterSpacing: 'var(--tracking-loose)',
                textTransform: 'uppercase',
                color: 'var(--color-text-dim)',
              }}>
                NO RESULTS FOR "{query.toUpperCase()}"
              </p>
              <button
                onClick={() => setView('quickAdd')}
                style={{
                  marginTop: 'var(--space-4)',
                  background: 'none',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  padding: '10px 20px',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: '12px',
                  letterSpacing: 'var(--tracking-wide)',
                  textTransform: 'uppercase',
                  color: 'var(--color-text)',
                }}
              >
                + QUICK ADD MANUALLY
              </button>
            </div>
          )}
        </>
      )}

      {/* Backdrop */}
      {selectedFood && (
        <div
          onClick={closeSheet}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 200,
            opacity: sheetVisible ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}

      {/* Food detail bottom sheet */}
      {selectedFood && (
        <div style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          backgroundColor: 'var(--color-surface)',
          borderTop: '2px solid var(--color-accent)',
          zIndex: 201,
          padding: 'var(--space-6) var(--space-5)',
          paddingBottom: 'max(var(--space-8), env(safe-area-inset-bottom))',
          transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
          {/* Food name */}
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <div style={{
              fontFamily: "'Barlow', sans-serif",
              fontWeight: 600,
              fontSize: '14px',
              color: 'var(--color-text)',
              marginBottom: '2px',
            }}>
              {selectedFood.name}
            </div>
            {selectedFood.brand && (
              <div style={{
                fontFamily: "'Barlow', sans-serif",
                fontSize: 'var(--text-micro)',
                color: 'var(--color-text-dim)',
              }}>
                {selectedFood.brand}
              </div>
            )}
          </div>

          {/* Live macro preview */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1px',
            background: 'var(--color-border)',
            marginBottom: 'var(--space-5)',
          }}>
            {[
              { label: 'KCAL', value: previewKcal, color: 'var(--color-text)' },
              { label: 'PROTEIN', value: previewProtein, color: 'var(--color-macro-protein)' },
              { label: 'CARBS', value: previewCarbs, color: 'var(--color-macro-carbs)' },
              { label: 'FAT', value: previewFat, color: 'var(--color-macro-fat)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--color-bg)', padding: '10px 8px' }}>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: '20px',
                  letterSpacing: 'var(--tracking-tight)',
                  color,
                  lineHeight: 1,
                }}>
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

          {/* Serving size input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: '9px',
                letterSpacing: 'var(--tracking-wide)',
                textTransform: 'uppercase',
                color: 'var(--color-text-dim)',
                marginBottom: 'var(--space-1)',
              }}>
                SERVING SIZE
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <input
                  type="number"
                  value={servingG}
                  onChange={e => setServingG(e.target.value)}
                  min="1"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <span style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: '12px',
                  color: 'var(--color-text-dim)',
                  textTransform: 'uppercase',
                }}>
                  G
                </span>
              </div>
            </div>
          </div>

          {/* Meal selector */}
          <MealSelector selected={selectedMeal} onChange={setSelectedMeal} />

          {/* LOG button */}
          <button
            onClick={handleLog}
            disabled={logging || !servingG || parseFloat(servingG) <= 0}
            style={logBtnStyle(logging)}
          >
            {logging ? 'LOGGING...' : 'LOG'}
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=search]::-webkit-search-cancel-button { display: none; }
        input:focus { outline: none; border-color: var(--color-accent) !important; }
      `}</style>
    </div>
  )
}

function MealSelector({ selected, onChange }: { selected: MealType; onChange: (m: MealType) => void }) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <div style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        fontSize: '9px',
        letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase',
        color: 'var(--color-text-dim)',
        marginBottom: 'var(--space-2)',
      }}>
        LOG TO
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {MEAL_TYPES.map(type => (
          <button
            key={type}
            onClick={() => onChange(type)}
            style={{
              padding: '5px 10px',
              border: `1px solid ${selected === type ? 'var(--color-accent)' : 'var(--color-border)'}`,
              backgroundColor: selected === type ? 'var(--color-accent)' : 'transparent',
              color: selected === type ? '#fff' : 'var(--color-text-dim)',
              cursor: 'pointer',
              borderRadius: 0,
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: '9px',
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}
          >
            {MEAL_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  backgroundColor: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 0,
  color: 'var(--color-text)',
  fontFamily: "'Barlow', sans-serif",
  fontWeight: 500,
  fontSize: '13px',
  outline: 'none',
}

function logBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: 'var(--space-4)',
    backgroundColor: disabled ? 'var(--color-border)' : 'var(--color-accent)',
    color: '#fff',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 800,
    fontSize: '18px',
    letterSpacing: 'var(--tracking-loose)',
    textTransform: 'uppercase',
    borderRadius: 0,
    transition: 'background-color 0.15s ease',
  }
}

// SVG icons
const barcodeIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="2" y="4" width="2" height="12" fill="currentColor" />
    <rect x="5" y="4" width="1" height="12" fill="currentColor" />
    <rect x="7" y="4" width="2" height="12" fill="currentColor" />
    <rect x="10" y="4" width="1" height="12" fill="currentColor" />
    <rect x="12" y="4" width="2" height="12" fill="currentColor" />
    <rect x="15" y="4" width="1" height="12" fill="currentColor" />
    <rect x="17" y="4" width="1" height="12" fill="currentColor" />
  </svg>
)
const plusIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)
const listIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M7 6H17M7 10H17M7 14H17M4 6H4.01M4 10H4.01M4 14H4.01" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)
const clockIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 6V10L13 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
  </svg>
)

export default function LogPage() {
  return (
    <Suspense>
      <LogPageInner />
    </Suspense>
  )
}
