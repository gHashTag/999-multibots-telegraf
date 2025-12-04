/**
 * ОТЛАДКА ЛОГИКИ ПОДСЧЕТА РУБЛЕВЫХ ДОХОДОВ
 */

const fs = require('fs');

console.log('🧮 ОТЛАДКА ЛОГИКИ ПОДСЧЕТА ДОХОДОВ');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

// Применяем все фильтры (как в тесте)
const bots = require('./scripts/constants/bots.js');
const FAKE_BOTS = bots.FAKE_BOTS;

const filtered = data.filter(row => {
  if (row.currency !== 'RUB') return false; // Только рубли!

  const desc = (row.description || '').toUpperCase();
  const botName = (row.bot_name || '');

  // Фильтры
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

console.log(`1️⃣ ПОСЛЕ ВСЕХ ФИЛЬТРОВ (только рубли):`);
console.log(`   Записей: ${filtered.length}`);
const totalAfterFilters = filtered.reduce((sum, row) => sum + Math.abs(parseFloat(row.amount) || 0), 0);
console.log(`   Общая сумма: ${Math.round(totalAfterFilters).toLocaleString()}₽\n`);

// Смотрим на типы операций
console.log('2️⃣ ПО ТИПАМ ОПЕРАЦИЙ:');
const byType = {};
filtered.forEach(row => {
  const type = row.type || 'UNKNOWN';
  if (!byType[type]) {
    byType[type] = { count: 0, total: 0 };
  }
  byType[type].count++;
  byType[type].total += Math.abs(parseFloat(row.amount) || 0);
});

Object.entries(byType).forEach(([type, stats]) => {
  console.log(`   ${type}:`);
  console.log(`      Количество: ${stats.count}`);
  console.log(`      Сумма: ${Math.round(stats.total).toLocaleString()}₽\n`);
});

// Считаем доходы по логике теста (только MONEY_INCOME)
const incomeOnly = filtered.filter(row => row.type === 'MONEY_INCOME');
const incomeSum = incomeOnly.reduce((sum, row) => sum + Math.abs(parseFloat(row.amount) || 0), 0);

console.log('3️⃣ ЛОГИКА ТЕСТА (только MONEY_INCOME):');
console.log(`   Записей MONEY_INCOME: ${incomeOnly.length}`);
console.log(`   Сумма MONEY_INCOME: ${Math.round(incomeSum).toLocaleString()}₽`);
console.log(`   Разница с общей: ${Math.round(totalAfterFilters - incomeSum).toLocaleString()}₽\n`);

// Смотрим, что за типы попадают (не MONEY_INCOME)
const nonIncome = filtered.filter(row => row.type !== 'MONEY_INCOME');
if (nonIncome.length > 0) {
  console.log('4️⃣ НЕ MONEY_INCOME записи:');
  nonIncome.forEach(row => {
    console.log(`   ${row.type} | ${Math.abs(parseFloat(row.amount)).toLocaleString()}₽ | ${row.bot_name} | ${row.description?.substring(0, 50)}`);
  });
  console.log('');
}

// Проверяем MONEY_INCOME записи
console.log('5️⃣ MONEY_INCOME записи (топ-20):');
incomeOnly
  .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
  .slice(0, 20)
  .forEach((row, i) => {
    console.log(`${i + 1}. ${Math.abs(parseFloat(row.amount)).toLocaleString()}₽ | ${row.bot_name}`);
    console.log(`   ${row.description?.substring(0, 70)}`);
  });

console.log('\n' + '='.repeat(80));
console.log('✅ ВЫВОД:');
console.log(`   Общая сумма после фильтров: ${Math.round(totalAfterFilters).toLocaleString()}₽`);
console.log(`   Сумма MONEY_INCOME: ${Math.round(incomeSum).toLocaleString()}₽`);
console.log(`   В тесте показывается: 50,512₽`);
console.log(`   РАЗНИЦА: ${Math.round(incomeSum - 50512).toLocaleString()}₽ - вот где теряется!`);
