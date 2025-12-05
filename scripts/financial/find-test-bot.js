/**
 * ПОИСК САМОГО ПОПУЛЯРНОГО ТЕСТОВОГО БОТА
 */

const fs = require('fs');

console.log('🔍 ПОИСК САМОГО ПОПУЛЯРНОГО ТЕСТОВОГО БОТА\n');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

// Тестовые боты (из анализа)
const testBotNames = [
  'admin_system',
  'TestNeurocoder_bot',
  'admin_script',
  'test_bot',
  'webhook-test-bot',
  'diagnostic_test',
  'public_test',
  'admin_cli',
  'system_grant',
  'admin_grant',
  'admin_unlimited',
  'system_recovery',
  'admin_fix',
  'mcp-server',
  'helper_999_bot',
  'unknown_bot',
  'test_bot_2',
  'analytics_bot',
  'admin_bot',
  'test_neuro_bot'
];

// Подсчет по каждому тестовому боту
const testBotStats = {};

data.forEach(row => {
  const botName = row.bot_name;

  // Если это тестовый бот
  if (testBotNames.some(testName => botName.toLowerCase().includes(testName.toLowerCase()))) {
    if (!testBotStats[botName]) {
      testBotStats[botName] = {
        count: 0,
        totalAmount: 0,
        uniqueUsers: new Set(),
        sample: row
      };
    }
    testBotStats[botName].count++;
    testBotStats[botName].totalAmount += Math.abs(parseFloat(row.amount) || 0);
    testBotStats[botName].uniqueUsers.add(row.telegram_id);
  }
});

// Преобразуем в массив и сортируем по количеству операций
const sortedBots = Object.entries(testBotStats)
  .map(([name, stats]) => ({
    name,
    operations: stats.count,
    totalAmount: stats.totalAmount,
    uniqueUsers: stats.uniqueUsers.size
  }))
  .sort((a, b) => b.operations - a.operations);

console.log('ТЕСТОВЫЕ БОТЫ (по популярности):');
console.log('-'.repeat(80));
sortedBots.forEach((bot, i) => {
  console.log(`${i + 1}. ${bot.name}`);
  console.log(`   Операций: ${bot.operations.toLocaleString()}`);
  console.log(`   Сумма: ${bot.totalAmount.toLocaleString()}`);
  console.log(`   Пользователей: ${bot.uniqueUsers}`);
  console.log('');
});

console.log('='.repeat(80));
console.log('\n✅ РЕКОМЕНДАЦИЯ:');
console.log(`Самый популярный тестовый бот: ${sortedBots[0].name}`);
console.log(`- Операций: ${sortedBots[0].operations.toLocaleString()}`);
console.log(`- Уникальных пользователей: ${sortedBots[0].uniqueUsers}`);
console.log('\n🎯 ОБЪЕДИНЯЕМ ВСЕ ТЕСТОВЫЕ БОТЫ В ОДИН: test_bot_system');

// Теперь посмотрим на производственные боты
console.log('\n\n' + '='.repeat(80));
console.log('ПРОДАКШН БОТЫ (из констант):');
console.log('-'.repeat(80));

const PRODUCTION_BOTS = [
  'neuro_blogger_bot',
  'MetaMuse_Manifest_bot',
  'Gaia_Kamskaia_bot',
  'ai_koshey_bot',
  'AI_STARS_bot',
  'NeurostylistShtogrina_bot',
  'Kaya_easy_art_bot',
  'HaimGroupMedia_bot'
];

// Проверяем, какие из них есть в данных
const productionStats = {};
PRODUCTION_BOTS.forEach(botName => {
  const stats = testBotStats[botName] || { count: 0, totalAmount: 0, uniqueUsers: new Set() };
  productionStats[botName] = {
    operations: stats.count || 0,
    totalAmount: stats.totalAmount || 0,
    uniqueUsers: stats.uniqueUsers ? stats.uniqueUsers.size : 0
  };
});

Object.entries(productionStats).forEach(([name, stats]) => {
  console.log(`${name}:`);
  console.log(`   Операций: ${stats.operations.toLocaleString()}`);
  console.log(`   Сумма: ${stats.totalAmount.toLocaleString()}`);
  console.log(`   Пользователей: ${stats.uniqueUsers}`);
  console.log('');
});

console.log('='.repeat(80));
