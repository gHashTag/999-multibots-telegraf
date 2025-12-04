const ExcelJS = require('exceljs');

const workbook = new ExcelJS.Workbook();
workbook.creator = "РЕАЛЬНЫЙ АНАЛИЗ ПРИБЫЛИ/УБЫТКА";
workbook.created = new Date();

// Курс: 1 звезда = 1.8₽
const STARS_TO_RUB_RATE = 1.8;

// РЕАЛЬНЫЕ ДАННЫЕ
const bots = [
  {
    name: 'neuro_blogger_bot',
    expense: { stars: 102685, rub: 9427.83 },
    users: 322,
    transactions: 4541,
    status: '🚨 УБЫТОЧНЫЙ'
  },
  {
    name: 'MetaMuse_Manifest_bot',
    expense: { stars: 232647, rub: 13141.87 },
    users: 134,
    transactions: 4080,
    status: '🚨 УБЫТОЧНЫЙ'
  },
  {
    name: 'Gaia_Kamskaia_bot',
    expense: { stars: 60330, rub: 7311.58 },
    users: 27,
    transactions: 1565,
    status: '🚨 УБЫТОЧНЫЙ'
  },
  {
    name: 'AI_STARS_bot',
    expense: { stars: 81948, rub: 2153.32 },
    users: 54,
    transactions: 1451,
    status: '🚨 УБЫТОЧНЫЙ'
  },
  {
    name: 'Kaya_easy_art_bot',
    expense: { stars: 23760, rub: 5053.50 },
    users: 5,
    transactions: 837,
    status: '🚨 УБЫТОЧНЫЙ'
  },
  {
    name: 'NeuroLenaAssistant_bot',
    expense: { stars: 8100, rub: 1724.66 },
    users: 7,
    transactions: 741,
    status: '🚨 УБЫТОЧНЫЙ'
  },
  {
    name: 'HaimGroupMedia_bot',
    expense: { stars: 46800, rub: 344.55 },
    users: 12,
    transactions: 357,
    status: '🚨 УБЫТОЧНЫЙ'
  },
  {
    name: 'LeeSolarbot',
    expense: { stars: 1440, rub: 992.07 },
    users: 2,
    transactions: 208,
    status: '💀 МЕРТВЫЙ'
  },
  {
    name: 'NeurostylistShtogrina_bot',
    expense: { stars: 6120, rub: 934.41 },
    users: 3,
    transactions: 157,
    status: '🚨 УБЫТОЧНЫЙ'
  },
  {
    name: 'ZavaraBot',
    expense: { stars: 0, rub: 16.88 },
    users: 1,
    transactions: 9,
    status: '💤 НЕАКТИВНЫЙ'
  }
];

// РЕАЛЬНЫЕ ДОХОДЫ (из Robokassa)
const REAL_INCOME_TOTAL = 126519; // 126,519₽

// 1. ЛИСТ: РЕАЛЬНЫЙ УБЫТОК
const profitSheet = workbook.addWorksheet('💰 РЕАЛЬНЫЙ УБЫТОК', {
  views: [{ state: 'frozen', ySplit: 3 }]
});

profitSheet.mergeCells('A1:L1');
profitSheet.getCell('A1').value = '💰 РЕАЛЬНЫЙ УБЫТОК - ВСЕ РАСХОДЫ РЕАЛЬНЫЕ!';
profitSheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFF' } };
profitSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DC2626' } };
profitSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
profitSheet.getCell('A1').height = 35;

profitSheet.mergeCells('A2:L2');
profitSheet.getCell('A2').value = 'Доходы: 126,519₽ (Robokassa) vs Расходы: 1,055,995₽ (Supabase)';
profitSheet.getCell('A2').font = { size: 12, bold: true, color: { argb: 'FF0000' } };
profitSheet.getCell('A2').alignment = { horizontal: 'center' };
profitSheet.getCell('A2').height = 25;

profitSheet.mergeCells('A3:L3');
profitSheet.getCell('A3').value = '🔴 УБЫТОК: -929,476₽ (в 8.3 раза больше расходов!)';
profitSheet.getCell('A3').font = { size: 14, bold: true, color: { argb: 'FFFFFF' } };
profitSheet.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B91C1C' } };
profitSheet.getCell('A3').alignment = { horizontal: 'center' };
profitSheet.getCell('A3').height = 25;

const headerRow = profitSheet.addRow([
  '№',
  'Бот',
  'Транзакций',
  'Пользователи',
  'Расходы (звезды)',
  'Расходы (₽)',
  'Доля расходов',
  'Статус',
  'Вывод',
  '',
  '',
  ''
]);

headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '991B1B' } };
headerRow.alignment = { horizontal: 'center', wrapText: true };
headerRow.height = 30;

let totalExpenseStars = 0;
let totalExpenseRub = 0;
let totalExpenseTotal = 0;

const sortedBots = [...bots].sort((a, b) => {
  const totalA = a.expense.stars * STARS_TO_RUB_RATE + a.expense.rub;
  const totalB = b.expense.stars * STARS_TO_RUB_RATE + b.expense.rub;
  return totalB - totalA;
});

sortedBots.forEach((bot, index) => {
  const expenseStarsTotal = bot.expense.stars;
  const expenseRubTotal = bot.expense.rub;
  const expenseTotal = expenseStarsTotal * STARS_TO_RUB_RATE + expenseRubTotal;
  
  const share = (expenseTotal / 1055995 * 100).toFixed(1);
  
  totalExpenseStars += expenseStarsTotal;
  totalExpenseRub += expenseRubTotal;
  totalExpenseTotal += expenseTotal;
  
  const row = profitSheet.addRow([
    `#${index + 1}`,
    bot.name,
    bot.transactions,
    bot.users,
    Math.round(expenseStarsTotal),
    Math.round(expenseTotal).toLocaleString(),
    `${share}%`,
    bot.status,
    'Реальные расходы за токены/API',
    '',
    '',
    ''
  ]);

  // Цветовое оформление
  if (expenseTotal > 200000) {
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E5' } };
  }
});

// Итого
const totalRow = profitSheet.addRow([]);
totalRow.getCell(1).value = 'ИТОГО:';
totalRow.font = { bold: true, size: 14 };
totalRow.getCell(5).value = Math.round(totalExpenseStars);
totalRow.getCell(6).value = Math.round(totalExpenseTotal).toLocaleString();
totalRow.getCell(7).value = '100%';
totalRow.getCell(8).value = '🔴 УБЫТОК';

profitSheet.columns = [
  { width: 6 }, { width: 30 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 18 },
  { width: 12 }, { width: 20 }, { width: 30 }, { width: 15 }, { width: 15 }, { width: 15 }
];

// 2. ЛИСТ: СВОДКА
const summarySheet = workbook.addWorksheet('📋 ИТОГОВАЯ СВОДКА');
summarySheet.mergeCells('A1:C1');
summarySheet.getCell('A1').value = '📋 ИТОГОВАЯ СВОДКА - ПОРАЗИТЕЛЬНЫЙ УБЫТОК';
summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7F1D1D' } };
summarySheet.getCell('A1').alignment = { horizontal: 'center' };

const summaryData = [
  { metric: '💰 ДОХОДЫ (реальные)', value: '', note: '' },
  { metric: 'Robokassa (30.01-30.11.2025)', value: '126,519₽', note: 'ТОЛЬКО реальные деньги!' },
  { metric: '', value: '', note: '' },
  { metric: '💸 РАСХОДЫ (реальные)', value: '', note: '' },
  { metric: 'Токены (563,830 звезд)', value: '1,014,894₽', note: '1,055,995₽ в рублях' },
  { metric: 'Рубли (41,100₽)', value: '41,101₽', note: 'Прямые рубли' },
  { metric: 'ИТОГО РАСХОДОВ', value: '1,055,995₽', note: 'ВСЕ РЕАЛЬНЫЕ!' },
  { metric: '', value: '', note: '' },
  { metric: '🔴 РЕЗУЛЬТАТ', value: '', note: '' },
  { metric: 'Убыток', value: '-929,476₽', note: '126,519 - 1,055,995' },
  { metric: 'Убыток в разах', value: '8.3x', note: 'Расходов в 8.3 раза больше!' },
  { metric: '', value: '', note: '' },
  { metric: '💡 ВЫВОДЫ', value: '', note: '' },
  { metric: 'Главная проблема', value: 'Фейковые доходы в Supabase', note: 'System Grant, BONUS, миграции' },
  { metric: 'Реальные потери', value: '929,476₽', note: 'За 10 месяцев' },
  { metric: 'Средний убыток/месяц', value: '92,948₽', note: '929,476 / 10' },
  { metric: 'Прибыльность', value: '12%', note: '126,519 / 1,055,995' }
];

summaryData.forEach(item => {
  const row = summarySheet.addRow([item.metric, item.value, item.note]);

  if (item.metric.includes('💰') || item.metric.includes('💸') || item.metric.includes('🔴') || item.metric.includes('💡')) {
    row.font = { bold: true, size: 12 };
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
  } else if (item.value && item.value.startsWith('-')) {
    row.getCell(2).font = { bold: true, color: { argb: 'DC2626' } };
  }
});

summarySheet.columns = [
  { width: 30 }, { width: 25 }, { width: 45 }
];

const outputPath = '/Users/playra/999-multibots-telegraf/ПОРАЗИТЕЛЬНЫЙ_УБЫТОК_РЕАЛЬНЫЕ_ЦИФРЫ.xlsx';

workbook.xlsx.writeFile(outputPath)
  .then(() => {
    console.log('\n💰 ПОРАЗИТЕЛЬНЫЙ УБЫТОК - РЕАЛЬНЫЕ ЦИФРЫ!');
    console.log(`📁 Файл: ${outputPath}`);
    console.log('\n📊 СОДЕРЖИМОЕ (2 ЛИСТА):');
    console.log('1️⃣  💰 РЕАЛЬНЫЙ УБЫТОК - детальный анализ расходов');
    console.log('2️⃣  📋 ИТОГОВАЯ СВОДКА - поразительные выводы');
    console.log('\n🚨 ПОРАЗИТЕЛЬНЫЕ ЦИФРЫ:');
    console.log(`   💰 Доходы: 126,519₽`);
    console.log(`   💸 Расходы: 1,055,995₽`);
    console.log(`   🔴 УБЫТОК: -929,476₽ (в 8.3 раза!)`);
    console.log('\n💡 ГЛАВНАЯ ПРОБЛЕМА:');
    console.log(`   Фейковые доходы в Supabase (System Grant, BONUS)`);
    console.log(`   скрывали реальный УБЫТОК 929,476₽!`);
  })
  .catch(err => {
    console.error('❌ Ошибка создания файла:', err);
  });
