import { Composer, Scenes, Markup } from 'telegraf'
import { TelegramConnector } from '../../modules/videoGenerator/adapters/telegramConnector'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { ModeEnum } from '@/interfaces/modes'
import { handleHelpCancel } from '@/handlers'
import { videoModelKeyboard, createHelpCancelKeyboard } from '@/menu'
import { logger } from '@/utils/logger'
import { determineVideoMode } from '../../modules/videoGenerator/helpers/determineVideoMode'
import { VIDEO_MODELS } from '../../modules/videoGenerator/config/videoModels'

// Минимальная сцена для вызова модуля генерации видео
const askModelStep = new Composer<MyContext>()
askModelStep.on('message', async ctx => {
  const isRu = isRussian(ctx)
  // Проверяем, если пользователь выбрал морфинг напрямую
  if (ctx.session.current_action === 'morphing') {
    logger.info('[I2V Wizard] Morphing mode entered directly', {
      telegramId: ctx.from?.id,
    })
    ctx.session.is_morphing = true
    // Запрашиваем первое изображение для морфинга
    const text = isRu
      ? '🖼️ Пожалуйста, отправьте первое изображение для морфинга.'
      : '🖼️ Please send the first image for morphing.'
    await ctx.replyWithHTML(text)
    return ctx.wizard.next()
  } else {
    // Стандартный поток: запрашиваем выбор модели
    const keyboardMarkup = Markup.inlineKeyboard(
      Object.entries(VIDEO_MODELS).map(([key, model]) => [
        Markup.button.callback(
          `${model.name} (${model.price} кредитов)`,
          `model:${key}`
        ),
      ])
    )
    const text = isRu
      ? '🤔 Выберите модель для генерации видео:'
      : '🤔 Choose a model for video generation:'
    await ctx.reply(text, {
      reply_markup: keyboardMarkup.reply_markup,
    })
    return ctx.wizard.next()
  }
})

// Обработчик выбора модели или дальнейших шагов будет вынесен в модуль
// Здесь оставляем только минимальную логику для перехода к модулю
const handleNextStep = new Composer<MyContext>()
handleNextStep.on('message', async ctx => {
  const isRu = isRussian(ctx)
  const isCancel = await handleHelpCancel(ctx)
  if (isCancel) {
    return ctx.scene.leave()
  }
  // Логика обработки будет в модуле videoGenerator через TelegramConnector
  // Здесь только переход к генерации видео
  const connector = new TelegramConnector(ctx.telegram, ctx.from?.id || 0, isRu)

  // Вызываем модуль генерации видео через коннектор
  try {
    await connector.startVideoGeneration(
      String(ctx.from?.id),
      ctx.from?.username || 'unknown',
      ctx.botInfo?.username || 'bot',
      ctx.session.videoModel || 'stable-video-diffusion',
      ctx.session.imageUrl || null,
      ctx.session.prompt || null,
      ctx.session.is_morphing || false,
      ctx.session.imageAUrl || null,
      ctx.session.imageBUrl || null,
      {} // Зависимости будут определены в модуле
    )
  } catch (error) {
    logger.error('[I2V Wizard] Error starting video generation via connector', {
      error,
    })
    const errorText = isRu
      ? '❌ Ошибка при запуске генерации видео.'
      : '❌ Error starting video generation.'
    await ctx.reply(errorText)
  }
  return ctx.scene.leave()
})

const handlePhotoMessage = async (ctx: MyContext) => {
  const mode = determineVideoMode(ctx)
  console.log(`[handlePhotoMessage] mode: ${mode}`)
  // ... existing code ...
}

// Определение сцены с минимальной логикой
export const imageToVideoWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImageToVideo,
  askModelStep,
  handleNextStep
)

imageToVideoWizard.help(handleHelpCancel)
imageToVideoWizard.command('cancel', handleHelpCancel)

logger.info(
  '⚡️ ImageToVideo Wizard Scene initialized with minimal logic using TelegramConnector'
)
