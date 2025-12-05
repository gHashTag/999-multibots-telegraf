/**
 * АНАЛИЗ РУБЛЕВЫХ ТРАНЗАКЦИЙ - ДЕТАЛЬНО
 * Разбираемся, почему так мало рублей
 */

const fs = require('fs');

console.log('💰 АНАЛИЗ РУБЛЕВЫХ ТРАНЗАКЦИЙ');
console.log('='.repeat(80));

const data = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

console.log(`📊 Всего записей в файле: ${data.length.toLocaleString()}\n`);

// 1. ВСЕ записи в рублях (БЕЗ ФИЛЬТРОВ)
const rubTransactions = data.filter(row => row.currency === 'RUB');

console.log('1️⃣ ВСЕ РУБЛЕВЫЕ ЗАПИСИ (БЕЗ ФИЛЬТРОВ):');
console.log(`   Количество: ${rubTransactions.length.toLocaleString()}`);

// Считаем суммы по типам
const rubByType = {};
rubTransactions.forEach(row => {
  const type = row.type || 'UNKNOWN';
  if (!rubByType[type]) {
    rubByType[type] = { count: 0, total: 0, rows: [] };
  }
  rubByType[type].count++;
  rubByType[type].total += Math.abs(parseFloat(row.amount) || 0);
  rubByType[type].rows.push(row);
});

console.log('\n📊 ПО ТИПАМ ОПЕРАЦИЙ:');
Object.entries(rubByType).forEach(([type, stats]) => {
  console.log(`   ${type}:`);
  console.log(`      Количество: ${stats.count.toLocaleString()}`);
  console.log(`      Сумма: ${Math.round(stats.total).toLocaleString()}₽`);
});

const rubTotal = Object.values(rubByType).reduce((sum, stats) => sum + stats.total, 0);
console.log(`\n✅ ИТОГО РУБЛЕЙ: ${Math.round(rubTotal).toLocaleString()}₽\n`);

// 2. ПОКАЗЫВАЕМ ТОП-20 РУБЛЕВЫХ ЗАПИСЕЙ
console.log('2️⃣ ТОП-20 РУБЛЕВЫХ ТРАНЗАКЦИЙ:');
console.log('-'.repeat(80));

const rubSorted = [...rubTransactions]
  .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
  .slice(0, 20);

rubSorted.forEach((row, i) => {
  const amount = Math.abs(parseFloat(row.amount) || 0);
  console.log(`${i + 1}. ${amount.toLocaleString()}₽ | ${row.type} | ${row.bot_name}`);
  console.log(`   ${row.description?.substring(0, 80) || ''}`);
  console.log(`   User: ${row.telegram_id}, Date: ${row.created_at}\n`);
});

// 3. АНАЛИЗ ПО БОТАМ
console.log('\n3️⃣ РУБЛИ ПО БОТАМ:');
console.log('-'.repeat(80));

const rubByBot = {};
rubTransactions.forEach(row => {
  const bot = row.bot_name || 'unknown';
  if (!rubByBot[bot]) {
    rubByBot[bot] = { count: 0, total: 0 };
  }
  rubByBot[bot].count++;
  rubByBot[bot].total += Math.abs(parseFloat(row.amount) || 0);
});

const rubBotsArray = Object.entries(rubByBot)
  .map(([name, stats]) => ({ name, ...stats }))
  .sort((a, b) => b.total - a.total);

rubBotsArray.forEach((bot, i) => {
  console.log(`${i + 1}. ${bot.name}`);
  console.log(`   Сумма: ${Math.round(bot.total).toLocaleString()}₽`);
  console.log(`   Транзакций: ${bot.count}\n`);
});

// 4. ЧТО ФИЛЬТРУЕТСЯ
console.log('\n4️⃣ ЧТО УДАЛЯЕТСЯ ФИЛЬТРАМИ:');
console.log('-'.repeat(80));

// Применяем фильтры
const filteredRub = rubTransactions.filter(row => {
  const desc = (row.description || '').toUpperCase();

  // Фильтры из теста
  if (desc.includes('TEST_DATA')) return false;
  if (desc.includes('🎁')) return false;
  if (desc.includes('🔥')) return false;
  if (desc.includes('VIBECODER')) return false;
  if (desc.includes('АКАДЕМИЯ')) return false;
  if (desc.includes('ПРОМО')) return false;
  if (desc.includes('ADMIN GRANT')) return false;

  return true;
});

console.log(`До фильтрации: ${rubTransactions.length.toLocaleString()} записей`);
console.log(`После фильтрации: ${filteredRub.length.toLocaleString()} записей`);
console.log(`Удалено: ${rubTransactions.length - filteredRub.length.toLocaleString()} записей`);

const filteredSum = filteredRub.reduce((sum, row) => sum + Math.abs(parseFloat(row.amount) || 0), 0);
console.log(`\nСумма после фильтров: ${Math.round(filteredSum).toLocaleString()}₽`);
console.log(`Потеряно рублей: ${Math.round(rubTotal - filteredSum).toLocaleString()}₽`);

// 5. ПРОВЕРКА MONEY_INCOME vs MONEY_OUTCOME
console.log('\n5️⃣ MONEY_INCOME vs MONEY_OUTCOME в рублях:');
console.log('-'.repeat(80));

const rubIncome = rubTransactions.filter(row => row.type === 'MONEY_INCOME');
const rubOutcome = rubTransactions.filter(row => row.type === 'MONEY_OUTCOME');

const rubIncomeSum = rubIncome.reduce((sum, row) => sum + Math.abs(parseFloat(row.amount) || 0), 0);
const rubOutcomeSum = rubOutcome.reduce((sum, row) => sum + Math.abs(parseFloat(row.amount) || 0), 0);

console.log(`MONEY_INCOME (доходы):`);
console.log(`   Записей: ${rubIncome.length.toLocaleString()}`);
console.log(`   Сумма: ${Math.round(rubIncomeSum).toLocaleString()}₽\n`);

console.log(`MONEY_OUTCOME (расходы):`);
console.log(`   Записей: ${rubOutcome.length.toLocaleString()}`);
console.log(`   Сумма: ${Math.round(rubOutcomeSum).toLocaleString()}₽\n`);

// Показываем несколько примеров MONEY_OUTCOME с положительными суммами
const rubOutcomePositive = rubOutcome.filter(row => parseFloat(row.amount) > 0);
console.log(`MONEY_OUTCOME с ПОЛОЖИТЕЛЬНЫМИ суммами: ${rubOutcomePositive.length.toLocaleString()}`);
if (rubOutcomePositive.length > 0) {
  console.log('Примеры (топ-5):');
  rubOutcomePositive
    .sort((a, b) => Math.abs(parseFloat(b.amount) || 0) - Math.abs(parseFloat(a.amount) || 0))
    .slice(0, 5)
    .forEach(row => {
      console.log(`   ${parseFloat(row.amount).toLocaleString()}₽ | ${row.bot_name} | ${row.description?.substring(0, 60)}`);
    });
}

console.log('\n' + '='.repeat(80));
console.log('✅ ВЫВОД: В рублях больше транзакций, чем показывает тест!');
console.log(`   Реальная сумма: ${Math.round(rubTotal).toLocaleString()}₽`);
console.log(`   В тесте показывает: 30,512₽`);
console.log(`   Потеря: ${Math.round(rubTotal - filteredSum).toLocaleString()}₽`);
