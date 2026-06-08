import { NextResponse } from 'next/server'
import type { FoodResult } from '@/types/food'

function getNutrient(
  nutrients: Array<{ nutrientId: number; value: number }>,
  id: number
): number {
  return nutrients.find(n => n.nutrientId === id)?.value ?? 0
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const apiKey = process.env.USDA_API_KEY ?? 'DEMO_KEY'

  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(q)}&pageSize=25&api_key=${apiKey}`,
      { next: { revalidate: 3600 } }
    )

    if (!res.ok) {
      return NextResponse.json({ results: [], error: `USDA error ${res.status}` })
    }

    const json = await res.json()

    const results: FoodResult[] = (json.foods ?? [])
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
          servingG: food.servingSize && food.servingSizeUnit === 'g'
            ? food.servingSize
            : 100,
        }
      })
      .filter((f: FoodResult | null): f is FoodResult => f !== null)
      .slice(0, 20)

    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ results: [], error: 'Search failed' }, { status: 500 })
  }
}
