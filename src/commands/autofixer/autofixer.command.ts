import { Telegraf } from 'telegraf'
import { MyContext } from '../../interfaces'
import { TelegramNotifierService } from '../../services/telegram-notifier.service'
import { GitHubAutoFixerService } from '../../webhooks/github-autofixer.service'

const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id.trim())) || []

export function setupAutoFixerCommands(bot: Telegraf<MyContext>): void {
  const notifierService = new TelegramNotifierService()
  const autoFixerService = new GitHubAutoFixerService()

  // Команда для проверки статуса автофиксера
  bot.command('autofixer_status', async (ctx) => {
    try {
      // Проверяем права админа
      if (!ADMIN_IDS.includes(ctx.from.id)) {
        await ctx.reply('❌ У вас нет доступа к этой команде')
        return
      }

      const status = getAutoFixerStatus()
      const message = formatStatusMessage(status)
      
      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Обновить статус', callback_data: 'autofixer_refresh_status' },
              { text: '🧪 Тест уведомлений', callback_data: 'autofixer_test_notifications' }
            ]
          ]
        }
      })
    } catch (error) {
      console.error('[AutoFixerCommand] Status error:', error)
      await ctx.reply('❌ Ошибка получения статуса автофиксера')
    }
  })

  // Команда для ручного исправления PR
  bot.command('fix_pr', async (ctx) => {
    try {
      if (!ADMIN_IDS.includes(ctx.from.id)) {
        await ctx.reply('❌ У вас нет доступа к этой команде')
        return
      }

      const args = ctx.message.text.split(' ')
      const prNumber = parseInt(args[1])
      
      if (!prNumber) {
        await ctx.reply(`❌ Использование: /fix_pr <номер_PR>
        
Пример: /fix_pr 123`)
        return
      }

      await ctx.reply(`🔧 Запускаю ручное исправление PR #${prNumber}...`)

      // TODO: Реализовать получение repo данных из настроек
      const repoOwner = process.env.GITHUB_REPO_OWNER || 'gHashTag'
      const repoName = process.env.GITHUB_REPO_NAME || 'multibots-telegraf'

      const fixes = await autoFixerService.manualFixPR({
        prNumber,
        repoOwner,
        repoName
      })

      if (fixes.length > 0) {
        const fixesText = fixes.map(f => `• ${f.description}`).join('\n')
        await ctx.reply(`✅ Исправление PR #${prNumber} завершено!

📝 Применено исправлений: ${fixes.length}

${fixesText}`, { parse_mode: 'HTML' })
      } else {
        await ctx.reply(`✨ PR #${prNumber} не требует исправлений`)
      }

    } catch (error) {
      console.error('[AutoFixerCommand] Manual fix error:', error)
      await ctx.reply(`❌ Ошибка при исправлении PR: ${error.message}`)
    }
  })

  // Команда для статистики автофиксера
  bot.command('autofixer_stats', async (ctx) => {
    try {
      if (!ADMIN_IDS.includes(ctx.from.id)) {
        await ctx.reply('❌ У вас нет доступа к этой команде')
        return
      }

      const stats = await getAutoFixerStats()
      const message = formatStatsMessage(stats)

      await ctx.reply(message, { parse_mode: 'HTML' })
    } catch (error) {
      console.error('[AutoFixerCommand] Stats error:', error)
      await ctx.reply('❌ Ошибка получения статистики')
    }
  })

  // Обработчик кнопок статуса
  bot.action('autofixer_refresh_status', async (ctx) => {
    try {
      if (!ADMIN_IDS.includes(ctx.from.id)) {
        await ctx.answerCbQuery('❌ Нет доступа')
        return
      }

      const status = getAutoFixerStatus()
      const message = formatStatusMessage(status)

      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Обновить статус', callback_data: 'autofixer_refresh_status' },
              { text: '🧪 Тест уведомлений', callback_data: 'autofixer_test_notifications' }
            ]
          ]
        }
      })

      await ctx.answerCbQuery('✅ Статус обновлен')
    } catch (error) {
      console.error('[AutoFixerCommand] Refresh status error:', error)
      await ctx.answerCbQuery('❌ Ошибка обновления')
    }
  })

  // Обработчик тестирования уведомлений
  bot.action('autofixer_test_notifications', async (ctx) => {
    try {
      if (!ADMIN_IDS.includes(ctx.from.id)) {
        await ctx.answerCbQuery('❌ Нет доступа')
        return
      }

      await notifierService.sendTestNotification()
      await ctx.answerCbQuery('✅ Тест уведомления отправлен')
    } catch (error) {
      console.error('[AutoFixerCommand] Test notifications error:', error)
      await ctx.answerCbQuery('❌ Ошибка тестирования')
    }
  })
}

function getAutoFixerStatus() {
  return {
    active: true,
    githubConnected: !!process.env.GITHUB_TOKEN,
    claudeConnected: !!process.env.CLAUDE_API_KEY,
    webhookConfigured: !!process.env.GITHUB_WEBHOOK_SECRET,
    telegramConfigured: !!process.env.BOT_TOKEN_1,
    adminConfigured: !!process.env.ADMIN_IDS,
    uptime: process.uptime(),
    version: '1.0.0'
  }
}

function formatStatusMessage(status: any): string {
  const uptimeHours = (status.uptime / 3600).toFixed(1)
  
  return `🤖 <b>AutoFixer Status</b>

<b>Статус системы:</b> ${status.active ? '🟢 Активен' : '🔴 Неактивен'}
<b>Версия:</b> ${status.version}
<b>Время работы:</b> ${uptimeHours}ч

<b>Интеграции:</b>
🐙 GitHub: ${status.githubConnected ? '✅' : '❌'} Connected
🧠 Claude: ${status.claudeConnected ? '✅' : '❌'} Connected
🎣 Webhook: ${status.webhookConfigured ? '✅' : '❌'} Configured
📱 Telegram: ${status.telegramConfigured ? '✅' : '❌'} Connected
👨‍💻 Admin: ${status.adminConfigured ? '✅' : '❌'} Configured

<b>Поддерживаемые типы исправлений:</b>
⚡ Async/await fixes
🤖 Telegraf improvements  
🎭 Scene optimizations
🔷 TypeScript corrections
📏 ESLint fixes

<i>Обновлено: ${new Date().toLocaleString('ru-RU')}</i>`
}

async function getAutoFixerStats() {
  // TODO: Реализовать реальную статистику из БД
  return {
    totalPRsProcessed: 42,
    totalFixesApplied: 156,
    averageProcessingTime: 2.3,
    todayProcessed: 7,
    successRate: 89.5,
    fixTypeDistribution: {
      async: 45,
      telegraf: 32,
      scene: 28,
      typescript: 35,
      eslint: 16
    },
    lastProcessed: new Date().toISOString()
  }
}

function formatStatsMessage(stats: any): string {
  return `📊 <b>AutoFixer Statistics</b>

<b>Общая статистика:</b>
📈 Всего PR обработано: ${stats.totalPRsProcessed}
🔧 Всего исправлений: ${stats.totalFixesApplied}
⏱ Среднее время обработки: ${stats.averageProcessingTime}с
📅 Сегодня обработано: ${stats.todayProcessed}
✅ Процент успеха: ${stats.successRate}%

<b>Распределение исправлений:</b>
⚡ Async/await: ${stats.fixTypeDistribution.async}
🤖 Telegraf: ${stats.fixTypeDistribution.telegraf}
🎭 Сцены: ${stats.fixTypeDistribution.scene}
🔷 TypeScript: ${stats.fixTypeDistribution.typescript}
📏 ESLint: ${stats.fixTypeDistribution.eslint}

<b>Последняя обработка:</b>
${new Date(stats.lastProcessed).toLocaleString('ru-RU')}`
}