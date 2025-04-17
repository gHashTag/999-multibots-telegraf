import { createClient } from '@supabase/supabase-js'
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  isSupabaseConfigured,
} from '../../config'
import logger from '../../utils/logger'

// Создаем клиент с service role key
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Получает информацию о ботах из базы данных Supabase
 * @returns Массив с информацией о ботах
 */
export async function getBotsFromSupabase() {
  // Проверяем, настроен ли Supabase
  if (!isSupabaseConfigured) {
    logger.warn(
      'Supabase не настроен. Невозможно получить ботов из базы данных.'
    )
    return []
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('bots')
      .select('*')
      .eq('is_active', true)

    if (error) {
      logger.error(`Ошибка при получении ботов из Supabase: ${error.message}`)
      return []
    }

    if (!data || data.length === 0) {
      logger.info('В Supabase не найдено активных ботов')
      return []
    }

    logger.info(`Получено ${data.length} ботов из Supabase`)
    return data
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Ошибка при получении ботов из Supabase: ${errorMessage}`)
    return []
  }
}
export * from './getBotGroupFromAvatars'
export * from './createUser'
export * from './createModelTraining'
export * from './checkSubscriptionByTelegramId'
export * from './updateUserBalance'
export * from './getAspectRatio'
export * from './getGeneratedImages'
export * from './getHistory'
export * from './getModel'
export * from './getPrompt'
export * from './getUserData'
export * from './incrementGeneratedImages'
export * from './isLimitAi'
export * from './savePrompt'
export * from './setAspectRatio'
export * from './getUidInviter'
export * from './getUserBalance'
export * from './updateUserVoice'
export * from './getUserModel'
export * from './getReferalsCountAndUserData'
export * from './cleanupOldArchives'
export * from './deleteFileFromSupabase'
export * from './ensureSupabaseAuth'
export * from './getTelegramIdByUserId'
export * from './getVoiceId'
export * from './saveUserEmail'
export * from './sendPaymentInfo'
export * from './getPaymentsInfoByTelegramId'
export * from './setModel'
export * from './updateModelTraining'
export * from './updateUserSoul'
export * from './getUserByTelegramId'
export * from './incrementBalance'
export * from './getLatestUserModel'
export * from './setPayments'
export * from './getUidInviter'
export * from './getUid'
export * from './updateUserSubscription'
export * from './getTranslation'
export * from './checkPaymentStatus'
export * from './updateUserLevelPlusOne'
