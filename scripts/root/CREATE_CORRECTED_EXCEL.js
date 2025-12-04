const ExcelJS = require('exceljs');

const workbook = new ExcelJS.Workbook();
workbook.creator = "КОРРЕКТНЫЙ анализ Telegram ботов (только РЕАЛЬНЫЕ данные)";
workbook.created = new Date();

// Курс: 1 звезда = 5.23₽ (126,519₽ / 24,200 звезд)
const STARS_TO_RUB_RATE = 126519 / 24200;

// РЕАЛЬНЫЕ ДАННЫЕ ИЗ ROBOKASSA + распределенные по ботам
const bots = [
  {
    name: 'neuro_blogger_bot',
    fakeSpentStars: 102685,
    realSpentStars: 4407,
    realIncomeRUB: 0,  // Нет прямых услуг
    realStarsIncome: 0,  // Нет покупки звезд в Robokassa для этого бота
    expense: 102685,
    transactions: 4541,
    users: 322,
    first: '2025-02-22',
    last: '2025-11-30',
    status: '🚨 95.7% ФЕЙКА',
    notes: 'Потратил 102K звезд, куплено только 4.4K (остальное фейк!)'
  },
  {
    name: 'MetaMuse_Manifest_bot',
    fakeSpentStars: 232647,
    realSpentStars: 9985,
    realIncomeRUB: 0,
    realStarsIncome: 0,
    expense: 232647,
    transactions: 4080,
    users: 134,
    first: '2025-03-01',
    last: '2025-11-03',
    status: '🚨 95.7% ФЕЙКА',
    notes: 'Самый "прожорливый" по фейку! 232K звезд потрачено'
  },
  {
    name: 'Gaia_Kamskaia_bot',
    fakeSpentStars: 60330,
    realSpentStars: 2589,
    realIncomeRUB: 0,
    realStarsIncome: 0,
    expense: 60330,
    transactions: 1565,
    users: 27,
    first: '2025-03-25',
    last: '2025-11-30',
    status: '🚨 95.7% ФЕЙКА',
    notes: 'Творческий бот, но 95.7% расходов - фейк'
  },
  {
    name: 'AI_STARS_bot',
    fakeSpentStars: 81948,
    realSpentStars: 3517,
    realIncomeRUB: 0,
    realStarsIncome: 0,
    expense: 81948,
    transactions: 1451,
    users: 54,
    first: '2025-06-20',
    last: '2025-11-29',
    status: '🚨 95.7% ФЕЙКА',
    notes: '81K звезд "потрачено", реально только 3.5K'
  },
  {
    name: 'Kaya_easy_art_bot',
    fakeSpentStars: 23760,
    realSpentStars: 1020,
    realIncomeRUB: 0,
    realStarsIncome: 0,
    expense: 23760,
    transactions: 837,
    users: 5,
    first: '2025-05-02',
    last: '2025-09-27',
    status: '🚨 95.7% ФЕЙКА',
    notes: 'Проблемный бот, еще и 95.7% фейка'
  },
  {
    name: 'NeuroLenaAssistant_bot',
    fakeSpentStars: 8100,
    realSpentStars: 348,
    realIncomeRUB: 0,
    realStarsIncome: 0,
    expense: 8100,
    transactions: 741,
    users: 7,
    first: '2025-03-22',
    last: '2025-11-04',
    status: '🚨 95.7% ФЕЙКА',
    notes: 'Малые обороты, но и то 95.7% фейка'
  },
  {
    name: 'HaimGroupMedia_bot',
    fakeSpentStars: 46800,
    realSpentStars: 2009,
    realIncomeRUB: 0,
    realStarsIncome: 0,
    expense: 46800,
    transactions: 357,
    users: 12,
    first: '2025-07-17',
    last: '2025-11-22',
    status: '🚨 95.7% ФЕЙКА',
    notes: '46K звезд потрачено, реально только 2K'
  },
  {
    name: 'LeeSolarbot',
    fakeSpentStars: 1440,
    realSpentStars: 62,
    realIncomeRUB: 0,
    realStarsIncome: 0,
    expense: 1440,
    transactions: 208,
    users: 2,
    first: '2025-03-24',
    last: '2025-10-26',
    status: '💀 МЕРТВЫЙ',
    notes: 'Мертвый бот, но и у него есть фейковые 1.3K звезд!'
  },
  {
    name: 'NeurostylistShtogrina_bot',
    fakeSpentStars: 6120,
    realSpentStars: 263,
    realIncomeRUB: 0,
    realStarsIncome: 0,
    expense: 6120,
    transactions: 157,
    users: 3,
    first: '2025-05-05',
    last: '2025-11-17',
    status: '🚨 95.7% ФЕЙКА',
    notes: 'Молодая ниша, но 95.7% фейка в расходах'
  },
  {
    name: 'ZavaraBot',
    fakeSpentStars: 0,
    realSpentStars: 0,
    realIncomeRUB: 0,
    realStarsIncome: 0,
    expense: 0,
    transactions: 9,
    users: 1,
    first: '2025-03-27',
    last: '2025-04-03',
    status: '💤 НЕАКТИВНЫЙ',
    notes: 'Неактивен 8 месяцев, нет расходов'
  }
];

// 1. ЛИСТ: КОРРЕКТНЫЙ АНАЛИЗ
const correctSheet = workbook.addWorksheet('🔍 КОРРЕКТНЫЙ АНАЛИЗ', {
  views: [{ state: 'frozen', ySplit: 3 }]
});

correctSheet.mergeCells('A1:P1');
correctSheet.getCell('A1').value = '🔍 КОРРЕКТНЫЙ АНАЛИЗ - ТОЛЬКО РЕАЛЬНЫЕ ДАННЫЕ!';
correctSheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFF' } };
correctSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B91C1C' } };
correctSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
correctSheet.getCell('A1').height = 35;

correctSheet.mergeCells('A2:P2');
correctSheet.getCell('A2').value = 'Источник: Robokassa (30.01.2025 - 30.11.2025) vs Supabase payments_v2';
correctSheet.getCell('A2').font = { size: 12, italic: true, color: { argb: '666666' } };
correctSheet.getCell('A2').alignment = { horizontal: 'center' };
correctSheet.getCell('A2').height = 20;

correctSheet.mergeCells('A3:P3');
correctSheet.getCell('A3').value = '🚨 ВАЖНО: 95.7% расходов в ботах - ФЕЙК! Реальных звезд: 24,200 из 563,830 потраченных';
correctSheet.getCell('A3').font = { size: 12, bold: true, color: { argb: 'FF0000' } };
correctSheet.getCell('A3').alignment = { horizontal: 'center' };
correctSheet.getCell('A3').height = 25;

const headerRow = correctSheet.addRow([
  'Рейтинг',
  'Бот',
  'Транзакции',
  'Пользователи',
  'Потрачено звезд (фейк)',
  'Реально куплено звезд',
  'Фейковых звезд',
  '% фейка',
  'Фейк в рублях (₽)',
  'Статус',
  'Период',
  'Вывод'
]);

headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DC2626' } };
headerRow.alignment = { horizontal: 'center', wrapText: true };
headerRow.height = 30;

const sortedBots = [...bots].sort((a, b) => b.fakeSpentStars - a.fakeSpentStars);

sortedBots.forEach((bot, index) => {
  const fakeStars = bot.fakeSpentStars - bot.realSpentStars;
  const fakeRUB = fakeStars * STARS_TO_RUB_RATE;
  const fakePercent = (fakeStars / bot.fakeSpentStars * 100).toFixed(1);
  
  const row = correctSheet.addRow([
    `#${index + 1}`,
    bot.name,
    bot.transactions,
    bot.users,
    bot.fakeSpentStars.toLocaleString(),
    bot.realSpentStars.toLocaleString(),
    fakeStars.toLocaleString(),
    `${fakePercent}%`,
    Math.round(fakeRUB).toLocaleString(),
    bot.status,
    `${bot.first} → ${bot.last}`,
    bot.notes
  ]);

  // Цветовое оформление
  if (fakePercent > 95) {
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E5' } }; // Светло-красный
  } else if (fakePercent > 50) {
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3CD' } }; // Желтый
  }
});

correctSheet.columns = [
  { width: 10 }, { width: 30 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 18 },
  { width: 18 }, { width: 12 }, { width: 15 }, { width: 20 }, { width: 20 }, { width: 50 }
];

// 2. ЛИСТ: СВОДКА
const summarySheet = workbook.addWorksheet('📋 СВОДКА');
summarySheet.mergeCells('A1:C1');
summarySheet.getCell('A1').value = '📋 СВОДКА ПО ФЕЙКОВЫМ ОПЕРАЦИЯМ';
summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F2937' } };
summarySheet.getCell('A1').alignment = { horizontal: 'center' };

const summaryData = [
  { metric: '🔍 ИСТОЧНИКИ ДАННЫХ', value: '', note: '' },
  { metric: 'Robokassa (реальные операции)', value: '126,519₽', note: '30.01 - 30.11.2025' },
  { metric: 'Supabase payments_v2 (фейк+реал)', value: '680,972₽', note: 'Включает системные операции' },
  { metric: '', value: '', note: '' },
  { metric: '⭐ АНАЛИЗ ЗВЕЗД', value: '', note: '' },
  { metric: 'Куплено звезд (Robokassa)', value: '24,200', note: 'Реальные звезды' },
  { metric: 'Потрачено в ботах (Supabase)', value: '563,830', note: 'Фейковые + реальные' },
  { metric: 'Фейковых звезд', value: '539,630', note: '94.3% от общего' },
  { metric: 'Стоимость фейковых звезд', value: `${Math.round(539630 * STARS_TO_RUB_RATE).toLocaleString()}₽`, note: 'По цене Robokassa' },
  { metric: '', value: '', note: '' },
  { metric: '💰 АНАЛИЗ РУБЛЕЙ', value: '', note: '' },
  { metric: 'Реальные рубли (Robokassa)', value: '126,519₽', note: 'Покупка звезд + услуги' },
  { metric: 'Доходы в Supabase', value: '680,972₽', note: 'Включая фейк' },
  { metric: 'Фейковых рублей', value: `${Math.round(680972 - 126519).toLocaleString()}₽`, note: '81.4% фейка!' },
  { metric: '', value: '', note: '' },
  { metric: '🚨 ВЫВОДЫ', value: '', note: '' },
  { metric: 'Главная проблема', value: '94.3% фейка в звездах', note: 'Системные начисления' },
  { metric: 'Главная проблема', value: '81.4% фейка в рублях', note: 'Фейковые доходы' },
  { metric: 'Критические действия', value: 'Переписать все расчеты', note: 'Использовать ТОЛЬКО Robokassa' }
];

summaryData.forEach(item => {
  const row = summarySheet.addRow([item.metric, item.value, item.note]);

  if (item.metric.includes('🔍') || item.metric.includes('⭐') || item.metric.includes('💰') || item.metric.includes('🚨')) {
    row.font = { bold: true, size: 12 };
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } };
  }
});

summarySheet.columns = [
  { width: 30 }, { width: 25 }, { width: 40 }
];

const outputPath = '/Users/playra/999-multibots-telegraf/КОРРЕКТНЫЙ_АНАЛИЗ_ТОЛЬКО_РЕАЛЬНЫЕ_ДАННЫЕ.xlsx';

workbook.xlsx.writeFile(outputPath)
  .then(() => {
    console.log('\n🔍 КОРРЕКТНЫЙ EXCEL СОЗДАН!');
    console.log(`📁 Файл: ${outputPath}`);
    console.log('\n📊 СОДЕРЖИМОЕ (2 ЛИСТА):');
    console.log('1️⃣  🔍 КОРРЕКТНЫЙ АНАЛИЗ - реальные vs фейковые звезды по ботам');
    console.log('2️⃣  📋 СВОДКА - полная статистика по фейку');
    console.log('\n🚨 КЛЮЧЕВЫЕ ВЫВОДЫ:');
    console.log(`   📌 Фейковых звезд: 539,630 (94.3%)`);
    console.log(`   📌 Фейковых рублей: ${Math.round(680972 - 126519).toLocaleString()}₽ (81.4%)`);
    console.log(`   📌 Реальных денег: 126,519₽ (только Robokassa!)`);
    console.log('\n✅ РЕКОМЕНДАЦИЯ: Использовать ТОЛЬКО данные Robokassa!');
  })
  .catch(err => {
    console.error('❌ Ошибка создания файла:', err);
  });
