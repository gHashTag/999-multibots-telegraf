import axios from 'axios'

import { ELESTIO_URL, isDev, SECRET_API_KEY, LOCAL_SERVER_URL } from '@config'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

export const generateTextToImage = async (
  prompt: string,
  model_type: string,
  num_images: number,
  telegram_id: string,
  isRu: boolean,
  ctx: MyContext,
  botName: string
) => {
  // Проверяем наличие необходимых параметров
  if (!prompt) {
    console.error('Ошибка: отсутствует промпт', { telegram_id })
    await ctx.reply(
      isRu
        ? '⚠️ Ошибка: необходимо указать промпт для генерации изображения.'
        : '⚠️ Error: you need to specify a prompt for image generation.'
    )
    return
  }

  if (!model_type) {
    console.error('Ошибка: отсутствует тип модели', { telegram_id })
    await ctx.reply(
      isRu
        ? '⚠️ Ошибка: необходимо выбрать модель для генерации изображения.'
        : '⚠️ Error: you need to select a model for image generation.'
    )
    return
  }

  // Проверяем и корректируем количество изображений
  const validNumImages = Number(num_images) || 1

  try {
    const url = `${
      isDev ? LOCAL_SERVER_URL : ELESTIO_URL
    }/generate/text-to-image`

    console.log('⬇️ Отправляем запрос на генерацию изображения:', {
      url,
      prompt,
      model: model_type,
      num_images: validNumImages,
      telegram_id,
      bot_name: botName,
    })

    // Проверка доступности сервера перед отправкой основного запроса
    try {
      await ctx.reply(
        isRu
          ? '🔄 Подключаемся к серверу генерации изображений...'
          : '🔄 Connecting to the image generation server...'
      )

      // Пробуем отправить запрос
      await axios.post(
        url,
        {
          prompt,
          model: model_type,
          num_images: validNumImages,
          telegram_id,
          username: ctx.from?.username,
          is_ru: isRu,
          bot_name: botName,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-secret-key': SECRET_API_KEY,
          },
          timeout: 5000, // Таймаут 5 секунд
        }
      )

      console.log('✅ Запрос на генерацию изображения успешно отправлен', {
        telegram_id,
      })

      await ctx.reply(
        isRu
          ? '✅ Запрос на генерацию изображения принят! Результат будет отправлен в этот чат в ближайшее время.'
          : '✅ Image generation request accepted! The result will be sent to this chat shortly.'
      )
    } catch (connectionError) {
      console.error('❌ Сервер недоступен:', connectionError)

      await ctx.reply(
        isRu
          ? '😔 Сервер генерации изображений временно недоступен. Пожалуйста, попробуйте позже или используйте функцию Нейрофото.'
          : '😔 Image generation server is temporarily unavailable. Please try again later or use the NeuroPhoto function.'
      )

      // Показываем рекомендацию использовать Нейрофото
      await ctx.reply(
        isRu
          ? '💡 Совет: функция Нейрофото также позволяет генерировать высококачественные изображения и работает прямо сейчас! Выберите "📸 Нейрофото" в главном меню.'
          : '💡 Tip: the NeuroPhoto function also allows you to generate high-quality images and works right now! Select "📸 NeuroPhoto" in the main menu.'
      )
    }
  } catch (error) {
    console.error('❌ Общая ошибка при генерации изображения:', error)

    await ctx.reply(
      isRu
        ? '😔 Произошла ошибка при отправке запроса на генерацию. Пожалуйста, попробуйте позже или используйте функцию Нейрофото.'
        : '😔 An error occurred while sending the generation request. Please try again later or use the NeuroPhoto function.'
    )
  }
}
