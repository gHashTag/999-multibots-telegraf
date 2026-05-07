// ПОЛНЫЙ АНАЛИЗ ВСЕХ БОТОВ С ПРАВИЛЬНЫМ РАЗДЕЛЕНИЕМ
// Доходы: только реальные платежи (Telegram/Robokassa)
// Расходы: все реальные траты (включая системные операции)

const ExcelJS = require('exceljs');

const workbook = new ExcelJS.Workbook();
workbook.creator = "Полный анализ всех ботов";
workbook.created = new Date();

// Курсы конвертации
const XTR_TO_RUB_RATE = 1.8;
const STARS_TO_RUB_RATE = 1.8;

// Полные данные по всем ботам с РЕАЛЬНЫМИ цифрами
const bots = [
  {
    name: 'neuro_blogger_bot',
    realIncome: { xtr: 21304, stars: 0, rub: 188604 },
    realExpense: { xtr: 61338.93, stars: 41346.04, rub: 9427.83 },
    suspiciousExpense: { xtr: 35732, stars: 643.488, rub: 0 },
    transactions: 4541,
    users: 322,
    first: '2025-02-22',
    last: '2025-11-30',
    notes: 'РЕАЛЬНЫЕ платежи: 21,304 XTR + 188,604 RUB. Бонусы: 35,732 XTR (системные расходы!)'
  },
  {
    name: 'MetaMuse_Manifest_bot',
    realIncome: { xtr: 49565, stars: 0, rub: 139159 },
    realExpense: { xtr: 122905, stars: 109742, rub: 13141.87 },
    suspiciousExpense: { xtr: 0, stars: 0, rub: 0 },
    transactions: 4080,
    users: 134,
    first: '2025-03-01',
    last: '2025-11-03',
    notes: 'Только реальные платежи, система не используется'
  },
  {
    name: 'Gaia_Kamskaia_bot',
    realIncome: { xtr: 24436.56, stars: 0, rub: 44634 },
    realExpense: { xtr: 51330, stars: 9000, rub: 7311.58 },
    suspiciousExpense: { xtr: 0, stars: 0, rub: 0 },
    transactions: 1565,
    users: 27,
    first: '2025-03-25',
    last: '2025-11-30',
    notes: 'Только реальные платежи'
  },
  {
    name: 'AI_STARS_bot',
    realIncome: { xtr: 16277, stars: 0, rub: 64339 },
    realExpense: { xtr: 59112, stars: 22836, rub: 2153.32 },
    suspiciousExpense: { xtr: 0, stars: 0, rub: 0 },
    transactions: 1451,
    users: 54,
    first: '2025-06-20',
    last: '2025-11-29',
    notes: 'Только реальные платежи'
  },
  {
    name: 'Kaya_easy_art_bot',
    realIncome: { xtr: 15, stars: 0, rub: 3340 },
    realExpense: { xtr: 21600, stars: 2160, rub: 5053.50 },
    suspiciousExpense: { xtr: 0, stars: 0, rub: 0 },
    transactions: 837,
    users: 5,
    first: '2025-05-02',
    last: '2025-09-27',
    notes: 'Мало пользователей, убыточный бот'
  },
  {
    name: 'NeuroLenaAssistant_bot',
    realIncome: { xtr: 321, stars: 0, rub: 23328 },
    realExpense: { xtr: 5400, stars: 2700, rub: 1724.66 },
    suspiciousExpense: { xtr: 0, stars: 0, rub: 0 },
    transactions: 741,
    users: 7,
    first: '2025-03-22',
    last: '2025-11-04',
    notes: 'Только реальные платежи'
  },
  {
    name: 'HaimGroupMedia_bot',
    realIncome: { xtr: 2833, stars: 100000, rub: 2999 },
    realExpense: { xtr: 39600, stars: 7200, rub: 344.55 },
    suspiciousExpense: { xtr: 0, stars: 0, rub: 0 },
    transactions: 357,
    users: 12,
    first: '2025-07-17',
    last: '2025-11-22',
    notes: 'Есть возврат 100,000 STARS - требует проверки!'
  },
  {
    name: 'LeeSolarbot',
    realIncome: { xtr: 0, stars: 0, rub: 0 },
    realExpense: { xtr: 1440, stars: 0, rub: 992.07 },
    suspiciousExpense: { xtr: 18730, stars: 0, rub: 0 },
    transactions: 208,
    users: 2,
    first: '2025-03-24',
    last: '2025-10-26',
    notes: 'НЕТ РЕАЛЬНЫХ доходов! Все 208 транзакций - системные/гранты. 18,730 XTR - фейк!'
  },
  {
    name: 'NeurostylistShtogrina_bot',
    realIncome: { xtr: 4426, stars: 0, rub: 39 },
    realExpense: { xtr: 4500, stars: 1620, rub: 934.41 },
    suspiciousExpense: { xtr: 0, stars: 0, rub: 0 },
    transactions: 157,
    users: 3,
    first: '2025-05-05',
    last: '2025-11-17',
    notes: 'Только реальные платежи'
  },
  {
    name: 'ZavaraBot',
    realIncome: { xtr: 6, stars: 0, rub: 0 },
    realExpense: { xtr: 0, stars: 0, rub: 16.88 },
    suspiciousExpense: { xtr: 0, stars: 0, rub: 0 },
    transactions: 9,
    users: 1,
    first: '2025-03-27',
    last: '2025-04-03',
    notes: 'Минимальная активность, почти не работает'
  }
];

// Создаем вкладку с полной статистикой
const sheet = workbook.addWorksheet('🎯 ПОЛНАЯ СТАТИСТИКА', {
  views: [{ state: 'frozen', ySplit: 1 }]
});

// Заголовок
sheet.mergeCells('A1:M1');
sheet.getCell('A1').value = 'ПОЛНЫЙ АНАЛИЗ ВСЕХ БОТОВ (С РАСХОДАМИ И ДОХОДАМИ)';
sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2F4F4F' } };
sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
sheet.getCell('A1').height = 30;

// Заголовки колонок
const headerRow = sheet.addRow([
  'Бот',
  'Транзакции',
  'Пользователи',
  'Первый платеж',
  'Последний платеж',
  'Доходы XTR',
  'Доходы STARS',
  'Доходы RUB',
  'Итого доходов (₽)',
  'Все расходы (₽)',
  'Системные/Фейк расходы',
  'Прибыль (₽)',
  'Рентабельность'
]);

headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
headerRow.alignment = { horizontal: 'center' };
headerRow.height = 25;

// Добавляем данные
bots.forEach(bot => {
  // Подсчет доходов в рублях
  const incomeRUB = bot.realIncome.xtr * XTR_TO_RUB_RATE +
                    bot.realIncome.stars * STARS_TO_RUB_RATE +
                    bot.realIncome.rub;

  // Подсчет РЕАЛЬНЫХ расходов в рублях
  const realExpenseRUB = bot.realExpense.xtr * XTR_TO_RUB_RATE +
                          bot.realExpense.stars * STARS_TO_RUB_RATE +
                          bot.realExpense.rub;

  // Подсчет ПОДОЗРИТЕЛЬНЫХ расходов в рублях
  const suspiciousExpenseRUB = bot.suspiciousExpense.xtr * XTR_TO_RUB_RATE +
                                bot.suspiciousExpense.stars * STARS_TO_RUB_RATE +
                                bot.suspiciousExpense.rub;

  // ИТОГО расходы (реальные + подозрительные)
  const totalExpenseRUB = realExpenseRUB + suspiciousExpenseRUB;

  // Прибыль
  const profit = incomeRUB - totalExpenseRUB;

  // ROI
  const roi = totalExpenseRUB > 0 ? (profit / totalExpenseRUB * 100) : 0;

  // Формируем строку с заметками о подозрительных расходах
  let suspiciousNote = '';
  if (suspiciousExpenseRUB > 0) {
    suspiciousNote = `${bot.suspiciousExpense.xtr} XTR, ${bot.suspiciousExpense.stars} STARS`;
  }

  const row = sheet.addRow([
    bot.name,
    bot.transactions,
    bot.users,
    bot.first,
    bot.last,
    bot.realIncome.xtr,
    bot.realIncome.stars,
    bot.realIncome.rub,
    Math.round(incomeRUB),
    Math.round(realExpenseRUB),
    suspiciousNote,
    Math.round(profit),
    `${roi.toFixed(1)}%`
  ]);

  // Цветовое выделение
  if (profit > 0) {
    row.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C6EFCE' } };
  } else {
    row.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC7CE' } };
  }

  // Пометка ботов с фейковыми данными
  if (bot.realIncome.xtr + bot.realIncome.stars + bot.realIncome.rub === 0 || suspiciousExpenseRUB > 0) {
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF00' } };
  }
});

// Итого
const totalRow = sheet.addRow([]);
totalRow.getCell(1).value = 'ИТОГО:';
totalRow.font = { bold: true, size: 12 };

// Подсчет итогов
const totalIncomeXTR = bots.reduce((sum, bot) => sum + bot.realIncome.xtr, 0);
const totalIncomeSTARS = bots.reduce((sum, bot) => sum + bot.realIncome.stars, 0);
const totalIncomeRUB = bots.reduce((sum, bot) => sum + bot.realIncome.rub, 0);
const totalIncomeRoubles = totalIncomeXTR * XTR_TO_RUB_RATE + totalIncomeSTARS * STARS_TO_RUB_RATE + totalIncomeRUB;

const totalRealExpenseRUB = bots.reduce((sum, bot) => sum +
  (bot.realExpense.xtr * XTR_TO_RUB_RATE) +
  (bot.realExpense.stars * STARS_TO_RUB_RATE) +
  bot.realExpense.rub, 0);

const totalSuspiciousExpenseRUB = bots.reduce((sum, bot) => sum +
  (bot.suspiciousExpense.xtr * XTR_TO_RUB_RATE) +
  (bot.suspiciousExpense.stars * STARS_TO_RUB_RATE) +
  bot.suspiciousExpense.rub, 0);

const totalExpenseAllRUB = totalRealExpenseRUB + totalSuspiciousExpenseRUB;
const totalProfit = totalIncomeRoubles - totalExpenseAllRUB;

totalRow.getCell(6).value = Math.round(totalIncomeXTR);
totalRow.getCell(7).value = Math.round(totalIncomeSTARS);
totalRow.getCell(8).value = Math.round(totalIncomeRUB);
totalRow.getCell(9).value = Math.round(totalIncomeRoubles);
totalRow.getCell(10).value = Math.round(totalRealExpenseRUB);
totalRow.getCell(11).value = `${Math.round(totalSuspiciousExpenseRUB)} (фейк)`;
totalRow.getCell(12).value = Math.round(totalProfit);
totalRow.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C6EFCE' } };

// Информация о курсах
const rateRow = sheet.addRow([]);
rateRow.getCell(1).value = 'КУРСЫ КОНВЕРТАЦИИ:';
rateRow.getCell(6).value = '1 XTR = 1.8 RUB';
rateRow.getCell(7).value = '1 STARS = 1.8 RUB';

// Вкладка с анализом подозрительных данных
const suspiciousSheet = workbook.addWorksheet('⚠️ ФЕЙКОВЫЕ ДАННЫЕ', {
  views: [{ state: 'frozen', ySplit: 1 }]
});

suspiciousSheet.mergeCells('A1:E1');
suspiciousSheet.getCell('A1').value = 'АНАЛИЗ ФЕЙКОВЫХ И ПОДОЗРИТЕЛЬНЫХ ДАННЫХ';
suspiciousSheet.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFF' } };
suspiciousSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0000' } };
suspiciousSheet.getCell('A1').alignment = { horizontal: 'center' };

const suspiciousHeader = suspiciousSheet.addRow(['Бот', 'Тип проблемы', 'Сумма', 'Валюта', 'Описание']);
suspiciousHeader.font = { bold: true };
suspiciousHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE699' } };

// Добавляем проблемные данные
bots.forEach(bot => {
  if (bot.suspiciousExpense.xtr > 0 || bot.suspiciousExpense.stars > 0 || bot.suspiciousExpense.rub > 0) {
    if (bot.suspiciousExpense.xtr > 0) {
      suspiciousSheet.addRow([
        bot.name,
        'ФЕЙКОВЫЕ РАСХОДЫ',
        bot.suspiciousExpense.xtr,
        'XTR',
        bot.notes
      ]);
    }
    if (bot.suspiciousExpense.stars > 0) {
      suspiciousSheet.addRow([
        bot.name,
        'ФЕЙКОВЫЕ РАСХОДЫ',
        bot.suspiciousExpense.stars,
        'STARS',
        bot.notes
      ]);
    }
    if (bot.suspiciousExpense.rub > 0) {
      suspiciousSheet.addRow([
        bot.name,
        'ФЕЙКОВЫЕ РАСХОДЫ',
        bot.suspiciousExpense.rub,
        'RUB',
        bot.notes
      ]);
    }
  }
});

// Вкладка с общей сводкой
const summarySheet = workbook.addWorksheet('💰 ИТОГОВАЯ СВОДКА');
summarySheet.mergeCells('A1:C1');
summarySheet.getCell('A1').value = 'ИТОГОВАЯ СВОДКА ПО ВСЕМ БОТАМ';
summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2F4F4F' } };
summarySheet.getCell('A1').alignment = { horizontal: 'center' };

const summaryData = [
  { metric: 'Количество ботов', value: '10' },
  { metric: 'Боты с реальными доходами', value: '9' },
  { metric: 'Боты с фейковыми данными', value: '2 (LeeSolarbot, neuro_blogger)' },
  { metric: 'Общий доход XTR (в рублях)', value: `${Math.round(totalIncomeXTR * XTR_TO_RUB_RATE).toLocaleString()} ₽` },
  { metric: 'Общий доход STARS (в рублях)', value: `${Math.round(totalIncomeSTARS * STARS_TO_RUB_RATE).toLocaleString()} ₽` },
  { metric: 'Общий доход RUB', value: `${Math.round(totalIncomeRUB).toLocaleString()} ₽` },
  { metric: 'ИТОГО ДОХОДОВ', value: `${Math.round(totalIncomeRoubles).toLocaleString()} ₽` },
  { metric: 'ИТОГО РАСХОДОВ (реальных)', value: `${Math.round(totalRealExpenseRUB).toLocaleString()} ₽` },
  { metric: 'ФЕЙКОВЫЕ РАСХОДЫ (системные гранты)', value: `${Math.round(totalSuspiciousExpenseRUB).toLocaleString()} ₽` },
  { metric: 'ИТОГО РАСХОДОВ (всех)', value: `${Math.round(totalExpenseAllRUB).toLocaleString()} ₽` },
  { metric: 'ВАЛОВАЯ ПРИБЫЛЬ', value: `${Math.round(totalProfit).toLocaleString()} ₽` }
];

summaryData.forEach(item => {
  const row = summarySheet.addRow([item.metric, item.value, '']);
  row.getCell(2).font = { bold: true };
});

// Ширина колонок
sheet.columns = [
  { width: 30 }, { width: 12 }, { width: 12 }, { width: 15 },
  { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 },
  { width: 18 }, { width: 20 }, { width: 15 }, { width: 12 }
];

suspiciousSheet.columns = [
  { width: 30 }, { width: 25 }, { width: 15 }, { width: 10 }, { width: 50 }
];

summarySheet.columns = [
  { width: 40 }, { width: 30 }, { width: 20 }
];

// Сохраняем файл
const outputPath = '/Users/playra/999-multibots-telegraf/ALL_BOTS_COMPLETE_ANALYSIS_2025-11-30.xlsx';

workbook.xlsx.writeFile(outputPath)
  .then(() => {
    console.log('\n✅ ПОЛНЫЙ АНАЛИЗ СОЗДАН!');
    console.log(`📁 Файл: ${outputPath}`);
    console.log('\n📊 СОДЕРЖИМОЕ:');
    console.log('1️⃣  🎯 ПОЛНАЯ СТАТИСТИКА - все боты с доходами и расходами');
    console.log('2️⃣  ⚠️ ФЕЙКОВЫЕ ДАННЫЕ - выявленные артефакты');
    console.log('3️⃣  💰 ИТОГОВАЯ СВОДКА - финальные цифры');
    console.log('\n🔍 КЛЮЧЕВЫЕ ПРИНЦИПЫ:');
    console.log('   ✅ Доходы: только реальные платежи (Telegram/Robokassa)');
    console.log('   ✅ Расходы: ВСЕ реальные траты (включая системные операции)');
    console.log('   ⚠️  Фейковые: отдельная колонка для системных грантов/бонусов');
    console.log(`\n💰 ИТОГО: Доходы ${Math.round(totalIncomeRoubles).toLocaleString()}₽ - Расходы ${Math.round(totalExpenseAllRUB).toLocaleString()}₽ = Прибыль ${Math.round(totalProfit).toLocaleString()}₽`);
  })
  .catch(err => {
    console.error('❌ Ошибка создания файла:', err);
  });