export interface FoodResult {
  id: string
  /** usda = USDA FoodData Central, off = Open Food Facts, fatsecret = FatSecret, nutritionix = Nutritionix (restaurant), custom = custom/recipe food */
  source: 'usda' | 'off' | 'fatsecret' | 'nutritionix' | 'custom'
  name: string
  brand?: string
  kcalPer100g: number
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
  fiberPer100g: number
  servingG: number
  /** Set when source === 'custom'; used to populate custom_food_id on food_logs */
  customFoodId?: string
}
