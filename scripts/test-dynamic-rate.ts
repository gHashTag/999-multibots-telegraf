#!/usr/bin/env npx tsx

/**
 * 🧪 Тестовая утилита для демонстрации динамического курса USDT/RUB
 * 
 * Показывает разницу между статическим и динамическим курсом,
 * тестирует работу всех функций централизованного ценообразования.
 */

import { getCurrentRate } from '../src/modules/currency-rate'
import { 
  getUsdToRubRate,
  starsToRUBAsync,
  rubToStarsAsync,
  generateDynamicTopUpPackages,
  logPricingConfig,
  DEFAULT_USD_TO_RUB_RATE
} from '../src/config/unified-pricing.config'
import { 
  getDynamicRubTopUpOptions 
} from '../src/price/helpers/rubTopUpOptions'
import { 
  calculateCostDynamic,
  getStepCostInRubles
} from '../src/price/priceCalculator'

async function main() {
  console.log('🚀 Тестирование динамического курса USDT/RUB')
  console.log('=' .repeat(50))
  
  try {
    // 1. Тестируем получение курса
    console.log('\n📈 1. Получение актуального курса:')
    const staticRate = DEFAULT_USD_TO_RUB_RATE
    const dynamicRate = await getCurrentRate()
    const unifiedRate = await getUsdToRubRate()
    
    console.log(`   Статический курс: ${staticRate} RUB/USD`)
    console.log(`   Динамический курс (Bybit): ${dynamicRate} RUB/USD`)
    console.log(`   Унифицированный курс: ${unifiedRate} RUB/USD`)
    console.log(`   Разница: ${((dynamicRate - staticRate) / staticRate * 100).toFixed(2)}%`)

    // 2. Тестируем конвертацию звезд в рубли
    console.log('\n⭐ 2. Конвертация звезд в рубли:')
    const testStars = 1000
    const staticRub = testStars * 0.016 * staticRate
    const dynamicRub = await starsToRUBAsync(testStars)
    
    console.log(`   ${testStars} звезд (статический курс): ${staticRub.toFixed(2)} ₽`)
    console.log(`   ${testStars} звезд (динамический курс): ${dynamicRub} ₽`)
    console.log(`   Экономия для пользователя: ${(staticRub - dynamicRub).toFixed(2)} ₽`)

    // 3. Тестируем конвертацию рублей в звезды
    console.log('\n💰 3. Конвертация рублей в звезды:')
    const testRub = 1000
    const staticStars = Math.floor(testRub / (0.016 * 1.5 * staticRate))
    const dynamicStars = await rubToStarsAsync(testRub)
    
    console.log(`   ${testRub} ₽ (статический курс): ${staticStars} ⭐`)
    console.log(`   ${testRub} ₽ (динамический курс): ${dynamicStars} ⭐`)
    console.log(`   Дополнительные звезды: +${dynamicStars - staticStars} ⭐`)

    // 4. Тестируем пакеты пополнения
    console.log('\n📦 4. Пакеты пополнения:')
    const dynamicPackages = await getDynamicRubTopUpOptions()
    
    console.log('   Сумма (₽) | Статич. ⭐ | Динам. ⭐ | Разница')
    console.log('   ----------|-----------|----------|--------')
    
    for (const pkg of dynamicPackages.slice(0, 5)) { // Показываем первые 5
      const staticPkgStars = Math.floor(pkg.amountRub / (0.016 * 1.5 * staticRate))
      const difference = pkg.stars - staticPkgStars
      const diffPercent = ((difference / staticPkgStars) * 100).toFixed(1)
      
      console.log(`   ${pkg.amountRub.toString().padEnd(8)} | ${staticPkgStars.toString().padEnd(9)} | ${pkg.stars.toString().padEnd(8)} | +${difference} (+${diffPercent}%)`)
    }

    // 5. Тестируем калькулятор стоимости
    console.log('\n🧮 5. Калькулятор стоимости (100 шагов):')
    const testSteps = 100
    const staticCost = await getStepCostInRubles(staticRate)
    const dynamicCost = await getStepCostInRubles()
    const dynamicCalculation = await calculateCostDynamic(testSteps, 'v1')
    
    console.log(`   Стоимость шага (статический): ${staticCost.toFixed(4)} ₽`)
    console.log(`   Стоимость шага (динамический): ${dynamicCost.toFixed(4)} ₽`)
    console.log(`   ${testSteps} шагов = ${dynamicCalculation.stars} ⭐ = ${dynamicCalculation.rubles} ₽`)

    // 6. Логирование конфигурации
    console.log('\n⚙️  6. Текущая конфигурация ценообразования:')
    await logPricingConfig()

    console.log('\n✅ Тестирование завершено успешно!')
    console.log(`💡 Динамический курс ${dynamicRate > staticRate ? 'выше' : 'ниже'} статического на ${Math.abs(dynamicRate - staticRate).toFixed(2)} RUB`)

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error)
    process.exit(1)
  }
}

// Запуск с обработкой ошибок
if (require.main === module) {
  main().catch(console.error)
}

export { main as testDynamicRate }