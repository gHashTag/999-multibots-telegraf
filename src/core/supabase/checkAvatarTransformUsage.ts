import { supabase } from './client'
import { logger } from '@/utils/logger'
import { ADMIN_IDS_ARRAY } from '@/config'
import { createUser } from './createUser'
import { CreateUserData } from '@/interfaces'

/**
 * Проверяет может ли пользователь использовать avatar transform функцию
 * @param telegram_id - ID пользователя в Telegram
 * @param inviteCode - (Опционально) Реферальный код для установки inviter при создании пользователя
 * @returns {Promise<{canUse: boolean, isAdmin: boolean, hasUsedBefore: boolean}>}
 */
export const checkAvatarTransformUsage = async (
  telegram_id: string | number,
  inviteCode?: string
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
          // Обрабатываем реферальный код если он передан
          let inviterId: string | null = null
          if (inviteCode) {
            try {
              const { getReferalsCountAndUserData } = await import(
                './getReferalsCountAndUserData'
              )
              const { userData: referrerData } =
                await getReferalsCountAndUserData(inviteCode)
              if (referrerData && referrerData.user_id) {
                inviterId = referrerData.user_id
                logger.info(
                  '[checkAvatarTransformUsage] Referrer found for invite code',
                  {
                    telegram_id: telegramIdStr,
                    inviteCode,
                    referrerId: inviterId,
                  }
                )
              } else {
                logger.warn(
                  '[checkAvatarTransformUsage] Referrer not found for invite code',
                  {
                    telegram_id: telegramIdStr,
                    inviteCode,
                  }
                )
              }
            } catch (referralError) {
              logger.error(
                '[checkAvatarTransformUsage] Error processing referral code',
                {
                  telegram_id: telegramIdStr,
                  inviteCode,
                  error:
                    referralError instanceof Error
                      ? referralError.message
                      : 'Unknown error',
                }
              )
            }
          }

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
            inviter: inviterId,
            bot_name: null,
          })

          if (wasCreated && newUser) {
            logger.info(
              '[checkAvatarTransformUsage] User created successfully',
              {
                telegram_id: telegramIdStr,
                userId: newUser.id,
                hasReferrer: !!inviterId,
              }
            )

            // 📩 ОТПРАВЛЯЕМ УВЕДОМЛЕНИЕ РЕФЕРЕРУ если пользователь был создан с реферальным кодом
            if (inviteCode && inviterId) {
              try {
                // Импортируем bot instance для отправки уведомления
                // Примечание: Здесь мы не можем импортировать ctx, поэтому используем прямой импорт telegram
                logger.info(
                  '[checkAvatarTransformUsage] Attempting to send referral notification',
                  {
                    telegram_id: telegramIdStr,
                    inviteCode,
                    referrerId: inviterId,
                  }
                )

                // Примечание: Уведомление должно быть отправлено из AvatarTransformScene, где есть доступ к ctx
                // Возвращаем информацию о том, что нужно отправить уведомление
              } catch (notificationError) {
                logger.error(
                  '[checkAvatarTransformUsage] Error preparing referral notification',
                  {
                    telegram_id: telegramIdStr,
                    inviteCode,
                    error:
                      notificationError instanceof Error
                        ? notificationError.message
                        : 'Unknown error',
                  }
                )
              }
            }

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
