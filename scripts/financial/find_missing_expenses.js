#!/usr/bin/env node

/**
 * 🔍 ПОИСК ПОТЕРЯННЫХ 293,996₽ - Анализ что исключено
 */

const ExcelJS = require('exceljs');
const fs = require('fs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

async function findMissingExpenses() {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 ПОИСК ПОТЕРЯННЫХ 293,996₽ РАСХОДОВ');
  console.log('='.repeat(70) + '\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

  // Все расходы (MONEY_OUTCOME)
  const allOutcomes = rawData.filter(row => row.type === 'MONEY_OUTCOME');

  console.log(`📊 Всего MONEY_OUTCOME записей: ${allOutcomes.length}`);

  // Группируем по методам
  const byMethod = {};
  const byBot = {};

  for (const row of allOutcomes) {
    const rubAmount = convertToRub(row.amount, row.currency);
    const method = row.payment_method;
    const bot = row.bot_name;

    if (!byMethod[method]) {
      byMethod[method] = { amount: 0, count: 0, bots: new Set() };
    }
    byMethod[method].amount += rubAmount;
    byMethod[method].count++;
    byMethod[method].bots.add(bot);

    if (!byBot[bot]) {
      byBot[bot] = { amount: 0, count: 0, methods: new Set() };
    }
    byBot[bot].amount += rubAmount;
    byBot[bot].count++;
    byBot[bot].methods.add(method);
  }

  console.log('\n📋 ВСЕ МЕТОДЫ РАСХОДОВ:');
  console.log('='.repeat(70));

  const sortedMethods = Object.entries(byMethod)
    .map(([method, data]) => ({ method, ...data }))
    .sort((a, b) => b.amount - a.amount);

  let totalAllOutcomes = 0;
  sortedMethods.forEach((item, index) => {
    totalAllOutcomes += item.amount;
    console.log(`${String(index + 1).padStart(2, '0')}. ${item.method}:`);
    console.log(`   💰 ${Math.round(item.amount).toLocaleString()}₽ (${item.count} операций)`);
    console.log(`   🤖 Ботов: ${item.bots.size} - ${Array.from(item.bots).slice(0, 5).join(', ')}`);
  });

  console.log(`\n💰 ИТОГО ВСЕХ MONEY_OUTCOME: ${Math.round(totalAllOutcomes).toLocaleString()}₽`);
  console.log(`\n🎯 РАСХОЖДЕНИЕ: В первом анализе было 504,243₽, сейчас ${Math.round(totalAllOutcomes).toLocaleString()}₽`);
  console.log(`📊 Разница: ${Math.round(totalAllOutcomes - 504243).toLocaleString()}₽`);

  console.log('\n\n🤖 ТОП-20 БОТОВ ПО РАСХОДАМ:');
  console.log('='.repeat(70));

  const sortedBots = Object.entries(byBot)
    .map(([bot, data]) => ({ bot, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20);

  sortedBots.forEach((item, index) => {
    console.log(`${String(index + 1).padStart(2, '0')}. ${item.bot}:`);
    console.log(`   💰 ${Math.round(item.amount).toLocaleString()}₽ (${item.count} операций)`);
    console.log(`   🔧 Методы: ${Array.from(item.methods).slice(0, 3).join(', ')}`);
  });

  // Анализируем фейковые методы
  console.log('\n\n🚫 ФЕЙКОВЫЕ МЕТОДЫ (возможно исключены зря):');
  console.log('='.repeat(70));

  const fakeLikeMethods = [
    'SYSTEM', 'Internal', 'System_Operation', 'balance', 'Manual',
    'System Grant', 'System_Compensation', 'Refund', 'Promo'
  ];

  const fakeLike = sortedMethods.filter(item => fakeLikeMethods.some(fake => item.method.includes(fake)));

  fakeLike.forEach(item => {
    console.log(`${item.method}: ${Math.round(item.amount).toLocaleString()}₽ (${item.count} операций)`);
  });

  const fakeLikeTotal = fakeLike.reduce((sum, item) => sum + item.amount, 0);
  console.log(`\n💰 ИТОГО фейк-подобных методов: ${Math.round(fakeLikeTotal).toLocaleString()}₽`);

  // Сохраняем в Excel
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🔍 ПОИСК ПОТЕРЯННЫХ РАСХОДОВ";
  workbook.created = new Date();

  // Все методы
  const methodsSheet = workbook.addWorksheet('📋 ВСЕ МЕТОДЫ');
  const methodsHeader = methodsSheet.addRow(['№', 'Метод', 'Сумма (₽)', 'Операции', 'Ботов']);
  methodsHeader.font = { bold: true };
  sortedMethods.forEach((item, index) => {
    methodsSheet.addRow([
      index + 1,
      item.method,
      Math.round(item.amount).toLocaleString(),
      item.count,
      item.bots.size
    ]);
  });

  // Все боты
  const botsSheet = workbook.addWorksheet('🤖 ВСЕ БОТЫ');
  const botsHeader = botsSheet.addRow(['№', 'Бот', 'Сумма (₽)', 'Операции', 'Методы']);
  botsHeader.font = { bold: true };
  sortedBots.forEach((item, index) => {
    botsSheet.addRow([
      index + 1,
      item.bot,
      Math.round(item.amount).toLocaleString(),
      item.count,
      Array.from(item.methods).slice(0, 5).join(', ')
    ]);
  });

  const outputPath = '/Users/playra/999-multibots-telegraf/ПОИСК_ПОТЕРЯННЫХ_РАСХОДОВ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('\n' + '='.repeat(70));
  console.log(`📁 Файл сохранен: ${outputPath}`);
  console.log('='.repeat(70) + '\n');
}

findMissingExpenses().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
