import { supabase } from './supabaseClient'
import { User } from '@supabase/supabase-js' // Предполагаем, что это правильный тип пользователя Supabase или нужен свой

// Можно определить более конкретный тип для пользователя этого модуля, если нужно
// export interface DigitalAvatarUser extends User {
//   level?: number;
//   balance?: number;
//   // ... другие поля из таблицы users
// }

/**
 * Получает данные пользователя по его Telegram ID.
 * Аналог getUserByTelegramIdString из @/core/supabase.
 */
export const getDigitalAvatarUser = async (
  telegramId: string
): Promise<any | null> => {
  // TODO: Заменить any на конкретный тип пользователя
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single() // Используем single() для получения одного объекта или null

  if (error && error.code !== 'PGRST116') {
    // PGRST116 - No rows found
    console.error(`Error fetching user ${telegramId}:`, error)
    // Можно выбросить ошибку или вернуть null в зависимости от требований
    // throw new Error(`Error fetching user: ${error.message}`);
  }
  return data
}

/**
 * Увеличивает уровень пользователя на единицу.
 * Аналог updateUserLevelPlusOne (которая, вероятно, вызывала updateUserLevel).
 */
export const incrementDigitalAvatarUserLevel = async (
  telegramId: string,
  currentLevel: number
): Promise<void> => {
  const newLevel = currentLevel + 1
  const { error } = await supabase
    .from('users')
    .update({ level: newLevel })
    .eq('telegram_id', telegramId)

  if (error) {
    console.error(`Error incrementing level for user ${telegramId}:`, error)
    // throw new Error(`Error incrementing user level: ${error.message}`);
  }
}

/**
 * Обновляет баланс пользователя (в звездах/токенах).
 * Аналог updateUserBalance из @/core/supabase.
 */
export const updateDigitalAvatarUserBalance = async (
  telegramId: string,
  newBalance: number // Предполагаем, что баланс - это число (звезды/токены)
): Promise<void> => {
  const { error } = await supabase
    .from('users')
    .update({ neuro_tokens: newBalance }) // Предполагаем, что колонка называется neuro_tokens
    .eq('telegram_id', telegramId)

  if (error) {
    console.error(`Error updating balance for user ${telegramId}:`, error)
    // throw new Error(`Error updating user balance: ${error.message}`);
  }
}
