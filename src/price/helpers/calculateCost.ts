interface ConversionRates {
    costPerStarInDollars: number
    costPerStepInStars: number
    rublesToDollarsRate: number
  }
  
  // Определяем конверсии
  export const conversionRates: ConversionRates = {
    costPerStepInStars: 0.25,
    costPerStarInDollars: 0.016,
    rublesToDollarsRate: 100,
  }
  
  export const conversionRatesV2: ConversionRates = {
    costPerStepInStars: 2.1,
    costPerStarInDollars: 0.016,
    rublesToDollarsRate: 100,
  }
  
  export function calculateCostInStars(
    steps: number,
    rates: { costPerStepInStars: number }
  ): number {
    const totalCostInStars = steps * rates.costPerStepInStars
    return parseFloat(totalCostInStars.toFixed(2))
  }
  
  export function calculateCostInDollars(
    steps: number,
    rates: { costPerStepInStars: number; costPerStarInDollars: number }
  ): number {
    const totalCostInDollars =
      steps * rates.costPerStepInStars * rates.costPerStarInDollars
    return parseFloat(totalCostInDollars.toFixed(2))
  }
  
  export function calculateCostInRubles(
    steps: number,
    rates: {
      costPerStepInStars: number
      costPerStarInDollars: number
      rublesToDollarsRate: number
    }
  ): number {
    const totalCostInRubles =
      steps *
      rates.costPerStepInStars *
      rates.costPerStarInDollars *
      rates.rublesToDollarsRate
    return parseFloat(totalCostInRubles.toFixed(2))
  }
  
  export const stepOptions = {
    v1: [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000],
    v2: [100, 200, 300, 400, 500, 600, 700, 800, 1000],
  }
  
  export const costDetails = {
    v1: stepOptions.v1.map(steps => calculateCost(steps, 'v1')),
    v2: stepOptions.v2.map(steps => calculateCost(steps, 'v2')),
  }
  
  export interface CostDetails {
    steps: number
    stars: number
    rubles: number
    dollars: number
  }
  
  export function calculateCost(
    steps: number,
    version: 'v1' | 'v2' = 'v1'
  ): CostDetails {
    const rates = version === 'v1' ? conversionRates : conversionRatesV2
    const baseCost = steps * rates.costPerStepInStars
  
    return {
      steps,
      stars: baseCost,
      dollars: baseCost * rates.costPerStarInDollars,
      rubles: baseCost * rates.costPerStarInDollars * rates.rublesToDollarsRate,
    }
  }
  