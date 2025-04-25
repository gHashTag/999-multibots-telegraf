import { createClient } from '@supabase/supabase-js'
import { logger } from '@/utils/logger'
import { supabase, supabaseAdmin } from './client'

// Получаем URL и ключ из переменных окружения
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  logger.error('Supabase URL или ключ не найдены в переменных окружения')
  throw new Error('Отсутствуют необходимые переменные окружения для Supabase')
}

// Создаем клиент Supabase
export const supabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
})

/**
 * Получает детали пользователя из базы данных
 * @param userId - ID пользователя в Telegram
 * @returns Детали пользователя или null, если пользователь не найден
 */
export const getUserDetails = async (userId: number | string) => {
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('telegram_id', userId)
      .single()

    if (error) {
      logger.error(`Ошибка при получении данных пользователя ${userId}:`, error)
      return null
    }

    return data
  } catch (error) {
    logger.error(`Необработанная ошибка при получении данных пользователя ${userId}:`, error)
    return null
  }
}

/**
 * Создает нового пользователя в базе данных
 * @param userData - Данные пользователя для создания
 * @returns Созданные данные пользователя или null в случае ошибки
 */
export const createUser = async (userData: any) => {
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .insert(userData)
      .select()
      .single()

    if (error) {
      logger.error('Ошибка при создании пользователя:', error)
      return null
    }

    return data
  } catch (error) {
    logger.error('Необработанная ошибка при создании пользователя:', error)
    return null
  }
}

/**
 * Обновляет данные пользователя в базе данных
 * @param userId - ID пользователя в Telegram
 * @param updateData - Данные для обновления
 * @returns Обновленные данные пользователя или null в случае ошибки
 */
export const updateUser = async (userId: number | string, updateData: any) => {
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .update(updateData)
      .eq('telegram_id', userId)
      .select()
      .single()

    if (error) {
      logger.error(`Ошибка при обновлении пользователя ${userId}:`, error)
      return null
    }

    return data
  } catch (error) {
    logger.error(`Необработанная ошибка при обновлении пользователя ${userId}:`, error)
    return null
  }
}

// Экспортируем все необходимые функции из модуля Supabase
export { supabase, supabaseAdmin } from './client'

// Явные экспорты вместо export *
export { getBotsFromSupabase } from './getBotsFromSupabase'
export { saveVideoUrlToSupabase } from './saveVideoUrlToSupabase'
export { updateHistory } from './updateHistory'
export { getAiFeedbackFromSupabase } from './getAiFeedbackFromSupabase'
export { getBotGroupFromAvatars } from './getBotGroupFromAvatars'
export { createModelTraining } from './createModelTraining'
export { updateUserBalance } from './updateUserBalance'
export { getAspectRatio } from './getAspectRatio'
export { getGeneratedImages } from './getGeneratedImages'
export { getHistory } from './getHistory'
export { getModel } from './getModel'
export { getPrompt } from './getPrompt'
export { getUserData } from './getUserData'
export { incrementGeneratedImages } from './incrementGeneratedImages'
export { isLimitAi } from './isLimitAi'
export { savePrompt } from './savePrompt'
export { setAspectRatio } from './setAspectRatio'
export { getUidInviter } from './getUidInviter'
export {
  getUserBalance,
  invalidateBalanceCache,
  getUserBalanceStats,
  type PaymentDetail,
  type UserBalanceStats,
} from './getUserBalance'
export { updateUserVoice } from './updateUserVoice'
export { getUserModel } from './getUserModel'
export { getReferalsCountAndUserData } from './getReferalsCountAndUserData'
export { cleanupOldArchives } from './cleanupOldArchives'
export { deleteFileFromSupabase } from './deleteFileFromSupabase'
export { ensureSupabaseAuth } from './ensureSupabaseAuth'
export { getTelegramIdByUserId } from './getTelegramIdByUserId'
export { getVoiceId } from './getVoiceId'
export { saveUserEmail } from './saveUserEmail'
export { sendPaymentInfo } from './sendPaymentInfo'
export { getPaymentsInfoByTelegramId } from './getPaymentsInfoByTelegramId'
export { updateUserSoul } from './updateUserSoul'
export { getUserByTelegramId } from './getUserByTelegramId'
export { incrementBalance } from './incrementBalance'
export { getLatestUserModel } from './getLatestUserModel'
export { setPayments } from './setPayments'
export { getUid } from './getUid'
export { updateUserSubscription } from './updateUserSubscription'
export { getTranslation } from './getTranslation'
export { checkPaymentStatus } from './checkPaymentStatus'
export { updateUserLevelPlusOne } from './updateUserLevelPlusOne'
export { savePromptDirect } from './savePromptDirect'
export { getUserByTelegramIdString } from './getUserByTelegramIdString'
export { createSuccessfulPayment as setSuccessfulPayment } from './createSuccessfulPayment'
export {
  getPendingPayment,
  getPaymentByInvId,
  updatePaymentStatus,
} from './payments'

// Добавляем экспорт новой функции
export { updateUserModel } from './updateUserModel'

// Другие экспорты из существующих файлов
export { checkUserExists } from './checkUserExists'
export { updateUserPaid } from './updateUserPaid'
export { createAvatar } from './createAvatar'
export { getBalance } from './getBalance'
export { getUserIdFromTelegramId } from './getUserIdFromTelegramId'
export { setSubscribeInvited } from './setSubscribeInvited'
export { getAvatarGroup } from './getAvatarGroup'
export { getUserRating } from './getUserRating'
export { updateUserRating } from './updateUserRating'
export { updateAvatar } from './updateAvatar'
export { getAvatarFromSupabase } from './getAvatarFromSupabase'
export { getAiFeedbackFromSupabase } from './getAiFeedbackFromSupabase'
export { getBotGroupFromAvatars } from './getBotGroupFromAvatars'
export { createModelTraining } from './createModelTraining'
export { updateUserBalance } from './updateUserBalance'
export { getUserEmail } from './getUserEmail'
export { updateUserEmail } from './updateUserEmail'
export { checkUserHasPaid } from './checkUserHasPaid'
export { saveNewPrompt } from './saveNewPrompt'
export { savePromptDirect } from './savePromptDirect'
export { getUserByTelegramIdString } from './getUserByTelegramIdString'
export { createSuccessfulPayment as setSuccessfulPayment } from './createSuccessfulPayment'
export {
  getAvatarsTable,
  getBotsFromAvatars,
  getPrompt,
  getPromptAi,
} from './tables'
