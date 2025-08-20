#!/usr/bin/env node

/**
 * 🎬 FLUX KONTEXT CAMERA ANGLES BENCHMARK
 * Полное тестирование всех 17 углов камеры на двух моделях: Max vs Pro
 * Изображение: /Users/playra/999-multibots-telegraf/assets/bible_vibecoder/lyps-sync.jpg
 */

const fs = require('fs')
const path = require('path')

console.log('🎬 FLUX KONTEXT CAMERA BENCHMARK STARTED')
console.log('==========================================')
console.log('📸 Test Image: assets/bible_vibecoder/lyps-sync.jpg')
console.log('🔬 Testing 17 camera angles on 2 models')
console.log('')

// Все углы камеры из системы
const allAngles = [
  'medium_shot',
  'close_up',
  'extreme_closeup',
  'wide_shot',
  'american_shot',
  'cowboy_shot',
  'profile_shot',
  'three_quarter',
  'back_shot',
  'over_shoulder',
  'eye_level',
  'dutch_angle',
  'high_angle',
  'low_angle',
  'birds_eye',
  'worms_eye',
  'macro_beauty',
]

// Модели для тестирования
const models = ['max', 'pro']

// Описания углов (из кода)
const angleDescriptions = {
  medium_shot: { ru: '📷 Средний план', en: '📷 Medium Shot' },
  close_up: { ru: '🔍 Крупный план', en: '🔍 Close-Up' },
  extreme_closeup: { ru: '🔬 Экстра крупный план', en: '🔬 Extreme Close-Up' },
  wide_shot: { ru: '🌐 Общий план', en: '🌐 Wide Shot' },
  american_shot: { ru: '🇺🇸 Американский план', en: '🇺🇸 American Shot' },
  cowboy_shot: { ru: '🤠 Ковбойский план', en: '🤠 Cowboy Shot' },
  profile_shot: { ru: '👤 Профиль', en: '👤 Profile' },
  three_quarter: { ru: '📐 3/4 ракурс', en: '📐 Three-Quarter View' },
  back_shot: { ru: '🔄 Съемка сзади', en: '🔄 Back Shot' },
  over_shoulder: { ru: '🏔️ Через плечо', en: '🏔️ Over-the-Shoulder' },
  eye_level: { ru: '👁️ На уровне глаз', en: '👁️ Eye Level' },
  dutch_angle: { ru: '🎭 Голландский угол', en: '🎭 Dutch Angle' },
  high_angle: { ru: '📐 Верхний ракурс', en: '📐 High Angle' },
  low_angle: { ru: '📐 Нижний ракурс', en: '📐 Low Angle' },
  birds_eye: {
    ru: '🦅 Вид с высоты птичьего полета',
    en: "🦅 Bird's Eye View",
  },
  worms_eye: { ru: '🐛 Вид снизу вверх', en: "🐛 Worm's Eye View" },
  macro_beauty: { ru: '💎 Макро красота', en: '💎 Macro Beauty' },
}

// Промпты для углов (из кода)
const anglePrompts = {
  medium_shot: 'medium shot, balanced composition, professional framing',
  close_up: 'close-up shot, intimate perspective, detailed facial features',
  extreme_closeup:
    'extreme close-up shot, ultra detailed, macro perspective, intense intimacy',
  wide_shot: 'wide shot, full scene overview, establishing shot',
  american_shot:
    'american shot, 3/4 length, knee up framing, classic cinematography',
  cowboy_shot:
    'cowboy shot, hip level framing, western cinema style, dynamic pose',
  profile_shot: 'profile view, elegant side angle, silhouette lighting',
  three_quarter:
    'three-quarter view, 3/4 angle, dimensional depth, professional portrait',
  back_shot:
    'back view, over the shoulder perspective, mysterious angle, rear composition',
  over_shoulder:
    'over-the-shoulder shot, classic conversation angle, depth perspective',
  eye_level: 'eye level shot, neutral perspective, natural human viewpoint',
  dutch_angle:
    'dutch angle, tilted composition, dynamic tension, cinematic drama',
  high_angle:
    'high angle shot, looking down perspective, dramatic composition, subject appears smaller',
  low_angle:
    'low angle shot, looking up perspective, powerful composition, subject appears dominant',
  birds_eye:
    "bird's eye view, overhead shot, top down perspective, aerial viewpoint, shot from directly above",
  worms_eye:
    "worm's eye view, extreme low angle shot, camera positioned on ground looking up, dramatic upward perspective, subject towering above camera, powerful low viewpoint",
  macro_beauty: 'macro beauty shot, extreme close-up, skin detail focus',
}

// Стоимость моделей (из конфига)
const modelCosts = {
  max: '$0.075',
  pro: '$0.055',
}

// Функция создания бенчмарк-теста
function createBenchmarkTest(angle, model) {
  const angleDesc = angleDescriptions[angle]
  const prompt = anglePrompts[angle]
  const cost = modelCosts[model]

  return {
    id: `${angle}_${model}`,
    angle: angle,
    model: model,
    angleName: angleDesc.ru,
    angleNameEn: angleDesc.en,
    prompt: prompt,
    cost: cost,
    modelKey: `black-forest-labs/flux-kontext-${model}`,
    testStatus: 'pending',
    expectedOutcome: `Professional ${angleDesc.en.toLowerCase()} with enhanced ${angle.replace('_', ' ')} perspective`,
    qualityExpectation:
      model === 'pro'
        ? 'Higher quality, better prompt following'
        : 'Good quality, reliable results',
  }
}

// Создание полного плана тестирования
console.log('📋 CREATING BENCHMARK PLAN')
console.log('==========================')

let allTests = []
let testId = 1

models.forEach(model => {
  console.log(
    `\n🤖 Model: FLUX Kontext ${model.toUpperCase()} (${modelCosts[model]})`
  )
  console.log(
    `🎯 Expected: ${model === 'pro' ? 'Higher quality, better prompt following' : 'Good quality, reliable results'}`
  )

  allAngles.forEach(angle => {
    const test = createBenchmarkTest(angle, model)
    test.testNumber = testId++
    allTests.push(test)

    console.log(
      `  ${test.testNumber.toString().padStart(2, '0')}. ${test.angleName} → "${test.prompt}"`
    )
  })
})

console.log(`\n📊 BENCHMARK SUMMARY:`)
console.log(`• Total tests: ${allTests.length}`)
console.log(`• Angles tested: ${allAngles.length}`)
console.log(`• Models compared: ${models.length}`)
console.log(
  `• Pro vs Max cost: ${modelCosts.pro} vs ${modelCosts.max} (Pro is 27% cheaper!)`
)

// Группировка для сравнения
console.log(`\n🔍 COMPARISON MATRIX:`)
console.log('===================')

allAngles.forEach((angle, index) => {
  const maxTest = allTests.find(t => t.angle === angle && t.model === 'max')
  const proTest = allTests.find(t => t.angle === angle && t.model === 'pro')

  console.log(
    `${(index + 1).toString().padStart(2, '0')}. ${angleDescriptions[angle].ru}`
  )
  console.log(`    Max: Test #${maxTest.testNumber} - ${maxTest.cost}`)
  console.log(
    `    Pro: Test #${proTest.testNumber} - ${proTest.cost} ⭐ CHEAPER`
  )
  console.log('')
})

// Сохранение плана тестирования
const benchmarkPlan = {
  metadata: {
    created: new Date().toISOString(),
    testImage:
      '/Users/playra/999-multibots-telegraf/assets/bible_vibecoder/lyps-sync.jpg',
    totalTests: allTests.length,
    modelsCompared: models,
    anglesCount: allAngles.length,
  },
  tests: allTests,
  execution: {
    recommended_order: 'Interleave models to avoid bias',
    expected_duration: `${allTests.length * 2} minutes (2 min per test)`,
    total_cost_estimation: `~${allTests.length * 10} stars`,
  },
}

// Создание директории для результатов
const resultsDir = 'scripts/testing/benchmark-results'
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true })
}

// Сохранение плана
const planPath = path.join(resultsDir, 'flux-camera-benchmark-plan.json')
fs.writeFileSync(planPath, JSON.stringify(benchmarkPlan, null, 2))

console.log(`\n💾 BENCHMARK PLAN SAVED:`)
console.log(`📄 ${planPath}`)

// Создание исполняемого скрипта для бота
console.log(`\n🚀 READY FOR EXECUTION!`)
console.log(`📝 To run this benchmark in your bot:`)
console.log(`   1. Use the test image: assets/bible_vibecoder/lyps-sync.jpg`)
console.log(`   2. Test each angle with both models`)
console.log(`   3. Compare quality, prompt adherence, and results`)
console.log(`   4. Expected winner: Pro model (cheaper + better quality)`)

console.log(`\n🎯 NEXT STEPS:`)
console.log(`   • Run manual tests using the bot's camera control`)
console.log(`   • Compare side-by-side results`)
console.log(`   • Document quality differences`)
console.log(`   • Update model recommendations`)

console.log('\n✅ BENCHMARK PLAN COMPLETE! Ready for testing! 🎬')
