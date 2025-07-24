const {
  VIDEO_MODELS_CONFIG,
} = require('./src/modules/videoGenerator/config/models.config.ts')

console.log('🔍 Проверка доступности моделей:')
console.log('')

// Проверяем наличие всех моделей
const modelIds = Object.keys(VIDEO_MODELS_CONFIG)
console.log('📋 Все модели в конфигурации:', modelIds)
console.log('')

// Проверяем конкретные модели
const modelsToCheck = ['veo-3', 'ray-v2', 'seedance-1-pro']

modelsToCheck.forEach(modelId => {
  console.log(`🔍 Модель: ${modelId}`)
  const model = VIDEO_MODELS_CONFIG[modelId]

  if (model) {
    console.log(`  ✅ Найдена! Название: "${model.title}"`)
    console.log(`  📝 Типы ввода: ${model.inputType.join(', ')}`)
    console.log(`  💰 Базовая цена: ${model.basePrice}`)
    console.log(`  🔧 API модель: ${model.api.model}`)
    console.log(`  📊 Конфигурация API:`, model.api.input)
    if (model.imageKey) {
      console.log(`  🖼️ Ключ изображения: ${model.imageKey}`)
    }
    if (model.resolutionOptions) {
      console.log(
        `  📐 Опции разрешения: ${model.resolutionOptions.join(', ')}`
      )
    }
    if (model.priceByResolution) {
      console.log(`  💰 Цены по разрешению:`, model.priceByResolution)
    }
  } else {
    console.log(`  ❌ НЕ НАЙДЕНА!`)
  }
  console.log('')
})

// Проверяем функцию findModelByTitle
const {
  findModelByTitle,
} = require('./src/modules/videoGenerator/config/models.config.ts')

console.log('🔍 Тестирование функции findModelByTitle:')
console.log('')

const testCases = [
  { title: 'Google Veo 3', type: 'text' },
  { title: 'Ray-v2', type: 'text' },
  { title: 'Ray-v2', type: 'image' },
  { title: 'Seedance Pro', type: 'text' },
  { title: 'Seedance Pro', type: 'image' },
]

testCases.forEach(testCase => {
  console.log(`🧪 Поиск: "${testCase.title}" (тип: ${testCase.type})`)
  const result = findModelByTitle(testCase.title, testCase.type)
  if (result) {
    console.log(`  ✅ Найдена модель: ${result}`)
  } else {
    console.log(`  ❌ Модель не найдена`)
  }
  console.log('')
})
