-- Add stored macro targets to tdee_estimates so the client hook can read them
-- without recalculating on every page load.
-- Run via Supabase Dashboard → SQL Editor.

alter table tdee_estimates
  add column if not exists protein_g          numeric(7,2),
  add column if not exists fat_g              numeric(7,2),
  add column if not exists carbs_g            numeric(7,2),
  add column if not exists daily_kcal_target  numeric(7,2);
