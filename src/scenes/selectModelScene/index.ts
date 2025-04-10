import { Scenes } from 'telegraf'
import { MyContext } from '@/types'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/types/modes'

export const selectModelScene = new Scenes.BaseScene<MyContext>('select_model')

selectModelScene.enter(async ctx => {
  logger.info('🎯 Вход в сцену выбора модели', {
    telegram_id: ctx.from?.id,
    mode: ctx.session?.mode,
    current_scene: ctx.scene.current?.id,
    selected_model: ctx.session?.selected_model,
  })

  await ctx.reply(
    'Выберите модель для создания цифрового тела:\n\n' +
      '1. FLUX - базовая модель\n' +
      '2. FLUX PRO - продвинутая модель с улучшенным качеством'
  )
})

selectModelScene.on('message', async ctx => {
  if (!ctx.message || !('text' in ctx.message)) {
    logger.warn('⚠️ Получено сообщение без текста', {
      telegram_id: ctx.from?.id,
      messageType: ctx.message ? typeof ctx.message : 'undefined',
    })
    await ctx.reply(
      'Пожалуйста, отправьте текстовое сообщение с выбором модели'
    )
    return
  }

  logger.info('📩 Получено сообщение в сцене выбора модели', {
    telegram_id: ctx.from?.id,
    messageText: ctx.message.text,
    mode: ctx.session?.mode,
  })

  const messageText = ctx.message.text.toLowerCase()

  if (messageText === 'flux') {
    logger.info('🎯 Выбрана модель FLUX', {
      telegram_id: ctx.from?.id,
      previousMode: ctx.session?.mode,
      selected_model: 'FLUX',
    })

    ctx.session.selected_model = 'FLUX'
    ctx.session.mode = ModeEnum.TextToImage
    await ctx.scene.enter('check_balance')
  } else if (messageText === 'flux pro') {
    logger.info('🎯 Выбрана модель FLUX PRO', {
      telegram_id: ctx.from?.id,
      previousMode: ctx.session?.mode,
      selected_model: 'FLUX PRO',
    })

    ctx.session.selected_model = 'FLUX PRO'
    ctx.session.mode = ModeEnum.TextToImage
    await ctx.scene.enter('check_balance')
  } else {
    logger.warn('⚠️ Выбрана неверная модель', {
      telegram_id: ctx.from?.id,
      messageText: ctx.message.text,
    })

    await ctx.reply(
      'Пожалуйста, выберите одну из доступных моделей:\nFLUX или FLUX PRO'
    )
  }
})

export default selectModelScene
