/**
 * АНАЛИЗ ТРАНЗАКЦИЙ, НЕ СОВПАДАЮЩИХ С CSV ROBOKASSA
 * Проверяем - это бонусы или реальные деньги?
 */

const fs = require('fs');

console.log('🔍 АНАЛИЗ ТРАНЗАКЦИЙ НЕ ИЗ CSV');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

const filtered = data.filter(row => {
  if (row.currency !== 'RUB') return false;
  if (row.type !== 'MONEY_INCOME') return false;

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

  if (row.status && row.status !== 'COMPLETED') return false;
  if (row.is_test === true) return false;

  const amount = parseFloat(row.amount) || 0;
  if (Math.abs(amount) > 5000) return false;

  return true;
});

// Удаляем дубликаты
const seen = new Set();
const uniqueData = [];

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
    uniqueData.push(row);
  }
});

console.log(`Всего транзакций в рублях: ${uniqueData.length}\n`);

// Группируем по методу оплаты
const byMethod = {};
uniqueData.forEach(row => {
  const method = row.payment_method || 'UNKNOWN';

  if (!byMethod[method]) {
    byMethod[method] = {
      count: 0,
      total: 0,
      transactions: []
    };
  }

  byMethod[method].count++;
  byMethod[method].total += Math.abs(parseFloat(row.amount) || 0);
  byMethod[method].transactions.push(row);
});

console.log('📊 ПО МЕТОДАМ ОПЛАТЫ:');
console.log('-'.repeat(80));

Object.entries(byMethod)
  .map(([method, stats]) => ({ method, ...stats }))
  .sort((a, b) => b.total - a.total)
  .forEach(item => {
    console.log(`\n${item.method}:`);
    console.log(`   Транзакций: ${item.count}`);
    console.log(`   Сумма: ${Math.round(item.total).toLocaleString()}₽`);

    if (item.method === 'Robokassa') {
      console.log(`   ✅ РЕАЛЬНЫЕ ПЛАТЕЖИ (должны быть в CSV)`);
    } else if (item.method === 'Telegram') {
      console.log(`   ⚠️ TELEGRAM - нужно проверить что это`);
    } else if (item.method === 'balance' || item.method === 'Internal') {
      console.log(`   💰 ВНУТРЕННИЕ ПЕРЕВОДЫ/БАЛАНС (НЕ реальные деньги!)`);
    } else {
      console.log(`   ❓ НЕИЗВЕСТНЫЙ МЕТОД - нужно разобраться`);
    }
  });

// Детально разбираем НЕ Robokassa
console.log('\n' + '='.repeat(80));
console.log('🔍 ДЕТАЛЬНЫЙ АНАЛИЗ НЕ-ROBOKASSA ТРАНЗАКЦИЙ:');
console.log('='.repeat(80));

const nonRobokassa = uniqueData.filter(row => row.payment_method !== 'Robokassa');

if (nonRobokassa.length > 0) {
  nonRobokassa
    .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
    .slice(0, 30)
    .forEach((tx, i) => {
      const amount = Math.abs(parseFloat(tx.amount) || 0);
      const date = new Date(tx.created_at).toISOString().split('T')[0];
      console.log(`\n${i + 1}. ${amount.toLocaleString()}₽ | ${date} | ${tx.bot_name}`);
      console.log(`   Метод: ${tx.payment_method}`);
      console.log(`   User: ${tx.telegram_id}`);
      console.log(`   Desc: ${tx.description}`);
    });
}

// Анализируем описания
console.log('\n' + '='.repeat(80));
console.log('📝 АНАЛИЗ ОПИСАНИЙ (для выявления бонусов/внутренних):');
console.log('='.repeat(80));

const descriptions = {};
uniqueData.forEach(row => {
  const desc = row.description || 'UNKNOWN';

  if (!descriptions[desc]) {
    descriptions[desc] = {
      count: 0,
      total: 0,
      methods: new Set(),
      samples: []
    };
  }

  descriptions[desc].count++;
  descriptions[desc].total += Math.abs(parseFloat(row.amount) || 0);
  descriptions[desc].methods.add(row.payment_method || 'UNKNOWN');

  if (descriptions[desc].samples.length < 2) {
    descriptions[desc].samples.push({
      amount: Math.abs(parseFloat(row.amount) || 0),
      method: row.payment_method,
      bot: row.bot_name
    });
  }
});

// Ищем подозрительные описания
const suspiciousDescriptions = [
  'пополнение баланса',
  'баланс',
  'bonus',
  'бонус',
  'internal',
  'внутренний',
  'звезд',
  'stars',
  'administrator',
  'admin',
  'test',
  'тест'
];

console.log('\nПодозрительные описания (скорее всего НЕ реальные деньги):');
Object.entries(descriptions)
  .filter(([desc]) => suspiciousDescriptions.some(susp => desc.toLowerCase().includes(susp.toLowerCase())))
  .sort((a, b) => b[1].total - a[1].total)
  .slice(0, 15)
  .forEach(([desc, stats]) => {
    console.log(`\n"${desc}":`);
    console.log(`   Транзакций: ${stats.count}`);
    console.log(`   Сумма: ${Math.round(stats.total).toLocaleString()}₽`);
    console.log(`   Методы: ${Array.from(stats.methods).join(', ')}`);
    console.log(`   Пример:`);
    const sample = stats.samples[0];
    console.log(`      ${Math.round(sample.amount).toLocaleString()}₽ | ${sample.method} | ${sample.bot}`);
  });

// ИТОГ
console.log('\n' + '='.repeat(80));
console.log('✅ ИТОГОВЫЙ ВЫВОД:');
console.log('='.repeat(80));

const robokassaSum = byMethod['Robokassa']?.total || 0;
const telegramSum = byMethod['Telegram']?.total || 0;
const otherSum = uniqueData
  .filter(row => row.payment_method !== 'Robokassa' && row.payment_method !== 'Telegram')
  .reduce((sum, row) => sum + Math.abs(parseFloat(row.amount) || 0), 0);

console.log(`Всего в БД: ${Math.round(uniqueData.reduce((s, tx) => s + Math.abs(parseFloat(tx.amount) || 0), 0)).toLocaleString()}₽`);
console.log(`  - Robokassa: ${Math.round(robokassaSum).toLocaleString()}₽ (реальные деньги, ${byMethod['Robokassa']?.count || 0} транз.)`);
console.log(`  - Telegram: ${Math.round(telegramSum).toLocaleString()}₽ (${byMethod['Telegram']?.count || 0} транз.)`);
console.log(`  - Другие: ${Math.round(otherSum).toLocaleString()}₽`);

console.log(`\nCSV Robokassa: 126,523₽`);
console.log(`Разница: ${Math.round(robokassaSum - 126523).toLocaleString()}₽`);

if (Math.abs(robokassaSum - 126523) < 10000) {
  console.log(`✅ РАЗНИЦА НЕБОЛЬШАЯ - допустимая погрешность!`);
} else {
  console.log(`⚠️ Нужно разобраться - почему Robokassa в БД отличается от CSV!`);
}
