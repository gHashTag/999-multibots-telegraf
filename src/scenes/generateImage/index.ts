import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'

import { generateImageFromPrompt } from '@/services/generateImageFromPrompt'

import { createGenerateImageKeyboard } from '@/menu'

import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { getBotToken } from '@/handlers'

const PROMPT_MAX_LENGTH = 1000

export const generateImageWizard = new Scenes.WizardScene<MyContext>(
  'generate_image',
  async ctx => {
    console.log('CASE 0: generate_image')
    const isRu = ctx.from?.language_code === 'ru'
    console.log('CASE: generateImageCommand')

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }
    await ctx.reply(
      isRu
        ? 'Введите промпт для генерации изображения (максимум 1000 символов):'
        : 'Enter a prompt for image generation (maximum 1000 characters):',
      {
        reply_markup: createGenerateImageKeyboard(isRu).reply_markup,
      }
    )
    ctx.scene.session.state = {}
    return ctx.wizard.next()
  },
  async ctx => {
    console.log('CASE 1: generate_image')
    const isRu = ctx.from?.language_code === 'ru'

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    // Обработка текстового ввода
    if (!ctx.message || !('text' in ctx.message) || !ctx.message.text) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, введите текстовый промпт.'
          : 'Please enter a text prompt.',
        {
          reply_markup: createGenerateImageKeyboard(isRu).reply_markup,
        }
      )
      return
    }

    const prompt = ctx.message.text.trim()

    // Проверка длины промпта
    if (prompt.length > PROMPT_MAX_LENGTH) {
      await ctx.reply(
        isRu
          ? `Промпт слишком длинный. Максимальная длина: ${PROMPT_MAX_LENGTH} символов.`
          : `Prompt is too long. Maximum length: ${PROMPT_MAX_LENGTH} characters.`,
        {
          reply_markup: createGenerateImageKeyboard(isRu).reply_markup,
        }
      )
      return
    }

    // Сохраняем промпт в состоянии сессии
    ctx.scene.session.state.prompt = prompt

    // Запрашиваем у пользователя размер изображения
    await ctx.reply(
      isRu ? 'Выберите размер изображения:' : 'Choose the image size:',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '512x512', callback_data: 'size_512' },
              { text: '768x768', callback_data: 'size_768' },
            ],
            [{ text: isRu ? 'Отмена' : 'Cancel', callback_data: 'cancel' }],
          ],
        },
      }
    )

    return ctx.wizard.next()
  },
  async ctx => {
    console.log('CASE 2: generate_image - выбор размера')
    const isRu = ctx.from?.language_code === 'ru'

    // Обработка кнопки отмены
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel') {
      await ctx.answerCbQuery()
      await ctx.reply(
        isRu ? 'Генерация изображения отменена.' : 'Image generation cancelled.'
      )
      return ctx.scene.leave()
    }

    // Проверка на наличие callback_query и данных
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите размер изображения, используя кнопки выше.'
          : 'Please select an image size using the buttons above.'
      )
      return
    }

    await ctx.answerCbQuery()

    const data = ctx.callbackQuery.data
    let size: string

    // Определение размера изображения
    if (data === 'size_512') {
      size = '512x512'
    } else if (data === 'size_768') {
      size = '768x768'
    } else {
      await ctx.reply(
        isRu
          ? 'Неверный выбор размера. Пожалуйста, выберите один из предложенных вариантов.'
          : 'Invalid size selection. Please choose one of the provided options.'
      )
      return
    }

    // Получаем промпт из состояния сессии
    const prompt = ctx.scene.session.state.prompt

    if (!prompt) {
      await ctx.reply(
        isRu
          ? 'Произошла ошибка: промпт не найден. Пожалуйста, начните снова.'
          : 'An error occurred: prompt not found. Please start again.'
      )
      return ctx.scene.leave()
    }

    // Отправляем сообщение о начале генерации
    await ctx.reply(
      isRu
        ? 'Генерирую изображение по вашему промпту. Это может занять несколько минут...'
        : 'Generating an image based on your prompt. This may take a few minutes...'
    )

    try {
      // Получаем имя бота и токен
      const [, botName] = await getBotToken(ctx)

      // Генерируем изображение
      await generateImageFromPrompt(
        prompt,
        size,
        String(ctx.from?.id),
        ctx,
        isRu,
        botName
      )

      return ctx.scene.leave()
    } catch (error) {
      console.error('Error in generateImageWizard:', error)

      await ctx.reply(
        isRu
          ? 'Произошла ошибка при генерации изображения. Пожалуйста, попробуйте позже.'
          : 'An error occurred while generating the image. Please try again later.'
      )

      return ctx.scene.leave()
    }
  }
)
