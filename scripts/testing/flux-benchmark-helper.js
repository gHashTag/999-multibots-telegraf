#!/usr/bin/env node

/**
 * 🎯 FLUX KONTEXT BENCHMARK HELPER
 * Интерактивный помощник для проведения бенчмарк-тестов
 */

const fs = require('fs')
const path = require('path')

console.log('🎯 FLUX KONTEXT BENCHMARK HELPER')
console.log('================================')
console.log('')

// Загружаем план бенчмарка
const planPath =
  'scripts/testing/benchmark-results/flux-camera-benchmark-plan.json'

if (!fs.existsSync(planPath)) {
  console.log('❌ Benchmark plan not found!')
  console.log('📋 Please run: node scripts/testing/flux-camera-benchmark.js')
  process.exit(1)
}

const benchmarkPlan = JSON.parse(fs.readFileSync(planPath, 'utf8'))

console.log('📊 BENCHMARK EXECUTION GUIDE')
console.log('============================')
console.log(`📸 Test Image: ${benchmarkPlan.metadata.testImage}`)
console.log(`🔬 Total Tests: ${benchmarkPlan.metadata.totalTests}`)
console.log(
  `⏱️ Estimated Duration: ${benchmarkPlan.execution.expected_duration}`
)
console.log(
  `💰 Estimated Cost: ${benchmarkPlan.execution.total_cost_estimation}`
)
console.log('')

console.log('🤖 TESTING STRATEGY:')
console.log('====================')
console.log('1. Load the test image in your bot')
console.log('2. Go to: /menu → 🎨 FLUX Kontext → 🎬 Управление камерой')
console.log('3. For EACH angle test BOTH models:')
console.log('   • First test with current model (Max)')
console.log('   • Then manually switch to Pro model for comparison')
console.log('4. Save all generated images for comparison')
console.log('')

console.log('📝 STEP-BY-STEP TESTING INSTRUCTIONS:')
console.log('=====================================')

// Группируем тесты по углам для удобства
const angleGroups = {}
benchmarkPlan.tests.forEach(test => {
  if (!angleGroups[test.angle]) {
    angleGroups[test.angle] = {}
  }
  angleGroups[test.angle][test.model] = test
})

let stepNumber = 1

Object.keys(angleGroups).forEach(angle => {
  const maxTest = angleGroups[angle].max
  const proTest = angleGroups[angle].pro

  console.log(`\n📐 STEP ${stepNumber}: ${maxTest.angleName}`)
  console.log('─'.repeat(50))
  console.log(`📝 Prompt: "${maxTest.prompt}"`)
  console.log('')
  console.log('🔄 Test Sequence:')
  console.log(`   1️⃣ Select: ${maxTest.angleName}`)
  console.log(`   2️⃣ Upload: assets/bible_vibecoder/lyps-sync.jpg`)
  console.log(
    `   3️⃣ Generate with CURRENT model (likely Max - $${maxTest.cost.replace('$', '')})`
  )
  console.log('   4️⃣ Save result as: max_' + angle + '.jpg')
  console.log('')
  console.log('   ⚙️ SWITCH TO PRO MODEL (if not already set):')
  console.log('      • This requires code change for testing')
  console.log('      • Or test separately with Pro as default')
  console.log('')
  console.log(
    `   5️⃣ Repeat same angle with PRO model ($${proTest.cost.replace('$', '')})`
  )
  console.log('   6️⃣ Save result as: pro_' + angle + '.jpg')
  console.log('')
  console.log('📊 Expected Outcome:')
  console.log(`   • Max: ${maxTest.expectedOutcome}`)
  console.log(`   • Pro: ${proTest.expectedOutcome}`)
  console.log(`   • Pro should be: ${proTest.qualityExpectation}`)

  stepNumber++
})

console.log('\n🏁 AFTER TESTING:')
console.log('=================')
console.log('1. Compare all Max vs Pro results side by side')
console.log('2. Evaluate:')
console.log('   • Quality difference')
console.log('   • Prompt adherence')
console.log('   • Visual appeal')
console.log('   • Cost effectiveness')
console.log('3. Document findings')
console.log('4. Update model recommendations')

console.log('\n💡 PRO TIPS:')
console.log('============')
console.log('• Test the same angle back-to-back for fair comparison')
console.log(
  '• Save images with descriptive names: max_worms_eye.jpg, pro_worms_eye.jpg'
)
console.log('• Take notes on which model performs better for each angle')
console.log(
  '• Pay special attention to complex angles like worms_eye, birds_eye, dutch_angle'
)
console.log(
  '• Pro model should show better prompt following and quality at lower cost'
)

console.log('\n🔧 FOR DEVELOPERS:')
console.log('==================')
console.log('To temporarily enable model selection for testing:')
console.log('')
console.log('Option 1: Restore model selection step in fluxKontextScene')
console.log('Option 2: Manually change default model in handleCameraSetting:')
console.log('   ctx.session.kontextModelType = "pro" // for Pro tests')
console.log('   ctx.session.kontextModelType = "max" // for Max tests')
console.log('')
console.log('Option 3: Create separate test commands for each model')

console.log('\n✅ READY TO START BENCHMARKING!')
console.log('===============================')
console.log('🎬 Go to your bot and start with Step 1!')
console.log('📸 Use image: assets/bible_vibecoder/lyps-sync.jpg')
console.log('🔬 Test all 17 angles × 2 models = 34 tests total')
console.log('')
console.log('Good luck! May the best model win! 🏆')
