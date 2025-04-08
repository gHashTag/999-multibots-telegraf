import { Composer } from 'telegraf'
import { glamaMcpService } from '@/services/glamaMcpService'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

/**
 * Команда для работы с Glama MCP серверами
 */
const glamaMcpCommand = new Composer<MyContext>()

// Обработчик команды /glamaservers для получения списка всех серверов
glamaMcpCommand.command('glamaservers', async ctx => {
  try {
    await ctx.reply('🔍 Поиск доступных серверов Glama MCP...')

    const servers = await glamaMcpService.getServers()

    if (!servers || servers.length === 0) {
      return await ctx.reply('ℹ️ Серверы Glama MCP не найдены.')
    }

    const serverList = servers
      .map((server, index) => {
        return `${index + 1}. <b>${server.name}</b> — ID: <code>${
          server.id
        }</code>`
      })
      .join('\n')

    await ctx.replyWithHTML(
      `<b>📋 Найдено серверов: ${servers.length}</b>\n\n${serverList}\n\n` +
        'Используйте команду /glamaserver ID для получения подробной информации о сервере.'
    )

    logger.info({
      message: '✅ Показан список серверов Glama MCP',
      count: servers.length,
      chat_id: ctx.chat?.id,
      user_id: ctx.from?.id,
    })

    return true
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при запросе серверов Glama MCP',
      error: error instanceof Error ? error.message : 'Unknown error',
      chat_id: ctx.chat?.id,
      user_id: ctx.from?.id,
    })

    await ctx.reply(
      `❌ Произошла ошибка при запросе серверов Glama MCP: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
    return false
  }
})

// Обработчик команды /glamaserver для получения информации о конкретном сервере
glamaMcpCommand.command('glamaserver', async ctx => {
  try {
    const serverId = ctx.message.text.split(' ')[1]

    if (!serverId) {
      return await ctx.reply(
        '⚠️ Пожалуйста, укажите ID сервера.\n' +
          'Пример: /glamaserver server-id-123'
      )
    }

    await ctx.reply(`🔍 Получение информации о сервере ${serverId}...`)

    const server = await glamaMcpService.getServerById(serverId)

    const environmentVars = server.environmentVariablesJsonSchema?.required
      ?.length
      ? `\n\n<b>Требуемые переменные окружения:</b>\n` +
        server.environmentVariablesJsonSchema.required
          .map(v => `<code>${v}</code>`)
          .join('\n')
      : ''

    const repoUrl = server.repository?.url
      ? `\n<b>Репозиторий:</b> <a href="${server.repository.url}">${server.repository.url}</a>`
      : ''

    const license = server.spdxLicense
      ? `\n<b>Лицензия:</b> ${server.spdxLicense.name}`
      : ''

    await ctx.replyWithHTML(
      `<b>📡 Сервер: ${server.name}</b>\n` +
        `<b>ID:</b> <code>${server.id}</code>\n` +
        `<b>Описание:</b> ${server.description || 'Нет описания'}` +
        repoUrl +
        license +
        environmentVars +
        `\n\n<a href="${server.url}">Открыть страницу сервера</a>`
    )

    logger.info({
      message: '✅ Показана информация о сервере Glama MCP',
      serverId,
      chat_id: ctx.chat?.id,
      user_id: ctx.from?.id,
    })

    return true
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при запросе информации о сервере Glama MCP',
      error: error instanceof Error ? error.message : 'Unknown error',
      chat_id: ctx.chat?.id,
      user_id: ctx.from?.id,
    })

    await ctx.reply(
      `❌ Произошла ошибка при запросе информации о сервере: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
    return false
  }
})

export { glamaMcpCommand }
