// Railway Fix - Multi-Bot Farm (No Polling Conflicts)
const { Telegraf } = require('telegraf')
const express = require('express')

console.log('🚀 RAILWAY FIX: Starting HTTP bot farm...')

const isProduction = process.env.NODE_ENV === 'production'
const port = process.env.PORT || 3000
const testBotName = process.env.TEST_BOT_NAME || 'clip_maker_neuro_bot'

console.log(`🌐 Mode: ${isProduction ? 'PRODUCTION (All bots)' : `TEST (${testBotName})`}`)
console.log(`🌐 Port: ${port}`)

// Start HTTP server FIRST for Railway health checks
const app = express()
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ 
    status: 'Railway bot farm starting...',
    mode: isProduction ? 'PRODUCTION (All bots)' : `TEST (${testBotName})`,
    port: port,
    timestamp: new Date().toISOString()
  })
})

app.get('/health', (req, res) => {
  res.json({ healthy: true })
})

// Start server immediately
app.listen(port, () => {
  console.log(`🌐 HTTP server running on port ${port}`)
  console.log(`🎯 Railway health check ready`)
})

// Initialize bots AFTER server starts
const bots = []
let botsInitialized = false

async function initializeBots() {
  console.log('🔄 Starting bot initialization...')
  
  if (isProduction) {
    // PRODUCTION: Use BOT_TOKEN_1, BOT_TOKEN_2, etc. (all 9 production bots)
    for (let i = 1; i <= 9; i++) {
      const token = process.env[`BOT_TOKEN_${i}`]
      if (token) {
        try {
          const bot = new Telegraf(token)
          
          // Commands for each bot
          bot.start((ctx) => ctx.reply(`🎯 Railway HTTP бот #${i} работает!`))
          bot.command('test', (ctx) => ctx.reply(`✅ HTTP тест успешен! Бот #${i}`))
          
          // Test bot connection with timeout
          const info = await Promise.race([
            bot.telegram.getMe(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
          ])
          
          await Promise.race([
            bot.telegram.deleteWebhook({ drop_pending_updates: true }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
          ])
          
          // Map bot number to actual bot name
          const botNames = {
            1: 'neuro_blogger_bot',
            2: 'MetaMuse_Manifest_bot', 
            3: 'ZavaraBot',
            4: 'LeeSolarbot',
            5: 'NeuroLenaAssistant_bot',
            6: 'NeurostylistShtogrina_bot',
            7: 'Gaia_Kamskaia_bot',
            8: 'Kaya_easy_art_bot',
            9: 'AI_STARS_bot'
          }
          
          bots.push({ 
            id: i, 
            bot, 
            token, 
            name: botNames[i] || `bot_${i}`, 
            username: info.username 
          })
          console.log(`✅ Production Bot #${i} (@${info.username}) ready as ${botNames[i]}`)
        } catch (error) {
          console.error(`❌ Failed to init bot #${i}: ${error.message}`)
        }
      }
    }
  } else {
    // TEST: Use BOT_TOKEN_TEST_1 only
    const testToken = process.env.BOT_TOKEN_TEST_1
    if (testToken) {
      try {
        const bot = new Telegraf(testToken)
        
        // Commands for test bot
        bot.start((ctx) => ctx.reply(`🎯 Тестовый бот @${testBotName} работает!`))
        bot.command('test', (ctx) => ctx.reply(`✅ HTTP тест успешен! @${testBotName}`))
        
        // Test bot connection with timeout
        const info = await Promise.race([
          bot.telegram.getMe(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout getting bot info')), 10000))
        ])
        
        await Promise.race([
          bot.telegram.deleteWebhook({ drop_pending_updates: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout clearing webhook')), 5000))
        ])
        
        bots.push({ id: 'test', bot, token: testToken, name: testBotName, username: info.username })
        console.log(`✅ Test Bot @${testBotName} (@${info.username}) ready`)
      } catch (error) {
        console.error(`❌ Failed to init test bot: ${error.message}`)
        // Add bot anyway for webhook testing
        const bot = new Telegraf(testToken)
        bot.start((ctx) => ctx.reply(`🎯 Тестовый бот @${testBotName} работает! (fallback mode)`))
        bot.command('test', (ctx) => ctx.reply(`✅ HTTP тест успешен! @${testBotName} (fallback mode)`))
        bots.push({ id: 'test', bot, token: testToken, name: testBotName, username: testBotName })
        console.log(`⚠️ Test Bot @${testBotName} added in fallback mode`)
      }
    }
  }
  
  botsInitialized = true
  console.log(`🎉 Bot farm initialized! (${bots.length} bots)`)
}

// Initialize bots after server starts (non-blocking)
setTimeout(() => {
  initializeBots().catch(error => {
    console.error('❌ Bot initialization failed:', error.message)
    // Continue anyway - server still works
  })
}, 1000)

// Update main endpoint to show current status
app.get('/', (req, res) => {
  res.json({ 
    status: botsInitialized ? 'Railway bot farm running' : 'Railway bot farm initializing...',
    mode: isProduction ? 'PRODUCTION (All bots)' : `TEST (${testBotName})`,
    bots_count: bots.length,
    bot_ids: bots.map(b => b.id),
    bot_names: bots.map(b => b.name),
    bot_usernames: bots.map(b => b.username),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    initialized: botsInitialized
  })
})

app.get('/health', (req, res) => {
  res.json({ 
    healthy: true,
    bots_count: bots.length,
    initialized: botsInitialized
  })
})

// Universal webhook handler - supports both bot ID and bot name  
app.post('/webhook/:botIdentifier', (req, res) => {
  if (!botsInitialized || bots.length === 0) {
    return res.status(503).json({ error: 'Bots not initialized yet' })
  }
  
  const identifier = req.params.botIdentifier
  let botData
  
  // Try to find by ID (number) first
  const botId = parseInt(identifier)
  if (!isNaN(botId)) {
    botData = bots.find(b => b.id === botId)
  }
  
  // If not found by ID, try to find by name
  if (!botData) {
    botData = bots.find(b => b.name === identifier)
  }
  
  if (!botData) {
    console.log(`❌ Bot ${identifier} not found (tried ID and name)`)
    return res.status(404).json({ error: 'Bot not found' })
  }
  
  console.log(`📨 Webhook received for ${identifier} → ${botData.name} (@${botData.username})`)
  botData.bot.handleUpdate(req.body)
  res.sendStatus(200)
})

// General webhook (for first bot by default)
app.post('/webhook', (req, res) => {
  if (!botsInitialized || bots.length === 0) {
    return res.status(503).json({ error: 'Bots not initialized yet' })
  }
  
  const botData = bots[0]
  console.log(`📨 General webhook received for bot ${botData.id} (@${botData.name})`)
  botData.bot.handleUpdate(req.body)
  res.sendStatus(200)
})

// Health monitoring
setInterval(() => {
  const mode = isProduction ? 'Production' : `Test (@${testBotName})`
  console.log(`💓 Bot farm alive: ${Math.floor(process.uptime())}s (${bots.length} bots, ${mode})`)
}, 60000)