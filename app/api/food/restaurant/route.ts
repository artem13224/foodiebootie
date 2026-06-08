import { NextResponse } from 'next/server'
import type { FoodResult } from '@/types/food'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const appId = process.env.NUTRITIONIX_APP_ID
  const appKey = process.env.NUTRITIONIX_APP_KEY

  if (!appId || !appKey || appId.startsWith('your-')) {
    return NextResponse.json({
      results: [],
      error: 'Nutritionix API not configured — add NUTRITIONIX_APP_ID and NUTRITIONIX_APP_KEY to .env.local',
    })
  }

  try {
    const res = await fetch('https://trackapi.nutritionix.com/v2/search/instant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': appId,
        'x-app-key': appKey,
        'x-remote-user-id': '0',
      },
      body: JSON.stringify({
        query: q,
        branded: true,
        common: false,
        self: false,
        branded_type: 1, // restaurant items
      }),
      next: { revalidate: 300 },
    })

    if (!res.ok) {
      return NextResponse.json({ results: [], error: `Nutritionix ${res.status}` })
    }

    const data = await res.json()

    const results: FoodResult[] = (data.branded ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any): FoodResult | null => {
        const servingG: number = item.serving_weight_grams ?? 100
        if (!servingG || servingG <= 0) return null
        const kcal: number = item.nf_calories ?? 0
        if (kcal === 0) return null
        const p100 = (v: number) => Math.round((v / servingG) * 1000) / 10
        return {
          id: item.nix_item_id ?? item.food_name,
          source: 'nutritionix',
          name: item.food_name,
          brand: item.brand_name ?? undefined,
          kcalPer100g: p100(kcal),
          proteinPer100g: p100(item.nf_protein ?? 0),
          carbsPer100g: p100(item.nf_total_carbohydrate ?? 0),
          fatPer100g: p100(item.nf_total_fat ?? 0),
          fiberPer100g: p100(item.nf_dietary_fiber ?? 0),
          servingG,
        }
      })
      .filter((f: FoodResult | null): f is FoodResult => f !== null)
      .slice(0, 20)

    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ results: [], error: 'Search failed' }, { status: 500 })
  }
}
