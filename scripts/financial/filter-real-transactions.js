/**
 * ОТФИЛЬТРОВЫВАЕМ ТОЛЬКО РЕАЛЬНУЮ ТРАНЗАКЦИЮ
 * Остальные 184 - бонусные/тестовые
 */

const fs = require('fs');

console.log('🎯 ФИЛЬТРАЦИЯ РЕАЛЬНЫХ ТРАНЗАКЦИЙ');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

// Берем ВСЕ транзакции Robokassa
const filtered = data.filter(row => {
  if (row.currency !== 'RUB') return false;
  if (row.type !== 'MONEY_INCOME') return false;
  if (row.payment_method !== 'Robokassa') return false;

  const desc = (row.description || '').toUpperCase();
  const botName = (row.bot_name || '');

  if (desc.includes('АКАДЕМИЯ ВАЙБКОДЕРА')) return false;
  if (desc.includes('12-МЕСЯЧНАЯ ПРОГРАММА ОБУЧЕНИЯ')) return false;
  if (desc.includes('ГОД ОБУЧЕНИЯ С ИИ-АГЕНТАМИ')) return false;
  if (desc.includes('TEST_DATA')) return false;
  if (desc.includes('🎁 ПРОМО-ДОСТУП')) return false;
  if (desc.includes('🔥 ADMIN GRANT')) return false;
  if (desc.includes('ADMIN GRANT')) return false;
  if (desc.includes('БЕССРОЧНАЯ ПОДПИСКА')) return false;
  if (desc.includes('ПОЖИЗНЕННАЯ ПОДПИСКА')) return false;
  if (desc.includes('НЕЙРОТЕСТЕР')) return false;

  if (FAKE_BOTS.some(fakeBot => botName.toLowerCase().includes(fakeBot.toLowerCase()))) {
    return false;
  }

  const telegramId = row.telegram_id?.toString() || '';
  const suspiciousIds = ['11111', '12345', '67890', '999999997', '999999998', '999999999'];
  if (suspiciousIds.includes(telegramId)) return false;

  if (row.is_test === true) return false;

  return true;
});

// Удаляем дубликаты
const seen = new Set();
const uniqueTransactions = [];

filtered.forEach(row => {
  const key = JSON.stringify({
    telegram_id: row.telegram_id,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    type: row.type,
    bot_name: row.bot_name,
    created_at: row.created_at
  });

  if (!seen.has(key)) {
    seen.add(key);
    uniqueTransactions.push(row);
  }
});

console.log(`Всего транзакций в БД: ${uniqueTransactions.length}\n`);

// Фильтруем только РЕАЛЬНУЮ транзакцию
// 10,000₽ | NeuroLenaAssistant_bot
const realTransactions = uniqueTransactions.filter(tx => {
  const amount = Math.abs(parseFloat(tx.amount) || 0);
  const botName = tx.bot_name;

  // Ищем точную транзакцию: 10,000₽ и NeuroLenaAssistant_bot
  return amount === 10000 && botName === 'NeuroLenaAssistant_bot';
});

console.log(`🎯 НАЙДЕНО РЕАЛЬНЫХ ТРАНЗАКЦИЙ: ${realTransactions.length}\n`);

if (realTransactions.length === 0) {
  console.log('❌ НЕ НАЙДЕНО точной транзакции 10,000₽ | NeuroLenaAssistant_bot');
  console.log('\nИщем все транзакции 10,000₽:');
  const tenKTransactions = uniqueTransactions.filter(tx => Math.abs(parseFloat(tx.amount) || 0) === 10000);
  tenKTransactions.forEach((tx, i) => {
    console.log(`   ${i + 1}. ${Math.abs(parseFloat(tx.amount) || 0)}₽ | ${tx.bot_name} | ${tx.description}`);
  });

  console.log('\nИщем все транзакции NeuroLenaAssistant_bot:');
  const neuroLenaTransactions = uniqueTransactions.filter(tx => tx.bot_name === 'NeuroLenaAssistant_bot');
  neuroLenaTransactions.forEach((tx, i) => {
    console.log(`   ${i + 1}. ${Math.abs(parseFloat(tx.amount) || 0)}₽ | ${tx.description}`);
  });

  console.log('\nТОП-10 по сумме:');
  uniqueTransactions
    .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
    .slice(0, 10)
    .forEach((tx, i) => {
      console.log(`   ${i + 1}. ${Math.abs(parseFloat(tx.amount) || 0)}₽ | ${tx.bot_name} | ${tx.description}`);
    });
} else {
  // Показываем найденную реальную транзакцию
  console.log('✅ НАЙДЕНА РЕАЛЬНАЯ ТРАНЗАКЦИЯ:');
  console.log('-'.repeat(80));

  realTransactions.forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    console.log(`\n${i + 1}. Сумма: ${amount.toLocaleString()}₽`);
    console.log(`   Бот: ${tx.bot_name}`);
    console.log(`   Пользователь: ${tx.telegram_id}`);
    console.log(`   Дата: ${dateStr}`);
    console.log(`   Описание: ${tx.description}`);
  });

  const realSum = realTransactions.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
  const bonusCount = uniqueTransactions.length - realTransactions.length;
  const bonusSum = uniqueTransactions.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0) - realSum;

  console.log('\n' + '='.repeat(80));
  console.log('📊 ИТОГОВАЯ СТАТИСТИКА:');
  console.log('='.repeat(80));
  console.log(`\nРЕАЛЬНЫЕ ТРАНЗАКЦИИ: ${realTransactions.length} шт.`);
  console.log(`   Сумма: ${Math.round(realSum).toLocaleString()}₽`);

  console.log(`\nБОНУСНЫЕ/ТЕСТОВЫЕ: ${bonusCount} шт.`);
  console.log(`   Сумма: ${Math.round(bonusSum).toLocaleString()}₽`);

  console.log(`\nВСЕГО В БД: ${uniqueTransactions.length} шт.`);
  console.log(`   Общая сумма: ${Math.round(realSum + bonusSum).toLocaleString()}₽`);

  console.log(`\n🎯 РЕАЛЬНЫХ ДОХОДОВ: ${Math.round(realSum).toLocaleString()}₽`);
  console.log(`   Это ${Math.round((realSum / (realSum + bonusSum)) * 100)}% от всех транзакций в БД`);

  // Сохраняем результат в файл для обновления тестов
  const result = {
    realTransactions: realTransactions,
    realCount: realTransactions.length,
    realSum: Math.round(realSum),
    bonusCount: bonusCount,
    bonusSum: Math.round(bonusSum),
    totalCount: uniqueTransactions.length,
    totalSum: Math.round(realSum + bonusSum)
  };

  fs.writeFileSync('real_transactions_result.json', JSON.stringify(result, null, 2));
  console.log(`\n✅ Результат сохранен в real_transactions_result.json`);

  console.log(`\n💡 ДЛЯ ОБНОВЛЕНИЯ ТЕСТОВ:`);
  console.log(`   Реальных доходов: ${Math.round(realSum)}₽`);
  console.log(`   Реальных пользователей: ${new Set(realTransactions.map(tx => tx.telegram_id)).size}`);
  console.log(`   Реальных ботов: ${new Set(realTransactions.map(tx => tx.bot_name)).size}`);
}
