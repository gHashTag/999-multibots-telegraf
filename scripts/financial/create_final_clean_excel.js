const ExcelJS = require('exceljs');

const workbook = new ExcelJS.Workbook();
workbook.creator = "ФИНАЛЬНЫЙ ЧИСТЫЙ АНАЛИЗ - Без тестовых ботов";
workbook.created = new Date();

// Курсы конвертации
const RATES = {
  XTR: 1.8,
  STARS: 1.8,
  RUB: 1.0
};

// ЧИСТЫЕ ДАННЫЕ БЕЗ ТЕСТОВЫХ БОТОВ (ai_koshey_bot, admin_*, clip_maker_* исключены)
const bots = [
  {
    name: 'neuro_blogger_bot',
    income: 182404.80 + 167578.20 + 73166.00, // XTR + XTR + RUB
    expense: 162.0 + 121830.89 + 0,
    transactions: 372 + 2721 + 49, // XTR + XTR + RUB
    status: '🚨 УБЫТОЧНЫЙ',
    category: 'AI-генерация контента'
  },
  {
    name: 'MetaMuse_Manifest_bot',
    income: 108871.00 + 74019.60, // RUB + XTR
    expense: 0 + 111602.57,
    transactions: 77 + 2182,
    status: '🚨 УБЫТОЧНЫЙ',
    category: 'AI-видео и фото'
  },
  {
    name: 'AI_STARS_bot',
    income: 71629.20, // XTR
    expense: 40151.38,
    transactions: 988,
    status: '✅ ПРИБЫЛЬНЫЙ',
    category: 'AI-генерация изображений'
  },
  {
    name: 'Gaia_Kamskaia_bot',
    income: 42674.00 + 27060.41, // RUB + XTR
    expense: 0 + 0,
    transactions: 21 + 68,
    status: '✅ ПРИБЫЛЬНЫЙ',
    category: 'AI-творчество'
  },
  {
    name: 'HaimGroupMedia_bot',
    income: 180000.00, // STARS
    expense: 5871.60,
    transactions: 97,
    status: '✅ ПРИБЫЛЬНЫЙ',
    category: 'Корпоративный бот'
  },
  {
    name: 'NeuroLenaAssistant_bot',
    income: 23328.00, // RUB
    expense: 0,
    transactions: 9,
    status: '✅ ПРИБЫЛЬНЫЙ',
    category: 'AI-помощник'
  },
  {
    name: 'Kaya_easy_art_bot',
    income: 0, // Только тестовые данные
    expense: 0,
    transactions: 0,
    status: '💤 НЕАКТИВНЫЙ',
    category: 'AI-арт'
  },
  {
    name: 'LeeSolarbot',
    income: 0, // Только тестовые данные
    expense: 0,
    transactions: 0,
    status: '💀 МЕРТВЫЙ',
    category: 'Энергетический бот'
  },
  {
    name: 'NeurostylistShtogrina_bot',
    income: 0, // Только тестовые данные
    expense: 0,
    transactions: 0,
    status: '💤 НЕАКТИВНЫЙ',
    category: 'AI-стилист'
  }
];

// ИСКЛЮЧЕННЫЕ ТЕСТОВЫЕ БОТЫ (для отдельной таблицы)
const testBots = [
  {
    name: 'ai_koshey_bot',
    fakeAmount: 350198795, // 350 млн фейковых данных в STARS
    realAmount: 11123, // Всего 11К реальных
    note: 'Тестовый бот - исключен из статистики',
    transactions: 135
  },
  {
    name: 'admin_system',
    fakeAmount: 1575000, // 1.5 млн в XTR
    realAmount: 0,
    note: 'Админский бот',
    transactions: 16
  },
  {
    name: 'clip_maker_neuro_bot',
    fakeAmount: 13582, // Тестовые данные
    realAmount: 0,
    note: 'Тестовый бот для клипов',
    transactions: 114
  }
];

// 1. ЛИСТ: ЧИСТЫЙ ДАШБОРД
const dashboardSheet = workbook.addWorksheet('📊 ЧИСТЫЙ ДАШБОРД', {
  views: [{ state: 'frozen', ySplit: 3 }]
});

dashboardSheet.mergeCells('A1:K1');
dashboardSheet.getCell('A1').value = '📊 ЧИСТЫЙ ДАШБОРД - Без тестовых ботов и фейковых данных';
dashboardSheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFF' } };
dashboardSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
dashboardSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
dashboardSheet.getCell('A1').height = 35;

dashboardSheet.mergeCells('A2:K2');
dashboardSheet.getCell('A2').value = '✅ Исключены: ai_koshey_bot (350 млн ₽ фейка), admin_*, clip_maker_*';
dashboardSheet.getCell('A2').font = { size: 12, bold: true, color: { argb: 'FFFFFF' } };
dashboardSheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '166534' } };
dashboardSheet.getCell('A2').alignment = { horizontal: 'center' };
dashboardSheet.getCell('A2').height = 25;

const headerRow = dashboardSheet.addRow([
  '№',
  'Бот',
  'Доходы (₽)',
  'Расходы (₽)',
  'Прибыль (₽)',
  'Статус',
  'Транзакции',
  'Категория',
  'Рентабельность',
  '',
  ''
]);

headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
headerRow.alignment = { horizontal: 'center', wrapText: true };
headerRow.height = 30;

bots.forEach((bot, index) => {
  const profit = bot.income - bot.expense;
  const profitability = bot.income > 0 ? ((profit / bot.income) * 100).toFixed(1) : '0';
  const profitColor = profit >= 0 ? '✅' : '🔴';

  const row = dashboardSheet.addRow([
    `#${index + 1}`,
    bot.name,
    Math.round(bot.income).toLocaleString(),
    Math.round(bot.expense).toLocaleString(),
    Math.round(profit).toLocaleString(),
    bot.status,
    bot.transactions,
    bot.category,
    `${profitability}%`,
    '',
    ''
  ]);

  // Цветовое оформление
  if (profit < 0) {
    row.getCell(5).font = { bold: true, color: { argb: 'DC2626' } };
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
  } else {
    row.getCell(5).font = { bold: true, color: { argb: '16A34A' } };
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DCFCE7' } };
  }
});

dashboardSheet.columns = [
  { width: 6 }, { width: 30 }, { width: 15 }, { width: 15 }, { width: 15 },
  { width: 20 }, { width: 12 }, { width: 25 }, { width: 15 }, { width: 10 }, { width: 10 }
];

// 2. ЛИСТ: ИСКЛЮЧЕННЫЕ ТЕСТОВЫЕ БОТЫ
const testBotsSheet = workbook.addWorksheet('🚫 ИСКЛЮЧЕННЫЕ БОТЫ');

testBotsSheet.mergeCells('A1:E1');
testBotsSheet.getCell('A1').value = '🚫 ИСКЛЮЧЕННЫЕ ТЕСТОВЫЕ БОТЫ - Почему убраны из статистики';
testBotsSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
testBotsSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B91C1C' } };
testBotsSheet.getCell('A1').alignment = { horizontal: 'center' };
testBotsSheet.getCell('A1').height = 30;

const testHeader = testBotsSheet.addRow([
  'Бот',
  'Фейковые данные (₽)',
  'Реальные данные (₽)',
  'Транзакции',
  'Причина исключения'
]);

testHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
testHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B91C1C' } };

testBots.forEach(bot => {
  const fakeColor = bot.fakeAmount > 100000000 ? '#FEE2E2' : '#FEF3C7';
  testBotsSheet.addRow([
    bot.name,
    Math.round(bot.fakeAmount).toLocaleString(),
    bot.realAmount.toLocaleString(),
    bot.transactions,
    bot.note
  ]).getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fakeColor } };
});

testBotsSheet.columns = [
  { width: 25 }, { width: 20 }, { width: 20 }, { width: 15 }, { width: 40 }
];

// 3. ЛИСТ: ИТОГОВАЯ СВОДКА
const summarySheet = workbook.addWorksheet('📋 ИТОГОВАЯ СВОДКА');

summarySheet.mergeCells('A1:D1');
summarySheet.getCell('A1').value = '📋 ИТОГОВАЯ СВОДКА - Чистая статистика без фейка';
summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } };
summarySheet.getCell('A1').alignment = { horizontal: 'center' };

const totalIncome = bots.reduce((sum, bot) => sum + bot.income, 0);
const totalExpense = bots.reduce((sum, bot) => sum + bot.expense, 0);
const totalProfit = totalIncome - totalExpense;
const profitableBots = bots.filter(b => b.income > b.expense).length;
const unprofitableBots = bots.filter(b => b.income <= b.expense).length;

const summaryData = [
  { metric: '💰 РЕАЛЬНЫЕ ДОХОДЫ (чистые)', value: '', note: '' },
  { metric: 'Сумма всех доходов', value: `${Math.round(totalIncome).toLocaleString()}₽`, note: 'Только производственные боты' },
  { metric: '', value: '', note: '' },
  { metric: '💸 РАСХОДЫ (реальные)', value: '', note: '' },
  { metric: 'Сумма всех расходов', value: `${Math.round(totalExpense).toLocaleString()}₽`, note: 'Операционные затраты' },
  { metric: '', value: '', note: '' },
  { metric: '⚖️ ФИНАЛЬНЫЙ РЕЗУЛЬТАТ', value: '', note: '' },
  { metric: 'Прибыль/Убыток', value: `${Math.round(totalProfit).toLocaleString()}₽`, note: totalProfit >= 0 ? 'ПРОФИТ!' : 'УБЫТОК!' },
  { metric: 'Рентабельность', value: `${((totalProfit / totalIncome) * 100).toFixed(1)}%`, note: 'Отношение прибыли к доходам' },
  { metric: '', value: '', note: '' },
  { metric: '📊 СТАТИСТИКА БОТОВ', value: '', note: '' },
  { metric: 'Прибыльных ботов', value: profitableBots.toString(), note: 'Доходы > Расходы' },
  { metric: 'Убыточных ботов', value: unprofitableBots.toString(), note: 'Доходы ≤ Расходы' },
  { metric: 'Неактивных ботов', value: bots.filter(b => b.income === 0).length.toString(), note: 'Нет реальных доходов' },
  { metric: '', value: '', note: '' },
  { metric: '🚫 ФИЛЬТРАЦИЯ', value: '', note: '' },
  { metric: 'Исключено тестовых ботов', value: testBots.length.toString(), note: 'ai_koshey_bot (350 млн ₽ фейка)' },
  { metric: 'Фейковых данных удалено', value: `${(testBots[0].fakeAmount / 1000000).toFixed(0)} млн ₽`, note: '99.9% фейковых данных' }
];

summaryData.forEach(item => {
  const row = summarySheet.addRow([item.metric, item.value, item.note]);

  if (item.metric.includes('💰') || item.metric.includes('💸') || item.metric.includes('⚖️') || item.metric.includes('📊') || item.metric.includes('🚫')) {
    row.font = { bold: true, size: 12 };
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
  } else if (item.value && (item.value.includes('-') || item.value.includes('УБЫТОК'))) {
    row.getCell(2).font = { bold: true, color: { argb: 'DC2626' } };
  } else if (item.value && (item.value.includes('ПРОФИТ') || item.value.includes('%'))) {
    row.getCell(2).font = { bold: true, color: { argb: '16A34A' } };
  }
});

summarySheet.columns = [
  { width: 30 }, { width: 25 }, { width: 40 }
];

const outputPath = '/Users/playra/999-multibots-telegraf/ФИНАЛЬНЫЙ_ЧИСТЫЙ_АНАЛИЗ_БЕЗ_ФЕЙКА.xlsx';

workbook.xlsx.writeFile(outputPath)
  .then(() => {
    console.log('\n✅ ФИНАЛЬНЫЙ ЧИСТЫЙ АНАЛИЗ СОЗДАН!');
    console.log(`📁 Файл: ${outputPath}`);
    console.log('\n📊 СОДЕРЖИМОЕ (3 ЛИСТА):');
    console.log('1️⃣  📊 ЧИСТЫЙ ДАШБОРД - только производственные боты');
    console.log('2️⃣  🚫 ИСКЛЮЧЕННЫЕ БОТЫ - тестовые боты и причины');
    console.log('3️⃣  📋 ИТОГОВАЯ СВОДКА - чистая статистика');
    console.log('\n🎯 ФИЛЬТРАЦИЯ:');
    console.log('   ✅ Исключен ai_koshey_bot (350 млн ₽ фейка)');
    console.log('   ✅ Исключены все admin_* боты');
    console.log('   ✅ Исключен clip_maker_neuro_bot');
    console.log('   ✅ Показаны только реальные производственные боты');
    console.log('\n📈 ИТОГОВЫЕ ЦИФРЫ:');
    console.log(`   💰 Реальные доходы: ${Math.round(totalIncome).toLocaleString()}₽`);
    console.log(`   💸 Реальные расходы: ${Math.round(totalExpense).toLocaleString()}₽`);
    console.log(`   ⚖️  Финальный результат: ${Math.round(totalProfit).toLocaleString()}₽`);
    console.log(`   📊 Рентабельность: ${((totalProfit / totalIncome) * 100).toFixed(1)}%`);
    console.log('\n🎉 Фейковые данные полностью исключены!');
  })
  .catch(err => {
    console.error('❌ Ошибка создания файла:', err);
  });
