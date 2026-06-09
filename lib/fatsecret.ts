/**
 * FatSecret API client
 *
 * OAuth 2.0 Client Credentials flow. Token is cached at module level and
 * re-fetched only when it is within 60 s of expiry — never on every request.
 *
 * Required env vars:
 *   FATSECRET_CLIENT_ID
 *   FATSECRET_CLIENT_SECRET
 */

import type { FoodResult } from '@/types/food'

// ── Token cache ───────────────────────────────────────────────────────────────

interface TokenCache {
  token: string
  expiresAt: number  // ms since epoch
}

let _tokenCache: TokenCache | null = null

async function getToken(): Promise<string> {
  const now = Date.now()
  if (_tokenCache && _tokenCache.expiresAt > now + 60_000) {
    return _tokenCache.token
  }

  const clientId     = process.env.FATSECRET_CLIENT_ID
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('FATSECRET_CLIENT_ID / FATSECRET_CLIENT_SECRET not set')
  }

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body:  'grant_type=client_credentials&scope=basic',
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`FatSecret token request failed: ${res.status}`)

  const json = await res.json()
  _tokenCache = {
    token:     json.access_token,
    expiresAt: now + (json.expires_in ?? 86400) * 1000,
  }
  return _tokenCache.token
}

// ── Normalised result shape (as defined in task spec) ─────────────────────────

export interface FatSecretResult {
  id: string           // "fatsecret_" + food_id
  name: string
  brand: string | null
  source: 'fatsecret'
  servingSize: number
  servingUnit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number | null
  sugar: number | null
  sodium: number | null
}

// ── FatSecretResult → FoodResult (per-100 g convention) ──────────────────────

export function fatSecretToFoodResult(f: FatSecretResult): FoodResult {
  // Convert per-serving values to per-100 g so the rest of the app is consistent
  const isGrams = f.servingUnit.toLowerCase() === 'g'
  const factor  = isGrams && f.servingSize > 0 ? 100 / f.servingSize : 1
  const r1      = (n: number) => Math.round(n * factor * 10) / 10

  return {
    id:             f.id,
    source:         'fatsecret',
    name:           f.name,
    brand:          f.brand ?? undefined,
    kcalPer100g:    r1(f.calories),
    proteinPer100g: r1(f.protein),
    carbsPer100g:   r1(f.carbs),
    fatPer100g:     r1(f.fat),
    fiberPer100g:   f.fiber != null ? r1(f.fiber) : 0,
    servingG:       isGrams ? f.servingSize : 100,
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Parse the compact description FatSecret returns in foods.search results.
 * Format: "Per 100g - Calories: 165kcal | Fat: 3.57g | Carbs: 0g | Protein: 31.02g"
 */
function parseDescription(desc: string): {
  servingSize: number
  calories: number
  protein: number
  carbs: number
  fat: number
} | null {
  const servingMatch = desc.match(/Per\s+([\d.]+)\s*g\s+-/i)
  const servingSize  = servingMatch ? parseFloat(servingMatch[1]) : 100

  const cal  = desc.match(/Calories:\s*([\d.]+)kcal/i)
  if (!cal) return null  // no calories = skip

  return {
    servingSize,
    calories: parseFloat(cal[1]),
    protein:  parseFloat(desc.match(/Protein:\s*([\d.]+)g/i)?.[1]  ?? '0'),
    carbs:    parseFloat(desc.match(/Carbs:\s*([\d.]+)g/i)?.[1]    ?? '0'),
    fat:      parseFloat(desc.match(/Fat:\s*([\d.]+)g/i)?.[1]      ?? '0'),
  }
}

export async function searchFatSecret(
  query: string,
  maxResults = 10,
): Promise<FatSecretResult[]> {
  let token: string
  try { token = await getToken() } catch { return [] }

  const url = new URL('https://platform.fatsecret.com/rest/server.api')
  url.searchParams.set('method',            'foods.search')
  url.searchParams.set('search_expression', query)
  url.searchParams.set('format',            'json')
  url.searchParams.set('max_results',       String(maxResults))
  url.searchParams.set('page_number',       '0')

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []

    const data  = await res.json()
    const foods = data?.foods?.food
    if (!foods) return []

    // foods.food is an object (single result) or array
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] = Array.isArray(foods) ? foods : [foods]

    return arr
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((f: any): FatSecretResult | null => {
        const n = parseDescription(f.food_description ?? '')
        if (!n || n.calories === 0) return null
        return {
          id:          'fatsecret_' + f.food_id,
          name:        f.food_name  ?? 'Unknown',
          brand:       f.brand_name ?? null,
          source:      'fatsecret',
          servingSize: n.servingSize,
          servingUnit: 'g',
          calories:    n.calories,
          protein:     n.protein,
          carbs:       n.carbs,
          fat:         n.fat,
          fiber:       null,
          sugar:       null,
          sodium:      null,
        }
      })
      .filter((f): f is FatSecretResult => f !== null)
  } catch {
    return []
  }
}

// ── Barcode ───────────────────────────────────────────────────────────────────

export async function lookupBarcodeFatSecret(
  barcode: string,
): Promise<FatSecretResult | null> {
  let token: string
  try { token = await getToken() } catch { return null }

  try {
    // Step 1 — resolve food_id from barcode
    const bUrl = new URL('https://platform.fatsecret.com/rest/server.api')
    bUrl.searchParams.set('method',  'food.find_id_for_barcode')
    bUrl.searchParams.set('barcode', barcode)
    bUrl.searchParams.set('format',  'json')

    const bRes = await fetch(bUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 86400 },
    })
    if (!bRes.ok) return null

    const bData  = await bRes.json()
    const foodId = bData?.food_id?.value
    if (!foodId) return null

    // Step 2 — fetch full nutrition for food_id
    const fUrl = new URL('https://platform.fatsecret.com/rest/server.api')
    fUrl.searchParams.set('method',  'food.get')
    fUrl.searchParams.set('food_id', foodId)
    fUrl.searchParams.set('format',  'json')

    const fRes = await fetch(fUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 86400 },
    })
    if (!fRes.ok) return null

    const fData = await fRes.json()
    const food  = fData?.food
    if (!food) return null

    const servings = food.servings?.serving
    if (!servings) return null

    // Use first serving (spec requirement)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sArr: any[] = Array.isArray(servings) ? servings : [servings]
    const s = sArr[0]
    if (!s) return null

    const calories = parseFloat(s.calories ?? '0') || 0
    if (calories === 0) return null

    return {
      id:          'fatsecret_' + food.food_id,
      name:        food.food_name  ?? 'Unknown',
      brand:       food.brand_name ?? null,
      source:      'fatsecret',
      servingSize: parseFloat(s.metric_serving_amount ?? '100') || 100,
      servingUnit: s.metric_serving_unit ?? 'g',
      calories,
      protein:     parseFloat(s.protein      ?? '0') || 0,
      carbs:       parseFloat(s.carbohydrate ?? '0') || 0,
      fat:         parseFloat(s.fat          ?? '0') || 0,
      fiber:       s.fiber  != null ? (parseFloat(s.fiber)  || null) : null,
      sugar:       s.sugar  != null ? (parseFloat(s.sugar)  || null) : null,
      sodium:      s.sodium != null ? (parseFloat(s.sodium) || null) : null,
    }
  } catch {
    return null
  }
}
