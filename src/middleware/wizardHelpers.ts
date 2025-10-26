/**
 * Wizard Helpers - общие middleware и утилиты для визардов
 *
 * Устраняет дублирование логики из 42 файлов сцен:
 * - Проверка isRu (217 раз)
 * - Валидация ctx.from?.id (20+ раз)
 * - Валидация сообщений (4+ раза)
 *
 * Цель: устранить ~500+ строк дублированного кода в сценах
 */

import { MyContext } from '@/interfaces'
import { ErrorMessageService } from '@/helpers/error/ErrorMessageService'
import { logger } from '@/utils/enhancedLogger'

/**
 * Проверяет язык пользователя из состояния
 * Дублируется 217 раз в 63 файлах!
 */
export function isRussianFromState(ctx: MyContext): boolean {
  return ctx.session?.language === 'ru' || ctx.from?.language_code === 'ru'
}

/**
 * Middleware: Проверка наличия пользователя (ctx.from?.id)
 * Используется практически во всех визардах
 */
export async function validateUser(
  ctx: MyContext,
  next: () => Promise<void>
): Promise<void> {
  if (!ctx.from?.id) {
    const isRu = isRussianFromState(ctx)
    logger.warn('⚠️ User validation failed: no ctx.from?.id', {
      chatId: ctx.chat?.id,
    })
    await ErrorMessageService.sendGenericError(
      ctx,
      isRu,
      new Error('User ID not found')
    )
    await ctx.scene.leave()
    return
  }

  await next()
}

/**
 * Middleware: Проверка наличия текстового сообщения
 * Используется в визардах для обработки текстового ввода
 */
export async function validateTextMessage(
  ctx: MyContext,
  next: () => Promise<void>
): Promise<void> {
  const message = ctx.message

  if (!message || !('text' in message)) {
    const isRu = isRussianFromState(ctx)
    logger.warn('⚠️ Text message validation failed', {
      userId: ctx.from?.id,
      hasMessage: !!message,
    })
    await ErrorMessageService.sendValidationError(
      ctx,
      isRu,
      isRu
        ? 'Пожалуйста, отправьте текстовое сообщение'
        : 'Please send a text message'
    )
    return
  }

  await next()
}

/**
 * Middleware: Проверка наличия фото в сообщении
 * Используется в визардах для обработки изображений
 */
export async function validatePhotoMessage(
  ctx: MyContext,
  next: () => Promise<void>
): Promise<void> {
  const message = ctx.message

  if (!message || !('photo' in message) || !message.photo) {
    const isRu = isRussianFromState(ctx)
    logger.warn('⚠️ Photo message validation failed', {
      userId: ctx.from?.id,
      hasMessage: !!message,
    })
    await ErrorMessageService.sendValidationError(
      ctx,
      isRu,
      isRu
        ? 'Пожалуйста, отправьте изображение'
        : 'Please send an image'
    )
    return
  }

  await next()
}

/**
 * Middleware: Проверка наличия видео в сообщении
 */
export async function validateVideoMessage(
  ctx: MyContext,
  next: () => Promise<void>
): Promise<void> {
  const message = ctx.message

  if (!message || !('video' in message) || !message.video) {
    const isRu = isRussianFromState(ctx)
    logger.warn('⚠️ Video message validation failed', {
      userId: ctx.from?.id,
      hasMessage: !!message,
    })
    await ErrorMessageService.sendValidationError(
      ctx,
      isRu,
      isRu ? 'Пожалуйста, отправьте видео' : 'Please send a video'
    )
    return
  }

  await next()
}

/**
 * Middleware: Комбинированная проверка пользователя и текстового сообщения
 * Самый распространенный случай в визардах
 */
export async function validateUserAndText(
  ctx: MyContext,
  next: () => Promise<void>
): Promise<void> {
  // Сначала проверяем пользователя
  if (!ctx.from?.id) {
    const isRu = isRussianFromState(ctx)
    logger.warn('⚠️ User validation failed in validateUserAndText', {
      chatId: ctx.chat?.id,
    })
    await ErrorMessageService.sendGenericError(
      ctx,
      isRu,
      new Error('User ID not found')
    )
    await ctx.scene.leave()
    return
  }

  // Затем проверяем текст
  const message = ctx.message
  if (!message || !('text' in message)) {
    const isRu = isRussianFromState(ctx)
    logger.warn('⚠️ Text validation failed in validateUserAndText', {
      userId: ctx.from?.id,
    })
    await ErrorMessageService.sendValidationError(
      ctx,
      isRu,
      isRu
        ? 'Пожалуйста, отправьте текстовое сообщение'
        : 'Please send a text message'
    )
    return
  }

  await next()
}

/**
 * Извлекает текст из сообщения
 * Безопасная утилита с проверкой типов
 */
export function getMessageText(ctx: MyContext): string | null {
  const message = ctx.message
  if (!message || !('text' in message)) {
    return null
  }
  return message.text
}

/**
 * Извлекает caption из сообщения (для фото/видео)
 */
export function getMessageCaption(ctx: MyContext): string | null {
  const message = ctx.message
  if (!message || !('caption' in message)) {
    return null
  }
  return message.caption || null
}

/**
 * Получает file_id самого большого фото
 */
export function getLargestPhotoFileId(ctx: MyContext): string | null {
  const message = ctx.message
  if (!message || !('photo' in message) || !message.photo) {
    return null
  }

  const photos = message.photo
  if (photos.length === 0) {
    return null
  }

  // Берем последнее фото (самое большое)
  return photos[photos.length - 1].file_id
}

/**
 * Получает file_id видео
 */
export function getVideoFileId(ctx: MyContext): string | null {
  const message = ctx.message
  if (!message || !('video' in message) || !message.video) {
    return null
  }

  return message.video.file_id
}

/**
 * Базовый обработчик ошибок для визардов
 * Централизует обработку ошибок
 */
export async function handleWizardError(
  ctx: MyContext,
  error: Error,
  sceneName?: string
): Promise<void> {
  const isRu = isRussianFromState(ctx)

  logger.error('❌ Wizard error occurred:', {
    sceneName,
    userId: ctx.from?.id,
    chatId: ctx.chat?.id,
    error: error.message,
    stack: error.stack,
  })

  await ErrorMessageService.sendGenericError(ctx, isRu, error)
  await ctx.scene.leave()
}

/**
 * Создает стандартный enter handler для визарда
 * Устраняет дублирование кода входа в сцены
 */
export function createWizardEnterHandler(
  welcomeMessageRu: string,
  welcomeMessageEn: string
) {
  return async (ctx: MyContext) => {
    try {
      const isRu = isRussianFromState(ctx)
      const message = isRu ? welcomeMessageRu : welcomeMessageEn

      await ctx.reply(message)
    } catch (error) {
      await handleWizardError(
        ctx,
        error instanceof Error ? error : new Error('Unknown error'),
        'wizardEnter'
      )
    }
  }
}
