export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extra_active'

export type GoalType = 'cut' | 'maintain' | 'bulk' | 'recomp' | 'performance'

export type MealType =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'snacks'
  | 'pre_workout'
  | 'post_workout'

export type BodyMethod = 'navy' | 'manual' | 'dexa'

export type TDEEConfidence = 'low' | 'medium' | 'high'

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal'

export interface MacroTotals {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface MacroTargets extends MacroTotals {
  fiber_g: number
}

export interface AdaptationResult {
  flag: boolean
  severity?: 'mild' | 'moderate'
  suppressionPct: number
  recommendation?: string
}
