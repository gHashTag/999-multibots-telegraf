// Simple JavaScript bot for Railway
const { Telegraf } = require('telegraf')

const isDev = process.env.NODE_ENV === 'testing'

console.log(`🤖 JavaScript Bot starting in ${isDev ? 'testing' : 'production'} mode`)
console.log(`NODE_ENV: ${process.env.NODE_ENV}`)
console.log(`TEST_BOT_NAME: ${process.env.TEST_BOT_NAME}`) 
console.log(`BOT_TOKEN_1 exists: ${!!process.env.BOT_TOKEN_1}`)
console.log(`PORT: ${process.env.PORT}`)

async function initializeBot() {
  if (!process.env.BOT_TOKEN_1) {
    console.error('❌ BOT_TOKEN_1 is not set')
    process.exit(1)
  }

  const bot = new Telegraf(process.env.BOT_TOKEN_1)

  // Basic commands
  bot.start((ctx) => {
    ctx.reply('👋 Привет! Тестовый JavaScript бот запущен на Railway!')
  })

  bot.help((ctx) => {
    ctx.reply('Это тестовый JavaScript бот для проверки деплоя на Railway')
  })

  bot.command('status', (ctx) => {
    ctx.reply(`✅ JavaScript бот работает!\nОкружение: ${process.env.NODE_ENV}\nВремя работы: ${Math.floor(process.uptime())}s`)
  })

  // Error handling
  bot.catch((err, ctx) => {
    console.error('Bot error:', err)
    if (ctx) {
      ctx.reply('Произошла ошибка')
    }
  })

  try {
    const botInfo = await bot.telegram.getMe()
    console.log(`✅ JavaScript Бот ${botInfo.username} успешно инициализирован`)

    // Always use polling for simplicity
    await bot.launch()
    console.log('🚀 JavaScript бот запущен в режиме polling')
    
  } catch (error) {
    console.error('❌ Ошибка запуска JavaScript бота:', error)
    process.exit(1)
  }
}

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 Получен SIGINT, остановка JavaScript бота...')
  process.exit(0)
})

process.once('SIGTERM', () => {
  console.log('🛑 Получен SIGTERM, остановка JavaScript бота...')
  process.exit(0)
})

// Start the bot
initializeBot()
  .then(() => {
    console.log('🎉 JavaScript бот успешно запущен!')
  })
  .catch((error) => {
    console.error('❌ Критическая ошибка JavaScript бота:', error)
    process.exit(1)
  })