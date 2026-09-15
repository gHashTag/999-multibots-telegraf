import { getPulseBot } from '@/core/bot'
import fs from 'fs'
import { logger } from '@/utils/logger'
import {
  isPulseDestinationDead,
  reportPulseFailure,
  resolvePulseChatId,
} from './pulseDestination'

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
    // ✅ Получаем pulseBot с ленивой инициализацией
    const pulseBot = getPulseBot()
    if (!pulseBot) {
      logger.warn({
        message: '⚠️ Pulse bot не инициализирован, пропускаем отправку',
        description: 'Pulse bot not initialized, skipping send',
        telegram_id,
      })
      return
    }

    // Проверяем новый формат (объект)
    if (typeof imageOrOptions === 'object') {
      const options = imageOrOptions as PulseOptions

      logger.info('📡 Отправка данных в pulse (новый формат)', {
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

        const chatId = resolvePulseChatId()

        // Отправляем по URL вместо локального файла
        await pulseBot.telegram.sendPhoto(
          chatId,
          { url: imageUrl },
          { caption }
        )

        return
      }

      // Для других типов можно добавить дополнительную логику
      logger.warn('⚠️ Неизвестный тип действия в pulse', {
        description: 'Unknown action type in pulse',
        action: options.action,
      })

      return
    }

    // Старый формат (параметры по отдельности)
    logger.info('📡 Отправка данных в pulse (старый формат)', {
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

    const chatId = resolvePulseChatId()

    // send image as buffer
    await pulseBot.telegram.sendPhoto(
      chatId,
      { source: fs.createReadStream(image) },
      { caption }
    )
  } catch (error) {
    reportPulseFailure(
      'Ошибка при отправке в pulse',
      resolvePulseChatId(),
      error,
      {
        telegram_id,
        username,
        command,
        bot_name,
        stack: error instanceof Error ? error.stack : undefined,
      }
    )
  }
}

// Интерфейсы для нового формата
interface PulseOptions {
  action: string
  result: any
}

/**
 * Экранирует специальные символы для MarkdownV2.
 * @param text - Текст для экранирования.
 * @returns Экранированный текст.
 */
function escapeMarkdownV2(text: string): string {
  // Символы для экранирования в MarkdownV2 (дополненный список)
  const charsToEscape = '\\_*[]()~`>#+-=|{}.!' // Добавил \ для экранирования самого себя, если он есть в тексте
  let escapedText = ''
  for (const char of text) {
    if (charsToEscape.includes(char)) {
      escapedText += '\\' + char // Добавляем обратный слеш перед спецсимволом
    } else {
      escapedText += char
    }
  }
  return escapedText
}

// --- НОВАЯ ФУНКЦИЯ HTML ЭКРАНИРОВАНИЯ ---
/**
 * Экранирует основные HTML символы: <, >, &
 * @param text - Текст для экранирования.
 * @returns Экранированный для HTML текст.
 */
function escapeHTML(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
// --- КОНЕЦ ФУНКЦИИ HTML ЭКРАНИРОВАНИЯ ---

/**
 * Отправляет различные типы медиа-контента в канал @neuro_blogger_pulse
 *
 * @param options Параметры для отправки медиа
 * @returns Promise<void>
 */
export const sendMediaToPulse = async (
  options: MediaPulseOptions
): Promise<void> => {
  const chatId = resolvePulseChatId()

  // A destination that just answered "chat not found" will answer it again for
  // every image. Skip quietly until the latch expires instead of re-alerting.
  if (isPulseDestinationDead(chatId)) {
    logger.info('⏸️ [pulse] Пропуск отправки: канал помечен недоступным', {
      description: 'Skipping pulse send: destination marked unreachable',
      chatId,
      telegramId: options.telegramId,
      mediaType: options.mediaType,
    })
    return
  }

  try {
    // ✅ Получаем pulseBot с ленивой инициализацией
    const pulseBot = getPulseBot()
    if (!pulseBot) {
      logger.warn({
        message: '⚠️ Pulse bot не инициализирован, пропускаем отправку',
        description: 'Pulse bot not initialized, skipping send',
        telegramId: options.telegramId,
      })
      return
    }

    // Базовая информация о пользователе и контенте
    const {
      mediaType,
      mediaSource,
      telegramId: rawTelegramId,
      username: rawUsername = '',
      language = 'ru',
      serviceType: rawServiceType,
      prompt = '',
      botName: rawBotName = '',
      additionalInfo: rawAdditionalInfo = {},
    } = options

    // --- ЭКРАНИРУЕМ ДИНАМИЧЕСКИЕ ЧАСТИ для HTML (для надежности) ---
    const telegramId = String(rawTelegramId) // ID обычно безопасны, но для единообразия
    const username = escapeHTML(rawUsername || 'Пользователь без username')
    const botName = escapeHTML(rawBotName)
    const serviceType = rawServiceType ? escapeHTML(rawServiceType) : undefined
    const additionalInfo: Record<string, string> = {}
    for (const [key, value] of Object.entries(rawAdditionalInfo)) {
      additionalInfo[escapeHTML(key)] = escapeHTML(String(value))
    }
    // --- КОНЕЦ ЭКРАНИРОВАНИЯ ---

    // Подготовка информационной подписи
    const isRussian = language === 'ru'
    const truncatedPrompt = prompt.length > 800 ? prompt.slice(0, 800) : prompt

    // Базовая подпись в зависимости от языка
    let caption = isRussian
      ? `@${username} Telegram ID: ${telegramId} `
      : `@${username} Telegram ID: ${telegramId} `

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
    logger.info(`📡 Отправка ${mediaType} в pulse`, {
      description: `Sending ${mediaType} to pulse channel`,
      telegramId: rawTelegramId,
      serviceType: rawServiceType,
      mediaType,
    })

    // Отправляем соответствующий тип медиа
    switch (mediaType) {
      case 'photo':
        logger.info('📬 [pulse] Получен запрос на отправку фото', {
          description: 'Received photo sending request in pulse',
          telegramId: rawTelegramId,
          promptLength: prompt?.length ?? 0,
          promptReceived: !!prompt,
        })
        try {
          // 1. Отправляем фото без подписи
          await pulseBot.telegram.sendPhoto(chatId, mediaParams)
          logger.info('📸 [pulse] Фото отправлено, готовим текст', {
            description: 'Photo sent, preparing text message',
            telegramId: rawTelegramId,
            promptAvailable: !!prompt,
          })
        } catch (photoError) {
          const destinationDead = reportPulseFailure(
            'Ошибка при отправке ФОТО',
            chatId,
            photoError,
            {
              telegramId: rawTelegramId,
              username: rawUsername,
              mediaType,
              mediaSourcePreview:
                typeof mediaSource === 'string'
                  ? mediaSource.substring(0, 100)
                  : 'Buffer',
            }
          )
          // The text below goes to the SAME chat. If the chat is gone, sending
          // it is two more guaranteed failures and two more alerts.
          if (destinationDead) return
          // Otherwise keep the old behaviour: a photo may fail where text works.
        }

        // 2. Формируем и отправляем текстовое сообщение с полным промптом и доп. информацией
        if (prompt) {
          let textMessage = isRussian
            ? `@${username} Telegram ID: ${telegramId} сгенерировал изображение.`
            : `@${username} Telegram ID: ${telegramId} generated an image.`

          textMessage += isRussian
            ? `\n\n📝 <b>Промпт для копирования:</b>` // Используем <b> для жирного
            : `\n\n📝 <b>Prompt for copying:</b>`

          // ---> Экранируем сам промпт для HTML и оборачиваем в pre (без code для избежания ошибок)
          const escapedPromptForHTML = escapeHTML(prompt)
          textMessage += `\n<pre>${escapedPromptForHTML}</pre>`

          // Добавляем остальную информацию
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

          logger.info('📝 [pulse] Попытка отправки текста с промптом (HTML)', {
            description: 'Attempting to send text message with prompt (HTML)',
            telegramId: rawTelegramId,
            textMessageLength: textMessage.length,
          })

          // ✅ TELEGRAM LIMIT: 4096 символов
          const TELEGRAM_MESSAGE_LIMIT = 4096

          try {
            // Если сообщение слишком длинное - разбиваем на части
            if (textMessage.length > TELEGRAM_MESSAGE_LIMIT) {
              logger.warn(
                '⚠️ [pulse] Сообщение слишком длинное, разбиваем на части',
                {
                  description: 'Message too long, splitting into chunks',
                  telegramId: rawTelegramId,
                  messageLength: textMessage.length,
                  limit: TELEGRAM_MESSAGE_LIMIT,
                }
              )

              // Отправляем первую часть (заголовок + начало промпта)
              const headerText =
                textMessage.substring(0, TELEGRAM_MESSAGE_LIMIT - 100) +
                '\n\n...(продолжение в следующем сообщении)'
              await pulseBot.telegram.sendMessage(chatId, headerText, {
                parse_mode: 'HTML',
                link_preview_options: { is_disabled: true },
              })

              // Отправляем продолжение промпта (без HTML форматирования)
              const remainingText =
                '...(продолжение):\n\n' +
                escapedPromptForHTML.substring(TELEGRAM_MESSAGE_LIMIT - 500)
              await pulseBot.telegram.sendMessage(chatId, remainingText, {
                link_preview_options: { is_disabled: true },
              })

              logger.info('✅ [pulse] Длинное сообщение отправлено частями', {
                description: 'Long message sent in chunks',
                telegramId: rawTelegramId,
              })
            } else {
              // Сообщение влезает целиком
              await pulseBot.telegram.sendMessage(chatId, textMessage, {
                parse_mode: 'HTML',
                link_preview_options: { is_disabled: true },
              })
              logger.info(
                '✅ [pulse] Текст с промптом успешно отправлен (HTML)',
                {
                  description:
                    'Text message with prompt sent successfully (HTML)',
                  telegramId: rawTelegramId,
                  parseMode: 'HTML',
                }
              )
            }
          } catch (textError) {
            const destinationDead = reportPulseFailure(
              'Ошибка при отправке ТЕКСТА с промптом (HTML)',
              chatId,
              textError,
              {
                telegramId: rawTelegramId,
                username: rawUsername,
                textMessageLength: textMessage.length,
                parseMode: 'HTML',
                promptLength: prompt?.length ?? 0,
              }
            )
            // The retry below exists for `can't parse entities` and for messages
            // that are too long. Neither is cured by dropping the formatting
            // when the chat itself is unreachable.
            if (destinationDead) return
            // ---> УПРОЩЕННЫЙ FALLBACK: Обрезаем промпт и отправляем без форматирования
            try {
              logger.warn(
                '⚠️ [pulse] Повторная попытка с обрезанным промптом',
                {
                  telegramId: rawTelegramId,
                }
              )

              // Обрезаем промпт до безопасного размера
              const truncatedPrompt =
                prompt.substring(0, 2000) + '...(обрезано)'
              const safeTextMessage = isRussian
                ? `@${username} Telegram ID: ${telegramId} сгенерировал изображение.\n\n📝 Промпт (обрезан):\n${truncatedPrompt}`
                : `@${username} Telegram ID: ${telegramId} generated an image.\n\n📝 Prompt (truncated):\n${truncatedPrompt}`

              await pulseBot.telegram.sendMessage(chatId, safeTextMessage, {
                link_preview_options: { is_disabled: true },
              })
              logger.info('✅ [pulse] Обрезанный текст успешно отправлен', {
                telegramId: rawTelegramId,
              })
            } catch (retryError) {
              reportPulseFailure(
                'Ошибка при повторной отправке ТЕКСТА (без форматирования)',
                chatId,
                retryError,
                { telegramId: rawTelegramId }
              )
            }
          }
        } else {
          // Если промпта нет, просто отправляем базовую информацию
          let textMessage = isRussian
            ? `@${username} Telegram ID: ${telegramId} сгенерировал изображение.`
            : `@${username} Telegram ID: ${telegramId} generated an image.`
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
          logger.info('📝 [pulse] Попытка отправки текста без промпта', {
            description: 'Attempting to send text message without prompt',
            telegramId: rawTelegramId,
            textMessageLength: textMessage.length,
          })
          try {
            await pulseBot.telegram.sendMessage(chatId, textMessage, {
              parse_mode: 'HTML',
              link_preview_options: { is_disabled: true },
            })
            logger.info('✅ [pulse] Текст без промпта успешно отправлен', {
              description: 'Text message without prompt sent successfully',
              telegramId: rawTelegramId,
            })
          } catch (textError) {
            reportPulseFailure(
              'Ошибка при отправке ТЕКСТА без промпта',
              chatId,
              textError,
              {
                telegramId: rawTelegramId,
                textMessageLength: textMessage.length,
                parseMode: 'HTML',
              }
            )
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

    logger.info('✅ Медиа успешно отправлено в pulse', {
      description: 'Media successfully sent to pulse channel',
      mediaType,
      telegramId: rawTelegramId,
    })
  } catch (error) {
    reportPulseFailure('Ошибка при отправке медиа в pulse', chatId, error, {
      telegramId: options.telegramId,
      username: options.username,
      serviceType: options.serviceType,
      mediaType: options.mediaType,
      stack: error instanceof Error ? error.stack : undefined,
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
