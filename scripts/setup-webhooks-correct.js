#!/usr/bin/env node

/**
 * АВТОМАТИЧЕСКАЯ УСТАНОВКА ВЕБХУКОВ ДЛЯ TELEGRAM БОТОВ
 * Использует правильный домен и пути из nginx конфигурации
 */

const https = require('https');

// Конфигурация из переменных окружения
const WEBHOOK_DOMAIN = process.env.ORIGIN || 'https://test-render-farm.ru';

// Маппинг токенов на имена ботов (как в nginx конфигурации)
const BOT_CONFIGS = [
  { token: process.env.BOT_TOKEN_1, username: 'neuro_blogger_bot', port: 3001 },
  { token: process.env.BOT_TOKEN_2, username: 'MetaMuse_Manifest_bot', port: 3002 },
  { token: process.env.BOT_TOKEN_3, username: 'ZavaraBot', port: 3003 },
  { token: process.env.BOT_TOKEN_4, username: 'LeeSolarbot', port: 3004 },
  { token: process.env.BOT_TOKEN_5, username: 'NeuroLenaAssistant_bot', port: 3005 },
  { token: process.env.BOT_TOKEN_6, username: 'NeurostylistShtogrina_bot', port: 3006 },
  { token: process.env.BOT_TOKEN_7, username: 'Gaia_Kamskaia_bot', port: 3007 },
  { token: process.env.BOT_TOKEN_8, username: 'Kaya_easy_art_bot', port: 3008 },
  { token: process.env.BOT_TOKEN_9, username: 'AI_STARS_bot', port: 3009 },
  { token: process.env.BOT_TOKEN_10, username: 'HaimGroupMedia_bot', port: 3010 }
];

/**
 * Проверяет валидность токена и получает информацию о боте
 */
async function getBotInfo(token) {
  return new Promise((resolve) => {
    https.get(`https://api.telegram.org/bot${token}/getMe`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.ok ? result.result : null);
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

/**
 * Устанавливает вебхук для бота
 */
async function setWebhook(token, botUsername, index) {
  return new Promise((resolve) => {
    // Формируем URL вебхука по имени бота (как в nginx)
    const webhookUrl = `${WEBHOOK_DOMAIN}/${botUsername}`;
    
    const webhookData = JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query', 'inline_query', 'chosen_inline_result', 'edited_message'],
      drop_pending_updates: false // Не теряем накопившиеся обновления
    });
    
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/setWebhook`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': webhookData.length
      }
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          if (result.ok) {
            console.log(`✅ BOT_TOKEN_${index + 1} (@${botUsername}): Webhook установлен → ${webhookUrl}`);
            resolve({ success: true, botUsername, webhookUrl });
          } else {
            console.log(`❌ BOT_TOKEN_${index + 1} (@${botUsername}): ${result.description}`);
            resolve({ success: false, botUsername, error: result.description });
          }
        } catch (e) {
          console.log(`❌ BOT_TOKEN_${index + 1}: Ошибка парсинга ответа`);
          resolve({ success: false, error: 'Parse error' });
        }
      });
    });
    
    req.on('error', (e) => {
      console.log(`❌ BOT_TOKEN_${index + 1}: Сетевая ошибка - ${e.message}`);
      resolve({ success: false, error: e.message });
    });
    
    req.write(webhookData);
    req.end();
  });
}

/**
 * Главная функция
 */
async function main() {
  console.log('====================================');
  console.log('🚀 УСТАНОВКА ВЕБХУКОВ ДЛЯ TELEGRAM БОТОВ');
  console.log('====================================');
  console.log(`📍 Домен: ${WEBHOOK_DOMAIN}`);
  console.log(`🤖 Проверка ${BOT_CONFIGS.length} ботов...\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < BOT_CONFIGS.length; i++) {
    const config = BOT_CONFIGS[i];
    
    if (!config.token) {
      console.log(`⚠️  BOT_TOKEN_${i + 1}: Токен не установлен в переменных окружения`);
      continue;
    }
    
    // Сначала проверяем валидность токена
    const botInfo = await getBotInfo(config.token);
    
    if (!botInfo) {
      console.log(`❌ BOT_TOKEN_${i + 1}: Невалидный токен`);
      failCount++;
      continue;
    }
    
    // Используем реальное имя бота из API
    const actualUsername = botInfo.username;
    const expectedUsername = config.username;
    
    // Предупреждаем если имя не совпадает с ожидаемым
    if (actualUsername !== expectedUsername) {
      console.log(`⚠️  BOT_TOKEN_${i + 1}: Имя бота @${actualUsername} не совпадает с ожидаемым @${expectedUsername}`);
      console.log(`   Используем актуальное имя для вебхука: ${actualUsername}`);
    }
    
    // Устанавливаем вебхук с правильным именем
    const result = await setWebhook(config.token, actualUsername || expectedUsername, i);
    
    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // Небольшая задержка между запросами
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n====================================');
  console.log('📊 РЕЗУЛЬТАТЫ:');
  console.log(`✅ Успешно установлено: ${successCount}`);
  console.log(`❌ Ошибок: ${failCount}`);
  console.log('====================================');
  
  // Проверяем статус вебхуков
  if (successCount > 0) {
    console.log('\n🔍 Проверка статуса вебхуков...\n');
    
    for (let i = 0; i < Math.min(3, BOT_CONFIGS.length); i++) {
      const config = BOT_CONFIGS[i];
      if (!config.token) continue;
      
      await new Promise((resolve) => {
        https.get(`https://api.telegram.org/bot${config.token}/getWebhookInfo`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const info = JSON.parse(data);
              if (info.ok && info.result) {
                console.log(`📍 BOT_${i + 1}:`);
                console.log(`   URL: ${info.result.url || 'Не установлен'}`);
                console.log(`   Ошибки: ${info.result.last_error_message || 'Нет'}`);
                console.log(`   Ожидающие обновления: ${info.result.pending_update_count || 0}`);
              }
            } catch (e) {
              // Игнорируем ошибки проверки
            }
            resolve();
          });
        }).on('error', resolve);
      });
    }
  }
  
  console.log('\n✅ Установка вебхуков завершена!');
  process.exit(successCount > 0 ? 0 : 1);
}

// Запуск
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };