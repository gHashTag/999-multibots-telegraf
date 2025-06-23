import { MyContext } from '@/interfaces'

export const sendReplyWithKeyboard = async (
  ctx: MyContext,
  message: string,
  inlineKeyboard: any,
  menu: any,
  photo_url?: string
) => {
  if (photo_url) {
    try {
      // Если есть URL фото, отправляем фото с текстом
      await ctx.replyWithPhoto(photo_url, {
        caption: message,
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
        parse_mode: 'HTML',
        ...menu,
      })
    } catch (photoError) {
      // Если не удалось отправить фото, отправляем только текст
      console.warn(
        `[sendReplyWithKeyboard] Failed to send photo: ${photo_url}. Error: ${photoError instanceof Error ? photoError.message : 'Unknown error'}. Sending text only.`
      )

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
