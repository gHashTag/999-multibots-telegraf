import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussian } from '../../helpers/language'
import { createHelpCancelKeyboard, handleHelpCancel, CancelButtonService } from '@/navigation'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'

export const chatWithAvatarWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ChatWithAvatar,
  async ctx => {
    console.log('CASE: Чат с аватаром')
    const isRu = isRussian(ctx)

    await ctx.reply(
      isRu
        ? 'Напиши мне сообщение 💭 и я отвечу на него'
        : 'Write me a message 💭 and I will answer you',
      {
        reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
      }
    )
    return ctx.wizard.next()
  },
  async ctx => {
    // ✅ Обработка "Справка" через глобальный обработчик
    // ✅ "Отмена" обрабатывается глобально в registerCommands.ts
    if (ctx.message && 'text' in ctx.message) {
      const isHelpHandled = await handleHelpCancel(ctx)
      if (isHelpHandled) {
        return
      }
    }

    if (ctx.message && 'text' in ctx.message) {
      // ✅ ИСПРАВЛЕНО: Обрабатываем текст для чата с аватаром напрямую
      try {
        const telegramId = ctx.from?.id?.toString()
        if (!telegramId) {
          return ctx.scene.leave()
        }

        // Показываем индикатор "печатает..." пока готовим ответ
        await ctx.sendChatAction('typing')

        const { answerAi } = await import('../../core/openai/requests')
        const { getUserData, getUserModel } = await import(
          '../../core/supabase'
        )
        const { getUserLanguageFromState } = await import(
          '@/helpers/centralizedLanguage'
        )

        const userData = await getUserData(telegramId)
        const userModel = await getUserModel(telegramId)
        const languageCode = getUserLanguageFromState(ctx)

        const prompt = ctx.message.text
        const model = userModel || 'deepseek-chat'

        // Отправляем еще один индикатор перед вызовом AI (для долгих запросов)
        await ctx.sendChatAction('typing')

        const response = await answerAi(
          model,
          userData,
          prompt,
          languageCode,
          undefined,
          ctx,
          telegramId,
          isRussian(ctx)
        )

        // ✅ Проверяем, является ли ответ изображением (от Nano Banana Pro)
        if (typeof response === 'object' && response.type === 'image') {
          console.log(
            '🖼️ [chatWithAvatarWizard] Image response received, sending photo',
            {
              telegramId,
              imageUrl: response.imageUrl,
              cost: response.cost,
            }
          )
          const isRu = isRussian(ctx)

          // ✅ Формируем подпись с информацией о стоимости
          const caption = isRu
            ? `✨ Изображение сгенерировано с помощью Nano Banana Pro\n\n💫 Стоимость: ${response.cost || 'N/A'}⭐`
            : `✨ Image generated using Nano Banana Pro\n\n💫 Cost: ${response.cost || 'N/A'}⭐`

          await ctx.replyWithPhoto(response.imageUrl, {
            caption,
          })
        } else {
          // Обычный текстовый ответ
          await ctx.reply(response as string)
        }

        // Пост-обработка пользователя (достижимый код)
        try {
          const userExists = await getUserByTelegramId(ctx)
          if (!userExists) {
            console.error(
              `[chatWithAvatarWizard] User with ID ${telegramId} not found after message processing.`
            )
          } else {
            const level = userExists.level
            if (level === 4) {
              await updateUserLevelPlusOne(telegramId, level)
            }
          }
        } catch (e) {
          console.error('[chatWithAvatarWizard] post-processing error:', e)
        }

        // Остаемся на том же шаге для продолжения чата
        return ctx.wizard.selectStep(1)
      } catch (error) {
        console.error('[chatWithAvatarWizard] Error processing text:', error)
        const isRu = isRussian(ctx)
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при обработке сообщения.'
            : '❌ An error occurred while processing the message.'
        )
        return ctx.scene.leave()
      }
    } else {
      // Обработка других типов сообщений, если нужно
      console.error('[chatWithAvatarWizard] Unknown message type:', ctx.message)
      return ctx.scene.leave()
    }

    // (ничего)
  }
)

export default chatWithAvatarWizard
