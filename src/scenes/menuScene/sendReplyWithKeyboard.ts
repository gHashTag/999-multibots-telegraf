import { MyContext } from '@/interfaces'
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'

export const sendReplyWithKeyboard = async (
  ctx: MyContext,
  message: string,
  inlineKeyboard: any,
  menu: any,
  photo_url?: string
) => {
  if (photo_url) {
    const photoSent = await sendPhotoWithFallback(ctx, photo_url, {
      caption: message,
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
      parse_mode: 'HTML',
      ...menu,
    })

    if (!photoSent) {
      // Если не удалось отправить фото даже с fallback, отправляем только текст
      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
        parse_mode: 'HTML',
        ...menu,
      })
    }
  } else {
    // Если фото нет, отправляем только текст
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
      parse_mode: 'HTML',
      ...menu,
    })
  }
  return ctx.wizard.next()
}
