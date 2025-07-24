const {
  VIDEO_MODELS_CONFIG,
} = require('../../dist/modules/videoGenerator/config/models.config.js')
const { calculateFinalPrice } = require('../../dist/price/helpers/index.js')

console.log('🔍 ДИАГНОСТИКА GOOGLE VEO 3\n')

// 1. Проверяем, есть ли модель в конфиге
console.log('1️⃣ Проверка модели в конфигурации:')
const veo3Model = VIDEO_MODELS_CONFIG['veo-3']
console.log('veo-3 найдена:', !!veo3Model)
if (veo3Model) {
  console.log('   Название:', veo3Model.title)
  console.log('   Базовая цена:', veo3Model.basePrice)
  console.log('   Типы ввода:', veo3Model.inputType)
}
console.log('')

// 2. Проверяем расчет цены
console.log('2️⃣ Проверка расчета цены:')
try {
  const price = calculateFinalPrice('veo-3')
  console.log('calculateFinalPrice("veo-3") =', price)
  console.log('Цена равна 0?', price === 0)
  console.log('Цена равна null?', price === null)
} catch (error) {
  console.log('❌ Ошибка при расчете цены:', error.message)
}
console.log('')

// 3. Проверяем формирование текста кнопки
console.log('3️⃣ Проверка формирования текста кнопки:')
if (veo3Model) {
  const price = calculateFinalPrice('veo-3')
  const buttonText = `${veo3Model.title} (${price} ⭐)`
  console.log('Ожидаемый текст кнопки:', buttonText)
}
console.log('')

// 4. Проверяем все модели для сравнения
console.log('4️⃣ Проверка всех моделей:')
Object.entries(VIDEO_MODELS_CONFIG).forEach(([key, config]) => {
  const price = calculateFinalPrice(key)
  const buttonText = `${config.title} (${price} ⭐)`
  console.log(`${key}: ${buttonText}`)
})
