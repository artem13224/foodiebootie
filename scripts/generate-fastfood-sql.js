#!/usr/bin/env node
/**
 * Generates supabase/migrations/005_seed_fastfood.sql
 * Run: node scripts/generate-fastfood-sql.js
 */

const fs   = require('fs')
const path = require('path')

function parseCsvRow(line) {
  const fields = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuote = !inQuote }
    else if (ch === ',' && !inQuote) { fields.push(cur); cur = '' }
    else { cur += ch }
  }
  fields.push(cur)
  return fields
}

function toNum(val) {
  if (!val || val.trim() === 'NA' || val.trim() === '') return null
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

function esc(s) { return s ? s.replace(/'/g, "''") : '' }
function val(n) { return n == null ? 'NULL' : n }

const csvPath = path.join(__dirname, '..', 'fastfood.csv')
const lines   = fs.readFileSync(csvPath, 'utf8').trim().split('\n')

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

const inserts = rows.map(r => {
  const calories    = r.calories
  const protein     = r.protein   ?? 0
  const carbs       = r.total_carb ?? 0
  const fat         = r.total_fat  ?? 0

  return `('${esc(r.item)}','${esc(r.restaurant)}',100,${calories},${protein},${carbs},${fat},${val(r.fiber)},NULL,true,'seeded',${calories},${protein},${carbs},${fat},${val(r.fiber)},${val(r.sugar)},${val(r.sodium)},1,'serving')`
}).join(',\n')

const sql = `-- 005_seed_fastfood.sql
-- Seeds 515 fast-food items from fastfood.csv into custom_foods.
-- Run once in Supabase Dashboard → SQL Editor.
-- Safe to re-run: uses INSERT ... ON CONFLICT DO NOTHING.

-- Add unique constraint so re-runs are idempotent
ALTER TABLE custom_foods
  ADD CONSTRAINT IF NOT EXISTS custom_foods_name_brand_unique UNIQUE (name, brand);

INSERT INTO custom_foods (
  name, brand,
  serving_g, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
  fiber_per_100g, barcode, is_shared,
  source, calories, protein, carbs, fat,
  fiber, sugar, sodium, serving_size, serving_unit
) VALUES
${inserts}
ON CONFLICT (name, brand) DO NOTHING;
`

const outPath = path.join(__dirname, '..', 'supabase', 'migrations', '005_seed_fastfood.sql')
fs.writeFileSync(outPath, sql)
console.log(`Written ${rows.length} inserts → supabase/migrations/005_seed_fastfood.sql`)
