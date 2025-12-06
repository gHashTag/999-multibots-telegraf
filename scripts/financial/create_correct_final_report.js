#!/usr/bin/env node

/**
 * 📊 ФИНАЛЬНЫЙ ОТЧЕТ - ПРАВИЛЬНОЕ СОПОСТАВЛЕНИЕ CSV И БОТОВ
 * Теперь с правильной логикой определения ботов по описанию услуг
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

// Нормализованные цены
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

// Правильное сопоставление ботов по описанию услуг (на русском)
function getBotFromDescription(description) {
  if (!description) return null;

  const desc = description.toLowerCase();

  // MetaMuse - подписки и пополнения
  if (desc.includes('подписка') || desc.includes('пополнение') || desc.includes('звезд')) {
    return 'MetaMuse_Manifest_bot';
  }

  // NeuroBlog - генерация контента
  if (desc.includes('нейрофото') || desc.includes('нейровидео') || desc.includes('генераци')) {
    return 'neuro_blogger_bot';
  }

  // AI Stars - покупка звезд
  if (desc.includes('покупка звезд') || desc.includes('stars')) {
    return 'AI_STARS_bot';
  }

  // HaimGroup - видео и медиа
  if (desc.includes('haim') || desc.includes('video') || desc.includes('медиа')) {
    return 'HaimGroupMedia_bot';
  }

  // Gaia - художественные работы
  if (desc.includes('gaia') || desc.includes('худож') || desc.includes('art')) {
    return 'Gaia_Kamskaia_bot';
  }

  // Lena - персональный ассистент
  if (desc.includes('lena') || desc.includes('ассистент') || desc.includes('assistant')) {
    return 'NeuroLenaAssistant_bot';
  }

  // Shtogrina - стилист
  if (desc.includes('shtogrina') || desc.includes('стилист') || desc.includes('stylist')) {
    return 'NeurostylistShtogrina_bot';
  }

  // Kaya - легкое творчество
  if (desc.includes('kая') || desc.includes('easy') || desc.includes('простое')) {
    return 'Kaya_easy_art_bot';
  }

  // Koshey - тестовый
  if (desc.includes('koshey') || desc.includes('кощей') || desc.includes('test')) {
    return 'ai_koshey_bot';
  }

  // Clip maker - создание клипов
  if (desc.includes('clip') || desc.includes('клип') || desc.includes('maker')) {
    return 'clip_maker_neuro_bot';
  }

  return null;
}

async function createCorrectFinalReport() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 ФИНАЛЬНЫЙ ОТЧЕТ - С ПРАВИЛЬНЫМ СОПОСТАВЛЕНИЕМ БОТОВ');
  console.log('='.repeat(80) + '\n');

  // 1. Читаем CSV
  console.log('📊 Анализируем CSV...\n');

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

  // Показываем примеры определения ботов
  console.log('\n📋 Примеры сопоставления ботов:');
  csvPayments.slice(0, 10).forEach((payment, index) => {
    console.log(`${index + 1}. "${payment.description.substring(0, 40)}..."`);
    console.log(`   → ${payment.botName || 'НЕ ОПРЕДЕЛЕН'} | ${payment.paymentMethod} | ${payment.netAmount}₽`);
  });

  // 2. Группируем доходы по ботам
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

  // 3. Читаем расходы
  console.log('\n📊 Анализируем расходы...\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));
  const expenses = rawData.filter(row => row.type === 'MONEY_OUTCOME');

  const expensesByBot = {};
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

  // 5. Выводим результаты
  console.log('\n\n💰 ФИНАЛЬНЫЕ РЕЗУЛЬТАТЫ:');
  console.log('='.repeat(80));

  finalData.forEach((bot, index) => {
    const status = bot.income > 0 ? '✅' : (bot.expense > 0 ? '⚠️' : '❓');
    console.log(`\n${index + 1}. ${status} ${bot.name} (${bot.type}):`);
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

  console.log('\n\n📊 ИТОГО:');
  console.log('='.repeat(80));
  console.log(`💰 Общие доходы (из CSV): ${Math.round(totalIncome).toLocaleString()}₽`);
  console.log(`💸 Общие расходы: ${Math.round(totalExpense).toLocaleString()}₽`);
  console.log(`⚖️  Общая прибыль: ${Math.round(totalProfit).toLocaleString()}₽`);
  console.log(`📈 Общая рентабельность: ${totalIncome > 0 ? (totalProfit / totalIncome * 100).toFixed(1) : 0}%`);

  // 6. Создаем Excel
  console.log('\n\n📊 Создаем Excel...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "📊 ФИНАЛЬНЫЙ ОТЧЕТ - CSV ROBOKASSA";
  workbook.created = new Date();

  // Лист 1: Сводка
  const summarySheet = workbook.addWorksheet('📊 СВОДКА');
  summarySheet.mergeCells('A1:H1');
  summarySheet.getCell('A1').value = '📊 ФИНАЛЬНЫЙ ОТЧЕТ ПО 10 БОТАМ (CSV ROBOKASSA)';
  summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  const headerRow = summarySheet.addRow([
    '№', 'Бот', 'Тип', 'Доходы (₽)', 'Расходы (₽)', 'Прибыль (₽)', 'Рентаб. (%)', 'Методы'
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
      bot.incomeMethods.join(', ')
    ]);

    if (bot.profit > 0) {
      row.getCell(6).font = { bold: true, color: { argb: '16A34A' } };
    } else if (bot.profit < 0) {
      row.getCell(6).font = { bold: true, color: { argb: 'DC2626' } };
    }
  });

  const totalRow = summarySheet.addRow([
    'ИТОГО', 'ВСЕ БОТЫ', '', Math.round(totalIncome).toLocaleString(),
    Math.round(totalExpense).toLocaleString(), Math.round(totalProfit).toLocaleString(),
    totalIncome > 0 ? (totalProfit / totalIncome * 100).toFixed(1) : '0', ''
  ]);
  totalRow.font = { bold: true };
  totalRow.getCell(6).font = { bold: true, color: { argb: totalProfit > 0 ? '16A34A' : 'DC2626' } };

  // Лист 2: Детальные транзакции CSV
  const csvDetailSheet = workbook.addWorksheet('📋 CSV ДЕТАЛИ');
  csvDetailSheet.addRow(['Бот', 'Метод оплаты', 'Сумма нетто (₽)', 'Описание']);
  csvDetailSheet.getRow(1).font = { bold: true };

  csvPayments.forEach(payment => {
    csvDetailSheet.addRow([
      payment.botName || 'НЕ ОПРЕДЕЛЕН',
      payment.paymentMethod,
      Math.round(payment.netAmount),
      payment.description
    ]);
  });

  const outputPath = '/Users/playra/999-multibots-telegraf/ФИНАЛЬНЫЙ_ОТЧЕТ_ПРАВИЛЬНЫЙ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('✅ Отчет создан!');
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ФИНАЛЬНЫЙ ОТЧЕТ ГОТОВ!');
  console.log('='.repeat(80) + '\n');

  return finalData;
}

createCorrectFinalReport().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
