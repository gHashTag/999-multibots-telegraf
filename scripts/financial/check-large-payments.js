/**
 * ПРОВЕРКА КРУПНЫХ ПЛАТЕЖЕЙ В РУБЛЯХ
 */

const fs = require('fs');

console.log('💰 ПРОВЕРКА КРУПНЫХ ПЛАТЕЖЕЙ');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

// Все фильтры как в тесте
const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

const filtered = data.filter(row => {
  if (row.currency !== 'RUB') return false;

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

console.log(`Всего записей после фильтров: ${filtered.length}\n`);

// Истинные дубликаты (как в исправленном тесте)
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

console.log(`После удаления истинных дубликатов: ${uniqueData.length}\n`);

// Сортируем по сумме
const sorted = [...uniqueData]
  .filter(row => row.type === 'MONEY_INCOME')
  .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0));

console.log('ТОП-20 ПЛАТЕЖЕЙ В РУБЛЯХ (MONEY_INCOME):');
console.log('-'.repeat(80));

sorted.slice(0, 20).forEach((row, i) => {
  const amount = Math.abs(parseFloat(row.amount) || 0);
  console.log(`${i + 1}. ${amount.toLocaleString()}₽ | ${row.bot_name}`);
  console.log(`   ${row.description?.substring(0, 70)}`);
  console.log(`   User: ${row.telegram_id}, Date: ${row.created_at}\n`);
});

// Подсчет по суммам
const byAmount = {};
sorted.forEach(row => {
  const amount = Math.round(Math.abs(parseFloat(row.amount) || 0));
  if (!byAmount[amount]) {
    byAmount[amount] = { count: 0, total: 0 };
  }
  byAmount[amount].count++;
  byAmount[amount].total += amount;
});

console.log('СТАТИСТИКА ПО РАЗМЕРАМ ПЛАТЕЖЕЙ:');
console.log('-'.repeat(80));

Object.entries(byAmount)
  .map(([amount, stats]) => ({ amount: parseInt(amount), ...stats }))
  .sort((a, b) => b.amount - a.amount)
  .slice(0, 10)
  .forEach(item => {
    console.log(`${item.amount.toLocaleString()}₽: ${item.count} платежей, итого ${item.total.toLocaleString()}₽`);
  });

const total = sorted.reduce((sum, row) => sum + Math.abs(parseFloat(row.amount) || 0), 0);
console.log(`\n✅ ИТОГО MONEY_INCOME: ${Math.round(total).toLocaleString()}₽\n`);

// Проверяем записи больше 5000₽
const largePayments = sorted.filter(row => Math.abs(parseFloat(row.amount) || 0) > 5000);

if (largePayments.length > 0) {
  console.log('⚠️ НАЙДЕНЫ ПЛАТЕЖИ > 5000₽:');
  largePayments.forEach(row => {
    console.log(`   ${Math.abs(parseFloat(row.amount)).toLocaleString()}₽ | ${row.bot_name} | ${row.description?.substring(0, 50)}`);
  });
} else {
  console.log('✅ НЕТ платежей больше 5000₽');
}

console.log('\n' + '='.repeat(80));
