-- Add unit system preference to profiles
-- Run in Supabase Dashboard → SQL Editor
alter table profiles
  add column if not exists unit_system text not null default 'metric'
  check (unit_system in ('metric', 'imperial'));
