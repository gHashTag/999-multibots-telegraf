import { createClient } from '@supabase/supabase-js'
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_SERVICE_KEY,
} from '../../config'
import { logger } from '@/utils/logger'
import fs from 'fs'

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing Supabase environment variables')
}

// Создаем клиент с service role key
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Создаем админский клиент с тем же ключом
export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
)

// Создаем обычный клиент с anon key (теперь SUPABASE_SERVICE_KEY)
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

logger.info('🔌 Supabase клиент инициализирован', {
  description: 'Supabase client initialized',
  url: SUPABASE_URL?.substring(0, 15) + '...',
})

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
export * from './saveNeuroPhotoPrompt'
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
export * from './getLatestUserModel'
export * from './getUid'
export * from './updateUserSubscription'
export * from './getTranslation'
export * from './checkPaymentStatus'
export * from './updateUserLevelPlusOne'
export * from './getSubScribeChannel'
export * from './getTrainingCancelUrl'
export * from './getGroupByBotName'
export * from './isOwner'
export * from './createModelTrainingV2'
export * from './updateLatestModelTraining'
export * from './getUserByTelegramIdString'
export * from './getTrainingWithUser'
export * from './notifyTrainingSuccess'
export * from './updatePrompt'
export * from './getTaskData'
export * from './getFineTuneIdByTelegramId'
export * from './getUserByTaskId'
export * from './getTelegramIdFromInvId'
export * from './getBotGroupFromAvatars'

export * from './getAllUsersData'

export * from './getUser'
export * from './createPayment'

// Добавляем реэкспорт функций для работы с платежами
// Именно их не хватает в paymentProcessor.ts
export { getPaymentByInvId } from './getPaymentByInvId'
export { createSuccessfulPayment } from './createSuccessfulPayment'

/**
 * Получает пользователя по ID
 * @param userId ID пользователя
 * @param botName Имя бота
 * @returns Данные пользователя или null, если пользователь не найден
 */
export const getUserById = async (userId: number, botName: string) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .eq('bot_name', botName)
      .single()

    if (error) {
      console.error('Ошибка при получении пользователя:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Ошибка при получении пользователя:', error)
    return null
  }
}

/**
 * Скачивает файл по URL
 * @param url URL файла
 * @param destinationPath Путь для сохранения файла
 * @returns true если файл успешно скачан
 */
export const downloadFile = async (
  url: string,
  destinationPath: string
): Promise<boolean> => {
  try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(
        `Ошибка при скачивании файла: ${response.status} ${response.statusText}`
      )
    }

    const fileStream = fs.createWriteStream(destinationPath)
    const buffer = await response.arrayBuffer()

    return new Promise((resolve, reject) => {
      fileStream.write(Buffer.from(buffer), err => {
        if (err) {
          reject(err)
          return
        }

        fileStream.close(() => {
          resolve(true)
        })
      })
    })
  } catch (error) {
    console.error('Ошибка при скачивании файла:', error)
    throw error
  }
}
