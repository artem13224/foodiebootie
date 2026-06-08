import type { AdaptationResult } from '@/types'

/**
 * Detect metabolic adaptation (adaptive thermogenesis).
 *
 * Definition: When prolonged caloric deficit causes metabolic rate to drop
 * beyond what body weight and composition loss alone would predict.
 *
 * Algorithm: compare the adaptive TDEE regression estimate against the
 * formula-based TDEE baseline. Suppression > 10% after 4+ consecutive weeks
 * of deficit is flagged as metabolic adaptation.
 *
 * Reference: Rosenbaum M, Leibel RL. Adaptive thermogenesis in humans.
 * Curr Opin Clin Nutr Metab Care. 2010;13(6):685-692.
 */
export function detectAdaptation(
  predictedTDEE: number,    // from adaptive regression
  formulaTDEE: number,      // from RMR ensemble × activity multiplier
  deficitWeeks: number,     // consecutive weeks with intake < maintenance
): AdaptationResult {
  if (formulaTDEE <= 0) {
    return { flag: false, suppressionPct: 0 }
  }

  const suppression = (formulaTDEE - predictedTDEE) / formulaTDEE

  if (suppression > 0.10 && deficitWeeks >= 4) {
    return {
      flag: true,
      severity: suppression > 0.15 ? 'moderate' : 'mild',
      suppressionPct: Math.round(suppression * 1000) / 10,  // 1 decimal
      recommendation: 'Consider a diet break or refeed week',
    }
  }

  return {
    flag: false,
    suppressionPct: Math.round(suppression * 1000) / 10,
  }
}

/**
 * Count consecutive recent weeks where average daily calorie intake
 * was below the formula TDEE (with a 5% tolerance buffer for maintenance).
 */
export function countDeficitWeeks(
  weeklyAvgIntakes: number[],   // ordered oldest → newest
  formulaTDEE: number,
): number {
  // Walk backwards from most recent week
  let count = 0
  for (let i = weeklyAvgIntakes.length - 1; i >= 0; i--) {
    if (weeklyAvgIntakes[i] < formulaTDEE * 0.95) {
      count++
    } else {
      break  // consecutive streak broken
    }
  }
  return count
}
