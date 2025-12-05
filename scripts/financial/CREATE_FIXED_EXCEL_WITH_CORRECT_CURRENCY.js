const ExcelJS = require('exceljs');

const workbook = new ExcelJS.Workbook();
workbook.creator = "ИСПРАВЛЕННЫЙ АНАЛИЗ - Корректная конвертация валют";
workbook.created = new Date();

// Курсы конвертации (все в рубли)
const RATES = {
  XTR: 1.8,
  STARS: 1.8,
  RUB: 1.0
};

// ДАННЫЕ ИЗ SUPABASE VIEW (конвертированные в рубли)
const bots = [
  {
    name: 'neuro_blogger_bot',
    testData: [
      { currency: 'XTR', amount: 101336, rubAmount: 182404.80, count: 355 },
      { currency: 'RUB', amount: 11948, rubAmount: 11948, count: 15 }
    ],
    realData: [
      { currency: 'XTR', amount: 90818, rubAmount: 163472.40, count: 87 },
      { currency: 'RUB', amount: 73166, rubAmount: 73166, count: 48 }
    ],
    totalTestRub: 194352.80,
    totalRealRub: 236638.40,
    status: '🚨 УБЫТОЧНЫЙ'
  },
  {
    name: 'MetaMuse_Manifest_bot',
    testData: [
      { currency: 'XTR', amount: 38731, rubAmount: 69715.80, count: 139 },
      { currency: 'XTR', amount: 10941, rubAmount: 19693.80, count: 50 },
      { currency: 'RUB', amount: 2999, rubAmount: 2999, count: 1 },
      { currency: 'STARS', amount: 0, rubAmount: 0, count: 1 }
    ],
    realData: [
      { currency: 'RUB', amount: 105872, rubAmount: 105872, count: 76 },
      { currency: 'XTR', amount: 27182, rubAmount: 48927.60, count: 153 }
    ],
    totalTestRub: 92408.60,
    totalRealRub: 154799.60,
    status: '🚨 УБЫТОЧНЫЙ'
  },
  {
    name: 'ai_koshey_bot',
    testData: [
      { currency: 'STARS', amount: 195830377.19, rubAmount: 352494678.94, count: 12 },
      { currency: 'RUB', amount: 46496, rubAmount: 46496, count: 44 },
      { currency: 'XTR', amount: 18736.64, rubAmount: 33725.95, count: 63 }
    ],
    realData: [
      { currency: 'RUB', amount: 11113, rubAmount: 11113, count: 14 }
    ],
    totalTestRub: 352574900.89,
    totalRealRub: 11113,
    status: '🔧 ТОЛЬКО ТЕСТ'
  },
  {
    name: 'AI_STARS_bot',
    testData: [
      { currency: 'XTR', amount: 3521, rubAmount: 6337.80, count: 100 },
      { currency: 'STARS', amount: 0, rubAmount: 0, count: 1 }
    ],
    realData: [
      { currency: 'RUB', amount: 40822, rubAmount: 40822, count: 24 },
      { currency: 'XTR', amount: 11273, rubAmount: 20291.40, count: 19 }
    ],
    totalTestRub: 6337.80,
    totalRealRub: 61113.40,
    status: '✅ ПРИБЫЛЬНЫЙ'
  },
  {
    name: 'Gaia_Kamskaia_bot',
    testData: [
      { currency: 'XTR', amount: 1363, rubAmount: 2453.40, count: 46 }
    ],
    realData: [
      { currency: 'RUB', amount: 42674, rubAmount: 42674, count: 21 },
      { currency: 'XTR', amount: 15033.56, rubAmount: 27060.41, count: 68 }
    ],
    totalTestRub: 2453.40,
    totalRealRub: 69734.41,
    status: '✅ ПРИБЫЛЬНЫЙ'
  },
  {
    name: 'HaimGroupMedia_bot',
    testData: [
      { currency: 'XTR', amount: 2833, rubAmount: 5099.40, count: 12 }
    ],
    realData: [
      { currency: 'RUB', amount: 0, rubAmount: 0, count: 0 },
      { currency: 'XTR', amount: 0, rubAmount: 0, count: 0 }
    ],
    totalTestRub: 5099.40,
    totalRealRub: 0,
    status: '🔧 ТОЛЬКО ТЕСТ'
  },
  {
    name: 'LeeSolarbot',
    testData: [
      { currency: 'XTR', amount: 10000, rubAmount: 18000, count: 3 },
      { currency: 'XTR', amount: 8708, rubAmount: 15674.40, count: 1 }
    ],
    realData: [],
    totalTestRub: 33674.40,
    totalRealRub: 0,
    status: '💀 МЕРТВЫЙ'
  },
  {
    name: 'Kaya_easy_art_bot',
    testData: [
      { currency: 'RUB', amount: 1110, rubAmount: 1110, count: 1 },
      { currency: 'XTR', amount: 14, rubAmount: 25.20, count: 3 }
    ],
    realData: [],
    totalTestRub: 1135.20,
    totalRealRub: 0,
    status: '🔧 ТОЛЬКО ТЕСТ'
  },
  {
    name: 'NeuroLenaAssistant_bot',
    testData: [],
    realData: [
      { currency: 'RUB', amount: 23328, rubAmount: 23328, count: 9 }
    ],
    totalTestRub: 0,
    totalRealRub: 23328,
    status: '✅ ПРИБЫЛЬНЫЙ'
  },
  {
    name: 'clip_maker_neuro_bot',
    testData: [
      { currency: 'RUB', amount: 1110, rubAmount: 1110, count: 1 },
      { currency: 'XTR', amount: 6929, rubAmount: 12472.20, count: 113 }
    ],
    realData: [],
    totalTestRub: 13582.20,
    totalRealRub: 0,
    status: '🔧 ТОЛЬКО ТЕСТ'
  }
];

// 1. ЛИСТ: ИСПРАВЛЕННЫЙ ДАШБОРД
const dashboardSheet = workbook.addWorksheet('📊 ИСПРАВЛЕННЫЙ ДАШБОРД', {
  views: [{ state: 'frozen', ySplit: 3 }]
});

dashboardSheet.mergeCells('A1:L1');
dashboardSheet.getCell('A1').value = '📊 ИСПРАВЛЕННЫЙ АНАЛИЗ - Корректная конвертация ВСЕХ валют в рубли';
dashboardSheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFF' } };
dashboardSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E79' } };
dashboardSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
dashboardSheet.getCell('A1').height = 35;

dashboardSheet.mergeCells('A2:L2');
dashboardSheet.getCell('A2').value = '💡 ИСПРАВЛЕНИЕ: XTR → 1.8₽, STARS → 1.8₽, RUB → 1₽ (все конвертируется в рубли!)';
dashboardSheet.getCell('A2').font = { size: 12, bold: true, color: { argb: '22C55E' } };
dashboardSheet.getCell('A2').alignment = { horizontal: 'center' };
dashboardSheet.getCell('A2').height = 25;

const headerRow = dashboardSheet.addRow([
  '№',
  'Бот',
  'Тестовые данные (₽)',
  'Реальные данные (₽)',
  'Баланс (₽)',
  'Статус',
  'Транзакции (тест)',
  'Транзакции (реал)',
  'Детали тест',
  'Детали реал',
  '',
  ''
]);

headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E79' } };
headerRow.alignment = { horizontal: 'center', wrapText: true };
headerRow.height = 30;

bots.forEach((bot, index) => {
  const balance = bot.totalRealRub - bot.totalTestRub;
  const testTransactions = bot.testData.reduce((sum, item) => sum + item.count, 0);
  const realTransactions = bot.realData.reduce((sum, item) => sum + item.count, 0);

  const testDetails = bot.testData.map(item =>
    `${item.currency}: ${Math.round(item.rubAmount).toLocaleString()}₽`
  ).join(' + ');

  const realDetails = bot.realData.map(item =>
    `${item.currency}: ${Math.round(item.rubAmount).toLocaleString()}₽`
  ).join(' + ');

  const row = dashboardSheet.addRow([
    `#${index + 1}`,
    bot.name,
    Math.round(bot.totalTestRub).toLocaleString(),
    Math.round(bot.totalRealRub).toLocaleString(),
    Math.round(balance).toLocaleString(),
    bot.status,
    testTransactions,
    realTransactions,
    testDetails || 'Нет',
    realDetails || 'Нет',
    '',
    ''
  ]);

  // Цветовое оформление
  if (bot.totalTestRub > 0 && bot.totalRealRub === 0) {
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E5' } }; // Светло-красный
  } else if (balance > 0) {
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E5F7E5' } }; // Светло-зеленый
  }

  if (balance < 0) {
    row.getCell(5).font = { bold: true, color: { argb: 'DC2626' } };
  } else if (balance > 0) {
    row.getCell(5).font = { bold: true, color: { argb: '16A34A' } };
  }
});

dashboardSheet.columns = [
  { width: 6 }, { width: 30 }, { width: 18 }, { width: 18 }, { width: 15 },
  { width: 20 }, { width: 15 }, { width: 15 }, { width: 35 }, { width: 35 }, { width: 10 }, { width: 10 }
];

// 2. ЛИСТ: ВАЛЮТНАЯ ДЕТАЛИЗАЦИЯ
const currencySheet = workbook.addWorksheet('💱 ВАЛЮТНАЯ ДЕТАЛИЗАЦИЯ');

currencySheet.mergeCells('A1:E1');
currencySheet.getCell('A1').value = '💱 ДЕТАЛИЗАЦИЯ ПО ВАЛЮТАМ - КАК КОНВЕРТИРОВАЛОСЬ';
currencySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
currencySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C2D12' } };
currencySheet.getCell('A1').alignment = { horizontal: 'center' };
currencySheet.getCell('A1').height = 30;

const currencyHeader = currencySheet.addRow([
  'Бот',
  'Валюта',
  'Исходная сумма',
  'Курс',
  'В рублях'
]);

currencyHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
currencyHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C2D12' } };

bots.forEach(bot => {
  // Добавляем тестовые данные
  bot.testData.forEach(item => {
    const rate = RATES[item.currency] || 1;
    currencySheet.addRow([
      bot.name + ' (ТЕСТ)',
      item.currency,
      Math.round(item.amount).toLocaleString(),
      `${rate} ₽`,
      Math.round(item.rubAmount).toLocaleString()
    ]);
  });

  // Добавляем реальные данные
  bot.realData.forEach(item => {
    const rate = RATES[item.currency] || 1;
    currencySheet.addRow([
      bot.name + ' (РЕАЛ)',
      item.currency,
      Math.round(item.amount).toLocaleString(),
      `${rate} ₽`,
      Math.round(item.rubAmount).toLocaleString()
    ]);
  });
});

currencySheet.columns = [
  { width: 35 }, { width: 12 }, { width: 20 }, { width: 12 }, { width: 18 }
];

// 3. ЛИСТ: ИТОГОВАЯ СВОДКА
const summarySheet = workbook.addWorksheet('📋 ИТОГОВАЯ СВОДКА');

summarySheet.mergeCells('A1:D1');
summarySheet.getCell('A1').value = '📋 ИТОГОВАЯ СВОДКА - ИСПРАВЛЕННЫЕ ДАННЫЕ';
summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } };
summarySheet.getCell('A1').alignment = { horizontal: 'center' };

const totalTest = bots.reduce((sum, bot) => sum + bot.totalTestRub, 0);
const totalReal = bots.reduce((sum, bot) => sum + bot.totalRealRub, 0);
const totalBalance = totalReal - totalTest;

const summaryData = [
  { metric: '💰 РЕАЛЬНЫЕ ДОХОДЫ', value: '', note: '' },
  { metric: 'Сумма всех реальных платежей', value: `${Math.round(totalReal).toLocaleString()}₽`, note: 'Telegram + Robokassa' },
  { metric: '', value: '', note: '' },
  { metric: '🔧 ТЕСТОВЫЕ ДАННЫЕ', value: '', note: '' },
  { metric: 'Сумма всех тестовых операций', value: `${Math.round(totalTest).toLocaleString()}₽`, note: 'System Grant + BONUS + Миграция' },
  { metric: '', value: '', note: '' },
  { metric: '⚖️ БАЛАНС', value: '', note: '' },
  { metric: 'Реальные - Тестовые', value: `${Math.round(totalBalance).toLocaleString()}₽`, note: totalBalance >= 0 ? 'ПРОФИТ!' : 'УБЫТОК!' },
  { metric: '', value: '', note: '' },
  { metric: '📊 РАСПРЕДЕЛЕНИЕ', value: '', note: '' },
  { metric: 'Прибыльных ботов', value: bots.filter(b => b.totalRealRub > b.totalTestRub).length.toString(), note: 'Реальные > Тестовые' },
  { metric: 'Только тестовые данные', value: bots.filter(b => b.totalRealRub === 0 && b.totalTestRub > 0).length.toString(), note: 'Нет реальных платежей' },
  { metric: 'Мертвые боты', value: bots.filter(b => b.totalRealRub === 0 && b.totalTestRub === 0).length.toString(), note: 'Нет активности' },
  { metric: '', value: '', note: '' },
  { metric: '✅ ИСПРАВЛЕНИЕ', value: '', note: '' },
  { metric: 'Проблема была', value: 'Разные валюты не конвертировались', note: 'XTR, STARS, RUB' },
  { metric: 'Решение', value: 'Все конвертируется в рубли', note: 'XTR → 1.8₽, STARS → 1.8₽' }
];

summaryData.forEach(item => {
  const row = summarySheet.addRow([item.metric, item.value, item.note]);

  if (item.metric.includes('💰') || item.metric.includes('🔧') || item.metric.includes('⚖️') || item.metric.includes('📊') || item.metric.includes('✅')) {
    row.font = { bold: true, size: 12 };
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
  } else if (item.value && (item.value.includes('-') || item.value.includes('УБЫТОК'))) {
    row.getCell(2).font = { bold: true, color: { argb: 'DC2626' } };
  }
});

summarySheet.columns = [
  { width: 30 }, { width: 25 }, { width: 40 }
];

const outputPath = '/Users/playra/999-multibots-telegraf/ИСПРАВЛЕННЫЙ_АНАЛИЗ_С_КОРРЕКТНОЙ_КОНВЕРТАЦИЕЙ.xlsx';

workbook.xlsx.writeFile(outputPath)
  .then(() => {
    console.log('\n✅ ИСПРАВЛЕННЫЙ EXCEL СОЗДАН!');
    console.log(`📁 Файл: ${outputPath}`);
    console.log('\n📊 СОДЕРЖИМОЕ (3 ЛИСТА):');
    console.log('1️⃣  📊 ИСПРАВЛЕННЫЙ ДАШБОРД - все валюты конвертированы в рубли');
    console.log('2️⃣  💱 ВАЛЮТНАЯ ДЕТАЛИЗАЦИЯ - как конвертировалось');
    console.log('3️⃣  📋 ИТОГОВАЯ СВОДКА - исправленные итоги');
    console.log('\n🎯 ИСПРАВЛЕНИЕ:');
    console.log(`   ✅ Все XTR конвертированы по курсу 1.8₽`);
    console.log(`   ✅ Все STARS конвертированы по курсу 1.8₽`);
    console.log(`   ✅ Все RUB остаются как есть`);
    console.log('\n📈 ТОТАЛЬНЫЕ ЦИФРЫ:');
    console.log(`   💰 Реальные доходы: ${Math.round(totalReal).toLocaleString()}₽`);
    console.log(`   🔧 Тестовые данные: ${Math.round(totalTest).toLocaleString()}₽`);
    console.log(`   ⚖️  Баланс: ${Math.round(totalBalance).toLocaleString()}₽`);
    if (totalBalance >= 0) {
      console.log('   🎉 ПРОФИТ! Реальные доходы превышают тестовые данные');
    } else {
      console.log('   ⚠️  УБЫТОК! Тестовые данные превышают реальные доходы');
    }
  })
  .catch(err => {
    console.error('❌ Ошибка создания файла:', err);
  });
