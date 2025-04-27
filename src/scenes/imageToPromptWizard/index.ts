import { Scenes, Telegraf, Markup } from 'telegraf'
import type { MyContext } from '@/interfaces'

import { generateImageToPrompt } from '@/services'
import { isRussian } from '@/helpers'

// import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { getBotToken } from '@/handlers'
import { ModeEnum } from '@/interfaces/modes'
import type { getBotNameByToken } from '@/core/bot'
import { createHelpButton } from '@/menu/buttons'
// Используем заглушку для HUGGINGFACE_TOKEN
process.env.HUGGINGFACE_TOKEN = process.env.HUGGINGFACE_TOKEN || 'dummy-token'

export const imageToPromptWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImageToPrompt,
  async ctx => {
    console.log('CASE 0: image_to_prompt')
    const isRu = isRussian(ctx)
    console.log('CASE: imageToPromptCommand')

    await ctx.reply(
      isRu
        ? '👋 Привет! Загрузи картинку, и я сделаю для нее промпт.'
        : '👋 Hello! Upload an image, and I will create a prompt for it.',
      Markup.inlineKeyboard([[createHelpButton()]])
    )
    ctx.scene.session.state = { step: 0 }
    return ctx.wizard.next()
  },
  async ctx => {
    console.log('CASE 1: image_to_prompt')
    const isRu = isRussian(ctx)

    if (!ctx.message) {
      await ctx.reply(
        isRu ? 'Пожалуйста, отправьте изображение' : 'Please send an image'
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
          ctx,
          botName
        )

        await ctx.reply(
          isRu
            ? '✅ Промпт для твоей картинки готов! (Заглушка)'
            : '✅ Prompt for your image is ready! (Placeholder)',
          Markup.inlineKeyboard([[createHelpButton()]])
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
        isRu ? 'Пожалуйста, отправьте изображение' : 'Please send an image'
      )
      return
    }
  }
)

export default imageToPromptWizard
