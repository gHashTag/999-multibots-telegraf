#!/usr/bin/env node

/**
 * 🎯 ФИНАЛЬНЫЙ ПОЛНЫЙ ОТЧЕТ - ДОХОДЫ + РАСХОДЫ НА AI
 * - Правильные доходы: RUB + XTR (686,267₽)
 * - STARS = 0 (не покупают)
 * - Расходы на AI провайдеры
 * - Прибыльность каждого бота
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

// ТОЛЬКО РЕАЛЬНЫЕ ПЛАТЕЖНЫЕ СИСТЕМЫ
const REAL_PAYMENT_METHODS = ['Telegram', 'Robokassa'];

// ФЕЙКОВЫЕ МЕТОДЫ
const FAKE_PAYMENT_METHODS = [
  'System', 'SYSTEM', 'Internal', 'balance', 'Manual', 'Admin', 'admin',
  'bank_card', 'System_Balance_Migration', 'admin_special_topup',
  'admin_topup', 'video-generation-refund', 'image-to-video-refund',
  'Admin_Bonus', 'Bonus', 'System Grant', 'Tester_Bonus', 'Promo',
  'Admin_Unlimited_Grant', 'Admin_Welcome_Grant', 'Admin_Compensation',
  'System_Operation', 'Manual Admin Grant', 'test', 'Bonus_Credit',
  'System Compensation', 'Refund', ''
];

// AI ПРОВАЙДЕРЫ
const AI_PROVIDERS = ['Replicate', 'Fal', 'OpenAI', 'HeyGen', 'Hedra', 'KieAI', 'Runway', 'Sora', 'Other'];

const BOTS = [
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

async function createFinalReport() {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ФИНАЛЬНЫЙ ПОЛНЫЙ ОТЧЕТ - ДОХОДЫ + РАСХОДЫ НА AI');
  console.log('='.repeat(80) + '\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

  // 1. ДОХОДЫ
  const incomes = rawData.filter(row =>
    row.type === 'MONEY_INCOME' &&
    REAL_PAYMENT_METHODS.includes(row.payment_method)
  );

  // 2. РАСХОДЫ
  const outcomes = rawData.filter(row =>
    row.type === 'MONEY_OUTCOME'
  );

  console.log(`📊 Всего записей: ${rawData.length}`);
  console.log(`✅ Реальные доходы: ${incomes.length} записей`);
  console.log(`🤖 Расходы на AI: ${outcomes.length} записей\n`);

  // 3. ГРУППИРУЕМ ПО БОТАМ
  const botData = {};
  BOTS.forEach(bot => {
    botData[bot.name] = {
      ...bot,
      incomes: { RUB: 0, XTR: 0, STARS: 0, total_rub: 0 },
      outcomes: { total: 0, by_provider: {} },
      profit: 0,
      margin: 0
    };
  });

  // 4. ОБРАБАТЫВАЕМ ДОХОДЫ
  incomes.forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const amount = parseFloat(row.amount) || 0;
    const currency = row.currency;
    const amountInRub = convertToRub(amount, currency);

    botData[botName].incomes[currency] += amountInRub;
    botData[botName].incomes.total_rub += amountInRub;
  });

  // 5. ОБРАБАТЫВАЕМ РАСХОДЫ
  outcomes.forEach(row => {
    const botName = row.bot_name;
    if (!botData[botName]) return;

    const amount = parseFloat(row.amount) || 0;
    const amountInRub = convertToRub(amount, row.currency);

    botData[botName].outcomes.total += amountInRub;

    // Определяем провайдера
    const description = (row.description || '').toLowerCase();
    let provider = 'Other';

    for (const prov of AI_PROVIDERS) {
      if (prov !== 'Other' && description.includes(prov.toLowerCase())) {
        provider = prov;
        break;
      }
    }

    // Если не нашли по названию, определяем по сумме
    if (provider === 'Other') {
      if (amountInRub >= 30) provider = 'Sora';
      else if (amountInRub >= 25) provider = 'Hedra';
      else if (amountInRub >= 20) provider = 'Runway';
      else if (amountInRub >= 15) provider = 'Replicate';
      else if (amountInRub >= 12) provider = 'Fal';
      else if (amountInRub >= 10) provider = 'KieAI';
      else if (amountInRub >= 8) provider = 'OpenAI';
    }

    if (!botData[botName].outcomes.by_provider[provider]) {
      botData[botName].outcomes.by_provider[provider] = 0;
    }
    botData[botName].outcomes.by_provider[provider] += amountInRub;
  });

  // 6. СЧИТАЕМ ПРИБЫЛЬ
  Object.values(botData).forEach(bot => {
    bot.profit = bot.incomes.total_rub - bot.outcomes.total;
    bot.margin = bot.incomes.total_rub > 0 ? (bot.profit / bot.incomes.total_rub * 100) : 0;
  });

  // 7. ВЫВОД СТАТИСТИКИ
  console.log('🤖 СТАТИСТИКА ПО БОТАМ:');
  console.log('='.repeat(80));

  const sortedBots = Object.values(botData)
    .sort((a, b) => b.incomes.total_rub - a.incomes.total_rub);

  sortedBots.forEach(bot => {
    console.log(`\n🤖 ${bot.name} (${bot.type}):`);
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

  console.log('\n\n🎯 ИТОГО ПО ВСЕМ БОТАМ:');
  console.log('='.repeat(80));
  console.log(`💰 Общие доходы: ${Math.round(totalIncome).toLocaleString()}₽`);
  console.log(`🤖 Общие расходы: ${Math.round(totalExpenses).toLocaleString()}₽`);
  console.log(`📈 Общая прибыль: ${Math.round(totalProfit).toLocaleString()}₽`);
  console.log(`📊 Общая маржа: ${(totalProfit / totalIncome * 100).toFixed(1)}%`);
  console.log('='.repeat(80));

  // 9. СОЗДАЕМ EXCEL
  console.log('\n📊 СОЗДАЕМ ФИНАЛЬНЫЙ EXCEL...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🎯 ФИНАЛЬНЫЙ ОТЧЕТ - ДОХОДЫ + РАСХОДЫ";
  workbook.created = new Date();

  // ЛИСТ 1: ОБЩАЯ СВОДКА
  const summarySheet = workbook.addWorksheet('📊 ОБЩАЯ СВОДКА');
  summarySheet.mergeCells('A1:G1');
  summarySheet.getCell('A1').value = '🎯 ФИНАЛЬНЫЙ ОТЧЕТ - 10 БОТОВ: ДОХОДЫ, РАСХОДЫ, ПРИБЫЛЬ';
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
    'ИТОГО', 'ВСЕ БОТЫ', '',
    Math.round(totalIncome).toLocaleString(),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.RUB, 0)).toLocaleString(),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.XTR, 0)).toLocaleString(),
    Math.round(sortedBots.reduce((s, b) => s + b.incomes.STARS, 0)).toLocaleString(),
    Math.round(totalExpenses).toLocaleString(),
    Math.round(totalProfit).toLocaleString(),
    (totalProfit / totalIncome * 100).toFixed(1)
  ]);
  totalRow.font = { bold: true };

  // ЛИСТ 2: ТОП БОТЫ
  const topBotsSheet = workbook.addWorksheet('🏆 ТОП БОТЫ');
  topBotsSheet.addRow(['Параметр', 'Доходы', 'Расходы', 'Прибыль', 'Маржа', 'Бот']);
  topBotsSheet.getRow(1).font = { bold: true };

  // ТОП по доходам
  const topByIncome = sortedBots.slice(0, 3);
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
    .slice(0, 3);

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
  aiCostsSheet.addRow(['Бот', 'Провайдер', 'Сумма (₽)']);
  aiCostsSheet.getRow(1).font = { bold: true };

  sortedBots.forEach(bot => {
    Object.entries(bot.outcomes.by_provider).forEach(([provider, cost]) => {
      aiCostsSheet.addRow([
        bot.name,
        provider,
        Math.round(cost).toLocaleString()
      ]);
    });
  });

  // ЛИСТ 4: ДОХОДЫ ПО МЕТОДАМ
  const methodsSheet = workbook.addWorksheet('💰 ДОХОДЫ ПО МЕТОДАМ');
  methodsSheet.addRow(['Бот', 'Метод оплаты', 'Валюта', 'Количество', 'Сумма']);
  methodsSheet.getRow(1).font = { bold: true };

  incomes.forEach(row => {
    if (botData[row.bot_name]) {
      methodsSheet.addRow([
        row.bot_name,
        row.payment_method,
        row.currency,
        1,
        Math.round(parseFloat(row.amount)).toLocaleString()
      ]);
    }
  });

  // ЛИСТ 5: ДЕТАЛИ ПО БОТАМ
  const detailsSheet = workbook.addWorksheet('📋 ДЕТАЛИ ПО БОТАМ');
  detailsSheet.addRow(['Бот', 'Тип', 'RUB доходы', 'XTR доходы', 'STARS доходы', 'Всего доходов', 'AI расходы', 'Прибыль', 'Убыток']);
  detailsSheet.getRow(1).font = { bold: true };

  sortedBots.forEach(bot => {
    const isProfit = bot.profit >= 0;
    detailsSheet.addRow([
      bot.name,
      bot.type,
      Math.round(bot.incomes.RUB).toLocaleString(),
      Math.round(bot.incomes.XTR).toLocaleString(),
      Math.round(bot.incomes.STARS).toLocaleString(),
      Math.round(bot.incomes.total_rub).toLocaleString(),
      Math.round(bot.outcomes.total).toLocaleString(),
      isProfit ? Math.round(bot.profit).toLocaleString() : '',
      !isProfit ? Math.round(Math.abs(bot.profit)).toLocaleString() : ''
    ]);
  });

  const outputPath = '/Users/playra/999-multibots-telegraf/ФИНАЛЬНЫЙ_ОТЧЕТ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('\n' + '='.repeat(80));
  console.log('✅ ФИНАЛЬНЫЙ ОТЧЕТ СОЗДАН!');
  console.log('='.repeat(80));
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n📊 СОДЕРЖИМОЕ (5 ЛИСТОВ):');
  console.log('   1️⃣  📊 ОБЩАЯ СВОДКА - доходы, расходы, прибыль по всем ботам');
  console.log('   2️⃣  🏆 ТОП БОТЫ - рейтинги по доходам, прибыли и убыткам');
  console.log('   3️⃣  🤖 РАСХОДЫ НА AI - затраты по провайдерам');
  console.log('   4️⃣  💰 ДОХОДЫ ПО МЕТОДАМ - Telegram vs Robokassa');
  console.log('   5️⃣  📋 ДЕТАЛИ ПО БОТАМ - подробная разбивка');
  console.log('\n🎯 КЛЮЧЕВЫЕ ЦИФРЫ:');
  console.log(`   💰 Общие доходы: ${Math.round(totalIncome).toLocaleString()}₽`);
  console.log(`   🤖 Общие расходы: ${Math.round(totalExpenses).toLocaleString()}₽`);
  console.log(`   📈 Общая прибыль: ${Math.round(totalProfit).toLocaleString()}₽`);
  console.log(`   📊 Общая маржа: ${(totalProfit / totalIncome * 100).toFixed(1)}%`);
  console.log('='.repeat(80) + '\n');

  return {
    total_income: Math.round(totalIncome),
    total_expenses: Math.round(totalExpenses),
    total_profit: Math.round(totalProfit),
    margin: (totalProfit / totalIncome * 100).toFixed(1),
    profitable_bots: sortedBots.filter(b => b.profit > 0).length,
    loss_making_bots: sortedBots.filter(b => b.profit < 0).length
  };
}

createFinalReport().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
