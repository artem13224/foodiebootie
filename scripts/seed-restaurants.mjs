/**
 * Seed restaurant food data into custom_foods.
 *
 * Usage (Node 18+, reads .env.local automatically):
 *   node --env-file=.env.local scripts/seed-restaurants.mjs
 *
 * Requirements in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...   ← bypasses RLS
 */

import { readFileSync, readdirSync } from 'fs'
import { resolve, join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

/** Convert per-serving macros → per-100g for custom_foods schema */
function toRow(item) {
  const factor = 100 / item.serving_size
  const round1 = (n) => Math.round(n * 10) / 10
  return {
    name: item.name,
    brand: item.brand,
    serving_g: item.serving_size,
    kcal_per_100g: round1(item.calories * factor),
    protein_per_100g: round1(item.protein * factor),
    carbs_per_100g: round1(item.carbs * factor),
    fat_per_100g: round1(item.fat * factor),
    fiber_per_100g: item.fiber != null ? round1(item.fiber * factor) : null,
    is_shared: true,
    created_by: null,
  }
}

async function seedFile(filePath) {
  const items = JSON.parse(readFileSync(filePath, 'utf-8'))
  const brand = items[0]?.brand ?? basename(filePath, '.json')
  let seeded = 0
  let skipped = 0

  for (const item of items) {
    const row = toRow(item)
    const { error } = await supabase.from('custom_foods').insert(row)
    if (error) {
      // 23505 = unique_violation (already exists)
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
  const dir = resolve(__dirname, '../data/restaurants')
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort()

  if (files.length === 0) {
    console.error('❌  No JSON files found in /data/restaurants/')
    process.exit(1)
  }

  console.log(`\n🌱  Seeding ${files.length} restaurant files…\n`)

  let totalSeeded = 0
  let totalSkipped = 0

  for (const file of files) {
    const { brand, count, skipped } = await seedFile(join(dir, file))
    const skipNote = skipped > 0 ? `, ${skipped} skipped` : ''
    console.log(`  ✓  ${brand.padEnd(24)} — ${count} items seeded${skipNote}`)
    totalSeeded += count
    totalSkipped += skipped
  }

  console.log(`\n✅  Done — ${totalSeeded} items seeded, ${totalSkipped} skipped (already exist)\n`)
}

main().catch(err => {
  console.error('❌  Seed failed:', err)
  process.exit(1)
})
