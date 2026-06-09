-- 004_fatsecret_schema.sql
-- Adds columns for FatSecret integration + search waterfall.
-- Does NOT drop or rename any existing columns — old columns
-- (kcal, protein_g, logged_date, etc.) remain for backward compatibility.

-- ═══════════════════════════════════════════════════════════════
-- custom_foods: add new columns
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE custom_foods
  ADD COLUMN IF NOT EXISTS user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source       text NOT NULL DEFAULT 'custom'
    CHECK (source IN ('custom', 'usda', 'off', 'fatsecret', 'seeded')),
  ADD COLUMN IF NOT EXISTS calories     numeric(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS protein      numeric(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carbs        numeric(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fat          numeric(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiber        numeric(6,2),
  ADD COLUMN IF NOT EXISTS sugar        numeric(6,2),
  ADD COLUMN IF NOT EXISTS sodium       numeric(7,2),
  ADD COLUMN IF NOT EXISTS serving_size numeric(7,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS serving_unit text         NOT NULL DEFAULT 'g';

-- Backfill from existing per-100g columns
UPDATE custom_foods SET
  user_id      = created_by,
  calories     = ROUND(kcal_per_100g    * serving_g / 100, 2),
  protein      = ROUND(protein_per_100g * serving_g / 100, 2),
  carbs        = ROUND(carbs_per_100g   * serving_g / 100, 2),
  fat          = ROUND(fat_per_100g     * serving_g / 100, 2),
  fiber        = CASE WHEN fiber_per_100g IS NOT NULL
                      THEN ROUND(fiber_per_100g * serving_g / 100, 2) END,
  serving_size = serving_g,
  serving_unit = 'g'
WHERE calories = 0;

-- ═══════════════════════════════════════════════════════════════
-- food_logs: add new columns
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE food_logs
  ADD COLUMN IF NOT EXISTS logged_at    date,
  ADD COLUMN IF NOT EXISTS brand        text,
  ADD COLUMN IF NOT EXISTS source       text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id    text,
  ADD COLUMN IF NOT EXISTS serving_size numeric(7,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS serving_unit text         NOT NULL DEFAULT 'g',
  ADD COLUMN IF NOT EXISTS servings     numeric(5,3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS calories     numeric(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS protein      numeric(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carbs        numeric(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fat          numeric(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiber        numeric(6,2),
  ADD COLUMN IF NOT EXISTS sugar        numeric(6,2),
  ADD COLUMN IF NOT EXISTS sodium       numeric(7,2);

-- Backfill from existing columns
UPDATE food_logs SET
  logged_at    = logged_date,
  serving_size = serving_g,
  serving_unit = 'g',
  calories     = kcal,
  protein      = protein_g,
  carbs        = carbs_g,
  fat          = fat_g,
  fiber        = fiber_g,
  sugar        = sugar_g,
  sodium       = sodium_mg
WHERE logged_at IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- custom_foods RLS: granular policies using user_id
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "read all custom foods"   ON custom_foods;
DROP POLICY IF EXISTS "manage own custom foods" ON custom_foods;

CREATE POLICY "select shared or own" ON custom_foods
  FOR SELECT USING (
    is_shared = true
    OR user_id    = auth.uid()
    OR created_by = auth.uid()
  );

CREATE POLICY "insert own" ON custom_foods
  FOR INSERT WITH CHECK (
    user_id    = auth.uid()
    OR created_by = auth.uid()
  );

CREATE POLICY "update own" ON custom_foods
  FOR UPDATE USING (
    user_id    = auth.uid()
    OR created_by = auth.uid()
  );

CREATE POLICY "delete own" ON custom_foods
  FOR DELETE USING (
    user_id    = auth.uid()
    OR created_by = auth.uid()
  );
