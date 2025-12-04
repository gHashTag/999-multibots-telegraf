#!/usr/bin/env node

/**
 * 🎯 ФИНАЛЬНЫЙ ОТЧЕТ С УЧЕТОМ STARS
 * - RUB + XTR + STARS доходы
 * - Только продакшн боты
 * - STARS учитываются как реальные доходы!
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

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

async function createCompleteReport() {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ФИНАЛЬНЫЙ ОТЧЕТ С УЧЕТОМ STARS');
  console.log('   RUB + XTR + STARS = ПОЛНАЯ КАРТИНА');
  console.log('='.repeat(80) + '\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

  // Собираем данные по ботам
  const botData = {};
  PRODUCTION_BOTS.forEach(bot => {
    botData[bot.name] = {
      ...bot,
      incomes: {
        RUB: { count: 0, amount: 0 },
        XTR: { count: 0, amount: 0, in_rub: 0 },
        STARS: { count: 0, amount: 0, in_rub: 0 },
        total_rub: 0
      },
      outcomes: { total: 0 },
      profit: 0,
      margin: 0
    };
  });

  // Обрабатываем доходы
  rawData.filter(row => row.type === 'MONEY_INCOME').forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const currency = row.currency;
    const amount = parseFloat(row.amount) || 0;
    const amountInRub = convertToRub(amount, currency);

    if (currency === 'RUB') {
      botData[botName].incomes.RUB.count++;
      botData[botName].incomes.RUB.amount += amount;
      botData[botName].incomes.total_rub += amountInRub;
    } else if (currency === 'XTR') {
      botData[botName].incomes.XTR.count++;
      botData[botName].incomes.XTR.amount += amount;
      botData[botName].incomes.XTR.in_rub += amountInRub;
      botData[botName].incomes.total_rub += amountInRub;
    } else if (currency === 'STARS') {
      botData[botName].incomes.STARS.count++;
      botData[botName].incomes.STARS.amount += amount;
      botData[botName].incomes.STARS.in_rub += amountInRub;
      botData[botName].incomes.total_rub += amountInRub;
    }
  });

  // Обрабатываем расходы
  rawData.filter(row => row.type === 'MONEY_OUTCOME').forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const amount = convertToRub(row.amount, row.currency);
    botData[botName].outcomes.total += amount;
  });

  // Считаем прибыль
  Object.values(botData).forEach(bot => {
    bot.profit = bot.incomes.total_rub - bot.outcomes.total;
    bot.margin = bot.incomes.total_rub > 0 ? (bot.profit / bot.incomes.total_rub * 100) : 0;
  });

  // Вывод
  console.log('🤖 ДЕТАЛИ ПО БОТАМ:');
  console.log('='.repeat(80));

  const sortedBots = Object.values(botData)
    .sort((a, b) => b.incomes.total_rub - a.incomes.total_rub);

  sortedBots.forEach(bot => {
    console.log(`\n🤖 ${bot.name}:`);
    console.log(`   💰 RUB: ${Math.round(bot.incomes.RUB.amount).toLocaleString()}₽ (${bot.incomes.RUB.count} операций)`);
    console.log(`   💎 XTR: ${Math.round(bot.incomes.XTR.amount).toLocaleString()} (${Math.round(bot.incomes.XTR.in_rub).toLocaleString()}₽) (${bot.incomes.XTR.count} операций)`);
    console.log(`   ⭐ STARS: ${Math.round(bot.incomes.STARS.amount).toLocaleString()} (${Math.round(bot.incomes.STARS.in_rub).toLocaleString()}₽) (${bot.incomes.STARS.count} операций)`);
    console.log(`   📊 ИТОГО: ${Math.round(bot.incomes.total_rub).toLocaleString()}₽`);
    console.log(`   🤖 Расходы: ${Math.round(bot.outcomes.total).toLocaleString()}₽`);
    console.log(`   📈 Прибыль: ${Math.round(bot.profit).toLocaleString()}₽ (маржа: ${bot.margin.toFixed(1)}%)`);
  });

  // Итоги
  const totalIncome = sortedBots.reduce((sum, bot) => sum + bot.incomes.total_rub, 0);
  const totalExpenses = sortedBots.reduce((sum, bot) => sum + bot.outcomes.total, 0);
  const totalProfit = totalIncome - totalExpenses;
  const totalMargin = totalIncome > 0 ? (totalProfit / totalIncome * 100) : 0;

  console.log('\n\n🎯 ИТОГО ПО ПРОДАКШН БОТАМ:');
  console.log('='.repeat(80));
  console.log(`💰 RUB доходы: ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.RUB.amount, 0)).toLocaleString()}₽`);
  console.log(`💎 XTR→₽ доходы: ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR.in_rub, 0)).toLocaleString()}₽`);
  console.log(`⭐ STARS→₽ доходы: ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS.in_rub, 0)).toLocaleString()}₽`);
  console.log(`📊 ВСЕГО ДОХОДОВ: ${Math.round(totalIncome).toLocaleString()}₽`);
  console.log(`🤖 ВСЕГО РАСХОДОВ: ${Math.round(totalExpenses).toLocaleString()}₽`);
  console.log(`📈 ВСЕГО ПРИБЫЛИ: ${Math.round(totalProfit).toLocaleString()}₽`);
  console.log(`📊 ОБЩАЯ МАРЖА: ${totalMargin.toFixed(1)}%`);
  console.log('='.repeat(80));

  // Excel
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🎯 ФИНАЛЬНЫЙ ОТЧЕТ С STARS";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('📊 ФИНАЛЬНЫЙ ОТЧЕТ');
  summarySheet.mergeCells('A1:L1');
  summarySheet.getCell('A1').value = '🎯 ПОЛНЫЙ ОТЧЕТ: RUB + XTR + STARS';
  summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  summarySheet.addRow(['']);
  summarySheet.addRow([
    '№', 'Бот', 'Тип',
    'RUB', 'RUB кол',
    'XTR→₽', 'XTR кол',
    'STARS→₽', 'STARS кол',
    'ИТОГО (₽)', 'РАСХОДЫ (₽)', 'ПРИБЫЛЬ (₽)', 'МАРЖА (%)'
  ]);
  summarySheet.getRow(3).font = { bold: true };

  sortedBots.forEach((bot, index) => {
    summarySheet.addRow([
      index + 1,
      bot.name,
      bot.type,
      Math.round(bot.incomes.RUB.amount).toLocaleString(),
      bot.incomes.RUB.count,
      Math.round(bot.incomes.XTR.in_rub).toLocaleString(),
      bot.incomes.XTR.count,
      Math.round(bot.incomes.STARS.in_rub).toLocaleString(),
      bot.incomes.STARS.count,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.margin.toFixed(1)
    ]);
  });

  const totalRow = summarySheet.addRow([
    'ИТОГО', 'ПРОДАКШЕН', '',
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.RUB.amount, 0)).toLocaleString(),
    sortedBots.reduce((s, b) => s + b.incomes.RUB.count, 0),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR.in_rub, 0)).toLocaleString(),
    sortedBots.reduce((s, b) => s + b.incomes.XTR.count, 0),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS.in_rub, 0)).toLocaleString(),
    sortedBots.reduce((s, b) => s + b.incomes.STARS.count, 0),
    Math.round(totalIncome).toLocaleString(),
    Math.round(totalExpenses).toLocaleString(),
    Math.round(totalProfit).toLocaleString(),
    totalMargin.toFixed(1)
  ]);
  totalRow.font = { bold: true };

  const outputPath = '/Users/playra/999-multibots-telegraf/ФИНАЛЬНЫЙ_ОТЧЕТ_С_STARS.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('\n' + '='.repeat(80));
  console.log('✅ ФИНАЛЬНЫЙ ОТЧЕТ С STARS ГОТОВ!');
  console.log('='.repeat(80));
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n🎯 КЛЮЧЕВЫЕ ДАННЫЕ:');
  console.log(`   💰 RUB: ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.RUB.amount, 0)).toLocaleString()}₽`);
  console.log(`   💎 XTR→₽: ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR.in_rub, 0)).toLocaleString()}₽`);
  console.log(`   ⭐ STARS→₽: ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS.in_rub, 0)).toLocaleString()}₽`);
  console.log(`   📊 ИТОГО: ${Math.round(totalIncome).toLocaleString()}₽`);
  console.log(`   🤖 РАСХОДЫ: ${Math.round(totalExpenses).toLocaleString()}₽`);
  console.log(`   📈 ПРИБЫЛЬ: ${Math.round(totalProfit).toLocaleString()}₽ (${totalMargin.toFixed(1)}%)`);
  console.log('='.repeat(80) + '\n');

  return {
    total_income: Math.round(totalIncome),
    total_expenses: Math.round(totalExpenses),
    total_profit: Math.round(totalProfit),
    margin: totalMargin.toFixed(1)
  };
}

createCompleteReport().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
