#!/usr/bin/env node

/**
 * 🎯 ОТЧЕТ ПО ВСЕМ 10 БОТАМ (ПРОДАКШН + ТЕСТОВЫЕ)
 * - Все боты включены в доходы и расходы
 * - RUB + XTR + STARS по всем ботам
 * - 9 листов Excel
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

const REAL_PAYMENT_METHODS = ['Telegram', 'Robokassa'];

// ВСЕ 10 БОТОВ!
const ALL_BOTS = [
  { name: 'neuro_blogger_bot', type: 'ПРОДАКШЕН' },
  { name: 'MetaMuse_Manifest_bot', type: 'ПРОДАКШЕН' },
  { name: 'HaimGroupMedia_bot', type: 'ПРОДАКШЕН' },
  { name: 'AI_STARS_bot', type: 'ПРОДАКШЕН' },
  { name: 'Gaia_Kamskaia_bot', type: 'ПРОДАКШЕН' },
  { name: 'NeuroLenaAssistant_bot', type: 'ПРОДАКШЕН' },
  { name: 'NeurostylistShtogrina_bot', type: 'ПРОДАКШЕН' },
  { name: 'Kaya_easy_art_bot', type: 'ПРОДАКШЕН' },
  { name: 'ai_koshey_bot', type: 'ТЕСТОВЫЙ' },
  { name: 'clip_maker_neuro_bot', type: 'ТЕСТОВЫЙ' }
];

const AI_PROVIDERS = ['Replicate', 'Fal', 'OpenAI', 'HeyGen', 'Hedra', 'KieAI', 'Runway', 'Sora', 'Other'];

async function createAllBotsReport() {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ОТЧЕТ ПО ВСЕМ 10 БОТАМ');
  console.log('   ПРОДАКШЕН + ТЕСТОВЫЕ = ВСЯ КАРТИНА');
  console.log('='.repeat(80) + '\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

  const botData = {};
  ALL_BOTS.forEach(bot => {
    botData[bot.name] = {
      ...bot,
      incomes: {
        RUB: { count: 0, amount: 0 },
        XTR: { count: 0, amount: 0, in_rub: 0 },
        STARS: { count: 0, amount: 0, in_rub: 0 },
        total_rub: 0
      },
      outcomes: { total: 0, by_provider: {} },
      profit: 0,
      margin: 0
    };
  });

  // RUB доходы - только реальные методы
  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'RUB' &&
    REAL_PAYMENT_METHODS.includes(row.payment_method)
  ).forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const amount = parseFloat(row.amount) || 0;
    botData[botName].incomes.RUB.count++;
    botData[botName].incomes.RUB.amount += amount;
    botData[botName].incomes.total_rub += amount;
  });

  // XTR доходы - только реальные методы
  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'XTR' &&
    REAL_PAYMENT_METHODS.includes(row.payment_method)
  ).forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const amount = parseFloat(row.amount) || 0;
    const amountInRub = convertToRub(amount, row.currency);
    botData[botName].incomes.XTR.count++;
    botData[botName].incomes.XTR.amount += amount;
    botData[botName].incomes.XTR.in_rub += amountInRub;
    botData[botName].incomes.total_rub += amountInRub;
  });

  // STARS доходы - ВСЕ методы (покупают!)
  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'STARS'
  ).forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const amount = parseFloat(row.amount) || 0;
    const amountInRub = convertToRub(amount, row.currency);
    botData[botName].incomes.STARS.count++;
    botData[botName].incomes.STARS.amount += amount;
    botData[botName].incomes.STARS.in_rub += amountInRub;
    botData[botName].incomes.total_rub += amountInRub;
  });

  // Расходы - ВСЕ боты
  rawData.filter(row =>
    row.type === 'MONEY_OUTCOME'
  ).forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const amount = convertToRub(row.amount, row.currency);
    botData[botName].outcomes.total += amount;

    // Определяем провайдера
    const description = (row.description || '').toLowerCase();
    let provider = 'Other';

    for (const prov of AI_PROVIDERS) {
      if (prov !== 'Other' && description.includes(prov.toLowerCase())) {
        provider = prov;
        break;
      }
    }

    if (!botData[botName].outcomes.by_provider[provider]) {
      botData[botName].outcomes.by_provider[provider] = 0;
    }
    botData[botName].outcomes.by_provider[provider] += amount;
  });

  // Прибыль
  Object.values(botData).forEach(bot => {
    bot.profit = bot.incomes.total_rub - bot.outcomes.total;
    bot.margin = bot.incomes.total_rub > 0 ? (bot.profit / bot.incomes.total_rub * 100) : -100;
  });

  console.log('🤖 ДЕТАЛИ ПО ВСЕМ 10 БОТАМ:');
  console.log('='.repeat(80));

  const sortedBots = Object.values(botData)
    .sort((a, b) => b.incomes.total_rub - a.incomes.total_rub);

  sortedBots.forEach(bot => {
    console.log(`\n🤖 ${bot.name} (${bot.type}):`);
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

  console.log('\n\n🎯 ИТОГО ПО ВСЕМ 10 БОТАМ:');
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
  console.log('\n📊 СОЗДАЕМ EXCEL С 9 ЛИСТАМИ...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🎯 ОТЧЕТ ПО ВСЕМ 10 БОТАМ";
  workbook.created = new Date();

  // ЛИСТ 1: ОБЩАЯ СВОДКА
  const summarySheet = workbook.addWorksheet('📊 ОБЩАЯ СВОДКА');
  summarySheet.mergeCells('A1:M1');
  summarySheet.getCell('A1').value = '🎯 ОТЧЕТ ПО ВСЕМ 10 БОТАМ: ПРОДАКШЕН + ТЕСТОВЫЕ';
  summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  summarySheet.addRow(['']);
  summarySheet.addRow([
    '№', 'Бот', 'Тип',
    'RUB', 'RUB кол',
    'XTR', 'XTR→₽', 'XTR кол',
    'STARS', 'STARS→₽', 'STARS кол',
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
      Math.round(bot.incomes.XTR.amount).toLocaleString(),
      Math.round(bot.incomes.XTR.in_rub).toLocaleString(),
      bot.incomes.XTR.count,
      Math.round(bot.incomes.STARS.amount).toLocaleString(),
      Math.round(bot.incomes.STARS.in_rub).toLocaleString(),
      bot.incomes.STARS.count,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.margin.toFixed(1)
    ]);
  });

  const totalRow = summarySheet.addRow([
    'ИТОГО', 'ВСЕ БОТЫ', '',
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.RUB.amount, 0)).toLocaleString(),
    sortedBots.reduce((s, b) => s + b.incomes.RUB.count, 0),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR.amount, 0)).toLocaleString(),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR.in_rub, 0)).toLocaleString(),
    sortedBots.reduce((s, b) => s + b.incomes.XTR.count, 0),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS.amount, 0)).toLocaleString(),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS.in_rub, 0)).toLocaleString(),
    sortedBots.reduce((s, b) => s + b.incomes.STARS.count, 0),
    Math.round(totalIncome).toLocaleString(),
    Math.round(totalExpenses).toLocaleString(),
    Math.round(totalProfit).toLocaleString(),
    totalMargin.toFixed(1)
  ]);
  totalRow.font = { bold: true };

  // ЛИСТ 2: ПРОДАКШЕН vs ТЕСТОВЫЕ
  const prodTestSheet = workbook.addWorksheet('🆚 ПРОДАКШЕН vs ТЕСТ');
  prodTestSheet.addRow(['Параметр', 'ПРОДАКШЕН', 'ТЕСТОВЫЕ', 'ИТОГО']);
  prodTestSheet.getRow(1).font = { bold: true };

  const prodBots = sortedBots.filter(b => b.type === 'ПРОДАКШЕН');
  const testBots = sortedBots.filter(b => b.type === 'ТЕСТОВЫЙ');

  const prodIncome = prodBots.reduce((s, b) => s + b.incomes.total_rub, 0);
  const prodExpenses = prodBots.reduce((s, b) => s + b.outcomes.total, 0);
  const testIncome = testBots.reduce((s, b) => s + b.incomes.total_rub, 0);
  const testExpenses = testBots.reduce((s, b) => s + b.outcomes.total, 0);

  prodTestSheet.addRow(['Количество ботов', prodBots.length, testBots.length, sortedBots.length]);
  prodTestSheet.addRow(['Доходы (₽)', Math.round(prodIncome).toLocaleString(), Math.round(testIncome).toLocaleString(), Math.round(totalIncome).toLocaleString()]);
  prodTestSheet.addRow(['Расходы (₽)', Math.round(prodExpenses).toLocaleString(), Math.round(testExpenses).toLocaleString(), Math.round(totalExpenses).toLocaleString()]);
  prodTestSheet.addRow(['Прибыль (₽)', Math.round(prodIncome - prodExpenses).toLocaleString(), Math.round(testIncome - testExpenses).toLocaleString(), Math.round(totalProfit).toLocaleString()]);

  // ЛИСТ 3: ТОП БОТЫ
  const topBotsSheet = workbook.addWorksheet('🏆 ТОП БОТЫ');
  topBotsSheet.addRow(['Параметр', 'Доходы (₽)', 'Расходы (₽)', 'Прибыль (₽)', 'Маржа (%)', 'Бот', 'Тип']);
  topBotsSheet.getRow(1).font = { bold: true };

  // ТОП по доходам
  const topByIncome = sortedBots.slice(0, 5);
  topByIncome.forEach((bot, i) => {
    topBotsSheet.addRow([
      `ТОП-${i + 1} по доходам`,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.margin.toFixed(1) + '%',
      bot.name,
      bot.type
    ]);
  });

  topBotsSheet.addRow(['']);

  // ТОП по прибыли
  const topByProfit = sortedBots
    .filter(b => b.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);

  topByProfit.forEach((bot, i) => {
    topBotsSheet.addRow([
      `ТОП-${i + 1} по прибыли`,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.margin.toFixed(1) + '%',
      bot.name,
      bot.type
    ]);
  });

  topBotsSheet.addRow(['']);

  // ТОП убыточные
  const topLosses = sortedBots
    .filter(b => b.profit < 0)
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 5);

  topLosses.forEach((bot, i) => {
    topBotsSheet.addRow([
      `ТОП-${i + 1} убыточные`,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.margin.toFixed(1) + '%',
      bot.name,
      bot.type
    ]);
  });

  // ЛИСТ 4: РАСХОДЫ НА AI ПО БОТАМ
  const aiCostsSheet = workbook.addWorksheet('🤖 РАСХОДЫ НА AI');
  aiCostsSheet.addRow(['Бот', 'Тип', 'Провайдер', 'Сумма (₽)']);
  aiCostsSheet.getRow(1).font = { bold: true };

  sortedBots.forEach(bot => {
    Object.entries(bot.outcomes.by_provider).forEach(([provider, cost]) => {
      aiCostsSheet.addRow([
        bot.name,
        bot.type,
        provider,
        Math.round(cost).toLocaleString()
      ]);
    });
  });

  // ЛИСТ 5: ДОХОДЫ ПО МЕТОДАМ
  const methodsSheet = workbook.addWorksheet('💰 ДОХОДЫ ПО МЕТОДАМ');
  methodsSheet.addRow(['Бот', 'Тип', 'Метод оплаты', 'Валюта', 'Сумма']);
  methodsSheet.getRow(1).font = { bold: true };

  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    (REAL_PAYMENT_METHODS.includes(row.payment_method) || row.currency === 'STARS')
  ).forEach(row => {
    if (botData[row.bot_name]) {
      methodsSheet.addRow([
        row.bot_name,
        botData[row.bot_name].type,
        row.payment_method,
        row.currency,
        Math.round(parseFloat(row.amount)).toLocaleString()
      ]);
    }
  });

  // ЛИСТ 6: STARS ДОХОДЫ
  const starsSheet = workbook.addWorksheet('⭐ STARS ДОХОДЫ');
  starsSheet.addRow(['Бот', 'Тип', 'Метод оплаты', 'STARS', 'В рублях']);
  starsSheet.getRow(1).font = { bold: true };

  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'STARS'
  ).forEach(row => {
    if (botData[row.bot_name]) {
      starsSheet.addRow([
        row.bot_name,
        botData[row.bot_name].type,
        row.payment_method || 'EMPTY',
        Math.round(parseFloat(row.amount)).toLocaleString(),
        Math.round(convertToRub(row.amount, row.currency)).toLocaleString()
      ]);
    }
  });

  // ЛИСТ 7: ДЕТАЛИ ПО ВАЛЮТАМ
  const currencySheet = workbook.addWorksheet('💎 ДЕТАЛИ ПО ВАЛЮТАМ');
  currencySheet.addRow(['Валюта', 'Количество операций', 'Сумма в валюте', 'Эквивалент в рублях', 'Доля (%)']);
  currencySheet.getRow(1).font = { bold: true };

  const rubTotal = sortedBots.reduce((s, b) => s + b.incomes.RUB.amount, 0);
  const xtrTotal = sortedBots.reduce((s, b) => s + b.incomes.XTR.in_rub, 0);
  const starsTotal = sortedBots.reduce((s, b) => s + b.incomes.STARS.in_rub, 0);

  currencySheet.addRow(['RUB', sortedBots.reduce((s, b) => s + b.incomes.RUB.count, 0), Math.round(rubTotal).toLocaleString(), Math.round(rubTotal).toLocaleString(), (rubTotal / totalIncome * 100).toFixed(1)]);
  currencySheet.addRow(['XTR', sortedBots.reduce((s, b) => s + b.incomes.XTR.count, 0), Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR.amount, 0)).toLocaleString(), Math.round(xtrTotal).toLocaleString(), (xtrTotal / totalIncome * 100).toFixed(1)]);
  currencySheet.addRow(['STARS', sortedBots.reduce((s, b) => s + b.incomes.STARS.count, 0), Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS.amount, 0)).toLocaleString(), Math.round(starsTotal).toLocaleString(), (starsTotal / totalIncome * 100).toFixed(1)]);

  // ЛИСТ 8: ПРИБЫЛЬНОСТЬ
  const profitabilitySheet = workbook.addWorksheet('📈 ПРИБЫЛЬНОСТЬ');
  profitabilitySheet.addRow(['Бот', 'Тип', 'Доходы (₽)', 'Расходы (₽)', 'Прибыль (₽)', 'Маржа (%)', 'Статус']);
  profitabilitySheet.getRow(1).font = { bold: true };

  sortedBots.forEach(bot => {
    const status = bot.profit > 0 ? '✅ ПРИБЫЛЬНЫЙ' : '❌ УБЫТОЧНЫЙ';
    profitabilitySheet.addRow([
      bot.name,
      bot.type,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.margin.toFixed(1),
      status
    ]);
  });

  // ЛИСТ 9: ХРОНОЛОГИЯ РАСХОДОВ
  const expensesSheet = workbook.addWorksheet('📋 ХРОНОЛОГИЯ РАСХОДОВ');
  expensesSheet.addRow(['№', 'Бот', 'Тип', 'Дата', 'Сумма (₽)', 'Валюта']);
  expensesSheet.getRow(1).font = { bold: true };

  let counter = 1;
  rawData.filter(row =>
    row.type === 'MONEY_OUTCOME' &&
    botData[row.bot_name]
  ).forEach(row => {
    expensesSheet.addRow([
      counter++,
      row.bot_name,
      botData[row.bot_name].type,
      row.created_at,
      Math.round(convertToRub(row.amount, row.currency)).toLocaleString(),
      row.currency
    ]);
  });

  const outputPath = '/Users/playra/999-multibots-telegraf/ОТЧЕТ_ПО_ВСЕМ_10_БОТАМ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('\n' + '='.repeat(80));
  console.log('✅ ОТЧЕТ ПО ВСЕМ 10 БОТАМ ГОТОВ!');
  console.log('='.repeat(80));
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n📊 СОДЕРЖИМОЕ (9 ЛИСТОВ):');
  console.log('   1️⃣  📊 ОБЩАЯ СВОДКА - все 10 ботов');
  console.log('   2️⃣  🆚 ПРОДАКШЕН vs ТЕСТ - сравнение типов ботов');
  console.log('   3️⃣  🏆 ТОП БОТЫ - рейтинги по всем категориям');
  console.log('   4️⃣  🤖 РАСХОДЫ НА AI - по всем ботам');
  console.log('   5️⃣  💰 ДОХОДЫ ПО МЕТОДАМ - все операции');
  console.log('   6️⃣  ⭐ STARS ДОХОДЫ - детализация STARS');
  console.log('   7️⃣  💎 ДЕТАЛИ ПО ВАЛЮТАМ - RUB, XTR, STARS');
  console.log('   8️⃣  📈 ПРИБЫЛЬНОСТЬ - статус всех 10 ботов');
  console.log('   9️⃣  📋 ХРОНОЛОГИЯ РАСХОДОВ - все расходы');
  console.log('\n🎯 КЛЮЧЕВЫЕ ДАННЫЕ:');
  console.log(`   💰 RUB: ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.RUB.amount, 0)).toLocaleString()}₽`);
  console.log(`   💎 XTR→₽: ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR.in_rub, 0)).toLocaleString()}₽`);
  console.log(`   ⭐ STARS→₽: ${Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS.in_rub, 0)).toLocaleString()}₽`);
  console.log(`   📊 ИТОГО: ${Math.round(totalIncome).toLocaleString()}₽`);
  console.log(`   🤖 РАСХОДЫ: ${Math.round(totalExpenses).toLocaleString()}₽`);
  console.log(`   📈 ПРИБЫЛЬ: ${Math.round(totalProfit).toLocaleString()}₽ (${totalMargin.toFixed(1)}%)`);
  console.log('\n🎯 ПРОДАКШЕН vs ТЕСТОВЫЕ:');
  console.log(`   ПРОДАКШЕН: ${prodBots.length} ботов | Доходы: ${Math.round(prodIncome).toLocaleString()}₽ | Прибыль: ${Math.round(prodIncome - prodExpenses).toLocaleString()}₽`);
  console.log(`   ТЕСТОВЫЕ: ${testBots.length} ботов | Доходы: ${Math.round(testIncome).toLocaleString()}₽ | Расходы: ${Math.round(testExpenses).toLocaleString()}₽`);
  console.log('='.repeat(80) + '\n');

  return {
    total_income: Math.round(totalIncome),
    total_expenses: Math.round(totalExpenses),
    total_profit: Math.round(totalProfit),
    margin: totalMargin.toFixed(1),
    prod_bots: prodBots.length,
    test_bots: testBots.length
  };
}

createAllBotsReport().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
