#!/usr/bin/env node
require('dotenv').config()

async function sendNotification() {
  const BOT_TOKEN = process.env.BOT_TOKEN_9  // AI_STARS_bot
  const USER_ID = '693774948'
  
  const message = `✅ Тренировка модели завершена!

📦 Модель: kris
🎯 Trigger word: KRIS
🆔 Model URL: ghashtag/kris:82a5773f...

🎨 Теперь вы можете использовать эту модель в разделе "Модели" в Нейрофото.

Чтобы использовать модель, укажите trigger word в промпте: KRIS`

  console.log('Sending notification to user 693774948...')
  
  const axios = require('axios')
  const response = await axios.post(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      chat_id: USER_ID,
      text: message
    }
  )
  
  if (response.data.ok) {
    console.log('✅ Notification sent successfully!')
  } else {
    console.error('❌ Failed to send notification:', response.data)
  }
}

sendNotification().then(() => process.exit(0))
