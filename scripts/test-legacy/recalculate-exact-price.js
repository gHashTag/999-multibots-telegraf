// Точный пересчет цены для получения ровно 40 ⭐ за 8 секунд

const STAR_COST_USD = 0.016
const MARKUP_MULTIPLIER = 1.5

// Функция расчета звезд (как в коде)
function usdToStars(costUSD) {
  return Math.floor((costUSD / STAR_COST_USD) * MARKUP_MULTIPLIER)
}

console.log('🔢 Точный расчет цены для 40 ⭐ за 8 секунд')

// Проверяем текущую цену $0.0533
const currentPrice = 0.0533
const currentTotal8sec = currentPrice * 8
const currentStars = usdToStars(currentTotal8sec)

console.log(`\n📊 Текущая цена $${currentPrice}:`)
console.log(`8 сек: $${currentTotal8sec.toFixed(4)} → ${currentStars} ⭐`)

// Подбираем точную цену
console.log('\n🎯 Подбор точной цены:')
for (let priceUSD = 0.0533; priceUSD <= 0.0540; priceUSD += 0.0001) {
  const total8sec = priceUSD * 8
  const stars = usdToStars(total8sec)
  const status = stars === 40 ? '✅' : (stars < 40 ? '⬇️' : '⬆️')
  console.log(`$${priceUSD.toFixed(4)}: $${total8sec.toFixed(4)} → ${stars} ⭐ ${status}`)
  
  if (stars === 40) {
    console.log(`\n🎉 НАЙДЕНА ТОЧНАЯ ЦЕНА: $${priceUSD.toFixed(4)} за секунду`)
    
    // Проверим для всех длительностей
    console.log('\n📋 Проверка для всех длительностей:')
    const durations = [2, 4, 6, 8, 10]
    for (const dur of durations) {
      const totalCost = priceUSD * dur
      const starsCalc = usdToStars(totalCost)
      console.log(`${dur} сек: $${totalCost.toFixed(4)} → ${starsCalc} ⭐ (ожидается ~${dur * 5} ⭐)`)
    }
    break
  }
}