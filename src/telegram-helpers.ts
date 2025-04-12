/**
 * Утилиты для корректного форматирования сообщений в Telegram
 * Решают проблему отображения \n как текста вместо реальных переносов строк
 * Также содержат функции для безопасного форматирования HTML в сообщениях
 */

import { Context } from 'telegraf'
import { logger } from './utils/logger'

/**
 * Отправляет сообщение с HTML форматированием в Telegram
 * Правильно обрабатывает переносы строк и другие специальные символы
 *
 * @param ctx - Контекст Telegram
 * @param message - Сообщение для отправки (с HTML-тегами)
 * @param extra - Дополнительные параметры для отправки
 * @returns Promise с результатом отправки
 */
export const sendFormattedMessage = async (
  ctx: Context,
  message: string,
  extra: any = {}
): Promise<any> => {
  try {
    // Объединяем пользовательские параметры с обязательным параметром для HTML
    const options = {
      ...extra,
      parse_mode: 'HTML',
    }

    // Отправляем сообщение
    const result = await ctx.reply(message, options)

    return result
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при отправке форматированного сообщения',
      description: 'Error sending formatted message',
      error: (error as Error).message,
      stack: (error as Error).stack,
    })

    // В случае ошибки отправляем обычный текст без форматирования
    return ctx.reply(stripHtmlTags(message), {
      ...extra,
      parse_mode: undefined,
    })
  }
}

/**
 * Преобразует Markdown в HTML
 *
 * @param text - Текст в формате Markdown
 * @returns Текст в формате HTML
 */
export const markdownToHtml = (text: string): string => {
  if (!text) return ''

  return (
    text
      // Заголовки
      .replace(/^##\s+(.+)$/gm, '<b>$1</b>')
      // Жирный текст
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      // Курсив
      .replace(/\*(.*?)\*/g, '<i>$1</i>')
      // Код
      .replace(/`(.*?)`/g, '<code>$1</code>')
      // Зачеркнутый текст
      .replace(/~~(.*?)~~/g, '<s>$1</s>')
  )
}

/**
 * Удаляет HTML-теги из текста
 *
 * @param html - Текст с HTML-тегами
 * @returns Чистый текст без тегов
 */
export const stripHtmlTags = (html: string): string => {
  if (!html) return ''

  return html
    .replace(/<\/?b>/g, '')
    .replace(/<\/?i>/g, '')
    .replace(/<\/?code>/g, '')
    .replace(/<\/?pre>/g, '')
    .replace(/<\/?s>/g, '')
    .replace(/<a href="[^"]*">/g, '')
    .replace(/<\/a>/g, '')
}

/**
 * Экранирует специальные символы для HTML
 *
 * @param text - Исходный текст
 * @returns Текст с экранированными символами
 */
export const escapeHtml = (text: string): string => {
  if (!text) return ''

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Безопасно форматирует текст для отправки в Telegram
 * Автоматически определяет, как лучше отформатировать сообщение
 *
 * @param ctx - Контекст Telegram
 * @param text - Текст сообщения (может быть с Markdown)
 * @param extra - Дополнительные параметры
 * @returns Promise с результатом отправки
 */
export const sendSafeFormattedMessage = async (
  ctx: Context,
  text: string,
  extra: any = {}
): Promise<any> => {
  try {
    // Сначала пробуем отправить как HTML
    return await sendFormattedMessage(ctx, markdownToHtml(text), extra)
  } catch (error) {
    logger.warn({
      message:
        '⚠️ Не удалось отправить HTML-сообщение, пробуем без форматирования',
      description: 'Failed to send HTML message, trying without formatting',
      error: (error as Error).message,
    })

    // Если не получилось отправить с HTML, отправляем как простой текст
    return ctx.reply(stripHtmlTags(text), { ...extra, parse_mode: undefined })
  }
}

/**
 * Отправляет фото с правильно отформатированной подписью
 *
 * @param ctx - Контекст Telegram
 * @param source - Источник фото (URL, путь к файлу, Buffer)
 * @param caption - Подпись к фото (может содержать HTML-теги)
 * @param extra - Дополнительные параметры
 * @returns Promise с результатом отправки
 */
export const sendFormattedPhoto = async (
  ctx: Context,
  source: string | Buffer,
  caption?: string,
  extra: any = {}
): Promise<any> => {
  try {
    const options = {
      ...extra,
      caption: caption || '',
      parse_mode: 'HTML',
    }

    return await ctx.replyWithPhoto(source, options)
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при отправке фото с форматированной подписью',
      description: 'Error sending photo with formatted caption',
      error: (error as Error).message,
      stack: (error as Error).stack,
    })

    // В случае ошибки пробуем отправить без форматирования
    return ctx.replyWithPhoto(source, {
      ...extra,
      caption: caption ? stripHtmlTags(caption) : '',
      parse_mode: undefined,
    })
  }
}

/**
 * Отправляет видео с правильно отформатированной подписью
 *
 * @param ctx - Контекст Telegram
 * @param source - Источник видео (URL, путь к файлу, Buffer)
 * @param caption - Подпись к видео (может содержать HTML-теги)
 * @param extra - Дополнительные параметры
 * @returns Promise с результатом отправки
 */
export const sendFormattedVideo = async (
  ctx: Context,
  source: string | Buffer,
  caption?: string,
  extra: any = {}
): Promise<any> => {
  try {
    const options = {
      ...extra,
      caption: caption || '',
      parse_mode: 'HTML',
    }

    return await ctx.replyWithVideo(source, options)
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при отправке видео с форматированной подписью',
      description: 'Error sending video with formatted caption',
      error: (error as Error).message,
    })

    // В случае ошибки пробуем отправить без форматирования
    return ctx.replyWithVideo(source, {
      ...extra,
      caption: caption ? stripHtmlTags(caption) : '',
      parse_mode: undefined,
    })
  }
}
