import { MyContext } from '@/interfaces'

export const sendReplyWithKeyboard = async (
  ctx: MyContext,
  message: string,
  inlineKeyboard: any,
  menu: any,
  photo_url?: string
) => {
  if (photo_url) {
    // Если есть URL фото, отправляем фото с текстом
    await ctx.replyWithPhoto(photo_url, {
      caption: message,
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
      parse_mode: 'HTML',
      ...menu,
    })
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
