import { supabase } from '@/core/supabase'
import { getBotByName } from '@/core/bot'
import { logger } from '@/utils/logger'
import { avatarService } from './avatar.service'
import type { BotName } from '@/interfaces'
import type { toBotName } from '@/helpers/botName.helper'

export interface BroadcastResult {
  successCount: number
  errorCount: number
  reason?: string
  success?: boolean
  users?: any[]
}

export interface BroadcastOptions {
  bot_name?: BotName
  sender_telegram_id?: string // Telegram ID отправителя для проверки прав
  test_mode?: boolean // Режим тестирования - отправка только отправителю
  test_telegram_id?: string // ID для тестовой отправки
  contentType?: 'photo' | 'video' | 'post_link' // Тип контента
  postLink?: string // Ссылка на пост для типа 'post_link'
  videoFileId?: string // ID видео файла для типа 'video'
  textEn?: string // Текст на английском
}

export interface FetchUsersOptions {
  bot_name?: BotName
  test_mode?: boolean
  test_telegram_id?: string
  sender_telegram_id?: string
}

export const broadcastService = {
  /**
   * Проверяет права пользователя на отправку рассылки
   */
  checkOwnerPermissions: async (
    telegram_id: string,
    bot_name: BotName
  ): Promise<BroadcastResult> => {
    try {
      const isOwner = await avatarService.isAvatarOwner(telegram_id, bot_name)
      if (!isOwner) {
        logger.warn('⚠️ Попытка неавторизованной рассылки:', {
          description: 'Unauthorized broadcast attempt',
          telegram_id,
          bot_name,
        })
        return {
          success: false,
          successCount: 0,
          errorCount: 0,
          reason: 'unauthorized',
        }
      }
      return { success: true, successCount: 0, errorCount: 0 }
    } catch (error: any) {
      logger.error('❌ Ошибка при проверке прав:', {
        description: 'Error checking permissions',
        error: error?.message || 'Unknown error',
      })
      return {
        success: false,
        successCount: 0,
        errorCount: 0,
        reason: 'permission_check_error',
      }
    }
  },

  /**
   * Получает список пользователей для рассылки
   */
  fetchUsers: async (options: FetchUsersOptions): Promise<BroadcastResult> => {
    const { bot_name, test_mode, test_telegram_id, sender_telegram_id } =
      options

    try {
      if (test_mode) {
        const testId = test_telegram_id || sender_telegram_id || '144022504'
        const users = bot_name
          ? [{ telegram_id: testId, bot_name }]
          : await supabase
              .from('users')
              .select('telegram_id, bot_name')
              .eq('telegram_id', testId)
              .single()
              .then(({ data }) => (data ? [data] : []))

        return { success: true, successCount: 0, errorCount: 0, users }
      }

      let query = supabase.from('users').select('telegram_id, bot_name')
      if (bot_name) {
        query = query.eq('bot_name', bot_name)
      }

      const { data: users, error } = await query
      if (error) {
        throw error
      }

      return {
        success: true,
        successCount: 0,
        errorCount: 0,
        users: users || [],
      }
    } catch (error: any) {
      logger.error('❌ Ошибка при получении пользователей:', {
        description: 'Error fetching users',
        error: error?.message || 'Unknown error',
      })
      return {
        success: false,
        successCount: 0,
        errorCount: 0,
        reason: 'fetch_users_error',
        users: [],
      }
    }
  },

  /**
   * Получает экземпляр бота по имени
   */
  getBotInstance: async (botName: string) => {
    try {
      const validBotName = toBotName(botName)
      const result = await getBotByName(validBotName)
      if (!result || !result.bot) {
        logger.error(`❌ Бот не найден: ${validBotName}`, {
          description: `Bot not found: ${validBotName}`,
        })
        return null
      }
      return result.bot
    } catch (error: any) {
      logger.error('❌ Ошибка при получении бота:', {
        description: 'Error getting bot instance',
        error: error?.message || 'Unknown error',
        botName,
      })
      return null
    }
  },

  /**
   * Отправляет сообщение всем пользователям или пользователям конкретного бота
   * @param imageUrl URL изображения
   * @param textRu Текст на русском
   * @param options Опции рассылки
   */
  sendToAllUsers: async (
    imageUrl: string | undefined,
    textRu: string,
    options: BroadcastOptions = {}
  ): Promise<BroadcastResult> => {
    const {
      bot_name,
      sender_telegram_id,
      test_mode,
      test_telegram_id,
      contentType,
      postLink,
      videoFileId,
      textEn,
    } = options

    // Строгая проверка наличия bot_name
    if (!bot_name || typeof bot_name !== 'string' || bot_name.trim() === '') {
      logger.error('❌ Не указан или некорректный bot_name для рассылки', {
        description: 'Invalid or missing bot_name for broadcast',
        bot_name,
        options: JSON.stringify(options),
      })
      return {
        successCount: 0,
        errorCount: 0,
        reason: 'invalid_bot_name',
      }
    }

    logger.info('🚀 Начало рассылки с параметрами:', {
      description: 'Starting broadcast with parameters',
      bot_name,
      test_mode: test_mode || false,
      contentType: contentType || 'photo',
      has_image: !!imageUrl,
      has_video: !!videoFileId,
      has_post_link: !!postLink,
      sender_telegram_id: sender_telegram_id || 'not_provided',
    })

    // Если указан ID отправителя и имя бота, проверяем права
    if (sender_telegram_id && bot_name) {
      const isOwner = await avatarService.isAvatarOwner(
        sender_telegram_id,
        bot_name
      )
      if (!isOwner) {
        logger.warn('⚠️ Попытка неавторизованной рассылки:', {
          description: 'Unauthorized broadcast attempt',
          sender_telegram_id,
          bot_name,
        })
        return {
          successCount: 0,
          errorCount: 0,
          reason: 'unauthorized',
        }
      }
    }

    logger.info('📊 Начинаем загрузку пользователей из базы данных...', {
      description: 'Starting to fetch users from database',
      bot_name,
      test_mode: test_mode || false,
    })

    let users = []

    // Если режим тестирования, используем только ID отправителя или указанный тестовый ID
    if (test_mode) {
      const testId = test_telegram_id || sender_telegram_id || '144022504'

      // Если указан bot_name, используем его, иначе получаем из базы
      if (bot_name) {
        users = [{ telegram_id: testId, bot_name }]
        logger.info(
          `👤 Тестовый режим: отправка только на ID ${testId}, бот: ${bot_name}`,
          {
            description: `Test mode: sending only to ID ${testId}, bot: ${bot_name}`,
          }
        )
      } else {
        // Получаем бота для тестового пользователя из базы
        const { data, error } = await supabase
          .from('users')
          .select('telegram_id, bot_name')
          .eq('telegram_id', testId)
          .single()

        if (error || !data) {
          logger.error(`❌ Тестовый пользователь ${testId} не найден в базе`, {
            description: `Test user ${testId} not found in database`,
            error,
          })
          return {
            successCount: 0,
            errorCount: 0,
            reason: 'test_user_not_found',
          }
        }

        users = [data]
        logger.info(
          `👤 Тестовый режим: отправка только на ID ${testId}, бот: ${data.bot_name}`,
          {
            description: `Test mode: sending only to ID ${testId}, bot: ${data.bot_name}`,
          }
        )
      }
    } else {
      // Стандартная логика - получаем пользователей из базы данных
      const query = supabase
        .from('users')
        .select('telegram_id, bot_name, language_code')
        .eq('bot_name', bot_name) // Всегда фильтруем по bot_name

      const { data, error } = await query

      if (error) {
        logger.error(
          `❌ Ошибка при получении пользователей из базы: ${error.message}`,
          {
            description: `Error fetching users: ${error.message}`,
            error,
            bot_name,
          }
        )
        return {
          successCount: 0,
          errorCount: 0,
          reason: 'database_error',
        }
      }

      users = data || []
    }

    logger.info(
      `👥 Загружено пользователей для бота ${bot_name}: ${users?.length || 0}`,
      {
        description: `Fetched users count for bot ${bot_name}: ${
          users?.length || 0
        }`,
        bot_name,
        test_mode: test_mode || false,
      }
    )

    if (!users || users.length === 0) {
      logger.warn('⚠️ Нет пользователей для рассылки', {
        description: 'No users found for broadcast',
        bot_name,
        test_mode: test_mode || false,
      })
      return { successCount: 0, errorCount: 0, reason: 'no_users' }
    }

    let successCount = 0
    let errorCount = 0

    if (users) {
      for (const user of users) {
        if (user.telegram_id && user.bot_name) {
          logger.info(
            `🔄 Обработка пользователя: ${user.telegram_id}, бот: ${user.bot_name}`,
            {
              description: `Processing user: ${user.telegram_id}, bot: ${user.bot_name}`,
            }
          )

          try {
            const botResult = getBotByName(user.bot_name as BotName)

            // Детальное логирование результата получения бота
            logger.info('🔍 Результат получения бота:', {
              description: 'Bot retrieval result',
              hasBot: !!botResult?.bot,
              hasError: !!botResult?.error,
              error: botResult?.error || null,
              botType: botResult?.bot ? typeof botResult.bot : 'undefined',
              botKeys: botResult?.bot ? Object.keys(botResult.bot) : [],
            })

            if (!botResult || !botResult.bot) {
              logger.error(`❌ Бот не найден: ${user.bot_name}`, {
                description: `Bot not found: ${user.bot_name}`,
              })
              errorCount++
              continue
            }

            const { bot } = botResult

            // Проверяем методы телеграма
            if (
              !bot.telegram ||
              (contentType === 'post_link' &&
                typeof bot.telegram.sendMessage !== 'function') ||
              (contentType === 'video' &&
                typeof bot.telegram.sendVideo !== 'function') ||
              (!contentType && typeof bot.telegram.sendPhoto !== 'function')
            ) {
              logger.error(
                `❌ У бота отсутствуют необходимые методы отправки`,
                {
                  description: `Bot has no required methods`,
                  contentType: contentType || 'photo',
                  botTelegramMethods: bot.telegram
                    ? Object.keys(bot.telegram)
                    : 'no_telegram',
                }
              )
              errorCount++
              continue
            }

            logger.info(`🤖 Получен экземпляр бота: ${user.bot_name}`, {
              description: `Got bot instance: ${user.bot_name}`,
              telegramMethods: Object.keys(bot.telegram),
            })

            // Отправляем сообщение в зависимости от типа контента
            if (contentType === 'post_link' && postLink) {
              logger.info(`🔗 Отправляем ссылку на пост: ${postLink}`, {
                description: `Sending post link: ${postLink}`,
                language: user.language_code || 'ru',
              })

              const buttonText =
                user.language_code === 'en'
                  ? '🔗 Go to post'
                  : '🔗 Перейти к посту'
              const messageText =
                user.language_code === 'en' ? textEn || textRu : textRu

              await bot.telegram.sendMessage(
                user.telegram_id.toString(),
                messageText,
                {
                  parse_mode: 'HTML',
                  link_preview_options: { is_disabled: false },
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: buttonText,
                          url: postLink,
                        },
                      ],
                    ],
                  },
                }
              )
            } else if (contentType === 'video' && videoFileId) {
              logger.info(`🎥 Отправляем видео: ${videoFileId}`, {
                description: `Sending video: ${videoFileId}`,
                language: user.language_code || 'ru',
              })

              const messageText =
                user.language_code === 'en' ? textEn || textRu : textRu

              await bot.telegram.sendVideo(
                user.telegram_id.toString(),
                videoFileId,
                {
                  caption: messageText,
                  parse_mode: 'Markdown',
                }
              )
            } else if (imageUrl) {
              logger.info(
                `🖼️ Отправляем изображение: ${imageUrl?.substring(0, 50)}...`,
                {
                  description: `Sending image: ${imageUrl?.substring(
                    0,
                    50
                  )}...`,
                  language: user.language_code || 'ru',
                }
              )

              const messageText =
                user.language_code === 'en' ? textEn || textRu : textRu

              await bot.telegram.sendPhoto(
                user.telegram_id.toString(),
                imageUrl,
                {
                  caption: messageText,
                  parse_mode: 'Markdown',
                }
              )
            } else {
              logger.error(
                `❌ Не указан контент для отправки при contentType=${contentType}`,
                {
                  description: `No content specified for contentType=${contentType}`,
                  hasImageUrl: !!imageUrl,
                  hasVideoFileId: !!videoFileId,
                  hasPostLink: !!postLink,
                }
              )
              errorCount++
              continue
            }

            successCount++
            logger.info(
              `📨 Сообщение отправлено пользователю: ${user.telegram_id}`,
              {
                description: `Message sent to user: ${user.telegram_id}`,
                contentType: contentType || 'photo',
              }
            )
          } catch (err: any) {
            errorCount++
            logger.error(`❌ Ошибка при отправке сообщения:`, {
              description: `Error sending message`,
              error: err?.message || 'Unknown error',
              stack: err?.stack,
              response: err?.response,
              telegram_id: user.telegram_id,
              bot_name: user.bot_name,
            })

            if (err.response) {
              const errorCode = err.response.error_code
              if (errorCode === 403 || errorCode === 400) {
                logger.error(
                  `❌ Удаляем пользователя ${user.telegram_id} из-за ошибки: ${err.response.description}`,
                  {
                    description: `Removing user ${user.telegram_id} due to error: ${err.response.description}`,
                    error: err,
                  }
                )
                await supabase
                  .from('users')
                  .delete()
                  .eq('telegram_id', user.telegram_id)
              } else {
                logger.error(
                  `❌ Не удалось отправить сообщение пользователю: ${user.telegram_id}`,
                  {
                    description: `Failed to send message to user: ${user.telegram_id}`,
                    error: err,
                  }
                )
              }
            } else {
              logger.error(
                `❓ Неожиданная ошибка для пользователя: ${user.telegram_id}`,
                {
                  description: `Unexpected error for user: ${user.telegram_id}`,
                  error: err,
                }
              )
            }
          }
        }
      }
    }

    logger.info(
      `📊 Итоги рассылки: успешно - ${successCount}, ошибок - ${errorCount}`,
      {
        description: `Broadcast summary: success - ${successCount}, errors - ${errorCount}`,
        bot_name,
        test_mode: test_mode || false,
      }
    )

    return { successCount, errorCount }
  },

  async broadcastMessage(
    botName: string,
    message: string,
    options: BroadcastOptions = {}
  ): Promise<BroadcastResult> {
    try {
      const validBotName = toBotName(botName)
      const botData = await getBotByName(validBotName)

      if (!botData || !botData.bot) {
        logger.error('❌ Не удалось получить бота для рассылки:', {
          description: 'Failed to get bot for broadcast',
          bot_name: validBotName,
        })
        return {
          successCount: 0,
          errorCount: 0,
          reason: 'bot_not_found',
          success: false,
        }
      }

      const { data: subscribers, error } = await supabase
        .from('avatars')
        .select('telegram_id, username')
        .eq('bot_name', validBotName)

      if (error) {
        logger.error('❌ Ошибка при получении подписчиков из базы данных:', {
          description: 'Error getting subscribers from database',
          error,
        })
        return {
          successCount: 0,
          errorCount: 0,
          reason: 'database_error',
          success: false,
        }
      }

      if (!subscribers || subscribers.length === 0) {
        logger.warn('⚠️ Подписчики не найдены для бота:', {
          description: 'No subscribers found for bot',
          bot_name: validBotName,
        })
        return {
          successCount: 0,
          errorCount: 0,
          reason: 'no_subscribers',
          success: false,
        }
      }

      let successCount = 0
      let errorCount = 0

      for (const subscriber of subscribers) {
        try {
          await botData.bot.telegram.sendMessage(
            subscriber.telegram_id,
            message
          )
          successCount++
          logger.info('✅ Сообщение успешно отправлено:', {
            description: 'Message sent successfully',
            username: subscriber.username,
            bot_name: validBotName,
          })
        } catch (sendError) {
          errorCount++
          logger.error('❌ Ошибка при отправке сообщения:', {
            description: 'Error sending message',
            username: subscriber.username,
            error: sendError,
          })
        }
      }

      logger.info(
        `📊 Итоги рассылки: успешно - ${successCount}, ошибок - ${errorCount}`,
        {
          description: `Broadcast summary: success - ${successCount}, errors - ${errorCount}`,
          bot_name: validBotName,
        }
      )

      return {
        successCount,
        errorCount,
        reason: error?.message || 'Unknown error',
        success: successCount > 0,
      }
    } catch (error) {
      logger.error('❌ Ошибка в broadcastMessage:', error)
      return {
        successCount: 0,
        errorCount: 0,
        reason: error.message,
        success: false,
      }
    }
  },
}
// curl -X POST http://localhost:4000/broadcast \
//   -H "Content-Type: application/json" \
//   -d '{
//     "imageUrl": "https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/neuro_blogger_bot/flux_pro.jpeg",
//     "text": "Добрый день!\n\nМы рады сообщить, что наш бот стал еще лучше! 🎉\n\n✨ Запущена нейро-модель с улучшенными настройками!\nТеперь бот предлагает еще более впечатляющие результаты и выдает меньше брака. Попробуйте переобучить модель и вы точно заметите разницу!\n\n🌟 Что можно сделать сейчас?\n* Начните пользоваться ботом и оцените новую модель.\n* Обучите Цифровое тело на своих фотографиях.\n* Попробуйте функцию нейрофото и создайте уникальные изображения, которые вас удивят!\n\nНе упустите возможность первыми оценить все нововведения. Мы уверены, что вам понравится!\n\nСпасибо, что вы с нами. Ждем вашего feedback!"
//   }'
