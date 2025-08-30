#!/usr/bin/env node

/**
 * Script to set up webhooks for all configured bots
 * This ensures all bots are properly configured to receive updates via webhooks
 */

require('dotenv').config()

const bots = [
  { token: process.env.BOT_TOKEN_1, name: 'neuro_blogger_bot', port: 3001 },
  { token: process.env.BOT_TOKEN_2, name: 'MetaMuse_Manifest_bot', port: 3002 },
  { token: process.env.BOT_TOKEN_3, name: 'ZavaraBot', port: 3003 },
  { token: process.env.BOT_TOKEN_4, name: 'LeeSolarbot', port: 3004 },
  { token: process.env.BOT_TOKEN_5, name: 'NeuroLenaAssistant_bot', port: 3005 },
  { token: process.env.BOT_TOKEN_6, name: 'NeurostylistShtogrina_bot', port: 3006 },
  { token: process.env.BOT_TOKEN_7, name: 'Gaia_Kamskaia_bot', port: 3007 },
  { token: process.env.BOT_TOKEN_8, name: 'Kaya_easy_art_bot', port: 3008 },
  { token: process.env.BOT_TOKEN_9, name: 'AI_STARS_bot', port: 3009 },
  { token: process.env.BOT_TOKEN_10, name: 'HaimGroupMedia_bot', port: 3010 },
]

const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN || '185.161.67.53'
const USE_HTTPS = true // Production server has SSL

async function setWebhook(bot) {
  if (!bot.token) {
    console.log(`⚠️ No token for ${bot.name}, skipping...`)
    return
  }

  const protocol = USE_HTTPS ? 'https' : 'http'
  const webhookUrl = `${protocol}://${WEBHOOK_DOMAIN}/${bot.name}`
  
  try {
    // Set webhook using Telegram API
    const setWebhookUrl = `https://api.telegram.org/bot${bot.token}/setWebhook`
    const response = await fetch(setWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        drop_pending_updates: true, // Clear pending updates
        allowed_updates: [
          'message',
          'callback_query',
          'inline_query',
          'my_chat_member',
          'chat_member',
        ],
      }),
    })

    const result = await response.json()
    
    if (result.ok) {
      console.log(`✅ Webhook set for ${bot.name}: ${webhookUrl}`)
      
      // Check webhook info
      const infoUrl = `https://api.telegram.org/bot${bot.token}/getWebhookInfo`
      const infoResponse = await fetch(infoUrl)
      const info = await infoResponse.json()
      
      if (info.result) {
        console.log(`   - URL: ${info.result.url}`)
        console.log(`   - Pending updates: ${info.result.pending_update_count || 0}`)
        if (info.result.last_error_message) {
          console.log(`   - ⚠️ Last error: ${info.result.last_error_message}`)
        }
      }
    } else {
      console.log(`❌ Failed to set webhook for ${bot.name}: ${result.description}`)
    }
  } catch (error) {
    console.log(`❌ Error setting webhook for ${bot.name}: ${error.message}`)
  }
  
  console.log('') // Empty line for readability
}

async function main() {
  console.log('🔗 Setting up webhooks for all bots...')
  console.log(`📍 Webhook domain: ${WEBHOOK_DOMAIN}`)
  console.log(`🔒 Using HTTPS: ${USE_HTTPS}`)
  console.log('')

  for (const bot of bots) {
    await setWebhook(bot)
  }

  console.log('✨ Webhook setup complete!')
}

// Run the script
main().catch(console.error)