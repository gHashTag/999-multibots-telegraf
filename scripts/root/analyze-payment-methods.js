/**
 * АНАЛИЗ МЕТОДОВ ОПЛАТЫ В РУБЛЯХ
 */

const fs = require('fs');

console.log('💳 АНАЛИЗ МЕТОДОВ ОПЛАТЫ');
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
  const currency = row.currency || '';
  if (currency !== 'RUB' && Math.abs(amount) > 5000) {
    return false;
  }

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

console.log(`Транзакций в рублях: ${uniqueData.length}\n`);

// Анализируем методы оплаты
const byMethod = {};
uniqueData.forEach(row => {
  const method = row.payment_method || 'UNKNOWN';

  if (!byMethod[method]) {
    byMethod[method] = {
      count: 0,
      total: 0,
      samples: []
    };
  }

  byMethod[method].count++;
  byMethod[method].total += Math.abs(parseFloat(row.amount) || 0);

  if (byMethod[method].samples.length < 3) {
    byMethod[method].samples.push({
      amount: Math.abs(parseFloat(row.amount) || 0),
      bot: row.bot_name,
      desc: row.description?.substring(0, 50)
    });
  }
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
    console.log(`   Примеры:`);
    item.samples.forEach(s => {
      console.log(`      ${Math.round(s.amount).toLocaleString()}₽ | ${s.bot} | ${s.desc}`);
    });
  });

// Проверяем даты
console.log('\n' + '='.repeat(80));
console.log('📅 ПРОВЕРКА ПЕРИОДОВ:');

const dates = uniqueData.map(row => row.created_at).sort();
const minDate = dates[0];
const maxDate = dates[dates.length - 1];

console.log(`Наша БД: с ${minDate} по ${maxDate}`);
console.log(`CSV Robokassa: с 30.01.2025 по 30.11.2025`);

// Группируем по годам/месяцам
const byMonth = {};
uniqueData.forEach(row => {
  const date = new Date(row.created_at);
  const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  if (!byMonth[monthKey]) {
    byMonth[monthKey] = { count: 0, total: 0 };
  }
  byMonth[monthKey].count++;
  byMonth[monthKey].total += Math.abs(parseFloat(row.amount) || 0);
});

console.log('\nПо месяцам в БД:');
Object.entries(byMonth).forEach(([month, stats]) => {
  console.log(`   ${month}: ${stats.count} транз., ${Math.round(stats.total).toLocaleString()}₽`);
});

// Robokassa методы
console.log('\n' + '='.repeat(80));
console.log('🔍 ВЫВОД:');
console.log(`   Robokassa в CSV: 126,523₽`);
console.log(`   Robokassa в БД (payment_method):`);

const robokassaInDb = byMethod['Robokassa']?.total || byMethod['Telegram']?.total || byMethod['balance']?.total || 0;
const otherMethods = Object.entries(byMethod)
  .filter(([method]) => !['Robokassa', 'Telegram', 'balance'].includes(method))
  .reduce((sum, [, stats]) => sum + stats.total, 0);

console.log(`      Через Robokassa/Telegram в БД: ${Math.round(robokassaInDb).toLocaleString()}₽`);
console.log(`      Другие методы: ${Math.round(otherMethods).toLocaleString()}₽`);
console.log(`\n   Разница с CSV: ${Math.round(robokassaInDb - 126523).toLocaleString()}₽`);

if (Math.abs(robokassaInDb - 126523) < 10000) {
  console.log(`   ✅ РАЗНИЦА НЕБОЛЬШАЯ!`);
} else {
  console.log(`   ⚠️ Нужно проверить - почему в БД больше Robokassa, чем в CSV!`);
}
