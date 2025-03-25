import { Composer } from 'telegraf'
import { MyContext } from '@/interfaces'
import { InngestService } from '../../services/inngest.service'

export const composer = new Composer<MyContext>()

// Команда для тестирования Inngest
composer.command('inngest_test', async ctx => {
  try {
    const user = ctx.from
    await ctx.reply('🔄 Отправляю тестовое событие в Inngest...')

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
    await ctx.reply(`❌ Ошибка при отправке события: ${error.message}`)
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

    await ctx.reply(`🔄 Отправляю событие "${eventName}" в Inngest...`)
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
    await ctx.reply(`❌ Ошибка при отправке события: ${error.message}`)
  }
})
