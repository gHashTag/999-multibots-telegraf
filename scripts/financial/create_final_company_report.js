#!/usr/bin/env node

/**
 * 📊 ФИНАЛЬНЫЙ ОТЧЕТ КОМПАНИИ - CSV КАК ОБЩАЯ ВЫРУЧКА
 * Корректное решение: CSV = выручка всей компании, расходы = по ботам
 */

const fs = require('fs');
const ExcelJS = require('exceljs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

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

function getMethodGroup(paymentMethod) {
  if (!paymentMethod) return 'ДРУГИЕ';

  const method = paymentMethod.toLowerCase();

  if (method.includes('rur') && method.includes('банк')) {
    return 'RUR Банковская карта';
  }
  if (method.includes('tinkoff')) {
    return 'TinkoffPay';
  }
  if (method.includes('sber')) {
    return 'SberPay';
  }
  if (method.includes('sbp')) {
    return 'SBP';
  }
  if (method.includes('yoo') || method.includes('yandex')) {
    return 'YooMoney';
  }

  return paymentMethod;
}

async function createFinalCompanyReport() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 ФИНАЛЬНЫЙ ОТЧЕТ КОМПАНИИ - CSV КАК ОБЩАЯ ВЫРУЧКА');
  console.log('='.repeat(80) + '\n');

  // 1. Читаем CSV для получения общей выручки
  console.log('📊 Анализируем CSV для общей выручки...\n');

  const csvContent = fs.readFileSync('Spisok operacij s 30.01.2025 po 30.11.2025.csv', 'utf8');
  const csvLines = csvContent.split('\n').filter(line => line.trim());

  const csvPayments = [];
  for (let i = 1; i < csvLines.length; i++) {
    const cols = csvLines[i].split(';');
    if (cols.length < 10) continue;

    const paymentMethod = cols[2];
    const amountStr = cols[3];
    const description = cols[6];
    const netAmountStr = cols[10];

    const amount = parseFloat(amountStr.replace(',', '.'));
    const netAmount = parseFloat(netAmountStr.replace(',', '.'));

    if (!amount || !netAmount) continue;

    csvPayments.push({
      paymentMethod,
      amount,
      netAmount,
      description
    });
  }

  // Группируем выручку по методам оплаты
  const incomeByMethod = {};
  csvPayments.forEach(payment => {
    const method = getMethodGroup(payment.paymentMethod);
    if (!incomeByMethod[method]) {
      incomeByMethod[method] = {
        count: 0,
        totalAmount: 0,
        totalNetAmount: 0
      };
    }
    incomeByMethod[method].count++;
    incomeByMethod[method].totalAmount += payment.amount;
    incomeByMethod[method].totalNetAmount += payment.netAmount;
  });

  const totalRevenue = Object.values(incomeByMethod).reduce((sum, method) => sum + method.totalNetAmount, 0);

  console.log(`✅ Всего транзакций в CSV: ${csvPayments.length}`);
  console.log(`💰 Общая выручка (нетто): ${Math.round(totalRevenue).toLocaleString()}₽\n`);

  console.log('📊 Выручка по методам оплаты:');
  Object.entries(incomeByMethod)
    .sort((a, b) => b[1].totalNetAmount - a[1].totalNetAmount)
    .forEach(([method, data]) => {
      console.log(`   ${method}: ${Math.round(data.totalNetAmount).toLocaleString()}₽ (${data.count} операций)`);
    });

  // 2. Читаем расходы по ботам
  console.log('\n\n📊 Анализируем расходы по ботам...\n');

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

  // 3. Создаем финальные данные
  const finalData = BOTS.map(bot => {
    const expense = expensesByBot[bot.name] || {
      totalExpense: 0,
      normalizedExpense: 0,
      count: 0,
      byType: {}
    };

    return {
      ...bot,
      expense: expense.normalizedExpense,
      expenseCount: expense.count,
      expenseByType: expense.byType,
      totalExpenseOriginal: expense.totalExpense
    };
  });

  const totalExpenses = finalData.reduce((sum, bot) => sum + bot.expense, 0);

  // Распределяем доходы пропорционально расходам
  finalData.forEach(bot => {
    if (bot.expense > 0 && totalExpenses > 0) {
      const share = bot.expense / totalExpenses;
      bot.allocatedIncome = totalRevenue * share;
    } else {
      bot.allocatedIncome = 0;
    }

    bot.profit = bot.allocatedIncome - bot.expense;
    bot.profitability = bot.allocatedIncome > 0 ? (bot.profit / bot.allocatedIncome * 100) : 0;
  });

  finalData.sort((a, b) => b.profit - a.profit);

  // 4. Выводим результаты
  console.log('\n💰 ФИНАЛЬНЫЕ РЕЗУЛЬТАТЫ:');
  console.log('='.repeat(80));

  finalData.forEach((bot, index) => {
    const status = bot.profit > 0 ? '✅' : '⚠️';
    console.log(`\n${index + 1}. ${status} ${bot.name} (${bot.type}):`);
    console.log(`   💰 Выручка (распределенная): ${Math.round(bot.allocatedIncome).toLocaleString()}₽`);
    console.log(`   💸 Расходы: ${Math.round(bot.expense).toLocaleString()}₽`);
    console.log(`   ⚖️  Прибыль: ${Math.round(bot.profit).toLocaleString()}₽`);
    console.log(`   📈 Рентабельность: ${bot.profitability.toFixed(1)}%`);
    console.log(`   📊 Операций: ${bot.expenseCount}`);
  });

  const totalAllocatedIncome = finalData.reduce((sum, bot) => sum + bot.allocatedIncome, 0);
  const totalProfit = totalRevenue - totalExpenses;

  console.log('\n\n📊 ИТОГО КОМПАНИИ:');
  console.log('='.repeat(80));
  console.log(`💰 Выручка (из CSV): ${Math.round(totalRevenue).toLocaleString()}₽`);
  console.log(`💸 Расходы: ${Math.round(totalExpenses).toLocaleString()}₽`);
  console.log(`⚖️  Прибыль: ${Math.round(totalProfit).toLocaleString()}₽`);
  console.log(`📈 Рентабельность: ${totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(1) : 0}%`);

  // 5. Создаем Excel
  console.log('\n\n📊 Создаем Excel отчет...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "📊 ФИНАЛЬНЫЙ ОТЧЕТ КОМПАНИИ";
  workbook.created = new Date();

  // Лист 1: Сводка по ботам
  const summarySheet = workbook.addWorksheet('📊 СВОДКА ПО БОТАМ');
  summarySheet.mergeCells('A1:I1');
  summarySheet.getCell('A1').value = '📊 ФИНАЛЬНЫЙ ОТЧЕТ - РАСПРЕДЕЛЕНИЕ ДОХОДОВ ПО БОТАМ';
  summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  const headerRow = summarySheet.addRow([
    '№', 'Бот', 'Тип', 'Выручка (₽)', 'Расходы (₽)', 'Прибыль (₽)', 'Рентаб. (%)', 'Операций', 'Доля доходов (%)'
  ]);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };

  finalData.forEach((bot, index) => {
    const sharePercent = bot.allocatedIncome / totalRevenue * 100;

    const row = summarySheet.addRow([
      index + 1,
      bot.name,
      bot.type,
      Math.round(bot.allocatedIncome).toLocaleString(),
      Math.round(bot.expense).toLocaleString(),
      Math.round(bot.profit).toLocaleString(),
      bot.profitability.toFixed(1),
      bot.expenseCount,
      sharePercent.toFixed(1)
    ]);

    if (bot.profit > 0) {
      row.getCell(6).font = { bold: true, color: { argb: '16A34A' } };
    } else if (bot.profit < 0) {
      row.getCell(6).font = { bold: true, color: { argb: 'DC2626' } };
    }
  });

  const totalRow = summarySheet.addRow([
    'ИТОГО', 'ВСЕ БОТЫ', '',
    Math.round(totalRevenue).toLocaleString(),
    Math.round(totalExpenses).toLocaleString(),
    Math.round(totalProfit).toLocaleString(),
    totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(1) : '0',
    '',
    '100.0'
  ]);
  totalRow.font = { bold: true };
  totalRow.getCell(6).font = { bold: true, color: { argb: totalProfit > 0 ? '16A34A' : 'DC2626' } };

  // Лист 2: Выручка по методам
  const revenueSheet = workbook.addWorksheet('💰 ВЫРУЧКА ПО МЕТОДАМ');
  revenueSheet.addRow(['Метод оплаты', 'Количество', 'Сумма брутто (₽)', 'Сумма нетто (₽)', 'Доля (%)']);
  revenueSheet.getRow(1).font = { bold: true };

  Object.entries(incomeByMethod)
    .sort((a, b) => b[1].totalNetAmount - a[1].totalNetAmount)
    .forEach(([method, data]) => {
      const share = data.totalNetAmount / totalRevenue * 100;
      revenueSheet.addRow([
        method,
        data.count,
        Math.round(data.totalAmount).toLocaleString(),
        Math.round(data.totalNetAmount).toLocaleString(),
        share.toFixed(1)
      ]);
    });

  // Лист 3: Детали по расходам каждого бота
  BOTS.forEach(bot => {
    const botData = finalData.find(b => b.name === bot.name);
    if (!botData || Object.keys(botData.expenseByType).length === 0) return;

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
    sheet.addRow(['💰 Выручка (распределенная)', `${Math.round(botData.allocatedIncome).toLocaleString()}₽`]);
    sheet.addRow(['💸 Расходы (себестоимость)', `${Math.round(botData.expense).toLocaleString()}₽`]);
    sheet.addRow(['⚖️ Прибыль', `${Math.round(botData.profit).toLocaleString()}₽`]);
    sheet.addRow(['📈 Рентабельность', `${botData.profitability.toFixed(1)}%`]);
    sheet.addRow(['📊 Операций', `${botData.expenseCount}`]);

    // Расходы по типам
    sheet.addRow(['']);
    const expenseHeader = sheet.addRow(['Тип расхода', 'Количество', 'Сумма оригинал (₽)', 'Себестоимость (₽)']);
    expenseHeader.font = { bold: true };

    Object.entries(botData.expenseByType)
      .sort((a, b) => b[1].normalized - a[1].normalized)
      .forEach(([type, data]) => {
        sheet.addRow([
          type,
          data.count,
          Math.round(data.total).toLocaleString(),
          Math.round(data.normalized).toLocaleString()
        ]);
      });
  });

  const outputPath = '/Users/playra/999-multibots-telegraf/ФИНАЛЬНЫЙ_ОТЧЕТ_КОМПАНИИ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('✅ Отчет создан!');
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ФИНАЛЬНЫЙ ОТЧЕТ КОМПАНИИ ГОТОВ!');
  console.log('='.repeat(80) + '\n');

  return finalData;
}

createFinalCompanyReport().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
