#!/usr/bin/env node

/**
 * 🎯 ИСПРАВЛЕННЫЙ ОТЧЕТ - ТОЛЬКО ПРОДАКШЕН БОТЫ
 * - ИСКЛЮЧАЕМ тестовые боты из доходов!
 * - Тестовые боты: ai_koshey_bot, clip_maker_neuro_bot
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

// ТОЛЬКО РЕАЛЬНЫЕ ПЛАТЕЖНЫЕ СИСТЕМЫ
const REAL_PAYMENT_METHODS = ['Telegram', 'Robokassa'];

// ТОЛЬКО ПРОДАКШЕН БОТЫ!
const PRODUCTION_BOTS = [
  { name: 'neuro_blogger_bot', type: 'ПРОДАКШЕН' },
  { name: 'MetaMuse_Manifest_bot', type: 'ПРОДАКШЕН' },
  { name: 'HaimGroupMedia_bot', type: 'ПРОДАКШЕН' },
  { name: 'AI_STARS_bot', type: 'ПРОДАКШЕН' },
  { name: 'Gaia_Kamskaia_bot', type: 'ПРОДАКШЕН' },
  { name: 'NeuroLenaAssistant_bot', type: 'ПРОДАКШЕН' },
  { name: 'NeurostylistShtogrina_bot', type: 'ПРОДАКШЕН' },
  { name: 'Kaya_easy_art_bot', type: 'ПРОДАКШЕН' }
];

// ТЕСТОВЫЕ БОТЫ (ИСКЛЮЧАЕМ из доходов!)
const TEST_BOTS = ['ai_koshey_bot', 'clip_maker_neuro_bot'];

async function createCorrectReport() {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ИСПРАВЛЕННЫЙ ОТЧЕТ - ТОЛЬКО ПРОДАКШЕН БОТЫ');
  console.log('   ИСКЛЮЧАЕМ тестовые боты из доходов!');
  console.log('='.repeat(80) + '\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

  // 1. ДОХОДЫ - ТОЛЬКО от продакшн ботов!
  const productionIncomes = rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    REAL_PAYMENT_METHODS.includes(row.payment_method) &&
    PRODUCTION_BOTS.some(bot => bot.name === row.bot_name)
  );

  // 2. РАСХОДЫ - от ВСЕХ ботов (включая тестовые)
  const allOutcomes = rawData.filter(row =>
    row.type === 'MONEY_OUTCOME'
  );

  console.log(`📊 Всего записей: ${rawData.length}`);
  console.log(`✅ Реальные доходы (продакшн): ${productionIncomes.length} записей`);
  console.log(`🤖 Расходы (все боты): ${allOutcomes.length} записей`);
  console.log(`\n🚫 ТЕСТОВЫЕ БОТЫ ИСКЛЮЧЕНЫ из доходов:`);
  TEST_BOTS.forEach(bot => console.log(`   - ${bot}`));
  console.log('');

  // 3. ГРУППИРУЕМ ПО ПРОДАКШН БОТАМ
  const botData = {};
  PRODUCTION_BOTS.forEach(bot => {
    botData[bot.name] = {
      ...bot,
      incomes: { RUB: 0, XTR: 0, STARS: 0, total_rub: 0 },
      outcomes: { total: 0 },
      profit: 0,
      margin: 0
    };
  });

  // 4. ОБРАБАТЫВАЕМ ДОХОДЫ (только продакшн)
  productionIncomes.forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const amount = parseFloat(row.amount) || 0;
    const currency = row.currency;
    const amountInRub = convertToRub(amount, currency);

    botData[botName].incomes[currency] += amountInRub;
    botData[botName].incomes.total_rub += amountInRub;
  });

  // 5. ОБРАБАТЫВАЕМ РАСХОДЫ (продакшн + тестовые)
  allOutcomes.forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return; // Исключаем расходы тестовых ботов

    const amount = parseFloat(row.amount) || 0;
    const amountInRub = convertToRub(amount, row.currency);

    botData[botName].outcomes.total += amountInRub;
  });

  // 6. СЧИТАЕМ ПРИБЫЛЬ
  Object.values(botData).forEach(bot => {
    bot.profit = bot.incomes.total_rub - bot.outcomes.total;
    bot.margin = bot.incomes.total_rub > 0 ? (bot.profit / bot.incomes.total_rub * 100) : 0;
  });

  // 7. ВЫВОД
  console.log('🤖 СТАТИСТИКА ПО ПРОДАКШН БОТАМ:');
  console.log('='.repeat(80));

  const sortedBots = Object.values(botData)
    .sort((a, b) => b.incomes.total_rub - a.incomes.total_rub);

  sortedBots.forEach(bot => {
    console.log(`\n🤖 ${bot.name}:`);
    console.log(`   💰 Доходы: ${Math.round(bot.incomes.total_rub).toLocaleString()}₽`);
    console.log(`      RUB: ${Math.round(bot.incomes.RUB).toLocaleString()}₽`);
    console.log(`      XTR: ${Math.round(bot.incomes.XTR).toLocaleString()}₽`);
    console.log(`      STARS: ${Math.round(bot.incomes.STARS).toLocaleString()}₽`);
    console.log(`   🤖 Расходы: ${Math.round(bot.outcomes.total).toLocaleString()}₽`);
    console.log(`   📈 Прибыль: ${Math.round(bot.profit).toLocaleString()}₽ (маржа: ${bot.margin.toFixed(1)}%)`);
  });

  // 8. ИТОГИ
  const totalIncome = sortedBots.reduce((sum, bot) => sum + bot.incomes.total_rub, 0);
  const totalExpenses = sortedBots.reduce((sum, bot) => sum + bot.outcomes.total, 0);
  const totalProfit = totalIncome - totalExpenses;

  console.log('\n\n🎯 ИТОГО ПО ПРОДАКШН БОТАМ:');
  console.log('='.repeat(80));
  console.log(`💰 Общие доходы: ${Math.round(totalIncome).toLocaleString()}₽`);
  console.log(`🤖 Общие расходы: ${Math.round(totalExpenses).toLocaleString()}₽`);
  console.log(`📈 Общая прибыль: ${Math.round(totalProfit).toLocaleString()}₽`);
  console.log(`📊 Общая маржа: ${(totalProfit / totalIncome * 100).toFixed(1)}%`);
  console.log('='.repeat(80));

  // 9. ТЕСТОВЫЕ БОТЫ - ТОЛЬКО РАСХОДЫ!
  console.log('\n🚫 ТЕСТОВЫЕ БОТЫ (ТОЛЬКО РАСХОДЫ):');
  TEST_BOTS.forEach(botName => {
    const botOutcomes = allOutcomes.filter(row => row.bot_name === botName);
    const totalOut = botOutcomes.reduce((sum, row) => sum + convertToRub(row.amount, row.currency), 0);
    console.log(`${botName}: ${Math.round(totalOut).toLocaleString()}₽ расходов (доходов НЕТ!)`);
  });

  // 10. СОЗДАЕМ EXCEL
  console.log('\n📊 СОЗДАЕМ EXCEL...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🎯 ОТЧЕТ ПО ПРОДАКШН БОТАМ";
  workbook.created = new Date();

  // ЛИСТ 1: ОБЩАЯ СВОДКА
  const summarySheet = workbook.addWorksheet('📊 ОБЩАЯ СВОДКА');
  summarySheet.mergeCells('A1:J1');
  summarySheet.getCell('A1').value = '🎯 ИСПРАВЛЕННЫЙ ОТЧЕТ - ТОЛЬКО ПРОДАКШН БОТЫ';
  summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  summarySheet.addRow(['']);
  summarySheet.addRow([
    '№', 'Бот', 'Тип',
    'ДОХОДЫ (₽)', 'RUB', 'XTR→₽', 'STARS→₽',
    'РАСХОДЫ AI (₽)', 'ПРИБЫЛЬ (₽)', 'МАРЖА (%)'
  ]);
  summarySheet.getRow(3).font = { bold: true };

  sortedBots.forEach((bot, index) => {
    summarySheet.addRow([
      index + 1,
      bot.name,
      bot.type,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.incomes.RUB).toLocaleString(),
      Math.round(bot.incomes.XTR).toLocaleString(),
      Math.round(bot.incomes.STARS).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.margin.toFixed(1)
    ]);
  });

  const totalRow = summarySheet.addRow([
    'ИТОГО', 'ПРОДАКШЕН', '',
    Math.round(totalIncome).toLocaleString(),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.RUB, 0)).toLocaleString(),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR, 0)).toLocaleString(),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS, 0)).toLocaleString(),
    Math.round(totalExpenses).toLocaleString(),
    Math.round(totalProfit).toLocaleString(),
    (totalProfit / totalIncome * 100).toFixed(1)
  ]);
  totalRow.font = { bold: true };

  // ЛИСТ 2: ДЕТАЛИ
  const detailsSheet = workbook.addWorksheet('📋 ДЕТАЛИ');
  detailsSheet.addRow(['Бот', 'Доходы', 'Расходы', 'Прибыль', 'Статус']);
  detailsSheet.getRow(1).font = { bold: true };

  sortedBots.forEach(bot => {
    const status = bot.profit > 0 ? '✅ ПРИБЫЛЬНЫЙ' : '❌ УБЫТОЧНЫЙ';
    detailsSheet.addRow([
      bot.name,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      status
    ]);
  });

  const outputPath = '/Users/playra/999-multibots-telegraf/ИСПРАВЛЕННЫЙ_ОТЧЕТ_ПРОДАКШН.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('\n' + '='.repeat(80));
  console.log('✅ ИСПРАВЛЕННЫЙ ОТЧЕТ ГОТОВ!');
  console.log('='.repeat(80));
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n🎯 КЛЮЧЕВЫЕ ИСПРАВЛЕНИЯ:');
  console.log(`   ✅ Учтены только ПРОДАКШН боты (8 из 10)`);
  console.log(`   ❌ Тестовые боты исключены из доходов`);
  console.log(`   💰 Доходы: ${Math.round(totalIncome).toLocaleString()}₽`);
  console.log(`   🤖 Расходы: ${Math.round(totalExpenses).toLocaleString()}₽`);
  console.log(`   📈 Прибыль: ${Math.round(totalProfit).toLocaleString()}₽`);
  console.log('='.repeat(80) + '\n');

  return {
    total_income: Math.round(totalIncome),
    total_expenses: Math.round(totalExpenses),
    total_profit: Math.round(totalProfit)
  };
}

createCorrectReport().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
