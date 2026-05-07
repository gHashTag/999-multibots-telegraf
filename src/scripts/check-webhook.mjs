import { Telegram } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ No bot token found in env');
  process.exit(1);
}

const telegram = new Telegram(token);

try {
  const webhook = await telegram.getWebhookInfo();
  console.log('✅ Webhook info:');
  console.log(JSON.stringify(webhook, null, 2));
  
  if (webhook.url) {
    console.log('\n✅ Webhook is set to:', webhook.url);
  } else {
    console.log('\n⚠️ No webhook configured - bot in polling mode');
  }
} catch (error) {
  console.error('❌ Error checking webhook:', error.message);
}
