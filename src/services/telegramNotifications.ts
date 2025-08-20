import { MyContext } from '@/interfaces'
import { getBotNameByToken, getBotByToken } from '@/core/bot'
import { getBotToken } from '@/handlers/getBotToken'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { CompetitorSubscription } from '@/interfaces/instagram.interface'

// ==========================================
// NOTIFICATION SERVICE FOR INSTAGRAM PARSING
// ==========================================

export interface InstagramParsingResult {
  projectName: string
  targetUsername: string
  competitorsFound: number
  reelsFound?: number
  reportUrls?: {
    html?: string
    excel?: string
    archive?: string
  }
  processingTimeMs: number
  success: boolean
  error?: string
}

export interface CompetitorReelsNotification {
  subscription: CompetitorSubscription
  competitorUsername: string
  newReelsCount: number
  reels: Array<{
    id: string
    shortcode: string
    caption?: string
    media_url: string
    view_count?: number
    like_count?: number
    created_at: Date
  }>
  deliveryFormat: 'digest' | 'individual' | 'archive'
}

// Отправка уведомления о завершении парсинга Instagram
export async function sendInstagramParsingNotification(
  telegramId: string,
  botName: string,
  result: InstagramParsingResult
): Promise<void> {
  logger.info('[Telegram Notifications] Sending Instagram parsing notification', {
    telegramId,
    botName,
    success: result.success,
    competitorsFound: result.competitorsFound
  })

  try {
    // Получаем нужный бот по имени
    const bot = getBotByToken(getBotTokenByName(botName))
    
    if (!bot) {
      logger.error('[Telegram Notifications] Bot not found', { botName, telegramId })
      return
    }

    const isRu = await checkUserLanguage(telegramId, botName)

    if (result.success) {
      // Успешное завершение парсинга
      const message = isRu
        ? `🎉 **Анализ конкурентов Instagram завершён!**

📁 **Проект:** ${result.projectName}
👤 **Целевой аккаунт:** @${result.targetUsername}
📊 **Найдено конкурентов:** ${result.competitorsFound}
${result.reelsFound ? `🎬 **Рилсов проанализировано:** ${result.reelsFound}` : ''}
⏱️ **Время обработки:** ${Math.round(result.processingTimeMs / 1000)}с

${result.reportUrls ? `📄 **Отчёты готовы:**
${result.reportUrls.html ? `• [HTML отчёт](${result.reportUrls.html})` : ''}
${result.reportUrls.excel ? `• [Excel файл](${result.reportUrls.excel})` : ''}
${result.reportUrls.archive ? `• [ZIP архив](${result.reportUrls.archive})` : ''}` : ''}

💡 Используйте данные для улучшения вашей контент-стратегии!`
        : `🎉 **Instagram Competitor Analysis Complete!**

📁 **Project:** ${result.projectName}
👤 **Target Account:** @${result.targetUsername}
📊 **Competitors Found:** ${result.competitorsFound}
${result.reelsFound ? `🎬 **Reels Analyzed:** ${result.reelsFound}` : ''}
⏱️ **Processing Time:** ${Math.round(result.processingTimeMs / 1000)}s

${result.reportUrls ? `📄 **Reports Ready:**
${result.reportUrls.html ? `• [HTML Report](${result.reportUrls.html})` : ''}
${result.reportUrls.excel ? `• [Excel File](${result.reportUrls.excel})` : ''}
${result.reportUrls.archive ? `• [ZIP Archive](${result.reportUrls.archive})` : ''}` : ''}

💡 Use this data to improve your content strategy!`

      await bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: false
      })
    } else {
      // Ошибка в парсинге
      const message = isRu
        ? `❌ **Ошибка при анализе конкурентов Instagram**

📁 **Проект:** ${result.projectName}
👤 **Целевой аккаунт:** @${result.targetUsername}

**Причина ошибки:**
${result.error || 'Неизвестная ошибка сервера'}

💭 Попробуйте запустить анализ позже или обратитесь в поддержку.`
        : `❌ **Instagram Competitor Analysis Failed**

📁 **Project:** ${result.projectName}
👤 **Target Account:** @${result.targetUsername}

**Error Reason:**
${result.error || 'Unknown server error'}

💭 Please try running the analysis later or contact support.`

      await bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'Markdown'
      })
    }

    logger.info('[Telegram Notifications] Instagram parsing notification sent', {
      telegramId,
      botName,
      success: result.success
    })
  } catch (error) {
    logger.error('[Telegram Notifications] Error sending Instagram parsing notification', {
      error: error instanceof Error ? error.message : String(error),
      telegramId,
      botName,
      result
    })
  }
}

// Отправка уведомлений о новых рилсах конкурентов
export async function sendCompetitorReelsNotification(
  telegramId: string,
  botName: string,
  notification: CompetitorReelsNotification
): Promise<void> {
  logger.info('[Telegram Notifications] Sending competitor reels notification', {
    telegramId,
    botName,
    competitorUsername: notification.competitorUsername,
    newReelsCount: notification.newReelsCount,
    deliveryFormat: notification.deliveryFormat
  })

  try {
    const bot = getBotByToken(getBotTokenByName(botName))
    
    if (!bot) {
      logger.error('[Telegram Notifications] Bot not found', { botName, telegramId })
      return
    }

    const isRu = await checkUserLanguage(telegramId, botName)

    switch (notification.deliveryFormat) {
      case 'digest':
        await sendDigestNotification(bot, telegramId, notification, isRu)
        break
      case 'individual':
        await sendIndividualNotifications(bot, telegramId, notification, isRu)
        break
      case 'archive':
        await sendArchiveNotification(bot, telegramId, notification, isRu)
        break
    }

    logger.info('[Telegram Notifications] Competitor reels notification sent', {
      telegramId,
      botName,
      competitorUsername: notification.competitorUsername,
      deliveryFormat: notification.deliveryFormat
    })
  } catch (error) {
    logger.error('[Telegram Notifications] Error sending competitor reels notification', {
      error: error instanceof Error ? error.message : String(error),
      telegramId,
      botName,
      notification: {
        competitorUsername: notification.competitorUsername,
        newReelsCount: notification.newReelsCount
      }
    })
  }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getBotTokenByName(botName: string): string | null {
  // Здесь должна быть логика получения токена по имени бота
  // Пока возвращаем первый попавшийся токен для совместимости
  const tokens = [
    process.env.BOT_TOKEN,
    process.env.BOT_TOKEN_1,
    process.env.BOT_TOKEN_2,
    process.env.BOT_TOKEN_3,
    process.env.BOT_TOKEN_4,
    process.env.BOT_TOKEN_5,
    process.env.BOT_TOKEN_6,
    process.env.BOT_TOKEN_7
  ].filter(Boolean)

  return tokens[0] || null
}

async function checkUserLanguage(telegramId: string, botName: string): Promise<boolean> {
  // TODO: Реализовать проверку языка пользователя из БД
  // Пока возвращаем true (русский) по умолчанию
  return true
}

async function sendDigestNotification(
  bot: any,
  telegramId: string,
  notification: CompetitorReelsNotification,
  isRu: boolean
): Promise<void> {
  const { subscription, competitorUsername, newReelsCount, reels } = notification

  const message = isRu
    ? `📬 **Дайджест новых рилсов**

👤 **Конкурент:** @${competitorUsername}
🎬 **Новых рилсов:** ${newReelsCount}
📊 **Минимум просмотров:** ${subscription.min_views.toLocaleString()}

**Топ рилсы:**
${reels.slice(0, 5).map((reel, index) => 
  `${index + 1}. ${reel.view_count ? `👀 ${reel.view_count.toLocaleString()}` : '👀 N/A'} | [Смотреть](https://instagram.com/reel/${reel.shortcode})
${reel.caption ? `"${reel.caption.substring(0, 100)}${reel.caption.length > 100 ? '...' : ''}"` : ''}`
).join('\n\n')}

🔗 [Посмотреть все рилсы](https://instagram.com/${competitorUsername}/reels/)`
    : `📬 **New Reels Digest**

👤 **Competitor:** @${competitorUsername}
🎬 **New Reels:** ${newReelsCount}
📊 **Min Views:** ${subscription.min_views.toLocaleString()}

**Top Reels:**
${reels.slice(0, 5).map((reel, index) => 
  `${index + 1}. ${reel.view_count ? `👀 ${reel.view_count.toLocaleString()}` : '👀 N/A'} | [Watch](https://instagram.com/reel/${reel.shortcode})
${reel.caption ? `"${reel.caption.substring(0, 100)}${reel.caption.length > 100 ? '...' : ''}"` : ''}`
).join('\n\n')}

🔗 [View All Reels](https://instagram.com/${competitorUsername}/reels/)`

  await bot.telegram.sendMessage(telegramId, message, {
    parse_mode: 'Markdown',
    disable_web_page_preview: false
  })
}

async function sendIndividualNotifications(
  bot: any,
  telegramId: string,
  notification: CompetitorReelsNotification,
  isRu: boolean
): Promise<void> {
  const { competitorUsername, reels } = notification

  for (const reel of reels.slice(0, 10)) { // Лимитируем до 10 уведомлений за раз
    const message = isRu
      ? `🎬 **Новый рилс от @${competitorUsername}**

👀 **Просмотры:** ${reel.view_count ? reel.view_count.toLocaleString() : 'N/A'}
❤️ **Лайки:** ${reel.like_count ? reel.like_count.toLocaleString() : 'N/A'}
📅 **Дата:** ${reel.created_at.toLocaleDateString('ru-RU')}

${reel.caption ? `**Описание:**\n"${reel.caption.substring(0, 200)}${reel.caption.length > 200 ? '...' : ''}"` : ''}

🔗 [Посмотреть рилс](https://instagram.com/reel/${reel.shortcode})`
      : `🎬 **New Reel from @${competitorUsername}**

👀 **Views:** ${reel.view_count ? reel.view_count.toLocaleString() : 'N/A'}
❤️ **Likes:** ${reel.like_count ? reel.like_count.toLocaleString() : 'N/A'}
📅 **Date:** ${reel.created_at.toLocaleDateString('en-US')}

${reel.caption ? `**Caption:**\n"${reel.caption.substring(0, 200)}${reel.caption.length > 200 ? '...' : ''}"` : ''}

🔗 [Watch Reel](https://instagram.com/reel/${reel.shortcode})`

    await bot.telegram.sendMessage(telegramId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    })

    // Добавляем небольшую задержку между сообщениями
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

async function sendArchiveNotification(
  bot: any,
  telegramId: string,
  notification: CompetitorReelsNotification,
  isRu: boolean
): Promise<void> {
  // TODO: Реализовать создание и отправку ZIP архива с рилсами
  const message = isRu
    ? `📦 **Архив рилсов готов**

👤 **Конкурент:** @${competitorUsername}
🎬 **Рилсов в архиве:** ${notification.newReelsCount}

📋 Архив включает:
• Метаданные всех рилсов (JSON)
• Превью изображения
• Excel таблица с аналитикой
• HTML отчёт

⬇️ Архив будет отправлен отдельным сообщением`
    : `📦 **Reels Archive Ready**

👤 **Competitor:** @${notification.competitorUsername}
🎬 **Reels in Archive:** ${notification.newReelsCount}

📋 Archive includes:
• All reels metadata (JSON)
• Preview images
• Excel analytics table
• HTML report

⬇️ Archive will be sent in a separate message`

  await bot.telegram.sendMessage(telegramId, message, {
    parse_mode: 'Markdown'
  })
}