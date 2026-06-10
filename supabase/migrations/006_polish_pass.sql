-- 006_polish_pass.sql
-- Polish pass: serving-model columns (safety re-assert) + missed-day estimates.
-- Run once in Supabase Dashboard → SQL Editor.
--
-- 100% ADDITIVE. Drops/alters nothing. Every statement is IF NOT EXISTS, so it
-- is safe to run even if migration 004 already added the serving columns
-- (those statements become no-ops). Existing food_logs / weight_logs rows stay
-- valid; new columns carry defaults that match prior behaviour (servings = 1).

-- ═══════════════════════════════════════════════════════════════
-- 1. Serving model on food_logs (no-op if 004 already applied)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE food_logs
  ADD COLUMN IF NOT EXISTS logged_at    date,
  ADD COLUMN IF NOT EXISTS brand        text,
  ADD COLUMN IF NOT EXISTS source       text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id    text,
  ADD COLUMN IF NOT EXISTS serving_size numeric(7,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS serving_unit text         NOT NULL DEFAULT 'g',
  ADD COLUMN IF NOT EXISTS servings     numeric(7,3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS calories     numeric(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS protein      numeric(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carbs        numeric(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fat          numeric(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiber        numeric(6,2),
  ADD COLUMN IF NOT EXISTS sugar        numeric(6,2),
  ADD COLUMN IF NOT EXISTS sodium       numeric(7,2);

-- Backfill normalized values for any rows that predate the serving columns,
-- mirroring migration 004's backfill (safe to re-run; only touches NULL/0 rows).
UPDATE food_logs SET
  logged_at    = COALESCE(logged_at, logged_date),
  serving_size = CASE WHEN serving_size IS NULL OR serving_size = 0 THEN serving_g ELSE serving_size END,
  calories     = CASE WHEN calories = 0 THEN kcal      ELSE calories END,
  protein      = CASE WHEN protein  = 0 THEN protein_g ELSE protein  END,
  carbs        = CASE WHEN carbs    = 0 THEN carbs_g   ELSE carbs    END,
  fat          = CASE WHEN fat      = 0 THEN fat_g      ELSE fat      END
WHERE logged_at IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- 2. Missed-day estimates (day-level marker table)
-- ═══════════════════════════════════════════════════════════════
-- A separate table — chosen over a food_logs column so estimated days never
-- pollute Today totals or adherence sums, and the adaptive-TDEE regression can
-- exclude them with a simple date filter.
CREATE TABLE IF NOT EXISTS estimated_days (
  user_id    uuid not null references profiles(id) on delete cascade,
  date       date not null,
  estimate   text not null check (estimate in ('under', 'on_target', 'over')),
  created_at timestamptz default now(),
  primary key (user_id, date)
);

ALTER TABLE estimated_days ENABLE ROW LEVEL SECURITY;

-- Add policy only if missing (CREATE POLICY has no IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'estimated_days' AND policyname = 'own data only'
  ) THEN
    CREATE POLICY "own data only" ON estimated_days
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
