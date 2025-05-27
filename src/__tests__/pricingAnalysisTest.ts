import { logger } from '@/utils/logger'
import { SYSTEM_CONFIG, starCost, interestRate } from '@/price/constants'
import { BASE_COSTS, calculateModeCost } from '@/price/helpers/modelsCost'
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'
import { calculateFinalPrice as calculateVideoFinalPrice } from '@/price/helpers/calculateFinalPrice'
import { ModeEnum } from '@/interfaces/modes'
import { conversionRates, conversionRatesV2 } from '@/price/priceCalculator'

/**
 * Полный анализ системы ценообразования и себестоимости
 */

interface ServicePricing {
  service: string
  baseCostUSD: number
  finalPriceStars: number
  finalPriceUSD: number
  finalPriceRUB: number
  markup: number
  markupPercent: number
}

interface PricingAnalysis {
  systemConfig: {
    starCostUSD: number
    interestRate: number
    markupMultiplier: number
  }
  fixedServices: ServicePricing[]
  stepBasedServices: {
    service: string
    costPerStepStars: number
    costPerStepUSD: number
    example50Steps: ServicePricing
    example100Steps: ServicePricing
  }[]
  videoServices: ServicePricing[]
  subscriptions: {
    neurophoto: { priceRUB: number; priceUSD: number }
    neurovideo: { priceRUB: number; priceUSD: number }
  }
  inconsistencies: string[]
  recommendations: string[]
}

function analyzePricingSystem(): PricingAnalysis {
  const inconsistencies: string[] = []
  const recommendations: string[] = []

  // Анализ системной конфигурации
  const systemConfig = {
    starCostUSD: starCost,
    interestRate: interestRate,
    markupMultiplier: interestRate, // interestRate используется как множитель наценки
  }

  console.log('📊 Системная конфигурация:', systemConfig)

  // Анализ фиксированных сервисов
  const fixedServices: ServicePricing[] = []

  Object.entries(BASE_COSTS).forEach(([modeKey, baseCostUSD]) => {
    if (typeof baseCostUSD === 'number' && baseCostUSD > 0) {
      const mode = modeKey as ModeEnum

      try {
        const result = calculateModeCost({ mode, numImages: 1 })

        const finalPriceUSD = result.stars * starCost
        const markup = finalPriceUSD - baseCostUSD
        const markupPercent = baseCostUSD > 0 ? (markup / baseCostUSD) * 100 : 0

        fixedServices.push({
          service: mode,
          baseCostUSD,
          finalPriceStars: result.stars,
          finalPriceUSD,
          finalPriceRUB: result.rubles,
          markup,
          markupPercent,
        })

        // Проверка консистентности
        const expectedStars = (baseCostUSD / starCost) * interestRate
        if (Math.abs(result.stars - expectedStars) > 0.01) {
          inconsistencies.push(
            `❌ ${mode}: ожидалось ${expectedStars.toFixed(2)} ⭐, получено ${result.stars} ⭐`
          )
        }
      } catch (error) {
        inconsistencies.push(`❌ Ошибка расчета для ${mode}: ${error}`)
      }
    }
  })

  // Анализ сервисов на основе шагов
  const stepBasedServices = [
    {
      service: 'DigitalAvatarBody (v1)',
      costPerStepStars: conversionRates.costPerStepInStars,
      costPerStepUSD: conversionRates.costPerStepInStars * starCost,
      example50Steps: calculateStepBasedPricing(
        'DigitalAvatarBody v1',
        50,
        'v1'
      ),
      example100Steps: calculateStepBasedPricing(
        'DigitalAvatarBody v1',
        100,
        'v1'
      ),
    },
    {
      service: 'DigitalAvatarBody (v2)',
      costPerStepStars: conversionRatesV2.costPerStepInStars,
      costPerStepUSD: conversionRatesV2.costPerStepInStars * starCost,
      example50Steps: calculateStepBasedPricing(
        'DigitalAvatarBody v2',
        50,
        'v2'
      ),
      example100Steps: calculateStepBasedPricing(
        'DigitalAvatarBody v2',
        100,
        'v2'
      ),
    },
  ]

  // Анализ видео сервисов
  const videoServices: ServicePricing[] = []

  Object.entries(VIDEO_MODELS_CONFIG).forEach(([modelKey, config]) => {
    try {
      const finalPriceStars = calculateVideoFinalPrice(modelKey)
      const finalPriceUSD = finalPriceStars * starCost
      const baseCostUSD = config.basePrice * 5 // 5 секунд по умолчанию
      const markup = finalPriceUSD - baseCostUSD
      const markupPercent = baseCostUSD > 0 ? (markup / baseCostUSD) * 100 : 0

      videoServices.push({
        service: `${config.title} (${modelKey})`,
        baseCostUSD,
        finalPriceStars,
        finalPriceUSD,
        finalPriceRUB: finalPriceUSD * 80, // Примерный курс
        markup,
        markupPercent,
      })

      // Проверка консистентности видео моделей
      const expectedStars = Math.floor(
        (baseCostUSD / starCost) * (1 + interestRate)
      )
      if (Math.abs(finalPriceStars - expectedStars) > 1) {
        inconsistencies.push(
          `❌ Видео ${modelKey}: ожидалось ~${expectedStars} ⭐, получено ${finalPriceStars} ⭐`
        )
      }
    } catch (error) {
      inconsistencies.push(`❌ Ошибка расчета видео для ${modelKey}: ${error}`)
    }
  })

  // Анализ подписок
  const subscriptions = {
    neurophoto: { priceRUB: 1110, priceUSD: 1110 / 80 },
    neurovideo: { priceRUB: 2999, priceUSD: 2999 / 80 },
  }

  // Генерация рекомендаций
  if (fixedServices.length > 0) {
    const avgMarkup =
      fixedServices.reduce((sum, s) => sum + s.markupPercent, 0) /
      fixedServices.length
    recommendations.push(
      `📊 Средняя наценка на фиксированные сервисы: ${avgMarkup.toFixed(1)}%`
    )

    if (avgMarkup < 30) {
      recommendations.push(
        '⚠️ Низкая наценка. Рассмотрите увеличение для покрытия операционных расходов'
      )
    } else if (avgMarkup > 100) {
      recommendations.push(
        '💰 Высокая наценка. Возможно, стоит снизить для конкурентоспособности'
      )
    }
  }

  const lowPriceServices = fixedServices.filter(s => s.finalPriceStars < 5)
  if (lowPriceServices.length > 0) {
    recommendations.push(
      `💡 Сервисы с низкой ценой (<5 ⭐): ${lowPriceServices.map(s => s.service).join(', ')}`
    )
  }

  const highPriceServices = fixedServices.filter(s => s.finalPriceStars > 50)
  if (highPriceServices.length > 0) {
    recommendations.push(
      `💎 Премиум сервисы (>50 ⭐): ${highPriceServices.map(s => s.service).join(', ')}`
    )
  }

  return {
    systemConfig,
    fixedServices,
    stepBasedServices,
    videoServices,
    subscriptions,
    inconsistencies,
    recommendations,
  }
}

function calculateStepBasedPricing(
  serviceName: string,
  steps: number,
  version: 'v1' | 'v2'
): ServicePricing {
  const rates = version === 'v1' ? conversionRates : conversionRatesV2
  const totalStars = steps * rates.costPerStepInStars
  const totalUSD = totalStars * starCost
  const totalRUB = totalUSD * 80

  return {
    service: `${serviceName} (${steps} шагов)`,
    baseCostUSD: totalUSD, // Для step-based сервисов базовая стоимость = финальная
    finalPriceStars: totalStars,
    finalPriceUSD: totalUSD,
    finalPriceRUB: totalRUB,
    markup: 0, // Нет наценки для step-based
    markupPercent: 0,
  }
}

function formatPricingReport(analysis: PricingAnalysis): string {
  let report = '\n🏷️ ПОЛНЫЙ АНАЛИЗ СИСТЕМЫ ЦЕНООБРАЗОВАНИЯ\n\n'

  // Системная конфигурация
  report += '⚙️ СИСТЕМНАЯ КОНФИГУРАЦИЯ:\n'
  report += `   💰 Стоимость 1 ⭐: $${analysis.systemConfig.starCostUSD}\n`
  report += `   📈 Множитель наценки: ${analysis.systemConfig.markupMultiplier}x\n`
  report += `   💵 Наценка: ${((analysis.systemConfig.markupMultiplier - 1) * 100).toFixed(0)}%\n\n`

  // Фиксированные сервисы
  if (analysis.fixedServices.length > 0) {
    report += '🔧 ФИКСИРОВАННЫЕ СЕРВИСЫ:\n'
    analysis.fixedServices
      .sort((a, b) => b.finalPriceStars - a.finalPriceStars)
      .forEach(service => {
        report += `   ${service.service}:\n`
        report += `      💵 Базовая стоимость: $${service.baseCostUSD.toFixed(3)}\n`
        report += `      ⭐ Финальная цена: ${service.finalPriceStars} ⭐ ($${service.finalPriceUSD.toFixed(2)}, ${service.finalPriceRUB.toFixed(0)} ₽)\n`
        report += `      📊 Наценка: +${service.markupPercent.toFixed(1)}%\n\n`
      })
  }

  // Сервисы на основе шагов
  if (analysis.stepBasedServices.length > 0) {
    report += '📏 СЕРВИСЫ НА ОСНОВЕ ШАГОВ:\n'
    analysis.stepBasedServices.forEach(service => {
      report += `   ${service.service}:\n`
      report += `      💰 Стоимость за шаг: ${service.costPerStepStars} ⭐ ($${service.costPerStepUSD.toFixed(4)})\n`
      report += `      📊 50 шагов: ${service.example50Steps.finalPriceStars} ⭐\n`
      report += `      📊 100 шагов: ${service.example100Steps.finalPriceStars} ⭐\n\n`
    })
  }

  // Видео сервисы
  if (analysis.videoServices.length > 0) {
    report += '🎥 ВИДЕО СЕРВИСЫ (5 сек):\n'
    analysis.videoServices
      .sort((a, b) => b.finalPriceStars - a.finalPriceStars)
      .slice(0, 10) // Показываем топ 10
      .forEach(service => {
        report += `   ${service.service}:\n`
        report += `      💵 Базовая стоимость: $${service.baseCostUSD.toFixed(3)}\n`
        report += `      ⭐ Финальная цена: ${service.finalPriceStars} ⭐ ($${service.finalPriceUSD.toFixed(2)})\n`
        report += `      📊 Наценка: +${service.markupPercent.toFixed(1)}%\n\n`
      })
  }

  // Подписки
  report += '💎 ПОДПИСКИ:\n'
  report += `   📸 NeuроPhoto: ${analysis.subscriptions.neurophoto.priceRUB} ₽ ($${analysis.subscriptions.neurophoto.priceUSD.toFixed(2)})\n`
  report += `   🎥 NeuroVideo: ${analysis.subscriptions.neurovideo.priceRUB} ₽ ($${analysis.subscriptions.neurovideo.priceUSD.toFixed(2)})\n\n`

  // Проблемы
  if (analysis.inconsistencies.length > 0) {
    report += '⚠️ НАЙДЕННЫЕ ПРОБЛЕМЫ:\n'
    analysis.inconsistencies.forEach(issue => {
      report += `   ${issue}\n`
    })
    report += '\n'
  }

  // Рекомендации
  if (analysis.recommendations.length > 0) {
    report += '💡 РЕКОМЕНДАЦИИ:\n'
    analysis.recommendations.forEach(rec => {
      report += `   ${rec}\n`
    })
    report += '\n'
  }

  return report
}

// Экспортируем функции
export { analyzePricingSystem, formatPricingReport }

// Если файл запускается напрямую
async function runPricingAnalysis() {
  try {
    console.log('🚀 Запуск анализа системы ценообразования...')

    const analysis = analyzePricingSystem()
    const report = formatPricingReport(analysis)

    console.log(report)

    if (analysis.inconsistencies.length > 0) {
      console.log('\n❌ НАЙДЕНЫ ПРОБЛЕМЫ В ЦЕНООБРАЗОВАНИИ!')
      process.exit(1)
    } else {
      console.log('\n✅ СИСТЕМА ЦЕНООБРАЗОВАНИЯ КОНСИСТЕНТНА!')
      process.exit(0)
    }
  } catch (error) {
    console.error('❌ Ошибка при анализе ценообразования:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  runPricingAnalysis()
}
