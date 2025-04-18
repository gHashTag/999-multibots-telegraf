// Пакеты пополнения в рублях (фиксированные)
export const rubTopUpOptions: { amountRub: number; stars: number }[] = [
  { amountRub: 10, stars: 6 },
  { amountRub: 500, stars: 217 },
  { amountRub: 1000, stars: 434 },
  { amountRub: 2000, stars: 869 },
  { amountRub: 5000, stars: 2173 },
  { amountRub: 10000, stars: 4347 },
].filter(option => option.stars > 0) // На всякий случай оставим фильтр

// Проверка, если вдруг все пакеты стали невалидными
if (rubTopUpOptions.length === 0) {
  console.error(
    'Не удалось сформировать пакеты пополнения рублями из фиксированного списка.'
  )
  // Добавляем хотя бы один пакет по умолчанию
  rubTopUpOptions.push({ amountRub: 100, stars: 1 })
}
