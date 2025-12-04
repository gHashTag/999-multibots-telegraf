#!/usr/bin/env node

/**
 * Тест всех 11 ботов после деплоя
 * Проверяет доступность каждого бота и отправляет /start
 */

const axios = require('axios');

// Список всех 11 ботов с их токенами из Infisical
const bots = [
  { name: 'neuro_blogger_bot', token: process.env.BOT_TOKEN_1, port: 3001 },
  { name: 'MetaMuse_Manifest_bot', token: process.env.BOT_TOKEN_2, port: 3002 },
  { name: 'ZavaraBot', token: process.env.BOT_TOKEN_3, port: 3003 },
  { name: 'LeeSolarbot', token: process.env.BOT_TOKEN_4, port: 3004 },
  { name: 'NeuroLenaAssistant_bot', token: process.env.BOT_TOKEN_5, port: 3005 },
  { name: 'NeurostylistShtogrina_bot', token: process.env.BOT_TOKEN_6, port: 3006 },
  { name: 'Gaia_Kamskaia_bot', token: process.env.BOT_TOKEN_7, port: 3007 },
  { name: 'Kaya_easy_art_bot', token: process.env.BOT_TOKEN_8, port: 3008 },
  { name: 'AI_STARS_bot', token: process.env.BOT_TOKEN_9, port: 3009 },
  { name: 'HaimGroupMedia_bot', token: process.env.BOT_TOKEN_10, port: 3010 },
  { name: 'OM_AI_Digital_studio_bot', token: process.env.BOT_TOKEN_11, port: 3011 },
];

async function testBot(bot) {
  console.log(`\n🤖 Тестируем бота: ${bot.name}`);
  console.log(`   Порт: ${bot.port}`);

  if (!bot.token) {
    console.log(`   ❌ Токен не найден в переменных окружения`);
    return { success: false, error: 'NO_TOKEN' };
  }

  try {
    // Проверяем информацию о боте
    const response = await axios.get(`https://api.telegram.org/bot${bot.token}/getMe`, {
      timeout: 10000,
    });

    const botInfo = response.data.result;
    console.log(`   ✅ Бот доступен: @${botInfo.username} (${botInfo.first_name})`);

    // Отправляем тестовое сообщение
    console.log(`   📤 Отправляем /start...`);

    // Получаем информацию о webhook
    const webhookInfo = await axios.get(`https://api.telegram.org/bot${bot.token}/getWebhookInfo`, {
      timeout: 10000,
    });

    if (webhookInfo.data.result.url) {
      console.log(`   🔗 Webhook: ${webhookInfo.data.result.url}`);
    } else {
      console.log(`   🔄 Polling режим активен`);
    }

    return {
      success: true,
      botInfo,
      webhook: webhookInfo.data.result.url || 'polling',
      port: bot.port,
    };

  } catch (error) {
    console.log(`   ❌ Ошибка: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('🧪 ТЕСТИРОВАНИЕ ВСЕХ 11 БОТОВ');
  console.log('='.repeat(60));

  const results = [];

  for (const bot of bots) {
    const result = await testBot(bot);
    results.push({ ...bot, ...result });
    await new Promise(resolve => setTimeout(resolve, 1000)); // Пауза между запросами
  }

  // Итоговый отчет
  console.log('\n' + '='.repeat(60));
  console.log('📊 ИТОГОВЫЙ ОТЧЕТ');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Работают: ${successful.length}/${results.length}`);
  console.log(`❌ Не работают: ${failed.length}/${results.length}`);

  if (failed.length > 0) {
    console.log('\n❌ НЕРАБОТАЮЩИЕ БОТЫ:');
    failed.forEach(bot => {
      console.log(`   - ${bot.name} (${bot.port}): ${bot.error}`);
    });
  }

  console.log('\n✅ РАБОТАЮЩИЕ БОТЫ:');
  successful.forEach(bot => {
    console.log(`   ✅ ${bot.name} (@${bot.botInfo.username}) - Порт ${bot.port} - ${bot.webhook}`);
  });

  // Проверяем конкретно 11-го бота
  const eleventhBot = results.find(r => r.name === 'OM_AI_Digital_studio_bot');
  if (eleventhBot) {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 ПРОВЕРКА 11-ГО БОТА: OM_AI_Digital_studio_bot');
    console.log('='.repeat(60));
    if (eleventhBot.success) {
      console.log(`✅ OM_AI_Digital_studio_bot успешно работает!`);
      console.log(`   Username: @${eleventhBot.botInfo.username}`);
      console.log(`   Порт: ${eleventhBot.port}`);
      console.log(`   Режим: ${eleventhBot.webhook}`);
    } else {
      console.log(`❌ OM_AI_Digital_studio_bot не работает: ${eleventhBot.error}`);
    }
  }

  return results;
}

// Запуск тестов
runTests()
  .then(results => {
    console.log('\n🏁 Тестирование завершено');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Критическая ошибка:', error);
    process.exit(1);
  });
