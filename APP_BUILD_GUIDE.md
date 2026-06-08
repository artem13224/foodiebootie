# [APP_NAME] — Master Build Document
> Science-forward adaptive nutrition tracker. Private PWA. 3 users. Built with Next.js + Supabase + Vercel.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture & Folder Structure](#3-architecture--folder-structure)
4. [Database Schema](#4-database-schema)
5. [Auth & Users](#5-auth--users)
6. [Design System](#6-design-system)
7. [Component Patterns](#7-component-patterns)
8. [Screens & Features](#8-screens--features)
9. [Science Engine](#9-science-engine)
10. [Food Database](#10-food-database)
11. [PWA Configuration](#11-pwa-configuration)
12. [Build Phases](#12-build-phases)
13. [Claude Code Instructions](#13-claude-code-instructions)

---

## 1. Project Overview

**What it is:** A private, invite-only adaptive calorie and macro tracking PWA for a small group of close friends (3 users). Think MacroFactor but with a more aggressive science engine, better body composition tracking, and a visual style that actually feels premium.

**Core differentiator:** Every calculation is grounded in peer-reviewed research. The app adapts its TDEE estimate weekly using real logged data, models metabolic adaptation, tracks fat vs. lean mass separately, and adjusts dynamically based on actual progress — not static formulas.

**Users:** 3 accounts, manually created by admin. No public registration.

**Platform:** PWA (Progressive Web App). Installable to iPhone/Android home screen. No App Store. No native build required.

**Budget:** $0/month (Supabase free tier + Vercel free tier).

---

## 2. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js 14+ (App Router) | PWA support, API routes, server components, best Claude Code target |
| Language | TypeScript (strict) | Supabase auto-generates types; prevents runtime errors |
| Database | Supabase (PostgreSQL) | Managed Postgres, built-in auth, RLS, free tier covers 3 users easily |
| Auth | Supabase Auth (email + password) | Simple; 3 accounts created manually by admin |
| Hosting | Vercel | Zero-config Next.js deploys, free tier, auto-HTTPS |
| Science calculations | Next.js API Routes (`/app/api/`) | Server-side; keeps math off the client |
| Food APIs | USDA FoodData Central + Open Food Facts + Nutritionix | All free at 3-user scale |
| Styling | CSS custom properties + Tailwind (utility only) | Design tokens in CSS vars; Tailwind for layout utilities only |
| PWA | next-pwa | Service worker, manifest, installable |

**Do not use:**
- Redux or Zustand (overkill at this scale — React state + Supabase realtime is enough)
- Prisma (Supabase client handles all DB interaction)
- Any UI component library (Shadcn, MUI, Chakra) — custom design system only

---

## 3. Architecture & Folder Structure

```
/app
  /api
    /tdee          → adaptive TDEE calculation endpoint
    /nutrition     → macro target calculation
    /body          → body composition calculations
    /food
      /search      → unified food search (USDA + OFF + Nutritionix)
      /barcode     → barcode lookup
  /(auth)
    /login         → login page
  /(app)           → protected routes (requires session)
    /today         → main dashboard (default route)
    /trends        → weight + TDEE trends
    /log           → food logging / search
    /body          → body composition
    /profile       → user settings + goal management
    /admin         → admin dashboard (restricted to admin user)
  layout.tsx       → root layout with bottom nav
  page.tsx         → redirect to /today if authed, /login if not

/components
  /ui
    MacroRing.tsx        → animated SVG progress ring
    CalorieHero.tsx      → big animated calorie number
    WeightChart.tsx      → recharts weight trend line
    TDEEChart.tsx        → recharts TDEE trend line
    MealRow.tsx          → single meal entry row
    StatCard.tsx         → generic stat display card
    TabBar.tsx           → bottom navigation bar
    AdaptiveBadge.tsx    → "ADAPTIVE TDEE ACTIVE" status badge
    ProgressBar.tsx      → flat horizontal progress bar
  /forms
    FoodSearch.tsx       → food search with barcode trigger
    WeightEntry.tsx      → quick weight log modal
    MeasurementForm.tsx  → body measurements form

/lib
  /supabase
    client.ts            → Supabase browser client
    server.ts            → Supabase server client (for API routes)
    types.ts             → generated DB types (supabase gen types)
  /science
    rmr.ts               → RMR ensemble calculation
    tdee.ts              → adaptive TDEE regression
    bodycomp.ts          → Navy method + body composition
    macros.ts            → macro target calculation
    adaptation.ts        → metabolic adaptation detection
    utils.ts             → shared math utilities

/hooks
  useWeightTrend.ts      → fetch + process weight logs
  useTodayLog.ts         → fetch today's food log
  useAdaptiveTDEE.ts     → fetch latest TDEE estimate
  useBodyComp.ts         → fetch latest body composition
  useCountUp.ts          → animated number count-up hook

/styles
  globals.css            → CSS custom properties (design tokens) + resets
  fonts.css              → Google Fonts import

/public
  manifest.json          → PWA manifest
  icons/                 → PWA app icons (192x192, 512x512, maskable)

/types
  index.ts               → shared TypeScript types

supabase/
  migrations/            → SQL migration files
```

---

## 4. Database Schema

All tables live in Supabase (PostgreSQL). Row Level Security (RLS) is enabled on all tables. Users can only read/write their own data unless they are admin.

### `profiles`
Extends `auth.users`. Created automatically on user signup via trigger.

```sql
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  is_admin      boolean default false,

  -- Biometrics
  height_cm     numeric(5,1),           -- e.g. 180.3
  sex           text check (sex in ('male', 'female', 'other')),
  date_of_birth date,
  activity_level text check (activity_level in (
    'sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active'
  )),

  -- Goal
  goal_type     text check (goal_type in (
    'cut', 'maintain', 'bulk', 'recomp', 'performance'
  )),
  goal_weight_kg         numeric(5,2),
  goal_rate_kg_per_week  numeric(4,3),  -- e.g. 0.25, 0.5
  goal_start_date        date,

  -- Macro preferences
  protein_g_per_kg_lbm   numeric(4,2) default 2.4,  -- science default
  fat_min_g              numeric(5,1),               -- calculated floor
  carb_fill              boolean default true,        -- carbs fill remaining kcal

  -- Cycle tracking (optional)
  cycle_tracking_enabled boolean default false,
  last_period_start      date,
  avg_cycle_length_days  int default 28,

  -- Meta
  onboarding_complete    boolean default false,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);
```

### `weight_logs`
Daily weigh-ins. Smart average calculated server-side.

```sql
create table weight_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  logged_at   date not null,
  weight_kg   numeric(5,2) not null,
  note        text,
  created_at  timestamptz default now(),
  unique(user_id, logged_at)
);
```

### `food_logs`
Individual food entries tied to a meal and a date.

```sql
create table food_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  logged_date     date not null,
  meal_type       text not null check (meal_type in (
    'breakfast', 'lunch', 'dinner', 'snacks', 'pre_workout', 'post_workout'
  )),

  -- Food reference (one of these will be set)
  usda_food_id    text,
  off_food_id     text,       -- Open Food Facts barcode
  custom_food_id  uuid references custom_foods(id),

  -- Snapshot of nutrition at log time (denormalized for reliability)
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
```

### `custom_foods`
User-created or community foods. Shared across all users.

```sql
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
  is_shared       boolean default true,  -- visible to all 3 users
  created_at      timestamptz default now()
);
```

### `saved_meals`
Saved meal templates for quick re-logging.

```sql
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
```

### `body_measurements`
Navy method inputs + optional manual BF% and DEXA reference.

```sql
create table body_measurements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  measured_at     date not null,

  -- Navy method inputs (cm)
  neck_cm         numeric(5,2),
  waist_cm        numeric(5,2),
  hip_cm          numeric(5,2),    -- required for females

  -- Derived (calculated server-side, stored for history)
  navy_bf_pct     numeric(5,2),
  lean_mass_kg    numeric(6,2),
  fat_mass_kg     numeric(6,2),
  ffmi            numeric(5,2),

  -- Manual overrides / references
  manual_bf_pct   numeric(5,2),    -- user-entered BF% (e.g. from calipers)
  dexa_bf_pct     numeric(5,2),    -- DEXA upload reference value
  active_method   text default 'navy' check (active_method in ('navy', 'manual', 'dexa')),

  created_at      timestamptz default now(),
  unique(user_id, measured_at)
);
```

### `tdee_estimates`
Stored adaptive TDEE calculations. Recalculated weekly.

```sql
create table tdee_estimates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  calculated_at   timestamptz default now(),
  tdee_kcal       numeric(7,2) not null,
  method          text default 'adaptive_regression',
  data_points     int not null,             -- number of weight logs used
  confidence      text check (confidence in ('low', 'medium', 'high')),
  adaptation_flag boolean default false,    -- true if metabolic adaptation detected
  notes           text
);
```

### `exercise_logs`
Manual exercise entries. No wearable sync in Phase 1.

```sql
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
```

### `cycle_logs`
Menstrual cycle phase tracking (optional, per user).

```sql
create table cycle_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  period_start  date not null,
  period_end    date,
  cycle_length  int,
  notes         text,
  created_at    timestamptz default now()
);
```

### RLS Policies (apply to ALL tables above)

```sql
-- Users can only access their own rows
alter table weight_logs enable row level security;
create policy "own data only" on weight_logs
  for all using (auth.uid() = user_id);

-- Repeat for: food_logs, body_measurements, saved_meals,
-- saved_meal_items, tdee_estimates, exercise_logs, cycle_logs

-- Custom foods: all users can read, only creator can update/delete
create policy "read all custom foods" on custom_foods
  for select using (true);
create policy "manage own custom foods" on custom_foods
  for all using (auth.uid() = created_by);

-- Admin can read all profiles
create policy "admin reads all" on profiles
  for select using (
    auth.uid() = id or
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );
```

---

## 5. Auth & Users

- Email + password auth via Supabase Auth
- 3 accounts created manually by admin in Supabase dashboard — no public sign-up flow
- Login page at `/login` is the only public route
- All other routes redirect to `/login` if no session
- Session managed via Supabase SSR helpers in Next.js middleware
- Admin flag in `profiles.is_admin` controls access to `/admin` route

**Middleware (protect all routes except login):**
```ts
// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'

export async function middleware(req) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session && !req.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return res
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
```

---

## 6. Design System

### 6.1 Color Tokens

Defined in `globals.css` as CSS custom properties. Light mode overrides declared in `@media (prefers-color-scheme: light)`.

```css
:root {
  /* Dark mode (default) */
  --color-bg:           #0D0D0D;
  --color-surface:      #111111;
  --color-surface-2:    #171717;
  --color-border:       #1E1E1E;
  --color-border-soft:  #141414;

  --color-text:         #FFFFFF;
  --color-text-dim:     #3A3A3A;
  --color-text-muted:   #252525;

  --color-accent:       #FF4500;
  --color-accent-hover: #FF6B35;

  --color-macro-protein: #FF4500;
  --color-macro-carbs:   #00BFFF;
  --color-macro-fat:     #FFB800;

  --color-success:      #39D353;
  --color-warning:      #FFB800;
  --color-danger:       #FF3B30;
}

@media (prefers-color-scheme: light) {
  :root {
    --color-bg:           #F2F2F2;
    --color-surface:      #FFFFFF;
    --color-surface-2:    #F8F8F8;
    --color-border:       #E8E8E8;
    --color-border-soft:  #F0F0F0;

    --color-text:         #0D0D0D;
    --color-text-dim:     #888888;
    --color-text-muted:   #BBBBBB;

    --color-accent:       #E03A12;
    --color-accent-hover: #FF4500;
  }
}
```

**Rule:** Never hardcode hex values in components. Always reference `var(--color-*)` tokens. The accent must always be orange-red — no secondary accent colors.

### 6.2 Typography

**Font loading** (`fonts.css` or `layout.tsx` head):
```
https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@600;700;800;900&family=Barlow:wght@400;500;600&display=swap
```

| Role | Font | Weight | Usage |
|---|---|---|---|
| Display numbers | Bebas Neue | 400 (only weight available) | Calories remaining, weight, TDEE, all hero stats |
| Section headers / labels | Barlow Condensed | 700–900 | Screen titles, meal names, tab labels, stat labels |
| Body / metadata | Barlow | 400–600 | Food item names, notes, sub-labels, timestamps |

**Typography scale:**

```css
--text-hero:    clamp(88px, 22vw, 112px);   /* Main calorie number */
--text-display: clamp(52px, 14vw, 72px);    /* Secondary hero (weight, TDEE) */
--text-title:   clamp(28px, 7vw, 36px);     /* Screen-level stat */
--text-subhead: 20px;                        /* Card stat numbers */
--text-label:   clamp(9px, 2.5vw, 11px);    /* ALL CAPS tracked labels */
--text-body:    12px;                        /* Food item names, notes */
--text-micro:   9px;                         /* Sub-labels, timestamps */

--tracking-loose: 0.25em;     /* Section labels */
--tracking-wide:  0.15em;     /* Stat labels */
--tracking-tight: -0.05em;    /* Hero numbers */
```

**Rules:**
- Hero numbers: always Bebas Neue, `--text-hero` or `--text-display`
- ALL CAPS tracking: `letter-spacing: var(--tracking-loose)`, always `text-transform: uppercase`, always Barlow Condensed 700+
- No italic anywhere. No underline anywhere.
- Never use system fonts or Inter.

### 6.3 Spacing

Base unit: `4px`. All spacing is a multiple.

```css
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;
```

**Container:** `max-width: 390px; margin: 0 auto;` — locked to phone width.
**Screen padding:** `20px` horizontal on all screens.
**Bottom clearance:** `92px` padding-bottom on all scrollable screens (clears tab bar).

### 6.4 Shape Language

**Border radius rules:**
- Data surfaces, cards, stat boxes: `0px` (sharp, no radius)
- Primary action buttons (LOG, SAVE): pill shape only → `border-radius: 0` (keep it sharp, consistent with flat aesthetic)
- Accent indicator dots: `50%` (circle only)
- Avatar/profile square: `0px`

**Dividers:** Use 1px solid `var(--color-border-soft)` for row separators. Use 2–3px solid `var(--color-accent)` for section-level accents.

**Grid layout:** Asymmetric. Cards and sections do not always center. The calorie number can bleed slightly. Accent lines run full width. Info grids use `gap: 1px; background: var(--color-border)` to create "inset tile" effect.

### 6.5 Animation Spec

All animations are defined here. Do not add animations not listed here.

**Count-up (hero numbers):**
- Duration: 1200–1400ms
- Easing: cubic-bezier(0.4, 0, 0.2, 1) — ease-out cubic
- Delay before start: 250ms after mount (font load buffer)
- Trigger: component mount
- Implementation: `requestAnimationFrame` loop in `useCountUp` hook

```ts
// hooks/useCountUp.ts
export function useCountUp(target: number, duration = 1300, delay = 250) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    setVal(0)
    const t = setTimeout(() => {
      const start = Date.now()
      const tick = () => {
        const p = Math.min((Date.now() - start) / duration, 1)
        const eased = 1 - Math.pow(1 - p, 3)
        setVal(Math.round(eased * target))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, delay)
    return () => clearTimeout(t)
  }, [target])
  return val
}
```

**Macro rings:**
- SVG `strokeDashoffset` animated via CSS transition
- Start: `strokeDashoffset = circumference` (empty)
- End: `strokeDashoffset = circumference * (1 - percent)` (filled)
- Transition: `stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)`
- Triggered by `animate` boolean prop (set true after mount delay)
- `strokeLinecap="square"` — no round caps, sharp ends only

**Accent line draw-in:**
- CSS `width` animated from `0%` to `100%`
- Transition: `width 0.9s cubic-bezier(0.4, 0, 0.2, 1) 0.2s`
- Triggered by same `animate` boolean

**Hero number fade-in:**
- `opacity: 0 → 1`, `transform: translateY(14px) → none`
- Transition: `opacity 0.4s ease, transform 0.4s ease`

**Tab transition:**
- Screens re-mount on tab change (`key={tab}` on screen container)
- This naturally resets all animations (rings re-animate, number re-counts)
- No slide transition between screens — instant swap with re-mount

**Charts (Recharts):**
- Recharts lines draw in naturally on mount — no extra animation needed
- Tooltip: custom styled, flat dark, no border-radius

**Do NOT use:**
- Spring animations
- Framer Motion (unnecessary)
- Bounce or elastic easing
- Any animation on interactive tap (no scale transforms on press)

---

## 7. Component Patterns

### MacroRing

SVG arc progress ring. Three instances on Today screen.

```tsx
// Props
interface MacroRingProps {
  value: number       // current grams
  max: number         // target grams
  color: string       // CSS var or hex
  label: string       // "PROTEIN", "CARBS", "FAT"
  animate: boolean    // triggers fill animation
}

// Key implementation details:
// - r = 33, circumference = 2 * Math.PI * 33
// - strokeWidth = 5
// - Background ring: stroke var(--color-border) 
// - Progress ring: stroke prop color
// - strokeLinecap="square"
// - transform="rotate(-90 41 41)" to start at top
// - Center text: value in Bebas Neue 19px + "G" label in Barlow Condensed 8px
// - Below ring: label in Barlow Condensed 700 9px + "/MAXg" in muted
```

### CalorieHero

The main Today screen number. Uses `useCountUp` hook.

```tsx
// Renders: KCAL REMAINING label + giant animated number + red accent line
// + three-column stat row (GOAL / EATEN / BURNED)
// + AdaptiveBadge component
```

### MealRow

Single row in meal log. Two states: logged and empty.

```tsx
// Logged state: meal name + time + food items list + kcal number
// Empty state: meal name (dimmed) + small + button (26x26, 1px border)
// borderTop: 1px solid var(--color-border-soft)
// padding: 14px 20px
```

### StatCard (2x2 grid variant)

Used in Trends and Body screens. Creates "inset tile" visual effect.

```tsx
// Container: display grid, gridTemplateColumns 1fr 1fr, gap 1px, background var(--color-border)
// Each cell: background var(--color-bg), padding 14px 12px
// Value: Bebas Neue 20px
// Label: Barlow Condensed 700 9px uppercase tracking-wide
```

### TabBar

Fixed bottom navigation. 5 tabs. Center tab is LOG (FAB-style).

```
Tabs: TODAY · TRENDS · [LOG FAB] · BODY · MORE
```

- Container: `background: var(--color-bg); border-top: 1px solid var(--color-border)`
- Padding: `10px 0 26px` (26px bottom = safe area for iPhone home bar)
- LOG button: 52x52px, `background: var(--color-accent)`, square, elevated 18px above bar
- Active tab: icon filled + label in `var(--color-accent)`
- Inactive tab: icon outline + label in `var(--color-text-muted)`
- Icon set: custom SVG (no third-party icon library) — square/angular style, no rounded paths
- Label: Barlow Condensed 700, 8px, 1.5px letter-spacing, uppercase

### AdaptiveBadge

Status indicator on Today screen showing TDEE algorithm is active.

```tsx
// inline-flex, border 1px solid var(--color-border), background var(--color-bg)
// padding 5px 10px
// Left: 6px orange circle dot
// Text: "ADAPTIVE TDEE ACTIVE · {n} DATA POINTS" in Barlow Condensed 700 9px
```

---

## 8. Screens & Features

### 8.1 Today (`/today`)

**Purpose:** Daily dashboard. Single source of truth for what to eat today.

**Layout top to bottom:**
1. Header row — date (MON · 9 JUN) left, username in accent color, avatar square right
2. Calorie hero — "KCAL REMAINING" micro-label, giant animated number, accent line, GOAL/EATEN/BURNED row
3. Adaptive badge
4. Macros section — three rings (PROTEIN / CARBS / FAT) with animated fill
5. Meal log — TODAY'S LOG header + total kcal right-aligned + meal rows

**Data requirements:**
- Today's food logs (summed by macro)
- User's daily targets (from latest TDEE estimate + macro split)
- Goal + eaten + burned (exercise log sum for today)

**Behavior:**
- Tapping a meal row with items → expand to show item detail (future phase)
- Tapping empty meal + button → navigate to `/log` with that meal_type pre-selected
- Rings animate and number counts up on every screen visit (tab re-mount resets)

### 8.2 Trends (`/trends`)

**Purpose:** Weight and TDEE over time. The proof the science is working.

**Layout top to bottom:**
1. CURRENT WEIGHT hero (large number + unit + delta in accent color)
2. 28-day weight line chart (Recharts)
3. Divider
4. ADAPTIVE TDEE section — large TDEE number + 2x2 stat grid (DATA POINTS / CONFIDENCE / ADAPTATION / RATE/WEEK)
5. (Future phase) TDEE trend chart over time

**Chart spec:**
- Type: LineChart from recharts
- Data: last 28 weight_logs for user
- X-axis: day number, styled in Barlow Condensed, no tick lines
- Y-axis: weight values, auto-domain with 0.5 padding, no axis line
- Line: stroke `var(--color-accent)`, strokeWidth 2, no dots, sharp
- Active dot: r=4, filled accent, no stroke
- Tooltip: custom component, flat dark surface, Bebas Neue value + Barlow Condensed label
- No grid lines. No fill under line.

**Confidence levels:**
- `low` = fewer than 7 data points
- `medium` = 7–13 data points
- `high` = 14+ data points

### 8.3 Log (`/log`)

**Purpose:** Find and log food quickly.

**Layout:**
1. LOG FOOD section header
2. Search bar (styled as flat input, no border-radius)
3. Quick-action 2x2 grid: SCAN BARCODE / QUICK ADD / MY FOODS / RECENT
4. LOG TO section — list of meal types the user can add to

**Search behavior:**
- On type (debounced 300ms): query USDA FoodData Central API first (fastest, most reliable)
- If result count < 5: also query Open Food Facts
- Restaurant query (detected by keywords or user toggle): hit Nutritionix API
- Results shown as flat rows: food name, serving size, kcal, macros inline

**Barcode scan:**
- Browser `BarcodeDetector` API (supported on Chrome/Android, iOS Safari 17+)
- Fallback: `ZXing` library for older iOS
- On scan: lookup barcode in Open Food Facts first, then Nutritionix
- Show result immediately for user confirmation before logging

**Custom food creation:**
- Accessible from MY FOODS → + button
- Form: name, brand (optional), serving size, kcal, protein, carbs, fat, fiber, barcode (optional)
- `is_shared: true` by default — all 3 users see community foods

### 8.4 Body (`/body`)

**Purpose:** Track body composition over time. Separate fat mass from lean mass.

**Layout:**
1. BODY COMPOSITION header + current BF% hero (large, method label below)
2. Accent line
3. 2x2 stat grid: LEAN MASS / FAT MASS / FFMI / BMI
4. MEASUREMENTS section — neck, waist, hip, height rows with last updated date
5. LOG MEASUREMENTS button at bottom

**Active method logic:**
- Default: Navy method (requires neck + waist + [hip for females])
- If manual BF% exists and is more recent than 14 days: show both, let user choose active
- If DEXA reference uploaded: show as reference only, does not override active method
- FFMI is always calculated from Navy method LBM

**Trend view (future phase):** FM and LBM as separate lines on a dual-axis chart over time.

### 8.5 Profile (`/profile`) [route: More tab]

**Purpose:** User settings, goal management, vitals.

**Layout:**
1. User header — avatar square + name + current phase label (CUTTING · WEEK 4)
2. Accent line
3. CURRENT GOAL card — target weight, progress bar, ETA, percentage complete
4. VITALS — height, age, activity level, streak
5. Edit goal button
6. Logout button

**Goal progress bar:**
- Full-width flat bar, `background: var(--color-border)`
- Fill: `background: var(--color-accent)`, width = `(lost / total_to_lose) * 100%`
- No animation — static at current progress

### 8.6 Admin (`/admin`)

**Access:** Only `profiles.is_admin = true`. All other users get 404.

**Layout:**
- Three user cards showing: username, current weight, TDEE estimate, goal progress, last log date
- No editing of user data from admin view (read-only in Phase 1)

---

## 9. Science Engine

All calculations run in `/app/api/` routes (server-side). Results are stored in `tdee_estimates` and returned to the client. Nothing below runs in browser JavaScript.

### 9.1 RMR Estimation (Resting Metabolic Rate)

Three formulas run simultaneously. Output is a weighted ensemble.

**Formula 1 — Mifflin-St Jeor (1990)**
Best general-population accuracy without body composition data.
```
Males:   RMR = (10 × kg) + (6.25 × cm) - (5 × age) + 5
Females: RMR = (10 × kg) + (6.25 × cm) - (5 × age) - 161
```
Reference: Mifflin MD et al. *Am J Clin Nutr.* 1990;51(2):241-247.

**Formula 2 — Katch-McArdle**
More accurate when LBM is known. Used when body composition data exists.
```
RMR = 370 + (21.6 × LBM_kg)
```
Reference: McArdle WD, Katch FI, Katch VL. *Exercise Physiology.* 1996.

**Formula 3 — Cunningham**
Best for athletes and highly active individuals.
```
RMR = 500 + (22 × LBM_kg)
```
Reference: Cunningham JJ. *Am J Clin Nutr.* 1980;33(11):2372-2374.

**Ensemble weighting logic:**
```ts
function getRMREnsemble(profile: Profile, bodyComp: BodyComp | null): number {
  const mifflin = calculateMifflin(profile)

  if (!bodyComp) return mifflin  // No body comp data: use Mifflin only

  const katch = calculateKatchMcArdle(bodyComp.lean_mass_kg)
  const cunningham = calculateCunningham(bodyComp.lean_mass_kg)
  const activityMultiplier = getActivityMultiplier(profile.activity_level)

  // Weight toward formulas that use LBM when BF% is known
  // Cunningham weighted higher for active users
  const isActive = ['very_active', 'extra_active'].includes(profile.activity_level)

  if (isActive) {
    return (mifflin * 0.2) + (katch * 0.3) + (cunningham * 0.5)
  }
  return (mifflin * 0.3) + (katch * 0.4) + (cunningham * 0.3)
}
```

**Important:** As the user accumulates actual logged data, the adaptive TDEE model progressively overrides the formula estimate (see 9.3).

### 9.2 Activity Multipliers

Based on Harris-Benedict activity factors, consistent with literature.

| Level | Multiplier | Description |
|---|---|---|
| `sedentary` | 1.2 | Desk job, no exercise |
| `lightly_active` | 1.375 | Light exercise 1–3 days/week |
| `moderately_active` | 1.55 | Moderate exercise 3–5 days/week |
| `very_active` | 1.725 | Hard exercise 6–7 days/week |
| `extra_active` | 1.9 | Physical job + hard daily training |

Initial TDEE = RMR × activity_multiplier. This is the starting estimate before adaptive data exists.

### 9.3 Adaptive TDEE (Weighted Regression Model)

**Core principle:** The user's actual calorie intake vs. their actual weight change tells us their real TDEE more accurately than any formula. 3,500 kcal surplus/deficit ≈ 0.45 kg body weight change (adjusted for body composition).

**Algorithm:**

1. Pull the last 28 days of `weight_logs` and `food_logs`.
2. Calculate a 7-day rolling average weight for each week to suppress noise from:
   - Water retention fluctuations (glycogen, sodium, hydration)
   - Menstrual cycle water retention (2–4 day luteal phase artifact, if cycle tracking enabled)
   - Single outlier weigh-ins
3. Calculate weekly average calorie intake from `food_logs`.
4. For each week pair: infer TDEE from `intake - (weight_change_kg × 7700 kcal/kg)`.
   - Note: 7,700 kcal/kg is a more accurate mixed-tissue coefficient than the commonly cited 7,700 for pure fat. Adjust if body composition tracking shows high muscle retention.
5. Apply weighted regression — more recent weeks weighted more heavily:
   ```
   Week 4 (most recent): weight = 0.40
   Week 3:               weight = 0.30
   Week 2:               weight = 0.20
   Week 1 (oldest):      weight = 0.10
   ```
6. Output: weighted average TDEE estimate + confidence level.

**Minimum data requirement:** 7 weight logs before adaptive model activates. Below 7 points: fall back to RMR × activity multiplier with `confidence: 'low'`.

**Bayesian noise filtering:**
- Weight variance above ±1.5 kg in a single week flagged as noise (likely water retention event)
- Flagged weeks downweighted by 50% in regression
- If cycle tracking enabled: luteal phase weeks (days 15–28) automatically downweighted by 30%

Reference: Hall KD et al. *Lancet.* 2011;378(9793):826-837 (energy balance modeling).
Reference: Thomas DM et al. *Int J Obes.* 2014;38(12):1565-1570 (body weight change model).

### 9.4 Metabolic Adaptation Detection

**Definition:** When prolonged caloric deficit causes metabolic rate to drop beyond what body weight and composition loss alone would predict. Sometimes called adaptive thermogenesis.

Reference: Rosenbaum M, Leibel RL. *Curr Opin Clin Nutr Metab Care.* 2010;13(6):685-692.

**Detection algorithm:**
```ts
function detectAdaptation(
  predictedTDEE: number,     // from adaptive regression
  formulaTDEE: number,       // from RMR ensemble × activity
  deficitWeeks: number,      // consecutive weeks below maintenance
): AdaptationResult {
  const suppression = (formulaTDEE - predictedTDEE) / formulaTDEE

  // Suppression > 10% after 4+ weeks of deficit = adaptation signal
  if (suppression > 0.10 && deficitWeeks >= 4) {
    return {
      flag: true,
      severity: suppression > 0.15 ? 'moderate' : 'mild',
      suppressionPct: suppression * 100,
      recommendation: 'Consider a diet break or refeed week'
    }
  }
  return { flag: false, suppressionPct: suppression * 100 }
}
```

**UI response when flagged:**
- `adaptation_flag: true` on badge shows "ADAPTATION DETECTED" in warning color
- Profile screen shows recommendation to pause deficit
- TDEE estimate clearly labeled as "ADAPTED ESTIMATE" not baseline

### 9.5 Body Composition — Navy Method

**Reference:** Hodgdon JA, Beckett MB. *Prediction of percent body fat for U.S. Navy men and women.* Naval Health Research Center. 1984.

```ts
function navyBodyFat(params: {
  sex: 'male' | 'female'
  height_cm: number
  neck_cm: number
  waist_cm: number
  hip_cm?: number  // required for female
}): number {
  const { sex, height_cm, neck_cm, waist_cm, hip_cm } = params

  if (sex === 'male') {
    return (
      495 / (1.0324 - 0.19077 * Math.log10(waist_cm - neck_cm) + 0.15456 * Math.log10(height_cm))
    ) - 450
  }

  if (!hip_cm) throw new Error('Hip measurement required for female calculation')
  return (
    495 / (1.29579 - 0.35004 * Math.log10(waist_cm + hip_cm - neck_cm) + 0.22100 * Math.log10(height_cm))
  ) - 450
}

function derivedComposition(weight_kg: number, bf_pct: number) {
  const fat_mass_kg  = weight_kg * (bf_pct / 100)
  const lean_mass_kg = weight_kg - fat_mass_kg
  return { fat_mass_kg, lean_mass_kg }
}
```

**FFMI (Fat-Free Mass Index):**
```ts
function calculateFFMI(lean_mass_kg: number, height_cm: number): number {
  const height_m = height_cm / 100
  return lean_mass_kg / (height_m * height_m)
}
// Normalized FFMI (adjusted for height): add (6.1 × (1.8 - height_m))
// Natural male ceiling ≈ 25. Above 25 FFMI: note in UI (no judgment, just reference).
```

### 9.6 Macro Targets

Applied after TDEE is established. Protein is set first, fat has a minimum floor, carbs fill remaining calories.

**Protein target (priority 1):**
```
If LBM known:   protein_g = LBM_kg × user_protein_multiplier  (default: 2.4 g/kg LBM)
If LBM unknown: protein_g = body_weight_kg × 1.8
```
Reference: Morton RW et al. *Br J Sports Med.* 2018;52(6):376-384 (protein for muscle retention).
Reference: Helms ER et al. *Int J Sport Nutr Exerc Metab.* 2014 (2.3–3.1 g/kg LBM for lean athletes).

**Fat floor (priority 2):**
```
fat_g = max(body_weight_kg × 0.7, 40)  // minimum 40g, or 0.7g/kg bodyweight
```
Reference: Hamalainen E et al. *J Steroid Biochem.* 1984 (fat minimum for testosterone maintenance).

**Carbs (fill remaining):**
```
protein_kcal = protein_g × 4
fat_kcal     = fat_g × 9
carb_kcal    = TDEE_target - protein_kcal - fat_kcal
carb_g       = carb_kcal / 4
```

**Training day adjustment (future phase):** +10–15% carbs on logged training days, sourced from slight reduction in rest-day carbs. Same weekly total.

### 9.7 Goal & Rate Logic

**Rate recommendations:**

| Goal | Recommended Rate | Max Safe Rate |
|---|---|---|
| Cut | 0.5–0.75% body weight/week | 1% body weight/week |
| Aggressive cut | 0.75–1.0% BW/week | 1% BW/week |
| Bulk (lean) | 0.25% BW/week | 0.5% BW/week |
| Maintain | 0 | ±0.1% BW/week tolerance |

Reference: Helms ER et al. *Sports Med.* 2014;44(7):959-988 (natural bodybuilding contest prep).

**Calorie target from rate:**
```ts
function getDailyTarget(tdee_kcal: number, rate_kg_per_week: number): number {
  const weekly_kcal_change = rate_kg_per_week * 7700  // kcal per kg body tissue
  const daily_kcal_change  = weekly_kcal_change / 7
  return tdee_kcal - daily_kcal_change  // negative = deficit, positive = surplus
}
```

**ETA calculation:**
```ts
function getGoalETA(
  current_weight_kg: number,
  goal_weight_kg: number,
  rate_kg_per_week: number
): Date {
  const weeks = Math.abs(current_weight_kg - goal_weight_kg) / rate_kg_per_week
  const eta = new Date()
  eta.setDate(eta.getDate() + Math.round(weeks * 7))
  return eta
}
```

**Adaptive pacing:** If adaptation is detected (see 9.4), `rate_kg_per_week` is automatically reduced by 20% in the target calculation and user is notified.

### 9.8 Menstrual Cycle Adjustment

Only active if `cycle_tracking_enabled = true` in profile.

**Phase detection:**
```ts
function getCyclePhase(lastPeriodStart: Date, cycleLength = 28): CyclePhase {
  const daysSince = differenceInDays(new Date(), lastPeriodStart) % cycleLength
  if (daysSince <= 5)  return 'menstrual'    // days 1–5
  if (daysSince <= 13) return 'follicular'   // days 6–13
  if (daysSince <= 16) return 'ovulation'    // days 14–16
  return 'luteal'                             // days 17–28
}
```

**Adjustments by phase:**

| Phase | Weight interpretation | TDEE adjustment | Protein note |
|---|---|---|---|
| Menstrual | Normal | None | Magnesium note flagged |
| Follicular | Normal | None | Baseline |
| Ovulation | Normal | None | Baseline |
| Luteal | Water retention: +0.5–2kg expected | +150–300 kcal (progesterone effect) | Slight carb cravings: normal |

Reference: Benton MJ et al. *Nutr Health.* 2020 (menstrual cycle and energy expenditure).
Reference: McNulty KL et al. *Sports Med.* 2020;50(10):1813-1827 (cycle phase and performance).

**UI indicators (luteal phase):**
- Small phase indicator on Today header next to date
- Trend screen: weight chart shows shaded band during luteal phase with "LUTEAL PHASE" label
- Adaptation detection ignores luteal phase weight gain when flagging

---

## 10. Food Database

### Search priority order:
1. **USDA FoodData Central** — query first, free, reliable for whole foods
   - Endpoint: `https://api.nal.usda.gov/fdc/v1/foods/search?query={q}&api_key={key}`
   - API key: free, register at https://fdc.nal.usda.gov/api-guide.html
2. **Open Food Facts** — packaged goods with barcodes
   - Endpoint: `https://world.openfoodfacts.org/cgi/search.pl?search_terms={q}&json=1`
   - Barcode: `https://world.openfoodfacts.org/api/v3/product/{barcode}.json`
3. **Nutritionix** — restaurant foods
   - Only query when: search includes restaurant name, or user toggles "Restaurant" mode
   - Free tier: 500 calls/day (sufficient for 3 users with aggressive caching)
   - Endpoint: `https://trackapi.nutritionix.com/v2/search/instant`

### Caching strategy:
- Cache all food API responses in Supabase `custom_foods` table as `is_shared: false` system cache entries
- TTL: 30 days for USDA/OFF, 7 days for Nutritionix
- Same search string from any of the 3 users hits cache first, never re-queries API

### Serving size handling:
- Always store nutrition per 100g in `custom_foods`
- `serving_g` stored on each `food_log` entry
- Display math: `(nutrient_per_100g / 100) × serving_g`

---

## 11. PWA Configuration

### `public/manifest.json`
```json
{
  "name": "[APP_NAME]",
  "short_name": "[APP_NAME]",
  "description": "Science-forward adaptive nutrition tracker",
  "start_url": "/today",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0D0D0D",
  "theme_color": "#0D0D0D",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### `next.config.js` (next-pwa)
```js
const withPWA = require('next-pwa')({ dest: 'public', disable: process.env.NODE_ENV === 'development' })
module.exports = withPWA({ reactStrictMode: true })
```

### Meta tags in `layout.tsx`:
```tsx
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="theme-color" content="#0D0D0D" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

### Safe area handling:
```css
/* Bottom of tab bar must account for iPhone home bar */
.tab-bar { padding-bottom: max(26px, env(safe-area-inset-bottom)); }

/* All scrollable screens */
.screen { padding-bottom: max(92px, calc(66px + env(safe-area-inset-bottom))); }
```

---

## 12. Build Phases

### Phase 0 — Foundation (Target: 1–2 weeks)
- [ ] Next.js 14 project init with TypeScript + Tailwind
- [ ] Supabase project created, schema migrated (all tables above)
- [ ] Supabase Auth configured, 3 user accounts created manually
- [ ] Route protection middleware
- [ ] Design system: CSS variables in globals.css, fonts loaded
- [ ] Layout shell: bottom TabBar, screen container with safe area
- [ ] PWA manifest + icons
- [ ] Vercel deployment connected to GitHub

**Done when:** App loads at Vercel URL, login works, tabs switch, fonts render correctly.

### Phase 1 — Food Logging (Target: 2–3 weeks)
- [ ] USDA FoodData Central search API route
- [ ] Open Food Facts search + barcode lookup
- [ ] Food log table: create, read, delete entries
- [ ] Today screen: real data from Supabase (not mock)
- [ ] Macro rings: live calculated from today's food_logs
- [ ] Calorie hero: live remaining calculation
- [ ] Meal rows: real logged items + empty state with + button
- [ ] Log screen: search UI, results list, portion entry, confirm log
- [ ] Barcode scanner (BarcodeDetector API + ZXing fallback)
- [ ] Custom food creation
- [ ] Saved meals: save today's meal as template, re-log from template

**Done when:** A user can search, log, and see their macros update in real time.

### Phase 2 — Science Engine Core (Target: 3–4 weeks)
- [ ] Onboarding flow: height, weight, age, sex, activity, goal, rate, BF method
- [ ] RMR ensemble calculation (Mifflin + Katch-McArdle + Cunningham)
- [ ] Static TDEE baseline stored in tdee_estimates on onboarding completion
- [ ] Weight logging: daily log + smart averaging (7-day rolling)
- [ ] Adaptive TDEE algorithm: weighted regression, runs weekly or on demand
- [ ] Confidence level calculation + badge update
- [ ] Macro targets: protein-priority split from TDEE
- [ ] Goal setting: type + rate + target weight → ETA calculation
- [ ] Profile screen: live goal progress bar + ETA

**Done when:** After 7+ weight logs, TDEE estimate switches from formula to adaptive, and macro targets update accordingly.

### Phase 3 — Body Composition (Target: 2–3 weeks)
- [ ] Body measurements form (neck, waist, hip, height)
- [ ] Navy method BF% calculation on save
- [ ] Derived: LBM, FM, FFMI stored in body_measurements
- [ ] Manual BF% entry + DEXA reference upload
- [ ] Body screen: live from latest measurement
- [ ] Protein target adjusts dynamically to use LBM from measurements
- [ ] Metabolic adaptation detection: flag in badge + profile recommendation

**Done when:** Body screen shows real composition data. Protein target references LBM.

### Phase 4 — Polish + Social (Target: 1–2 weeks)
- [ ] Opt-in leaderboard: streak / 7-day deficit / avg protein adherence
- [ ] Admin dashboard: 3 user cards with key stats
- [ ] Nutritionix restaurant integration
- [ ] Trends screen: full recharts charts with real data
- [ ] TDEE trend chart (history of estimates over time)
- [ ] Onboarding flow polish + loading states
- [ ] Error states for all API failures
- [ ] Empty states for all screens

**Done when:** App is presentable to the other 2 users.

### Phase 5 — Advanced Features (No deadline)
- [ ] Menstrual cycle tracking (cycle_logs table + phase detection + UI indicators)
- [ ] Goal periodization: planned bulk/cut cycles with transition weeks
- [ ] Fitbit API integration (exercise data sync)
- [ ] Training day macro adjustment (+carbs on workout days)
- [ ] FM vs LBM dual trend line chart
- [ ] Predictive projection: "if you continue at this rate, you'll reach goal on [date]"

---

## 13. Claude Code Instructions

Read this section before generating any code for this project.

### Identity of this project
This is a private science-forward nutrition tracker PWA. It has 3 users. It runs on Next.js + Supabase + Vercel. Every decision in this document is intentional. Do not introduce patterns, libraries, or UI components not specified here.

### Design rules (non-negotiable)
1. **Fonts:** Only Bebas Neue (numbers), Barlow Condensed (labels), Barlow (body). Never Inter, never system fonts.
2. **Colors:** Always use CSS custom property tokens (`var(--color-accent)` etc.). Never hardcode hex values.
3. **Border radius:** Zero on all data surfaces and cards. Never add `rounded-*` Tailwind classes to cards or stat boxes.
4. **Shadows:** None. Flat design only. Never add `shadow-*` Tailwind classes.
5. **Animations:** Only the four animations defined in section 6.5. Do not add new animations without instruction.
6. **No UI libraries:** Do not import anything from Shadcn, Radix, MUI, Chakra, or any other component library.
7. **Icons:** Custom inline SVG only. Do not install or import Lucide, Heroicons, or any icon package.

### Code quality rules
1. All files in TypeScript. `strict: true` in tsconfig.
2. All database queries use the generated Supabase types from `@/lib/supabase/types.ts`.
3. All science calculations live in `/lib/science/`. Never calculate nutrition math in a React component.
4. API routes validate all inputs before processing. Zod schemas for request bodies.
5. All Supabase queries check for errors and return typed results. Never use `as any`.
6. RLS is the security layer. Do not add application-level user ID filtering on top of queries that already have RLS — trust the policy.

### When generating a new screen or component
1. Check section 8 for the exact layout spec before writing JSX
2. Apply design tokens from section 6 — not arbitrary values
3. Use the `useCountUp` hook for any animated number
4. Use the `MacroRing` component pattern for any arc progress indicator
5. Scrollable screen containers always have `paddingBottom: max(92px, ...)` for tab bar clearance

### When modifying the science engine
1. Every formula must have its reference citation preserved in a comment above the function
2. Do not swap or modify algorithm logic without flagging the change and the reason
3. Intermediate values (rmr, ensemble weights, regression inputs) should be returned in the API response for debugging, not just the final TDEE

### When in doubt
Follow what is in this document. If the document does not cover something, ask before generating.
