/**
 * 🤖 Autonomous Monitor - Admin Bot Commands
 *
 * Production server monitoring and management via Telegram
 */

import { Telegraf, Markup } from 'telegraf'
import { MyContext } from '../interfaces'
import { execSync } from 'child_process'

const ADMIN_TELEGRAM_ID = '144022504'
const SERVER_HOST = '212.86.115.30'
const SERVER_USER = 'root'
const SSH_KEY = '~/.ssh/zomro'
const CONTAINER_NAME = '999-multibots'

/**
 * SSH helper to execute commands on production server
 */
function sshExec(command: string): string {
  try {
    const sshCommand = `ssh -i ${SSH_KEY} ${SERVER_USER}@${SERVER_HOST} '${command}'`
    return execSync(sshCommand, { encoding: 'utf-8', timeout: 30000 })
  } catch (error: any) {
    throw new Error(`SSH execution failed: ${error.message}`)
  }
}

/**
 * Check if user is admin
 */
function isAdmin(userId: number): boolean {
  return userId.toString() === ADMIN_TELEGRAM_ID
}

/**
 * Setup autonomous monitor commands
 */
export function setupAutonomousMonitor(bot: Telegraf<MyContext>) {
  // Get bot info to check if this is the admin bot
  bot.telegram.getMe().then(botInfo => {
    console.log(`🔍 [Autonomous Monitor] Checking if ${botInfo.username} is admin bot...`)

    // Only activate autonomous monitor for specific bot
    // This will be determined by environment variable or bot token
  })

  /**
   * /start - Main menu for admin bot
   */
  bot.command('start', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('❌ Unauthorized. This bot is for admin use only.')
    }

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Статус', 'monitor_status'),
        Markup.button.callback('📋 Логи', 'monitor_logs'),
      ],
      [
        Markup.button.callback('🚨 Ошибки', 'monitor_errors'),
        Markup.button.callback('📈 Метрики', 'monitor_metrics'),
      ],
      [
        Markup.button.callback('🔄 Рестарт', 'monitor_restart'),
        Markup.button.callback('❓ Помощь', 'monitor_help'),
      ],
    ])

    await ctx.reply(
      `🤖 *Autonomous Monitor Admin Bot*\n\n` +
        `Добро пожаловать!\n\n` +
        `Сервер: \`${SERVER_HOST}\`\n` +
        `Контейнер: \`${CONTAINER_NAME}\`\n\n` +
        `Выбери действие:`,
      { parse_mode: 'Markdown', ...keyboard }
    )
  })

  /**
   * /status - Server and container status
   */
  bot.command('status', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return

    try {
      await ctx.reply('🔄 Получаю статус сервера...')

      // Get container status
      const containerStatus = sshExec(
        `docker ps --filter name=${CONTAINER_NAME} --format "{{.Status}}"`
      ).trim()

      // Get resource usage
      const stats = sshExec(
        `docker stats ${CONTAINER_NAME} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}"`
      ).trim()

      const [cpu, mem, net] = stats.split('|')

      // Parse CPU percentage
      const cpuPercent = parseFloat(cpu.replace('%', ''))
      const cpuBar = createProgressBar(cpuPercent, 100)
      const cpuStatus = cpuPercent > 80 ? '🔴' : cpuPercent > 50 ? '🟡' : '🟢'

      // Parse memory
      const memMatch = mem.match(/(\d+\.?\d*)\s*(\w+)\s*\/\s*(\d+\.?\d*)\s*(\w+)/)
      const memPercent = memMatch
        ? (parseFloat(memMatch[1]) / parseFloat(memMatch[3])) * 100
        : 0
      const memBar = createProgressBar(memPercent, 100)
      const memStatus = memPercent > 80 ? '🔴' : memPercent > 60 ? '🟡' : '🟢'

      const message =
        `${containerStatus.includes('Up') ? '🟢' : '🔴'} *Production Status*\n\n` +
        `Container: \`${CONTAINER_NAME}\`\n` +
        `Status: ${containerStatus}\n\n` +
        `📊 *Resources:*\n\n` +
        `CPU Usage:\n${cpuStatus} ${cpuBar} ${cpu}\n\n` +
        `Memory Usage:\n${memStatus} ${memBar} ${memPercent.toFixed(1)}%\n\n` +
        `Memory: ${mem}\n` +
        `Network: ${net}\n\n` +
        `Обновлено: ${new Date().toLocaleString('ru-RU')}`

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Обновить', 'monitor_status')],
        [Markup.button.callback('📋 Логи', 'monitor_logs')],
      ])

      await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard })
    } catch (error: any) {
      await ctx.reply(`❌ Ошибка получения статуса:\n\`\`\`\n${error.message}\n\`\`\``, {
        parse_mode: 'Markdown',
      })
    }
  })

  /**
   * /logs - View container logs
   */
  bot.command('logs', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📄 50 строк', 'logs_50'),
        Markup.button.callback('📄 100 строк', 'logs_100'),
      ],
      [
        Markup.button.callback('📄 200 строк', 'logs_200'),
        Markup.button.callback('📄 500 строк', 'logs_500'),
      ],
      [Markup.button.callback('🔍 Только ошибки', 'logs_errors')],
    ])

    await ctx.reply('📋 Выбери количество строк для просмотра:', keyboard)
  })

  /**
   * /errors - Find errors in logs
   */
  bot.command('errors', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return

    try {
      await ctx.reply('🔍 Ищу ошибки в логах...')

      const logs = sshExec(`docker logs ${CONTAINER_NAME} --tail 500 2>&1`)

      // Find common error patterns
      const errorPatterns = {
        MODULE_NOT_FOUND: /Error: Cannot find module|MODULE_NOT_FOUND/g,
        TYPE_ERROR: /TypeError:/g,
        UNHANDLED_REJECTION: /UnhandledPromiseRejectionWarning/g,
        FATAL_ERROR: /FATAL ERROR/g,
      }

      const errors: { type: string; count: number; example: string }[] = []

      for (const [type, pattern] of Object.entries(errorPatterns)) {
        const matches = logs.match(pattern)
        if (matches && matches.length > 0) {
          // Find first occurrence for example
          const lines = logs.split('\n')
          const exampleLine = lines.find((line) => pattern.test(line)) || ''

          errors.push({
            type,
            count: matches.length,
            example: exampleLine.substring(0, 100),
          })
        }
      }

      if (errors.length === 0) {
        await ctx.reply('✅ Ошибок не обнаружено!', {
          reply_markup: {
            inline_keyboard: [[{ text: '🔄 Проверить снова', callback_data: 'monitor_errors' }]],
          },
        })
        return
      }

      let message = `🚨 *Обнаружено ошибок: ${errors.length} типов*\n\n`

      for (const error of errors) {
        const icon = error.count > 5 ? '🔴' : error.count > 2 ? '🟠' : '🟡'
        message += `${icon} *${error.type}*\n`
        message += `Найдено: ${error.count} вхождений\n`
        message += `Пример:\n\`${error.example}\`\n\n`
      }

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Полные логи', 'logs_500')],
        [Markup.button.callback('🔄 Обновить', 'monitor_errors')],
      ])

      await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard })
    } catch (error: any) {
      await ctx.reply(`❌ Ошибка поиска:\n\`\`\`\n${error.message}\n\`\`\``, {
        parse_mode: 'Markdown',
      })
    }
  })

  /**
   * /metrics - Server metrics
   */
  bot.command('metrics', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return

    try {
      await ctx.reply('📊 Собираю метрики...')

      // Get uptime
      const uptime = sshExec(`uptime -p`).trim()

      // Get disk usage
      const disk = sshExec(`df -h / | tail -1 | awk '{print $5 " used (" $3 "/" $2 ")"}'`).trim()

      // Get load average
      const load = sshExec(`uptime | awk -F'load average:' '{print $2}'`).trim()

      // Get container count
      const containers = sshExec(`docker ps -q | wc -l`).trim()

      const message =
        `📈 *Server Metrics*\n\n` +
        `⏱ Uptime: ${uptime}\n` +
        `💾 Disk: ${disk}\n` +
        `⚡️ Load: ${load}\n` +
        `🐳 Containers: ${containers}\n\n` +
        `Сервер: \`${SERVER_HOST}\`\n` +
        `Обновлено: ${new Date().toLocaleString('ru-RU')}`

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Обновить', 'monitor_metrics')],
        [Markup.button.callback('📊 Статус', 'monitor_status')],
      ])

      await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard })
    } catch (error: any) {
      await ctx.reply(`❌ Ошибка получения метрик:\n\`\`\`\n${error.message}\n\`\`\``, {
        parse_mode: 'Markdown',
      })
    }
  })

  /**
   * /restart - Restart container (with confirmation)
   */
  bot.command('restart', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Да, перезапустить', 'restart_confirm'),
        Markup.button.callback('❌ Отмена', 'restart_cancel'),
      ],
    ])

    await ctx.reply(
      `⚠️ *Подтверждение перезапуска*\n\n` +
        `Контейнер: \`${CONTAINER_NAME}\`\n` +
        `Сервер: \`${SERVER_HOST}\`\n\n` +
        `Это приведет к кратковременному downtime (~10-20 секунд).\n\n` +
        `Вы уверены?`,
      { parse_mode: 'Markdown', ...keyboard }
    )
  })

  /**
   * /help - Show help
   */
  bot.command('help', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return

    const message =
      `❓ *Помощь - Команды бота*\n\n` +
      `*Мониторинг:*\n` +
      `/status - Статус сервера и контейнера\n` +
      `/logs - Просмотр логов\n` +
      `/errors - Поиск ошибок в логах\n` +
      `/metrics - CPU, Memory, Disk метрики\n\n` +
      `*Управление:*\n` +
      `/restart - Перезапуск контейнера\n\n` +
      `*Общее:*\n` +
      `/help - Показать эту справку\n` +
      `/start - Главное меню\n\n` +
      `🔒 Все команды доступны только админу (ID: ${ADMIN_TELEGRAM_ID})`

    await ctx.reply(message, { parse_mode: 'Markdown' })
  })

  // ========================================
  // CALLBACK QUERY HANDLERS
  // ========================================

  /**
   * Handle inline keyboard callbacks
   */
  bot.action(/^monitor_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Unauthorized')
      return
    }

    const action = ctx.match[1]

    await ctx.answerCbQuery()

    switch (action) {
      case 'status':
        // Re-run status command
        await ctx.editMessageText('🔄 Получаю статус сервера...')
        // Execute status logic directly
        try {
          const containerStatus = sshExec(
            `docker ps --filter name=${CONTAINER_NAME} --format "{{.Status}}"`
          ).trim()

          const stats = sshExec(
            `docker stats ${CONTAINER_NAME} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}"`
          ).trim()

          const [cpu, mem, net] = stats.split('|')
          const cpuPercent = parseFloat(cpu.replace('%', ''))
          const cpuBar = createProgressBar(cpuPercent, 100)
          const cpuStatus = cpuPercent > 80 ? '🔴' : cpuPercent > 50 ? '🟡' : '🟢'

          const memMatch = mem.match(/(\d+\.?\d*)\s*(\w+)\s*\/\s*(\d+\.?\d*)\s*(\w+)/)
          const memPercent = memMatch
            ? (parseFloat(memMatch[1]) / parseFloat(memMatch[3])) * 100
            : 0
          const memBar = createProgressBar(memPercent, 100)
          const memStatus = memPercent > 80 ? '🔴' : memPercent > 60 ? '🟡' : '🟢'

          const message =
            `${containerStatus.includes('Up') ? '🟢' : '🔴'} *Production Status*\n\n` +
            `Container: \`${CONTAINER_NAME}\`\n` +
            `Status: ${containerStatus}\n\n` +
            `📊 *Resources:*\n\n` +
            `CPU Usage:\n${cpuStatus} ${cpuBar} ${cpu}\n\n` +
            `Memory Usage:\n${memStatus} ${memBar} ${memPercent.toFixed(1)}%\n\n` +
            `Memory: ${mem}\n` +
            `Network: ${net}\n\n` +
            `Обновлено: ${new Date().toLocaleString('ru-RU')}`

          const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Обновить', 'monitor_status')],
            [Markup.button.callback('📋 Логи', 'monitor_logs')],
          ])

          await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard })
        } catch (error: any) {
          await ctx.editMessageText(`❌ Ошибка получения статуса:\n\`\`\`\n${error.message}\n\`\`\``, {
            parse_mode: 'Markdown',
          })
        }
        break

      case 'logs':
        // Show logs menu
        const logsKeyboard = Markup.inlineKeyboard([
          [
            Markup.button.callback('📄 50 строк', 'logs_50'),
            Markup.button.callback('📄 100 строк', 'logs_100'),
          ],
          [
            Markup.button.callback('📄 200 строк', 'logs_200'),
            Markup.button.callback('📄 500 строк', 'logs_500'),
          ],
          [Markup.button.callback('🔍 Только ошибки', 'logs_errors')],
        ])
        await ctx.editMessageText('📋 Выбери количество строк для просмотра:', logsKeyboard)
        break

      case 'errors':
        // Re-run error detection
        await ctx.editMessageText('🔍 Ищу ошибки в логах...')
        try {
          const logs = sshExec(`docker logs ${CONTAINER_NAME} --tail 500 2>&1`)

          const errorPatterns = {
            MODULE_NOT_FOUND: /Error: Cannot find module|MODULE_NOT_FOUND/g,
            TYPE_ERROR: /TypeError:/g,
            UNHANDLED_REJECTION: /UnhandledPromiseRejectionWarning/g,
            FATAL_ERROR: /FATAL ERROR/g,
          }

          const errors: { type: string; count: number; example: string }[] = []

          for (const [type, pattern] of Object.entries(errorPatterns)) {
            const matches = logs.match(pattern)
            if (matches && matches.length > 0) {
              const lines = logs.split('\n')
              const exampleLine = lines.find((line) => pattern.test(line)) || ''
              errors.push({
                type,
                count: matches.length,
                example: exampleLine.substring(0, 100),
              })
            }
          }

          if (errors.length === 0) {
            const keyboard = Markup.inlineKeyboard([[{ text: '🔄 Проверить снова', callback_data: 'monitor_errors' }]])
            await ctx.editMessageText('✅ Ошибок не обнаружено!', keyboard)
            break
          }

          let message = `🚨 *Обнаружено ошибок: ${errors.length} типов*\n\n`
          for (const error of errors) {
            const icon = error.count > 5 ? '🔴' : error.count > 2 ? '🟠' : '🟡'
            message += `${icon} *${error.type}*\n`
            message += `Найдено: ${error.count} вхождений\n`
            message += `Пример:\n\`${error.example}\`\n\n`
          }

          const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 Полные логи', 'logs_500')],
            [Markup.button.callback('🔄 Обновить', 'monitor_errors')],
          ])

          await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard })
        } catch (error: any) {
          await ctx.editMessageText(`❌ Ошибка: ${error.message}`)
        }
        break

      case 'metrics':
        // Re-fetch metrics
        await ctx.editMessageText('📊 Собираю метрики...')
        try {
          const uptime = sshExec(`uptime -p`).trim()
          const disk = sshExec(`df -h / | tail -1 | awk '{print $5 " used (" $3 "/" $2 ")"}'`).trim()
          const load = sshExec(`uptime | awk -F'load average:' '{print $2}'`).trim()
          const containers = sshExec(`docker ps -q | wc -l`).trim()

          const message =
            `📈 *Server Metrics*\n\n` +
            `⏱ Uptime: ${uptime}\n` +
            `💾 Disk: ${disk}\n` +
            `⚡️ Load: ${load}\n` +
            `🐳 Containers: ${containers}\n\n` +
            `Сервер: \`${SERVER_HOST}\`\n` +
            `Обновлено: ${new Date().toLocaleString('ru-RU')}`

          const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Обновить', 'monitor_metrics')],
            [Markup.button.callback('📊 Статус', 'monitor_status')],
          ])

          await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard })
        } catch (error: any) {
          await ctx.editMessageText(`❌ Ошибка получения метрик:\n\`\`\`\n${error.message}\n\`\`\``, {
            parse_mode: 'Markdown',
          })
        }
        break

      case 'help':
        // Show help
        const helpMessage =
          `❓ *Помощь - Команды бота*\n\n` +
          `*Мониторинг:*\n` +
          `/status - Статус сервера и контейнера\n` +
          `/logs - Просмотр логов\n` +
          `/errors - Поиск ошибок в логах\n` +
          `/metrics - CPU, Memory, Disk метрики\n\n` +
          `*Управление:*\n` +
          `/restart - Перезапуск контейнера\n\n` +
          `*Общее:*\n` +
          `/help - Показать эту справку\n` +
          `/start - Главное меню\n\n` +
          `🔒 Все команды доступны только админу (ID: ${ADMIN_TELEGRAM_ID})`

        await ctx.editMessageText(helpMessage, { parse_mode: 'Markdown' })
        break
    }
  })

  /**
   * Handle logs callbacks
   */
  bot.action(/^logs_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Unauthorized')
      return
    }

    const action = ctx.match[1]
    await ctx.answerCbQuery()

    try {
      let command = ''

      if (action === 'errors') {
        command = `docker logs ${CONTAINER_NAME} --tail 500 2>&1 | grep -i "error\\|warning\\|fatal"`
      } else {
        const lines = parseInt(action)
        command = `docker logs ${CONTAINER_NAME} --tail ${lines}`
      }

      await ctx.editMessageText(`📋 Получаю логи...`)

      const logs = sshExec(command)

      // Send logs as text file if too long
      if (logs.length > 3000) {
        const filename = `logs-${Date.now()}.txt`
        await ctx.replyWithDocument({
          source: Buffer.from(logs),
          filename,
        })
      } else {
        await ctx.editMessageText(`\`\`\`\n${logs}\n\`\`\``, { parse_mode: 'Markdown' })
      }
    } catch (error: any) {
      await ctx.editMessageText(`❌ Ошибка получения логов:\n\`\`\`\n${error.message}\n\`\`\``, {
        parse_mode: 'Markdown',
      })
    }
  })

  /**
   * Handle restart confirmation
   */
  bot.action('restart_confirm', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Unauthorized')
      return
    }

    await ctx.answerCbQuery()
    await ctx.editMessageText('🔄 Начинаю перезапуск контейнера...')

    try {
      sshExec(`docker restart ${CONTAINER_NAME}`)

      // Wait a bit and check status
      await new Promise((resolve) => setTimeout(resolve, 5000))

      const status = sshExec(
        `docker ps --filter name=${CONTAINER_NAME} --format "{{.Status}}"`
      ).trim()

      await ctx.editMessageText(
        `✅ *Контейнер перезапущен успешно!*\n\n📊 Новый статус:\n\`${status}\``,
        { parse_mode: 'Markdown' }
      )
    } catch (error: any) {
      await ctx.editMessageText(`❌ Ошибка перезапуска:\n\`\`\`\n${error.message}\n\`\`\``, {
        parse_mode: 'Markdown',
      })
    }
  })

  /**
   * Handle restart cancel
   */
  bot.action('restart_cancel', async (ctx) => {
    await ctx.answerCbQuery('❌ Перезапуск отменен')
    await ctx.editMessageText('❌ Перезапуск отменен')
  })

  console.log('✅ [Autonomous Monitor] Commands registered')
}

/**
 * Create ASCII progress bar
 */
function createProgressBar(value: number, max: number, length: number = 10): string {
  const percent = Math.min(100, (value / max) * 100)
  const filled = Math.round((percent / 100) * length)
  const empty = length - filled

  return '▓'.repeat(filled) + '░'.repeat(empty)
}
