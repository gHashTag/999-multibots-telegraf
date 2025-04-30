import { pulseBot } from '@/core/bot'
import fs from 'fs'
import { logger } from '@/utils/logger'

// Для обратной совместимости поддерживаем старый формат
export const pulse = async (
  imageOrOptions: string | PulseOptions,
  prompt?: string,
  command?: string,
  telegram_id?: string,
  username?: string,
  is_ru?: boolean,
  bot_name?: string
) => {
  try {
    // Проверяем новый формат (объект)
    if (typeof imageOrOptions === 'object') {
      const options = imageOrOptions as PulseOptions

      logger.info({
        message: '📡 Отправка данных в pulse (новый формат)',
        description: 'Sending data to pulse (new format)',
        action: options.action,
      })

      // Для каждого типа действия используем специфичную логику
      if (options.action === 'NeurophotoV2') {
        const { imageUrl, prompt, service, user } = options.result
        const { telegramId, username, language } = user
        const isRussian = language === 'ru'

        const truncatedPrompt =
          prompt.length > 800 ? prompt.slice(0, 800) : prompt
        const caption = isRussian
          ? `@${
              username || 'Пользователь без username'
            } Telegram ID: ${telegramId} сгенерировал изображение с промптом: ${truncatedPrompt} \n\n Сервис: ${service}`
          : `@${
              username || 'User without username'
            } Telegram ID: ${telegramId} generated an image with a prompt: ${truncatedPrompt} \n\n Service: ${service}`

        const chatId = '@neuro_blogger_pulse'

        // Отправляем по URL вместо локального файла
        await pulseBot.telegram.sendPhoto(
          chatId,
          { url: imageUrl },
          { caption }
        )

        return
      }

      // Для других типов можно добавить дополнительную логику
      logger.warn({
        message: '⚠️ Неизвестный тип действия в pulse',
        description: 'Unknown action type in pulse',
        action: options.action,
      })

      return
    }

    // Старый формат (параметры по отдельности)
    logger.info({
      message: '📡 Отправка данных в pulse (старый формат)',
      description: 'Sending data to pulse (old format)',
      telegram_id,
      command,
    })
    if (!telegram_id || !prompt || !command || !bot_name) {
      throw new Error('Invalid data received in pulse')
    }

    const image = imageOrOptions // В старом формате первый параметр - это путь к изображению
    const truncatedPrompt =
      prompt?.length > 800 ? prompt?.slice(0, 800) : prompt
    const caption = is_ru
      ? `@${
          username || 'Пользователь без username'
        } Telegram ID: ${telegram_id} сгенерировал изображение с промптом: ${truncatedPrompt} \n\n Команда: ${command} \n\n Bot: @${bot_name}`
      : `@${
          username || 'User without username'
        } Telegram ID: ${telegram_id} generated an image with a prompt: ${truncatedPrompt} \n\n Command: ${command} \n\n Bot: @${bot_name}`

    const chatId = '@neuro_blogger_pulse'

    // send image as buffer
    await pulseBot.telegram.sendPhoto(
      chatId,
      { source: fs.createReadStream(image) },
      { caption }
    )
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при отправке в pulse',
      description: 'Error sending to pulse',
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
  }
}

// Интерфейсы для нового формата
interface PulseOptions {
  action: string
  result: any
}

/**
 * Отправляет различные типы медиа-контента в канал @neuro_blogger_pulse
 *
 * @param options Параметры для отправки медиа
 * @returns Promise<void>
 */
export const sendMediaToPulse = async (
  options: MediaPulseOptions
): Promise<void> => {
  try {
    const chatId = '@neuro_blogger_pulse'

    // Базовая информация о пользователе и контенте
    const {
      mediaType,
      mediaSource,
      telegramId,
      username = '',
      language = 'ru',
      serviceType,
      prompt = '',
      botName = '',
      additionalInfo = {},
    } = options

    // Подготовка информационной подписи
    const isRussian = language === 'ru'
    const truncatedPrompt = prompt.length > 800 ? prompt.slice(0, 800) : prompt

    // Базовая подпись в зависимости от языка
    let caption = isRussian
      ? `@${
          username || 'Пользователь без username'
        } Telegram ID: ${telegramId} `
      : `@${username || 'User without username'} Telegram ID: ${telegramId} `

    // Дополняем информацию в зависимости от типа контента
    if (mediaType === 'photo') {
      caption += isRussian ? `сгенерировал изображение` : `generated an image`
    } else if (mediaType === 'video') {
      caption += isRussian ? `сгенерировал видео` : `generated a video`
    } else if (mediaType === 'audio') {
      caption += isRussian ? `сгенерировал аудио` : `generated audio`
    } else if (mediaType === 'document') {
      caption += isRussian ? `сгенерировал документ` : `generated a document`
    }

    // Добавляем промпт, если он предоставлен
    if (prompt) {
      caption += isRussian
        ? ` с промптом: ${truncatedPrompt}`
        : ` with a prompt: ${truncatedPrompt}`
    }

    // Добавляем информацию о сервисе
    if (serviceType) {
      caption += isRussian
        ? `\n\n Сервис: ${serviceType}`
        : `\n\n Service: ${serviceType}`
    }

    // Добавляем информацию о боте
    if (botName) {
      caption += isRussian ? `\n\n Bot: @${botName}` : `\n\n Bot: @${botName}`
    }

    // Добавляем дополнительную информацию
    for (const [key, value] of Object.entries(additionalInfo)) {
      caption += `\n${key}: ${value}`
    }

    // Источник медиа может быть URL или путем к локальному файлу
    const isUrl =
      typeof mediaSource === 'string' &&
      (mediaSource.startsWith('http://') || mediaSource.startsWith('https://'))

    // Определяем параметры медиа для отправки
    const mediaParams = isUrl
      ? { url: mediaSource }
      : { source: fs.createReadStream(mediaSource as string) }

    // Отправляем в зависимости от типа медиа
    logger.info({
      message: `📡 Отправка ${mediaType} в pulse`,
      description: `Sending ${mediaType} to pulse channel`,
      telegramId,
      serviceType,
      mediaType,
    })

    // Отправляем соответствующий тип медиа
    switch (mediaType) {
      case 'photo':
        logger.info({
          message: '📬 [pulse] Получен запрос на отправку фото',
          description: 'Received photo sending request in pulse',
          telegramId,
          promptLength: prompt?.length ?? 0,
          promptReceived: !!prompt,
        })
        try {
          // 1. Отправляем фото без подписи
          await pulseBot.telegram.sendPhoto(chatId, mediaParams)
          logger.info({
            message: '📸 [pulse] Фото отправлено, готовим текст',
            description: 'Photo sent, preparing text message',
            telegramId,
            promptAvailable: !!prompt,
          })
        } catch (photoError) {
          logger.error({
            message: '❌ [pulse] Ошибка при отправке ФОТО',
            description: 'Error sending PHOTO in pulse',
            error:
              photoError instanceof Error
                ? photoError.message
                : String(photoError),
            stack: photoError instanceof Error ? photoError.stack : undefined,
            telegramId,
          })
          // Продолжаем попытку отправить текст, если фото не ушло
        }

        // 2. Формируем и отправляем текстовое сообщение с полным промптом и доп. информацией
        if (prompt) {
          let textMessage = isRussian
            ? `@${username || 'Пользователь без username'} Telegram ID: ${telegramId} сгенерировал изображение.`
            : `@${username || 'User without username'} Telegram ID: ${telegramId} generated an image.`

          textMessage += isRussian
            ? `\n\n📝 Промпт для копирования:`
            : `\n\n📝 Prompt for copying:`
          textMessage += '\n```\n' + prompt + '\n```' // Полный промпт в блоке для копирования

          // Добавляем остальную информацию ниже блока с промптом
          if (serviceType) {
            textMessage += isRussian
              ? `\n\n⚙️ Сервис: ${serviceType}`
              : `\n\n⚙️ Service: ${serviceType}`
          }
          if (botName) {
            textMessage += isRussian
              ? `\n🤖 Бот: @${botName}`
              : `\n🤖 Bot: @${botName}`
          }
          for (const [key, value] of Object.entries(additionalInfo)) {
            textMessage += `\nℹ️ ${key}: ${value}`
          }

          logger.info({
            message: '📝 [pulse] Попытка отправки текста с промптом',
            description: 'Attempting to send text message with prompt',
            telegramId,
            textMessageLength: textMessage.length,
          })
          try {
            await pulseBot.telegram.sendMessage(chatId, textMessage, {
              parse_mode: 'Markdown',
              link_preview_options: { is_disabled: true },
            })
            logger.info({
              message: '✅ [pulse] Текст с промптом успешно отправлен',
              description: 'Text message with prompt sent successfully',
              telegramId,
            })
          } catch (textError) {
            logger.error({
              message: '❌ [pulse] Ошибка при отправке ТЕКСТА с промптом',
              description: 'Error sending TEXT message with prompt in pulse',
              error:
                textError instanceof Error
                  ? textError.message
                  : String(textError),
              stack: textError instanceof Error ? textError.stack : undefined,
              telegramId,
              textMessageAttempted: textMessage.substring(0, 500) + '...',
              parseMode: 'Markdown',
            })
            // Попытка отправить без Markdown, если ошибка связана с парсингом
            if (
              textError instanceof Error &&
              textError.message.includes('parse')
            ) {
              logger.warn({
                message:
                  '⚠️ [pulse] Повторная попытка отправки текста без Markdown',
                description:
                  'Retrying text message without Markdown due to parse error',
                telegramId,
              })
              try {
                await pulseBot.telegram.sendMessage(chatId, textMessage, {
                  link_preview_options: { is_disabled: true },
                })
                logger.info({
                  message:
                    '✅ [pulse] Текст с промптом успешно отправлен (без Markdown)',
                  description:
                    'Text message with prompt sent successfully (without Markdown)',
                  telegramId,
                })
              } catch (retryError) {
                logger.error({
                  message:
                    '❌ [pulse] Ошибка при повторной отправке ТЕКСТА (без Markdown)',
                  description: 'Error retrying text message without Markdown',
                  error:
                    retryError instanceof Error
                      ? retryError.message
                      : String(retryError),
                  stack:
                    retryError instanceof Error ? retryError.stack : undefined,
                  telegramId,
                })
              }
            }
          }
        } else {
          // Если промпта нет, просто отправляем базовую информацию
          let textMessage = isRussian
            ? `@${username || 'Пользователь без username'} Telegram ID: ${telegramId} сгенерировал изображение.`
            : `@${username || 'User without username'} Telegram ID: ${telegramId} generated an image.`
          if (serviceType) {
            textMessage += isRussian
              ? `\n\n⚙️ Сервис: ${serviceType}`
              : `\n\n⚙️ Service: ${serviceType}`
          }
          if (botName) {
            textMessage += isRussian
              ? `\n🤖 Бот: @${botName}`
              : `\n🤖 Bot: @${botName}`
          }
          for (const [key, value] of Object.entries(additionalInfo)) {
            textMessage += `\nℹ️ ${key}: ${value}`
          }
          logger.info({
            message: '📝 [pulse] Попытка отправки текста без промпта',
            description: 'Attempting to send text message without prompt',
            telegramId,
            textMessageLength: textMessage.length,
          })
          try {
            await pulseBot.telegram.sendMessage(chatId, textMessage, {
              link_preview_options: { is_disabled: true },
            })
            logger.info({
              message: '✅ [pulse] Текст без промпта успешно отправлен',
              description: 'Text message without prompt sent successfully',
              telegramId,
            })
          } catch (textError) {
            logger.error({
              message: '❌ [pulse] Ошибка при отправке ТЕКСТА без промпта',
              description: 'Error sending TEXT message without prompt in pulse',
              error:
                textError instanceof Error
                  ? textError.message
                  : String(textError),
              stack: textError instanceof Error ? textError.stack : undefined,
              telegramId,
            })
          }
        }
        break
      case 'video':
        // Оставляем отправку видео с caption как есть (или можно адаптировать по аналогии)
        await pulseBot.telegram.sendVideo(chatId, mediaParams, { caption })
        break
      case 'audio':
        await pulseBot.telegram.sendAudio(chatId, mediaParams, { caption })
        break
      case 'document':
        await pulseBot.telegram.sendDocument(chatId, mediaParams, { caption })
        break
      default:
        throw new Error(`Неподдерживаемый тип медиа: ${mediaType}`)
    }

    logger.info({
      message: '✅ Медиа успешно отправлено в pulse',
      description: 'Media successfully sent to pulse channel',
      mediaType,
      telegramId,
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при отправке медиа в pulse',
      description: 'Error sending media to pulse channel',
      error: (error as Error).message,
      stack: (error as Error).stack,
      options,
    })
  }
}

// Типы для нового формата отправки медиа
export interface MediaPulseOptions {
  mediaType: 'photo' | 'video' | 'audio' | 'document'
  mediaSource: string | Buffer // URL или путь к файлу
  telegramId: string | number
  username?: string
  language?: 'ru' | 'en'
  serviceType?: string
  prompt?: string
  botName?: string
  additionalInfo?: Record<string, string>
}
