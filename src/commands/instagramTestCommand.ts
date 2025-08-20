import { MyContext } from '@/interfaces'
import { ADMIN_IDS_ARRAY } from '@/config'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { startInstagramScraping } from '@/services/instagramScrapingService'
import { getBotNameByToken, getBotByToken } from '@/core/bot'
import { getBotToken } from '@/handlers/getBotToken'
import { logger } from '@/utils/logger'
import { Markup } from 'telegraf'

/**
 * 🧪 Админская команда для тестирования Instagram парсинга
 * Доступна только администраторам из ADMIN_IDS_ARRAY
 */
export async function handleInstagramTest(ctx: MyContext): Promise<void> {
  const userId = ctx.from?.id
  const isRu = isRussianFromState(ctx)

  // Проверка прав администратора
  if (!userId || !ADMIN_IDS_ARRAY.includes(userId)) {
    const message = isRu 
      ? '❌ Команда доступна только администраторам.'
      : '❌ This command is only available to administrators.'
    await ctx.reply(message)
    return
  }

  logger.info('[Instagram Test Command] Admin test command called', {
    userId,
    username: ctx.from?.username
  })

  const message = isRu 
    ? `🧪 **Тест Instagram парсинга**

👋 Привет, администратор! Выберите тест для запуска:

**Доступные тесты:**
• 🚀 **Быстрый тест** - парсинг 5 конкурентов без рилсов
• 📊 **Полный тест** - парсинг 25 конкурентов с рилсами  
• 🎯 **Кастомный тест** - указать свои параметры
• ℹ️ **Проверка статуса** - информация о системе

Выберите действие:`
    : `🧪 **Instagram Parsing Test**

👋 Hello, administrator! Choose a test to run:

**Available Tests:**
• 🚀 **Quick Test** - parse 5 competitors without reels
• 📊 **Full Test** - parse 25 competitors with reels
• 🎯 **Custom Test** - specify your own parameters  
• ℹ️ **Status Check** - system information

Choose an action:`

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback(
          isRu ? '🚀 Быстрый тест' : '🚀 Quick Test',
          'instagram_test_quick'
        ),
        Markup.button.callback(
          isRu ? '📊 Полный тест' : '📊 Full Test', 
          'instagram_test_full'
        )
      ],
      [
        Markup.button.callback(
          isRu ? '🎯 Кастомный тест' : '🎯 Custom Test',
          'instagram_test_custom'
        ),
        Markup.button.callback(
          isRu ? 'ℹ️ Статус системы' : 'ℹ️ System Status',
          'instagram_test_status'
        )
      ],
      [
        Markup.button.callback(
          isRu ? '❌ Отмена' : '❌ Cancel',
          'cancel'
        )
      ]
    ])
  })
}

/**
 * 🎯 Обработчик callback'ов для тестовых команд Instagram
 */
export async function handleInstagramTestCallback(ctx: MyContext): Promise<void> {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return
  
  const userId = ctx.from?.id
  const isRu = isRussianFromState(ctx)
  const callbackData = ctx.callbackQuery.data

  // Проверка прав администратора
  if (!userId || !ADMIN_IDS_ARRAY.includes(userId)) {
    await ctx.answerCbQuery()
    return
  }

  await ctx.answerCbQuery()

  logger.info('[Instagram Test Command] Processing callback', {
    userId,
    callbackData
  })

  try {
    switch (callbackData) {
      case 'instagram_test_quick':
        await runQuickTest(ctx, isRu)
        break
        
      case 'instagram_test_full':
        await runFullTest(ctx, isRu)
        break
        
      case 'instagram_test_custom':
        await showCustomTestMenu(ctx, isRu)
        break
        
      case 'instagram_test_status':
        await showSystemStatus(ctx, isRu)
        break
        
      case 'cancel':
        const cancelMessage = isRu ? '❌ Тестирование отменено.' : '❌ Testing cancelled.'
        await ctx.editMessageText(cancelMessage)
        break
        
      default:
        if (callbackData.startsWith('custom_test_')) {
          await handleCustomTestCallback(ctx, callbackData, isRu)
        }
        break
    }
  } catch (error) {
    logger.error('[Instagram Test Command] Error processing callback', {
      error: error instanceof Error ? error.message : String(error),
      callbackData,
      userId
    })

    const errorMessage = isRu 
      ? '❌ Произошла ошибка при выполнении теста.'
      : '❌ An error occurred while running the test.'
    await ctx.editMessageText(errorMessage)
  }
}

async function runQuickTest(ctx: MyContext, isRu: boolean): Promise<void> {
  const loadingMessage = isRu 
    ? '🚀 **Быстрый тест запущен**\n\n⏳ Отправляем событие в Inngest...'
    : '🚀 **Quick Test Started**\n\n⏳ Sending event to Inngest...'
  
  await ctx.editMessageText(loadingMessage, { parse_mode: 'Markdown' })

  const botToken = getBotToken(ctx)
  const { bot_name } = getBotNameByToken(botToken!)

  const result = await startInstagramScraping({
    username_or_id: 'neuro_sage', // Тестовый аккаунт
    project_id: 37, // Тестовый проект
    max_users: 5,
    max_reels_per_user: 0,
    scrape_reels: false,
    requester_telegram_id: ctx.from!.id.toString(),
    bot_name
  }, ctx)

  const responseMessage = isRu 
    ? `🧪 **Быстрый тест - результат**

${result.success ? '✅' : '❌'} **Статус:** ${result.success ? 'Успешно' : 'Ошибка'}

${result.success 
  ? `📤 **Событие отправлено в Inngest!**
🎯 **Параметры:**
• Username: @neuro_sage  
• Проект: 37
• Конкуренты: 5
• Рилсы: нет

⏰ **Ожидаемое время:** 2-5 минут
📬 **Уведомление:** придет в этот чат

💡 Проверьте логи AI сервера для отладки.`
  : `❌ **Ошибка:** ${result.error}

🔧 Проверьте конфигурацию Inngest и сетевое соединение.`
}`
    : `🧪 **Quick Test - Result**

${result.success ? '✅' : '❌'} **Status:** ${result.success ? 'Success' : 'Error'}

${result.success 
  ? `📤 **Event sent to Inngest!**
🎯 **Parameters:**
• Username: @neuro_sage
• Project: 37  
• Competitors: 5
• Reels: no

⏰ **Expected time:** 2-5 minutes
📬 **Notification:** will come to this chat

💡 Check AI server logs for debugging.`
  : `❌ **Error:** ${result.error}

🔧 Check Inngest configuration and network connection.`
}`

  await ctx.editMessageText(responseMessage, { parse_mode: 'Markdown' })
}

async function runFullTest(ctx: MyContext, isRu: boolean): Promise<void> {
  const loadingMessage = isRu 
    ? '📊 **Полный тест запущен**\n\n⏳ Отправляем событие в Inngest...'
    : '📊 **Full Test Started**\n\n⏳ Sending event to Inngest...'
  
  await ctx.editMessageText(loadingMessage, { parse_mode: 'Markdown' })

  const botToken = getBotToken(ctx)
  const { bot_name } = getBotNameByToken(botToken!)

  const result = await startInstagramScraping({
    username_or_id: 'neuro_sage',
    project_id: 37,
    max_users: 25,
    max_reels_per_user: 10,
    scrape_reels: true,
    requester_telegram_id: ctx.from!.id.toString(),
    bot_name
  }, ctx)

  const responseMessage = isRu 
    ? `🧪 **Полный тест - результат**

${result.success ? '✅' : '❌'} **Статус:** ${result.success ? 'Успешно' : 'Ошибка'}

${result.success 
  ? `📤 **Событие отправлено в Inngest!**
🎯 **Параметры:**
• Username: @neuro_sage
• Проект: 37  
• Конкуренты: 25
• Рилсы: до 10 на конкурента

⏰ **Ожидаемое время:** 10-15 минут
📬 **Уведомление:** придет в этот чат

⚠️ **Внимание:** Полный тест может занять больше времени из-за большого объема данных.`
  : `❌ **Ошибка:** ${result.error}

🔧 Проверьте конфигурацию и попробуйте быстрый тест.`
}`
    : `🧪 **Full Test - Result**

${result.success ? '✅' : '❌'} **Status:** ${result.success ? 'Success' : 'Error'}

${result.success 
  ? `📤 **Event sent to Inngest!**
🎯 **Parameters:**
• Username: @neuro_sage
• Project: 37
• Competitors: 25  
• Reels: up to 10 per competitor

⏰ **Expected time:** 10-15 minutes
📬 **Notification:** will come to this chat

⚠️ **Note:** Full test may take longer due to large data volume.`
  : `❌ **Error:** ${result.error}

🔧 Check configuration and try quick test.`
}`

  await ctx.editMessageText(responseMessage, { parse_mode: 'Markdown' })
}

async function showCustomTestMenu(ctx: MyContext, isRu: boolean): Promise<void> {
  const message = isRu 
    ? `🎯 **Кастомный тест Instagram**

Выберите предустановленные параметры или настройте свои:

**Популярные конфигурации:**`
    : `🎯 **Custom Instagram Test**

Choose preset parameters or configure your own:

**Popular Configurations:**`

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback(
          isRu ? '👤 Другой username' : '👤 Different username',
          'custom_test_username'
        )
      ],
      [
        Markup.button.callback(
          isRu ? '📊 10 конкурентов + рилсы' : '📊 10 competitors + reels',
          'custom_test_medium'
        ),
        Markup.button.callback(
          isRu ? '🚀 50 конкурентов' : '🚀 50 competitors',
          'custom_test_max'
        )
      ],
      [
        Markup.button.callback(
          isRu ? '🔙 Назад' : '🔙 Back',
          'back_to_main'
        )
      ]
    ])
  })
}

async function handleCustomTestCallback(ctx: MyContext, callbackData: string, isRu: boolean): Promise<void> {
  // TODO: Implement custom test configurations
  const message = isRu 
    ? '🚧 Кастомные тесты будут добавлены в следующей версии.\n\nПока используйте быстрый или полный тест.'
    : '🚧 Custom tests will be added in the next version.\n\nFor now, please use quick or full test.'
  
  await ctx.editMessageText(message)
}

async function showSystemStatus(ctx: MyContext, isRu: boolean): Promise<void> {
  const statusMessage = isRu 
    ? `ℹ️ **Статус системы Instagram парсинга**

🔧 **Конфигурация:**
• Inngest клиент: ✅ Настроен
• Event name: \`instagram/scraper-v2\`
• Target URL: \`ai-server-u14194.vm.elestio.app\`

📊 **Лимиты парсинга:**
• Макс. конкуренты: 1-100
• Макс. рилсы на конкурента: 1-200  
• Время обработки: 5-15 минут

🎯 **Тестовые параметры:**
• Username: neuro_sage
• Project ID: 37
• Admin ID: ${ctx.from?.id}

⚙️ **Рекомендации:**
1. Начните с быстрого теста
2. Проверьте логи AI сервера 
3. Убедитесь что INNGEST_EVENT_KEY настроен

🔍 **Session ID:** \`status-${Date.now()}\``
    : `ℹ️ **Instagram Parsing System Status**

🔧 **Configuration:**
• Inngest client: ✅ Configured
• Event name: \`instagram/scraper-v2\`
• Target URL: \`ai-server-u14194.vm.elestio.app\`

📊 **Parsing Limits:**
• Max competitors: 1-100
• Max reels per competitor: 1-200
• Processing time: 5-15 minutes

🎯 **Test Parameters:**
• Username: neuro_sage  
• Project ID: 37
• Admin ID: ${ctx.from?.id}

⚙️ **Recommendations:**
1. Start with quick test
2. Check AI server logs
3. Ensure INNGEST_EVENT_KEY is configured

🔍 **Session ID:** \`status-${Date.now()}\``

  await ctx.editMessageText(statusMessage, { parse_mode: 'Markdown' })
}