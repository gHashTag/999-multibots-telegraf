import { supabase } from './client'
import { logger } from '@/utils/logger'
import { ADMIN_IDS_ARRAY } from '@/config'
import { createUser } from './createUser'
import { CreateUserData } from '@/interfaces'

/**
 * Проверяет может ли пользователь использовать avatar transform функцию
 * @param telegram_id - ID пользователя в Telegram
 * @returns {Promise<{canUse: boolean, isAdmin: boolean, hasUsedBefore: boolean}>}
 */
export const checkAvatarTransformUsage = async (
  telegram_id: string | number
): Promise<{
  canUse: boolean
  isAdmin: boolean
  hasUsedBefore: boolean
}> => {
  const telegramIdStr = telegram_id.toString()
  const numericTelegramId = parseInt(telegramIdStr, 10)

  logger.info('[checkAvatarTransformUsage] Checking avatar transform usage', {
    telegram_id: telegramIdStr,
  })

  // Проверяем админский статус
  const isAdmin = ADMIN_IDS_ARRAY.includes(numericTelegramId)

  if (isAdmin) {
    logger.info(
      '[checkAvatarTransformUsage] Admin detected - unlimited access',
      {
        telegram_id: telegramIdStr,
      }
    )
    return {
      canUse: true,
      isAdmin: true,
      hasUsedBefore: false, // Для админов не важно
    }
  }

  try {
    // Проверяем использовал ли пользователь функцию ранее
    const { data, error } = await supabase
      .from('users')
      .select('avatar_transform_used')
      .eq('telegram_id', telegramIdStr)
      .single()

    if (error) {
      // Если ошибка из-за отсутствия пользователя, пытаемся создать его
      if (
        error.code === 'PGRST116' ||
        error.message.includes('Row not found')
      ) {
        logger.info(
          '[checkAvatarTransformUsage] User not found, creating new user',
          {
            telegram_id: telegramIdStr,
          }
        )

        try {
          // Создаем пользователя с минимальными данными
          const [wasCreated, newUser] = await createUser({
            telegram_id: telegramIdStr,
            username: telegramIdStr, // Fallback username
            first_name: null,
            last_name: null,
            language_code: 'ru', // Default language
            is_bot: false,
            photo_url: null,
            chat_id: null,
            mode: 'clean',
            model: 'gpt-4-turbo',
            count: 0,
            aspect_ratio: '9:16',
            inviter: null,
            bot_name: null,
          })

          if (wasCreated && newUser) {
            logger.info(
              '[checkAvatarTransformUsage] User created successfully',
              {
                telegram_id: telegramIdStr,
                userId: newUser.id,
              }
            )
            // Новый пользователь может использовать функцию
            return {
              canUse: true,
              isAdmin: false,
              hasUsedBefore: false,
            }
          } else {
            logger.error('[checkAvatarTransformUsage] Failed to create user', {
              telegram_id: telegramIdStr,
            })
          }
        } catch (createError) {
          logger.error('[checkAvatarTransformUsage] Error creating user', {
            telegram_id: telegramIdStr,
            error:
              createError instanceof Error
                ? createError.message
                : 'Unknown error',
          })
        }
      }

      logger.error('[checkAvatarTransformUsage] Database error', {
        telegram_id: telegramIdStr,
        error: error.message,
      })
      // Если ошибка - разрешаем использование (safe default)
      return {
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false,
      }
    }

    const hasUsedBefore = data?.avatar_transform_used || false
    const canUse = !hasUsedBefore // Можно использовать только если не использовал ранее

    logger.info('[checkAvatarTransformUsage] Usage check completed', {
      telegram_id: telegramIdStr,
      hasUsedBefore,
      canUse,
      isAdmin: false,
    })

    return {
      canUse,
      isAdmin: false,
      hasUsedBefore,
    }
  } catch (error) {
    logger.error('[checkAvatarTransformUsage] Unexpected error', {
      telegram_id: telegramIdStr,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    // При неожиданной ошибке - разрешаем использование
    return {
      canUse: true,
      isAdmin: false,
      hasUsedBefore: false,
    }
  }
}
