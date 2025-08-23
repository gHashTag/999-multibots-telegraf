import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  VIDEO_MODELS,
  getModelPriceInStars,
  isDurationSupported,
  getValidDuration,
  VideoModelInfo,
} from '@/services/videoModels'
import { VideoModelId } from '@/services/generateTextToVideo'
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'
import { logger } from '@/utils/logger'

export const videoDurationScene = new Scenes.BaseScene<MyContext>(
  'video_duration_scene'
)

videoDurationScene.enter(async ctx => {
  const is_ru = isRussianFromState(ctx)

  // Получаем данные из session
  const modelId = ctx.session.selectedVideoModel as VideoModelId
  const prompt = ctx.session.videoPrompt

  if (!modelId || !prompt) {
    await ctx.reply(
      is_ru
        ? '❌ Ошибка: потеряны данные сессии. Пожалуйста, начните заново.'
        : '❌ Error: session data lost. Please start again.'
    )
    return ctx.scene.leave()
  }

  const model = VIDEO_MODELS[modelId]

  // Проверяем, поддерживает ли модель выбор длительности
  if (!model.supportedDurations || model.supportedDurations.length === 0) {
    // Для моделей без выбора длительности сразу генерируем видео
    await handleTextToVideoDirect(ctx, prompt, modelId)
    return ctx.scene.leave()
  }

  // Если у модели только одна поддерживаемая длительность, пропускаем выбор
  if (model.supportedDurations.length === 1) {
    const duration = model.supportedDurations[0]
    ctx.session.videoDuration = duration
    await handleTextToVideoDirect(ctx, prompt, modelId, duration)
    return ctx.scene.leave()
  }

  // Создаем кнопки с длительностями
  const buttons = model.supportedDurations.map(duration => {
    const price = getModelPriceInStars(modelId, duration)
    const isDefault = duration === model.defaultDuration
    const label = `${duration} ${is_ru ? 'сек' : 'sec'} - ${price} ⭐${
      isDefault ? ' ⭐' : ''
    }`

    return [
      {
        text: label,
        callback_data: `duration_${duration}`,
      },
    ]
  })

  // Добавляем кнопку отмены
  buttons.push([
    {
      text: is_ru ? '❌ Отмена' : '❌ Cancel',
      callback_data: 'cancel_duration',
    },
  ])

  const modelName = is_ru ? model.nameRu : model.name

  await ctx.reply(
    is_ru
      ? `🎬 Выберите длительность видео для ${modelName}:\n\n` +
          `💡 Подсказка: звездочка (⭐) указывает на рекомендуемую длительность`
      : `🎬 Select video duration for ${modelName}:\n\n` +
          `💡 Tip: star (⭐) indicates recommended duration`,
    {
      reply_markup: {
        inline_keyboard: buttons,
      },
    }
  )
})

// Обработка выбора длительности
videoDurationScene.action(/duration_(\d+)/, async ctx => {
  const is_ru = isRussianFromState(ctx)
  const duration = parseInt(ctx.match[1])

  const modelId = ctx.session.selectedVideoModel as VideoModelId
  const prompt = ctx.session.videoPrompt

  if (!modelId || !prompt) {
    await ctx.answerCbQuery(is_ru ? '❌ Ошибка сессии' : '❌ Session error')
    return ctx.scene.leave()
  }

  // Проверяем, что длительность поддерживается
  if (!isDurationSupported(modelId, duration)) {
    await ctx.answerCbQuery(
      is_ru ? '❌ Неподдерживаемая длительность' : '❌ Unsupported duration'
    )
    return
  }

  // Удаляем сообщение с выбором
  await ctx.deleteMessage().catch(() => {})

  // Сохраняем выбранную длительность
  ctx.session.videoDuration = duration

  logger.info('[videoDurationScene] Duration selected', {
    modelId,
    duration,
    prompt: prompt.substring(0, 50),
  })

  // Запускаем генерацию видео с выбранной длительностью
  await handleTextToVideoDirect(ctx, prompt, modelId, duration)

  // Очищаем данные сессии
  delete ctx.session.selectedVideoModel
  delete ctx.session.videoPrompt
  delete ctx.session.videoDuration

  return ctx.scene.leave()
})

// Обработка отмены
videoDurationScene.action('cancel_duration', async ctx => {
  const is_ru = isRussianFromState(ctx)

  await ctx.answerCbQuery()
  await ctx.deleteMessage().catch(() => {})

  await ctx.reply(
    is_ru ? '❌ Генерация видео отменена' : '❌ Video generation cancelled'
  )

  // Очищаем данные сессии
  delete ctx.session.selectedVideoModel
  delete ctx.session.videoPrompt
  delete ctx.session.videoDuration

  return ctx.scene.leave()
})

// Обработка текстовых сообщений (если пользователь отправит что-то еще)
videoDurationScene.on('text', async ctx => {
  const is_ru = isRussianFromState(ctx)

  await ctx.reply(
    is_ru
      ? '👆 Пожалуйста, выберите длительность из предложенных вариантов выше'
      : '👆 Please select duration from the options above'
  )
})

// Обработка команды выхода
videoDurationScene.command(['cancel', 'exit', 'stop'], async ctx => {
  const is_ru = isRussianFromState(ctx)

  await ctx.reply(
    is_ru ? '❌ Генерация видео отменена' : '❌ Video generation cancelled'
  )

  // Очищаем данные сессии
  delete ctx.session.selectedVideoModel
  delete ctx.session.videoPrompt
  delete ctx.session.videoDuration

  return ctx.scene.leave()
})
