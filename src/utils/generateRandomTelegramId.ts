export function generateRandomTelegramId(): number {
  // Генерируем случайное 12-значное число
  return Math.floor(Math.random() * 900000000000) + 100000000000
}
