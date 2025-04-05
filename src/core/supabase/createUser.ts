import { TelegramId } from '@/interfaces/telegram.interface';
import { supabase } from '.'
import { logger } from '@/utils/logger'
import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'

export interface CreateUserParams {
  telegram_id: TelegramId
  username?: string
  first_name?: string
  last_name?: string
  language_code?: string
  is_bot?: boolean
  photo_url?: string
  chat_id?: string
  mode?: string
  model?: string
  count?: number
  aspect_ratio?: string
  balance?: number
  bot_name?: string
  level?: number
}

export const createUser = async (userData: CreateUserParams) => {
  try {
    const {
      telegram_id,
      username,
      first_name,
      last_name,
      language_code = 'ru',
      is_bot = false,
      photo_url = '',
      chat_id,
      mode = 'clean',
      model = 'gpt-4-turbo',
      count = 0,
      aspect_ratio = '9:16',
      balance = 0,
      bot_name,
      level = 1,
    } = userData

    logger.info('👤 Создание нового пользователя:', {
      description: 'Creating new user',
      telegram_id,
    })

    // Нормализуем telegram_id в строку
    const normalizedTelegramId = normalizeTelegramId(telegram_id)

    // Проверяем, существует ли пользователь
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', normalizedTelegramId)
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      logger.error('❌ Ошибка при проверке существующего пользователя:', {
        description: 'Error checking existing user',
        error: checkError.message,
        telegram_id: normalizedTelegramId,
      })
      throw checkError
    }

    if (existingUser) {
      logger.info('👤 Пользователь уже существует:', {
        description: 'User already exists',
        telegram_id: normalizedTelegramId,
      })
      return existingUser
    }

    // Создаем нового пользователя
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([
        {
          telegram_id: normalizedTelegramId,
          username,
          first_name,
          last_name,
          language_code,
          is_bot,
          photo_url,
          chat_id: chat_id || normalizedTelegramId,
          mode,
          model,
          count,
          aspect_ratio,
          balance,
          bot_name,
          level,
        },
      ])

    if (createError) {
      logger.error('❌ Ошибка при создании пользователя:', {
        description: 'Error creating user',
        error: createError.message,
        telegram_id: normalizedTelegramId,
      })
      throw createError
    }

    logger.info('✅ Пользователь успешно создан:', {
      description: 'User created successfully',
      telegram_id: normalizedTelegramId,
    })

    return newUser
  } catch (error) {
    logger.error('❌ Ошибка в createUser:', {
      description: 'Error in createUser function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id: userData.telegram_id,
    })
    throw error
  }
}
