-- FoodieBootie Initial Schema
-- Run this in the Supabase SQL editor or via `supabase db push`

-- ============================================================
-- PROFILES
-- ============================================================
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  is_admin      boolean default false,

  height_cm     numeric(5,1),
  sex           text check (sex in ('male', 'female', 'other')),
  date_of_birth date,
  activity_level text check (activity_level in (
    'sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active'
  )),

  goal_type     text check (goal_type in (
    'cut', 'maintain', 'bulk', 'recomp', 'performance'
  )),
  goal_weight_kg         numeric(5,2),
  goal_rate_kg_per_week  numeric(4,3),
  goal_start_date        date,

  protein_g_per_kg_lbm   numeric(4,2) default 2.4,
  fat_min_g              numeric(5,1),
  carb_fill              boolean default true,

  cycle_tracking_enabled boolean default false,
  last_period_start      date,
  avg_cycle_length_days  int default 28,

  onboarding_complete    boolean default false,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- Auto-create profile row on user signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Updated_at auto-update
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure update_updated_at();

-- ============================================================
-- WEIGHT LOGS
-- ============================================================
create table weight_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  logged_at   date not null,
  weight_kg   numeric(5,2) not null,
  note        text,
  created_at  timestamptz default now(),
  unique(user_id, logged_at)
);

create index on weight_logs(user_id, logged_at);

-- ============================================================
-- CUSTOM FOODS
-- ============================================================
create table custom_foods (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid references profiles(id) on delete set null,
  name            text not null,
  brand           text,
  serving_g       numeric(7,2) not null default 100,
  kcal_per_100g   numeric(7,2) not null,
  protein_per_100g numeric(7,2) not null,
  carbs_per_100g  numeric(7,2) not null,
  fat_per_100g    numeric(7,2) not null,
  fiber_per_100g  numeric(6,2),
  barcode         text,
  is_shared       boolean default true,
  created_at      timestamptz default now()
);

-- ============================================================
-- FOOD LOGS
-- ============================================================
create table food_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  logged_date     date not null,
  meal_type       text not null check (meal_type in (
    'breakfast', 'lunch', 'dinner', 'snacks', 'pre_workout', 'post_workout'
  )),

  usda_food_id    text,
  off_food_id     text,
  custom_food_id  uuid references custom_foods(id),

  food_name       text not null,
  serving_g       numeric(7,2) not null,
  kcal            numeric(7,2) not null,
  protein_g       numeric(7,2) not null,
  carbs_g         numeric(7,2) not null,
  fat_g           numeric(7,2) not null,
  fiber_g         numeric(6,2),
  sugar_g         numeric(6,2),
  sodium_mg       numeric(8,2),

  created_at      timestamptz default now()
);

create index on food_logs(user_id, logged_date);

-- ============================================================
-- SAVED MEALS
-- ============================================================
create table saved_meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  name        text not null,
  meal_type   text,
  created_at  timestamptz default now()
);

create table saved_meal_items (
  id              uuid primary key default gen_random_uuid(),
  saved_meal_id   uuid not null references saved_meals(id) on delete cascade,
  food_name       text not null,
  serving_g       numeric(7,2) not null,
  kcal            numeric(7,2) not null,
  protein_g       numeric(7,2) not null,
  carbs_g         numeric(7,2) not null,
  fat_g           numeric(7,2) not null,
  usda_food_id    text,
  off_food_id     text,
  custom_food_id  uuid
);

-- ============================================================
-- BODY MEASUREMENTS
-- ============================================================
create table body_measurements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  measured_at     date not null,

  neck_cm         numeric(5,2),
  waist_cm        numeric(5,2),
  hip_cm          numeric(5,2),

  navy_bf_pct     numeric(5,2),
  lean_mass_kg    numeric(6,2),
  fat_mass_kg     numeric(6,2),
  ffmi            numeric(5,2),

  manual_bf_pct   numeric(5,2),
  dexa_bf_pct     numeric(5,2),
  active_method   text default 'navy' check (active_method in ('navy', 'manual', 'dexa')),

  created_at      timestamptz default now(),
  unique(user_id, measured_at)
);

-- ============================================================
-- TDEE ESTIMATES
-- ============================================================
create table tdee_estimates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  calculated_at   timestamptz default now(),
  tdee_kcal       numeric(7,2) not null,
  method          text default 'adaptive_regression',
  data_points     int not null,
  confidence      text check (confidence in ('low', 'medium', 'high')),
  adaptation_flag boolean default false,
  notes           text
);

-- ============================================================
-- EXERCISE LOGS
-- ============================================================
create table exercise_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  logged_date   date not null,
  activity      text not null,
  duration_min  int,
  kcal_burned   numeric(7,2),
  source        text default 'manual' check (source in ('manual', 'fitbit')),
  created_at    timestamptz default now()
);

-- ============================================================
-- CYCLE LOGS
-- ============================================================
create table cycle_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  period_start  date not null,
  period_end    date,
  cycle_length  int,
  notes         text,
  created_at    timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- profiles
alter table profiles enable row level security;
create policy "users read own or admin reads all" on profiles
  for select using (
    auth.uid() = id or
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );
create policy "users update own profile" on profiles
  for update using (auth.uid() = id);

-- weight_logs
alter table weight_logs enable row level security;
create policy "own data only" on weight_logs
  for all using (auth.uid() = user_id);

-- food_logs
alter table food_logs enable row level security;
create policy "own data only" on food_logs
  for all using (auth.uid() = user_id);

-- custom_foods
alter table custom_foods enable row level security;
create policy "read all custom foods" on custom_foods
  for select using (true);
create policy "manage own custom foods" on custom_foods
  for all using (auth.uid() = created_by);

-- saved_meals
alter table saved_meals enable row level security;
create policy "own data only" on saved_meals
  for all using (auth.uid() = user_id);

-- saved_meal_items
alter table saved_meal_items enable row level security;
create policy "own data via meal" on saved_meal_items
  for all using (
    exists (select 1 from saved_meals where id = saved_meal_id and user_id = auth.uid())
  );

-- body_measurements
alter table body_measurements enable row level security;
create policy "own data only" on body_measurements
  for all using (auth.uid() = user_id);

-- tdee_estimates
alter table tdee_estimates enable row level security;
create policy "own data only" on tdee_estimates
  for all using (auth.uid() = user_id);

-- exercise_logs
alter table exercise_logs enable row level security;
create policy "own data only" on exercise_logs
  for all using (auth.uid() = user_id);

-- cycle_logs
alter table cycle_logs enable row level security;
create policy "own data only" on cycle_logs
  for all using (auth.uid() = user_id);
