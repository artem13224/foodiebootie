/**
 * Seed restaurant food data into custom_foods.
 *
 * Usage:
 *   npx ts-node --project tsconfig.node.json scripts/seed-restaurants.ts
 *
 * Requirements:
 *   - NEXT_PUBLIC_SUPABASE_URL in .env.local
 *   - SUPABASE_SERVICE_ROLE_KEY in .env.local (bypasses RLS)
 */

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌  Missing env vars. Ensure .env.local has:')
  console.error('     NEXT_PUBLIC_SUPABASE_URL')
  console.error('     SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

interface RestaurantItem {
  name: string
  brand: string
  serving_size: number   // grams
  serving_unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber?: number | null
  sugar?: number | null
  sodium?: number | null
  source: string
}

/** Convert per-serving macros → per-100g for custom_foods schema */
function toPerHundredG(item: RestaurantItem) {
  const factor = 100 / item.serving_size
  return {
    name: item.name,
    brand: item.brand,
    serving_g: item.serving_size,
    kcal_per_100g: Math.round(item.calories * factor * 10) / 10,
    protein_per_100g: Math.round(item.protein * factor * 10) / 10,
    carbs_per_100g: Math.round(item.carbs * factor * 10) / 10,
    fat_per_100g: Math.round(item.fat * factor * 10) / 10,
    fiber_per_100g: item.fiber != null ? Math.round(item.fiber * factor * 10) / 10 : null,
    is_shared: true,
    created_by: null,
  }
}

async function seedFile(filePath: string): Promise<{ brand: string; count: number; skipped: number }> {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const items: RestaurantItem[] = JSON.parse(raw)

  const rows = items.map(toPerHundredG)
  const brand = rows[0]?.brand ?? path.basename(filePath, '.json')

  let seeded = 0
  let skipped = 0

  for (const row of rows) {
    const { error } = await supabase
      .from('custom_foods')
      .insert(row)
      // Conflict on (name, brand) — skip duplicates
      .select()
      // We use onConflict via raw upsert instead:

    if (error) {
      // Unique constraint violation (23505) → already exists, skip silently
      if (error.code === '23505') {
        skipped++
      } else {
        console.warn(`  ⚠  ${row.name}: ${error.message}`)
        skipped++
      }
    } else {
      seeded++
    }
  }

  return { brand, count: seeded, skipped }
}

async function main() {
  const dir = path.resolve(__dirname, '../data/restaurants')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))

  if (files.length === 0) {
    console.error('❌  No JSON files found in /data/restaurants/')
    process.exit(1)
  }

  console.log(`\n🌱  Seeding ${files.length} restaurant files…\n`)

  let totalSeeded = 0
  let totalSkipped = 0

  for (const file of files.sort()) {
    const filePath = path.join(dir, file)
    const { brand, count, skipped } = await seedFile(filePath)
    console.log(`  ✓  ${brand.padEnd(22)} — ${count} items seeded${skipped > 0 ? `, ${skipped} skipped` : ''}`)
    totalSeeded += count
    totalSkipped += skipped
  }

  console.log(`\n✅  Done — ${totalSeeded} items seeded, ${totalSkipped} skipped (already exist)\n`)
}

main().catch(err => {
  console.error('❌  Seed failed:', err)
  process.exit(1)
})
