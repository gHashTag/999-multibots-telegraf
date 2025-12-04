const ExcelJS = require('exceljs');

const workbook = new ExcelJS.Workbook();
workbook.creator = "ПОЛНЫЙ АНАЛИЗ С ТЕСТОВЫМИ ДАННЫМИ";
workbook.created = new Date();

const STARS_TO_RUB_RATE = 1.8;

// КЛАССИФИКАЦИЯ ТИПОВ ТРАНЗАКЦИЙ
const TRANSACTION_TYPES = {
  // ТЕСТОВЫЕ ДАННЫЕ (для группы тестирования)
  'TEST_DATA': {
    label: '🔧 ТЕСТОВЫЕ ДАННЫЕ',
    color: 'FFA500', // Оранжевый
    examples: ['System Grant', 'BONUS', 'Миграция', 'Manual', 'Refund']
  },
  
  // РЕАЛЬНЫЕ ДАННЫЕ
  'REAL_USER_PAYMENT': {
    label: '✅ РЕАЛЬНЫЕ ПЛАТЕЖИ',
    color: '22C55E', // Зеленый
    examples: ['Telegram', 'Robokassa', 'Реальный платеж']
  },
  
  // СИСТЕМНЫЕ (но не тестовые)
  'SYSTEM_INTERNAL': {
    label: '⚙️ СИСТЕМНЫЕ',
    color: '3B82F6', // Синий
    examples: ['Перевод между ботами', 'Внутренние операции']
  }
};

// ДАННЫЕ БОТОВ (обновленные с классификацией)
const bots = [
  {
    name: 'neuro_blogger_bot',
    realIncome: { stars: 21304, rub: 188604 },
    testIncome: { stars: 35732 + 643.488, rub: 0 },  // TEST_DATA
    expense: { stars: 102685, rub: 9427.83 },  // Все РЕАЛЬНЫЕ (платили за токены)
    users: 322,
    transactions: 4541,
    testTransactions: 2080,  // Примерно
    realTransactions: 2461,
    category: 'Блогерский бот',
    period: '2025-02-22 → 2025-11-30'
  },
  {
    name: 'MetaMuse_Manifest_bot',
    realIncome: { stars: 49565, rub: 139159 },
    testIncome: { stars: 0, rub: 0 },
    expense: { stars: 232647, rub: 13141.87 },
    users: 134,
    transactions: 4080,
    testTransactions: 0,
    realTransactions: 4080,
    category: 'Манифест',
    period: '2025-03-01 → 2025-11-03'
  },
  {
    name: 'Gaia_Kamskaia_bot',
    realIncome: { stars: 24436.56, rub: 44634 },
    testIncome: { stars: 0, rub: 0 },
    expense: { stars: 60330, rub: 7311.58 },
    users: 27,
    transactions: 1565,
    testTransactions: 0,
    realTransactions: 1565,
    category: 'Творческий',
    period: '2025-03-25 → 2025-11-30'
  },
  {
    name: 'AI_STARS_bot',
    realIncome: { stars: 16277, rub: 64339 },
    testIncome: { stars: 0, rub: 0 },
    expense: { stars: 81948, rub: 2153.32 },
    users: 54,
    transactions: 1451,
    testTransactions: 0,
    realTransactions: 1451,
    category: 'AI-генерация',
    period: '2025-06-20 → 2025-11-29'
  },
  {
    name: 'Kaya_easy_art_bot',
    realIncome: { stars: 15, rub: 3340 },
    testIncome: { stars: 0, rub: 0 },
    expense: { stars: 23760, rub: 5053.50 },
    users: 5,
    transactions: 837,
    testTransactions: 0,
    realTransactions: 837,
    category: 'Арт',
    period: '2025-05-02 → 2025-09-27'
  },
  {
    name: 'NeuroLenaAssistant_bot',
    realIncome: { stars: 321, rub: 23328 },
    testIncome: { stars: 0, rub: 0 },
    expense: { stars: 8100, rub: 1724.66 },
    users: 7,
    transactions: 741,
    testTransactions: 0,
    realTransactions: 741,
    category: 'Ассистент',
    period: '2025-03-22 → 2025-11-04'
  },
  {
    name: 'HaimGroupMedia_bot',
    realIncome: { stars: 2833, rub: 2999 },
    testIncome: { stars: 0, rub: 0 },
    expense: { stars: 46800, rub: 344.55 },
    users: 12,
    transactions: 357,
    testTransactions: 0,
    realTransactions: 357,
    category: 'Медиа',
    period: '2025-07-17 → 2025-11-22'
  },
  {
    name: 'LeeSolarbot',
    realIncome: { stars: 0, rub: 0 },
    testIncome: { stars: 18730, rub: 0 },  // TEST_DATA
    expense: { stars: 1440, rub: 992.07 },
    users: 2,
    transactions: 208,
    testTransactions: 208,  // Все тестовые
    realTransactions: 0,
    category: 'Неактивный',
    period: '2025-03-24 → 2025-10-26'
  },
  {
    name: 'NeurostylistShtogrina_bot',
    realIncome: { stars: 4426, rub: 39 },
    testIncome: { stars: 0, rub: 0 },
    expense: { stars: 6120, rub: 934.41 },
    users: 3,
    transactions: 157,
    testTransactions: 0,
    realTransactions: 157,
    category: 'Стилист',
    period: '2025-05-05 → 2025-11-17'
  },
  {
    name: 'ZavaraBot',
    realIncome: { stars: 6, rub: 0 },
    testIncome: { stars: 0, rub: 0 },
    expense: { stars: 0, rub: 16.88 },
    users: 1,
    transactions: 9,
    testTransactions: 0,
    realTransactions: 9,
    category: 'Неактивный',
    period: '2025-03-27 → 2025-04-03'
  }
];

// 1. ЛИСТ: ДАШБОРД С ФИЛЬТРАМИ
const dashboardSheet = workbook.addWorksheet('📊 ДАШБОРД С ФИЛЬТРАМИ', {
  views: [{ state: 'frozen', ySplit: 4 }]
});

dashboardSheet.mergeCells('A1:P1');
dashboardSheet.getCell('A1').value = '📊 ПОЛНЫЙ ДАШБОРД - ТЕСТОВЫЕ И РЕАЛЬНЫЕ ДАННЫЕ';
dashboardSheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFF' } };
dashboardSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E79' } };
dashboardSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
dashboardSheet.getCell('A1').height = 35;

dashboardSheet.mergeCells('A2:P2');
dashboardSheet.getCell('A2').value = 'Источник: payments_v2 (Supabase) + Robokassa для верификации';
dashboardSheet.getCell('A2').font = { size: 11, italic: true, color: { argb: '666666' } };
dashboardSheet.getCell('A2').alignment = { horizontal: 'center' };
dashboardSheet.getCell('A2').height = 20;

dashboardSheet.mergeCells('A3:P3');
dashboardSheet.getCell('A3').value = '🔧 ТЕСТОВЫЕ ДАННЫЕ = System Grant, BONUS, Миграция (для группы QA)';
dashboardSheet.getCell('A3').font = { size: 12, bold: true, color: { argb: 'FF6600' } };
dashboardSheet.getCell('A3').alignment = { horizontal: 'center' };
dashboardSheet.getCell('A3').height = 25;

dashboardSheet.mergeCells('A4:P4');
dashboardSheet.getCell('A4').value = '✅ РЕАЛЬНЫЕ ДАННЫЕ = Платежи от пользователей (Telegram, Robokassa)';
dashboardSheet.getCell('A4').font = { size: 12, bold: true, color: { argb: '008000' } };
dashboardSheet.getCell('A4').alignment = { horizontal: 'center' };
dashboardSheet.getCell('A4').height = 25;

const headerRow = dashboardSheet.addRow([
  '№',
  'Бот',
  'Категория',
  'Пользователи',
  'Транзакции (все)',
  'Тестовые',
  'Реальные',
  'Доходы тестовые (₽)',
  'Доходы реальные (₽)',
  'Расходы (₽)',
  'Прибыль тестовая (₽)',
  'Прибыль реальная (₽)',
  'Период',
  'Статус',
  'Для тестировщиков',
  'Примечания'
]);

headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
headerRow.alignment = { horizontal: 'center', wrapText: true };
headerRow.height = 40;

// Добавляем данные с цветовой маркировкой
const sortedBots = [...bots].sort((a, b) => {
  const realProfitA = a.realIncome.stars * STARS_TO_RUB_RATE + a.realIncome.rub - (a.expense.stars * STARS_TO_RUB_RATE + a.expense.rub);
  const realProfitB = b.realIncome.stars * STARS_TO_RUB_RATE + b.realIncome.rub - (b.expense.stars * STARS_TO_RUB_RATE + b.expense.rub);
  return realProfitB - realProfitA;
});

sortedBots.forEach((bot, index) => {
  const testIncomeRUB = bot.testIncome.stars * STARS_TO_RUB_RATE + bot.testIncome.rub;
  const realIncomeRUB = bot.realIncome.stars * STARS_TO_RUB_RATE + bot.realIncome.rub;
  const expenseRUB = bot.expense.stars * STARS_TO_RUB_RATE + bot.expense.rub;
  
  const testProfit = testIncomeRUB - expenseRUB;
  const realProfit = realIncomeRUB - expenseRUB;
  
  const row = dashboardSheet.addRow([
    `#${index + 1}`,
    bot.name,
    bot.category,
    bot.users,
    bot.transactions,
    bot.testTransactions,
    bot.realTransactions,
    Math.round(testIncomeRUB),
    Math.round(realIncomeRUB),
    Math.round(expenseRUB),
    Math.round(testProfit),
    Math.round(realProfit),
    bot.period,
    realProfit > 0 ? '✅ Прибыльный' : realProfit > -50000 ? '⚠️ Небольшой убыток' : '🔴 Большой убыток',
    bot.testTransactions > 0 ? '🔧 НУЖНЫ ТЕСТЫ' : '✅ Готов',
    bot.testTransactions > 0 ? 'Есть тестовые данные' : 'Только реальные'
  ]);

  // Цветовое оформление
  if (bot.testTransactions > 0) {
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5CC' } }; // Светло-оранжевый
  }
  
  if (realProfit > 0) {
    row.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E6F7E6' } }; // Светло-зеленый
  } else {
    row.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E5' } }; // Светло-красный
  }
});

dashboardSheet.columns = [
  { width: 6 }, { width: 30 }, { width: 15 }, { width: 10 }, { width: 12 }, { width: 10 },
  { width: 10 }, { width: 15 }, { width: 15 }, { width: 12 }, { width: 15 }, { width: 15 },
  { width: 20 }, { width: 18 }, { width: 15 }, { width: 30 }
];

// Добавляем автофильтр
dashboardSheet.autoFilter = {
  from: 'A6',
  to: 'P16'
};

// 2. ЛИСТ: СВОДКА ПО ТИПАМ ДАННЫХ
const typeSheet = workbook.addWorksheet('📋 ТИПЫ ДАННЫХ');
typeSheet.mergeCells('A1:D1');
typeSheet.getCell('A1').value = '📋 СВОДКА ПО ТИПАМ ДАННЫХ';
typeSheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
typeSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2F4F4F' } };
typeSheet.getCell('A1').alignment = { horizontal: 'center' };

// Таблица с типами
typeSheet.addRow(['Тип данных', 'Описание', 'Примеры', 'Цель']);
Object.values(TRANSACTION_TYPES).forEach(type => {
  const row = typeSheet.addRow([
    type.label,
    'Данные для групы тестирования',
    type.examples.join(', '),
    type === TRANSACTION_TYPES.TEST_DATA ? 'Тестирование функционала' : 'Реальная работа'
  ]);
  row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + type.color } };
});

typeSheet.columns = [
  { width: 25 }, { width: 30 }, { width: 40 }, { width: 25 }
];

const outputPath = '/Users/playra/999-multibots-telegraf/АНАЛИЗ_С_ТЕСТОВЫМИ_ДАННЫМИ_И_ФИЛЬТРАМИ.xlsx';

workbook.xlsx.writeFile(outputPath)
  .then(() => {
    console.log('\n📊 АНАЛИЗ С ТЕСТОВЫМИ ДАННЫМИ СОЗДАН!');
    console.log(`📁 Файл: ${outputPath}`);
    console.log('\n📊 СОДЕРЖИМОЕ (2 ЛИСТА):');
    console.log('1️⃣  📊 ДАШБОРД С ФИЛЬТРАМИ - полный анализ с классификацией данных');
    console.log('2️⃣  📋 ТИПЫ ДАННЫХ - описание тестовых и реальных данных');
    console.log('\n🔧 ДЛЯ ТЕСТИРОВЩИКОВ:');
    console.log('   ✅ Автофильтры включены - можно фильтровать по любым колонкам');
    console.log('   🔧 Тестовые данные выделены оранжевым цветом');
    console.log('   📊 Реальная прибыль рассчитывается автоматически');
    console.log('\n💡 КЛАССИФИКАЦИЯ:');
    console.log('   🔧 ТЕСТОВЫЕ ДАННЫЕ = System Grant, BONUS, Миграция');
    console.log('   ✅ РЕАЛЬНЫЕ ДАННЫЕ = Платежи от пользователей');
  })
  .catch(err => {
    console.error('❌ Ошибка создания файла:', err);
  });
