import { MyContext } from '@/interfaces'
import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram'

export const sendReplyWithKeyboard = async (
  ctx: MyContext,
  message: string,
  inlineKeyboard: any[][],
  menu: ReplyKeyboardMarkup,
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
    })
    
    // Send the reply keyboard separately after sending the photo
    await ctx.reply('👇', {
      reply_markup: menu,
    })
  } else {
    // Если фото нет, отправляем только текст
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
      parse_mode: 'HTML',
    })
    
    // Send the reply keyboard separately after sending the inline keyboard
    await ctx.reply('👇', {
      reply_markup: menu,
    })
  }
  return ctx.wizard.next()
}
