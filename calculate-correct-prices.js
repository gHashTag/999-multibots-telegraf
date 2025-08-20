// Калькулятор правильных цен для Kie.ai
console.log('🧮 Расчет правильных цен для Kie.ai моделей')

const STAR_COST_USD = 0.016
const MARKUP_MULTIPLIER = 1.5

// Обратный расчет: из желаемых звезд в цену USD за секунду
function starsPerSecondToUSD(starsPerSecond) {
  // stars = (priceUSD / STAR_COST_USD) * MARKUP_MULTIPLIER
  // priceUSD = (stars / MARKUP_MULTIPLIER) * STAR_COST_USD
  return (starsPerSecond / MARKUP_MULTIPLIER) * STAR_COST_USD
}

// Прямой расчет: из цены USD в звезды
function usdToStars(costUSD) {
  return Math.floor((costUSD / STAR_COST_USD) * MARKUP_MULTIPLIER)
}

console.log('\n📊 Желаемые цены пользователя:')
console.log('40 ⭐ за 8 секунд = 5 ⭐ за секунду')

const targetStarsPerSecond = 5
const requiredPriceUSD = starsPerSecondToUSD(targetStarsPerSecond)

console.log(`\n✅ Для получения ${targetStarsPerSecond} ⭐ за секунду:`)
console.log(`Цена за секунду должна быть: $${requiredPriceUSD.toFixed(4)} USD`)

// Проверим разные длительности
console.log('\n🎬 Проверка цен для разных длительностей:')
console.log('=' .repeat(50))

const durations = [2, 4, 6, 8, 10]
for (const duration of durations) {
  const totalCostUSD = requiredPriceUSD * duration
  const starsCalculated = usdToStars(totalCostUSD)
  console.log(`${duration} сек: $${totalCostUSD.toFixed(4)} → ${starsCalculated} ⭐ (ожидается ${duration * targetStarsPerSecond} ⭐)`)
}

console.log('\n📝 Правильная конфигурация для unified-pricing.config.ts:')
console.log('=' .repeat(50))
console.log(`'kie-veo-3-fast': {
  pricePerSecondUSD: ${requiredPriceUSD.toFixed(4)}, // Для 5 ⭐ за секунду
  supportedDurations: [2, 4, 6, 8, 10],
  defaultDuration: 5,
  maxDuration: 10,
},`)

console.log(`'kie-veo-3': {
  pricePerSecondUSD: ${requiredPriceUSD.toFixed(4)}, // Для 5 ⭐ за секунду  
  supportedDurations: [2, 4, 6, 8, 10],
  defaultDuration: 8,
  maxDuration: 10,
},`)

console.log(`'kie-runway-aleph': {
  pricePerSecondUSD: ${requiredPriceUSD.toFixed(4)}, // Для 5 ⭐ за секунду
  supportedDurations: [2, 4, 6, 8, 10],
  defaultDuration: 6,
  maxDuration: 10,
},`)

console.log('\n🔄 Сравнение старых и новых цен:')
console.log('=' .repeat(50))
const oldPrices = [0.05, 0.25, 0.3] // текущие цены
const modelNames = ['kie-veo-3-fast', 'kie-veo-3', 'kie-runway-aleph']

for (let i = 0; i < modelNames.length; i++) {
  const oldPrice = oldPrices[i]
  const oldStars8sec = usdToStars(oldPrice * 8)
  const newStars8sec = usdToStars(requiredPriceUSD * 8)
  
  console.log(`${modelNames[i]}:`)
  console.log(`  Старая цена: $${oldPrice} → ${oldStars8sec} ⭐ за 8 сек`)
  console.log(`  Новая цена: $${requiredPriceUSD.toFixed(4)} → ${newStars8sec} ⭐ за 8 сек`)
}