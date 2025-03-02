import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'

export const selectNeuroPhotoScene = new Scenes.WizardScene<MyContext>(
  'select_neuro_photo',
  async ctx => {
    const isRu = isRussian(ctx)

    const message = isRu
      ? '📸 Какую версию Нейрофото вы хотите использовать?\n\n' +
        '1. Нейрофото Flux\n' +
        '• Используйте, если обучали цифровое тело Flux\n' +
        '• Быстрая обработка\n' +
        '• Подходит для стандартных задач\n' +
        '• Оптимизирована для портретов\n\n' +
        '2. Нейрофото Flux Pro\n' +
        '• Используйте, если обучали цифровое тело Flux Pro\n' +
        '• Высокое качество детализации\n' +
        '• Поддержка сложных сцен\n' +
        '• Расширенные настройки стиля\n' +
        '• Рекомендуется для профессионального использования\n\n' +
        'ℹ️ Выберите ту версию, которая соответствует версии вашего цифрового тела'
      : '📸 Which Neuro Photo version do you want to use?\n\n' +
        '1. Neuro Photo Flux\n' +
        '• Use if you trained Digital Body Flux\n' +
        '• Fast processing\n' +
        '• Suitable for standard tasks\n' +
        '• Optimized for portraits\n\n' +
        '2. Neuro Photo Flux Pro\n' +
        '• Use if you trained Digital Body Flux Pro\n' +
        '• High detail quality\n' +
        '• Support for complex scenes\n' +
        '• Advanced style settings\n' +
        '• Recommended for professional use\n\n' +
        'ℹ️ Choose the version that matches your Digital Body version'

    await ctx.reply(
      message,
      Markup.keyboard([
        isRu
          ? ['Нейрофото Flux', 'Нейрофото Flux Pro']
          : ['Neuro Photo Flux', 'Neuro Photo Flux Pro'],
      ])
        .oneTime()
        .resize()
    )
    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussian(ctx)

    if (ctx.message && 'text' in ctx.message) {
      const photoChoice = ctx.message.text.toLowerCase()

      if (photoChoice.includes('flux pro') || photoChoice.includes('pro')) {
        ctx.session.mode = 'neuro_photo_2'
        await ctx.scene.enter('checkBalanceScene')
        return
      } else if (photoChoice.includes('flux')) {
        ctx.session.mode = 'neuro_photo'
        await ctx.scene.enter('checkBalanceScene')
        return
      }
    }

    const isCancel = await handleHelpCancel(ctx)

    if (!isCancel) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, выберите версию (Нейрофото Flux или Нейрофото Flux Pro)'
          : '❌ Please select a version (Neuro Photo Flux or Neuro Photo Flux Pro)'
      )
    }

    return ctx.scene.leave()
  }
)
