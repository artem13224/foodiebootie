#!/usr/bin/env node
/**
 * seed-fastfood.js
 * Reads fastfood.csv from project root and upserts all items into
 * custom_foods with source='seeded', is_shared=true.
 *
 * Run from project root:
 *   node scripts/seed-fastfood.js
 */

const fs   = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// ── Load env from .env.local ──────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local')
const envVars = {}
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m) envVars[m[1].trim()] = m[2].trim()
    })
}

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── CSV parser (handles quoted fields) ───────────────────────────────────────
function parseCsvRow(line) {
  const fields = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      fields.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur)
  return fields
}

function toNum(val) {
  if (!val || val.trim() === 'NA' || val.trim() === '') return null
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

// ── Read + parse CSV ──────────────────────────────────────────────────────────
const csvPath = path.join(__dirname, '..', 'fastfood.csv')
const lines   = fs.readFileSync(csvPath, 'utf8').trim().split('\n')
const header  = parseCsvRow(lines[0])
// restaurant,item,calories,cal_fat,total_fat,sat_fat,trans_fat,
// cholesterol,sodium,total_carb,fiber,sugar,protein,...

const rows = lines.slice(1).map(line => {
  const f = parseCsvRow(line)
  return {
    restaurant: f[0]?.trim(),
    item:       f[1]?.trim(),
    calories:   toNum(f[2]),
    total_fat:  toNum(f[4]),
    sodium:     toNum(f[8]),
    total_carb: toNum(f[9]),
    fiber:      toNum(f[10]),
    sugar:      toNum(f[11]),
    protein:    toNum(f[12]),
  }
}).filter(r => r.item && r.calories != null)

console.log(`Parsed ${rows.length} items from CSV`)

// ── Map to custom_foods schema ────────────────────────────────────────────────
// Nutrition in the CSV is per-serving (one menu item).
// We store in both old per-100g columns (as-is, treating the item as ~100g
// for density purposes) AND new per-serving columns (accurate).
// The search uses old columns; the log page multiplies kcalPer100g × servingG/100,
// so setting both to the same value with serving_g=100 gives the correct total.
const records = rows.map(r => ({
  // Old schema columns (required NOT NULL)
  name:             r.item,
  brand:            r.restaurant,
  serving_g:        100,
  kcal_per_100g:    r.calories,
  protein_per_100g: r.protein   ?? 0,
  carbs_per_100g:   r.total_carb ?? 0,
  fat_per_100g:     r.total_fat  ?? 0,
  fiber_per_100g:   r.fiber,
  barcode:          null,
  is_shared:        true,
  // New schema columns (from migration 004)
  source:           'seeded',
  user_id:          null,
  calories:         r.calories,
  protein:          r.protein   ?? 0,
  carbs:            r.total_carb ?? 0,
  fat:              r.total_fat  ?? 0,
  fiber:            r.fiber,
  sugar:            r.sugar,
  sodium:           r.sodium,
  serving_size:     1,
  serving_unit:     'serving',
}))

// ── Upsert in batches of 100 ──────────────────────────────────────────────────
const BATCH = 100

async function run() {
  let inserted = 0
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH)
    const { error } = await supabase
      .from('custom_foods')
      .insert(batch)

    if (error) {
      console.error(`Batch ${i}–${i + batch.length} error:`, error.message)
    } else {
      inserted += batch.length
      process.stdout.write(`\rInserted ${inserted}/${records.length}...`)
    }
  }
  console.log(`\nDone. ${inserted} items seeded into custom_foods.`)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
