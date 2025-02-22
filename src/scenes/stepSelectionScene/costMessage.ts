import { conversionRates } from '@/scenes/checkBalanceScene'

const stepOptions = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]

const costDetails = stepOptions.map(steps => {
  const costInRubles = calculateTrainingCostInRubles(steps)
  const costInStars = calculateTrainingCostInStars(steps)
  const costInDollars = calculateTrainingCostInDollars(steps)

  return {
    steps,
    stars: costInStars.toFixed(0), // Форматируем до двух знаков после запятой
    rubles: costInRubles.toFixed(0), // Форматируем до двух знаков после запятой
    dollars: costInDollars.toFixed(0), // Форматируем до двух знаков после запятой
  }
})

// Функция для расчета стоимости в звездах
function calculateTrainingCostInStars(steps: number): number {
  return steps * conversionRates.costPerStepInStars // Умножаем количество шагов на стоимость за шаг в звездах
}

// Функция для расчета стоимости в рублях
function calculateTrainingCostInRubles(steps: number): number {
  return (
    steps *
    conversionRates.costPerStepInStars *
    conversionRates.costPerStarInDollars *
    conversionRates.rublesToDollarsRate
  ) // Умножаем количество шагов на стоимость за шаг в рублях
}

function calculateTrainingCostInDollars(steps: number): number {
  return (
    steps *
    conversionRates.costPerStepInStars *
    conversionRates.costPerStarInDollars
  ) // Умножаем количество шагов на стоимость за шаг в долларах
}

// Формирование сообщения
export const stepsCostMessageRu =
  '🔢 Пожалуйста, выберите количество шагов для обучения модели.\n\n📈 Чем больше шагов, тем лучше качество, но это будет стоить дороже. 💰\n\n💰 Стоимость:\n' +
  costDetails
    .map(
      detail => `${detail.steps} шагов - ${detail.stars}⭐ / ${detail.rubles}₽`
    )
    .join('\n')

export const stepsCostMessageEn =
  '🔢 Please choose the number of steps for model training.\n\n📈 The more steps, the better the quality, but it will cost more. 💰\n\n💰 Cost:\n' +
  costDetails
    .map(
      detail => `${detail.steps} steps - ${detail.stars}⭐ / $${detail.dollars}`
    )
    .join('\n')
