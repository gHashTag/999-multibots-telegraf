import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'

import { generateImageToPrompt } from '@/services/generateImageToPrompt'

import { createHelpCancelKeyboard, handleHelpCancel } from '@/navigation'
import { getBotToken } from '@/handlers'
import { ModeEnum } from '@/interfaces/modes'
import { getBotNameByToken } from '@/core/bot'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
// The stub that used to stand here wrote process.env.HUGGINGFACE_TOKEN =
// 'dummy-token' at module load -- a process-wide mutation, and the only one
// in src. It protected nothing: this wizard never reads the token, no
// HuggingFace client library exists in the repo, and the captioning call in
// plan_b/generateImageToPrompt goes to a PUBLIC space over plain axios. What
// it did do was make the variable look configured to every other module for
// the life of the process, defeating any `if (!token)` check downstream.

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
      // In-flight guard (same shape as voiceAvatar/morphing/aiCover).
      // generateImageToPrompt charges the user (MONEY_OUTCOME) and runs the full
      // caption pipeline; step 2 stays active until it resolves, so a second
      // photo sent during that window ran it again — a double charge and two
      // prompt results. Reject the re-entry without touching the winner's flag;
      // set synchronously (no await between the check and the set) and release
      // it in finally, which must wrap every await after the set.
      if (ctx.session.imageToPromptInProgress) {
        await ctx.reply(
          isRu
            ? '⏳ Уже обрабатываю изображение, подождите немного...'
            : '⏳ Already processing an image, please wait a moment...'
        )
        return
      }
      ctx.session.imageToPromptInProgress = true

      try {
        // A photo was sent — process it
        const photo = ctx.message.photo
        const fileId = photo[photo.length - 1].file_id
        const file = await ctx.telegram.getFileLink(fileId)
        const imageUrl = file.href

        // Tell the user that generation has started
        await ctx.reply(
          isRu
            ? 'Генерирую промпт для вашего изображения...'
            : 'Generating prompt for your image...'
        )

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
      } finally {
        ctx.session.imageToPromptInProgress = false
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
