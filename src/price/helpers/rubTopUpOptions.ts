// Пакеты пополнения в рублях
// Рассчитано по курсу: 1 USD = 85 RUB, 1 звезда = $0.016, наценка 50%
// Цена 1 звезды для пользователя: 0.016 * 1.5 * 85 = 2.04 рубля
export const rubTopUpOptions: { amountRub: number; stars: number }[] = [
  { amountRub: 10, stars: 4 },      // 10₽ / 2.04₽ = 4.9 → 4⭐
  { amountRub: 500, stars: 245 },   // 500₽ / 2.04₽ = 245⭐
  { amountRub: 1000, stars: 490 },  // 1000₽ / 2.04₽ = 490⭐
  { amountRub: 2000, stars: 980 },  // 2000₽ / 2.04₽ = 980⭐
  { amountRub: 5000, stars: 2450 }, // 5000₽ / 2.04₽ = 2450⭐
  { amountRub: 10000, stars: 4901 },// 10000₽ / 2.04₽ = 4901⭐
].filter(option => option.stars > 0) // На всякий случай оставим фильтр

// Проверка, если вдруг все пакеты стали невалидными
if (rubTopUpOptions.length === 0) {
  console.error(
    'Не удалось сформировать пакеты пополнения рублями из фиксированного списка.'
  )
  // Добавляем хотя бы один пакет по умолчанию
  rubTopUpOptions.push({ amountRub: 100, stars: 1 })
}
