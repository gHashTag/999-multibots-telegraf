#!/usr/bin/env node

/**
 * 🎯 ТЕСТ ДИНАМИЧЕСКОГО ПОДСЧЁТА СТОИМОСТИ И КОЛИЧЕСТВА МОДЕЛЕЙ
 *
 * Проверяет, что при добавлении/удалении моделей в AI_PHOTOSHOP_MODELS
 * автоматически пересчитывается:
 * 1. Общая стоимость в звёздах (getAllModelsCost)
 * 2. Количество моделей (Object.keys(AI_PHOTOSHOP_MODELS).length)
 */

const fs = require('fs')
const path = require('path')

console.log('🧪 ДИНАМИЧЕСКИЙ ПОДСЧЁТ МОДЕЛЕЙ И СТОИМОСТИ')
console.log('=' .repeat(50))

const scenePath = path.join(__dirname, '../../src/scenes/aiPhotoshopScene/index.ts')
const content = fs.readFileSync(scenePath, 'utf8')

// Тест 1: Проверка использования getAllModelsCost()
console.log('\n🔍 Тест 1: Использование AI_PHOTOSHOP_PRICING.getAllModelsCost()')
const usesGetAllModelsCost = content.includes('AI_PHOTOSHOP_PRICING.getAllModelsCost()')
if (usesGetAllModelsCost) {
  const matches = content.match(/AI_PHOTOSHOP_PRICING\.getAllModelsCost\(\)/g)
  console.log(`✅ PASS: Найдено ${matches.length} использования getAllModelsCost()`)
  console.log('   Метод автоматически суммирует все модели из AI_PHOTOSHOP_PRICING.models')
} else {
  console.log('❌ FAIL: Не найдено использование getAllModelsCost()')
  console.log('   Возможно, используется старый ручной подсчёт через reduce()')
}

// Тест 2: Проверка динамического подсчёта количества моделей
console.log('\n🔍 Тест 2: Динамический подсчёт количества моделей')
const usesDynamicCount = content.includes('Object.keys(AI_PHOTOSHOP_MODELS).length')
if (usesDynamicCount) {
  const matches = content.match(/Object\.keys\(AI_PHOTOSHOP_MODELS\)\.length/g)
  console.log(`✅ PASS: Найдено ${matches.length} использования динамического подсчёта`)
  console.log('   При добавлении модели в AI_PHOTOSHOP_MODELS счётчик обновится автоматически')
} else {
  console.log('❌ FAIL: Используются хардкод значения (4 модели, 7 моделей и т.д.)')
}

// Тест 3: Проверка отсутствия хардкод значений "4 модели"
console.log('\n🔍 Тест 3: Отсутствие хардкод "4 модели" в UI')
const hardcodedFour = content.match(/всеми 4 модел|all 4 model/gi)
if (hardcodedFour && hardcodedFour.length > 0) {
  console.log(`⚠️  WARNING: Найдено ${hardcodedFour.length} хардкод упоминаний "4 модели":`)
  hardcodedFour.forEach(match => console.log(`   - "${match}"`))
  console.log('   Рекомендация: заменить на ${totalModelsCount}')
} else {
  console.log('✅ PASS: Хардкод "4 модели" не найден, используется динамический подсчёт')
}

// Тест 4: Подсчёт текущего количества активных моделей
console.log('\n🔍 Тест 4: Текущее количество активных моделей')
const modelsMatch = content.match(/const AI_PHOTOSHOP_MODELS = \{([\s\S]*?)\n\}/m)
if (modelsMatch) {
  const modelsBlock = modelsMatch[1]
  const modelKeys = modelsBlock.match(/^\s+(\w+):\s*\{/gm)

  if (modelKeys) {
    const count = modelKeys.length
    console.log(`✅ Найдено ${count} активных моделей в AI_PHOTOSHOP_MODELS:`)
    modelKeys.forEach((match, i) => {
      const key = match.match(/(\w+):/)[1]
      console.log(`   ${i + 1}. ${key}`)
    })
  }
} else {
  console.log('⚠️  Не удалось распарсить AI_PHOTOSHOP_MODELS')
}

// Тест 5: Проверка централизованного ценообразования
console.log('\n🔍 Тест 5: Централизованное ценообразование')
const usesCentralizedPricing = content.includes('cost: AI_PHOTOSHOP_PRICING.models.')
if (usesCentralizedPricing) {
  console.log('✅ PASS: Модели используют цены из AI_PHOTOSHOP_PRICING.models')
  console.log('   Изменение цены в одном месте обновит её везде')
} else {
  console.log('❌ FAIL: Модели используют хардкод цены')
}

// Итоговый отчёт
console.log('\n' + '='.repeat(50))
console.log('📊 ИТОГОВЫЙ ОТЧЁТ')
console.log('='.repeat(50))

const tests = [
  { name: 'getAllModelsCost() использование', passed: usesGetAllModelsCost },
  { name: 'Динамический подсчёт количества', passed: usesDynamicCount },
  { name: 'Отсутствие хардкода "4 модели"', passed: !hardcodedFour || hardcodedFour.length === 0 },
  { name: 'Централизованное ценообразование', passed: usesCentralizedPricing }
]

const passed = tests.filter(t => t.passed).length
const total = tests.length
const successRate = ((passed / total) * 100).toFixed(1)

console.log(`\n✅ Пройдено: ${passed}/${total}`)
console.log(`📈 Успешность: ${successRate}%`)

if (passed === total) {
  console.log('\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ!')
  console.log('✨ Система полностью динамическая и расширяемая')
  console.log('💡 Теперь можно добавлять модели в AI_PHOTOSHOP_MODELS без правки UI!')
} else {
  console.log('\n⚠️  Некоторые тесты не прошли')
  console.log('Требуется доработка для полной динамичности системы')
}

process.exit(passed === total ? 0 : 1)
