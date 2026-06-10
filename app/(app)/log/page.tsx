'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { localDateStr } from '@/lib/science/utils'
import BarcodeScanner from '@/components/ui/BarcodeScanner'
import WeightEntry from '@/components/forms/WeightEntry'
import UnitPicker, { type Unit, toGrams } from '@/components/ui/UnitPicker'
import type { FoodResult } from '@/types/food'
import type { MealType } from '@/types'

// ── Constants ────────────────────────────────────────────────────────────────

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'BREAKFAST',
  lunch: 'LUNCH',
  dinner: 'DINNER',
  snacks: 'SNACKS',
  pre_workout: 'PRE WORKOUT',
  post_workout: 'POST WORKOUT',
}
const MEAL_TYPES = Object.keys(MEAL_LABELS) as MealType[]

type SourceFilter = 'all' | 'usda' | 'off' | 'nutritionix'
type SortOption = 'relevance' | 'protein' | 'kcal_asc' | 'kcal_desc'
type View = 'search' | 'quickAdd' | 'myFoods'

// ── Helpers ──────────────────────────────────────────────────────────────────

function m(per100g: number, g: number) {
  return Math.round((per100g / 100) * g * 10) / 10
}

function applySort(list: FoodResult[], sort: SortOption): FoodResult[] {
  if (sort === 'relevance') return list
  return [...list].sort((a, b) => {
    if (sort === 'protein') return b.proteinPer100g - a.proteinPer100g
    if (sort === 'kcal_asc') return a.kcalPer100g - b.kcalPer100g
    if (sort === 'kcal_desc') return b.kcalPer100g - a.kcalPer100g
    return 0
  })
}

// ── Custom food type (Supabase row) ──────────────────────────────────────────

interface CustomFood {
  id: string
  name: string
  brand: string | null
  serving_g: number
  kcal_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  fiber_per_100g: number | null
}

function customToResult(cf: CustomFood): FoodResult {
  return {
    id: cf.id,
    source: 'custom',
    name: cf.name,
    brand: cf.brand ?? undefined,
    kcalPer100g: cf.kcal_per_100g,
    proteinPer100g: cf.protein_per_100g,
    carbsPer100g: cf.carbs_per_100g,
    fatPer100g: cf.fat_per_100g,
    fiberPer100g: cf.fiber_per_100g ?? 0,
    servingG: cf.serving_g,
    customFoodId: cf.id,
  }
}

/**
 * Insert a food_logs row with the serving-model columns, transparently falling
 * back to legacy-only columns if migration 006 hasn't been applied yet. This
 * keeps food logging working regardless of DB migration state (non-breaking).
 */
async function insertFoodLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  legacy: Record<string, unknown>,
  serving: Record<string, unknown>,
): Promise<{ message: string } | null> {
  const full = await supabase.from('food_logs').insert({ ...legacy, ...serving })
  if (!full.error) return null
  const msg = String(full.error.message ?? '')
  // Any problem rooted in the serving columns (missing column on older schemas,
  // numeric range/overflow, check constraint) → retry with legacy columns only
  // so logging still succeeds. Legacy columns are unchanged since the initial schema.
  if (/column|schema cache|does not exist|numeric|overflow|out of range|violates/i.test(msg)) {
    const legacyOnly = await supabase.from('food_logs').insert(legacy)
    return legacyOnly.error ? { message: String(legacyOnly.error.message) } : null
  }
  return { message: msg }
}

// ── Main page ────────────────────────────────────────────────────────────────

function LogPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialMeal = (searchParams.get('meal') as MealType) ?? 'breakfast'
  // When launched from the Today screen for a past date, use that date
  const loggingDate = searchParams.get('date') ?? localDateStr()

  // View state
  const [view, setView] = useState<View>('search')

  // Search state
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodResult[]>([])
  const [searching, setSearching] = useState(false)
  const [source, setSource] = useState<SourceFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('relevance')
  const [showRecent, setShowRecent] = useState(false)
  const [recentLogs, setRecentLogs] = useState<FoodResult[]>([])

  // Bottom sheet state
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null)
  const [servingQty, setServingQty] = useState('1')
  const [servingUnit, setServingUnit] = useState<Unit>('serving')
  const [sheetVisible, setSheetVisible] = useState(false)
  const [selectedMeal, setSelectedMeal] = useState<MealType>(initialMeal)
  const [logging, setLogging] = useState(false)
  const [logError, setLogError] = useState('')

  // Weight entry state
  const [showWeightEntry, setShowWeightEntry] = useState(false)

  // Barcode state
  const [scannerOpen, setScannerOpen] = useState(false)
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [barcodeNotFound, setBarcodeNotFound] = useState(false)

  // Quick add state
  const [quickAdd, setQuickAdd] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' })
  const [qaQty, setQaQty] = useState('100')
  const [qaUnit, setQaUnit] = useState<Unit>('g')
  // When on, the quick-added food is also saved to the shared library (custom_foods).
  const [qaShare, setQaShare] = useState(false)

  // My Foods state
  const [customFoods, setCustomFoods] = useState<CustomFood[]>([])
  const [myFoodsLoading, setMyFoodsLoading] = useState(false)
  const [myFoodsQuery, setMyFoodsQuery] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newFood, setNewFood] = useState({ name: '', brand: '', serving: '100', kcal: '', protein: '', carbs: '', fat: '', fiber: '' })
  const [creatingFood, setCreatingFood] = useState(false)
  // Default true preserves the existing shared-library behaviour; user can opt out.
  const [shareFood, setShareFood] = useState(true)
  // Holds a name+brand duplicate found at save time so we can offer the existing one.
  const [dupeMatch, setDupeMatch] = useState<CustomFood | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus search on mount
  useEffect(() => {
    inputRef.current?.focus()
    loadRecent()
  }, [])

  // Load custom foods when entering My Foods view
  useEffect(() => {
    if (view === 'myFoods') loadCustomFoods()
  }, [view])

  // ── Data loaders ─────────────────────────────────────────────────────────

  async function loadRecent() {
    const supabase = createClient()
    const { data: rawData } = await supabase
      .from('food_logs')
      .select('food_name,kcal,protein_g,carbs_g,fat_g,fiber_g,serving_g,usda_food_id')
      .order('created_at', { ascending: false })
      .limit(30)

    type Row = { food_name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number | null; serving_g: number; usda_food_id: string | null }
    const data = rawData as Row[] | null
    if (!data) return

    const seen = new Set<string>()
    const unique: FoodResult[] = []
    for (const log of data) {
      if (seen.has(log.food_name)) continue
      seen.add(log.food_name)
      const sg = Number(log.serving_g)
      unique.push({
        id: log.usda_food_id ?? `recent-${log.food_name}`,
        source: 'usda',
        name: log.food_name,
        kcalPer100g: sg > 0 ? (Number(log.kcal) / sg) * 100 : Number(log.kcal),
        proteinPer100g: sg > 0 ? (Number(log.protein_g) / sg) * 100 : Number(log.protein_g),
        carbsPer100g: sg > 0 ? (Number(log.carbs_g) / sg) * 100 : Number(log.carbs_g),
        fatPer100g: sg > 0 ? (Number(log.fat_g) / sg) * 100 : Number(log.fat_g),
        fiberPer100g: 0,
        servingG: sg,
      })
      if (unique.length >= 10) break
    }
    setRecentLogs(unique)
  }

  async function loadCustomFoods() {
    setMyFoodsLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('custom_foods')
      .select('id,name,brand,serving_g,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,fiber_per_100g')
      .order('created_at', { ascending: false })
    setCustomFoods((data ?? []) as CustomFood[])
    setMyFoodsLoading(false)
  }

  // ── Search ────────────────────────────────────────────────────────────────

  const search = useCallback(async (q: string, src: SourceFilter) => {
    if (q.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    try {
      const endpoint =
        src === 'nutritionix'
          ? `/api/food/restaurant?q=${encodeURIComponent(q)}`
          : `/api/food/search?q=${encodeURIComponent(q)}`
      const res = await fetch(endpoint)
      const json = await res.json()
      setResults(json.results ?? [])
    } catch { setResults([]) }
    setSearching(false)
  }, [])

  function handleQueryChange(val: string) {
    setQuery(val)
    setShowRecent(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val, source), 300)
  }

  function handleSourceChange(s: SourceFilter) {
    setSource(s)
    if (query.length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => search(query, s), 150)
    }
  }

  // Derived display list
  const filteredResults = source === 'all' || source === 'nutritionix'
    ? results
    : results.filter(r => r.source === source)
  const displayList = showRecent ? recentLogs : applySort(filteredResults, sortBy)

  // ── Barcode ───────────────────────────────────────────────────────────────

  async function handleBarcodeDetected(code: string) {
    setScannerOpen(false)
    setBarcodeLoading(true)
    setBarcodeNotFound(false)
    try {
      const res = await fetch(`/api/food/barcode?code=${encodeURIComponent(code)}`)
      const json = await res.json()
      if (json.food) {
        openSheet(json.food as FoodResult)
      } else {
        setBarcodeNotFound(true)
      }
    } catch {
      setBarcodeNotFound(true)
    }
    setBarcodeLoading(false)
  }

  // ── Bottom sheet ──────────────────────────────────────────────────────────

  function openSheet(food: FoodResult) {
    setSelectedFood(food)
    // Default to 1 serving when the food has a meaningful serving size, otherwise 100g
    if (food.servingG && food.servingG !== 100) {
      setServingQty('1')
      setServingUnit('serving')
    } else {
      setServingQty('100')
      setServingUnit('g')
    }
    setSheetVisible(false)
    requestAnimationFrame(() => setSheetVisible(true))
  }

  function closeSheet() {
    setSheetVisible(false)
    setTimeout(() => setSelectedFood(null), 300)
  }

  // ── Log actions ───────────────────────────────────────────────────────────

  async function handleLog() {
    if (!selectedFood || logging) return
    const qty = parseFloat(servingQty) || 0
    const actualG = toGrams(qty, servingUnit, selectedFood.servingG)
    if (actualG <= 0) return
    setLogging(true)
    setLogError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLogging(false); return }

    // Scaled macros for the actual amount consumed
    const kcalScaled = m(selectedFood.kcalPer100g, actualG)
    const proteinScaled = m(selectedFood.proteinPer100g, actualG)
    const carbsScaled = m(selectedFood.carbsPer100g, actualG)
    const fatScaled = m(selectedFood.fatPer100g, actualG)
    const fiberScaled = m(selectedFood.fiberPer100g, actualG)
    // grams represented by ONE of the chosen unit (serving_size × servings = serving_g)
    const perUnitG = qty > 0 ? Math.round((actualG / qty) * 1000) / 1000 : actualG

    // Legacy columns (always present since the initial schema).
    const legacy = {
      user_id: user.id,
      logged_date: loggingDate,
      meal_type: selectedMeal,
      food_name: selectedFood.name,
      serving_g: Math.round(actualG * 10) / 10,
      kcal: kcalScaled,
      protein_g: proteinScaled,
      carbs_g: carbsScaled,
      fat_g: fatScaled,
      fiber_g: fiberScaled,
      usda_food_id: selectedFood.source === 'usda' ? selectedFood.id : null,
      off_food_id: selectedFood.source === 'off' ? selectedFood.id : null,
      custom_food_id: selectedFood.customFoodId ?? null,
    }
    // Serving-model columns (migration 004/006): persist the actual amount consumed.
    // serving_size = the quantity typed, serving_unit = its unit, servings = 1.
    // (servings is numeric(5,3) → must stay small; the amount lives in serving_size.)
    const serving = {
      logged_at: loggingDate,
      brand: selectedFood.brand ?? null,
      source: selectedFood.source,
      source_id: selectedFood.id ?? null,
      serving_size: Math.round(qty * 100) / 100,
      serving_unit: servingUnit,
      servings: 1,
      calories: kcalScaled,
      protein: proteinScaled,
      carbs: carbsScaled,
      fat: fatScaled,
      fiber: fiberScaled,
    }

    const error = await insertFoodLog(supabase, legacy, serving)
    if (error) {
      setLogError(error.message)
      setLogging(false)
      return
    }

    window.location.href = '/today'
  }

  async function handleQuickAdd() {
    const kcal = parseFloat(quickAdd.kcal)
    if (!quickAdd.name || !kcal) return
    setLogging(true)
    setLogError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLogging(false); return }

    const qaQtyNum = parseFloat(qaQty) || 100
    const actualG = toGrams(qaQtyNum, qaUnit)
    const proteinTotal = parseFloat(quickAdd.protein) || 0
    const carbsTotal = parseFloat(quickAdd.carbs) || 0
    const fatTotal = parseFloat(quickAdd.fat) || 0
    const legacy = {
      user_id: user.id,
      logged_date: loggingDate,
      meal_type: selectedMeal,
      food_name: quickAdd.name,
      serving_g: Math.round(actualG * 10) / 10,
      kcal,
      protein_g: proteinTotal,
      carbs_g: carbsTotal,
      fat_g: fatTotal,
    }
    // Serving model: quick-add macros are entered as totals for the amount.
    // serving_size = quantity typed, serving_unit = its unit, servings = 1.
    const serving = {
      logged_at: loggingDate,
      source: 'manual',
      serving_size: Math.round(qaQtyNum * 100) / 100,
      serving_unit: qaUnit,
      servings: 1,
      calories: kcal,
      protein: proteinTotal,
      carbs: carbsTotal,
      fat: fatTotal,
    }

    const error = await insertFoodLog(supabase, legacy, serving)
    if (error) {
      setLogError(error.message)
      setLogging(false)
      return
    }

    // Optionally save to the shared library as a reusable custom food.
    if (qaShare && actualG > 0) {
      const nameNorm = quickAdd.name.trim().toLowerCase()
      // Dedupe by lowercased name against the user-accessible library.
      const dupe = await supabase
        .from('custom_foods')
        .select('id, name')
        .ilike('name', quickAdd.name.trim())
        .limit(50)
      type CFLite = { id: string; name: string }
      const rows = (dupe.data ?? []) as CFLite[]
      const exists = rows.some(r => r.name.trim().toLowerCase() === nameNorm)
      if (!exists) {
        // Convert the entered totals to per-100g for custom_foods storage.
        const per100 = (v: number) => Math.round((v / actualG) * 100 * 100) / 100
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('custom_foods') as any).insert({
          created_by: user.id,
          name: quickAdd.name.trim(),
          brand: null,
          serving_g: Math.round(actualG * 10) / 10,
          kcal_per_100g: per100(kcal),
          protein_per_100g: per100(proteinTotal),
          carbs_per_100g: per100(carbsTotal),
          fat_per_100g: per100(fatTotal),
          fiber_per_100g: null,
          is_shared: true,
        })
      }
    }

    window.location.href = '/today'
  }

  async function handleCreateCustomFood(skipDupeCheck = false) {
    const kcal = parseFloat(newFood.kcal)
    if (!newFood.name || !kcal) return

    // Dedupe against the accessible custom-food library (shared + own) by
    // lowercased name + brand. customFoods is already loaded for this view.
    if (!skipDupeCheck) {
      const nameNorm = newFood.name.trim().toLowerCase()
      const brandNorm = newFood.brand.trim().toLowerCase()
      const existing = customFoods.find(cf =>
        cf.name.trim().toLowerCase() === nameNorm &&
        (cf.brand ?? '').trim().toLowerCase() === brandNorm
      )
      if (existing) { setDupeMatch(existing); return }
    }

    setCreatingFood(true)
    setDupeMatch(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCreatingFood(false); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('custom_foods') as any).insert({
      created_by: user.id,
      name: newFood.name.trim(),
      brand: newFood.brand.trim() || null,
      serving_g: parseFloat(newFood.serving) || 100,
      kcal_per_100g: kcal,
      protein_per_100g: parseFloat(newFood.protein) || 0,
      carbs_per_100g: parseFloat(newFood.carbs) || 0,
      fat_per_100g: parseFloat(newFood.fat) || 0,
      fiber_per_100g: parseFloat(newFood.fiber) || null,
      is_shared: shareFood,
    })

    setCreatingFood(false)
    setShowCreateForm(false)
    setNewFood({ name: '', brand: '', serving: '100', kcal: '', protein: '', carbs: '', fat: '', fiber: '' })
    setShareFood(true)
    loadCustomFoods()
  }

  /** User picked the existing duplicate instead of creating a new row. */
  function useExistingDupe() {
    if (!dupeMatch) return
    const match = dupeMatch
    setDupeMatch(null)
    setShowCreateForm(false)
    setNewFood({ name: '', brand: '', serving: '100', kcal: '', protein: '', carbs: '', fat: '', fiber: '' })
    setShareFood(true)
    openSheet(customToResult(match))
  }

  // ── Preview macros ────────────────────────────────────────────────────────

  const previewG = toGrams(parseFloat(servingQty) || 0, servingUnit, selectedFood?.servingG ?? 100)
  const previewKcal = selectedFood ? m(selectedFood.kcalPer100g, previewG) : 0
  const previewProtein = selectedFood ? m(selectedFood.proteinPer100g, previewG) : 0
  const previewCarbs = selectedFood ? m(selectedFood.carbsPer100g, previewG) : 0
  const previewFat = selectedFood ? m(selectedFood.fatPer100g, previewG) : 0

  // ── Filtered custom foods for My Foods view ───────────────────────────────
  const filteredCustomFoods = myFoodsQuery.length < 2
    ? customFoods
    : customFoods.filter(cf =>
        cf.name.toLowerCase().includes(myFoodsQuery.toLowerCase()) ||
        (cf.brand ?? '').toLowerCase().includes(myFoodsQuery.toLowerCase())
      )

  // ── Source badge color ────────────────────────────────────────────────────
  function sourceBadge(src: FoodResult['source']) {
    if (src === 'off')         return 'PACKAGED'
    if (src === 'fatsecret')   return 'FATSECRET'
    if (src === 'nutritionix') return 'RESTAURANT'
    if (src === 'custom')      return 'MY FOODS'
    return 'USDA'
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div className="screen" style={{ paddingTop: 0 }}>

      {/* ── Weight entry modal ── */}
      {showWeightEntry && (
        <WeightEntry
          onClose={() => setShowWeightEntry(false)}
          onSaved={async (shouldRecalculate) => {
            setShowWeightEntry(false)
            if (shouldRecalculate) {
              fetch('/api/tdee/calculate', { method: 'POST' }).catch(() => {})
            }
          }}
        />
      )}

      {/* ── Barcode scanner modal ── */}
      {scannerOpen && (
        <BarcodeScanner
          onDetect={handleBarcodeDetected}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-4)',
      }}>
        <button
          onClick={() => {
            if (view !== 'search') { setView('search'); return }
            router.back()
          }}
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
          {view === 'quickAdd' ? 'QUICK ADD' : view === 'myFoods' ? 'MY FOODS' : 'LOG FOOD'}
        </span>

        {/* Recipe maker link (visible in search view) */}
        {view === 'search' && (
          <button
            onClick={() => router.push('/recipe')}
            style={{
              marginLeft: 'auto',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-dim)',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700, fontSize: '10px',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 2V12M2 7H12" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            RECIPE
          </button>
        )}

        {/* Cancel quick-add */}
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

        {/* Create food in My Foods */}
        {view === 'myFoods' && !showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--color-accent)',
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
              fontSize: '11px', letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
            }}
          >
            + CREATE
          </button>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          QUICK ADD VIEW
      ════════════════════════════════════════════════════════════════════ */}
      {view === 'quickAdd' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <input placeholder="FOOD NAME" value={quickAdd.name}
            onChange={e => setQuickAdd(q => ({ ...q, name: e.target.value }))}
            style={inputStyle} autoFocus />
          <input type="number" placeholder="CALORIES (KCAL)" value={quickAdd.kcal}
            onChange={e => setQuickAdd(q => ({ ...q, kcal: e.target.value }))}
            style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' }}>
            {(['protein', 'carbs', 'fat'] as const).map(macro => (
              <input key={macro} type="number"
                placeholder={macro.toUpperCase() + ' G'}
                value={quickAdd[macro]}
                onChange={e => setQuickAdd(q => ({ ...q, [macro]: e.target.value }))}
                style={inputStyle} />
            ))}
          </div>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '9px', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: 'var(--space-2)' }}>
              SERVING SIZE
            </div>
            <UnitPicker
              qty={qaQty}
              unit={qaUnit}
              onQtyChange={setQaQty}
              onUnitChange={setQaUnit}
              showServing={false}
            />
          </div>
          <MealSelector selected={selectedMeal} onChange={setSelectedMeal} />

          {/* Share with everyone toggle */}
          <button
            onClick={() => setQaShare(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, textAlign: 'left', width: '100%',
            }}
          >
            <div style={{
              width: '18px', height: '18px', flexShrink: 0,
              border: `1px solid ${qaShare ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: qaShare ? 'var(--color-accent)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {qaShare && (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M2 5.5L4.5 8L9 3" stroke="#fff" strokeWidth="1.6" />
                </svg>
              )}
            </div>
            <span style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
              fontSize: '11px', letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase', color: 'var(--color-text)',
            }}>
              SHARE WITH EVERYONE
            </span>
          </button>

          {logError && (
            <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-danger)' }}>
              {logError}
            </div>
          )}

          <button onClick={handleQuickAdd} disabled={logging || !quickAdd.name || !quickAdd.kcal}
            style={logBtnStyle(logging || !quickAdd.name || !quickAdd.kcal)}>
            {logging ? 'LOGGING...' : 'LOG'}
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MY FOODS VIEW
      ════════════════════════════════════════════════════════════════════ */}
      {view === 'myFoods' && (
        <div>
          {/* Create food form */}
          {showCreateForm && (
            <div style={{
              border: '1px solid var(--color-accent)',
              padding: 'var(--space-4)',
              marginBottom: 'var(--space-5)',
              display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
            }}>
              <div style={{
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                fontSize: '9px', letterSpacing: 'var(--tracking-wide)',
                textTransform: 'uppercase', color: 'var(--color-accent)',
                marginBottom: 'var(--space-1)',
              }}>
                CREATE CUSTOM FOOD
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <input placeholder="FOOD NAME *" value={newFood.name}
                  onChange={e => setNewFood(f => ({ ...f, name: e.target.value }))}
                  style={{ ...inputStyle, gridColumn: '1 / -1' }} autoFocus />
                <input placeholder="BRAND (optional)" value={newFood.brand}
                  onChange={e => setNewFood(f => ({ ...f, brand: e.target.value }))}
                  style={{ ...inputStyle, gridColumn: '1 / -1' }} />
                <input type="number" placeholder="SERVING G" value={newFood.serving}
                  onChange={e => setNewFood(f => ({ ...f, serving: e.target.value }))}
                  style={inputStyle} />
                <input type="number" placeholder="KCAL / 100G *" value={newFood.kcal}
                  onChange={e => setNewFood(f => ({ ...f, kcal: e.target.value }))}
                  style={inputStyle} />
                <input type="number" placeholder="PROTEIN G / 100G" value={newFood.protein}
                  onChange={e => setNewFood(f => ({ ...f, protein: e.target.value }))}
                  style={inputStyle} />
                <input type="number" placeholder="CARBS G / 100G" value={newFood.carbs}
                  onChange={e => setNewFood(f => ({ ...f, carbs: e.target.value }))}
                  style={inputStyle} />
                <input type="number" placeholder="FAT G / 100G" value={newFood.fat}
                  onChange={e => setNewFood(f => ({ ...f, fat: e.target.value }))}
                  style={inputStyle} />
                <input type="number" placeholder="FIBER G / 100G" value={newFood.fiber}
                  onChange={e => setNewFood(f => ({ ...f, fiber: e.target.value }))}
                  style={inputStyle} />
              </div>

              {/* Share with everyone toggle */}
              <button
                onClick={() => setShareFood(s => !s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 0, textAlign: 'left', width: '100%',
                }}
              >
                <div style={{
                  width: '18px', height: '18px', flexShrink: 0,
                  border: `1px solid ${shareFood ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: shareFood ? 'var(--color-accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {shareFood && (
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2 5.5L4.5 8L9 3" stroke="#fff" strokeWidth="1.6" />
                    </svg>
                  )}
                </div>
                <span style={{
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                  fontSize: '11px', letterSpacing: 'var(--tracking-wide)',
                  textTransform: 'uppercase', color: 'var(--color-text)',
                }}>
                  SHARE WITH EVERYONE
                </span>
              </button>

              {/* Duplicate found banner */}
              {dupeMatch && (
                <div style={{ border: '1px solid var(--color-warning)', padding: 'var(--space-3)' }}>
                  <div style={{
                    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                    fontSize: '10px', letterSpacing: 'var(--tracking-wide)',
                    textTransform: 'uppercase', color: 'var(--color-warning)',
                    marginBottom: 'var(--space-2)',
                  }}>
                    ALREADY EXISTS: {dupeMatch.name}{dupeMatch.brand ? ` · ${dupeMatch.brand}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button onClick={useExistingDupe}
                      style={{ ...logBtnStyle(false), flex: 1, fontSize: '13px', padding: 'var(--space-3)' }}>
                      USE EXISTING
                    </button>
                    <button onClick={() => handleCreateCustomFood(true)}
                      style={{
                        flex: 1, padding: 'var(--space-3)',
                        background: 'none', border: '1px solid var(--color-border)',
                        cursor: 'pointer', color: 'var(--color-text-dim)',
                        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                        fontSize: '13px', letterSpacing: 'var(--tracking-wide)',
                        textTransform: 'uppercase',
                      }}>
                      SAVE ANYWAY
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button onClick={() => handleCreateCustomFood()}
                  disabled={creatingFood || !newFood.name || !newFood.kcal}
                  style={{ ...logBtnStyle(creatingFood || !newFood.name || !newFood.kcal), flex: 1 }}>
                  {creatingFood ? 'SAVING...' : 'SAVE FOOD'}
                </button>
                <button onClick={() => { setShowCreateForm(false); setDupeMatch(null) }} style={{
                  padding: 'var(--space-4) var(--space-5)',
                  background: 'none',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  color: 'var(--color-text-dim)',
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                  fontSize: '14px',
                  letterSpacing: 'var(--tracking-wide)',
                }}>
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Search within my foods */}
          <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
            <input
              type="search"
              placeholder="Filter my foods..."
              value={myFoodsQuery}
              onChange={e => setMyFoodsQuery(e.target.value)}
              style={{ ...inputStyle, paddingLeft: '14px' }}
            />
          </div>

          {myFoodsLoading ? (
            <div style={{ textAlign: 'center', paddingTop: 'var(--space-8)' }}>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '11px', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-text-dim)' }}>
                LOADING...
              </span>
            </div>
          ) : filteredCustomFoods.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 'var(--space-8)' }}>
              <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 'var(--text-label)', letterSpacing: 'var(--tracking-loose)', textTransform: 'uppercase', color: 'var(--color-text-dim)' }}>
                {customFoods.length === 0 ? 'NO CUSTOM FOODS YET' : 'NO MATCHES'}
              </p>
              {customFoods.length === 0 && (
                <button onClick={() => setShowCreateForm(true)} style={{
                  marginTop: 'var(--space-4)',
                  background: 'none', border: '1px solid var(--color-border)',
                  cursor: 'pointer', padding: '10px 20px',
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                  fontSize: '12px', letterSpacing: 'var(--tracking-wide)',
                  textTransform: 'uppercase', color: 'var(--color-text)',
                }}>
                  + CREATE FIRST FOOD
                </button>
              )}
            </div>
          ) : (
            <div style={{ borderTop: '1px solid var(--color-border-soft)' }}>
              {filteredCustomFoods.map(cf => (
                <button key={cf.id} onClick={() => openSheet(customToResult(cf))}
                  style={foodRowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={foodNameStyle}>{cf.name}</div>
                    {cf.brand && <div style={foodSubStyle}>{cf.brand}</div>}
                    <div style={foodSubStyle}>
                      per 100g · P {Math.round(cf.protein_per_100g)}g · C {Math.round(cf.carbs_per_100g)}g · F {Math.round(cf.fat_per_100g)}g
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <span style={kcalStyle}>{Math.round(cf.kcal_per_100g)}</span>
                    <div style={kcalLabelStyle}>kcal</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SEARCH VIEW
      ════════════════════════════════════════════════════════════════════ */}
      {view === 'search' && (
        <>
          {/* Barcode loading indicator */}
          {barcodeLoading && (
            <div style={{
              textAlign: 'center', padding: 'var(--space-5)',
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
              fontSize: '12px', letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase', color: 'var(--color-text-dim)',
            }}>
              LOOKING UP BARCODE...
            </div>
          )}

          {/* Barcode not found */}
          {barcodeNotFound && !barcodeLoading && (
            <div style={{
              border: '1px solid var(--color-border)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-4)',
              textAlign: 'center',
            }}>
              <p style={{
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                fontSize: 'var(--text-label)', letterSpacing: 'var(--tracking-loose)',
                textTransform: 'uppercase', color: 'var(--color-text-dim)',
                marginBottom: 'var(--space-3)',
              }}>
                FOOD NOT FOUND
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
                <button onClick={() => { setBarcodeNotFound(false); setScannerOpen(true) }}
                  style={{
                    padding: '8px 16px',
                    background: 'none', border: '1px solid var(--color-border)',
                    cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                    fontSize: '11px', letterSpacing: 'var(--tracking-wide)',
                    textTransform: 'uppercase', color: 'var(--color-text)',
                  }}>
                  SCAN AGAIN
                </button>
                <button onClick={() => { setBarcodeNotFound(false); setView('quickAdd') }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--color-accent)', border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                    fontSize: '11px', letterSpacing: 'var(--tracking-wide)',
                    textTransform: 'uppercase', color: '#fff',
                  }}>
                  ADD MANUALLY
                </button>
              </div>
            </div>
          )}

          {/* Search bar */}
          <div style={{ position: 'relative', marginBottom: 'var(--space-3)' }}>
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
                <div style={{ width: '14px', height: '14px', border: '1.5px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              </div>
            )}
          </div>

          {/* Source tabs — visible when searching or has results */}
          {(query.length >= 2 || results.length > 0) && (
            <div style={{ display: 'flex', gap: '1px', background: 'var(--color-border)', marginBottom: 'var(--space-3)' }}>
              {([
                { key: 'all', label: 'ALL' },
                { key: 'usda', label: 'USDA' },
                { key: 'off', label: 'PACKAGED' },
                { key: 'nutritionix', label: 'RESTAURANT' },
              ] as { key: SourceFilter; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handleSourceChange(key)}
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    background: source === key ? 'var(--color-accent)' : 'var(--color-surface)',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: '9px',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    color: source === key ? '#fff' : 'var(--color-text-dim)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Sort pills — visible when there are results */}
          {displayList.length > 0 && !showRecent && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
              {([
                { key: 'relevance', label: 'RELEVANCE' },
                { key: 'protein', label: 'MOST PROTEIN' },
                { key: 'kcal_asc', label: 'FEWEST KCAL' },
                { key: 'kcal_desc', label: 'MOST KCAL' },
              ] as { key: SortOption; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  style={{
                    padding: '4px 10px',
                    border: `1px solid ${sortBy === key ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: '9px',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    color: sortBy === key ? 'var(--color-accent)' : 'var(--color-text-dim)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Quick action grid — shown when idle */}
          {!query && !showRecent && (
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1px',
                background: 'var(--color-border)',
                marginBottom: '1px',
              }}>
                {[
                  { label: 'SCAN BARCODE', icon: barcodeIcon, action: () => setScannerOpen(true) },
                  { label: 'QUICK ADD', icon: plusIcon, action: () => setView('quickAdd') },
                  { label: 'MY FOODS', icon: listIcon, action: () => setView('myFoods') },
                  { label: 'RECENT', icon: clockIcon, action: () => setShowRecent(true) },
                ].map(({ label, icon, action }) => (
                  <button
                    key={label}
                    onClick={action}
                    style={{
                      background: 'var(--color-surface)',
                      border: 'none', cursor: 'pointer',
                      padding: 'var(--space-5) var(--space-4)',
                      display: 'flex', flexDirection: 'column',
                      gap: 'var(--space-2)', alignItems: 'flex-start', textAlign: 'left',
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
              {/* Full-width LOG WEIGHT tile */}
              <button
                onClick={() => setShowWeightEntry(true)}
                style={{
                  width: '100%',
                  background: 'var(--color-surface)',
                  border: 'none', cursor: 'pointer',
                  padding: 'var(--space-5) var(--space-4)',
                  display: 'flex', flexDirection: 'row',
                  alignItems: 'center', gap: 'var(--space-3)', textAlign: 'left',
                }}
              >
                <div style={{ color: 'var(--color-text-dim)' }}>{scaleIcon}</div>
                <span style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: 'var(--text-label)',
                  letterSpacing: 'var(--tracking-wide)',
                  textTransform: 'uppercase',
                  color: 'var(--color-text)',
                }}>
                  LOG WEIGHT
                </span>
              </button>
            </div>
          )}

          {/* Recent header */}
          {showRecent && !query && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 'var(--text-label)', letterSpacing: 'var(--tracking-loose)', textTransform: 'uppercase', color: 'var(--color-text)' }}>
                RECENT
              </span>
              <button onClick={() => setShowRecent(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase' }}>
                BACK
              </button>
            </div>
          )}

          {/* Results list */}
          {displayList.length > 0 && (
            <div style={{ borderTop: '1px solid var(--color-border-soft)' }}>
              {displayList.map(food => (
                <button key={food.id} onClick={() => openSheet(food)} style={foodRowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={foodNameStyle}>{food.name}</div>
                    {food.brand && <div style={foodSubStyle}>{food.brand}</div>}
                    <div style={{ ...foodSubStyle, marginTop: '2px' }}>
                      per 100g · P {Math.round(food.proteinPer100g)}g · C {Math.round(food.carbsPer100g)}g · F {Math.round(food.fatPer100g)}g
                      {food.source !== 'usda' && (
                        <span style={{ marginLeft: '6px', color: 'var(--color-accent)', fontWeight: 700, fontSize: '8px' }}>
                          {sourceBadge(food.source)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <span style={kcalStyle}>{Math.round(food.kcalPer100g)}</span>
                    <div style={kcalLabelStyle}>kcal</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Empty search state */}
          {query.length >= 2 && !searching && filteredResults.length === 0 && (
            <div style={{ paddingTop: 'var(--space-8)', textAlign: 'center' }}>
              <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 'var(--text-label)', letterSpacing: 'var(--tracking-loose)', textTransform: 'uppercase', color: 'var(--color-text-dim)' }}>
                NO RESULTS FOR &quot;{query.toUpperCase()}&quot;
              </p>
              <button onClick={() => setView('quickAdd')}
                style={{ marginTop: 'var(--space-4)', background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer', padding: '10px 20px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '12px', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-text)' }}>
                + QUICK ADD MANUALLY
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Backdrop ── */}
      {selectedFood && (
        <div onClick={closeSheet} style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 200,
          opacity: sheetVisible ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }} />
      )}

      {/* ── Bottom sheet ── */}
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
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <div style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 600, fontSize: '14px', color: 'var(--color-text)', marginBottom: '2px' }}>
              {selectedFood.name}
            </div>
            {selectedFood.brand && (
              <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 'var(--text-micro)', color: 'var(--color-text-dim)' }}>
                {selectedFood.brand}
              </div>
            )}
          </div>

          {/* Live macro preview grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--color-border)', marginBottom: 'var(--space-5)' }}>
            {[
              { label: 'KCAL', value: previewKcal, color: 'var(--color-text)' },
              { label: 'PROTEIN', value: previewProtein, color: 'var(--color-macro-protein)' },
              { label: 'CARBS', value: previewCarbs, color: 'var(--color-macro-carbs)' },
              { label: 'FAT', value: previewFat, color: 'var(--color-macro-fat)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--color-bg)', padding: '10px 8px' }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '20px', letterSpacing: 'var(--tracking-tight)', color, lineHeight: 1 }}>
                  {value}
                </div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '8px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginTop: '2px' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Serving input */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '9px', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: 'var(--space-2)' }}>
              SERVING SIZE
            </div>
            <UnitPicker
              qty={servingQty}
              unit={servingUnit}
              onQtyChange={setServingQty}
              onUnitChange={setServingUnit}
              showServing={true}
              servingG={selectedFood?.servingG ?? 100}
            />
          </div>

          <MealSelector selected={selectedMeal} onChange={setSelectedMeal} />

          {logError ? (
            <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '12px', color: 'var(--color-danger)', marginBottom: '8px' }}>
              {logError}
            </div>
          ) : null}

          <button onClick={handleLog}
            disabled={logging || previewG <= 0}
            style={logBtnStyle(logging || previewG <= 0)}>
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

// ── Sub-components ────────────────────────────────────────────────────────────

function MealSelector({ selected, onChange }: { selected: MealType; onChange: (m: MealType) => void }) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '9px', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: 'var(--space-2)' }}>
        LOG TO
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {MEAL_TYPES.map(type => (
          <button key={type} onClick={() => onChange(type)} style={{
            padding: '5px 10px',
            border: `1px solid ${selected === type ? 'var(--color-accent)' : 'var(--color-border)'}`,
            backgroundColor: selected === type ? 'var(--color-accent)' : 'transparent',
            color: selected === type ? '#fff' : 'var(--color-text-dim)',
            cursor: 'pointer',
            borderRadius: 0,
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700, fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase',
          }}>
            {MEAL_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

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

const foodRowStyle: React.CSSProperties = {
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
}

const foodNameStyle: React.CSSProperties = {
  fontFamily: "'Barlow', sans-serif",
  fontWeight: 500,
  fontSize: 'var(--text-body)',
  color: 'var(--color-text)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const foodSubStyle: React.CSSProperties = {
  fontFamily: "'Barlow', sans-serif",
  fontSize: 'var(--text-micro)',
  color: 'var(--color-text-dim)',
  marginTop: '1px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const kcalStyle: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: '22px',
  letterSpacing: 'var(--tracking-tight)',
  color: 'var(--color-text)',
  lineHeight: 1,
}

const kcalLabelStyle: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 700,
  fontSize: '8px',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: 'var(--color-text-dim)',
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

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
const scaleIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M3 16L5 8H15L17 16H3Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 8C7 6 8 4 10 4C12 4 13 6 13 8" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 4V2" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

// ── Suspense wrapper ──────────────────────────────────────────────────────────

export default function LogPage() {
  return (
    <Suspense>
      <LogPageInner />
    </Suspense>
  )
}
