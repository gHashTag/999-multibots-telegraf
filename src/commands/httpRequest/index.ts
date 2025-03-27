import { Composer } from 'telegraf'
import axios from 'axios'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

/**
 * Команда для отправки HTTP-запросов прямо из чата
 */
const httpRequestCommand = new Composer<MyContext>()

// Обработчик команды /http для выполнения HTTP запросов
httpRequestCommand.command('http', async ctx => {
  try {
    const text = ctx.message.text.trim()
    const parts = text.split(' ')

    if (parts.length < 3) {
      return await ctx.reply(
        '⚠️ Неверный формат команды.\n' +
          'Используйте: /http GET|POST|PUT|DELETE url [data]\n' +
          'Пример: /http GET https://api.ipify.org?format=json'
      )
    }

    const method = parts[1].toUpperCase()
    const url = parts[2]
    let data = {}

    // Если есть данные для запроса (для POST/PUT)
    if (parts.length > 3) {
      try {
        // Объединяем все оставшиеся части в строку и пытаемся распарсить как JSON
        const dataStr = parts.slice(3).join(' ')
        data = JSON.parse(dataStr)
      } catch (e) {
        return await ctx.reply(
          '⚠️ Ошибка парсинга JSON данных. Проверьте формат данных.'
        )
      }
    }

    await ctx.reply(`🔄 Отправка ${method} запроса на ${url}...`)

    logger.info({
      message: '🌐 Выполняется HTTP запрос',
      method,
      url,
      dataLength: Object.keys(data).length,
    })

    const response = await axios({
      method,
      url,
      data: method !== 'GET' ? data : undefined,
      params:
        method === 'GET' && Object.keys(data).length > 0 ? data : undefined,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramBot/1.0',
      },
    })

    logger.info({
      message: '✅ HTTP запрос успешно выполнен',
      status: response.status,
      statusText: response.statusText,
    })

    // Отправляем результат запроса
    const result = JSON.stringify(response.data, null, 2)

    // Если результат слишком большой, отправляем частями
    if (result.length > 4000) {
      await ctx.reply(
        `📊 Получен ответ (статус: ${response.status}). Результат слишком большой, отправляю частями:`
      )

      // Разбиваем на части по 4000 символов
      for (let i = 0; i < result.length; i += 4000) {
        await ctx.reply(result.substring(i, i + 4000))
      }
    } else {
      await ctx.reply(
        `📊 Результат запроса (статус: ${response.status}):\n\n${result}`
      )
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при выполнении HTTP запроса',
      error: error.message,
      stack: error.stack,
    })

    let errorMessage = `❌ Ошибка при выполнении запроса: ${error.message}`

    // Добавляем детали ошибки, если есть
    if (error.response) {
      errorMessage += `\nСтатус: ${error.response.status} ${error.response.statusText}`
      if (error.response.data) {
        const errorData =
          typeof error.response.data === 'object'
            ? JSON.stringify(error.response.data, null, 2)
            : error.response.data
        errorMessage += `\nОтвет:\n${errorData}`
      }
    }

    await ctx.reply(errorMessage)
  }
})

export { httpRequestCommand }
