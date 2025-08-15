#!/usr/bin/env npx ts-node

import {
  STAR_COST_USD,
  MARKUP_MULTIPLIER,
  USD_TO_RUB_RATE,
  usdToStars,
  starsToUSD,
  starsToRUB,
  calculateVideoPriceInStars,
  VEO_MODELS_PRICING,
  logPricingConfig,
} from '../src/config/unified-pricing.config'

import { VIDEO_MODELS, getModelPriceInStars } from '../src/services/videoModels'

console.log('🕉️ ТЕСТИРОВАНИЕ ЕДИНОЙ СИСТЕМЫ ЦЕНООБРАЗОВАНИЯ\n')
console.log('='.repeat(60))

// Показываем конфигурацию
logPricingConfig()

console.log('\n' + '='.repeat(60))
console.log('\n📊 ПРОВЕРКА РАСЧЁТОВ VEO МОДЕЛЕЙ:\n')

// Тестируем каждую модель Veo
Object.entries(VEO_MODELS_PRICING).forEach(([modelId, config]) => {
  console.log(`\n📹 ${modelId}:`)
  console.log(`  Цена за секунду: $${config.pricePerSecondUSD}`)
  console.log(
    `  Поддерживаемые длительности: ${config.supportedDurations.join(', ')} сек`
  )
  console.log(`  По умолчанию: ${config.defaultDuration} сек`)

  console.log('\n  Расчёт цен:')
  config.supportedDurations.forEach(duration => {
    const priceFromUnified = calculateVideoPriceInStars(
      config.pricePerSecondUSD,
      duration
    )
    const priceFromVideoModels = getModelPriceInStars(modelId as any, duration)

    const totalCostUSD = config.pricePerSecondUSD * duration
    const match = priceFromUnified === priceFromVideoModels ? '✅' : '❌'

    console.log(
      `    ${duration} сек: ${priceFromUnified} ⭐ ($${totalCostUSD.toFixed(2)}) ${match}`
    )

    if (priceFromUnified !== priceFromVideoModels) {
      console.log(
        `      ⚠️ НЕСООТВЕТСТВИЕ: videoModels.ts возвращает ${priceFromVideoModels} ⭐`
      )
    }
  })
})

console.log('\n' + '='.repeat(60))
console.log('\n💰 ПРОВЕРКА КОНВЕРТАЦИИ ВАЛЮТ:\n')

// Тестируем конвертацию для примера 100 звёзд
const testStars = 100
const usd = starsToUSD(testStars)
const rub = starsToRUB(testStars)

console.log(`${testStars} ⭐ = $${usd.toFixed(2)} = ${rub} ₽`)

// Проверяем обратную конвертацию
const baseCostUSD = 1.6 // Пример базовой стоимости
const stars = usdToStars(baseCostUSD)
const backToUSD = starsToUSD(stars)

console.log(`\nБазовая стоимость: $${baseCostUSD}`)
console.log(
  `С наценкой ${((MARKUP_MULTIPLIER - 1) * 100).toFixed(0)}%: ${stars} ⭐`
)
console.log(`Обратно в USD: $${backToUSD.toFixed(2)}`)

console.log('\n' + '='.repeat(60))
console.log('\n🔍 ПРОВЕРКА КОНСИСТЕНТНОСТИ:\n')

// Проверяем, что все константы одинаковые
import { starCost, interestRate } from '../src/price/constants'

const starCostMatch = starCost === STAR_COST_USD ? '✅' : '❌'
const interestRateMatch = interestRate === MARKUP_MULTIPLIER ? '✅' : '❌'

console.log(
  `starCost совпадает: ${starCostMatch} (${starCost} vs ${STAR_COST_USD})`
)
console.log(
  `interestRate совпадает: ${interestRateMatch} (${interestRate} vs ${MARKUP_MULTIPLIER})`
)

console.log('\n✅ Тестирование завершено!')
