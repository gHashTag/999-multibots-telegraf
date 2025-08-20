// Railway Fix - Multi-Bot Farm (No Polling Conflicts)
const { Telegraf } = require('telegraf')
const express = require('express')

console.log('🚀 RAILWAY FIX: Starting HTTP bot farm...')

const isProduction = process.env.NODE_ENV === 'production'
const port = process.env.PORT || 3000
const testBotName = process.env.TEST_BOT_NAME || 'test_bot'

console.log(`🌐 Mode: ${isProduction ? 'PRODUCTION (All bots)' : `TEST (${testBotName})`}`)
console.log(`🌐 Port: ${port}`)

// Get bot tokens
const bots = []

if (isProduction) {
  // PRODUCTION: Use BOT_TOKEN_1, BOT_TOKEN_2, etc.
  for (let i = 1; i <= 10; i++) {
    const token = process.env[`BOT_TOKEN_${i}`]
    if (token) {
      const bot = new Telegraf(token)
      
      // Commands for each bot
      bot.start((ctx) => ctx.reply(`🎯 Railway HTTP бот #${i} работает!`))
      bot.command('test', (ctx) => ctx.reply(`✅ HTTP тест успешен! Бот #${i}`))
      
      bots.push({ id: i, bot, token, name: `bot_${i}` })
      console.log(`✅ Production Bot #${i} initialized`)
    }
  }
} else {
  // TEST: Use BOT_TOKEN_TEST_1 only
  const testToken = process.env.BOT_TOKEN_TEST_1
  if (testToken) {
    const bot = new Telegraf(testToken)
    
    // Commands for test bot
    bot.start((ctx) => ctx.reply(`🎯 Тестовый бот @${testBotName} работает!`))
    bot.command('test', (ctx) => ctx.reply(`✅ HTTP тест успешен! @${testBotName}`))
    
    bots.push({ id: 'test', bot, token: testToken, name: testBotName })
    console.log(`✅ Test Bot @${testBotName} initialized`)
  }
}

if (bots.length === 0) {
  const missingToken = isProduction ? 'BOT_TOKEN_1, BOT_TOKEN_2...' : 'BOT_TOKEN_TEST_1'
  console.error(`❌ No bot tokens found! Missing: ${missingToken}`)
  process.exit(1)
}

console.log(`🤖 Total bots: ${bots.length} (${isProduction ? 'Production' : 'Test'} mode)`)

// Express app
const app = express()
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ 
    status: 'Railway bot farm running',
    mode: isProduction ? 'PRODUCTION (All bots)' : `TEST (${testBotName})`,
    bots_count: bots.length,
    bot_ids: bots.map(b => b.id),
    bot_names: bots.map(b => b.name),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  })
})

app.get('/health', (req, res) => {
  res.json({ 
    healthy: true,
    bots_count: bots.length 
  })
})

// Webhook for specific bot
app.post('/webhook/:botId', (req, res) => {
  let botId = req.params.botId
  
  // Convert to number for production mode, keep as string for test mode
  if (isProduction) {
    botId = parseInt(botId)
  }
  
  const botData = bots.find(b => b.id === botId)
  
  if (!botData) {
    console.log(`❌ Bot ${botId} not found`)
    return res.status(404).json({ error: 'Bot not found' })
  }
  
  console.log(`📨 Webhook received for bot ${botId} (@${botData.name})`)
  botData.bot.handleUpdate(req.body)
  res.sendStatus(200)
})

// General webhook (for first bot by default)
app.post('/webhook', (req, res) => {
  const botData = bots[0]
  console.log(`📨 General webhook received for bot ${botData.id} (@${botData.name})`)
  botData.bot.handleUpdate(req.body)
  res.sendStatus(200)
})

async function start() {
  try {
    console.log(`🔄 Starting initialization of ${bots.length} bots...`)
    
    // Initialize all bots
    for (let i = 0; i < bots.length; i++) {
      const botData = bots[i]
      console.log(`🔄 Initializing bot ${i + 1}/${bots.length} (ID: ${botData.id})...`)
      
      try {
        const info = await botData.bot.telegram.getMe()
        console.log(`✅ Bot ${botData.id} (@${botData.name}) ready: @${info.username}`)
        
        // Clear any webhooks
        await botData.bot.telegram.deleteWebhook({ drop_pending_updates: true })
        console.log(`🧹 Bot ${botData.id} (@${botData.name}) webhooks cleared`)
      } catch (error) {
        console.error(`❌ Failed to initialize bot ${botData.id}: ${error.message}`)
        // Continue with other bots instead of failing completely
      }
    }
    
    // Start HTTP server ONLY
    app.listen(port, () => {
      console.log(`🌐 HTTP server running on port ${port}`)
      const mode = isProduction ? 'Production' : `Test (@${testBotName})`
      console.log(`🎉 Railway bot farm READY! (${bots.length} bots, ${mode} mode)`)
      
      // Log all successfully initialized bots
      const workingBots = bots.filter(b => b.bot)
      console.log(`📊 Working bots: ${workingBots.map(b => b.name).join(', ')}`)
    })
    
  } catch (error) {
    console.error('❌ Critical error in start():', error.message)
    console.error('❌ Stack trace:', error.stack)
    
    // Try to start HTTP server anyway for debugging
    app.listen(port, () => {
      console.log(`🌐 HTTP server running on port ${port} (emergency mode)`)
    })
  }
}

start()

setInterval(() => {
  const mode = isProduction ? 'Production' : `Test (@${testBotName})`
  console.log(`💓 Bot farm alive: ${Math.floor(process.uptime())}s (${bots.length} bots, ${mode})`)
}, 60000)