#!/usr/bin/env node

/**
 * 📊 СОЗДАНИЕ ДЕТАЛЬНОГО ОТЧЕТА ДЛЯ КАЖДОГО ВЛАДЕЛЬЦА БОТА
 * - Отдельные листы для каждого бота (10 листов)
 * - Общая статистика + детализация расходов по типам
 * - Готов к сдаче отчета завтра
 */

const ExcelJS = require('exceljs');
const fs = require('fs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

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

// Реальные ИИ-расходы
const REAL_EXPENSE_METHODS = [
  'Training', 'image-to-video', 'image_to_video', 'text_to_image',
  'image_to_image', 'video_to_image', 'text_to_video', 'flux_kontext',
  'System', 'Internal', 'image_upscaler', 'lip_sync', 'ai_reels', 'text-to-video'
];

// Названия методов на русском
const METHOD_NAMES_RU = {
  'Training': 'Training модели',
  'image-to-video': 'Генерация видео из изображения',
  'image_to_video': 'Генерация видео (альтернативный)',
  'text_to_image': 'Генерация изображений',
  'image_to_image': 'Обработка изображений',
  'video_to_image': 'Извлечение кадров из видео',
  'text_to_video': 'Генерация видео из текста',
  'flux_kontext': 'FLUX Kontext - контекстная генерация',
  'System': 'Video generation (Kling, Sora, Seedance)',
  'Internal': 'NeuroPhoto generation',
  'image_upscaler': 'Увеличение качества изображения',
  'lip_sync': 'Синхронизация губ',
  'ai_reels': 'AI Reels генерация',
  'text-to-video': 'Video generation (альтернативный)'
};

async function createOwnerReports() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 СОЗДАНИЕ ДЕТАЛЬНОГО ОТЧЕТА ДЛЯ ВЛАДЕЛЬЦЕВ БОТОВ');
  console.log('='.repeat(80) + '\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "📊 ОТЧЕТЫ ДЛЯ ВЛАДЕЛЬЦЕВ БОТОВ";
  workbook.created = new Date();

  // Создаем лист для каждого бота
  for (const bot of BOTS) {
    console.log(`📊 Создаю отчет для: ${bot.name}`);

    // Фильтруем данные по боту
    const botData = rawData.filter(row => row.bot_name === bot.name);

    // Статистика бота
    const stats = {
      name: bot.name,
      type: bot.type,
      // Доходы
      income_rub: 0,
      income_stars: 0,
      income_xtr: 0,
      income_total_rub: 0,
      income_count: 0,
      income_methods: new Set(),

      // Расходы
      expense_rub: 0,
      expense_stars: 0,
      expense_xtr: 0,
      expense_total_rub: 0,
      expense_count: 0,
      expense_methods: new Set(),

      // Расходы по типам (детализация)
      expense_by_type: {},
      expense_normalized_total: 0
    };

    // Собираем данные
    for (const row of botData) {
      const amount = parseFloat(row.amount) || 0;
      const currency = row.currency;

      // Тестовые боты не имеют доходов
      if (row.type === 'MONEY_INCOME' && bot.type === 'ТЕСТОВЫЙ') {
        continue;
      }

      if (row.type === 'MONEY_INCOME') {
        // Доходы
        if (currency === 'RUB') stats.income_rub += amount;
        else if (currency === 'STARS') stats.income_stars += amount;
        else if (currency === 'XTR') stats.income_xtr += amount;

        stats.income_total_rub += convertToRub(amount, currency);
        stats.income_count++;
        stats.income_methods.add(row.payment_method);

      } else if (row.type === 'MONEY_OUTCOME') {
        // Расходы (оригинальные)
        if (currency === 'RUB') stats.expense_rub += amount;
        else if (currency === 'STARS') stats.expense_stars += amount;
        else if (currency === 'XTR') stats.expense_xtr += amount;

        stats.expense_total_rub += convertToRub(amount, currency);
        stats.expense_count++;
        stats.expense_methods.add(row.payment_method);

        // Расходы по типам (для детализации)
        if (REAL_EXPENSE_METHODS.includes(row.payment_method)) {
          const method = row.payment_method;
          const normalizedCost = normalizeExpense(amount, currency, method);

          if (!stats.expense_by_type[method]) {
            stats.expense_by_type[method] = {
              original_amount: 0,
              normalized_cost: 0,
              count: 0,
              rubles: 0,
              stars: 0,
              xtr: 0
            };
          }

          stats.expense_by_type[method].original_amount += convertToRub(amount, currency);
          stats.expense_by_type[method].normalized_cost += normalizedCost;
          stats.expense_by_type[method].count++;
          stats.expense_by_type[method].rubles += currency === 'RUB' ? amount : 0;
          stats.expense_by_type[method].stars += currency === 'STARS' ? amount : 0;
          stats.expense_by_type[method].xtr += currency === 'XTR' ? amount : 0;

          stats.expense_normalized_total += normalizedCost;
        }
      }
    }

    const profit = stats.income_total_rub - stats.expense_normalized_total;
    const profitability = stats.income_total_rub > 0 ?
      (profit / stats.income_total_rub * 100) : 0;

    // Создаем лист для бота
    const sheetName = bot.name.length > 31 ? bot.name.substring(0, 28) + '...' : bot.name;
    const sheet = workbook.addWorksheet(sheetName);

    // ЗАГОЛОВОК
    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = `📊 ОТЧЕТ ПО БОТУ: ${bot.name.toUpperCase()}`;
    sheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFF' } };
    sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
    sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell('A1').height = 35;

    sheet.mergeCells('A2:F2');
    sheet.getCell('A2').value = `Тип: ${bot.type} | Создан: ${new Date().toLocaleDateString('ru-RU')}`;
    sheet.getCell('A2').font = { size: 12, bold: true, color: { argb: 'FFFFFF' } };
    sheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '166534' } };
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').height = 25;

    // 1. ОБЩАЯ СТАТИСТИКА
    let rowNum = 4;
    sheet.mergeCells(`A${rowNum}:F${rowNum}`);
    sheet.getCell(`A${rowNum}`).value = '💰 ОБЩАЯ СТАТИСТИКА';
    sheet.getCell(`A${rowNum}`).font = { size: 14, bold: true, color: { argb: 'FFFFFF' } };
    sheet.getCell(`A${rowNum}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } };
    sheet.getCell(`A${rowNum}`).alignment = { horizontal: 'center' };
    sheet.getCell(`A${rowNum}`).height = 30;
    rowNum++;

    const statsData = [
      ['Показатель', 'Значение'],
      ['💰 Доходы (всего)', `${Math.round(stats.income_total_rub).toLocaleString()}₽`],
      ['   - в рублях (RUB)', `${Math.round(stats.income_rub).toLocaleString()}₽`],
      ['   - в звездах (STARS)', `${Math.round(stats.income_stars).toLocaleString()} STARS`],
      ['   - в XTR', `${Math.round(stats.income_xtr).toLocaleString()} XTR`],
      ['💸 Расходы (себестоимость)', `${Math.round(stats.expense_normalized_total).toLocaleString()}₽`],
      ['⚖️ Прибыль', `${Math.round(profit).toLocaleString()}₽`],
      ['📈 Рентабельность', `${profitability.toFixed(1)}%`],
      ['📊 Количество операций', `${stats.income_count} доходных / ${stats.expense_count} расходных`]
    ];

    statsData.forEach((item, index) => {
      const row = sheet.addRow(item);
      if (index === 0) {
        row.font = { bold: true };
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
      } else if (item[0].includes('💰') || item[0].includes('💸') || item[0].includes('⚖️') || item[0].includes('📈')) {
        row.font = { bold: true };
      }

      if (item[0].includes('Прибыль')) {
        if (profit > 0) {
          row.getCell(2).font = { bold: true, color: { argb: '16A34A' } };
        } else {
          row.getCell(2).font = { bold: true, color: { argb: 'DC2626' } };
        }
      }
    });

    // 2. ДЕТАЛИЗАЦИЯ РАСХОДОВ ПО ТИПАМ
    rowNum += 2;
    sheet.mergeCells(`A${rowNum}:F${rowNum}`);
    sheet.getCell(`A${rowNum}`).value = '💸 ДЕТАЛИЗАЦИЯ РАСХОДОВ ПО ТИПАМ';
    sheet.getCell(`A${rowNum}`).font = { size: 14, bold: true, color: { argb: 'FFFFFF' } };
    sheet.getCell(`A${rowNum}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C2D12' } };
    sheet.getCell(`A${rowNum}`).alignment = { horizontal: 'center' };
    sheet.getCell(`A${rowNum}`).height = 30;
    rowNum++;

    const expenseHeader = sheet.addRow([
      '№',
      'Тип расхода',
      'Оригинал (₽)',
      'Себестоимость (₽)',
      'Операций',
      'Валюты (RUB/STARS/XTR)'
    ]);
    expenseHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
    expenseHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C2D12' } };
    expenseHeader.alignment = { horizontal: 'center', wrapText: true };
    expenseHeader.height = 40;
    rowNum++;

    const sortedExpenses = Object.entries(stats.expense_by_type)
      .map(([method, data]) => ({ method, ...data }))
      .sort((a, b) => b.normalized_cost - a.normalized_cost);

    sortedExpenses.forEach((item, index) => {
      const currencyStr = [
        item.rubles > 0 ? `${Math.round(item.rubles)}₽` : null,
        item.stars > 0 ? `${Math.round(item.stars)}★` : null,
        item.xtr > 0 ? `${Math.round(item.xtr)}XTR` : null
      ].filter(Boolean).join(', ');

      const row = sheet.addRow([
        index + 1,
        METHOD_NAMES_RU[item.method] || item.method,
        Math.round(item.original_amount).toLocaleString(),
        Math.round(item.normalized_cost).toLocaleString(),
        item.count,
        currencyStr || '-'
      ]);

      row.getCell(4).font = { bold: true };
    });

    // Итого расходов
    const totalRow = sheet.addRow([
      'ИТОГО',
      'ВСЕ РАСХОДЫ',
      Math.round(stats.expense_total_rub).toLocaleString(),
      Math.round(stats.expense_normalized_total).toLocaleString(),
      Object.values(stats.expense_by_type).reduce((sum, item) => sum + item.count, 0),
      'Различные валюты'
    ]);
    totalRow.font = { bold: true };
    totalRow.getCell(4).font = { bold: true, color: { argb: 'DC2626' } };

    // 3. МЕТОДЫ ОПЛАТЫ
    rowNum += 3;
    sheet.mergeCells(`A${rowNum}:D${rowNum}`);
    sheet.getCell(`A${rowNum}`).value = '🔧 МЕТОДЫ ОПЛАТЫ';
    sheet.getCell(`A${rowNum}`).font = { size: 14, bold: true, color: { argb: 'FFFFFF' } };
    sheet.getCell(`A${rowNum}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '6B7280' } };
    sheet.getCell(`A${rowNum}`).alignment = { horizontal: 'center' };
    sheet.getCell(`A${rowNum}`).height = 30;
    rowNum++;

    sheet.addRow(['Доходные методы:', Array.from(stats.income_methods).join(', ')]);
    sheet.addRow(['Расходные методы:', Array.from(stats.expense_methods).join(', ')]);

    // Настройка ширины колонок
    sheet.columns = [
      { width: 8 },
      { width: 40 },
      { width: 18 },
      { width: 18 },
      { width: 12 },
      { width: 25 }
    ];

    console.log(`   ✅ ${bot.name}: доходы ${Math.round(stats.income_total_rub).toLocaleString()}₽, расходы ${Math.round(stats.expense_normalized_total).toLocaleString()}₽`);
  }

  // СОХРАНЯЕМ
  const outputPath = '/Users/playra/999-multibots-telegraf/ОТЧЕТЫ_ДЛЯ_ВЛАДЕЛЬЦЕВ_БОТОВ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('\n' + '='.repeat(80));
  console.log('✅ ОТЧЕТЫ ДЛЯ ВЛАДЕЛЬЦЕВ БОТОВ СОЗДАНЫ!');
  console.log('='.repeat(80));
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n📊 СОДЕРЖИМОЕ (10 ЛИСТОВ - ПО ОДНОМУ ДЛЯ КАЖДОГО БОТА):');
  BOTS.forEach((bot, index) => {
    console.log(`${index + 1}0️⃣. ${bot.name} (${bot.type})`);
  });
  console.log('\n📋 НА КАЖДОМ ЛИСТЕ:');
  console.log('   1️⃣  💰 ОБЩАЯ СТАТИСТИКА - доходы, расходы, прибыль, рентабельность');
  console.log('   2️⃣  💸 ДЕТАЛИЗАЦИЯ РАСХОДОВ - на что именно ушли деньги');
  console.log('   3️⃣  🔧 МЕТОДЫ ОПЛАТЫ - какие методы использовались');
  console.log('\n🎯 ГОТОВО К СДАЧЕ ОТЧЕТА ЗАВТРА!');
  console.log('='.repeat(80) + '\n');
}

createOwnerReports().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
