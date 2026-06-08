export interface FoodResult {
  id: string
  source: 'usda' | 'off'
  name: string
  brand?: string
  kcalPer100g: number
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
  fiberPer100g: number
  servingG: number
}
