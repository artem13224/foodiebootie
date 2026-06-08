import { NextResponse } from 'next/server'
import type { FoodResult } from '@/types/food'

function parseServingG(raw: string | undefined): number {
  if (!raw) return 100
  const m = raw.match(/(\d+(\.\d+)?)/)
  return m ? parseFloat(m[1]) : 100
}

function getNutrient(
  nutrients: Array<{ nutrientId: number; value: number }>,
  id: number,
): number {
  return nutrients.find(n => n.nutrientId === id)?.value ?? 0
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')?.trim()

  if (!code) {
    return NextResponse.json({ food: null, error: 'Missing barcode' }, { status: 400 })
  }

  // ── 1. Open Food Facts ────────────────────────────────────────────────────────
  // Good coverage of European + internationally distributed packaged goods.
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
    // fall through
  }

  // ── 2. USDA Branded Foods (UPC / GTIN lookup) ─────────────────────────────────
  // Best coverage of US retail brands (Kirkland, store brands, national brands).
  // USDA indexes the gtinUpc field in its search, so querying by barcode string
  // returns the exact branded food when it exists in the database.
  try {
    const apiKey = process.env.USDA_API_KEY ?? 'DEMO_KEY'
    // Search by code, restrict to Branded dataType, fetch small page for exact match
    const usdaRes = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(code)}&dataType=Branded&pageSize=5&api_key=${apiKey}`,
      { next: { revalidate: 86400 } }
    )
    if (usdaRes.ok) {
      const data = await usdaRes.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const foods: any[] = data.foods ?? []

      // USDA may store the UPC without a leading zero (UPC-A vs EAN-13 difference)
      const codeStripped = code.replace(/^0+/, '')

      // Find an exact GTIN/UPC match
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const food = foods.find((f: any) =>
        f.gtinUpc === code ||
        f.gtinUpc === codeStripped ||
        ('0' + f.gtinUpc) === code
      )

      if (food) {
        const nutrients: Array<{ nutrientId: number; value: number }> =
          food.foodNutrients ?? []
        const kcal = getNutrient(nutrients, 1008)
        if (kcal > 0) {
          const result: FoodResult = {
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
              food.servingSize && food.servingSizeUnit === 'g'
                ? food.servingSize
                : 100,
          }
          return NextResponse.json({ food: result })
        }
      }
    }
  } catch {
    // fall through
  }

  // ── 3. Nutritionix (branded + restaurant items) ───────────────────────────────
  // Requires API credentials. Strongest coverage of US restaurant chains.
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
        const nxData = await nxRes.json()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item: any = nxData.foods?.[0]
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
