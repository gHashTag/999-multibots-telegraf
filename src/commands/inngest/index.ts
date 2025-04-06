import { Composer } from 'telegraf'
import { MyContext } from '@/interfaces'
import { InngestService } from '../../services/inngest.service'

export const composer = new Composer<MyContext>()

// Команда для тестирования Inngest
composer.command('inngest_test', async ctx => {
  try {
    const user = ctx.from
    await ctx.reply('🔄 Отправляем тестовое событие в Inngest...')

    const result = await InngestService.sendHelloWorldEvent({
      user_id: user?.id,
      username: user?.username,
      chat_id: ctx.chat?.id,
      bot_name: ctx.botInfo?.username,
    })

    await ctx.reply(
      `✅ Событие успешно отправлено!\n\nРезультат: ${JSON.stringify(
        result,
        null,
        2
      )}`
    )
  } catch (error) {
    console.error('❌ Ошибка при тестировании Inngest:', error)
    await ctx.reply(
      `❌ Ошибка при отправке события: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }
})

// Команда для отправки произвольного события
composer.command('inngest_send', async ctx => {
  try {
    const args = ctx.message.text.split(' ')
    if (args.length < 2) {
      return ctx.reply(
        '⚠️ Укажите имя события: /inngest_send имя.события [данные в формате JSON]'
      )
    }

    const eventName = args[1]
    let eventData = {}

    // Пытаемся разобрать JSON, если он есть
    if (args.length > 2) {
      try {
        const jsonStr = args.slice(2).join(' ')
        eventData = JSON.parse(jsonStr)
      } catch (e) {
        return ctx.reply('⚠️ Некорректный формат JSON для данных события')
      }
    }

    // Добавляем информацию о пользователе
    eventData = {
      ...eventData,
      user_id: ctx.from?.id,
      username: ctx.from?.username,
      chat_id: ctx.chat?.id,
      bot_name: ctx.botInfo?.username,
    }

    await ctx.reply(`🔄 Отправляем событие "${eventName}" в Inngest...`)
    const result = await InngestService.sendEvent(eventName, eventData)

    await ctx.reply(
      `✅ Событие успешно отправлено!\n\nРезультат: ${JSON.stringify(
        result,
        null,
        2
      )}`
    )
  } catch (error) {
    console.error('❌ Ошибка при отправке события Inngest:', error)
    await ctx.reply(
      `❌ Ошибка при отправке события: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }
})

// Команда для запуска массовой рассылки через Inngest
composer.command('broadcast', async ctx => {
  try {
    const args = ctx.message.text.split(' ')

    // Проверяем формат команды
    if (args.length < 3) {
      return ctx.reply(
        '⚠️ Некорректный формат команды.\n\n' +
          'Использование:\n/broadcast [imageUrl] [text]\n\n' +
          'Пример:\n/broadcast https://example.com/image.jpg Привет, это тестовое сообщение!'
      )
    }

    const imageUrl = args[1]
    const text = args.slice(2).join(' ')

    // Проверяем URL изображения
    if (!imageUrl.startsWith('http')) {
      return ctx.reply(
        '⚠️ URL изображения должен начинаться с http:// или https://'
      )
    }

    // Проверяем текст
    if (!text || text.length < 3) {
      return ctx.reply('⚠️ Текст сообщения слишком короткий')
    }

    const bot_name = ctx.botInfo?.username
    if (!bot_name) {
      return ctx.reply('❌ Не удалось определить имя бота')
    }

    await ctx.reply('🔄 Подготовка к запуску рассылки...')

    const result = await InngestService.startBroadcast(imageUrl, text, {
      bot_name,
      sender_telegram_id: ctx.from?.id?.toString(),
      test_mode: true, // По умолчанию делаем тестовую рассылку для безопасности
    })

    await ctx.reply(
      '✅ Рассылка запущена через Inngest!\n\n' +
        'ℹ️ По умолчанию включен тестовый режим (только для вас).\n' +
        'Для рассылки всем пользователям используйте команду:\n\n' +
        `/broadcast_all ${imageUrl} ${text}`
    )

    console.log('✅ Событие рассылки отправлено:', result)
  } catch (error) {
    console.error('❌ Ошибка при запуске рассылки:', error)
    await ctx.reply(
      `❌ Ошибка при запуске рассылки: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }
})

// Команда для запуска массовой рассылки ВСЕМ пользователям
composer.command('broadcast_all', async ctx => {
  try {
    const args = ctx.message.text.split(' ')

    // Проверяем формат команды
    if (args.length < 3) {
      return ctx.reply(
        '⚠️ Некорректный формат команды.\n\n' +
          'Использование:\n/broadcast_all [imageUrl] [text]\n\n' +
          'Пример:\n/broadcast_all https://example.com/image.jpg Привет, это массовая рассылка!'
      )
    }

    const imageUrl = args[1]
    const text = args.slice(2).join(' ')

    // Проверяем URL изображения
    if (!imageUrl.startsWith('http')) {
      return ctx.reply(
        '⚠️ URL изображения должен начинаться с http:// или https://'
      )
    }

    // Проверяем текст
    if (!text || text.length < 10) {
      return ctx.reply(
        '⚠️ Текст сообщения слишком короткий для массовой рассылки (минимум 10 символов)'
      )
    }

    const bot_name = ctx.botInfo?.username
    if (!bot_name) {
      return ctx.reply('❌ Не удалось определить имя бота')
    }

    // Запрашиваем подтверждение
    await ctx.reply(
      '⚠️ ВНИМАНИЕ! Вы собираетесь отправить сообщение ВСЕМ пользователям бота!\n\n' +
        'Для подтверждения отправьте:\n' +
        `/confirm_broadcast ${imageUrl} ${text.substring(0, 20)}...`
    )
  } catch (error) {
    console.error('❌ Ошибка при подготовке рассылки:', error)
    await ctx.reply(
      `❌ Ошибка: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
})

// Команда для подтверждения массовой рассылки
composer.command('confirm_broadcast', async ctx => {
  try {
    const args = ctx.message.text.split(' ')

    // Проверяем формат команды
    if (args.length < 3) {
      return ctx.reply('⚠️ Некорректный формат команды подтверждения')
    }

    const imageUrl = args[1]
    const text = args.slice(2).join(' ')

    const bot_name = ctx.botInfo?.username
    if (!bot_name) {
      return ctx.reply('❌ Не удалось определить имя бота')
    }

    await ctx.reply('🚀 Запускаем массовую рассылку ВСЕМ пользователям...')

    const result = await InngestService.startBroadcast(imageUrl, text, {
      bot_name,
      sender_telegram_id: ctx.from?.id?.toString(),
      test_mode: false, // Реальная рассылка всем пользователям
    })

    await ctx.reply(
      '✅ Массовая рассылка запущена!\n\n' +
        'Результаты обработки будут доступны в логах системы.'
    )

    console.log('✅ Событие массовой рассылки отправлено:', result)
  } catch (error) {
    console.error('❌ Ошибка при запуске массовой рассылки:', error)
    await ctx.reply(
      `❌ Ошибка при запуске массовой рассылки: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }
})
