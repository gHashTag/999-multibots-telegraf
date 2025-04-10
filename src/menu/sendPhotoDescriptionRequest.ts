import { MyContext } from '@/types'
import { createHelpCancelKeyboard } from './createHelpCancelKeyboard'

export const sendPhotoDescriptionRequest = async (
  ctx: MyContext,
  isRu: boolean,
  mode: string
): Promise<void> => {
  const type = mode === 'neuro_photo' ? 'нейрофотографию' : 'фотографию'
  const message = isRu
    ? `📸 Опишите на английском, какую ${type} вы хотите сгенерировать.`
    : `📸 Describe what kind of ${type} you want to generate in English.`

  await ctx.reply(message, {
    reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
  })
}
