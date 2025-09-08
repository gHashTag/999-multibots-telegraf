import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { isRussian } from '@/helpers/language'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { createHelpCancelKeyboard } from '@/menu'
import { sendGenericErrorMessage } from '@/menu'
import { logger } from '@/utils/logger'
import { getTriggerReel } from '@/core/openai/getTriggerReel'
import { handleTextToVideoDirect } from '@/handlers/handleTextToVideoDirect'
import { levels } from '@/menu/mainMenu'
import { directPaymentProcessor } from '@/core/supabase/directPayment'
import { PaidServiceEnum } from '@/interfaces/paidServices'

// Ниши для AI Reels
const REEL_NICHES = {
  ru: [
    '🏋️ Фитнес и тренировки',
    '🍳 Кулинария и рецепты',
    '💄 Красота и макияж',
    '🧘 Йога и медитация',
    '📚 Образование и лайфхаки',
    '🎯 Мотивация и успех',
    '💼 Бизнес и продажи',
    '🏡 Дом и интерьер',
    '🐕 Питомцы и животные',
    '✈️ Путешествия и туризм',
    '🎨 Искусство и творчество',
    '👗 Мода и стиль',
    '🎮 Игры и развлечения',
    '🚗 Авто и техника',
    '💑 Отношения и психология',
  ],
  en: [
    '🏋️ Fitness & Workouts',
    '🍳 Cooking & Recipes',
    '💄 Beauty & Makeup',
    '🧘 Yoga & Meditation',
    '📚 Education & Life Hacks',
    '🎯 Motivation & Success',
    '💼 Business & Sales',
    '🏡 Home & Interior',
    '🐕 Pets & Animals',
    '✈️ Travel & Tourism',
    '🎨 Art & Creativity',
    '👗 Fashion & Style',
    '🎮 Gaming & Entertainment',
    '🚗 Cars & Tech',
    '💑 Relationships & Psychology',
  ],
}

export const aiReelsWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.AIReels,
  // Шаг 1: Выбор ниши или ввод темы
  async ctx => {
    const isRu = isRussian(ctx)
    
    // Устанавливаем режим для правильной работы справки
    ctx.session.mode = ModeEnum.AIReels
    
    // Создаем клавиатуру с нишами
    const niches = isRu ? REEL_NICHES.ru : REEL_NICHES.en
    const buttons = niches.map(niche => [Markup.button.text(niche)])
    
    // Добавляем кнопку для ввода своей темы
    buttons.push([
      Markup.button.text(isRu ? '✏️ Ввести свою тему' : '✏️ Enter custom topic')
    ])
    
    const keyboard = Markup.keyboard(buttons).resize()
    
    await ctx.reply(
      isRu
        ? '🎬 **AI Reels Generator**\n\nВыберите нишу для вашего Reels или введите свою тему:\n\n💡 AI создаст вирусный сценарий и сгенерирует видео в формате 9:16'
        : '🎬 **AI Reels Generator**\n\nChoose a niche for your Reels or enter your own topic:\n\n💡 AI will create a viral script and generate a 9:16 video',
      keyboard
    )
    
    return ctx.wizard.next()
  },
  
  // Шаг 2: Обработка выбора ниши или запрос кастомной темы
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message
    
    // Проверяем команды отмены/помощи
    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }
    
    if (!message || !('text' in message)) {
      await ctx.reply(
        isRu 
          ? '❌ Пожалуйста, выберите нишу или введите тему'
          : '❌ Please choose a niche or enter a topic'
      )
      return // Остаемся на том же шаге
    }
    
    const text = message.text
    
    // Проверяем, выбрал ли пользователь кастомную тему
    if (text === '✏️ Ввести свою тему' || text === '✏️ Enter custom topic') {
      await ctx.reply(
        isRu
          ? '📝 Введите тему для вашего Reels:\n\nПример: "Как приготовить идеальную пасту", "5 упражнений для пресса", "Секреты продуктивности"'
          : '📝 Enter your Reels topic:\n\nExample: "How to make perfect pasta", "5 ab exercises", "Productivity secrets"',
        createHelpCancelKeyboard(isRu)
      )
      return ctx.wizard.next()
    }
    
    // Сохраняем выбранную нишу/тему
    const niches = isRu ? REEL_NICHES.ru : REEL_NICHES.en
    if (niches.includes(text)) {
      // Убираем эмодзи из начала ниши для получения чистой темы
      const topic = text.replace(/^[^\s]+\s/, '')
      ctx.wizard.state.topic = topic
      
      // Переходим к генерации
      return ctx.wizard.selectStep(3)
    } else {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, выберите нишу из предложенных вариантов'
          : '❌ Please choose a niche from the provided options'
      )
      return ctx.wizard.back()
    }
  },
  
  // Шаг 3: Ввод кастомной темы (если выбрана)
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message
    
    // Проверяем команды отмены/помощи
    if (await handleHelpCancel(ctx)) {
      return ctx.scene.leave()
    }
    
    if (!message || !('text' in message) || !message.text) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, введите тему для вашего Reels'
          : '❌ Please enter a topic for your Reels'
      )
      return // Остаемся на том же шаге
    }
    
    // Сохраняем тему
    ctx.wizard.state.topic = message.text
    
    // Переходим к генерации
    return ctx.wizard.next()
  },
  
  // Шаг 4: Генерация контента и видео
  async ctx => {
    const isRu = isRussian(ctx)
    const topic = ctx.wizard.state.topic
    
    if (!topic) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
    
    if (!ctx.from?.id || !ctx.botInfo?.username) {
      logger.error('[AIReels] Critical user or bot info missing', {
        from: ctx.from,
        botInfo: ctx.botInfo,
      })
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
    
    try {
      // Показываем статус генерации контента
      const statusMessage = await ctx.reply(
        isRu
          ? '🎬 Генерирую вирусный сценарий для Reels...\n\n⏳ Это займет несколько секунд...'
          : '🎬 Generating viral Reels script...\n\n⏳ This will take a few seconds...'
      )
      
      logger.info('[AIReels] Starting content generation', {
        userId: ctx.from.id,
        topic,
      })
      
      // Генерируем контент для Reels
      const reelContent = await getTriggerReel(topic)
      
      if (!reelContent) {
        throw new Error('Failed to generate reel content')
      }
      
      // Обновляем статус
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        statusMessage.message_id,
        undefined,
        isRu
          ? `✅ Сценарий готов!\n\n📝 **Тема:** ${topic}\n\n🎬 Начинаю генерацию видео...`
          : `✅ Script ready!\n\n📝 **Topic:** ${topic}\n\n🎬 Starting video generation...`
      )
      
      // Проверяем баланс пользователя для генерации видео
      const costInStars = 30 // Фиксированная стоимость для AI Reels
      
      // Обрабатываем платеж
      const paymentResult = await directPaymentProcessor.processPayment(
        ctx,
        costInStars,
        PaidServiceEnum.TextToVideo,
        { modelName: 'Veo-3-fast', aspectRatio: '9:16', duration: 5 }
      )
      
      if (!paymentResult.success) {
        await ctx.reply(
          isRu
            ? `❌ Недостаточно звезд для генерации видео. Требуется: ${costInStars} ⭐`
            : `❌ Not enough stars for video generation. Required: ${costInStars} ⭐`
        )
        return ctx.scene.leave()
      }
      
      // Генерируем видео с оптимальными параметрами для Reels
      const videoParams = {
        prompt: reelContent,
        model: 'Veo-3-fast', // Быстрая модель для Reels
        aspectRatio: '9:16', // Вертикальный формат для Reels
        duration: 5, // Короткое видео
        userId: ctx.from.id.toString(),
        botUsername: ctx.botInfo.username,
      }
      
      logger.info('[AIReels] Starting video generation', {
        userId: ctx.from.id,
        params: videoParams,
      })
      
      // Обновляем статус
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        statusMessage.message_id,
        undefined,
        isRu
          ? `🎬 **Генерация AI Reels**\n\n📝 Тема: ${topic}\n⏳ Создаю видео...\n\nЭто может занять 1-2 минуты`
          : `🎬 **AI Reels Generation**\n\n📝 Topic: ${topic}\n⏳ Creating video...\n\nThis may take 1-2 minutes`
      )
      
      // Вызываем функцию генерации видео напрямую
      await handleTextToVideoDirect(
        ctx,
        videoParams.prompt,
        videoParams.model,
        videoParams.aspectRatio,
        videoParams.duration,
        isRu
      )
      
      // Отправляем финальное сообщение с контентом
      await ctx.reply(
        isRu
          ? `✅ **AI Reels успешно создан!**\n\n📝 **Сценарий:**\n${reelContent}\n\n💡 Используйте этот текст для озвучки или субтитров`
          : `✅ **AI Reels created successfully!**\n\n📝 **Script:**\n${reelContent}\n\n💡 Use this text for voiceover or subtitles`
      )
      
      logger.info('[AIReels] Successfully completed', {
        userId: ctx.from.id,
        topic,
      })
      
    } catch (error) {
      logger.error('[AIReels] Error during generation', {
        error: error instanceof Error ? error.message : String(error),
        userId: ctx.from?.id,
        topic,
      })
      
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при генерации Reels. Пожалуйста, попробуйте еще раз.'
          : '❌ An error occurred while generating Reels. Please try again.'
      )
    }
    
    return ctx.scene.leave()
  }
)