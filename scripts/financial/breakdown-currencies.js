/**
 * РАЗБИВКА ДОХОДОВ ПО ВАЛЮТАМ
 * Сколько именно рублей vs конвертированных
 */

const fs = require('fs');

console.log('💰 РАЗБИВКА ДОХОДОВ ПО ВАЛЮТАМ');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

// Все фильтры как в тесте
const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

const filtered = data.filter(row => {
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

// Удаляем истинные дубликаты
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

// Только MONEY_INCOME
const incomeData = uniqueData.filter(row => row.type === 'MONEY_INCOME');

console.log(`После фильтрации: ${uniqueData.length} записей`);
console.log(`MONEY_INCOME: ${incomeData.length} записей\n`);

// Группируем по валютам
const byCurrency = {};
incomeData.forEach(row => {
  const currency = row.currency || 'UNKNOWN';
  const amount = Math.abs(parseFloat(row.amount) || 0);

  if (!byCurrency[currency]) {
    byCurrency[currency] = {
      count: 0,
      total: 0,
      transactions: []
    };
  }

  byCurrency[currency].count++;
  byCurrency[currency].total += amount;
  byCurrency[currency].transactions.push(row);
});

console.log('💱 РАСПРЕДЕЛЕНИЕ ПО ВАЛЮТАМ:');
console.log('-'.repeat(80));

Object.entries(byCurrency).forEach(([currency, stats]) => {
  console.log(`\n${currency}:`);
  console.log(`   Транзакций: ${stats.count}`);
  console.log(`   Сумма: ${Math.round(stats.total).toLocaleString()}`);

  if (currency === 'RUB') {
    console.log(`   ✅ ЭТО РУБЛИ (можно сравнивать с Robokassa CSV)`);
  } else {
    console.log(`   ⚠️ НЕ РУБЛИ - требует конвертации`);
  }
});

// ИТОГО
const rubTotal = byCurrency['RUB']?.total || 0;
const starsTotal = byCurrency['STARS']?.total || 0;
const xtrTotal = byCurrency['XTR']?.total || 0;
const otherTotal = Object.entries(byCurrency)
  .filter(([curr]) => curr !== 'RUB' && curr !== 'STARS' && curr !== 'XTR')
  .reduce((sum, [, stats]) => sum + stats.total, 0);

console.log('\n' + '='.repeat(80));
console.log('✅ ИТОГО В РУБЛЯХ (только RUB):');
console.log(`   ${Math.round(rubTotal).toLocaleString()}₽`);
console.log(`\n📊 РАЗБИВКА: STARS и XTR:`);
console.log(`   STARS: ${Math.round(starsTotal).toLocaleString()}`);
console.log(`   XTR: ${Math.round(xtrTotal).toLocaleString()}`);
console.log(`   Другие: ${Math.round(otherTotal).toLocaleString()}`);

console.log('\n' + '='.repeat(80));
console.log('🔍 СРАВНЕНИЕ С CSV ROBOKASSA:');
console.log(`   Наши РУБЛИ (RUB): ${Math.round(rubTotal).toLocaleString()}₽`);
console.log(`   CSV Robokassa: 126,523₽`);
console.log(`   Разница: ${Math.round(rubTotal - 126523).toLocaleString()}₽`);

if (Math.abs(rubTotal - 126523) < 10000) {
  console.log(`   ✅ РАЗНИЦА НЕБОЛЬШАЯ (менее 10,000₽)`);
} else {
  console.log(`   ⚠️ ЕСТЬ РАЗНИЦА - нужно понять почему!`);
  console.log(`\nВозможные причины:`);
  console.log(`   1. Разные периоды времени`);
  console.log(`   2. Платежи не через Robokassa`);
  console.log(`   3. Частичная синхронизация данных`);
}
