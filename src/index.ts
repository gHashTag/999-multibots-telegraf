import { isDev } from './config'
import { setupSafeConsoleLogging } from './utils/logger'

// Активируем безопасное логирование для предотвращения вывода Buffer данных
// Test CI/CD pipeline: проверка работы автоматической сборки после очистки веток
setupSafeConsoleLogging()

// Bot initialization (see logs below)

import { Composer, Telegraf, Scenes, Context } from 'telegraf'
import { Update, BotCommand } from 'telegraf/types'
import { registerCommands, createStage } from './navigation'
import { MyContext } from './interfaces'
import { session } from 'telegraf'
import {
  handleSuccessfulPayment,
  handlePreCheckoutQuery,
} from './handlers/paymentHandlers'
import { setBotCommands } from './setCommands'
// ✅ ДОБАВЛЯЕМ IMPORT LANGUAGE MIDDLEWARE
import { languageMiddleware } from './middlewares/languageMiddleware'
// ✅ ДОБАВЛЯЕМ IMPORT ОБРАБОТЧИКА ОШИБОК
import { setupErrorHandler } from './helpers/error/errorHandler'
// ✅ ДОБАВЛЯЕМ ГЛОБАЛЬНЫЙ НАВИГАЦИОННЫЙ MIDDLEWARE
import { registerGlobalNavigationMiddleware } from './navigation'

// ✅ ДОБАВЛЯЕМ IMPORT ОБРАБОТЧИКА УВЕДОМЛЕНИЙ
import { setupNotificationProcessor } from './handlers/notificationHandler'

// ✅ ДОБАВЛЯЕМ IMPORT СЕРВИСА ЛОГИРОВАНИЯ В TELEGRAM
import { telegramLogService } from './services/telegram-log.service'

// Импорт новой команды
import { setupStatsCommand } from './commands/statsCommand'

// ✅ Импорт обработчика событий вступления/выхода из групп
import { setupGroupMemberHandler } from './handlers/groupMemberHandler'

// Импортируем наш API сервер из новой директории
import { startApiServer } from './api_server'
// ✅ Импортируем функцию регистрации bot instances для multi-bot поддержки
import { setBotInstance } from './api_server/routes/kie-ai-webhook.routes'

// Инициализация ботов
const botInstances: Telegraf<MyContext>[] = []
let mainBotInstance: Telegraf<MyContext> | null = null

// Define the commands for private chats
// const privateCommands: BotCommand[] = [
//   { command: 'start', description: '🚀 Начать / Restart' },
//   { command: 'menu', description: '🏠 Главное меню / Main Menu' },
//   { command: 'support', description: '💬 Техподдержка / Support' },
// ]

// Функция для проверки валидности токена
export async function validateBotToken(
  token: string,
  tokenName?: string
): Promise<boolean> {
  try {
    const bot = new Telegraf(token)
    const botInfo = await bot.telegram.getMe()
    return true
  } catch (error) {
    // В dev окружении может быть тестовый токен - это нормально
    const errorMsg = (error as Error).message
    const tokenLabel = tokenName || 'unknown'

    if (isDev) {
      console.log(`\n⚠️  ${tokenLabel} невалидный (пропущен)`)
      console.log(`   ℹ️  Ошибка: ${errorMsg}`)
      console.log(`   💡 Это не критично для dev окружения`)
      console.log(`   📝 Чтобы добавить второй бот:`)
      console.log(`      1. Создайте нового бота через @BotFather`)
      console.log(`      2. Добавьте токен в Infisical (dev environment):`)
      console.log(`         Переменная: ${tokenLabel}`)
      console.log(`         Путь: https://app.infisical.com\n`)
    } else {
      console.error(`\n❌ КРИТИЧЕСКАЯ ОШИБКА: ${tokenLabel} невалидный!`)
      console.error(`   Ошибка: ${errorMsg}`)
      console.error(`   Действия:`)
      console.error(
        `   1. Проверьте токен в Infisical (${process.env.INFISICAL_ENVIRONMENT} environment)`
      )
      console.error(`   2. Убедитесь что бот не удалён в @BotFather`)
      console.error(`   3. Обновите токен если необходимо\n`)
    }
    return false
  }
}

// Функция для проверки занятости порта
export async function isPortInUse(port: number): Promise<boolean> {
  try {
    const net = await import('net')
    return new Promise(resolve => {
      const server = net.createServer()
      server.once('error', () => resolve(true))
      server.once('listening', () => {
        server.close()
        resolve(false)
      })
      server.listen(port)
    })
  } catch (error) {
    console.error(`❌ Ошибка проверки порта ${port}:`, error)
    return true
  }
}

// 🚀 АВТОМАТИЧЕСКОЕ ОБНАРУЖЕНИЕ BOT ТОКЕНОВ
// Масштабируемая архитектура: просто добавьте BOT_TOKEN_N в Infisical
function discoverBotTokens(): string[] {
  const tokens: string[] = []

  // Ищем все переменные BOT_TOKEN_* (с 1 до 100)
  for (let i = 1; i <= 100; i++) {
    const tokenKey = `BOT_TOKEN_${i}`
    const token = process.env[tokenKey]

    if (token) {
      tokens.push(token)
    }
    // ✅ ИСПРАВЛЕНИЕ: Убираем gap detection - сканируем все 100 токенов
    // Это позволяет BOT_TOKEN_11 загрузиться даже если между ним есть пропуски
  }

  return tokens
}

async function initializeBots() {
  console.log('🤖 Инициализация ботов:', isDev ? 'development' : 'production')

  const stage = createStage()

  // 🚀 МАСШТАБИРУЕМАЯ АРХИТЕКТУРА: автоматически находим все BOT_TOKEN_*
  const infisicalEnv = process.env.INFISICAL_ENVIRONMENT || 'dev'
  const botTokens = discoverBotTokens()

  if (botTokens.length === 0) {
    throw new Error(
      '❌ Не найдено ни одного BOT токена! Добавьте BOT_TOKEN_1 в Infisical'
    )
  }

  // Логируем результат обнаружения
  const envIcon =
    infisicalEnv === 'dev' ? '🧪' : infisicalEnv === 'staging' ? '🔧' : '🚀'
  const envName =
    infisicalEnv === 'dev'
      ? 'Dev'
      : infisicalEnv === 'staging'
        ? 'Staging'
        : 'Production'
  console.log(
    `${envIcon} ${envName}: обнаружено ${botTokens.length} бот${botTokens.length === 1 ? '' : botTokens.length < 5 ? 'а' : 'ов'}`
  )
  console.log(`   📝 Используются: BOT_TOKEN_1 - BOT_TOKEN_${botTokens.length}`)
  console.log(
    `   💡 Чтобы добавить ещё ботов, добавьте BOT_TOKEN_${botTokens.length + 1} в Infisical\n`
  )

  // 🔧 Запускаем ВСЕХ ботов параллельно (НЕ блокируя цикл!)
  const botPromises: Promise<void>[] = []

  // Определяем имена токенов для информативных логов
  const getTokenName = (index: number): string => {
    if (infisicalEnv === 'dev') {
      return index === 0
        ? 'BOT_TOKEN_1 (основной dev бот)'
        : 'BOT_TOKEN_2 (дополнительный dev бот)'
    }
    return `BOT_TOKEN_${index + 1}`
  }

  for (let i = 0; i < botTokens.length; i++) {
    const token = botTokens[i]
    const tokenName = getTokenName(i)

    if (await validateBotToken(token, tokenName)) {
      const bot = new Telegraf<MyContext>(token, {
        handlerTimeout: Infinity,
      })
      bot.use(Telegraf.log(console.log)) // Log all Telegraf updates and middleware flow

      bot.use(session()) // 1. Сессия (из bot.ts)

      bot.use(languageMiddleware) // 2. ✅ LANGUAGE MIDDLEWARE - получает язык из БД ОДИН РАЗ!

      // ✅ ДОБАВЛЯЕМ ОБРАБОТЧИК ОШИБОК
      setupErrorHandler(bot)

      // ✅ ДОБАВЛЯЕМ ОБРАБОТЧИК УВЕДОМЛЕНИЙ
      setupNotificationProcessor(bot)

      // ✅ Сохраняем первый bot instance для webhooks (legacy)
      // 🎯 DEV: используем тестовый бот, PROD: продакшн бот
      const botUsername = bot.botInfo?.username || (isDev ? 'clip_maker_neuro_bot' : 'neuro_blogger_bot')
      console.log(
        '🔍 [DEBUG] Checking mainBotInstance:',
        !!mainBotInstance,
        'botName:',
        botUsername
      )
      if (!mainBotInstance) {
        mainBotInstance = bot
        console.log('✅ Main bot instance saved for webhooks')

        // ✅ Инициализируем сервис логирования в Telegram группу НейроМентор
        telegramLogService.initialize(bot)
        console.log('✅ TelegramLogService инициализирован для группы НейроМентор')

        // ✅ Запускаем API сервер СРАЗУ после создания первого бота
        // (до bot.launch(), чтобы не ждать бесконечного polling loop)
        console.log('🚀 [DEBUG] About to call startApiServer(bot)...')
        startApiServer(bot) // Передаём только первый бот (default)
        console.log('✅ API сервер запущен с bot instance для webhooks')
      } else {
        console.log(
          '⚠️ [DEBUG] mainBotInstance already set, skipping API server start'
        )
      }

      // ✅ Сохраняем ВСЕ bot instances для multi-bot поддержки
      botInstances.push(bot)

      registerCommands({ bot }) // 3. Сцены и команды (включая stage.middleware() и hears обработчики)
      // РЕГИСТРИРУЕМ НОВУЮ КОМАНДУ STATS
      setupStatsCommand(bot) // <--- НОВАЯ СТРОКА
      // ✅ РЕГИСТРИРУЕМ ОБРАБОТЧИК ВСТУПЛЕНИЯ/ВЫХОДА ИЗ ГРУПП
      setupGroupMemberHandler(bot)
      // 3. Глобальные обработчики платежей (ПОСЛЕ stage)
      bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
      bot.on('successful_payment', handleSuccessfulPayment as any)

      botInstances.push(bot)
      const botInfo = await bot.telegram.getMe()
      console.log(`🤖 Бот ${botInfo.username} инициализирован`)

      // Используем импортированную функцию setBotCommands
      await setBotCommands(bot)

      // 🔧 FIX: Очистка webhook перед polling
      try {
        const webhookInfo = await bot.telegram.getWebhookInfo()

        console.log(`\n🔍 [WEBHOOK INFO] Бот: ${botInfo.username}`)
        console.log(`   URL: ${webhookInfo.url || 'не установлен'}`)
        console.log(
          `   Pending updates: ${webhookInfo.pending_update_count || 0}`
        )
        if (webhookInfo.last_error_date) {
          const lastErrorDate = new Date(webhookInfo.last_error_date * 1000)
          console.log(
            `   ⚠️  Последняя ошибка: ${webhookInfo.last_error_message}`
          )
          console.log(`   📅 Время ошибки: ${lastErrorDate.toISOString()}`)
        }
        if (webhookInfo.ip_address) {
          console.log(`   🌐 IP адрес: ${webhookInfo.ip_address}`)
        }
        if (
          webhookInfo.allowed_updates &&
          webhookInfo.allowed_updates.length > 0
        ) {
          console.log(
            `   📋 Allowed updates: ${webhookInfo.allowed_updates.join(', ')}`
          )
        }

        if (webhookInfo.url) {
          console.log(
            `\n🔌 [WEBHOOK] Обнаружен активный вебхук для ${botInfo.username}: ${webhookInfo.url}`
          )
          console.log(`   🗑️  Удаляю вебхук для переключения на polling...`)
          await bot.telegram.deleteWebhook({ drop_pending_updates: true })
          console.log(`   ✅ Вебхук удалён, переходим к polling\n`)
        } else {
          console.log(`   🟢 Активного вебхука нет, можно запускать polling\n`)
        }
      } catch (error) {
        console.warn(
          '⚠️ [WEBHOOK] Не удалось получить/удалить вебхук:',
          String(error)
        )
      }

      // ✅ MULTI-BOT FIX: Регистрируем bot instance ДО launch (botInfo уже получен выше)
      if (typeof setBotInstance === 'function' && botInfo.username) {
        setBotInstance(bot, botInfo.username)
        console.log(`✅ [MULTI-BOT] Зарегистрирован бот: ${botInfo.username}`)
      }

      // ✅ КРИТИЧНО: Регистрируем бот в объект bots для доступа через getBotByName
      // ✅ ИСПРАВЛЕНО: Используем getBotNameByUsername для точного определения имени по username
      const { registerBotInstance, getBotNameByUsername, getBotNameByToken } =
        await import('@/core/bot')

      // Сначала пытаемся определить по username (более точно)
      let systemBotName: string | null = null
      if (botInfo.username) {
        const usernameResult = getBotNameByUsername(botInfo.username)
        systemBotName = usernameResult.bot_name
      }

      // Если по username не нашли, используем fallback на токен
      if (!systemBotName) {
        const tokenResult = getBotNameByToken(token)
        systemBotName = tokenResult.bot_name
      }

      if (systemBotName) {
        registerBotInstance(bot, systemBotName)
        console.log(
          `✅ [BOT REGISTRY] Бот ${systemBotName} (username: ${botInfo.username}) зарегистрирован в объект bots`
        )
      } else {
        console.warn(
          `⚠️ [BOT REGISTRY] Не удалось определить системное имя бота для username ${botInfo.username} и токена ${tokenName}`
        )
      }

      // 🔧 ЗАПУСКАЕМ БОТ БЕЗ await, чтобы не блокировать цикл!
      const botPromise = bot
        .launch({
          allowedUpdates: [
            'message',
            'callback_query',
            'pre_checkout_query' as any,
            'successful_payment' as any,
            'chat_member' as any, // Для отслеживания вступления/выхода из групп
          ],
        })
        .then(() => {
          console.log(`🚀 Бот ${botInfo.username} запущен в polling режиме`)
        })
        .catch(error => {
          console.error(`❌ Ошибка запуска бота ${botInfo.username}:`, error)
        })

      botPromises.push(botPromise)
    }
  }

  // Bot launches are non-blocking in polling mode - they start infinite loops
  // Don't wait for them to complete, otherwise API server will never start
  // await Promise.all(botPromises)
  console.log(`✅ Все боты успешно запущены в polling режиме`)
  console.log(`✅ Все боты успешно инициализированы`)
}

// Legacy webhook code removed - using only polling mode
// (Old code was from lines 205-349)

// Асинхронная функция для остановки
async function gracefulShutdown(signal: string) {
  console.log(`🚨 Получен сигнал ${signal}. Завершение работы...`)
  for (const bot of botInstances) {
    const botUsername = bot.botInfo?.username || 'neuro_blogger_bot'
    console.log(`🚫 Остановка бота ${botUsername}...`)
    await bot.stop()
  }
  process.exit(0)
}

// Ловим сигналы завершения
process.once('SIGINT', () => gracefulShutdown('SIGINT'))
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))

// 🎨 Beautiful ASCII Art Banner
console.log('\n')
console.log(
  '\x1b[35m╔═══════════════════════════════════════════════════════════╗\x1b[0m'
)
console.log(
  '\x1b[35m║\x1b[0m                                                           \x1b[35m║\x1b[0m'
)
console.log(
  '\x1b[35m║\x1b[0m     \x1b[1m\x1b[36m██╗   ██╗██╗██████╗ ███████╗███████╗\x1b[0m            \x1b[35m║\x1b[0m'
)
console.log(
  '\x1b[35m║\x1b[0m     \x1b[1m\x1b[36m██║   ██║██║██╔══██╗██╔════╝██╔════╝\x1b[0m            \x1b[35m║\x1b[0m'
)
console.log(
  '\x1b[35m║\x1b[0m     \x1b[1m\x1b[36m██║   ██║██║██████╔╝█████╗  █████╗\x1b[0m              \x1b[35m║\x1b[0m'
)
console.log(
  '\x1b[35m║\x1b[0m     \x1b[1m\x1b[36m╚██╗ ██╔╝██║██╔══██╗██╔══╝  ██╔══╝\x1b[0m              \x1b[35m║\x1b[0m'
)
console.log(
  '\x1b[35m║\x1b[0m      \x1b[1m\x1b[36m╚████╔╝ ██║██████╔╝███████╗███████╗\x1b[0m            \x1b[35m║\x1b[0m'
)
console.log(
  '\x1b[35m║\x1b[0m       \x1b[1m\x1b[36m╚═══╝  ╚═╝╚═════╝ ╚══════╝╚══════╝\x1b[0m            \x1b[35m║\x1b[0m'
)
console.log(
  '\x1b[35m║\x1b[0m                                                           \x1b[35m║\x1b[0m'
)
console.log(
  '\x1b[35m║\x1b[0m           \x1b[33m✨ AI-Powered Telegram Bot Platform ✨\x1b[0m        \x1b[35m║\x1b[0m'
)
console.log(
  '\x1b[35m║\x1b[0m                                                           \x1b[35m║\x1b[0m'
)
console.log(
  '\x1b[35m║\x1b[0m     \x1b[90mEnvironment:\x1b[0m \x1b[32m' +
    (isDev ? 'Development' : 'Production').padEnd(11) +
    '\x1b[0m \x1b[90mVersion:\x1b[0m \x1b[32m0.0.1\x1b[0m     \x1b[35m║\x1b[0m'
)
console.log(
  '\x1b[35m║\x1b[0m     \x1b[90mNode:\x1b[0m \x1b[32m' +
    process.version.padEnd(18) +
    '\x1b[0m \x1b[90mPlatform:\x1b[0m \x1b[32m' +
    process.platform.padEnd(6) +
    '\x1b[0m \x1b[35m║\x1b[0m'
)
console.log(
  '\x1b[35m║\x1b[0m                                                           \x1b[35m║\x1b[0m'
)
console.log(
  '\x1b[35m╚═══════════════════════════════════════════════════════════╝\x1b[0m'
)
console.log('\n')

// 🔐 Инициализируем Infisical и загружаем секреты ПЕРЕД запуском ботов
async function startApplication() {
  try {
    // 🔍 Проверка доступных портов
    console.log('\n🔌 [PORTS] Проверка доступных портов...')
    const net = await import('net')

    const checkPort = (port: number): Promise<boolean> => {
      return new Promise(resolve => {
        const server = net.createServer()
        server.once('error', () => resolve(false))
        server.once('listening', () => {
          server.close()
          resolve(true)
        })
        server.listen(port, '0.0.0.0')
      })
    }

    const ports = [80, 443, 3000, 8080]
    for (const port of ports) {
      const isAvailable = await checkPort(port)
      if (isAvailable) {
        console.log(`   ✅ Порт ${port}: доступен`)
      } else {
        console.log(
          `   ⚠️  Порт ${port}: занят (используется другим процессом)`
        )
      }
    }
    console.log('')

    // Импортируем Infisical
    const { initInfisical, getSecretsStats, getSecret, getSecretOrDefault } =
      await import('./core/infisical')

    console.log('🔐 [Infisical] Инициализация cloud-first secret manager...')
    await initInfisical()

    const stats = getSecretsStats()
    console.log(
      `✅ [Infisical] Загружено ${stats.totalSecrets} секретов из ${stats.environment}`
    )

    // 🔧 ВАЖНО: Копируем секреты в process.env для обратной совместимости
    // В будущем можно убрать и использовать getSecret() напрямую
    console.log('📋 [Infisical] Копирование секретов в process.env...')

    // 🔐 УНИФИЦИРОВАННАЯ СХЕМА: везде BOT_TOKEN_1-N
    const env = stats.environment

    if (env === 'dev') {
      // ✅ DEVELOPMENT: 2 бота для тестирования (BOT_TOKEN_1-2)
      console.log(
        '🧪 [Infisical] Development окружение - загружаем 2 тестовых бота'
      )

      for (let i = 1; i <= 2; i++) {
        const tokenKey = `BOT_TOKEN_${i}`
        try {
          process.env[tokenKey] = getSecret(tokenKey)
          console.log(`  ✅ ${tokenKey} загружен`)
        } catch (e) {
          console.warn(`  ⚠️ ${tokenKey} не найден в Infisical`)
        }
      }
    } else if (env === 'staging' || env === 'prod') {
      // ✅ STAGING/PRODUCTION: 11 ботов (BOT_TOKEN_1-11)
      console.log(
        `🚀 [Infisical] ${env === 'staging' ? 'Staging' : 'Production'} окружение - загружаем 11 ботов`
      )

      for (let i = 1; i <= 11; i++) {
        const tokenKey = `BOT_TOKEN_${i}`
        try {
          process.env[tokenKey] = getSecret(tokenKey)
          console.log(`  ✅ ${tokenKey} загружен`)
        } catch (e) {
          console.warn(`  ⚠️ ${tokenKey} не найден в Infisical`)
        }
      }
    } else {
      console.error(`❌ [Infisical] Неизвестное окружение: ${env}`)
      console.error('Допустимые окружения: dev, staging, prod')
      throw new Error(`Unknown environment: ${env}`)
    }

    // Общие секреты для всех окружений
    try {
      process.env.SUPABASE_URL = getSecret('SUPABASE_URL')
      process.env.SUPABASE_SERVICE_ROLE_KEY = getSecret(
        'SUPABASE_SERVICE_ROLE_KEY'
      )
      process.env.SUPABASE_SERVICE_KEY = getSecret('SUPABASE_SERVICE_KEY')
      console.log('  ✅ Supabase credentials загружены')
    } catch (e) {
      console.error('  ❌ Критическая ошибка: Supabase credentials не найдены!')
    }

    // API ключи для сервисов генерации
    try {
      const apiKeys = [
        'KIE_AI_API_KEY',
        'OPENROUTER_API_KEY',
        'REPLICATE_API_TOKEN',
        'REPLICATE_USERNAME',
        'APIFY_TOKEN',
        'GITHUB_TOKEN',
        'FAL_KEY', // ✅ Для Fal (kie.ai gateway) lip-sync генерации
        'BASE_WEBHOOK_URL', // ✅ Для callback уведомлений от Kie.ai
        'INNGEST_EVENT_KEY', // ✅ Для Inngest endpoint (наш сервер)
        'INNGEST_SIGNING_KEY', // ✅ Для локального Inngest signing
        // 'INNGEST_BASE_URL', // ⚠️ НЕОБЯЗАТЕЛЬНО: используется fallback в client.ts и inngest-provider.ts
        // AI Avatar & Voice Generation Services
        'ELEVENLABS_API_KEY', // ✅ ElevenLabs для генерации голоса из текста
        'HEYGEN_COCOAGE_API_KEY', // ✅ HeyGen API ключ для набора аватаров Cocoage (шаблон 2)
        'HEYGEN_HAIM_API_KEY', // ✅ HeyGen API ключ для набора аватаров Haim (остальные шаблоны)
        'HEDRA_API_KEY', // ✅ Hedra API для lip-sync генерации с пользовательским фото
        'DEEPSEEK_API_KEY', // ✅ DeepSeek API key для чата аватаров и других AI функций
        'GROK_API_KEY', // ✅ xAI Grok API key для чата с аватаром (grok-2, grok-3 и т.д.)
        'GLM_API_KEY', // ✅ GLM-4.7 API key от Zhipu AI для чата (fallback провайдер)
        // 🎓 BFL Model Training (Flux LoRA)
        'BFL_API_KEY', // ✅ BFL API key для тренировки моделей (Digital Avatar Body)
        'BFL_WEBHOOK_URL', // ✅ URL для BFL webhook (уведомление о завершении тренировки)
        'BFL_WEBHOOK_SECRET', // ✅ Секрет для верификации BFL webhook
        // 💳 Robokassa Payment Gateway (КРИТИЧЕСКИ ВАЖНО!)
        'MERCHANT_LOGIN', // ✅ Логин мерчанта Robokassa для генерации платежных URL
        // 'ROBOKASSA_MERCHANT_LOGIN', // ⚠️ НЕОБЯЗАТЕЛЬНО: используется как fallback для MERCHANT_LOGIN в config/index.ts
        'ROBOKASSA_PASSWORD_1', // ✅ Пароль 1 для подписи платежей
        'ROBOKASSA_PASSWORD_2', // ✅ Пароль 2 для проверки webhook'ов
        // 'RESULT_URL2', // ⚠️ НЕОБЯЗАТЕЛЬНО: используется как fallback для UNIFIED_RESULT_URL, но есть BASE_PAYMENT_URL
        // 'ROBOKASSA_RESULT_URL2', // ⚠️ НЕОБЯЗАТЕЛЬНО: используется как fallback для RESULT_URL2
      ]

      console.log(
        `\n🔍 [INFISICAL] Загрузка API ключей из Infisical (${env})...`
      )

      const loadedKeys: string[] = []
      const missingKeys: string[] = []
      const emptyKeys: string[] = []

      for (const key of apiKeys) {
        try {
          const value = getSecret(key)
          if (value && value.trim() !== '') {
            process.env[key] = value
            loadedKeys.push(key)
            console.log(`  ✅ ${key} загружен`)
          } else {
            emptyKeys.push(key)
            console.warn(`  ⚠️ ${key} не найден в Infisical (значение пустое)`)
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e)
          missingKeys.push(key)
          console.warn(`  ⚠️ ${key} не найден в Infisical: ${errorMsg}`)
        }
      }

      // 📊 Итоговая статистика загрузки ключей
      console.log(`\n📊 [INFISICAL] Статистика загрузки ключей:`)
      console.log(`  ✅ Загружено: ${loadedKeys.length}/${apiKeys.length}`)
      if (missingKeys.length > 0) {
        console.log(`  ❌ Отсутствуют: ${missingKeys.length} - ${missingKeys.join(', ')}`)
      }
      if (emptyKeys.length > 0) {
        console.log(`  ⚠️  Пустые: ${emptyKeys.length} - ${emptyKeys.join(', ')}`)
      }

      // 🔗 Приоритет: .env файл > Infisical (для BASE_WEBHOOK_URL)
      // Если в .env есть HTTPS версия, используем её вместо HTTP из Infisical
      if (process.env.BASE_WEBHOOK_URL?.startsWith('http://')) {
        const httpsUrl = process.env.BASE_WEBHOOK_URL.replace('http://', 'https://')
        console.log(`  ⚠️ BASE_WEBHOOK_URL: Исправлен HTTP→HTTPS: ${httpsUrl}`)
        process.env.BASE_WEBHOOK_URL = httpsUrl
      }

      // Fallback если не установлен вообще
      if (!process.env.BASE_WEBHOOK_URL && env === 'prod') {
        process.env.BASE_WEBHOOK_URL = 'https://three-head-dragon.shop'
        console.log('  ✅ BASE_WEBHOOK_URL установлен (hardcoded fallback)')
      }

      // ✅ КРИТИЧЕСКИ ВАЖНО: Reinitialize Inngest client AFTER secrets loaded
      // The client may have been initialized before Infisical secrets were loaded,
      // so we need to reset the cached client to pick up INNGEST_EVENT_KEY
      const { reinitializeInngestClient, isInngestConfigured } = await import('./inngest_app/client')
      reinitializeInngestClient()
      const inngestReady = isInngestConfigured()
      console.log(
        `  ${inngestReady ? '✅' : '⚠️'} Inngest клиент реинициализирован (eventKey: ${inngestReady ? 'OK' : 'MISSING'})`
      )
    } catch (e) {
      console.warn('  ⚠️ Некоторые API ключи не загружены')
    }

    console.log(
      `✅ [Infisical] Секреты скопированы в process.env для окружения: ${stats.environment}`
    )

    // 🌐 TUNNEL для Development окружения
    // В dev ВСЕГДА создаем туннель, даже если BASE_WEBHOOK_URL есть в Infisical
    if (env === 'dev') {
      console.log('\n🌐 [TUNNEL] Создаем туннель для локальной разработки...')

      if (process.env.BASE_WEBHOOK_URL) {
        console.log(
          `   ℹ️  Перезаписываем BASE_WEBHOOK_URL из Infisical (${process.env.BASE_WEBHOOK_URL})`
        )
      }

      // API сервер запущен на порту 3000, туннель должен туда направлять
      const TUNNEL_PORT = 3000
      let tunnelCreated = false

      // 🔷 ВАРИАНТ 1: Cloudflare Tunnel (бесплатно, без ограничений, без токенов)
      try {
        const { spawn } = await import('child_process')

        console.log(
          `📡 [CLOUDFLARE] Запускаем cloudflared tunnel на порт ${TUNNEL_PORT}...`
        )

        const cloudflared = spawn(
          'cloudflared',
          ['tunnel', '--url', `http://localhost:${TUNNEL_PORT}`],
          {
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        )

        // Парсим вывод cloudflared чтобы получить публичный URL
        const publicUrl = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            cloudflared.kill()
            reject(new Error('Timeout waiting for cloudflared URL'))
          }, 10000) // 10 секунд таймаут

          cloudflared.stderr?.on('data', (data: Buffer) => {
            const output = data.toString()
            // Cloudflared выводит URL в формате: https://random-word-word.trycloudflare.com
            const urlMatch = output.match(
              /https:\/\/[a-z0-9-]+\.trycloudflare\.com/
            )
            if (urlMatch) {
              clearTimeout(timeout)
              resolve(urlMatch[0])
            }
          })

          cloudflared.on('error', err => {
            clearTimeout(timeout)
            reject(err)
          })
        })

        process.env.BASE_WEBHOOK_URL = publicUrl
        tunnelCreated = true

        console.log('✅ [CLOUDFLARE] Туннель успешно создан!\n')
        console.log('━'.repeat(80))
        console.log('🌐 ПУБЛИЧНЫЕ WEBHOOK URLs (Cloudflare Tunnel):')
        console.log('━'.repeat(80))
        console.log(`📍 Base URL:          ${publicUrl}`)
        console.log(`🎬 Kie.ai Callback:   ${publicUrl}/api/kie-ai/callback`)
        console.log(
          `🎥 AI Reels Callback: ${publicUrl}/api/telegram/ai-reels-callback`
        )
        console.log('━'.repeat(80))
        console.log('')

        // Graceful shutdown
        process.on('SIGINT', () => {
          console.log('\n🛑 [CLOUDFLARE] Закрываем туннель...')
          cloudflared.kill()
          console.log('✅ [CLOUDFLARE] Туннель закрыт')
          process.exit(0)
        })

        process.on('SIGTERM', () => {
          console.log('\n🛑 [CLOUDFLARE] Получен SIGTERM, закрываем туннель...')
          cloudflared.kill()
          process.exit(0)
        })
      } catch (cloudflareError: any) {
        console.error(
          '❌ [CLOUDFLARE] Не удалось создать туннель:',
          cloudflareError.message
        )
        console.log('\n💡 Рекомендации:')
        console.log(
          '   1. Установи cloudflared: brew install cloudflare/cloudflare/cloudflared'
        )
        console.log('   2. Проверь что cloudflared доступен в PATH')
        console.log(
          '   3. Или используй localtunnel: npm i -g localtunnel && lt --port 3000\n'
        )
        console.log('⚠️  Продолжаем без туннеля - вебхуки работать не будут!\n')
      }

      if (!tunnelCreated) {
        console.warn('⚠️  [TUNNEL] Не удалось создать ни один туннель')
        console.log(
          '   Вебхуки от Kie.ai и Render Server работать не будут при локальной разработке\n'
        )
      }
    }

    // Теперь запускаем боты - секреты уже в памяти
    await initializeBots()
    console.log('✅ Все боты успешно инициализированы')
  } catch (error) {
    console.error('❌ Критическая ошибка при запуске приложения:', error)
    process.exit(1)
  }
}

// Запускаем приложение
startApplication()
