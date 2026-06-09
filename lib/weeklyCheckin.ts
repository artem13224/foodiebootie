/**
 * Shared constants for the weekly check-in flow.
 *
 * Kept out of the page component because Next.js App Router page files may only
 * export a default component plus a fixed set of route config fields — arbitrary
 * named exports fail the production build.
 */

/** localStorage key holding the Monday (YYYY-MM-DD) of the last acknowledged week. */
export const CHECKIN_STORAGE_KEY = 'lastCheckinWeekMonday'
