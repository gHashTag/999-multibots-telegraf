#!/usr/bin/env node

/**
 * 🎯 ПОЛНЫЙ ДЕТАЛЬНЫЙ ОТЧЕТ - МНОГО ЛИСТОВ!
 * - RUB + XTR (реальные) + STARS (все)
 * - 9 листов Excel с полной детализацией
 * - Только продакшн боты
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

const REAL_PAYMENT_METHODS = ['Telegram', 'Robokassa'];

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

const AI_PROVIDERS = ['Replicate', 'Fal', 'OpenAI', 'HeyGen', 'Hedra', 'KieAI', 'Runway', 'Sora', 'Other'];

async function createCompleteDetailedReport() {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ПОЛНЫЙ ДЕТАЛЬНЫЙ ОТЧЕТ - МНОГО ЛИСТОВ!');
  console.log('   RUB + XTR + STARS = ВСЯ ПРАВДА');
  console.log('='.repeat(80) + '\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

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

  // Расходы
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
    bot.margin = bot.incomes.total_rub > 0 ? (bot.profit / bot.incomes.total_rub * 100) : 0;
  });

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

  // СОЗДАЕМ МНОГО ЛИСТОВ!
  console.log('\n📊 СОЗДАЕМ ПОЛНЫЙ EXCEL С 9 ЛИСТАМИ...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🎯 ПОЛНЫЙ ДЕТАЛЬНЫЙ ОТЧЕТ";
  workbook.created = new Date();

  // ЛИСТ 1: ОБЩАЯ СВОДКА
  const summarySheet = workbook.addWorksheet('📊 ОБЩАЯ СВОДКА');
  summarySheet.mergeCells('A1:M1');
  summarySheet.getCell('A1').value = '🎯 ПОЛНЫЙ ОТЧЕТ ПО ПРОДАКШН БОТАМ: RUB + XTR + STARS';
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
    'ИТОГО', 'ПРОДАКШЕН', '',
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

  // ЛИСТ 2: ТОП БОТЫ
  const topBotsSheet = workbook.addWorksheet('🏆 ТОП БОТЫ');
  topBotsSheet.addRow(['Параметр', 'Доходы (₽)', 'Расходы (₽)', 'Прибыль (₽)', 'Маржа (%)', 'Бот']);
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
      bot.name
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
      bot.name
    ]);
  });

  topBotsSheet.addRow(['']);

  // ТОП убыточные
  const topLosses = sortedBots
    .filter(b => b.profit < 0)
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 3);

  topLosses.forEach((bot, i) => {
    topBotsSheet.addRow([
      `ТОП-${i + 1} убыточные`,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.margin.toFixed(1) + '%',
      bot.name
    ]);
  });

  // ЛИСТ 3: РАСХОДЫ НА AI ПО БОТАМ
  const aiCostsSheet = workbook.addWorksheet('🤖 РАСХОДЫ НА AI');
  aiCostsSheet.addRow(['Бот', 'Провайдер', 'Сумма (₽)', 'Доля (%)']);
  aiCostsSheet.getRow(1).font = { bold: true };

  sortedBots.forEach(bot => {
    Object.entries(bot.outcomes.by_provider).forEach(([provider, cost]) => {
      const share = (cost / bot.outcomes.total * 100).toFixed(1);
      aiCostsSheet.addRow([
        bot.name,
        provider,
        Math.round(cost).toLocaleString(),
        share + '%'
      ]);
    });
  });

  // ЛИСТ 4: ДОХОДЫ ПО МЕТОДАМ (RUB + XTR)
  const methodsSheet = workbook.addWorksheet('💰 ДОХОДЫ ПО МЕТОДАМ');
  methodsSheet.addRow(['Бот', 'Метод оплаты', 'Валюта', 'Количество', 'Сумма в валюте', 'В рублях']);
  methodsSheet.getRow(1).font = { bold: true };

  // RUB доходы
  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'RUB' &&
    REAL_PAYMENT_METHODS.includes(row.payment_method)
  ).forEach(row => {
    if (botData[row.bot_name]) {
      methodsSheet.addRow([
        row.bot_name,
        row.payment_method,
        row.currency,
        1,
        Math.round(parseFloat(row.amount)).toLocaleString(),
        Math.round(parseFloat(row.amount)).toLocaleString()
      ]);
    }
  });

  // XTR доходы
  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'XTR' &&
    REAL_PAYMENT_METHODS.includes(row.payment_method)
  ).forEach(row => {
    if (botData[row.bot_name]) {
      methodsSheet.addRow([
        row.bot_name,
        row.payment_method,
        row.currency,
        1,
        Math.round(parseFloat(row.amount)).toLocaleString(),
        Math.round(convertToRub(row.amount, row.currency)).toLocaleString()
      ]);
    }
  });

  // ЛИСТ 5: STARS ДОХОДЫ ПО БОТАМ
  const starsSheet = workbook.addWorksheet('⭐ STARS ДОХОДЫ');
  starsSheet.addRow(['Бот', 'Метод оплаты', 'Количество', 'STARS', 'В рублях', 'Дата']);
  starsSheet.getRow(1).font = { bold: true };

  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    row.currency === 'STARS'
  ).forEach(row => {
    if (botData[row.bot_name]) {
      starsSheet.addRow([
        row.bot_name,
        row.payment_method || 'EMPTY',
        1,
        Math.round(parseFloat(row.amount)).toLocaleString(),
        Math.round(convertToRub(row.amount, row.currency)).toLocaleString(),
        row.created_at
      ]);
    }
  });

  // ЛИСТ 6: ДЕТАЛИ ПО ВАЛЮТАМ
  const currencySheet = workbook.addWorksheet('💎 ДЕТАЛИ ПО ВАЛЮТАМ');
  currencySheet.addRow(['Валюта', 'Количество операций', 'Сумма в валюте', 'Эквивалент в рублях', 'Доля (%)']);
  currencySheet.getRow(1).font = { bold: true };

  const rubTotal = sortedBots.reduce((s, b) => s + b.incomes.RUB.amount, 0);
  const xtrTotal = sortedBots.reduce((s, b) => s + b.incomes.XTR.in_rub, 0);
  const starsTotal = sortedBots.reduce((s, b) => s + b.incomes.STARS.in_rub, 0);

  currencySheet.addRow(['RUB', sortedBots.reduce((s, b) => s + b.incomes.RUB.count, 0), Math.round(rubTotal).toLocaleString(), Math.round(rubTotal).toLocaleString(), (rubTotal / totalIncome * 100).toFixed(1)]);
  currencySheet.addRow(['XTR', sortedBots.reduce((s, b) => s + b.incomes.XTR.count, 0), Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR.amount, 0)).toLocaleString(), Math.round(xtrTotal).toLocaleString(), (xtrTotal / totalIncome * 100).toFixed(1)]);
  currencySheet.addRow(['STARS', sortedBots.reduce((s, b) => s + b.incomes.STARS.count, 0), Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS.amount, 0)).toLocaleString(), Math.round(starsTotal).toLocaleString(), (starsTotal / totalIncome * 100).toFixed(1)]);

  // ЛИСТ 7: ПРИБЫЛЬНОСТЬ БОТОВ
  const profitabilitySheet = workbook.addWorksheet('📈 ПРИБЫЛЬНОСТЬ');
  profitabilitySheet.addRow(['Бот', 'Доходы (₽)', 'Расходы (₽)', 'Прибыль (₽)', 'Маржа (%)', 'Статус']);
  profitabilitySheet.getRow(1).font = { bold: true };

  sortedBots.forEach(bot => {
    const status = bot.profit > 0 ? '✅ ПРИБЫЛЬНЫЙ' : '❌ УБЫТОЧНЫЙ';
    profitabilitySheet.addRow([
      bot.name,
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.margin.toFixed(1),
      status
    ]);
  });

  // ЛИСТ 8: ХРОНОЛОГИЯ РАСХОДОВ
  const expensesSheet = workbook.addWorksheet('📋 ХРОНОЛОГИЯ РАСХОДОВ');
  expensesSheet.addRow(['№', 'Бот', 'Дата', 'Сумма (₽)', 'Валюта', 'Провайдер', 'Описание']);
  expensesSheet.getRow(1).font = { bold: true };

  let counter = 1;
  rawData.filter(row =>
    row.type === 'MONEY_OUTCOME' &&
    botData[row.bot_name]
  ).forEach(row => {
    const provider = Object.entries(botData[row.bot_name].outcomes.by_provider)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other';

    expensesSheet.addRow([
      counter++,
      row.bot_name,
      row.created_at,
      Math.round(convertToRub(row.amount, row.currency)).toLocaleString(),
      row.currency,
      provider,
      row.description?.substring(0, 100) || ''
    ]);
  });

  // ЛИСТ 9: СВОДКА ПО МЕТОДАМ ОПЛАТЫ
  const paymentMethodsSheet = workbook.addWorksheet('💳 МЕТОДЫ ОПЛАТЫ');
  paymentMethodsSheet.addRow(['Метод оплаты', 'Валюта', 'Количество', 'Сумма']);
  paymentMethodsSheet.getRow(1).font = { bold: true };

  const methodsSummary = {};
  rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    botData[row.bot_name]
  ).forEach(row => {
    const key = `${row.payment_method}_${row.currency}`;
    if (!methodsSummary[key]) {
      methodsSummary[key] = { count: 0, amount: 0, currency: row.currency, method: row.payment_method };
    }
    methodsSummary[key].count++;
    methodsSummary[key].amount += parseFloat(row.amount);
  });

  Object.values(methodsSummary).forEach(data => {
    paymentMethodsSheet.addRow([
      data.method,
      data.currency,
      data.count,
      Math.round(data.amount).toLocaleString()
    ]);
  });

  const outputPath = '/Users/playra/999-multibots-telegraf/ПОЛНЫЙ_ДЕТАЛЬНЫЙ_ОТЧЕТ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('\n' + '='.repeat(80));
  console.log('✅ ПОЛНЫЙ ДЕТАЛЬНЫЙ ОТЧЕТ ГОТОВ!');
  console.log('='.repeat(80));
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n📊 СОДЕРЖИМОЕ (9 ЛИСТОВ):');
  console.log('   1️⃣  📊 ОБЩАЯ СВОДКА - полная таблица по всем ботам');
  console.log('   2️⃣  🏆 ТОП БОТЫ - рейтинги доходов, прибыли и убытков');
  console.log('   3️⃣  🤖 РАСХОДЫ НА AI - затраты по провайдерам');
  console.log('   4️⃣  💰 ДОХОДЫ ПО МЕТОДАМ - Telegram vs Robokassa');
  console.log('   5️⃣  ⭐ STARS ДОХОДЫ - детализация STARS');
  console.log('   6️⃣  💎 ДЕТАЛИ ПО ВАЛЮТАМ - RUB, XTR, STARS');
  console.log('   7️⃣  📈 ПРИБЫЛЬНОСТЬ - статус каждого бота');
  console.log('   8️⃣  📋 ХРОНОЛОГИЯ РАСХОДОВ - все операции по дням');
  console.log('   9️⃣  💳 МЕТОДЫ ОПЛАТЫ - сводка по способам оплаты');
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

createCompleteDetailedReport().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
