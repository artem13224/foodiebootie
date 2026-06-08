import { NextResponse } from 'next/server'
import type { FoodResult } from '@/types/food'

function parseServingG(raw: string | undefined): number {
  if (!raw) return 100
  const m = raw.match(/(\d+(\.\d+)?)/)
  return m ? parseFloat(m[1]) : 100
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')?.trim()

  if (!code) {
    return NextResponse.json({ food: null, error: 'Missing barcode' }, { status: 400 })
  }

  // ── 1. Open Food Facts ───────────────────────────────────────────────────────
  try {
    const offRes = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}.json`,
      { next: { revalidate: 86400 } }
    )
    if (offRes.ok) {
      const data = await offRes.json()
      if (data.status === 'success' && data.product) {
        const p = data.product
        const n = p.nutriments ?? {}
        // OFF stores kcal as energy-kcal_100g; sometimes only kJ is present
        const kcal: number =
          n['energy-kcal_100g'] ??
          (n['energy_100g'] ? Math.round(n['energy_100g'] / 4.184) : 0)

        if (kcal > 0) {
          const food: FoodResult = {
            id: code,
            source: 'off',
            name: p.product_name || p.product_name_en || 'Unknown product',
            brand: p.brands ?? undefined,
            kcalPer100g: kcal,
            proteinPer100g: n['proteins_100g'] ?? 0,
            carbsPer100g: n['carbohydrates_100g'] ?? 0,
            fatPer100g: n['fat_100g'] ?? 0,
            fiberPer100g: n['fiber_100g'] ?? 0,
            servingG: parseServingG(p.serving_size),
          }
          return NextResponse.json({ food })
        }
      }
    }
  } catch {
    // fall through to Nutritionix
  }

  // ── 2. Nutritionix barcode ───────────────────────────────────────────────────
  const appId = process.env.NUTRITIONIX_APP_ID
  const appKey = process.env.NUTRITIONIX_APP_KEY

  if (appId && appKey && !appId.startsWith('your-')) {
    try {
      const nxRes = await fetch(
        `https://trackapi.nutritionix.com/v2/search/item?upc=${encodeURIComponent(code)}`,
        {
          headers: {
            'x-app-id': appId,
            'x-app-key': appKey,
            'x-remote-user-id': '0',
          },
          next: { revalidate: 86400 },
        }
      )
      if (nxRes.ok) {
        const data = await nxRes.json()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item: any = data.foods?.[0]
        if (item) {
          const servingG: number = item.serving_weight_grams ?? 100
          const p100 = (v: number) =>
            servingG > 0 ? Math.round((v / servingG) * 1000) / 10 : 0
          const food: FoodResult = {
            id: item.nix_item_id ?? code,
            source: 'nutritionix',
            name: item.food_name,
            brand: item.brand_name ?? undefined,
            kcalPer100g: p100(item.nf_calories ?? 0),
            proteinPer100g: p100(item.nf_protein ?? 0),
            carbsPer100g: p100(item.nf_total_carbohydrate ?? 0),
            fatPer100g: p100(item.nf_total_fat ?? 0),
            fiberPer100g: p100(item.nf_dietary_fiber ?? 0),
            servingG,
          }
          return NextResponse.json({ food })
        }
      }
    } catch {
      // not found
    }
  }

  return NextResponse.json({ food: null })
}
