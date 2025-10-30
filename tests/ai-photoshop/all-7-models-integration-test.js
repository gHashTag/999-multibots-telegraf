#!/usr/bin/env node

/**
 * 🎯 ИНТЕГРАЦИОННЫЙ ТЕСТ ВСЕХ 7 МОДЕЛЕЙ AI PHOTOSHOP
 *
 * Проверяет:
 * 1. Все 7 моделей доступны в конфигурации
 * 2. Все service функции импортированы
 * 3. Все switch cases добавлены
 * 4. Правильное ценообразование (41⭐ базовая цена)
 * 5. Динамический подсчёт моделей и стоимости
 */

const fs = require('fs')
const path = require('path')

console.log('🎯 ИНТЕГРАЦИОННЫЙ ТЕСТ ВСЕХ 7 МОДЕЛЕЙ AI PHOTOSHOP')
console.log('=' .repeat(70))

const results = {
  passed: 0,
  failed: 0,
  tests: []
}

// ============================================================
// ТЕСТ 1: Проверка наличия всех 7 моделей в конфигурации
// ============================================================
console.log('\n📋 ТЕСТ 1: Наличие 7 моделей в AI_PHOTOSHOP_MODELS')
console.log('-'.repeat(70))

const scenePath = path.join(__dirname, '../../src/scenes/aiPhotoshopScene/index.ts')
const sceneContent = fs.readFileSync(scenePath, 'utf8')

const expectedModels = [
  'seedream',
  'nano_banana',
  'flux_multi_kontext',
  'qwen_edit_plus',
  'flux_kontext_pro',
  'seededit_3',
  'qwen_image_edit'
]

const modelsMatch = sceneContent.match(/const AI_PHOTOSHOP_MODELS = \{([\s\S]*?)\n\}/m)
if (!modelsMatch) {
  console.log('❌ FAIL: AI_PHOTOSHOP_MODELS не найден')
  results.failed++
  results.tests.push({ name: 'Models Configuration', status: 'FAIL', error: 'Configuration not found' })
} else {
  const modelsBlock = modelsMatch[1]
  const foundModels = expectedModels.filter(model =>
    new RegExp(`^\\s+${model}:\\s*\\{`, 'm').test(modelsBlock)
  )

  if (foundModels.length === 7) {
    console.log(`✅ PASS: Все 7 моделей найдены в конфигурации`)
    foundModels.forEach((model, i) => {
      console.log(`   ${i + 1}. ${model} ✓`)
    })
    results.passed++
    results.tests.push({ name: 'Models Configuration', status: 'PASS', details: '7/7 models found' })
  } else {
    console.log(`❌ FAIL: Найдено ${foundModels.length}/7 моделей`)
    const missing = expectedModels.filter(m => !foundModels.includes(m))
    console.log(`   Отсутствуют: ${missing.join(', ')}`)
    results.failed++
    results.tests.push({
      name: 'Models Configuration',
      status: 'FAIL',
      error: `Only ${foundModels.length}/7 models found. Missing: ${missing.join(', ')}`
    })
  }
}

// ============================================================
// ТЕСТ 2: Проверка импортов сервисных функций
// ============================================================
console.log('\n📦 ТЕСТ 2: Импорты сервисных функций')
console.log('-'.repeat(70))

const expectedImports = [
  { fn: 'generateSeeDream4', path: '@/services/generateSeeDream4' },
  { fn: 'generateNanoBanana', path: '@/services/generateNanoBanana' },
  { fn: 'generateAdvancedFluxKontext', path: '@/services/generateFluxKontext' },
  { fn: 'generateQwenImageEditPlus', path: '@/services/generateQwenImageEditPlus' },
  { fn: 'generateFluxKontextPro', path: '@/services/generateFluxKontextPro' },
  { fn: 'generateSeedEdit3', path: '@/services/generateSeedEdit3' },
  { fn: 'generateQwenImageEdit', path: '@/services/generateQwenImageEdit' }
]

let importsFound = 0
expectedImports.forEach(({ fn, path: importPath }) => {
  const importRegex = new RegExp(`import.*${fn}.*from.*${importPath.replace(/\//g, '\\/')}`)
  if (importRegex.test(sceneContent)) {
    console.log(`   ✓ ${fn}`)
    importsFound++
  } else {
    console.log(`   ✗ ${fn} - ОТСУТСТВУЕТ`)
  }
})

if (importsFound === 7) {
  console.log(`✅ PASS: Все 7 импортов найдены`)
  results.passed++
  results.tests.push({ name: 'Service Imports', status: 'PASS', details: '7/7 imports found' })
} else {
  console.log(`❌ FAIL: Найдено ${importsFound}/7 импортов`)
  results.failed++
  results.tests.push({
    name: 'Service Imports',
    status: 'FAIL',
    error: `Only ${importsFound}/7 imports found`
  })
}

// ============================================================
// ТЕСТ 3: Проверка switch cases для всех моделей
// ============================================================
console.log('\n🔀 ТЕСТ 3: Switch cases для обработки моделей')
console.log('-'.repeat(70))

const expectedCases = [
  'seedream',
  'nano_banana',
  'flux_multi_kontext',
  'qwen_edit_plus',
  'flux_kontext_pro',
  'seededit_3',
  'qwen_image_edit'
]

let casesFound = 0
expectedCases.forEach(modelKey => {
  const caseRegex = new RegExp(`case\\s+['"]${modelKey}['"]\\s*:`)
  if (caseRegex.test(sceneContent)) {
    console.log(`   ✓ case '${modelKey}'`)
    casesFound++
  } else {
    console.log(`   ✗ case '${modelKey}' - ОТСУТСТВУЕТ`)
  }
})

if (casesFound === 7) {
  console.log(`✅ PASS: Все 7 switch cases найдены`)
  results.passed++
  results.tests.push({ name: 'Switch Cases', status: 'PASS', details: '7/7 cases found' })
} else {
  console.log(`❌ FAIL: Найдено ${casesFound}/7 switch cases`)
  results.failed++
  results.tests.push({
    name: 'Switch Cases',
    status: 'FAIL',
    error: `Only ${casesFound}/7 cases found`
  })
}

// ============================================================
// ТЕСТ 4: Проверка ценообразования
// ============================================================
console.log('\n💰 ТЕСТ 4: Правильность ценообразования')
console.log('-'.repeat(70))

const pricingMatch = sceneContent.match(/get models\(\) \{[\s\S]*?return \{([\s\S]*?)\}/m)
if (!pricingMatch) {
  console.log('❌ FAIL: Не найден getter models()')
  results.failed++
  results.tests.push({ name: 'Pricing Configuration', status: 'FAIL', error: 'models() getter not found' })
} else {
  const prices = pricingMatch[1].match(/(\w+):.+?\/\/ \$[\d.]+\s*→\s*(\d+)⭐/g)

  if (!prices) {
    console.log('❌ FAIL: Не удалось распарсить цены')
    results.failed++
    results.tests.push({ name: 'Pricing Configuration', status: 'FAIL', error: 'Cannot parse prices' })
  } else {
    let totalBase = 0
    const priceDetails = []

    prices.forEach(price => {
      const match = price.match(/(\w+):.+?\/\/ \$[\d.]+\s*→\s*(\d+)⭐/)
      if (match) {
        const [, modelKey, stars] = match
        const starsNum = parseInt(stars)
        priceDetails.push({ model: modelKey, stars: starsNum })
        totalBase += starsNum
        console.log(`   ${modelKey}: ${starsNum}⭐`)
      }
    })

    console.log(`\n   📊 ИТОГО: ${totalBase}⭐`)
    console.log(`   📐 С множителями:`)
    console.log(`      1K (×1): ${totalBase}⭐`)
    console.log(`      2K (×4): ${totalBase * 4}⭐`)
    console.log(`      4K (×6): ${totalBase * 6}⭐`)

    // Проверяем ожидаемую сумму
    const expectedTotal = 41 // 5+6+5+5+8+8+4
    if (totalBase === expectedTotal) {
      console.log(`\n✅ PASS: Общая стоимость правильная (${expectedTotal}⭐)`)
      results.passed++
      results.tests.push({
        name: 'Pricing Configuration',
        status: 'PASS',
        details: `Total: ${totalBase} stars (expected: ${expectedTotal})`
      })
    } else {
      console.log(`\n❌ FAIL: Ожидалось ${expectedTotal}⭐, получено ${totalBase}⭐`)
      results.failed++
      results.tests.push({
        name: 'Pricing Configuration',
        status: 'FAIL',
        error: `Expected ${expectedTotal} stars, got ${totalBase}`
      })
    }
  }
}

// ============================================================
// ТЕСТ 5: Динамический подсчёт
// ============================================================
console.log('\n🔄 ТЕСТ 5: Динамический подсчёт моделей и стоимости')
console.log('-'.repeat(70))

const usesGetAllModelsCost = sceneContent.includes('AI_PHOTOSHOP_PRICING.getAllModelsCost()')
const usesDynamicCount = sceneContent.includes('Object.keys(AI_PHOTOSHOP_MODELS).length')

if (usesGetAllModelsCost && usesDynamicCount) {
  console.log('✅ PASS: Используется динамический подсчёт')
  console.log('   ✓ AI_PHOTOSHOP_PRICING.getAllModelsCost()')
  console.log('   ✓ Object.keys(AI_PHOTOSHOP_MODELS).length')
  results.passed++
  results.tests.push({ name: 'Dynamic Calculation', status: 'PASS', details: 'Both methods used' })
} else {
  console.log('❌ FAIL: Не везде используется динамический подсчёт')
  if (!usesGetAllModelsCost) console.log('   ✗ AI_PHOTOSHOP_PRICING.getAllModelsCost() отсутствует')
  if (!usesDynamicCount) console.log('   ✗ Object.keys(AI_PHOTOSHOP_MODELS).length отсутствует')
  results.failed++
  results.tests.push({
    name: 'Dynamic Calculation',
    status: 'FAIL',
    error: 'Not all dynamic methods used'
  })
}

// ============================================================
// ТЕСТ 6: Проверка файлов сервисов
// ============================================================
console.log('\n📁 ТЕСТ 6: Наличие файлов сервисов')
console.log('-'.repeat(70))

const servicePaths = [
  'src/services/generateSeeDream4.ts',
  'src/services/generateNanoBanana.ts',
  'src/services/generateFluxKontext.ts',
  'src/services/generateQwenImageEditPlus.ts',
  'src/services/generateFluxKontextPro.ts',
  'src/services/generateSeedEdit3.ts',
  'src/services/generateQwenImageEdit.ts'
]

let servicesFound = 0
servicePaths.forEach(servicePath => {
  const fullPath = path.join(__dirname, '../..', servicePath)
  if (fs.existsSync(fullPath)) {
    console.log(`   ✓ ${servicePath}`)
    servicesFound++
  } else {
    console.log(`   ✗ ${servicePath} - ОТСУТСТВУЕТ`)
  }
})

if (servicesFound === 7) {
  console.log(`✅ PASS: Все 7 сервисных файлов существуют`)
  results.passed++
  results.tests.push({ name: 'Service Files', status: 'PASS', details: '7/7 files exist' })
} else {
  console.log(`❌ FAIL: Найдено ${servicesFound}/7 файлов`)
  results.failed++
  results.tests.push({
    name: 'Service Files',
    status: 'FAIL',
    error: `Only ${servicesFound}/7 files exist`
  })
}

// ============================================================
// ТЕСТ 7: Проверка Zod схем
// ============================================================
console.log('\n📐 ТЕСТ 7: Наличие Zod схем')
console.log('-'.repeat(70))

const schemaPaths = [
  'src/schemas/seedream4.schema.ts',
  'src/schemas/nanoBanana.schema.ts',
  'src/schemas/fluxKontextMax.schema.ts',
  'src/schemas/qwenImageEditPlus.schema.ts',
  'src/schemas/fluxKontextPro.schema.ts',
  'src/schemas/seedEdit3.schema.ts',
  'src/schemas/qwenImageEdit.schema.ts'
]

let schemasFound = 0
schemaPaths.forEach(schemaPath => {
  const fullPath = path.join(__dirname, '../..', schemaPath)
  if (fs.existsSync(fullPath)) {
    console.log(`   ✓ ${schemaPath}`)
    schemasFound++
  } else {
    console.log(`   ✗ ${schemaPath} - ОТСУТСТВУЕТ`)
  }
})

if (schemasFound === 7) {
  console.log(`✅ PASS: Все 7 Zod схем существуют`)
  results.passed++
  results.tests.push({ name: 'Zod Schemas', status: 'PASS', details: '7/7 schemas exist' })
} else {
  console.log(`❌ FAIL: Найдено ${schemasFound}/7 схем`)
  results.failed++
  results.tests.push({
    name: 'Zod Schemas',
    status: 'FAIL',
    error: `Only ${schemasFound}/7 schemas exist`
  })
}

// ============================================================
// ИТОГОВЫЙ ОТЧЁТ
// ============================================================
console.log('\n' + '='.repeat(70))
console.log('📊 ИТОГОВЫЙ ОТЧЁТ')
console.log('='.repeat(70))

const total = results.passed + results.failed
const successRate = ((results.passed / total) * 100).toFixed(1)

console.log(`\n✅ Пройдено: ${results.passed}/${total}`)
console.log(`❌ Провалено: ${results.failed}/${total}`)
console.log(`📈 Успешность: ${successRate}%`)

if (results.failed > 0) {
  console.log('\n🚨 ПРОВАЛЕНЫ ТЕСТЫ:')
  results.tests.filter(t => t.status !== 'PASS').forEach(t => {
    console.log(`   - ${t.name}: ${t.error}`)
  })
}

// Сохранить отчёт
const report = {
  timestamp: new Date().toISOString(),
  totalTests: total,
  passed: results.passed,
  failed: results.failed,
  successRate: successRate + '%',
  tests: results.tests
}

fs.writeFileSync(
  path.join(__dirname, 'all-7-models-integration-report.json'),
  JSON.stringify(report, null, 2)
)

console.log('\n📄 Детальный отчёт: tests/ai-photoshop/all-7-models-integration-report.json')

// Exit code
process.exit(results.failed === 0 ? 0 : 1)
