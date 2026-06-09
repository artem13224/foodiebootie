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

/** Fetch one barcode from Open Food Facts (world instance) and return a FoodResult or null. */
async function tryOFF(barcode: string): Promise<FoodResult | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}.json`,
      { next: { revalidate: 86400 } },
    )
    if (!res.ok) return null
    const data = await res.json()

    // OFF v3 uses status:'success'; v0 legacy uses status:1 — accept either
    const found = data.status === 'success' || data.status === 1
    if (!found || !data.product) return null

    const p = data.product
    const n = p.nutriments ?? {}
    const kcal: number =
      n['energy-kcal_100g'] ??
      (n['energy_100g'] ? Math.round(n['energy_100g'] / 4.184) : 0)

    if (kcal <= 0) return null

    return {
      id: barcode,
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
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')?.trim()

  if (!code) {
    return NextResponse.json({ food: null, error: 'Missing barcode' }, { status: 400 })
  }

  // ── 1. Open Food Facts ────────────────────────────────────────────────────
  // world.openfoodfacts.org contains ALL products from all countries including
  // Canada — regional mirrors (ca., fr., etc.) are UI-only and don't add coverage.
  // iOS BarcodeDetector sometimes strips the leading zero from EAN-13 codes
  // (reads 12 digits instead of 13), so we try both forms.
  const codeEan = code.length === 12 ? '0' + code : code  // normalise to EAN-13
  const offResult = (await tryOFF(codeEan)) ?? (code !== codeEan ? await tryOFF(code) : null)

  if (offResult) return NextResponse.json({ food: offResult })

  // ── 2. USDA Branded Foods (UPC / GTIN lookup) ─────────────────────────────
  // Best coverage of US retail brands. Free API key from api.data.gov.
  try {
    const apiKey = process.env.USDA_API_KEY ?? 'DEMO_KEY'
    const usdaRes = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(code)}&dataType=Branded&pageSize=5&api_key=${apiKey}`,
      { next: { revalidate: 86400 } },
    )
    if (usdaRes.ok) {
      const data = await usdaRes.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const foods: any[] = data.foods ?? []

      // USDA may omit the leading zero on EAN-13 barcodes (UPC-A vs EAN-13)
      const codeStripped = code.replace(/^0+/, '')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const food = foods.find((f: any) =>
        f.gtinUpc === code ||
        f.gtinUpc === codeStripped ||
        ('0' + f.gtinUpc) === code,
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

  return NextResponse.json({ food: null })
}
