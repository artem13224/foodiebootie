import { NextResponse } from 'next/server'
import type { FoodResult } from '@/types/food'

function getNutrient(
  nutrients: Array<{ nutrientId: number; value: number }>,
  id: number
): number {
  return nutrients.find(n => n.nutrientId === id)?.value ?? 0
}

async function searchUSDA(q: string): Promise<FoodResult[]> {
  const apiKey = process.env.USDA_API_KEY ?? 'DEMO_KEY'
  const res = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(q)}&pageSize=25&api_key=${apiKey}`,
    { next: { revalidate: 3600 } }
  )
  if (!res.ok) return []
  const json = await res.json()
  return (json.foods ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((food: any): FoodResult | null => {
      const nutrients: Array<{ nutrientId: number; value: number }> = food.foodNutrients ?? []
      const kcal = getNutrient(nutrients, 1008)
      if (kcal === 0) return null
      return {
        id: String(food.fdcId),
        source: 'usda',
        name: food.description,
        brand: food.brandOwner ?? food.brandName ?? undefined,
        kcalPer100g: kcal,
        proteinPer100g: getNutrient(nutrients, 1003),
        carbsPer100g: getNutrient(nutrients, 1005),
        fatPer100g: getNutrient(nutrients, 1004),
        fiberPer100g: getNutrient(nutrients, 1079),
        servingG:
          food.servingSize && food.servingSizeUnit === 'g' ? food.servingSize : 100,
      }
    })
    .filter((f: FoodResult | null): f is FoodResult => f !== null)
    .slice(0, 20)
}

async function searchOFF(q: string): Promise<FoodResult[]> {
  const res = await fetch(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&json=1&page_size=10&fields=id,product_name,product_name_en,brands,nutriments,serving_size`,
    { next: { revalidate: 3600 } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.products ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any): FoodResult | null => {
      const n = p.nutriments ?? {}
      const kcal: number =
        n['energy-kcal_100g'] ??
        (n['energy_100g'] ? Math.round(n['energy_100g'] / 4.184) : 0)
      if (!kcal || kcal === 0) return null
      const name: string = p.product_name || p.product_name_en || ''
      if (!name) return null
      const servingMatch = String(p.serving_size ?? '').match(/(\d+(\.\d+)?)/)
      return {
        id: p.id ?? p._id ?? p.product_name,
        source: 'off',
        name,
        brand: p.brands ?? undefined,
        kcalPer100g: kcal,
        proteinPer100g: n['proteins_100g'] ?? 0,
        carbsPer100g: n['carbohydrates_100g'] ?? 0,
        fatPer100g: n['fat_100g'] ?? 0,
        fiberPer100g: n['fiber_100g'] ?? 0,
        servingG: servingMatch ? parseFloat(servingMatch[1]) : 100,
      }
    })
    .filter((f: FoodResult | null): f is FoodResult => f !== null)
    .slice(0, 10)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  try {
    const usdaResults = await searchUSDA(q)

    // Augment with OFF when USDA is sparse
    let offResults: FoodResult[] = []
    if (usdaResults.length < 5) {
      offResults = await searchOFF(q)
    }

    const results = [...usdaResults, ...offResults]
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ results: [], error: 'Search failed' }, { status: 500 })
  }
}
