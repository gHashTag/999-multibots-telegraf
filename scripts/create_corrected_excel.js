#!/usr/bin/env node

/**
 * 🎯 ИСПРАВЛЕННЫЙ АНАЛИЗ - С УЧЕТОМ РЕАЛЬНЫХ РАСХОДОВ
 * Training, image-to-video - это НЕ фейк, а реальные затраты на обучение!
 */

const ExcelJS = require('exceljs');
const fs = require('fs');

// Конвертация валют
const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

function classifyPayment(row) {
  const paymentMethod = row.payment_method;
  const botName = row.bot_name;
  const description = row.description || '';

  // РЕАЛЬНЫЕ МЕТОДЫ РАСХОДОВ (операционные затраты) - объявляем ПЕРВЫМИ!
  const realExpenseMethods = [
    'Training',           // Обучение моделей - РЕАЛЬНО!
    'image-to-video',     // Генерация видео - РЕАЛЬНО!
    'image_to_video',     // Тоже самое
    'text_to_image',      // Генерация изображений - РЕАЛЬНО!
    'image_to_image',     // Обработка изображений - РЕАЛЬНО!
    'video_to_image',     // Извлечение кадров - РЕАЛЬНО!
    'text_to_video',      // Генерация видео из текста - РЕАЛЬНО!
    'flux_kontext',       // Контекстная генерация - РЕАЛЬНО!
    'video-generation-refund',  // Возврат за генерацию - РЕАЛЬНО!
    'image-to-video-refund'     // Возврат за видео - РЕАЛЬНО!
  ];

  // РЕАЛЬНЫЕ МЕТОДЫ ДОХОДОВ (входящие платежи)
  const realIncomeMethods = [
    'Telegram', 'Robokassa', 'YooMoney', 'SBP', 'TinkoffPay', 'SberPay',
    'Банковская карта', 'RUR Банковская карта'
  ];

  // АБСОЛЮТНО ФЕЙКОВЫЕ БОТЫ (исключаем полностью)
  const testBots = [
    'admin_system', 'admin_grant', 'admin_script',
    'diagnostic_test', 'test_bot', 'admin_cli', 'admin_fix', 'admin_unlimited',
    'system_recovery', 'system_grant', 'mcp-server'
  ];

  // РАБОЧИЕ ТЕСТОВЫЕ БОТЫ (доходы исключаем, расходы включаем)
  // ai_koshey_bot - рабочий тестовый бот с реальными ИИ-расходами!
  const workingTestBots = [
    'ai_koshey_bot', 'clip_maker_neuro_bot'
  ];

  if (testBots.includes(botName)) {
    return { type: 'FAKE', reason: 'TEST_BOT', category: 'EXCLUDED' };
  }

  // РАБОЧИЕ ТЕСТОВЫЕ БОТЫ - особая обработка
  if (workingTestBots.includes(botName)) {
    // Если это доход - исключаем (тестовые данные)
    if (row.type === 'MONEY_INCOME') {
      return { type: 'FAKE', reason: 'TEST_BOT_INCOME', category: 'EXCLUDED' };
    }
    // Если это расход на ИИ-сервисы - включаем как реальные операционные затраты!
    if (realExpenseMethods.includes(paymentMethod)) {
      return { type: 'REAL_EXPENSE', reason: 'AI_SERVICE_COST', category: 'OPERATIONAL_EXPENSE' };
    }
    // Другие расходы тестовых ботов - исключаем
    return { type: 'FAKE', reason: 'TEST_BOT_OTHER_EXPENSE', category: 'EXCLUDED' };
  }

  // Фейковые описания
  if (description.startsWith('FAKE_DATA:') ||
      description.toLowerCase().includes('test_data') ||
      description.toLowerCase().includes('тестовые данные')) {
    return { type: 'FAKE', reason: 'TEST_DATA_DESC', category: 'EXCLUDED' };
  }

  // ЯВНО ФЕЙКОВЫЕ МЕТОДЫ (безусловно)
  const fakeMethods = [
    'balance', 'Manual', 'Tester_Bonus', 'System_Operation', 'Admin',
    'bank_card', 'unknown_mode', 'public_test', 'webhook-test-bot'
  ];

  if (fakeMethods.includes(paymentMethod)) {
    return { type: 'FAKE', reason: 'FAKE_METHOD', category: 'EXCLUDED' };
  }

  // Классифицируем
  if (realIncomeMethods.some(m => paymentMethod.includes(m))) {
    return { type: 'REAL_INCOME', reason: 'REAL_PAYMENT', category: 'VALID_INCOME' };
  }

  if (realExpenseMethods.includes(paymentMethod)) {
    return { type: 'REAL_EXPENSE', reason: 'OPERATIONAL_COST', category: 'VALID_EXPENSE' };
  }

  // Безопасная классификация для неопределенных
  if (paymentMethod === 'SYSTEM' || paymentMethod === 'Internal') {
    return { type: 'FAKE', reason: 'SYSTEM_METHOD', category: 'EXCLUDED' };
  }

  // По умолчанию - реальные (для безопасности)
  if (row.type === 'MONEY_INCOME') {
    return { type: 'REAL_INCOME', reason: 'DEFAULT_INCOME', category: 'ASSUMED_INCOME' };
  } else if (row.type === 'MONEY_OUTCOME') {
    return { type: 'REAL_EXPENSE', reason: 'DEFAULT_EXPENSE', category: 'ASSUMED_EXPENSE' };
  }

  return { type: 'FAKE', reason: 'UNKNOWN', category: 'EXCLUDED' };
}

async function createCorrectedExcel() {
  console.log('\n' + '='.repeat(70));
  console.log('🎯 ИСПРАВЛЕННЫЙ АНАЛИЗ - С УЧЕТОМ РЕАЛЬНЫХ РАСХОДОВ');
  console.log('='.repeat(70) + '\n');

  // Загружаем данные
  console.log('📥 Загрузка данных...');
  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));
  console.log(`✅ Загружено ${rawData.length} записей\n`);

  // Классифицируем
  console.log('🔍 Классификация транзакций...');
  const classified = rawData.map(row => {
    const classification = classifyPayment(row);
    return { ...row, classification };
  });

  // Фильтруем
  const realData = classified.filter(row =>
    row.classification.type === 'REAL_INCOME' ||
    row.classification.type === 'REAL_EXPENSE'
  );

  const fakeData = classified.filter(row => row.classification.type === 'FAKE');

  console.log(`✅ Реальных записей: ${realData.length} (${(realData.length / rawData.length * 100).toFixed(1)}%)`);
  console.log(`🚫 Фейковых записей: ${fakeData.length} (${(fakeData.length / rawData.length * 100).toFixed(1)}%)\n`);

  // Группируем по ботам
  const botStats = {};
  for (const row of realData) {
    const bot = row.bot_name;
    if (!botStats[bot]) {
      botStats[bot] = {
        name: bot,
        income: 0,
        expense: 0,
        incomeCount: 0,
        expenseCount: 0,
        methods: new Set()
      };
    }

    const stats = botStats[bot];
    stats.methods.add(row.payment_method);

    const rubAmount = convertToRub(row.amount, row.currency);
    if (row.classification.type === 'REAL_INCOME') {
      stats.income += rubAmount;
      stats.incomeCount++;
    } else if (row.classification.type === 'REAL_EXPENSE') {
      stats.expense += rubAmount;
      stats.expenseCount++;
    }
  }

  // Сортируем по прибыли
  const sortedBots = Object.values(botStats)
    .map(bot => ({ ...bot, profit: bot.income - bot.expense }))
    .sort((a, b) => b.profit - a.profit);

  console.log(`📊 ТОП-15 БОТОВ (С РАСХОДАМИ):`);
  sortedBots.slice(0, 15).forEach(bot => {
    const methods = Array.from(bot.methods).slice(0, 5).join(', ');
    console.log(`\n   ${bot.name}:`);
    console.log(`      💰 Доходы: ${Math.round(bot.income).toLocaleString()}₽ (${bot.incomeCount})`);
    console.log(`      💸 Расходы: ${Math.round(bot.expense).toLocaleString()}₽ (${bot.expenseCount})`);
    console.log(`      ⚖️  Профит: ${Math.round(bot.profit).toLocaleString()}₽`);
    console.log(`      🔧 Методы: ${methods}`);
  });

  // Создаем Excel
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🎯 ИСПРАВЛЕННЫЙ АНАЛИЗ - С РАСХОДАМИ";
  workbook.created = new Date();

  // ЛИСТ 1: ДАШБОРД
  const dashboardSheet = workbook.addWorksheet('📊 ДАШБОРД', {
    views: [{ state: 'frozen', ySplit: 3 }]
  });

  dashboardSheet.mergeCells('A1:K1');
  dashboardSheet.getCell('A1').value = '🎯 ДАШБОРД - С УЧЕТОМ РЕАЛЬНЫХ РАСХОДОВ (Training, image-to-video)';
  dashboardSheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFF' } };
  dashboardSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  dashboardSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  dashboardSheet.getCell('A1').height = 35;

  dashboardSheet.mergeCells('A2:K2');
  dashboardSheet.getCell('A2').value = `✅ Реальных: ${realData.length} | 🚫 Фейковых: ${fakeData.length} | Учтены расходы на обучение моделей`;
  dashboardSheet.getCell('A2').font = { size: 12, bold: true, color: { argb: 'FFFFFF' } };
  dashboardSheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '166534' } };
  dashboardSheet.getCell('A2').alignment = { horizontal: 'center' };
  dashboardSheet.getCell('A2').height = 25;

  const headerRow = dashboardSheet.addRow([
    '№', 'Бот', 'Доходы (₽)', 'Расходы (₽)', 'Профит (₽)',
    'Статус', 'Доходы (кол)', 'Расходы (кол)', 'Рентабельность', 'Методы оплаты', ''
  ]);

  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  headerRow.alignment = { horizontal: 'center', wrapText: true };
  headerRow.height = 30;

  // Добавляем данные
  sortedBots.forEach((bot, index) => {
    const profit = bot.income - bot.expense;
    const status = profit > 0 ? '✅ ПРИБЫЛЬНЫЙ' : '🚨 УБЫТОЧНЫЙ';
    const profitColor = profit > 0 ? '16A34A' : 'DC2626';
    const botColor = profit > 0 ? 'DCFCE7' : 'FEE2E2';
    const profitability = bot.income > 0 ? ((profit / bot.income) * 100).toFixed(1) : '0';

    const row = dashboardSheet.addRow([
      `#${index + 1}`,
      bot.name,
      Math.round(bot.income).toLocaleString(),
      Math.round(bot.expense).toLocaleString(),
      Math.round(profit).toLocaleString(),
      status,
      bot.incomeCount,
      bot.expenseCount,
      `${profitability}%`,
      Array.from(bot.methods).join(', '),
      ''
    ]);

    row.getCell(5).font = { bold: true, color: { argb: profitColor } };
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: botColor } };
  });

  dashboardSheet.columns = [
    { width: 6 }, { width: 25 }, { width: 15 }, { width: 15 }, { width: 15 },
    { width: 18 }, { width: 12 }, { width: 12 }, { width: 15 }, { width: 40 }, { width: 10 }
  ];

  // ЛИСТ 2: РАСХОДЫ
  const expensesSheet = workbook.addWorksheet('💸 РАСХОДЫ');

  expensesSheet.mergeCells('A1:F1');
  expensesSheet.getCell('A1').value = '💸 РЕАЛЬНЫЕ РАСХОДЫ - Обучение моделей и операционные затраты';
  expensesSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  expensesSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C2D12' } };
  expensesSheet.getCell('A1').alignment = { horizontal: 'center' };
  expensesSheet.getCell('A1').height = 30;

  const expensesHeader = expensesSheet.addRow([
    '№', 'Бот', 'Расходы (₽)', 'Валюта', 'Метод', 'Дата'
  ]);

  expensesHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
  expensesHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C2D12' } };

  const expenses = realData
    .filter(row => row.classification.type === 'REAL_EXPENSE')
    .sort((a, b) => convertToRub(b.amount, b.currency) - convertToRub(a.amount, a.currency));

  expenses.forEach((expense, index) => {
    expensesSheet.addRow([
      index + 1,
      expense.bot_name,
      Math.round(convertToRub(expense.amount, expense.currency)).toLocaleString(),
      expense.currency,
      expense.payment_method,
      expense.created_at ? new Date(expense.created_at).toLocaleDateString() : ''
    ]);
  });

  expensesSheet.columns = [
    { width: 6 }, { width: 30 }, { width: 18 }, { width: 12 }, { width: 25 }, { width: 15 }
  ];

  // ЛИСТ 3: ИТОГОВАЯ СВОДКА
  const summarySheet = workbook.addWorksheet('📋 ИТОГОВАЯ СВОДКА');

  summarySheet.mergeCells('A1:D1');
  summarySheet.getCell('A1').value = '📋 ИТОГОВАЯ СВОДКА - С УЧЕТОМ ВСЕХ РАСХОДОВ';
  summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  const totalIncome = sortedBots.reduce((sum, bot) => sum + bot.income, 0);
  const totalExpense = sortedBots.reduce((sum, bot) => sum + bot.expense, 0);
  const totalProfit = totalIncome - totalExpense;
  const profitableBots = sortedBots.filter(b => b.profit > 0).length;
  const unprofitableBots = sortedBots.filter(b => b.profit <= 0).length;

  const summaryData = [
    { metric: '🎯 ИСПРАВЛЕННАЯ СТАТИСТИКА', value: '', note: '' },
    { metric: 'Всего записей (исходные)', value: rawData.length.toLocaleString(), note: '100%' },
    { metric: 'Реальных записей', value: realData.length.toLocaleString(), note: `${(realData.length / rawData.length * 100).toFixed(1)}%` },
    { metric: 'Фейковых записей исключено', value: fakeData.length.toLocaleString(), note: `${(fakeData.length / rawData.length * 100).toFixed(1)}%` },
    { metric: '', value: '', note: '' },
    { metric: '💰 ДОХОДЫ', value: '', note: '' },
    { metric: 'Общая сумма доходов', value: `${Math.round(totalIncome).toLocaleString()}₽`, note: 'Все валюты конвертированы в рубли' },
    { metric: 'Количество доходных операций', value: sortedBots.reduce((sum, b) => sum + b.incomeCount, 0).toLocaleString(), note: 'Только входящие платежи' },
    { metric: '', value: '', note: '' },
    { metric: '💸 РАСХОДЫ', value: '', note: '' },
    { metric: 'Общая сумма расходов', value: `${Math.round(totalExpense).toLocaleString()}₽`, note: 'Обучение моделей + операционные' },
    { metric: 'Количество расходных операций', value: sortedBots.reduce((sum, b) => sum + b.expenseCount, 0).toLocaleString(), note: 'Training + генерация контента' },
    { metric: '', value: '', note: '' },
    { metric: '⚖️ ФИНАЛЬНЫЙ РЕЗУЛЬТАТ', value: '', note: '' },
    { metric: 'Чистая прибыль', value: `${Math.round(totalProfit).toLocaleString()}₽`, note: totalProfit >= 0 ? 'ПРОФИТ!' : 'УБЫТОК!' },
    { metric: 'Рентабельность', value: totalIncome > 0 ? `${((totalProfit / totalIncome) * 100).toFixed(1)}%` : '0%', note: 'Профит / Доходы' },
    { metric: '', value: '', note: '' },
    { metric: '📊 СТАТИСТИКА БОТОВ', value: '', note: '' },
    { metric: 'Прибыльных ботов', value: profitableBots.toString(), note: `${(profitableBots / sortedBots.length * 100).toFixed(1)}%` },
    { metric: 'Убыточных ботов', value: unprofitableBots.toString(), note: `${(unprofitableBots / sortedBots.length * 100).toFixed(1)}%` },
    { metric: 'Активных ботов', value: sortedBots.length.toString(), note: 'С реальными операциями' }
  ];

  summaryData.forEach(item => {
    const row = summarySheet.addRow([item.metric, item.value, item.note]);

    if (item.metric.includes('🎯') || item.metric.includes('💰') || item.metric.includes('💸') ||
        item.metric.includes('⚖️') || item.metric.includes('📊')) {
      row.font = { bold: true, size: 12 };
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
    } else if (item.value && (item.value.includes('-') || item.value.includes('УБЫТОК'))) {
      row.getCell(2).font = { bold: true, color: { argb: 'DC2626' } };
    } else if (item.value && (item.value.includes('ПРОФИТ') || item.value.includes('%'))) {
      row.getCell(2).font = { bold: true, color: { argb: '16A34A' } };
    }
  });

  summarySheet.columns = [
    { width: 35 }, { width: 25 }, { width: 40 }
  ];

  // Сохраняем
  const outputPath = '/Users/playra/999-multibots-telegraf/ИСПРАВЛЕННЫЙ_АНАЛИЗ_С_РАСХОДАМИ.xlsx';

  await workbook.xlsx.writeFile(outputPath);

  console.log('\n' + '='.repeat(70));
  console.log('✅ ИСПРАВЛЕННЫЙ EXCEL СОЗДАН!');
  console.log('='.repeat(70));
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n📊 СОДЕРЖИМОЕ (3 ЛИСТА):');
  console.log('1️⃣  📊 ДАШБОРД - с учетом расходов на обучение');
  console.log('2️⃣  💸 РАСХОДЫ - Training, image-to-video и др.');
  console.log('3️⃣  📋 ИТОГОВАЯ СВОДКА - финальные цифры');
  console.log('\n🎯 ИСПРАВЛЕНИЯ:');
  console.log(`   ✅ Учтены расходы: Training, image-to-video`);
  console.log(`   💰 Доходы: ${Math.round(totalIncome).toLocaleString()}₽`);
  console.log(`   💸 Расходы: ${Math.round(totalExpense).toLocaleString()}₽`);
  console.log(`   ⚖️  Профит: ${Math.round(totalProfit).toLocaleString()}₽`);
  console.log(`   📈 Рентабельность: ${totalIncome > 0 ? ((totalProfit / totalIncome) * 100).toFixed(1) : 0}%`);
  console.log(`   ✅ Прибыльных: ${profitableBots}, 🚨 Убыточных: ${unprofitableBots}`);
  console.log('='.repeat(70) + '\n');
}

createCorrectedExcel().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
