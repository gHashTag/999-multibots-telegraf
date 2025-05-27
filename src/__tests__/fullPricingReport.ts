import {
  analyzePricingSystem,
  formatPricingReport,
} from './pricingAnalysisTest'
import {
  testBalanceConsistency,
  formatBalanceReport,
} from './balanceConsistencyTest'

/**
 * ИТОГОВЫЙ ОТЧЕТ ПО СИСТЕМЕ ЦЕНООБРАЗОВАНИЯ И СЕБЕСТОИМОСТИ
 *
 * Этот отчет анализирует:
 * 1. Системную конфигурацию ценообразования
 * 2. Консистентность расчетов цен
 * 3. Себестоимость и маржинальность
 * 4. Проблемы в данных и рекомендации
 */

interface FullPricingReport {
  systemOverview: {
    starCostUSD: number
    markupMultiplier: number
    totalServices: number
    avgMargin: number
  }
  serviceBreakdown: {
    fixedServices: number
    stepBasedServices: number
    videoServices: number
    subscriptions: number
  }
  profitabilityAnalysis: {
    highMarginServices: string[]
    lowMarginServices: string[]
    premiumServices: string[]
    budgetServices: string[]
  }
  costStructure: {
    avgCostPercentage: number
    highCostServices: string[]
    zeroCostServices: string[]
  }
  recommendations: {
    pricing: string[]
    cost: string[]
    business: string[]
  }
  issues: string[]
}

async function generateFullPricingReport(): Promise<FullPricingReport> {
  console.log('🚀 Генерация полного отчета по ценообразованию...\n')

  // 1. Анализ системы ценообразования
  const pricingAnalysis = analyzePricingSystem()

  // 2. Анализ баланса (для проверки консистентности)
  const balanceAnalysis = await testBalanceConsistency('MetaMuse_Manifest_bot')

  // 3. Системный обзор
  const systemOverview = {
    starCostUSD: pricingAnalysis.systemConfig.starCostUSD,
    markupMultiplier: pricingAnalysis.systemConfig.markupMultiplier,
    totalServices:
      pricingAnalysis.fixedServices.length +
      pricingAnalysis.stepBasedServices.length +
      pricingAnalysis.videoServices.length,
    avgMargin:
      pricingAnalysis.fixedServices.length > 0
        ? pricingAnalysis.fixedServices.reduce(
            (sum, s) => sum + s.markupPercent,
            0
          ) / pricingAnalysis.fixedServices.length
        : 0,
  }

  // 4. Разбивка сервисов
  const serviceBreakdown = {
    fixedServices: pricingAnalysis.fixedServices.length,
    stepBasedServices: pricingAnalysis.stepBasedServices.length,
    videoServices: pricingAnalysis.videoServices.length,
    subscriptions: 2, // neurophoto + neurovideo
  }

  // 5. Анализ прибыльности
  const highMarginServices = pricingAnalysis.fixedServices
    .filter(s => s.markupPercent > 60)
    .map(s => s.service)

  const lowMarginServices = pricingAnalysis.fixedServices
    .filter(s => s.markupPercent < 30)
    .map(s => s.service)

  const premiumServices = [
    ...pricingAnalysis.fixedServices
      .filter(s => s.finalPriceStars > 50)
      .map(s => s.service),
    ...pricingAnalysis.videoServices
      .filter(s => s.finalPriceStars > 100)
      .map(s => s.service),
  ]

  const budgetServices = [
    ...pricingAnalysis.fixedServices
      .filter(s => s.finalPriceStars < 10)
      .map(s => s.service),
    ...pricingAnalysis.videoServices
      .filter(s => s.finalPriceStars < 50)
      .map(s => s.service),
  ]

  const profitabilityAnalysis = {
    highMarginServices,
    lowMarginServices,
    premiumServices,
    budgetServices,
  }

  // 6. Анализ структуры себестоимости
  const avgCostPercentage =
    pricingAnalysis.videoServices.length > 0
      ? pricingAnalysis.videoServices.reduce(
          (sum, s) => sum + s.markupPercent,
          0
        ) / pricingAnalysis.videoServices.length
      : 0

  const highCostServices = pricingAnalysis.videoServices
    .filter(s => s.markupPercent > 200)
    .map(s => s.service)

  const zeroCostServices = pricingAnalysis.fixedServices
    .filter(s => s.baseCostUSD === 0)
    .map(s => s.service)

  const costStructure = {
    avgCostPercentage,
    highCostServices,
    zeroCostServices,
  }

  // 7. Рекомендации
  const recommendations = {
    pricing: [
      systemOverview.avgMargin < 40
        ? '📈 Рассмотрите увеличение наценки - текущая маржа ниже рекомендуемой'
        : '✅ Маржинальность в пределах нормы',

      lowMarginServices.length > 0
        ? `⚠️ Низкая маржа у сервисов: ${lowMarginServices.join(', ')}`
        : '✅ Все сервисы имеют достаточную маржу',

      budgetServices.length > 3
        ? '💡 Много бюджетных сервисов - рассмотрите создание пакетных предложений'
        : '✅ Сбалансированная линейка цен',
    ],

    cost: [
      '📊 Внедрить автоматический расчет себестоимости для всех сервисов',
      '🔍 Регулярно анализировать изменения цен у поставщиков API',
      '💰 Оптимизировать использование дорогих моделей через кэширование',
      '📈 Внедрить A/B тестирование цен для максимизации прибыли',
    ],

    business: [
      premiumServices.length > 0
        ? `💎 Продвигайте премиум сервисы: ${premiumServices.slice(0, 3).join(', ')}`
        : '💡 Рассмотрите создание премиум предложений',

      '🎯 Внедрить систему скидок для постоянных клиентов',
      '📱 Создать мобильное приложение для увеличения retention',
      '🤝 Развивать партнерскую программу для привлечения новых пользователей',
    ],
  }

  // 8. Проблемы
  const issues = [
    ...pricingAnalysis.inconsistencies,
    balanceAnalysis.isConsistent
      ? null
      : '❌ Найдены проблемы в балансе пользователей',
    systemOverview.avgMargin < 20
      ? '⚠️ Критически низкая общая маржинальность'
      : null,
    zeroCostServices.length > 0
      ? `⚠️ Сервисы без себестоимости: ${zeroCostServices.join(', ')}`
      : null,
  ].filter(Boolean) as string[]

  return {
    systemOverview,
    serviceBreakdown,
    profitabilityAnalysis,
    costStructure,
    recommendations,
    issues,
  }
}

function formatFullReport(report: FullPricingReport): string {
  let output =
    '\n🏢 ИТОГОВЫЙ ОТЧЕТ ПО СИСТЕМЕ ЦЕНООБРАЗОВАНИЯ И СЕБЕСТОИМОСТИ\n'
  output += '='.repeat(80) + '\n\n'

  // Системный обзор
  output += '📊 СИСТЕМНЫЙ ОБЗОР:\n'
  output += `   💰 Стоимость 1 ⭐: $${report.systemOverview.starCostUSD}\n`
  output += `   📈 Множитель наценки: ${report.systemOverview.markupMultiplier}x\n`
  output += `   🔧 Всего сервисов: ${report.systemOverview.totalServices}\n`
  output += `   💵 Средняя маржа: ${report.systemOverview.avgMargin.toFixed(1)}%\n\n`

  // Разбивка сервисов
  output += '🗂️ СТРУКТУРА СЕРВИСОВ:\n'
  output += `   🔧 Фиксированные: ${report.serviceBreakdown.fixedServices}\n`
  output += `   📏 На основе шагов: ${report.serviceBreakdown.stepBasedServices}\n`
  output += `   🎥 Видео сервисы: ${report.serviceBreakdown.videoServices}\n`
  output += `   💎 Подписки: ${report.serviceBreakdown.subscriptions}\n\n`

  // Анализ прибыльности
  output += '💰 АНАЛИЗ ПРИБЫЛЬНОСТИ:\n'
  if (report.profitabilityAnalysis.highMarginServices.length > 0) {
    output += `   📈 Высокая маржа: ${report.profitabilityAnalysis.highMarginServices.join(', ')}\n`
  }
  if (report.profitabilityAnalysis.lowMarginServices.length > 0) {
    output += `   📉 Низкая маржа: ${report.profitabilityAnalysis.lowMarginServices.join(', ')}\n`
  }
  if (report.profitabilityAnalysis.premiumServices.length > 0) {
    output += `   💎 Премиум: ${report.profitabilityAnalysis.premiumServices.slice(0, 5).join(', ')}\n`
  }
  if (report.profitabilityAnalysis.budgetServices.length > 0) {
    output += `   💡 Бюджетные: ${report.profitabilityAnalysis.budgetServices.slice(0, 5).join(', ')}\n`
  }
  output += '\n'

  // Структура себестоимости
  output += '🏭 СТРУКТУРА СЕБЕСТОИМОСТИ:\n'
  output += `   📊 Средний процент наценки: ${report.costStructure.avgCostPercentage.toFixed(1)}%\n`
  if (report.costStructure.highCostServices.length > 0) {
    output += `   💸 Высокие наценки: ${report.costStructure.highCostServices.slice(0, 3).join(', ')}\n`
  }
  if (report.costStructure.zeroCostServices.length > 0) {
    output += `   ⚠️ Без себестоимости: ${report.costStructure.zeroCostServices.join(', ')}\n`
  }
  output += '\n'

  // Проблемы
  if (report.issues.length > 0) {
    output += '⚠️ ВЫЯВЛЕННЫЕ ПРОБЛЕМЫ:\n'
    report.issues.forEach(issue => {
      output += `   ${issue}\n`
    })
    output += '\n'
  }

  // Рекомендации
  output += '💡 РЕКОМЕНДАЦИИ:\n\n'

  output += '   📈 ЦЕНООБРАЗОВАНИЕ:\n'
  report.recommendations.pricing.forEach(rec => {
    output += `      ${rec}\n`
  })
  output += '\n'

  output += '   🏭 СЕБЕСТОИМОСТЬ:\n'
  report.recommendations.cost.forEach(rec => {
    output += `      ${rec}\n`
  })
  output += '\n'

  output += '   🚀 БИЗНЕС:\n'
  report.recommendations.business.forEach(rec => {
    output += `      ${rec}\n`
  })
  output += '\n'

  output += '='.repeat(80) + '\n'
  output += '📋 ЗАКЛЮЧЕНИЕ:\n'

  if (report.issues.length === 0) {
    output += '✅ Система ценообразования работает корректно!\n'
  } else {
    output += `⚠️ Обнаружено ${report.issues.length} проблем, требующих внимания.\n`
  }

  output += `💰 Общая маржинальность: ${report.systemOverview.avgMargin.toFixed(1)}%\n`
  output += `🔧 Покрытие сервисов: ${report.systemOverview.totalServices} активных\n`
  output += '📊 Рекомендуется регулярный мониторинг и оптимизация.\n'

  return output
}

// Основная функция
async function runFullPricingReport() {
  try {
    console.log('🚀 Запуск полного анализа системы ценообразования...\n')

    // Генерируем отчеты
    const fullReport = await generateFullPricingReport()
    const pricingAnalysis = analyzePricingSystem()
    const balanceAnalysis = await testBalanceConsistency(
      'MetaMuse_Manifest_bot'
    )

    // Выводим детальные отчеты
    console.log(formatPricingReport(pricingAnalysis))
    console.log(formatBalanceReport(balanceAnalysis))

    // Выводим итоговый отчет
    console.log(formatFullReport(fullReport))

    // Определяем статус
    const hasIssues =
      fullReport.issues.length > 0 || !balanceAnalysis.isConsistent

    if (hasIssues) {
      console.log('\n❌ ОБНАРУЖЕНЫ ПРОБЛЕМЫ В СИСТЕМЕ ЦЕНООБРАЗОВАНИЯ!')
      console.log('📋 Рекомендуется устранить выявленные проблемы.')
      process.exit(1)
    } else {
      console.log('\n✅ СИСТЕМА ЦЕНООБРАЗОВАНИЯ РАБОТАЕТ КОРРЕКТНО!')
      console.log('📈 Все проверки пройдены успешно.')
      process.exit(0)
    }
  } catch (error) {
    console.error('❌ Ошибка при генерации отчета:', error)
    process.exit(1)
  }
}

// Экспорт функций
export { generateFullPricingReport, formatFullReport }

// Запуск если файл вызван напрямую
if (require.main === module) {
  runFullPricingReport()
}
