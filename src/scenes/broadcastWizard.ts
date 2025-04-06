import { Scenes, Markup } from 'telegraf'

import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { broadcastService, BroadcastResult } from '@/services/broadcast.service'

// Типы контента для рассылки
export enum BroadcastContentType {
  PHOTO = 'photo',
  VIDEO = 'video',
  TEXT = 'text',
  POST_LINK = 'post_link',
}

// Этапы ввода текста
enum TextInputStep {
  RUSSIAN = 'russian',
  ENGLISH = 'english',
  COMPLETED = 'completed',
}

// Создаем клавиатуру для отмены
function createCancelKeyboard(isRu: boolean) {
  return Markup.keyboard([[isRu ? '❌ Отмена' : '❌ Cancel']]).resize()
}

// Создаем клавиатуру для выбора типа контента
function createContentTypeKeyboard(isRu: boolean) {
  return Markup.keyboard([
    [isRu ? '📷 Фото с текстом' : '📷 Photo with text'],
    [isRu ? '🎥 Видео с текстом' : '🎥 Video with text'],
    [isRu ? '📝 Только текст' : '📝 Text only'],
    [isRu ? '🔗 Ссылка на пост' : '🔗 Post link'],
    [isRu ? '❌ Отмена' : '❌ Cancel'],
  ]).resize()
}

// Создаем клавиатуру для подтверждения рассылки
function createConfirmKeyboard(isRu: boolean) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isRu ? '✅ Отправить' : '✅ Send',
        'broadcast_confirm'
      ),
      Markup.button.callback(
        isRu ? '❌ Отмена' : '❌ Cancel',
        'broadcast_cancel'
      ),
    ],
  ])
}

// Создаем клавиатуру для выбора добавления текста к посту
function createAddTextKeyboard(isRu: boolean) {
  return Markup.keyboard([
    [isRu ? '✅ Да, добавить текст' : '✅ Yes, add text'],
    [isRu ? '❌ Нет, без текста' : '❌ No, without text'],
    [isRu ? '❌ Отмена' : '❌ Cancel'],
  ]).resize()
}

// Создаем обработчик для кнопки отмены
function isCancelMessage(text: string, isRu: boolean): boolean {
  const cancelText = isRu ? '❌ Отмена' : '❌ Cancel'
  return text === cancelText
}

// Проверяем кнопку "Нет, без текста"
function isNoTextMessage(text: string, isRu: boolean): boolean {
  const noText = isRu ? '❌ Нет, без текста' : '❌ No, without text'
  return text === noText
}

// Проверяем кнопку "Да, добавить текст"
function isYesTextMessage(text: string, isRu: boolean): boolean {
  const yesText = isRu ? '✅ Да, добавить текст' : '✅ Yes, add text'
  return text === yesText
}

// Определяем тип контента по сообщению
function getContentTypeFromMessage(
  text: string,
  isRu: boolean
): BroadcastContentType | null {
  if (text === (isRu ? '📷 Фото с текстом' : '📷 Photo with text')) {
    return BroadcastContentType.PHOTO
  } else if (text === (isRu ? '🎥 Видео с текстом' : '🎥 Video with text')) {
    return BroadcastContentType.VIDEO
  } else if (text === (isRu ? '📝 Только текст' : '📝 Text only')) {
    return BroadcastContentType.TEXT
  } else if (text === (isRu ? '🔗 Ссылка на пост' : '🔗 Post link')) {
    return BroadcastContentType.POST_LINK
  }
  return null
}

// Функция для отправки текстовой рассылки
async function sendTextBroadcast(
  ctx: MyContext,
  text: string,
  ownerTelegramId?: string
): Promise<BroadcastResult> {
  const botToken = process.env.BOT_TOKEN || ''
  return broadcastService.sendBroadcastWithImage(
    botToken,
    text,
    '',
    ownerTelegramId
  )
}

// Функция для отправки рассылки с изображением
async function sendImageBroadcast(
  ctx: MyContext,
  text: string,
  imageUrl: string,
  ownerTelegramId?: string
): Promise<BroadcastResult> {
  const botToken = process.env.BOT_TOKEN || ''
  return broadcastService.sendBroadcastWithImage(
    botToken,
    text,
    imageUrl,
    ownerTelegramId
  )
}

// Функция для отправки рассылки с видео
async function sendVideoBroadcast(
  ctx: MyContext,
  text: string,
  videoUrl: string,
  ownerTelegramId?: string
): Promise<BroadcastResult> {
  const botToken = process.env.BOT_TOKEN || ''
  return broadcastService.sendBroadcastWithVideo(
    botToken,
    text,
    videoUrl,
    ownerTelegramId
  )
}

// Функция для отправки рассылки со ссылкой на пост
async function sendPostLinkBroadcast(
  ctx: MyContext,
  text: string,
  postLink: string,
  ownerTelegramId?: string
): Promise<BroadcastResult> {
  const botToken = process.env.BOT_TOKEN || ''
  return broadcastService.sendBroadcastWithImage(
    botToken,
    text,
    '',
    ownerTelegramId
  )
}

export const broadcastWizard = new Scenes.WizardScene<MyContext>(
  'broadcast_wizard',

  // Шаг 1: Выбор типа контента
  async ctx => {
    logger.info('CASE 0: broadcast_wizard - Выбор типа контента', {
      description: 'Broadcast wizard started - content type selection',
      userId: ctx.from?.id,
    })

    const isRu = ctx.from?.language_code === 'ru'

    // Сохраняем ID владельца бота
    if (ctx.from) {
      ctx.scene.session.ownerTelegramId = ctx.from.id.toString()
    }

    // Инициализируем состояние текста
    ctx.scene.session.textInputStep = TextInputStep.RUSSIAN
    ctx.scene.session.textRu = ''
    ctx.scene.session.textEn = ''

    // Предлагаем выбрать тип контента
    await ctx.reply(
      isRu
        ? 'Выберите тип контента для рассылки 📨'
        : 'Choose content type for broadcast 📨',
      { reply_markup: createContentTypeKeyboard(isRu).reply_markup }
    )

    ctx.wizard.next()
  },

  // Шаг 2: Обработка выбора типа контента
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'

    // Проверяем наличие текстового сообщения
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите тип контента, используя кнопки ниже 👇'
          : 'Please select content type using buttons below 👇'
      )
      return
    }

    // Обрабатываем отмену
    if (isCancelMessage(ctx.message.text, isRu)) {
      await ctx.reply(
        isRu ? 'Рассылка отменена ❌' : 'Broadcast cancelled ❌',
        { reply_markup: Markup.removeKeyboard().reply_markup }
      )
      return ctx.scene.leave()
    }

    // Определяем тип контента
    const contentType = getContentTypeFromMessage(ctx.message.text, isRu)
    if (!contentType) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, используйте кнопки для выбора типа контента 👇'
          : 'Please use the buttons to select content type 👇'
      )
      return
    }

    // Сохраняем тип контента в сессии
    ctx.scene.session.contentType = contentType

    logger.info('Выбран тип контента для рассылки', {
      description: 'Content type selected',
      contentType: contentType,
      userId: ctx.from?.id,
    })

    // В зависимости от типа контента запрашиваем разный контент
    switch (contentType) {
      case BroadcastContentType.PHOTO:
        await ctx.reply(
          isRu
            ? 'Пожалуйста, отправьте изображение для рассылки 🖼️'
            : 'Please send an image for broadcast 🖼️',
          { reply_markup: createCancelKeyboard(isRu).reply_markup }
        )
        break

      case BroadcastContentType.VIDEO:
        await ctx.reply(
          isRu
            ? 'Пожалуйста, отправьте видео для рассылки 🎬\nМаксимальный размер: 50MB'
            : 'Please send a video for broadcast 🎬\nMaximum size: 50MB',
          { reply_markup: createCancelKeyboard(isRu).reply_markup }
        )
        break

      case BroadcastContentType.TEXT:
        await ctx.reply(
          isRu
            ? 'Пожалуйста, введите текст на РУССКОМ языке ��🇺'
            : 'Please enter text in RUSSIAN 🇷🇺',
          { reply_markup: createCancelKeyboard(isRu).reply_markup }
        )
        break

      case BroadcastContentType.POST_LINK:
        await ctx.reply(
          isRu
            ? 'Пожалуйста, отправьте ссылку на пост в Telegram 🔗\nФормат: https://t.me/channel_name/message_id'
            : 'Please send a link to Telegram post 🔗\nFormat: https://t.me/channel_name/message_id',
          { reply_markup: createCancelKeyboard(isRu).reply_markup }
        )
        break
    }

    ctx.wizard.next()
  },

  // Шаг 3: Обработка контента и запрос текста
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    const contentType = ctx.scene.session.contentType

    // Обработка отмены
    if (
      ctx.message &&
      'text' in ctx.message &&
      isCancelMessage(ctx.message.text, isRu)
    ) {
      await ctx.reply(
        isRu ? 'Рассылка отменена ❌' : 'Broadcast cancelled ❌',
        { reply_markup: Markup.removeKeyboard().reply_markup }
      )
      return ctx.scene.leave()
    }

    // Обработка разных типов контента
    switch (contentType) {
      case BroadcastContentType.PHOTO:
        if (!ctx.message || !('photo' in ctx.message)) {
          await ctx.reply(
            isRu
              ? 'Пожалуйста, отправьте изображение 🖼️'
              : 'Please send an image 🖼️'
          )
          return
        }
        // Сохраняем fileId фото
        ctx.scene.session.photoFileId =
          ctx.message.photo[ctx.message.photo.length - 1].file_id
        // Запрашиваем текст на русском
        await ctx.reply(
          isRu
            ? 'Теперь введите текст на РУССКОМ языке 🇷🇺'
            : 'Now enter text in RUSSIAN 🇷🇺',
          { reply_markup: createCancelKeyboard(isRu).reply_markup }
        )
        break

      case BroadcastContentType.VIDEO:
        if (!ctx.message || !('video' in ctx.message)) {
          await ctx.reply(
            isRu ? 'Пожалуйста, отправьте видео 🎬' : 'Please send a video 🎬'
          )
          return
        }
        // Сохраняем fileId видео
        ctx.scene.session.videoFileId = ctx.message.video.file_id
        // Запрашиваем текст на русском
        await ctx.reply(
          isRu
            ? 'Теперь введите текст на РУССКОМ языке 🇷🇺'
            : 'Now enter text in RUSSIAN 🇷🇺',
          { reply_markup: createCancelKeyboard(isRu).reply_markup }
        )
        break

      case BroadcastContentType.TEXT:
        if (!ctx.message || !('text' in ctx.message)) {
          await ctx.reply(
            isRu ? 'Пожалуйста, введите текст 📝' : 'Please enter text 📝'
          )
          return
        }
        // Сохраняем русский текст
        ctx.scene.session.textRu = ctx.message.text
        // Запрашиваем английский текст
        await ctx.reply(
          isRu
            ? 'Теперь введите текст на АНГЛИЙСКОМ языке 🇬🇧'
            : 'Now enter text in ENGLISH 🇬🇧',
          { reply_markup: createCancelKeyboard(isRu).reply_markup }
        )
        ctx.scene.session.textInputStep = TextInputStep.ENGLISH
        return

      case BroadcastContentType.POST_LINK:
        if (!ctx.message || !('text' in ctx.message)) {
          await ctx.reply(
            isRu
              ? 'Пожалуйста, отправьте ссылку на пост 🔗'
              : 'Please send a post link 🔗'
          )
          return
        }
        // Сохраняем ссылку на пост
        ctx.scene.session.postLink = ctx.message.text
        // Запрашиваем текст на русском
        await ctx.reply(
          isRu
            ? 'Хотите добавить текст к посту?'
            : 'Do you want to add text to the post?',
          { reply_markup: createAddTextKeyboard(isRu).reply_markup }
        )
        break
    }

    ctx.wizard.next()
  },

  // Шаг 4: Обработка текста и подтверждение
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    const contentType = ctx.scene.session.contentType

    // Обработка отмены
    if (
      ctx.message &&
      'text' in ctx.message &&
      isCancelMessage(ctx.message.text, isRu)
    ) {
      await ctx.reply(
        isRu ? 'Рассылка отменена ❌' : 'Broadcast cancelled ❌',
        { reply_markup: Markup.removeKeyboard().reply_markup }
      )
      return ctx.scene.leave()
    }

    // Если это пост и пользователь не хочет добавлять текст
    if (
      contentType === BroadcastContentType.POST_LINK &&
      ctx.message &&
      'text' in ctx.message &&
      isNoTextMessage(ctx.message.text, isRu)
    ) {
      // Переходим к подтверждению
      await showConfirmation(ctx)
      return
    }

    // Если это пост и пользователь хочет добавить текст
    if (
      contentType === BroadcastContentType.POST_LINK &&
      ctx.message &&
      'text' in ctx.message &&
      isYesTextMessage(ctx.message.text, isRu)
    ) {
      await ctx.reply(
        isRu ? 'Введите текст на РУССКОМ языке 🇷🇺' : 'Enter text in RUSSIAN 🇷🇺',
        { reply_markup: createCancelKeyboard(isRu).reply_markup }
      )
      ctx.scene.session.textInputStep = TextInputStep.RUSSIAN
      return
    }

    // Обработка ввода текста
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply(
        isRu ? 'Пожалуйста, введите текст 📝' : 'Please enter text 📝'
      )
      return
    }

    // В зависимости от этапа ввода текста
    switch (ctx.scene.session.textInputStep) {
      case TextInputStep.RUSSIAN:
        // Сохраняем русский текст
        ctx.scene.session.textRu = ctx.message.text
        // Запрашиваем английский текст
        await ctx.reply(
          isRu
            ? 'Теперь введите текст на АНГЛИЙСКОМ языке 🇬🇧'
            : 'Now enter text in ENGLISH 🇬🇧',
          { reply_markup: createCancelKeyboard(isRu).reply_markup }
        )
        ctx.scene.session.textInputStep = TextInputStep.ENGLISH
        return

      case TextInputStep.ENGLISH:
        // Сохраняем английский текст
        ctx.scene.session.textEn = ctx.message.text
        ctx.scene.session.textInputStep = TextInputStep.COMPLETED
        // Показываем подтверждение
        await showConfirmation(ctx)
        break
    }
  },

  // Шаг 5: Финальное подтверждение и отправка
  async ctx => {
    // Обрабатываем только callback queries
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      return
    }

    const isRu = ctx.from?.language_code === 'ru'
    const action = ctx.callbackQuery.data

    if (action === 'broadcast_cancel') {
      await ctx.reply(
        isRu ? 'Рассылка отменена ❌' : 'Broadcast cancelled ❌',
        { reply_markup: Markup.removeKeyboard().reply_markup }
      )
      return ctx.scene.leave()
    }

    if (action === 'broadcast_confirm') {
      const botName = ctx.botInfo?.username || ''
      const ownerTelegramId = ctx.scene.session.ownerTelegramId || ''
      const textRu = ctx.scene.session.textRu || ''

      if (!botName) {
        await ctx.reply(
          isRu
            ? 'Ошибка: не удалось определить имя бота ❌'
            : 'Error: could not determine bot name ❌',
          { reply_markup: Markup.removeKeyboard().reply_markup }
        )
        return ctx.scene.leave()
      }

      try {
        let result: BroadcastResult
        switch (ctx.scene.session.contentType) {
          case BroadcastContentType.PHOTO:
            result = await sendImageBroadcast(
              ctx,
              textRu,
              ctx.scene.session.photoFileId || '',
              ownerTelegramId
            )
            break

          case BroadcastContentType.VIDEO:
            result = await sendVideoBroadcast(
              ctx,
              textRu,
              ctx.scene.session.videoFileId || '',
              ownerTelegramId
            )
            break

          case BroadcastContentType.TEXT:
            result = await sendTextBroadcast(ctx, textRu, ownerTelegramId)
            break

          case BroadcastContentType.POST_LINK:
            result = await sendPostLinkBroadcast(
              ctx,
              textRu,
              ctx.scene.session.postLink || '',
              ownerTelegramId
            )
            break

          default:
            throw new Error('Неизвестный тип контента')
        }

        if (result.success) {
          await ctx.reply(
            isRu
              ? `✅ Рассылка успешно отправлена!\nУспешно: ${result.successCount}\nОшибок: ${result.errorCount}`
              : `✅ Broadcast sent successfully!\nSuccess: ${result.successCount}\nErrors: ${result.errorCount}`,
            { reply_markup: Markup.removeKeyboard().reply_markup }
          )
        } else {
          await ctx.reply(
            isRu
              ? `❌ Ошибка при отправке рассылки: ${
                  result.reason || 'Неизвестная ошибка'
                }`
              : `❌ Error sending broadcast: ${
                  result.reason || 'Unknown error'
                }`,
            { reply_markup: Markup.removeKeyboard().reply_markup }
          )
        }
      } catch (error) {
        logger.error('Ошибка при отправке рассылки:', {
          description: 'Error sending broadcast',
          error: (error as Error).message || 'Unknown error',
          userId: ctx.from?.id,
        })

        await ctx.reply(
          isRu
            ? `❌ Произошла ошибка при отправке рассылки: ${
                (error as Error).message || 'неизвестная ошибка'
              }`
            : `❌ An error occurred while sending broadcast: ${
                (error as Error).message || 'unknown error'
              }`,
          { reply_markup: Markup.removeKeyboard().reply_markup }
        )
      }

      return ctx.scene.leave()
    }
  }
)

// Вспомогательная функция для показа подтверждения
async function showConfirmation(ctx: MyContext) {
  const isRu = ctx.from?.language_code === 'ru'
  const contentType = ctx.scene.session.contentType
  const textRu = ctx.scene.session.textRu || ''
  const textEn = ctx.scene.session.textEn || ''

  let previewMessage = isRu
    ? '📢 Предварительный просмотр рассылки:\n\n'
    : '📢 Broadcast preview:\n\n'

  previewMessage += isRu ? '🇷🇺 Русский текст:\n' : '🇷🇺 Russian text:\n'
  previewMessage += textRu + '\n\n'

  previewMessage += isRu ? '🇬🇧 Английский текст:\n' : '🇬🇧 English text:\n'
  previewMessage += textEn + '\n\n'

  if (contentType === BroadcastContentType.POST_LINK) {
    previewMessage += isRu
      ? `🔗 Ссылка на пост: ${ctx.scene.session.postLink}`
      : `🔗 Post link: ${ctx.scene.session.postLink}`
  }

  await ctx.reply(previewMessage, {
    reply_markup: createConfirmKeyboard(isRu).reply_markup,
  })

  ctx.wizard.next()
}

export default broadcastWizard
