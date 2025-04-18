import { isDev } from './config'

console.log(`--- Bot Logic ---`)
console.log(
  `[BOT] Detected mode (via isDev): ${isDev ? 'development' : 'production'}`
)
console.log(`[BOT] process.env.NODE_ENV: ${process.env.NODE_ENV}`)
console.log(`--- End Bot Logic Check ---`)

import { Composer, Telegraf } from 'telegraf'
import { config } from 'dotenv'
import { registerCommands } from './registerCommands'
import { MyContext } from './interfaces'

// Инициализация ботов
const botInstances: Telegraf[] = []

// Создаем и экспортируем Composer глобально
export const composer = new Composer<MyContext>()

// Функция для проверки валидности токена
async function validateBotToken(token: string): Promise<boolean> {
  try {
    const bot = new Telegraf(token)
    await bot.telegram.getMe()
    return true
  } catch (error) {
    console.error(`❌ Ошибка валидации токена: ${error.message}`)
    return false
  }
}

// Функция для проверки занятости порта
async function isPortInUse(port: number): Promise<boolean> {
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

// Инициализация ботов в зависимости от окружения
async function initializeBots() {
  console.log('🔧 Режим работы:', isDev ? 'development' : 'production')
  console.log('📝 Загружен файл окружения:', process.env.NODE_ENV)

  if (isDev) {
    // В режиме разработки используем только тестового бота
    const testBotToken = process.env.BOT_TOKEN_TEST_1
    if (!testBotToken) {
      throw new Error('❌ BOT_TOKEN_TEST_1 не найден в .env.development')
    }

    const bot = new Telegraf<MyContext>(testBotToken)
    bot.use(Composer.log())

    // Регистрируем команды, используя глобальный composer
    registerCommands({ bot, composer })

    botInstances.push(bot)
    const botInfo = await bot.telegram.getMe()
    console.log(`🤖 Тестовый бот ${botInfo.username} инициализирован`)

    // В режиме разработки используем polling
    bot.launch({
      allowedUpdates: ['message', 'callback_query'],
    })
    console.log(
      `🚀 Тестовый бот ${botInfo.username} запущен в режиме разработки`
    )
  } else {
    // В продакшене используем все активные боты
    const botTokens = [
      process.env.BOT_TOKEN_1,
      process.env.BOT_TOKEN_2,
      process.env.BOT_TOKEN_3,
      process.env.BOT_TOKEN_4,
      process.env.BOT_TOKEN_5,
      process.env.BOT_TOKEN_6,
      process.env.BOT_TOKEN_7,
    ].filter(Boolean)

    // Начинаем с порта 3001 для первого бота
    let currentPort = 3001

    for (const token of botTokens) {
      if (await validateBotToken(token)) {
        const bot = new Telegraf<MyContext>(token)
        bot.use(Composer.log())

        // Регистрируем команды, используя глобальный composer
        registerCommands({ bot, composer })

        botInstances.push(bot)
        const botInfo = await bot.telegram.getMe()
        console.log(`🤖 Бот ${botInfo.username} инициализирован`)

        // Проверяем, свободен ли порт
        while (await isPortInUse(currentPort)) {
          console.log(`⚠️ Порт ${currentPort} занят, пробуем следующий...`)
          currentPort++
        }

        console.log(
          `🔌 Используем порт ${currentPort} для бота ${botInfo.username}`
        )

        // В продакшене используем вебхуки
        try {
          bot.launch({
            webhook: {
              domain: process.env.WEBHOOK_DOMAIN,
              port: currentPort,
            },
            allowedUpdates: ['message', 'callback_query'],
          })
          console.log(
            `🚀 Бот ${botInfo.username} запущен в продакшен режиме на порту ${currentPort}`
          )
        } catch (error) {
          console.error(`❌ Ошибка запуска бота ${botInfo.username}:`, error)
        }

        // Увеличиваем порт для следующего бота
        currentPort++
      }
    }
  }
}

// Обработка завершения работы
process.once('SIGINT', () => {
  console.log('🛑 Получен сигнал SIGINT, завершаем работу...')
  botInstances.forEach(bot => bot.stop('SIGINT'))
  process.exit(0)
})

process.once('SIGTERM', () => {
  console.log('🛑 Получен сигнал SIGTERM, завершаем работу...')
  botInstances.forEach(bot => bot.stop('SIGTERM'))
  process.exit(0)
})

console.log('🏁 Запуск приложения')
initializeBots()
  .then(() => console.log('✅ Боты успешно запущены'))
  .catch(error => console.error('❌ Ошибка при запуске ботов:', error))
