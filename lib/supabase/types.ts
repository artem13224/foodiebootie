// Run `supabase gen types typescript --project-id <your-project-id>` to regenerate.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          is_admin: boolean
          height_cm: number | null
          sex: 'male' | 'female' | 'other' | null
          date_of_birth: string | null
          activity_level: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active' | null
          goal_type: 'cut' | 'maintain' | 'bulk' | 'recomp' | 'performance' | null
          goal_weight_kg: number | null
          goal_rate_kg_per_week: number | null
          goal_start_date: string | null
          protein_g_per_kg_lbm: number
          fat_min_g: number | null
          carb_fill: boolean
          cycle_tracking_enabled: boolean
          last_period_start: string | null
          avg_cycle_length_days: number
          onboarding_complete: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          is_admin?: boolean
          height_cm?: number | null
          sex?: 'male' | 'female' | 'other' | null
          date_of_birth?: string | null
          activity_level?: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active' | null
          goal_type?: 'cut' | 'maintain' | 'bulk' | 'recomp' | 'performance' | null
          goal_weight_kg?: number | null
          goal_rate_kg_per_week?: number | null
          goal_start_date?: string | null
          protein_g_per_kg_lbm?: number
          fat_min_g?: number | null
          carb_fill?: boolean
          cycle_tracking_enabled?: boolean
          last_period_start?: string | null
          avg_cycle_length_days?: number
          onboarding_complete?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          username?: string
          is_admin?: boolean
          height_cm?: number | null
          sex?: 'male' | 'female' | 'other' | null
          date_of_birth?: string | null
          activity_level?: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active' | null
          goal_type?: 'cut' | 'maintain' | 'bulk' | 'recomp' | 'performance' | null
          goal_weight_kg?: number | null
          goal_rate_kg_per_week?: number | null
          goal_start_date?: string | null
          protein_g_per_kg_lbm?: number
          fat_min_g?: number | null
          carb_fill?: boolean
          cycle_tracking_enabled?: boolean
          last_period_start?: string | null
          avg_cycle_length_days?: number
          onboarding_complete?: boolean
          updated_at?: string
        }
      }
      weight_logs: {
        Row: {
          id: string
          user_id: string
          logged_at: string
          weight_kg: number
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          logged_at: string
          weight_kg: number
          note?: string | null
          created_at?: string
        }
        Update: {
          logged_at?: string
          weight_kg?: number
          note?: string | null
        }
      }
      food_logs: {
        Row: {
          id: string
          user_id: string
          logged_date: string
          meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'pre_workout' | 'post_workout'
          usda_food_id: string | null
          off_food_id: string | null
          custom_food_id: string | null
          food_name: string
          serving_g: number
          kcal: number
          protein_g: number
          carbs_g: number
          fat_g: number
          fiber_g: number | null
          sugar_g: number | null
          sodium_mg: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          logged_date: string
          meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'pre_workout' | 'post_workout'
          usda_food_id?: string | null
          off_food_id?: string | null
          custom_food_id?: string | null
          food_name: string
          serving_g: number
          kcal: number
          protein_g: number
          carbs_g: number
          fat_g: number
          fiber_g?: number | null
          sugar_g?: number | null
          sodium_mg?: number | null
          created_at?: string
        }
        Update: {
          logged_date?: string
          meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'pre_workout' | 'post_workout'
          usda_food_id?: string | null
          off_food_id?: string | null
          custom_food_id?: string | null
          food_name?: string
          serving_g?: number
          kcal?: number
          protein_g?: number
          carbs_g?: number
          fat_g?: number
          fiber_g?: number | null
          sugar_g?: number | null
          sodium_mg?: number | null
        }
      }
      custom_foods: {
        Row: {
          id: string
          created_by: string | null
          name: string
          brand: string | null
          serving_g: number
          kcal_per_100g: number
          protein_per_100g: number
          carbs_per_100g: number
          fat_per_100g: number
          fiber_per_100g: number | null
          barcode: string | null
          is_shared: boolean
          created_at: string
        }
        Insert: {
          id?: string
          created_by?: string | null
          name: string
          brand?: string | null
          serving_g?: number
          kcal_per_100g: number
          protein_per_100g: number
          carbs_per_100g: number
          fat_per_100g: number
          fiber_per_100g?: number | null
          barcode?: string | null
          is_shared?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          brand?: string | null
          serving_g?: number
          kcal_per_100g?: number
          protein_per_100g?: number
          carbs_per_100g?: number
          fat_per_100g?: number
          fiber_per_100g?: number | null
          barcode?: string | null
          is_shared?: boolean
        }
      }
      saved_meals: {
        Row: {
          id: string
          user_id: string
          name: string
          meal_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          meal_type?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          meal_type?: string | null
        }
      }
      saved_meal_items: {
        Row: {
          id: string
          saved_meal_id: string
          food_name: string
          serving_g: number
          kcal: number
          protein_g: number
          carbs_g: number
          fat_g: number
          usda_food_id: string | null
          off_food_id: string | null
          custom_food_id: string | null
        }
        Insert: {
          id?: string
          saved_meal_id: string
          food_name: string
          serving_g: number
          kcal: number
          protein_g: number
          carbs_g: number
          fat_g: number
          usda_food_id?: string | null
          off_food_id?: string | null
          custom_food_id?: string | null
        }
        Update: {
          food_name?: string
          serving_g?: number
          kcal?: number
          protein_g?: number
          carbs_g?: number
          fat_g?: number
          usda_food_id?: string | null
          off_food_id?: string | null
          custom_food_id?: string | null
        }
      }
      body_measurements: {
        Row: {
          id: string
          user_id: string
          measured_at: string
          neck_cm: number | null
          waist_cm: number | null
          hip_cm: number | null
          navy_bf_pct: number | null
          lean_mass_kg: number | null
          fat_mass_kg: number | null
          ffmi: number | null
          manual_bf_pct: number | null
          dexa_bf_pct: number | null
          active_method: 'navy' | 'manual' | 'dexa'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          measured_at: string
          neck_cm?: number | null
          waist_cm?: number | null
          hip_cm?: number | null
          navy_bf_pct?: number | null
          lean_mass_kg?: number | null
          fat_mass_kg?: number | null
          ffmi?: number | null
          manual_bf_pct?: number | null
          dexa_bf_pct?: number | null
          active_method?: 'navy' | 'manual' | 'dexa'
          created_at?: string
        }
        Update: {
          measured_at?: string
          neck_cm?: number | null
          waist_cm?: number | null
          hip_cm?: number | null
          navy_bf_pct?: number | null
          lean_mass_kg?: number | null
          fat_mass_kg?: number | null
          ffmi?: number | null
          manual_bf_pct?: number | null
          dexa_bf_pct?: number | null
          active_method?: 'navy' | 'manual' | 'dexa'
        }
      }
      tdee_estimates: {
        Row: {
          id: string
          user_id: string
          calculated_at: string
          tdee_kcal: number
          method: string
          data_points: number
          confidence: 'low' | 'medium' | 'high' | null
          adaptation_flag: boolean
          notes: string | null
          // Added in migration 002
          protein_g: number | null
          fat_g: number | null
          carbs_g: number | null
          daily_kcal_target: number | null
        }
        Insert: {
          id?: string
          user_id: string
          calculated_at?: string
          tdee_kcal: number
          method?: string
          data_points: number
          confidence?: 'low' | 'medium' | 'high' | null
          adaptation_flag?: boolean
          notes?: string | null
          protein_g?: number | null
          fat_g?: number | null
          carbs_g?: number | null
          daily_kcal_target?: number | null
        }
        Update: {
          tdee_kcal?: number
          method?: string
          data_points?: number
          confidence?: 'low' | 'medium' | 'high' | null
          adaptation_flag?: boolean
          notes?: string | null
          protein_g?: number | null
          fat_g?: number | null
          carbs_g?: number | null
          daily_kcal_target?: number | null
        }
      }
      exercise_logs: {
        Row: {
          id: string
          user_id: string
          logged_date: string
          activity: string
          duration_min: number | null
          kcal_burned: number | null
          source: 'manual' | 'fitbit'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          logged_date: string
          activity: string
          duration_min?: number | null
          kcal_burned?: number | null
          source?: 'manual' | 'fitbit'
          created_at?: string
        }
        Update: {
          activity?: string
          duration_min?: number | null
          kcal_burned?: number | null
          source?: 'manual' | 'fitbit'
        }
      }
      cycle_logs: {
        Row: {
          id: string
          user_id: string
          period_start: string
          period_end: string | null
          cycle_length: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          period_start: string
          period_end?: string | null
          cycle_length?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          period_start?: string
          period_end?: string | null
          cycle_length?: number | null
          notes?: string | null
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
