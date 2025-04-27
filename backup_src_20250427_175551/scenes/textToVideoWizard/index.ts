import { Scenes, Markup } from 'telegraf'
import type { MyContext } from '@/interfaces'
import { calculateFinalPrice } from '@/price/helpers'
import { generateTextToVideo } from '@/services/generateTextToVideo'
import { isRussian } from '@/helpers/language'
import { sendGenericErrorMessage, videoModelKeyboard } from '@/menu'
import { VIDEO_MODELS_CONFIG } from '@/config/models.config'
import { getUserBalance } from '@/core/supabase'

// Определяем тип ключа конфига локально
type VideoModelConfigKey = keyof typeof VIDEO_MODELS_CONFIG

export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  'text_to_video',
  async ctx => {
    const isRu = isRussian(ctx)
    try {
      // Запрашиваем модель
      await ctx.reply(
        isRu ? 'Выберите модель для генерации:' : 'Choose generation model:',
        {
          reply_markup: videoModelKeyboard(isRu).reply_markup,
        }
      )

      return ctx.wizard.next()
    } catch (error: unknown) {
      console.error('Error in text_to_video:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      await ctx.reply(
        isRu
          ? `❌ Произошла ошибка: ${errorMessage}`
          : `❌ An error occurred: ${errorMessage}`
      )
      return ctx.scene.leave()
    }
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message as { text?: string }
    const selectedButtonText = message?.text

    if (!selectedButtonText) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    // Ищем ключ модели по тексту кнопки (формат: "Название (Цена ⭐)")
    let foundModelKey: VideoModelConfigKey | null = null

    for (const [key, config] of Object.entries(VIDEO_MODELS_CONFIG)) {
      // Рассчитываем ожидаемый текст кнопки с финальной ценой в звездах и эмодзи ⭐
      const finalPriceInStars = calculateFinalPrice(key)
      const expectedButtonText = `${config.title} (${finalPriceInStars} ⭐)` // Используем ⭐
      if (expectedButtonText === selectedButtonText) {
        foundModelKey = key as VideoModelConfigKey
        break
      }
    }

    if (selectedButtonText === (isRu ? 'Отмена' : 'Cancel')) {
      await ctx.reply(
        isRu ? 'Отменено.' : 'Cancelled.',
        Markup.removeKeyboard()
      )
      return ctx.scene.leave()
    }

    // Если ключ модели не найден по тексту кнопки
    if (!foundModelKey) {
      console.error(
        'Could not map button text to model key:',
        selectedButtonText
      )
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите модель из предложенных кнопок.'
          : 'Please select a model using the provided buttons.'
      )
      // Остаемся на этом же шаге, чтобы пользователь выбрал снова
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    // --- Остальная логика остается похожей, но используем foundModelKey ---

    if (!ctx.from) {
      console.error('text_to_video: Could not identify user')
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const telegram_id = ctx.from.id.toString()
    const bot_name = ctx.botInfo.username

    // 1. Вычисляем стоимость
    const cost = calculateFinalPrice(foundModelKey)
    if (cost === null) {
      // calculateFinalPrice может вернуть null, если модель не найдена
      console.error('Could not calculate price for model key:', foundModelKey)
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.wizard.selectStep(ctx.wizard.cursor) // Даем выбрать снова
    }

    // 2. Получаем текущий баланс
    const currentBalance = await getUserBalance(telegram_id, bot_name)

    // 3. Проверяем, достаточно ли средств
    if (currentBalance < cost) {
      console.log(
        `Insufficient balance for ${telegram_id}. Has: ${currentBalance}, Needs: ${cost}`
      )
      await ctx.reply(
        isRu
          ? `😕 Недостаточно звезд для генерации (${cost}). Ваш баланс: ${currentBalance} ★. Пожалуйста, выберите другую модель или пополните баланс.`
          : `😕 Insufficient stars for generation (${cost}). Your balance: ${currentBalance} ★. Please select another model or top up your balance.`,
        // Оставляем клавиатуру для выбора
        {
          reply_markup: videoModelKeyboard(isRu).reply_markup,
        }
      )
      // Остаемся на этом же шаге
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    }

    // Если баланс достаточен:
    console.log(
      `Sufficient balance for ${telegram_id}. Has: ${currentBalance}, Needs: ${cost}. Proceeding.`
    )

    // Сохраняем НАЙДЕННЫЙ ключ модели в сессии
    ctx.session.videoModel = foundModelKey

    await ctx.reply(
      isRu
        ? 'Пожалуйста, отправьте текстовое описание'
        : 'Please send a text description',
      // Важно убрать клавиатуру после успешного выбора модели
      Markup.removeKeyboard()
    )
    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (message && 'text' in message) {
      const prompt = message.text

      if (!prompt) {
        await sendGenericErrorMessage(ctx, isRu)
        return ctx.scene.leave()
      }

      // Получаем ключ модели из существующего поля сессии
      const videoModelKey = ctx.session.videoModel as
        | VideoModelConfigKey
        | undefined
      console.log('Selected video model key:', videoModelKey)

      if (!videoModelKey) {
        console.error('Video model key not found in session')
        await sendGenericErrorMessage(ctx, isRu)
        return ctx.scene.leave()
      }

      if (ctx.from && ctx.from.username) {
        await generateTextToVideo(
          prompt,
          videoModelKey,
          ctx.from.id.toString(),
          ctx.from.username,
          isRu
        )

        ctx.session.prompt = prompt
      } else {
        console.error('User information missing for video generation')
        await sendGenericErrorMessage(ctx, isRu)
      }

      await ctx.scene.leave()
    } else {
      await sendGenericErrorMessage(ctx, isRu)
      await ctx.scene.leave()
    }
  }
)

export default textToVideoWizard
