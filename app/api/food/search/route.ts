import { NextResponse } from 'next/server'
import type { FoodResult } from '@/types/food'
import { createClient } from '@/lib/supabase/server'
import { searchFatSecret, fatSecretToFoodResult } from '@/lib/fatsecret'

// ── USDA FoodData Central ─────────────────────────────────────────────────────

function getNutrient(
  nutrients: Array<{ nutrientId: number; value: number }>,
  id: number,
): number {
  return nutrients.find(n => n.nutrientId === id)?.value ?? 0
}

async function searchUSDA(q: string): Promise<FoodResult[]> {
  const apiKey = process.env.USDA_API_KEY ?? 'DEMO_KEY'
  const res = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(q)}&pageSize=25&api_key=${apiKey}`,
    { next: { revalidate: 3600 } },
  )
  if (!res.ok) return []
  const json = await res.json()
  return (json.foods ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((food: any): FoodResult | null => {
      const nutrients: Array<{ nutrientId: number; value: number }> =
        food.foodNutrients ?? []
      const kcal = getNutrient(nutrients, 1008)
      if (kcal === 0) return null
      return {
        id:             String(food.fdcId),
        source:         'usda',
        name:           food.description,
        brand:          food.brandOwner ?? food.brandName ?? undefined,
        kcalPer100g:    kcal,
        proteinPer100g: getNutrient(nutrients, 1003),
        carbsPer100g:   getNutrient(nutrients, 1005),
        fatPer100g:     getNutrient(nutrients, 1004),
        fiberPer100g:   getNutrient(nutrients, 1079),
        servingG:
          food.servingSize && food.servingSizeUnit === 'g' ? food.servingSize : 100,
      }
    })
    .filter((f: FoodResult | null): f is FoodResult => f !== null)
    .slice(0, 20)
}

// ── Open Food Facts ───────────────────────────────────────────────────────────

async function searchOFF(q: string): Promise<FoodResult[]> {
  const res = await fetch(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&json=1&page_size=10&fields=id,product_name,product_name_en,brands,nutriments,serving_size`,
    { next: { revalidate: 3600 } },
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.products ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any): FoodResult | null => {
      const n    = p.nutriments ?? {}
      const kcal: number =
        n['energy-kcal_100g'] ??
        (n['energy_100g'] ? Math.round(n['energy_100g'] / 4.184) : 0)
      if (!kcal) return null
      const name: string = p.product_name || p.product_name_en || ''
      if (!name) return null
      const servingMatch = String(p.serving_size ?? '').match(/(\d+(\.\d+)?)/)
      return {
        id:             p.id ?? p._id ?? p.product_name,
        source:         'off',
        name,
        brand:          p.brands ?? undefined,
        kcalPer100g:    kcal,
        proteinPer100g: n['proteins_100g']      ?? 0,
        carbsPer100g:   n['carbohydrates_100g'] ?? 0,
        fatPer100g:     n['fat_100g']           ?? 0,
        fiberPer100g:   n['fiber_100g']         ?? 0,
        servingG:       servingMatch ? parseFloat(servingMatch[1]) : 100,
      }
    })
    .filter((f: FoodResult | null): f is FoodResult => f !== null)
    .slice(0, 10)
}

// ── Custom foods (Supabase, RLS enforced) ─────────────────────────────────────

async function searchCustomFoods(q: string): Promise<FoodResult[]> {
  try {
    const supabase = createClient()
    // Types file not yet regenerated — cast to avoid TS errors on new columns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('custom_foods')
      .select(
        'id, name, brand, serving_g, kcal_per_100g, ' +
        'protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g',
      )
      .or(`name.ilike.%${q}%,brand.ilike.%${q}%`)
      .limit(20)

    if (!data) return []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((f): FoodResult => ({
      id:             f.id,
      source:         'custom',
      name:           f.name,
      brand:          f.brand             ?? undefined,
      kcalPer100g:    f.kcal_per_100g     ?? 0,
      proteinPer100g: f.protein_per_100g  ?? 0,
      carbsPer100g:   f.carbs_per_100g    ?? 0,
      fatPer100g:     f.fat_per_100g      ?? 0,
      fiberPer100g:   f.fiber_per_100g    ?? 0,
      servingG:       f.serving_g         ?? 100,
      customFoodId:   f.id,
    }))
  } catch {
    return []
  }
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function dedupe(results: FoodResult[]): FoodResult[] {
  const seen = new Set<string>()
  return results.filter(f => {
    const key = `${f.name.toLowerCase()}|${(f.brand ?? '').toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  try {
    // 1. Query custom_foods first (Supabase RLS auto-filters to shared + own)
    const customResults = await searchCustomFoods(q)

    // 2. 5+ custom results → skip all external APIs
    if (customResults.length >= 5) {
      return NextResponse.json({ results: customResults.slice(0, 20) })
    }

    // 3. OFF + USDA in parallel
    const [offResults, usdaResults] = await Promise.all([
      searchOFF(q),
      searchUSDA(q),
    ])
    const externalResults = [...offResults, ...usdaResults]

    // 4. Combined external < 5 → also hit FatSecret
    let fatSecretResults: FoodResult[] = []
    if (externalResults.length < 5) {
      const fsRaw = await searchFatSecret(q)
      fatSecretResults = fsRaw.map(fatSecretToFoodResult)
    }

    // 5. Deduplicate by lowercased name + brand; custom_foods always first
    const combined = dedupe([
      ...customResults,
      ...externalResults,
      ...fatSecretResults,
    ])

    // 6. Return max 20
    return NextResponse.json({ results: combined.slice(0, 20) })
  } catch {
    return NextResponse.json({ results: [], error: 'Search failed' }, { status: 500 })
  }
}
