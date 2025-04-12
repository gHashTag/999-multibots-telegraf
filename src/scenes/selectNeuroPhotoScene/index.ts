import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { logger } from '@/utils/logger'
import { handleHelpCancel } from '@/handlers'
import { ModeEnum } from './price/types/modes'
//
export const selectNeuroPhotoScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.SelectNeuroPhoto,
  // async ctx => {
  //   const isRu = isRussian(ctx)
  //   logger.info({
  //     message: '🎨 Вход в сцену выбора версии нейрофото',
  //     description: 'Entering neuro photo version selection scene',
  //     telegram_id: ctx.from?.id,
  //   })

  //   const message = isRu
  //     ? '📸 Какую версию Нейрофото вы хотите использовать?\n\n' +
  //       '1. Нейрофото Flux\n' +
  //       '• Используйте, если обучали цифровое тело Flux\n' +
  //       '• Быстрая обработка\n' +
  //       '• Подходит для стандартных задач\n' +
  //       '• Оптимизирована для портретов\n\n' +
  //       '2. Нейрофото Flux Pro\n' +
  //       '• Используйте, если обучали цифровое тело Flux Pro\n' +
  //       '• Высокое качество детализации\n' +
  //       '• Поддержка сложных сцен\n' +
  //       '• Расширенные настройки стиля\n' +
  //       '• Рекомендуется для профессионального использования\n\n' +
  //       'ℹ️ Выберите ту версию, которая соответствует версии вашего цифрового тела'
  //     : '📸 Which Neuro Photo version do you want to use?\n\n' +
  //       '1. Neuro Photo Flux\n' +
  //       '• Use if you trained Digital Body Flux\n' +
  //       '• Fast processing\n' +
  //       '• Suitable for standard tasks\n' +
  //       '• Optimized for portraits\n\n' +
  //       '2. Neuro Photo Flux Pro\n' +
  //       '• Use if you trained Digital Body Flux Pro\n' +
  //       '• High detail quality\n' +
  //       '• Support for complex scenes\n' +
  //       '• Advanced style settings\n' +
  //       '• Recommended for professional use\n\n' +
  //       'ℹ️ Choose the version that matches your Digital Body version'

  //   await ctx.reply(
  //     message,
  //     Markup.keyboard([
  //       isRu
  //         ? ['Нейрофото Flux', 'Нейрофото Flux Pro']
  //         : ['Neuro Photo Flux', 'Neuro Photo Flux Pro'],
  //     ])
  //       .oneTime()
  //       .resize()
  //   )

  //   return ctx.wizard.next()
  // },
  async ctx => {
    const isRu = isRussian(ctx)
    // const message = ctx.message

    // logger.info({
    //   message: '🔄 Обработка выбора версии нейрофото',
    //   description: 'Processing neuro photo version selection',
    //   telegram_id: ctx.from?.id,
    // })

    // if (!message || !('text' in message)) {
    //   logger.warn({
    //     message: '⚠️ Получено сообщение без текста',
    //     description: 'Received message without text',
    //     telegram_id: ctx.from?.id,
    //   })
    //   await ctx.reply(
    //     isRu
    //       ? 'Пожалуйста, выберите версию, используя кнопки'
    //       : 'Please select a version using the buttons'
    //   )
    //   return ctx.wizard.back()
    // }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    const text = 'flux' //message.text.toLowerCase()

    if (text.includes('flux pro') || text.includes('pro')) {
      logger.info({
        message: '✨ Выбрана версия Flux Pro',
        description: 'Selected Flux Pro version',
        telegram_id: ctx.from?.id,
      })
      ctx.session.mode = ModeEnum.NeuroPhotoV2
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      return
    } else if (text.includes('flux')) {
      logger.info({
        message: '✨ Выбрана версия Flux',
        description: 'Selected Flux version',
        telegram_id: ctx.from?.id,
      })
      ctx.session.mode = ModeEnum.NeuroPhoto
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      return
    }

    logger.warn({
      message: '⚠️ Неверный выбор версии',
      description: 'Invalid version selection',
      telegram_id: ctx.from?.id,
      text: text,
    })

    await ctx.reply(
      isRu
        ? '❌ Пожалуйста, выберите версию (Нейрофото Flux или Нейрофото Flux Pro)'
        : '❌ Please select a version (Neuro Photo Flux or Neuro Photo Flux Pro)'
    )
    return ctx.wizard.back()
  }
)
