import axios, { AxiosResponse } from 'axios'
import { supabase } from '@/core/supabase'
import { isDev, SECRET_API_KEY, ELESTIO_URL, LOCAL_SERVER_URL } from '@/config'
import { Telegraf } from 'telegraf'

import { logger } from '@/utils/logger'

interface BroadcastResult {
  success: boolean
  message: string
  totalSent?: number
  totalFailed?: number
}

interface BroadcastTestRequest {
  imageUrl?: string
  videoFileId?: string
  textRu: string // Текст на русском
  textEn: string // Текст на английском
  botName: string
  sender_telegram_id: string
  contentType: string // 'photo', 'video', 'text', 'post_link'
  postLink?: string
}

interface BroadcastTestResponse {
  success: boolean
  message: string
}

export const broadcastService = {
  // Получение всех активных пользователей бота
  async getBotUsers(
    botName: string,
    ignoreActiveFlag = false
  ): Promise<string[]> {
    try {
      let query = supabase
        .from('users')
        .select('telegram_id')
        .eq('bot_name', botName)

      // Применяем фильтрацию только если не игнорируем флаг активности
      if (!ignoreActiveFlag) {
        query = query.eq('is_active', true)
        logger.info('Получение активных пользователей бота 👥:', {
          description: 'Getting active bot users',
          botName,
        })
      } else {
        logger.info(
          'Получение ВСЕХ пользователей бота без проверки активности 👥:',
          {
            description: 'Getting all bot users ignoring active flag',
            botName,
          }
        )
      }

      const { data, error } = await query

      if (error) {
        logger.error('Ошибка при получении пользователей бота ❌:', {
          description: 'Error getting bot users',
          error: error.message,
          botName,
        })
        return []
      }

      const status = ignoreActiveFlag ? 'всех' : 'активных'
      logger.info(
        `Найдено ${data.length} ${status} пользователей бота ${botName} 📊:`,
        {
          description: 'Found bot users',
          count: data.length,
          botName,
          ignoreActiveFlag,
        }
      )

      return data.map(user => user.telegram_id.toString())
    } catch (error) {
      logger.error('Неожиданная ошибка при получении пользователей бота ⚠️:', {
        description: 'Unexpected error getting bot users',
        error: error.message || 'Unknown error',
        botName,
      })
      return []
    }
  },

  // Получение всех пользователей бота (включая неактивных)
  async getAllBotUsers(botName: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('bot_name', botName)

      if (error) {
        logger.error('Ошибка при получении всех пользователей бота:', {
          description: 'Error getting all bot users',
          error: error.message,
          botName,
        })
        return []
      }

      logger.info(
        `Найдено ${data.length} всего пользователей бота ${botName}`,
        {
          description: 'Found all bot users',
          count: data.length,
          botName,
        }
      )

      return data.map(user => user.telegram_id.toString())
    } catch (error) {
      logger.error(
        'Неожиданная ошибка при получении всех пользователей бота:',
        {
          description: 'Unexpected error getting all bot users',
          error: error.message || 'Unknown error',
          botName,
        }
      )
      return []
    }
  },

  // Обновление статуса пользователя после неудачной отправки сообщения
  async updateUserStatusAfterFailure(
    botName: string,
    userId: string,
    errorMessage: string
  ): Promise<void> {
    try {
      // Проверяем, содержит ли сообщение об ошибке признаки неактивности пользователя
      const isUserDeactivated =
        errorMessage.includes('user is deactivated') ||
        errorMessage.includes('chat not found') ||
        errorMessage.includes('bot was blocked by the user')

      if (isUserDeactivated) {
        logger.info(`Пользователь ${userId} неактивен: ${errorMessage}`, {
          description: 'User is inactive',
          userId,
          botName,
          error: errorMessage,
        })

        // Закомментировано до создания столбца is_active

        // Помечаем пользователя как неактивного в базе данных
        const { error } = await supabase
          .from('users')
          .update({ is_active: false })
          .eq('bot_name', botName)
          .eq('telegram_id', userId)

        if (error) {
          logger.error('Ошибка при обновлении статуса пользователя:', {
            description: 'Error updating user status',
            error: error.message,
            userId,
            botName,
          })
        } else {
          logger.info(`Пользователь ${userId} помечен как неактивный`, {
            description: 'User marked as inactive',
            userId,
            botName,
          })
        }
      }
    } catch (error) {
      logger.error('Ошибка при обработке неактивного пользователя:', {
        description: 'Error processing inactive user',
        error: error.message || 'Unknown error',
        userId,
        botName,
      })
    }
  },

  // Активация пользователя при успешной отправке сообщения
  async activateUser(botName: string, userId: string): Promise<void> {
    try {
      logger.info(`Пользователь ${userId} успешно получил сообщение`, {
        description: 'User received message successfully',
        userId,
        botName,
      })

      const { error } = await supabase
        .from('users')
        .update({ is_active: true })
        .eq('bot_name', botName)
        .eq('telegram_id', userId)

      if (error) {
        logger.error('Ошибка при активации пользователя:', {
          description: 'Error activating user',
          error: error.message,
          userId,
          botName,
        })
      } else {
        logger.info(`Пользователь ${userId} активирован`, {
          description: 'User activated',
          userId,
          botName,
        })
      }
    } catch (error) {
      logger.error('Ошибка при активации пользователя:', {
        description: 'Error activating user',
        error: error.message || 'Unknown error',
        userId,
        botName,
      })
    }
  },

  // Прямая отправка сообщения с фото через бота Telegram
  async sendBroadcastDirectly(
    botToken: string,
    imageUrl: string,
    text: string,
    userIds: string[],
    ownerTelegramId?: string,
    botName?: string
  ): Promise<BroadcastResult> {
    try {
      const bot = new Telegraf(botToken)
      let successCount = 0
      let failCount = 0

      logger.info(
        `Начинаем прямую рассылку для ${userIds.length} пользователей`,
        {
          description: 'Starting direct broadcast',
          userCount: userIds.length,
          imageUrl,
        }
      )

      // Проверяем, является ли imageUrl file_id
      let useRawFileId = false
      if (!imageUrl.startsWith('http') && !imageUrl.includes('/')) {
        useRawFileId = true
        logger.info('Используем прямой file_id для отправки сообщений', {
          description: 'Using raw file_id for message sending',
          fileId: imageUrl,
        })
      }

      // Если не file_id - проверяем и исправляем URL изображения
      let validImageUrl = imageUrl

      if (!useRawFileId) {
        // Проверяем, является ли изображение файлом Telegram
        if (imageUrl.includes('api.telegram.org/file/bot/')) {
          try {
            // Сначала пробуем получить ID файла из URL
            const urlParts = imageUrl.split('/')
            const fileId = urlParts[urlParts.length - 1]

            // Проверяем, получился ли fileId
            if (fileId && fileId.length > 5) {
              try {
                // Пытаемся получить файл через API Telegram
                const fileInfo = await bot.telegram.getFile(fileId)

                if (fileInfo && fileInfo.file_path) {
                  // Формируем правильный URL с токеном
                  validImageUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`

                  logger.info('URL изображения исправлен:', {
                    description: 'Image URL fixed',
                    originalUrl: imageUrl,
                    newUrl: validImageUrl,
                  })
                } else {
                  throw new Error('Путь к файлу не найден')
                }
              } catch (fileError) {
                // Если не удалось получить файл по ID, пробуем использовать сам file_id напрямую
                logger.warn(
                  'Не удалось получить информацию о файле, используем file_id напрямую:',
                  {
                    description:
                      'Failed to get file info, trying direct file_id',
                    fileId,
                    error: fileError.message || 'Unknown error',
                  }
                )

                // Переключаемся на использование file_id напрямую
                useRawFileId = true
                validImageUrl = fileId
              }
            } else {
              // Если не удалось получить fileId из URL
              logger.warn(
                'Не удалось извлечь ID файла из URL, используем заглушку:',
                {
                  description: 'Failed to extract file ID',
                  originalUrl: imageUrl,
                }
              )
              validImageUrl = 'https://i.imgur.com/4AiXzf8.jpg'
            }
          } catch (error) {
            // Общая ошибка обработки
            logger.error('Ошибка при обработке URL изображения:', {
              description: 'Error processing image URL',
              originalUrl: imageUrl,
              error: error.message || 'Unknown error',
            })
            validImageUrl = 'https://i.imgur.com/4AiXzf8.jpg'
          }
        } else if (!imageUrl.startsWith('http')) {
          // Проверяем, возможно это просто file_id вместо URL
          try {
            // Попробуем сначала использовать напрямую как file_id
            useRawFileId = true
            validImageUrl = imageUrl
            logger.info('Используем входной параметр как file_id:', {
              description: 'Using input as file_id',
              fileId: imageUrl,
            })
          } catch (fileError) {
            logger.warn('Некорректный URL или file_id изображения:', {
              description: 'Invalid image URL or file_id',
              input: imageUrl,
              error: fileError.message || 'Unknown error',
            })
            validImageUrl = 'https://i.imgur.com/4AiXzf8.jpg'
            useRawFileId = false
          }
        }
      }

      // Для целей тестирования - отправляем сообщение владельцу бота
      if (ownerTelegramId) {
        try {
          // Отправляем тестовое сообщение, используя или file_id напрямую, или URL
          await bot.telegram.sendPhoto(ownerTelegramId, validImageUrl, {
            caption: `${text}\n\n[ТЕСТОВАЯ РАССЫЛКА]`,
            parse_mode: 'Markdown',
          })
          logger.info('Тестовое сообщение отправлено владельцу бота', {
            description: 'Test message sent to bot owner',
            useRawFileId,
            mediaValue: validImageUrl.substring(0, 30) + '...',
          })
        } catch (devError) {
          logger.error('Ошибка при отправке тестового сообщения владельцу:', {
            description: 'Error sending test message to owner',
            error: devError.message || 'Unknown error',
            useRawFileId,
            mediaValue: validImageUrl.substring(0, 30) + '...',
          })

          // Если не удалось отправить с текущими параметрами, попробуем обратный метод
          if (useRawFileId) {
            try {
              // Если file_id не сработал, пробуем получить URL
              const fileInfo = await bot.telegram.getFile(validImageUrl)
              const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`

              await bot.telegram.sendPhoto(ownerTelegramId, fileUrl, {
                caption: `${text}\n\n[ТЕСТОВАЯ РАССЫЛКА]`,
                parse_mode: 'Markdown',
              })

              logger.info(
                'Тестовое сообщение отправлено владельцу через URL:',
                {
                  description: 'Test message sent to owner using URL',
                  fileUrl,
                }
              )

              // Переключаемся на использование URL
              useRawFileId = false
              validImageUrl = fileUrl
            } catch (urlError) {
              logger.error(
                'Не удалось отправить сообщение владельцу ни через file_id, ни через URL:',
                {
                  description: 'Failed to send message to owner',
                  error: urlError.message || 'Unknown error',
                }
              )

              // Используем заглушку как последний вариант
              validImageUrl = 'https://i.imgur.com/4AiXzf8.jpg'
              useRawFileId = false
            }
          }
        }
      }

      // Отправляем сообщения всем пользователям
      for (const userId of userIds) {
        try {
          await bot.telegram.sendPhoto(userId, validImageUrl, {
            caption: text,
            parse_mode: 'Markdown',
          })
          successCount++

          // Если пользователь успешно получил сообщение, активируем его
          if (botName) {
            await this.activateUser(botName, userId)
          }

          // Добавляем небольшую задержку, чтобы не перегрузить API Telegram
          await new Promise(resolve => setTimeout(resolve, 100))
        } catch (error) {
          failCount++
          logger.error(
            `Ошибка при отправке сообщения пользователю ${userId}:`,
            {
              description: 'Error sending message to user',
              error: error.message || 'Unknown error',
              userId,
              useRawFileId,
            }
          )
          if (botName) {
            await this.updateUserStatusAfterFailure(
              botName,
              userId,
              error.message || 'Unknown error'
            )
          }
        }
      }

      logger.info('Рассылка завершена:', {
        description: 'Broadcast completed',
        totalSent: successCount,
        totalFailed: failCount,
      })

      return {
        success: true,
        message: `Рассылка успешно завершена. Отправлено: ${successCount}, Не отправлено: ${failCount}`,
        totalSent: successCount,
        totalFailed: failCount,
      }
    } catch (error) {
      logger.error('Ошибка при отправке рассылки напрямую:', {
        description: 'Error sending direct broadcast',
        error: error.message || 'Unknown error',
      })

      return {
        success: false,
        message: error.message || 'Неизвестная ошибка при отправке рассылки',
        totalSent: 0,
        totalFailed: userIds.length,
      }
    }
  },

  // Модифицированная функция для отправки любого типа рассылки через сервер
  async sendBroadcastViaServer(data: {
    contentType: string
    botName: string
    mediaFileId?: string
    textRu: string // Текст на русском
    textEn: string // Текст на английском
    postLink?: string
    ownerTelegramId: string
  }): Promise<BroadcastResult> {
    try {
      const {
        contentType,
        botName,
        mediaFileId,
        textRu,
        textEn,
        postLink,
        ownerTelegramId,
      } = data

      const url = `${isDev ? LOCAL_SERVER_URL : ELESTIO_URL}/broadcast`

      logger.info('Отправка двуязычной рассылки через API сервер 🌐:', {
        description: 'Sending bilingual broadcast via server API',
        contentType,
        botName,
      })

      // Формируем тело запроса с русским и английским текстом
      const requestBody = {
        bot_name: botName,
        textRu,
        textEn,
        sender_telegram_id: ownerTelegramId,
        imageUrl: contentType === 'photo' ? mediaFileId : undefined,
        videoFileId: contentType === 'video' ? mediaFileId : undefined,
        postLink: contentType === 'post_link' ? postLink : undefined,
        contentType: contentType,
      }

      logger.info('Параметры запроса на сервер 📝:', {
        description: 'Server request parameters',
        url,
        body: requestBody,
      })

      const response = await axios.post(url, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': SECRET_API_KEY,
        },
      })

      logger.info('Ответ от API сервера ✅:', {
        description: 'Server API response',
        response: response.data,
      })

      return {
        success: true,
        message: 'Рассылка успешно запущена через API сервер',
        totalSent: response.data.totalSent || 0,
        totalFailed: response.data.totalFailed || 0,
      }
    } catch (error) {
      logger.error('Ошибка при отправке рассылки через API сервер ❌:', {
        description: 'Error sending broadcast via server API',
        error: error.message || 'Unknown error',
      })

      return {
        success: false,
        message: `Ошибка при отправке через API: ${
          error.message || 'Неизвестная ошибка'
        }`,
        totalSent: 0,
        totalFailed: 0,
      }
    }
  },

  // Обновляем методы для работы с двуязычным текстом
  async sendBroadcastWithText(
    botName: string,
    textRu: string,
    textEn: string,
    ownerTelegramId: string
  ): Promise<BroadcastResult> {
    return this.sendBroadcastViaServer({
      contentType: 'text',
      botName,
      textRu,
      textEn,
      ownerTelegramId,
    })
  },

  async sendBroadcastWithVideo(
    botName: string,
    videoFileId: string,
    captionRu: string,
    captionEn: string,
    ownerTelegramId: string
  ): Promise<BroadcastResult> {
    return this.sendBroadcastViaServer({
      contentType: 'video',
      botName,
      mediaFileId: videoFileId,
      textRu: captionRu,
      textEn: captionEn,
      ownerTelegramId,
    })
  },

  async sendBroadcastToUsers(
    botName: string,
    imageUrl: string,
    textRu: string,
    textEn: string,
    ownerTelegramId: string
  ): Promise<BroadcastResult> {
    return this.sendBroadcastViaServer({
      contentType: 'photo',
      botName,
      mediaFileId: imageUrl,
      textRu,
      textEn,
      ownerTelegramId,
    })
  },

  async sendBroadcastWithPostLink(
    botName: string,
    postLink: string,
    textRu: string,
    textEn: string,
    ownerTelegramId: string
  ): Promise<BroadcastResult> {
    return this.sendBroadcastViaServer({
      contentType: 'post_link',
      botName,
      textRu,
      textEn,
      postLink,
      ownerTelegramId,
    })
  },

  // Отправка уведомления владельцу бота о завершении рассылки
  async sendBroadcastCompletionNotification(
    botToken: string,
    ownerTelegramId: string,
    totalSent: number,
    totalFailed: number
  ): Promise<void> {
    try {
      const bot = new Telegraf(botToken)

      await bot.telegram.sendMessage(
        ownerTelegramId,
        `✅ Рассылка завершена!\n\n📊 Статистика:\n✓ Отправлено: ${totalSent}\n✗ Не отправлено: ${totalFailed}`
      )

      logger.info('Уведомление о завершении рассылки отправлено:', {
        description: 'Broadcast completion notification sent',
        ownerTelegramId,
        totalSent,
        totalFailed,
      })
    } catch (error) {
      logger.error('Ошибка при отправке уведомления о завершении рассылки:', {
        description: 'Error sending broadcast completion notification',
        error: error.message || 'Unknown error',
        ownerTelegramId,
      })
    }
  },

  // Получение содержимого поста Telegram по ссылке
  async extractPostContent(postLink: string): Promise<{
    text?: string
    fileId?: string
    mediaType?: string
    isSuccess: boolean
    errorMessage?: string
  }> {
    try {
      logger.info('Начинаем извлечение содержимого поста 🔍:', {
        description: 'Starting post content extraction',
        postLink,
      })

      // Проверяем, что ссылка от Telegram
      if (!postLink.includes('t.me/')) {
        return {
          isSuccess: false,
          errorMessage:
            'Неверный формат ссылки. Должна быть ссылка на пост Telegram.',
        }
      }

      // Извлекаем имя канала и ID сообщения из ссылки
      // Форматы ссылок: https://t.me/channel_name/message_id или t.me/channel_name/message_id
      const linkParts = postLink.split('t.me/')[1].split('/')

      if (linkParts.length < 2 || !linkParts[0] || !linkParts[1]) {
        return {
          isSuccess: false,
          errorMessage: 'Невозможно извлечь ID сообщения из ссылки',
        }
      }

      const channelName = linkParts[0]
      const messageId = parseInt(linkParts[1], 10)

      if (isNaN(messageId)) {
        return {
          isSuccess: false,
          errorMessage: 'Невалидный ID сообщения в ссылке',
        }
      }

      logger.info('Извлечены данные из ссылки 📋:', {
        description: 'Extracted data from link',
        channelName,
        messageId,
      })

      // Если не удалось извлечь контент, возвращаем успешный результат без медиа
      // Это позволит отправить сообщение с кнопкой и ссылкой
      return {
        text: '', // Пустой текст, будем использовать текст, который пользователь добавил в интерфейсе
        isSuccess: true, // Считаем операцию успешной, чтобы продолжить процесс
        mediaType: 'link', // Используем специальный тип для отправки через кнопку
      }
    } catch (error) {
      logger.error('Неожиданная ошибка при извлечении контента поста ⚠️:', {
        description: 'Unexpected error during post content extraction',
        error: error.message || 'Unknown error',
        postLink,
      })

      return {
        isSuccess: false,
        errorMessage: `Неожиданная ошибка: ${
          error.message || 'Неизвестная ошибка'
        }`,
      }
    }
  },
}

export async function sendTestBroadcast(
  requestData: BroadcastTestRequest
): Promise<BroadcastTestResponse> {
  try {
    const url = `${isDev ? LOCAL_SERVER_URL : ELESTIO_URL}/broadcast/test`

    console.log('Отправка тестовой рассылки 🧪:', {
      description: 'Sending test broadcast',
      ...requestData,
      botToken: '***скрыто***',
    })

    // Преобразуем параметры в формат, ожидаемый сервером
    const serverParams = {
      imageUrl:
        requestData.contentType === 'photo' ? requestData.imageUrl : undefined,
      videoFileId:
        requestData.contentType === 'video'
          ? requestData.videoFileId
          : undefined,
      textRu: requestData.textRu,
      textEn: requestData.textEn,
      bot_name: requestData.botName,
      target_telegram_id: requestData.sender_telegram_id,
      contentType: requestData.contentType,
      postLink:
        requestData.contentType === 'post_link'
          ? requestData.postLink
          : undefined,
    }

    console.log('Параметры запроса на тестовую рассылку 📝:', {
      description: 'Test broadcast request parameters',
      url,
      ...serverParams,
      botToken: '***скрыто***',
    })

    const response: AxiosResponse<BroadcastTestResponse> = await axios.post(
      url,
      serverParams,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': SECRET_API_KEY,
        },
      }
    )

    console.log('Ответ на тестовую рассылку ✅:', {
      description: 'Test broadcast response',
      data: response.data,
    })
    return response.data
  } catch (error) {
    console.error('Ошибка при отправке тестовой рассылки ❌:', {
      description: 'Error sending test broadcast',
      error: error.message || 'Unknown error',
    })
    throw error
  }
}
