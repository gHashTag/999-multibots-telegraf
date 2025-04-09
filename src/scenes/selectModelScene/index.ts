import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { logger } from '@/utils/logger'
import { Markup } from 'telegraf'

export const selectModelScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.SelectModel
)

selectModelScene.enter(async ctx => {
  logger.info('🎯 Вход в сцену выбора модели', {
    description: 'Entering model selection scene',
    telegram_id: ctx.from?.id,
    current_mode: ctx.session?.mode,
    scene_id: ctx.scene?.current?.id,
    selected_model: ctx.session?.selectedModel
  })
  
  const isRu = isRussian(ctx)
  
  // Создаем клавиатуру с кнопками для выбора модели
  const keyboard = {
    reply_markup: {
      keyboard: [
        [isRu ? 'FLUX - базовая модель' : 'FLUX - basic model'],
        [isRu ? 'FLUX PRO - продвинутая модель' : 'FLUX PRO - advanced model'],
        [isRu ? '❌ Отмена' : '❌ Cancel']
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  }

  logger.info('⌨️ Подготовка клавиатуры', {
    description: 'Preparing keyboard layout',
    telegram_id: ctx.from?.id,
    current_mode: ctx.session?.mode,
    keyboard_options: keyboard.reply_markup.keyboard.map(row => row[0]),
    action: 'prepare_keyboard'
  })

  await ctx.reply(
    isRu
      ? '🤖 Выберите модель для создания цифрового тела:'
      : '🤖 Choose a model for digital body creation:',
    keyboard
  )

  logger.info('💬 Отправлено сообщение выбора модели', {
    description: 'Sent model selection message',
    telegram_id: ctx.from?.id,
    current_mode: ctx.session?.mode,
    action: 'sent_model_selection_message',
    session_state: {
      mode: ctx.session?.mode,
      selectedModel: ctx.session?.selectedModel,
      targetScene: ctx.session?.targetScene
    }
  })
})

selectModelScene.on('message', async ctx => {
  if (!('text' in ctx.message)) {
    await ctx.reply('Пожалуйста, отправьте текстовое сообщение')
    return
  }

  const messageText = ctx.message.text
  
  logger.info('📩 Получено сообщение в сцене выбора модели', {
    description: 'Received message in model selection',
    telegram_id: ctx.from?.id,
    message_text: messageText
  })

  const isRu = isRussian(ctx)

  if (messageText === 'FLUX' || messageText === 'FLUX PRO') {
    const prevMode = ctx.session.mode
    ctx.session.selectedModel = messageText
    ctx.session.mode = messageText === 'FLUX' ? ModeEnum.DigitalAvatarBody : ModeEnum.DigitalAvatarBodyV2
    
    logger.info('✅ Выбрана модель', {
      description: 'Model selected',
      telegram_id: ctx.from?.id,
      selected_model: messageText,
      previous_mode: prevMode,
      new_mode: ctx.session?.mode
    })
    
    await ctx.scene.enter('check_balance')
    return
  }

  if (messageText === '⬅️ Назад') {
    await ctx.scene.enter('menu')
    return
  }

  if (messageText === '❌ Отмена' || messageText === '❌ Cancel') {
    logger.info('❌ Отмена выбора модели', {
      description: 'Model selection cancelled',
      telegram_id: ctx.from?.id,
      action: 'cancel_model_selection'
    })

    await ctx.reply(
      isRu ? '❌ Выбор модели отменен' : '❌ Model selection cancelled',
      { reply_markup: { remove_keyboard: true } }
    )

    return ctx.scene.enter('menu_scene')
  }

  logger.warn('⚠️ Неверный выбор модели', {
    description: 'Invalid model selection',
    telegram_id: ctx.from?.id,
    message_text: messageText
  })
  
  await ctx.reply(
    isRu
      ? '❌ Пожалуйста, выберите модель, используя кнопки ниже'
      : '❌ Please select a model using the buttons below'
  )
})
