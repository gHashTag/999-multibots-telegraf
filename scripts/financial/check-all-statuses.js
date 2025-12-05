/**
 * ПРОВЕРЯЕМ КАКИЕ СТАТУСЫ ЕСТЬ В БАЗЕ
 * И что означает поле status
 */

const fs = require('fs');

console.log('🔍 АНАЛИЗ СТАТУСОВ В БАЗЕ ДАННЫХ');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

// Фильтруем как в тестах
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

console.log(`Всего Robokassa транзакций (после фильтрации): ${filtered.length}\n`);

// Анализируем статусы
console.log('📊 УНИКАЛЬНЫЕ СТАТУСЫ:');
console.log('-'.repeat(80));

const uniqueStatuses = new Set();
filtered.forEach(row => {
  const status = row.status;
  uniqueStatuses.add(status === undefined || status === null ? 'undefined/null' : status);
});

uniqueStatuses.forEach(status => {
  console.log(`   - "${status}"`);
});

// Показываем примеры по каждому статусу
console.log('\n📋 ПРИМЕРЫ ТРАНЗАКЦИЙ ПО СТАТУСАМ:');
console.log('='.repeat(80));

const byStatus = {};
filtered.forEach(row => {
  const status = row.status === undefined || row.status === null ? 'undefined/null' : row.status;

  if (!byStatus[status]) {
    byStatus[status] = {
      count: 0,
      total: 0,
      samples: []
    };
  }

  byStatus[status].count++;
  byStatus[status].total += Math.abs(parseFloat(row.amount) || 0);

  if (byStatus[status].samples.length < 3) {
    byStatus[status].samples.push(row);
  }
});

Object.entries(byStatus).forEach(([status, stats]) => {
  console.log(`\n📌 Статус: ${status}`);
  console.log(`   Количество: ${stats.count}`);
  console.log(`   Сумма: ${Math.round(stats.total).toLocaleString()}₽`);

  console.log(`   Примеры:`);
  stats.samples.forEach((tx, i) => {
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const date = new Date(tx.created_at);
    const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;

    console.log(`   ${i + 1}. ${amount.toLocaleString()}₽ | ${dateStr} | ${tx.description}`);
  });
});

// Проверяем - а есть ли другие поля, которые могут указывать на статус?
console.log('\n🔍 ДРУГИЕ ПОЛЯ, КОТОРЫЕ МОГУТ БЫТЬ СТАТУСОМ:');
console.log('='.repeat(80));

const sample = filtered[0];
console.log('Структура записи (пример):');
console.log(JSON.stringify(sample, null, 2));

console.log('\n📝 ВСЕ ПОЛЯ В ЗАПИСИ:');
Object.keys(sample).forEach(key => {
  const value = sample[key];
  const type = typeof value;
  console.log(`   - ${key}: ${type} = ${JSON.stringify(value).substring(0, 100)}`);
});
