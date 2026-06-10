/**
 * NIH Dietary Supplement Label Database (DSLD) client.
 *
 * Public API, no key required. Verified live (June 2026):
 *   Base:    https://api.ods.od.nih.gov/dsld/v9
 *   Search:  GET /search-filter?q={term}&from={n}&size={n}
 *              → { hits: [{ _id, _source: { fullName, brandName, allIngredients } }], stats }
 *   Label:   GET /label/{id}
 *              → { fullName, brandName, upcSku, servingSizes[], ingredientRows[] }
 *            ingredientRows[i] = { name, ingredientGroup, notes, category,
 *              quantity: [{ quantity, unit, servingSizeQuantity, servingSizeUnit }] }
 *
 * NOTE on barcode lookup: DSLD's full-text `q` does NOT reliably index UPC
 * codes, and search hits omit `upcSku`. So barcode lookup is best-effort:
 * search by the code, then fetch candidate labels and digit-match `upcSku`.
 * When nothing matches we return found:false and the UI falls back to manual
 * entry (Canadian products frequently aren't in DSLD at all).
 */

import {
  convertToCanonical,
  matchNutrientKey,
  looksLikeFolicAcid,
  NUTRIENT_BY_KEY,
} from '@/lib/science/nutrients'

const DSLD_BASE = 'https://api.ods.od.nih.gov/dsld/v9'

export interface DsldSearchHit {
  dsldId: string
  name: string
  brand: string | null
}

export interface ParsedNutrient {
  key: string                 // catalog key
  displayName: string
  amountLabel: number         // amount as printed on the label (per serving)
  unitLabel: string           // unit as printed
  canonicalAmount: number     // converted to canonical unit
  canonicalUnit: 'mcg' | 'mg' | 'g'
}

export interface ParsedSupplement {
  name: string
  brand: string | null
  upc: string | null
  servingSize: number
  servingUnit: string
  nutrients: ParsedNutrient[]
  /** Label lines we could not map to a tracked nutrient (kept for transparency). */
  unmatched: { name: string; amount: number | null; unit: string | null }[]
}

/** Strip a UPC/barcode to digits only for comparison. */
export function normalizeBarcode(code: string): string {
  return (code || '').replace(/\D/g, '')
}

export async function searchSupplements(q: string, size = 20): Promise<DsldSearchHit[]> {
  const url = `${DSLD_BASE}/search-filter?q=${encodeURIComponent(q)}&from=0&size=${size}`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 3600 } })
  if (!res.ok) return []
  const data = await res.json().catch(() => null)
  const hits = data?.hits ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return hits.map((h: any) => ({
    dsldId: String(h._id),
    name: h._source?.fullName ?? 'Unknown product',
    brand: h._source?.brandName ?? null,
  }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseLabel(raw: any): ParsedSupplement {
  const serving = Array.isArray(raw?.servingSizes) ? raw.servingSizes[0] : null
  const servingSize = Number(serving?.minQuantity ?? serving?.maxQuantity ?? 1) || 1
  const servingUnit = serving?.unit ?? 'serving'

  const nutrients: ParsedNutrient[] = []
  const unmatched: ParsedSupplement['unmatched'] = []

  const rows = Array.isArray(raw?.ingredientRows) ? raw.ingredientRows : []
  for (const row of rows) {
    const q = Array.isArray(row?.quantity) ? row.quantity[0] : null
    const amount = q ? Number(q.quantity) : null
    const unit = q?.unit ?? null

    const key = matchNutrientKey(row?.ingredientGroup ?? row?.name)
    if (!key || amount == null || !unit) {
      unmatched.push({ name: row?.name ?? row?.ingredientGroup ?? 'Unknown', amount, unit })
      continue
    }

    const def = NUTRIENT_BY_KEY[key]
    const conv = convertToCanonical(key, amount, unit, {
      folateIsFolicAcid: key === 'folate' && looksLikeFolicAcid(row?.name, row?.notes),
    })
    if (!conv) {
      // Recognized nutrient but un-convertible unit — flag rather than guess.
      unmatched.push({ name: def.display, amount, unit })
      continue
    }

    nutrients.push({
      key,
      displayName: def.display,
      amountLabel: amount,
      unitLabel: unit,
      canonicalAmount: Math.round(conv.value * 1000) / 1000,
      canonicalUnit: conv.unit,
    })
  }

  return {
    name: raw?.fullName ?? 'Unknown product',
    brand: raw?.brandName ?? null,
    upc: raw?.upcSku ? normalizeBarcode(raw.upcSku) : null,
    servingSize,
    servingUnit,
    nutrients,
    unmatched,
  }
}

export async function fetchAndParseLabel(dsldId: string): Promise<ParsedSupplement | null> {
  const res = await fetch(`${DSLD_BASE}/label/${encodeURIComponent(dsldId)}`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 86400 },
  })
  if (!res.ok) return null
  const raw = await res.json().catch(() => null)
  if (!raw) return null
  return parseLabel(raw)
}

/**
 * Best-effort barcode → label. Searches by the code, fetches up to `maxProbe`
 * candidate labels, and returns the first whose digit-normalized upcSku equals
 * the scanned code. Returns null when DSLD has no confident match.
 */
export async function lookupByBarcode(code: string, maxProbe = 6): Promise<ParsedSupplement | null> {
  const target = normalizeBarcode(code)
  if (!target) return null

  const hits = await searchSupplements(target, maxProbe)
  for (const hit of hits) {
    const parsed = await fetchAndParseLabel(hit.dsldId)
    if (parsed?.upc && parsed.upc === target) return parsed
  }
  return null
}
