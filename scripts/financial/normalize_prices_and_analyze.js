#!/usr/bin/env node

/**
 * 🎯 НОРМАЛИЗАЦИЯ ЦЕН И ДЕТАЛЬНЫЙ АНАЛИЗ РАСХОДОВ
 * Выравниваем завышенные цены и показываем детализацию
 */

const ExcelJS = require('exceljs');
const fs = require('fs');

const RATES = { XTR: 1.8, STARS: 1.8, RUB: 1.0 };

function convertToRub(amount, currency) {
  return (parseFloat(amount) || 0) * (RATES[currency] || 1.0);
}

// АКТУАЛЬНЫЕ ЦЕНЫ (на основе анализа примеров)
const CURRENT_PRICES = {
  'Training': {
    basePrice: 1500, // За тренировку модели
    description: 'Training модели'
  },
  'image-to-video': {
    basePrice: 54, // ~70 XTR
    description: 'Генерация видео из изображения'
  },
  'text_to_image': {
    basePrice: 5.4, // ~3 XTR
    description: 'Генерация изображения из текста'
  },
  'image_to_video': {
    basePrice: 54, // ~70 XTR
    description: 'Генерация видео (альтернативный метод)'
  },
  'text_to_video': {
    basePrice: 54, // ~70 XTR
    description: 'Генерация видео из текста'
  },
  'flux_kontext': {
    basePrice: 2.7, // ~1.5 XTR
    description: 'FLUX Kontext - контекстная генерация'
  },
  'image_to_image': {
    basePrice: 5.4, // ~3 XTR
    description: 'Обработка изображения'
  },
  'video_to_image': {
    basePrice: 2.7, // ~1.5 XTR
    description: 'Извлечение кадра из видео'
  },
  'System': {
    basePrice: 54, // Video generation цена
    description: 'Video generation (Kling, Sora, Seedance)'
  },
  'Internal': {
    basePrice: 14, // NeuroPhoto generation
    description: 'NeuroPhoto generation'
  },
  'image_upscaler': {
    basePrice: 2.7, // ~1.5 XTR
    description: 'Увеличение качества изображения'
  },
  'lip_sync': {
    basePrice: 27, // ~15 XTR
    description: 'Синхронизация губ'
  },
  'ai_reels': {
    basePrice: 14, // ~8 XTR
    description: 'AI Reels генерация'
  },
  'text-to-video': {
    basePrice: 54, // ~70 XTR
    description: 'Video generation (альтернативный)'
  }
};

function normalizePrice(originalAmount, currency, method) {
  const normalizedRub = convertToRub(originalAmount, currency);

  // Если есть актуальная цена, используем её
  if (CURRENT_PRICES[method]) {
    return CURRENT_PRICES[method].basePrice;
  }

  // Если цена сильно завышена (больше 10x от нормы), нормализуем
  const reasonableLimit = 500; // больше 500₽ за операцию - подозрительно
  if (normalizedRub > reasonableLimit) {
    return reasonableLimit;
  }

  return normalizedRub;
}

async function normalizeAndAnalyze() {
  console.log('\n' + '='.repeat(70));
  console.log('🎯 НОРМАЛИЗАЦИЯ ЦЕН И АНАЛИЗ РАСХОДОВ');
  console.log('='.repeat(70) + '\n');

  const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));

  // Фильтруем все реальные расходы
  const realExpenseMethods = [
    'Training', 'image-to-video', 'image_to_video', 'text_to_image',
    'image_to_image', 'video_to_image', 'text_to_video', 'flux_kontext',
    'video-generation-refund', 'image-to-video-refund',
    'System', 'Internal', 'image_upscaler', 'lip_sync', 'ai_reels', 'text-to-video'
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

  const allExpenses = rawData.filter(row => {
    if (row.type !== 'MONEY_OUTCOME') return false;

    const botName = row.bot_name;
    const paymentMethod = row.payment_method;

    if (fakeMethods.includes(paymentMethod)) return false;
    if (testBots.includes(botName)) return false;

    return realExpenseMethods.includes(paymentMethod);
  });

  console.log(`✅ Найдено реальных расходов: ${allExpenses.length}\n`);

  // Анализируем до и после нормализации
  const analysis = {
    original: 0,
    normalized: 0,
    savings: 0,
    byType: {},
    byBot: {},
    suspicious: []
  };

  for (const expense of allExpenses) {
    const original = convertToRub(expense.amount, expense.currency);
    const normalized = normalizePrice(expense.amount, expense.currency, expense.payment_method);
    const savings = original - normalized;

    analysis.original += original;
    analysis.normalized += normalized;
    analysis.savings += savings;

    const method = expense.payment_method;
    const bot = expense.bot_name;

    if (!analysis.byType[method]) {
      analysis.byType[method] = {
        original: 0,
        normalized: 0,
        count: 0,
        examples: []
      };
    }
    analysis.byType[method].original += original;
    analysis.byType[method].normalized += normalized;
    analysis.byType[method].count++;

    if (!analysis.byBot[bot]) {
      analysis.byBot[bot] = {
        original: 0,
        normalized: 0,
        count: 0
      };
    }
    analysis.byBot[bot].original += original;
    analysis.byBot[bot].normalized += normalized;
    analysis.byBot[bot].count++;

    // Запоминаем подозрительные операции
    if (savings > 1000) {
      analysis.suspicious.push({
        bot,
        method,
        original: Math.round(original),
        normalized: Math.round(normalized),
        savings: Math.round(savings),
        description: expense.description || ''
      });
    }
  }

  // 1. ОБЩАЯ СТАТИСТИКА
  console.log('📊 ОБЩАЯ СТАТИСТИКА:');
  console.log('='.repeat(70));
  console.log(`💰 Оригинальная сумма расходов: ${Math.round(analysis.original).toLocaleString()}₽`);
  console.log(`💰 Нормализованная сумма: ${Math.round(analysis.normalized).toLocaleString()}₽`);
  console.log(`💾 Экономия от корректировки цен: ${Math.round(analysis.savings).toLocaleString()}₽`);
  console.log(`📉 Снижение расходов на: ${((analysis.savings / analysis.original) * 100).toFixed(1)}%`);
  console.log(`📊 Количество операций: ${allExpenses.length.toLocaleString()}`);

  // 2. ТОП ПОДОЗРИТЕЛЬНЫХ ОПЕРАЦИЙ
  if (analysis.suspicious.length > 0) {
    console.log('\n\n🚨 ТОП-20 САМЫХ ЗАВЫШЕННЫХ ОПЕРАЦИЙ:');
    console.log('='.repeat(70));
    analysis.suspicious
      .sort((a, b) => b.savings - a.savings)
      .slice(0, 20)
      .forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.bot}:`);
        console.log(`   💰 Было: ${item.original.toLocaleString()}₽`);
        console.log(`   💰 Стало: ${item.normalized.toLocaleString()}₽`);
        console.log(`   💾 Сэкономлено: ${item.savings.toLocaleString()}₽`);
        console.log(`   🔧 Метод: ${item.method}`);
        if (item.description) {
          console.log(`   📝 ${item.description.slice(0, 60)}...`);
        }
      });
  }

  // 3. ПО ТИПАМ РАСХОДОВ
  console.log('\n\n💸 РАСХОДЫ ПО ТИПАМ (ДО И ПОСЛЕ КОРРЕКТИРОВКИ):');
  console.log('='.repeat(70));

  const sortedTypes = Object.entries(analysis.byType)
    .map(([type, data]) => ({ type, ...data }))
    .sort((a, b) => b.normalized - a.normalized);

  sortedTypes.forEach((item, index) => {
    const savings = item.original - item.normalized;
    console.log(`\n${index + 1}. ${item.type}:`);
    console.log(`   💰 До корректировки: ${Math.round(item.original).toLocaleString()}₽`);
    console.log(`   💰 После корректировки: ${Math.round(item.normalized).toLocaleString()}₽`);
    console.log(`   💾 Экономия: ${Math.round(savings).toLocaleString()}₽ (${item.count} операций)`);

    if (CURRENT_PRICES[item.type]) {
      console.log(`   📋 Описание: ${CURRENT_PRICES[item.type].description}`);
    }
  });

  // 4. ПО БОТАМ
  console.log('\n\n🤖 РАСХОДЫ ПО БОТАМ (ДО И ПОСЛЕ):');
  console.log('='.repeat(70));

  const sortedBots = Object.entries(analysis.byBot)
    .map(([bot, data]) => ({ bot, ...data }))
    .sort((a, b) => b.normalized - a.normalized);

  sortedBots.slice(0, 15).forEach((item, index) => {
    const savings = item.original - item.normalized;
    console.log(`\n${index + 1}. ${item.bot}:`);
    console.log(`   💰 До: ${Math.round(item.original).toLocaleString()}₽`);
    console.log(`   💰 После: ${Math.round(item.normalized).toLocaleString()}₽`);
    console.log(`   💾 Экономия: ${Math.round(savings).toLocaleString()}₽`);
    console.log(`   📊 Операций: ${item.count}`);
  });

  // 5. СОЗДАЕМ EXCEL
  console.log('\n\n📊 Создаем детальный Excel...\n');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "🎯 НОРМАЛИЗОВАННЫЕ РАСХОДЫ";
  workbook.created = new Date();

  // Лист 1: Общая статистика
  const summarySheet = workbook.addWorksheet('📊 ОБЩАЯ СТАТИСТИКА');
  summarySheet.mergeCells('A1:D1');
  summarySheet.getCell('A1').value = '📊 НОРМАЛИЗОВАННЫЕ РАСХОДЫ - С КОРРЕКТНЫМИ ЦЕНАМИ';
  summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  const summaryData = [
    ['Показатель', 'Значение'],
    ['Оригинальная сумма расходов', `${Math.round(analysis.original).toLocaleString()}₽`],
    ['Нормализованная сумма расходов', `${Math.round(analysis.normalized).toLocaleString()}₽`],
    ['Экономия от корректировки цен', `${Math.round(analysis.savings).toLocaleString()}₽`],
    ['Снижение расходов на', `${((analysis.savings / analysis.original) * 100).toFixed(1)}%`],
    ['Количество операций', allExpenses.length.toLocaleString()],
    ['Активных ботов с расходами', sortedBots.length.toString()],
    ['Типов ИИ-сервисов', sortedTypes.length.toString()]
  ];

  summaryData.forEach((row, index) => {
    const sheetRow = summarySheet.addRow(row);
    if (index === 0) {
      sheetRow.font = { bold: true };
      sheetRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
    }
  });

  // Лист 2: По типам
  const typeSheet = workbook.addWorksheet('📋 ПО ТИПАМ');
  const typeHeader = typeSheet.addRow(['№', 'Тип расхода', 'До корректировки (₽)', 'После корректировки (₽)', 'Экономия (₽)', 'Операций', 'Описание']);
  typeHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
  typeHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7C2D12' } };

  sortedTypes.forEach((item, index) => {
    const savings = item.original - item.normalized;
    typeSheet.addRow([
      index + 1,
      item.type,
      Math.round(item.original).toLocaleString(),
      Math.round(item.normalized).toLocaleString(),
      Math.round(savings).toLocaleString(),
      item.count,
      CURRENT_PRICES[item.type]?.description || ''
    ]);
  });

  // Лист 3: По ботам
  const botSheet = workbook.addWorksheet('🤖 ПО БОТАМ');
  const botHeader = botSheet.addRow(['№', 'Бот', 'До корректировки (₽)', 'После корректировки (₽)', 'Экономия (₽)', 'Операций']);
  botHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
  botHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '15803D' } };

  sortedBots.forEach((item, index) => {
    const savings = item.original - item.normalized;
    botSheet.addRow([
      index + 1,
      item.bot,
      Math.round(item.original).toLocaleString(),
      Math.round(item.normalized).toLocaleString(),
      Math.round(savings).toLocaleString(),
      item.count
    ]);
  });

  // Лист 4: Подозрительные операции
  if (analysis.suspicious.length > 0) {
    const suspiciousSheet = workbook.addWorksheet('🚨 ПОДОЗРИТЕЛЬНЫЕ');
    const suspiciousHeader = suspiciousSheet.addRow(['№', 'Бот', 'Метод', 'Было (₽)', 'Стало (₽)', 'Экономия (₽)', 'Описание']);
    suspiciousHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
    suspiciousHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DC2626' } };

    analysis.suspicious
      .sort((a, b) => b.savings - a.savings)
      .forEach((item, index) => {
        suspiciousSheet.addRow([
          index + 1,
          item.bot,
          item.method,
          item.original.toLocaleString(),
          item.normalized.toLocaleString(),
          item.savings.toLocaleString(),
          item.description?.slice(0, 100) || ''
        ]);
      });
  }

  const outputPath = '/Users/playra/999-multibots-telegraf/НОРМАЛИЗОВАННЫЕ_РАСХОДЫ.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log('\n' + '='.repeat(70));
  console.log('✅ НОРМАЛИЗОВАННЫЙ АНАЛИЗ ГОТОВ!');
  console.log('='.repeat(70));
  console.log(`📁 Файл: ${outputPath}`);
  console.log('\n📊 СОДЕРЖИМОЕ (4 ЛИСТА):');
  console.log('1️⃣  📊 ОБЩАЯ СТАТИСТИКА - до и после корректировки');
  console.log('2️⃣  📋 ПО ТИПАМ - детализация по ИИ-сервисам');
  console.log('3️⃣  🤖 ПО БОТАМ - расходы по каждому боту');
  console.log('4️⃣  🚨 ПОДОЗРИТЕЛЬНЫЕ - самые завышенные операции');
  console.log('\n🎯 ИТОГОВЫЕ ЦИФРЫ:');
  console.log(`   💰 Расходы (нормализовано): ${Math.round(analysis.normalized).toLocaleString()}₽`);
  console.log(`   💾 Экономия: ${Math.round(analysis.savings).toLocaleString()}₽`);
  console.log('='.repeat(70) + '\n');

  return analysis;
}

normalizeAndAnalyze().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
