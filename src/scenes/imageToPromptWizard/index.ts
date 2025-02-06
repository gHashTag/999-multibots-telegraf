import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { imageToPromptCost, sendBalanceMessage } from '@/price/helpers'
import { generateImageToPrompt } from '@/services/generateImageToPrompt'
import { BOT_TOKEN } from '@/core/bot'

import { createHelpCancelKeyboard } from '@/menu'
import { getUserBalance } from '@/core/supabase'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'

if (!process.env.HUGGINGFACE_TOKEN) {
  throw new Error('HUGGINGFACE_TOKEN is not set')
}

export const imageToPromptWizard = new Scenes.WizardScene<MyContext>(
  'imageToPromptWizard',
  async ctx => {
    console.log('CASE 0: imageToPromptWizard')
    const isRu = ctx.from?.language_code === 'ru'
    console.log('CASE: imageToPromptCommand', ctx)
    if (!ctx.from?.id) {
      await ctx.reply('User ID not found')
      return ctx.scene.leave()
    }

    const userId = ctx.from.id
    console.log('userId', userId)
    const currentBalance = await getUserBalance(userId)
    console.log('currentBalance', currentBalance)
    await sendBalanceMessage(userId, currentBalance, imageToPromptCost, isRu)
    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }
    await ctx.reply(
      isRu
        ? 'Пожалуйста, отправьте изображение для генерации промпта'
        : 'Please send an image to generate a prompt',
      {
        reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
      }
    )
    return ctx.wizard.next()
  },
  async ctx => {
    console.log('CASE 1: imageToPromptWizard')
    const isRu = ctx.from?.language_code === 'ru'
    console.log('Waiting for photo message...')
    const imageMsg = ctx.message

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    } else {
      if (!imageMsg || !('photo' in imageMsg) || !imageMsg.photo) {
        console.log('No photo in message')
        console.log('No photo in message')
        await ctx.reply(
          isRu ? 'Пожалуйста, отправьте изображение' : 'Please send an image'
        )
        return ctx.scene.leave()
      }

      const photoSize = imageMsg.photo[imageMsg.photo.length - 1]
      console.log('Getting file info for photo:', photoSize.file_id)
      const file = await ctx.telegram.getFile(photoSize.file_id)
      ctx.session.mode = 'image_to_prompt'
      const imageUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`
      if (ctx.from) {
        await generateImageToPrompt(imageUrl, ctx.from.id, ctx, isRu)
      }
      return ctx.scene.leave()
    }
  }
)

export default imageToPromptWizard
