// Генерация случайного UUID v4
// Использует встроенную функцию crypto.randomUUID (Node 18+, Bun)
// Если по какой-то причине она недоступна, производится полифил через пакет uuid (по умолчанию не требуется)

export const generateUuidV4 = (): string => {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // fallback – динамический импорт, чтобы не тянуть зависимость без надобности
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const { v4 } = require('uuid') as { v4: () => string }
  return v4()
}
