import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'

import { generateImageToPrompt } from '@/services/generateImageToPrompt'

import { createHelpCancelKeyboard } from '@/menu'

import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { getBotToken } from '@/handlers'

if (!process.env.HUGGINGFACE_TOKEN) {
  throw new Error('HUGGINGFACE_TOKEN is not set')
}

export const imageToPromptWizard = new Scenes.WizardScene<MyContext>(
  'image_to_prompt',
  async ctx => {
    console.log('CASE 0: image_to_prompt')
    const isRu = ctx.from?.language_code === 'ru'
    console.log('CASE: imageToPromptCommand')

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
    ctx.wizard.next()
    return
  },
  async ctx => {
    console.log('CASE 1: image_to_prompt')
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
      const botToken = getBotToken(ctx)
      const imageUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`
      if (ctx.from) {
        await generateImageToPrompt(
          imageUrl,
          ctx.from.id.toString(),
          ctx,
          isRu,
          ctx.botInfo?.username
        )
      }
      return ctx.scene.leave()
    }
  }
)

export default imageToPromptWizard
