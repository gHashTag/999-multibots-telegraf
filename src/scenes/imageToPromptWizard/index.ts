import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'

import { generateImageToPrompt } from '@/services/generateImageToPrompt'

import { createHelpCancelKeyboard } from '@/navigation'

import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { getBotToken } from '@/handlers'
import { ModeEnum } from '@/interfaces/modes'
import { getBotNameByToken } from '@/core/bot'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
// Используем заглушку для HUGGINGFACE_TOKEN
process.env.HUGGINGFACE_TOKEN = process.env.HUGGINGFACE_TOKEN || 'dummy-token'

export const imageToPromptWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImageToPrompt,
  async ctx => {
    console.log('CASE 0: image_to_prompt')
    const isRu = isRussianFromState(ctx)
    console.log('CASE: imageToPromptCommand')

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }
    await ctx.reply(
      isRu
        ? '🖼️ Отправьте изображение для распознавания промпта'
        : '🖼️ Send an image to recognize the prompt',
      {
        reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
      }
    )
    ctx.scene.session.state = { step: 0 }
    return ctx.wizard.next()
  },
  async ctx => {
    console.log('CASE 1: image_to_prompt')
    const isRu = isRussianFromState(ctx)

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    if (!ctx.message) {
      await ctx.reply(
        isRu ? 'Пожалуйста, отправьте изображение' : 'Please send an image',
        {
          reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
        }
      )
      return
    }

    if ('photo' in ctx.message) {
      // Если отправлено фото, обрабатываем его
      const photo = ctx.message.photo
      const fileId = photo[photo.length - 1].file_id
      const file = await ctx.telegram.getFileLink(fileId)
      const imageUrl = file.href

      // Отправляем сообщение о начале генерации
      await ctx.reply(
        isRu
          ? 'Генерирую промпт для вашего изображения...'
          : 'Generating prompt for your image...'
      )

      try {
        // Получаем токен текущего бота
        const botToken = getBotToken(ctx)
        // Получаем имя бота по токену
        const { bot_name: botName } = getBotNameByToken(botToken)

        // Вызываем сервис для генерации промпта
        await generateImageToPrompt(
          imageUrl,
          String(ctx.from?.id),
          ctx.from?.username || 'unknown_user',
          isRussianFromState(ctx),
          ctx,
          botName
        )

        return ctx.scene.leave()
      } catch (error) {
        console.error('Error in imageToPromptWizard:', error)
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при обработке изображения. Пожалуйста, попробуйте позже.'
            : 'An error occurred while processing the image. Please try again later.'
        )
        return ctx.scene.leave()
      }
    } else {
      // Если отправлено не фото, просим отправить фото
      await ctx.reply(
        isRu ? 'Пожалуйста, отправьте изображение' : 'Please send an image',
        {
          reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
        }
      )
      return
    }
  }
)

export default imageToPromptWizard
