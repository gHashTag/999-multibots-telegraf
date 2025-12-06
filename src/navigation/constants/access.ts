/**
 * Константы доступа и уровней
 */

// ID сотрудников группы HAIM
export const HAIM_GROUP_STAFF_IDS = [
  '123456789',  // Пример ID, заменить на реальные
  '987654321'
]

// Уровни подписки
export const levels = {
  FREE: 0,
  BASIC: 1,
  PREMIUM: 2,
  VIP: 3
}

// Мапинг уровней на названия
export const levelNames = {
  [levels.FREE]: 'Free',
  [levels.BASIC]: 'Basic',
  [levels.PREMIUM]: 'Premium',
  [levels.VIP]: 'VIP'
}
