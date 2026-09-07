import { isDev } from './config'
import { scrubbedLog } from '@/utils/scrubCallbackSecrets'
import { setupSafeConsoleLogging } from './utils/logger'

// Активируем безопасное логирование для предотвращения вывода Buffer данных
// Test CI/CD pipeline: проверка работы автоматической сборки после очистки веток
setupSafeConsoleLogging()

// Arm process-level rejection/exception handlers once, before any bot starts:
// bot.catch only covers the update loop, and an unhandled rejection would
// otherwise terminate a process that serves every bot. See errorHandler.ts.
setupGlobalErrorHandlers()

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
import {
  setupErrorHandler,
  setupGlobalErrorHandlers,
} from './helpers/error/errorHandler'
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

// ✅ Импортируем supabase для диагностики
import { supabase } from './core/supabase'

// Инициализация ботов
const botInstances: Telegraf<MyContext>[] = []

/** Accessor for billing and other services that need the running bot list */
export function getBotInstances(): Telegraf<MyContext>[] {
  return botInstances
}
let mainBotInstance: Telegraf<MyContext> | null = null

// Deferred startup notifications (secrets load before telegramLogService is ready)
let startupKeyIssues: { missingKeys: string[]; emptyKeys: string[] } | null =
  null
let supabaseCredentialsFailed = false

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
      bot.use(Telegraf.log(scrubbedLog)) // Log all Telegraf updates and middleware flow

      // <<<--- ВОЗВРАЩАЕМ ПОРЯДОК: stage ПЕРЕД paymentHandlers --->>>
      bot.use(session()) // 1. Сессия (из bot.ts)
      bot.use(languageMiddleware) // 2. ✅ LANGUAGE MIDDLEWARE - получает язык из БД ОДИН РАЗ!

      // ✅ ДОБАВЛЯЕМ ОБРАБОТЧИК ОШИБОК
      setupErrorHandler(bot)

      // ✅ ДОБАВЛЯЕМ ОБРАБОТЧИК УВЕДОМЛЕНИЙ
      setupNotificationProcessor(bot)

      // ✅ Сохраняем первый bot instance для webhooks (legacy)
      if (!mainBotInstance) {
        mainBotInstance = bot
        console.log('✅ Main bot instance saved for webhooks')

        //         // 🔍 ДИАГНОСТИКА: Проверяем статусы моделей ДО миграции
        //         console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        //         console.log('🔍 ДИАГНОСТИКА МОДЕЛЕЙ (ДО МИГРАЦИИ)')
        //         console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
        //
        //         const { data: diagModels } = await supabase
        //           .from('model_trainings')
        //           .select('id, model_name, status, result, api, provider, created_at')
        //           .eq('telegram_id', '144022504')
        //           .order('created_at', { ascending: false })
        //
        //         if (diagModels && diagModels.length > 0) {
        //           console.log(`✅ Найдено моделей: ${diagModels.length}\n`)
        //           diagModels.forEach((m, i) => {
        //             console.log(`${i + 1}. ${m.model_name}`)
        //             console.log(
        //               `   status: ${m.status} | result: ${m.result || 'NULL'} | api: ${m.api || 'NULL'} | provider: ${m.provider || 'NULL'}`
        //             )
        //             console.log(`   created: ${m.created_at}\n`)
        //           })
        //           const statuses = [...new Set(diagModels.map(m => m.status))]
        //           console.log('📋 Уникальные статусы в БД:', statuses)
        //         } else {
        //           console.log('❌ Модели НЕ НАЙДЕНЫ в БД')
        //         }
        //
        //         console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
        //
        //         // 🧹 ONE-TIME CLEANUP: Remove fake "fal-test" models
        //         console.log('🧹 Проверяем наличие фейковых моделей "fal-test"...')
        //         const { data: fakeModels } = await supabase
        //           .from('model_trainings')
        //           .select('id, model_name, zip_url')
        //           .eq('telegram_id', '144022504')
        //           .eq('model_name', 'fal-test')
        //           .eq('zip_url', 'https://fal.media/files/fal-test/model.zip')
        //
        //         if (fakeModels && fakeModels.length > 0) {
        //           console.log(
        //             `🗑️ Найдено ${fakeModels.length} фейковых моделей, удаляем...`
        //           )
        //           for (const fake of fakeModels) {
        //             await supabase.from('model_trainings').delete().eq('id', fake.id)
        //             console.log(`   ✅ Удалено: ${fake.id}`)
        //           }
        //         } else {
        //           console.log('✅ Фейковых моделей не найдено')
        //         }
        //
        //         // ✅ ДОБАВЛЯЕМ НАСТОЯЩУЮ FAL МОДЕЛЬ
        //         console.log('\n🔍 Проверяем наличие настоящей FAL модели...')
        //         const realTrainingId = '2896cb1f-b659-4057-b03d-a3daf5d9a983'
        //         const { data: existingRealModel } = await supabase
        //           .from('model_trainings')
        //           .select('id, model_name')
        //           .eq('telegram_id', '144022504')
        //           .eq('replicate_training_id', realTrainingId)
        //           .single()
        //
        //         if (!existingRealModel) {
        //           console.log('📝 Настоящая FAL модель не найдена, добавляем...')
        //           const realModelData = {
        //             telegram_id: '144022504',
        //             model_name: 'FAL Portrait (2500 steps)',
        //             trigger_word: 'NEURO_SAGE',
        //             replicate_training_id: realTrainingId,
        //             status: 'SUCCESS',
        //             bot_name: 'neuro_blogger_bot',
        //             steps: 2500,
        //             gender: 'male',
        //             // ✅ ИСПРАВЛЕНИЕ: Используем .safetensors (LoRA weights), а НЕ config.json!
        //             zip_url:
        //               'https://v3b.fal.media/files/b/zebra/oxDuX84XjyEBU_5UT85l8_pytorch_lora_weights.safetensors',
        //             api: 'fal', // ✅ FIXED: FAL provider, not Replicate!
        //           }
        //
        //           const { data: newModel, error: insertError } = await supabase
        //             .from('model_trainings')
        //             .insert(realModelData)
        //             .select()
        //             .single()
        //
        //           if (insertError) {
        //             console.error(
        //               '❌ Ошибка добавления настоящей FAL модели:',
        //               insertError
        //             )
        //           } else {
        //             console.log('✅ Настоящая FAL модель добавлена!')
        //             console.log(`   ID: ${newModel.id}`)
        //             console.log(`   Name: ${newModel.model_name}`)
        //           }
        //         } else {
        //           console.log(
        //             `✅ Настоящая FAL модель уже существует: ${existingRealModel.model_name}`
        //           )
        //
        //           // ✅ Проверяем и исправляем api и zip_url, если они неправильные
        //           const { data: currentModel } = await supabase
        //             .from('model_trainings')
        //             .select('api, zip_url')
        //             .eq('id', existingRealModel.id)
        //             .single()
        //
        //           const updates: any = {}
        //
        //           if (currentModel && currentModel.api !== 'fal') {
        //             console.log(`🔧 Исправляем api с '${currentModel.api}' на 'fal'...`)
        //             updates.api = 'fal'
        //           }
        //
        //           // ✅ КРИТИЧНО: Заменяем config.json на .safetensors (LoRA weights)!
        //           if (currentModel && currentModel.zip_url?.includes('config.json')) {
        //             console.log(
        //               `🔧 Исправляем zip_url с config.json на .safetensors...`
        //             )
        //             console.log(`   Было: ${currentModel.zip_url}`)
        //             updates.zip_url =
        //               'https://v3b.fal.media/files/b/zebra/oxDuX84XjyEBU_5UT85l8_pytorch_lora_weights.safetensors'
        //             console.log(`   Стало: ${updates.zip_url}`)
        //           }
        //
        //           if (Object.keys(updates).length > 0) {
        //             await supabase
        //               .from('model_trainings')
        //               .update(updates)
        //               .eq('id', existingRealModel.id)
        //             console.log('✅ Модель обновлена:', Object.keys(updates).join(', '))
        //           }
        //         }
        //
        //         // ❌ REMOVED: Auto-run migrations - they create duplicates on every restart!
        //         // Run migrations manually when needed via: npx tsx scripts/add-fal-model-manual.ts

        // ✅ Запускаем API сервер СРАЗУ после создания первого бота
        // (до bot.launch(), чтобы не ждать бесконечного polling loop)
        startApiServer(bot) // Передаём только первый бот (default)
        console.log('✅ API сервер запущен с bot instance для webhooks')

        // ✅ Запускаем мониторинг провайдеров (проверка каждые 5 минут)
        const { startProviderMonitor } = await import(
          './services/provider-health-monitor'
        )
        startProviderMonitor()
        console.log('✅ Provider health monitor запущен')

        // ✅ Запускаем мониторинг биллинга владельцев ботов (проверка раз в 24ч)
        const { startBillingMonitor } = await import(
          './services/bot-owner-billing'
        )
        startBillingMonitor()
        console.log('✅ Bot owner billing monitor запущен')
      }

      // ✅ Сохраняем ВСЕ bot instances для multi-bot поддержки
      botInstances.push(bot)

      /*
       * ОПЛАТА ЛОВИТСЯ ДО СЦЕН, А НЕ ПОСЛЕ.
       *
       * Раньше эти два обработчика стояли ПОСЛЕ registerCommands, внутри
       * которого регистрируется `bot.use(stage.middleware())`. Пока кассир
       * жил вебхуком, это было безразлично: оплата вообще не входила в
       * цепочку middleware бота.
       *
       * С опросом входит — и приезжает ВНУТРИ `message`. А десятки шагов
       * сцен устроены так: «нет текста — ответить и `return`», без вызова
       * next(). Человек, пополняющий баланс, сидит ровно в такой сцене
       * (balanceScene). Его оплата была бы съедена шагом сцены, деньги
       * списаны, токены не начислены — и ни одной записи о том, что что-то
       * произошло.
       *
       * Поэтому регистрация поднята ВЫШЕ сцен: Telegraf идёт по middleware в
       * порядке регистрации, и оплата разбирается раньше, чем сцена успеет
       * её отвергнуть.
       *
       * Плата за это: до stage.middleware() у контекста ещё нет `ctx.scene`,
       * поэтому выход из сцены в обработчике зовётся через `?.` — см.
       * paymentHandlers/index.ts.
       */
      bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
      bot.on('successful_payment', handleSuccessfulPayment as any)

      registerCommands({ bot }) // 3. Сцены и команды (включая stage.middleware() и hears обработчики)
      // РЕГИСТРИРУЕМ НОВУЮ КОМАНДУ STATS
      setupStatsCommand(bot) // <--- НОВАЯ СТРОКА
      // AI fallback зарегистрирован внутри registerCommands (последний handler)

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

        /*
         * ЗДЕСЬ СТОЯЛ CASHIER GUARD, И ОН ДЕЛАЛ БОТА ГЛУХИМ.
         *
         * Замысел был такой: кассир звёзд (@t27ai_bot) живёт вебхуком рендера,
         * значит polling ему не запускаем — иначе 409 (инциденты №218-220).
         * Один бот — один режим приёма, всё верно.
         *
         * Чего замысел не учёл: вебхук ставился с
         * `allowed_updates: ['pre_checkout_query', 'successful_payment']`, а
         * `successful_payment` — НЕ тип апдейта, это поле внутри `message`.
         * Telegram молча выбрасывает несуществующее имя, и в вебхуке остаётся
         * один `pre_checkout_query`. Измерено на живом getWebhookInfo 06.09.2026.
         *
         * Итог: `message` не шёл никуда — ни в вебхук (не разрешён), ни в
         * очередь опроса (getUpdates отвечал 409, пока вебхук стоит). Бот не
         * получал ни одного сообщения: ни /start, ни меню, ни оплату клуба,
         * которая приходит ИМЕННО внутри message. Продать он тоже ничего не
         * мог: маршрут вебхука закрыт общим гвардом (Telegram приходит без
         * X-Api-Key и получает 401), поэтому pre_checkout никто не
         * подтверждал и покупка срывалась на кассе. Транзакций за всё время
         * ноль — это следствие, а не везение.
         *
         * Теперь кассир принимает апдейты опросом, как остальные десять ботов,
         * а рендер больше не ставит ему вебхук (см. render-server.ts). Один
         * режим приёма сохранён — просто это опрос, а не вебхук, и он умеет
         * доставлять и разговор, и оплату.
         */
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

      // 🔧 ЗАПУСКАЕМ БОТ БЕЗ await, чтобы не блокировать цикл!
      const botPromise = bot
        .launch({
          allowedUpdates: [
            'message',
            'callback_query',
            'pre_checkout_query' as any,
            'successful_payment' as any,
            'chat_member' as any,
            'business_connection' as any,
            'business_message' as any,
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
      // ✅ STAGING/PRODUCTION: 10 ботов (BOT_TOKEN_1-10)
      console.log(
        `🚀 [Infisical] ${env === 'staging' ? 'Staging' : 'Production'} окружение - загружаем 12 ботов`
      )

      for (let i = 1; i <= 12; i++) {
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
      supabaseCredentialsFailed = true
    }

    // API ключи для сервисов генерации
    try {
      const apiKeys = [
        'KIE_AI_API_KEY',
        'OPENROUTER_API_KEY',
        'REPLICATE_API_TOKEN',
        'REPLICATE_USERNAME', // ✅ Для создания моделей на Replicate (username/model-name)
        'APIFY_TOKEN',
        'GITHUB_TOKEN',
        'FAL_KEY', // ✅ Для Fal (kie.ai gateway) lip-sync генерации
        'BASE_WEBHOOK_URL', // ✅ Для callback уведомлений от Kie.ai
        'RENDER_INNGEST_EVENT_KEY', // ✅ Для отправки задач на render-server через Inngest Cloud
        'RENDER_INNGEST_SIGNING_KEY', // ✅ Для прямых вызовов render-server (альтернатива)
        // 'RENDER_INNGEST_BASE_URL' убран - не нужен, используем локальный Inngest
        // AI Avatar & Voice Generation Services
        'ELEVENLABS_API_KEY', // ✅ ElevenLabs для генерации голоса из текста
        'HEYGEN_COCOAGE_API_KEY', // ✅ HeyGen API ключ для набора аватаров Cocoage (шаблон 2)
        'HEYGEN_HAIM_API_KEY', // ✅ HeyGen API ключ для набора аватаров Haim (остальные шаблоны)
        'HEDRA_API_KEY', // ✅ Hedra API для lip-sync генерации с пользовательским фото
      ]

      console.log(
        `\n🔍 [INFISICAL] Загрузка API ключей из Infisical (${env})...`
      )

      // Initialize arrays for tracking key issues
      const emptyKeys: string[] = []
      const missingKeys: string[] = []

      for (const key of apiKeys) {
        try {
          const value = getSecret(key)
          if (value && value.trim() !== '') {
            process.env[key] = value

            // 🔴 ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ДЛЯ RENDER_INNGEST КЛЮЧЕЙ
            if (key.startsWith('RENDER_INNGEST')) {
              console.log(`  ✅ ${key} загружен из Infisical`)
              console.log(`     📊 Длина ключа: ${value.length} символов`)
              console.log(
                `     🔑 Первые 20 символов: ${value.substring(0, 20)}...`
              )

              // Дополнительная проверка для EVENT_KEY
              if (key === 'RENDER_INNGEST_EVENT_KEY') {
                const isValid = value.length > 50 && value.includes('_')
                console.log(
                  `     ✓ Формат ключа: ${isValid ? 'ВАЛИДНЫЙ' : '⚠️ ПОДОЗРИТЕЛЬНЫЙ'}`
                )
                if (!isValid) {
                  console.warn(
                    `     ⚠️ ВНИМАНИЕ: RENDER_INNGEST_EVENT_KEY может быть невалидным!`
                  )
                }
              }

              // Дополнительная проверка для SIGNING_KEY
              if (key === 'RENDER_INNGEST_SIGNING_KEY') {
                const isValid = value.startsWith('signkey-')
                console.log(
                  `     ✓ Формат ключа: ${isValid ? 'ВАЛИДНЫЙ (signkey-)' : '⚠️ НЕ НАЧИНАЕТСЯ С signkey-'}`
                )
                if (!isValid) {
                  console.warn(
                    `     ⚠️ ВНИМАНИЕ: RENDER_INNGEST_SIGNING_KEY должен начинаться с "signkey-"`
                  )
                }
              }
            } else {
              console.log(`  ✅ ${key} загружен`)
            }
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

      // 🔴 КРИТИЧЕСКАЯ ПРОВЕРКА RENDER_INNGEST КЛЮЧЕЙ ПОСЛЕ ЗАГРУЗКИ
      console.log(`\n🔍 [RENDER_INNGEST] Финальная проверка ключей...`)
      const renderEventKey = process.env.RENDER_INNGEST_EVENT_KEY
      const renderSigningKey = process.env.RENDER_INNGEST_SIGNING_KEY

      console.log(
        `  📊 RENDER_INNGEST_EVENT_KEY: ${renderEventKey ? `${renderEventKey.substring(0, 30)}... (${renderEventKey.length} символов)` : '❌ НЕ УСТАНОВЛЕН'}`
      )
      console.log(
        `  📊 RENDER_INNGEST_SIGNING_KEY: ${renderSigningKey ? `${renderSigningKey.substring(0, 30)}... (${renderSigningKey.length} символов)` : '❌ НЕ УСТАНОВЛЕН'}`
      )

      if (!renderEventKey || !renderSigningKey) {
        console.error(
          `\n❌ [RENDER_INNGEST] КРИТИЧЕСКАЯ ОШИБКА: Отсутствуют обязательные ключи!`
        )
        console.error(`   Inngest запросы на render-server НЕ БУДУТ РАБОТАТЬ!`)
        console.error(`   Проверьте ключи в Infisical (${env} environment):`)
        console.error(`   - RENDER_INNGEST_EVENT_KEY`)
        console.error(`   - RENDER_INNGEST_SIGNING_KEY\n`)
      } else {
        console.log(`\n✅ [RENDER_INNGEST] Все ключи загружены успешно!`)
      }

      // Save issues for deferred Telegram notification (telegramLogService not yet ready)
      if (missingKeys.length > 0 || emptyKeys.length > 0) {
        startupKeyIssues = { missingKeys, emptyKeys }
      }

      // 🔗 Приоритет: .env файл > Infisical (для BASE_WEBHOOK_URL)
      // Если в .env есть HTTPS версия, используем её вместо HTTP из Infisical
      if (process.env.BASE_WEBHOOK_URL?.startsWith('http://')) {
        const httpsUrl = process.env.BASE_WEBHOOK_URL.replace(
          'http://',
          'https://'
        )
        console.log(`  ⚠️ BASE_WEBHOOK_URL: Исправлен HTTP→HTTPS: ${httpsUrl}`)
        process.env.BASE_WEBHOOK_URL = httpsUrl
      }

      // Warn if not set in production (no more hardcoded VPS fallback!)
      if (!process.env.BASE_WEBHOOK_URL && env === 'prod') {
        console.error(
          '  ❌ BASE_WEBHOOK_URL NOT SET in production! Webhooks from Replicate/Kie.ai will fail!'
        )
        console.error(
          '     Set BASE_WEBHOOK_URL=https://999-multibots-telegraf-production.up.railway.app in Infisical'
        )
      }

      // ✅ КРИТИЧЕСКИ ВАЖНО: Reinitialize Inngest client AFTER secrets loaded
      // The client may have been initialized before Infisical secrets were loaded,
      // so we need to reset the cached client to pick up INNGEST_EVENT_KEY
      const { reinitializeInngestClient, isInngestConfigured } = await import(
        './inngest_app/client'
      )
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
          '   3. Или используй localtunnel: npm i -g localtunnel && lt --port 8080\n'
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
