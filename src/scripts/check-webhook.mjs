import { createRequire } from 'node:module'
import { Telegram } from 'telegraf'

// The host is chosen per bot (scripts/lib/telegram-api.cjs): a bot on our own
// Bot API server must never be asked on the cloud.
const { telegramApiRootFor } = createRequire(import.meta.url)(
  '../../scripts/lib/telegram-api.cjs'
)

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error('❌ No bot token found in env')
  process.exit(1)
}

const telegram = new Telegram(token, { apiRoot: telegramApiRootFor(token) })

try {
  const webhook = await telegram.getWebhookInfo()
  console.log('✅ Webhook info:')
  console.log(JSON.stringify(webhook, null, 2))

  if (webhook.url) {
    console.log('\n✅ Webhook is set to:', webhook.url)
  } else {
    console.log('\n⚠️ No webhook configured - bot in polling mode')
  }
} catch (error) {
  console.error('❌ Error checking webhook:', error.message)
}
