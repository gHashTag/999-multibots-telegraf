import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/core/i18n/language'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'

export const selectModelScene = new Scenes.WizardScene<MyContext>(
  'select_model',
  async ctx => {
    const isRu = isRussian(ctx)

    const message = isRu
      ? '🤖 Какую модель вы хотите обучить?\n\n' +
        '1. FLUX - базовая модель\n' +
        '•❗️Если вы новичок, рекомендуем использовать модель FLUX❗️\n' +
        '• Идеальна для создания фотореалистичных изображений\n' +
        '• Быстрая обработка\n' +
        '• Подходит для большинства задач\n' +
        '• Рекомендуем от 2000 шагов\n\n' +
        '2. FLUX PRO - продвинутая модель\n' +
        '•❗️Рекомендуется для профессионального использования ❗️\n' +
        '• Высокий уровень детализации\n' +
        '• Уникальный художественный стиль\n' +
        '• Поддержка сложных текстур и эффектов\n\n'
      : '🤖 Which model do you want to train?\n\n' +
        '1. FLUX - basic model\n' +
        '• ❗️If you are a beginner, we recommend using the FLUX model❗️\n' +
        '• Perfect for photorealistic images\n' +
        '• Fast processing\n' +
        '• Suitable for most tasks\n' +
        '• Recommended for 2000 steps\n' +
        '2. FLUX PRO - advanced model\n' +
        '• ❗️Recommended for professional use❗️\n' +
        '• High level of detail\n' +
        '• Unique artistic style\n' +
        '• Supports complex textures and effects\n' +
        '• Recommended for professional use'

    await ctx.reply(
      message,
      Markup.keyboard([isRu ? ['FLUX', 'FLUX PRO'] : ['FLUX', 'FLUX PRO']])
        .oneTime()
        .resize()
    )

    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussian(ctx)

    if (ctx.message && 'text' in ctx.message) {
      const modelChoice = ctx.message.text.toLowerCase()

      if (modelChoice.includes('flux pro')) {
        ctx.session.mode = 'digital_avatar_body_2'
        await ctx.scene.enter('checkBalanceScene')
        return
      } else if (modelChoice.includes('flux')) {
        ctx.session.mode = 'digital_avatar_body'
        await ctx.scene.enter('checkBalanceScene')
        return
      }
    }

    const isCancel = await handleHelpCancel(ctx)

    if (!isCancel) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, выберите модель (FLUX или FLUX PRO)'
          : '❌ Please select a model (FLUX or FLUX PRO)'
      )
    }

    return ctx.scene.leave()
  }
)
