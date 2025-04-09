import { isRussian } from '@/helpers'
import { MyContext } from '@/types'
import { Markup } from 'telegraf'
import type {
  InlineKeyboardMarkup,
  InlineKeyboardButton,
} from 'telegraf/typings/core/types/typegram'

interface SendReplyOptions {
  ctx: MyContext
  message: string
  inlineKeyboard:
    | Markup.Markup<InlineKeyboardMarkup>
    | InlineKeyboardButton[][]
    | InlineKeyboardButton[]
  menu?: any
  photo_url?: string
  post_url?: string
}

export const sendReplyWithKeyboard = async ({
  ctx,
  message,
  inlineKeyboard,
  menu = {},
  photo_url,
  post_url,
}: SendReplyOptions) => {
  try {
    // Преобразуем различные форматы клавиатуры в массив массивов
    let finalKeyboard: InlineKeyboardButton[][]

    if (Array.isArray(inlineKeyboard)) {
      // Проверяем, это массив кнопок или массив массивов кнопок
      if (inlineKeyboard.length === 0) {
        finalKeyboard = []
      } else if (Array.isArray(inlineKeyboard[0])) {
        // Это уже массив массивов кнопок
        finalKeyboard = inlineKeyboard as InlineKeyboardButton[][]
      } else {
        // Это массив кнопок, обернем его в массив
        finalKeyboard = [inlineKeyboard as InlineKeyboardButton[]]
      }
    } else if (
      inlineKeyboard &&
      typeof inlineKeyboard === 'object' &&
      'reply_markup' in inlineKeyboard
    ) {
      // Это объект Markup, получаем inline_keyboard
      finalKeyboard = inlineKeyboard.reply_markup.inline_keyboard
    } else {
      finalKeyboard = []
    }

    // Если есть URL поста, добавляем кнопку
    if (post_url) {
      const isRu = isRussian(ctx)
      finalKeyboard.push([
        {
          text: isRu ? '🎬 Посмотреть видео-инструкцию' : '🎬 Watch tutorial',
          url: post_url,
        },
      ])
    }

    console.log('🛠️ Final keyboard structure:', JSON.stringify(finalKeyboard))

    if (photo_url) {
      await ctx.replyWithPhoto(photo_url, {
        caption: message,
        reply_markup: { inline_keyboard: finalKeyboard },
        parse_mode: 'HTML',
        ...menu,
      })
    } else {
      await ctx.reply(message, {
        reply_markup: { inline_keyboard: finalKeyboard },
        parse_mode: 'HTML',
        ...menu,
      })
    }

    console.log('✅ Сообщение успешно отправлено', {
      hasPhoto: !!photo_url,
      hasPostButton: !!post_url,
    })

    return ctx.wizard.next()
  } catch (error) {
    console.error('🔴 Ошибка при отправке сообщения:', error)
    await ctx.reply(
      isRussian(ctx)
        ? '❌ Произошла ошибка. Пожалуйста, попробуйте позже.'
        : '❌ An error occurred. Please try again later.'
    )
    throw error
  }
}
