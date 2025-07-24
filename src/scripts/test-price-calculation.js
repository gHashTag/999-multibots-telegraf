// Простая проверка расчета цены для Google Veo 3

console.log('🧮 РАСЧЕТ ЦЕНЫ GOOGLE VEO 3\n')

// Константы из системы
const starCost = 0.016
const interestRate = 1.5
const DEFAULT_VIDEO_DURATION_SECONDS = 5

// Конфиг модели Google Veo 3
const veo3Config = {
  id: 'veo-3',
  title: 'Google Veo 3',
  basePrice: 0.75,
}

console.log('📋 Исходные данные:')
console.log('   basePrice:', veo3Config.basePrice, 'USD')
console.log(
  '   DEFAULT_VIDEO_DURATION_SECONDS:',
  DEFAULT_VIDEO_DURATION_SECONDS
)
console.log('   starCost:', starCost, 'USD за звезду')
console.log('   interestRate:', interestRate, '(наценка)')
console.log('')

// Шаг 1: Полная базовая стоимость
const totalBaseCostUSD = veo3Config.basePrice * DEFAULT_VIDEO_DURATION_SECONDS
console.log('1️⃣ Полная базовая стоимость:')
console.log(
  '   totalBaseCostUSD =',
  veo3Config.basePrice,
  '*',
  DEFAULT_VIDEO_DURATION_SECONDS,
  '=',
  totalBaseCostUSD,
  'USD'
)
console.log('')

// Шаг 2: Базовая цена в звездах
const basePriceInStars = totalBaseCostUSD / starCost
console.log('2️⃣ Базовая цена в звездах:')
console.log(
  '   basePriceInStars =',
  totalBaseCostUSD,
  '/',
  starCost,
  '=',
  basePriceInStars
)
console.log('')

// Шаг 3: Применяем наценку
const finalPriceWithMarkup = basePriceInStars * (1 + interestRate)
console.log('3️⃣ Цена с наценкой:')
console.log(
  '   finalPriceWithMarkup =',
  basePriceInStars,
  '* (1 +',
  interestRate,
  ') =',
  basePriceInStars,
  '*',
  1 + interestRate,
  '=',
  finalPriceWithMarkup
)
console.log('')

// Шаг 4: Округляем вниз
const finalPriceInStars = Math.floor(finalPriceWithMarkup)
console.log('4️⃣ Финальная цена в звездах:')
console.log(
  '   finalPriceInStars = Math.floor(' + finalPriceWithMarkup + ') =',
  finalPriceInStars,
  '⭐'
)
console.log('')

// Ожидаемый текст кнопки
const expectedButtonText = `${veo3Config.title} (${finalPriceInStars} ⭐)`
console.log('📲 Ожидаемый текст кнопки:')
console.log('   "' + expectedButtonText + '"')
console.log('')

console.log(
  '✅ Если пользователь нажал эту кнопку, модель должна быть найдена!'
)
