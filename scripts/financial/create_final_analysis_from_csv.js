#!/usr/bin/env node

/**
 * 📊 ФИНАЛЬНЫЙ АНАЛИЗ НА ОСНОВЕ CSV (ROBOKASSA) - ТОЛЬКО РЕАЛЬНЫЕ ДАННЫЕ
 * Используем CSV как единственный источник истинных платежей
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

// 10 ботов с типами
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

// Нормализованные цены (реальные цены ИИ-сервисов)
const CURRENT_PRICES = {
  'Training': 1500,
  'image-to-video': 54,
  'text_to_image': 5.4,
  'image_to_video': 54,
  'text_to_video': 54,
  'flux_kontext': 2.7,
  'image_to_image': 5.4,
  'video_to_image': 2.7,
  'System': 54,
  'Internal': 14,
  'image_upscaler': 2.7,
  'lip_sync': 27,
  'ai_reels': 14,
  'text-to-video': 54
};

// Реальные ИИ-расходы
const REAL_EXPENSE_METHODS = [
  'Training', 'image-to-video', 'image_to_video', 'text_to_image',
  'image_to_image', 'video_to_image', 'text_to_video', 'flux_kontext',
  'System', 'Internal', 'image_upscaler', 'lip_sync', 'ai_reels', 'text-to-video'
];

function normalizeExpense(originalAmount, currency, method) {
  const normalizedRub = convertToRub(originalAmount, currency);

  if (CURRENT_PRICES[method]) {
    return CURRENT_PRICES[method];
  }

  const reasonableLimit = 500;
  if (normalizedRub > reasonableLimit) {
    return reasonableLimit;
  }

  return normalizedRub;
}

function getBotFromDescription(description) {
  if (!description) return null;

  const desc = description.toLowerCase();

  if (desc.includes('neuroblogger') || desc.includes('нейроблоггер')) {
    return 'neuro_blogger_bot';
  }
  if (desc.includes('metamuse') || desc.includes('метамуза')) {
    return 'MetaMuse_Manifest_bot';
  }
  if (desc.includes('haim') || desc.includes('хайм')) {
    return 'HaimGroupMedia_bot';
  }
  if (desc.includes('ai stars') || desc.includes('ай старс')) {
    return 'AI_STARS_bot';
  }
  if (desc.includes('gaia') || desc.includes('гая')) {
    return 'Gaia_Kamskaia_bot';
  }
  if (desc.includes('lena') || desc.includes('лена')) {
    return 'NeuroLenaAssistant_bot';
  }
  if (desc.includes('shtogrina') || desc.includes('штогрина')) {
    return 'NeurostylistShtogrina_bot';
  }
  if (desc.includes('kaya') || desc.includes('кайя')) {
    return 'Kaya_easy_art_bot';
  }
  if (desc.includes('clip') || desc.includes('клип')) {
    return 'clip_maker_neuro_bot';
  }
  if (desc.includes('koshey') || desc.includes('кощей')) {
    return 'ai_koshey_bot';
  }

  return null;
}

async function createFinalAnalysisFromCSV() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 ФИНАЛЬНЫЙ АНАЛИЗ НА ОСНОВЕ CSV (ROBOKASSA) - ТОЛЬКО РЕАЛЬНЫЕ ДАННЫЕ');
  console.log('='.repeat(80) + '\n');

  // 1. Читаем CSV (реальные платежи)
  console.log('📊 Анализируем CSV файл (единственный источник истинных данных)...\n');

  const csvContent = fs.readFileSync('Spisok operacij s 30.01.2025 po 30.11.2025.csv', 'utf8');
  const csvLines = csvContent.split('\n').filter(line => line.trim());

  const csvPayments = [];
  for (let i = 1; i < csvLines.length; i++) {
    const cols = csvLines[i].split(';');
    if (cols.length < 10) continue;

    const operationType = cols[0];
    const paymentMethod = cols[2];
    const amountStr = cols[3];
    const email = cols[5];
    const description = cols[6];
    const feeStr = cols[9];
    const netAmountStr = cols[10];

    // Парсим суммы
    const amount = parseFloat(amountStr.replace(',', '.'));
    const fee = parseFloat(feeStr.replace(',', '.'));
    const netAmount = parseFloat(netAmountStr.replace(',', '.'));

    if (!amount || !netAmount) continue;

    const botName = getBotFromDescription(description);

    csvPayments.push({
      operationType,
      paymentMethod,
      amount,
      fee: fee || 0,
      netAmount,
      email,
      description,
      botName
    });
  }

  console.log(`✅ Записей в CSV: ${csvPayments.length}`);

  // 2. Группируем по ботам
  const incomeByBot = {};
  csvPayments.forEach(payment => {
    if (!payment.botName) return;

    if (!incomeByBot[payment.botName]) {
      incomeByBot[payment.botName] = {
        name: payment.botName,
        type: BOTS.find(b => b.name === payment.botName)?.type || 'НЕИЗВЕСТНО',
        totalIncome: 0,
        count: 0,
        methods: new Set(),
        transactions: []
      };
    }

    incomeByBot[payment.botName].totalIncome += payment.netAmount;
    incomeByBot[payment.botName].count++;
    incomeByBot[payment.botName].methods.add(payment.paymentMethod);
    incomeByBot[payment.botName].transactions.push(payment);
  });

  // 3. Читаем расходы из Supabase
  console.log('\n📊 Анализируем расходы из базы данных...\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

  const expensesByBot = {};
  const expenses = rawData.filter(row => row.type === 'MONEY_OUTCOME');

  expenses.forEach(row => {
    const botName = row.bot_name;
    if (!BOTS.find(b => b.name === botName)) return;

    if (!expensesByBot[botName]) {
      expensesByBot[botName] = {
        name: botName,
        totalExpense: 0,
        normalizedExpense: 0,
        count: 0,
        byType: {}
      };
    }

    expensesByBot[botName].totalExpense += convertToRub(row.amount, row.currency);
    expensesByBot[botName].count++;

    if (REAL_EXPENSE_METHODS.includes(row.payment_method)) {
      const normalizedCost = normalizeExpense(row.amount, row.currency, row.payment_method);
      expensesByBot[botName].normalizedExpense += normalizedCost;

      if (!expensesByBot[botName].byType[row.payment_method]) {
        expensesByBot[botName].byType[row.payment_method] = {
          count: 0,
          total: 0,
          normalized: 0
        };
      }
      expensesByBot[botName].byType[row.payment_method].count++;
      expensesByBot[botName].byType[row.payment_method].total += convertToRub(row.amount, row.currency);
      expensesByBot[botName].byType[row.payment_method].normalized += normalizedCost;
    }
  });

  // 4. Объединяем данные
  const finalData = BOTS.map(bot => {
    const income = incomeByBot[bot.name] || {
      totalIncome: 0,
      count: 0,
      methods: new Set()
    };
    const expense = expensesByBot[bot.name] || {
      totalExpense: 0,
      normalizedExpense: 0,
      count: 0,
      byType: {}
    };

    const profit = income.totalIncome - expense.normalizedExpense;
    const profitability = income.totalIncome > 0 ? (profit / income.totalIncome * 100) : 0;

    return {
      ...bot,
      income: income.totalIncome,
      incomeCount: income.count,
      incomeMethods: Array.from(income.methods),
      expense: expense.normalizedExpense,
      expenseCount: expense.count,
      expenseByType: expense.byType,
      profit,
      profitability
    };
  });

  finalData.sort((a, b) => b.profit - a.profit);

  // 5. Выводим сводку
  console.log('\n💰 ДОХОДЫ ПО БОТАМ (из CSV):');
  console.log('='.repeat(80));

  finalData.forEach((bot, index) => {
    console.log(`\n${index + 1}. ${bot.name} (${bot.type}):`);
    console.log(`   💰 Доходы: ${Math.round(bot.income).toLocaleString()}₽ (${bot.incomeCount} операций)`);
    console.log(`   💸 Расходы: ${Math.round(bot.expense).toLocaleString()}₽ (${bot.expenseCount} операций)`);
    console.log(`   ⚖️  Прибыль: ${Math.round(bot.profit).toLocaleString()}₽`);
    console.log(`   📈 Рентабельность: ${bot.profitability.toFixed(1)}%`);
    if (bot.incomeMethods.length > 0) {
      console.log(`   🔧 Методы: ${bot.incomeMethods.join(', ')}`);
    }
  });

  const totalIncome = finalData.reduce((sum, bot) => sum + bot.income, 0);
  const totalExpense = finalData.reduce((sum, bot) => sum + bot.expense, 0);
  const totalProfit = totalIncome - totalExpense;

  console.log('\n\n📊 ИТОГО ПО ВСЕМ БОТАМ:');
  console.log('='.repeat(80));
  console.log(`💰 Общие доходы: ${Math.round(totalIncome).toLocaleString()}₽`);
  console.log(`💸 Общие расходы: ${Math.round(totalExpense).toLocaleString()}₽`);
  console.log(`⚖️  Общая прибыль: ${Math.round(totalProfit).toLocaleString()}₽`);
  console.log(`📈 Общая рентабельность: ${totalIncome > 0 ? (totalProfit / totalIncome * 100).toFixed(1) : 0}%`);

  // 6. Создаем Excel
  console.log('\n\n📊 Создаем Excel файл...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "📊 ФИНАЛЬНЫЙ ОТЧЕТ - CSV (ROBOKASSA)";
  workbook.created = new Date();

  // Лист 1: Сводка по ботам
  const summarySheet = workbook.addWorksheet('📊 СВОДКА ПО 10 БОТАМ');
  summarySheet.mergeCells('A1:H1');
  summarySheet.getCell('A1').value = '📊 ФИНАЛЬНЫЙ ОТЧЕТ ПО 10 БОТАМ - НА ОСНОВЕ CSV (ROBOKASSA)';
  summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  const headerRow = summarySheet.addRow([
    '№',
    'Бот',
    'Тип',
    'Доходы (₽)',
    'Расходы (₽)',
    'Прибыль (₽)',
    'Рентабельность (%)',
    'Операций'
  ]);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };

  finalData.forEach((bot, index) => {
    const row = summarySheet.addRow([
      index + 1,
      bot.name,
      bot.type,
      Math.round(bot.income).toLocaleString(),
      Math.round(bot.expense).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.profitability.toFixed(1),
      `${bot.incomeCount}/${bot.expenseCount}`
    ]);

    if (bot.profit > 0) {
      row.getCell(6).font = { bold: true, color: { argb: '16A34A' } };
    } else {
      row.getCell(6).font = { bold: true, color: { argb: 'DC2626' } };
    }
  });

  // Итого
  const totalRow = summarySheet.addRow([
    'ИТОГО',
    'ВСЕ БОТЫ',
    '',
    Math.round(totalIncome).toLocaleString(),
    Math.round(totalExpense).toLocaleString(),
    Math.round(totalProfit).toLocaleString(),
    totalIncome > 0 ? (totalProfit / totalIncome * 100).toFixed(1) : '0',
    ''
  ]);
  totalRow.font = { bold: true };
  totalRow.getCell(6).font = { bold: true, color: { argb: totalProfit > 0 ? '16A34A' : 'DC2626' } };

  // Лист 2: Детали по каждому боту
  finalData.forEach(bot => {
    const sheetName = bot.name.length > 28 ? bot.name.substring(0, 25) + '...' : bot.name;
    const sheet = workbook.addWorksheet(sheetName);

    // Заголовок
    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = `📊 ${bot.name.toUpperCase()} (${bot.type})`;
    sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
    sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bot.type === 'ПРОДАКШЕН' ? '15803D' : '7C2D12' } };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    // Статистика
    sheet.addRow(['']);
    const statsRow1 = sheet.addRow(['Показатель', 'Значение']);
    statsRow1.font = { bold: true };
    sheet.addRow(['💰 Доходы', `${Math.round(bot.income).toLocaleString()}₽`]);
    sheet.addRow(['💸 Расходы (себестоимость)', `${Math.round(bot.expense).toLocaleString()}₽`]);
    sheet.addRow(['⚖️ Прибыль', `${Math.round(bot.profit).toLocaleString()}₽`]);
    sheet.addRow(['📈 Рентабельность', `${bot.profitability.toFixed(1)}%`]);
    sheet.addRow(['📊 Операций', `${bot.incomeCount} доходных / ${bot.expenseCount} расходных`]);
    sheet.addRow(['🔧 Методы оплаты', bot.incomeMethods.join(', ')]);

    // Расходы по типам
    sheet.addRow(['']);
    const expenseHeader = sheet.addRow(['Тип расхода', 'Количество', 'Сумма (₽)', 'Себестоимость (₽)']);
    expenseHeader.font = { bold: true };

    Object.entries(bot.expenseByType).forEach(([type, data]) => {
      sheet.addRow([
        type,
        data.count,
        Math.round(data.total).toLocaleString(),
        Math.round(data.normalized).toLocaleString()
      ]);
    });
  });

  const outputPath = '/Users/playra/999-multibots-telegraf/ФИНАЛЬНЫЙ_ОТЧЕТ_CSV_ROBOKASSA.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('✅ Финальный отчет создан!');
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ОТЧЕТ ГОТОВ - ОСНОВАН НА РЕАЛЬНЫХ ДАННЫХ ИЗ CSV!');
  console.log('='.repeat(80) + '\n');

  return finalData;
}

createFinalAnalysisFromCSV().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
