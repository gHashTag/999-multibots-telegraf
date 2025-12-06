#!/usr/bin/env node

/**
 * 🔍 ДЕТАЛИЗАЦИЯ РАСХОДОВ - Анализ куда ушли 504,243₽
 */

const ExcelJS = require('exceljs');
const fs = require('fs');

// Конвертация валют
const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

async function analyzeExpenses() {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 ДЕТАЛИЗАЦИЯ РАСХОДОВ - КУДА УШЛИ 504,243₽');
  console.log('='.repeat(70) + '\n');

  // Загружаем данные
  console.log('📥 Загрузка данных...');
  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));
  console.log(`✅ Загружено ${rawData.length} записей\n`);

  // Классификация расходов (берем логику из create_corrected_excel.js)
  const realExpenseMethods = [
    'Training', 'image-to-video', 'image_to_video', 'text_to_image',
    'image_to_image', 'video_to_image', 'text_to_video', 'flux_kontext',
    'video-generation-refund', 'image-to-video-refund'
  ];

  const workingTestBots = ['ai_koshey_bot', 'clip_maker_neuro_bot'];
  const testBots = [
    'admin_system', 'admin_grant', 'admin_script',
    'diagnostic_test', 'test_bot', 'admin_cli', 'admin_fix', 'admin_unlimited',
    'system_recovery', 'system_grant', 'mcp-server'
  ];

  const fakeMethods = [
    'balance', 'Manual', 'Tester_Bonus', 'System_Operation', 'Admin',
    'bank_card', 'unknown_mode', 'public_test', 'webhook-test-bot'
  ];

  // Фильтруем только РАСХОДЫ
  const allExpenses = rawData.filter(row => {
    // Только MONEY_OUTCOME
    if (row.type !== 'MONEY_OUTCOME') return false;

    const botName = row.bot_name;
    const paymentMethod = row.payment_method;

    // Исключаем фейковые методы
    if (fakeMethods.includes(paymentMethod)) return false;

    // Исключаем фейковые боты
    if (testBots.includes(botName)) return false;

    // ai_koshey_bot - включаем только ИИ-расходы
    if (workingTestBots.includes(botName)) {
      return realExpenseMethods.includes(paymentMethod);
    }

    // Все остальные - включаем ИИ-расходы
    return realExpenseMethods.includes(paymentMethod);
  });

  console.log(`✅ Найдено реальных расходов: ${allExpenses.length}\n`);

  // Анализируем по типам расходов
  const expenseByType = {};
  const expenseByBot = {};
  const expenseByMonth = {};

  for (const expense of allExpenses) {
    const rubAmount = convertToRub(expense.amount, expense.currency);
    const method = expense.payment_method;
    const bot = expense.bot_name;
    const date = expense.created_at ? new Date(expense.created_at) : null;
    const month = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : 'unknown';

    // По типам
    if (!expenseByType[method]) {
      expenseByType[method] = { amount: 0, count: 0, bots: new Set() };
    }
    expenseByType[method].amount += rubAmount;
    expenseByType[method].count++;
    expenseByType[method].bots.add(bot);

    // По ботам
    if (!expenseByBot[bot]) {
      expenseByBot[bot] = { amount: 0, count: 0, methods: new Set() };
    }
    expenseByBot[bot].amount += rubAmount;
    expenseByBot[bot].count++;
    expenseByBot[bot].methods.add(method);

    // По месяцам
    if (!expenseByMonth[month]) {
      expenseByMonth[month] = { amount: 0, count: 0 };
    }
    expenseByMonth[month].amount += rubAmount;
    expenseByMonth[month].count++;
  }

  // 1. ТОП РАСХОДОВ ПО ТИПАМ
  console.log('💸 РАСХОДЫ ПО ТИПАМ (ИИ-СЕРВИСЫ):');
  console.log('='.repeat(70));

  const sortedTypes = Object.entries(expenseByType)
    .map(([type, data]) => ({ type, ...data }))
    .sort((a, b) => b.amount - a.amount);

  let totalExpense = 0;
  sortedTypes.forEach((item, index) => {
    totalExpense += item.amount;
    const percentage = ((item.amount / totalExpense) * 100).toFixed(1);
    console.log(`\n${index + 1}. ${item.type}:`);
    console.log(`   💰 Сумма: ${Math.round(item.amount).toLocaleString()}₽`);
    console.log(`   📊 Количество: ${item.count} операций`);
    console.log(`   🤖 Боты: ${item.bots.size} уникальных`);
    console.log(`   📋 Примеры ботов: ${Array.from(item.bots).slice(0, 3).join(', ')}`);
  });

  // 2. ТОП РАСХОДОВ ПО БОТАМ
  console.log('\n\n🤖 РАСХОДЫ ПО БОТАМ:');
  console.log('='.repeat(70));

  const sortedBots = Object.entries(expenseByBot)
    .map(([bot, data]) => ({ bot, ...data }))
    .sort((a, b) => b.amount - a.amount);

  sortedBots.forEach((item, index) => {
    console.log(`\n${index + 1}. ${item.bot}:`);
    console.log(`   💰 Сумма: ${Math.round(item.amount).toLocaleString()}₽`);
    console.log(`   📊 Количество: ${item.count} операций`);
    console.log(`   🔧 Типы расходов: ${item.methods.size} уникальных`);
    console.log(`   📋 Примеры: ${Array.from(item.methods).slice(0, 3).join(', ')}`);
  });

  // 3. РАСХОДЫ ПО МЕСЯЦАМ
  console.log('\n\n📅 РАСХОДЫ ПО МЕСЯЦАМ:');
  console.log('='.repeat(70));

  const sortedMonths = Object.entries(expenseByMonth)
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month));

  sortedMonths.forEach(item => {
    console.log(`${item.month}: ${Math.round(item.amount).toLocaleString()}₽ (${item.count} операций)`);
  });

  // 4. ИТОГОВАЯ СТАТИСТИКА
  console.log('\n\n📊 ИТОГОВАЯ СТАТИСТИКА:');
  console.log('='.repeat(70));

  const totalCount = sortedBots.reduce((sum, bot) => sum + bot.count, 0);
  const avgPerOperation = totalExpense / totalCount;

  console.log(`💰 Общая сумма расходов: ${Math.round(totalExpense).toLocaleString()}₽`);
  console.log(`📊 Количество операций: ${totalCount.toLocaleString()}`);
  console.log(`💳 Средняя операция: ${Math.round(avgPerOperation).toLocaleString()}₽`);
  console.log(`🤖 Активных ботов с расходами: ${sortedBots.length}`);
  console.log(`🔧 Типов ИИ-сервисов: ${sortedTypes.length}`);

  // 5. САМЫЕ ДОРОГИЕ ОПЕРАЦИИ
  console.log('\n\n💎 ТОП-10 САМЫХ ДОРОГИХ ОПЕРАЦИЙ:');
  console.log('='.repeat(70));

  const topExpenses = allExpenses
    .map(expense => ({
      ...expense,
      rubAmount: convertToRub(expense.amount, expense.currency)
    }))
    .sort((a, b) => b.rubAmount - a.rubAmount)
    .slice(0, 10);

  topExpenses.forEach((expense, index) => {
    console.log(`\n${index + 1}. ${Math.round(expense.rubAmount).toLocaleString()}₽`);
    console.log(`   🤖 Бот: ${expense.bot_name}`);
    console.log(`   🔧 Тип: ${expense.payment_method}`);
    console.log(`   💱 Валюта: ${expense.currency} (${Math.round(expense.rubAmount).toLocaleString()}₽)`);
    if (expense.description) {
      console.log(`   📝 Описание: ${expense.description.slice(0, 50)}...`);
    }
  });

  // 6. СОЗДАЕМ ДЕТАЛЬНЫЙ EXCEL
  console.log('\n\n📊 Создаем детальный Excel...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🔍 ДЕТАЛИЗАЦИЯ РАСХОДОВ";
  workbook.created = new Date();

  // Лист 1: По типам
  const typeSheet = workbook.addWorksheet('📊 ПО ТИПАМ');
  typeSheet.mergeCells('A1:F1');
  typeSheet.getCell('A1').value = '💸 РАСХОДЫ ПО ТИПАМ ИИ-СЕРВИСОВ';
  typeSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  typeSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C2D12' } };
  typeSheet.getCell('A1').alignment = { horizontal: 'center' };

  const typeHeader = typeSheet.addRow(['№', 'Тип расхода', 'Сумма (₽)', 'Операции', 'Ботов', 'Примеры ботов']);
  typeHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
  typeHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C2D12' } };

  sortedTypes.forEach((item, index) => {
    typeSheet.addRow([
      index + 1,
      item.type,
      Math.round(item.amount).toLocaleString(),
      item.count,
      item.bots.size,
      Array.from(item.bots).slice(0, 3).join(', ')
    ]);
  });

  // Лист 2: По ботам
  const botSheet = workbook.addWorksheet('🤖 ПО БОТАМ');
  botSheet.mergeCells('A1:F1');
  botSheet.getCell('A1').value = '🤖 РАСХОДЫ ПО БОТАМ';
  botSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  botSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  botSheet.getCell('A1').alignment = { horizontal: 'center' };

  const botHeader = botSheet.addRow(['№', 'Бот', 'Сумма (₽)', 'Операции', 'Типов расходов', 'Примеры типов']);
  botHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
  botHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };

  sortedBots.forEach((item, index) => {
    botSheet.addRow([
      index + 1,
      item.bot,
      Math.round(item.amount).toLocaleString(),
      item.count,
      item.methods.size,
      Array.from(item.methods).slice(0, 3).join(', ')
    ]);
  });

  // Лист 3: ТОП операции
  const topSheet = workbook.addWorksheet('💎 ТОП ОПЕРАЦИИ');
  topSheet.mergeCells('A1:E1');
  topSheet.getCell('A1').value = '💎 ТОП-50 САМЫХ ДОРОГИХ ОПЕРАЦИЙ';
  topSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  topSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } };
  topSheet.getCell('A1').alignment = { horizontal: 'center' };

  const topHeader = topSheet.addRow(['№', 'Сумма (₽)', 'Бот', 'Тип', 'Валюта', 'Дата']);
  topHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
  topHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } };

  const top50Expenses = allExpenses
    .map(expense => ({
      ...expense,
      rubAmount: convertToRub(expense.amount, expense.currency)
    }))
    .sort((a, b) => b.rubAmount - a.rubAmount)
    .slice(0, 50);

  top50Expenses.forEach((expense, index) => {
    topSheet.addRow([
      index + 1,
      Math.round(expense.rubAmount).toLocaleString(),
      expense.bot_name,
      expense.payment_method,
      expense.currency,
      expense.created_at ? new Date(expense.created_at).toLocaleDateString() : ''
    ]);
  });

  // Сохраняем
  const outputPath = '/Users/playra/999-multibots-telegraf/ДЕТАЛИЗАЦИЯ_РАСХОДОВ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('\n' + '='.repeat(70));
  console.log('✅ ДЕТАЛИЗАЦИЯ РАСХОДОВ СОЗДАНА!');
  console.log('='.repeat(70));
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n📊 СОДЕРЖИМОЕ (3 ЛИСТА):');
  console.log('1️⃣  📊 ПО ТИПАМ - детализация по ИИ-сервисам');
  console.log('2️⃣  🤖 ПО БОТАМ - расходы по каждому боту');
  console.log('3️⃣  💎 ТОП ОПЕРАЦИИ - самые дорогие транзакции');
  console.log('\n🎯 ВСЕГО РАСХОДОВ:', Math.round(totalExpense).toLocaleString(), '₽');
  console.log('='.repeat(70) + '\n');
}

analyzeExpenses().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
