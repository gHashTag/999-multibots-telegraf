import { Scenes, Markup } from 'telegraf'
import type { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers/language'

import { generateImageFromPrompt } from '@/services/generateImageFromPrompt'

import { createGenerateImageKeyboard } from '@/menu'

const PROMPT_MAX_LENGTH = 1000

// Интерфейс для состояния сцены
interface GenerateImageState {
  prompt?: string
  step: number
}

export const generateImageWizard = new Scenes.WizardScene<MyContext>(
  'generate_image',
  async ctx => {
    console.log('CASE 0: generate_image')
    const isRu = isRussian(ctx)
    console.log('CASE: generateImageCommand')

    await ctx.reply(
      isRu
        ? 'Введите промпт для генерации изображения (максимум 1000 символов):'
        : 'Enter a prompt for image generation (maximum 1000 characters):',
      {
        reply_markup: createGenerateImageKeyboard(),
      }
    )
    const telegram_id = ctx.from.id.toString()
    ctx.scene.session.state = { step: 0 } as GenerateImageState
    return ctx.wizard.next()
  },
  async ctx => {
    console.log('CASE 1: generate_image')
    const isRu = isRussian(ctx)

    // Обработка текстового ввода
    if (!ctx.message || !('text' in ctx.message) || !ctx.message.text) {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, введите текстовый промпт.'
          : 'Please enter a text prompt.',
        {
          reply_markup: createGenerateImageKeyboard(),
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
          reply_markup: createGenerateImageKeyboard(),
        }
      )
      return
    }

    // Сохраняем промпт в состоянии сессии
    const state = ctx.scene.session.state as GenerateImageState
    state.prompt = prompt

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
    const isRu = isRussian(ctx)

    // Обработка кнопки отмены
    if (
      ctx.callbackQuery &&
      'data' in ctx.callbackQuery &&
      ctx.callbackQuery.data === 'cancel'
    ) {
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
    const state = ctx.scene.session.state as GenerateImageState
    const prompt = state.prompt

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
      // Получаем ID пользователя для генерации
      const userId = ctx.from?.id || 0

      // Генерируем изображение с исправленным вызовом функции
      const imageUrl = await generateImageFromPrompt(
        prompt,
        userId,
        'standard', // Стиль по умолчанию
        size // Добавляем параметр размера
      )

      // Отправляем сгенерированное изображение
      await ctx.replyWithPhoto(imageUrl, {
        caption: isRu
          ? 'Изображение сгенерировано по вашему запросу'
          : 'Image generated based on your prompt',
      })

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
